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
    pal = np.array([(0, 0, 0), (0, 0, 216), (216, 0, 0), (216, 0, 216),
                    (0, 216, 0), (0, 216, 216), (216, 216, 0), (216, 216, 216)])
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
    ap.add_argument("--graph")
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
    if args.graph:
        g = json.load(open(args.graph))
        right = {}
        for e in g["edges"]:
            if e["via"] == "right":
                a, b = int(e["from"].split(":")[0]), int(e["to"].split(":")[0])
                arr = e.get("arrive", {})
                if a != b and arr.get("x", 0) <= 3:      # arrived at the left edge: a walk, not a fall
                    right.setdefault(a, b)
        heads = set(right) - set(right.values())
        for h in sorted(heads):
            chain, seen = [h], {h}
            while chain[-1] in right and right[chain[-1]] not in seen:
                chain.append(right[chain[-1]]); seen.add(chain[-1])
            if len(chain) > 1:
                chains.append(chain)

    out, placed = {}, set()
    for chain in chains:
        if any(n not in score for n in chain):
            continue
        best = None
        for k in keys:
            r, c = map(int, k.split(","))
            cells = [f"{r},{c + i}" for i in range(len(chain))]
            if not all(x in keys for x in cells):
                continue
            total = sum(score[n][x] for n, x in zip(chain, cells))
            if best is None or total > best[0]:
                best = (total, cells)
        if best:
            for n, k in zip(chain, best[1]):
                out[n] = {"key": k, "score": round(score[n][k], 3), "chain": chain}
                placed.add(n)
            print(f"chain {chain} -> {best[1]}  ({best[0] / len(chain):.3f} avg)")
    for n in sorted(score):
        ranked = sorted(score[n].items(), key=lambda kv: -kv[1])
        (k1, s1), (k2, s2) = ranked[0], ranked[1]
        if n in placed:
            if out[n]["key"] != k1:
                print(f"room {n:3} -> {out[n]['key']} by chain (alone it would pick {k1} {s1:.3f})")
            continue
        out[n] = {"key": k1, "score": round(s1, 3), "runner": k2, "margin": round(s1 - s2, 3)}
        flag = "" if s1 >= 0.6 and s1 - s2 >= 0.06 else "   <-- uncertain"
        print(f"room {n:3} -> {k1:6} {s1:.3f} (next {k2} {s2:.3f}){flag}")
    json.dump(out, open(args.out, "w"), indent=1)


if __name__ == "__main__":
    main()
