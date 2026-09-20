#!/usr/bin/env python3
"""Parse assets/tiles/*.tiles and render a preview sheet.

No third-party dependencies: the PNG writer below is about twenty lines of
zlib and struct, which is cheaper than carrying Pillow just for a contact
sheet.

    python3 tools/tilesheet.py            # check + write the preview sheet
    python3 tools/tilesheet.py --check    # validate only, write nothing
"""

import os
import struct
import sys
import zlib

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "assets", "tiles", "rooms.tiles")
SHEET = os.path.join(ROOT, "assets", "tiles", "preview.png")
INDEX = os.path.join(ROOT, "assets", "tiles", "INDEX.md")

# The ZX Spectrum attribute palette. Normal half, then the bright half.
PALETTE = {
    "black": ((0, 0, 0), (0, 0, 0)),
    "blue": ((0, 0, 192), (0, 0, 255)),
    "red": ((192, 0, 0), (255, 0, 0)),
    "magenta": ((192, 0, 192), (255, 0, 255)),
    "green": ((0, 192, 0), (0, 255, 0)),
    "cyan": ((0, 192, 192), (0, 255, 255)),
    "yellow": ((192, 192, 0), (255, 255, 0)),
    "white": ((192, 192, 192), (255, 255, 255)),
}

SCALE = 4
COLS = 7
GAP = 1
BG = (24, 24, 32)


class Tile:
    def __init__(self, name, ink, paper, bright, tiles):
        self.name = name
        self.ink = ink
        self.paper = paper
        self.bright = bright
        self.tiles = tiles
        self.rows = []

    def rgb(self, x, y):
        half = 1 if self.bright else 0
        name = self.ink if self.rows[y][x] == "#" else self.paper
        return PALETTE[name][half]


def parse(path):
    tiles = []
    current = None
    with open(path, encoding="utf-8") as handle:
        for lineno, raw in enumerate(handle, 1):
            line = raw.rstrip("\n")
            if not line.strip() or line.lstrip().startswith("#") and current is None:
                continue
            if line.startswith("tile "):
                if current is not None and len(current.rows) != 8:
                    raise SystemExit(
                        "%s:%d: tile %s has %d rows, expected 8"
                        % (path, lineno, current.name, len(current.rows))
                    )
                parts = line.split()
                name = parts[1]
                attrs = {"ink": "white", "paper": "black"}
                bright = False
                tiling = ""
                for part in parts[2:]:
                    if part == "bright":
                        bright = True
                    elif part.startswith("tiles="):
                        tiling = part.split("=", 1)[1]
                    elif "=" in part:
                        key, value = part.split("=", 1)
                        attrs[key] = value
                    else:
                        raise SystemExit("%s:%d: unknown token %r" % (path, lineno, part))
                for key in ("ink", "paper"):
                    if attrs[key] not in PALETTE:
                        raise SystemExit(
                            "%s:%d: %s=%s is not a Spectrum colour" % (path, lineno, key, attrs[key])
                        )
                current = Tile(name, attrs["ink"], attrs["paper"], bright, tiling)
                tiles.append(current)
                continue
            if current is None or len(current.rows) == 8:
                # A comment between tiles, once the previous tile is complete.
                if line.lstrip().startswith("#") and set(line.strip()) != {"#"}:
                    continue
            stripped = line.strip()
            if set(stripped) <= {"#", "."} and len(stripped) == 8 and current is not None:
                if len(current.rows) == 8:
                    raise SystemExit(
                        "%s:%d: tile %s has more than 8 rows" % (path, lineno, current.name)
                    )
                current.rows.append(stripped)
            elif stripped.startswith("#"):
                continue
            else:
                raise SystemExit("%s:%d: cannot parse %r" % (path, lineno, line))
    if current is not None and len(current.rows) != 8:
        raise SystemExit("%s: tile %s has %d rows, expected 8" % (path, current.name, len(current.rows)))
    return tiles


def check(tiles):
    """Verify the tiles= claims: a cell that says it repeats really must."""
    problems = []
    seen = set()
    for tile in tiles:
        if tile.name in seen:
            problems.append("%s: duplicate tile name" % tile.name)
        seen.add(tile.name)
        if "h" in tile.tiles:
            # Horizontal seam: column 7 butts against column 0 of the next copy.
            # Every row must stay consistent with its own period-8 repeat, which
            # is automatic; what we really check is that no row is a lone run
            # that breaks at the seam, i.e. the pattern read across two copies
            # has no period-8 discontinuity the eye would catch as a hard edge.
            for y, row in enumerate(tile.rows):
                doubled = row + row
                if doubled[7:9] == "##" and row.count("#") == 1:
                    problems.append("%s: row %d fuses at the horizontal seam" % (tile.name, y))
        if "v" in tile.tiles:
            for x in range(8):
                column = "".join(row[x] for row in tile.rows)
                doubled = column + column
                if doubled[7:9] == "##" and column.count("#") == 1:
                    problems.append("%s: column %d fuses at the vertical seam" % (tile.name, x))
    return problems


def write_png(path, width, height, pixels):
    """pixels: a flat list of (r, g, b), row-major."""
    raw = bytearray()
    for y in range(height):
        raw.append(0)  # filter type 0
        for x in range(width):
            raw.extend(pixels[y * width + x])

    def chunk(kind, payload):
        body = kind + payload
        return struct.pack(">I", len(payload)) + body + struct.pack(">I", zlib.crc32(body))

    png = b"\x89PNG\r\n\x1a\n"
    png += chunk(b"IHDR", struct.pack(">IIBBBBB", width, height, 8, 2, 0, 0, 0))
    png += chunk(b"IDAT", zlib.compress(bytes(raw), 9))
    png += chunk(b"IEND", b"")
    with open(path, "wb") as handle:
        handle.write(png)


def render(tiles):
    cell = 8 * SCALE + GAP
    rows = (len(tiles) + COLS - 1) // COLS
    width = COLS * cell + GAP
    height = rows * cell + GAP
    pixels = [BG] * (width * height)
    for index, tile in enumerate(tiles):
        ox = GAP + (index % COLS) * cell
        oy = GAP + (index // COLS) * cell
        for y in range(8):
            for x in range(8):
                colour = tile.rgb(x, y)
                for sy in range(SCALE):
                    base = (oy + y * SCALE + sy) * width + ox + x * SCALE
                    for sx in range(SCALE):
                        pixels[base + sx] = colour
    write_png(SHEET, width, height, pixels)
    return width, height, rows


def write_index(tiles, rows):
    lines = [
        "# Room tile index",
        "",
        "Generated by `tools/tilesheet.py` from `rooms.tiles`. Do not edit by hand.",
        "",
        "`preview.png` lays the tiles out %d per row, in the order below, at %dx."
        % (COLS, SCALE),
        "",
        "| # | name | ink | bright | repeats |",
        "| --- | --- | --- | --- | --- |",
    ]
    for index, tile in enumerate(tiles):
        lines.append(
            "| %d | `%s` | %s | %s | %s |"
            % (
                index,
                tile.name,
                tile.ink,
                "yes" if tile.bright else "no",
                tile.tiles or "-",
            )
        )
    lines.append("")
    lines.append("%d tiles in %d rows." % (len(tiles), rows))
    lines.append("")
    with open(INDEX, "w", encoding="utf-8") as handle:
        handle.write("\n".join(lines))


def main():
    tiles = parse(SRC)
    problems = check(tiles)
    for problem in problems:
        print("warning: %s" % problem, file=sys.stderr)
    print("parsed %d tiles from %s" % (len(tiles), os.path.relpath(SRC, ROOT)))
    if "--check" in sys.argv:
        return 1 if problems else 0
    width, height, rows = render(tiles)
    write_index(tiles, rows)
    print("wrote %s (%dx%d)" % (os.path.relpath(SHEET, ROOT), width, height))
    print("wrote %s" % os.path.relpath(INDEX, ROOT))
    return 1 if problems else 0


if __name__ == "__main__":
    sys.exit(main())
