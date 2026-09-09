"use strict";
/* Sprite bitmaps, drawn for this project (not taken from the original game).
   '.' transparent, 'X' main colour, 'o' shade, 'w' highlight. */

const SPR = {};

function defineSprite(name, rows) {
  SPR[name] = { w: rows[0].length, h: rows.length, rows };
}

// --- Dan: 10 x 18, flight suit with a helmet and a hand laser ---
defineSprite("dan_stand", [
  "...wwww...",
  "..wXXXXw..",
  "..woooXw..",
  "..wXXXXw..",
  "...XXXX...",
  "..XXXXXX..",
  ".XXXXXXXX.",
  "oXXXXXXXXo",
  "oXXXXXXXXo",
  ".XXXXXXXX.",
  "..XXXXXX..",
  "...XXXX...",
  "...XX.XX..",
  "...XX.XX..",
  "...XX.XX..",
  "..oXX.XXo.",
  "..oXX.XXo.",
  ".ooo...ooo",
]);

defineSprite("dan_run1", [
  "...wwww...",
  "..wXXXXw..",
  "..woooXw..",
  "..wXXXXw..",
  "...XXXX...",
  "..XXXXXX..",
  "oXXXXXXXX.",
  "oXXXXXXXXo",
  ".XXXXXXXXo",
  "..XXXXXXX.",
  "..XXXXXX..",
  "...XXXX...",
  "..XXX.XX..",
  ".XXX...XX.",
  ".XX....XXo",
  "oXX.....XX",
  "oX......XX",
  "oo.......o",
]);

defineSprite("dan_run2", [
  "...wwww...",
  "..wXXXXw..",
  "..woooXw..",
  "..wXXXXw..",
  "...XXXX...",
  "..XXXXXX..",
  ".XXXXXXXXo",
  "oXXXXXXXXo",
  "oXXXXXXXX.",
  ".XXXXXXX..",
  "..XXXXXX..",
  "...XXXX...",
  "...XXXX...",
  "...XXXX...",
  "..XXX.XX..",
  "..XX..XX..",
  ".oXX..XXo.",
  ".oo....oo.",
]);

defineSprite("dan_jump", [
  "...wwww...",
  "..wXXXXw..",
  "..woooXw..",
  "..wXXXXw..",
  "...XXXX...",
  "XXXXXXXXXX",
  "XXXXXXXXXX",
  ".XXXXXXXX.",
  ".XXXXXXXX.",
  "..XXXXXX..",
  "..XXXXXX..",
  "..XXXXXX..",
  ".XXX..XXX.",
  ".XX....XX.",
  "oXX....XXo",
  "oX......Xo",
  "..........",
  "..........",
]);

defineSprite("dan_kneel", [
  "..........",
  "..........",
  "..........",
  "..........",
  "...wwww...",
  "..wXXXXw..",
  "..woooXw..",
  "..wXXXXw..",
  "...XXXX...",
  "..XXXXXX..",
  ".XXXXXXXX.",
  "oXXXXXXXXo",
  "oXXXXXXXX.",
  ".XXXXXXX..",
  "..XXXXX...",
  "..XXXXXX..",
  ".oXX..XXo.",
  ".ooo...oo.",
]);

// --- Treen: 10 x 18, the Mekon's green guards ---
defineSprite("treen_stand", [
  "..wwwww...",
  ".wXXXXXw..",
  ".wXoooXw..",
  ".wXXXXXw..",
  "..wXXXw...",
  "...XXX....",
  "..XXXXX...",
  ".XXXXXXX..",
  "oXXXXXXXo.",
  "oXXXXXXXo.",
  ".XXXXXXX..",
  "..XXXXX...",
  "..XX.XX...",
  "..XX.XX...",
  "..XX.XX...",
  ".oXX.XXo..",
  ".oXX.XXo..",
  ".oo...oo..",
]);

defineSprite("treen_walk", [
  "..wwwww...",
  ".wXXXXXw..",
  ".wXoooXw..",
  ".wXXXXXw..",
  "..wXXXw...",
  "...XXX....",
  "..XXXXX...",
  ".XXXXXXXo.",
  "oXXXXXXXo.",
  "oXXXXXXX..",
  ".XXXXXXX..",
  "..XXXXX...",
  "..XXXXX...",
  ".XXX.XX...",
  ".XX...XX..",
  "oXX...XXo.",
  "oX.....Xo.",
  "oo.....oo.",
]);

// --- pickups ---
defineSprite("key", [
  "..XXXX..",
  ".XwwwwX.",
  "XwXXXXwX",
  "XwXooXwX",
  "XwXXXXwX",
  ".XwwwwX.",
  "..X..X..",
  "..XXXX..",
]);

defineSprite("energy", [
  "..XXXX..",
  ".XwwwwX.",
  "XwoooowX",
  "XwoXXowX",
  "XwoXXowX",
  "XwoooowX",
  ".XwwwwX.",
  "..XXXX..",
]);

/** Draw a sprite. `flip` mirrors horizontally. */
function drawSprite(ctx, name, x, y, colours, flip) {
  const s = SPR[name];
  if (!s) return;
  const { rows, w, h } = s;
  for (let j = 0; j < h; j++) {
    const row = rows[j];
    for (let i = 0; i < w; i++) {
      const ch = row[i];
      if (ch === ".") continue;
      const col = ch === "X" ? colours.main : ch === "o" ? colours.shade : colours.light;
      if (!col) continue;
      ctx.fillStyle = col;
      ctx.fillRect(x + (flip ? w - 1 - i : i), y + j, 1, 1);
    }
  }
}

function spriteSize(name) {
  const s = SPR[name];
  return s ? { w: s.w, h: s.h } : { w: 0, h: 0 };
}
