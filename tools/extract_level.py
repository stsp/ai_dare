#!/usr/bin/env python3
"""Derive Dan Dare level geometry from the speccy.cz screen map.

The map (https://maps.speccy.cz/maps/DanDare1.png) is a montage of the game's
screens. The ZX Spectrum original uses a 240x144 play window (30x18 character
cells), and the montage lays those screens out on a regular grid:

    room (row, col)  ->  pixel box  x = 31 + 240*col,  y = 39 + 144*row

Both origins sit on the Spectrum's 8x8 attribute grid: at this offset 99.7% of
8x8 cells in the montage contain at most two colours, which is the hardware
constraint on a Spectrum character cell, so the alignment is unambiguous.

This script reads the montage and emits level.json: for each screen, the
standable platforms, blocking walls, grav-lift shafts and the area's colour
scheme. Only functional geometry is emitted - none of the original artwork -
the game draws its own tiles from these coordinates.

Usage:  python3 tools/extract_level.py [path-to-DanDare1.png] [-o level.json]
        (downloads the map to a temp file if no path is given)
"""
import argparse
import json
import os
import sys
import tempfile
import urllib.request

import numpy as np
from PIL import Image

MAP_URL = "https://maps.speccy.cz/maps/DanDare1.png"

# --- montage geometry (measured from the map, see module docstring) ---
X0, Y0, RW, RH, CS = 31, 39, 240, 144, 8
TW, TH = RW // CS, RH // CS          # 30 x 18 cells per screen

# The loading-screen artwork occupies the top-left of the montage.
ART_CELLS = {(0, 0), (0, 1), (1, 0), (1, 1)}

PALETTE = {
    "black": (0, 0, 0), "blue": (0, 0, 216), "dblue": (0, 0, 184),
    "cyan": (0, 216, 216), "dcyan": (0, 184, 184),
    "white": (216, 216, 216), "bwhite": (254, 254, 254),
    "yellow": (211, 210, 0), "red": (199, 1, 0),
    "green": (0, 197, 0), "magenta": (216, 1, 216),
}
# Colours the game builds structure from. Blue/black are open space: the room's
# back wall and the void, which Dan moves freely in front of.
STRUCTURAL = ("cyan", "dcyan", "white", "bwhite", "yellow", "red", "magenta")

STRUCT_MIN = 0.30      # ink fraction for a cell to count as structure
GREEN_MIN = 0.18       # ink fraction for a grav-lift cell
LIFT_MIN_RUN = 4       # a lift shaft is at least this many cells tall
PLATFORM_MIN_RUN = 3   # ignore narrower ledges: they are decoration, not floor
WALL_MIN_RUN = 5       # a blocking wall is at least this many cells tall


def load_map(path):
    if path:
        return Image.open(path).convert("RGB")
    tmp = os.path.join(tempfile.gettempdir(), "DanDare1.png")
    if not os.path.exists(tmp):
        print(f"downloading {MAP_URL} ...", file=sys.stderr)
        urllib.request.urlretrieve(MAP_URL, tmp)
    return Image.open(tmp).convert("RGB")


class MapReader:
    def __init__(self, img):
        self.img = img
        self.a = np.array(img).astype(int)
        h, w, _ = self.a.shape
        self.cols, self.rows = (w - X0) // RW, (h - Y0) // RH
        self.ink = self.a.sum(axis=2) > 0

    def cell_box(self, r, c, i, j):
        y = Y0 + r * RH + j * CS
        x = X0 + c * RW + i * CS
        return self.a[y:y + CS, x:x + CS]

    def fractions(self, r, c):
        """Per-cell ink fractions -> (structural, green) arrays of shape (TH, TW)."""
        room = self.a[Y0 + r * RH:Y0 + (r + 1) * RH, X0 + c * RW:X0 + (c + 1) * RW]
        cells = room.reshape(TH, CS, TW, CS, 3).transpose(0, 2, 1, 3, 4)
        struct = np.zeros((TH, TW))
        green = np.zeros((TH, TW))
        for name in STRUCTURAL:
            v = PALETTE[name]
            struct += np.all(cells == v, axis=-1).mean(axis=(2, 3))
        gv = PALETTE["green"]
        green += np.all(cells == gv, axis=-1).mean(axis=(2, 3))
        return struct, green

    def is_room(self, r, c):
        """A playable screen has content and a floor band across its base."""
        if (r, c) in ART_CELLS:
            return False
        sub = self.ink[Y0 + r * RH:Y0 + (r + 1) * RH, X0 + c * RW:X0 + (c + 1) * RW]
        if sub.mean() < 0.02:
            return False
        struct, _ = self.fractions(r, c)
        base = (struct[TH - 2:, :] >= STRUCT_MIN).any(axis=0)
        return int(base.sum()) >= 20      # floor band spans most of the width

    def area_colours(self, r, c):
        """The dominant non-blue colours of the floor band identify the sector."""
        band = self.a[Y0 + r * RH + RH - CS * 2:Y0 + r * RH + RH,
                      X0 + c * RW:X0 + (c + 1) * RW]
        flat = band.reshape(-1, 3)
        counts = {}
        for name, v in PALETTE.items():
            if name in ("black", "blue", "dblue"):
                continue
            n = int(np.all(flat == v, axis=-1).sum())
            if n:
                counts[name] = n
        return [k for k, _ in sorted(counts.items(), key=lambda kv: -kv[1])[:3]]


def runs(mask, min_len):
    """Yield (start, end_exclusive) runs of True at least min_len long."""
    out, start = [], None
    for i, v in enumerate(list(mask) + [False]):
        if v and start is None:
            start = i
        elif not v and start is not None:
            if i - start >= min_len:
                out.append((start, i))
            start = None
    return out


def extract_room(reader, r, c):
    struct, green = reader.fractions(r, c)
    solid = struct >= STRUCT_MIN

    # --- grav-lift shafts: columns of green ---
    # A shaft runs the height of the screen, but the floors it passes through
    # interrupt the green, so take the whole span of a column rather than the
    # individual runs, and snap it to the edge when it reaches that far - those
    # are the shafts that carry Dan into the screen above or below.
    lifts = []
    gmask = green >= GREEN_MIN
    for i in range(TW):
        rows_hit = np.flatnonzero(gmask[:, i])
        if len(rows_hit) < LIFT_MIN_RUN:
            continue
        a, b = int(rows_hit[0]), int(rows_hit[-1]) + 1
        if b - a < LIFT_MIN_RUN + 1:
            continue
        if a <= 1:
            a = 0
        if b >= TH - 1:
            b = TH
        lifts.append({"x": i, "y0": a, "y1": b})
    lift_cols = {l["x"] for l in lifts}

    # --- platforms: a standable cell is structure with open space above ---
    standable = solid.copy()
    standable[1:, :] &= ~solid[:-1, :]
    standable[0, :] = False
    platforms = []
    for j in range(TH):
        row = standable[j].copy()
        for i in lift_cols:
            row[i] = False        # a lift shaft is not a ledge
        for (a, b) in runs(row, PLATFORM_MIN_RUN):
            platforms.append({"y": j, "x0": a, "x1": b})

    # --- vertical structure ---
    # A column of structure that runs the whole height of a screen is a shaft:
    # the ladder/lift the sector draws in its own colour, which is how Dan
    # moves between floors. (Only the green ones are grav-lifts proper.) A
    # genuine floor-to-ceiling *wall* would seal the screen off, which this
    # game does not do - so anything shorter is scenery: bay dividers, door
    # frames and machinery that Dan runs straight past.
    floor_tops = {(p["y"], x) for p in platforms for x in range(p["x0"], p["x1"])}
    walls = []
    for i in range(TW):
        if i in lift_cols or i in (0, TW - 1):
            continue
        for (a, b) in runs(solid[:, i], WALL_MIN_RUN):
            if a <= 1 and b >= TH - 1:
                lifts.append({"x": i, "y0": 0, "y1": TH, "c": 1})   # climbable
            else:
                grounded = b >= TH - 2 or (b, i) in floor_tops
                walls.append({"x": i, "y0": a, "y1": b, "b": 1 if grounded else 0})

    # the screen's own side columns stay as drawn scenery
    for i in (0, TW - 1):
        for (a, b) in runs(solid[:, i], WALL_MIN_RUN):
            walls.append({"x": i, "y0": a, "y1": b, "b": 0})

    return {
        "platforms": platforms,
        "walls": walls,
        "lifts": lifts,
        "colours": reader.area_colours(r, c),
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("map", nargs="?", help="path to DanDare1.png")
    ap.add_argument("-o", "--out", default="level.json")
    args = ap.parse_args()

    reader = MapReader(load_map(args.map))
    rooms = {}
    for r in range(reader.rows):
        for c in range(reader.cols):
            if reader.is_room(r, c):
                rooms[f"{r},{c}"] = extract_room(reader, r, c)

    # The game is split into colour-coded sectors; a screen's sector is given by
    # the colour signature of its floor band. Group the signatures we found.
    # Shade variants are the same colour as far as the sector goes, and the
    # order the two colours happen to come out in does not matter.
    merge = {"dcyan": "cyan", "dblue": "blue", "bwhite": "white"}
    sigs, sectors = {}, []
    for key in sorted(rooms):
        pair = [merge.get(x, x) for x in rooms[key]["colours"][:2]]
        sig = tuple(sorted(set(pair)))
        if sig not in sigs:
            sigs[sig] = len(sectors)
            sectors.append(list(sig))
        rooms[key]["sector"] = sigs[sig]

    # Mark which screens Dan can actually get to, so the game only puts keys,
    # cells and the self-destruct room where they can be reached.
    start = min(rooms, key=lambda k: tuple(map(int, k.split(","))))
    try:
        from check_reachability import reachable
        got = {(r, c) for r, c, _ in reachable(rooms, TW, TH, start)}
    except Exception as exc:                      # analysis is advisory only
        print(f"reachability check skipped: {exc}", file=sys.stderr)
        got = {tuple(map(int, k.split(","))) for k in rooms}
    for key in rooms:
        rooms[key]["reach"] = 1 if tuple(map(int, key.split(","))) in got else 0

    level = {
        "source": MAP_URL,
        "grid": {"rows": reader.rows, "cols": reader.cols},
        "room": {"w": TW, "h": TH, "cell": CS},
        "sectors": sectors,
        "start": start,
        "rooms": rooms,
    }
    with open(args.out, "w") as f:
        json.dump(level, f, separators=(",", ":"))
    # Also emit a plain <script>-loadable copy so the game runs from file://
    # without needing fetch() and a web server.
    js = os.path.join(os.path.dirname(args.out) or ".", "js", "level.js")
    if os.path.isdir(os.path.dirname(js)):
        with open(js, "w") as f:
            f.write("window.DANDARE_LEVEL=")
            json.dump(level, f, separators=(",", ":"))
            f.write(";\n")
    print(f"{len(rooms)} rooms, {len(sectors)} sectors -> {args.out} "
          f"({os.path.getsize(args.out) / 1024:.0f} kB)", file=sys.stderr)


if __name__ == "__main__":
    main()
