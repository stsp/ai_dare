"use strict";
/* The rooms, built from tiles.

   The original has no picture of a room anywhere: it draws each screen as a
   grid of 8x8 cells, every cell one bitmap out of a small set with two colours
   of its own. tools/make_tiles.py read that set back off the original's
   screens - the floors, the ledges, the rails of the grav-lifts, the columns,
   the pipes, the lamps, the panels, three hundred odd tiles in assets/tiles.png
   - and wrote every room as two grids (js/rooms_tiles.js): which tile stands in
   each cell, and what colours it wears.

   Here the game lays those grids out once, at load, into the sheet the rest of
   the drawing code reads (SHEETS.rooms), so a room is assembled from its
   elements rather than stamped down as a picture. Redrawing the game's world
   means redrawing assets/tiles.png; nothing else changes. */

const TILE_ALPHA = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
const TILE_VALUE = {};
for (let i = 0; i < TILE_ALPHA.length; i++) TILE_VALUE[TILE_ALPHA[i]] = i;

/** The tile sheet as one array of 0/1 per tile: 64 pixels each. */
function readTiles(img, meta) {
  const cv = document.createElement("canvas");
  cv.width = img.width; cv.height = img.height;
  const c = cv.getContext("2d");
  c.drawImage(img, 0, 0);
  const px = c.getImageData(0, 0, img.width, img.height).data;
  const tiles = [];
  for (let i = 0; i < meta.count; i++) {
    const x0 = (i % meta.cols) * meta.tile, y0 = Math.floor(i / meta.cols) * meta.tile;
    const bits = new Uint8Array(meta.tile * meta.tile);
    for (let y = 0; y < meta.tile; y++) {
      for (let x = 0; x < meta.tile; x++) {
        bits[y * meta.tile + x] = px[((y0 + y) * img.width + x0 + x) * 4] > 127 ? 1 : 0;
      }
    }
    tiles.push(bits);
  }
  return tiles;
}

/** An attribute byte as its two colours, each three bytes of RGB. */
function attrColours(attr) {
  const pal = [[0, 0, 0], [0, 0, 0xd8], [0xd8, 0, 0], [0xd8, 0, 0xd8],
               [0, 0xd8, 0], [0, 0xd8, 0xd8], [0xd8, 0xd8, 0], [0xd8, 0xd8, 0xd8]];
  const lit = [[0, 0, 0], [0, 0, 0xff], [0xff, 0, 0], [0xff, 0, 0xff],
               [0, 0xff, 0], [0, 0xff, 0xff], [0xff, 0xff, 0], [0xff, 0xff, 0xff]];
  const p = (attr & 0x40) ? lit : pal;
  return [p[attr & 7], p[(attr >> 3) & 7]];
}

/** Lay one grid of cells into the sheet's pixels at (x0, y0). */
function blitLayout(px, stride, x0, y0, layout, tiles, colours, size) {
  for (let r = 0; r < layout.tiles.length; r++) {
    const trow = layout.tiles[r], crow = layout.colours[r];
    for (let c = 0; c < crow.length; c++) {
      const t = tiles[TILE_VALUE[trow[c * 2]] * 64 + TILE_VALUE[trow[c * 2 + 1]]];   // the tile's number, two characters
      const [ink, paper] = colours[TILE_VALUE[crow[c]]];
      for (let y = 0; y < size; y++) {
        let o = ((y0 + r * size + y) * stride + x0 + c * size) * 4;
        for (let x = 0; x < size; x++, o += 4) {
          const col = t[y * size + x] ? ink : paper;
          px[o] = col[0]; px[o + 1] = col[1]; px[o + 2] = col[2]; px[o + 3] = 255;
        }
      }
    }
  }
}

/** Build the room sheet from the tiles, in the places js/rooms_sheet.js names,
 *  and hand it to the drawing code as SHEETS.rooms. */
function buildRoomSheet(img) {
  const t = window.ROOMS_TILES, index = window.ROOMS_SHEET;
  if (!t || !index) return;
  const size = t.tile;
  let w = 0, h = 0;
  for (const k in index.rooms) {
    const [x, y] = index.rooms[k];
    w = Math.max(w, x + t.w * size); h = Math.max(h, y + t.h * size);
  }
  for (const k in index.doors || {}) {
    const [x, y, dw, dh] = index.doors[k];
    w = Math.max(w, x + dw); h = Math.max(h, y + dh);
  }
  const tiles = readTiles(img, t);
  const colours = t.attrs.map(attrColours);

  const cv = document.createElement("canvas");
  cv.width = w; cv.height = h;
  const c = cv.getContext("2d");
  const data = c.createImageData(w, h);
  for (const k in t.rooms) {
    if (!index.rooms[k]) continue;
    const [x, y] = index.rooms[k];
    blitLayout(data.data, w, x, y, t.rooms[k], tiles, colours, size);
  }
  for (const k in t.doors) {
    if (!index.doors || !index.doors[k]) continue;
    const [x, y] = index.doors[k];
    blitLayout(data.data, w, x, y, t.doors[k], tiles, colours, size);
  }
  c.putImageData(data, 0, 0);
  SHEETS.rooms = { img: cv, meta: index };
}

(function loadTiles() {
  const t = window.ROOMS_TILES;
  if (!t) return;
  const img = new Image();
  img.onload = () => buildRoomSheet(img);
  img.src = t.image;
})();
