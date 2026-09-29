#!/usr/bin/env python3
"""Put back what the surveys missed, from the original's own walkthrough.

The cleaned rooms (data/emu/room_N.scr) and the gun tables (data/emu/guns.json)
come from surveys that began from snapshots taken part way through a game, so
a gun already shot, or a cup already drunk, by then is simply not in them. The
published walkthrough recording (dandare.rzx, played in Fuse, every frame
dumped - see tools/emu/README.md) enters every room with its things still in
place. data/emu/rzx_fixes.json lists what the first visit to a room shows and
the game lacked, each with the walkthrough frame it was read off
(data/emu/rzx/walk_N.scr, frame N of the recording):

  * a gun the tables never had ("add"): its cells go into the room's screen and
    the packed sheet, and it joins the table and the sheet's index, flagged to
    stand in front of the figures as the others are;
  * a gun the tables have but whose drawing the cleaned screen lost ("draw"):
    only its cells go back, so it is seen where it fires from;
  * a floor gun: joins the table and the index; the game draws it itself, so
    its cells are cleared from the backdrop;
  * a cup, tall or squat: joins the table and the index (the game draws it and
    takes it away);
  * a door slab: the one the original shows while the door holds, cut from a
    frame with it shut, and the doorway as a frame with it open shows it;
  * doors the original never draws: dropped from the index, so the game lays
    nothing over the wall there.

Then run tools/make_tiles.py --check. Running this twice changes nothing.

    python3 tools/apply_rzx_fixes.py
"""
import json, os, shutil, sys

import numpy as np
from PIL import Image

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from make_tiles import load_scr, save_scr, cell_rgb, read_index, VIEW_C0, VIEW_C1, VIEW_R0, VIEW_R1

SIZE = {"ceil": (2, 5), "wallL": (2, 2), "wallR": (2, 2), "floorgun": (1, 2), "tall": (2, 1), "squat": (1, 2)}
GUN_KIND = {"ceil": 0, "wallL": 1, "wallR": 2, "floorgun": 3}
CUP_KIND = {"squat": 0, "tall": 1}                  # the table's own kinds for the two cups
WALL = "#0000ff"                                    # what a shot fist leaves: bare bright blue wall


def main():
    screens, index_path, sheet_path = "data/emu", "js/rooms_sheet.js", "assets/rooms.png"
    fixes = json.load(open(os.path.join(screens, "rzx_fixes.json")))
    table = json.load(open(os.path.join(screens, "guns.json")))
    meta = read_index(index_path)
    sheet = np.array(Image.open(sheet_path).convert("RGB"))
    scr = {}                                        # room -> (tiles, attr), written back at the end

    def room_scr(n):
        if n not in scr: scr[n] = load_scr(os.path.join(screens, f"room_{n}.scr"))
        return scr[n]

    def frame(name):
        return load_scr(os.path.join(screens, "rzx", name))

    def set_solid(n, r, c):
        meta["solid"][n][r] |= 1 << c

    for o in fixes["objects"]:
        n, kind, r, c = o["room"], o["kind"], o["row"], o["col"]
        h, w = SIZE[kind]
        t, a = room_scr(n)
        if kind in ("ceil", "wallL", "wallR"):
            ft, fa = frame(o["frame"])
            for dr in range(h):
                for dc in range(w):
                    t[VIEW_R0 + r + dr, VIEW_C0 + c + dc] = ft[VIEW_R0 + r + dr, VIEW_C0 + c + dc]
                    a[VIEW_R0 + r + dr, VIEW_C0 + c + dc] = fa[VIEW_R0 + r + dr, VIEW_C0 + c + dc]
        elif kind == "floorgun":
            for dc in range(w): t[VIEW_R0 + r, VIEW_C0 + c + dc] = 0      # the floor course shows through
        if o["how"] != "add": continue
        entries = table.setdefault(n, [])
        if kind in GUN_KIND:
            row = {"y": r * 8, "col": c + VIEW_C0, "type": GUN_KIND[kind], "dead": False, "ptr": None}
            guns = meta["guns"].setdefault(n, [])
            if not any(g[0] == GUN_KIND[kind] and g[1] == c * 8 and g[2] == r * 8 for g in guns):
                guns.append([GUN_KIND[kind], c * 8, r * 8, w * 8, None if kind == "floorgun" else WALL])
        else:
            row = {"y": r * 8, "col": c + VIEW_C0, "type": CUP_KIND[kind], "dead": True, "ptr": None}
            items = meta["items"].setdefault(n, [])
            if not any(i[0] == c * 8 and i[1] == r * 8 for i in items):
                items.append([c * 8, r * 8, h * 8])
        if not any(e["y"] == row["y"] and e["col"] == row["col"] and e["type"] == row["type"] and e["dead"] == row["dead"]
                   for e in entries):
            entries.append(row)
        for dr in range(h):
            for dc in range(w): set_solid(n, r + dr, c + dc)

    for key, d in fixes["doors"].items():
        n = key.split(":")[0]
        r, c, h, w = d["row"], d["col"], d["h"], d["w"]
        st, sa = frame(d["shut"]); ot, oa = frame(d["open"])
        # the pair kept with the others, so tools/make_rooms.py --door can cut it again
        for tag, f in (("shut", d["shut"]), ("open", d["open"])):
            shutil.copyfile(os.path.join(screens, "rzx", f), os.path.join(screens, "doors", f"room_{n}_{tag}.scr"))
        t, a = room_scr(n)
        for dr in range(h):
            for dc in range(w):
                t[VIEW_R0 + r + dr, VIEW_C0 + c + dc] = ot[VIEW_R0 + r + dr, VIEW_C0 + c + dc]
                a[VIEW_R0 + r + dr, VIEW_C0 + c + dc] = oa[VIEW_R0 + r + dr, VIEW_C0 + c + dc]
        sx, sy = meta["doors"][key][:2]
        for dr in range(h):
            for dc in range(w):
                sheet[sy + dr * 8:sy + dr * 8 + 8, sx + dc * 8:sx + dc * 8 + 8] = cell_rgb(
                    st[VIEW_R0 + r + dr, VIEW_C0 + c + dc], int(sa[VIEW_R0 + r + dr, VIEW_C0 + c + dc]))
        meta["doors"][key] = [sx, sy, w * 8, h * 8, c * 8, r * 8]

    for key in fixes.get("hidden_doors", []):
        meta["doors"].pop(key, None)

    # the packed sheet says what the screens say, for every room
    for n in meta["rooms"]:
        path = os.path.join(screens, f"room_{n}.scr")
        if not os.path.exists(path): continue
        t, a = scr[n] if n in scr else load_scr(path)
        sx, sy = meta["rooms"][n]
        for r in range(VIEW_R1 - VIEW_R0):
            for c in range(VIEW_C1 - VIEW_C0):
                sheet[sy + r * 8:sy + r * 8 + 8, sx + c * 8:sx + c * 8 + 8] = cell_rgb(
                    t[VIEW_R0 + r, VIEW_C0 + c], int(a[VIEW_R0 + r, VIEW_C0 + c]))

    for n, (t, a) in scr.items(): save_scr(os.path.join(screens, f"room_{n}.scr"), t, a)
    Image.fromarray(sheet).save(sheet_path, optimize=True)
    with open(os.path.join(screens, "guns.json"), "w") as f: f.write(json.dumps(table, indent=0))
    s = open(index_path).read()
    head = s[:s.index("window.ROOMS_SHEET = ")]
    with open(index_path, "w") as f: f.write(head + "window.ROOMS_SHEET = " + json.dumps(meta) + ";\n")
    print(f"{len(fixes['objects'])} things and {len(fixes['doors'])} door put back in {len(scr)} rooms; "
          f"{len(fixes.get('hidden_doors', []))} doors the original never draws dropped")


if __name__ == "__main__":
    main()
