/* The ending, as the original plays it (filmed from the walkthrough
 * recording): the ship flies off over the city, which scrolls away
 * beneath her, under "AI DARE MAKES A GETAWAY!"; the asteroid hangs in
 * space while a box counts FIVE, FOUR, THREE, TWO, ONE; it flashes and bursts
 * into a cloud of white and cyan sparks, with two lesser bursts after it;
 * "WELL DONE SIR! THIS COULD GET YOU YOUR KNIGHTHOOD!" on black; then GAME
 * OVER plaques, each in its own colours, pile up over the screen for three
 * seconds, and the title page comes back. Running out of time ends with the
 * plaques too.
 *
 * The postal story ends its own way: the AI flies the rocket off and the
 * policeman stays behind on the cosmodrome; no countdown, because nothing was
 * armed. The skeleton comes on the link to say what the boxes really held,
 * and then Mars goes up - and the policeman who loaded them is the one wanted
 * for it. */

const ENDING_PHASES = { getaway: 2.4, countdown: 2.0, skeleton: SKELETON_CALL.reduce((t, p) => t + p[1], 0), blast: 3.4, knighthood: 2.0, banner: 2.6, plaques: 5.2 };
const ENDING_NEXT = { getaway: "countdown", countdown: "blast", skeleton: "blast", blast: "knighthood", knighthood: "plaques", banner: "plaques", plaques: null };
/** The postal story tells the end differently: the skeleton on the link in
 *  place of the countdown, and Mars where the asteroid hung. */
function endingNext(phase) {
  if (phase === "getaway" && state.story === "postal") return "skeleton";
  return ENDING_NEXT[phase];
}
/** Which of the skeleton's pages is up at `t`, and how far into it we are. */
function skeletonPage(t) {
  let at = 0;
  for (const [lines, secs] of SKELETON_CALL) {
    if (t < at + secs) return { lines, into: t - at };
    at += secs;
  }
  return { lines: SKELETON_CALL[SKELETON_CALL.length - 1][0], into: 0 };
}
const COUNTDOWN = ["FIVE", "FOUR", "THREE", "TWO", "ONE"];
const PLAQUE_COLOURS = [[C.byellow, C.bred], [C.bcyan, C.bblue], [C.bgreen, C.black], [C.white, C.bmagenta]];
const PLAQUE_W = 48, PLAQUE_H = 32, PLAQUES_PER_SECOND = 36;
// they pile up for this long, then let go, one after another, and come down
// swinging like leaves
const PLAQUE_PILE = 2.0, PLAQUE_LOOSE = 1.0, PLAQUE_FALL = 110, PLAQUE_PULL = 90;
const GLOBE = { x: 120, y: 74, r: 8 };
// The beeper through the ending: the engines' roll as the ship goes up, the
// link's interference, and the world bursting - each burst one sound, not a
// spatter of rifle shots. The countdown and the plaques are silent, and
// whatever is still sounding is cut when the plaques come.
const ENDING_SOUNDS = {
  getaway: [[0, (e) => keep(e, boom(1.9, true))]],
  skeleton: [[0, () => rattle(40)]],
  blast: [[0, (e) => keep(e, boom(2.2))], [1.5, (e) => keep(e, boom(0.8))], [2.2, (e) => keep(e, boom(0.8))]],
};
/** Hold on to a sound so the ending can cut it short. */
function keep(e, src) { if (src) e.sounds.push(src); return src; }
function hush(e) {
  for (const src of e.sounds) { try { src.stop(); } catch (err) { /* already done */ } }
  e.sounds = [];
}

let ending = null;

function beginEnding(outcome) {
  state.mode = "ending";
  state.msgTop = state.msgBottom = null;
  // a loss opens on the banner, which is already the closing screen
  if (outcome !== "won") music.start("ending");
  ending = {
    outcome, phase: outcome === "won" ? "getaway" : "banner", t: 0,
    sparks: [], plaques: [], due: 0, bursts: 0, r: rng((Date.now() & 0xffff) ^ 0xe11d), played: new Set(), sounds: [],
  };
}

function endingBurst(e, cx, cy, n, speed) {
  for (let i = 0; i < n; i++) {
    const a = e.r() * Math.PI * 2, v = speed * (0.2 + e.r() * 0.8);
    e.sparks.push({ x: cx, y: cy, vx: Math.cos(a) * v, vy: Math.sin(a) * v,
                    life: 1.2 + e.r() * 1.8, cyan: e.r() < 0.3 });
  }
}

function updateEnding(dt) {
  const e = ending;
  if (!e) return;
  e.t += dt;
  for (const [at, fn] of ENDING_SOUNDS[e.phase] || []) {
    const key = e.phase + at;
    if (e.t >= at && !e.played.has(key)) { e.played.add(key); fn(e); }
  }
  if (e.phase === "blast") {
    // the asteroid goes up first, then two lesser bursts out of the cloud
    const at = [[0, 0, 0, 170, 42], [1.5, 12, 16, 60, 30], [2.2, -14, -8, 60, 30]];
    while (e.bursts < at.length && e.t >= at[e.bursts][0]) {
      const [, dx, dy, n, v] = at[e.bursts++];
      endingBurst(e, GLOBE.x + dx, GLOBE.y + dy, n, v);
    }
    for (const s of e.sparks) {
      s.x += s.vx * dt; s.y += s.vy * dt;
      s.vx *= 1 - 0.6 * dt; s.vy *= 1 - 0.6 * dt;
      s.life -= dt;
    }
    e.sparks = e.sparks.filter((s) => s.life > 0);
  } else if (e.phase === "plaques") {
    if (e.t < PLAQUE_PILE) {
      e.due += dt * PLAQUES_PER_SECOND;
      while (e.plaques.length < e.due) {
        e.plaques.push({
          x: Math.floor(e.r() * (VIEW_W + 16)) - 12, y: Math.floor(e.r() * (VIEW_H + 12)) - 8,
          c: Math.floor(e.r() * PLAQUE_COLOURS.length),
          let: PLAQUE_PILE + e.r() * PLAQUE_LOOSE,     // when this one lets go
          w: 2.2 + e.r() * 1.6, ph: e.r() * 6.3, a: 5 + e.r() * 9, vy: 0, sway: 0, rot: 0,
        });
      }
    } else {
      for (const p of e.plaques) {
        if (e.t < p.let) continue;
        const u = e.t - p.let;
        p.vy = Math.min(PLAQUE_FALL, p.vy + PLAQUE_PULL * dt);
        p.y += p.vy * dt;
        p.sway = Math.sin(u * p.w + p.ph) * p.a;      // the swing, side to side
        p.rot = Math.sin(u * p.w + p.ph) * 0.45;      // and the turn that goes with it
      }
      if (e.plaques.every((p) => p.y > VIEW_H + 4)) { e.t = ENDING_PHASES.plaques; }
    }
  }
  if (e.t >= ENDING_PHASES[e.phase] || tapped.Escape) {
    const next = tapped.Escape ? null : endingNext(e.phase);
    if (!next || next === "plaques") hush(e);          // nothing sounds over the plaques
    if (!next) { ending = null; state.mode = "title"; menu.t = 0; music.start("title"); return; }
    e.phase = next; e.t = 0;
    // the closing theme comes in once the blast is behind us, so it does not
    // play against the world going up
    if (next === "knighthood" || next === "banner") music.start("ending");
  }
}

/** The asteroid: a globe, the alien boss's world, its lands in green on cyan
 *  seas - or, in the postal story, Mars, red with its yellow deserts. */
function drawGlobe(ctx, x, y, r, white) {
  const mars = state.story === "postal";
  ctx.fillStyle = white ? C.bwhite : (mars ? C.bred : C.bcyan);
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  if (white) return;
  ctx.save();
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.clip();
  ctx.fillStyle = mars ? C.byellow : C.bgreen;
  ctx.beginPath(); ctx.ellipse(x - 3, y - 2, 4, 3, 0.4, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(x + 3, y + 3, 3, 2.2, -0.5, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = mars ? C.red : C.bblue;             // the shadowed limb
  ctx.beginPath(); ctx.arc(x + 3, y - 3, r, 0, Math.PI * 2); ctx.rect(x - r, y - r, r * 2, r * 2);
  ctx.fill("evenodd");
  ctx.restore();
}

/** The city sliding away under the ship: white-topped blocks on blue, and
 *  the yellow spires among them. */
function drawEndingCity(ctx, offset) {
  const y = VIEW_H - 14;
  ctx.fillStyle = C.bblue; ctx.fillRect(0, y + 8, VIEW_W, 6);
  for (let x = -((offset) % 24) - 24; x < VIEW_W; x += 24) {
    ctx.fillStyle = C.cyan; ctx.fillRect(x, y + 3, 18, 5);
    ctx.fillStyle = C.bwhite; ctx.fillRect(x, y, 18, 3);
    ctx.fillStyle = C.blue; ctx.fillRect(x + 4, y + 9, 3, 3); ctx.fillRect(x + 11, y + 9, 3, 3);
  }
  const period = 12 * 24;                           // spires: a sparse pattern that repeats
  for (const sp of [0, 58, 96, 150, 172, 214, 236, 262]) {
    for (let x = sp - ((offset) % period) - period; x < VIEW_W; x += period) {
      ctx.fillStyle = C.byellow; ctx.fillRect(x, y - 12, 5, 12);
      ctx.fillStyle = C.yellow; ctx.fillRect(x + 1, y - 10, 1, 8); ctx.fillRect(x + 3, y - 10, 1, 8);
      ctx.fillStyle = C.byellow; ctx.fillRect(x + 1, y - 14, 3, 2);
    }
  }
}

/** The link window, as the panel's viewer shows it in play: a framed screen
 *  that locks on out of interference, then his face behind the scan lines. */
function drawLink(ctx, x, y, s, t) {
  ctx.fillStyle = C.white; ctx.fillRect(x - 1, y - 1, s + 2, s + 2);
  ctx.fillStyle = C.black; ctx.fillRect(x, y, s, s);
  ctx.save();
  ctx.beginPath(); ctx.rect(x, y, s, s); ctx.clip();
  if (t < 0.5) {
    for (let j = 0; j < s; j += 3) {
      ctx.fillStyle = (Math.floor(state.phase * 40) + j) % 6 < 3 ? C.white : C.black;
      ctx.fillRect(x, y + j, s, 2);
    }
  } else {
    ctx.fillStyle = "#0a1a2a"; ctx.fillRect(x, y, s, s);
    drawBossHead(ctx, x, y + 2, s, state.phase * 6);
    ctx.fillStyle = "rgba(255,255,255,0.08)";
    for (let j = 0; j < s; j += 2) ctx.fillRect(x, y + j, s, 1);
  }
  ctx.restore();
}

function drawPlaque(ctx, p) {
  const [paper, ink] = PLAQUE_COLOURS[p.c];
  ctx.save();
  ctx.translate(p.x + (p.sway || 0) + PLAQUE_W / 2, p.y + PLAQUE_H / 2);
  if (p.rot) ctx.rotate(p.rot);
  ctx.translate(-PLAQUE_W / 2, -PLAQUE_H / 2);
  ctx.fillStyle = ink;   ctx.fillRect(0, 0, PLAQUE_W, PLAQUE_H);
  ctx.fillStyle = paper; ctx.fillRect(1, 1, PLAQUE_W - 2, PLAQUE_H - 2);
  ctx.fillStyle = ink;   ctx.fillRect(3, 3, PLAQUE_W - 6, PLAQUE_H - 6);
  ctx.fillStyle = paper; ctx.fillRect(4, 4, PLAQUE_W - 8, PLAQUE_H - 8);
  const [a, b] = tx(["GAME", "OVER"]);
  drawText(ctx, a, (PLAQUE_W - textWidth(a)) / 2, 8, ink);
  drawText(ctx, b, (PLAQUE_W - textWidth(b)) / 2, 17, ink);
  ctx.restore();
}

function drawEnding(ctx) {
  const e = ending;
  drawFrame(ctx);
  ctx.save();
  ctx.beginPath(); ctx.rect(VIEW_X, VIEW_Y, VIEW_W, VIEW_H); ctx.clip();
  ctx.translate(VIEW_X, VIEW_Y);
  ctx.fillStyle = C.black; ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  if (e.phase === "getaway") {
    drawStarfield(ctx, "getaway");
    drawEndingCity(ctx, Math.floor(e.t * 72));
    drawShip(ctx, 62, 82 + Math.round(Math.sin(e.t * 3) * 1.5), e.t);
    drawMessage(ctx, tx(["AI DARE MAKES A GETAWAY!"]), true);
  } else if (e.phase === "countdown" || e.phase === "blast") {
    drawStarfield(ctx, "space");
    if (e.phase === "countdown") {
      drawGlobe(ctx, GLOBE.x, GLOBE.y, GLOBE.r, false);
      drawMessage(ctx, tx([COUNTDOWN[Math.min(4, Math.floor(e.t / 0.4))]]), true);
    } else {
      if (e.t < 0.25) drawGlobe(ctx, GLOBE.x, GLOBE.y, GLOBE.r + e.t * 20, true);
      for (const s of e.sparks) {
        ctx.fillStyle = s.cyan ? C.bcyan : C.bwhite;
        ctx.fillRect(Math.round(s.x), Math.round(s.y), 1, 1);
      }
    }
  } else if (e.phase === "skeleton") {
    drawStarfield(ctx, "space");
    drawGlobe(ctx, GLOBE.x, GLOBE.y, GLOBE.r, false);
    const page = skeletonPage(e.t);
    drawLink(ctx, 20, 78, 48, e.t);
    drawMessage(ctx, page.lines, true);
  } else if (e.phase === "knighthood") {
    drawMessage(ctx, tx(["WELL DONE SIR! THIS COULD", "GET YOU YOUR KNIGHTHOOD!"]), true);
  } else if (e.phase === "banner") {
    drawStarfield(ctx, "space");
    const a = tx(["OUT OF TIME"])[0], b = tx(["THE ASTEROID HITS EARTH"])[0];
    drawText(ctx, a, (VIEW_W - textWidth(a)) / 2, 56, C.byellow);
    drawText(ctx, b, (VIEW_W - textWidth(b)) / 2, 70, C.bwhite);
  } else if (e.phase === "plaques") {
    for (const p of e.plaques) drawPlaque(ctx, p);
  }
  ctx.restore();
  ctx.fillStyle = C.black;                              // no panel under the ending
  ctx.fillRect(0, VIEW_Y + VIEW_H + 2, SCREEN_W, SCREEN_H - VIEW_Y - VIEW_H - 2);
}

// ------------------------------------------------------------------ cheats
// Typed anywhere, best on the title page: DOORS opens every door, PARTS fits
// all five parts and starts the eleven-minute countdown, TIME stops the clock.
const CHEATS = {
  DOORS: () => { state.cheat.doors = true; note(["CHEAT: EVERY DOOR OPEN"], 3); },
  PARTS: () => { state.cheat.parts = true; state.fitted = 5; state.carrying = false; state.armed = true; state.timeLeft = 11 * 60 - 1; note(["CHEAT: MECHANISM ARMED"], 3); },
  TIME:  () => { state.cheat.time = true; note(["CHEAT: THE CLOCK STOPS"], 3); },
};
let cheatTyped = "";
function typeCheat(code) {                // the key's code, so any keyboard layout will do
  if (!code || !/^Key[A-Z]$/.test(code)) return;
  cheatTyped = (cheatTyped + code[3]).slice(-8);
  for (const code in CHEATS) if (cheatTyped.endsWith(code)) { CHEATS[code](); cheatTyped = ""; }
}
function cheatsOn() { return Object.keys(state.cheat).filter((k) => state.cheat[k]).map((k) => k.toUpperCase()); }
