#!/usr/bin/env python3
"""Render extracted geometry back over the source map, to check the extraction.

Produces a side-by-side sheet: original screen | screen with the extracted
platforms (green), walls (red) and grav-lifts (yellow) drawn on top. If the
overlay does not sit on the floors and shafts you can see in the original,
the extractor is wrong.

Usage: python3 tools/validate_level.py DanDare1.png level.json [-o out.png] [-n 4]
"""
import argparse
import json
import random

from PIL import Image, ImageDraw

X0, Y0, RW, RH, CS = 31, 39, 240, 144, 8


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("map")
    ap.add_argument("level")
    ap.add_argument("-o", "--out", default="validate.png")
    ap.add_argument("-n", type=int, default=4)
    ap.add_argument("--rooms", help="comma list of r,c;r,c to render instead of random")
    ap.add_argument("--zoom", type=int, default=2)
    args = ap.parse_args()

    img = Image.open(args.map).convert("RGB")
    level = json.load(open(args.level))
    rooms = level["rooms"]

    if args.rooms:
        keys = args.rooms.split(";")
    else:
        random.seed(7)
        keys = random.sample(sorted(rooms), args.n)

    z, pad = args.zoom, 6
    sheet = Image.new("RGB", (RW * z * 2 + pad * 3, len(keys) * (RH * z + pad) + pad), (30, 30, 30))

    for n, key in enumerate(keys):
        r, c = map(int, key.split(","))
        box = (X0 + c * RW, Y0 + r * RH, X0 + (c + 1) * RW, Y0 + (r + 1) * RH)
        orig = img.crop(box).resize((RW * z, RH * z), Image.NEAREST)
        over = orig.copy()
        d = ImageDraw.Draw(over)
        room = rooms[key]
        for w in room["walls"]:
            d.rectangle([w["x"] * CS * z, w["y0"] * CS * z,
                         (w["x"] + 1) * CS * z - 1, w["y1"] * CS * z - 1],
                        outline=(255, 40, 40), width=z)
        for p in room["platforms"]:
            d.rectangle([p["x0"] * CS * z, p["y"] * CS * z,
                         p["x1"] * CS * z - 1, (p["y"] + 1) * CS * z - 1],
                        fill=None, outline=(40, 255, 40), width=z)
        for l in room["lifts"]:
            d.rectangle([l["x"] * CS * z, l["y0"] * CS * z,
                         (l["x"] + 1) * CS * z - 1, l["y1"] * CS * z - 1],
                        outline=(255, 255, 0), width=z)
        y = pad + n * (RH * z + pad)
        sheet.paste(orig, (pad, y))
        sheet.paste(over, (pad * 2 + RW * z, y))
        d2 = ImageDraw.Draw(sheet)
        d2.text((pad + 3, y + 3), key, fill=(255, 255, 255))

    sheet.save(args.out)
    print("saved", args.out, sheet.size, "rooms:", keys)


if __name__ == "__main__":
    main()
