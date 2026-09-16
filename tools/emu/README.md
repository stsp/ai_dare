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
