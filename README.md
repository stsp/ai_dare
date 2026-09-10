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

## Reading the map

The map is a montage of the game's rooms. Measured from the image:

* a room is **240×144 px** — 30×18 character cells — matching the play window
  in screenshots of the real game;
* rooms tile a grid at `x = 31 + 240·col`, `y = 39 + 144·row`, 21×8 cells, of
  which **106 hold a room**;
* that origin sits on the Spectrum's 8×8 attribute grid — at this offset 99.7%
  of cells hold at most two colours, the hardware limit for a character cell.

Two further checks agree with it: the map's sector colouring changes exactly on
the column lines, and floor bands end exactly on the row lines.

`tools/extract_level.py` reads every room's cells and emits `level.json` — the
floors Dan stands on, the grav-lift shafts, the walls and machinery, and the
colour signature of each floor band, which sorts the 106 rooms into the game's
six colour-coded sectors. Rooms are then drawn from that classification, so
each one keeps the shape it has on the map.

## What the map does not contain

**How the rooms connect.** Only 24 of 85 side-by-side boundaries are open, and
only 18 of 72 vertically stacked pairs even share a lift-shaft column, so the
montage does not describe a connected building. Five different readings of it
all failed to produce a traversable map.

So the connection graph is split and labelled. Of 130 connections, **89 are
read from the map** — real doorways, shafts that line up across a boundary,
holes to drop through — and **41 are generated** by `plan_doors` to join the
islands into one building. The generated ones are level design, not extraction,
and `level.json` records which is which.

Two things keep that honest:

* **Reachability is measured the way Dan moves.** A hole in a floor is one-way,
  since he cannot climb back up it. Counting drops as two-way reports a
  connected building that is not one.
* **A generated link has to be usable.** A doorway needs a floor running to the
  room edge on both sides; a vertical link needs a real shaft to ride. Where a
  shaft reaches a boundary in one room only, the generator extends it into the
  neighbour — the same move the game makes with grav-lifts — rather than
  inventing a mechanic. An earlier pass generated links with no shaft at either
  end, which reported a connected map while the player was stuck.

The map's own connections reach **11 of 106 rooms**; with the generated links it
is **101 of 106**. The last five are isolated pockets with no usable boundary at
all, and the game never places a key, a cell or the self-destruct room in them.
`check_reachability.py` prints both figures, so how much level design is being
carried stays visible.

A room boundary with no connection is a solid wall. Nothing in the map is
reinterpreted as a ladder to paper over a gap — the game has no ladders, and an
earlier version of this project invented them, which both wrecked the look and
silently inflated its own reachability figure.

## Sprites

Drawn for this project, from studying gameplay footage: Dan is a running man in
a flight suit with a four-phase cycle and counter-swinging arms; the Treens use
a squatter, heavier silhouette so the two read apart at a glance even when each
is a single colour. Nothing from the original game is redistributed here, and
the map image is fetched by the extractor rather than committed.

## Tools

```
python3 tools/extract_level.py                      # fetch map -> level.json + js/level.js
python3 tools/validate_level.py MAP.png level.json  # draw the geometry back over the map
python3 tools/check_reachability.py level.json      # walk the level the way Dan moves
```

`validate_level.py` is the one that matters: it draws the extracted floors and
shafts back over the original rooms, so a misreading is visible rather than
merely plausible.

## Other departures

* Guards, pickups and key placement are procedural, from a seeded hash of each
  room — the map shows architecture, not where things stood.
* The clock runs at 3× real time, so a two-hour mission is about forty minutes.

Dan Dare is someone else's property; this is a personal recreation of a
thirty-year-old game's design, not an attempt to reissue it.

## Sources

* Screen map — [maps.speccy.cz](https://maps.speccy.cz/maps/DanDare1.png)
* Screenshots and release data — [Spectrum Computing](https://spectrumcomputing.co.uk/entry/1235/ZX-Spectrum/Dan_Dare_Pilot_of_the_Future)
* Mechanics — [FRGCB's review](http://frgcb.blogspot.com/2024/01/dan-dare-pilot-of-future-virgin-games.html)
* [MZY Games' *DARE*](https://mzygames.itch.io/dare), a modern remake, whose
  gameplay clips informed the sprite work and panel layout
