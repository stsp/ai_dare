// Drive Dan from a room's snapshot with the guns live and film it: node emu_gunshoot.js SNAP NAME "O:30,Q:6,W:60,A+SP:100"
// (K:n holds key K for n frames, K+K2:n holds both, W:n waits); every second frame's screen is saved as NAME_nnn.scr,
// the gun table (0x62A5) and Dan's cell are logged every ten frames.
const { boot, OUT } = require('./emu_lib');
const fs = require('fs');
const KEYS = { P: [5, 1], O: [5, 2], Q: [2, 1], A: [1, 1], SP: [7, 1] };
const [snap, name, script] = process.argv.slice(2);
(async () => {
  const E = await boot();
  await E.loadFile(snap, { 47714: 201, 43526: 0, 44413: 0xCD });   // energy and ammo unlimited, the guns' CALL put back
  await E.page.evaluate(() => {
    const w = window.__workers[0];
    window.__frame = () => new Promise((res) => { const h = (e) => { if (e.data.message === 'frameCompleted') { w.removeEventListener('message', h); res(); } }; w.addEventListener('message', h); w.postMessage({ message: 'runFrame', frameBuffer: new ArrayBuffer(26112) }); });
    window.__key = (row, mask, down) => w.postMessage({ message: down ? 'keyDown' : 'keyUp', row, mask });
    window.__run = async (keys, n, t0) => {
      for (const [r, m] of keys) __key(r, m, true);
      const out = [];
      for (let i = 0; i < n; i++) {
        await __frame(); const t = t0 + i;
        const rec = { t };
        if (t % 2 === 0) rec.scr = await __peek(0x4000, 6912);
        if (t % 10 === 0) { rec.guns = await __peek(0x62A5, 32); const d = await __peek(0xC012, 2); rec.x = d[1]; rec.y = d[0]; rec.room = (await __peek(0x6297, 1))[0]; rec.shots = await __peek(0x6299, 12); if (window.__vars) rec.vars = await __peek(0x6200, 0x100); }
        out.push(rec);
      }
      for (const [r, m] of keys) __key(r, m, false);
      return out;
    };
  });
  if (process.env.VARS) await E.page.evaluate(() => { window.__vars = true; });
  let t = 0; const log = []; const vars = [];
  for (const tok of script.split(',')) {
    const [k, n] = tok.split(':'); const keys = k === 'W' ? [] : k.split('+').map((x) => KEYS[x]);
    const recs = await E.page.evaluate(([k, n, t]) => __run(k, n, t), [keys, +n, t]);
    for (const r of recs) {
      if (r.scr) fs.writeFileSync(`${OUT}${name}_${String(r.t).padStart(4, '0')}.scr`, Buffer.from(r.scr));
      if (r.guns) { const g = []; for (let i = 0; i < 32 && !(r.guns[i] === 255 && r.guns[i + 1] === 255); i += 4) g.push(`${r.guns[i].toString(16)}:${r.guns[i + 1].toString(16)}`); if (r.vars) vars.push([r.t, r.vars]); log.push(`${r.t} room ${r.room} dan ${r.x},${r.y} guns ${g.join(' ')} shots ${r.shots.map((b) => b.toString(16)).join(' ')}`); }
    }
    t += +n;
  }
  console.log(log.join('\n'));
  if (vars.length) fs.writeFileSync(`${OUT}${name}_vars.json`, JSON.stringify(vars));
  await E.browser.close();
})();
