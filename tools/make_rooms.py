#!/usr/bin/env python3
"""Room backdrops from the original's screens.

Every room was dumped many times by the emulator surveys, each time with Ai,
a guard or a message box somewhere in it. Cell by cell, the value most of the
dumps agree on is the room itself; the sprites and boxes fall away. The parts
of the mechanism are wiped too (the game lays its own), and a message box
that every dump shows is rebuilt from the band's pattern. The cleaned screens
go back to data/emu, and their play areas (columns 1-30, rows 0-17: 240 by
144, what the game's view shows) are packed into assets/rooms.png with an
index in js/rooms_sheet.js.

    python3 tools/make_rooms.py DIR... [-o assets/rooms.png]
"""
import argparse, glob, json, os, re, sys
from collections import Counter, defaultdict
import numpy as np
from PIL import Image

PALETTE = ["#000000", "#0000d8", "#d80000", "#d800d8", "#00d800", "#00d8d8", "#d8d800", "#d8d8d8"]
BRIGHT = ["#000000", "#0000ff", "#ff0000", "#ff00ff", "#00ff00", "#00ffff", "#ffff00", "#ffffff"]
COLS, ROWS = 32, 24


def load(path):
    d = open(path, "rb").read()
    tiles = np.zeros((ROWS, COLS, 8), dtype=np.uint8)
    for y in range(192):
        row = (y & 0xC0) | ((y & 7) << 3) | ((y & 0x38) >> 3)
        tiles[y // 8, :, y % 8] = np.frombuffer(d[row * 32:row * 32 + 32], dtype=np.uint8)
    attr = np.frombuffer(d[6144:6912], dtype=np.uint8).reshape(ROWS, COLS).copy()
    return tiles, attr


def save(path, tiles, attr):
    out = bytearray(6912)
    for y in range(192):
        row = (y & 0xC0) | ((y & 7) << 3) | ((y & 0x38) >> 3)
        out[row * 32:row * 32 + 32] = tiles[y // 8, :, y % 8].tobytes()
    out[6144:6912] = attr.astype(np.uint8).tobytes()
    open(path, "wb").write(bytes(out))


def is_box(attr):
    """A message box: white paper, black ink."""
    return (attr & 0x38) == 0x38 and (attr & 7) == 0


def mode_clean(captures):
    """What most dumps show in each cell: rough, but a fair reference for
    telling a sound dump of the room from a stray one."""
    caps = [load(p) for p in captures]
    tiles = np.zeros((ROWS, COLS, 8), dtype=np.uint8)
    attr = np.zeros((ROWS, COLS), dtype=np.uint8)
    for r in range(ROWS):
        for c in range(COLS):
            votes = Counter((t[r, c].tobytes(), int(a[r, c])) for t, a in caps if not (r <= 4 and is_box(a[r, c])))
            if votes:
                k = votes.most_common(1)[0][0]
                tiles[r, c] = np.frombuffer(k[0], dtype=np.uint8); attr[r, c] = k[1]
    return tiles, attr


def agreement(path, ref):
    t, a = load(path); rt, ra = ref
    return sum(1 for r in range(1, 19) for c in range(1, 31)
               if t[r, c].tobytes() == rt[r, c].tobytes() and a[r, c] == ra[r, c]) / (18 * 30)


def clean(captures):
    """The room under its sprites. A sprite only ever adds pixels to the cell
    it covers, so the room's own bitmap is what every dump has set - the AND
    of them all, a message box's cells left out of the vote - and a cell's
    colours are what the dumps that show exactly that bitmap agree on."""
    caps = [load(p) for p in captures]
    tiles = np.zeros((ROWS, COLS, 8), dtype=np.uint8)
    attr = np.zeros((ROWS, COLS), dtype=np.uint8)
    # a box's cells are white paper, black ink; so are some of the bands', so
    # away from the top rows only a minority's white cells count as a box
    boxy = np.zeros((ROWS, COLS), dtype=int)
    for t, a in caps: boxy += (((a & 0x38) == 0x38) & ((a & 7) == 0)).astype(int)
    def box_here(a, r, c): return is_box(a[r, c]) and (r <= 4 or boxy[r, c] * 2 < len(caps))
    for r in range(ROWS):
        for c in range(COLS):
            votes = [(t[r, c], int(a[r, c])) for t, a in caps if not box_here(a, r, c)]
            if not votes:                             # every dump had a box here: rebuild below
                continue
            bits = votes[0][0].copy()
            for t, _ in votes[1:]: bits &= t
            tiles[r, c] = bits
            clean_attrs = Counter(a for t, a in votes if np.array_equal(t, bits))
            pool = clean_attrs if clean_attrs else Counter(a for t, a in votes)
            attr[r, c] = pool.most_common(1)[0][0]
    # cells rebuilt under a box: the bands repeat every four columns; the room
    # beside it takes the attribute of its neighbours
    for r in list(range(1, 5)) + list(range(13, 19)):
        for c in range(COLS):
            if attr[r, c] == 0 and not tiles[r, c].any():
                if r <= 2 or r >= 16:
                    src = c + 4 if c + 4 < COLS else c - 4
                    tiles[r, c] = tiles[r, src]; attr[r, c] = attr[r, src]
                else:
                    src = next((cc for cc in range(c + 1, COLS) if not tiles[r, cc].any() and attr[r, cc]), None)
                    if src is not None: attr[r, c] = attr[r, src]
    return tiles, attr


def pixels(tiles, r0, r1, c0, c1):
    """The bitmap of a cell rectangle as an array of 0/1 rows."""
    out = np.zeros(((r1 - r0) * 8, (c1 - c0) * 8), dtype=np.uint8)
    for r in range(r0, r1):
        for c in range(c0, c1):
            out[(r - r0) * 8:(r - r0 + 1) * 8, (c - c0) * 8:(c - c0 + 1) * 8] = np.unpackbits(tiles[r, c].reshape(8, 1), axis=1)
    return out


def erase_sprites(tiles, attr, masks, threshold=0.8):
    """A figure that stood still through every dump - Ai boxed in a lift
    shaft, a guard at the end of his beat - is found by its shape: where a
    mask's pixels are nearly all set, they are cleared, and a cell left empty
    takes its neighbour's colours. Returns how many figures went."""
    img = pixels(tiles, 0, ROWS, 0, COLS)
    gone = 0
    for m in masks:
        mh, mw = m.shape; need = m.sum() * threshold; slack = m.sum() * 0.25
        for y in range(8, 152 - mh + 1):
            for x in range(8, 248 - mw + 1, 8):
                win = img[y:y + mh, x:x + mw]
                # the figure's pixels all there, and little else in its box: a solid fill is not him
                if (win & m).sum() >= need and (win & (1 - m)).sum() <= slack:
                    img[y:y + mh, x:x + mw] &= (1 - m)
                    gone += 1
    if gone:
        for r in range(ROWS):
            for c in range(COLS):
                cell = np.packbits(img[r * 8:r * 8 + 8, c * 8:c * 8 + 8], axis=1).reshape(8)
                if not np.array_equal(cell, tiles[r, c]):
                    tiles[r, c] = cell
                    if not cell.any():
                        src = next((cc for cc in (c - 1, c + 1, c - 2, c + 2) if 0 <= cc < COLS and not tiles[r, cc].any()), None)
                        if src is not None: attr[r, c] = attr[r, src]
    return gone


def rgb(tiles, attr, r0, r1, c0, c1):
    out = np.zeros(((r1 - r0) * 8, (c1 - c0) * 8, 3), dtype=np.uint8)
    for r in range(r0, r1):
        for c in range(c0, c1):
            a = int(attr[r, c]); pal = BRIGHT if a & 0x40 else PALETTE
            ink = np.array([int(pal[a & 7][i:i + 2], 16) for i in (1, 3, 5)], dtype=np.uint8)
            pap = np.array([int(pal[(a >> 3) & 7][i:i + 2], 16) for i in (1, 3, 5)], dtype=np.uint8)
            bits = np.unpackbits(tiles[r, c].reshape(8, 1), axis=1)
            out[(r - r0) * 8:(r - r0 + 1) * 8, (c - c0) * 8:(c - c0 + 1) * 8] = np.where(bits[..., None] == 1, ink, pap)
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("dirs", nargs="+", help="directories holding room_N.scr dumps")
    ap.add_argument("--level", default="level.json")
    ap.add_argument("--parts-from", default="data/emu/room_148.scr", help="a screen showing a part, cells 6-7 rows 14-15")
    ap.add_argument("--prefer", default="", help="comma-separated directories whose dumps, when a room has "
                         "three or more of them, are used alone (Ai stood elsewhere in each)")
    ap.add_argument("--screens", default="data/emu", help="where the cleaned screens go")
    ap.add_argument("--erase", default="", help="figures to wipe by shape, as FILE:r0:r1:c0:c1,... - a clean "
                         "dump and the cells a standing Ai or guard fills in it; their mirrors are tried too")
    ap.add_argument("--door", default="", help="a sector door as ROOM:SIDE[:SHUTFILE:OPENFILE],... - the cells of "
                         "the doorway that differ between the two dumps are the door, and the backdrop takes the "
                         "open ones; without dumps, the slab of the first door given for that side is put at the doorway")
    ap.add_argument("--objects", default="", help="the rooms' gun tables as read from the original (data/emu/guns.json): "
                         "floor guns are lifted off the backdrops; every gun's place, span and wall colour go in the index")
    ap.add_argument("--solid", default="", help="the original's per-cell flag maps (data/emu/solid.json): the cells it "
                         "draws over Ai and the cells that stop him, packed into the index a row at a time")
    ap.add_argument("--button", default="", help="a lift station's call button as FILE:row:col - a cell whose ink the "
                         "original cycles while the lift is called or moving; every screen is searched for it")
    ap.add_argument("--arrow", default="", help="a lift's scrolling arrow cell as FILE:row:col; every dump is searched "
                         "for it in any phase, up or down")
    ap.add_argument("-o", "--out", default="assets/rooms.png")
    ap.add_argument("--index", default="js/rooms_sheet.js")
    args = ap.parse_args()

    level = json.load(open(args.level))
    rooms = sorted(int(k) for k in level["rooms"])
    caps = defaultdict(list)
    for d in args.dirs:
        for f in glob.glob(os.path.join(d, "room_*.scr")):
            m = re.search(r"room_(\d+)\.scr$", f)
            if m: caps[int(m.group(1))].append(f)
    # a dump that hardly agrees with what the older dumps mostly show - the
    # screen blanked, Ai out cold, a stray room, a capture mid-redraw - is
    # left out; the rest, old and new alike, are intersected
    prefer = [d for d in args.prefer.split(",") if d]
    for n in list(caps):
        # a dump with the screen blanked (Ai out cold, the room gone dark) says nothing of the room
        alive = []
        for f in caps[n]:
            t, a = load(f)
            dead = sum(1 for r in range(3, 16) for c in range(1, 31) if (a[r, c] & 0x3f) == 0)   # black on black
            if dead < 0.7 * 13 * 30: alive.append(f)
        if alive: caps[n] = alive
        old = [f for f in caps[n] if not any(os.path.abspath(f).startswith(os.path.abspath(d)) for d in prefer)] or caps[n]
        ref = mode_clean(old)
        sound = [f for f in caps[n] if agreement(f, ref) >= 0.85]   # a sprite or a box is a few cells; a half-drawn screen is not
        if len(sound) >= 2: caps[n] = sound
        else: print(f"room {n}: only {len(sound)} sound dumps, keeping all {len(caps[n])}", file=sys.stderr)
    # the part's own tiles, to wipe wherever they lie
    pt, pa = load(args.parts_from)
    box_tiles = {pt[r, c].tobytes() for r in (14, 15) for c in (6, 7) if pt[r, c].any()}
    part_rooms = {int(p["room"]) for p in level["parts"]}

    masks = []
    for spec in filter(None, args.erase.split(",")):
        f, r0, r1, c0, c1 = spec.split(":")
        mt, _ = load(f)
        m = pixels(mt, int(r0), int(r1), int(c0), int(c1))
        masks += [m, m[:, ::-1].copy()]

    per_row = 11
    sheet = Image.new("RGB", (per_row * 240, ((len(rooms) + per_row - 1) // per_row) * 144), (0, 0, 0))
    index = {}
    for i, n in enumerate(rooms):
        if not caps.get(n):
            print(f"room {n}: no captures", file=sys.stderr); continue
        tiles, attr = clean(caps[n])
        if n in part_rooms:
            for r in (13, 14, 15):
                for c in range(COLS):
                    if tiles[r, c].tobytes() in box_tiles:
                        tiles[r, c] = 0
                        src = next((cc for cc in range(c - 1, -1, -1) if not tiles[r, cc].any()), None)
                        if src is not None: attr[r, c] = attr[r, src]
        if masks:
            gone = erase_sprites(tiles, attr, masks)
            if gone: print(f"room {n}: {gone} figure(s) wiped by shape", file=sys.stderr)
        save(os.path.join(args.screens, f"room_{n}.scr"), tiles, attr)
        im = Image.fromarray(rgb(tiles, attr, 0, 18, 1, 31))
        x, y = (i % per_row) * 240, (i // per_row) * 144
        sheet.paste(im, (x, y))
        index[str(n)] = [x, y]
    # the guns, from the original's own object tables (data/emu/guns.json): a
    # floor gun is lifted off its cells - the game draws it, and the hat it is
    # crushed into; a wall or ceiling gun stays in the backdrop, and the game
    # paints the wall's colour over it when it is shot
    guns, items = {}, {}
    if args.objects:
        table = json.load(open(args.objects))
        for n in rooms:
            live = [g for g in table.get(str(n), []) if not g["dead"]]
            # What the table holds besides the guns, flagged apart from them: the
            # parts of the mechanism (kind 2, where level.json already keeps
            # them), and two cups Ai drinks - a tall one, two cells, on row 14,
            # and a squat one, a single cell, on row 15. Both are lifted off the
            # backdrop: the game draws them and takes them away.
            CUPS = {1: 2, 0: 1}                                   # kind -> cells tall
            cups = [g for g in table.get(str(n), []) if g["dead"] and g["type"] in CUPS]
            if not (live or cups) or str(n) not in index: continue
            path = os.path.join(args.screens, f"room_{n}.scr")
            t, a = load(path); out = []
            for g in cups:
                r, c, tall = g["y"] // 8, g["col"], CUPS[g["type"]]
                for rr in range(r, r + tall):
                    t[rr, c] = 0
                    a[rr, c] = a[rr, c - 1 if c > 0 else c + 1]       # the wall shows once the cup is drunk
                items.setdefault(str(n), []).append([(c - 1) * 8, r * 8, tall * 8])
            for g in live:
                r, c, kind = g["y"] // 8, g["col"], g["type"]
                w = 5 if kind == 0 else 2                      # the ceiling gun's visor spans five cells
                fill = None
                if kind == 3:
                    for cc in range(c, c + 2): t[r, cc] = 0    # the black floor course shows through
                else:
                    side = c - 1 if c > 0 else c + w
                    pa = a[r, side]
                    fill = PALETTE[(pa >> 3) & 7]
                    if pa & 0x40: fill = fill.replace("d8", "ff")
                out.append([kind, (c - 1) * 8, r * 8, w * 8, fill])
            if out: guns[str(n)] = out
            save(path, t, a)
            x0, y0 = index[str(n)]
            sheet.paste(Image.fromarray(rgb(t, a, 0, 18, 1, 31)), (x0, y0))
        print(f"{sum(len(v) for v in guns.values())} guns in {len(guns)} rooms, {sum(len(v) for v in items.values())} cups in {len(items)}")
    # lift arrows: the cell scrolls a pixel every four frames; any phase of it, up or down, marks one
    arrows = {}
    if args.arrow:
        f, row, col = args.arrow.split(":")
        at, aa = load(f); base = at[int(row), int(col)]
        phases = {}
        for k in range(8):
            phases[np.roll(base, k).tobytes()] = "down"
            phases[np.roll(base[::-1].copy(), k).tobytes()] = "up"
        for n in rooms:
            seen = {}
            for f in caps.get(n, []):
                t, a = load(f)
                for r in range(3, 17):
                    for c in range(1, 31):
                        d = phases.get(t[r, c].tobytes())
                        if d: seen[(r, c)] = [(c - 1) * 8, r * 8, d, int(a[r, c])]   # and the cell's colours
            if seen: arrows[str(n)] = list(seen.values())
        print(f"{sum(len(v) for v in arrows.values())} lift arrows in {len(arrows)} rooms")
        arrow_bits = [int(v) for v in base]
    # the cells the original draws in front of the figures: one bit per view column, per view row
    solid, block = {}, {}
    if args.solid:
        # bit 7: drawn in front of the figures; bits 7 and 6 without bit 4: a wall or a
        # step Ai walks into (bit 4 marks doorways and guns, which have their own rules)
        for room, rows in json.load(open(args.solid)).items():
            if room not in index: continue
            flags = [[int(rows[r][2 * c:2 * c + 2], 16) for c in range(32)] for r in range(0, 18)]
            solid[room] = [sum(1 << (c - 1) for c in range(1, 31) if flags[r][c] & 0x80) for r in range(0, 18)]
            block[room] = [sum(1 << (c - 1) for c in range(1, 31) if (flags[r][c] & 0xd0) == 0xc0) for r in range(0, 18)]
        print(f"foreground and wall maps for {len(solid)} rooms")
    # the lifts' call buttons: the cell's colours cycle while the lift is called or moving
    buttons = {}
    if args.button:
        f, row, col = args.button.split(":")
        bt, ba = load(f); pat = bt[int(row), int(col)].tobytes()
        for n in rooms:
            path = os.path.join(args.screens, f"room_{n}.scr")
            t, a = load(path)
            # the same round cell decorates walls elsewhere: a button sits beside a shaft's arrow cell
            near = arrows.get(str(n), [])
            found = [[(c - 1) * 8, r * 8, int(a[r, c])] for r in range(2, 17) for c in range(1, 31)
                     if t[r, c].tobytes() == pat and any(abs(ax - (c - 1) * 8) <= 16 and abs(ay - r * 8) <= 8 for ax, ay, *_ in near)]
            if found: buttons[str(n)] = found
        print(f"{sum(len(v) for v in buttons.values())} lift buttons in {len(buttons)} rooms")
    # the sector doors, shut: the original's slabs, drawn over the backdrop while the door holds
    doors = {}
    slab = {}                                            # a reference slab per side for doors the original never shows
    for spec in filter(None, args.door.split(",")):
        parts = spec.split(":")
        room, side = parts[0], parts[1]
        shut, opened = (parts[2], parts[3]) if len(parts) > 3 else (None, None)
        n = int(room)
        path = os.path.join(args.screens, f"room_{n}.scr")
        to, ao = load(path)
        band = range(24, 32) if side == "right" else range(0, 8)
        cells = {}
        if shut:
            tc, ac = load(shut); tp, ap_ = load(opened)
            for r in range(5, 18):
                for c in band:
                    if tc[r, c].tobytes() != tp[r, c].tobytes() or ac[r, c] != ap_[r, c]:
                        cells[(r, c)] = (tc[r, c].copy(), int(ac[r, c]))
            # the slab is the tallest run of differing cells: sprites and lamps fall away
            cols = Counter(c for r, c in cells)
            keep = {c for c, k in cols.items() if k >= 3}
            cells = {rc: v for rc, v in cells.items() if rc[1] in keep}
            if cells and side not in slab: slab[side] = cells
            # the backdrop shows the doorway open, whatever the intersection made of it
            for (r, c) in cells: to[r, c] = tp[r, c]; ao[r, c] = ap_[r, c]
            save(path, to, ao)
            x0, y0 = index[str(n)]
            sheet.paste(Image.fromarray(rgb(to, ao, 0, 18, 1, 31)), (x0, y0))
        else:
            ref = slab.get(side)
            if not ref: print(f"door {room} {side}: no reference slab yet", file=sys.stderr); continue
            # the same slab, moved to this room's doorway: the two cells inside the wall
            rows = sorted(set(r for r, c in ref)); refcols = sorted(set(c for r, c in ref))
            at = (28, 29) if side == "right" else (1, 2)
            for (r, c), v in ref.items():
                cells[(r, at[refcols.index(c)] if refcols.index(c) < 2 else at[1])] = v
        if not cells: print(f"door {room} {side}: nothing differs", file=sys.stderr); continue
        rs = sorted(set(r for r, c in cells)); cs = sorted(set(c for r, c in cells))
        r0, r1, c0, c1 = rs[0], rs[-1] + 1, cs[0], cs[-1] + 1
        tiles = to.copy(); attr = ao.copy()
        for (r, c), (t, a) in cells.items(): tiles[r, c] = t; attr[r, c] = a
        doors[f"{room}:{side}"] = {"cells": cells, "box": (r0, r1, c0, c1), "img": Image.fromarray(rgb(tiles, attr, r0, r1, c0, c1))}
    door_index = {}
    if doors:
        extra = Image.new("RGB", (sheet.width, 64), (0, 0, 0))
        x = 0
        for k, d in doors.items():
            r0, r1, c0, c1 = d["box"]; im = d["img"]
            extra.paste(im, (x, 0))
            door_index[k] = [x, sheet.height, im.width, im.height, (c0 - 1) * 8, r0 * 8]   # in the sheet; where in the view
            x += im.width + 4
        full = Image.new("RGB", (sheet.width, sheet.height + 64), (0, 0, 0)); full.paste(sheet, (0, 0)); full.paste(extra, (0, sheet.height))
        sheet = full
        print(f"{len(door_index)} doors: {', '.join(door_index)}")
    sheet.save(args.out, optimize=True)
    with open(args.index, "w") as f:
        f.write("// generated by tools/make_rooms.py: where each room's backdrop lies in assets/rooms.png\n")
        f.write("window.ROOMS_SHEET = " + json.dumps({"image": "assets/rooms.png", "w": 240, "h": 144, "rooms": index, "doors": door_index,
                                                     "guns": guns, "items": items, "buttons": buttons, "solid": solid, "block": block, "arrows": arrows, "arrow": arrow_bits if args.arrow else None}) + ";\n")
    print(f"{len(index)} rooms from {sum(len(v) for v in caps.values())} captures -> {args.out}")


if __name__ == "__main__":
    main()
