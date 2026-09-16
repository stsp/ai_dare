#!/usr/bin/env python3
"""Match screens captured from the game (ZX .scr dumps) to rooms of the map.

    python3 tools/match_rooms.py MAP.png SCR_DIR [--level level.json]
                                 [--graph graph.json] [-o match.json]

Both pictures are reduced to the Spectrum's eight ink/paper hues before
comparing, since the emulator and the map author render the palette
differently, and the play window (240x144 at 8,8) is compared cell for cell.
Sprites and message boxes cost a little agreement; a wrong room costs a lot.

Rooms of one corridor look alike, so with --graph the rooms a walk joins are
placed together: a chain of rooms linked left-to-right must land on
consecutive cells of one row of the map, and the placement with the best
total agreement wins.
"""
import argparse
import glob
import json
import os

import numpy as np
from PIL import Image

X0, Y0, RW, RH = 31, 39, 240, 144


def render_scr(data):
    """A 6912-byte screen dump as an RGB array, 192x256."""
    pix = np.frombuffer(data[:6144], np.uint8)
    attr = np.frombuffer(data[6144:6912], np.uint8)
    img = np.zeros((192, 256, 3), np.uint8)
    # the map author's palette, so the extractor reads a dump like a map crop
    pal = np.array([(0, 0, 0), (0, 0, 216), (199, 1, 0), (216, 1, 216),
                    (0, 197, 0), (0, 216, 216), (211, 210, 0), (216, 216, 216)])
    for y in range(192):
        addr = ((y & 0xC0) << 5) | ((y & 7) << 8) | ((y & 0x38) << 2)
        row = np.unpackbits(pix[addr:addr + 32])
        a = np.repeat(attr[(y // 8) * 32:(y // 8) * 32 + 32], 8)
        ink, paper = pal[a & 7], pal[(a >> 3) & 7]
        img[y] = np.where(row[:, None] == 1, ink, paper)
    return img


def hues(img):
    b = (np.asarray(img).astype(int) > 100).astype(int)
    return b[..., 0] * 4 + b[..., 1] * 2 + b[..., 2]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("map")
    ap.add_argument("scr_dir")
    ap.add_argument("--level", default="level.json")
    ap.add_argument("--graph", nargs="*", default=[],
                    help="survey graphs; chains are built within one survey, so a door "
                         "between sectors never binds two map blocks together")
    ap.add_argument("-o", "--out", default="match.json")
    args = ap.parse_args()
    m = np.array(Image.open(args.map).convert("RGB"))
    level = json.load(open(args.level))
    keys = {}
    for k in level["rooms"]:
        r, c = map(int, k.split(","))
        keys[k] = hues(m[Y0 + r * RH:Y0 + (r + 1) * RH, X0 + c * RW:X0 + (c + 1) * RW])

    score = {}                                   # room number -> {key: agreement}
    for f in sorted(glob.glob(os.path.join(args.scr_dir, "room_*.scr"))):
        n = int(os.path.basename(f)[5:-4])
        q = hues(render_scr(open(f, "rb").read())[8:8 + RH, 8:8 + RW])
        score[n] = {k: float(np.mean(q == v)) for k, v in keys.items()}

    # chains: rooms joined by walking right, in order
    chains = []
    seen_rooms = set()
    for gf in args.graph:
        g = json.load(open(gf))
        right = {}
        for e in g["edges"]:
            if e["via"] == "right":
                a, b = int(e["from"].split(":")[0]), int(e["to"].split(":")[0])
                arr = e.get("arrive", {})
                # arrived at the left edge: a walk, not a fall; and both rooms
                # new to this survey, so the chain stays within one sector
                if a != b and arr.get("x", 0) <= 3 and a not in seen_rooms and b not in seen_rooms:
                    right.setdefault(a, b)
        heads = set(right) - set(right.values())
        for h in sorted(heads):
            chain, seen = [h], {h}
            while chain[-1] in right and right[chain[-1]] not in seen:
                chain.append(right[chain[-1]]); seen.add(chain[-1])
            if len(chain) > 1:
                chains.append(chain)
        seen_rooms |= {v["room"] for v in g["nodes"].values()}

    # every map room is one game room: chains claim cells first, best fit
    # first, then the rest take the best cell still free
    out, placed, used = {}, set(), set()
    fits = []
    for chain in chains:
        if any(n not in score for n in chain):
            continue
        for k in keys:
            r, c = map(int, k.split(","))
            cells = [f"{r},{c + i}" for i in range(len(chain))]
            if all(x in keys for x in cells):
                fits.append((sum(score[n][x] for n, x in zip(chain, cells)) / len(chain), chain, cells))
    fits.sort(key=lambda f: -f[0])
    for avg, chain, cells in fits:
        if any(n in placed for n in chain) or any(k in used for k in cells):
            continue
        if avg < 0.6:          # no row of the map holds this corridor: place its rooms singly
            continue
        for n, k in zip(chain, cells):
            out[n] = {"key": k, "score": round(score[n][k], 3), "chain": chain}
            placed.add(n); used.add(k)
        print(f"chain {chain} -> {cells}  ({avg:.3f} avg)")
    singles = sorted((n for n in score if n not in placed), key=lambda n: -max(score[n].values()))
    for n in singles:
        ranked = sorted(((v, k) for k, v in score[n].items() if k not in used), reverse=True)
        (s1, k1), (s2, k2) = ranked[0], ranked[1]
        out[n] = {"key": k1, "score": round(s1, 3), "runner": k2, "margin": round(s1 - s2, 3)}
        used.add(k1)
        flag = "" if s1 >= 0.6 and s1 - s2 >= 0.06 else "   <-- uncertain"
        print(f"room {n:3} -> {k1:6} {s1:.3f} (next {k2} {s2:.3f}){flag}")
    out = dict(sorted(out.items()))
    json.dump(out, open(args.out, "w"), indent=1)


if __name__ == "__main__":
    main()
