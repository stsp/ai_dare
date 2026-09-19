"""Compose the title picture from the hi-res render, laid out as the original's
loading screen: the plaque top left, Dan's portrait under it, the Mekon's
portrait to the right over a wall of blue panels.  The plaque is left blank -
the game letters it, so the story can rename it.

    python3 tools/make_title.py [RENDER.png] [-o assets/title.png]
"""
import sys
from collections import deque
from PIL import Image, ImageDraw, ImageFilter

W, H = 1024, 768                      # 256x192 at four times, as the original's screen
K = 4


def figure_mask(im):
    """The render's figures stand on a checkerboard: flood the light, grey
    squares in from the border and keep everything they do not reach."""
    px = im.load()
    w, h = im.size
    seen = bytearray(w * h)
    q = deque()

    def light(x, y):
        # the checkerboard's two greys, and the soft grey shadow the render
        # casts on it - anything colourless and not dark, reached from outside
        r, g, b = px[x, y][:3]
        return min(r, g, b) >= 120 and max(r, g, b) - min(r, g, b) <= 14

    for x in range(w):
        for y in (0, h - 1):
            if light(x, y) and not seen[y * w + x]:
                seen[y * w + x] = 1; q.append((x, y))
    for y in range(h):
        for x in (0, w - 1):
            if light(x, y) and not seen[y * w + x]:
                seen[y * w + x] = 1; q.append((x, y))
    while q:
        x, y = q.popleft()
        for nx, ny in ((x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1)):
            if 0 <= nx < w and 0 <= ny < h and not seen[ny * w + nx] and light(nx, ny):
                seen[ny * w + nx] = 1; q.append((nx, ny))
    mask = Image.frombytes("L", (w, h), bytes(0 if s else 255 for s in seen))
    # shave the fringe the flood leaves along the outline, and keep the edge crisp
    return mask.filter(ImageFilter.MinFilter(5))


def cut(im, mask, box):
    fig = im.crop(box).convert("RGBA")
    fig.putalpha(mask.crop(box))
    return fig


def fit(fig, box_w, box_h):
    """Scale the figure to fill the box's height, keeping its proportions."""
    k = box_h / fig.height
    return fig.resize((round(fig.width * k), box_h), Image.LANCZOS)


def tech_wall(w, h):
    """The Mekon's backdrop: a wall of blue panels with a few lit tell-tales."""
    im = Image.new("RGB", (w, h))
    d = ImageDraw.Draw(im)
    for y in range(h):                          # a slow gradient, darker at the top
        t = y / h
        d.line([(0, y), (w, y)], fill=(0, 0, int(120 + 90 * t)))
    import random
    rnd = random.Random(7)
    y = 8
    while y < h:
        x = 6
        ph = rnd.choice((44, 60, 76))
        while x < w:
            pw = rnd.choice((36, 52, 68))
            d.rounded_rectangle([x, y, x + pw, y + ph], radius=6, outline=(70, 90, 255), width=3)
            d.rounded_rectangle([x + 6, y + 6, x + pw - 6, y + ph - 6], radius=4, outline=(30, 40, 200), width=2)
            if rnd.random() < 0.25:             # a tell-tale light
                c = rnd.choice(((255, 40, 40), (255, 60, 255), (60, 255, 255), (255, 230, 60)))
                d.ellipse([x + pw // 2 - 5, y + ph // 2 - 5, x + pw // 2 + 5, y + ph // 2 + 5], fill=c)
            x += pw + 10
        y += ph + 12
    return im.filter(ImageFilter.GaussianBlur(0.6))


def main():
    args = sys.argv[1:]
    out = "assets/title.png"
    if "-o" in args:
        i = args.index("-o"); out = args[i + 1]; del args[i:i + 2]
    src = args[0] if args else "VeniceAI_iTeLVFHr_czj_0_0.png"
    im = Image.open(src).convert("RGB")
    mask = figure_mask(im)

    # the two heads, boxed by hand on the 2816x1584 render
    dan = cut(im, mask, (860, 20, 1420, 620))       # cap to chest
    mekon = cut(im, mask, (1500, 130, 2000, 690))   # dome to collar

    page = Image.new("RGB", (W, H), (255, 255, 255))
    d = ImageDraw.Draw(page)

    # the Mekon's panel, right, over the tech wall: composed apart, so the
    # figure is clipped to its panel and never crosses the frame's lines
    rx0, ry0, rx1, ry1 = 120 * K, 3 * K, 253 * K, 189 * K
    right = tech_wall(rx1 - rx0, ry1 - ry0)
    mk = fit(mekon, rx1 - rx0, int((ry1 - ry0) * 1.02))
    right.paste(mk, ((rx1 - rx0 - mk.width) // 2, ry1 - ry0 - mk.height), mk)
    page.paste(right, (rx0, ry0))

    # Dan's panel, left, under the plaque
    lx0, ly0, lx1, ly1 = 3 * K, 43 * K, 116 * K, 189 * K
    left = Image.new("RGB", (lx1 - lx0, ly1 - ly0))
    pd = ImageDraw.Draw(left)
    for y in range(left.height):
        t = y / left.height
        pd.line([(0, y), (left.width, y)], fill=(int(10 + 20 * t), int(12 + 22 * t), int(30 + 40 * t)))
    dn = fit(dan, lx1 - lx0, int((ly1 - ly0) * 0.97))       # the cap stays clear of the line above
    left.paste(dn, ((lx1 - lx0 - dn.width) // 2, ly1 - ly0 - dn.height), dn)
    page.paste(left, (lx0, ly0))

    # the frame's lines
    d.rectangle([0, 0, W - 1, H - 1], outline=(0, 0, 0), width=2)
    d.rectangle([2 * K, 2 * K, W - 1 - 2 * K, H - 1 - 2 * K], outline=(0, 0, 0), width=2)
    d.rectangle([lx0, ly0, lx1, ly1], outline=(0, 0, 0), width=2)
    d.rectangle([rx0, ry0, rx1, ry1], outline=(0, 0, 0), width=2)

    # the plaque, blank - the game letters it - raised off the page as the
    # original's is: a black shadow to the right and below, and a black rim
    px0, py0, px1, py1 = 2 * K, 2 * K, 176 * K, 41 * K
    d.rectangle([px0 + 3 * K, py0 + 2 * K, px1 + 3 * K, py1 + 2 * K], fill=(0, 0, 0))
    d.rectangle([px0, py0, px1, py1], fill=(214, 0, 0), outline=(0, 0, 0), width=K)
    page.save(out)
    print("wrote", out, page.size)


if __name__ == "__main__":
    main()
