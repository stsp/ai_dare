// Trace one lift ride in the original: load a snapshot, walk Dan to a cell, tap a key, log room/x/y.
const { boot } = require('./emu_lib');
const KEYS = { P: [5, 1], O: [5, 2], Q: [2, 1], A: [1, 1], SP: [7, 1] };
const [snap, cellArg, keyArg, framesArg] = process.argv.slice(2);
(async () => {
  const E = await boot();
  await E.loadFile(snap);
  await E.page.evaluate(() => {
    const w = window.__workers[0];
    window.__frames = (n) => new Promise((res) => {
      let left = n;
      const h = (e) => { if (e.data.message === 'frameCompleted') { if (--left <= 0) { w.removeEventListener('message', h); res(); } else w.postMessage({ message: 'runFrame', frameBuffer: new ArrayBuffer(26112) }); } };
      w.addEventListener('message', h);
      w.postMessage({ message: 'runFrame', frameBuffer: new ArrayBuffer(26112) });
    });
    window.__key = (row, mask, down) => w.postMessage({ message: down ? 'keyDown' : 'keyUp', row, mask });
    window.__step = async (keys, n) => {
      for (const [r, m] of keys) __key(r, m, true);
      await __frames(n);
      for (const [r, m] of keys) __key(r, m, false);
      const d = await __peek(0xC012, 2); const rm = await __peek(0x6297, 1);
      return { room: rm[0], y: d[0], x: d[1] };
    };
  });
  const step = (keys, n) => E.page.evaluate(([k, n]) => __step(k, n), [keys.map((k) => KEYS[k]), n]);
  let s = await step([], 10);
  console.log('start', JSON.stringify(s));
  const cell = +cellArg;
  for (let i = 0; i < 200 && s.x !== cell; i++) s = await step([s.x < cell ? 'P' : 'O'], 2);
  s = await step([], 20);
  console.log('at cell', JSON.stringify(s));
  s = await step([keyArg], 6);
  const log = [];
  for (let i = 0; i < +framesArg; i += 4) { s = await step([], 4); log.push(`${i}:${s.room}/${s.x}/${s.y}`); }
  console.log(log.join(' '));
  await E.shot('lifttrace.png');
  await E.browser.close();
})();
