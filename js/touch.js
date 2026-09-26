"use strict";
/* Playing without the keyboard: fingers, or the mouse.

   A tablet has no keys, so the screen itself becomes the control. In play the
   screen is read as places rather than buttons: a finger near a side wall runs
   Ai that way, near the ceiling jumps him, near the floor kneels him (and both
   of those ride the grav-lifts), and the target button beside the screen fires.
   Corners answer both at once, so a jump to the left is one touch on the top
   left. On the menus there is nothing to aim at but the words themselves: the
   drawing code marks each line the game listens for with `tapZone`, and a tap
   on the line is the key it names.

   The menus can also be worked without aiming: the wheel and the keypad's up
   and down walk a cursor through the lines, and the target picks the one it
   rests on.

   The mouse has buttons of its own and does not aim at the picture at all:
   the left button runs Ai left, the right button runs him right, the middle
   one fires, and the wheel is up and down - a notch forward jumps, a notch
   back kneels, and both ride the grav-lifts. Those never change. On the menus
   any button picks the line under the pointer, as a finger does. A stylus
   draws where a finger would, and the target button answers any of the three.

   Beside the screen stand two controls: the target that fires, and a keypad
   for anyone who would rather aim at a control than at the picture. The
   keypad is read in thirds, so its corners run and jump at once, as the
   screen's own corners do.

   Which side each stands on is the fourth line of the options page: the
   target on the left and the keypad on the right, the way the game comes, or
   the two the other way about. It is the only thing that line does, and it is
   remembered.

   The screen controls are there on every machine, whatever it is played on.
   A desktop browser shows them too: they are targets to click as well as to
   tap, and they cost the keyboard nothing. */

/** `?touch=1` plays the screen controls with the mouse standing in for a
 *  finger, for a look at the tablet's game from a desktop; `?touch=0` takes
 *  the screen controls away and leaves the keyboard and the mouse.
 *
 *  Nothing else is asked of the browser. Whether there is a touch screen to
 *  play on cannot be told apart from whether there is a mouse: a tablet with
 *  a trackpad plugged in, or one whose stylus hovers, answers like a desktop,
 *  and a laptop with a touch screen answers like a tablet. So the controls do
 *  not wait to be asked for - they are there on every machine. */
const FORCED_TOUCH = (() => {
  try { return new URLSearchParams(location.search).get("touch"); } catch (e) { return null; }
})();

const TOUCH = FORCED_TOUCH !== "0";

/** The room one control wants beside the game screen. On its side there is
 *  one at each end of the screen; upright the two stand in a row beneath it,
 *  and between them they want that much height once. */
const TOUCH_PAD = 128;

/** How deep the running and jumping bands reach in from the screen's edges,
 *  as a share of it. The middle answers nothing, so a finger can rest there. */
const BAND_X = 0.3, BAND_Y = 0.28;

/* The places on the game's own 256x192 screen that answer a tap or a click, as
   the drawing code marked them for the frame now on screen. */
const tapZones = [];
let zoneMode = null;              // the mode those zones were drawn for

/** Clear the frame's zones. The drawing code registers them again as it draws,
 *  so a line that moves - the menu pages roll - carries its zone with it. */
function clearTapZones() {
  tapZones.length = 0;
  if (state.mode !== zoneMode) { zoneMode = state.mode; cursor = null; letGo(); }
}

/** Mark a place on the screen that answers a tap the way `code` does. */
function tapZone(x, y, w, h, code) {
  tapZones.push({ x, y, w, h, code });
}

/** The zone a point on the game screen falls in, if any. */
function zoneAt(p) {
  return tapZones.find((z) => p.x >= z.x && p.x <= z.x + z.w && p.y >= z.y && p.y <= z.y + z.h);
}

/* ------------------------------------------------------------- the cursor
   A menu can be worked without aiming at it at all: the wheel and the
   keypad's up and down walk a cursor through the lines the screen listens
   for, and the target picks the one it rests on. It is not there until it is
   asked for - the first notch or press puts it up - so anyone tapping or
   clicking the lines never sees it. A screen with only one line to aim at has
   nothing to walk through, so there it stays away. */

let cursor = null;                // the code of the line the cursor rests on

/** The screens the cursor belongs to: the ones that are read, not played. */
function menuNow() {
  return state.mode === "splash" || state.mode === "title" ||
         state.mode === "options" || state.mode === "ending";
}

/** Walk the cursor by what the frame's up and down did. Called before the
 *  frame is drawn, so the zones are the ones the player is looking at. */
function steerCursor() {
  if (!menuNow()) { cursor = null; return; }
  const codes = tapZones.map((z) => z.code);
  const step = (tapped.ArrowDown ? 1 : 0) - (tapped.ArrowUp ? 1 : 0);
  if (!step || codes.length < 2) return;
  const at = codes.indexOf(cursor);
  cursor = at < 0 ? (step > 0 ? codes[0] : codes[codes.length - 1])
                  : codes[(at + step + codes.length) % codes.length];
}

/** The zone the cursor rests on, if it is up and its line is on screen: the
 *  title page rolls, and a line that has rolled away answers nothing. */
function cursorZone() {
  return cursor === null ? null : tapZones.find((z) => z.code === cursor) || null;
}

/** The target, pressed on a menu, picks the line the cursor rests on. True
 *  when it did, so the target knows not to fire as well. */
function cursorPick() {
  const zone = cursorZone();
  if (!zone) return false;
  tapKey(zone.code);
  return true;
}

/** The mark itself: an arrowhead at the head of the line it rests on. A line
 *  that runs the width of the screen has no room outside it, so the mark
 *  keeps inside the frame and takes the margin before the line's first
 *  letter. */
function drawCursor(ctx) {
  const zone = cursorZone();
  if (!zone) return;
  const x = Math.max(VIEW_X + 1, zone.x - 7), y = zone.y + zone.h / 2;
  ctx.fillStyle = C.byellow;
  ctx.beginPath();
  ctx.moveTo(x, y - 4);
  ctx.lineTo(x + 6, y);
  ctx.lineTo(x, y + 4);
  ctx.closePath();
  ctx.fill();
}

/* ------------------------------------------------- the fingers and the mouse */

let pointerHeld = [];             // the codes the pointers are holding down now
const touchPoints = new Map();    // the touches on the game screen, by id
const padPoints = new Map();      // the fingers on the keypad, by pointer id
const mouseRun = new Set();       // the way keys the mouse's own buttons hold
let mouseFiring = false;          // the middle button, held down on the game screen
let wheelCode = null;             // the key a notch of the wheel is holding
let wheelTimer = 0;
const WHEEL_HOLD = 160;           // ms a notch holds its key: long enough for a jump

/** The wheel's key, let go of - unless a finger or the driving button is on it. */
function endWheel() {
  clearTimeout(wheelTimer);
  if (wheelCode && !pointerHeld.includes(wheelCode)) releaseKey(wheelCode);
  wheelCode = null;
}

/** Hold exactly these keys down: what is new goes down, what is gone comes up.
 *  The game cannot tell them from the keyboard's. */
function setHeld(next) {
  for (const code of pointerHeld) if (!next.includes(code)) releaseKey(code);
  for (const code of next) if (!pointerHeld.includes(code)) pressKey(code);
  pointerHeld = next;
}

/** A press and a release in one go, for the menus: the game reads a tap of the
 *  key on its next frame. */
function tapKey(code) {
  pressKey(code);
  releaseKey(code);
}

/** Everything the fingers and the mouse were holding, let go of: the screen has
 *  moved on to another mode, or the pointer has left it. */
function letGo() {
  touchPoints.clear();
  padPoints.clear();
  mouseRun.clear();
  setHeld([]);
  endWheel();
  if (mouseFiring) { mouseFiring = false; releaseKey("Space"); }
}

/** Ai answers the screen's places while he is on his feet in the asteroid, and
 *  while he flies the ship in through the opening run. */
function placesAnswer() {
  return state.mode === "play" || state.mode === "intro";
}

/** Where a touch or a click landed, on the game's own 256x192 screen. */
function atScreen(point, rect) {
  return {
    x: (point.clientX - rect.left) / rect.width * SCREEN_W,
    y: (point.clientY - rect.top) / rect.height * SCREEN_H,
  };
}

/** The keys the pointers now on the screen are holding between them. */
function heldByPlaces() {
  if (!placesAnswer()) return [];
  const codes = [];
  for (const p of touchPoints.values()) {
    const fx = p.x / SCREEN_W, fy = p.y / SCREEN_H;
    if (fx < BAND_X) codes.push("ArrowLeft");
    else if (fx > 1 - BAND_X) codes.push("ArrowRight");
    if (fy < BAND_Y) codes.push("ArrowUp");
    else if (fy > 1 - BAND_Y) codes.push("ArrowDown");
  }
  return codes;
}

/** The keys the fingers on the keypad are holding. The pad is read in thirds
 *  each way, so a finger in a corner holds two and runs while it jumps, and
 *  the middle holds nothing. It answers on the menus as well as in play:
 *  there its up and down walk the cursor, a line to a press. */
function heldByPad() {
  const codes = [];
  for (const p of padPoints.values()) {
    if (p.fx < 1 / 3) codes.push("ArrowLeft");
    else if (p.fx > 2 / 3) codes.push("ArrowRight");
    if (p.fy < 1 / 3) codes.push("ArrowUp");
    else if (p.fy > 2 / 3) codes.push("ArrowDown");
  }
  return codes;
}

/** The way keys the mouse's own buttons are holding. */
function heldByMouse() {
  return placesAnswer() ? [...mouseRun] : [];
}

/** Everything the screen, the keypad and the mouse hold between them. */
function refreshHeld() {
  const codes = [...heldByPlaces(), ...heldByPad(), ...heldByMouse()];
  setHeld(codes.filter((c, i) => codes.indexOf(c) === i));
  const pad = document.getElementById("pad");
  if (pad) {
    const lit = heldByPad();
    for (const way of ["left", "right", "up", "down"]) {
      pad.classList.toggle(way, lit.includes("Arrow" + way[0].toUpperCase() + way.slice(1)));
    }
  }
}

function initTouch() {
  initMouse();
  if (TOUCH) addScreenControls();
}

/** The target button, the layout that makes room for it, and the screen that
 *  answers fingers. */
function addScreenControls() {
  document.body.classList.add("touch");

  /* The game screen and the target button side by side, so the button takes
     room of its own instead of sitting over the picture. */
  const stage = document.createElement("div");
  stage.id = "stage";
  canvas.parentNode.insertBefore(stage, canvas);
  stage.appendChild(canvas);

  /* the two controls live in a box of their own, so that upright they can
     stand in one row under the screen while on its side they take an end of
     the stage each (the box is `display: contents` there, and they become the
     stage's own children) */
  const controls = document.createElement("div");
  controls.id = "controls";
  stage.appendChild(controls);

  const fire = document.createElement("button");
  fire.id = "fire";
  fire.type = "button";
  fire.setAttribute("aria-label", "Fire");
  fire.innerHTML =
    '<svg viewBox="0 0 48 48" aria-hidden="true">' +
    '<circle cx="24" cy="24" r="17" fill="none" stroke="currentColor" stroke-width="3"/>' +
    '<circle cx="24" cy="24" r="7" fill="none" stroke="currentColor" stroke-width="3"/>' +
    '<circle cx="24" cy="24" r="2.5" fill="currentColor"/>' +
    '<path d="M24 1v11M24 36v11M1 24h11M36 24h11" stroke="currentColor" stroke-width="3" ' +
    'stroke-linecap="round"/></svg>';
  controls.appendChild(fire);

  const pad = document.createElement("div");
  pad.id = "pad";
  pad.setAttribute("aria-label", "Move");
  pad.innerHTML =
    '<svg viewBox="0 0 48 48" aria-hidden="true">' +
    '<path class="up" d="M24 2 31 17H17Z"/><path class="down" d="M24 46 31 31H17Z"/>' +
    '<path class="left" d="M2 24 17 17V31Z"/><path class="right" d="M46 24 31 17V31Z"/></svg>';
  controls.appendChild(pad);
  showFireSide();

  /* --- the game screen: places, and the menus' own lines */

  const onScreenTouch = (e) => {
    e.preventDefault();
    const rect = canvas.getBoundingClientRect();
    for (const t of e.changedTouches) {
      if (e.type === "touchstart" || e.type === "touchmove") touchPoints.set("t" + t.identifier, atScreen(t, rect));
      else touchPoints.delete("t" + t.identifier);
    }
    if (e.type === "touchstart" && !placesAnswer()) {
      const zone = zoneAt(atScreen(e.changedTouches[0], rect));
      if (zone) tapKey(zone.code);
    }
    refreshHeld();
  };
  for (const kind of ["touchstart", "touchmove", "touchend", "touchcancel"]) {
    canvas.addEventListener(kind, onScreenTouch, { passive: false });
  }

  /* a stylus draws on the glass where a finger would, and has no second button
     to drive with, so the screen reads it as one more finger */
  const onScreenPen = (e) => {
    if (e.pointerType !== "pen") return;
    e.preventDefault();
    const key = "p" + e.pointerId;
    if (e.type === "pointerdown" || e.type === "pointermove") {
      const p = atScreen(e, canvas.getBoundingClientRect());
      if (e.type === "pointerdown") {
        canvas.setPointerCapture(e.pointerId);   // a stylus that slides off still lets go
        if (!placesAnswer()) {
          const zone = zoneAt(p);
          if (zone) tapKey(zone.code);
        }
      }
      touchPoints.set(key, p);
    } else {
      touchPoints.delete(key);
    }
    refreshHeld();
  };
  for (const kind of ["pointerdown", "pointermove", "pointerup", "pointercancel"]) {
    canvas.addEventListener(kind, onScreenPen, { passive: false });
  }

  /* --- the target: held down, it keeps firing, as the space bar does.
         A finger, a stylus and a mouse all press it, so the button answers
         pointers rather than touches alone: a tablet driven with a pen or a
         mouse - or a desktop browser showing the tablet's controls - fires
         too, where a touch-only button stayed silent. */

  let firePicked = false;                        // the press went to the cursor's line
  const fireDown = (e) => {
    e.preventDefault();
    fire.setPointerCapture(e.pointerId);         // a finger that slides off still lets go
    fire.classList.add("down");
    firePicked = cursorPick();                   // on a menu with the cursor up, it picks
    if (!firePicked) pressKey("Space");
  };
  const fireUp = (e) => {
    e.preventDefault();
    fire.classList.remove("down");
    if (firePicked) { firePicked = false; return; }
    releaseKey("Space");
  };
  fire.addEventListener("pointerdown", fireDown, { passive: false });
  for (const kind of ["pointerup", "pointercancel"]) {
    fire.addEventListener(kind, fireUp, { passive: false });
  }
  fire.addEventListener("contextmenu", (e) => e.preventDefault());

  /* --- the keypad, read in thirds: where the finger sits on it is what it
         holds, and sliding across it turns Ai round without letting go */

  const onPad = (e) => {
    e.preventDefault();
    if (e.type === "pointerdown" || e.type === "pointermove") {
      if (e.type === "pointerdown") pad.setPointerCapture(e.pointerId);
      else if (!padPoints.has(e.pointerId)) return;      // a finger merely passing over
      const r = pad.getBoundingClientRect();
      padPoints.set(e.pointerId, { fx: (e.clientX - r.left) / r.width, fy: (e.clientY - r.top) / r.height });
    } else {
      padPoints.delete(e.pointerId);
    }
    refreshHeld();
  };
  for (const kind of ["pointerdown", "pointermove", "pointerup", "pointercancel", "pointerleave"]) {
    pad.addEventListener(kind, onPad, { passive: false });
  }
  pad.addEventListener("contextmenu", (e) => e.preventDefault());

  /* --- nothing on the page scrolls, zooms or gets picked up by a stray tap.
         A desktop has nothing to scroll to anyway: the screen is sized to the
         window, so this costs the mouse and the keyboard nothing. */

  document.addEventListener("touchmove", (e) => { if (e.cancelable) e.preventDefault(); }, { passive: false });
  for (const kind of ["gesturestart", "gesturechange", "gestureend"]) {
    document.addEventListener(kind, (e) => e.preventDefault());
  }
  document.addEventListener("dblclick", (e) => e.preventDefault());

  /* the bars come and go and the tablet turns: the screen is sized again for
     what is left, and the fingers on it are forgotten */
  const refit = () => { letGo(); fitCanvas(); };
  window.addEventListener("orientationchange", refit);
  if (window.visualViewport) window.visualViewport.addEventListener("resize", refit);
}

/** Which side of the screen the target stands on, and the keypad opposite it:
 *  the target on the left the way the game comes, or the two the other way
 *  about, as the options page's fourth line says. */
function showFireSide() {
  document.body.classList.toggle("fire-right", !!options.targetRight);
}

/** The mouse plays by its own buttons, not by where it points: the left one
 *  runs Ai left, the right one runs him right and the middle one fires. On
 *  the menus any button picks the line under the pointer, the same places a
 *  finger answers. */
function initMouse() {
  const where = (e) => atScreen(e, canvas.getBoundingClientRect());
  const RUNS = { 0: "ArrowLeft", 2: "ArrowRight" };   // 0 the left button, 2 the right
  const FIRES = 1;                                    // 1 the middle one
  const DOWN = { 0: 1, 1: 4, 2: 2 };                  // the same buttons in an event's mask
  // `?touch=1` is the screen controls put on a desktop for a look, so there
  // the mouse stands in for a finger instead: press, drag and let go of the
  // left button where a finger would land
  const asFinger = () => FORCED_TOUCH === "1";
  const fingerGone = () => { if (touchPoints.delete("mouse")) refreshHeld(); };
  const stopFire = () => { if (mouseFiring) { mouseFiring = false; releaseKey("Space"); } };
  const stopAll = () => { fingerGone(); stopFire(); mouseRun.clear(); refreshHeld(); };

  // over the game screen the right button is a control, not a menu
  canvas.addEventListener("contextmenu", (e) => e.preventDefault());

  canvas.addEventListener("mousedown", (e) => {
    if (e.button !== 0 && e.button !== 1 && e.button !== 2) return;
    e.preventDefault();                          // no menu, and no middle-button scrolling
    if (!placesAnswer()) {                       // on the menus any button picks
      const zone = zoneAt(where(e));
      if (zone) tapKey(zone.code);
      return;
    }
    if (asFinger()) {
      if (e.button !== 0) return;
      touchPoints.set("mouse", where(e));
      refreshHeld();
      return;
    }
    if (e.button === FIRES) { mouseFiring = true; pressKey("Space"); return; }
    mouseRun.add(RUNS[e.button]);
    refreshHeld();
  });
  canvas.addEventListener("auxclick", (e) => e.preventDefault());

  canvas.addEventListener("mousemove", (e) => {
    if (asFinger()) {
      if (!touchPoints.has("mouse")) return;
      if (!(e.buttons & 1)) return fingerGone();  // let go elsewhere
      touchPoints.set("mouse", where(e));
      refreshHeld();
      return;
    }
    // a button let go where no event reached us is a button no longer down
    let changed = false;
    for (const b of [0, 2]) {
      if (mouseRun.has(RUNS[b]) && !(e.buttons & DOWN[b])) { mouseRun.delete(RUNS[b]); changed = true; }
    }
    if (mouseFiring && !(e.buttons & DOWN[FIRES])) stopFire();
    if (changed) refreshHeld();
  });

  // a button let go anywhere counts, wherever the pointer has wandered to, and
  // a window that loses focus leaves nothing held down
  window.addEventListener("mouseup", (e) => {
    if (asFinger()) return fingerGone();
    if (e.button === FIRES) stopFire();
    if (RUNS[e.button] && mouseRun.delete(RUNS[e.button])) refreshHeld();
  });
  window.addEventListener("blur", stopAll);

  /* The wheel is up and down: in play a notch forward jumps and rides a
     grav-lift up, a notch back kneels and rides one down, and on the menus a
     notch walks the cursor a line. A notch is an instant, and the game reads
     keys that are held, so each notch holds its key for a moment and the next
     notch keeps it held. */
  canvas.addEventListener("wheel", (e) => {
    e.preventDefault();
    if (!e.deltaY) return;
    const code = e.deltaY < 0 ? "ArrowUp" : "ArrowDown";
    if (wheelCode && wheelCode !== code) endWheel();
    wheelCode = code;
    pressKey(code);
    clearTimeout(wheelTimer);
    wheelTimer = setTimeout(endWheel, WHEEL_HOLD);
  }, { passive: false });
}
