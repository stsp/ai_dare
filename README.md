# Dan Dare — web recreation

A browser recreation of *Dan Dare: Pilot of the Future* (Gang of Five / Virgin
Games, 1986, ZX Spectrum), built by reading the game's real level layout out of
the published screen map at
[maps.speccy.cz](https://maps.speccy.cz/maps/DanDare1.png).

Open `index.html` in a browser. No build step, no dependencies, no server
needed.

```
O / P  or  ← →     run                Q / ↑    jump, and ride grav-lifts
A / ↓              kneel              Space    fire
Enter              start
```

## The mission

The Mekon's hollowed-out asteroid is on a collision course with Earth. Dan has
two hours to find the five SDS (self-destruct system) keys — one hidden in each
colour-coded sector — and carry them to the self-destruct room.

Following the original: there are no lives. Running out of energy gets Dan
captured and dumped in a cell, and costs ten minutes off the clock. Treens
patrol the corridors and shoot; clear a screen and it stays safe. Kneeling
ducks their fire and gets Dan under low headers. Grav-lift shafts carry him
between floors.

## How the level was derived

The screen map is a montage of the game's screens. Measuring it:

* the play window is **240×144** pixels — 30×18 character cells — which matches
  the play area in real screenshots of the game;
* screens sit on a grid at `x = 31 + 240·col`, `y = 39 + 144·row`, 21×8 cells,
  of which **106 are actual screens**;
* that origin is on the Spectrum's 8×8 attribute grid — at this offset 99.7% of
  cells contain at most two colours, which is the hardware's constraint on a
  character cell, so the alignment is unambiguous.

`tools/extract_level.py` reads the montage and emits `level.json`: per screen,
the standable floors, the vertical shafts, the scenery, and the colour
signature of the floor band, which sorts the 106 screens into the game's six
colour-coded areas. Only functional geometry is extracted — coordinates, not
artwork. Every graphic in the game is drawn by `js/render.js` and
`js/sprites.js`.

```
python3 tools/extract_level.py                      # fetches the map, writes level.json + js/level.js
python3 tools/validate_level.py MAP.png level.json  # draws the geometry back over the map
python3 tools/check_reachability.py level.json      # walks the map: 101 of 106 screens reachable
```

`validate_level.py` was the check that mattered: it draws the extracted floors,
shafts and scenery back over the original screens, so a wrong reading is
visible rather than merely plausible. `check_reachability.py` walks the level
the way Dan moves and reports what he can get to; the game only places keys,
cells and the self-destruct room in screens it marks reachable, so the mission
is always completable.

## Where it departs from the original

* **Scenery is not solid.** The map's vertical structures are a mix of real
  shafts, bay dividers, door frames and machinery, and pixels alone don't
  separate them. Full-height columns are read as the sector's ladder/lift
  shafts; everything else is drawn but not collidable. Treating it all as solid
  walls Dan into a corner within a screen or two. What constrains him is
  floors, the holes in them, the shafts, and the screen edges.
* **Guards, pickups and objectives are placed procedurally** from a seeded
  hash of each screen, not from the original's actual placements — the map
  shows architecture, not where things stood.
* The clock runs at 3× real time, so a two-hour mission is about forty minutes.
* Sprites, tiles and the font are drawn for this project. Nothing from the
  original game is redistributed here, and the map image is fetched by the
  extractor rather than committed.

Dan Dare is someone else's property; this is a personal recreation of a
thirty-year-old game's design, not an attempt to reissue it.

## Sources

* Screen map — [maps.speccy.cz](https://maps.speccy.cz/maps/DanDare1.png)
* Screenshots and release data — [Spectrum Computing](https://spectrumcomputing.co.uk/entry/1235/ZX-Spectrum/Dan_Dare_Pilot_of_the_Future)
* Mechanics (energy and capture, the SDS keys, lifts, sectors) —
  [FRGCB's review](http://frgcb.blogspot.com/2024/01/dan-dare-pilot-of-future-virgin-games.html)
* [MZY Games' *DARE*](https://mzygames.itch.io/dare), a modern remake, for its
  status-panel and narration presentation
