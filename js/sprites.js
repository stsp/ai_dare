"use strict";
/* Sprite bitmaps, drawn for this project.
   '.' transparent   'X' body   'o' shade   'w' highlight

   Dan is a running man in a flight suit, 14x20, matching the proportions and
   poses of the original's figure: upright stand, a four-phase run with the
   arms counter-swinging, a tucked jump, and a low kneel for firing under fire.
   The Treens are a squatter, heavier silhouette so they read differently at a
   glance even when both are a single colour. */

const SPR = {};
function defineSprite(name, rows) { SPR[name] = { w: rows[0].length, h: rows.length, rows }; }

// ------------------------------------------------------------------ Dan 14x20

defineSprite("dan_stand", [
  ".....wwww.....",
  "....wXXXXw....",
  "....wXooXw....",
  "....wXXXXw....",
  ".....XXXX.....",
  "...XXXXXXXX...",
  "..XX.XXXX.XX..",
  "..X..XXXX..X..",
  "..X..XXXX..X..",
  ".....XXXX.....",
  ".....XXXX.....",
  "....XXXXXX....",
  "....XX..XX....",
  "....XX..XX....",
  "....XX..XX....",
  "....XX..XX....",
  "...XXX..XXX...",
  "...XX....XX...",
  "..oXXX..XXXo..",
  "..ooo....ooo..",
]);

defineSprite("dan_run1", [
  ".....wwww.....",
  "....wXXXXw....",
  "....wXooXw....",
  "....wXXXXw....",
  ".....XXXX.....",
  "..XXXXXXXX....",
  ".XX..XXXX.XX..",
  ".X...XXXX..XX.",
  ".....XXXX...XX",
  ".....XXXX.....",
  ".....XXXX.....",
  "....XXXXXX....",
  "...XXX..XXX...",
  "..XXX....XXX..",
  "..XX......XXX.",
  ".XX........XX.",
  ".XX........XX.",
  "XXX.........XX",
  "XX...........o",
  ".oo...........",
]);

defineSprite("dan_run2", [
  ".....wwww.....",
  "....wXXXXw....",
  "....wXooXw....",
  "....wXXXXw....",
  ".....XXXX.....",
  "....XXXXXX....",
  "...XXXXXXXX...",
  "..XX.XXXX.XX..",
  "..X..XXXX..X..",
  ".....XXXX.....",
  ".....XXXX.....",
  "....XXXXXX....",
  "....XXXXXX....",
  "....XX.XXX....",
  "...XXX..XX....",
  "...XX...XXX...",
  "..XXX....XX...",
  "..XX.....XXX..",
  ".oXX......XXo.",
  ".oo........oo.",
]);

defineSprite("dan_run3", [
  ".....wwww.....",
  "....wXXXXw....",
  "....wXooXw....",
  "....wXXXXw....",
  ".....XXXX.....",
  "....XXXXXXX...",
  "..XX.XXXX.XX..",
  ".XX..XXXX..XX.",
  "XX...XXXX...X.",
  ".....XXXX.....",
  ".....XXXX.....",
  "....XXXXXX....",
  "...XXX..XXX...",
  "..XXX....XXX..",
  ".XXX......XXX.",
  ".XX........XX.",
  "XX.........XXX",
  "XX..........XX",
  "o............o",
  "..............",
]);

defineSprite("dan_run4", [
  ".....wwww.....",
  "....wXXXXw....",
  "....wXooXw....",
  "....wXXXXw....",
  ".....XXXX.....",
  "....XXXXXX....",
  "...XXXXXXXX...",
  "..XX.XXXX.XX..",
  "..X..XXXX..X..",
  ".....XXXX.....",
  ".....XXXX.....",
  "....XXXXXX....",
  "....XXXXXX....",
  "....XXX.XX....",
  "....XX..XXX...",
  "...XXX...XX...",
  "...XX....XXX..",
  "..XXX.....XX..",
  ".oXX......XXo.",
  ".oo........oo.",
]);

defineSprite("dan_jump", [
  ".....wwww.....",
  "....wXXXXw....",
  "....wXooXw....",
  "....wXXXXw....",
  ".....XXXX.....",
  "XX..XXXXXX....",
  ".XX.XXXXXX.XX.",
  "..XXXXXXXXXX..",
  "....XXXXXX..XX",
  ".....XXXX.....",
  ".....XXXX.....",
  "....XXXXXX....",
  "...XXX..XXX...",
  "..XXX....XXX..",
  ".XXX......XX..",
  ".XX.......XX..",
  "XX.........XX.",
  "XX..........XX",
  ".o...........o",
  "..............",
]);

defineSprite("dan_kneel", [
  "..............",
  "..............",
  "..............",
  "..............",
  ".....wwww.....",
  "....wXXXXw....",
  "....wXooXw....",
  "....wXXXXw....",
  ".....XXXX.....",
  "..XXXXXXXX....",
  ".XX..XXXX.XX..",
  ".X...XXXX..XXX",
  ".....XXXXX....",
  "....XXXXXX....",
  "...XXX..XXX...",
  "..XXX....XXX..",
  "..XX......XX..",
  ".XXX.......XX.",
  ".XXXXX.....XX.",
  "..ooooo....oo.",
]);

// ---------------------------------------------------------------- Treen 14x20

defineSprite("treen_stand", [
  "...wwwwww.....",
  "..wXXXXXXw....",
  "..wXoXXoXw....",
  "..wXXXXXXw....",
  "...wXXXXw.....",
  "....XXXX......",
  "..XXXXXXXX....",
  ".XX.XXXXXX....",
  ".X..XXXXXX.X..",
  "....XXXXXXXX..",
  "....XXXXXX....",
  "....XXXXXX....",
  "....XX..XX....",
  "....XX..XX....",
  "...XXX..XXX...",
  "...XX....XX...",
  "..XXX....XXX..",
  "..XX......XX..",
  ".oXX......XXo.",
  ".ooo......ooo.",
]);

defineSprite("treen_walk", [
  "...wwwwww.....",
  "..wXXXXXXw....",
  "..wXoXXoXw....",
  "..wXXXXXXw....",
  "...wXXXXw.....",
  "....XXXX......",
  "...XXXXXXX....",
  "..XXXXXXXXX...",
  ".XX.XXXXXX.XX.",
  "....XXXXXX....",
  "....XXXXXX....",
  "....XXXXXX....",
  "....XXXXXX....",
  "...XXX.XXX....",
  "..XXX...XXX...",
  "..XX.....XX...",
  ".XXX.....XXX..",
  ".XX.......XX..",
  "oXX.......XXo.",
  "oo.........oo.",
]);

// -------------------------------------------------------------------- objects

defineSprite("key", [
  "...XXXX...",
  "..XwwwwX..",
  ".XwXXXXwX.",
  ".XwXooXwX.",
  ".XwXXXXwX.",
  "..XwwwwX..",
  "...XwwX...",
  "...XwwXXX.",
  "...XwwX.X.",
  "...XXXX.X.",
]);

defineSprite("energy", [
  "...XXXX...",
  "..XwwwwX..",
  ".XwoooowX.",
  "XwooXXoowX",
  "XwoXXXXowX",
  "XwooXXoowX",
  ".XwoooowX.",
  "..XwwwwX..",
  "...XXXX...",
  "..........",
]);

/** Draw a sprite a pixel at a time. `flip` mirrors it horizontally. */
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
