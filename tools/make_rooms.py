#!/usr/bin/env python3
"""Room backdrops from the original's screens.

Every room was dumped many times by the emulator surveys, each time with Dan,
a Treen or a message box somewhere in it. Cell by cell, the value most of the
dumps agree on is the room itself; the sprites and boxes fall away. The parts
of the mechanism are wiped too (the game lays its own), and a message box
that every dump shows is rebuilt from the band's pattern. The cleaned screens
go back to data/emu, and their play areas (columns 1-30, rows 1-18: 240 by
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
    """A figure that stood still through every dump - Dan boxed in a lift
    shaft, a Treen at the end of his beat - is found by its shape: where a
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
                         "three or more of them, are used alone (Dan stood elsewhere in each)")
    ap.add_argument("--screens", default="data/emu", help="where the cleaned screens go")
    ap.add_argument("--erase", default="", help="figures to wipe by shape, as FILE:r0:r1:c0:c1,... - a clean "
                         "dump and the cells a standing Dan or Treen fills in it; their mirrors are tried too")
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
    # screen blanked, Dan out cold, a stray room, a capture mid-redraw - is
    # left out; the rest, old and new alike, are intersected
    prefer = [d for d in args.prefer.split(",") if d]
    for n in list(caps):
        # a dump with the screen blanked (Dan out cold, the room gone dark) says nothing of the room
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
        im = Image.fromarray(rgb(tiles, attr, 1, 19, 1, 31))
        x, y = (i % per_row) * 240, (i // per_row) * 144
        sheet.paste(im, (x, y))
        index[str(n)] = [x, y]
    sheet.save(args.out, optimize=True)
    with open(args.index, "w") as f:
        f.write("// generated by tools/make_rooms.py: where each room's backdrop lies in assets/rooms.png\n")
        f.write("window.ROOMS_SHEET = " + json.dumps({"image": "assets/rooms.png", "w": 240, "h": 144, "rooms": index}) + ";\n")
    print(f"{len(index)} rooms from {sum(len(v) for v in caps.values())} captures -> {args.out}")


if __name__ == "__main__":
    main()
