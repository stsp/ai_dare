#!/usr/bin/env python3
"""The rooms as tiles and layouts.

The original draws its rooms the way the Spectrum draws everything: a grid of
8x8 cells, each cell a bitmap out of a small set with two colours of its own.
Over all 121 screens the set is a few hundred bitmaps - the floors, the ledges,
the rails of the grav-lifts, the columns, the pipes, the lamps, the panels.
This reads the cleaned screens (data/emu/room_N.scr) and the door slabs cut
from assets/rooms.png, collects every distinct bitmap once into assets/tiles.png,
and writes each room as two grids: which tile stands in each cell, and what
colours it wears (js/rooms_tiles.js). The game builds its rooms from those at
load, so its graphics are a set of tiles, not 121 pictures.

    python3 tools/make_tiles.py [--check]

--check also rebuilds every room from the tiles and compares it with
assets/rooms.png, cell by cell.
"""
import argparse, glob, json, os, re, sys
import numpy as np
from PIL import Image

COLS, ROWS = 32, 24
VIEW_C0, VIEW_C1, VIEW_R0, VIEW_R1 = 1, 31, 0, 18          # the play area: 30 by 18 cells
PALETTE = [(0x00, 0x00, 0x00), (0x00, 0x00, 0xd8), (0xd8, 0x00, 0x00), (0xd8, 0x00, 0xd8),
           (0x00, 0xd8, 0x00), (0x00, 0xd8, 0xd8), (0xd8, 0xd8, 0x00), (0xd8, 0xd8, 0xd8)]
BRIGHT = [(0x00, 0x00, 0x00), (0x00, 0x00, 0xff), (0xff, 0x00, 0x00), (0xff, 0x00, 0xff),
          (0x00, 0xff, 0x00), (0x00, 0xff, 0xff), (0xff, 0xff, 0x00), (0xff, 0xff, 0xff)]
# base64url's alphabet: a tile is two of these characters, a colour one
ALPHA = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_"


def load_scr(path):
    """A dumped Spectrum screen as per-cell bitmaps and attribute bytes."""
    d = open(path, "rb").read()
    tiles = np.zeros((ROWS, COLS, 8), dtype=np.uint8)
    for y in range(192):
        row = (y & 0xC0) | ((y & 7) << 3) | ((y & 0x38) >> 3)
        tiles[y // 8, :, y % 8] = np.frombuffer(d[row * 32:row * 32 + 32], dtype=np.uint8)
    attr = np.frombuffer(d[6144:6912], dtype=np.uint8).reshape(ROWS, COLS).copy()
    return tiles, attr


def cell_rgb(bits, attr):
    """The 8x8 pixels of one cell, as the Spectrum shows it."""
    pal = BRIGHT if attr & 0x40 else PALETTE
    ink = np.array(pal[attr & 7], dtype=np.uint8)
    pap = np.array(pal[(attr >> 3) & 7], dtype=np.uint8)
    on = np.unpackbits(np.asarray(bits, dtype=np.uint8).reshape(8, 1), axis=1)
    return np.where(on[..., None] == 1, ink, pap)


def read_index(path="js/rooms_sheet.js"):
    s = open(path).read()
    return json.loads(s[s.index("=") + 1:s.rstrip().rstrip(";").rindex("}") + 1])


def colour_number(px):
    """A pixel's Spectrum colour as (number, bright), or None if it is neither."""
    t = tuple(int(v) for v in px)
    if t in PALETTE: return PALETTE.index(t), 0
    if t in BRIGHT: return BRIGHT.index(t), 1
    return None


def cell_from_rgb(block, known):
    """A cell of the sheet read back as a bitmap and an attribute. Which of the
    two colours is the ink cannot be told from the pixels alone, so a cell the
    screens already show is taken as they have it; the rest call the commoner
    colour the paper, as a backdrop's cell nearly always has it."""
    key = block.tobytes()
    if key in known: return known[key]
    cols = {}
    for y in range(8):
        for x in range(8):
            c = colour_number(block[y, x])
            if c is None: raise SystemExit(f"cell colour {tuple(block[y, x])} is not the Spectrum's")
            cols[c] = cols.get(c, 0) + 1
    if len(cols) > 2: raise SystemExit(f"cell has {len(cols)} colours; a Spectrum cell has two")
    order = sorted(cols, key=lambda c: -cols[c])
    paper = order[0]
    ink = order[1] if len(order) > 1 else (0, paper[1])
    bits = np.zeros(8, dtype=np.uint8)
    for y in range(8):
        v = 0
        for x in range(8):
            if colour_number(block[y, x]) == ink: v |= 0x80 >> x
        bits[y] = v
    return bits, ink[0] | (paper[0] << 3) | ((ink[1] | paper[1]) << 6)


def enc_tiles(grid, index):
    """A grid of tile numbers, two characters a cell."""
    return ["".join(ALPHA[index[v] >> 6] + ALPHA[index[v] & 63] for v in row) for row in grid]


def enc_colours(grid, palette):
    return ["".join(ALPHA[palette[v]] for v in row) for row in grid]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--screens", default="data/emu", help="where the cleaned room_N.scr are")
    ap.add_argument("--sheet", default="assets/rooms.png", help="the packed backdrops, for the door slabs and the check")
    ap.add_argument("--index", default="js/rooms_sheet.js")
    ap.add_argument("-o", "--out", default="assets/tiles.png")
    ap.add_argument("--layouts", default="js/rooms_tiles.js")
    ap.add_argument("--per-row", type=int, default=16, help="tiles across the tile sheet")
    ap.add_argument("--check", action="store_true", help="rebuild every room from the tiles and compare with the sheet")
    args = ap.parse_args()

    meta = read_index(args.index)
    sheet = np.asarray(Image.open(args.sheet).convert("RGB"))

    # every cell of every room, as the original's screens have it
    rooms, known = {}, {}
    for path in sorted(glob.glob(os.path.join(args.screens, "room_*.scr"))):
        n = re.search(r"room_(\d+)\.scr$", path).group(1)
        if n not in meta["rooms"]: continue
        t, a = load_scr(path)
        cells = [[(t[r, c].tobytes(), int(a[r, c])) for c in range(VIEW_C0, VIEW_C1)]
                 for r in range(VIEW_R0, VIEW_R1)]
        rooms[n] = cells
        for row in cells:
            for bits, attr in row:
                known.setdefault(cell_rgb(np.frombuffer(bits, dtype=np.uint8), attr).tobytes(),
                                 (np.frombuffer(bits, dtype=np.uint8), attr))
    if not rooms: raise SystemExit(f"no room screens in {args.screens}")
    # the door slabs the game lays over a doorway while the door holds: they
    # are in the packed sheet only, cut from the original's two dumps
    for path in sorted(glob.glob(os.path.join(args.screens, "doors", "room_*.scr"))):
        t, a = load_scr(path)
        for r in range(ROWS):
            for c in range(COLS):
                known.setdefault(cell_rgb(t[r, c], int(a[r, c])).tobytes(), (t[r, c], int(a[r, c])))
    doors = {}
    for key, (sx, sy, w, h, x, y) in meta.get("doors", {}).items():
        doors[key] = {
            "x": x, "y": y, "w": w // 8, "h": h // 8,
            "cells": [[cell_from_rgb(sheet[sy + r * 8:sy + r * 8 + 8, sx + c * 8:sx + c * 8 + 8], known)
                       for c in range(w // 8)] for r in range(h // 8)],
        }
    for d in doors.values():
        d["cells"] = [[(bytes(bits), int(attr)) for bits, attr in row] for row in d["cells"]]

    # the tile set: every distinct bitmap, blank first so an empty cell is tile 0
    order, seen = [b"\x00" * 8], {b"\x00" * 8: 0}
    attrs_seen = {}
    def take(cells):
        for row in cells:
            for bits, attr in row:
                if bits not in seen:
                    seen[bits] = len(order); order.append(bits)
                attrs_seen[attr] = attrs_seen.get(attr, 0) + 1
    for cells in rooms.values(): take(cells)
    for d in doors.values(): take(d["cells"])
    palette = sorted(attrs_seen)
    if len(palette) > 64: raise SystemExit(f"{len(palette)} attribute bytes; the layouts hold 64")
    pal_index = {a: i for i, a in enumerate(palette)}

    # the tile sheet: each tile a bitmap, its set pixels white
    per_row = args.per_row
    rows_of = (len(order) + per_row - 1) // per_row
    img = np.zeros((rows_of * 8, per_row * 8, 3), dtype=np.uint8)
    for i, bits in enumerate(order):
        on = np.unpackbits(np.frombuffer(bits, dtype=np.uint8).reshape(8, 1), axis=1)
        img[(i // per_row) * 8:(i // per_row) * 8 + 8, (i % per_row) * 8:(i % per_row) * 8 + 8] = on[..., None] * 255
    Image.fromarray(img).save(args.out, optimize=True)

    out = {
        "image": args.out, "tile": 8, "cols": per_row, "count": len(order),
        "w": VIEW_C1 - VIEW_C0, "h": VIEW_R1 - VIEW_R0,
        "attrs": palette,
        "rooms": {n: {"tiles": enc_tiles([[b for b, _ in row] for row in cells], seen),
                      "colours": enc_colours([[a for _, a in row] for row in cells], pal_index)}
                  for n, cells in sorted(rooms.items(), key=lambda kv: int(kv[0]))},
        "doors": {k: {"x": d["x"], "y": d["y"], "w": d["w"], "h": d["h"],
                      "tiles": enc_tiles([[b for b, _ in row] for row in d["cells"]], seen),
                      "colours": enc_colours([[a for _, a in row] for row in d["cells"]], pal_index)}
                  for k, d in doors.items()},
    }
    with open(args.layouts, "w") as f:
        f.write("// generated by tools/make_tiles.py: the tile set of assets/tiles.png and,\n"
                "// for every room and door slab, which tile stands in each cell and its colours\n")
        f.write("window.ROOMS_TILES = " + json.dumps(out) + ";\n")
    print(f"{len(order)} tiles, {len(palette)} colour pairs, {len(rooms)} rooms and {len(doors)} door slabs "
          f"-> {args.out}, {args.layouts}")

    if args.check:
        bad = 0
        for n, cells in rooms.items():
            sx, sy = meta["rooms"][n]
            for r, row in enumerate(cells):
                for c, (bits, attr) in enumerate(row):
                    want = sheet[sy + r * 8:sy + r * 8 + 8, sx + c * 8:sx + c * 8 + 8]
                    if not np.array_equal(cell_rgb(np.frombuffer(bits, dtype=np.uint8), attr), want):
                        bad += 1
                        if bad <= 5: print(f"room {n} cell {r},{c} differs", file=sys.stderr)
        for k, d in doors.items():
            sx, sy, w, h, _, _ = meta["doors"][k]
            for r, row in enumerate(d["cells"]):
                for c, (bits, attr) in enumerate(row):
                    want = sheet[sy + r * 8:sy + r * 8 + 8, sx + c * 8:sx + c * 8 + 8]
                    if not np.array_equal(cell_rgb(np.frombuffer(bits, dtype=np.uint8), attr), want):
                        bad += 1
                        if bad <= 5: print(f"door {k} cell {r},{c} differs", file=sys.stderr)
        print(f"check: {bad} cells differ from {args.sheet}")
        if bad: raise SystemExit(1)


if __name__ == "__main__":
    main()
