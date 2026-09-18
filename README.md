# Dan Dare — web recreation

A browser recreation of *Dan Dare: Pilot of the Future* (Gang of Five / Virgin
Games, 1986, ZX Spectrum), built by reading the game's room layouts out of the
published screen map at
[maps.speccy.cz](https://maps.speccy.cz/maps/DanDare1.png).

Open `index.html` in a browser. No build step, no dependencies, no server.

```
O / P  or  ← →     run                Q / ↑    jump, and ride grav-lifts
A / ↓              kneel              Space    fire
Enter              start
```

## The mission

The Mekon's hollowed-out asteroid is on a collision course with Earth. Dan has
two hours to find the five SDS keys — one in each colour-coded sector — and
carry them to the self-destruct room.

As in the original there are no lives: running out of energy gets Dan captured
and dumped in a cell, costing ten minutes off the clock. Treens patrol and
shoot; clear a room and it stays safe. Kneeling ducks their fire and gets Dan
under low headers. Grav-lift shafts carry him between floors — press left or
right to step off one.

## Where the level comes from

Two sources, kept apart.

**Which rooms exist and how they join** comes from the original itself. The
game was run in a headless emulator and surveyed by playing it: from the
start, in every room reached, Dan walks off either edge and tries up and down
on each of the room's thirty cells. Every move that changed the room, or the
floor he stood on, is recorded as a link (`data/emu/graph.json`), and every
room's screen is dumped. That survey found what no reading of the map could:
the surface is three screens with holes in the floor of the third, a grav-lift
answers only when Dan stands a cell or two left of its rails and holds down or
up, holding on carries him through the next room and beyond, and letting go
leaves him hanging in the field to step off onto an upper floor. The scripts
are in `tools/emu/`, with what they need and where the numbers come from.

**What each room looks like** comes from the published map at
[maps.speccy.cz](https://maps.speccy.cz/maps/DanDare1.png), which is a montage
of the game's screens. Measured from it: a room is 240×144 px (30×18 cells),
rooms tile at `x = 31 + 240·col, y = 39 + 144·row`, and that origin sits on
the Spectrum's attribute grid (99.7% of cells hold at most two colours).
`tools/extract_level.py` classifies every cell - floor and ceiling courses,
blocks and steps whose tops are ledges, scenery, lift rails (matched by
their exact 8×8 dot pattern, since the sectors recolour them) - and
`tools/match_rooms.py` says which map room each surveyed screen is, by
comparing them cell for cell after reducing both to the Spectrum's hues, with
rooms of one corridor placed together.

`tools/build_level.py` joins the two into `level.json`: only rooms the original
let Dan reach, linked only as the original let him move. Nothing is generated.

## What is in so far

The survey from a fresh start reaches **24 rooms**: the surface, the sector
below it and its lifts, down to the self-destruct room. The original opens the
door to each further sector when a part of the self-destruct mechanism is
brought back and fitted, so the survey has to be resumed from that state; that
is the next piece of work, and until then the game has one sector.

A play-test harness walks the recreation the same way the survey walked the
original, so a room the survey reached but the recreation cannot is caught
before it ships.

## Sprites

Dan is drawn from illustrations: the renders in the repository root (two
running strides, a kneel, a jump and a firing stride, all in profile; the
left-facing set is not used, since the game mirrors the frames itself).
`tools/make_sprites.py` cuts each figure off its checkerboard, scales the set
so a running Dan is 33 cells tall, packs them into `assets/dan.png` at the
canvas's 3x scale, and writes `js/dan_sheet.js` with each frame's position and
where Dan's body sits within it, so the hit box is centred on him rather than
on the rifle. The game draws the frames 1:1, so they keep their line work.

Five poses make a two-frame run cycle, a kneel, a jump and a muzzle flash
while firing; there is no standing pose, so a still Dan holds the narrower
stride. The Treens, the seated figure in the self-destruct room
and the pickups are still the project's own single-colour bitmaps in
`js/sprites.js`.

## Tools

```
python3 tools/extract_level.py -o level_map.json           # map -> geometry of all 106 rooms
python3 tools/validate_level.py MAP.png level_map.json 1,5  # draw a room's geometry over the map
python3 tools/match_rooms.py MAP.png data/emu --graph data/emu/graph.json --level level_map.json -o data/emu/match.json
python3 tools/build_level.py data/emu/graph.json data/emu/graph2.json data/emu/graph3.json \
    data/emu/graph4.json data/emu/graph5.json data/emu/graph6.json --match data/emu/match.json \
    --geometry level_map.json --parts 83,148,255,56,50 --slot 143 --from-screen 117 \
    --prisons 50,53,241,192 --gate 185:186:2 --label 4:186:185,217 --boss 63:22:16 \
    -o level.json                                            # -> level.json + js/level.js
python3 tools/make_sprites.py                               # renders in ./ -> assets/dan.png
```

## Other departures

* Guards, pickups and key placement are procedural, from a seeded hash of each
  room; the parts of the mechanism are not yet where the original keeps them.
* The clock runs at 3× real time, so a two-hour mission is about forty minutes.

Dan Dare is someone else's property; this is a personal recreation of a
thirty-year-old game's design, not an attempt to reissue it.

## Sources

* Screen map — [maps.speccy.cz](https://maps.speccy.cz/maps/DanDare1.png)
* Screenshots and release data — [Spectrum Computing](https://spectrumcomputing.co.uk/entry/1235/ZX-Spectrum/Dan_Dare_Pilot_of_the_Future)
* Mechanics — [FRGCB's review](http://frgcb.blogspot.com/2024/01/dan-dare-pilot-of-future-virgin-games.html)
* [MZY Games' *DARE*](https://mzygames.itch.io/dare), a modern remake, whose
  gameplay clips informed the sprite work and panel layout
