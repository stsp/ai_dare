# The rooms as tiles

The original has no picture of a room anywhere. It draws each screen the way
the Spectrum draws everything: a grid of 8x8 cells, each cell one bitmap out of
a small set, with two colours of its own. A room is a layout over that set, and
a screen's worth of machinery — the floors, the ledges, the rails of the
grav-lifts, the columns, the pipes, the lamps, the panels — is a few hundred
bitmaps used again and again.

The game now works the same way. Nothing of the world is stored as a picture:

* **`assets/tiles.png`** — the tile set. 324 bitmaps of 8x8, 16 across, a set
  pixel drawn white. 3.5 kB for all 121 rooms.
* **`js/rooms_tiles.js`** — the layouts. For every room, and for every sector
  door's slab, two grids of 18 rows by 30 cells: which tile stands in each
  cell, and which pair of colours it wears.
* **`js/tiles.js`** — the game lays those grids out once, at load, into the
  sheet the drawing code reads.

So redrawing the world means redrawing `assets/tiles.png`: 324 little bitmaps,
in place of 121 screens. Nothing else has to change.

## Building them

    python3 tools/make_tiles.py --check

reads the cleaned screens (`data/emu/room_N.scr`, dumped from the original in
the emulator by `tools/emu/emu_bfs.js` and cleaned of sprites by
`tools/make_rooms.py`) and the door slabs `tools/make_rooms.py` cut into
`assets/rooms.png`, collects every distinct bitmap once, and writes the two
files above. `assets/rooms.png` stays as that tool's output, a step in the
build; the game no longer loads it. `--check` rebuilds every room from the tiles
and compares it with `assets/rooms.png` cell by cell; it reports 0 cells
differing, so the tiles are the original's own screens, exactly.

Three rooms - 189, 190 and 221 - were dumped after Ai had shot their ceiling
gun, so their cleaned screens held what was left of a visor where the game
expected a standing one. `make_tiles.py` puts the visor the other 44 guns agree
on back over them (`--no-repair-guns` leaves them as dumped) and writes the
repaired screens back to `data/emu`.

    NODE_PATH=... node tools/check_tiles.js out.png

does the same check against the game itself: it saves the sheet the game builds
out of the tiles in the browser, which is pixel for pixel `assets/rooms.png`.

## What the rooms are made of

    python3 tools/inventory_tiles.py

sorts every cell of every room into the element it belongs to — from the
original's own tables where they say (the gun table, the grav-lifts' arrows and
call buttons, the doors, the flag map of what stops Ai and what is drawn in
front of him) and from the layouts themselves where they do not — and draws
`docs/tile-chart.png`, every tile under its element.

A tile is not one thing: the same dithered cell is the back wall of one room and
the face of a pillar in another, so what is counted below is cells, and each
element lists the tiles it is built from.

| element | tiles | cells | rooms | what it is |
|---|---:|---:|---:|---|
| empty | 1 | 28972 | 121 | the dark of the room behind everything |
| band | 6 | 5580 | 100 | the striped courses that top and tail a room; the pattern repeats every four columns |
| floor course | 4 | 6510 | 120 | a floor or ceiling laid right across the room in one tile |
| wall or ledge | 89 | 3436 | 108 | what the original's flag map says stops Ai: the walls and the ledges he stands on |
| side wall | 7 | 3717 | 95 | the two columns of cells down either edge of a room |
| column or pipe | 12 | 3222 | 99 | one tile laid down a run of six cells or more, away from the edges |
| fitting in front of Ai | 202 | 12717 | 119 | what the flag map has the original draw over the figures: walkways, shafts, machinery |
| panel or lamp | 59 | 379 | 5 | the dials, lamps and panels the flag map leaves alone |
| lift rail | 12 | 188 | 43 | the dotted rails a grav-lift's arrow stands between |
| lift arrow | 17 | 136 | 75 | the arrow cell beside a shaft: it scrolls a pixel every four frames, so a cleaned backdrop mostly has it blank and the game draws it |
| lift button | 1 | 8 | 4 | the round call button, whose colours cycle while a lift is called or moving |
| wall gun | 8 | 104 | 15 | the fist mounted on a wall, two cells by two, facing left or right |
| ceiling gun | 10 | 470 | 28 | the visor high on a wall, five cells by two; one drawing in every room |
| door | 11 | 72 | 6 | the six sector doors' slabs, two cells by six |
| mechanism | 6 | 20 | 1 | the five spheres of the mechanism, each two cells by two |

313 of the 324 tiles stand in rooms; the other 11 are the door slabs' own.

## What is not a tile yet

Five things the original keeps in its rooms are drawn by the game from bitmaps
of its own rather than from the tile set, because they move or are taken:

* the **floor gun** (20 of them) and its crushed hat — `GUN_BITS` in
  `js/guns.js`; the backdrop under a floor gun is the bare floor course. The
  visor of a ceiling gun, in contrast, is in the tile set, and a shot one is
  drawn out of those same tiles: `GUN_BITS.shot` is the mask of what the
  original leaves standing of it;
* the **cup of energy** — `CUP_BITS` in `js/game.js`, in six rooms;
* the **part of the mechanism** — the box Ai carries, `PART_BITS` in
  `js/figures.js`, in five rooms;
* the **grav-lift's arrow**, drawn in whatever phase its scroll is in —
  `ROOMS_SHEET.arrow`;
* the **lift's call button** while it blinks — `LIFT_BUTTON` in `js/game.js`.

All five were read off the original's screens and are its own drawings; moving
them into the tile set would leave the world with one set of graphics to
replace instead of two.
