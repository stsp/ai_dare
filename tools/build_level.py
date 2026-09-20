#!/usr/bin/env python3
"""Assemble the level the game plays from what the original game showed us.

    python3 tools/build_level.py GRAPH.json MATCH.json [--geometry level_map.json]
                                 [-o level.json]

GRAPH.json is the room graph recorded by playing the original in an emulator
(every walk, fall and lift ride Ai could make from the start, room by room).
MATCH.json says which room of the speccy.cz map each of those rooms is, so
its geometry - floors, walls, rails, holes - comes from the map extraction in
level_map.json. Rooms the original never let Ai reach are left out: nothing
here is generated.

Links carry what the emulator recorded: `right`/`left` for walking off an
edge, `drop` for a hole in the floor (with the hole's cells), `up`/`down` for
a lift ride (with the cells Ai stands on to ride it; the original wants him
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


class _Span(list):
    """A [x0, x1] view over a list of cell ranges: setting it adds the range
    to the one it touches (a ride tried from the cell beside another is the
    same lift), or starts a new one."""
    def __init__(self, ranges):
        super().__init__([TW, -1])
        self.ranges = ranges

    def __setitem__(self, i, v):
        super().__setitem__(i, v)
        if i == 1:
            x0, x1 = self[0], self[1]
            for r in self.ranges:
                if r[0] - 2 <= x1 and x0 <= r[1] + 2:
                    r[0], r[1] = min(r[0], x0), max(r[1], x1)
                    return
            self.ranges.append([x0, x1])


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("graph", nargs="+",
                    help="survey graphs in order: from a fresh start, then after one part fitted, ...")
    ap.add_argument("--match", required=True)
    ap.add_argument("--geometry", default="level_map.json")
    ap.add_argument("--parts", default="",
                    help="rooms holding the parts, in order, each as room[:cell] where the "
                         "original keeps it on the floor, e.g. 83:4,148:7,...")
    ap.add_argument("--slot", default="143", help="the self-destruct room")
    ap.add_argument("--screens", default="data/emu",
                    help="where the surveyed screens are; a room the map does not show "
                         "takes its geometry from its own screen")
    ap.add_argument("--floors", default="data/emu/floor.json",
                    help="floor probe: where Ai stood and where he fell, walking from each node")
    ap.add_argument("--prisons", default="50,53",
                    help="the prison rooms: where a capture puts Ai, not somewhere he walked")
    ap.add_argument("--doors", default="",
                    help="doors known from the walkthrough but not yet surveyed, as "
                         "room:side:parts, e.g. 209:right:2 - drawn shut until surveyed")
    ap.add_argument("--gate", default="",
                    help="doors on surveyed doorways the phases do not show, as from:to:parts, "
                         "e.g. 185:186:2 - the walk needs that many parts fitted")
    ap.add_argument("--label", default="",
                    help="a sector the original announces inside one survey phase, as "
                         "N:seed:blockers - the rooms reachable from `seed` without entering a "
                         "blocker are announced as sector N, and later sectors count on from there")
    ap.add_argument("--clear", default="",
                    help="wipe tiles the map shows but the game draws itself, as room:c0:c1:r0:r1 "
                         "(cells c0..c1, rows r0..r1), e.g. 143:13:22:6:14 - the self-destruct mechanism")
    ap.add_argument("--boss", default="",
                    help="where the Mekon's hologram stands, as room:cell:row (his feet)")
    ap.add_argument("--from-screen", default="",
                    help="rooms to read off their own screen even where the map seems to match")
    ap.add_argument("--exclude", default="",
                    help="room numbers that are not rooms: the capture sequence, for one")
    ap.add_argument("--fake-lifts", default="",
                    help="lift calls the emulator showed to be no lift at all (tools/emu/emu_liftcheck.js): "
                         "a JSON list of {from, kind, x0, feet}; those links are left out")
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
    from_screen = {int(x) for x in args.from_screen.split(",") if x}
    # a room belongs to the first survey that saw any part of it
    room_phase = {}
    for node in g["nodes"].values():
        room_phase[node["room"]] = min(room_phase.get(node["room"], 99), node["phase"])
    rooms = {}
    for node in g["nodes"].values():
        n = node["room"]
        if n in rooms or n in exclude:
            continue
        m = match.get(n)
        scr = os.path.join(args.screens, f"room_{n}.scr")
        if m and (m["score"] >= 0.6 or "chain" in m) and int(n) not in from_screen:
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
            # the game's own numbering: the surface and the rooms below it are
            # sector 1, each door opens the next (the survey that first reached
            # the room)
            "zone": room_phase[node["room"]] + 1,
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
        if m and (m["score"] >= 0.6 or "chain" in m) and int(n) not in from_screen:
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

    # the lift rails are read off each room's own screen: the map's rendering
    # of them is not reliable in every sector, and a shaft the map missed is
    # a lift the player cannot see
    for n, room in rooms.items():
        scr = os.path.join(args.screens, f"room_{n}.scr")
        if room["map"] == "screen" or not os.path.exists(scr):
            continue
        img = render_scr(open(scr, "rb").read())[8:8 + 144, 8:8 + 240]
        seen = read_room(ArrayReader(img), 0, 0)
        if not seen["shafts"]:
            continue
        cells = list(room["cells"])
        for sh in seen["shafts"]:
            if any(abs(m["x"] - sh["x"]) <= 1 for m in room["shafts"]):
                continue
            room["shafts"].append(sh)
            for j in range(sh["y0"], sh["y1"]):
                for i in range(sh["x"], sh["x"] + sh["w"]):
                    if cells[j * TW + i] in "014":
                        cells[j * TW + i] = "2" if i in (sh["x"], sh["x"] + sh["w"] - 1) else "5"
        room["shafts"].sort(key=lambda m: m["x"])
        room["cells"] = "".join(cells)

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

    # Floors and pits as Ai found them walking: the cells he stood on at each
    # height, and the cell the floor dropped from under him. The picture of a
    # pit says nothing about its edges; this does. A pit runs from the cell he
    # fell from to the next cell he was seen standing on, or the room's edge -
    # and no further than a jump where the survey saw him jump it.
    falls = {}
    prisons = set(args.prisons.split(","))
    prison_doors = {room_of(e["to"]) for e in g["edges"]
                    if room_of(e["from"]) in prisons and e["via"] in ("left", "right") and room_of(e["to"]) not in prisons}
    if os.path.exists(args.floors):
        probe = json.load(open(args.floors))
        stood, falls = defaultdict(lambda: defaultdict(set)), defaultdict(lambda: defaultdict(list))
        for node, walks in probe.items():
            room, b = node.split(":")
            if room not in rooms:
                continue
            for direction, trace in walks.items():
                # a node caught in mid-fall is no floor: where he landed is -
                # the first height he held for three samples - and he has to
                # have walked at least a cell at it before anything counts
                pts = [(x, y) for x, y in trace if x != "room"]

                def walked_at(i):             # held this height and moved along it
                    run = [pts[j] for j in range(i, len(pts)) if abs(pts[j][1] - pts[i][1]) <= 1]
                    return len(run) >= 3 and len({x for x, _ in run}) >= 2
                land = next((i for i in range(len(pts) - 2) if walked_at(i)), 0)
                base = pts[land][1] if pts else trace[0][1]
                trace = trace[land:]
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
        # the rooms the prisons open into: a walk from one of those into a
        # prison is a walk, from anywhere else a capture
        prison_doors = {room_of(e["to"]) for e in g["edges"]
                        if room_of(e["from"]) in prisons and e["via"] in ("left", "right") and room_of(e["to"]) not in prisons}
        jumped = defaultdict(set)
        crossed = defaultdict(lambda: defaultdict(set))   # room -> y -> {(x, direction)}
        for e in g["edges"]:
            # a walk out of the room at floor level, arriving at the doorway of
            # the next at the same height: the floor ran from where he stood
            # to that edge
            if e["via"] in ("right", "left") and room_of(e["from"]) != room_of(e["to"]) and \
                    not e.get("fell") and not e.get("through") and room_of(e["to"]) not in prisons:
                n, arr = g["nodes"][e["from"]], e.get("arrive", {})
                at_door = arr.get("x", 15) <= 3 if e["via"] == "right" else arr.get("x", 15) >= 26
                if at_door and abs(arr.get("y", n["y"]) - n["y"]) <= 8:
                    crossed[str(n["room"])][n["y"]].add((n["x"], e["via"]))
        for e in g["edges"]:
            # a jump that ended in a prison was a fall to his death, not a crossing
            if e["via"] in ("right~", "left~") and room_of(e["from"]) != room_of(e["to"]) and room_of(e["to"]) not in prisons \
                    and not e.get("fell") and not e.get("through") \
                    and abs(e.get("arrive", {}).get("y", 123) - g["nodes"][e["from"]]["y"]) <= 4:   # ... at the same level
                jumped[(room_of(e["from"]), g["nodes"][e["from"]]["y"])].add(e["via"][:-1])

        def jumped_at(room, base, direction):
            """Did a jump `direction` out of `room` from about this height reach the
            next room? (nodes on one gallery sit within a course of each other)"""
            return any(direction in ds for (r, y), ds in jumped.items() if r == room and abs(y - base) <= 8)
        # a node Ai cannot move from at all is where he lay unconscious after a
        # fall: that floor is a pit, and a room whose floor nodes are all such
        # has no floor - falling in is death
        dead = defaultdict(set)
        for node, walks in probe.items():
            room, b = node.split(":")
            if room in rooms and int(b) >= 7 and all(len({x for x, y in t if x != "room"}) <= 1 and t[-1][0] != "room" for t in walks.values()):
                # ... and the survey found no way out of it but capture (a
                # guard in the way pins Ai just as well as a pit, for a while);
                # a room he never left at all is the end of the game, not a pit
                outs = [e for e in g["edges"] if e["from"] == node and not e["via"].endswith("!")]
                if outs and all(room_of(e["to"]) in prisons or room_of(e["to"]) == room for e in outs):
                    dead[room].add(node)
        for room in dead:
            floor_nodes = [n for n in probe if n.split(":")[0] == room and int(n.split(":")[1]) >= 7]
            if all(n in dead[room] for n in floor_nodes):
                print("pit room", room, sorted(dead[room]), file=sys.stderr)
                rooms[room]["platforms"] = [p for p in rooms[room]["platforms"] if p["y"] < TH - 3]
                rooms[room]["holes"] = [[0, TW]]
                stood[room] = defaultdict(set, {b: xs for b, xs in stood[room].items() if b < 120})
        if os.environ.get("DUMP_PRE"):
            json.dump({r: rooms[r]["platforms"] for r in rooms}, open(os.environ["DUMP_PRE"], "w"))
        for room in stood:
            for base, xs in stood[room].items():
                feet = base + 5                       # the original's y is five above the feet
                row = round(feet / 8)                 # the row he stood at: the game's, not the picture's
                fell_cells = {x for x, _ in falls[room].get(base, [])}
                cells = set()
                for x in xs - fell_cells:              # Ai is two cells wide
                    cells.add(x); cells.add(x + 1)
                cells -= fell_cells
                hole_cells = set()
                for x, direction in falls[room].get(base, []):
                    if direction == "right":
                        nxt = min((c for c in cells if c > x), default=TW)
                        if jumped_at(room, base, "right"):
                            nxt = min(nxt, x + 4)
                        hole_cells.update(range(x, nxt))
                    else:
                        prv = max((c for c in cells if c < x), default=-1)
                        if jumped_at(room, base, "left"):
                            prv = max(prv, x - 4)
                        hole_cells.update(range(prv + 1, x + 1))
                # where he jumped a pit and walked on into the next room, the
                # floor runs from the pit's far edge to that edge of the room
                for x, direction in falls[room].get(base, []):
                    if direction == "right" and jumped_at(room, base, "right"):
                        end = max((h for h in hole_cells if h >= x), default=x) + 1
                        cells.update(range(end, TW))
                    if direction == "left" and jumped_at(room, base, "left"):
                        start = min((h for h in hole_cells if h <= x), default=x)
                        cells.update(range(0, start))
                for x, direction in crossed[room].get(base, ()):
                    if direction == "right" and not any(x < fx for fx, _ in falls[room].get(base, [])):
                        cells.update(range(x, TW))
                    if direction == "left" and not any(fx < x for fx, _ in falls[room].get(base, [])):
                        cells.update(range(0, x + 2))
                # the floor at this height: what the map showed, plus what he
                # stood on, minus the pit
                base_cells = set(cells)
                for p in rooms[room]["platforms"]:
                    # the picture's ledge he stood on - drawn up to two rows above
                    # where his feet are - gives its extent; a room read off its
                    # own screen is not trusted beyond what he stood on
                    if not p.get("probed") and row - 2 <= p["y"] <= row and \
                            (rooms[room]["map"] != "screen" or row >= TH - 3) and \
                            any(c in cells for c in range(p["x0"] - 1, p["x1"] + 1)):
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
                # the picture's version of this ledge - drawn up to two rows above
                # his feet, or the course's own top line - gives way to the game's
                keep = [p for p in rooms[room]["platforms"]
                        if p.get("probed") or not (row - 2 <= p["y"] <= row + 1 and
                                any(x in base_cells or x in cells for x in range(p["x0"], p["x1"])))]
                if row >= TH - 3:                      # a pit cuts the step course as well
                    keep = [p for p in keep if not (p["y"] >= TH - 3 and any(h in range(p["x0"], p["x1"]) for h in hole_cells))]
                keep += [{"y": row, "x0": a, "x1": b, "probed": True} for a, b in pieces]
                rooms[room]["platforms"] = sorted(keep, key=lambda p: (p["y"], p["x0"]))
                if row >= TH - 3:
                    hs, run = [], []
                    for x in range(TW):
                        if x in hole_cells:
                            run.append(x)
                        elif run:
                            hs.append([run[0], run[-1] + 1]); run = []
                    if run:
                        hs.append([run[0], run[-1] + 1])
                    # the picture's holes stand where he did not walk
                    hs += [h for h in rooms[room]["holes"] if not any(c in base_cells for c in range(h[0], h[1]))
                           and not any(c in hole_cells for c in range(h[0], h[1]))]
                    rooms[room]["holes"] = sorted(hs)

    def _dbg(stage):
        r = os.environ.get("DEBUG_ROOM")
        if r and r in rooms:
            print(stage, [(p["y"], p["x0"], p["x1"], "p" if p.get("probed") else "") for p in rooms[r]["platforms"]], rooms[r]["holes"], file=sys.stderr)
    # a ledge the picture shows but Ai never stood on: the drawing's top
    # line lies two courses above where his feet rest on it in a room read
    # off its screen, one in a room cut from the map (measured against
    # every ledge he did stand on) - put it where he would stand
    ride_feet = defaultdict(list)             # room -> [(feet, x0, x1)] where a lift ride began or ended
    for e in g["edges"]:
        if e["via"] in ("up", "down") and "x0" in e:
            n = g["nodes"][e["from"]]
            ride_feet[str(n["room"])].append((n["y"] + 5, e["x0"], e["x1"]))
            arr = e.get("arrive")
            if arr and not e.get("fell") and not e.get("through"):
                ride_feet[room_of(e["to"])].append((arr["y"] + 5, e["x0"], e["x1"]))
    for room in rooms:
        off = 2 if rooms[room]["map"] == "screen" else 1
        plats = rooms[room]["platforms"]
        probed_ps = [p for p in plats if p.get("probed")]
        kept = []
        for p in plats:
            if p.get("probed") or p["y"] >= TH - 3:
                kept.append(p)
                continue
            if any(abs(f - p["y"] * 8) <= 4 and x0 <= p["x1"] + 1 and x1 >= p["x0"] - 2 for f, x0, x1 in ride_feet[room]):
                kept.append(p)                    # a lift's landing: drawn where he stands
                continue
            if p["x1"] - p["x0"] <= 5 and any(x0 <= p["x1"] + 1 and x1 >= p["x0"] - 2 for f, x0, x1 in ride_feet[room]):
                continue                          # the lift's car, drawn at rest in its shaft: no ledge
            q = dict(p, y=p["y"] + off)
            if any(abs(q["y"] - pp["y"]) <= 1 and pp["x0"] < q["x1"] and pp["x1"] > q["x0"] for pp in probed_ps):
                continue                      # the probe has this one
            kept.append(q)
        rooms[room]["platforms"] = sorted(kept, key=lambda p: (p["y"], p["x0"]))
    # the floor's top line, read a course above where Ai's feet rest on it,
    # is the floor (he stands at y 123 on every room's floor)
    for room in rooms:
        for p in rooms[room]["platforms"]:
            if p["y"] == TH - 3 and not p.get("probed"):
                p["y"] = TH - 2
        rooms[room]["platforms"].sort(key=lambda p: (p["y"], p["x0"]))
    # where a lift set Ai down and nothing is drawn under him, he stood on
    # the lift's car at its stop: a landing there
    for e in g["edges"]:
        if e["via"] not in ("up", "down") or "x0" not in e or e.get("fell") or e.get("through"):
            continue
        arr = e.get("arrive")
        b = room_of(e["to"])
        if not arr or b not in rooms or arr["y"] >= 115 or not e["x0"] - 1 <= arr["x"] <= e["x1"] + 1:
            continue                          # (a lift carries him straight up or down: x unchanged)
        row = round((arr["y"] + 5) / 8)
        x0, x1 = max(0, min(e["x0"], arr["x"]) - 1), min(TW, max(e["x1"], arr["x"]) + 3)
        if any(h0 < x1 and h1 > x0 for h0, h1 in rooms[b]["holes"]):
            continue                          # a stop inside the shaft over a pit: the car only
        if not any(abs(p["y"] - row) <= 1 and p["x0"] < x1 and p["x1"] > x0 for p in rooms[b]["platforms"]):
            # ... reaching the ledge beside it, when one is drawn within two cells
            for p in rooms[b]["platforms"]:
                if abs(p["y"] - row) <= 1 and 0 <= p["x0"] - x1 <= 2:
                    x1 = p["x0"]
                if abs(p["y"] - row) <= 1 and 0 <= x0 - p["x1"] <= 2:
                    x0 = p["x1"]
            rooms[b]["platforms"].append({"y": row, "x0": x0, "x1": x1, "landing": True})
            rooms[b]["platforms"].sort(key=lambda p: (p["y"], p["x0"]))
    _dbg("probed")
    # Upper floors the original walked along. Where Ai walked out of a room
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
        # where the floor probe walked the room, its floors stand as probed
        if os.path.exists(args.floors) and stood.get(room):
            continue
        feet = node["y"] + 5
        plats = rooms[room]["platforms"]
        row = round(feet / 8)
        # ... but not across a gap the floor probe saw him fall into: a ledge
        # he can walk off ends where it ends
        gap = set()
        for x, direction in falls.get(room, {}).get(node["y"], []) if os.path.exists(args.floors) else []:
            gap.update(range(x + 1, TW) if direction == "right" else range(0, x))
        span = [i for i in range(TW) if i not in gap]
        if not span:
            continue
        rooms[room]["platforms"] = [p for p in plats if not (row - 2 <= p["y"] <= row + 1 and p["x0"] <= span[-1] and p["x1"] > span[0])] + \
                                   [{"y": row, "x0": span[0], "x1": span[-1] + 1}]
        rooms[room]["platforms"].sort(key=lambda p: (p["y"], p["x0"]))
        cells = list(rooms[room]["cells"])
        for i in span:                          # draw the walkway where the map left a gap
            if cells[row * TW + i] == "0":
                cells[row * TW + i] = "4"
        rooms[room]["cells"] = "".join(cells)

    _dbg("walkway")
    def beside(a, b, via):
        """Is room b next to room a on the map, the way a walk `via` leads? Rooms
        the map does not place are taken on trust."""
        pa, pb = rooms[a].get("map"), rooms[b].get("map")
        if pa == "screen" or pb == "screen" or not pa or not pb:
            return True
        (ra, ca), (rb, cb) = (map(int, pa.split(","))), (map(int, pb.split(",")))
        return ra == rb and cb - ca == (1 if via == "right" else -1)
    walks = defaultdict(set)              # (from, kind) -> targets by walking
    support = {}                          # (from, kind, to) -> how many walks the survey saw
    spans = defaultdict(list)               # (from, to, kind, floor, stop) -> [[x0, x1], ...]

    class _Zones(dict):
        """zones[key] -> a [x0, x1] pair that grows to take in each ride tried;
        rides tried from cells apart are separate lifts in the same room"""
        def __getitem__(self, key):
            return _Span(spans[key])
    zones = _Zones()
    broken = set()                          # zone keys of the broken lift's last leg
    for e in g["edges"]:
        a, b, via = room_of(e["from"]), room_of(e["to"]), e["via"].rstrip("*!")
        if a not in rooms or b not in rooms or e["via"].endswith("!"):
            continue
        if b in prisons and a not in prisons and a not in prison_doors:
            continue                          # he was captured on that move, not walked there
        arr = e.get("arrive", {})
        jumping = via.endswith("~")
        via = via.rstrip("~")
        if via in ("right", "left"):
            if a == b:
                continue
            slack = 5 if jumping else 3                  # a jump lands a cell or two in
            edge_entry = arr.get("x", 0) <= slack if via == "right" else arr.get("x", 29) >= 29 - slack
            if e.get("through"):
                # walked into the next room and fell straight through its
                # floor at the doorway into the one below: a doorway, and a
                # hole at the entry cells of the room passed
                first = str(e["through"][0])
                nxt = str(e["through"][1]) if len(e["through"]) > 1 else b
                if first in rooms and not jumping:
                    walks[(a, via)].add((first, g["nodes"][e["from"]]["y"] + 5))
                    support[(a, via, first)] = support.get((a, via, first), 0) + 1
                    if nxt in rooms and nxt not in prisons:
                        walks[(first, "drop")].add(nxt)
                        x0, x1 = (0, 2) if via == "right" else (TW - 2, TW)
                        if not any(h0 <= x0 and x1 <= h1 for h0, h1 in rooms[first]["holes"]):
                            rooms[first]["holes"].append([x0, x1])
                            rooms[first]["platforms"] = [q for q in rooms[first]["platforms"] if q["y"] < TH - 3 or q["x1"] <= x0 or q["x0"] >= x1] + \
                                [dict(q, x1=x0) for q in rooms[first]["platforms"] if q["y"] >= TH - 3 and q["x0"] < x0 < q["x1"]] + \
                                [dict(q, x0=x1) for q in rooms[first]["platforms"] if q["y"] >= TH - 3 and q["x0"] < x1 < q["x1"]]
                continue
            if e.get("fell"):
                edge_entry = False                        # he fell into that room: a drop, whatever cell he landed in
            if edge_entry and arr.get("y", 123) < g["nodes"][e["from"]]["y"] - 20:
                # arrived higher than he set off: the walk took a lift on the
                # way (a hop over something in the way calls one) - not a doorway
                continue
            if edge_entry:
                # the doorway is at the height he arrived: a room's left and
                # right exits can lead to different rooms from different floors
                walks[(a, via)].add((b, arr.get("y", 123) + 5))
                support[(a, via, b)] = support.get((a, via, b), 0) + 1
            elif not jumping:
                # Ai walked off a hole and fell: a drop, over the room's holes
                walks[(a, "drop")].add(b)
            # a jumping walk that ended elsewhere took a lift on the way: not a walk
        else:
            # a ride tried over a hole in the floor is a fall, not a lift; a
            # "ride" that left Ai on the floor he started from was a jump
            if g["nodes"][e["from"]]["y"] >= 100 and \
                    any(h0 <= e["x0"] <= h1 or h0 <= e["x1"] <= h1 for h0, h1 in rooms[a]["holes"]):
                continue                          # (from a gallery above the pit it is a lift)
            # (a ride that ends on the floor it started from is the broken lift:
            # it climbs to its stop, breaks, and drops him back - kept)
            # the floor the ride was called from: the original's y for Ai
            # standing there (123 on a room's floor, less on an upper one)
            # the original's y for Ai standing there: 123 on a room's floor,
            # 59 or 67 on an upper one - his feet are five below
            floor = g["nodes"][e["from"]]["y"]
            stop = e.get("arrive", {}).get("y", 123)           # where the ride stopped
            chain = [a] + [str(r) for r in e.get("through", []) if str(r) in rooms] + [b]
            if e.get("fell") and len(chain) == 2 and stop >= 120 and b in walks[(a, "drop")] and floor < 100:
                continue                          # a hop off a gallery into the room below: a fall, not a ride
            if e.get("fell"):
                # the broken lift. The original's ride breaks at the far end of
                # the shaft in the room it passes (78), and Ai falls from the
                # top of the room below (110) to its floor - a whole storey.
                # Called from below, the ride goes up into that room, breaks
                # just inside it, and he drops back through its floor.
                stop = e.get("fellFrom", 35)
                if a == b and len(chain) > 2:
                    z = zones[(a, chain[1], via, floor, "in")]
                    z[0], z[1] = min(z[0], e["x0"]), max(z[1], e["x1"])
                    z = zones[(chain[1], a, "drop", 7, -1)]
                    z[0], z[1] = min(z[0], e["x0"]), max(z[1], e["x1"])
                    continue
                broken.add((chain[-2], chain[-1], via, floor if len(chain) == 2 else -1, stop))
            if len(chain) > 2:
                # the later legs are entered riding, from the room before: no
                # floor calls them (a floor the lift passes is not a stop)
                for i in range(len(chain) - 1):
                    last = i == len(chain) - 2
                    z = zones[(chain[i], chain[i + 1], via, floor if i == 0 else -1, stop if last else -1)]
                    z[0], z[1] = min(z[0], e["x0"]), max(z[1], e["x1"])
                continue
            z = zones[(a, b, via, floor, stop)]
            z[0], z[1] = min(z[0], e["x0"]), max(z[1], e["x1"])

    # a doorway the original let Ai through one way is open the other way
    # too: the survey may have failed to walk back (a guard in the way, a
    # gap it did not jump) where a player would
    for (a, via), targets in list(walks.items()):
        back = {"left": "right", "right": "left"}.get(via)
        if back:
            for t in targets:
                b, feet = t if isinstance(t, tuple) else (t, None)
                if not any((x[0] if isinstance(x, tuple) else x) == a for x in walks[(b, back)]):
                    walks[(b, back)].add((a, feet))
    _dbg("prelinks")
    links = []
    for (a, via), targets in sorted(walks.items(), key=str):
        seen_walk = set()
        for t in sorted(targets, key=str):
            b, feet = t if isinstance(t, tuple) else (t, None)
            if via == "drop":
                # the recorder only saw where Ai came to rest, and a fall can
                # pass straight through a room: on the map every room drops
                # into the one directly beneath it (the next row of 32), so
                # that is where the hole leads whenever that room is in the level
                below = str(int(a) + 32)
                if below in rooms and below != b:
                    b = below
                holes = rooms[a]["holes"] or [[0, TW]]
                for x0, x1 in holes:          # holes end exclusive, zones inclusive
                    links.append({"from": a, "to": b, "kind": "drop", "x0": x0, "x1": x1 - 1})
            else:
                # one link per doorway height (rounded to a course)
                key = (b, None if feet is None else round(feet / 8))
                if key in seen_walk:
                    continue
                seen_walk.add(key)
                links.append({"from": a, "to": b, "kind": via, **({"feet": feet} if feet is not None else {}),
                              "n": support.get((a, via, b), 0)})
            if needs.get((a, b), 0):
                links[-1]["needs"] = needs[(a, b)]
    flat = [(k, tuple(r)) for k, rs in spans.items() for r in rs]
    broken_rooms = {b for (a, b, via, floor, stop) in spans if stop == "in"}   # where the lift breaks
    for (a, b, via, floor, stop), (x0, x1) in sorted(flat, key=str):
        if via == "drop":                     # out of the broken lift's shaft
            for sh in rooms[a]["shafts"]:     # wherever between the rails he is
                if sh["x"] - 3 <= x1 and sh["x"] + sh["w"] >= x0:
                    x0, x1 = min(x0, sh["x"] - 1), max(x1, sh["x"] + sh["w"])
            links.append({"from": a, "to": b, "kind": "drop", "x0": x0, "x1": x1})
            cut = []                          # the shaft is open through that floor
            for p in rooms[a]["platforms"]:
                if p["y"] < TH - 3 or p["x1"] <= x0 or p["x0"] > x1:
                    cut.append(p)
                    continue
                if p["x0"] < x0:
                    cut.append({**p, "x1": x0})
                if p["x1"] > x1 + 1:
                    cut.append({**p, "x0": x1 + 1})
            rooms[a]["platforms"] = cut
            if not any(h0 <= x0 and x1 <= h1 for h0, h1 in rooms[a]["holes"]):
                rooms[a]["holes"].append([x0, x1])
            continue
        # a ride tried at the very edge that merely walked into the next room,
        # or beside a hole that Ai simply fell through
        if (x0 <= 0 or x1 >= TW - 1) and any((t[0] if isinstance(t, tuple) else t) == b
                                              for t in walks[(a, "left" if x0 <= 0 else "right")]):
            continue
        if b in walks[(a, "drop")] and floor >= 100:
            continue
        # the key pressed calls the lift; where it carries him is the lift's
        # doing: from a gallery down into the room his floor drops into, the
        # ride is down whichever key called it, and up out of it is up
        if b in walks[(a, "drop")]:
            via = "down"
        elif a in walks[(b, "drop")]:
            via = "up"
        # feet height, in the recreation's pixels, of the floor it is called
        # from: the original's floor (y 123) is the room's bottom course. A
        # call recorded from mid-air - Ai caught in the field after a fall -
        # has no floor at that height in the room, and is not a lift a player
        # can take
        feet = -1 if floor < 0 else floor + 5
        if floor >= 0 and not any(abs(p["y"] * 8 - feet) <= 14 and p["x1"] >= x0 - 3 and p["x0"] <= x1 + 4
                                  for p in rooms[a]["platforms"]):
            continue
        # ... and the floor the ride stops at, in the room it arrives in: the
        # original passes every other floor on the way
        if stop == "in":                      # breaks just inside the next room
            stop_feet = TH * 8 - 8 if via == "up" else 16
        else:
            stop_feet = -1 if stop < 0 else stop + 5            # -1: passes through
        # a ride with no rails near it is no lift: a fall the survey took
        # for one, or a room whose rails it could not see
        if a == b and not any(sh["x"] - 3 <= x1 and sh["x"] + sh["w"] >= x0 for sh in rooms[a]["shafts"]):
            continue
        # ... and a ride within the room ends on a floor: one that left Ai in
        # mid-air was a hop off a ledge the survey took for a ride
        if a == b and stop_feet >= 0 and not any(abs(p["y"] * 8 - stop_feet) <= 8 and p["x1"] >= x0 - 1 and p["x0"] <= x1 + 2
                                                 for p in rooms[a]["platforms"]):
            continue
        # the broken lift: the ride that breaks just inside the next room, or
        # the leg of a ride that fell on through a room (a hop off a gallery
        # that landed in the room below is no lift breaking)
        is_broken = stop == "in" or (floor < 0 and a in broken_rooms)
        if is_broken and floor < 0:
            # ridden down from above, the lift breaks at the bottom of its
            # shaft in this room, at floor level, and Ai falls on through the
            # hole there: the ride ends here, the room's drop does the rest
            b, stop_feet = a, (TH - 2) * 8
        links.append({"from": a, "to": b, "kind": via, "x0": x0, "x1": x1, "feet": feet,
                      "stop": stop_feet, **({"broken": True} if is_broken else {})})
        if a != b and needs.get((a, b), 0):
            links[-1]["needs"] = needs[(a, b)]

    # a doorway the game let Ai through is open, whatever the map's frame
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

    # where the floor probe saw Ai stand, the game let him stand: whatever the
    # picture shows at body height there - a grille, a machine - is not a wall
    for room, bases in (stood.items() if os.path.exists(args.floors) else []):
        if room not in rooms:
            continue
        cells = list(rooms[room]["cells"])
        for base, xs in bases.items():
            row = round((base + 5) / 8)
            for x in xs:
                for j in range(max(0, row - 4), row):
                    for i in (x, x + 1):
                        if i < TW and cells[j * TW + i] == "4":
                            cells[j * TW + i] = "1"
        rooms[room]["cells"] = "".join(cells)

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

    # the surface is under the stars: a room whose screen has a sky of them
    # (isolated dots across its upper rows) is drawn open to space, every
    # other room is underground with the rest of its zone, whatever colours
    # the extractor read off its floor band
    def star_cells(scr):
        n = 0
        for row in range(1, 9):
            for col in range(1, 31):
                dots = 0
                for yy in range(8):
                    y = row * 8 + yy
                    dots += bin(scr[((y & 0xC0) << 5) | ((y & 7) << 8) | ((y & 0x38) << 2) | col]).count("1")
                n += 1 <= dots <= 3
        return n
    from collections import Counter
    if ["cyan"] not in geo["sectors"]:
        geo["sectors"].append(["cyan"])
    surface = geo["sectors"].index(["cyan"])
    sky = {}
    for n in rooms:
        scr = os.path.join(args.screens, f"room_{n}.scr")
        if os.path.exists(scr):
            sky[n] = star_cells(open(scr, "rb").read()) >= 60   # (a window onto the stars, as in 63, has fewer)
    for zone in {r["zone"] for r in rooms.values()}:
        members = [(n, r) for n, r in rooms.items() if r["zone"] == zone]
        below = Counter(r["sector"] for n, r in members if not sky.get(n) and r["sector"] != surface)
        usual = below.most_common(1)[0][0] if below else geo["sectors"].index(["cyan", "white"]) if ["cyan", "white"] in geo["sectors"] else 1
        for n, r in members:
            r["sector"] = surface if sky.get(n, r["sector"] == surface) else (usual if r["sector"] == surface else r["sector"])
    # doors the walkthrough shows on doorways within one survey phase
    for spec in filter(None, args.gate.split(",")):
        a, b, n = spec.split(":")
        for l in links:
            if l["from"] == a and l["to"] == b and l["kind"] in ("left", "right"):
                l["needs"] = int(n)
    for spec in filter(None, args.clear.split(",")):
        room, c0, c1, r0, r1 = spec.split(":")
        if room in rooms:
            r = rooms[room]
            W = 30 if len(r["cells"]) % 30 == 0 else 32
            cells = list(r["cells"])
            for row in range(int(r0), int(r1) + 1):
                for col in range(int(c0), int(c1) + 1):
                    cells[row * W + col] = "0"
            r["cells"] = "".join(cells)
            r["platforms"] = [pl for pl in r["platforms"]
                              if not (int(r0) <= pl["y"] - 1 <= int(r1) and pl["x0"] >= int(c0) and pl["x1"] <= int(c1) + 1)]
    # what the original announces on entering: its sector numbers, which cut
    # one survey phase in two (sectors 3 and 4 both open with the same part)
    for n, r in rooms.items():
        r["label"] = r["zone"]
    if args.label:
        num, seed, blockers = args.label.split(":")
        num, blockers = int(num), set(blockers.split(","))
        seen, queue = {seed}, [seed]
        while queue:
            a = queue.pop()
            for l in links:
                for x, y in ((l["from"], l["to"]), (l["to"], l["from"])):
                    if x == a and y in rooms and y not in seen and y not in blockers and rooms[y]["zone"] == rooms[seed]["zone"]:
                        seen.add(y); queue.append(y)
        base = rooms[seed]["zone"]
        for n, r in rooms.items():
            if n in seen:
                r["label"] = num
            elif r["zone"] > base:
                r["label"] = min(6, r["zone"] + 1)
    boss = None
    if args.boss:
        room, cell, row = args.boss.split(":")
        if room in rooms:
            boss = {"room": room, "x": int(cell) * 8, "feet": int(row) * 8}
    parts = []
    for spec in filter(None, args.parts.split(",")):
        room, _, cell = spec.partition(":")
        if room in rooms:
            parts.append({"room": room, "x": int(cell)} if cell else {"room": room})
    if args.fake_lifts:
        # lift calls the emulator showed to be a jump or a fall at a gap's edge, not a lift
        # (a call made in the air over a real lift carries "feet_to": the floor the ride really starts from)
        fake = {(f["from"], f["kind"], f["x0"], f["feet"]): f.get("feet_to") for f in json.load(open(args.fake_lifts))}
        before, kept = len(links), []
        have = {(l["from"], l["kind"], l.get("x0"), l.get("feet")) for l in links}
        for l in links:
            k = (l["from"], l["kind"], l.get("x0"), l.get("feet"))
            if k not in fake:
                kept.append(l)
            elif fake[k] is not None and (k[0], k[1], k[2], fake[k]) not in have:
                have.add((k[0], k[1], k[2], fake[k]))
                kept.append({**l, "feet": fake[k]})
        links = kept
        print(f"{before - len(links)} phantom lift calls left out")
    level = {
        "source": geo.get("source"),
        "room": geo["room"],
        "sectors": geo["sectors"],
        "start": start,
        "explored": len(rooms),
        "links": links,
        "rooms": rooms,
        "parts": parts,
        "doors": doors,
        "prisons": [p for p in args.prisons.split(",") if p in rooms],
        "slot": args.slot if args.slot in rooms else None,
        "boss": boss,
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
