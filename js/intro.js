"use strict";
/* The title screen and the opening sequence, after the original's:
   a framed title with lines of text whose colours run through the palette,
   two pages taking turns (the credits, and the "best scores" joke), then on
   fire: Dan and Digby speed over the asteroid, the Mekon calls to gloat, a
   run of Treen craft to shoot on the way in, and the landing. */

const MENU_PAGES = [
  ["* IPC / DAN DARE LIMITED", "* 1986  VIRGIN GAMES LTD", "WRITTEN BY THE GANG OF FIVE.", "",
   "PRESS 'FIRE' TO PLAY", "OR ENTER TO START"],
  ["BEST  SCORES", "", "AAAARRRRGGHH........000500", ".RAN................000400",
   "..OUT...............000300", "...OF...............000200", "....MEMORY..........000100"],
];
const CYCLE = [C.bblue, C.bmagenta, C.bred, C.byellow, C.bgreen, C.bcyan, C.bwhite];

const menu = { page: 0, t: 0, scroll: 0 };

function updateMenu(dt) {
  menu.t += dt;
  if (menu.t > 5) {                       // the page rolls up and the other rolls in
    menu.scroll += dt * 140;
    if (menu.scroll > 120) { menu.page = 1 - menu.page; menu.t = 0; menu.scroll = 0; }
  }
}

/** Text at double size, as the original's wide italic face reads. */
function drawBig(ctx, text, x, y, colour, k) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(k, k);
  drawText(ctx, text, 0, 0, colour);
  ctx.restore();
}

function drawMenu(ctx) {
  drawFrame(ctx);
  ctx.save();
  ctx.translate(VIEW_X, VIEW_Y);
  ctx.fillStyle = C.black;
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  // the frame line that runs behind the title box
  ctx.fillStyle = C.white;
  ctx.fillRect(0, 34, VIEW_W, 1);
  ctx.fillRect(VIEW_W - 1, 34, 1, VIEW_H - 34);
  // the title box
  ctx.fillStyle = C.blue; ctx.fillRect(44, 4, 152, 50);
  ctx.fillStyle = C.cyan; ctx.fillRect(46, 6, 148, 46);
  drawBig(ctx, "DAN DARE", 120 - textWidth("DAN DARE") * 1.5, 11, C.blue, 3);
  drawBig(ctx, "PILOT OF THE FUTURE", 120 - textWidth("PILOT OF THE FUTURE") * 0.7, 36, C.blue, 1.4);
  // the page, its lines each in a colour of their own that keeps changing
  ctx.save();
  ctx.beginPath(); ctx.rect(0, 56, VIEW_W, VIEW_H - 56); ctx.clip();
  const tick = Math.floor(state.phase * 10);
  const lines = MENU_PAGES[menu.page];
  const y0 = 64 - menu.scroll;
  lines.forEach((ln, i) => {
    if (!ln) return;
    const w = textWidth(ln) * 1.6;
    drawBig(ctx, ln, Math.max(2, 120 - w / 2), y0 + i * 12, CYCLE[(tick + i * 2) % CYCLE.length], 1.6);
  });
  ctx.restore();
  const on = cheatsOn();
  if (on.length) drawText(ctx, "CHEATS: " + on.join(" "), 4, VIEW_H - 9, C.bmagenta);
  ctx.restore();
  drawPanel(ctx, state);
}

// ------------------------------------------------------------------ the intro

const intro = { t: 0, phase: 0, ship: { x: 60, y: 96, vy: 0 }, shots: [], foes: [], bursts: [], nextFoe: 0, scroll: 0, score: 0 };

function beginIntro() {
  state.mode = "intro";
  state.timeLeft = START_TIME;
  state.score = 0;
  state.viewer = "asteroid";
  state.msgTop = null; state.msgBottom = null;
  Object.assign(intro, { t: 0, phase: 0, shots: [], foes: [], bursts: [], nextFoe: 1.5, scroll: 0 });
  intro.ship.x = 60; intro.ship.y = 96; intro.ship.vy = 0;
}

const INTRO_FLY = 4.5, INTRO_CALL = 3.5, INTRO_FIGHT = 16, INTRO_DIGBY = 3.5;

function updateIntro(dt) {
  intro.t += dt;
  intro.scroll += dt * 48;
  const s = intro.ship;
  if (intro.phase === 0 && intro.t > INTRO_FLY) { intro.phase = 1; intro.t = 0; call(["\"YOU WILL NOT SUCCEED, DARE!\""], INTRO_CALL); }
  else if (intro.phase === 1 && intro.t > INTRO_CALL) { intro.phase = 2; intro.t = 0; }
  else if (intro.phase === 2 && intro.t > INTRO_FIGHT) { intro.phase = 3; intro.t = 0; state.msgTop = null; }
  else if (intro.phase === 3 && intro.t > INTRO_DIGBY) { startGame(); state.score += intro.score; return; }
  if (tapped.Enter || tapped.Escape) { startGame(); state.score += intro.score; return; }   // skip the fight

  if (intro.phase === 2) {
    // Dan flies the ship: up, down, forward and back, and fire
    if (held.up()) s.y -= 70 * dt;
    if (held.down()) s.y += 70 * dt;
    if (held.left()) s.x -= 90 * dt;
    if (held.right()) s.x += 90 * dt;
    s.y = Math.max(20, Math.min(VIEW_H - 40, s.y));
    s.x = Math.max(4, Math.min(VIEW_W - 60, s.x));
    if (held.fire() && (intro.cool = (intro.cool || 0) - dt) <= 0) {
      intro.cool = 0.25;
      intro.shots.push({ x: s.x + 42, y: s.y + 5 });
      beep(1500, 0.04, "square");
    }
    for (const sh of intro.shots) sh.x += 260 * dt;
    intro.shots = intro.shots.filter((sh) => sh.x < VIEW_W);
    if ((intro.nextFoe -= dt) <= 0) {
      intro.nextFoe = 1.2 + Math.random() * 1.2;
      intro.foes.push({ x: VIEW_W + 10, y: 24 + Math.random() * (VIEW_H - 70), hue: Math.random() < 0.5 ? C.bcyan : C.bmagenta, phase: Math.random() * 6 });
    }
    for (const f of intro.foes) { f.x -= 46 * dt; f.phase += dt * 4; f.y += Math.sin(f.phase) * 14 * dt; }
    for (const f of intro.foes) {
      for (const sh of intro.shots) {
        if (!f.dead && Math.abs(sh.x - f.x) < 8 && Math.abs(sh.y - f.y) < 8) {
          f.dead = true; sh.x = 1e9;
          intro.score += 36;
          for (let i = 0; i < 18; i++) intro.bursts.push({ x: f.x, y: f.y, vx: (Math.random() - 0.5) * 120, vy: (Math.random() - 0.5) * 120, t: 0.6, c: [C.bwhite, C.bred, C.byellow, C.bmagenta][i % 4] });
          beep(200, 0.15, "sawtooth");
        }
      }
      if (!f.dead && Math.abs(f.x - (s.x + 22)) < 20 && Math.abs(f.y - (s.y + 5)) < 8) { f.dead = true; state.energy = Math.max(10, state.energy - 10); beep(120, 0.2, "sawtooth"); }
    }
    intro.foes = intro.foes.filter((f) => !f.dead && f.x > -12);
    for (const b of intro.bursts) { b.x += b.vx * dt; b.y += b.vy * dt; b.t -= dt; }
    intro.bursts = intro.bursts.filter((b) => b.t > 0);
  } else {
    s.y = 96 + Math.sin(intro.t * 2) * 2;
  }
  if (state.messageTimer > 0) state.messageTimer -= dt;
  if (state.viewerTimer > 0 && (state.viewerTimer -= dt) <= 0) state.viewer = "asteroid";
  if (state.viewerStatic > 0) state.viewerStatic -= dt;
}

/** Anastasia, in profile: a cyan hull, the cabin, and the drive flame. */
/** The Anastasia, nose to the right: a long tube with a rounded nose, a
 *  canopy and a row of portholes along the top, a finned engine block at the
 *  tail and a flaring exhaust. About 42 by 12, its hit point at (x + 14, y + 4). */
function drawShip(ctx, x, y, t) {
  const flick = Math.floor(t * 20) % 2;
  ctx.save();
  ctx.translate(x, y);
  ctx.lineJoin = "round";
  // exhaust: a red flare with a yellow core, pulsing
  ctx.fillStyle = C.bred;
  ctx.beginPath();
  ctx.moveTo(4, 1.5); ctx.lineTo(-5 - flick * 3, 2); ctx.lineTo(-2, 4.5); ctx.lineTo(-7 - flick * 2, 5.5);
  ctx.lineTo(-2, 6.5); ctx.lineTo(-5 - flick * 3, 9); ctx.lineTo(4, 9.5);
  ctx.closePath(); ctx.fill();
  ctx.fillStyle = C.byellow;
  ctx.beginPath();
  ctx.moveTo(4, 3); ctx.lineTo(-1 - flick * 2, 4); ctx.lineTo(0, 5.5); ctx.lineTo(-1 - flick * 2, 7); ctx.lineTo(4, 8);
  ctx.closePath(); ctx.fill();
  // tail block: the engine housing with fins above and below
  ctx.fillStyle = C.cyan;
  ctx.fillRect(4, 1, 8, 9);
  ctx.fillStyle = C.bcyan;
  ctx.beginPath(); ctx.moveTo(6, 1); ctx.lineTo(9, -3); ctx.lineTo(12, 1); ctx.closePath(); ctx.fill();   // dorsal fin
  ctx.beginPath(); ctx.moveTo(6, 10); ctx.lineTo(9, 13); ctx.lineTo(12, 10); ctx.closePath(); ctx.fill(); // ventral fin
  ctx.fillStyle = C.black;
  ctx.fillRect(5, 3, 1, 5); ctx.fillRect(7, 3, 1, 5);                    // the nozzle's ribs
  ctx.fillStyle = C.bwhite;
  ctx.fillRect(9, 2, 1, 7);                                              // a bright rim
  // fuselage: a tube tapering into a rounded nose
  ctx.fillStyle = C.cyan;
  ctx.beginPath();
  ctx.moveTo(12, 2);
  ctx.lineTo(32, 2);
  ctx.quadraticCurveTo(42, 2, 42, 5.5);
  ctx.quadraticCurveTo(42, 9, 32, 9);
  ctx.lineTo(12, 9);
  ctx.closePath(); ctx.fill();
  ctx.fillStyle = C.bcyan;                                               // lit upper flank
  ctx.beginPath();
  ctx.moveTo(12, 2); ctx.lineTo(32, 2); ctx.quadraticCurveTo(40, 2, 41, 4.5); ctx.lineTo(12, 4.5);
  ctx.closePath(); ctx.fill();
  ctx.fillStyle = C.white;                                               // keel line
  ctx.fillRect(13, 7.6, 22, 0.8);
  // canopy behind the nose, and a row of portholes
  ctx.fillStyle = C.bwhite;
  ctx.beginPath(); ctx.moveTo(30, 2); ctx.lineTo(33, 0); ctx.lineTo(37, 0); ctx.lineTo(39, 2); ctx.closePath(); ctx.fill();
  ctx.fillStyle = C.black;
  ctx.fillRect(33, 0.8, 1.5, 1.2); ctx.fillRect(35.5, 0.8, 1.5, 1.2);
  ctx.fillStyle = C.black;
  for (let i = 0; i < 4; i++) ctx.fillRect(15 + i * 4, 3, 2, 1.6);
  ctx.fillStyle = C.bwhite;
  for (let i = 0; i < 4; i++) ctx.fillRect(15 + i * 4, 3, 0.8, 0.8);
  ctx.restore();
}

/** The asteroid's surface rolling under the ship: a course of plating with
 *  towers, tanks and lights on it, repeating. */
function drawSurface(ctx, scroll) {
  const y = VIEW_H - 22;
  ctx.fillStyle = C.cyan; ctx.fillRect(0, y + 12, VIEW_W, 2);
  ctx.fillStyle = C.white; for (let x = 0; x < VIEW_W; x += 4) ctx.fillRect(x, y + 10, 2, 1);
  ctx.fillStyle = C.blue; ctx.fillRect(0, y + 14, VIEW_W, 8);
  ctx.fillStyle = C.black; for (let x = 0; x < VIEW_W; x += 6) ctx.fillRect(x + 2, y + 16, 2, 4);
  const period = 96;
  for (let x = -period + (-scroll % period); x < VIEW_W + period; x += period) {
    const tower = (tx) => {
      ctx.fillStyle = C.byellow; ctx.fillRect(tx + 1, y - 2, 4, 12); ctx.fillRect(tx, y + 4, 6, 6); ctx.fillRect(tx + 2, y - 5, 2, 3);
      ctx.fillStyle = C.black; ctx.fillRect(tx + 2, y + 1, 2, 1); ctx.fillRect(tx + 2, y + 6, 2, 1);
    };
    tower(x + 8); tower(x + 16); tower(x + 60);
    ctx.fillStyle = C.bblue; ctx.fillRect(x + 30, y + 2, 14, 8);
    ctx.fillStyle = C.bwhite; ctx.fillRect(x + 30, y + 2, 14, 1); ctx.fillRect(x + 32, y + 5, 2, 2); ctx.fillRect(x + 38, y + 5, 2, 2);
    ctx.fillStyle = C.bred; ctx.fillRect(x + 76, y + 6, 4, 4);
    ctx.fillStyle = C.bgreen; ctx.fillRect(x + 84, y + 4, 3, 6);
  }
}

function drawIntro(ctx) {
  drawFrame(ctx);
  ctx.save();
  ctx.beginPath(); ctx.rect(VIEW_X, VIEW_Y, VIEW_W, VIEW_H); ctx.clip();
  ctx.translate(VIEW_X, VIEW_Y);
  drawStarfield(ctx, "intro");
  if (intro.phase < 3) {
    if (intro.phase !== 1) drawSurface(ctx, intro.scroll);
    drawShip(ctx, Math.round(intro.ship.x), Math.round(intro.ship.y), intro.t);
    ctx.fillStyle = C.bwhite;
    for (const sh of intro.shots) ctx.fillRect(Math.round(sh.x), Math.round(sh.y), 6, 1);
    for (const f of intro.foes) {                 // a Treen craft: a ring with a core
      ctx.strokeStyle = f.hue; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(Math.round(f.x), Math.round(f.y), 6, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = C.bwhite; ctx.fillRect(Math.round(f.x) - 1, Math.round(f.y) - 1, 3, 3);
    }
    for (const b of intro.bursts) { ctx.fillStyle = b.c; ctx.fillRect(Math.round(b.x), Math.round(b.y), 2, 2); }
    if (intro.phase === 0) drawMessage(ctx, ["DAN AND DIGBY SPEED", "OVER THE ASTEROID!"], true);
    if (intro.phase === 1 && state.msgBottom) drawMessage(ctx, state.msgBottom, false, true);
  } else {
    drawMessage(ctx, ["DIGBY REMAINS ON THE SHIP", "AND AWAITS DAN'S RETURN"], true);
  }
  ctx.restore();
  drawPanel(ctx, state);
}
