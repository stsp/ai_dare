"use strict";
/* Playing with fingers.

   A tablet has no keys, so the screen itself becomes the control. In play the
   screen is read as places rather than buttons: a finger near a side wall runs
   Ai that way, near the ceiling jumps him, near the floor kneels him (and both
   of those ride the grav-lifts), and the target button beside the screen fires.
   Corners answer both at once, so a jump to the left is one touch on the top
   left. On the menus there is nothing to aim at but the words themselves: the
   drawing code marks each line the game listens for with `tapZone`, and a tap
   on the line is the key it names.

   Nothing here runs on a desktop: without a coarse pointer the whole layer
   stays out of the way and the keyboard is the only control, as before. */

/** A tablet or a phone: a coarse pointer with nothing to hover with. A laptop
 *  with a touchscreen keeps its mouse, so it keeps the desktop layout.
 *  `?touch=1` forces the controls on, `?touch=0` off - handy for a look on a
 *  desktop browser. */
const TOUCH = (() => {
  try {
    const forced = new URLSearchParams(location.search).get("touch");
    if (forced === "1") return true;
    if (forced === "0") return false;
    return matchMedia("(hover: none) and (pointer: coarse)").matches;
  } catch (e) { return false; }
})();

/** The room the target button wants beside the game screen. */
const TOUCH_PAD = 128;

/** How deep the running and jumping bands reach in from the screen's edges,
 *  as a share of it. The middle answers nothing, so a finger can rest there. */
const BAND_X = 0.3, BAND_Y = 0.28;

/* The places on the game's own 256x192 screen that answer a tap, as the
   drawing code marked them for the frame now on screen. */
const tapZones = [];
let zoneMode = null;              // the mode those zones were drawn for

/** Clear the frame's zones. The drawing code registers them again as it draws,
 *  so a line that moves - the menu pages roll - carries its zone with it. */
function clearTapZones() {
  if (!TOUCH) return;
  tapZones.length = 0;
  if (state.mode !== zoneMode) { zoneMode = state.mode; setHeld([]); }
}

/** Mark a place on the screen that answers a tap the way `code` does. */
function tapZone(x, y, w, h, code) {
  if (TOUCH) tapZones.push({ x, y, w, h, code });
}

/* ------------------------------------------------------------ the fingers */

let touchHeld = [];               // the codes the fingers are holding down now
const touchPoints = new Map();           // the touches on the game screen, by id

/** Hold exactly these keys down: what is new goes down, what is gone comes up.
 *  The game cannot tell them from the keyboard's. */
function setHeld(next) {
  for (const code of touchHeld) if (!next.includes(code)) releaseKey(code);
  for (const code of next) if (!touchHeld.includes(code)) pressKey(code);
  touchHeld = next;
}

/** A press and a release in one go, for the menus: the game reads a tap of the
 *  key on its next frame. */
function tapKey(code) {
  pressKey(code);
  releaseKey(code);
}

/** Ai answers the screen's places while he is on his feet in the asteroid, and
 *  while he flies the ship in through the opening run. */
function placesAnswer() {
  return state.mode === "play" || state.mode === "intro";
}

/** Where a touch landed, on the game's own 256x192 screen. */
function atScreen(touch, rect) {
  return {
    x: (touch.clientX - rect.left) / rect.width * SCREEN_W,
    y: (touch.clientY - rect.top) / rect.height * SCREEN_H,
  };
}

/** The keys the fingers now on the screen are holding between them. */
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
  return codes.filter((c, i) => codes.indexOf(c) === i);
}

function initTouch() {
  if (!TOUCH) return;
  document.body.classList.add("touch");

  /* The game screen and the target button side by side, so the button takes
     room of its own instead of sitting over the picture. */
  const stage = document.createElement("div");
  stage.id = "stage";
  canvas.parentNode.insertBefore(stage, canvas);
  stage.appendChild(canvas);

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
  stage.appendChild(fire);

  const help = document.getElementById("help");
  if (help) {
    help.innerHTML =
      "Tap near a side wall to run, near the ceiling to jump, near the floor to kneel " +
      "&mdash; both ride the grav-lifts. The target fires. On the menus, tap the line you want.";
  }

  /* --- the game screen: places, and the menus' own lines */

  const onScreenTouch = (e) => {
    e.preventDefault();
    const rect = canvas.getBoundingClientRect();
    for (const t of e.changedTouches) {
      if (e.type === "touchstart" || e.type === "touchmove") touchPoints.set(t.identifier, atScreen(t, rect));
      else touchPoints.delete(t.identifier);
    }
    if (e.type === "touchstart" && !placesAnswer()) {
      const p = atScreen(e.changedTouches[0], rect);
      const zone = tapZones.find((z) => p.x >= z.x && p.x <= z.x + z.w && p.y >= z.y && p.y <= z.y + z.h);
      if (zone) tapKey(zone.code);
    }
    setHeld(heldByPlaces());
  };
  for (const kind of ["touchstart", "touchmove", "touchend", "touchcancel"]) {
    canvas.addEventListener(kind, onScreenTouch, { passive: false });
  }

  /* --- the target: held down, it keeps firing, as the space bar does */

  const fireDown = (e) => { e.preventDefault(); fire.classList.add("down"); pressKey("Space"); };
  const fireUp = (e) => { e.preventDefault(); fire.classList.remove("down"); releaseKey("Space"); };
  fire.addEventListener("touchstart", fireDown, { passive: false });
  for (const kind of ["touchend", "touchcancel"]) {
    fire.addEventListener(kind, fireUp, { passive: false });
  }
  fire.addEventListener("contextmenu", (e) => e.preventDefault());

  /* --- nothing on the page scrolls, zooms or gets picked up by a stray tap */

  document.addEventListener("touchmove", (e) => { if (e.cancelable) e.preventDefault(); }, { passive: false });
  for (const kind of ["gesturestart", "gesturechange", "gestureend"]) {
    document.addEventListener(kind, (e) => e.preventDefault());
  }
  document.addEventListener("dblclick", (e) => e.preventDefault());

  /* the bars come and go and the tablet turns: the screen is sized again for
     what is left, and the fingers on it are forgotten */
  const refit = () => { touchPoints.clear(); setHeld([]); fitCanvas(); };
  window.addEventListener("orientationchange", refit);
  if (window.visualViewport) window.visualViewport.addEventListener("resize", refit);
}
