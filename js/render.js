"use strict";
/* Screen layout and drawing. Everything is rendered at the ZX Spectrum's
   256x192 and scaled up by the canvas transform, so the pixels stay square. */

const SCREEN_W = 256, SCREEN_H = 192;
const VIEW_X = 8, VIEW_Y = 8, VIEW_W = 240, VIEW_H = 144;
const CELL = 8;

const C = {
  black: "#000000",
  blue: "#0000d8", bblue: "#0000ff",
  red: "#d80000", bred: "#ff0000",
  magenta: "#d800d8", bmagenta: "#ff00ff",
  green: "#00d800", bgreen: "#00ff00",
  cyan: "#00d8d8", bcyan: "#00ffff",
  yellow: "#d8d800", byellow: "#ffff00",
  white: "#d8d8d8", bwhite: "#ffffff",
};

// Sector palettes, keyed by the colour signature the extractor found in each
// screen's floor band, so each area keeps the tint it has on the map.
const SECTOR_STYLE = {
  "cyan": { band: [C.cyan, C.white], wall: C.cyan, back: C.black, name: "LANDING ZONE" },
  "cyan,white": { band: [C.cyan, C.white], wall: C.cyan, back: C.blue, name: "SECTOR 1" },
  "cyan,red": { band: [C.red, C.cyan], wall: C.cyan, back: C.blue, name: "SECTOR 2" },
  "magenta,white": { band: [C.magenta, C.white], wall: C.cyan, back: C.blue, name: "SECTOR 3" },
  "cyan,green": { band: [C.green, C.cyan], wall: C.cyan, back: C.blue, name: "SECTOR 4" },
  "cyan,yellow": { band: [C.yellow, C.cyan], wall: C.cyan, back: C.blue, name: "SECTOR 5" },
};
const DEFAULT_STYLE = SECTOR_STYLE["cyan,white"];

function sectorStyle(level, room) {
  const sig = (level.sectors[room.sector] || []).join(",");
  return SECTOR_STYLE[sig] || DEFAULT_STYLE;
}

/** Deterministic PRNG so the world looks the same every run. */
function rng(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashKey(key) {
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

// ---------------------------------------------------------------- background

function drawStarfield(ctx, key) {
  const r = rng(hashKey(key) ^ 0x5eed);
  ctx.fillStyle = C.black;
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  for (let i = 0; i < 90; i++) {
    const x = Math.floor(r() * VIEW_W), y = Math.floor(r() * VIEW_H);
    const v = r();
    ctx.fillStyle = v < 0.6 ? C.white : v < 0.85 ? C.bcyan : C.green;
    ctx.fillRect(x, y, 1, 1);
  }
}

/** The room's back wall: flat colour with a panel grid, as in the original. */
function drawBackWall(ctx, key, style) {
  ctx.fillStyle = style.back;
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  if (style.back === C.black) return;
  ctx.fillStyle = "rgba(0,0,0,0.55)";
  for (let y = 0; y < VIEW_H; y += 16) {
    for (let x = 0; x < VIEW_W; x += 16) {
      if (((x / 16) + (y / 16)) % 2 === 0) continue;
      ctx.fillRect(x + 1, y + 1, 2, 2);
      ctx.fillRect(x + 9, y + 9, 2, 2);
    }
  }
}

// ------------------------------------------------------------------ geometry

/** A floor/walkway: a striped band, one cell tall, that Dan stands on top of. */
function drawPlatform(ctx, p, style) {
  const x = p.x0 * CELL, w = (p.x1 - p.x0) * CELL, y = p.y * CELL;
  ctx.fillStyle = style.band[0];
  ctx.fillRect(x, y, w, 3);
  ctx.fillStyle = C.black;
  ctx.fillRect(x, y + 3, w, 1);
  ctx.fillStyle = style.band[1];
  ctx.fillRect(x, y + 4, w, 3);
  ctx.fillStyle = C.black;
  for (let i = x; i < x + w; i += 4) ctx.fillRect(i, y + 4, 1, 3);
  ctx.fillStyle = style.band[0];
  ctx.fillRect(x, y + 7, w, 1);
}

/** A wall/pillar: a solid column with a shaded edge. */
function drawWall(ctx, wl, style) {
  const x = wl.x * CELL, y = wl.y0 * CELL, h = (wl.y1 - wl.y0) * CELL;
  ctx.fillStyle = style.wall;
  ctx.fillRect(x, y, CELL, h);
  ctx.fillStyle = "rgba(0,0,0,0.45)";
  ctx.fillRect(x + CELL - 2, y, 2, h);
  ctx.fillStyle = "rgba(255,255,255,0.18)";
  ctx.fillRect(x, y, 1, h);
  ctx.fillStyle = C.black;
  for (let i = y + 4; i < y + h; i += 8) ctx.fillRect(x, i, CELL, 1);
}

/** A grav-lift shaft: the magnetic column Dan rides between floors. */
function drawLift(ctx, l, phase) {
  const x = l.x * CELL, y = l.y0 * CELL, h = (l.y1 - l.y0) * CELL;
  ctx.fillStyle = C.black;
  ctx.fillRect(x + 1, y, CELL - 2, h);
  ctx.fillStyle = C.green;
  ctx.fillRect(x + 1, y, 2, h);
  ctx.fillRect(x + CELL - 3, y, 2, h);
  ctx.fillStyle = C.bgreen;
  for (let i = 0; i < h; i += 4) {
    const yy = y + ((i + Math.floor(phase)) % h);
    ctx.fillRect(x + 3, yy, 2, 2);
  }
}

function drawRoom(ctx, level, key, room, phase) {
  const style = sectorStyle(level, room);
  if (style.back === C.black) drawStarfield(ctx, key);
  else drawBackWall(ctx, key, style);
  for (const w of room.walls) drawWall(ctx, w, style);
  for (const l of room.lifts) drawLift(ctx, l, phase);
  for (const p of room.platforms) drawPlatform(ctx, p, style);
}

// --------------------------------------------------------------- text / chrome

// 4x6 pixel font: each glyph is 6 hex nibbles, one per row, bits 8..1 = the
// four columns left to right.
const GLYPHS = {
  A: "699f99", B: "e9e99e", C: "788887", D: "e9999e", E: "f8e88f",
  F: "f8e888", G: "788b97", H: "99f999", I: "722227", J: "311196",
  K: "9acca9", L: "88888f", M: "9ff999", N: "9ddbb9", O: "699996",
  P: "e9e888", Q: "699ba7", R: "e9eca9", S: "78611e", T: "f44444",
  U: "999996", V: "999662", W: "999ff9", X: "996699", Y: "996444",
  Z: "f1248f",
  "0": "699996", "1": "262227", "2": "69124f", "3": "e1611e", "4": "99f111",
  "5": "f8e11e", "6": "68e996", "7": "f12244", "8": "696996", "9": "699716",
  ".": "000004", ",": "000044", ":": "004004", "!": "444404", "?": "691202",
  "'": "440000", "-": "00f000", "*": "0a4a00", "/": "012480",
  "(": "248842", ")": "842248", "+": "04f400",
};

/** Compact 4x6 uppercase font drawn a pixel at a time. */
function drawText(ctx, text, x, y, colour) {
  ctx.fillStyle = colour;
  let cx = x;
  for (const ch of text.toUpperCase()) {
    if (ch === " ") { cx += 4; continue; }
    const g = GLYPHS[ch];
    if (g) {
      for (let row = 0; row < 6; row++) {
        const bits = parseInt(g[row], 16);
        if (!bits) continue;
        for (let b = 0; b < 4; b++) {
          if (bits & (8 >> b)) ctx.fillRect(cx + b, y + row, 1, 1);
        }
      }
    } else {
      ctx.fillRect(cx, y + 5, 3, 1);
    }
    cx += 5;
  }
  return cx - x;
}

function textWidth(text) {
  let w = 0;
  for (const ch of text) w += ch === " " ? 4 : 5;
  return w;
}

/** The narration boxes the original pops up over the play area. */
function drawMessage(ctx, lines, atTop) {
  if (!lines || !lines.length) return;
  const w = Math.max(...lines.map(textWidth)) + 8;
  const h = lines.length * 8 + 6;
  const x = 2, y = atTop ? 2 : VIEW_H - h - 2;
  ctx.fillStyle = C.white;
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = C.black;
  ctx.fillRect(x + 1, y + 1, w - 2, h - 2);
  ctx.fillStyle = C.white;
  ctx.fillRect(x + 2, y + 2, w - 4, h - 4);
  lines.forEach((ln, i) => drawText(ctx, ln, x + 4, y + 4 + i * 8, C.black));
}

function two(n) { return (n < 10 ? "0" : "") + n; }

function formatClock(seconds) {
  const s = Math.max(0, Math.floor(seconds));
  return two(Math.floor(s / 3600)) + "." + two(Math.floor(s / 60) % 60) + "." + two(s % 60);
}

/** Status panel: countdown, energy gauge, score and the viewer window. */
function drawPanel(ctx, state) {
  const px = 6, py = 158, pw = SCREEN_W - 12, ph = 30;
  ctx.fillStyle = C.white;
  ctx.fillRect(px - 2, py - 2, pw + 4, ph + 4);
  ctx.fillStyle = C.black;
  ctx.fillRect(px - 1, py - 1, pw + 2, ph + 2);
  ctx.fillStyle = C.red;
  ctx.fillRect(px, py, pw, ph);

  drawText(ctx, formatClock(state.timeLeft), px + 6, py + 4, C.byellow);

  // energy gauge, drawn as a ruler like the original's
  const gx = px + 6, gy = py + 14, gw = 84, gh = 6;
  ctx.fillStyle = C.black;
  ctx.fillRect(gx - 1, gy - 1, gw + 2, gh + 2);
  const fill = Math.max(0, Math.min(1, state.energy / state.energyMax));
  ctx.fillStyle = fill > 0.3 ? C.byellow : C.bred;
  ctx.fillRect(gx, gy, Math.round(gw * fill), gh);
  ctx.fillStyle = C.black;
  for (let i = 0; i <= gw; i += 6) ctx.fillRect(gx + i, gy + gh - 3, 1, 3);

  drawText(ctx, "SCORE " + state.score, px + 104, py + 4, C.bwhite);
  drawText(ctx, "KEYS " + state.keys + " OF 5", px + 104, py + 14, C.bcyan);

  // viewer window at the right: the asteroid, or the Mekon when he taunts you
  const vx = SCREEN_W - 44, vy = py + 2, vs = 26;
  ctx.fillStyle = C.white;
  ctx.fillRect(vx - 1, vy - 1, vs + 2, vs + 2);
  ctx.fillStyle = C.black;
  ctx.fillRect(vx, vy, vs, vs);
  if (state.viewer === "mekon") {
    ctx.fillStyle = C.bgreen;
    ctx.beginPath();
    ctx.ellipse(vx + vs / 2, vy + 11, 9, 8, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = C.black;
    ctx.fillRect(vx + 8, vy + 10, 2, 2);
    ctx.fillRect(vx + 16, vy + 10, 2, 2);
    ctx.fillStyle = C.green;
    ctx.fillRect(vx + 9, vy + 19, 8, 5);
  } else {
    const r = rng(0x1234);
    ctx.fillStyle = C.white;
    for (let i = 0; i < 18; i++) {
      ctx.fillRect(vx + Math.floor(r() * vs), vy + Math.floor(r() * vs), 1, 1);
    }
    ctx.fillStyle = C.bcyan;
    ctx.beginPath();
    ctx.arc(vx + vs / 2, vy + vs / 2, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = C.cyan;
    ctx.fillRect(vx + vs / 2 - 7, vy + vs / 2 + 1, 14, 3);
  }
}

/** White frame around the play window. */
function drawFrame(ctx) {
  ctx.fillStyle = C.white;
  ctx.fillRect(VIEW_X - 2, VIEW_Y - 2, VIEW_W + 4, VIEW_H + 4);
  ctx.fillStyle = C.black;
  ctx.fillRect(VIEW_X - 1, VIEW_Y - 1, VIEW_W + 2, VIEW_H + 2);
}
