"use strict";
/*
 * Dan Dare: Pilot of the Future -- web recreation
 * A flip-screen platformer in the style of the 1986 ZX Spectrum original.
 * Collect the 5 scattered parts of the planet-buster mechanism and carry
 * them to the control room to defuse it.
 */

//// ---------- Canvas / constants ----------

const cv = document.getElementById("screen");
const ctx = cv.getContext("2d");
ctx.imageSmoothingEnabled = false;

const TILE = 16;
const ROOM_W = 20;          // tiles
const ROOM_H = 14;          // tiles
const HUD_H = 16;           // px
const PLAY_W = ROOM_W * TILE;   // 320
const PLAY_H = ROOM_H * TILE;   // 224

const GRAV = 420;           // px/s^2
const MOVE_SPEED = 70;      // px/s
const CLIMB_SPEED = 55;
const JUMP_VY = -190;

//// ---------- Palette (ZX Spectrum-ish) ----------

const PAL = {
  black: "#000000",
  blue: "#0022d1",
  brightBlue: "#0033ff",
  red: "#d10000",
  magenta: "#d100d1",
  green: "#00c400",
  brightGreen: "#00ff00",
  cyan: "#00c4c4",
  brightCyan: "#00ffff",
  yellow: "#c4c400",
  brightYellow: "#ffff00",
  white: "#c4c4c4",
  brightWhite: "#ffffff",
};

//// ---------- Input ----------

const keys = {};
const pressed = {};
window.addEventListener("keydown", (e) => {
  if (["ArrowUp","ArrowDown","ArrowLeft","ArrowRight","Space","Enter"].includes(e.code)) e.preventDefault();
  if (!keys[e.code]) pressed[e.code] = true;
  keys[e.code] = true;
});
window.addEventListener("keyup", (e) => { keys[e.code] = false; });

function keyLeft() { return keys.ArrowLeft || keys.KeyA; }
function keyRight() { return keys.ArrowRight || keys.KeyD; }
function keyUp() { return keys.ArrowUp || keys.KeyW; }
function keyDown() { return keys.ArrowDown || keys.KeyS; }
function keyJump() { return keys.KeyZ || keys.Space; }
function keyFire() { return keys.KeyX || keys.ControlLeft; }
function keyStart() { return pressed.Enter; }

//// ---------- Tiny sound synth (Web Audio beeps, optional/best-effort) ----------

let actx = null;
function beep(freq, dur, type, vol) {
  try {
    if (!actx) actx = new (window.AudioContext || window.webkitAudioContext)();
    const o = actx.createOscillator();
    const g = actx.createGain();
    o.type = type || "square";
    o.frequency.value = freq;
    g.gain.value = vol == null ? 0.06 : vol;
    o.connect(g);
    g.connect(actx.destination);
    o.start();
    g.gain.exponentialRampToValueAtTime(0.0001, actx.currentTime + dur);
    o.stop(actx.currentTime + dur);
  } catch (e) { /* audio unavailable, ignore */ }
}
const sfx = {
  laser: () => beep(900, 0.08, "square", 0.05),
  hit: () => beep(140, 0.25, "sawtooth", 0.08),
  pickup: () => beep(660, 0.18, "square", 0.07),
  death: () => beep(90, 0.4, "sawtooth", 0.09),
  win: () => beep(520, 0.5, "triangle", 0.08),
  step: () => {},
};

//// ---------- Tile grid helpers ----------

function blankGrid() {
  const g = [];
  for (let y = 0; y < ROOM_H; y++) g.push(new Array(ROOM_W).fill("."));
  return g;
}
function hLine(g, y, x1, x2, ch) { for (let x = x1; x <= x2; x++) g[y][x] = ch; }
function vLine(g, x, y1, y2, ch) { for (let y = y1; y <= y2; y++) g[y][x] = ch; }
function box(g, x1, y1, x2, y2, ch) {
  hLine(g, y1, x1, x2, ch); hLine(g, y2, x1, x2, ch);
  vLine(g, x1, y1, y2, ch); vLine(g, x2, y1, y2, ch);
}

const SHAFT_X_BY_COL = { 0: 4, 1: 10, 2: 14, 3: 16 };

// Builds a standard room: outer walls (open where an exit exists),
// a vertical ladder shaft where up/down exits exist, plus decor.
function makeRoom(opts) {
  const g = blankGrid();
  const { exits, shaftX, theme } = opts;

  // ceiling / floor
  hLine(g, 0, 0, ROOM_W - 1, "#");
  hLine(g, ROOM_H - 1, 0, ROOM_W - 1, "#");
  // side walls
  if (!exits.left) vLine(g, 0, 1, ROOM_H - 2, "#");
  if (!exits.right) vLine(g, ROOM_W - 1, 1, ROOM_H - 2, "#");

  // vertical shaft (ladder) if this room connects up/down
  if ((exits.up || exits.down) && shaftX != null) {
    vLine(g, shaftX, 1, ROOM_H - 2, "L");
    if (exits.up) g[0][shaftX] = "L";
    if (exits.down) g[ROOM_H - 1][shaftX] = "L";
  }

  // extra decorative/secondary ladders
  (opts.ladders || []).forEach(([x, y1, y2]) => vLine(g, x, y1, y2, "L"));

  // platforms
  (opts.platforms || []).forEach(([x1, x2, y]) => hLine(g, y, x1, x2, "="));

  // interior pillars (decor walls, must not block the shaft column)
  (opts.pillars || []).forEach(([x, y1, y2]) => {
    if (x === shaftX) return;
    vLine(g, x, y1, y2, "#");
  });

  // spikes (hazard)
  (opts.spikes || []).forEach(([x1, x2, y]) => hLine(g, y, x1, x2, "^"));

  return g;
}

//// ---------- Level: room graph ----------

// grid layout (row -> col -> room id); mirrors the shape of the original
// screen map (irregular, multi-branch, several dead ends).
const LAYOUT = [
  ["A0", "A1", "A2", null],
  ["B0", "B1", "B2", "B3"],
  [null, "C1", "C2", "C3"],
  ["D0", "D1", null, "D3"],
  [null, "E1", "E2", null],
];

const ROOMS = {}; // id -> room def

function findPos(id) {
  for (let r = 0; r < LAYOUT.length; r++)
    for (let c = 0; c < LAYOUT[r].length; c++)
      if (LAYOUT[r][c] === id) return [r, c];
  return null;
}
function idAt(r, c) {
  if (r < 0 || r >= LAYOUT.length) return null;
  if (c < 0 || c >= LAYOUT[r].length) return null;
  return LAYOUT[r][c];
}

function autoExits(id) {
  const [r, c] = findPos(id);
  return {
    left: idAt(r, c - 1),
    right: idAt(r, c + 1),
    up: idAt(r - 1, c),
    down: idAt(r + 1, c),
  };
}

function defineRoom(id, theme, extra) {
  const exits = autoExits(id);
  const [, col] = findPos(id);
  const shaftX = SHAFT_X_BY_COL[col];
  const grid = makeRoom({ exits, shaftX, theme, ...extra });
  ROOMS[id] = {
    id, theme, grid, exits, shaftX,
    enemiesDef: extra.enemies || [],
    collectiblesDef: extra.collectibles || [],
    pickupsDef: extra.pickups || [],
    console: !!extra.console,
    label: extra.label || "",
  };
}

// --- Surface (landing bay) rooms ---
defineRoom("A0", "surface", {
  platforms: [[2, 8, 9]],
  enemies: [{ x: 15, y: 13, range: 3 }],
  label: "LANDING BAY",
});
defineRoom("A1", "surface", {
  platforms: [[3, 7, 8], [12, 17, 9]],
  enemies: [{ x: 6, y: 13, range: 4 }, { x: 14, y: 13, range: 3 }],
  label: "LANDING BAY",
});
defineRoom("A2", "surface", {
  platforms: [[2, 6, 8]],
  enemies: [{ x: 8, y: 13, range: 5 }],
  collectibles: [{ id: 0, x: 3, y: 7 }],
  label: "SILO ROOF",
});

// --- Upper tech corridors ---
defineRoom("B0", "tech", {
  pillars: [[7, 2, 6]],
  platforms: [[1, 6, 7]],
  enemies: [{ x: 12, y: 13, range: 5 }],
  collectibles: [{ id: 1, x: 2, y: 6 }],
  label: "STORAGE BAY",
});
defineRoom("B1", "tech", {
  platforms: [[1, 4, 6], [13, 18, 6]],
  enemies: [{ x: 5, y: 13, range: 6 }],
  label: "MAIN CORRIDOR",
});
defineRoom("B2", "tech", {
  platforms: [[2, 6, 7], [11, 17, 5]],
  enemies: [{ x: 9, y: 13, range: 4 }],
  label: "MAIN CORRIDOR",
});
defineRoom("B3", "tech", {
  platforms: [[1, 5, 8]],
  pickups: [{ kind: "life", x: 2, y: 7 }],
  label: "DEAD END BAY",
});

// --- Mid rooms ---
defineRoom("C1", "tech", {
  platforms: [[11, 18, 7]],
  spikes: [[6, 9, 13]],
  enemies: [{ x: 14, y: 13, range: 3 }],
  label: "GENERATOR HALL",
});
defineRoom("C2", "tech", {
  platforms: [[1, 6, 6], [8, 12, 9]],
  enemies: [{ x: 15, y: 13, range: 4 }],
  collectibles: [{ id: 2, x: 2, y: 5 }],
  label: "COMPUTER ROOM",
});
defineRoom("C3", "tech", {
  platforms: [[2, 9, 6]],
  enemies: [{ x: 5, y: 13, range: 3 }, { x: 13, y: 13, range: 4 }],
  label: "SURVEILLANCE",
});

// --- Lower rooms ---
defineRoom("D0", "vault", {
  spikes: [[3, 16, 8], [1, 18, 13]],
  platforms: [[1, 4, 7], [15, 18, 7]],
  collectibles: [{ id: 3, x: 9, y: 6 }],
  label: "MEKON VAULT",
});
defineRoom("D1", "tech", {
  platforms: [[1, 4, 6], [15, 18, 6]],
  enemies: [{ x: 7, y: 13, range: 4 }],
  label: "ACCESS SHAFT",
});
defineRoom("D3", "tech", {
  platforms: [[1, 6, 6]],
  spikes: [[10, 17, 13]],
  enemies: [{ x: 4, y: 13, range: 3 }],
  collectibles: [{ id: 4, x: 3, y: 5 }],
  label: "GUARD POST",
});

// --- Bottom: control room + reactor ---
defineRoom("E1", "control", {
  platforms: [[1, 5, 7], [14, 18, 7]],
  console: true,
  label: "CONTROL ROOM",
});
defineRoom("E2", "tech", {
  platforms: [[2, 7, 7]],
  enemies: [{ x: 12, y: 13, range: 4 }],
  pickups: [{ kind: "life", x: 15, y: 6 }],
  label: "REACTOR CORE",
});

const START_ROOM = "A0";
const START_X = 2, START_Y = 13;

//// ---------- Collision helpers ----------

function tileAt(grid, tx, ty) {
  // Outside the room grid is open space, not solid: real containment comes
  // from explicit border walls (when a room has no exit that way) plus the
  // room-transition checks in Player.handleExits. Treating out-of-range as
  // solid would create a phantom floor/wall exactly at every doorway.
  if (tx < 0 || tx >= ROOM_W || ty < 0 || ty >= ROOM_H) return ".";
  return grid[ty][tx];
}
function isSolid(ch) { return ch === "#"; }
function isPlatform(ch) { return ch === "="; }
function isLadder(ch) { return ch === "L"; }
function isSpike(ch) { return ch === "^"; }

function onLadder(grid, px, py, w, h) {
  const cx = px + w / 2;
  const tx = Math.floor(cx / TILE);
  const ty1 = Math.floor(py / TILE);
  const ty2 = Math.floor((py + h - 1) / TILE);
  // also sample just below the feet, so a player standing on top of a
  // ladder tile (e.g. a shaft opening in the floor) can still grab on
  // and climb down, not just when already overlapping the ladder.
  const ty3 = Math.floor((py + h + 1) / TILE);
  return isLadder(tileAt(grid, tx, ty1)) || isLadder(tileAt(grid, tx, ty2)) || isLadder(tileAt(grid, tx, ty3));
}

function overlapsHazard(grid, px, py, w, h) {
  const x1 = Math.floor(px / TILE), x2 = Math.floor((px + w - 1) / TILE);
  const y1 = Math.floor(py / TILE), y2 = Math.floor((py + h - 1) / TILE);
  for (let ty = y1; ty <= y2; ty++)
    for (let tx = x1; tx <= x2; tx++)
      if (isSpike(tileAt(grid, tx, ty))) return true;
  return false;
}

//// ---------- Entities ----------

class Laser {
  constructor(x, y, dir) { this.x = x; this.y = y; this.dir = dir; this.dead = false; this.w = 6; this.h = 2; }
  update(dt, grid) {
    this.x += this.dir * 260 * dt;
    if (this.x < 0 || this.x > PLAY_W) this.dead = true;
    const tx = Math.floor((this.x + (this.dir > 0 ? this.w : 0)) / TILE);
    const ty = Math.floor(this.y / TILE);
    if (isSolid(tileAt(grid, tx, ty))) this.dead = true;
  }
  draw() {
    ctx.fillStyle = PAL.brightRed || "#ff3030";
    ctx.fillRect(Math.round(this.x), Math.round(this.y), this.w, this.h);
  }
}

class Enemy {
  constructor(def) {
    this.x0 = def.x * TILE; this.y = def.y * TILE - 14;
    this.x = this.x0; this.range = def.range * TILE;
    this.w = 12; this.h = 14; this.dir = 1; this.dead = false;
    this.animT = Math.random() * 10;
  }
  update(dt) {
    if (this.dead) return;
    this.animT += dt;
    this.x += this.dir * 20 * dt;
    if (this.x > this.x0 + this.range) { this.x = this.x0 + this.range; this.dir = -1; }
    if (this.x < this.x0 - this.range) { this.x = this.x0 - this.range; this.dir = 1; }
  }
  rect() { return { x: this.x, y: this.y, w: this.w, h: this.h }; }
  draw() {
    if (this.dead) return;
    const bob = Math.sin(this.animT * 6) * 1.5;
    const x = Math.round(this.x), y = Math.round(this.y + bob);
    // Treen alien: green bulbous head + dark tunic
    ctx.fillStyle = PAL.brightGreen;
    ctx.fillRect(x, y, 12, 9);
    ctx.fillRect(x + 1, y - 2, 10, 3);
    ctx.fillStyle = PAL.black;
    ctx.fillRect(x + 2, y + 2, 3, 3);
    ctx.fillRect(x + 7, y + 2, 3, 3);
    ctx.fillStyle = PAL.blue;
    ctx.fillRect(x + 1, y + 9, 10, 5);
    ctx.fillStyle = PAL.white;
    ctx.fillRect(x + 1, y + 14, 10, 1);
  }
}

class Pickup {
  constructor(def, kind) { this.x = def.x * TILE; this.y = def.y * TILE; this.kind = kind; this.taken = false; this.id = def.id; this.t = Math.random() * 10; }
  rect() { return { x: this.x, y: this.y, w: 12, h: 12 }; }
  draw() {
    if (this.taken) return;
    this.t += 1 / 60;
    const y = this.y + Math.sin(this.t * 3) * 2;
    const x = this.x;
    if (this.kind === "part") {
      ctx.fillStyle = PAL.brightYellow;
      ctx.fillRect(x, y, 12, 12);
      ctx.fillStyle = PAL.red;
      ctx.fillRect(x + 3, y + 3, 6, 6);
      ctx.strokeStyle = PAL.black;
      ctx.strokeRect(x + 0.5, y + 0.5, 11, 11);
    } else if (this.kind === "life") {
      ctx.fillStyle = PAL.brightCyan;
      ctx.beginPath();
      ctx.arc(x + 6, y + 6, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = PAL.white;
      ctx.font = "8px monospace";
      ctx.fillText("+", x + 3, y + 9);
    }
  }
}

function rectsOverlap(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

//// ---------- Player ----------

const PLAYER_W = 10, PLAYER_H = 15;

class Player {
  constructor() {
    this.reset();
    this.lives = 3;
    this.partsCollected = new Set();
  }
  reset() {
    this.x = START_X * TILE; this.y = START_Y * TILE - PLAYER_H;
    this.vx = 0; this.vy = 0;
    this.facing = 1;
    this.onGround = false;
    this.climbing = false;
    this.kneeling = false;
    this.invuln = 0;
    this.fireCooldown = 0;
  }
  spawnAt(x, y) { this.x = x; this.y = y; this.vx = 0; this.vy = 0; this.invuln = 1.0; }
  rect() { return { x: this.x + 2, y: this.y, w: PLAYER_W - 2, h: this.kneeling ? 10 : PLAYER_H }; }

  update(dt, room, world) {
    const grid = room.grid;
    if (this.invuln > 0) this.invuln -= dt;

    const ladderHere = onLadder(grid, this.x, this.y, PLAYER_W, PLAYER_H);

    // horizontal movement
    let moveX = 0;
    if (keyLeft()) { moveX = -1; this.facing = -1; }
    else if (keyRight()) { moveX = 1; this.facing = 1; }

    this.kneeling = keyDown() && this.onGround && !this.climbing;

    if (ladderHere && (keyUp() || keyDown())) {
      this.climbing = true;
    } else if (!ladderHere) {
      this.climbing = false;
    }

    if (this.climbing) {
      this.vy = 0;
      if (keyUp()) this.y -= CLIMB_SPEED * dt;
      if (keyDown()) this.y += CLIMB_SPEED * dt;
      this.x += moveX * MOVE_SPEED * 0.5 * dt;
      if (!onLadder(grid, this.x, this.y, PLAYER_W, PLAYER_H)) this.climbing = false;
    } else {
      if (!this.kneeling) this.x += moveX * MOVE_SPEED * dt;
      // gravity
      this.vy += GRAV * dt;
      if (this.vy > 300) this.vy = 300;
      // jump
      if (keyJump() && this.onGround && !this.kneeling) {
        this.vy = JUMP_VY;
        this.onGround = false;
      }
    }

    // --- resolve horizontal collisions ---
    if (!this.climbing) {
      const nx = this.x;
      const r = this.rect();
      const testX = { x: nx + 2, y: r.y, w: r.w, h: r.h };
      if (this.collideSolid(grid, testX)) {
        // step back to tile edge
        if (moveX > 0) this.x = Math.floor((testX.x + testX.w) / TILE) * TILE - testX.w - 2;
        else if (moveX < 0) this.x = Math.ceil(testX.x / TILE) * TILE - 2;
      }
    }

    // --- vertical movement + collision ---
    if (!this.climbing) {
      this.y += this.vy * dt;
      const r = this.rect();
      this.onGround = false;
      if (this.vy >= 0) {
        // falling: check floor / platform under feet
        const feetY = r.y + r.h;
        const tx1 = Math.floor((r.x + 1) / TILE), tx2 = Math.floor((r.x + r.w - 2) / TILE);
        const ty = Math.floor(feetY / TILE);
        for (let tx = tx1; tx <= tx2; tx++) {
          const ch = tileAt(grid, tx, ty);
          if ((isSolid(ch) || isPlatform(ch) || isLadder(ch)) && feetY - this.vy * dt <= ty * TILE + 1) {
            this.y = ty * TILE - r.h;
            this.vy = 0;
            this.onGround = true;
          }
        }
      } else {
        // rising: check ceiling
        const headY = r.y;
        const tx1 = Math.floor((r.x + 1) / TILE), tx2 = Math.floor((r.x + r.w - 2) / TILE);
        const ty = Math.floor(headY / TILE);
        for (let tx = tx1; tx <= tx2; tx++) {
          const ch = tileAt(grid, tx, ty);
          if (isSolid(ch) || isLadder(ch)) {
            this.y = (ty + 1) * TILE;
            this.vy = 0;
          }
        }
      }
    }

    // clamp inside room vertically (safety)
    if (this.y > PLAY_H) this.y = PLAY_H - PLAYER_H;

    // hazards
    const rr = this.rect();
    if (overlapsHazard(grid, rr.x, rr.y, rr.w, rr.h) && this.invuln <= 0) {
      world.killPlayer();
      return;
    }

    // firing
    if (this.fireCooldown > 0) this.fireCooldown -= dt;
    if (keyFire() && this.fireCooldown <= 0) {
      this.fireCooldown = 0.35;
      const lx = this.facing > 0 ? this.x + PLAYER_W : this.x - 6;
      const ly = this.kneeling ? this.y + 8 : this.y + 6;
      world.lasers.push(new Laser(lx, ly, this.facing));
      sfx.laser();
    }

    this.handleExits(room, world);
  }

  collideSolid(grid, r) {
    const x1 = Math.floor(r.x / TILE), x2 = Math.floor((r.x + r.w - 1) / TILE);
    const y1 = Math.floor(r.y / TILE), y2 = Math.floor((r.y + r.h - 1) / TILE);
    for (let ty = y1; ty <= y2; ty++)
      for (let tx = x1; tx <= x2; tx++)
        if (isSolid(tileAt(grid, tx, ty))) return true;
    return false;
  }

  handleExits(room, world) {
    const r = this.rect();
    if (r.x < 0 && room.exits.left) {
      world.gotoRoom(room.exits.left, PLAY_W - PLAYER_W - 3, this.y);
    } else if (r.x + r.w > PLAY_W && room.exits.right) {
      world.gotoRoom(room.exits.right, 3, this.y);
    } else if (r.y < 0 && room.exits.up) {
      world.gotoRoom(room.exits.up, this.x, PLAY_H - PLAYER_H - TILE);
    } else if (r.y + r.h > PLAY_H + 2 && room.exits.down) {
      world.gotoRoom(room.exits.down, this.x, TILE);
    }
  }

  draw() {
    if (this.invuln > 0 && Math.floor(this.invuln * 20) % 2 === 0) return; // flicker
    const x = Math.round(this.x), y = Math.round(this.y);
    const h = this.kneeling ? 10 : PLAYER_H;
    const yOff = this.kneeling ? PLAYER_H - 10 : 0;
    ctx.save();
    // legs / body (flight suit)
    ctx.fillStyle = PAL.green;
    ctx.fillRect(x + 1, y + yOff + 6, 8, h - 6);
    // torso
    ctx.fillStyle = PAL.brightYellow;
    ctx.fillRect(x + 1, y + yOff, 8, 7);
    // helmet
    ctx.fillStyle = PAL.brightWhite;
    ctx.fillRect(x + 2, y + yOff - 3, 6, 4);
    ctx.fillStyle = PAL.brightCyan;
    ctx.fillRect(this.facing > 0 ? x + 5 : x + 2, y + yOff - 2, 3, 2);
    // gun
    ctx.fillStyle = PAL.black;
    if (this.facing > 0) ctx.fillRect(x + 9, y + yOff + 6, 5, 2);
    else ctx.fillRect(x - 4, y + yOff + 6, 5, 2);
    ctx.restore();
  }
}

//// ---------- World / game state ----------

const STATE = { TITLE: 0, PLAYING: 1, DEAD_PAUSE: 2, GAMEOVER: 3, WIN: 4 };

class World {
  constructor() {
    this.state = STATE.TITLE;
    this.player = new Player();
    this.roomId = START_ROOM;
    this.lasers = [];
    this.enemies = [];
    this.pickups = [];
    this.deathTimer = 0;
    this.msgTimer = 0;
    this.stateTimer = 0;
    // Checkpoint: the room/position the player last entered through a
    // normal transition. Dying respawns here (start of the current
    // screen), not all the way back at the beginning of the game.
    this.entryPoint = { room: START_ROOM, x: START_X * TILE, y: START_Y * TILE - PLAYER_H };
    this.loadRoom(START_ROOM);
  }

  currentRoom() { return ROOMS[this.roomId]; }

  loadRoom(id, spawnX, spawnY) {
    this.roomId = id;
    const room = ROOMS[id];
    this.enemies = room.enemiesDef.map((d) => new Enemy(d));
    this.pickups = [];
    room.collectiblesDef.forEach((d) => {
      if (!this.player.partsCollected.has(d.id)) this.pickups.push(new Pickup(d, "part"));
    });
    room.pickupsDef.forEach((d) => this.pickups.push(new Pickup(d, "life")));
    this.lasers = [];
    if (spawnX != null) {
      this.player.spawnAt(spawnX, spawnY);
      this.entryPoint = { room: id, x: spawnX, y: spawnY };
    }
  }

  gotoRoom(id, x, y) {
    this.loadRoom(id, x, y);
  }

  killPlayer() {
    if (this.player.invuln > 0) return;
    sfx.death();
    this.player.lives -= 1;
    this.state = STATE.DEAD_PAUSE;
    this.deathTimer = 1.1;
  }

  startGame() {
    this.player = new Player();
    this.roomId = START_ROOM;
    this.entryPoint = { room: START_ROOM, x: START_X * TILE, y: START_Y * TILE - PLAYER_H };
    this.loadRoom(START_ROOM);
    this.state = STATE.PLAYING;
  }

  update(dt) {
    if (this.state === STATE.TITLE) {
      if (keyStart()) this.startGame();
      return;
    }
    if (this.state === STATE.GAMEOVER || this.state === STATE.WIN) {
      if (keyStart()) { this.state = STATE.TITLE; }
      return;
    }
    if (this.state === STATE.DEAD_PAUSE) {
      this.deathTimer -= dt;
      if (this.deathTimer <= 0) {
        if (this.player.lives <= 0) {
          this.state = STATE.GAMEOVER;
        } else {
          this.loadRoom(this.entryPoint.room, this.entryPoint.x, this.entryPoint.y);
          this.state = STATE.PLAYING;
        }
      }
      return;
    }

    // PLAYING
    const room = this.currentRoom();
    this.player.update(dt, room, this);

    this.enemies.forEach((e) => e.update(dt));
    this.lasers.forEach((l) => l.update(dt, room.grid));
    this.lasers = this.lasers.filter((l) => !l.dead);

    // laser vs enemy
    for (const l of this.lasers) {
      for (const e of this.enemies) {
        if (!e.dead && rectsOverlap({ x: l.x, y: l.y, w: l.w, h: l.h }, e.rect())) {
          e.dead = true; l.dead = true; sfx.hit();
        }
      }
    }

    // player vs enemy
    if (this.player.invuln <= 0) {
      for (const e of this.enemies) {
        if (!e.dead && rectsOverlap(this.player.rect(), e.rect())) {
          this.killPlayer();
          break;
        }
      }
    }

    // player vs pickups
    for (const p of this.pickups) {
      if (!p.taken && rectsOverlap(this.player.rect(), p.rect())) {
        p.taken = true;
        sfx.pickup();
        if (p.kind === "part") this.player.partsCollected.add(p.id);
        else if (p.kind === "life") this.player.lives += 1;
      }
    }
    this.pickups = this.pickups.filter((p) => !p.taken);

    // win condition: all 5 parts + standing in control room
    if (room.console && this.player.partsCollected.size >= 5) {
      this.state = STATE.WIN;
      sfx.win();
    }
  }

  draw() {
    if (this.state === STATE.TITLE) return drawTitle();
    drawRoom(this.currentRoom());
    this.pickups.forEach((p) => p.draw());
    this.enemies.forEach((e) => e.draw());
    this.lasers.forEach((l) => l.draw());
    if (this.state !== STATE.DEAD_PAUSE || Math.floor(this.deathTimer * 10) % 2 === 0) {
      this.player.draw();
    }
    drawHud(this);
    if (this.state === STATE.GAMEOVER) drawOverlay("GAME OVER", "PRESS ENTER");
    if (this.state === STATE.WIN) drawOverlay("MISSION COMPLETE", "THE MEKON IS DEFEATED - PRESS ENTER");
  }
}

//// ---------- Rendering ----------

function starfield(seedRoom) {
  // deterministic-ish stars per room id
  let seed = 0;
  for (const c of seedRoom) seed += c.charCodeAt(0);
  const rnd = mulberry32(seed);
  ctx.fillStyle = PAL.brightWhite;
  for (let i = 0; i < 40; i++) {
    const x = Math.floor(rnd() * PLAY_W);
    const y = Math.floor(rnd() * (PLAY_H * 0.5));
    ctx.fillRect(x, y, 1, 1);
  }
}
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function themeColors(theme) {
  switch (theme) {
    case "surface": return { bg: PAL.black, wall: PAL.white, floorA: PAL.magenta, floorB: PAL.white };
    case "vault": return { bg: PAL.blue, wall: PAL.cyan, floorA: PAL.red, floorB: PAL.yellow };
    case "control": return { bg: PAL.blue, wall: PAL.brightCyan, floorA: PAL.yellow, floorB: PAL.green };
    default: return { bg: PAL.blue, wall: PAL.cyan, floorA: PAL.magenta, floorB: PAL.white };
  }
}

function drawRoom(room) {
  ctx.save();
  ctx.translate(0, HUD_H);
  ctx.fillStyle = PAL.black;
  ctx.fillRect(0, 0, PLAY_W, PLAY_H);
  const col = themeColors(room.theme);
  if (room.theme === "surface") starfield(room.id);

  const g = room.grid;
  for (let ty = 0; ty < ROOM_H; ty++) {
    for (let tx = 0; tx < ROOM_W; tx++) {
      const ch = g[ty][tx];
      const x = tx * TILE, y = ty * TILE;
      if (room.theme !== "surface" && ch !== "#") {
        ctx.fillStyle = col.bg;
        ctx.fillRect(x, y, TILE, TILE);
      }
      if (ch === "#") {
        const isFloorRow = ty === 0 || ty === ROOM_H - 1;
        if (isFloorRow) {
          ctx.fillStyle = col.floorA;
          ctx.fillRect(x, y, TILE, TILE / 2);
          ctx.fillStyle = col.floorB;
          ctx.fillRect(x, y + TILE / 2, TILE, TILE / 2);
        } else {
          ctx.fillStyle = col.wall;
          ctx.fillRect(x, y, TILE, TILE);
          ctx.fillStyle = PAL.black;
          ctx.fillRect(x + TILE - 2, y, 2, TILE);
        }
      } else if (ch === "=") {
        ctx.fillStyle = col.floorA;
        ctx.fillRect(x, y, TILE, 4);
      } else if (ch === "L") {
        ctx.fillStyle = "#888";
        ctx.fillRect(x + 2, y, 2, TILE);
        ctx.fillRect(x + TILE - 4, y, 2, TILE);
        ctx.fillStyle = "#ccc";
        ctx.fillRect(x + 2, y + 6, TILE - 4, 2);
      } else if (ch === "^") {
        ctx.fillStyle = PAL.brightCyan;
        for (let i = 0; i < TILE; i += 4) {
          ctx.beginPath();
          ctx.moveTo(x + i, y + TILE);
          ctx.lineTo(x + i + 2, y + TILE - 8);
          ctx.lineTo(x + i + 4, y + TILE);
          ctx.closePath();
          ctx.fill();
        }
      }
    }
  }

  if (room.theme === "surface") {
    // rocket silos silhouette on the horizon
    ctx.fillStyle = "#aaa";
    [3, 6, 15, 17].forEach((tx, i) => {
      const rx = tx * TILE;
      const ry = ROOM_H * TILE - TILE - 40 - (i % 2) * 10;
      ctx.fillRect(rx, ry, 8, 40 + (i % 2) * 10);
      ctx.fillStyle = PAL.red;
      ctx.beginPath();
      ctx.moveTo(rx, ry);
      ctx.lineTo(rx + 4, ry - 10);
      ctx.lineTo(rx + 8, ry);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = "#aaa";
    });
  }

  if (room.console) {
    // reactor console decor near center-bottom
    const cx = 9 * TILE, cy = (ROOM_H - 3) * TILE;
    ctx.fillStyle = PAL.brightYellow;
    ctx.fillRect(cx, cy, TILE * 2, TILE);
    ctx.fillStyle = PAL.brightGreen;
    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      ctx.arc(cx + 6 + i * 10, cy - 4, 5, Math.PI, 0);
      ctx.fill();
    }
  }

  // room label
  ctx.fillStyle = "rgba(0,0,0,0.5)";
  ctx.fillRect(2, 2, room.label.length * 6 + 6, 9);
  ctx.fillStyle = PAL.brightWhite;
  ctx.font = "8px monospace";
  ctx.fillText(room.label, 5, 9);

  ctx.restore();
}

function drawHud(world) {
  ctx.fillStyle = PAL.black;
  ctx.fillRect(0, 0, cv.width, HUD_H);
  ctx.fillStyle = PAL.brightWhite;
  ctx.font = "9px monospace";
  ctx.fillText("LIVES " + Math.max(0, world.player.lives), 4, 11);

  // parts indicator
  const total = 5;
  const have = world.player.partsCollected.size;
  ctx.fillText("PARTS", 110, 11);
  for (let i = 0; i < total; i++) {
    ctx.fillStyle = i < have ? PAL.brightYellow : "#333";
    ctx.fillRect(150 + i * 10, 3, 8, 8);
    ctx.strokeStyle = PAL.white;
    ctx.strokeRect(150 + i * 10 + 0.5, 3.5, 8, 8);
  }
  ctx.fillStyle = PAL.brightCyan;
  ctx.fillText(world.currentRoom().label, 230, 11);
}

function drawOverlay(title, sub) {
  ctx.fillStyle = "rgba(0,0,0,0.65)";
  ctx.fillRect(0, 0, cv.width, cv.height);
  ctx.textAlign = "center";
  ctx.fillStyle = PAL.brightYellow;
  ctx.font = "bold 18px monospace";
  ctx.fillText(title, cv.width / 2, cv.height / 2 - 6);
  ctx.fillStyle = PAL.brightWhite;
  ctx.font = "9px monospace";
  ctx.fillText(sub, cv.width / 2, cv.height / 2 + 14);
  ctx.textAlign = "left";
}

function drawTitle() {
  ctx.fillStyle = PAL.black;
  ctx.fillRect(0, 0, cv.width, cv.height);

  // starfield
  starfield("TITLE");
  ctx.save();
  const rnd = mulberry32(42);
  ctx.fillStyle = PAL.brightWhite;
  for (let i = 0; i < 60; i++) {
    ctx.fillRect(Math.floor(rnd() * cv.width), Math.floor(rnd() * cv.height), 1, 1);
  }
  ctx.restore();

  // title banner
  ctx.fillStyle = PAL.red;
  ctx.fillRect(30, 20, cv.width - 60, 40);
  ctx.strokeStyle = PAL.brightYellow;
  ctx.lineWidth = 2;
  ctx.strokeRect(30, 20, cv.width - 60, 40);
  ctx.textAlign = "center";
  ctx.fillStyle = PAL.brightYellow;
  ctx.font = "bold 22px monospace";
  ctx.fillText("DAN DARE", cv.width / 2, 46);
  ctx.font = "bold 10px monospace";
  ctx.fillText("PILOT OF THE FUTURE", cv.width / 2, 58);

  // simple pilot + alien portrait silhouettes (original tribute art)
  drawPortrait(60, 90, "pilot");
  drawPortrait(cv.width - 100, 90, "alien");

  ctx.fillStyle = PAL.brightCyan;
  ctx.font = "9px monospace";
  ctx.fillText("A fan recreation for the ZX Spectrum classic", cv.width / 2, 150);
  ctx.fillText("by Virgin Games / Gang of Five, 1986", cv.width / 2, 162);

  ctx.fillStyle = PAL.brightWhite;
  ctx.font = "bold 11px monospace";
  if (Math.floor(performance.now() / 400) % 2 === 0) {
    ctx.fillText("PRESS ENTER TO START", cv.width / 2, 200);
  }
  ctx.font = "8px monospace";
  ctx.fillStyle = PAL.white;
  ctx.fillText("Collect 5 parts of the planet-buster and reach the control room", cv.width / 2, 218);
  ctx.textAlign = "left";
}

function drawPortrait(x, y, kind) {
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = "#111";
  ctx.fillRect(-32, -30, 64, 50);
  ctx.strokeStyle = PAL.brightCyan;
  ctx.strokeRect(-32, -30, 64, 50);
  if (kind === "pilot") {
    ctx.fillStyle = "#e0a878";
    ctx.fillRect(-14, -18, 28, 26);
    ctx.fillStyle = PAL.white;
    ctx.fillRect(-18, -28, 36, 12);
    ctx.fillStyle = PAL.green;
    ctx.fillRect(-18, -30, 36, 4);
    ctx.fillStyle = PAL.black;
    ctx.fillRect(-10, -6, 6, 3);
    ctx.fillRect(4, -6, 6, 3);
  } else {
    ctx.fillStyle = PAL.brightGreen;
    ctx.beginPath();
    ctx.ellipse(0, -8, 20, 22, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = PAL.black;
    ctx.beginPath();
    ctx.ellipse(-8, -10, 5, 7, 0, 0, Math.PI * 2);
    ctx.ellipse(8, -10, 5, 7, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = PAL.blue;
    ctx.fillRect(-16, 12, 32, 10);
  }
  ctx.restore();
}

//// ---------- Main loop ----------

const world = new World();
let lastT = performance.now();
function frame(t) {
  const dt = Math.min(0.05, (t - lastT) / 1000);
  lastT = t;
  world.update(dt);
  world.draw();
  for (const k in pressed) delete pressed[k];
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
