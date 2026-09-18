#!/usr/bin/env python3
"""Build assets/dan.png from the Dan renders in the repository root.

Each render is one pose on a fake checkerboard, with a caption and a panel
border. The checkerboard is recognised by its two grey levels, captions and
borders are separate blobs, and the figure is the largest thing left. Frames
are scaled so a running Dan stands DAN_H screen cells tall, packed into one
sheet at 3x (the canvas scale, so the game draws them 1:1), and described in
js/dan_sheet.js: where each frame sits, and where his body is within it so the
hit box can be centred on him rather than on the rifle.

Usage: python3 tools/make_sprites.py
"""
import json

import cv2
import numpy as np
from PIL import Image

SCALE = 3            # canvas pixels per screen pixel
RUN_H = 33           # a running frame, in screen pixels (hit box is 32)
FRAMES = {           # sheet name -> render in the repository root
    "fire": "VeniceAI_2KHeIZa68KmmRm_0.png",
    "kneel": "VeniceAI_2KHeIZa68KmmRm_1.png",
    "run1": "VeniceAI_2KHeIZa68KmmRm_2.png",
    "run2": "VeniceAI_2KHeIZa68KmmRm_3.png",
    "jump": "VeniceAI_WPP_sYd1siUeoh_1.png",
}


def cut(path):
    im = np.array(Image.open(path).convert("RGB")).astype(np.int16)
    h, w = im.shape[:2]
    r, g, b = im[..., 0], im[..., 1], im[..., 2]
    grey = (np.abs(r - g) < 14) & (np.abs(g - b) < 14) & (np.abs(r - b) < 14)
    v = im.max(axis=2)
    cand = (grey & (v > 100)).astype(np.uint8)

    n, lab, stats, _ = cv2.connectedComponentsWithStats(cand, connectivity=4)
    areas = stats[1:, cv2.CC_STAT_AREA]
    main = 1 + int(np.argmax(areas))
    # the checkerboard's two grey levels, from its biggest patch
    hist = np.bincount(v[lab == main], minlength=256)
    peaks = np.argsort(hist)[::-1]
    lo = hi = int(peaks[0])
    for p in peaks[1:]:
        if abs(int(p) - lo) > 12:
            hi = int(p)
            break
    lo, hi = sorted((lo, hi))

    def is_checker(i):
        vals = v[lab == i]
        near_lo = np.mean(np.abs(vals - lo) < 10)
        near_hi = np.mean(np.abs(vals - hi) < 10)
        return stats[i, cv2.CC_STAT_AREA] > 0.01 * h * w or \
            (stats[i, cv2.CC_STAT_AREA] > 300 and near_lo > 0.2 and near_hi > 0.2)

    bg = np.isin(lab, [i for i in range(1, n) if is_checker(i)])
    fg = (~bg).astype(np.uint8)
    n2, lab2, st2, _ = cv2.connectedComponentsWithStats(fg, connectivity=8)
    big = 1 + int(np.argmax(st2[1:, cv2.CC_STAT_AREA]))
    fig = (lab2 == big).astype(np.uint8)
    fig = cv2.morphologyEx(fig, cv2.MORPH_CLOSE, np.ones((5, 5), np.uint8))
    ys, xs = np.where(fig)
    x0, x1, y0, y1 = xs.min(), xs.max() + 1, ys.min(), ys.max() + 1
    rgb = im[y0:y1, x0:x1].astype(np.float32)
    a = fig[y0:y1, x0:x1].astype(np.float32)
    return rgb, a


def shrink(rgb, a, scale):
    """Premultiplied downscale, so the checker never bleeds into the edge."""
    h, w = a.shape
    size = (max(1, round(w * scale)), max(1, round(h * scale)))
    pm = rgb * a[..., None]
    pm = cv2.resize(pm, size, interpolation=cv2.INTER_AREA)
    aa = cv2.resize(a, size, interpolation=cv2.INTER_AREA)
    rgb2 = pm / np.maximum(aa, 1e-3)[..., None]
    out = np.dstack([np.clip(rgb2, 0, 255), np.clip(aa * 255, 0, 255)]).astype(np.uint8)
    return out


def head_of(rgb, a):
    """Dan's head from a cut: the rows from the cap down to the chin, the
    columns the head itself spans (the shoulders, which begin a little above
    the chin at the back, are cut off). Returns the crop and where the neck's
    centre is within it."""
    h = a.shape[0]
    rows = [np.where(a[y] > 0.5)[0] for y in range(h)]
    front = float(np.median([r.max() for r in rows[int(h * 0.08):int(h * 0.18)] if len(r)]))
    back = float(np.median([r.min() for r in rows[int(h * 0.08):int(h * 0.18)] if len(r)]))
    width = front - back
    # the chin: where the face's front recedes; the neck row is just above it
    chin = next(y for y in range(int(h * 0.12), int(h * 0.4)) if len(rows[y]) and rows[y].max() < front - 0.2 * width)
    # the shoulders begin where the figure suddenly widens; the columns the
    # head spans (peak of the cap included) come from the rows above that
    shoulders = next(y for y in range(int(h * 0.1), chin + 1) if len(rows[y]) and rows[y].max() - rows[y].min() > 1.4 * width)
    x0 = int(min(r.min() for r in rows[:shoulders] if len(r)))
    x1 = int(max(r.max() for r in rows[:shoulders] if len(r))) + 1
    crop_a = a[:chin, x0:x1].copy()
    crop_rgb = rgb[:chin, x0:x1]
    cx = (front + back) / 2 - x0
    return crop_rgb, crop_a, cx


def main():
    cuts = {name: cut(f) for name, f in FRAMES.items()}
    ref_h = cuts["run1"][1].shape[0]
    scale = RUN_H * SCALE / ref_h

    # the head alone, for the drawn figure to wear: from the running frame,
    # at the same scale as the frames, its neck at the bottom edge
    hrgb, ha, hcx = head_of(*cuts["run1"])
    head = shrink(hrgb, ha, scale)
    Image.fromarray(head, "RGBA").save("assets/dan_head.png", optimize=True)
    head_meta = {"image": "assets/dan_head.png", "scale": SCALE, "w": head.shape[1], "h": head.shape[0],
                 "cx": round(hcx * scale / SCALE, 1)}

    frames, x = {}, 0
    tiles = []
    for name in FRAMES:
        rgb, a = cuts[name]
        tile = shrink(rgb, a, scale)
        th, tw = tile.shape[:2]
        # body centre: where the head is, from the top fifth of the figure
        head = tile[: th // 5, :, 3].astype(np.float32)
        cols = head.sum(axis=0)
        cx = float((cols * np.arange(tw)).sum() / max(cols.sum(), 1))
        frames[name] = {"x": x, "y": 0, "w": tw, "h": th, "cx": round(cx / SCALE, 1)}
        tiles.append(tile)
        x += tw + SCALE
    sheet_h = max(t.shape[0] for t in tiles)
    sheet = np.zeros((sheet_h, x, 4), np.uint8)
    for (name, fr), tile in zip(frames.items(), tiles):
        # feet on the sheet's bottom edge, so every frame stands on the floor
        fr["y"] = sheet_h - fr["h"]
        sheet[fr["y"]:fr["y"] + fr["h"], fr["x"]:fr["x"] + fr["w"]] = tile
    Image.fromarray(sheet, "RGBA").save("assets/dan.png", optimize=True)
    meta = {"image": "assets/dan.png", "scale": SCALE, "frames": frames, "head": head_meta}
    with open("js/dan_sheet.js", "w") as f:
        f.write("// generated by tools/make_sprites.py\nwindow.DAN_SHEET = "
                + json.dumps(meta) + ";\n")
    for name, fr in frames.items():
        print(f"{name:6} {fr['w'] // SCALE}x{fr['h'] // SCALE} cells, body at {fr['cx']}")
    print(f"head   {head_meta['w'] // SCALE}x{head_meta['h'] // SCALE} cells, neck at {head_meta['cx']}")


if __name__ == "__main__":
    main()
