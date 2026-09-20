# Ai Dare — web recreation

A browser game after a ZX Spectrum platformer of the 1980s, built by reading the game's room layouts out of the
published screen map at
[maps.speccy.cz](https://maps.speccy.cz/maps/DanDare1.png).

Open `index.html` in a browser. No build step, no dependencies, no server.

```
O / P  or  ← →     run                Q / ↑    jump, and ride grav-lifts
A / ↓              kneel              Space    fire
Enter              start              Escape   skip the intro or the ending
```

`1` on the title page opens the options, laid out as the original's: the
control keys, and a third line the original never had - the story. Chosen,
every message, the panel and the title tell of a policeman sent, in place of
the postman, to carry the mailboxes of a rough district to the sorting
office (`js/story.js`; the font gains Cyrillic for it). The original's words
are the default, and the choice is remembered by the browser.

Cheat codes, typed on the title page (or during play): `DOORS` opens every
door, `PARTS` fits all five parts and starts the eleven-minute countdown,
`TIME` stops the clock. They last until the page is reloaded.

## The mission

The Mekon's hollowed-out asteroid is on a collision course with Earth. Ai has
two hours to find the five SDS keys — one in each colour-coded sector — and
carry them to the self-destruct room.

As in the original there are no lives: running out of energy gets Ai captured
and dumped in a cell, costing ten minutes off the clock. Treens patrol and
shoot; clear a room and it stays safe. Kneeling ducks their fire and gets Ai
under low headers. Grav-lift shafts carry him between floors — press left or
right to step off one.

## Where the level comes from

Two sources, kept apart.

**Which rooms exist and how they join** comes from the original itself. The
game was run in a headless emulator and surveyed by playing it: from the
start, in every room reached, Ai walks off either edge and tries up and down
on each of the room's thirty cells. Every move that changed the room, or the
floor he stood on, is recorded as a link (`data/emu/graph.json`), and every
room's screen is dumped. That survey found what no reading of the map could:
the surface is three screens with holes in the floor of the third, a grav-lift
answers only when Ai stands a cell or two left of its rails and holds down or
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
let Ai reach, linked only as the original let him move. Nothing is generated.

## What is in so far

The survey from a fresh start reaches **24 rooms**: the surface, the sector
below it and its lifts, down to the self-destruct room. The original opens the
door to each further sector when a part of the self-destruct mechanism is
brought back and fitted, so the survey has to be resumed from that state; that
is the next piece of work, and until then the game has one sector.

A play-test harness walks the recreation the same way the survey walked the
original, so a room the survey reached but the recreation cannot is caught
before it ships.

## Rooms and sprites

The rooms are drawn from the original's own screens. Every room was dumped
many times by the emulator surveys, and again with Ai stepped and jumped
about in it; `tools/make_rooms.py` takes, cell by cell, the value most dumps
agree on, so Ai, the Treens and the message boxes fall away, wipes the parts
of the mechanism, writes the cleaned screens back to `data/emu` and packs the
play areas (the original's rows 0-17, so its floor courses meet the level's)
into `assets/rooms.png`. The game lays its own things over them:
the lifts' marks, the doors, the parts, the pickups, the mechanism's lights.
`--door` cuts the door slabs out of shut-and-open pairs of screens,
`--objects` takes the original's gun tables, lifts the floor guns off the
backdrops and records every gun's place, span and wall colour, `--solid`
packs the original's own flag map: the cells it draws in front of the
figures (walls, walkways, shafts, doorways), so the room hides Ai's feet on
a walkway and hides him in a doorway or a shaft as the original does, and
the cells that stop him walking (walls, steps, the lifts' stations - checked
in the emulator: he cannot walk into 118's step or past 120's posts), `--arrow`
finds the lifts' scrolling arrow cells (in any of their eight phases) so the
game can animate them, and `--button` finds the call buttons beside them,
which blink while a lift is moving as the original's do: the two take turns,
magenta and red, swapping every four frames, both blue as the ride begins.

Ai, the Treens and the Mekon are the project's own figures, drawn as
vectors (`js/figures.js`), with Ai's head from the project's own renders.

## Tools

```
python3 tools/extract_level.py -o level_map.json           # map -> geometry of all 106 rooms
python3 tools/validate_level.py MAP.png level_map.json 1,5  # draw a room's geometry over the map
python3 tools/match_rooms.py MAP.png data/emu --graph data/emu/graph.json --level level_map.json -o data/emu/match.json
python3 tools/build_level.py data/emu/graph.json data/emu/graph2.json data/emu/graph3.json \
    data/emu/graph4.json data/emu/graph5.json data/emu/graph6.json --match data/emu/match.json \
    --geometry level_map.json --parts 83:5,148:6,185:26,255:23,56:12 --slot 143 --from-screen 117 \
    --prisons 50,53,241,192 --gate 185:186:3,159:158:4 --label 4:186:185,217 --boss 63:22:16 --clear 143:13:22:6:14 \
    --fake-lifts data/emu/phantom_lifts.json -o level.json                                            # -> level.json + js/level.js
python3 tools/make_sprites.py                               # renders in ./ -> assets/dan.png
python3 tools/make_title.py                                 # the render -> assets/title.png
python3 tools/make_rooms.py DUMPDIR... --prefer MOVEDDIRS --parts-from data/emu/masks/part_148.scr \
    --erase data/emu/masks/dan_14.scr:11:16:3:6,data/emu/masks/treen_212.scr:10:15:1:4,data/emu/masks/treen_89.scr:6:10:20:23 \
    --door 84:right:data/emu/doors/room_84_shut.scr:data/emu/doors/room_84_open.scr,209:right:...,159:left:...,185:right,143:left,142:left \
    --objects data/emu/guns.json --solid data/emu/solid.json --button data/emu/room_146.scr:4:16 --arrow data/emu/masks/arrow_83.scr:12:23 \
    -o assets/rooms.png                                     # the rooms from the original's screens, cleaned
```

## Lifts only where the original has them

The surveys that walked the original recorded a lift wherever Ai's y
changed after Q or A - and a fall through a gap looks the same to them. Every
recorded call was retried in the emulator (`tools/emu/emu_liftcheck.js`): Ai
is walked, or put straight down (`--place`), on the call's cell and floor, the
key is pressed, and a ride moves him a steady 3-5 px a frame the way the key
says. The calls that did anything else - a jump, a fall through a gap, a call
made in the air with no floor under it - are `data/emu/phantom_lifts.json`,
and the level is built without them (`--fake-lifts`; a call made mid-ride over
a real lift is moved down to the floor the ride starts from). Room 111, for
one, has no lift at all.

## The title screen

The title is framed to the screen's foot, as the original's is, with a line
running along the bottom that tells of the mission - or, with the story
switched to the policeman's, of the post. It goes at two thirds of the
original's four pixels a frame, to be read.

## Rewind

Backspace puts the game back as it was five seconds ago: the whole of play
(Ai, the guards, the guns and their shots, the cups and parts, the clock,
the score, the messages due) is kept as a snapshot every half second for the
last ten, and the newest one at least five seconds old is restored. Pressing
again goes back further, to the oldest kept. It is there to try a spot
again without the walk back.

## The guns

The original keeps a table of each room's guns, and the game reads it from
the emulator (`data/emu/guns.json`, by `tools/emu/emu_guns.js` and the
snapshots) into the room sheet's index. Three kinds, each doing what the
original was filmed doing with its gun routine put back:

* a floor gun stands in Ai's way and fires along the floor either way;
  nothing he fires touches it, but coming down on it from above crushes it
  into a hat, for 75 points;
* a wall gun (a fist, facing left or right) fires the way it faces; one hit
  from the rifle and it is gone, the wall bare where it hung;
* a ceiling gun (a visor, high on the wall) fires down at a slant; it can be
  shot only from a floor level with it - most cannot be - and leaves a ragged
  hole in the wall.

A shot moves a cell every three frames and ends at the screen's edge, in a
floor or wall, or in Ai. Each frame the original rolls one chance in four of
a shot and fires a gun picked at random. A gun destroyed flashes the screen
inverted for a frame and plays the beeper burst the original plays; the
bursts are synthesised from its sound records.

## The title picture

`assets/title.png` is laid out as the original's loading screen - the plaque
top left, Ai under it, the Mekon beside him over a wall of blue panels - but
drawn from the hi-res render in the repository root (`tools/make_title.py`
cuts the two heads off the render's checkerboard). The game letters the
plaque itself in a bold slab serif (`assets/plaque.ttf`, DejaVu Serif Bold,
licence beside it), so the story renames it, and shows the picture until
space, enter or escape is pressed.

## Other departures

* In most rooms some Treens are already about when Ai walks in, placed by a
  seeded hash of the room; on the screen he lands on and in the hologram room
  there are none to start with. Within a couple of seconds of his arrival in
  an empty room, or a few seconds otherwise, while fewer than two are about,
  one runs in from beyond the edge away from Ai at the
  original's pace, comes well clear of the wall, closes to a few cells and
  pauses before firing. Some of them take the grav-lifts: to Ai's floor when
  he is on another floor of the same room, and after him when he rides out
  while they are giving chase, arriving behind him in the next room. A guard
  shot stands with his arms up for a moment, then is gone, for fifty points;
  both moments sound the original's beeper bursts. The fourth sector is unguarded. The cups of energy stand where the
  original's object tables put them, and are drunk by landing on them. The five parts of the mechanism lie where the original keeps them
  (rooms 83, 148, 185, 255 and 56, one per sector) and the sector doors open
  after one, two, three and four parts, as the walkthrough shows.
* The clock runs at 3× real time, so a two-hour mission is about forty minutes.

The original game and its characters are someone else's property; this is a personal recreation of a
thirty-year-old game's design, not an attempt to reissue it.

## Sources

* Screen map — [maps.speccy.cz](https://maps.speccy.cz/maps/DanDare1.png)
* Screenshots and release data — [Spectrum Computing](https://spectrumcomputing.co.uk/entry/1235/ZX-Spectrum/Dan_Dare_Pilot_of_the_Future)
* [MZY Games' *DARE*](https://mzygames.itch.io/dare), a modern remake, whose
  gameplay clips informed the sprite work and panel layout
