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
geometry. `--gate a:b:n` puts a door between two rooms that opens after `n`
parts, `--label N:seed:blockers` announces the rooms reachable from `seed`
(inside its zone, not through `blockers`) as sector `N` and shifts the later
sectors up by one, and `--boss room:cell:row` seats the Mekon hologram.

## The rest of the harness

All scripts take the working directory from `DANDARE_WORK` (default: the
current directory) and the browser from `CHROME`; the game is expected on
`http://127.0.0.1:8801/` (the repository root served as is) and the
emulator page on `http://127.0.0.1:8802/`.

* `emu_floor.js DIR...` - the floor probe: walks Dan across every room of a
  survey and records where he stood and where he fell (`FLOOR_OUT`).
* `emu_fire.js SNAP FRAMES NAME PRE HOLD` - films the rifle: holds fire for
  FRAMES frames (after tapping PRE keys, e.g. `P:70,O:3`, and with HOLD keys
  held, e.g. `A` to kneel) and saves every frame's screen and the beeper's
  samples (`NAME_audio.f32`, 882 per frame); `fire_an.py NAME` reads the
  bullet row, its cells frame by frame and where each shot stopped.
* `run_rzx_audio.sh` - plays the walkthrough recording in Fuse with SDL's disk
  audio driver, so the beeper lands in `rzx_audio.raw` (16-bit stereo, 44.1 kHz,
  paced by `SDL_DISKAUDIODELAY` so the timeline matches the video's).
* `emu_film2.js SNAP CELL SCRIPT EVERY NAME` - drives Dan from a snapshot by
  a key script and logs room/x/y; `emu_grabroom2.js` walks him into the next
  room and dumps its screen; `emu_lifttrace.js` records a lift ride frame by
  frame. `scr2png.py IN.scr OUT.png` renders a dumped screen.
* `emu_guns.js SNAPS.json OUT.json [ROOM...]` runs each room twice from its
  snapshot with the same keys - the gun routine poked out, then put back -
  and records every screen cell that differs: where the guns' shots go.
  `emu_gunshoot.js SNAP NAME SCRIPT` drives Dan by a key script (`O:30` holds
  O for thirty frames, `O+Q:6` both, `W:60` waits) with the guns live, saving
  every second frame and logging the gun table at `0x62A5` (four bytes a gun:
  y, column with the kind in its top bits, a pointer into the room's map) and
  the three shot slots at `0x6299`. The surveys' snapshots carry the "no
  guns" POKE, so both put the CALL back at 44413.
* `emu_liftcheck.js SNAP_INDEX OUT.json` tries every lift call the surveys
  recorded: loads a snapshot with Dan on that floor, walks him to the cell,
  presses Q or A and traces his y. A ride moves him 3-5 px a frame the way
  the key says; anything else (a fall, no movement) is a call the survey
  imagined. `--place` retries the calls no walk could reach with Dan's x and y
  poked onto the cell; put down in the air he lands first, and the result
  says which floor the key was pressed on. `data/emu/phantom_lifts.json` lists the calls found false, and
  `build_level.py --fake-lifts` leaves them out of the level.
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
* `mksnap.js SNAP CELL SCRIPT OUT.json` plays a key script from a snapshot
  and saves the machine state after it - a seed for a survey of somewhere
  the walkthrough never stood (the surface beyond the first pit).
* `emu_death.js SNAP CELL P|O NAME` walks Dan to a cell, faces him, and
  fires in bursts while dumping the screen every two frames - how a guard
  really dies (arms up, the room's colours cycling, gone in ten frames).
* `shot.js ROOM CELL OUT.png [fire|kneel]` draws one frame of the game with
  Dan put down at that cell (`FITTED=n` sets the parts fitted) and saves the
  canvas at 4x: how a change looks is checked here, next to the original's
  screen, before it is pushed. `treenwalls.js` runs every room's every floor
  for twenty seconds of guards and reports any guard inside a wall.
  `clearroom.js` shoots the guards of every floor of every room as they come
  and fails a floor where one is left alive off screen or inside a wall, or
  the room is never declared safe.
