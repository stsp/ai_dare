"use strict";
/* Sprite bitmaps, drawn for this project.
   '.' transparent   'X' body   'o' shade   'w' highlight

   Dan is 18x32: a uniformed pilot in a peaked cap, rifle held forward, matching the proportions and
   poses of the original's figure: upright stand, a four-phase run with the
   arms counter-swinging, a tucked jump, and a low kneel for firing under fire.
   The Treens are guards with Dan's own silhouette - rifle forward, as the game
   draws them - told apart by a rounded helmet and their colour. The boss is a
   great-headed figure seated on a floating bowl, an original design. */

const SPR = {};
function defineSprite(name, rows) { SPR[name] = { w: rows[0].length, h: rows.length, rows }; }

// ------------------------------------------------------- drawn frames (PNG)

/* Dan's frames are illustrations, not bitmaps: assets/dan.png, built by
   tools/make_sprites.py from the renders in the repository root, packed at
   the canvas scale so they draw 1:1 with no resampling. js/dan_sheet.js says
   where each frame sits and where Dan's body is within it, so the hit box is
   centred on him rather than on the rifle he holds out in front. */
const SHEETS = {};
function loadSheet(name, meta) {
  if (!meta) return;
  const img = new Image();
  img.onload = () => { SHEETS[name] = { img, meta }; };
  img.src = meta.image;
}
loadSheet("dan", window.DAN_SHEET);

/** Draw a sheet frame with its feet on the floor of the hit box (bx, by, bw,
 *  bh) and its body over the box's centre. Returns false while the sheet is
 *  still loading, so the caller can fall back to a bitmap. */
function drawSheetFrame(ctx, sheet, frame, bx, by, bw, bh, flip) {
  const s = SHEETS[sheet];
  const fr = s && s.meta.frames[frame];
  if (!fr) return false;
  const k = s.meta.scale;
  const w = fr.w / k, h = fr.h / k;
  const x = bx + bw / 2 - fr.cx, y = by + bh - h;
  ctx.save();
  if (flip) {                      // mirror about the hit box's centre line
    ctx.translate(2 * bx + bw, 0);
    ctx.scale(-1, 1);
  }
  ctx.drawImage(s.img, fr.x, fr.y, fr.w, fr.h, x, y, w, h);
  ctx.restore();
  return true;
}

// ------------------------------------------------------------------ Dan 18x32

defineSprite("dan_stand", [
  "......XXXXXX......",
  ".....XXXXXXXX.....",
  ".....XXXXXXXX.....",
  "....XXXXXXXXXXXXX.",
  ".....XXXXXXXXo....",
  "......XXXXXXX.....",
  "......XXX.XXXX....",
  "......XXXXXXXX....",
  ".......XXXXXX.....",
  "........XXXX......",
  ".....XXXXXXXXX....",
  "....XXXXXXXXXXX...",
  "....XXXXXXXXXXXX..",
  "....XXXXX.XXXXXXX.",
  "....XXXXX..XXXXXXX",
  "....XXXXX..XXooooo",
  "....XXXXX.XXXXooo.",
  "....XXXXXXXXXX....",
  "....XXXooXXXXX....",
  ".....XXXXXXXXX....",
  ".....XXXXXXXXX....",
  ".....XXXX.XXXX....",
  ".....XXXX.XXXX....",
  ".....XXXX.XXXX....",
  ".....XXX...XXX....",
  ".....XXX...XXX....",
  ".....XXX...XXX....",
  ".....XXX...XXX....",
  ".....XXX...XXX....",
  "....XXXX...XXXX...",
  "...XXXXX...XXXXX..",
  "...ooooo...ooooo..",
]);

defineSprite("dan_run1", [
  "......XXXXXX......",
  ".....XXXXXXXX.....",
  ".....XXXXXXXX.....",
  "....XXXXXXXXXXXXX.",
  ".....XXXXXXXXo....",
  "......XXXXXXX.....",
  "......XXX.XXXX....",
  "......XXXXXXXX....",
  ".......XXXXXX.....",
  "........XXXX......",
  ".....XXXXXXXXX....",
  "....XXXXXXXXXXX...",
  "....XXXXXXXXXXXX..",
  "....XXXXX.XXXXXXX.",
  "....XXXXX..XXXXXXX",
  "....XXXXX..XXooooo",
  "....XXXXX.XXXXooo.",
  "....XXXXXXXXXX....",
  "....XXXooXXXXX....",
  ".....XXXXXXXXX....",
  ".....XXXXXXXXX....",
  "....XXXXXX.XXXX...",
  "...XXXXX....XXXX..",
  "..XXXX.......XXXX.",
  ".XXXX.........XXX.",
  ".XXX...........XXX",
  "XXX............XXX",
  "XXX.............XX",
  "XX..............XX",
  "XX...............X",
  "XX................",
  "oo................",
]);

defineSprite("dan_run2", [
  "......XXXXXX......",
  ".....XXXXXXXX.....",
  ".....XXXXXXXX.....",
  "....XXXXXXXXXXXXX.",
  ".....XXXXXXXXo....",
  "......XXXXXXX.....",
  "......XXX.XXXX....",
  "......XXXXXXXX....",
  ".......XXXXXX.....",
  "........XXXX......",
  ".....XXXXXXXXX....",
  "....XXXXXXXXXXX...",
  "....XXXXXXXXXXXX..",
  "....XXXXX.XXXXXXX.",
  "....XXXXX..XXXXXXX",
  "....XXXXX..XXooooo",
  "....XXXXX.XXXXooo.",
  "....XXXXXXXXXX....",
  "....XXXooXXXXX....",
  ".....XXXXXXXXX....",
  ".....XXXXXXXXX....",
  ".....XXXXXXXXX....",
  ".....XXXXXXXX.....",
  "......XXXXXXX.....",
  "......XXXX.XXX....",
  ".....XXXX...XXX...",
  ".....XXX.....XXX..",
  "....XXX.......XXX.",
  "....XXX........XX.",
  "...XXXX........XXX",
  "...XXXX........XXX",
  "...oooo........ooo",
]);

defineSprite("dan_run3", [
  "......XXXXXX......",
  ".....XXXXXXXX.....",
  ".....XXXXXXXX.....",
  "....XXXXXXXXXXXXX.",
  ".....XXXXXXXXo....",
  "......XXXXXXX.....",
  "......XXX.XXXX....",
  "......XXXXXXXX....",
  ".......XXXXXX.....",
  "........XXXX......",
  ".....XXXXXXXXX....",
  "....XXXXXXXXXXX...",
  "....XXXXXXXXXXXX..",
  "....XXXXX.XXXXXXX.",
  "....XXXXX..XXXXXXX",
  "....XXXXX..XXooooo",
  "....XXXXX.XXXXooo.",
  "....XXXXXXXXXX....",
  "....XXXooXXXXX....",
  ".....XXXXXXXXX....",
  ".....XXXXXXXXX....",
  ".....XXXX.XXXXXX..",
  "....XXXX....XXXXX.",
  "...XXXX.......XXXX",
  "..XXX.........XXXX",
  ".XXX............XX",
  "XXX.............XX",
  "XX..............XX",
  "XX...............X",
  "XX................",
  "X.................",
  "o.................",
]);

defineSprite("dan_run4", [
  "......XXXXXX......",
  ".....XXXXXXXX.....",
  ".....XXXXXXXX.....",
  "....XXXXXXXXXXXXX.",
  ".....XXXXXXXXo....",
  "......XXXXXXX.....",
  "......XXX.XXXX....",
  "......XXXXXXXX....",
  ".......XXXXXX.....",
  "........XXXX......",
  ".....XXXXXXXXX....",
  "....XXXXXXXXXXX...",
  "....XXXXXXXXXXXX..",
  "....XXXXX.XXXXXXX.",
  "....XXXXX..XXXXXXX",
  "....XXXXX..XXooooo",
  "....XXXXX.XXXXooo.",
  "....XXXXXXXXXX....",
  "....XXXooXXXXX....",
  ".....XXXXXXXXX....",
  ".....XXXXXXXXX....",
  ".....XXXXXXXXX....",
  "......XXXXXXXX....",
  "......XXXXXXX.....",
  ".....XXX.XXXX.....",
  "....XXX...XXXX....",
  "...XXX.....XXX....",
  "..XXX.......XXX...",
  "..XX........XXX...",
  ".XXX........XXXX..",
  ".XXX........XXXX..",
  ".ooo........oooo..",
]);

defineSprite("dan_jump", [
  "......XXXXXX......",
  ".....XXXXXXXX.....",
  ".....XXXXXXXX.....",
  "....XXXXXXXXXXXXX.",
  ".....XXXXXXXXo....",
  "......XXXXXXX.....",
  "......XXX.XXXX....",
  "......XXXXXXXX....",
  ".......XXXXXX.....",
  "........XXXX......",
  ".....XXXXXXXXX....",
  "....XXXXXXXXXXX...",
  "....XXXXXXXXXXXX..",
  "....XXXXX.XXXXXXX.",
  "....XXXXX..XXXXXXX",
  "....XXXXX..XXooooo",
  "....XXXXX.XXXXooo.",
  "....XXXXXXXXXX....",
  "....XXXooXXXXX....",
  ".....XXXXXXXXX....",
  ".....XXXXXXXXX....",
  ".....XXXXXXXXX....",
  "....XXXXX.XXXXX...",
  "...XXXX....XXXXX..",
  "..XXXX.......XXX..",
  "..XXX.........XXX.",
  ".XXX...........XX.",
  ".oo............oo.",
  "..................",
  "..................",
  "..................",
  "..................",
]);

defineSprite("dan_kneel", [
  "..................",
  "..................",
  "..................",
  "..................",
  "..................",
  "..................",
  "..................",
  "..................",
  "..................",
  "..................",
  "......XXXXXX......",
  ".....XXXXXXXX.....",
  ".....XXXXXXXX.....",
  "....XXXXXXXXXXXXX.",
  ".....XXXXXXXXo....",
  "......XXXXXXX.....",
  "......XXX.XXXX....",
  "......XXXXXXXX....",
  ".......XXXXXX.....",
  "........XXXX......",
  ".....XXXXXXXXX....",
  "....XXXXXXXXXXXX..",
  "....XXXXX..XXXXXXX",
  "....XXXXX..XXooooo",
  "....XXXXX.XXXXooo.",
  "...XXXXXXXXXXX....",
  "..XXXXXX...XXXX...",
  ".XXXXXX.....XXXX..",
  ".XXXXXXX.....XXXX.",
  ".XXXXXXX.....XXXX.",
  ".ooooooo.....oooo.",
  "..................",
]);

// --------------------------------------------------------------- Treen 20x32

defineSprite("treen_stand", [
  ".......XXXX.......",
  ".....XXXXXXXX.....",
  "....XXXXXXXXXX....",
  "....XXXXXXXXXX....",
  "....XXooooXXXX....",
  ".....XXXXXXXX.....",
  "......XXX.XXXX....",
  "......XXXXXXXX....",
  ".......XXXXXX.....",
  "........XXXX......",
  ".....XXXXXXXXX....",
  "....XXXXXXXXXXX...",
  "....XXXXXXXXXXXX..",
  "....XXXXX.XXXXXXX.",
  "....XXXXX..XXXXXXX",
  "....XXXXX..XXooooo",
  "....XXXXX.XXXXooo.",
  "....XXXXXXXXXX....",
  "....XXXooXXXXX....",
  ".....XXXXXXXXX....",
  ".....XXXXXXXXX....",
  ".....XXXX.XXXX....",
  ".....XXXX.XXXX....",
  ".....XXXX.XXXX....",
  ".....XXX...XXX....",
  ".....XXX...XXX....",
  ".....XXX...XXX....",
  ".....XXX...XXX....",
  ".....XXX...XXX....",
  "....XXXX...XXXX...",
  "...XXXXX...XXXXX..",
  "...ooooo...ooooo..",
]);

defineSprite("treen_walk", [
  ".......XXXX.......",
  ".....XXXXXXXX.....",
  "....XXXXXXXXXX....",
  "....XXXXXXXXXX....",
  "....XXooooXXXX....",
  ".....XXXXXXXX.....",
  "......XXX.XXXX....",
  "......XXXXXXXX....",
  ".......XXXXXX.....",
  "........XXXX......",
  ".....XXXXXXXXX....",
  "....XXXXXXXXXXX...",
  "....XXXXXXXXXXXX..",
  "....XXXXX.XXXXXXX.",
  "....XXXXX..XXXXXXX",
  "....XXXXX..XXooooo",
  "....XXXXX.XXXXooo.",
  "....XXXXXXXXXX....",
  "....XXXooXXXXX....",
  ".....XXXXXXXXX....",
  ".....XXXXXXXXX....",
  "....XXXXXX.XXXX...",
  "...XXXXX....XXXX..",
  "..XXXX.......XXXX.",
  ".XXXX.........XXX.",
  ".XXX...........XXX",
  "XXX............XXX",
  "XXX.............XX",
  "XX..............XX",
  "XX...............X",
  "XX................",
  "oo................",
]);

defineSprite("boss", [
  "........XXXXXXXX........",
  "......XXXXXXXXXXXX......",
  ".....XXXXXXXXXXXXXX.....",
  "....XXXXXXXXXXXXXXXX....",
  "....XXXXXXXXXXXXXXXX....",
  "....XXXooXXXXXXooXXX....",
  "....XXXooXXXXXXooXXX....",
  ".....XXXXXXXXXXXXXX.....",
  ".....XXXXXXXXXXXXXX.....",
  "......XXXXXXXXXXXX......",
  ".......XXXXXXXXXX.......",
  "........XXXXXXXX........",
  "..........XXXX..........",
  ".........XXXXXX.........",
  "........XXXXXXXX........",
  ".......XX.XXXX.XX.......",
  ".......XX.XXXX.XX.......",
  ".......XX.XXXX.XX.......",
  "........X.XXXX.X........",
  "..........XXXX..........",
  "......XXXXXXXXXXXX......",
  ".....XXXXXXXXXXXXXX.....",
  ".....XXooooooooooXX.....",
  "......XXXXXXXXXXXX......",
  ".......XXXXXXXXXX.......",
  "........XXXXXXXX........",
  "..........XXXX..........",
  ".........oooooo.........",
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
