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
// Measured in the emulator: Dan runs a cell in four and a half frames; his
// jump rises ten pixels over twelve frames and lands twelve frames later,
// five cells on, and holding the key changes nothing.
const RUN_SPEED = 80;          // px/s
const GRAVITY = 347;           // px/s^2: ten pixels up and down in 0.48 s
const JUMP_VY = -83;
const JUMP_TIME = 0.48;         // the arc: twelve frames up and twelve down
const JUMP_VX = 83;            // five cells in the 0.48 s
const LIFT_SPEED = 67;         // the original's grav-lift: four pixels every three frames
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
// A Treen who reaches Dan's level closes to a few cells, stands and fires a
// shot every three frames while Dan is before him - the dashes run together
// into a beam - and the rattle of it striking Dan sounds now and then.
const TREEN_FIRE_PERIOD = 3 * FRAME;
const TREEN_FIRE_RANGE = 14 * 8;   // he opens fire from this far
const TREEN_STAND_OFF = 4 * 8;     // and walks no closer than this
const HIT_RATTLE_EVERY = 0.6, HIT_ENERGY = 3;
const CLOCK_RATE = 3;          // game seconds per real second
const START_TIME = 2 * 3600;
const SDS_X = 144;              // the mechanism stands mid-room, where the map shows its silhouette
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
  // the original's own map of the cells that stop him (walls, steps, the
  // shafts' stations), when the sheet carries it; the map's wall class otherwise
  const block = window.ROOMS_SHEET && window.ROOMS_SHEET.block && window.ROOMS_SHEET.block[key];
  const cells = ROOMS[key].cells, out = [];
  for (let j = 0; j < RH; j++) {
    let run = null;
    for (let i = 0; i <= RW; i++) {
      const wall = i < RW && (block ? !!(block[j] & (1 << i)) : cells.charCodeAt(j * RW + i) === 52);   // "4"
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
function isOpen(l) { return !!l && (state.cheat.doors || !(l.needs > state.fitted)); }
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
 *  on the floor of the rooms the survey found them in, at the cell its object
 *  table gives the box (the fifth, in 185, at the cell it was taken from). */
function placeParts() {
  return LEVEL.parts.map((p, i) => {
    const room = ROOMS[p.room];
    const floor = room.platforms.reduce((a, b) => (b.y > a.y ? b : a));
    return { id: i, key: p.room, x: (p.x ?? 4) * 8, y: floor.y * 8 - 16, taken: false };
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

/** Where the Treens come from. In most rooms some are already about when Dan
 *  walks in, placed by a seeded hash of the room; on the surface and in the
 *  Mekon's hologram room there are none to start with. Then, every so often
 *  while fewer than two are about, one runs in from the edge away from Dan on
 *  his floor - at the original's pace, about sixty pixels a second - closes
 *  to a few cells and pauses before he fires. The fourth sector is unguarded,
 *  as in the original. */
const TREEN_MAX = 2, TREEN_AGAIN = [1.5, 5];  // seconds before the next one runs in: soon enough to be met on the way through
const TREEN_FIRST = [0.4, 2.2];   // and sooner still into a room that was empty when Dan walked in
const TREEN_CLEAR = 8;           // pixels an arriving guard walks in from the wall before he takes aim
const TREEN_BEHIND = 64;         // how far into the room Dan must be before one follows him in through his own door
const TREEN_BEHIND_TIME = 4;     // seconds after he steps in that this holds; later a guard may come in at his back
const TREEN_LIFT_CHANCE = 0.6;   // the share of guards who take the grav-lifts after Dan
const TREEN_CHASE = 3;           // seconds a guard counts as giving chase after he last had Dan in range
const TREEN_LEAVE = 1.5;         // seconds a guard stranded on another floor waits before he runs out to come in on Dan's
const TREEN_RETURN = [0.8, 2.0]; // and how soon after that he is in again
const TREEN_RUN = 60, TREEN_REACT = 0.6;      // pixels a second; the pause before he fires
function unguardedRoom(key, room) { return (room.label || room.zone) === 4; }
// where none is about when Dan walks in, and they only run in after him:
// the screen he lands on, and the hologram's room
function entryOnlyRoom(key, room) { return key === START.key || (LEVEL.boss && LEVEL.boss.room === key); }

/** How many of a room's guards have been shot, over the whole game. */
function deadHere(key) { return (state.deadTreens.get(key) || new Set()).size; }

function makeTreens(key, room) {
  if (unguardedRoom(key, room) || entryOnlyRoom(key, room)) return [];
  const r = rng(hashKey(key));
  const wide = room.platforms.filter((p) => p.x1 - p.x0 >= 5);
  const n = wide.length === 0 ? 0 : Math.min(Math.floor(r() * 3), TREEN_MAX - deadHere(key));   // the room's share, less the ones shot here
  const out = [];
  for (let i = 0; i < n; i++) {
    const p = wide[Math.floor(r() * wide.length)];
    const x0 = p.x0 * 8, x1 = p.x1 * 8 - TREEN_W;
    if (x1 <= x0) continue;
    const x = x0 + r() * (x1 - x0);
    if (Math.abs(x - dan.x) < 80 && Math.abs(p.y * 8 - TREEN_H - dan.y) < 24) continue;   // never near him on his floor: he steps in with room to look about
    if (treenInWall(key, x, p.y * 8 - TREEN_H)) continue;                                 // nor inside a wall
    if (out.some((t) => Math.abs(t.x - x) < 28 && Math.abs(t.y - (p.y * 8 - TREEN_H)) < 8)) continue;
    out.push({ id: state.treenSeq++, x, y: p.y * 8 - TREEN_H, x0, x1, dir: r() < 0.5 ? -1 : 1, anim: 0, dead: false, react: 0, lifts: r() < TREEN_LIFT_CHANCE });
  }
  return out;
}

/** The room's walls, steps and lift stations stop a guard as they stop Dan
 *  (legs left out of the test, as with him); true when one has just done so. */
function treenWalled(t, key) {
  let hit = false;
  for (const wl of wallsOf(key)) {
    if (overlaps(t.x, t.y, TREEN_W, TREEN_H - 8, wl.x0, wl.y0, wl.x1 - wl.x0, wl.y1 - wl.y0)) {
      t.x = t.x + TREEN_W / 2 < (wl.x0 + wl.x1) / 2 ? wl.x0 - TREEN_W : wl.x1;
      hit = true;
    }
  }
  // pushed off the screen by a wall at the edge: he is out of the room, not
  // a guard lying in wait behind it (who would keep the room from ever being safe)
  if (hit && (t.x < 0 || t.x + TREEN_W > VIEW_W)) { t.dead = true; t.gone = true; }
  return hit;
}
/** Whether a guard standing at (x, y) would be inside one of the room's walls. */
function treenInWall(key, x, y) {
  return wallsOf(key).some((wl) => overlaps(x, y, TREEN_W, TREEN_H - 8, wl.x0, wl.y0, wl.x1 - wl.x0, wl.y1 - wl.y0));
}

function spawnTreen(key, room) {
  const danFeet = dan.y + DAN_H;
  const wide = room.platforms.filter((p) => p.x1 - p.x0 >= 5 && p.x1 * 8 - TREEN_W > p.x0 * 8);
  // Dan's own floor first, widest first; another floor when no doorway on his lets one in
  const level = wide.filter((p) => Math.abs(p.y * 8 - danFeet) < 6).sort((a, b) => (b.x1 - b.x0) - (a.x1 - a.x0));
  const others = wide.filter((p) => !level.includes(p)).sort((a, b) => (b.x1 - b.x0) - (a.x1 - a.x0));
  for (const p of [...level, ...others]) {
    const x0 = p.x0 * 8, x1 = p.x1 * 8 - TREEN_W;
    // in from an edge away from Dan, running - but only through a doorway on
    // that floor, never through a door that is shut, nor through a wall
    const y = p.y * 8 - TREEN_H;
    const way = waysOnto(key, p);
    const farSide = dan.x + DAN_W / 2 < VIEW_W / 2 ? "right" : "left";
    const nearSide = farSide === "right" ? "left" : "right";
    // through the door behind Dan only once he is well into the room: never
    // straight at his back as he steps in
    const room_ = dan.x + DAN_W / 2, clear = nearSide === "left" ? room_ : VIEW_W - room_;
    const onHisFloor = level.includes(p);
    const justIn = state.roomAge < TREEN_BEHIND_TIME;                 // the rule is for the moment he steps in, not for ever
    const side = way[farSide] ? farSide : way[nearSide] && (clear >= TREEN_BEHIND || !onHisFloor || !justIn) ? nearSide : null;
    if (!side) continue;
    // he steps in at the edge cell, whole, as the original's sprites do - under the
    // door frame where the room has one - and runs in from there
    const x = side === "right" ? VIEW_W - TREEN_W : 0;
    treens.push({ id: state.treenSeq++, x, y, x0, x1, dir: dan.x > x ? 1 : -1, anim: 0, dead: false, react: 0, entering: true, lifts: Math.random() < TREEN_LIFT_CHANCE });
    if (!state.alerted.has(key)) { state.alerted.add(key); say(tx(["INTRUDER ALERT !"]), 2.5); }
    return;
  }
  state.treenClock = state.treenNext;         // no way in just now: try again next frame
}

/** A guard who uses the lifts: Dan on another floor of this room, and a lift
 *  on the guard's floor that stops at Dan's, and he heads for it; Dan riding
 *  out of the room while the guard is giving chase, and he follows him onto
 *  it, to arrive behind him in the next room. */
function liftToDan(t, key) {
  const feet = t.y + TREEN_H;
  const onHisFloor = (l) => l.feet != null && Math.abs(l.feet - feet) <= 14 &&
                            l.x0 * 8 >= t.x0 - 8 && (l.x1 + 1) * 8 <= t.x1 + TREEN_W + 8;   // its cells on his beat
  if (dan.onLift && dan.onLift.link && t.chase > 0 && onHisFloor(dan.onLift.link)) return dan.onLift.link;   // after him
  if (!dan.onGround) return null;
  const danFeet = dan.y + DAN_H;
  if (Math.abs(danFeet - feet) < 12) return null;
  return EXITS[key].lifts.find((l) => l.to === key && l.stop != null && onHisFloor(l) && Math.abs(l.stop - danFeet) <= 14) || null;
}
function treenSeeksLift(t, key, room) {
  const link = liftToDan(t, key);
  if (!link) return;
  t.lift = { link, x: ((link.x0 + link.x1 + 1) / 2) * 8 - TREEN_W / 2, wait: 0.3 + Math.random() * 1.2 };
}

/** A guard on another floor than Dan, with no lift on his beat to bring him
 *  down or up: after a moment he runs off his floor through the nearer open
 *  edge and is out of the room, and one comes in again where Dan is (the
 *  spawner sends the room's next guard onto Dan's floor). Returns the edge he
 *  is leaving by, or null when his floor has none he can walk off. */
function treenLeaves(t, key) {
  const tried = t.noWay || new Set();                 // edges a wall has already turned him back from
  const left = t.x0 <= 0 && !treenInWall(key, 0, t.y) && !tried.has("left");
  const right = t.x1 + TREEN_W >= VIEW_W && !treenInWall(key, VIEW_W - TREEN_W, t.y) && !tried.has("right");
  if (!left && !right) return null;
  if (left && right) return t.x + TREEN_W / 2 < VIEW_W / 2 ? "left" : "right";
  return left ? "left" : "right";
}
/** The edges of a floor a guard can step in through: a doorway on that floor
 *  (its link, or one with no floor recorded) whose door is open, and no wall
 *  where he would stand. */
function waysOnto(key, p) {
  const e = EXITS[key], feet = p.y * 8, y = feet - TREEN_H;
  const doorAt = (list) => list.find((l) => l.feet == null || Math.abs(l.feet - feet) <= 14);   // on this floor, no stand-in
  return { left: p.x0 === 0 && isOpen(doorAt(e.lefts)) && !treenInWall(key, 0, y),
           right: p.x1 >= 29 && isOpen(doorAt(e.rights)) && !treenInWall(key, VIEW_W - TREEN_W, y) };
}
/** Whether a guard could come in on the floor Dan stands on. */
function wayToDan(key, room) {
  const danFeet = dan.y + DAN_H;
  return room.platforms.some((p) => p.x1 - p.x0 >= 5 && Math.abs(p.y * 8 - danFeet) < 6 && (({ left, right }) => left || right)(waysOnto(key, p)));
}
function treenToLift(t, dt) {
  const dx = t.lift.x - t.x;
  t.fire = false;
  if (Math.abs(dx) > 2) { t.dir = dx > 0 ? 1 : -1; t.x += t.dir * TREEN_RUN * dt; t.anim += dt * 9; if (treenWalled(t, state.room)) t.lift = null; return; }   // a wall between him and the cells: he gives it up
  t.lift.wait -= dt;                                  // a moment on the cells before the field takes him
  if (t.lift.wait > 0) return;
  const l = t.lift.link;
  t.riding = { dir: l.kind === "down" ? 1 : -1, stop: l.stop, out: l.to !== state.room, to: l.to };
  t.lift = null;
}
function rideTreen(t, dt, room) {
  const r = t.riding;
  t.fire = false;
  t.y += r.dir * LIFT_SPEED * dt;
  const feet = t.y + TREEN_H;
  if (r.out) {
    // off the screen after Dan: he arrives in the next room when Dan does
    if (t.y + TREEN_H < 0 || t.y > VIEW_H) { t.dead = true; t.gone = true; state.pursuer = { room: r.to, x: t.x, dir: r.dir, stop: r.stop }; }
    return;
  }
  if ((r.dir > 0 && feet >= r.stop) || (r.dir < 0 && feet <= r.stop)) {
    t.y = r.stop - TREEN_H;
    const p = platformsOf(room).find((p) => Math.abs(p.y - r.stop) <= 14 && t.x + TREEN_W > p.x0 - 8 && t.x < p.x1 + 8);
    if (p) { t.x0 = p.x0; t.x1 = p.x1 - TREEN_W; }
    t.riding = null;
    t.dir = dan.x > t.x ? 1 : -1;
  }
}

function widestPlatformOf(room) {
  const wide = room.platforms.filter((p) => p.x1 - p.x0 >= 5);
  return wide.length ? wide.reduce((a, b) => (b.x1 - b.x0 > a.x1 - a.x0 ? b : a)) : null;
}

/** The cups of energy where the original keeps them (its object tables, in
 *  the room sheet's index); one taken stays taken for the game. */
function makePickups(key, room) {
  const list = (window.ROOMS_SHEET && window.ROOMS_SHEET.items && window.ROOMS_SHEET.items[key]) || [];
  return list.map(([x, y], i) => ({ id: key + ":" + i, x, y, taken: state.takenItems.has(key + ":" + i) }));
}

// --------------------------------------------------------------------- state

const state = {
  mode: "title",           // title | intro | play | ending
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
  cheat: {},             // doors | parts | time, typed as codes; they last the session
  story: "dare",         // whose words: the pilot's, or the policeman's (options page)
  msgBottom: null,       // second box, as the original uses for asides
  messageTimer: 0,
  sectorSeen: new Set(),
  alerted: new Set(),      // rooms whose guards have raised the alarm
  viewerTimer: 0, viewerStatic: 0,
  taunts: 0, nextTaunt: 40,   // the Mekon's calls
  clearedRooms: new Set(),
  treenSeq: 0,           // ids for the Treens that arrive, per game
  treenClock: 0, treenNext: 0,   // the next arrival
  deadTreens: new Map(),   // room -> which of its guards have been shot
  deadGuns: new Set(),     // the guns crushed or shot this game, by room and index
  pursuer: null,           // a guard riding the lift after Dan into the next room
  roomAge: 0,              // seconds since Dan stepped into this room
  takenItems: new Set(),   // the cups of energy drunk this game
  invert: 0,               // the screen inverted after a gun is shot, seconds left
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
    onLift: null, liftLatch: false, shaftFall: false, jumpT: 0, jumping: false, anim: 0, hurt: 0, invuln: 0, fireCool: 0, stun: 0,
  };
}

function enterRoom(key, x, y) {
  // a guard riding the lift out after Dan is still on his way when Dan arrives
  const chaser = treens.find((t) => !t.dead && t.riding && t.riding.out && t.riding.to === key);
  if (chaser) state.pursuer = { room: key, x: chaser.x, dir: chaser.riding.dir, stop: chaser.riding.stop };
  state.room = key;
  // the original ends the game the moment Dan steps into the launch bay -
  // "DAN AND DIGBY MAKE A GETAWAY!" - which lies behind the last gate
  if (key === ESCAPE_ROOM && state.mode === "play") { state.score += 5000; beginEnding("won"); }
  const room = currentRoom();
  if (x != null) { dan.x = x; dan.y = y; dan.vx = 0; dan.vy = 0; }   // where he arrives: the guards keep clear of it
  treens = state.clearedRooms.has(key) ? [] : makeTreens(key, room);
  state.treenClock = 0;
  state.roomAge = 0;
  const wait = treens.length ? TREEN_AGAIN : TREEN_FIRST;
  state.treenNext = wait[0] + Math.random() * (wait[1] - wait[0]);
  if (treens.length && !state.alerted.has(key)) { state.alerted.add(key); say(tx(["INTRUDER ALERT !"]), 2.5); }
  pickups = makePickups(key, room);
  // a guard who took the lift after Dan rides in behind him
  if (state.pursuer && state.pursuer.room === key) {
    const q = state.pursuer;
    treens.push({ id: state.treenSeq++, x: q.x, y: q.dir > 0 ? -TREEN_H : VIEW_H, x0: 0, x1: VIEW_W - TREEN_W, dir: 1, anim: 0, dead: false, react: 0,
                  lifts: true, riding: { dir: q.dir, stop: q.stop, out: false } });
  }
  state.pursuer = null;
  guns = makeGuns(key);
  gunShots = [];
  lasers = [];
  if (x != null) { dan.x = x; dan.y = y; dan.vx = 0; dan.vy = 0; }
  dan.invuln = Math.max(dan.invuln, 0.8);
  const zone = room.label || room.zone;                    // the number the original announces
  if (!state.sectorSeen.has(zone)) {
    state.sectorSeen.add(zone);
    say(tx(["DAN IS NOW IN SECTOR #"], zone), 2.5);
    if (zone > 1) taunt();
  }
  // the Mekon's hologram: he waits on his dais in one room of the fifth sector
  boss = LEVEL.boss && LEVEL.boss.room === key ? { x: LEVEL.boss.x, y: LEVEL.boss.feet - 30, anim: 0 } : null;
  if (boss) say(tx(["\"I SAY....IT'S A HOLOGRAM !\""]), 3);   // every time he walks in, as in the original
  if (key === SDS_ROOM) {
    say(tx(["THE SELF DESTRUCT ROOM"]), 2.5);
    if (state.carrying) note(tx(["WALK TO THE LEFT", "TO FIT THE PART"]), 3);
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
  call(tx(TAUNTS[state.taunts++ % TAUNTS.length]), 3);
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
  state.deadGuns = new Set();
  state.takenItems = new Set();
  sdsParts = placeParts();
  state.fitted = 0;
  state.carrying = false;
  state.armed = false;
  const spawn = widestPlatform(START.room);
  resetDan(16, spawn.y - DAN_H);
  enterRoom(START.key, 16, spawn.y - DAN_H);
  say(tx(["DAN LANDS ON", "THE ASTEROID"]), 3);
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
function moveY(body, dy, platforms, w, h, yOff, reach = 0.5) {
  const prevBottom = body.y + yOff + h;
  body.y += dy;
  body.onGround = false;
  if (dy >= 0) {
    for (const p of platforms) {
      const bottom = body.y + yOff + h;
      if (bottom >= p.y && prevBottom <= p.y + reach &&     // once below a floor's top he is past it: no catching the far edge of a gap
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
  typeCheat(e.code);
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

  dan.landed = false;
  if (dan.hurt > 0) dan.hurt -= dt;
  if (dan.stun > 0) { dan.stun -= dt; dan.vx = 0; }   // out cold in the cell: nothing answers the keys
  if (dan.invuln > 0) dan.invuln -= dt;
  if (dan.fireCool > 0) dan.fireCool -= dt;
  if (dan.rattle > 0) dan.rattle -= dt;

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
  // a lift answers only to Dan standing still: up while running is a jump,
  // even between the rails (the original clears a gap beside a shaft that way)
  if (!dan.onLift && dan.onGround && !dan.liftLatch && !held.left() && !held.right()) {
    const call = held.down() ? liftHere("down") : held.up() ? liftHere("up") : null;
    if (call) {
      // the stop is in the room the link leads to: here only for a ride
      // between this room's own floors
      dan.onLift = { dir: held.down() ? 1 : -1, link: call, stop: call.stop, stopHere: call.to === state.room, at: state.phase };
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
        else if (lift.broken || (lift.link && lift.link.broken)) say(tx(["OUT OF ORDER"]), 3);
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
        const way = held.left() ? -1 : held.right() ? 1 : 0;   // the way he is pressed, turned or not
        if (way) dan.face = way;
        dan.turning = 0;
        dan.vy = JUMP_VY;
        dan.vx = way * JUMP_VX;   // straight up, or a diagonal hop
        dan.jumpT = JUMP_TIME;    // the arc is fixed: the keys do nothing until he lands
        dan.jumping = true;
        dan.onGround = false;
      }
    } else {
      // in the air the original carries him through the jump's arc and no
      // further: past it, or off a ledge, he drops straight down
      if (dan.jumpT > 0) dan.jumpT -= dt; else dan.vx = 0;
    }

    dan.vy += GRAVITY * dt;
    const h = dan.kneeling ? DAN_KNEEL_H : DAN_H;
    const yOff = DAN_H - h;
    // The original's walls, steps and lift stations stop him; the panelling
    // and the machinery he walks in front of do not. His legs are left out of
    // the test: a course he stands on runs through them.
    moveX(dan, dan.vx * dt, wallsOf(state.room), DAN_W, h - 8, yOff);
    gunsBlockDan(h, yOff);                 // a floor gun is the one thing he walks into
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
    const feetBefore = dan.y + DAN_H, airborne = !dan.onGround;
    // a jump lands on a ledge a course above where it started: the original
    // moves him by cells and sets him down on whatever his last cell rests on
    moveY(dan, dan.vy * dt, catchers, DAN_W, h, yOff, dan.jumping ? 9 : 0.5);
    dan.landed = airborne && dan.onGround;      // this is the frame he comes down
    if (dan.onGround) dan.jumping = false;
    if (dan.vy >= 0) gunsUnderDan(feetBefore);   // coming down on a floor gun crushes it
    if (dan.onGround) dan.shaftFall = false;
  }

  if (Math.abs(dan.vx) > 1 && dan.onGround) dan.anim += dt * 8;

  // --- fire: short range laser, kneeling shots come out low ---
  if (held.fire() && dan.fireCool <= 0) {
    dan.fireCool = FIRE_PERIOD;
    // the dash leaves the gun's muzzle: 13 past the figure's middle, level with the barrel
    const tip = dan.x + DAN_W / 2 + dan.face * 13;
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
    if (ride.broken || EXITS[ride.to].lifts.some((l) => l.broken && l.feet < 0)) say(tx(["OUT OF ORDER"]), 3);
  } else if (dan.y + DAN_H > 130 && !dan.onLift && isOpen(zone(e.drops))) {
    // fell through a hole in the floor: the original switches rooms as soon
    // as he drops below the floor course, before his run carries him past it
    enterRoom(zone(e.drops).to, dan.x, -DAN_H + 6);
  } else if (dan.y + DAN_H / 2 < 0 && ride && ride.kind === "up" && ride.to !== state.room && isOpen(ride)) {
    enterRoom(ride.to, dan.x, VIEW_H - DAN_H / 2);                    // riding on up
    dan.onLift = { dir: -1, link: null, stop: ride.stop, stopHere: true, broken: ride.broken };
    dan.liftLatch = true;
    if (ride.broken) say(tx(["OUT OF ORDER"]), 3);
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
  const key = state.room, room = currentRoom();
  state.roomAge += dt;
  // the next one arrives when his time comes, unless the room is unguarded,
  // cleared, or has had its share: a room's guards are TREEN_MAX in all, the
  // ones shot here counted, so one left standing never brings another
  if (!unguardedRoom(key, room) && !state.clearedRooms.has(key) && treens.filter((t) => !t.dead).length + deadHere(key) < TREEN_MAX) {
    state.treenClock += dt;
    if (state.treenClock >= state.treenNext) {
      state.treenClock = 0;
      state.treenNext = TREEN_AGAIN[0] + Math.random() * (TREEN_AGAIN[1] - TREEN_AGAIN[0]);
      spawnTreen(key, room);
    }
  }
  for (const t of treens) {
    if (t.dying > 0) { t.dying -= dt; if (t.dying <= 0) beeperBurst("treenGone"); }   // his last moment after the shot that got him
    if (t.dead) continue;
    if (t.riding) { rideTreen(t, dt, room); continue; }
    if (t.lift) { treenToLift(t, dt); continue; }
    const level = Math.abs((t.y + TREEN_H) - (dan.y + DAN_H)) < 12;
    const dx = (dan.x + DAN_W / 2) - (t.x + TREEN_W / 2);
    const inRange = level && Math.abs(dx) <= TREEN_FIRE_RANGE && dan.stun <= 0 && !t.entering;   // not from the doorway
    if (inRange) t.chase = TREEN_CHASE; else if (t.chase > 0) t.chase -= dt;
    if (t.lifts && !inRange) treenSeeksLift(t, key, room);
    // on another floor than Dan and no lift to him: he leaves, to come in where Dan is
    // (only when one could come in on Dan's floor; else he keeps his beat)
    if (!level && !t.entering && dan.onGround && !(t.lifts && liftToDan(t, key)) && wayToDan(key, room)) {
      const danFeet = dan.y + DAN_H;
      if (t.apartFrom !== danFeet) { t.apartFrom = danFeet; t.apart = 0; t.noWay = new Set(); }   // Dan on a new floor: a fresh try
      t.apart += dt;
      if (t.apart >= TREEN_LEAVE && !t.leaving) t.leaving = treenLeaves(t, key);
    } else { t.apart = 0; t.apartFrom = null; t.leaving = null; }
    if (t.leaving) {
      t.fire = false; t.dir = t.leaving === "left" ? -1 : 1;
      t.x += t.dir * TREEN_RUN * dt; t.anim += dt * 9;
      if (treenWalled(t, key)) { (t.noWay = t.noWay || new Set()).add(t.leaving); t.leaving = null; }   // a wall on the way out: the other edge, or he stays
      if (t.x + TREEN_W <= 0 || t.x >= VIEW_W) {                       // out of the room; his place is taken where Dan is
        t.dead = true; t.gone = true;
        state.treenClock = 0;
        state.treenNext = TREEN_RETURN[0] + Math.random() * (TREEN_RETURN[1] - TREEN_RETURN[0]);
      }
      continue;
    }
    t.react = inRange ? t.react + dt : 0;        // he takes a moment before he opens fire
    const engaged = inRange && t.react >= TREEN_REACT;
    t.fire = engaged;
    if (inRange) {
      t.dir = dx > 0 ? 1 : -1;
      if (Math.abs(dx) > TREEN_STAND_OFF) { t.x += t.dir * TREEN_RUN * dt; t.anim += dt * 9; }
      t.shot = engaged ? (t.shot || 0) + dt : 0;
      while (t.shot >= TREEN_FIRE_PERIOD) {
        t.shot -= TREEN_FIRE_PERIOD;
        const tip = t.x + TREEN_W / 2 + t.dir * 13;         // the rifle's muzzle
        lasers.push({
          x: t.dir > 0 ? tip : tip - LASER_STEP, y: t.y + 13,
          dir: t.dir, cells: LASER_MIN + Math.floor(Math.random() * (LASER_MAX - LASER_MIN + 1)),
          trail: [], acc: 0, friendly: false, by: t.id,
        });
        zap();
      }
    } else {
      t.shot = 0;
      t.anim += dt * 9;
      t.x += t.dir * TREEN_RUN * dt;
    }
    if (treenWalled(t, key) && !inRange) t.dir = -t.dir;    // the room's walls stop him as they stop Dan
    if (t.entering) {
      // in, and a few cells clear of the wall he came through, before he is one of the room's
      if (t.x >= t.x0 + TREEN_CLEAR && t.x + TREEN_W <= t.x1 + TREEN_W - TREEN_CLEAR) t.entering = false;
    } else {
      if (t.x <= t.x0) { t.x = t.x0; if (!inRange) t.dir = 1; }
      if (t.x + TREEN_W >= t.x1) { t.x = t.x1 - TREEN_W; if (!inRange) t.dir = -1; }
    }

    if (dan.invuln <= 0 && !dan.onLift && overlaps(dan.x, dan.y, DAN_W, DAN_H, t.x, t.y, TREEN_W, TREEN_H)) {
      hurtDan(18);
      dan.vx = (dan.x < t.x ? -1 : 1) * 90;
      dan.vy = -70;
    }
  }
}

/** A Treen shot: arms up, the room flashes, and he is gone. */
function killTreen(t) {
  t.dead = true;
  t.dying = TREEN_DEATH;
  state.flash = TREEN_DEATH;                 // the original flashes the whole room
  if (!state.deadTreens.has(state.room)) state.deadTreens.set(state.room, new Set());
  state.deadTreens.get(state.room).add(t.id);
  beeperBurst("treenHit");
}

/** A shot's dash hits whatever it crosses; the dead shot's streak fades.
 *  A Treen's shot takes any Treen in its way but the one who fired it. */
function laserHit(l) {
  for (const t of treens) {
    if (!t.dead && t.id !== l.by && overlaps(l.x, l.y, LASER_STEP, 2, t.x, t.y, TREEN_W, TREEN_H)) {
      killTreen(t);
      l.cells = 0;
      if (l.friendly) state.score += 50;         // the original's fifty for a guard
    }
  }
  if (l.friendly) { gunsShotBy(l); return; }
  if (overlaps(l.x, l.y, LASER_STEP, 2, dan.x, dan.y, DAN_W, DAN_H) &&
             !dan.kneeling && !dan.onLift) {          // the field shields him while he rides
    // the beam strikes him: he flickers, and now and then the rattle of it sounds
    dan.hurt = Math.max(dan.hurt, 0.25);
    if (!(dan.rattle > 0)) {
      dan.rattle = HIT_RATTLE_EVERY;
      state.energy -= HIT_ENERGY;
      rattle();
      if (state.energy <= 0) capture();
    }
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

  if (deadHere(state.room) >= TREEN_MAX && !treens.some((t) => !t.dead)) {   // two shot here and none left: the room is safe
    const key = state.room;
    if (!state.clearedRooms.has(key)) {
      state.clearedRooms.add(key);
      note(tx(["THIS ROOM IS SAFE"]), 1.8);
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
  note(tx(["DAN FELL TOO FAR!"]), 3);
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
  say(tx(["DAN FALLS UNCONSCIOUS", "FOR TEN MINUTES"]), 3);
  dan.stun = 2.2;                              // he lies where they left him before coming round
  state.nextTaunt = 4;                         // he calls to gloat once Dan wakes
}

// ------------------------------------------------------------------- pickups

function updatePickups() {
  const key = state.room;
  for (const p of pickups) {
    if (!p.taken && dan.landed && overlaps(dan.x, dan.y, DAN_W, DAN_H, p.x, p.y, 8, 16)) {   // taken as he lands on it, at the bottom of the jump
      p.taken = true;
      state.takenItems.add(p.id);
      state.energy = Math.min(ENERGY_MAX, state.energy + 25);
      state.score += 25;
      beep(660, 0.12);
      note(tx(["ENERGY RESTORED"]), 1.5);
    }
  }
  for (const k of sdsParts) {
    // the parts come one at a time: the next is where the last fitted one led
    if (k.taken || k.key !== key || state.carrying || k.id !== state.fitted) continue;
    if (dan.landed && overlaps(dan.x, dan.y, DAN_W, DAN_H, k.x, k.y, 16, 16)) {   // landed on, never just walked over
      k.taken = true;
      state.carrying = true;
      state.score += 500;
      beep(990, 0.2);
      say(tx(["NOW TAKE IT TO THE", "SELF-DESTRUCT SYSTEM"]), 2.5);
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
      call(tx(["\"11 MINUTES TO SELF DESTRUCT\""]), 4);
      state.nextTaunt = 6;
    } else if (state.fitted >= LEVEL.parts.length) {
      say(tx(["PART # FITTED"], state.fitted), 3);
      note(tx(["THE SURVEY ENDS HERE", "FOR NOW"]), 4);
    } else {
      say(tx(["PART # FITTED"], state.fitted), 3);
      note(tx(["A DOOR OPENS TO", "THE NEXT SECTOR"]), 4);
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
/** The original's beeper bursts, from its five-byte sound records: its
 *  routine steps a bit pattern round, holding each edge for a count that
 *  drifts by a step after so many toggles. [hold, outer, step, inner, bits] */
// the cup of energy, as the original draws it: a cell wide, two tall
const CUP_BITS = ["........", "...##...", "..#..#..", ".#..###.", ".#..###.", ".#..###.", ".#..###.", "........",
                  ".#..###.", ".#..###.", ".#..###.", ".#..###.", ".#..###.", "........", "#..#####", "........"];
const BURSTS = {
  treenHit: [0xfa, 0x0a, 0x90, 0x10, 0x63],    // C7FF: a guard is hit
  treenGone: [0xfa, 0x05, 0x90, 0x0c, 0x63],   // C80E: and vanishes, fifty points
  crush: [0x80, 0x20, 0x19, 0x02, 0x5a],       // C804: a floor gun crushed
  gunShot: [0x40, 0x18, 0x21, 0x03, 0x54],     // C809: a wall or ceiling gun shot
};
function beeperBurst(which) {
  const [hold0, outer, step, inner, bits0] = BURSTS[which];
  try {
    if (!actx) actx = new (window.AudioContext || window.webkitAudioContext)();
    const sr = actx.sampleRate, T = 3500000;
    const samples = [];
    let hold = hold0, bits = bits0, t = 0;
    for (let d = 0; d < outer; d++) {
      for (let h = 0; h < inner; h++) {
        bits = ((bits << 1) | (bits >> 7)) & 0xff;
        const level = bits & 0x10 ? 0.6 : -0.3;
        t += (13 * (hold || 256) + 50) / T;             // the delay loop, in seconds
        while (samples.length < t * sr) samples.push(level);
      }
      hold = (hold + step) & 0xff;
      t += 47 / T;
    }
    const buf = actx.createBuffer(1, samples.length, sr);
    buf.getChannelData(0).set(samples);
    const src = actx.createBufferSource(), g = actx.createGain();
    src.buffer = buf; g.gain.value = 0.15;
    src.connect(g); g.connect(actx.destination);
    src.start();
  } catch (e) { /* no audio available */ }
}

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

/** The beam striking Dan, as the original's beeper rattles it: runs of seven
 *  toggles in the ratio 2:1:2:3:2:1:2 at a random pitch, a pause between them,
 *  for about a tenth of a second. */
function rattle(ms) {
  try {
    if (!actx) actx = new (window.AudioContext || window.webkitAudioContext)();
    const sr = actx.sampleRate, edges = [0];
    let total = 0;
    while (total < (ms || 80) * 44.1) {
      const k = 2 + Math.random() * 43;
      for (const m of [2, 1, 2, 3, 2, 1, 2]) { edges.push(edges[edges.length - 1] + m * k); total += m * k; }
      const gap = 25 + Math.random() * 100;
      edges.push(edges[edges.length - 1] + gap); total += gap;
    }
    const len = Math.ceil(total / 44100 * sr) + 1;
    const buf = actx.createBuffer(1, len, sr), d = buf.getChannelData(0);
    let k = 0;
    for (let i = 0; i < len; i++) {
      while (k < edges.length - 1 && i / sr * 44100 >= edges[k + 1]) k++;
      d[i] = k % 2 ? 0.7 : -0.35;
    }
    const src = actx.createBufferSource(), g = actx.createGain();
    src.buffer = buf; g.gain.value = 0.12;
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
/** The cells the original draws in front of the figures - walls, walkways,
 *  shafts, doorways, the guns - painted back over Dan and the guards where
 *  they overlap them (the original's own flag map, packed in the sheet's index). */
function drawForeground(ctx, key) {
  const s = SHEETS.rooms, rows = state.backdrop && s.meta.solid && s.meta.solid[key];
  if (!rows) return;
  const [sx, sy] = s.meta.rooms[key];
  // the figures' full width, rifle and all: the drawn figure is wider than the
  // hit box, and a rifle pushed into a wall goes behind it whole, not in part
  const boxes = [[dan.x - 20, dan.y, DAN_W + 40, DAN_H]];
  for (const t of treens) if (!t.dead || t.dying > 0) boxes.push([t.x - 10, t.y, TREEN_W + 20, TREEN_H]);
  const done = new Set();
  for (const [bx, by, bw, bh] of boxes) {
    const c0 = Math.max(0, Math.floor(bx / 8)), c1 = Math.min(29, Math.floor((bx + bw - 1) / 8));
    const r0 = Math.max(0, Math.floor(by / 8)), r1 = Math.min(17, Math.floor((by + bh - 1) / 8));
    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) {
        if (!(rows[r] & (1 << c))) continue;
        const k = r * 32 + c;
        if (done.has(k)) continue;
        done.add(k);
        // the guns the game draws itself, and the wall left where one was shot, stay as drawn;
        // so do the cells of a part's box, which is drawn after the figures, whole
        if (guns.some((g) => (g.dead || g.type === GUN_FLOOR) && c * 8 >= g.x && c * 8 < g.x + g.w && r * 8 >= g.y && r * 8 < g.y + g.h)) continue;
        if (sdsParts.some((k) => k.key === key && c * 8 >= k.x && c * 8 < k.x + 16 && r * 8 >= k.y && r * 8 < k.y + 16)) continue;
        ctx.drawImage(s.img, sx + c * 8, sy + r * 8, 8, 8, c * 8, r * 8, 8, 8);
      }
    }
  }
}

const LIFT_BUTTON = [0x00, 0x3c, 0x4e, 0x5e, 0x5e, 0x5e, 0x3c, 0x00];   // the round call button, as the original draws it
function drawLiftMarks(ctx, key, room) {
  // over the original's screen its own marks: the arrow cells beside each
  // shaft, which scroll a pixel every four frames, down or up as the lift goes
  if (state.backdrop) {
    // the original's screen carries its own marks; the game adds nothing of its own to it
    const arrows = window.ROOMS_SHEET.arrows && window.ROOMS_SHEET.arrows[key] || [];
    const bits = window.ROOMS_SHEET.arrow;
    const step = Math.floor(state.phase / (4 * FRAME));
    for (const [x, y, dir, attr] of arrows) {
      const paper = PALETTE[(attr >> 3) & 7], ink = PALETTE[attr & 7], bright = attr & 0x40;
      ctx.fillStyle = bright ? paper.replace("d8", "ff") : paper;
      ctx.fillRect(x, y, 8, 8);
      ctx.fillStyle = bright ? ink.replace("d8", "ff") : ink;
      for (let j = 0; j < 8; j++) {
        // the pattern rolls down the cell, or, flipped, up it
        const row = dir === "down" ? bits[(j - step) & 7] : bits[7 - ((j + step) & 7)];
        for (let i = 0; i < 8; i++) if (row & (0x80 >> i)) ctx.fillRect(x + i, y + j, 1, 1);
      }
    }
    // the stations' call buttons blink while a lift is moving, as filmed in the
    // original: the two take turns, one magenta while the other is red, swapping
    // every four frames, and both go blue for a moment as the ride begins
    const buttons = window.ROOMS_SHEET.buttons && window.ROOMS_SHEET.buttons[key];
    const riding = dan.onLift || treens.some((t) => !t.dead && t.riding);
    if (buttons && riding) {
      const starting = dan.onLift && dan.onLift.at != null && state.phase - dan.onLift.at < 8 * FRAME;
      buttons.forEach(([x, y, attr], i) => {
        const paper = PALETTE[(attr >> 3) & 7];
        ctx.fillStyle = attr & 0x40 ? paper.replace("d8", "ff") : paper;
        ctx.fillRect(x, y, 8, 8);
        ctx.fillStyle = starting ? C.bblue : ((step + i) & 1) ? C.bred : C.bmagenta;
        for (let j = 0; j < 8; j++) for (let k = 0; k < 8; k++) if (LIFT_BUTTON[j] & (0x80 >> k)) ctx.fillRect(x + k, y + j, 1, 1);
      });
    }
    return;
  }
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
    // over the original's screen the shut door is the original's own slab
    const door = state.backdrop && SHEETS.rooms && SHEETS.rooms.meta.doors && SHEETS.rooms.meta.doors[key + ":" + l.kind];
    if (door) {
      if (!open) { const [sx, sy, w, h, x, y] = door; ctx.drawImage(SHEETS.rooms.img, sx, sy, w, h, x, y, w, h); }
      continue;
    }
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

  if (state.mode === "splash") return drawSplash(ctx);
  if (state.mode === "title") return drawMenu(ctx);
  if (state.mode === "options") return drawOptions(ctx);
  if (state.mode === "intro") return drawIntro(ctx);
  if (state.mode === "ending") return drawEnding(ctx);

  drawFrame(ctx);
  ctx.save();
  ctx.beginPath();
  ctx.rect(VIEW_X, VIEW_Y, VIEW_W, VIEW_H);
  ctx.clip();
  ctx.translate(VIEW_X, VIEW_Y);

  const key = state.room;
  const room = currentRoom();
  state.backdrop = drawBackdrop(ctx, key);            // the original's own screen, when we have it
  if (!state.backdrop) drawRoom(ctx, LEVEL, key, room, state.phase * 12);

  drawGuns(ctx);
  if (key === SDS_ROOM) drawMechanism(ctx, SDS_X, room.platforms.reduce((a, b) => (b.y > a.y ? b : a)).y * 8, state.fitted, state.phase, state.backdrop);

  if (boss && !state.backdrop) {                      // the backdrop already holds the original's hologram
    boss.anim += 0.05;
    const bob = Math.round(Math.sin(boss.anim) * 2);
    drawMekonSeated(ctx, Math.round(boss.x), Math.round(boss.y + bob), 24, 30, boss.anim);
  }
  for (const t of treens) {
    if (t.dead && !(t.dying > 0)) continue;
    drawTreenFigure(ctx, Math.round(t.x), Math.round(t.y), TREEN_W, TREEN_H, t.anim / 2, t.dir < 0,
                    { fire: !!t.fire, armsUp: t.dead });
  }
  if (!(dan.hurt > 0 && Math.floor(dan.hurt * 16) % 2)) {
    const dx = Math.round(dan.x), dy = Math.round(dan.y);
    const pose = danFrame();
    drawDanFigure(ctx, dx, dy, DAN_W, DAN_H, pose === "run" ? "run" : pose, (dan.anim / 2) % 1, dan.face < 0);
  }
  // as in the original, the room stands in front of the figures: the walkways
  // hide their feet, the shafts and doorways hide whoever passes through them
  drawForeground(ctx, key);
  // the cups and the parts are tiles of the room in the original, flagged to
  // stand in front of the figures like the walls: drawn after them
  for (const p of pickups) {
    if (!p.taken) {                              // the original's cup: white on its own black cell
      ctx.fillStyle = C.black; ctx.fillRect(Math.round(p.x), Math.round(p.y), 8, 16);
      drawBits(ctx, CUP_BITS, Math.round(p.x), Math.round(p.y), [C.bwhite]);
    }
  }
  for (const k of sdsParts) {
    if (!k.taken && k.key === key && k.id === state.fitted) drawPartBox(ctx, Math.round(k.x), Math.round(k.y));
  }
  drawLiftMarks(ctx, key, room);
  drawGates(ctx, key, room);
  for (const l of lasers) {
    ctx.fillStyle = l.friendly ? C.white : C.bred;
    const y = Math.round(l.y);
    if (l.cells > 0) ctx.fillRect(Math.round(l.x), y, LASER_STEP, 1);
    for (const x of l.trail) ctx.fillRect(Math.round(x), y, LASER_STEP, 1);
  }

  if (state.invert > 0) {
    // a gun shot: the original swaps every cell's ink and paper for a frame
    ctx.save();
    ctx.globalCompositeOperation = "difference";
    ctx.fillStyle = C.bwhite;
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    ctx.restore();
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

}

/** The loading picture, after the original's: the plaque, Dan under it, the
 *  Mekon beside him - assets/title.png, drawn at the canvas's full resolution
 *  with the plaque lettered here so the story can rename it. */
function drawSplash(ctx) {
  const img = SHEETS.title && SHEETS.title.img;
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.imageSmoothingEnabled = true;
  ctx.fillStyle = C.black;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  const k = canvas.width / SCREEN_W;                // screen pixels per game pixel
  if (img) ctx.drawImage(img, 0, 0, SCREEN_W * k, SCREEN_H * k);
  // the plaque: 2..176 by 2..41 on the picture's 256x192
  const [a, b] = [tx(["DAN DARE"])[0], tx(["PILOT OF THE FUTURE"])[0]];
  ctx.textAlign = "center"; ctx.textBaseline = "alphabetic";
  ctx.fillStyle = C.byellow;
  ctx.font = `bold ${Math.round(21 * k)}px Plaque, "DejaVu Serif", Georgia, serif`;
  ctx.fillText(a, 89 * k, 27 * k, 168 * k);
  ctx.font = `bold ${Math.round(8 * k)}px Plaque, "DejaVu Serif", Georgia, serif`;
  ctx.fillText(b, 89 * k, 38 * k, 168 * k);
  if (Math.floor(state.phase * 2) % 2) {
    ctx.font = `bold ${Math.round(6 * k)}px Plaque, "DejaVu Serif", Georgia, serif`;
    ctx.lineWidth = 3 * k / 4; ctx.strokeStyle = C.black; ctx.fillStyle = C.bwhite;
    ctx.strokeText(tx(["PRESS SPACE"])[0], 60 * k, 184 * k);
    ctx.fillText(tx(["PRESS SPACE"])[0], 60 * k, 184 * k);
  }
  ctx.restore();
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

  if (state.mode === "splash") {
    if (tapped.Space || tapped.Enter || tapped.Escape) { state.mode = "title"; menu.t = 0; }
  } else if (state.mode === "title") {
    updateMenu(dt);
    if (tapped.Enter || tapped.Space) beginIntro();
    else if (tapped.Digit1) { state.mode = "options"; }
  } else if (state.mode === "options") {
    updateOptions();
  } else if (state.mode === "intro") {
    updateIntro(dt);
  } else if (state.mode === "ending") {
    updateEnding(dt);
  } else {
    if (!state.cheat.time) state.timeLeft -= dt * CLOCK_RATE;
    if (state.messageTimer > 0) state.messageTimer -= dt;
    if (state.viewerTimer > 0 && (state.viewerTimer -= dt) <= 0) state.viewer = "asteroid";
    if (state.viewerStatic > 0) state.viewerStatic -= dt;
    if ((state.nextTaunt -= dt) <= 0 && state.messageTimer <= 0) taunt();
    if (state.burst > 0) state.burst -= dt;
    if (state.flash > 0) state.flash -= dt;
    if (state.invert > 0) state.invert -= dt;
    if (state.timeLeft <= 0) {
      state.timeLeft = 0;
      beginEnding("lost");
    }
    updateDan(dt);
    updateTreens(dt);
    updateGuns(dt);
    updateLasers(dt);
    updatePickups();
  }

  draw();
  for (const k in tapped) delete tapped[k];
  requestAnimationFrame(frame);
}

resetDan(24, 40);
enterRoom(START.key, 24, 40);
state.mode = "splash";
state.story = loadStory();
requestAnimationFrame(frame);
