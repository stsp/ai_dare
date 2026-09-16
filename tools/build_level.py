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
import sys
from collections import defaultdict

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from extract_level import ArrayReader, read_room, colour_signature   # noqa: E402
from match_rooms import render_scr                                   # noqa: E402

TW, TH = 30, 18


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("graph", nargs="+",
                    help="survey graphs in order: from a fresh start, then after one part fitted, ...")
    ap.add_argument("--match", required=True)
    ap.add_argument("--geometry", default="level_map.json")
    ap.add_argument("--parts", default="",
                    help="rooms holding the parts, in order, e.g. 83,...")
    ap.add_argument("--slot", default="143", help="the self-destruct room")
    ap.add_argument("--screens", default="data/emu",
                    help="where the surveyed screens are; a room the map does not show "
                         "takes its geometry from its own screen")
    ap.add_argument("--exclude", default="",
                    help="room numbers that are not rooms: the capture sequence, for one")
    ap.add_argument("-o", "--out", default="level.json")
    args = ap.parse_args()

    # Later surveys were made after more parts of the mechanism were fitted;
    # a link or room first seen in survey n needs n parts. Merge them, tagging
    # each edge and node with the phase it first appeared in.
    graphs = [json.load(open(f)) for f in args.graph]
    g = {"nodes": {}, "edges": []}
    seen_edges = set()
    for phase, gp in enumerate(graphs):
        for k, v in gp["nodes"].items():
            if k not in g["nodes"]:
                g["nodes"][k] = dict(v, phase=phase)
        for e in gp["edges"]:
            sig = (e["from"], e["via"], e["to"], e.get("x0"), e.get("x1"))
            if sig in seen_edges:
                continue
            seen_edges.add(sig)
            g["edges"].append(dict(e, phase=phase))
    match = {int(k): v for k, v in json.load(open(args.match)).items()}
    geo = json.load(open(args.geometry))

    exclude = {int(x) for x in args.exclude.split(",") if x}
    rooms = {}
    for node in g["nodes"].values():
        n = node["room"]
        if n in rooms or n in exclude:
            continue
        m = match.get(n)
        scr = os.path.join(args.screens, f"room_{n}.scr")
        if m and (m["score"] >= 0.6 or "chain" in m):
            src = geo["rooms"][m["key"]]
            where = m["key"]
        elif os.path.exists(scr):
            # not on the map: read the room off the screen the survey dumped
            img = render_scr(open(scr, "rb").read())[8:8 + 144, 8:8 + 240]
            src = read_room(ArrayReader(img), 0, 0)
            sig = list(colour_signature(src["colours"]))
            if sig not in geo["sectors"]:
                geo["sectors"].append(sig)
            src["sector"] = geo["sectors"].index(sig)
            where = "screen"
        else:
            print(f"room {n}: no map match and no screen, skipped")
            continue
        rooms[str(n)] = {
            "map": where, "sector": src["sector"], "colours": src["colours"],
            "cells": src["cells"], "platforms": src["platforms"],
            "shafts": src["shafts"], "holes": src["holes"],
            # the game's own numbering: the surface, then sector 1, 2, ... in
            # the order the doors open (the survey that first reached the room)
            "zone": 0 if where.startswith("0,") else node["phase"] + 1,
        }
    # a door between sectors: the move into a room that a later survey first
    # reached needs as many parts fitted as that survey had; moves within a
    # sector, and back out of it, are open
    needs = {}
    for e in g["edges"]:
        a, b = e["from"].split(":")[0], e["to"].split(":")[0]
        if a != b and a in rooms and b in rooms and rooms[a]["zone"] < rooms[b]["zone"] and e["phase"] > 0:
            needs[(a, b)] = min(needs.get((a, b), 99), e["phase"])

    def room_of(node_key):
        return node_key.split(":")[0]

    # Upper floors the original walked along. Where Dan walked out of a room
    # at an upper level and arrived in the next at the same level, that
    # walkway runs the room's full width, whatever gaps the map shows in it
    # (the map's picture of it is not what the game collides with).
    bucket = lambda k: int(k.split(":")[1])
    for k, node in g["nodes"].items():
        b = bucket(k)
        room = str(node["room"])
        if b > 5 or room not in rooms:
            continue
        crossed = any(e["from"] == k and e["via"] in ("left", "right") and
                      room_of(e["to"]) != room and bucket(e["to"]) == b
                      for e in g["edges"])
        if not crossed:
            continue
        feet = (TH - 2) * 8 - (7 - b) * 16
        plats = rooms[room]["platforms"]
        near = [p["y"] for p in plats if abs(p["y"] * 8 - feet) <= 12]
        row = min(near, key=lambda y: abs(y * 8 - feet)) if near else feet // 8
        rooms[room]["platforms"] = [p for p in plats if p["y"] != row] + [{"y": row, "x0": 0, "x1": TW}]
        rooms[room]["platforms"].sort(key=lambda p: (p["y"], p["x0"]))
        cells = list(rooms[room]["cells"])
        for i in range(TW):                     # draw the walkway where the map left a gap
            if cells[row * TW + i] == "0":
                cells[row * TW + i] = "4"
        rooms[room]["cells"] = "".join(cells)

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
            # a ride tried over a hole in the floor is a fall, not a lift; a
            # "ride" that left Dan on the floor he started from was a jump
            if any(h0 <= e["x0"] <= h1 or h0 <= e["x1"] <= h1 for h0, h1 in rooms[a]["holes"]):
                continue
            if a == b and e["from"].split(":")[1] == e["to"].split(":")[1]:
                continue
            # the floor the ride was called from: the original's y for Dan
            # standing there (123 on a room's floor, less on an upper one)
            floor = g["nodes"][e["from"]]["y"] // 16
            z = zones[(a, b, via, floor)]
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
            if needs.get((a, b), 0):
                links[-1]["needs"] = needs[(a, b)]
    for (a, b, via, floor), (x0, x1) in sorted(zones.items()):
        # a ride tried at the very edge that merely walked into the next room,
        # or beside a hole that Dan simply fell through
        if (x0 <= 0 or x1 >= TW - 1) and b in walks[(a, "left" if x0 <= 0 else "right")]:
            continue
        if b in walks[(a, "drop")]:
            continue
        # feet height, in the recreation's pixels, of the floor it is called
        # from: the original's floor (y 123) is the room's bottom course. A
        # call recorded from mid-air - Dan caught in the field after a fall -
        # has no floor at that height in the room, and is not a lift a player
        # can take
        feet = (TH - 2) * 8 - (7 - floor) * 16
        if not any(abs(p["y"] * 8 - feet) <= 14 and p["x1"] >= x0 - 3 and p["x0"] <= x1 + 4
                   for p in rooms[a]["platforms"]):
            continue
        links.append({"from": a, "to": b, "kind": via, "x0": x0, "x1": x1, "feet": feet})
        if a != b and needs.get((a, b), 0):
            links[-1]["needs"] = needs[(a, b)]

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
    # the self-destruct mechanism is fitted by walking to the left of its room
    # in front of it: at floor level the machine is scenery, not a wall
    if args.slot in rooms:
        cells = list(rooms[args.slot]["cells"])
        for j in range(TH - 8, TH - 3):
            for i in range(TW):
                if cells[j * TW + i] == "4":
                    cells[j * TW + i] = "1"
        rooms[args.slot]["cells"] = "".join(cells)
        rooms[args.slot]["platforms"] = [p for p in rooms[args.slot]["platforms"] if p["y"] >= TH - 3 or p["y"] < TH - 8]

    parts = [p for p in args.parts.split(",") if p]
    level = {
        "source": geo.get("source"),
        "room": geo["room"],
        "sectors": geo["sectors"],
        "start": start,
        "explored": len(rooms),
        "links": links,
        "rooms": rooms,
        "parts": [{"room": p} for p in parts if p in rooms],
        "slot": args.slot if args.slot in rooms else None,
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
    gated = sum(1 for l in links if l.get("needs"))
    print(f"{len(rooms)} rooms from {len(graphs)} survey(s), {len(links)} links {dict(kinds)}, "
          f"{gated} behind doors, {len(level['parts'])} parts -> {args.out}")


if __name__ == "__main__":
    main()
