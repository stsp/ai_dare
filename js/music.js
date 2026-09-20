"use strict";
/* The game's two themes.
 *
 * Written for this project, and played the way the rest of the sound is:
 * square waves written sample by sample, so they carry a chip's hard edge
 * and need no audio file in the repository. Three voices - a melody, a bass
 * that walks root and fifth, and noise bursts for the drums.
 *
 * A score is rows of eight eighth-notes to the bar. A note name starts a
 * note, "-" holds the one before it, "." is silence. The rows are the score:
 * edit them and the tune changes.
 */

const SCORES = {
  /* The title: A minor, quick and on the march. */
  title: {
    bpm: 140, drums: "march",
    melody: [
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
    ],
    bass: [
      ["A2", "E3"], ["A2", "E3"], ["D2", "A2"], ["E2", "B2"],
      ["G2", "D3"], ["G2", "D3"], ["A2", "E3"], ["A2", "E3"],
      ["E2", "B2"], ["E2", "B2"], ["A2", "E3"], ["G2", "D3"],
      ["A2", "E3"], ["A2", "E3"], ["D2", "A2"], ["A2", "E3"],
    ],
  },

  /* The ending: C major, half the pace, and it closes rather than drives.
     Four bars, long enough to play once under the falling plaques. */
  ending: {
    bpm: 96, drums: "soft",
    melody: [
      "C5 -  -  .  E5 -  G5 - ",
      "A5 -  -  -  G5 -  -  . ",
      "F5 -  E5 -  D5 -  -  . ",
      "C5 -  -  -  -  -  -  - ",
    ],
    bass: [["C2", "G2"], ["A2", "E3"], ["F2", "C3"], ["C2", "G2"]],
  },
};

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
  const edge = Math.min(220, len >> 3);              // ~5 ms of ramp
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

/** Render one pass of a score into a buffer the browser can repeat. */
function renderScore(ctx, score) {
  const notes = score.melody.join(" ").trim().split(/\s+/);
  const sr = ctx.sampleRate;
  const eighth = 60 / score.bpm / 2;                 // seconds per eighth-note
  const n = Math.ceil(notes.length * eighth * sr);
  const buf = ctx.createBuffer(1, n, sr);
  const d = { data: buf.getChannelData(0), sampleRate: sr, length: n };
  const rnd = musicRng(0x51de);
  const at = (slot) => Math.floor(slot * eighth * sr);

  // the melody: a note runs until the next name or rest
  for (let i = 0; i < notes.length; i++) {
    const tok = notes[i];
    if (tok === "." || tok === "-") continue;
    let held = 1;
    while (i + held < notes.length && notes[i + held] === "-") held++;
    square(d, at(i), Math.floor(held * eighth * sr) - 200, noteHz(tok), 0.20, 0.5, 0.55);
  }

  // the bass: root and fifth, two eighths each, all bar long
  for (let bar = 0; bar < score.bass.length; bar++) {
    for (let step = 0; step < 4; step++) {
      const hz = noteHz(score.bass[bar][step % 2]);
      square(d, at(bar * 8 + step * 2), Math.floor(2 * eighth * sr) - 300, hz, 0.16, 0.25, 0.4);
    }
  }

  // the drums: on the march, a kick on one and three with hats between;
  // soft, just a low beat at the head of the bar
  for (let bar = 0; bar < score.bass.length; bar++) {
    for (let e = 0; e < 8; e++) {
      const s = at(bar * 8 + e);
      if (score.drums === "march") {
        if (e === 0 || e === 4) hit(d, s, Math.floor(0.11 * sr), 0.16, 70, rnd);
        if (e % 2 === 1) hit(d, s, Math.floor(0.035 * sr), 0.05, 0, rnd);
      } else if (score.drums === "soft" && e === 0) {
        hit(d, s, Math.floor(0.16 * sr), 0.09, 55, rnd);
      }
    }
  }
  return buf;
}

/* One theme at a time. start(name) is safe to call twice - asking for the one
   already playing changes nothing - and switching cuts the old one first.
   stop() fades out so a theme never ends on a click. */
const music = (() => {
  const buffers = {};
  let src = null, gain = null, current = null;
  const fade = (g, s, secs) => {
    const t = actx.currentTime;
    g.gain.setValueAtTime(g.gain.value, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + secs);
    s.stop(t + secs + 0.05);
  };
  return {
    start(name) {
      try {
        const score = SCORES[name];
        if (!score || current === name) return;
        if (!actx) actx = new (window.AudioContext || window.webkitAudioContext)();
        if (actx.state === "suspended") actx.resume();
        if (src) { fade(gain, src, 0.25); src = null; gain = null; }
        if (!buffers[name]) buffers[name] = renderScore(actx, score);
        gain = actx.createGain();
        gain.gain.value = 0.5;
        src = actx.createBufferSource();
        src.buffer = buffers[name];
        src.loop = true;
        src.connect(gain); gain.connect(actx.destination);
        src.start();
        current = name;
      } catch (e) { current = null; }
    },
    stop() {
      try {
        if (src) fade(gain, src, 0.4);
      } catch (e) { /* no audio available */ }
      src = null; gain = null; current = null;
    },
    playing() { return current; },
  };
})();
