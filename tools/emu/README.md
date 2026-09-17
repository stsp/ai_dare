# Reading the original with an emulator

The room graph the game plays on (`data/emu/graph.json`) was recorded by
playing the original in a headless emulator, not read off the map. The
scripts here do that; they are kept so the recording can be repeated or
extended, but they need two things that are not in this repository:

* **JSSpeccy 3** (GPL, https://github.com/gasman/jsspeccy3) built from
  source, with two messages added to its worker for the harness:
  `peekRange` (read memory) and `getSnapshot` (dump the machine state).
  `index.html` is the page that hosts it.
* **The game itself** as a `.z80` snapshot, which is copyrighted and is not
  distributed here.

`emu_lib.js` boots the page under Playwright, restores a snapshot, and drives
the emulator frame by frame through the worker - far faster than real time -
with the two Multiface POKEs published for the Virgin release (infinite
energy, no wall guns) applied so a survey is not cut short by capture.

`emu_bfs.js` is the survey: from the start it tries, in every room reached,
walking off either edge and holding up or down on every one of the thirty
cells (a grav-lift answers only from a couple of cells just left of its
rails). Every move that changed the room, or the floor Dan stood on, is an
edge; every room's screen is dumped as `room_N.scr`. The game keeps its
room number at `0x6297`, Dan's position at `0xC012` (y) and `0xC013` (x, in
cells), found by watching which bytes follow the keys.

    DANDARE_WORK=work node tools/emu/emu_bfs.js start.json

`tools/match_rooms.py` then says which room of the map each screen is, and
`tools/build_level.py` assembles the level from the graph and the map's
geometry.

## The rest of the harness

All scripts take the working directory from `DANDARE_WORK` (default: the
current directory) and the browser from `CHROME`; the game is expected on
`http://127.0.0.1:8801/` (the repository root served as is) and the
emulator page on `http://127.0.0.1:8802/`.

* `emu_floor.js DIR...` - the floor probe: walks Dan across every room of a
  survey and records where he stood and where he fell (`FLOOR_OUT`).
* `emu_film2.js SNAP CELL SCRIPT EVERY NAME` - drives Dan from a snapshot by
  a key script and logs room/x/y; `emu_grabroom2.js` walks him into the next
  room and dumps its screen; `emu_lifttrace.js` records a lift ride frame by
  frame. `scr2png.py IN.scr OUT.png` renders a dumped screen.
* `merge_graphs.py OUT g1 g2 ...` merges surveys (nodes first-wins).
* `run_fsnaps.sh START END INTERVAL DIR` plays the published RZX walkthrough
  in Fuse under Xvfb, saving a snapshot every INTERVAL seconds;
  `z80tojson.py` turns a Fuse snapshot into the harness's format and
  `fsnaps_report.py DIR` lists room/x/y along the recording.
* `check_lifts.js`, `route2.js`, `route_follow.js SEQ.json FITTED`, and
  `trace.js ROOM X Y KEY FRAMES` replay what was recorded in the original
  against the game's own engine in a headless browser: every lift ride, the
  sector-2 loop, the whole recorded route, and a single walk.
* `hoptest.js ROOM 'walk right;goto 21;lift up;jump left'` runs primitive
  moves in the engine from a room and prints where each left Dan.
  `route_seq.json` is the walkthrough's room sequence; a `null` marks a
  break between recordings.
