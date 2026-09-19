"use strict";
/* Dan Dare: Pilot of the Future - a recreation of the 1986 ZX Spectrum game.
 *
 * The level geometry is derived from the game's screen map by
 * tools/extract_level.py; this file is the engine that plays it.
 *
 * The rules follow the original: a two-hour countdown, an energy bar rather
 * than lives (run out and you are captured and dumped in a prison cell, losing
 * ten minutes), five parts of the self-destruct mechanism - one per sector -
 * to carry to its room and fit, each opening the door to the next sector, Treen guards that make a room safe once cleared, and
 * grav-lift shafts between floors.
 */

const LEVEL = window.DANDARE_LEVEL;
const RW = LEVEL.room.w, RH = LEVEL.room.h;      // 30 x 18 cells

// --- tuning ---------------------------------------------------------------
const RUN_SPEED = 72;          // px/s, as measured in the original
const GRAVITY = 500;
const JUMP_VY = -100;          // the original's jump: 10 px high, 0.4 s in the air
const JUMP_VX = 140;            // ... and four or five cells along
const LIFT_SPEED = 44;
const TURN_TIME = 0.12;        // Dan turns on the spot before running back
// The rifle, as filmed in the original: a shot every six frames while the
// button is held; each shot is a dash one cell wide that moves a cell a frame
// and leaves the two previous dashes behind it, a 24-pixel streak; it dies
// after a random eight to twenty cells, the streak fading over two frames.
const FRAME = 1 / 50;          // the original's frame
const FIRE_PERIOD = 6 * FRAME;
const LASER_STEP = 8;          // one cell a frame
const LASER_TRAIL = 2;         // dashes left behind the head
const LASER_MIN = 8, LASER_MAX = 20;   // cells a shot lives, chosen at random
const TREEN_LASER_CELLS = 9;
const CLOCK_RATE = 3;          // game seconds per real second
const START_TIME = 2 * 3600;
const ESCAPE_ROOM = "75";       // Digby waits with the Anastasia here once the mechanism is armed
const ENERGY_MAX = 100;
const CAPTURE_PENALTY = 600;   // ten minutes

const DAN_W = 10, DAN_H = 32, DAN_KNEEL_H = 22;  // his hit box; kneeling keeps the top 10 rows clear
const TREEN_W = 10, TREEN_H = 32;
const TREEN_DEATH = 0.2;         // seconds a shot guard stands with his arms up before he is gone, the room flashing

// --------------------------------------------------------------- level utils

const ROOMS = LEVEL.rooms;
const ROOM_IDS = Object.keys(ROOMS);
const PLAYABLE = ROOM_IDS.map((key) => ({ key, room: ROOMS[key] }));

/** Platforms Dan can stand on, as pixel spans. */
function platformsOf(room) {
  return room.platforms.map((p) => ({
    y: p.y * 8, x0: p.x0 * 8, x1: p.x1 * 8,
  }));
}

/** Walls Dan collides with (cell class 4), as pixel boxes, one per row run. */
const WALL_CACHE = new Map();
function wallsOf(key) {
  if (WALL_CACHE.has(key)) return WALL_CACHE.get(key);
  const cells = ROOMS[key].cells, out = [];
  for (let j = 0; j < RH; j++) {
    let run = null;
    for (let i = 0; i <= RW; i++) {
      const wall = i < RW && cells.charCodeAt(j * RW + i) === 52;   // "4"
      if (wall && run === null) run = i;
      if (!wall && run !== null) { out.push({ x0: run * 8, y0: j * 8, x1: i * 8, y1: j * 8 + 8 }); run = null; }
    }
  }
  WALL_CACHE.set(key, out);
  return out;
}

/* How the rooms join: recorded by playing the original in an emulator (see
   tools/build_level.py). Walking off an edge, falling through a hole, and
   riding a lift from the cells the game accepts - nothing here is guessed. */
const EXITS = {};
for (const key of ROOM_IDS) EXITS[key] = { lefts: [], rights: [], drops: [], lifts: [] };
for (const l of LEVEL.links) {
  const e = EXITS[l.from];
  if (!e) continue;
  if (l.kind === "left" || l.kind === "right") e[l.kind + "s"].push(l);
  else if (l.kind === "drop") e.drops.push(l);
  else e.lifts.push(l);
}
/** A door the original only opened once enough parts were fitted. */
function isOpen(l) { return !!l && !(l.needs > state.fitted); }
/** The doorway on this side at the height Dan is walking: a room's left or
 *  right edge can lead to different rooms from different floors. */
function exitAt(list, feet) {
  if (!list.length) return null;
  const at = list.filter((l) => l.feet == null || Math.abs(l.feet - feet) <= 14);
  const pool = (at.length ? at : list).slice().sort((p, q) => (q.n || 0) - (p.n || 0));   // the best-attested first
  return pool.find((l) => l.feet != null && Math.abs(l.feet - feet) <= 14) || pool[0];
}

/** The cells a lift answers from: the ones the original accepted (a cell or
 *  two left of the rails) widened to the whole shaft, so standing anywhere
 *  between the rails works too. */
function liftSpan(room, l) {
  return [l.x0, l.x1];          // exactly the cells the original answered a call from: run past them and a jump is a jump
}
function inLiftZone(room, l, cell) {
  const [a, b] = liftSpan(room, l);
  return cell >= a && cell <= b;
}

/** Rooms in order of how far they are from the start, walking the links. */
const HOPS = (() => {
  const d = { [LEVEL.start]: 0 };
  const q = [LEVEL.start];
  while (q.length) {
    const k = q.shift(), e = EXITS[k];
    const next = [...e.lefts, ...e.rights, ...e.drops, ...e.lifts].filter(Boolean).map((x) => x.to);
    for (const n of next) if (!(n in d)) { d[n] = d[k] + 1; q.push(n); }
  }
  return d;
})();

// ------------------------------------------------------- world layout (fixed)

/** Choose the screen Dan lands on: the leftmost surface screen. */
function findStart() {
  return { key: LEVEL.start, room: ROOMS[LEVEL.start] };
}

const START = findStart();

/** The parts of the self-destruct mechanism, where the original keeps them:
 *  on the floor of the rooms the survey found them in. */
function placeParts() {
  return LEVEL.parts.map((p, i) => {
    const room = ROOMS[p.room];
    const floor = room.platforms.reduce((a, b) => (b.y > a.y ? b : a));
    return { id: i, key: p.room, x: (p.x ?? 4) * 8, y: floor.y * 8 - 10, taken: false };
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

/** Prison cells: the rooms the original puts a captured Dan in, one per
 *  sector; a sector without one of its own uses the nearest behind it. */
function placePrisons() {
  const out = new Map();
  const cells = (LEVEL.prisons || []).map((k) => ({ key: k, zone: ROOMS[k].zone }));
  for (const zone of new Set(PLAYABLE.map((item) => item.room.zone))) {
    // the cells are listed sector by sector: this sector's, else the last
    // sector's behind him - never one beyond a door he has not opened
    const own = cells[Math.min(zone, cells.length) - 1];
    if (own) out.set(zone, own.key);
  }
  return out;
}

const SDS_ROOM = LEVEL.slot;
const PRISONS = placePrisons();

// ------------------------------------------------------------------ entities

function makeTreens(key, room) {
  const dead = state.deadTreens.get(key) || new Set();   // a Treen shot stays shot
  const r = rng(hashKey(key));
  const wide = room.platforms.filter((p) => p.x1 - p.x0 >= 5);
  // the fourth sector is unguarded, as in the original, and so is the Mekon's hologram room
  const unguarded = (room.label || room.zone) === 4 || (LEVEL.boss && LEVEL.boss.room === key);
  const n = wide.length === 0 || unguarded ? 0 : Math.floor(r() * 3);
  const out = [];
  for (let i = 0; i < n; i++) {
    const p = wide[Math.floor(r() * wide.length)];
    const x0 = p.x0 * 8, x1 = p.x1 * 8 - TREEN_W;
    if (x1 <= x0) continue;
    const x = x0 + r() * (x1 - x0);
    // keep guards apart: two drawn on top of each other read as one broken sprite
    if (out.some((t) => Math.abs(t.x - x) < 28 && Math.abs(t.y - (p.y * 8 - TREEN_H)) < 8)) continue;
    out.push({
      id: i, x, y: p.y * 8 - TREEN_H,
      x0, x1, dir: r() < 0.5 ? -1 : 1,
      cool: r() * 2, anim: 0, dead: dead.has(i),
    });
  }
  return out;
}

function makePickups(key, room) {
  const r = rng(hashKey(key) ^ 0xa5a5);
  if (r() > 0.35) return [];
  const p = widestPlatform(room);
  return [{ x: p.x + 12, y: p.y - 9, taken: false }];
}

// --------------------------------------------------------------------- state

const state = {
  mode: "title",           // title | play | captured | won | lost
  room: START.key,
  timeLeft: START_TIME,
  energy: ENERGY_MAX,
  energyMax: ENERGY_MAX,
  score: 0,
  fitted: 0,           // parts of the mechanism in their sockets
  carrying: false,     // Dan has a part on him
  armed: false,        // all five parts fitted: the countdown runs
  viewer: "asteroid",
  msgTop: null,          // narration box over the play area
  msgBottom: null,       // second box, as the original uses for asides
  messageTimer: 0,
  sectorSeen: new Set(),
  alerted: new Set(),      // rooms whose guards have raised the alarm
  viewerTimer: 0, viewerStatic: 0,
  taunts: 0, nextTaunt: 40,   // the Mekon's calls
  clearedRooms: new Set(),
  deadTreens: new Map(),   // room -> which of its guards have been shot
  burst: 0,              // lift-transfer flash, seconds left
  flash: 0,              // the room's colours cycling after a guard is shot, seconds left
  phase: 0,
};

let dan = null;
let boss = null;          // the seated figure in the self-destruct room
let treens = [];
let pickups = [];
let lasers = [];
let sdsParts = placeParts();

function currentRoom() { return ROOMS[state.room]; }

function resetDan(x, y) {
  dan = {
    x, y, vx: 0, vy: 0, face: 1,
    onGround: false, kneeling: false, turning: 0,
    onLift: null, liftLatch: false, shaftFall: false, anim: 0, hurt: 0, invuln: 0, fireCool: 0, stun: 0,
  };
}

function enterRoom(key, x, y) {
  state.room = key;
  // the original ends the game the moment Dan steps into the launch bay -
  // "DAN AND DIGBY MAKE A GETAWAY!" - which lies behind the last gate
  if (key === ESCAPE_ROOM && state.mode === "play") { state.mode = "won"; state.score += 5000; }
  const room = currentRoom();
  treens = state.clearedRooms.has(key) ? [] : makeTreens(key, room);
  pickups = makePickups(key, room);
  lasers = [];
  if (x != null) { dan.x = x; dan.y = y; dan.vx = 0; dan.vy = 0; }
  dan.invuln = Math.max(dan.invuln, 0.8);
  treens = treens.filter((t) => Math.abs(t.x - dan.x) > 28 || Math.abs(t.y - dan.y) > 24);
  if (treens.some((t) => !t.dead) && !state.alerted.has(key)) {
    state.alerted.add(key);
    say(["INTRUDER ALERT !"], 2.5);
  }
  const zone = room.label || room.zone;                    // the number the original announces
  if (!state.sectorSeen.has(zone)) {
    state.sectorSeen.add(zone);
    say(["DAN IS NOW IN SECTOR " + zone], 2.5);
    if (zone > 1) taunt();
  }
  // the Mekon's hologram: he waits on his dais in one room of the fifth sector
  boss = LEVEL.boss && LEVEL.boss.room === key ? { x: LEVEL.boss.x, y: LEVEL.boss.feet - 30, anim: 0 } : null;
  if (boss) say(["\"I SAY....IT'S A HOLOGRAM !\""], 3);   // every time he walks in, as in the original
  if (key === SDS_ROOM) {
    say(["THE SELF DESTRUCT ROOM"], 2.5);
    if (state.carrying) note(["WALK TO THE LEFT", "TO FIT THE PART"], 3);
  }
}

/** The Mekon on the video link: his face on the screen at the bottom right,
 *  his words in the box at the top. */
function call(lines, secs) {
  note(lines, secs);                 // over the link his words come up in the lower box
  state.viewer = "mekon";
  state.viewerTimer = secs;
  state.viewerStatic = 0.5;          // the picture takes a moment to lock on
}

const TAUNTS = [
  ["YOU WILL NOT", "SUCCEED, DARE!"],
  ["THE ASTEROID CANNOT", "BE STOPPED, DARE"],
  ["MY TREENS WILL", "FIND YOU, DARE"],
  ["TIME IS RUNNING", "OUT, EARTHMAN"],
  ["GIVE UP, DARE.", "EARTH IS FINISHED"],
];
/** He calls to gloat: on a new sector, a fitted part, a capture, and now and then. */
function taunt() {
  call(TAUNTS[state.taunts++ % TAUNTS.length], 3);
  state.nextTaunt = 45 + Math.random() * 60;
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
  state.sectorSeen = new Set();
  state.alerted = new Set();
  state.clearedRooms = new Set();
  state.deadTreens = new Map();
  sdsParts = placeParts();
  state.fitted = 0;
  state.carrying = false;
  state.armed = false;
  const spawn = widestPlatform(START.room);
  resetDan(16, spawn.y - DAN_H);
  enterRoom(START.key, 16, spawn.y - DAN_H);
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
      if (bottom >= p.y && prevBottom <= p.y + 0.5 &&       // once below a floor's top he is past it: no catching the far edge of a gap
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
  left: () => !(dan.stun > 0) && (keys.ArrowLeft || keys.KeyO),
  right: () => !(dan.stun > 0) && (keys.ArrowRight || keys.KeyP),
  up: () => !(dan.stun > 0) && (keys.ArrowUp || keys.KeyQ),
  down: () => !(dan.stun > 0) && (keys.ArrowDown || keys.KeyA),
  fire: () => !(dan.stun > 0) && (keys.Space || keys.KeyM),
};

// ----------------------------------------------------------------- Dan update

function updateDan(dt) {
  const room = currentRoom();
  const platforms = platformsOf(room);

  if (dan.hurt > 0) dan.hurt -= dt;
  if (dan.stun > 0) { dan.stun -= dt; dan.vx = 0; }   // out cold in the cell: nothing answers the keys
  if (dan.invuln > 0) dan.invuln -= dt;
  if (dan.fireCool > 0) dan.fireCool -= dt;

  // --- grav-lift: stand on the marked cells and press up or down. One press
  //     rides to the next floor, in this room or the next; keeping the key
  //     held rides on through it. That is how the original behaves.
  const exits = EXITS[state.room];
  const cell = Math.floor((dan.x + DAN_W / 2) / 8);
  // a lift answers only from its stops - the floors the original called it
  // from or stopped it at; not every floor beside a shaft is one
  const liftHere = (kind) => exits.lifts.find((l) => l.kind === kind && inLiftZone(room, l, cell) &&
                                                 Math.abs(dan.y + DAN_H - l.feet) <= 14);
  if (!held.up() && !held.down()) dan.liftLatch = false;   // a ride wants a fresh press
  if (!dan.onLift && dan.onGround && !dan.liftLatch) {
    const call = held.down() ? liftHere("down") : held.up() ? liftHere("up") : null;
    if (call) {
      // the stop is in the room the link leads to: here only for a ride
      // between this room's own floors
      dan.onLift = { dir: held.down() ? 1 : -1, link: call, stop: call.stop, stopHere: call.to === state.room };
    }
  }
  // the field carries him between the rails, whichever cell he called it from;
  // arriving in a room by lift, the ride goes on only where that room's own
  // lift continues the same way
  if (dan.onLift && dan.onLift.shaft === undefined) {
    const sh = room.shafts.find((s) => cell >= s.x - 3 && cell <= s.x + s.w) || null;
    dan.onLift.shaft = sh;
    dan.onLift.startFeet = dan.y + DAN_H;      // the floor he set off from does not catch him
    if (!dan.onLift.link && sh) {
      const kind = dan.onLift.dir > 0 ? "down" : "up";
      const inShaft = (l) => l.kind === kind && l.x1 >= sh.x - 3 && l.x0 <= sh.x + sh.w;
      dan.onLift.link = exits.lifts.find((l) => inShaft(l) && l.to !== state.room) || null;
      // the broken lift: entered riding, it gives out at the bottom of the shaft here
      const gone = !dan.onLift.link && exits.lifts.find((l) => inShaft(l) && l.broken && l.feet < 0);
      if (gone) { dan.onLift.link = gone; dan.onLift.stop = gone.stop; dan.onLift.stopHere = true; }
    }
  }

  if (dan.onLift) {
    dan.vy = 0;
    dan.vx = 0;
    dan.kneeling = false;
    dan.onGround = false;
    const lift = dan.onLift;
    const dir = lift.dir;
    const hold = dir > 0 ? held.down() : held.up();
    const onward = lift.link && lift.link.to !== state.room && isOpen(lift.link);   // the shaft goes on
    if (hold && onward) { lift.stop = lift.link.stop; lift.stopHere = false; }   // riding through: the next stop is the next link's
    // (the field carries him straight up or down from where he called it, as
    // the original does: it never draws him in towards the rails)
    const before = dan.y + DAN_H;
    dan.y += dir * LIFT_SPEED * dt;
    const feet = dan.y + DAN_H;
    // the ride ends where the original ended it - the recorded stop height in
    // the room it leads to, whatever is there: a floor beside the shaft, and
    // Dan steps out on it; nothing, as with the one broken lift, and he drops.
    // Held on, it rides through the stop where the shaft goes on to another room.
    if (lift.stopHere && lift.stop != null && lift.stop >= 0 && !(hold && onward) && !(feet > VIEW_H)) {
      const reached = dir > 0 ? (before <= lift.stop && feet >= lift.stop) : (before >= lift.stop && feet <= lift.stop);
      const past = dir > 0 ? lift.stop > lift.startFeet + 16 : lift.stop < lift.startFeet - 16;
      if (reached && past) {
        dan.y = lift.stop - DAN_H;
        const floor = platforms.find((p) => Math.abs(p.y - lift.stop) <= 14 && dan.x + DAN_W > p.x0 - 8 && dan.x < p.x1 + 8);
        dan.onLift = null; dan.liftLatch = true;
        if (floor) { dan.y = floor.y - DAN_H; dan.onGround = true; }   // else the broken lift: he falls
        else if (lift.broken || (lift.link && lift.link.broken)) say(["OUT OF ORDER"], 3);
      }
    }
    // the field ends at the top of the shaft with no stop there: as in the
    // original, Dan drops back down the shaft to its bottom, past any floor
    if (dan.onLift && dir < 0 && dan.y < 0 && !onward) { dan.y = 0; dan.onLift = null; dan.liftLatch = true; dan.shaftFall = true; }
    if (dan.onLift && dir > 0 && feet > VIEW_H && !onward) {
      dan.onLift = null; dan.liftLatch = true;               // no floor met: drop to it
    }
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
      if (held.up() && !dan.liftLatch) {
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
    // Nothing inside a room stops Dan: he walks in front of the machinery
    // and the panelling, as in the original. Only floors and ledges count,
    // and a low step is walked straight up onto.
    moveX(dan, dan.vx * dt, [], DAN_W, h, yOff);
    if (dan.onGround) {
      const feet = dan.y + DAN_H;
      for (const p of platforms) {
        if (dan.x + DAN_W > p.x0 && dan.x < p.x1 && feet > p.y && feet - p.y <= 17) dan.y = p.y - DAN_H;   // a kerb of two courses is walked up
      }
    }
    let catchers = platforms;
    if (dan.shaftFall) {                   // falling down the shaft: only its bottom floor catches him
      const under = platforms.filter((p) => dan.x + DAN_W > p.x0 && dan.x < p.x1 && p.y >= dan.y + DAN_H - 2);
      const lowest = under.length ? Math.max(...under.map((p) => p.y)) : -1;
      catchers = platforms.filter((p) => p.y === lowest);
    }
    moveY(dan, dan.vy * dt, catchers, DAN_W, h, yOff);
    if (dan.onGround) dan.shaftFall = false;
  }

  if (Math.abs(dan.vx) > 1 && dan.onGround) dan.anim += dt * 8;

  // --- fire: short range laser, kneeling shots come out low ---
  if (held.fire() && dan.fireCool <= 0) {
    dan.fireCool = FIRE_PERIOD;
    // the dash leaves the rifle's muzzle: 17 past the figure's middle, level with the barrel
    const tip = dan.x + DAN_W / 2 + dan.face * 17;
    lasers.push({
      x: dan.face > 0 ? tip : tip - LASER_STEP,
      y: dan.y + (dan.kneeling ? 20 : 13),
      dir: dan.face, cells: LASER_MIN + Math.floor(Math.random() * (LASER_MAX - LASER_MIN + 1)),
      trail: [], acc: 0, friendly: true,
    });
    zap();
  }

  moveBetweenRooms();
}


/** Flip to the next screen when Dan walks off this one, falls through a
 *  hole, or rides a lift out of it - each only where the original allows. */
function moveBetweenRooms() {
  const e = EXITS[state.room];
  const c0 = Math.floor(dan.x / 8), c1 = Math.floor((dan.x + DAN_W - 1) / 8);   // the cells under his feet
  const zone = (list) => list.find((l) => c1 >= l.x0 && c0 <= l.x1);
  const ride = dan.onLift && dan.onLift.link;
  const feet = dan.y + DAN_H;
  const left = exitAt(e.lefts, feet), right = exitAt(e.rights, feet);
  // through a doorway he arrives at the height the original set him down at
  // (the link's feet) when he is walking or coming down - a step or a course
  // between the two rooms' floors is absorbed at the door, as there
  const arrive = (l) => { if (l.feet != null && dan.vy >= 0 && Math.abs(feet - l.feet) <= 14) { dan.y = l.feet - DAN_H; dan.vy = 0; } };
  if (dan.x <= 0 && isOpen(left)) {
    arrive(left);
    enterRoom(left.to, VIEW_W - DAN_W - 3, dan.y);
  } else if (dan.x + DAN_W >= VIEW_W && isOpen(right)) {
    arrive(right);
    enterRoom(right.to, 3, dan.y);
  } else if (dan.y + DAN_H > VIEW_H && ride && ride.kind === "down" && ride.to !== state.room && isOpen(ride)) {
    enterRoom(ride.to, dan.x, -DAN_H + 6);                           // riding on down
    dan.onLift = { dir: 1, link: null, stop: ride.stop, stopHere: true, broken: ride.broken };
    dan.liftLatch = true;
    // the one lift that is out of order: the original says so as he rides into its room
    if (ride.broken || EXITS[ride.to].lifts.some((l) => l.broken && l.feet < 0)) say(["OUT OF ORDER"], 3);
  } else if (dan.y + DAN_H > 130 && !dan.onLift && isOpen(zone(e.drops))) {
    // fell through a hole in the floor: the original switches rooms as soon
    // as he drops below the floor course, before his run carries him past it
    enterRoom(zone(e.drops).to, dan.x, -DAN_H + 6);
  } else if (dan.y + DAN_H / 2 < 0 && ride && ride.kind === "up" && ride.to !== state.room && isOpen(ride)) {
    enterRoom(ride.to, dan.x, VIEW_H - DAN_H / 2);                    // riding on up
    dan.onLift = { dir: -1, link: null, stop: ride.stop, stopHere: true, broken: ride.broken };
    dan.liftLatch = true;
    if (ride.broken) say(["OUT OF ORDER"], 3);
  } else {
    // no way out that way: keep Dan on this screen
    if (dan.x < 0) dan.x = 0;
    if (dan.x + DAN_W > VIEW_W) dan.x = VIEW_W - DAN_W;
    if (dan.y + DAN_H > VIEW_H && !dan.onLift) {
      // below the floor with no way out: a floor under him, and he stands on
      // it; none, and he has fallen into the pit - the original's "fell too far"
      // (a lift arriving from below is still half off the screen - leave it)
      const under = platformsOf(currentRoom()).filter((p) => dan.x + DAN_W > p.x0 && dan.x < p.x1);
      if (!under.length) { fellTooFar(); return; }
      const floor = under.reduce((a, b) => (b.y > a.y ? b : a));
      dan.y = floor.y - DAN_H; dan.vy = 0; dan.onGround = true; dan.onLift = null; dan.liftLatch = true;
    }
    const ridingOut = ride && ride.kind === "up" && ride.to !== state.room && isOpen(ride);
    if (dan.y < 0 && !ridingOut) { dan.y = 0; dan.vy = 0; }
  }
}

// -------------------------------------------------------------- Treen update

function updateTreens(dt) {
  for (const t of treens) {
    if (t.dying > 0) t.dying -= dt;              // his last moment after the shot that got him
    if (t.dead) continue;
    if (t.fire > 0) t.fire -= dt;
    t.anim += dt * 5;
    t.x += t.dir * 22 * dt;
    if (t.x <= t.x0) { t.x = t.x0; t.dir = 1; }
    if (t.x + TREEN_W >= t.x1) { t.x = t.x1 - TREEN_W; t.dir = -1; }

    t.cool -= dt;
    const level = Math.abs((t.y + TREEN_H) - (dan.y + DAN_H)) < 12;
    if (t.cool <= 0 && level) {
      t.cool = 1.4 + Math.random();
      t.fire = 0.22;
      const dir = dan.x > t.x ? 1 : -1;
      t.dir = dir;
      lasers.push({
        x: t.x + (dir > 0 ? TREEN_W + 8 : -8), y: t.y + 14,
        dir, cells: TREEN_LASER_CELLS, trail: [], acc: 0, friendly: false,
      });
    }

    if (dan.invuln <= 0 && !dan.onLift && overlaps(dan.x, dan.y, DAN_W, DAN_H, t.x, t.y, TREEN_W, TREEN_H)) {
      hurtDan(18);
      dan.vx = (dan.x < t.x ? -1 : 1) * 90;
      dan.vy = -70;
    }
  }
}

/** A shot's dash hits whatever it crosses; the dead shot's streak fades. */
function laserHit(l) {
  if (l.friendly) {
    for (const t of treens) {
      if (!t.dead && overlaps(l.x, l.y, LASER_STEP, 2, t.x, t.y, TREEN_W, TREEN_H)) {
        t.dead = true;
        t.dying = TREEN_DEATH;
        state.flash = TREEN_DEATH;                 // the original flashes the whole room
        if (!state.deadTreens.has(state.room)) state.deadTreens.set(state.room, new Set());
        state.deadTreens.get(state.room).add(t.id);
        l.cells = 0;
        state.score += 75;
        beep(160, 0.18, "sawtooth");
      }
    }
  } else if (dan.invuln <= 0 && overlaps(l.x, l.y, LASER_STEP, 2, dan.x, dan.y, DAN_W, DAN_H) &&
             !dan.kneeling && !dan.onLift) {          // the field shields him while he rides
    hurtDan(10);
    l.cells = 0;
  }
}

function updateLasers(dt) {
  for (const l of lasers) {
    if (l.acc === 0 && l.cells > 0) laserHit(l);   // the dash where it appeared
    l.acc += dt;
    while (l.acc >= FRAME) {                       // the original moves it once a frame
      l.acc -= FRAME;
      if (l.cells > 0) {
        l.trail.unshift(l.x);
        if (l.trail.length > LASER_TRAIL) l.trail.pop();
        l.x += l.dir * LASER_STEP;
        l.cells--;
        if (l.x < 0 || l.x + LASER_STEP > VIEW_W) l.cells = 0;   // off the screen's edge
        else {
          laserHit(l);
          if (l.cells === 0) l.trail.unshift(l.x);   // the last dash lingers like the others
        }
      } else {
        l.trail.pop();                             // the streak fades a dash a frame
      }
    }
  }
  lasers = lasers.filter((l) => l.cells > 0 || l.trail.length);

  if (treens.length && treens.every((t) => t.dead)) {
    const key = state.room;
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

function fellTooFar() {
  note(["DAN FELL TOO FAR!"], 3);
  capture();
}

/** Out of energy: the original does not kill you, it jails you and burns
 *  ten minutes off the clock. */
function capture() {
  state.energy = ENERGY_MAX;
  state.timeLeft -= CAPTURE_PENALTY;
  state.score = Math.max(0, state.score - 200);
  const cell = PRISONS.get(currentRoom().zone) || START.key;
  const p = highestPlatform(ROOMS[cell]);
  resetDan(p.x, p.y - DAN_H);
  enterRoom(cell, p.x, p.y - DAN_H);
  say(["DAN FALLS UNCONSCIOUS", "FOR TEN MINUTES"], 3);
  dan.stun = 2.2;                              // he lies where they left him before coming round
  state.nextTaunt = 4;                         // he calls to gloat once Dan wakes
}

// ------------------------------------------------------------------- pickups

function updatePickups() {
  const key = state.room;
  for (const p of pickups) {
    if (!p.taken && overlaps(dan.x, dan.y, DAN_W, DAN_H, p.x, p.y, 8, 8)) {
      p.taken = true;
      state.energy = Math.min(ENERGY_MAX, state.energy + 25);
      state.score += 25;
      beep(660, 0.12);
      note(["ENERGY RESTORED"], 1.5);
    }
  }
  for (const k of sdsParts) {
    // the parts come one at a time: the next is where the last fitted one led
    if (k.taken || k.key !== key || state.carrying || k.id !== state.fitted) continue;
    if (overlaps(dan.x, dan.y, DAN_W, DAN_H, k.x, k.y, 8, 8)) {
      k.taken = true;
      state.carrying = true;
      state.score += 500;
      beep(990, 0.2);
      say(["NOW TAKE IT TO THE", "SELF-DESTRUCT SYSTEM"], 2.5);
    }
  }
  // the socket: walk to the left of the self-destruct room with a part
  if (key === SDS_ROOM && state.carrying && dan.x <= 32 && dan.onGround) {
    state.carrying = false;
    state.fitted++;
    state.score += 1000;
    beep(1320, 0.4, "triangle");
    if (state.fitted >= 5) {
      // the mechanism is armed: eleven minutes to get back to Digby's ship
      state.armed = true;
      state.timeLeft = 11 * 60 - 1;
      state.score += 2000;
      call(["\"11 MINUTES TO SELF DESTRUCT\""], 4);
      state.nextTaunt = 6;
    } else if (state.fitted >= LEVEL.parts.length) {
      say(["PART " + state.fitted + " FITTED"], 3);
      note(["THE SURVEY ENDS HERE", "FOR NOW"], 4);
    } else {
      say(["PART " + state.fitted + " FITTED"], 3);
      note(["A DOOR OPENS TO", "THE NEXT SECTOR"], 4);
      state.nextTaunt = 5;
    }
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

/** The rifle's report, as the original's beeper makes it: 72 toggles whose
 *  half-period grows from about one to seven samples at 44.1 kHz, every sixth
 *  a longer one - a falling chirp of seven and a half milliseconds. */
let zapBuffer = null;
function zap() {
  try {
    if (!actx) actx = new (window.AudioContext || window.webkitAudioContext)();
    if (!zapBuffer) {
      const sr = actx.sampleRate;
      const edges = [0];
      for (let n = 0; n < 71; n++) edges.push(edges[n] + (n % 6 === 1 ? 2.4 + 0.22 * n : 1 + 0.075 * n));
      const len = Math.ceil(edges[71] / 44100 * sr) + 1;
      zapBuffer = actx.createBuffer(1, len, sr);
      const d = zapBuffer.getChannelData(0);
      let k = 0;
      for (let i = 0; i < len; i++) {
        while (k < 71 && i / sr * 44100 >= edges[k + 1]) k++;
        d[i] = k % 2 ? 0.7 : -0.35;
      }
    }
    const src = actx.createBufferSource(), g = actx.createGain();
    src.buffer = zapBuffer;
    g.gain.value = 0.12;
    src.connect(g); g.connect(actx.destination);
    src.start();
  } catch (e) { /* no audio available */ }
}

// -------------------------------------------------------------------- drawing

const canvas = document.getElementById("screen");
const ctx = canvas.getContext("2d");
/** Size the canvas to the window: as many whole screen pixels per game pixel
 *  as fit (at the display's own density), so the tiles scale evenly while the
 *  drawn figures and Dan's rendered head get every pixel the display has. */
function fitCanvas() {
  const dpr = window.devicePixelRatio || 1;
  const k = Math.max(2, Math.min(9, Math.floor(Math.min(window.innerWidth * 0.96 / SCREEN_W, window.innerHeight * 0.88 / SCREEN_H) * dpr)));
  if (canvas.width !== SCREEN_W * k) {
    canvas.width = SCREEN_W * k;
    canvas.height = SCREEN_H * k;
  }
  canvas.style.width = (canvas.width / dpr) + "px";
  canvas.style.height = (canvas.height / dpr) + "px";
  ctx.imageSmoothingEnabled = false;         // (a resize resets the context)
}
fitCanvas();
window.addEventListener("resize", fitCanvas);

/** The markings by a lift: an arrow on the floor for each way it goes, over
 *  the cells it answers from. */
function drawLiftMarks(ctx, key, room) {
  const plats = platformsOf(room);
  for (const l of EXITS[key].lifts) {
    const [a, b] = liftSpan(room, l);
    const x0 = a * 8, x1 = (b + 1) * 8;
    const under = plats.filter((p) => p.x1 > x0 && p.x0 < x1 && Math.abs(p.y - l.feet) <= 14);
    const floor = under.length ? under.reduce((p, q) => (q.y < p.y ? q : p)).y : l.feet;
    const cx = Math.round((x0 + x1) / 2) + (l.kind === "up" ? -4 : 4);
    const y = floor - 3;
    ctx.fillStyle = C.byellow;
    ctx.fillRect(x0 + 1, floor - 1, x1 - x0 - 2, 1);
    ctx.fillStyle = l.kind === "up" ? C.bcyan : C.byellow;
    for (let i = 0; i < 3; i++) {
      const w = l.kind === "up" ? i + 1 : 3 - i;
      ctx.fillRect(cx - w, y - 2 + i, w * 2 + 1, 1);
    }
  }
}

/** The doors between sectors: a panel the height of Dan at the exit, shut
 *  until enough parts of the mechanism are fitted, then only its frame. */
function drawGates(ctx, key, room) {
  const e = EXITS[key];
  const style = sectorStyle(LEVEL, room);
  // doors the survey found, and doors the walkthrough places but the survey
  // has not yet been through (drawn shut, leading nowhere for now)
  const gates = [...e.lefts, ...e.rights, ...e.lifts].filter((l) => l && l.needs)
    .concat((LEVEL.doors || []).filter((d) => d.from === key));
  for (const l of gates) {
    const open = isOpen(l);
    if (l.kind === "left" || l.kind === "right") {
      const floor = platformsOf(room).filter((p) => p.y > 40).reduce((a, b) => (b.y > a.y ? b : a), { y: VIEW_H - 16 }).y;
      const x = l.kind === "right" ? VIEW_W - 16 : 0, y = floor - 40;
      ctx.fillStyle = style.wall;                       // the frame
      ctx.fillRect(x, y - 2, 16, 2);
      ctx.fillRect(x, y, 2, 40);
      ctx.fillRect(x + 14, y, 2, 40);
      if (!open) {
        ctx.fillStyle = style.solid;
        ctx.fillRect(x + 2, y, 12, 40);
        ctx.fillStyle = style.band[0];
        for (let j = 2; j < 40; j += 6) ctx.fillRect(x + 3, y + j, 10, 2);
        ctx.fillStyle = C.bred;                         // its lock
        ctx.fillRect(x + 6, y + 18, 4, 4);
      } else {
        ctx.fillStyle = C.black;
        ctx.fillRect(x + 2, y, 12, 40);
      }
    } else {
      const sh = room.shafts.find((s) => l.x1 >= s.x - 3 && l.x0 <= s.x + s.w);
      if (!sh) continue;
      const x0 = sh.x * 8, w = sh.w * 8;
      const y = l.kind === "down" ? VIEW_H - 4 : 0;
      ctx.fillStyle = open ? style.wall : C.bred;       // a bar across the shaft
      ctx.fillRect(x0 + 2, y, w - 4, open ? 1 : 3);
    }
  }
}

/** Which pose Dan is in now: kneeling, the moment after a shot, in the air,
 *  striding (the figure runs a four-phase cycle off `dan.anim`) or standing. */
function danFrame() {
  if (dan.stun > 0) return "down";
  if (dan.onLift) return "lift";
  if (dan.kneeling) return "kneel";
  if (dan.fireCool > 0 && dan.onGround) return "fire";
  if (!dan.onGround && !dan.onLift) return "jump";
  if (Math.abs(dan.vx) > 1 && dan.onGround) return "run";
  return "stand";
}

function draw() {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = C.black;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  const scale = canvas.width / SCREEN_W;
  ctx.setTransform(scale, 0, 0, scale, 0, 0);

  if (state.mode === "title") return drawMenu(ctx);
  if (state.mode === "intro") return drawIntro(ctx);

  drawFrame(ctx);
  ctx.save();
  ctx.beginPath();
  ctx.rect(VIEW_X, VIEW_Y, VIEW_W, VIEW_H);
  ctx.clip();
  ctx.translate(VIEW_X, VIEW_Y);

  const key = state.room;
  const room = currentRoom();
  drawRoom(ctx, LEVEL, key, room, state.phase * 12);

  drawLiftMarks(ctx, key, room);
  drawGates(ctx, key, room);

  for (const p of pickups) {
    if (!p.taken) drawSprite(ctx, "energy", Math.round(p.x), Math.round(p.y),
                             { main: C.bcyan, shade: C.cyan, light: C.bwhite });
  }
  for (const k of sdsParts) {
    if (!k.taken && k.key === key && k.id === state.fitted) {
      drawSprite(ctx, "key", Math.round(k.x), Math.round(k.y),
                 { main: C.byellow, shade: C.red, light: C.bwhite });
    }
  }
  if (boss) {
    boss.anim += 0.05;
    const bob = Math.round(Math.sin(boss.anim) * 2);
    drawMekonSeated(ctx, Math.round(boss.x), Math.round(boss.y + bob), 24, 30, boss.anim);
  }
  for (const t of treens) {
    if (t.dead && !(t.dying > 0)) continue;
    drawTreenFigure(ctx, Math.round(t.x), Math.round(t.y), TREEN_W, TREEN_H, t.anim / 2, t.dir < 0,
                    { fire: t.fire > 0, armsUp: t.dead });
  }
  for (const l of lasers) {
    ctx.fillStyle = l.friendly ? C.white : C.bred;
    const y = Math.round(l.y);
    if (l.cells > 0) ctx.fillRect(Math.round(l.x), y, LASER_STEP, 1);
    for (const x of l.trail) ctx.fillRect(Math.round(x), y, LASER_STEP, 1);
  }
  if (!(dan.hurt > 0 && Math.floor(dan.hurt * 16) % 2)) {
    const dx = Math.round(dan.x), dy = Math.round(dan.y);
    const pose = danFrame();
    drawDanFigure(ctx, dx, dy, DAN_W, DAN_H, pose === "run" ? "run" : pose, (dan.anim / 2) % 1, dan.face < 0);
  }

  if (state.flash > 0) {
    // a guard shot: the original cycles the whole room's colours for a moment
    ctx.fillStyle = [C.bmagenta, C.bred, C.bblue, C.bgreen][Math.floor(state.flash * 20) % 4];
    ctx.globalAlpha = 0.4;
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    ctx.globalAlpha = 1;
  }
  if (state.burst > 0) {
    const cx = dan.x + DAN_W / 2, cy = dan.y + DAN_H / 2;
    const t = 1 - state.burst / 0.35;
    ctx.strokeStyle = C.bwhite;
    ctx.lineWidth = 1;
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      const r0 = 4 + t * 10, r1 = 10 + t * 26;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0);
      ctx.lineTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1);
      ctx.stroke();
    }
  }
  if (state.messageTimer > 0) {
    if (state.msgTop) drawMessage(ctx, state.msgTop, true);
    if (state.msgBottom) drawMessage(ctx, state.msgBottom, false, state.viewer === "mekon");
  } else {
    state.msgTop = state.msgBottom = null;
  }
  ctx.restore();

  drawPanel(ctx, state);

  if (state.mode === "won") banner("DAN AND DIGBY MAKE A GETAWAY!", "THE ASTEROID IS DESTROYED");
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
    "FIVE PARTS OF THE MECHANISM",
    "AND FIT THEM IN ITS ROOM.",
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
    updateMenu(dt);
    if (tapped.Enter || tapped.Space) beginIntro();
  } else if (state.mode === "intro") {
    updateIntro(dt);
  } else {
    state.timeLeft -= dt * CLOCK_RATE;
    if (state.messageTimer > 0) state.messageTimer -= dt;
    if (state.viewerTimer > 0 && (state.viewerTimer -= dt) <= 0) state.viewer = "asteroid";
    if (state.viewerStatic > 0) state.viewerStatic -= dt;
    if ((state.nextTaunt -= dt) <= 0 && state.messageTimer <= 0) taunt();
    if (state.burst > 0) state.burst -= dt;
    if (state.flash > 0) state.flash -= dt;
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
enterRoom(START.key, 24, 40);
state.mode = "title";
requestAnimationFrame(frame);
