#!/usr/bin/env python3
"""What the rooms are made of.

Reads the tile set and the layouts (js/rooms_tiles.js) together with what the
original's own tables say about each room (js/rooms_sheet.js: the guns, the
grav-lifts' arrows and call buttons, the doors, the cells that stop Ai and the
cells it draws in front of him), and sorts every tile into the element it
belongs to: the ceiling and floor bands, the floor course, the side walls, the
ledges Ai walks on, the columns and pipes, the panels and lamps, the rails of
the grav-lifts, the wall and ceiling guns, the door slabs, the mechanism.

    python3 tools/inventory_tiles.py [--chart docs/tile-chart.png] [--md docs/tiles.md]
"""
import argparse, json
from collections import Counter, defaultdict

from PIL import Image, ImageDraw

ALPHA = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_"
VALUE = {c: i for i, c in enumerate(ALPHA)}
W, H = 30, 18


def read_js(path):
    s = open(path).read()
    return json.loads(s[s.index("=") + 1:s.rstrip().rstrip(";").rindex("}") + 1])


def grids(tiles):
    out = {}
    for n, r in tiles["rooms"].items():
        out[n] = [[VALUE[r["tiles"][y][x * 2]] * 64 + VALUE[r["tiles"][y][x * 2 + 1]] for x in range(W)]
                  for y in range(H)]
    return out


def band_rows(g):
    """The rows of a ceiling or floor band: the original lays them as a pattern
    that repeats every four columns, right across the room."""
    rows = []
    for y in range(H):
        row = g[y]
        if len(set(row)) < 2: continue
        if all(row[x] == row[x % 4] for x in range(W)): rows.append(y)
    return rows


def course_rows(g):
    """A floor or ceiling course: one tile laid right across the room."""
    return [y for y in range(H) if len(set(g[y])) == 1 and g[y][0]]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--tiles", default="js/rooms_tiles.js")
    ap.add_argument("--index", default="js/rooms_sheet.js")
    ap.add_argument("--sheet", default="assets/tiles.png")
    ap.add_argument("--level", default="level.json")
    ap.add_argument("--chart", default="docs/tile-chart.png")
    ap.add_argument("--md", default="")
    args = ap.parse_args()

    T = read_js(args.tiles)
    M = read_js(args.index)
    level = json.load(open(args.level))
    G = grids(T)

    use = Counter()
    rooms_of = defaultdict(set)
    for n, g in G.items():
        for row in g:
            for t in row:
                use[t] += 1; rooms_of[t].add(n)

    # A tile is not one thing: the same dithered cell is the back wall in one
    # room and the face of a pillar in another. So the cells are sorted, not
    # the tiles, and each element then lists the tiles it is built from.
    role = {n: [[None] * W for _ in range(H)] for n in G}

    def mark(n, r, c, name):
        if 0 <= r < H and 0 <= c < W and role[n][r][c] is None: role[n][r][c] = name

    # the guns, from the original's own object table. A floor gun is not in the
    # backdrop at all - the game draws it, and the cells keep the floor course
    GUN = {0: "ceiling gun", 1: "wall gun", 2: "wall gun"}
    floor_guns = 0
    for n, lst in (M.get("guns") or {}).items():
        if n not in G: continue
        for type_, x, y, w, fill in lst:
            if type_ not in GUN: floor_guns += 1; continue
            for r in (y // 8, y // 8 + 1):
                for c in range(x // 8, x // 8 + w // 8): mark(n, r, c, GUN[type_])
    # the grav-lifts: the call button first, then the arrow - which scrolls, so
    # the backdrop keeps its cell blank - and the rails the arrow stands between
    for n, lst in (M.get("buttons") or {}).items():
        if n in G:
            for x, y, attr in lst: mark(n, y // 8, x // 8, "lift button")
    for n, lst in (M.get("arrows") or {}).items():
        if n not in G: continue
        for x, y, d, attr in lst:
            r, c = y // 8, x // 8
            mark(n, r, c, "lift arrow")
            for cc in (c - 1, c + 1):
                if not (0 <= cc < W) or not G[n][r][cc]: continue
                t = G[n][r][cc]
                for rr in range(r, -1, -1):
                    if G[n][rr][cc] != t: break
                    mark(n, rr, cc, "lift rail")
                for rr in range(r, H):
                    if G[n][rr][cc] != t: break
                    mark(n, rr, cc, "lift rail")
    # the mechanism: its five spheres, in the room the parts are carried to
    slot = str(level.get("slot"))
    if slot in G:
        for c, r in [[16, 6], [18, 6], [15, 8], [17, 8], [19, 8]]:
            for rr in (r, r + 1):
                for cc in (c, c + 1): mark(slot, rr, cc, "mechanism")

    for n, g in G.items():
        bands = set(band_rows(g)); courses = set(course_rows(g))
        for y in bands:
            for x in range(W): mark(n, y, x, "band")
        for y in courses:
            for x in range(W): mark(n, y, x, "floor course")
        # a pillar, a pipe or a shaft: one tile laid down a run of cells
        for x in range(W):
            run = 1
            for y in range(1, H + 1):
                if y < H and g[y][x] and g[y][x] == g[y - 1][x]: run += 1; continue
                if run >= 6 and g[y - 1][x]:
                    name = "side wall" if x < 2 or x >= W - 2 else "column or pipe"
                    for yy in range(y - run, y): mark(n, yy, x, name)
                run = 1
        block = (M.get("block") or {}).get(n) or []
        solid = (M.get("solid") or {}).get(n) or []
        for y in range(H):
            for x in range(W):
                if not g[y][x]: mark(n, y, x, "empty")
                elif y < len(block) and (block[y] >> x) & 1: mark(n, y, x, "wall or ledge")
                elif y < len(solid) and (solid[y] >> x) & 1: mark(n, y, x, "fitting in front of Ai")
                else: mark(n, y, x, "panel or lamp")

    parts = defaultdict(Counter)          # element -> tile -> cells
    cells = Counter()                     # element -> cells, blank ones included
    where = defaultdict(set)              # element -> rooms
    for n, g in G.items():
        for y in range(H):
            for x in range(W):
                name = role[n][y][x]
                if name == "empty": continue
                cells[name] += 1; where[name].add(n)
                if g[y][x]: parts[name][g[y][x]] += 1
    for k, d in (T.get("doors") or {}).items():
        for y in range(d["h"]):
            for x in range(d["w"]):
                t = VALUE[d["tiles"][y][x * 2]] * 64 + VALUE[d["tiles"][y][x * 2 + 1]]
                if t: parts["door"][t] += 1; cells["door"] += 1; where["door"].add(k)

    order = ["band", "floor course", "wall or ledge", "side wall", "column or pipe",
             "fitting in front of Ai", "panel or lamp", "lift rail", "lift arrow", "lift button",
             "wall gun", "ceiling gun", "door", "mechanism"]
    lines = []
    for name in order + [k for k in cells if k not in order]:
        if name not in cells: continue
        ts = [t for t, _ in parts[name].most_common()]
        lines.append((name, ts, cells[name], len(where[name])))
    total = sum(use.values())
    for name, ts, cells, rooms in lines:
        print(f"{name:20s} {len(ts):4d} tiles {cells:7d} cells ({100 * cells / total:5.1f}%) in {rooms:3d} rooms")
    print(f"{'empty':20s} {1:4d} tiles {use[0]:7d} cells ({100 * use[0] / total:5.1f}%) in 121 rooms")
    print(f"{'total':20s} {len(use):4d} tiles {total:7d} cells")
    print(f"the floor guns ({floor_guns} of them) are not in the tile set: the game draws them")

    # the chart: every tile under the element it belongs to
    sheet = Image.open(args.sheet).convert("RGB")
    Z, PER, PAD = 4, 24, 14
    height = sum(PAD + 6 + ((len(ts) + PER - 1) // PER) * (8 * Z + PAD) for _, ts, _, _ in lines) + 8
    img = Image.new("RGB", (PER * (8 * Z + 6) + 8, height), (24, 24, 30))
    d = ImageDraw.Draw(img)
    y = 4
    for name, ts, cells, rooms in lines:
        d.text((6, y), f"{name} - {len(ts)} tiles, {cells} cells, {rooms} rooms", fill=(255, 225, 140))
        y += PAD
        for i, t in enumerate(ts):
            sx, sy = (t % T["cols"]) * 8, (t // T["cols"]) * 8
            x = 6 + (i % PER) * (8 * Z + 6)
            yy = y + (i // PER) * (8 * Z + PAD)
            img.paste(sheet.crop((sx, sy, sx + 8, sy + 8)).resize((8 * Z, 8 * Z), Image.NEAREST), (x, yy))
            d.rectangle([x - 1, yy - 1, x + 8 * Z, yy + 8 * Z], outline=(80, 80, 100))
            d.text((x, yy + 8 * Z + 1), str(t), fill=(150, 200, 255))
        y += ((len(ts) + PER - 1) // PER) * (8 * Z + PAD) + 6
    img.save(args.chart)
    print(f"chart -> {args.chart}")

    if args.md:
        with open(args.md, "w") as f:
            f.write("| element | tiles | cells | rooms | tile numbers |\n|---|---|---|---|---|\n")
            for name, ts, cells, rooms in lines:
                f.write(f"| {name} | {len(ts)} | {cells} | {rooms} | {', '.join(map(str, ts))} |\n")
        print(f"table -> {args.md}")


if __name__ == "__main__":
    main()
