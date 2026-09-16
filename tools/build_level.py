#!/usr/bin/env python3
"""Assemble the level the game plays from what the original game showed us.

    python3 tools/build_level.py GRAPH.json MATCH.json [--geometry level_map.json]
                                 [-o level.json]

GRAPH.json is the room graph recorded by playing the original in an emulator
(every walk, fall and lift ride Dan could make from the start, room by room).
MATCH.json says which room of the speccy.cz map each of those rooms is, so
its geometry - floors, walls, rails, holes - comes from the map extraction in
level_map.json. Rooms the original never let Dan reach are left out: nothing
here is generated.

Links carry what the emulator recorded: `right`/`left` for walking off an
edge, `drop` for a hole in the floor (with the hole's cells), `up`/`down` for
a lift ride (with the cells Dan stands on to ride it; the original wants him
just left of the rails). A lift link may lead back into the same room: that
is a ride between its floors.
"""
import argparse
import json
import os
from collections import defaultdict

TW, TH = 30, 18


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("graph")
    ap.add_argument("match")
    ap.add_argument("--geometry", default="level_map.json")
    ap.add_argument("-o", "--out", default="level.json")
    args = ap.parse_args()

    g = json.load(open(args.graph))
    match = {int(k): v for k, v in json.load(open(args.match)).items()}
    geo = json.load(open(args.geometry))

    rooms = {}
    for node in g["nodes"].values():
        n = node["room"]
        if n in rooms:
            continue
        m = match.get(n)
        if not m:
            print(f"room {n}: no map match, skipped")
            continue
        src = geo["rooms"][m["key"]]
        rooms[str(n)] = {
            "map": m["key"], "sector": src["sector"], "colours": src["colours"],
            "cells": src["cells"], "platforms": src["platforms"],
            "shafts": src["shafts"], "holes": src["holes"],
        }

    def room_of(node_key):
        return node_key.split(":")[0]

    walks = defaultdict(set)              # (from, kind) -> targets by walking
    zones = defaultdict(lambda: [TW, -1])  # (from, to, kind) -> [x0, x1]
    for e in g["edges"]:
        a, b, via = room_of(e["from"]), room_of(e["to"]), e["via"].rstrip("*")
        if a not in rooms or b not in rooms:
            continue
        arr = e.get("arrive", {})
        if via in ("right", "left"):
            if a == b:
                continue
            edge_entry = arr.get("x", 0) <= 3 if via == "right" else arr.get("x", 29) >= 26
            if edge_entry:
                walks[(a, via)].add(b)
            else:
                # Dan walked off a hole and fell: a drop, over the room's holes
                walks[(a, "drop")].add(b)
        else:
            # a ride tried over a hole in the floor is a fall, not a lift
            if any(h0 <= e["x0"] <= h1 or h0 <= e["x1"] <= h1 for h0, h1 in rooms[a]["holes"]):
                continue
            z = zones[(a, b, via)]
            z[0], z[1] = min(z[0], e["x0"]), max(z[1], e["x1"])

    links = []
    for (a, via), targets in sorted(walks.items()):
        for b in sorted(targets):
            if via == "drop":
                holes = rooms[a]["holes"] or [[0, TW]]
                for x0, x1 in holes:
                    links.append({"from": a, "to": b, "kind": "drop", "x0": x0, "x1": x1})
            else:
                links.append({"from": a, "to": b, "kind": via})
    for (a, b, via), (x0, x1) in sorted(zones.items()):
        # a ride tried at the very edge that merely walked into the next room,
        # or beside a hole that Dan simply fell through
        if (x0 <= 0 or x1 >= TW - 1) and b in walks[(a, "left" if x0 <= 0 else "right")]:
            continue
        if b in walks[(a, "drop")]:
            continue
        links.append({"from": a, "to": b, "kind": via, "x0": x0, "x1": x1})

    # a doorway the game let Dan through is open, whatever the map's frame
    # around it looks like: clear wall cells at the edge, floor to head height
    for l in links:
        if l["kind"] not in ("left", "right"):
            continue
        cells = list(rooms[l["from"]]["cells"])
        cols = (0, 1) if l["kind"] == "left" else (TW - 2, TW - 1)
        for j in range(TH - 7, TH - 2):
            for i in cols:
                if cells[j * TW + i] == "4":
                    cells[j * TW + i] = "1"
        rooms[l["from"]]["cells"] = "".join(cells)

    start = str(g["nodes"][next(iter(g["nodes"]))]["room"])
    level = {
        "source": geo.get("source"),
        "room": geo["room"],
        "sectors": geo["sectors"],
        "start": start,
        "explored": len(rooms),
        "links": links,
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
    kinds = defaultdict(int)
    for l in links:
        kinds[l["kind"]] += 1
    print(f"{len(rooms)} rooms from the emulator, {len(links)} links {dict(kinds)} -> {args.out}")


if __name__ == "__main__":
    main()
