// Make a snapshot after a key script from another: node mksnap.js SNAP CELL SCRIPT OUT.json
const { boot, OUT } = require('./emu_lib');
const fs = require('fs');
const KEYS = { P: [5, 1], O: [5, 2], Q: [2, 1], A: [1, 1], SP: [7, 1] };
const [snap, cellArg, scriptJson, outName] = process.argv.slice(2);
(async () => {
  const E = await boot();
  await E.loadFile(snap, { 47714: 201, 44413: 201, 43526: 0 });
  await E.page.evaluate(() => {
    const w = window.__workers[0];
    window.__frames = (n) => new Promise((res) => { let left = n; const h = (e) => { if (e.data.message === 'frameCompleted') { if (--left <= 0) { w.removeEventListener('message', h); res(); } else w.postMessage({ message: 'runFrame', frameBuffer: new ArrayBuffer(26112) }); } }; w.addEventListener('message', h); w.postMessage({ message: 'runFrame', frameBuffer: new ArrayBuffer(26112) }); });
    window.__key = (row, mask, down) => w.postMessage({ message: down ? 'keyDown' : 'keyUp', row, mask });
    window.__step = async (keys, n) => { for (const [r, m] of keys) __key(r, m, true); await __frames(n); for (const [r, m] of keys) __key(r, m, false); const d = await __peek(0xC012, 2); const rm = await __peek(0x6297, 1); return { room: rm[0], y: d[0], x: d[1] }; };
    window.__exportNow = async () => { const s = await __snap(); const pages = {}; for (const p in s.memoryPages) { let b = ''; const u = s.memoryPages[p]; for (let i = 0; i < u.length; i++) b += String.fromCharCode(u[i]); pages[p] = btoa(b); } return { model: s.model, registers: s.registers, halted: s.halted, tstates: s.tstates, ulaState: s.ulaState, pages }; };
  });
  const step = (keys, n) => E.page.evaluate(([k, n]) => __step(k, n), [keys.map((k) => KEYS[k]), n]);
  let s = await step([], 5);
  const cell = +cellArg; for (let i = 0; i < 200 && s.x !== cell; i++) s = await step([s.x < cell ? 'P' : 'O'], 2);
  s = await step([], 20);
  for (const [k, n] of JSON.parse(scriptJson)) s = await step(Array.isArray(k) ? k : [k], n);
  s = await step([], 30);
  console.log('now', JSON.stringify(s));
  fs.writeFileSync(OUT + outName, JSON.stringify(await E.page.evaluate(() => __exportNow())));
  await E.browser.close();
})();
