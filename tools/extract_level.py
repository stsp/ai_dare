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

STRUCT_MIN = 0.30
GREEN_MIN = 0.08
SHAFT_MIN_CELLS = 4
SHAFT_MIN_SPAN = 5

# cell classes emitted for drawing
EMPTY, SOLID, SHAFT, BAND = 0, 1, 2, 3


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


def read_room(reader, r, c):
    struct, green = reader.masks(r, c)
    solid = struct >= STRUCT_MIN

    # --- grav-lift shafts: green columns. The floor band is drawn over the
    #     last rows of a shaft, so a shaft reaching the band counts as full.
    shafts = {}
    gmask = green >= GREEN_MIN
    for i in range(TW):
        hit = np.flatnonzero(gmask[:, i])
        if len(hit) >= SHAFT_MIN_CELLS and hit[-1] - hit[0] >= SHAFT_MIN_SPAN:
            top, bot = int(hit[0]), int(hit[-1]) + 1
            shafts[i] = (0 if top <= 1 else top, TH if bot >= TH - 3 else bot)

    # --- per-cell classes, for drawing the room as the map shows it ---
    cls = np.where(solid, SOLID, EMPTY)
    cls[TH - 2:, :][solid[TH - 2:, :]] = BAND      # the floor band
    for i, (a, b) in shafts.items():
        cls[a:b, i] = SHAFT

    # --- floors Dan stands on: solid cell with open space above ---
    standable = solid.copy()
    standable[1:, :] &= ~solid[:-1, :]
    standable[0, :] = False
    for i in shafts:
        standable[:, i] = False
    platforms = [{"y": j, "x0": a, "x1": b}
                 for j in range(TH) for (a, b) in runs(standable[j], 3)]

    # --- the room's own side walls, and any gap in them ---
    def edge(col):
        walled = bool(solid[:, col].mean() >= 0.5)
        gaps = [g for g in runs(~solid[:, col], 3)]
        return {"wall": 1 if walled else 0, "gaps": gaps}

    return {
        "cells": "".join(str(int(v)) for v in cls.reshape(-1)),
        "platforms": platforms,
        "shafts": [{"x": i, "y0": a, "y1": b} for i, (a, b) in sorted(shafts.items())],
        "left": edge(0),
        "right": edge(TW - 1),
        "colours": reader.band_colours(r, c),
    }


def plan_doors(rooms):
    """Generate the connection graph.

    The map does not describe one, so this builds it: start from the boundaries
    that really are open in the image, then open the fewest extra ones needed to
    join every room into a single building. Everything it adds is reported as a
    generated door, so the game can say which connections are the map's and
    which are ours.
    """
    S = set(rooms)
    natural, generated = [], []

    def shaft_link(a, b):
        up = {s["x"] for s in rooms[a]["shafts"] if s["y1"] >= TH}
        dn = {s["x"] for s in rooms[b]["shafts"] if s["y0"] <= 0}
        return sorted(up & dn)

    def floor_hole(a):
        cells = rooms[a]["cells"]
        bottom = [cells[(TH - 1) * TW + i] for i in range(TW)]
        return [i for i, v in enumerate(bottom) if v == "0"]

    for (r, c) in [tuple(map(int, k.split(","))) for k in S]:
        me = f"{r},{c}"
        right = f"{r},{c + 1}"
        if right in S:
            a, b = rooms[me]["right"], rooms[right]["left"]
            open_rows = ({y for g in a["gaps"] for y in range(*g)} &
                         {y for g in b["gaps"] for y in range(*g)})
            if open_rows or (not a["wall"] and not b["wall"]):
                natural.append([me, right, "side"])
        down = f"{r + 1},{c}"
        if down in S:
            if shaft_link(me, down):
                natural.append([me, down, "shaft"])
            elif floor_hole(me):
                natural.append([me, down, "drop"])

    # Reachability has to be measured the way the game moves: a drop is one
    # way, because Dan cannot climb back up a hole he fell through. Counting
    # drops as two-way here would report a connected map that is not one.
    def reachable(links):
        graph = {}
        for a, b, kind in links:
            graph.setdefault(a, set()).add(b)
            if kind != "drop":
                graph.setdefault(b, set()).add(a)
        seen, q = {start}, deque([start])
        while q:
            for nxt in graph.get(q.popleft(), ()):
                if nxt not in seen:
                    seen.add(nxt); q.append(nxt)
        return seen

    # A generated link is only worth anything if Dan can actually use it: a
    # doorway needs a floor running to the room edge on both sides, and a
    # vertical link needs a real shaft to ride. Generating one without that
    # gives a graph that claims to be connected while the player is stuck.
    def walks_to_edge(key, side):
        # The outermost cell is usually the wall itself, so a floor that stops
        # one cell short still puts Dan against the boundary.
        if side == "left":
            return any(p["x0"] <= 2 for p in rooms[key]["platforms"])
        return any(p["x1"] >= TW - 2 for p in rooms[key]["platforms"])

    def half_shaft(a, b):
        """A shaft column reaching the boundary in one of the two rooms.

        Going up is what the map is short of: shafts exist but rarely line up
        across a boundary. Where one room already has a shaft at the boundary,
        the generator extends it into its neighbour - the same move the game
        itself makes with grav-lifts - rather than inventing a new mechanic.
        """
        for s in rooms[a]["shafts"]:
            if s["y1"] >= TH:
                return s["x"]
        for s in rooms[b]["shafts"]:
            if s["y0"] <= 0:
                return s["x"]
        return None

    def extend_shaft(key, col):
        """Run a shaft down the full height of a room, in cells and in data."""
        room = rooms[key]
        if any(s["x"] == col and s["y0"] <= 0 and s["y1"] >= TH for s in room["shafts"]):
            return
        room["shafts"] = [s for s in room["shafts"] if s["x"] != col]
        room["shafts"].append({"x": col, "y0": 0, "y1": TH})
        room["shafts"].sort(key=lambda s: s["x"])
        cells = list(room["cells"])
        for j in range(TH):
            cells[j * TW + col] = str(SHAFT)
        room["cells"] = "".join(cells)
        room["platforms"] = [p for p in room["platforms"]
                             if not (p["x0"] <= col < p["x1"])] + \
            [q for p in room["platforms"] if p["x0"] <= col < p["x1"]
             for q in ({"y": p["y"], "x0": p["x0"], "x1": col},
                       {"y": p["y"], "x0": col + 1, "x1": p["x1"]})
             if q["x1"] - q["x0"] >= 3]

    def usable(a, b, kind):
        if kind == "side":
            left, right = (a, b) if int(a.split(",")[1]) < int(b.split(",")[1]) else (b, a)
            return walks_to_edge(left, "right") and walks_to_edge(right, "left")
        return half_shaft(a, b) is not None

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
                    cost = 0 if kind == "side" else 1     # prefer a doorway
                    if best is None or cost < best[0]:
                        best = (cost, k, n, kind)
        if best is None:
            break            # nothing left that Dan could actually walk or ride
        _, k, n, kind = best
        if kind == "shaft":
            col = half_shaft(k, n)
            extend_shaft(k, col)
            extend_shaft(n, col)
        generated.append([k, n, kind])
        got = reachable(natural + generated)

    return natural, generated, len(got), start


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

    merge = {"dcyan": "cyan", "dblue": "blue", "bwhite": "white"}
    sigs, sectors = {}, []
    for key in sorted(rooms):
        sig = tuple(sorted({merge.get(x, x) for x in rooms[key]["colours"][:2]}))
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
