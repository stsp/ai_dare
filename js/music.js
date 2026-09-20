"use strict";
/* The title theme.
 *
 * Written for this project, and played the way the rest of the game's sound
 * is: square waves written sample by sample, so it keeps a chip's hard edge
 * and needs no audio file in the repository. Three voices - a melody, a bass
 * that walks root and fifth, and a noise line for the drums.
 *
 * The tune is sixteen bars of eight eighth-notes. A note name starts a note,
 * "-" holds the one before it, "." is silence. Edit the rows; they are the
 * score.
 */

const MUSIC_BPM = 140;

const MELODY = [
  "A4 .  C5 .  E5 .  D5 . ",
  "C5 .  B4 .  A4 -  -  . ",
  "F4 .  A4 .  D5 .  C5 . ",
  "B4 -  -  -  -  .  .  . ",
  "G4 .  B4 .  D5 .  C5 . ",
  "B4 .  A4 .  G4 -  -  . ",
  "A4 .  C5 .  E5 .  G5 . ",
  "A5 -  -  -  -  .  .  . ",
  "E5 .  E5 .  D5 .  C5 . ",
  "B4 .  C5 .  D5 -  -  . ",
  "C5 .  C5 .  B4 .  A4 . ",
  "G4 -  -  -  -  .  .  . ",
  "A4 .  C5 .  E5 .  D5 . ",
  "C5 .  B4 .  A4 -  -  . ",
  "F4 .  G4 .  A4 .  B4 . ",
  "A4 -  -  -  -  -  -  . ",
].join(" ").trim().split(/\s+/);

/* One chord a bar: the bass walks its root and fifth. */
const BASS = [
  ["A2", "E3"], ["A2", "E3"], ["D2", "A2"], ["E2", "B2"],
  ["G2", "D3"], ["G2", "D3"], ["A2", "E3"], ["A2", "E3"],
  ["E2", "B2"], ["E2", "B2"], ["A2", "E3"], ["G2", "D3"],
  ["A2", "E3"], ["A2", "E3"], ["D2", "A2"], ["A2", "E3"],
];

const SEMI = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

/** "A4" or "C#5" -> hertz. */
function noteHz(name) {
  const m = /^([A-G])(#?)(-?\d)$/.exec(name);
  if (!m) return 0;
  const midi = (parseInt(m[3], 10) + 1) * 12 + SEMI[m[1]] + (m[2] ? 1 : 0);
  return 440 * Math.pow(2, (midi - 69) / 12);
}

/** A square wave laid straight into the buffer, with a soft edge at each end
 *  so a note starts and stops without a click. `duty` gives each voice its
 *  own colour: a narrow pulse is thin and reedy, a half square is round. */
function square(d, start, len, hz, amp, duty, decay) {
  if (hz <= 0 || len <= 0) return;
  const edge = Math.min(220, len >> 3);           // ~5 ms of ramp
  let phase = 0;
  const step = hz / d.sampleRate;
  for (let i = 0; i < len && start + i < d.length; i++) {
    phase += step;
    if (phase >= 1) phase -= 1;
    let a = amp;
    if (decay) a *= 1 - (1 - decay) * (i / len);
    if (i < edge) a *= i / edge;
    else if (i > len - edge) a *= (len - i) / edge;
    d.data[start + i] += (phase < duty ? a : -a);
  }
}

/** The drums: a burst of noise whose amplitude falls away. A low `tone`
 *  mixed under it makes a kick, none at all makes a hat. */
function hit(d, start, len, amp, tone, rnd) {
  let phase = 0;
  for (let i = 0; i < len && start + i < d.length; i++) {
    const fall = 1 - i / len;
    let v = (rnd() * 2 - 1) * amp * fall * fall;
    if (tone) {
      phase += (tone * (0.3 + 0.7 * fall)) / d.sampleRate;
      if (phase >= 1) phase -= 1;
      v += (phase < 0.5 ? amp : -amp) * fall * fall * 0.8;
    }
    d.data[start + i] += v;
  }
}

/** A small deterministic generator, so the drums sound the same every time. */
function musicRng(seed) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

/** Render the whole loop once into a buffer the browser can repeat. */
function renderTheme(ctx) {
  const sr = ctx.sampleRate;
  const eighth = 60 / MUSIC_BPM / 2;              // seconds per eighth-note
  const n = Math.ceil(MELODY.length * eighth * sr);
  const buf = ctx.createBuffer(1, n, sr);
  const d = { data: buf.getChannelData(0), sampleRate: sr, length: n };
  const rnd = musicRng(0x51de);
  const at = (slot) => Math.floor(slot * eighth * sr);

  // the melody: a note runs until the next name or rest
  for (let i = 0; i < MELODY.length; i++) {
    const tok = MELODY[i];
    if (tok === "." || tok === "-") continue;
    let held = 1;
    while (i + held < MELODY.length && MELODY[i + held] === "-") held++;
    square(d, at(i), Math.floor(held * eighth * sr) - 200, noteHz(tok), 0.20, 0.5, 0.55);
  }

  // the bass: root and fifth, two eighths each, all bar long
  for (let bar = 0; bar < BASS.length; bar++) {
    for (let step = 0; step < 4; step++) {
      const hz = noteHz(BASS[bar][step % 2]);
      square(d, at(bar * 8 + step * 2), Math.floor(2 * eighth * sr) - 300, hz, 0.16, 0.25, 0.4);
    }
  }

  // the drums: a kick on one and three, a hat on the offbeats
  for (let bar = 0; bar < BASS.length; bar++) {
    for (let e = 0; e < 8; e++) {
      const s = at(bar * 8 + e);
      if (e === 0 || e === 4) hit(d, s, Math.floor(0.11 * sr), 0.16, 70, rnd);
      if (e % 2 === 1) hit(d, s, Math.floor(0.035 * sr), 0.05, 0, rnd);
    }
  }
  return buf;
}

/* One theme at a time: start() is safe to call twice, stop() fades out so the
   loop does not end on a click. */
const music = (() => {
  let buf = null, src = null, gain = null;
  return {
    start() {
      try {
        if (src) return;
        if (!actx) actx = new (window.AudioContext || window.webkitAudioContext)();
        if (actx.state === "suspended") actx.resume();
        if (!buf) buf = renderTheme(actx);
        gain = actx.createGain();
        gain.gain.value = 0.5;
        src = actx.createBufferSource();
        src.buffer = buf;
        src.loop = true;
        src.connect(gain); gain.connect(actx.destination);
        src.start();
      } catch (e) { /* no audio available */ }
    },
    stop() {
      try {
        if (!src) return;
        const s = src, t = actx.currentTime;
        gain.gain.setValueAtTime(gain.gain.value, t);
        gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.4);
        s.stop(t + 0.45);
        src = null; gain = null;
      } catch (e) { src = null; gain = null; }
    },
    playing() { return !!src; },
  };
})();
