// Follow the recorded walkthrough's room sequence in the recreation, choosing moves from the level's links.
const { chromium } = require('playwright-core');
const fs = require('fs');
const seq = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));   // [room, room, ...]
const fitted0 = +(process.argv[3] || 0);
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const page = await browser.newPage({ viewport: { width: 800, height: 620 } });
  page.on('pageerror', (e) => console.log('PAGEERROR', e.message));
  await page.goto('http://127.0.0.1:8801/index.html'); await page.waitForTimeout(600);
  await page.click('#screen'); await page.waitForTimeout(200);
  const out = await page.evaluate(([seq, fitted0]) => {
    startGame(); state.fitted = fitted0; state.timeLeft = 99999; window.TRACE = seq.length <= 3;
    const log = [];
    const K = { right: 'ArrowRight', left: 'ArrowLeft', up: 'ArrowUp', down: 'ArrowDown' };
    const clear = () => { for (const k in keys) keys[k] = false; };
    const tick = () => { if (state.mode !== 'play') return; updateDan(1 / 60); updatePickups(); };
    const st = () => `${state.room}@${Math.round(dan.x / 8)},${Math.round(dan.y + DAN_H)}`;
    const settle = () => { for (let i = 0; i < 400; i++) { tick(); if (dan.onGround && !dan.onLift && i > 10) break; } };
    const goto = (cell) => { const tx = cell * 8; for (let i = 0; i < 600 && Math.abs(dan.x - tx) > 2; i++) { keys[K[dan.x < tx ? 'right' : 'left']] = true; tick(); if (!dan.onGround && !dan.onLift) { clear(); settle(); } } clear(); for (let i = 0; i < 6; i++) tick(); };
    const walk = (dir, target) => { if (window.TRACE) log.push('   walk ' + dir + ' from ' + st()); const r0 = state.room; let lastX = dan.x, still = 0, fellAt = null; for (let i = 0; i < 900; i++) { keys[K[dir]] = true; tick(); if (state.room !== r0) { clear(); settle(); return { room: state.room, fellAt }; } if (fellAt == null && !dan.onGround && !dan.onLift) fellAt = Math.round(dan.x / 8); if (Math.abs(dan.x - lastX) < 0.5) { if (++still > 60) break; } else still = 0; lastX = dan.x; if (state.mode !== 'play') break; } clear(); return { room: state.room, fellAt, stuck: true }; };
    const jumpFrom = (cell, dir) => { if (window.TRACE) log.push('   jump from ' + cell + ' ' + dir + ' at ' + st()); goto(cell); keys[K[dir]] = true; for (let i = 0; i < 8; i++) tick(); keys.ArrowUp = true; for (let i = 0; i < 6; i++) tick(); keys.ArrowUp = false; for (let i = 0; i < 90; i++) { tick(); if (i > 12 && dan.onGround) break; } clear(); settle(); };
    const lift = (dir) => { keys[K[dir]] = true; for (let i = 0; i < 6; i++) tick(); clear(); for (let i = 0; i < 600; i++) { tick(); if (i > 20 && dan.onGround && !dan.onLift) break; } settle(); };
    const snapshot = () => JSON.stringify({ room: state.room, x: dan.x, y: dan.y, fitted: state.fitted, carrying: state.carrying, taken: sdsParts.map((p) => p.taken) });
    const restore = (s) => { const o = JSON.parse(s); enterRoom(o.room, o.x, o.y); dan.vx = 0; dan.vy = 0; dan.onLift = null; state.fitted = o.fitted; state.carrying = o.carrying; sdsParts.forEach((p, i) => p.taken = o.taken[i]); state.mode = 'play'; settle(); };
    // try one move to reach `to`; returns true on arrival
    const tryMove = (to) => {
      const from = state.room;
      const links = LEVEL.links.filter((l) => l.from === from && l.to === to);
      const attempts = [];
      for (const l of links) {
        if (l.kind === 'right' || l.kind === 'left') attempts.push(() => { const s0 = snapshot(); const r = walk(l.kind, to); if (r.room === to) return true; if (r.fellAt != null) { for (const lead of [1, 2, 3, 0]) { restore(s0); jumpFrom(l.kind === 'right' ? r.fellAt - lead : r.fellAt + lead, l.kind); if (state.room === to) return true; if (state.room !== from) continue; const r2 = walk(l.kind, to); if (r2.room === to) return true; } } return false; });
        if (l.kind === 'drop') attempts.push(() => { goto(Math.max(l.x0 - 2, 0)); const r = walk('right', to); if (r.room === to) return true; if (state.room === from) { goto(Math.min(l.x1 + 2, 29)); const r2 = walk('left', to); return r2.room === to; } return false; });
        if (l.kind === 'up' || l.kind === 'down') attempts.push(() => { for (const c of [l.x0, l.x1, Math.round((l.x0 + l.x1) / 2)]) { goto(c); lift(l.kind); if (state.room === to) return true; if (state.room !== from) return false; } return false; });
      }
      const run = (list) => { for (const a of list) { const s = snapshot(); if (a()) return true; if (window.TRACE) log.push('   attempt failed at ' + st()); restore(s); } return false; };
      if (run(attempts)) return true;
      // change level first: ride each of this room's own lifts, then try again
      const own = LEVEL.links.filter((l) => l.from === from && l.to === from && (l.kind === 'up' || l.kind === 'down'));
      for (const l2 of own) {
        const s = snapshot();
        goto(l2.x0); lift(l2.kind);
        if (state.room === from && Math.abs(dan.y + DAN_H - (l2.stop >= 0 ? l2.stop : 0)) <= 20 && run(attempts)) return true;
        restore(s);
      }
      return false;
    };
    // place Dan in the first room
    const r0 = ROOMS[String(seq[0])]; const sp = widestPlatform(r0); resetDan(sp.x, sp.y - DAN_H); enterRoom(String(seq[0]), sp.x, sp.y - DAN_H); dan.invuln = 1e9; settle();
    let ok = 0;
    for (let i = 1; i < seq.length; i++) {
      const to = String(seq[i]); const from = state.room;
      if (from === to) continue;
      // in a part room, sweep to the part first
      const part = sdsParts.find((p) => p.key === from && !p.taken && p.id === state.fitted);
      if (part) { goto(Math.round(part.x / 8)); jumpFrom(Math.round(part.x / 8) + 1, 'left'); }
      if (from === SDS_ROOM && state.carrying) { goto(2); for (let k = 0; k < 60; k++) tick(); }
      const got = tryMove(to);
      log.push(`${got ? 'ok ' : 'XX '}${from} -> ${to}: ${st()}${state.carrying ? ' carrying' : ''} fitted=${state.fitted}${state.mode !== 'play' ? ' MODE ' + state.mode : ''}`);
      if (!got) { // give up on this hop: teleport on so the rest can be checked
        const r = ROOMS[to]; if (!r) { log.push(`   no room ${to} in level`); break; }
        const p = widestPlatform(r); resetDan(p.x, p.y - DAN_H); enterRoom(to, p.x, p.y - DAN_H); settle(); state.mode = 'play';
      } else ok++;
    }
    log.push(`hops ok ${ok} of ${seq.length - 1}`);
    return log;
  }, [seq, fitted0]);
  console.log(out.join('\n'));
  await browser.close();
})();
