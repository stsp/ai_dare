"use strict";
/* Illustrated figures drawn with canvas paths, in the comic style of Dan's
   rendered frames: black outlines, flat colour with one shade. Everything is
   drawn in screen units (the canvas is scaled up, so curves stay smooth) and
   these are original designs, not the game's bitmaps.

   The Treens are the Mekon's soldiers: tall green reptile-men in dark
   uniform, a domed helmet and a rifle held out before them. The Mekon is a
   tiny green body under a vast domed skull, riding a floating dish. */

const FIG = {
  line: "#111111",
  skin: "#63b552", skinShade: "#3f8a33", skinLight: "#9fe08a",
  cloth: "#3a4b70", clothShade: "#25324c",
  helmet: "#4d8fb0", helmetShade: "#2e6180", helmetLight: "#a9d8ef",
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
function drawTreenFigure(ctx, bx, by, bw, bh, phase, flip) {
  ctx.save();
  ctx.translate(bx + bw / 2, by + bh);         // origin between his feet
  if (flip) ctx.scale(-1, 1);
  const stride = Math.sin(phase * Math.PI * 2);   // -1..1: legs and arms swing
  const bob = Math.abs(stride) * 0.6;

  // legs: two tapered columns from the hips, boots at the ground
  const leg = (dx, swing, back) => {
    const hipX = dx, kneeX = dx + swing * 3, footX = dx + swing * 5;
    figShape(ctx, back ? FIG.clothShade : FIG.cloth, (c) => {
      c.moveTo(hipX - 2.2, -12 + bob);
      c.lineTo(hipX + 2.2, -12 + bob);
      c.lineTo(kneeX + 1.8, -6);
      c.lineTo(footX + 1.6, -2);
      c.lineTo(footX - 1.6, -2);
      c.lineTo(kneeX - 1.8, -6);
    });
    figShape(ctx, back ? FIG.bootShade : FIG.boot, (c) => {
      c.moveTo(footX - 1.8, -2.4);
      c.lineTo(footX + 2.6, -2.4);
      c.lineTo(footX + 3.2, 0);
      c.lineTo(footX - 2, 0);
    });
  };
  leg(-1.5, -stride, true);
  // torso: a long tunic, shoulders wider than the hips, a belt
  figShape(ctx, FIG.cloth, (c) => {
    c.moveTo(-4.2, -24 + bob);
    c.lineTo(4.2, -24 + bob);
    c.lineTo(3.6, -12 + bob);
    c.lineTo(-3.6, -12 + bob);
  });
  ctx.fillStyle = FIG.clothShade;
  ctx.fillRect(-3.6, -14.5 + bob, 7.2, 1.4);       // belt
  ctx.fillStyle = FIG.metal;
  ctx.fillRect(-0.8, -14.7 + bob, 1.6, 1.8);       // buckle
  ctx.fillStyle = FIG.skinLight;
  ctx.fillRect(-1, -22 + bob, 2, 1);               // collar flash
  leg(1.5, stride, false);
  // the far arm, behind the rifle
  figShape(ctx, FIG.clothShade, (c) => {
    c.moveTo(1, -23 + bob); c.lineTo(4, -23 + bob); c.lineTo(7.5, -17 + bob); c.lineTo(5, -16 + bob);
  });
  // rifle, held out level in front
  figShape(ctx, FIG.metalShade, (c) => {
    c.moveTo(-2, -17.5 + bob); c.lineTo(11, -17.5 + bob); c.lineTo(11, -16 + bob);
    c.lineTo(4, -16 + bob); c.lineTo(4, -14.6 + bob); c.lineTo(1.5, -14.6 + bob); c.lineTo(1.5, -16 + bob); c.lineTo(-2, -16 + bob);
  }, 0.5);
  ctx.fillStyle = FIG.metal;
  ctx.fillRect(-1.5, -17.1 + bob, 11, 0.6);
  ctx.fillStyle = FIG.glow;
  ctx.fillRect(10.2, -17.4 + bob, 1.2, 1.2);       // the muzzle's charge
  // near arm and hands on the rifle
  figShape(ctx, FIG.cloth, (c) => {
    c.moveTo(-4, -23 + bob); c.lineTo(-1, -23 + bob); c.lineTo(3, -18 + bob); c.lineTo(0.5, -16.5 + bob);
  });
  figEllipse(ctx, FIG.skin, 2.5, -16.8 + bob, 1.5, 1.2, 0.5);
  figEllipse(ctx, FIG.skin, 6.5, -16.6 + bob, 1.5, 1.2, 0.5);
  // neck and head: a long jaw, heavy brow, the helmet's dome above
  ctx.fillStyle = FIG.skinShade;
  ctx.fillRect(-1.4, -25.5 + bob, 2.8, 2);
  figShape(ctx, FIG.skin, (c) => {
    c.moveTo(-3.4, -30 + bob);
    c.quadraticCurveTo(-3.6, -25 + bob, -1.5, -24.5 + bob);
    c.lineTo(2.5, -24.5 + bob);
    c.quadraticCurveTo(4.4, -25 + bob, 4.2, -28 + bob);
    c.lineTo(4, -30 + bob);
  });
  ctx.fillStyle = FIG.skinShade;
  ctx.fillRect(-2.6, -26.6 + bob, 6, 0.7);         // the slit of a mouth
  ctx.fillStyle = FIG.eye;
  ctx.fillRect(1.6, -29 + bob, 1.6, 1);             // eye
  ctx.fillStyle = FIG.eyeDark;
  ctx.fillRect(2.6, -29 + bob, 0.6, 1);
  ctx.fillStyle = FIG.skinShade;
  ctx.fillRect(0.8, -29.9 + bob, 3.2, 0.7);         // brow
  figShape(ctx, FIG.helmet, (c) => {
    c.moveTo(-4.4, -29.5 + bob);
    c.quadraticCurveTo(-4.6, -34.5 + bob, 0, -34.5 + bob);
    c.quadraticCurveTo(4.8, -34.5 + bob, 4.8, -29.5 + bob);
    c.lineTo(5.4, -29.5 + bob);
    c.lineTo(5.4, -28.6 + bob);
    c.lineTo(-4.4, -28.6 + bob);
  });
  ctx.fillStyle = FIG.helmetLight;
  ctx.fillRect(-2.2, -33 + bob, 2.6, 0.8);
  ctx.fillStyle = FIG.helmetShade;
  ctx.fillRect(-4.4, -29.6 + bob, 9.8, 0.8);
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
