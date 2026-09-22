// Map the original by playing it: breadth-first over (room, floor) states,
// trying every move Ai has, with the emulator stepped frame by frame.
const { boot, OUT } = require('./emu_lib');
const fs = require('fs');
const KEYS = { P: [5, 1], O: [5, 2], Q: [2, 1], A: [1, 1], SP: [7, 1] };
const DIR = process.argv[3] || 'bfs';
(async () => {
  const E = await boot();
  await E.loadFile(process.argv[2] || 'probe/s0.json');
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
    window.__export = (k) => { const s = __snaps[k]; const pages = {}; for (const p in s.memoryPages) { let b = ''; const u = s.memoryPages[p]; for (let i = 0; i < u.length; i++) b += String.fromCharCode(u[i]); pages[p] = btoa(b); } return { model: s.model, registers: s.registers, halted: s.halted, tstates: s.tstates, ulaState: s.ulaState, pages }; };
    window.__import = (k, s) => { const pages = {}; for (const p in s.pages) { const bin = atob(s.pages[p]); const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); pages[p] = u; } __snaps[k] = { model: s.model, registers: s.registers, halted: s.halted, tstates: s.tstates, ulaState: s.ulaState, memoryPages: pages }; };
    window.__restore = (k) => { __load(__snaps[k]); };
    window.__screen = (k) => { const p = __snaps[k].memoryPages[5]; let s = ''; for (let i = 0; i < 6912; i++) s += String.fromCharCode(p[i]); return btoa(s); };
  });
  const step = (keys, n) => E.page.evaluate(([k, n]) => __step(k, n), [keys.map((k) => KEYS[k]), n]);
  const settleThrough = async (first) => {
    // a lift moves under a pixel a frame; anything faster in the last room is a fall
    const through = []; let last = first, still = 0, fell = false, top = first.y;
    for (let t = 0; t < 600; t += 5) {
      const s = await step([], 5);
      if (s.room !== last.room) { through.push(last.room); await dumpScreen(last.room); fell = false; top = s.y; }
      else if (s.y - last.y > 12) fell = true;
      if (s.room === last.room && Math.abs(s.y - last.y) < 1 && s.x === last.x) { if (++still >= 6) break; } else still = 0;
      last = s;
    }
    const r = await step([], 30);
    return { ...r, changed: true, through, fell, fellFrom: fell ? top : undefined };
  };
  const state = () => E.page.evaluate(() => __state());
  const restore = async (k) => { await E.page.evaluate((k) => __restore(k), k); await step([], 3); };
  const save = (k) => E.page.evaluate((k) => __save(k), k);

  // walk one way until the room changes or Ai stops making progress
  const walk = async (dir, jump) => {
    let last = await state(), still = 0, fellAt = null;
    for (let t = 0; t < 900; t += 6) {
      // jumping as he goes: a pit or a gap in a walkway is crossed this way.
      // The laser is tapped, not held, so it keeps firing at the guards in
      // the way; something on the floor that stops him is hopped over
      const fire = Math.floor(t / 6) % 2 === 0;
      const hop = still > 0 && still % 6 === 0;
      const s = await step((jump && Math.floor(t / 6) % 7 === 0) || hop ? [dir, 'Q'] : fire ? [dir, 'SP'] : [dir], 6);
      if (s.room !== last.room) { const r = await settleThrough(s); if (fellAt != null) r.fellAt = fellAt; return r; }
      if (fellAt == null && s.y > last.y + 8) fellAt = last.x;      // the floor gave way here
      if (s.x === last.x) { if (++still > 30) break; } else still = 0;
      last = s;
    }
    return { ...(await state()), changed: false, fellAt };
  };
  // a walk that fell into a pit or a gap is tried again with a jump from
  // its edge - one cell back, two, three, right at it - as a player would
  const jumpGap = async (k, dir, fellAt) => {
    for (const lead of [1, 2, 3, 0]) {
      await restore(k);
      const target = dir === 'P' ? fellAt - lead : fellAt + lead;
      if (!(await goto(target))) continue;
      const from = await state();
      let s = await step([dir, 'Q'], 8), last = s, level = 0;
      for (let t = 0; t < 120; t += 4) {
        s = await step([dir], 4);
        if (s.room !== last.room) { const r = await settleThrough(s); if (!r.fell) return r; break; }
        if (s.y > from.y + 20) break;                                 // fell past the floor he jumped from
        if (Math.abs(s.y - last.y) < 1 && t > 24) { if (++level >= 3) break; } else level = 0;
        last = s;
      }
      if (level >= 3 && s.room === from.room && Math.abs(s.x - from.x) >= 3) {   // landed on something in this room
        const r = await step([], 10);
        if (Math.abs(r.y - s.y) < 2) return { ...r, changed: false, landed: true };
      }
    }
    return null;
  };
  const goto = async (xt) => {
    let last = await state(), still = 0;
    for (let t = 0; t < 500; t += 2) {
      if (last.x === xt) return true;
      const dir = last.x < xt ? 'P' : 'O';
      const s = await step(still > 0 && still % 20 === 0 ? [dir, 'Q'] : still % 4 === 2 ? [dir, 'SP'] : [dir], 2);
      if (s.room !== last.room) return false;
      if (s.x === last.x) { if (++still > 60) return false; } else still = 0;
      last = s;
    }
    return false;
  };
  const ride = async (key, from) => {
    for (let t = 0; t < 300; t += 10) {
      const s = await step([key], 10);
      if (s.room !== from.room) return await settleThrough(s);
    }
    const s = await step([], 60);
    return { ...s, changed: Math.abs(s.y - from.y) > 12 };
  };

  const nodeKey = (s) => `${s.room}:${Math.floor(s.y / 16)}`;
  const start = await step([], 10);
  let nodes = {}, edges = [], queue = [], done = [];
  fs.mkdirSync(`${OUT}${DIR}`, { recursive: true });
  const graphFile = `${OUT}${DIR}/graph.json`;
  if (fs.existsSync(graphFile)) {            // resume: nodes, edges, snapshots, and what is left to expand
    const g = JSON.parse(fs.readFileSync(graphFile, 'utf8'));
    nodes = g.nodes; edges = g.edges; done = g.done || [];
    for (const k of Object.keys(nodes)) {
      const f = `${OUT}${DIR}/snap_${k.replace(':', '_')}.json`;
      if (fs.existsSync(f)) await E.page.evaluate(([k, s]) => __import(k, s), [k, JSON.parse(fs.readFileSync(f, 'utf8'))]);
      else { delete nodes[k]; }
    }
    queue = Object.keys(nodes).filter((k) => !done.includes(k));
    console.log(`resumed: ${Object.keys(nodes).length} nodes, ${edges.length} edges, ${queue.length} to expand`);
  }
  const dumpScreen = async (room) => {
    if (fs.existsSync(`${OUT}${DIR}/room_${room}.scr`)) return;
    const b64 = await E.page.evaluate(() => { const d = []; return __peek(0x4000, 6912).then((a) => btoa(String.fromCharCode(...a))); });
    fs.writeFileSync(`${OUT}${DIR}/room_${room}.scr`, Buffer.from(b64, 'base64'));
  };
  const addNode = async (s, how) => {
    const k = nodeKey(s);
    if (nodes[k]) return k;
    nodes[k] = { room: s.room, x: s.x, y: s.y, via: how };
    await save(k);
    fs.writeFileSync(`${OUT}${DIR}/snap_${k.replace(':', '_')}.json`, JSON.stringify(await E.page.evaluate((k) => __export(k), k)));
    queue.push(k);
    if (!fs.existsSync(`${OUT}${DIR}/room_${s.room}.scr`)) {
      const b64 = await E.page.evaluate((k) => __screen(k), k);
      fs.writeFileSync(`${OUT}${DIR}/room_${s.room}.scr`, Buffer.from(b64, 'base64'));
    }
    console.log(`node ${k} (${how}) x=${s.x}  nodes=${Object.keys(nodes).length} queue=${queue.length}`);
    return k;
  };
  if (!nodes[nodeKey(start)]) await addNode(start, 'start');   // a fresh start seeds a resumed survey too
  const dump = () => fs.writeFileSync(graphFile, JSON.stringify({ nodes, edges, done }, null, 1));
  const t0 = Date.now();
  while (queue.length && Object.keys(nodes).length < 400) {
    const k = queue.shift();
    const here = nodes[k];
    for (const [dir, jump] of [['P', false], ['O', false], ['P', true], ['O', true]]) {
      await restore(k);
      const r = await walk(dir, jump);
      const via = (dir === 'P' ? 'right' : 'left') + (jump ? '~' : '');
      if (r.changed) { const to = await addNode(r, `walk${jump ? '+jump' : ''} ${dir} from ${k}`); edges.push({ from: k, via, to, arrive: { x: r.x, y: r.y }, through: r.through || [], fell: r.fell, fellFrom: r.fellFrom }); }
      else if (nodeKey(r) !== k) { const to = await addNode(r, `walk${jump ? '+jump' : ''} ${dir} within ${k}`); edges.push({ from: k, via: via + '*', to }); }
      else edges.push({ from: k, via: via + '!', to: k, stop: { x: r.x, y: r.y } });   // blocked: where he got to
      if (!jump && r.fellAt != null) {
        const j = await jumpGap(k, dir, r.fellAt);
        if (j && j.landed) { if (nodeKey(j) !== k) { const to = await addNode(j, `jump ${dir} over ${r.fellAt} within ${k}`); edges.push({ from: k, via: via + '~*', to, jumpedAt: r.fellAt }); } }
        else if (j) { const to = await addNode(j, `jump ${dir} over ${r.fellAt} from ${k}`); edges.push({ from: k, via: via + '~', to, arrive: { x: j.x, y: j.y }, through: j.through || [], fell: j.fell, jumpedAt: r.fellAt }); }
      }
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
          else edges.push({ from: k, via, to, x0: xt, x1: xt, arrive: { x: r.x, y: r.y }, through: r.through || [], fell: r.fell, fellFrom: r.fellFrom });
        }
      }
    }
    done.push(k);
    dump();
    console.log(`done ${k} in ${((Date.now() - t0) / 1000).toFixed(0)}s, ${edges.length} edges`);
  }
  dump();
  console.log('FINISHED', Object.keys(nodes).length, 'nodes', edges.length, 'edges');
  await E.browser.close();
})();
