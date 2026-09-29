#!/usr/bin/env python3
"""Put the ends of the floors where the original has them.

The original stands Ai on the row of cells under his feet: his figure is
three cells wide, the rifle's cell in front, and he stands while any of the
three has bit 6 set in the room's flag map (data/emu/solid.json). The survey
measured the floors by where a box one cell wide stood and dropped, so each
floor it laid runs a cell past the original's own over the drop beside it: a
hole four cells wide in the picture, and in the original, came out two cells
wide, and Ai stood over the middle of it. This snaps each end of a floor that
faces a drop to the end of the original's floor on the same row, when the two
lie within two cells of each other. A floor the flag map does not show on that
row is left as it is, and so are an end by a room's edge (he leaves the room
there with his box at the edge, which the original reaches with three cells
over it) and a lift's car.

With the ends in place the engine drops him as his back foot leaves the floor
and lands him a jump while the rifle's cell is over it (AI_REACH in
js/game.js), which is where the original does both: tools/emu/floorcheck.js.

Run after tools/apply_level_fixes.py. Running it twice changes nothing.

    python3 tools/snap_floor_edges.py [--level js/level.js]
"""
import argparse, json

W = 30


def flag_floor(flags, row):
    """The view cells of a flag-map row the original stands Ai on."""
    return {c - 1 for c in range(1, W + 1) if int(flags[row][2 * c:2 * c + 2], 16) & 0x40}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--level", default="js/level.js")
    ap.add_argument("--flags", default="data/emu/solid.json")
    args = ap.parse_args()

    src = open(args.level).read()
    head, body = src[:src.index("=") + 1], src[src.index("=") + 1:].rstrip().rstrip(";")
    level = json.loads(body)
    flags = json.load(open(args.flags))
    moved = 0
    for key, room in level["rooms"].items():
        if key not in flags: continue
        plats = room["platforms"]
        for p in plats:
            if p.get("landing") or p["y"] >= len(flags[key]): continue
            fl = flag_floor(flags[key], p["y"])
            if not fl & set(range(p["x0"], p["x1"])): continue
            # the others on the row: an end that meets one is not over a drop
            row = [q for q in plats if q is not p and q["y"] == p["y"] and not q.get("landing")]
            for end in ("x0", "x1"):
                x = p[end]
                # an end by the room's edge leads out through the doorway: he leaves the
                # room with his box at the edge, which the original reaches with three
                # cells at the edge, so there the survey's end stays
                if x <= 2 or x >= W - 2 or any(q["x0"] <= x <= q["x1"] for q in row): continue
                if end == "x1":
                    run = x - 1
                    if run in fl:                                   # the original's floor goes on: run to its end
                        while run + 1 in fl and run + 1 - x < 2: run += 1
                        if run + 1 in fl: continue
                    else:
                        while run not in fl and x - 1 - run < 2: run -= 1
                        if run not in fl: continue
                    new = run + 1
                else:
                    run = x
                    if run in fl:
                        while run - 1 in fl and x - (run - 1) <= 2: run -= 1
                        if run - 1 in fl: continue
                    else:
                        while run not in fl and run - x < 2: run += 1
                        if run not in fl: continue
                    new = run
                if new != x:
                    print(f"room {key} y {p['y']}: {end} {x} -> {new}")
                    p[end] = new; moved += 1
    with open(args.level, "w") as f: f.write(head + json.dumps(level, separators=(",", ":")) + ";\n")
    print(f"{moved} floor ends moved to the original's")


if __name__ == "__main__":
    main()
