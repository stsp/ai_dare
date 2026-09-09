# DanDare

A browser-based fan recreation of **Dan Dare: Pilot of the Future**, the 1986
ZX Spectrum flip-screen platformer by Gang of Five / Virgin Games (based on
the map at [maps.speccy.cz](https://maps.speccy.cz/maps/DanDare1.png)).

Dan's ship has been boarded by the Treens. Explore the base screen by screen,
collect the 5 scattered parts of the planet-buster mechanism, and carry them
to the control room to defuse it.

## Play

Open `index.html` in a browser (or serve the folder with any static file
server, e.g. `python3 -m http.server`). No build step or dependencies.

## Controls

| Key            | Action                     |
|----------------|-----------------------------|
| ← / →          | Walk                        |
| ↑ / ↓          | Climb ladders / lift shafts |
| ↓ (on ground)  | Kneel                       |
| Z / Space      | Jump                        |
| X              | Fire laser                  |
| Enter          | Start / continue            |

## How it works

- `index.html` / `style.css` — page shell and retro-styled canvas.
- `game.js` — the whole game: a tile-based flip-screen level built from a
  small room graph (mirroring the shape of the original screen map), simple
  platformer physics, patrolling Treen enemies, a laser weapon, ladders/lift
  shafts, hazards, collectibles, and title/HUD/win/game-over screens — all
  rendered with plain Canvas 2D in a ZX Spectrum-inspired palette.

This is an original, from-scratch implementation (no ripped assets) built as
a tribute to the mechanics and layout of the 1986 original.
