// the original's title screen from the z80 the emulator boots with: step frames, measure the bottom line's scroll
const { boot } = require('./emu_lib');
(async () => {
  const E = await boot();
  const p = E.page;
  await p.evaluate(() => { emu.pause(); const w = window.__workers[0];
    window.__frame = () => new Promise((res) => { const h = (e) => { if (e.data.message === 'frameCompleted') { w.removeEventListener('message', h); res(); } }; w.addEventListener('message', h); w.postMessage({ message: 'runFrame', frameBuffer: new ArrayBuffer(26112) }); }); });
  const rows = async () => { const scr = await E.peek(0x4000, 6144); const out = []; for (let y = 168; y < 184; y++) { const a = ((y & 0xC0) << 5) | ((y & 7) << 8) | ((y & 0x38) << 2); let s = ''; for (let c = 0; c < 32; c++) s += scr[a + c].toString(2).padStart(8, '0'); out.push(s.replace(/0/g, '.').replace(/1/g, '#')); } return out; };
  const shift = (a, b) => { for (let d = 0; d < 16; d++) { let ok = true; for (let r = 0; r < a.length && ok; r++) if (a[r].slice(d + 16, 200) !== b[r].slice(16, 200 - d)) ok = false; if (ok) return d; } return -1; };
  // past the loading picture: a press of space, then a while for the title to come up
  await p.evaluate(() => { const w = window.__workers[0]; w.postMessage({ message: 'keyDown', row: 7, mask: 1 }); });
  for (let f = 0; f < 6; f++) await p.evaluate(() => __frame());
  await p.evaluate(() => { const w = window.__workers[0]; w.postMessage({ message: 'keyUp', row: 7, mask: 1 }); });
  for (let f = 0; f < 250; f++) await p.evaluate(() => __frame());
  let prev = await rows();
  console.log(prev.slice(2, 12).map((r) => r.slice(0, 120)).join('\n'));
  const log = [];
  for (let f = 1; f <= 24; f++) { await p.evaluate(() => __frame()); const cur = await rows(); log.push(`${f}: +${shift(prev, cur)} px`); prev = cur; }
  console.log(log.join('  '));
  await E.browser.close();
})();
