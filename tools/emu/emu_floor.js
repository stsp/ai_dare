// Floor probe: from every surveyed node, walk left and right recording Ai's
// x and y every two frames, so the cells he stands on and the cells he falls
// from are known exactly - the picture of a pit says nothing about its edges.
const { boot, OUT } = require('./emu_lib');
const fs = require('fs');
const KEYS = { P: [5, 1], O: [5, 2], Q: [2, 1], A: [1, 1], SP: [7, 1] };
const DIRS = process.argv.slice(2);
(async () => {
  const E = await boot();
  await E.page.evaluate(() => {
    const w = window.__workers[0];
    window.__frames = (n) => new Promise((res) => { let left = n; const h = (e) => { if (e.data.message === 'frameCompleted') { if (--left <= 0) { w.removeEventListener('message', h); res(); } else w.postMessage({ message: 'runFrame', frameBuffer: new ArrayBuffer(26112) }); } }; w.addEventListener('message', h); w.postMessage({ message: 'runFrame', frameBuffer: new ArrayBuffer(26112) }); });
    window.__key = (row, mask, down) => w.postMessage({ message: down ? 'keyDown' : 'keyUp', row, mask });
    window.__step = async (keys, n) => { for (const [r, m] of keys) __key(r, m, true); await __frames(n); for (const [r, m] of keys) __key(r, m, false); const d = await __peek(0xC012, 2); const rm = await __peek(0x6297, 1); return { room: rm[0], y: d[0], x: d[1] }; };
    window.__import = (s) => { const pages = {}; for (const p in s.pages) { const bin = atob(s.pages[p]); const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); pages[p] = u; } __load({ model: s.model, registers: s.registers, halted: s.halted, tstates: s.tstates, ulaState: s.ulaState, memoryPages: pages }); };
  });
  const step = (keys, n) => E.page.evaluate(([k, n]) => __step(k, n), [keys.map((k) => KEYS[k]), n]);
  const out = {};
  for (const dir of DIRS) {
    for (const f of fs.readdirSync(OUT + dir).filter((f) => f.startsWith('snap_')).sort()) {
      const node = f.slice(5, -5).replace('_', ':');
      const snap = JSON.parse(fs.readFileSync(`${OUT}${dir}/${f}`, 'utf8'));
      out[node] = {};
      for (const [key, name] of [['P', 'right'], ['O', 'left']]) {
        await E.page.evaluate((s) => __import(s), snap); await step([], 3);
        const first = await step([], 1);
        const trace = [[first.x, first.y]]; let still = 0, last = first;
        for (let t = 0; t < 400; t += 2) {
          const s = await step([key], 2);
          if (s.room !== first.room) { trace.push(['room', s.room]); break; }
          trace.push([s.x, s.y]);
          if (s.x === last.x && s.y === last.y) { if (++still > 40) break; } else still = 0;
          last = s;
        }
        out[node][name] = trace;
      }
      console.log(node, 'right', out[node].right.length, 'left', out[node].left.length);
    }
  }
  fs.writeFileSync(OUT + (process.env.FLOOR_OUT || 'floor.json'), JSON.stringify(out));
  console.log('FINISHED', Object.keys(out).length, 'nodes');
  await E.browser.close();
})();
