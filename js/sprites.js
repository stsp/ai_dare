"use strict";
/* Sprite bitmaps, drawn for this project.
   '.' transparent   'X' body   'o' shade   'w' highlight

   Dan is a running man in a flight suit, 14x22, matching the proportions and
   poses of the original's figure: upright stand, a four-phase run with the
   arms counter-swinging, a tucked jump, and a low kneel for firing under fire.
   The Treens are a squatter, heavier silhouette so they read differently at a
   glance even when both are a single colour. */

const SPR = {};
function defineSprite(name, rows) { SPR[name] = { w: rows[0].length, h: rows.length, rows }; }

// ------------------------------------------------------------------ Dan 14x22

defineSprite("dan_stand", [
  ".....XXXX.....",
  "....XXXXXX....",
  "....XooooX....",
  "....XXXXXX....",
  ".....XXXX.....",
  "....XXXXXX....",
  "...XXXXXXXX...",
  "..XX.XXXX.XX..",
  "..XX.XXXX.XX..",
  "..XX.XoXX.XX..",
  ".....XXXX.....",
  ".....XXXX.....",
  "....XXXXXX....",
  "....XX..XX....",
  "....XX..XX....",
  "....XX..XX....",
  "....XX..XX....",
  "....XX..XX....",
  "...XXX..XXX...",
  "...XXX..XXX...",
  "..XXXX..XXXX..",
  "..............",
]);

defineSprite("dan_run1", [
  ".....XXXX.....",
  "....XXXXXX....",
  "....XooooX....",
  "....XXXXXX....",
  ".....XXXX.....",
  "...XXXXXXX....",
  "..XXXXXXXXX...",
  ".XX..XXXX.XXX.",
  "XX...XXXX...XX",
  "X....XoXX.....",
  ".....XXXX.....",
  ".....XXXX.....",
  "....XXXXXX....",
  "...XXX..XXX...",
  "..XXX....XXX..",
  "..XX......XXX.",
  ".XX........XX.",
  ".XX........XXX",
  "XXX.........XX",
  "XX...........X",
  "XX............",
  "..............",
]);

defineSprite("dan_run2", [
  ".....XXXX.....",
  "....XXXXXX....",
  "....XooooX....",
  "....XXXXXX....",
  ".....XXXX.....",
  "....XXXXXX....",
  "...XXXXXXXX...",
  "..XXXXXXXXXX..",
  "..X..XXXX..X..",
  ".....XoXX.....",
  ".....XXXX.....",
  ".....XXXX.....",
  "....XXXXXX....",
  "....XXXXXX....",
  "....XX.XXX....",
  "...XXX..XX....",
  "...XX...XXX...",
  "..XXX....XX...",
  "..XX......XX..",
  ".XXX......XXX.",
  "..............",
  "..............",
]);

defineSprite("dan_run3", [
  ".....XXXX.....",
  "....XXXXXX....",
  "....XooooX....",
  "....XXXXXX....",
  ".....XXXX.....",
  "....XXXXXXX...",
  "...XXXXXXXXX..",
  ".XXX.XXXX..XX.",
  "XX...XXXX...XX",
  ".....XoXX....X",
  ".....XXXX.....",
  ".....XXXX.....",
  "....XXXXXX....",
  "...XXX..XXX...",
  "..XXX....XXX..",
  ".XXX......XX..",
  ".XX.......XXX.",
  "XXX........XX.",
  "XX.........XXX",
  "X...........XX",
  "............XX",
  "..............",
]);

defineSprite("dan_run4", [
  ".....XXXX.....",
  "....XXXXXX....",
  "....XooooX....",
  "....XXXXXX....",
  ".....XXXX.....",
  "....XXXXXX....",
  "...XXXXXXXX...",
  "..XXXXXXXXXX..",
  "..X..XXXX..X..",
  ".....XoXX.....",
  ".....XXXX.....",
  ".....XXXX.....",
  "....XXXXXX....",
  "....XXXXXX....",
  "....XXX.XX....",
  "....XX..XXX...",
  "...XXX...XX...",
  "...XX....XXX..",
  "..XXX.....XX..",
  ".XXX......XXX.",
  "..............",
  "..............",
]);

defineSprite("dan_jump", [
  ".....XXXX.....",
  "....XXXXXX....",
  "....XooooX....",
  "....XXXXXX....",
  ".....XXXX.....",
  "XX..XXXXXX..XX",
  ".XXXXXXXXXXXX.",
  "..XXXXXXXXXX..",
  ".....XXXX.....",
  ".....XoXX.....",
  ".....XXXX.....",
  "....XXXXXX....",
  "...XXX..XXX...",
  "..XXX....XXX..",
  ".XXX......XX..",
  ".XX.......XXX.",
  "XX.........XX.",
  "XX..........XX",
  "X............X",
  "..............",
  "..............",
  "..............",
]);

defineSprite("dan_kneel", [
  "..............",
  "..............",
  "..............",
  "..............",
  "..............",
  "..............",
  "..............",
  ".....XXXX.....",
  "....XXXXXX....",
  "....XooooX....",
  "....XXXXXX....",
  ".....XXXX.....",
  "...XXXXXXX....",
  "..XXXXXXXXXXX.",
  "..X..XXXX..XXX",
  ".....XoXXX....",
  "....XXXXXXX...",
  "...XXX...XXX..",
  "..XXX.....XXX.",
  ".XXX.......XX.",
  ".XXXXX.....XX.",
  ".XXXXX....XXX.",
]);

// ---------------------------------------------------------------- Treen 14x22

defineSprite("treen_stand", [
  "....XXXXXX....",
  "...XXXXXXXX...",
  "...XXXXXXXX...",
  "...XXoXXoXX...",
  "...XXXXXXXX...",
  "....XXXXXX....",
  ".....XXXX.....",
  "..XXXXXXXXXX..",
  ".XXXXXXXXXXXX.",
  ".XXX.XXXXXXXX.",
  ".XX..XXXXXoooo",
  ".....XXXXXXooo",
  "....XXXXXXXX..",
  "....XXXXXXXX..",
  "....XXX.XXX...",
  "....XXX.XXX...",
  "....XX...XX...",
  "....XX...XX...",
  "...XXX...XXX..",
  "...XXX...XXX..",
  "..XXXX...XXXX.",
  "..............",
]);

defineSprite("treen_walk", [
  "....XXXXXX....",
  "...XXXXXXXX...",
  "...XXXXXXXX...",
  "...XXoXXoXX...",
  "...XXXXXXXX...",
  "....XXXXXX....",
  ".....XXXX.....",
  "..XXXXXXXXXX..",
  ".XXXXXXXXXXXX.",
  ".XXX.XXXXXXXX.",
  ".XX..XXXXXoooo",
  ".....XXXXXXooo",
  "....XXXXXXXX..",
  "....XXXXXXXX..",
  "...XXXX.XXXX..",
  "..XXX....XXX..",
  "..XX......XX..",
  ".XXX......XXX.",
  ".XX........XX.",
  "XXX........XXX",
  "XX..........XX",
  "..............",
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
