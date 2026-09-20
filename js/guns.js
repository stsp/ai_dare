"use strict";
/* The asteroid's guns, as the original keeps them: read from its own object
   tables in the emulator (data/emu/guns.json, packed into the room sheet's
   index by tools/make_rooms.py). Three kinds, and what the original does with
   each - all watched in the emulator with the gun routine put back:

   - a floor gun (a squat box on the floor course) fires a dash along the
     floor either way; it stands in Ai's way, and nothing he fires touches
     it - he crushes it by coming down on it from above, and it is left a
     flattened hat: 75 points and "AI CAN CRUSH FLOOR GUNS";
   - a wall gun (a fist mounted on the wall, facing left or right) fires a
     dash the way it faces from the row below its top; a hit from Ai's rifle
     removes it and the wall is left bare;
   - a ceiling gun (a visor high on the wall) fires a dash down at a slant;
     shot - only from a floor level with it, so most cannot be - what is left
     of it is its own drawing with most of its pixels blown out of it.

   Any of them is destroyed by one hit, with the whole screen inverted for a
   frame. Each frame the original rolls one chance in four of a shot, picks
   one gun at random and fires it if one of its three shot slots is free; a
   shot moves a cell every three frames and ends at the screen's edge, in a
   floor or wall, or in Ai. */

const GUN_CEILING = 0, GUN_LEFT = 1, GUN_RIGHT = 2, GUN_FLOOR = 3;
const GUN_SHOT_FRAMES = 3;            // a cell every three frames
const GUN_SHOTS_MAX = 3;
const GUN_FIRE_CHANCE = 0.25;         // rolled every frame
const GUN_CRUSH_SCORE = 75;

// the bitmaps the original draws, read off its screen: '#' is ink
const GUN_BITS = {
  gun: ["################", "................", "..#...########..", "....#..#.#.#.#..", ".#...##########.", ".....########...", "................", "................"],
  hat: ["................", "................", "..#...#.##......", "##..#..#.#.#.###", ".#...##########.", "......#.###.....", "#..##.......##..", "................"],
  // a visor that has been shot out: not a hole drawn over the wall but what is
  // left of the visor itself - the original keeps only the pixels marked here,
  // which is how its own screens show a shot one (rooms 189, 190 and 221 were
  // dumped that way, and they are this mask over the visor, exactly)
  shot: ["..#.....####....#####...................", ".....#..#########....#.....##.....#.....", "#..######..####.......#####..#........#.",
         "..#.##.##.........###........##.#.#.....", ".#.###..##......#######.......##.#.#..#.", "..####...#...#############.....##.#.....",
         ".####......################...####.#....", "..###.....#################..##.#.#.....", "..#####..###################.##..#.#..#.",
         ".####....###################..###.#.#...", ".###.....#.#################....##.##...", "..##......##.###############.....##..#..",
         "..#..##.....##.#..#####.##....####.#...#", ".########.......#...##.......####.#.#...", "..#####.##....#####....#####..#..#.#....",
         "...##....######...#####...####..#.#....."],
};

let guns = [];         // this room's guns
let gunShots = [];

/** The guns of a room, as the sheet index lists them; the ones destroyed this game stay so. */
function makeGuns(key) {
  const list = (window.ROOMS_SHEET && window.ROOMS_SHEET.guns && window.ROOMS_SHEET.guns[key]) || [];
  return list.map(([type, x, y, w, fill], i) => {
    const id = key + ":" + i;
    // a floor gun sits on the floor course, its eight rows the ones Ai's hop must clear
    const floor = type === GUN_FLOOR;
    return { id, type, x, y, w, h: floor ? 8 : 16, cy: y, fill, dead: state.deadGuns.has(id) };
  });
}

/** Draw a two-colour bitmap: the ink over the given cells' colours. */
function drawBits(ctx, rows, x, y, colours) {
  for (let j = 0; j < rows.length; j++) {
    const row = rows[j];
    for (let i = 0; i < row.length; i++) {
      if (row[i] !== "#") continue;
      ctx.fillStyle = colours[Math.floor(i / 8) % colours.length];
      ctx.fillRect(x + i, y + j, 1, 1);
    }
  }
}

/* A visor Ai has shot, drawn out of its own cells: the original does not wipe
   the wall and paint a hole over it - it blows most of the visor's pixels out
   and leaves the rest standing, in the cells' own colours. Painting one flat
   colour over the whole gun instead, as this used to, showed a black rectangle
   wherever the cell beside the gun happened to be black - which is what the
   original's own screens of a shot visor (rooms 189, 190 and 221 were dumped
   that way) say it never does. A fist is another matter: its cells are drawn
   in the wall's colour on black, so what is left when it goes is the bare
   wall beside it, which the gun table carries. */
function drawShotGun(ctx, g) {
  const key = state.room, r0 = Math.round(g.y / 8), c0 = Math.round(g.x / 8);
  const cells = g.type === GUN_CEILING && roomCell(key, r0, c0);
  if (!cells) {                                     // a fist, or the tiles not up yet
    ctx.fillStyle = g.fill || C.black;
    ctx.fillRect(g.x, g.y, g.w, g.h);
    return;
  }
  for (let r = 0; r < g.h / 8; r++) {
    for (let c = 0; c < g.w / 8; c++) {
      const x = g.x + c * 8, y = g.y + r * 8;
      const cell = roomCell(key, r0 + r, c0 + c);
      ctx.fillStyle = cell.paper;
      ctx.fillRect(x, y, 8, 8);
      ctx.fillStyle = cell.ink;
      for (let j = 0; j < 8; j++) {
        const row = GUN_BITS.shot[r * 8 + j];
        for (let i = 0; i < 8; i++) {
          if (cell.bits[j * 8 + i] && row[c * 8 + i] === "#") ctx.fillRect(x + i, y + j, 1, 1);
        }
      }
    }
  }
}

function drawGuns(ctx) {
  for (const g of guns) {
    if (g.type === GUN_FLOOR) {
      // the floor gun, or the hat it was crushed into - green and cyan, as the original colours its two cells
      if (!g.dead) drawBits(ctx, GUN_BITS.gun, g.x, g.y, [C.green, C.bcyan]);
      else drawBits(ctx, GUN_BITS.hat, g.x, g.y, [C.green, C.cyan]);
    } else if (g.dead && state.backdrop) {
      drawShotGun(ctx, g);
    }
  }
  ctx.fillStyle = C.bgreen;
  for (const s of gunShots) {
    // a visor's shot sets off inside the visor's own cells, two in and on its
    // top row, and the original shows it only once it is out below them
    const g = s.by;
    if (g.type === GUN_CEILING && s.x < g.x + g.w && s.x + 8 > g.x && s.y < g.y + g.h) continue;
    if (s.dy === 0) ctx.fillRect(s.x, s.y, s.len, 1);
    else for (let i = 0; i < 8; i++) ctx.fillRect(s.x + (s.dx > 0 ? i : 6 - i), s.y + i, 2, 1);   // a slanting dash, a cell tall
  }
}

/** Fire one of the room's guns, as the original picks it: a random index,
 *  running past the end of the list stopping at the last. */
function gunFires() {
  const live = guns;
  if (!live.length) return;
  const g = live[Math.min(Math.floor(Math.random() * 8), live.length - 1)];
  if (g.dead) return;
  if (gunShots.length >= GUN_SHOTS_MAX) return;
  const r = Math.floor(Math.random() * 4);
  let s;
  if (g.type === GUN_CEILING) {
    // from two cells in, down at a slant: right for half the rolls, straight or left for the rest
    s = { x: g.x + 16, y: g.y, dx: r < 2 ? 1 : r === 2 ? 0 : -1, dy: 1, len: 8, grow: false };
  } else if (g.type === GUN_LEFT) {
    s = { x: g.x, y: g.y + 8, dx: -1, dy: 0, len: 8, grow: false };
  } else if (g.type === GUN_RIGHT) {
    s = { x: g.x + 8, y: g.y + 8, dx: 1, dy: 0, len: 8, grow: true };     // its dash draws out to three cells
  } else {
    const left = r < 2;
    s = { x: left ? g.x : g.x + 8, y: g.y, dx: left ? -1 : 1, dy: 0, len: 8, grow: false };
  }
  s.acc = 0; s.by = g;
  gunShots.push(s);
}

function updateGuns(dt) {
  if (!guns.length && !gunShots.length) return;
  const room = currentRoom();
  const walls = wallsOf(state.room), platforms = platformsOf(room);
  if (Math.random() < GUN_FIRE_CHANCE * dt / FRAME) gunFires();
  for (const s of gunShots) {
    s.acc += dt;
    while (s.acc >= GUN_SHOT_FRAMES * FRAME && !s.done) {
      s.acc -= GUN_SHOT_FRAMES * FRAME;
      s.x += s.dx * 8; s.y += s.dy * 8;
      if (s.grow && s.len < 24) s.len += 8;
      const x0 = s.dx < 0 ? s.x : s.x, w = s.dy === 0 ? s.len : 8, h = s.dy === 0 ? 1 : 8;
      if (s.x < 0 || s.x + w > VIEW_W || s.y < 0 || s.y + h > VIEW_H) { s.done = true; break; }
      // into a wall or a floor: the dash ends
      if (walls.some((wl) => overlaps(x0, s.y, w, h, wl.x0, wl.y0, wl.x1 - wl.x0, wl.y1 - wl.y0)) ||
          platforms.some((p) => s.y + h > p.y && s.y < p.y + 8 && x0 + w > p.x0 && x0 < p.x1)) { s.done = true; break; }
      if (gunShotHitsAi(x0, s.y, w, h)) { s.done = true; break; }
    }
  }
  gunShots = gunShots.filter((s) => !s.done);
}

/** A gun's dash reaching Ai strikes him as a guard's beam does. */
function gunShotHitsAi(x, y, w, h) {
  const bh = ai.kneeling ? AI_KNEEL_H : AI_H;
  if (ai.onLift || !overlaps(x, y, w, h, ai.x, ai.y + AI_H - bh, AI_W, bh)) return false;
  ai.hurt = Math.max(ai.hurt, 0.25);
  if (!(ai.rattle > 0)) {
    ai.rattle = HIT_RATTLE_EVERY;
    state.energy -= HIT_ENERGY;
    rattle();
    if (state.energy <= 0) capture();
  }
  return true;
}

/** Floor guns stand in Ai's way: he walks into them and stops. */
function gunsBlockAi(h, yOff) {
  for (const g of guns) {
    if (g.dead || g.type !== GUN_FLOOR || ai.vy < 0) continue;      // a jump clears it: the box is lower than his hop
    if (overlaps(ai.x, ai.y + yOff, AI_W, h, g.x, g.cy, 16, 8)) {
      ai.x = ai.vx > 0 || (ai.vx === 0 && ai.x < g.x) ? g.x - AI_W : g.x + 16;
      ai.vx = 0;
    }
  }
}

/** Coming down on a floor gun from above crushes it into a hat. */
function gunsUnderAi(prevFeet) {
  const feet = ai.y + AI_H;
  for (const g of guns) {
    if (g.dead || g.type !== GUN_FLOOR) continue;
    if (prevFeet <= g.cy + 1 && feet >= g.cy && ai.x + AI_W > g.x && ai.x < g.x + 16) {
      g.dead = true;
      state.deadGuns.add(g.id);
      state.score += GUN_CRUSH_SCORE;
      note(tx(["AI CAN CRUSH FLOOR GUNS"]), 2.5);
      beeperBurst("crush");
    }
  }
}

/** Ai's shot into a wall or ceiling gun: it goes, and the screen inverts for a frame. */
function gunsShotBy(l) {
  for (const g of guns) {
    if (g.dead || g.type === GUN_FLOOR) continue;
    if (overlaps(l.x, l.y, LASER_STEP, 2, g.x, g.y, g.w, g.h)) {
      g.dead = true;
      state.deadGuns.add(g.id);
      state.invert = 2 * FRAME;
      beeperBurst("gunShot");
      l.cells = 0;
    }
  }
}
