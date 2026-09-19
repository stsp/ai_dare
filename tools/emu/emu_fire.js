// Like emu_fire.js, with keys tapped before and keys held with fire: node emu_fire2.js SNAP FRAMES NAME "O,O" "A"
const { boot, OUT } = require('./emu_lib');
const fs = require('fs');
const KEYS = { P: [5, 1], O: [5, 2], Q: [2, 1], A: [1, 1], SP: [7, 1] };
const [snap, framesArg, outName, preArg, holdArg] = process.argv.slice(2);
const SPF = 882;
(async () => {
  const E = await boot();
  await E.loadFile(snap);
  await E.page.evaluate((SPF) => {
    const w = window.__workers[0];
    window.__frameA = () => new Promise((res) => {
      const h = (e) => { if (e.data.message === 'frameCompleted') { w.removeEventListener('message', h); res(Array.from(new Float32Array(e.data.audioBufferLeft))); } };
      w.addEventListener('message', h);
      w.postMessage({ message: 'runFrame', frameBuffer: new ArrayBuffer(26112), audioBufferLeft: new ArrayBuffer(SPF * 4), audioBufferRight: new ArrayBuffer(SPF * 4) });
    });
    window.__key = (row, mask, down) => w.postMessage({ message: down ? 'keyDown' : 'keyUp', row, mask });
  }, SPF);
  const key = (k, down) => E.page.evaluate(([r, m, d]) => __key(r, m, d), [...KEYS[k], down]);
  for (let i = 0; i < 25; i++) await E.page.evaluate(() => __frameA());
  for (const spec of (preArg || '').split(',').filter(Boolean)) { const [k, n] = spec.split(':'); await key(k, true); for (let i = 0; i < +(n || 1); i++) await E.page.evaluate(() => __frameA()); await key(k, false); await E.page.evaluate(() => __frameA()); }
  for (let i = 0; i < 10; i++) await E.page.evaluate(() => __frameA());
  const hold = (holdArg || '').split(',').filter(Boolean);
  for (const k of hold) await key(k, true);
  for (let i = 0; i < 10; i++) await E.page.evaluate(() => __frameA());
  await key('SP', true);
  const audio = []; const n = +framesArg;
  for (let t = 0; t < n; t++) {
    audio.push(...await E.page.evaluate(() => __frameA()));
    fs.writeFileSync(`${OUT}${outName}_${String(t).padStart(3, '0')}.scr`, Buffer.from(await E.peek(0x4000, 6912)));
  }
  await key('SP', false); for (const k of hold) await key(k, false);
  fs.writeFileSync(`${OUT}${outName}_audio.f32`, Buffer.from(new Float32Array(audio).buffer));
  const d = await E.peek(0xC012, 2); const rm = await E.peek(0x6297, 1);
  console.log('room', rm[0], 'x', d[1], 'y', d[0], 'frames', n);
  await E.browser.close();
})();
