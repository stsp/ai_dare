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
    ap.add_argument("--floors", default="data/emu/floor.json",
                    help="floor probe: where Dan stood and where he fell, walking from each node")
    ap.add_argument("--prisons", default="50,53",
                    help="the prison rooms: where a capture puts Dan, not somewhere he walked")
    ap.add_argument("--doors", default="",
                    help="doors known from the walkthrough but not yet surveyed, as "
                         "room:side:parts, e.g. 209:right:2 - drawn shut until surveyed")
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
    # rooms a ride or a fall passed through exist too: they are read from the
    # screen dumped in passing, and joined by links the shaft does not stop at
    passed = {}
    for e in g["edges"]:
        for r in e.get("through", []):
            passed.setdefault(str(r), e["phase"])
    for n, phase in passed.items():
        if n in rooms or int(n) in exclude:
            continue
        scr = os.path.join(args.screens, f"room_{n}.scr")
        m = match.get(int(n))
        if m and (m["score"] >= 0.6 or "chain" in m):
            src, where = geo["rooms"][m["key"]], m["key"]
        elif os.path.exists(scr):
            img = render_scr(open(scr, "rb").read())[8:8 + 144, 8:8 + 240]
            src = read_room(ArrayReader(img), 0, 0)
            sig = list(colour_signature(src["colours"]))
            if sig not in geo["sectors"]:
                geo["sectors"].append(sig)
            src["sector"] = geo["sectors"].index(sig)
            where = "screen"
        else:
            continue
        rooms[n] = {"map": where, "sector": src["sector"], "colours": src["colours"],
                    "cells": src["cells"], "platforms": src["platforms"], "shafts": src["shafts"],
                    "holes": src["holes"], "zone": phase + 1, "passed": True}

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

    # Floors and pits as Dan found them walking: the cells he stood on at each
    # height, and the cell the floor dropped from under him. The picture of a
    # pit says nothing about its edges; this does. A pit runs from the cell he
    # fell from to the next cell he was seen standing on, or the room's edge -
    # and no further than a jump where the survey saw him jump it.
    if os.path.exists(args.floors):
        probe = json.load(open(args.floors))
        stood, falls = defaultdict(lambda: defaultdict(set)), defaultdict(lambda: defaultdict(list))
        for node, walks in probe.items():
            room, b = node.split(":")
            if room not in rooms:
                continue
            for direction, trace in walks.items():
                base = trace[0][1]
                # a node caught in mid-fall is no floor: he has to have walked
                # at least a cell at this height before anything counts
                walked = {x for x, y in trace if x != "room" and abs(y - base) <= 1}
                if len(walked) < 4:
                    continue
                for (x, y) in trace:
                    if x == "room":
                        break
                    if y > base + 2:
                        falls[room][base].append((x, direction))
                        break
                    if abs(y - base) <= 1:
                        stood[room][base].add(x)
        prisons = set(args.prisons.split(","))
        jumped = defaultdict(set)
        for e in g["edges"]:
            # a jump that ended in a prison was a fall to his death, not a crossing
            if e["via"] in ("right~", "left~") and room_of(e["from"]) != room_of(e["to"]) and room_of(e["to"]) not in prisons:
                jumped[room_of(e["from"])].add(e["via"][:-1])
        # a node Dan cannot move from at all is where he lay unconscious after a
        # fall: that floor is a pit, and a room whose floor nodes are all such
        # has no floor - falling in is death
        dead = defaultdict(set)
        for node, walks in probe.items():
            room, b = node.split(":")
            if room in rooms and int(b) >= 7 and all(len({x for x, y in t if x != "room"}) <= 1 and t[-1][0] != "room" for t in walks.values()):
                dead[room].add(node)
        for room in dead:
            floor_nodes = [n for n in probe if n.split(":")[0] == room and int(n.split(":")[1]) >= 7]
            if all(n in dead[room] for n in floor_nodes):
                rooms[room]["platforms"] = [p for p in rooms[room]["platforms"] if p["y"] < TH - 3]
                rooms[room]["holes"] = [[0, TW]]
                stood[room] = defaultdict(set, {b: xs for b, xs in stood[room].items() if b < 120})
        for room in stood:
            for base, xs in stood[room].items():
                feet = base + 5                       # the original's y is five above the feet
                row = round(feet / 8)
                near = [p["y"] for p in rooms[room]["platforms"] if abs(p["y"] - row) <= 1]
                row = near[0] if near else row
                fell_cells = {x for x, _ in falls[room].get(base, [])}
                cells = set()
                for x in xs - fell_cells:              # Dan is two cells wide
                    cells.add(x); cells.add(x + 1)
                cells -= fell_cells
                hole_cells = set()
                for x, direction in falls[room].get(base, []):
                    if direction == "right":
                        nxt = min((c for c in cells if c > x), default=TW)
                        if "right" in jumped[room]:
                            nxt = min(nxt, x + 4)
                        hole_cells.update(range(x, nxt))
                    else:
                        prv = max((c for c in cells if c < x), default=-1)
                        if "left" in jumped[room]:
                            prv = max(prv, x - 4)
                        hole_cells.update(range(prv + 1, x + 1))
                # where he jumped a pit and walked on into the next room, the
                # floor runs from the pit's far edge to that edge of the room
                for x, direction in falls[room].get(base, []):
                    if direction == "right" and "right" in jumped[room]:
                        end = max((h for h in hole_cells if h >= x), default=x) + 1
                        cells.update(range(end, TW))
                    if direction == "left" and "left" in jumped[room]:
                        start = min((h for h in hole_cells if h <= x), default=x)
                        cells.update(range(0, start))
                # the floor at this height: what the map showed, plus what he
                # stood on, minus the pit
                base_cells = set(cells)
                for p in rooms[room]["platforms"]:
                    # a room read off its own screen is not trusted beyond what he stood on
                    if p["y"] == row and rooms[room]["map"] != "screen":
                        base_cells.update(range(p["x0"], p["x1"]))
                base_cells -= hole_cells
                pieces, run = [], []
                for x in range(TW):
                    if x in base_cells:
                        run.append(x)
                    elif run:
                        pieces.append((run[0], run[-1] + 1)); run = []
                if run:
                    pieces.append((run[0], run[-1] + 1))
                keep = [p for p in rooms[room]["platforms"] if p["y"] != row]
                if row >= TH - 3:                      # a pit cuts the step course as well
                    keep = [p for p in keep if not (p["y"] >= TH - 3 and any(h in range(p["x0"], p["x1"]) for h in hole_cells))]
                keep += [{"y": row, "x0": a, "x1": b} for a, b in pieces]
                rooms[room]["platforms"] = sorted(keep, key=lambda p: (p["y"], p["x0"]))
                if row >= TH - 3 and hole_cells:
                    hs, run = [], []
                    for x in range(TW):
                        if x in hole_cells:
                            run.append(x)
                        elif run:
                            hs.append([run[0], run[-1] + 1]); run = []
                    if run:
                        hs.append([run[0], run[-1] + 1])
                    rooms[room]["holes"] = hs

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
        a, b, via = room_of(e["from"]), room_of(e["to"]), e["via"].rstrip("*!")
        if a not in rooms or b not in rooms or e["via"].endswith("!"):
            continue
        arr = e.get("arrive", {})
        jumping = via.endswith("~")
        via = via.rstrip("~")
        if via in ("right", "left"):
            if a == b:
                continue
            edge_entry = arr.get("x", 0) <= 3 if via == "right" else arr.get("x", 29) >= 26
            if edge_entry:
                walks[(a, via)].add(b)
            elif not jumping:
                # Dan walked off a hole and fell: a drop, over the room's holes
                walks[(a, "drop")].add(b)
            # a jumping walk that ended elsewhere took a lift on the way: not a walk
        else:
            # a ride tried over a hole in the floor is a fall, not a lift; a
            # "ride" that left Dan on the floor he started from was a jump
            if any(h0 <= e["x0"] <= h1 or h0 <= e["x1"] <= h1 for h0, h1 in rooms[a]["holes"]):
                continue
            # (a ride that ends on the floor it started from is the broken lift:
            # it climbs to its stop, breaks, and drops him back - kept)
            # the floor the ride was called from: the original's y for Dan
            # standing there (123 on a room's floor, less on an upper one)
            floor = g["nodes"][e["from"]]["y"] // 16
            stop = e.get("arrive", {}).get("y", 123) // 16     # where the ride stopped
            chain = [a] + [str(r) for r in e.get("through", []) if str(r) in rooms] + [b]
            if len(chain) > 2:
                for i in range(len(chain) - 1):
                    last = i == len(chain) - 2
                    z = zones[(chain[i], chain[i + 1], via, floor if i == 0 else 7, stop if last else -1)]
                    z[0], z[1] = min(z[0], e["x0"]), max(z[1], e["x1"])
                continue
            z = zones[(a, b, via, floor, stop)]
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
    for (a, b, via, floor, stop), (x0, x1) in sorted(zones.items()):
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
        # ... and the floor the ride stops at, in the room it arrives in: the
        # original passes every other floor on the way
        stop_feet = -1 if stop < 0 else (TH - 2) * 8 - (7 - stop) * 16   # -1: passes through
        if stop >= 0 and a == b and abs(stop_feet - feet) < 16:
            # the broken lift: it breaks at the height another ride in this
            # shaft stopped at, and Dan drops back to where he called it
            others = [z[4] for z in zones if z[1] == a and abs(((TH - 2) * 8 - (7 - z[4]) * 16) - feet) >= 16]
            stop_feet = (TH - 2) * 8 - (7 - others[0]) * 16 if others else 48
        links.append({"from": a, "to": b, "kind": via, "x0": x0, "x1": x1, "feet": feet,
                      "stop": stop_feet, **({"broken": True} if a == b and abs(stop_feet - feet) >= 16 and not any(
                          abs(p["y"] * 8 - stop_feet) <= 14 for p in rooms[a]["platforms"]) else {})})
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

    doors = []
    for d in args.doors.split(","):
        if not d:
            continue
        room, side, n = d.split(":")
        if room in rooms and not any(l["from"] == room and l["kind"] == side for l in links):
            doors.append({"from": room, "kind": side, "needs": int(n)})

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
        "doors": doors,
        "prisons": [p for p in args.prisons.split(",") if p in rooms],
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
