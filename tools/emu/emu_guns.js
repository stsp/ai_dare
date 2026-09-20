// Find the rooms' guns: run each room twice from its snapshot with the same keys, once with the
// guns' routine poked out and once with it in, and record every screen cell that differs
// between the two runs - the guns' shots and whatever they change. node emu_guns.js SNAPS.json OUT.json [ROOM...]
const { boot, OUT } = require('./emu_lib');
const fs = require('fs');
const KEYS = { P: [5, 1], O: [5, 2], Q: [2, 1], A: [1, 1], SP: [7, 1] };
const [listFile, outFile, ...only] = process.argv.slice(2);
const GUNS_OFF = { 47714: 201, 44413: 201, 43526: 0 }, GUNS_ON = { 47714: 201, 43526: 0, 44413: 0xCD };   // the surveys' snapshots carry the poke: put the CALL back
const SCRIPT = [[[], 150], [['O'], 50], [['P'], 100], [['O'], 50], [['Q'], 40], [[], 60]];   // stand, left, right, left, jump, stand
(async () => {
  const E = await boot();
  await E.page.evaluate(() => {
    const w = window.__workers[0];
    window.__frame = () => new Promise((res) => { const h = (e) => { if (e.data.message === 'frameCompleted') { w.removeEventListener('message', h); res(); } }; w.addEventListener('message', h); w.postMessage({ message: 'runFrame', frameBuffer: new ArrayBuffer(26112) }); });
    window.__key = (row, mask, down) => w.postMessage({ message: down ? 'keyDown' : 'keyUp', row, mask });
    // step n frames with keys held, sampling the screen every `every` frames (bitmap + attributes) with Ai's position and the room
    window.__run = async (keys, n, every) => {
      for (const [r, m] of keys) __key(r, m, true);
      const out = [];
      for (let i = 0; i < n; i++) { await __frame(); if (i % every === 0) { const scr = await __peek(0x4000, 6912); const d = await __peek(0xC012, 2); const rm = await __peek(0x6297, 1); out.push({ scr, x: d[1], y: d[0], room: rm[0] }); } }
      for (const [r, m] of keys) __key(r, m, false);
      return out;
    };
  });
  const list = JSON.parse(fs.readFileSync(OUT + listFile, 'utf8'));
  const result = fs.existsSync(OUT + outFile) ? JSON.parse(fs.readFileSync(OUT + outFile, 'utf8')) : {};
  for (const [room, snap] of Object.entries(list)) {
    if (only.length && !only.includes(room)) continue;
    if (result[room]) continue;
    const runs = [];
    for (const pokes of [GUNS_OFF, GUNS_ON]) {
      await E.loadFile(snap, pokes);
      const frames = [];
      for (const [keys, n] of SCRIPT) frames.push(...await E.page.evaluate(([k, n]) => __run(k, n, 2), [keys.map((k) => KEYS[k]), n]));
      runs.push(frames);
      if (process.env.SAVE && pokes === GUNS_ON) frames.forEach((f, i) => fs.writeFileSync(`${OUT}${process.env.SAVE}${room}_${String(i).padStart(3, '0')}.scr`, Buffer.from(f.scr)));
    }
    const [a, b] = runs; const cells = {}; let frames = 0, left = 0;
    for (let i = 0; i < Math.min(a.length, b.length); i++) {
      if (a[i].room !== +room || b[i].room !== +room) { left++; continue; }
      frames++;
      for (let r = 0; r < 24; r++) for (let c = 0; c < 32; c++) {
        let diff = a[i].scr[6144 + r * 32 + c] !== b[i].scr[6144 + r * 32 + c];
        for (let k = 0; !diff && k < 8; k++) { const off = ((r & 0x18) << 8) | (k << 8) | ((r & 7) << 5) | c; if (a[i].scr[off] !== b[i].scr[off]) diff = true; }
        if (diff) { const key = r + ':' + c; cells[key] = (cells[key] || 0) + 1; }
      }
    }
    const pos = [];
    for (let i = 0; i < b.length; i++) if (b[i].room === +room) pos.push(`${b[i].x},${b[i].y}`);
    result[room] = { frames, left, cells, dan: a[0] ? `${a[0].x},${a[0].y}` : null, path: [...new Set(pos)].join(' ') };
    console.log(room, 'frames', frames, 'left', left, 'diff cells', Object.keys(cells).length, Object.keys(cells).slice(0, 12).join(' '));
    fs.writeFileSync(OUT + outFile, JSON.stringify(result));
  }
  await E.browser.close();
})();
