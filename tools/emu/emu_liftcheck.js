// Verify every lift call the surveys recorded: from a snapshot of the room with Dan on that floor, walk
// him to the call's cell, press up or down, and watch his height. A grav-lift carries him steadily;
// a jump peaks ten pixels up and comes back; a fall needs no key at all. Calls that do not ride are
// phantoms - a jump or a fall at a gap's edge that the survey took for a ride.
//   node emu_liftcheck.js SNAP_INDEX.json OUT.json      (DANDARE_WORK holds the snapshots; level.json in cwd)
const { boot, OUT } = require('./emu_lib');
const fs = require('fs');
const KEYS = { P: [5, 1], O: [5, 2], Q: [2, 1], A: [1, 1] };
const [indexFile, outFile] = process.argv.slice(2);
(async () => {
  const level = JSON.parse(fs.readFileSync('level.json', 'utf8'));
  const index = JSON.parse(fs.readFileSync(OUT + indexFile, 'utf8'));
  const results = fs.existsSync(OUT + outFile) ? JSON.parse(fs.readFileSync(OUT + outFile, 'utf8')) : {};
  const calls = new Map();
  for (const l of level.links) {
    if (l.kind !== 'up' && l.kind !== 'down' || l.feet == null || l.feet < 0) continue;
    const k = `${l.from}:${l.kind}:${l.x0}:${l.feet}`;
    if (!calls.has(k)) calls.set(k, l);
  }
  const E = await boot();
  await E.page.evaluate(() => {
    const w = window.__workers[0];
    window.__frame = () => new Promise((res) => { const h = (e) => { if (e.data.message === 'frameCompleted') { w.removeEventListener('message', h); res(); } }; w.addEventListener('message', h); w.postMessage({ message: 'runFrame', frameBuffer: new ArrayBuffer(26112) }); });
    window.__key = (row, mask, down) => w.postMessage({ message: down ? 'keyDown' : 'keyUp', row, mask });
    window.__pos = async () => { const d = await __peek(0xC012, 2); const rm = await __peek(0x6297, 1); return { x: d[1], y: d[0], room: rm[0] }; };
    // walk to a cell, then press the key and trace the height
    window.__try = async (cell, key, walkKeys) => {
      let p = await __pos(); const room = p.room, y0 = p.y;
      for (let i = 0; i < 30; i++) await __frame();                       // let the room settle
      p = await __pos(); if (p.y !== y0) return { verdict: 'unsettled', y0, y: p.y };
      let fell = false;
      for (let i = 0; i < 260 && p.x !== cell; i++) {
        const k = p.x < cell ? walkKeys.P : walkKeys.O; __key(k[0], k[1], true); await __frame(); __key(k[0], k[1], false);
        p = await __pos();
        if (p.room !== room) return { verdict: 'left the room walking', y0 };
        if (p.y !== y0) { fell = true; break; }
      }
      if (fell) return { verdict: 'fell walking to the cell', y0, y: p.y, x: p.x };
      if (p.x !== cell) return { verdict: 'could not reach the cell', y0, x: p.x };
      for (let i = 0; i < 12; i++) await __frame();
      const trace = [];
      __key(key[0], key[1], true);
      for (let i = 0; i < 8; i++) { await __frame(); p = await __pos(); trace.push(p.y); }
      __key(key[0], key[1], false);
      for (let i = 0; i < 48; i++) { await __frame(); p = await __pos(); trace.push(p.y); if (p.room !== room) break; }
      return { verdict: 'traced', y0, trace, roomAfter: p.room };
    };
  });
  for (const [k, l] of calls) {
    if (results[k]) continue;
    const feet = l.feet;
    const snaps = (index[l.from] || []).filter(([f, x, y]) => Math.abs(y + 5 - feet) <= 6);
    if (!snaps.length) { results[k] = { verdict: 'no snapshot on that floor' }; continue; }
    // the snapshot with Dan nearest the cell
    snaps.sort((a, b) => Math.abs(a[1] - l.x0) - Math.abs(b[1] - l.x0));
    await E.loadFile(snaps[0][0]);
    const r = await E.page.evaluate(([cell, key, walk]) => __try(cell, key, walk), [l.x0, KEYS[l.kind === 'up' ? 'Q' : 'A'], { P: KEYS.P, O: KEYS.O }]);
    if (r.verdict === 'traced') {
      const t = r.trace, y0 = r.y0;
      const minY = Math.min(...t), maxY = Math.max(...t);
      if (l.kind === 'up') r.ride = minY <= y0 - 14;                       // a jump peaks ten up; the field goes on
      else r.ride = t[7] >= y0 + 6 && t[15] >= y0 + 16 && t.slice(0, 16).every((y, i) => i === 0 || y >= t[i - 1]);   // down at once, steadily
      r.summary = `${l.from} ${l.kind} at ${l.x0} feet ${feet}: y ${y0} -> ${t.slice(0, 20).join(',')} ${r.ride ? 'RIDE' : 'no ride'}`;
    } else r.summary = `${l.from} ${l.kind} at ${l.x0} feet ${feet}: ${r.verdict}`;
    r.link = l; results[k] = r;
    console.log(r.summary);
    fs.writeFileSync(OUT + outFile, JSON.stringify(results));
  }
  await E.browser.close();
})();
