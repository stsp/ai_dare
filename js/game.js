"use strict";
/* Dan Dare: Pilot of the Future - a recreation of the 1986 ZX Spectrum game.
 *
 * The level geometry is derived from the game's screen map by
 * tools/extract_level.py; this file is the engine that plays it.
 *
 * The rules follow the original: a two-hour countdown, an energy bar rather
 * than lives (run out and you are captured and dumped in a prison cell, losing
 * ten minutes), five SDS keys - one per colour-coded sector - to carry to the
 * self-destruct room, Treen guards that make a room safe once cleared, and
 * grav-lift shafts between floors.
 */

const LEVEL = window.DANDARE_LEVEL;
const RW = LEVEL.room.w, RH = LEVEL.room.h;      // 30 x 18 cells

// --- tuning ---------------------------------------------------------------
const RUN_SPEED = 62;          // px/s
const GRAVITY = 420;
const JUMP_VY = -158;
const JUMP_VX = 46;            // diagonal hop
const LIFT_SPEED = 44;
const TURN_TIME = 0.12;        // Dan turns on the spot before running back
const LASER_SPEED = 210;
const LASER_RANGE = 72;        // the laser is short-range
const CLOCK_RATE = 3;          // game seconds per real second
const START_TIME = 2 * 3600;
const ENERGY_MAX = 100;
const CAPTURE_PENALTY = 600;   // ten minutes

const DAN_W = 8, DAN_H = 18, DAN_KNEEL_H = 11;
const TREEN_W = 8, TREEN_H = 18;

// --------------------------------------------------------------- level utils

function roomAt(r, c) { return LEVEL.rooms[r + "," + c]; }
function roomKey(r, c) { return r + "," + c; }

const ROOM_KEYS = Object.keys(LEVEL.rooms);
const ROOM_LIST = ROOM_KEYS.map((k) => {
  const [r, c] = k.split(",").map(Number);
  return { key: k, r, c, room: LEVEL.rooms[k] };
});
/* Screens Dan can actually get to, per the extractor's walk of the map. Keys,
   cells and the self-destruct room only ever go in these, so the mission is
   always completable. */
const PLAYABLE = ROOM_LIST.filter((x) => x.room.reach !== 0);

/** Platforms Dan can stand on, as pixel spans. */
function platformsOf(room) {
  return room.platforms.map((p) => ({
    y: p.y * 8, x0: p.x0 * 8, x1: p.x1 * 8,
  }));
}

/** Vertical structure Dan collides with - currently none.
 *
 *  The map's full-height columns are the sector-coloured ladder shafts, which
 *  the extractor turns into lifts. What is left is scenery: bay dividers, door
 *  frames and machinery that Dan runs straight past in the original. Treating
 *  that scenery as solid walls him into a corner within a screen or two, so
 *  what constrains him is floors, the holes in them, the shafts, and the edges
 *  of the screen. */
function wallsOf() {
  return [];
}

function liftsOf(room) {
  return room.lifts.map((l) => ({
    x0: l.x * 8, x1: (l.x + 1) * 8, y0: l.y0 * 8, y1: l.y1 * 8,
  }));
}

// ------------------------------------------------------- world layout (fixed)

/** Choose the screen Dan lands on: the leftmost surface screen. */
function findStart() {
  const surface = PLAYABLE.filter((x) => x.room.sector === 0);
  const pool = surface.length ? surface : PLAYABLE;
  return pool.reduce((a, b) => (b.r < a.r || (b.r === a.r && b.c < a.c) ? b : a));
}

const START = findStart();

/** One SDS key per sector (excluding the surface), in the screen furthest from
 *  the landing point - the original makes you cross each area to find one. */
function placeKeys() {
  const dist = (x) => Math.abs(x.r - START.r) + Math.abs(x.c - START.c);
  const bySector = new Map();
  for (const item of PLAYABLE) {
    if (item.room.sector === 0) continue;
    const cur = bySector.get(item.room.sector);
    if (!cur || dist(item) > dist(cur)) bySector.set(item.room.sector, item);
  }
  return [...bySector.values()].slice(0, 5).map((item, i) => {
    const p = highestPlatform(item.room);
    return { id: i, key: item.key, x: p.x, y: p.y - 10, taken: false };
  });
}

/** The broadest floor in a screen: where Dan is put down safely. */
function widestPlatform(room) {
  if (!room.platforms.length) return { x: 120, y: 120 };
  const p = room.platforms.reduce((a, b) => (b.x1 - b.x0 > a.x1 - a.x0 ? b : a));
  return { x: (p.x0 + p.x1) * 4, y: p.y * 8 };
}

/** A sensible perch inside a screen: the highest wide platform. */
function highestPlatform(room) {
  const ps = room.platforms.filter((p) => p.x1 - p.x0 >= 4);
  const pool = ps.length ? ps : room.platforms;
  if (!pool.length) return { x: 120, y: 120 };
  const p = pool.reduce((a, b) => (b.y < a.y ? b : a));
  return { x: (p.x0 + p.x1) * 4, y: p.y * 8 };
}

/** Prison cells: one screen per sector, where a captured Dan is dumped. */
function placePrisons() {
  const out = new Map();
  for (const item of PLAYABLE) {
    if (!out.has(item.room.sector)) out.set(item.room.sector, item.key);
  }
  return out;
}

/** The self-destruct room: the most central screen on the bottom row. */
function findSdsRoom() {
  const bottom = Math.max(...PLAYABLE.map((x) => x.r));
  const row = PLAYABLE.filter((x) => x.r === bottom);
  const mid = row.reduce((a, b) => a + b.c, 0) / row.length;
  return row.reduce((a, b) => (Math.abs(b.c - mid) < Math.abs(a.c - mid) ? b : a)).key;
}

const SDS_ROOM = findSdsRoom();
const PRISONS = placePrisons();

// ------------------------------------------------------------------ entities

function makeTreens(key, room) {
  const r = rng(hashKey(key));
  const wide = room.platforms.filter((p) => p.x1 - p.x0 >= 5);
  const n = wide.length === 0 ? 0 : Math.floor(r() * 3);
  const out = [];
  for (let i = 0; i < n; i++) {
    const p = wide[Math.floor(r() * wide.length)];
    const x0 = p.x0 * 8, x1 = p.x1 * 8 - TREEN_W;
    if (x1 <= x0) continue;
    out.push({
      x: x0 + r() * (x1 - x0), y: p.y * 8 - TREEN_H,
      x0, x1, dir: r() < 0.5 ? -1 : 1,
      cool: r() * 2, anim: 0, dead: false,
    });
  }
  return out;
}

function makePickups(key, room) {
  const r = rng(hashKey(key) ^ 0xa5a5);
  if (r() > 0.35) return [];
  const p = highestPlatform(room);
  return [{ x: p.x + 12, y: p.y - 9, taken: false }];
}

// --------------------------------------------------------------------- state

const state = {
  mode: "title",           // title | play | captured | won | lost
  r: START.r, c: START.c,
  timeLeft: START_TIME,
  energy: ENERGY_MAX,
  energyMax: ENERGY_MAX,
  score: 0,
  keys: 0,
  viewer: "asteroid",
  msgTop: null,          // narration box over the play area
  msgBottom: null,       // second box, as the original uses for asides
  messageTimer: 0,
  sectorSeen: new Set(),
  clearedRooms: new Set(),
  phase: 0,
};

let dan = null;
let treens = [];
let pickups = [];
let lasers = [];
let sdsKeys = placeKeys();

function currentRoom() { return roomAt(state.r, state.c); }

function resetDan(x, y) {
  dan = {
    x, y, vx: 0, vy: 0, face: 1,
    onGround: false, kneeling: false, turning: 0,
    onLift: null, anim: 0, hurt: 0, invuln: 0, fireCool: 0,
  };
}

function enterRoom(r, c, x, y) {
  state.r = r; state.c = c;
  const key = roomKey(r, c);
  const room = currentRoom();
  treens = state.clearedRooms.has(key) ? [] : makeTreens(key, room);
  pickups = makePickups(key, room);
  lasers = [];
  if (x != null) { dan.x = x; dan.y = y; dan.vx = 0; dan.vy = 0; dan.onLift = null; }
  dan.invuln = Math.max(dan.invuln, 0.8);
  treens = treens.filter((t) => Math.abs(t.x - dan.x) > 28 || Math.abs(t.y - dan.y) > 24);
  const sector = room.sector;
  if (!state.sectorSeen.has(sector)) {
    state.sectorSeen.add(sector);
    const style = sectorStyle(LEVEL, room);
    say(["DAN IS NOW IN", style.name], 2.5);
  }
  if (key === SDS_ROOM) say(["THE SELF DESTRUCT ROOM"], 2.5);
}

/** Narration box at the top of the play area; one box, one sentence. */
function say(lines, secs) {
  state.msgTop = lines;
  state.messageTimer = Math.max(state.messageTimer, secs);
}

/** Aside in the lower box. */
function note(lines, secs) {
  state.msgBottom = lines;
  state.messageTimer = Math.max(state.messageTimer, secs);
}

function startGame() {
  state.mode = "play";
  state.timeLeft = START_TIME;
  state.energy = ENERGY_MAX;
  state.score = 0;
  state.keys = 0;
  state.sectorSeen = new Set();
  state.clearedRooms = new Set();
  sdsKeys = placeKeys();
  const spawn = widestPlatform(roomAt(START.r, START.c));
  resetDan(spawn.x, spawn.y - DAN_H);
  enterRoom(START.r, START.c, spawn.x, spawn.y - DAN_H);
  say(["DAN LANDS ON", "THE ASTEROID"], 3);
}

// ------------------------------------------------------------------ collision

function overlaps(ax, ay, aw, ah, bx, by, bw, bh) {
  return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
}

/* Collision boxes are given as (x, y + yOff, w, h) so that kneeling can shrink
   Dan from the head down while his feet stay put. */

/** Move a body horizontally, stopping at walls. */
function moveX(body, dx, walls, w, h, yOff) {
  body.x += dx;
  for (const wl of walls) {
    if (overlaps(body.x, body.y + yOff, w, h, wl.x0, wl.y0, wl.x1 - wl.x0, wl.y1 - wl.y0)) {
      body.x = dx > 0 ? wl.x0 - w : wl.x1;
      body.vx = 0;
    }
  }
}

/** Move vertically; platforms catch a falling body at their top edge. */
function moveY(body, dy, platforms, w, h, yOff) {
  const prevBottom = body.y + yOff + h;
  body.y += dy;
  body.onGround = false;
  if (dy >= 0) {
    for (const p of platforms) {
      const bottom = body.y + yOff + h;
      if (bottom >= p.y && prevBottom <= p.y + 2 &&
          body.x + w > p.x0 && body.x < p.x1) {
        body.y = p.y - h - yOff;
        body.vy = 0;
        body.onGround = true;
      }
    }
  }
}

function liftUnder(x, w, y, h, lifts) {
  for (const l of lifts) {
    if (x + w > l.x0 && x < l.x1 && y + h > l.y0 && y < l.y1) return l;
  }
  return null;
}

// --------------------------------------------------------------------- input

const keys = {};
const tapped = {};
addEventListener("keydown", (e) => {
  if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space"].includes(e.code)) e.preventDefault();
  if (!keys[e.code]) tapped[e.code] = true;
  keys[e.code] = true;
});
addEventListener("keyup", (e) => { keys[e.code] = false; });

const held = {
  left: () => keys.ArrowLeft || keys.KeyO,
  right: () => keys.ArrowRight || keys.KeyP,
  up: () => keys.ArrowUp || keys.KeyQ,
  down: () => keys.ArrowDown || keys.KeyA,
  fire: () => keys.Space || keys.KeyM,
};

// ----------------------------------------------------------------- Dan update

function updateDan(dt) {
  const room = currentRoom();
  const platforms = platformsOf(room);
  const walls = wallsOf(room);
  const lifts = liftsOf(room);

  if (dan.hurt > 0) dan.hurt -= dt;
  if (dan.invuln > 0) dan.invuln -= dt;
  if (dan.fireCool > 0) dan.fireCool -= dt;

  // --- grav-lift: hold up or down inside a shaft to ride it ---
  const shaft = liftUnder(dan.x, DAN_W, dan.y, DAN_H, lifts);
  if (shaft && (held.up() || held.down())) {
    dan.onLift = shaft;
  } else if (!shaft) {
    dan.onLift = null;
  }

  if (dan.onLift) {
    dan.vy = 0;
    const dir = held.up() ? -1 : held.down() ? 1 : 0;
    dan.y += dir * LIFT_SPEED * dt;
    // centre Dan on the shaft while riding
    const cx = (dan.onLift.x0 + dan.onLift.x1) / 2 - DAN_W / 2;
    dan.x += Math.sign(cx - dan.x) * Math.min(40 * dt, Math.abs(cx - dan.x));
    dan.kneeling = false;
    dan.onGround = false;
  } else {
    // --- kneel: no turning while down ---
    dan.kneeling = held.down() && dan.onGround;

    let dir = 0;
    if (!dan.kneeling) {
      if (held.left()) dir = -1;
      else if (held.right()) dir = 1;
    }

    if (dan.turning > 0) {
      dan.turning -= dt;
      dir = 0;
    } else if (dir !== 0 && dir !== dan.face && dan.onGround) {
      dan.face = dir;
      dan.turning = TURN_TIME;   // Dan turns on the spot before setting off
      dir = 0;
    } else if (dir !== 0) {
      dan.face = dir;
    }

    if (dan.onGround) {
      dan.vx = dir * RUN_SPEED;
      if (held.up() && !shaft) {
        dan.vy = JUMP_VY;
        dan.vx = dir * JUMP_VX;   // straight up, or a diagonal hop
        dan.onGround = false;
      }
    } else {
      if (dir !== 0) dan.vx = dir * JUMP_VX;
    }

    dan.vy += GRAVITY * dt;
    const h = dan.kneeling ? DAN_KNEEL_H : DAN_H;
    const yOff = DAN_H - h;
    moveX(dan, dan.vx * dt, walls, DAN_W, h, yOff);
    moveY(dan, dan.vy * dt, platforms, DAN_W, h, yOff);
  }

  if (Math.abs(dan.vx) > 1 && dan.onGround) dan.anim += dt * 8;

  // --- fire: short range laser, kneeling shots come out low ---
  if (held.fire() && dan.fireCool <= 0) {
    dan.fireCool = 0.32;
    lasers.push({
      x: dan.x + (dan.face > 0 ? DAN_W : -4),
      y: dan.y + (dan.kneeling ? 13 : 7),
      dir: dan.face, travelled: 0, friendly: true,
    });
    beep(880, 0.05);
  }

  moveBetweenRooms();
}

/** Flip to the neighbouring screen when Dan walks or falls off this one.
 *  The tests fire as his leading edge touches the boundary, before the
 *  keep-him-on-screen clamp below can pin him there. */
function moveBetweenRooms() {
  if (dan.x <= 0 && roomAt(state.r, state.c - 1)) {
    enterRoom(state.r, state.c - 1, VIEW_W - DAN_W - 3, dan.y);
  } else if (dan.x + DAN_W >= VIEW_W && roomAt(state.r, state.c + 1)) {
    enterRoom(state.r, state.c + 1, 3, dan.y);
  } else if (dan.y > VIEW_H && roomAt(state.r + 1, state.c)) {
    enterRoom(state.r + 1, state.c, dan.x, 2);
  } else if (dan.y + DAN_H < 0 && roomAt(state.r - 1, state.c)) {
    enterRoom(state.r - 1, state.c, dan.x, VIEW_H - DAN_H - 2);
  } else {
    // no neighbour that way: keep Dan on this screen
    if (dan.x < 0) dan.x = 0;
    if (dan.x + DAN_W > VIEW_W) dan.x = VIEW_W - DAN_W;
    if (dan.y > VIEW_H) { dan.y = VIEW_H - DAN_H; dan.vy = 0; }
    if (dan.y < 0) { dan.y = 0; dan.vy = 0; }
  }
}

// -------------------------------------------------------------- Treen update

function updateTreens(dt) {
  for (const t of treens) {
    if (t.dead) continue;
    t.anim += dt * 5;
    t.x += t.dir * 22 * dt;
    if (t.x <= t.x0) { t.x = t.x0; t.dir = 1; }
    if (t.x + TREEN_W >= t.x1) { t.x = t.x1 - TREEN_W; t.dir = -1; }

    t.cool -= dt;
    const level = Math.abs((t.y + TREEN_H) - (dan.y + DAN_H)) < 12;
    if (t.cool <= 0 && level) {
      t.cool = 1.4 + Math.random();
      const dir = dan.x > t.x ? 1 : -1;
      t.dir = dir;
      lasers.push({
        x: t.x + (dir > 0 ? TREEN_W : -4), y: t.y + 8,
        dir, travelled: 0, friendly: false,
      });
    }

    if (dan.invuln <= 0 && overlaps(dan.x, dan.y, DAN_W, DAN_H, t.x, t.y, TREEN_W, TREEN_H)) {
      hurtDan(18);
      dan.vx = (dan.x < t.x ? -1 : 1) * 90;
      dan.vy = -70;
    }
  }
}

function updateLasers(dt) {
  for (const l of lasers) {
    const step = LASER_SPEED * dt;
    l.x += l.dir * step;
    l.travelled += step;
    if (l.friendly) {
      for (const t of treens) {
        if (!t.dead && overlaps(l.x, l.y, 4, 2, t.x, t.y, TREEN_W, TREEN_H)) {
          t.dead = true;
          l.travelled = 1e9;
          state.score += 75;
          beep(160, 0.18, "sawtooth");
        }
      }
    } else if (dan.invuln <= 0 && overlaps(l.x, l.y, 4, 2, dan.x, dan.y, DAN_W, DAN_H) &&
               !dan.kneeling) {
      hurtDan(10);
      l.travelled = 1e9;
    }
  }
  lasers = lasers.filter((l) => l.travelled < LASER_RANGE && l.x > -8 && l.x < VIEW_W + 8);

  if (treens.length && treens.every((t) => t.dead)) {
    const key = roomKey(state.r, state.c);
    if (!state.clearedRooms.has(key)) {
      state.clearedRooms.add(key);
      note(["THIS ROOM IS SAFE"], 1.8);
    }
  }
}

function hurtDan(amount) {
  state.energy -= amount;
  dan.hurt = 1.0;
  dan.invuln = 1.0;
  beep(120, 0.15, "sawtooth");
  if (state.energy <= 0) capture();
}

/** Out of energy: the original does not kill you, it jails you and burns
 *  ten minutes off the clock. */
function capture() {
  state.energy = ENERGY_MAX;
  state.timeLeft -= CAPTURE_PENALTY;
  state.score = Math.max(0, state.score - 200);
  const cell = PRISONS.get(currentRoom().sector) || START.key;
  const [r, c] = cell.split(",").map(Number);
  const p = highestPlatform(roomAt(r, c));
  resetDan(p.x, p.y - DAN_H);
  enterRoom(r, c, p.x, p.y - DAN_H);
  state.viewer = "mekon";
  say(["DAN IS CAPTURED!"], 3);
  note(["TEN MINUTES LOST"], 3);
  setTimeout(() => { state.viewer = "asteroid"; }, 3000);
}

// ------------------------------------------------------------------- pickups

function updatePickups() {
  const key = roomKey(state.r, state.c);
  for (const p of pickups) {
    if (!p.taken && overlaps(dan.x, dan.y, DAN_W, DAN_H, p.x, p.y, 8, 8)) {
      p.taken = true;
      state.energy = Math.min(ENERGY_MAX, state.energy + 25);
      state.score += 25;
      beep(660, 0.12);
      note(["ENERGY RESTORED"], 1.5);
    }
  }
  for (const k of sdsKeys) {
    if (k.taken || k.key !== key) continue;
    if (overlaps(dan.x, dan.y, DAN_W, DAN_H, k.x, k.y, 8, 8)) {
      k.taken = true;
      state.keys++;
      state.score += 500;
      beep(990, 0.2);
      say(["DAN PICKS UP", "AN SDS KEY"], 2.5);
    }
  }
  if (key === SDS_ROOM && state.keys >= 5) {
    state.mode = "won";
    state.score += 2000;
    beep(1320, 0.5, "triangle");
  }
}

// ---------------------------------------------------------------------- audio

let actx = null;
function beep(freq, dur, type) {
  try {
    if (!actx) actx = new (window.AudioContext || window.webkitAudioContext)();
    const o = actx.createOscillator(), g = actx.createGain();
    o.type = type || "square";
    o.frequency.value = freq;
    g.gain.value = 0.05;
    o.connect(g); g.connect(actx.destination);
    o.start();
    g.gain.exponentialRampToValueAtTime(0.0001, actx.currentTime + dur);
    o.stop(actx.currentTime + dur);
  } catch (e) { /* no audio available */ }
}

// -------------------------------------------------------------------- drawing

const canvas = document.getElementById("screen");
const ctx = canvas.getContext("2d");
ctx.imageSmoothingEnabled = false;

function danSprite() {
  if (dan.onLift) return "dan_stand";
  if (dan.kneeling) return "dan_kneel";
  if (!dan.onGround) return "dan_jump";
  if (Math.abs(dan.vx) > 1) return Math.floor(dan.anim) % 2 ? "dan_run1" : "dan_run2";
  return "dan_stand";
}

function draw() {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = C.black;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  const scale = canvas.width / SCREEN_W;
  ctx.setTransform(scale, 0, 0, scale, 0, 0);

  if (state.mode === "title") return drawTitle();

  drawFrame(ctx);
  ctx.save();
  ctx.beginPath();
  ctx.rect(VIEW_X, VIEW_Y, VIEW_W, VIEW_H);
  ctx.clip();
  ctx.translate(VIEW_X, VIEW_Y);

  const key = roomKey(state.r, state.c);
  const room = currentRoom();
  drawRoom(ctx, LEVEL, key, room, state.phase * 12);

  for (const p of pickups) {
    if (!p.taken) drawSprite(ctx, "energy", Math.round(p.x), Math.round(p.y),
                             { main: C.bcyan, shade: C.cyan, light: C.bwhite });
  }
  for (const k of sdsKeys) {
    if (!k.taken && k.key === key) {
      drawSprite(ctx, "key", Math.round(k.x), Math.round(k.y),
                 { main: C.byellow, shade: C.red, light: C.bwhite });
    }
  }
  for (const t of treens) {
    if (t.dead) continue;
    drawSprite(ctx, Math.floor(t.anim) % 2 ? "treen_walk" : "treen_stand",
               Math.round(t.x - 1), Math.round(t.y),
               { main: C.bgreen, shade: C.green, light: C.bwhite }, t.dir < 0);
  }
  for (const l of lasers) {
    ctx.fillStyle = l.friendly ? C.bwhite : C.bred;
    ctx.fillRect(Math.round(l.x), Math.round(l.y), 4, 2);
  }
  if (!(dan.hurt > 0 && Math.floor(dan.hurt * 16) % 2)) {
    drawSprite(ctx, danSprite(), Math.round(dan.x - 1), Math.round(dan.y),
               { main: C.bcyan, shade: C.cyan, light: C.bwhite }, dan.face < 0);
  }

  if (state.messageTimer > 0) {
    if (state.msgTop) drawMessage(ctx, state.msgTop, true);
    if (state.msgBottom) drawMessage(ctx, state.msgBottom, false);
  } else {
    state.msgTop = state.msgBottom = null;
  }
  ctx.restore();

  drawPanel(ctx, state);

  if (state.mode === "won") banner("MISSION COMPLETE", "THE ASTEROID IS DESTROYED");
  if (state.mode === "lost") banner("OUT OF TIME", "THE ASTEROID HITS EARTH");
}

function banner(a, b) {
  ctx.fillStyle = "rgba(0,0,0,0.75)";
  ctx.fillRect(VIEW_X, VIEW_Y + 40, VIEW_W, 50);
  const wa = textWidth(a), wb = textWidth(b);
  drawText(ctx, a, VIEW_X + (VIEW_W - wa) / 2, VIEW_Y + 52, C.byellow);
  drawText(ctx, b, VIEW_X + (VIEW_W - wb) / 2, VIEW_Y + 66, C.bwhite);
  drawText(ctx, "PRESS ENTER", VIEW_X + (VIEW_W - textWidth("PRESS ENTER")) / 2,
           VIEW_Y + 78, C.bcyan);
}

function drawTitle() {
  drawFrame(ctx);
  ctx.save();
  ctx.translate(VIEW_X, VIEW_Y);
  drawStarfield(ctx, "title");
  ctx.fillStyle = C.red;
  ctx.fillRect(20, 14, VIEW_W - 40, 30);
  ctx.fillStyle = C.byellow;
  ctx.fillRect(20, 14, VIEW_W - 40, 2);
  ctx.fillRect(20, 42, VIEW_W - 40, 2);
  let w = textWidth("DAN DARE") * 2;
  ctx.save();
  ctx.translate((VIEW_W - w) / 2, 20);
  ctx.scale(2, 2);
  drawText(ctx, "DAN DARE", 0, 0, C.byellow);
  ctx.restore();
  drawText(ctx, "PILOT OF THE FUTURE",
           (VIEW_W - textWidth("PILOT OF THE FUTURE")) / 2, 34, C.bwhite);

  const lines = [
    "THE MEKON'S ASTEROID IS ON",
    "COURSE FOR EARTH. FIND THE",
    "FIVE SDS KEYS AND CARRY THEM",
    "TO THE SELF DESTRUCT ROOM.",
    "",
    "O/P OR ARROWS  MOVE",
    "Q OR UP  JUMP     A OR DOWN  KNEEL",
    "SPACE  FIRE",
  ];
  lines.forEach((ln, i) => drawText(ctx, ln, 14, 56 + i * 9, i < 4 ? C.bcyan : C.white));
  if (Math.floor(state.phase * 2) % 2) {
    drawText(ctx, "PRESS ENTER TO START",
             (VIEW_W - textWidth("PRESS ENTER TO START")) / 2, 132, C.byellow);
  }
  ctx.restore();
  drawPanel(ctx, state);
}

// ------------------------------------------------------------------ main loop

let last = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  state.phase += dt;

  if (state.mode === "title" || state.mode === "won" || state.mode === "lost") {
    if (tapped.Enter) startGame();
  } else {
    state.timeLeft -= dt * CLOCK_RATE;
    if (state.messageTimer > 0) state.messageTimer -= dt;
    if (state.timeLeft <= 0) {
      state.timeLeft = 0;
      state.mode = "lost";
    }
    updateDan(dt);
    updateTreens(dt);
    updateLasers(dt);
    updatePickups();
  }

  draw();
  for (const k in tapped) delete tapped[k];
  requestAnimationFrame(frame);
}

resetDan(24, 40);
enterRoom(START.r, START.c, 24, 40);
state.mode = "title";
requestAnimationFrame(frame);
