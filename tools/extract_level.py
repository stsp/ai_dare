#!/usr/bin/env python3
"""Derive Dan Dare level data from the speccy.cz screen map.

The map (https://maps.speccy.cz/maps/DanDare1.png) is a montage of the game's
rooms. Measured from the image:

  * a room is 240x144 px - 30x18 character cells - matching the play window in
    screenshots of the real game;
  * rooms tile a grid at  x = 31 + 240*col,  y = 39 + 144*row  (21 x 8 cells,
    106 of which hold a room);
  * that origin sits on the Spectrum's 8x8 attribute grid: at this offset 99.7%
    of cells hold at most two colours, which is the hardware limit for a
    character cell. Two independent checks agree - the map's sector colouring
    changes exactly on the column lines, and floor bands end exactly on the row
    lines.

What this script can and cannot recover
---------------------------------------
Room CONTENTS are recovered exactly: every cell is classified, so the game can
draw each of the 106 rooms as the map shows it, and stand Dan on its floors.

Room CONNECTIONS are not in the image. Only 24 of 85 side-by-side room
boundaries are open, and only 18 of 72 vertically stacked pairs even share a
lift-shaft column, so the montage does not describe a connected building. The
graph the game plays on is therefore generated here (see plan_doors) and
flagged as such - it is level design, not extraction.

Usage:  python3 tools/extract_level.py [map.png] [-o level.json]
"""
import argparse
import json
import os
import sys
import tempfile
import urllib.request
from collections import deque

import numpy as np
from PIL import Image

MAP_URL = "https://maps.speccy.cz/maps/DanDare1.png"

X0, Y0, RW, RH, CS = 31, 39, 240, 144, 8
TW, TH = RW // CS, RH // CS            # 30 x 18 cells
ART_CELLS = {(0, 0), (0, 1), (1, 0), (1, 1)}   # loading screen art

SPECTRUM = {
    "black": (0, 0, 0), "blue": (0, 0, 216), "dblue": (0, 0, 184),
    "cyan": (0, 216, 216), "dcyan": (0, 184, 184),
    "white": (216, 216, 216), "bwhite": (254, 254, 254),
    "yellow": (211, 210, 0), "red": (199, 1, 0),
    "green": (0, 197, 0), "magenta": (216, 1, 216),
}
# Blue and black are open space - the room's back wall and the void.
STRUCTURE = ("cyan", "dcyan", "white", "bwhite", "yellow", "red", "magenta")

STRUCT_MIN = 0.30      # ink per cell that makes it structure
RAIL_MIN_ROWS = 5      # a lift rail is at least this tall
RAIL_GAP = (2, 3, 4)   # cells between a lift's two rails, rail to rail

# cell classes emitted for drawing
EMPTY, DECOR, RAIL, BAND, WALL, FIELD = 0, 1, 2, 3, 4, 5

def load_map(path):
    if path:
        return Image.open(path).convert("RGB")
    tmp = os.path.join(tempfile.gettempdir(), "DanDare1.png")
    if not os.path.exists(tmp):
        print(f"downloading {MAP_URL} ...", file=sys.stderr)
        urllib.request.urlretrieve(MAP_URL, tmp)
    return Image.open(tmp).convert("RGB")


def runs(mask, min_len=1):
    out, start = [], None
    for i, v in enumerate(list(mask) + [False]):
        if v and start is None:
            start = i
        elif not v and start is not None:
            if i - start >= min_len:
                out.append((start, i))
            start = None
    return out


class MapReader:
    def __init__(self, img):
        self.a = np.array(img).astype(int)
        h, w, _ = self.a.shape
        self.cols, self.rows = (w - X0) // RW, (h - Y0) // RH
        self.ink = self.a.sum(axis=2) > 0

    def _cells(self, r, c):
        room = self.a[Y0 + r * RH:Y0 + (r + 1) * RH, X0 + c * RW:X0 + (c + 1) * RW]
        return room.reshape(TH, CS, TW, CS, 3).transpose(0, 2, 1, 3, 4)

    def masks(self, r, c):
        cl = self._cells(r, c)
        struct = np.zeros((TH, TW))
        for name in STRUCTURE:
            struct += np.all(cl == SPECTRUM[name], axis=-1).mean(axis=(2, 3))
        green = np.all(cl == SPECTRUM["green"], axis=-1).mean(axis=(2, 3))
        return struct, green

    def is_room(self, r, c):
        if (r, c) in ART_CELLS:
            return False
        sub = self.ink[Y0 + r * RH:Y0 + (r + 1) * RH, X0 + c * RW:X0 + (c + 1) * RW]
        if sub.mean() < 0.02:
            return False
        struct, _ = self.masks(r, c)
        return int((struct[TH - 2:, :] >= STRUCT_MIN).any(axis=0).sum()) >= 20

    def band_colours(self, r, c):
        band = self.a[Y0 + r * RH + RH - CS * 2:Y0 + r * RH + RH,
                      X0 + c * RW:X0 + (c + 1) * RW].reshape(-1, 3)
        counts = {}
        for name, v in SPECTRUM.items():
            if name in ("black", "blue", "dblue"):
                continue
            n = int(np.all(band == v, axis=-1).sum())
            if n:
                counts[name] = n
        return [k for k, _ in sorted(counts.items(), key=lambda kv: -kv[1])[:3]]


class ArrayReader(MapReader):
    """A single room given as a 144x240 RGB array - a screen dumped from the
    game itself, for a room the map does not show."""
    def __init__(self, arr):
        self.a = np.asarray(arr).astype(int)
        self.cols, self.rows = 1, 1
        self.ink = self.a.sum(axis=2) > 0

    def _cells(self, r, c):
        return self.a.reshape(TH, CS, TW, CS, 3).transpose(0, 2, 1, 3, 4)

    def band_colours(self, r, c):
        band = self.a[RH - CS * 2:RH, :].reshape(-1, 3)
        counts = {}
        for name, v in SPECTRUM.items():
            if name in ("black", "blue", "dblue"):
                continue
            n = int(np.all(band == v, axis=-1).sum())
            if n:
                counts[name] = n
        return [k for k, _ in sorted(counts.items(), key=lambda kv: -kv[1])[:3]]


def read_room(reader, r, c):
    """Classify one room's 30x18 cells and read the geometry Dan plays on.

    Everything is read from the shape of the ink, not its colour, because the
    sectors recolour the same furniture: lift rails are cyan in one area and
    green in the next.
    """
    cl = reader._cells(r, c)                       # (TH, TW, 8, 8, 3)
    blue = (cl[..., 0] == 0) & (cl[..., 1] == 0) & (cl[..., 2] > 0)
    ink = (cl.sum(axis=-1) > 0) & ~blue            # not the void, not the back wall
    frac = ink.mean(axis=(2, 3))
    colcnt = ink.sum(axis=2)                       # ink per pixel column, (TH, TW, 8)
    strong = (colcnt >= 4).sum(axis=-1)

    # --- bands: the floor course every room has, and a ceiling course if the
    #     room is indoors (surface rooms open onto the starfield)
    band = np.zeros((TH, TW), bool)
    band[TH - 2:, :] = frac[TH - 2:, :] >= STRUCT_MIN
    for j in (0, 1):
        if (frac[j] >= STRUCT_MIN).sum() >= 20:
            band[j] = frac[j] >= STRUCT_MIN

    # --- lift rails. The game draws every rail with one 8x8 pattern, dotted
    #     rows of ".#..###." on alternate lines, whatever colour the sector
    #     paints it; matching the pattern keeps rockets and aerials out.
    pat = np.array([[0, 1, 0, 0, 1, 1, 1, 0]] * 4, bool)
    rows_even = ink[:, :, 0::2, :]
    rows_odd = ink[:, :, 1::2, :]
    railcell = ((np.all(rows_even == pat, axis=(2, 3)) & ~rows_odd.any(axis=(2, 3))) |
                (np.all(rows_odd == pat, axis=(2, 3)) & ~rows_even.any(axis=(2, 3))))
    railcell[:2, :] = False
    railcell[TH - 2:, :] = False
    rails = {}
    for i in range(TW):
        hit = np.flatnonzero(railcell[:, i])
        if len(hit) >= RAIL_MIN_ROWS - 1:
            # the lift car and its panel interrupt the rail: bridge short gaps
            top, bot = int(hit[0]), int(hit[-1]) + 1
            if bot - top >= RAIL_MIN_ROWS:
                rails[i] = (top, bot)
    shafts = []
    used = set()
    for i in sorted(rails):
        if i in used:
            continue
        x, w, (top, bot) = i - 1, 3, rails[i]       # a single rail: the car beside it
        for d in RAIL_GAP:
            j = i + d
            if j in rails and j not in used:
                top, bot = min(top, rails[j][0]), max(bot, rails[j][1])
                x, w = i, d + 1
                used.add(j)
                break
        used.add(i)
        x = max(0, min(TW - w, x))
        shafts.append({"x": x, "w": w,
                       "y0": 0 if top <= 3 else top,
                       "y1": TH if bot >= TH - 6 else bot})

    # --- structure: everything else with enough ink. A cell is a wall Dan
    #     collides with when it sits in a horizontal run of three or more -
    #     blocks, steps and ledges. Thinner uprights - door frames, pillars,
    #     rockets, aerials - are scenery he walks in front of.
    solid = (frac >= STRUCT_MIN) & ~band
    for s in shafts:
        solid[s["y0"]:s["y1"], s["x"]:s["x"] + s["w"]] = False
    solid[:2, :] &= ~band[:2, :]
    cls = np.where(solid, DECOR, EMPTY)
    cls[band] = BAND
    wall = np.zeros((TH, TW), bool)
    for j in range(TH):
        for a, b in runs(solid[j], 3):
            wall[j, a:b] = True
    cls[wall] = WALL
    for s in shafts:
        cls[s["y0"]:s["y1"], s["x"]:s["x"] + s["w"]] = FIELD
        cls[s["y0"]:s["y1"], s["x"]] = RAIL
        cls[s["y0"]:s["y1"], s["x"] + s["w"] - 1] = RAIL

    # --- the floor: continuous across its own pattern; a real hole is two or
    #     more cells missing from both courses
    floor = band[TH - 2] | band[TH - 1]
    for i in range(1, TW - 1):
        if not floor[i] and floor[i - 1] and floor[i + 1]:
            floor[i] = True
    holes = runs(~floor, 2)

    # --- platforms: the floor, and the tops of walls
    top = wall.copy()
    top[1:, :] &= ~wall[:-1, :]
    top[0, :] = False
    platforms = [{"y": TH - 2, "x0": a, "x1": b} for (a, b) in runs(floor, 1)]
    platforms += [{"y": j, "x0": a, "x1": b}
                  for j in range(2, TH - 2) for (a, b) in runs(top[j], 2)]

    # --- openings in the room's own edges: a platform running to the edge
    #     with headroom above it
    def edge(col, near):
        walled = int(wall[2:TH - 2, col].sum() >= 7)
        open_rows = []
        for p in platforms:
            if (p["x0"] <= 1 if near == "left" else p["x1"] >= TW - 1):
                if not wall[max(0, p["y"] - 4):p["y"], col].any():
                    open_rows.append(p["y"])
        return {"wall": walled, "open": sorted(set(open_rows))}

    return {
        "cells": "".join(str(int(v)) for v in cls.reshape(-1)),
        "platforms": platforms,
        "shafts": shafts,
        "holes": [[a, b] for a, b in holes],
        "left": edge(0, "left"),
        "right": edge(TW - 1, "right"),
        "colours": reader.band_colours(r, c),
    }


def plan_doors(rooms):
    """Build the connection graph.

    The montage lays each area of the asteroid out as a block of the grid, and
    within a block the rooms sit in their relative positions, so a boundary
    that is open on both sides is read as a doorway, a lift shaft that reaches
    the floor of one room and the ceiling of the room below is read as one
    lift, and a hole in a floor with a room beneath is a drop. Blocks are not
    joined to each other by the image, so the fewest usable extra doors are
    generated to make one building, and reported as such.
    """
    S = set(rooms)
    natural, generated = [], []

    def col(k):
        return int(k.split(",")[1])

    def shaft_pairs(a, b):
        """Shafts of a (above) and b (below) that line up across the boundary."""
        out = []
        for s in rooms[a]["shafts"]:
            if s["y1"] < TH:
                continue
            for t in rooms[b]["shafts"]:
                if t["y0"] <= 0 and abs(s["x"] - t["x"]) <= 1:
                    out.append((s, t))
        return out

    for (r, c) in [tuple(map(int, k.split(","))) for k in S]:
        me = f"{r},{c}"
        right = f"{r},{c + 1}"
        if right in S:
            a, b = rooms[me]["right"], rooms[right]["left"]
            if set(a["open"]) & set(b["open"]):
                natural.append([me, right, "side"])
        down = f"{r + 1},{c}"
        if down in S:
            if shaft_pairs(me, down):
                natural.append([me, down, "shaft"])
            elif rooms[me]["holes"]:
                natural.append([me, down, "drop"])
        elif rooms[me]["holes"]:
            # a hole with nothing under it: close the floor, Dan cannot fall
            # into a room that does not exist
            fill_holes(rooms[me])

    def reachable(links):
        graph = {}
        for a, b, kind in links:
            graph.setdefault(a, set()).add(b)
            if kind != "drop":              # a drop is one way
                graph.setdefault(b, set()).add(a)
        seen, q = {start}, deque([start])
        while q:
            for nxt in graph.get(q.popleft(), ()):
                if nxt not in seen:
                    seen.add(nxt); q.append(nxt)
        return seen

    # A generated door is only worth anything if Dan can use it: a doorway
    # needs the floor open to the edge on both sides, a lift needs a shaft.
    def usable(a, b, kind):
        if kind == "side":
            left, right = (a, b) if col(a) < col(b) else (b, a)
            return TH - 2 in rooms[left]["right"]["open"] and TH - 2 in rooms[right]["left"]["open"]
        up, dn = (a, b) if int(a.split(",")[0]) < int(b.split(",")[0]) else (b, a)
        return half_shaft(up, dn) is not None

    def half_shaft(up, dn):
        for s in rooms[up]["shafts"]:
            if s["y1"] >= TH:
                return s["x"]
        for s in rooms[dn]["shafts"]:
            if s["y0"] <= 0:
                return s["x"]
        return None

    start = min(S, key=lambda k: tuple(map(int, k.split(","))))
    got = reachable(natural)
    while len(got) < len(S):
        best = None
        for k in sorted(got):
            r, c = map(int, k.split(","))
            for dr, dc, kind in ((0, 1, "side"), (0, -1, "side"),
                                 (1, 0, "shaft"), (-1, 0, "shaft")):
                n = f"{r + dr},{c + dc}"
                if n in S and n not in got and usable(k, n, kind):
                    cost = 0 if kind == "side" else 1
                    if best is None or cost < best[0]:
                        best = (cost, k, n, kind)
        if best is None:
            break
        _, k, n, kind = best
        if kind == "shaft":
            up, dn = (k, n) if int(k.split(",")[0]) < int(n.split(",")[0]) else (n, k)
            x = half_shaft(up, dn)
            extend_shaft(rooms[up], x)
            extend_shaft(rooms[dn], x)
            generated.append([up, dn, kind])
        else:
            generated.append([k, n, kind])
        got = reachable(natural + generated)

    return natural, generated, len(got), start


def fill_holes(room):
    room["holes"] = []
    floor = [p for p in room["platforms"] if p["y"] == TH - 2]
    rest = [p for p in room["platforms"] if p["y"] != TH - 2]
    if floor:
        room["platforms"] = rest + [{"y": TH - 2, "x0": min(p["x0"] for p in floor),
                                     "x1": max(p["x1"] for p in floor)}]
    cells = list(room["cells"])
    for i in range(room["platforms"][-1]["x0"], room["platforms"][-1]["x1"]):
        for j in (TH - 2, TH - 1):
            if cells[j * TW + i] == str(EMPTY):
                cells[j * TW + i] = str(BAND)
    room["cells"] = "".join(cells)


def extend_shaft(room, x, w=4):
    """Run a lift the full height of a room, in the data and in the picture."""
    for s in room["shafts"]:
        if abs(s["x"] - x) <= 1:
            s["y0"], s["y1"] = 0, TH
            x, w = s["x"], s["w"]
            break
    else:
        room["shafts"].append({"x": x, "w": w, "y0": 0, "y1": TH})
        room["shafts"].sort(key=lambda s: s["x"])
    cells = list(room["cells"])
    for j in range(TH):
        for i in range(x, x + w):
            cells[j * TW + i] = str(FIELD)
        cells[j * TW + x] = str(RAIL)
        cells[j * TW + x + w - 1] = str(RAIL)
    room["cells"] = "".join(cells)


def colour_signature(colours):
    merge = {"dcyan": "cyan", "dblue": "blue", "bwhite": "white"}
    return tuple(sorted({merge.get(x, x) for x in colours[:2]}))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("map", nargs="?")
    ap.add_argument("-o", "--out", default="level.json")
    args = ap.parse_args()

    reader = MapReader(load_map(args.map))
    rooms = {}
    for r in range(reader.rows):
        for c in range(reader.cols):
            if reader.is_room(r, c):
                rooms[f"{r},{c}"] = read_room(reader, r, c)

    sigs, sectors = {}, []
    for key in sorted(rooms):
        sig = colour_signature(rooms[key]["colours"])
        if sig not in sigs:
            sigs[sig] = len(sectors)
            sectors.append(list(sig))
        rooms[key]["sector"] = sigs[sig]

    natural, generated, reached, start = plan_doors(rooms)

    # Mark what the finished graph can actually reach, so the game never puts a
    # key, a cell or the self-destruct room somewhere Dan cannot get to.
    graph = {}
    for a, b, kind in natural + generated:
        graph.setdefault(a, set()).add(b)
        if kind != "drop":
            graph.setdefault(b, set()).add(a)
    seen, q = {start}, deque([start])
    while q:
        for nxt in graph.get(q.popleft(), ()):
            if nxt not in seen:
                seen.add(nxt); q.append(nxt)
    for key in rooms:
        rooms[key]["reach"] = 1 if key in seen else 0

    level = {
        "source": MAP_URL,
        "grid": {"rows": reader.rows, "cols": reader.cols},
        "room": {"w": TW, "h": TH, "cell": CS},
        "sectors": sectors,
        "start": start,
        "links": natural + generated,
        "generatedLinks": len(generated),
        "rooms": rooms,
    }
    with open(args.out, "w") as f:
        json.dump(level, f, separators=(",", ":"))
    js = os.path.join(os.path.dirname(args.out) or ".", "js", "level.js")
    if os.path.isdir(os.path.dirname(js)):
        with open(js, "w") as f:
            f.write("window.DANDARE_LEVEL=")
            json.dump(level, f, separators=(",", ":"))
            f.write(";\n")
    print(f"{len(rooms)} rooms, {len(sectors)} sectors; "
          f"{len(natural)} connections read from the map, "
          f"{len(generated)} generated to join the rest; "
          f"{reached}/{len(rooms)} reachable -> {args.out} "
          f"({os.path.getsize(args.out)/1024:.0f} kB)", file=sys.stderr)


if __name__ == "__main__":
    main()
