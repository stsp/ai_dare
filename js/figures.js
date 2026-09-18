"use strict";
/* Illustrated figures drawn with canvas paths, in the comic style of Dan's
   rendered frames: black outlines, flat colour with one shade. Everything is
   drawn in screen units (the canvas is scaled up, so curves stay smooth) and
   these are original designs, not the game's bitmaps.

   The Treens are the Mekon's soldiers: tall green reptile-men in dark
   uniform, a knitted hat pulled low and a rifle held out before them. The Mekon is a
   tiny green body under a vast domed skull, riding a floating dish. */

const FIG = {
  line: "#111111",
  skin: "#63b552", skinShade: "#3f8a33", skinLight: "#9fe08a",
  cloth: "#3a4b70", clothShade: "#25324c",
  helmet: "#2f3540", helmetShade: "#1b1f27", helmetLight: "#5d6675",   // the guards' knitted hats
  boot: "#1a1a1a", bootShade: "#000000",
  metal: "#8b93a1", metalShade: "#4f5661", glow: "#7ff5ff",
  eye: "#ff4040", eyeDark: "#7a0000",
  dish: "#9aa6b8", dishShade: "#5b6577", dishGlow: "#66e0ff",
};

/** Fill a path and outline it. */
function figShape(ctx, fill, build, width) {
  ctx.beginPath();
  build(ctx);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.lineWidth = width || 0.6;
  ctx.strokeStyle = FIG.line;
  ctx.lineJoin = "round";
  ctx.stroke();
}

function figEllipse(ctx, fill, cx, cy, rx, ry, width) {
  figShape(ctx, fill, (c) => c.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2), width);
}

/** A Treen guard facing right, feet at the bottom of the box (bx, by, bw, bh).
 *  `phase` runs the walk (0..1 per stride); `flip` turns him to the left. */
function drawTreenFigure(ctx, bx, by, bw, bh, phase, flip, act) {
  ctx.save();
  ctx.translate(bx + bw / 2, by + bh);         // origin between his feet
  if (flip) ctx.scale(-1, 1);
  act = act || {};
  if (act.armsUp) phase = 0;                   // shot: he stops dead, arms flung up, and is gone
  if (act.fire) ctx.translate(-0.6, 0);        // the recoil
  const stride = Math.sin(phase * Math.PI * 2);   // -1..1: the legs swing
  const bob = Math.abs(stride) * 0.6;
  const hip = -12 + bob, top = -25 + bob;         // the hips and the shoulder line

  // seen from the side, like Dan: legs one behind the other, boots toe forward
  const leg = (dx, swing, back) => {
    const kneeX = dx + swing * 2.4, footX = dx + swing * 4.8;
    const lift = Math.max(0, swing) * 1.6;
    figShape(ctx, back ? FIG.clothShade : FIG.cloth, (c) => {
      c.moveTo(dx - 1.7, hip); c.lineTo(dx + 1.7, hip);
      c.lineTo(kneeX + 1.5, hip + 6); c.lineTo(footX + 1.1, -2.2 - lift);
      c.lineTo(footX - 1.1, -2.2 - lift); c.lineTo(kneeX - 1.5, hip + 6);
    });
    figShape(ctx, back ? FIG.bootShade : FIG.boot, (c) => {
      c.moveTo(footX - 1.4, -2.4 - lift); c.lineTo(footX + 1.2, -2.4 - lift); c.lineTo(footX + 3.4, -0.8 - lift);
      c.lineTo(footX + 3.2, -lift); c.lineTo(footX - 1.6, -lift);
    }, 0.45);
  };
  leg(-0.4, -stride, true);
  // torso in profile: a straight back, the chest forward, one rounded shoulder
  figShape(ctx, FIG.cloth, (c) => {
    c.moveTo(-1.9, hip);
    c.lineTo(-2.2, top + 1.5);
    c.quadraticCurveTo(-2.1, top - 0.3, 0.2, top - 0.3);
    c.quadraticCurveTo(2.7, top - 0.3, 2.8, top + 2.5);
    c.quadraticCurveTo(3.1, top + 6, 2.2, hip);
  });
  ctx.fillStyle = FIG.clothShade;
  ctx.fillRect(-1.9, hip - 2.5, 4.1, 1.3);         // belt
  ctx.fillStyle = FIG.metal;
  ctx.fillRect(1.2, hip - 2.7, 1, 1.7);            // buckle
  ctx.fillStyle = FIG.skinLight;
  ctx.fillRect(-0.6, top + 0.8, 1.6, 0.7);         // shoulder flash
  leg(0.4, stride, false);
  // the far arm, behind the near one, to the rifle's fore-end
  const sx = 0.4, sy = top + 1.6, gy = top + 6;
  if (act.armsUp) {                            // both arms thrown up over his head, the rifle let go
    figShape(ctx, FIG.clothShade, (c) => { c.moveTo(sx + 0.2, sy - 0.4); c.lineTo(sx + 2.4, sy - 0.2); c.lineTo(sx + 7.2, sy - 11.6); c.lineTo(sx + 5.4, sy - 12.4); });
    figEllipse(ctx, FIG.skin, sx + 6.8, sy - 13.2, 1.4, 1.2, 0.5);
    figShape(ctx, FIG.cloth, (c) => { c.moveTo(sx - 1.8, sy + 0.2); c.lineTo(sx + 0.4, sy - 0.4); c.lineTo(sx - 4.2, sy - 11.8); c.lineTo(sx - 6, sy - 11); });
    figEllipse(ctx, FIG.skin, sx - 5.6, sy - 12.6, 1.4, 1.2, 0.5);
  } else {
  figShape(ctx, FIG.clothShade, (c) => {
    c.moveTo(sx - 0.6, sy - 0.2); c.lineTo(sx + 1.6, sy - 0.6); c.lineTo(sx + 5.4, gy - 0.4); c.lineTo(sx + 9, gy - 0.2);
    c.lineTo(sx + 9, gy + 1.6); c.lineTo(sx + 5, gy + 1.6); c.lineTo(sx + 1.4, sy + 2.2);
  });
  // rifle, held out level in front
  figShape(ctx, FIG.metalShade, (c) => {
    c.moveTo(-2.5, gy); c.lineTo(13, gy); c.lineTo(13, gy + 1.5);
    c.lineTo(5, gy + 1.5); c.lineTo(5, gy + 3.2); c.lineTo(2.5, gy + 3.2); c.lineTo(2.5, gy + 1.5); c.lineTo(-1, gy + 1.5); c.lineTo(-2.5, gy + 3);
  }, 0.5);
  ctx.fillStyle = FIG.metal;
  ctx.fillRect(-1.5, gy + 0.3, 14, 0.6);
  ctx.fillStyle = FIG.glow;
  ctx.fillRect(12.2, gy + 0.2, 1.4, 1.2);          // the muzzle's charge
  if (act.fire) {                                  // the bolt leaving the muzzle
    ctx.fillStyle = "#ff6a6a";
    ctx.beginPath();
    ctx.moveTo(13.6, gy + 0.8); ctx.lineTo(18, gy - 1.4); ctx.lineTo(16.6, gy + 0.8); ctx.lineTo(18, gy + 3);
    ctx.closePath(); ctx.fill();
  }
  // the near arm, down to the elbow and forward to the grip, both hands on the rifle
  figShape(ctx, FIG.cloth, (c) => {
    c.moveTo(sx - 1.4, sy); c.lineTo(sx + 1, sy - 0.4); c.lineTo(sx + 3.4, gy - 0.2); c.lineTo(sx + 5, gy);
    c.lineTo(sx + 5, gy + 1.8); c.lineTo(sx + 2.6, gy + 1.8); c.lineTo(sx + 0.2, sy + 2.6);
  });
  figEllipse(ctx, FIG.skin, sx + 5.2, gy + 0.9, 1.6, 1.2, 0.5);
  figEllipse(ctx, FIG.skin, sx + 9.4, gy + 0.7, 1.5, 1.1, 0.5);
  }
  // head in profile: a long snout of a jaw, a heavy brow over one red eye
  const hx = 0.4, hy = top - 1;
  ctx.fillStyle = FIG.skinShade;
  ctx.fillRect(hx - 1.2, hy - 1.2, 2.4, 2);        // neck
  figShape(ctx, FIG.skin, (c) => {
    c.moveTo(hx - 2.8, hy - 6); c.lineTo(hx - 2.8, hy - 2); c.quadraticCurveTo(hx - 2.6, hy - 0.4, hx - 0.6, hy - 0.4);
    c.lineTo(hx + 3.6, hy - 0.6);                   // the jaw juts forward
    c.quadraticCurveTo(hx + 4.6, hy - 1.2, hx + 4.4, hy - 2.6);
    c.lineTo(hx + 3.4, hy - 3.8); c.lineTo(hx + 3.2, hy - 6);
  });
  ctx.fillStyle = FIG.skinShade;
  ctx.fillRect(hx + 0.2, hy - 1.7, 3.4, 0.5);      // the slit of the mouth
  ctx.fillRect(hx + 1, hy - 4.4, 2.6, 0.6);        // brow
  ctx.fillStyle = FIG.eye;
  ctx.fillRect(hx + 1.6, hy - 3.7, 1.4, 0.9);      // eye
  ctx.fillStyle = FIG.eyeDark;
  ctx.fillRect(hx + 2.5, hy - 3.7, 0.5, 0.9);
  // a knitted hat pulled down over the brow, its brim rolled up
  figShape(ctx, FIG.helmet, (c) => {
    c.moveTo(hx - 3.2, hy - 5.4);
    c.quadraticCurveTo(hx - 3.2, hy - 10, hx + 0.4, hy - 10.2);
    c.quadraticCurveTo(hx + 4, hy - 10, hx + 3.8, hy - 5.4);
  }, 0.5);
  ctx.fillStyle = FIG.helmetShade;                 // ribbing
  for (let i = -2.2; i <= 2.6; i += 1.2) ctx.fillRect(hx + i, hy - 9.4, 0.45, 3.4);
  figShape(ctx, FIG.helmetShade, (c) => {          // the rolled brim
    c.moveTo(hx - 3.5, hy - 6.6); c.lineTo(hx + 4.2, hy - 6.6); c.lineTo(hx + 4.2, hy - 4.6); c.lineTo(hx - 3.5, hy - 4.6);
  }, 0.5);
  ctx.fillStyle = FIG.helmetLight;
  ctx.fillRect(hx - 2.6, hy - 6.2, 6.2, 0.5);
  ctx.restore();
}

/** The Mekon's head, filling a square of side `s` at (x, y): the great dome,
 *  the small face beneath it. `t` moves the eyes a little. */
function drawMekonHead(ctx, x, y, s, t) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(s / 26, s / 26);
  figShape(ctx, FIG.skinShade, (c) => {         // the collar of his robe
    c.moveTo(6, 26); c.lineTo(20, 26); c.lineTo(18, 21); c.lineTo(8, 21);
  });
  figShape(ctx, FIG.skin, (c) => {              // face: narrow, pointed chin
    c.moveTo(8.5, 15); c.quadraticCurveTo(8, 21.5, 13, 22.5);
    c.quadraticCurveTo(18, 21.5, 17.5, 15);
  });
  figShape(ctx, FIG.skin, (c) => {              // the dome
    c.moveTo(4.5, 15.5); c.quadraticCurveTo(1.5, 2, 13, 1.5);
    c.quadraticCurveTo(24.5, 2, 21.5, 15.5); c.quadraticCurveTo(13, 18.5, 4.5, 15.5);
  }, 0.7);
  ctx.fillStyle = FIG.skinLight;
  ctx.beginPath(); ctx.ellipse(9.5, 5.5, 3, 1.4, -0.5, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = FIG.skinShade;                // the brow's shadow over the eyes
  ctx.fillRect(7.5, 14.2, 11, 1.1);
  const look = Math.sin((t || 0) * 1.7) * 0.6;
  for (const ex of [10.2, 15.8]) {              // narrow eyes, lit red
    ctx.fillStyle = FIG.eyeDark;
    ctx.beginPath(); ctx.ellipse(ex, 16.4, 1.9, 0.9, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = FIG.eye;
    ctx.fillRect(ex - 0.6 + look, 15.9, 1.2, 1);
  }
  ctx.fillStyle = FIG.skinShade;
  ctx.fillRect(12.4, 18.2, 1.2, 1.2);           // nose
  ctx.fillRect(10.5, 20.4, 5, 0.7);             // the mouth, set hard
  ctx.restore();
}

/** The Mekon seated on his floating dish, drawn in the box (bx, by, bw, bh);
 *  `t` drives the eyes and the dish's glow. */
function drawMekonSeated(ctx, bx, by, bw, bh, t) {
  ctx.save();
  ctx.translate(bx, by);
  const k = bw / 24;
  ctx.scale(k, k);
  // the dish: a shallow bowl with a lit underside
  ctx.fillStyle = FIG.dishGlow;
  ctx.globalAlpha = 0.35 + 0.25 * Math.sin((t || 0) * 3);
  ctx.beginPath(); ctx.ellipse(12, 30, 9, 1.8, 0, 0, Math.PI * 2); ctx.fill();
  ctx.globalAlpha = 1;
  figShape(ctx, FIG.dish, (c) => {
    c.moveTo(1, 22); c.lineTo(23, 22); c.quadraticCurveTo(20, 29, 12, 29); c.quadraticCurveTo(4, 29, 1, 22);
  });
  ctx.fillStyle = FIG.dishShade;
  ctx.fillRect(2, 22, 20, 1.2);
  // the small body in a dark robe, arms on the rim
  figShape(ctx, FIG.cloth, (c) => {
    c.moveTo(7, 22); c.lineTo(17, 22); c.lineTo(16, 15); c.lineTo(8, 15);
  });
  figEllipse(ctx, FIG.skin, 6.5, 21, 1.3, 1, 0.4);
  figEllipse(ctx, FIG.skin, 17.5, 21, 1.3, 1, 0.4);
  drawMekonHead(ctx, 3, 0, 18, t);
  ctx.restore();
}

/* Dan himself, drawn the same way: a pilot in an olive uniform and peaked
   cap, rifle out before him. `pose` is "stand", "run", "jump", "kneel" or
   "fire"; `phase` runs the stride (0..1) and the muzzle flash. The box is
   Dan's hit box, feet at its bottom, as with the rendered frames. */
const DAN_FIG = {
  skin: "#f1c9a0", skinShade: "#c99468", hair: "#3b2a1a",
  cap: "#5f7d3a", capShade: "#3d5325", capBand: "#1d2736", peak: "#151515",
  tunic: "#5a7a35", tunicShade: "#3c5322", tunicLight: "#8cae5c",
  trouser: "#526d31", trouserShade: "#354820",
  boot: "#1a1a1a", bootShade: "#000000", belt: "#2b2b2b", buckle: "#d9b24a",
  gun: "#4b515c", gunShade: "#2a2e36", gunLight: "#9aa3b2", glow: "#7ff5ff", flash: "#fff2a0",
};

/** The head render is far finer than it is drawn; a browser's one-step
 *  downscale of such a ratio drops pixels and shimmers, so it is brought down
 *  by halving steps to twice the size it is drawn at, once per canvas scale. */
const HEAD_CACHE = new Map();
function headForScale(hs, k) {
  const key = Math.round(k * 4);
  if (HEAD_CACHE.has(key)) return HEAD_CACHE.get(key);
  const target = Math.max(1, hs.meta.w * (k / hs.meta.scale) * 2);   // pixels wide it will be drawn at, doubled
  let cur = hs.img, w = hs.img.width, h = hs.img.height;
  while (w / 2 >= target) {
    const cv = document.createElement("canvas");
    cv.width = Math.round(w / 2); cv.height = Math.round(h / 2);
    const c = cv.getContext("2d");
    c.imageSmoothingEnabled = true; c.imageSmoothingQuality = "high";
    c.drawImage(cur, 0, 0, cv.width, cv.height);
    cur = cv; w = cv.width; h = cv.height;
  }
  HEAD_CACHE.set(key, cur);
  return cur;
}

function drawDanFigure(ctx, bx, by, bw, bh, pose, phase, flip) {
  ctx.save();
  ctx.translate(bx + bw / 2, by + bh);
  if (flip) ctx.scale(-1, 1);
  if (pose === "down") {                               // out cold: flat on his back, head away from where he faced
    ctx.translate(0, -3.5);
    ctx.rotate(-Math.PI / 2);
    pose = "stand";
  }
  const lift = pose === "lift";                        // riding: the rifle lowered
  if (lift) pose = "stand";
  const run = pose === "run", kneel = pose === "kneel", jump = pose === "jump";
  const stride = run ? Math.sin(phase * Math.PI * 2) : 0;
  const bob = run ? Math.abs(Math.cos(phase * Math.PI * 2)) * 0.8 : 0;
  // how far the trunk sits above the ground in each pose
  const hip = kneel ? -8 : jump ? -14 : -12 + bob;
  const lean = run ? 1.6 : kneel ? 1 : 0;              // forward lean of the trunk
  const top = hip - (kneel ? 10 : 13);                 // shoulder line: crouched on one knee

  // the body seen from the side, as the head is: one shoulder before the
  // other, a narrow chest, both arms out along the rifle, legs in profile
  const leg = (dx, swing, back) => {
    const cloth = back ? DAN_FIG.trouserShade : DAN_FIG.trouser;
    const boot = back ? DAN_FIG.bootShade : DAN_FIG.boot;
    const shoe = (ax, ay) => figShape(ctx, boot, (c) => {           // a boot from the side: toe forward, a heel
      c.moveTo(ax - 1.4, ay - 2.4); c.lineTo(ax + 1.2, ay - 2.4); c.lineTo(ax + 3.4, ay - 0.8);
      c.lineTo(ax + 3.2, ay); c.lineTo(ax - 1.6, ay);
    }, 0.45);
    if (kneel) {                                       // one knee down, the other foot planted
      if (back) {
        figShape(ctx, cloth, (c) => { c.moveTo(-2, hip); c.lineTo(1.2, hip); c.lineTo(-0.8, -1.5); c.lineTo(-5, -1.5); });
        figShape(ctx, boot, (c) => { c.moveTo(-8, 0); c.lineTo(-5, -2.2); c.lineTo(-1, -2.2); c.lineTo(-1, 0); });
      } else {
        figShape(ctx, cloth, (c) => { c.moveTo(-0.6, hip); c.lineTo(2.4, hip); c.lineTo(6.4, -6); c.lineTo(4.6, -2); c.lineTo(2.2, -2); c.lineTo(2.2, -6); });
        shoe(3, 0);
      }
      return;
    }
    if (jump) {                                        // knees tucked up under him
      const kx = dx + 2.6, ky = hip + 4;
      figShape(ctx, cloth, (c) => { c.moveTo(dx - 1.5, hip); c.lineTo(dx + 1.5, hip); c.lineTo(kx + 2, ky); c.lineTo(kx - 0.6, ky + 3.2); c.lineTo(kx - 2.8, ky + 0.8); });
      figShape(ctx, boot, (c) => { c.moveTo(kx - 3, ky + 0.6); c.lineTo(kx - 0.2, ky + 3.4); c.lineTo(kx - 2.4, ky + 4.8); c.lineTo(kx - 5.2, ky + 2.2); });
      return;
    }
    const kneeX = dx + swing * 2.2, footX = dx + swing * 4.5;
    const lift = Math.max(0, swing) * 1.6;             // the leading foot comes off the ground
    figShape(ctx, cloth, (c) => {                      // thigh and shin, tapering to the ankle
      c.moveTo(dx - 1.7, hip); c.lineTo(dx + 1.7, hip);
      c.lineTo(kneeX + 1.5, hip + 6); c.lineTo(footX + 1.1, -2.2 - lift);
      c.lineTo(footX - 1.1, -2.2 - lift); c.lineTo(kneeX - 1.5, hip + 6);
    });
    shoe(footX, -lift);
  };
  leg(-0.4, -stride, true);
  // torso in profile: a straight back, the chest out in front, the shoulder rounded at the top
  figShape(ctx, DAN_FIG.tunic, (c) => {
    c.moveTo(-1.9 + lean * 0.4, hip);
    c.lineTo(-2.1 + lean, top + 1.5);
    c.quadraticCurveTo(-2 + lean, top - 0.3, 0.2 + lean, top - 0.3);
    c.quadraticCurveTo(2.6 + lean, top - 0.3, 2.7 + lean, top + 2.5);
    c.quadraticCurveTo(3 + lean, top + 6, 2.2 + lean * 0.4, hip);
  });
  ctx.fillStyle = DAN_FIG.tunicShade;
  ctx.fillRect(-1.9 + lean * 0.4, hip - 2.6, 4.1, 1.3);   // belt
  ctx.fillStyle = DAN_FIG.buckle;
  ctx.fillRect(1.2 + lean * 0.4, hip - 2.8, 1, 1.7);
  ctx.fillStyle = DAN_FIG.tunicLight;
  ctx.fillRect(-0.6 + lean, top + 0.8, 1.6, 0.7);       // shoulder flash
  leg(0.4, stride, false);
  // the far arm, behind the near one, reaching to the rifle's fore-end
  const sx = 0.4 + lean, sy = top + 1.6;                // the shoulder
  const gy = top + 6;
  ctx.save();
  if (lift) { ctx.translate(sx, sy); ctx.rotate(0.95); ctx.translate(-sx, -sy); }   // arms and rifle swung down at his side
  figShape(ctx, DAN_FIG.tunicShade, (c) => {
    c.moveTo(sx - 0.6, sy - 0.2); c.lineTo(sx + 1.6, sy - 0.6); c.lineTo(sx + 5.4, gy - 0.4); c.lineTo(sx + 10, gy - 0.2);
    c.lineTo(sx + 10, gy + 1.6); c.lineTo(sx + 5, gy + 1.6); c.lineTo(sx + 1.4, sy + 2.2);
  });
  // the rifle, held out level
  figShape(ctx, DAN_FIG.gunShade, (c) => {
    c.moveTo(-3 + lean, gy); c.lineTo(17 + lean, gy); c.lineTo(17 + lean, gy + 1.5);
    c.lineTo(5.5 + lean, gy + 1.5); c.lineTo(5.5 + lean, gy + 3.2); c.lineTo(2.5 + lean, gy + 3.2);
    c.lineTo(2.5 + lean, gy + 1.5); c.lineTo(-1 + lean, gy + 1.5); c.lineTo(-3 + lean, gy + 3);
  }, 0.5);
  ctx.fillStyle = DAN_FIG.gunLight;
  ctx.fillRect(-2 + lean, gy + 0.3, 18, 0.6);
  ctx.fillStyle = DAN_FIG.glow;
  ctx.fillRect(15.6 + lean, gy + 0.2, 1.8, 1.2);
  if (pose === "fire") {                              // the shot leaving the muzzle
    ctx.fillStyle = DAN_FIG.flash;
    ctx.beginPath();
    ctx.moveTo(17.5 + lean, gy + 0.8); ctx.lineTo(22 + lean, gy - 1.5); ctx.lineTo(20.5 + lean, gy + 0.8); ctx.lineTo(22 + lean, gy + 3);
    ctx.closePath(); ctx.fill();
  }
  // the near arm: down from the shoulder to the elbow, forward to the grip
  figShape(ctx, DAN_FIG.tunic, (c) => {
    c.moveTo(sx - 1.4, sy); c.lineTo(sx + 1, sy - 0.4); c.lineTo(sx + 3.4, gy - 0.2); c.lineTo(sx + 5, gy);
    c.lineTo(sx + 5, gy + 1.8); c.lineTo(sx + 2.6, gy + 1.8); c.lineTo(sx + 0.2, sy + 2.6);
  });
  figEllipse(ctx, DAN_FIG.skin, sx + 5.2, gy + 0.9, 1.6, 1.2, 0.5);    // the near hand at the grip
  figEllipse(ctx, DAN_FIG.skin, sx + 10.4, gy + 0.7, 1.5, 1.1, 0.5);   // the far hand on the fore-end
  ctx.restore();
  // head: the rendered one (assets/dan_head.png, cut from the run frame) on
  // a short neck; drawn by hand only until it has loaded
  const hx = lean + 0.2, hy = top - 1;
  ctx.fillStyle = DAN_FIG.skinShade;
  ctx.fillRect(hx - 1.2, hy - 1.2, 2.4, 2);          // neck
  const hs = typeof SHEETS !== "undefined" && SHEETS.dan_head;
  if (hs) {
    const w = hs.meta.w / hs.meta.scale, h = hs.meta.h / hs.meta.scale;   // his head in screen units
    const m = ctx.getTransform(); const src = headForScale(hs, Math.hypot(m.a, m.b));   // the canvas scale, whichever way he lies
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(src, hx - hs.meta.cx + 1.2, hy + 0.8 - h, w, h);   // set forward on the neck, over the collar
    ctx.imageSmoothingEnabled = false;
    ctx.restore();
    return;
  }
  figShape(ctx, DAN_FIG.skin, (c) => {
    c.moveTo(hx - 2.6, hy - 5.5); c.lineTo(hx - 2.6, hy - 2.2); c.quadraticCurveTo(hx - 2.5, hy - 0.8, hx - 0.6, hy - 0.8);
    c.lineTo(hx + 1.6, hy - 0.8); c.quadraticCurveTo(hx + 3.2, hy - 1.2, hx + 3.2, hy - 3); c.lineTo(hx + 3.2, hy - 5.5);
  }, 0.5);
  ctx.fillStyle = DAN_FIG.hair;
  ctx.fillRect(hx - 2.6, hy - 5.6, 1.4, 1.8);         // sideburn
  ctx.fillStyle = DAN_FIG.skinShade;
  ctx.fillRect(hx + 1.2, hy - 4.2, 1.6, 0.5);         // brow
  ctx.fillRect(hx + 2.4, hy - 3.6, 0.9, 1.3);         // nose
  ctx.fillRect(hx + 0.6, hy - 1.9, 1.8, 0.5);         // mouth
  ctx.fillStyle = DAN_FIG.hair;
  ctx.fillRect(hx + 1.4, hy - 3.7, 0.9, 0.8);         // eye
  // the cap of the renders: a dark band with a gold strap round the head,
  // a low olive crown that reaches back and rises to its front, where the
  // badge sits, and a short black peak angled down over the eyes
  figShape(ctx, DAN_FIG.capBand, (c) => {             // the band
    c.moveTo(hx - 3.6, hy - 5.0); c.lineTo(hx + 4.0, hy - 5.0); c.lineTo(hx + 4.0, hy - 6.3); c.lineTo(hx - 3.6, hy - 6.3);
  }, 0.45);
  ctx.fillStyle = DAN_FIG.buckle;
  ctx.fillRect(hx - 1.6, hy - 5.9, 5.2, 0.5);         // the strap across the front
  figShape(ctx, DAN_FIG.cap, (c) => {                 // the crown: its top a straight rise from the back to a sharp corner at the front
    c.moveTo(hx - 5.6, hy - 6.3);
    c.lineTo(hx - 4.8, hy - 7.4);
    c.lineTo(hx + 4.4, hy - 9.2);                     // the sharp top corner
    c.lineTo(hx + 5.8, hy - 6.3);
  }, 0.45);
  ctx.fillStyle = DAN_FIG.capShade;
  ctx.fillRect(hx - 5.4, hy - 6.8, 11, 0.5);          // the crown's seam
  ctx.fillStyle = DAN_FIG.buckle;
  ctx.fillRect(hx + 2.8, hy - 8.3, 1.2, 1.1);         // badge at the front of the crown
  figShape(ctx, DAN_FIG.peak, (c) => {                // the peak: a sharp point out over the eyes
    c.moveTo(hx + 1.6, hy - 5.3); c.lineTo(hx + 8.2, hy - 4.0); c.lineTo(hx + 6.0, hy - 3.6); c.lineTo(hx + 1.6, hy - 4.3);
  }, 0.45);
  ctx.restore();
}
