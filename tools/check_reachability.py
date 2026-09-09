#!/usr/bin/env python3
"""Check the extracted level can actually be played through.

Walks the level graph the way Dan moves - along floors, off screen edges, down
through holes in a floor, and up or down grav-lift shafts that reach a screen
edge - and reports how much of the map is reachable from the landing point.

A screen is split into bays by floor-to-ceiling walls, so a bay (not a whole
screen) is the unit of movement.

Usage: python3 tools/check_reachability.py level.json [--start 0,3]
"""
import argparse
import json
from collections import deque


def load(path):
    lv = json.load(open(path))
    return lv, lv["room"]["w"], lv["room"]["h"], lv["rooms"]


def full_walls(rm, RW, RH):
    return sorted(w["x"] for w in rm["walls"]
                  if w.get("b") and 0 < w["x"] < RW - 1 and w["y0"] <= 1 and w["y1"] >= RH - 1)


def bays(rm, RW, RH):
    out, prev = [], 0
    for x in full_walls(rm, RW, RH):
        if x > prev:
            out.append((prev, x))
        prev = x + 1
    if prev < RW:
        out.append((prev, RW))
    return out


def bay_index(rm, x, RW, RH):
    for i, (a, b) in enumerate(bays(rm, RW, RH)):
        if a <= x < b:
            return i
    return None


def floor_gaps(rm, a, b, RH):
    """Columns in [a,b) with no floor near the bottom: Dan falls through."""
    covered = set()
    for p in rm["platforms"]:
        if p["y"] >= RH - 4:
            covered.update(range(max(a, p["x0"]), min(b, p["x1"])))
    return [x for x in range(a, b) if x not in covered]


def reachable(rooms, RW, RH, start_key):
    def node(r, c, x):
        rm = rooms.get(f"{r},{c}")
        if not rm:
            return None
        i = bay_index(rm, x, RW, RH)
        return None if i is None else (r, c, i)

    sr, sc = map(int, start_key.split(","))
    first = node(sr, sc, RW // 2) or node(sr, sc, 1)
    seen, q = {first}, deque([first])
    while q:
        r, c, bi = q.popleft()
        rm = rooms[f"{r},{c}"]
        bs = bays(rm, RW, RH)
        if bi >= len(bs):
            continue
        a, b = bs[bi]
        nbrs = []
        if a == 0:
            nbrs.append(node(r, c - 1, RW - 2))
        if b == RW:
            nbrs.append(node(r, c + 1, 1))
        for l in rm["lifts"]:
            if a <= l["x"] < b:
                if l["y0"] <= 0:
                    nbrs.append(node(r - 1, c, l["x"]))
                if l["y1"] >= RH:
                    nbrs.append(node(r + 1, c, l["x"]))
        for x in floor_gaps(rm, a, b, RH)[:1]:
            nbrs.append(node(r + 1, c, x))
        for nb in nbrs:
            if nb and nb not in seen:
                seen.add(nb)
                q.append(nb)
    return seen


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("level", nargs="?", default="level.json")
    ap.add_argument("--start", default="0,3")
    ap.add_argument("--targets", default="")
    args = ap.parse_args()

    lv, RW, RH, rooms = load(args.level)
    seen = reachable(rooms, RW, RH, args.start)
    got = {(r, c) for r, c, _ in seen}
    print(f"reachable screens: {len(got)} of {len(rooms)}  ({100 * len(got) // len(rooms)}%)")

    missing = [k for k in rooms if tuple(map(int, k.split(","))) not in got]
    if missing:
        print("unreachable:", " ".join(sorted(missing)[:20]),
              "..." if len(missing) > 20 else "")
    for t in filter(None, args.targets.split(",")):
        rc = tuple(map(int, t.split(":")))
        print(f"  {t}: {'reachable' if rc in got else 'UNREACHABLE'}")
    return 0 if len(got) * 2 >= len(rooms) else 1


if __name__ == "__main__":
    raise SystemExit(main())
