// Replay in the engine every walk the floor probe recorded in the original and
// compare, cell by cell, where his feet end up: the room's floors against the
// original's own, all of them, not just the ones a route happens to cross.
// Only walks the probe began standing on a floor course, away from a doorway,
// are replayed - its mid-fall and mid-ride frames say nothing about a floor.
//   node floorcheck.js [detail]
const { chromium } = require('playwright-core');
const fs = require('fs');
const path = require('path');
const floors = JSON.parse(fs.readFileSync(process.argv[2] && process.argv[2] !== 'detail' ? process.argv[2]
  : path.join(__dirname, '..', '..', 'data', 'emu', 'floor.json'), 'utf8'));
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const p = await b.newPage({ viewport: { width: 1040, height: 800 } });
  p.on('pageerror', e => console.log('PAGEERROR', e.message));
  await p.goto('http://127.0.0.1:8801/index.html'); await p.waitForTimeout(1500);
  await p.click('#screen'); await p.waitForTimeout(200);
  const out = await p.evaluate((floors) => {
    startGame(); state.fitted = 9; state.timeLeft = 99999;
    const OFF = 5;                       // the survey's y is five under his feet
    const res = { cases: 0, skipped: 0, clean: 0, higher: [], lower: [], fell: [], wrongRoom: [], noFloor: [], throughFloor: [], rooms: new Set() };
    for (const node of Object.keys(floors)) {
      const key = node.split(':')[0];
      if (!ROOMS[key]) { res.skipped++; continue; }
      for (const dir of ['right', 'left']) {
        const seq = floors[node][dir];
        if (!seq || !seq.length || typeof seq[0][0] === 'string') { res.skipped++; continue; }
        // what the original did: the feet it saw in each cell, and where it ended
        const want = new Map(); let wantRoom = null;
        for (const e of seq) {
          if (typeof e[0] === 'string') { if (e[0] === 'room') wantRoom = String(e[1]); continue; }
          if (!want.has(e[0])) want.set(e[0], new Set());
          want.get(e[0]).add(e[1] + OFF);
        }
        const c0 = seq[0][0], f0 = seq[0][1] + OFF;
        // only where the original was standing on a floor course, and not in a
        // doorway: mid-fall and mid-ride frames say nothing about the floor
        const settled = seq.slice(0, 10).every((e) => typeof e[0] !== 'string' && e[1] + OFF === f0);
        if (f0 % 8 !== 0 || c0 <= 0 || c0 >= 29 || !settled) { res.skipped++; continue; }
        res.cases++; res.rooms.add(key);
        state.mode = 'play'; guards = []; state.pursuer = null; state.energy = 100;
        for (const k in keys) keys[k] = false;
        resetAi(c0 * 8, f0 - AI_H); enterRoom(key, c0 * 8, f0 - AI_H);
        for (let t = 0; t < 40; t++) updateAi(1 / 60);
        if (state.room !== key) { res.throughFloor.push(`${key} ${dir}: the original stood on cell ${c0} at feet ${f0}, the engine drops out of the room`); continue; }
        if (Math.abs(ai.y + AI_H - f0) > 4) { res.noFloor.push(`${key} ${dir}: the original stood on cell ${c0} at feet ${f0}, the engine settles at ${(ai.y + AI_H).toFixed(0)}`); continue; }
        const got = new Map();
        keys[dir === 'right' ? 'ArrowRight' : 'ArrowLeft'] = true;
        let left = null;
        for (let t = 0; t < 900; t++) {
          // a floor gun stands in his way: the player hops it, and so did the survey
          keys.ArrowUp = ai.onGround && guns.some((g) => !g.dead && g.type === GUN_FLOOR && Math.abs(g.x - ai.x) < 26);
          updateAi(1 / 60);
          updateGuns(1 / 60);
          if (state.room !== key) { left = state.room; break; }
          const c = Math.floor((ai.x + AI_W / 2) / 8), f = ai.y + AI_H;
          // stood on the gun's top after the hop: a course above the floor, not a floor
          if (ai.onGround && guns.some((g) => !g.dead && g.type === GUN_FLOOR && f === g.cy && ai.x + AI_W > g.x && ai.x < g.x + 16)) continue;
          if (!got.has(c)) got.set(c, new Set());
          got.get(c).add(f);
          if (ai.onGround && ((dir === 'right' && ai.x >= VIEW_W - AI_W - 0.5) || (dir === 'left' && ai.x <= 0.5))) break;
        }
        for (const k in keys) keys[k] = false;
        // cell by cell: did he stand where the original stood?
        let worst = null;
        for (const [c, fs_] of want) {
          if (c <= 0 || c >= 29) continue;           // in a doorway he is between two rooms' floors
          const mine = got.get(c);
          if (!mine) continue;                       // never got there: covered by the fell/room checks
          const stood = [...fs_].filter((f) => f % 8 === 0);
          const mineStood = [...mine].filter((f) => f % 8 === 0);
          if (!stood.length || !mineStood.length) continue;   // one of them was in the air here
          let best = 1e9;
          for (const a of stood) for (const m of mineStood) best = Math.min(best, Math.abs(a - m));
          if (best > 4) {
            const a = [...fs_].filter((f) => f % 8 === 0)[0], m = [...mine].filter((f) => f % 8 === 0)[0];
            if (!worst || best > worst.d) worst = { c, d: best, orig: a, mine: m };
          }
        }
        const reached = [...want.keys()].filter((c) => got.has(c)).length;
        const missed = [...want.keys()].filter((c) => !got.has(c));
        if (left && wantRoom && left !== wantRoom) res.wrongRoom.push(`${key} ${dir} from cell ${c0} feet ${f0}: original -> ${wantRoom}, engine -> ${left}`);
        else if (left && !wantRoom && missed.length > 1) res.fell.push(`${key} ${dir} from cell ${c0} feet ${f0}: original walked cells ${missed.join(',')}, engine left the room to ${left}`);
        else if (!left && missed.length > 2 && reached) res.fell.push(`${key} ${dir} from cell ${c0} feet ${f0}: original walked cells ${missed.join(',')}, engine never got there`);
        if (worst) (worst.mine < worst.orig ? res.higher : res.lower).push(`${key} ${dir}: cell ${worst.c} original feet ${worst.orig}, engine ${worst.mine}`);
        else if (!worst) res.clean++;
      }
    }
    res.roomCount = res.rooms.size; delete res.rooms;
    return res;
  }, floors);
  const detail = process.argv.includes('detail');
  console.log(`cases ${out.cases} in ${out.roomCount} rooms, skipped ${out.skipped}, matching the original ${out.clean}`);
  for (const [name, list] of [['walks higher than the original', out.higher], ['walks lower than the original', out.lower], ['fell where the original walked', out.fell], ['ended in the wrong room', out.wrongRoom], ['no floor where the original stood', out.noFloor], ['drops out of the room where the original stood', out.throughFloor]]) {
    console.log(`${name}: ${list.length}`);
    for (const l of (detail ? list : list.slice(0, 12))) console.log('  ' + l);
  }
  await b.close();
})();
