#!/usr/bin/env python3
"""Draw the extracted geometry back over the map, so a misreading is visible.

    python3 tools/validate_level.py MAP.png level.json [ROOM ...] [-o out.png]

Overlays, per room: lift rails and field (green), walls Ai collides with (red
hatch), scenery (yellow outline), floors and ledges (white line), holes in the
floor (magenta), and edge openings (cyan ticks at the open rows).
"""
import argparse
import json

from PIL import Image, ImageDraw

X0, Y0, RW, RH, CS = 31, 39, 240, 144, 8
Z = 2


def draw_room(img, room):
    TW, TH = 30, 18
    im = img.resize((RW * Z, RH * Z), Image.NEAREST).convert("RGBA")
    ov = Image.new("RGBA", im.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(ov)
    cells = room["cells"]
    for j in range(TH):
        for i in range(TW):
            v = cells[j * TW + i]
            x, y = i * CS * Z, j * CS * Z
            if v == "4":
                d.rectangle([x, y, x + CS * Z - 1, y + CS * Z - 1], fill=(255, 0, 0, 70))
                d.line([x, y, x + CS * Z, y + CS * Z], fill=(255, 0, 0, 160))
            elif v == "1":
                d.rectangle([x + 1, y + 1, x + CS * Z - 2, y + CS * Z - 2], outline=(255, 255, 0, 150))
            elif v in "25":
                d.rectangle([x, y, x + CS * Z - 1, y + CS * Z - 1],
                            fill=(0, 255, 0, 90 if v == "2" else 40))
    for p in room["platforms"]:
        y = p["y"] * CS * Z
        d.line([p["x0"] * CS * Z, y, p["x1"] * CS * Z, y], fill=(255, 255, 255, 230), width=3)
    for a, b in room.get("holes", []):
        y = (TH - 2) * CS * Z
        d.line([a * CS * Z, y, b * CS * Z, y], fill=(255, 0, 255, 230), width=5)
    for side, x in (("left", 2), ("right", RW * Z - 3)):
        for row in room[side]["open"]:
            y = row * CS * Z
            d.rectangle([x - 2, y - 24, x + 2, y], fill=(0, 255, 255, 220))
    return Image.alpha_composite(im, ov)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("map")
    ap.add_argument("level")
    ap.add_argument("rooms", nargs="*")
    ap.add_argument("-o", "--out", default="validate.png")
    ap.add_argument("--cols", type=int, default=4)
    args = ap.parse_args()
    m = Image.open(args.map).convert("RGB")
    lv = json.load(open(args.level))
    keys = args.rooms or sorted(lv["rooms"], key=lambda k: tuple(map(int, k.split(","))))
    tiles = []
    for k in keys:
        r, c = map(int, k.split(","))
        crop = m.crop((X0 + c * RW, Y0 + r * RH, X0 + (c + 1) * RW, Y0 + (r + 1) * RH))
        t = draw_room(crop, lv["rooms"][k])
        ImageDraw.Draw(t).text((4, 4), k, fill=(255, 255, 255, 255))
        tiles.append(t)
    cols = args.cols
    rows = (len(tiles) + cols - 1) // cols
    sheet = Image.new("RGBA", (cols * (RW * Z + 6), rows * (RH * Z + 6)), (40, 40, 40, 255))
    for i, t in enumerate(tiles):
        sheet.paste(t, ((i % cols) * (RW * Z + 6), (i // cols) * (RH * Z + 6)))
    sheet.save(args.out)
    print(f"{len(tiles)} rooms -> {args.out}")


if __name__ == "__main__":
    main()
