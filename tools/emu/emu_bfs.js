// Map the original by playing it: breadth-first over (room, floor) states,
// trying every move Dan has, with the emulator stepped frame by frame.
const { boot, OUT } = require('./emu_lib');
const fs = require('fs');
const KEYS = { P: [5, 1], O: [5, 2], Q: [2, 1], A: [1, 1], SP: [7, 1] };
(async () => {
  const E = await boot();
  await E.loadFile(process.argv[2] || 'start.json');
  await E.page.evaluate(() => {
    const w = window.__workers[0];
    window.__frames = (n) => new Promise((res) => {
      let left = n;
      const h = (e) => { if (e.data.message === 'frameCompleted') { if (--left <= 0) { w.removeEventListener('message', h); res(); } else w.postMessage({ message: 'runFrame', frameBuffer: new ArrayBuffer(26112) }); } };
      w.addEventListener('message', h);
      w.postMessage({ message: 'runFrame', frameBuffer: new ArrayBuffer(26112) });
    });
    window.__key = (row, mask, down) => w.postMessage({ message: down ? 'keyDown' : 'keyUp', row, mask });
    window.__snaps = {};
    // one round trip: press keys, run frames, read state
    window.__step = async (keys, n) => {
      for (const [r, m] of keys) __key(r, m, true);
      await __frames(n);
      for (const [r, m] of keys) __key(r, m, false);
      const d = await __peek(0xC012, 2); const rm = await __peek(0x6297, 1);
      return { room: rm[0], y: d[0], x: d[1] };
    };
    window.__state = async () => { const d = await __peek(0xC012, 2); const rm = await __peek(0x6297, 1); return { room: rm[0], y: d[0], x: d[1] }; };
    window.__save = async (k) => { __snaps[k] = await __snap(); return Object.keys(__snaps).length; };
    window.__restore = (k) => { __load(__snaps[k]); };
    window.__screen = (k) => { const p = __snaps[k].memoryPages[5]; let s = ''; for (let i = 0; i < 6912; i++) s += String.fromCharCode(p[i]); return btoa(s); };
  });
  const step = (keys, n) => E.page.evaluate(([k, n]) => __step(k, n), [keys.map((k) => KEYS[k]), n]);
  const state = () => E.page.evaluate(() => __state());
  const restore = async (k) => { await E.page.evaluate((k) => __restore(k), k); await step([], 3); };
  const save = (k) => E.page.evaluate((k) => __save(k), k);

  // walk one way until the room changes or Dan stops making progress
  const walk = async (dir) => {
    let last = await state(), still = 0;
    for (let t = 0; t < 900; t += 6) {
      const s = await step([dir, 'SP'], 6);
      if (s.room !== last.room) { const r = await step([], 120); return { ...r, changed: true }; }
      if (s.x === last.x) { if (++still > 30) break; } else still = 0;
      last = s;
    }
    return { ...(await state()), changed: false };
  };
  const goto = async (xt) => {
    let last = await state(), still = 0;
    for (let t = 0; t < 500; t += 2) {
      if (last.x === xt) return true;
      const s = await step([last.x < xt ? 'P' : 'O'], 2);
      if (s.room !== last.room) return false;
      if (s.x === last.x) { if (++still > 60) return false; } else still = 0;
      last = s;
    }
    return false;
  };
  const ride = async (key, from) => {
    for (let t = 0; t < 300; t += 10) {
      const s = await step([key], 10);
      if (s.room !== from.room) { const r = await step([], 120); return { ...r, changed: true }; }
    }
    const s = await step([], 60);
    return { ...s, changed: Math.abs(s.y - from.y) > 12 };
  };

  const nodeKey = (s) => `${s.room}:${Math.floor(s.y / 16)}`;
  const start = await step([], 10);
  const nodes = {}; const edges = []; const queue = [];
  const addNode = async (s, how) => {
    const k = nodeKey(s);
    if (nodes[k]) return k;
    nodes[k] = { room: s.room, x: s.x, y: s.y, via: how };
    await save(k);
    queue.push(k);
    if (!fs.existsSync(`${OUT}bfs/room_${s.room}.scr`)) {
      const b64 = await E.page.evaluate((k) => __screen(k), k);
      fs.writeFileSync(`${OUT}bfs/room_${s.room}.scr`, Buffer.from(b64, 'base64'));
    }
    console.log(`node ${k} (${how}) x=${s.x}  nodes=${Object.keys(nodes).length} queue=${queue.length}`);
    return k;
  };
  fs.mkdirSync(`${OUT}bfs`, { recursive: true });
  await addNode(start, 'start');
  const dump = () => fs.writeFileSync(`${OUT}bfs/graph.json`, JSON.stringify({ nodes, edges }, null, 1));
  const t0 = Date.now();
  while (queue.length && Object.keys(nodes).length < 400) {
    const k = queue.shift();
    const here = nodes[k];
    for (const dir of ['P', 'O']) {
      await restore(k);
      const r = await walk(dir);
      if (r.changed) { const to = await addNode(r, `walk ${dir} from ${k}`); edges.push({ from: k, via: dir === 'P' ? 'right' : 'left', to, arrive: { x: r.x, y: r.y } }); }
      else if (nodeKey(r) !== k) { const to = await addNode(r, `walk ${dir} within ${k}`); edges.push({ from: k, via: dir === 'P' ? 'right*' : 'left*', to }); }
    }
    let zone = null;
    for (let xt = 0; xt <= 29; xt += 1) {
      for (const key of ['Q', 'A']) {
        await restore(k);
        if (!(await goto(xt))) continue;
        const from = await state();
        const r = await ride(key, from);
        if (r.changed) {
          const to = await addNode(r, `${key} at x=${xt} from ${k}`);
          const via = key === 'Q' ? 'up' : 'down';
          const last = edges[edges.length - 1];
          if (last && last.from === k && last.via === via && last.to === to && last.x1 === xt - 1) last.x1 = xt;
          else edges.push({ from: k, via, to, x0: xt, x1: xt, arrive: { x: r.x, y: r.y } });
        }
      }
    }
    dump();
    console.log(`done ${k} in ${((Date.now() - t0) / 1000).toFixed(0)}s, ${edges.length} edges`);
  }
  dump();
  console.log('FINISHED', Object.keys(nodes).length, 'nodes', edges.length, 'edges');
  await E.browser.close();
})();
