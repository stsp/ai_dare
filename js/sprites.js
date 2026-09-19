"use strict";
/* Sprite bitmaps, drawn for this project: the small things Dan picks up.
   '.' transparent   'X' body   'o' shade   'w' highlight

   Dan, the Treens and the Mekon are illustrations drawn with paths, in
   js/figures.js. Dan's rendered frames (assets/dan.png) are kept below as
   an alternative: drawSheetFrame() draws one where the figure is drawn now. */

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
loadSheet("dan_head", window.DAN_SHEET && window.DAN_SHEET.head);   // his head alone, for the drawn figure to wear
loadSheet("rooms", window.ROOMS_SHEET);   // the rooms as the original draws them, cleaned of sprites
loadSheet("title", { image: "assets/title.png" });   // the loading picture, from the render

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
