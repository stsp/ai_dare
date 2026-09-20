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
// the Spectrum's colours by number, as the original's attribute bytes name them
const PALETTE = [C.black, C.blue, C.red, C.magenta, C.green, C.cyan, C.yellow, C.white];

// Sector palettes, keyed by the colour signature the extractor found in each
// screen's floor band, so each area keeps the tint it has on the map.
// `solid` is the dark body of walls and machinery, `wall` the lit edge on a
// ledge, `band` the two courses of a ceiling or floor stripe.
const DARK = "#00696e", DARKER = "#004a52";
const SECTOR_STYLE = {
  "cyan": { band: [C.cyan, C.white], wall: C.cyan, solid: DARKER, back: C.black, rail: C.bcyan, name: "LANDING ZONE" },
  "cyan,white": { band: [C.cyan, C.white], wall: C.cyan, solid: DARK, back: C.blue, rail: C.bgreen, name: "SECTOR 1" },
  "cyan,red": { band: [C.red, C.cyan], wall: C.cyan, solid: DARK, back: C.blue, rail: C.bgreen, name: "SECTOR 2" },
  "magenta,white": { band: [C.magenta, C.white], wall: C.cyan, solid: DARK, back: C.blue, rail: C.bcyan, name: "SECTOR 3" },
  "cyan,green": { band: [C.green, C.cyan], wall: C.cyan, solid: DARK, back: C.blue, rail: C.bgreen, name: "SECTOR 4" },
  "cyan,yellow": { band: [C.yellow, C.cyan], wall: C.cyan, solid: DARK, back: C.blue, rail: C.bgreen, name: "SECTOR 5" },
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

/* Rooms are drawn from the per-cell classes the extractor read off the map,
   so every screen keeps the shape the original has - ceiling and floor bands,
   walkways, pillars, machinery - coloured by the sector it belongs to. */
const CELL_EMPTY = 0, CELL_DECOR = 1, CELL_RAIL = 2, CELL_BAND = 3, CELL_WALL = 4, CELL_FIELD = 5;

/** A striped band: the ceiling and floor courses that top and tail each room. */
function drawBandCell(ctx, x, y, style) {
  ctx.fillStyle = style.band[0];
  ctx.fillRect(x, y, CELL, CELL);
  ctx.fillStyle = C.black;
  ctx.fillRect(x, y + 3, CELL, 1);
  ctx.fillRect(x + 7, y, 1, CELL);
  ctx.fillStyle = style.band[1];
  ctx.fillRect(x + 1, y + 4, 6, 3);
  ctx.fillStyle = C.black;
  ctx.fillRect(x + 3, y + 5, 2, 2);
}

/* Structure recedes: the room's back wall and the figures moving in front of
   it should carry the picture, so walls, pillars and machinery are drawn dark
   with only their lit top edge picked out. Scenery Ai walks in front of is
   drawn a shade darker again than the walls that stop him. */
function drawSolidCell(ctx, x, y, style, covered, scenery) {
  ctx.fillStyle = style.solid;
  ctx.fillRect(x, y, CELL, CELL);
  ctx.fillStyle = scenery ? "rgba(0,0,0,0.35)" : "rgba(0,0,0,0.55)";
  if (scenery) ctx.fillRect(x, y, CELL, CELL);
  ctx.fillStyle = "rgba(0,0,0,0.55)";
  ctx.fillRect(x + CELL - 1, y, 1, CELL);
  ctx.fillRect(x, y + CELL - 1, CELL, 1);
  if (!covered && !scenery) {        // a ledge Ai can stand on: light the lip
    ctx.fillStyle = style.wall;
    ctx.fillRect(x, y, CELL, 2);
    ctx.fillStyle = C.bwhite;
    ctx.fillRect(x, y, CELL, 1);
  }
}

/* A grav-lift, drawn as the game draws it: two dotted rails with the field
   between them, and a charge running along the rails. */
function drawRailCell(ctx, x, y, style, phase) {
  ctx.fillStyle = style.rail;
  for (let j = 0; j < CELL; j += 2) {
    ctx.fillRect(x + 1, y + j, 1, 1);
    ctx.fillRect(x + 4, y + j, 3, 1);
  }
  const off = (Math.floor(phase * 12) + y) % 32;
  if (off < 4) {
    ctx.fillStyle = C.bwhite;
    ctx.fillRect(x + 1, y + off, 1, 1);
    ctx.fillRect(x + 4, y + off, 3, 1);
  }
}

function drawFieldCell(ctx, x, y) {
  ctx.fillStyle = "rgba(0,0,0,0.35)";
  ctx.fillRect(x, y, CELL, CELL);
}

/** The room as the original shows it: its screen, cleaned, from
 *  assets/rooms.png. False until the sheet is loaded or for a room it lacks. */
function drawBackdrop(ctx, key) {
  const s = SHEETS.rooms;
  if (!s || !s.meta || !s.meta.rooms[key]) return false;
  const [sx, sy] = s.meta.rooms[key];
  ctx.drawImage(s.img, sx, sy, s.meta.w, s.meta.h, 0, 0, s.meta.w, s.meta.h);
  return true;
}

function drawRoom(ctx, level, key, room, phase) {
  const style = sectorStyle(level, room);
  const W = level.room.w, H = level.room.h;
  const cells = room.cells;
  if (style.back === C.black) drawStarfield(ctx, key);
  else drawBackWall(ctx, key, style);

  for (let j = 0; j < H; j++) {
    for (let i = 0; i < W; i++) {
      const v = cells.charCodeAt(j * W + i) - 48;
      if (v === CELL_EMPTY) continue;
      const x = i * CELL, y = j * CELL;
      if (v === CELL_BAND) {
        drawBandCell(ctx, x, y, style);
      } else if (v === CELL_RAIL) {
        drawRailCell(ctx, x, y, style, phase);
      } else if (v === CELL_FIELD) {
        drawFieldCell(ctx, x, y);
      } else {
        const above = j > 0 ? cells.charCodeAt((j - 1) * W + i) - 48 : CELL_EMPTY;
        drawSolidCell(ctx, x, y, style, above === CELL_WALL || above === CELL_BAND, v === CELL_DECOR);
      }
    }
  }
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
  "(": "248842", ")": "842248", "+": "04f400", "©": "69b960",
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
function drawMessage(ctx, lines, atTop, flash) {
  if (!lines || !lines.length) return;
  const w = Math.max(...lines.map(textWidth)) + 8;
  const h = lines.length * 8 + 6;
  const x = 2, y = atTop ? 2 : VIEW_H - h - 2;
  ctx.fillStyle = C.white;
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = C.black;
  ctx.fillRect(x + 1, y + 1, w - 2, h - 2);
  ctx.fillStyle = flash ? [C.byellow, C.white, C.white, C.bblue][Math.floor(state.phase * 6) % 4] : C.white;
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

  drawText(ctx, tx(["SCORE #"], state.score)[0], px + 104, py + 4, C.bwhite);
  drawText(ctx, tx(["PARTS # OF 5"], state.fitted)[0] + (state.carrying ? " +1" : ""), px + 104, py + 14, C.bcyan);

  // viewer window at the right: the asteroid, or the alien boss when he taunts you
  const vx = SCREEN_W - 44, vy = py + 2, vs = 26;
  ctx.fillStyle = C.white;
  ctx.fillRect(vx - 1, vy - 1, vs + 2, vs + 2);
  ctx.fillStyle = C.black;
  ctx.fillRect(vx, vy, vs, vs);
  if (state.viewer === "boss" && state.viewerStatic > 0) {
    // the link locking on: bars of interference
    for (let j = 0; j < vs; j += 3) {
      ctx.fillStyle = (Math.floor(state.phase * 40) + j) % 6 < 3 ? C.white : C.black;
      ctx.fillRect(vx, vy + j, vs, 2);
    }
  } else if (state.viewer === "boss") {
    ctx.save();
    ctx.beginPath(); ctx.rect(vx, vy, vs, vs); ctx.clip();
    ctx.fillStyle = "#0a1a2a";
    ctx.fillRect(vx, vy, vs, vs);
    drawBossHead(ctx, vx, vy + 1, vs, state.phase * 6);
    ctx.fillStyle = "rgba(255,255,255,0.08)";           // the link's scan lines
    for (let j = 0; j < vs; j += 2) ctx.fillRect(vx, vy + j, vs, 1);
    ctx.restore();
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
