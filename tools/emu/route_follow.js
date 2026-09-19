// Follow the recorded walkthrough's room sequence in the recreation, choosing moves from the level's links.
const { chromium } = require('playwright-core');
const fs = require('fs');
const seq = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));   // [room, room, ...]
const fitted0 = +(process.argv[3] || 0);
(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const page = await browser.newPage({ viewport: { width: 800, height: 620 } });
  page.on('pageerror', (e) => console.log('PAGEERROR', e.message));
  await page.goto('http://127.0.0.1:8801/index.html'); await page.waitForTimeout(600);
  await page.click('#screen'); await page.waitForTimeout(200);
  const out = await page.evaluate(([seq, fitted0]) => {
    startGame(); state.fitted = fitted0; state.timeLeft = 99999; window.TRACE = seq.length <= 4;
    const log = [];
    const K = { right: 'ArrowRight', left: 'ArrowLeft', up: 'ArrowUp', down: 'ArrowDown' };
    const clear = () => { for (const k in keys) keys[k] = false; };
    const tick = () => { if (state.mode !== 'play') return; updateDan(1 / 60); updatePickups(); };
    const st = () => `${state.room}@${Math.round(dan.x / 8)},${Math.round(dan.y + DAN_H)}`;
    const settle = () => { for (let i = 0; i < 400; i++) { tick(); if (dan.onGround && !dan.onLift && i > 10) break; } };
    const goto = (cell) => { const tx = cell * 8; let lastX = dan.x, still = 0; for (let i = 0; i < 600 && Math.abs(dan.x - tx) > 2; i++) { const d = dan.x < tx ? 'right' : 'left'; keys[K[d]] = true; if (Math.abs(dan.x - lastX) < 0.5 && ++still > 8 && guns.some((g) => !g.dead && g.type === GUN_FLOOR && Math.abs(g.x - dan.x) < 24)) { keys.ArrowUp = true; for (let k = 0; k < 6; k++) tick(); keys.ArrowUp = false; for (let k = 0; k < 40 && !dan.onGround; k++) tick(); still = 0; } lastX = dan.x; tick(); if (!dan.onGround && !dan.onLift) { clear(); settle(); } } clear(); for (let i = 0; i < 6; i++) tick(); };
    const hole = (dir) => { if (!dan.onGround) return false; const ax = dan.x + (dir === 'right' || dir > 0 ? DAN_W + 4 : -4), feet = dan.y + DAN_H; if (ax < 0 || ax >= VIEW_W) return false; const under = platformsOf(currentRoom()).some((p) => Math.abs(p.y - feet) < 2 && ax >= p.x0 && ax < p.x1); return !under; };
    const walk = (dir, target, wantFeet) => { const descending = wantFeet != null && wantFeet > dan.y + DAN_H + 8; // the way out is a floor lower: drop through the gaps instead of hopping them
 if (window.TRACE) log.push('   walk ' + dir + ' from ' + st()); const r0 = state.room; let lastX = dan.x, still = 0, fellAt = null; for (let i = 0; i < 900; i++) { keys[K[dir]] = true; if (hole(dir) && !descending && !LEVEL.links.some((l) => l.from === r0 && l.kind === 'drop' && l.to === target)) { if (window.TRACE) log.push('     hop over a hole at ' + st()); keys.ArrowUp = true; for (let k = 0; k < 6; k++) tick(); keys.ArrowUp = false; for (let k = 0; k < 40 && !dan.onGround; k++) tick(); } tick(); if (state.room !== r0) { clear(); settle(); return { room: state.room, fellAt }; } if (fellAt == null && !dan.onGround && !dan.onLift) fellAt = Math.round(dan.x / 8); if (Math.abs(dan.x - lastX) < 0.5) { if (++still > 8 && guns.some((g) => !g.dead && g.type === GUN_FLOOR && Math.abs(g.x - dan.x) < 24)) { keys.ArrowUp = true; for (let k = 0; k < 6; k++) tick(); keys.ArrowUp = false; for (let k = 0; k < 40; k++) { tick(); if (state.room !== r0) break; } still = 0; } else if (++still > 60) break; } else still = 0; lastX = dan.x; if (state.mode !== 'play') break; } clear(); return { room: state.room, fellAt, stuck: true }; };
    const jumpFrom = (cell, dir) => { if (window.TRACE) log.push('   jump from ' + cell + ' ' + dir + ' at ' + st()); goto(cell); if (window.TRACE) log.push('     at ' + st() + ' latch=' + dan.liftLatch + ' g=' + dan.onGround); keys[K[dir]] = true; for (let i = 0; i < 2; i++) tick(); if (window.TRACE) log.push('     run ' + st() + ' x=' + dan.x.toFixed(1)); keys.ArrowUp = true; for (let i = 0; i < 6; i++) tick(); keys.ArrowUp = false; for (let i = 0; i < 90; i++) { tick(); if (i > 12 && dan.onGround) break; } clear(); settle(); if (window.TRACE) log.push('     landed ' + st()); };
    const lift = (dir) => { keys[K[dir]] = true; for (let i = 0; i < 6; i++) tick(); clear(); for (let i = 0; i < 600; i++) { tick(); if (i > 20 && dan.onGround && !dan.onLift) break; } settle(); };
    const snapshot = () => JSON.stringify({ room: state.room, x: dan.x, y: dan.y, fitted: state.fitted, carrying: state.carrying, taken: sdsParts.map((p) => p.taken) });
    const restore = (s) => { const o = JSON.parse(s); enterRoom(o.room, o.x, o.y); dan.vx = 0; dan.vy = 0; dan.onLift = null; state.fitted = o.fitted; state.carrying = o.carrying; sdsParts.forEach((p, i) => p.taken = o.taken[i]); state.mode = 'play'; settle(); };
    const PRISONS = ['50', '53', '241', '192'];
    // the moves out of a room, as closures that perform one and return true on reaching `l.to`
    const movesFor = (from) => {
      const moves = [];
      for (const l of LEVEL.links.filter((l) => l.from === from)) {
        const to = l.to;
        if (l.kind === 'right' || l.kind === 'left') moves.push({ l, go: () => walkJumping(l.kind, to, from, 3, l.feet) });
        if (l.kind === 'drop') moves.push({ l, go: () => { gotoJumping(Math.max(l.x0 - 2, 0)); const r = walk('right', to); if (r.room === to) return true; if (state.room === from) { goto(Math.min(l.x1 + 2, 29)); const r2 = walk('left', to); return r2.room === to; } return false; } });
        if (l.kind === 'up' || l.kind === 'down') moves.push({ l, go: () => { if (l.feet != null && l.feet >= 0 && Math.abs(dan.y + DAN_H - l.feet) > 14) return false; for (const c of [l.x0, l.x1, Math.round((l.x0 + l.x1) / 2)]) { if (!gotoJumping(c)) continue; lift(l.kind); if (state.room === to) return true; if (state.room !== from) return false; } return false; } });
      }
      return moves;
    };
    // walk to a cell on the level Dan is on, jumping the gaps in it (up to two)
    const gotoJumping = (cell, gaps = 2) => {
      const s0 = snapshot(); const feet0 = dan.y + DAN_H; const r0 = state.room;
      let fellAt = null;
      const tx = cell * 8;
      let lastX = dan.x, still = 0;
      for (let i = 0; i < 600 && Math.abs(dan.x - tx) > 2; i++) { keys[K[dan.x < tx ? 'right' : 'left']] = true; if (Math.abs(dan.x - lastX) < 0.5 && ++still > 8 && guns.some((g) => !g.dead && g.type === GUN_FLOOR && Math.abs(g.x - dan.x) < 24)) { if (window.TRACE) log.push('     hop over a gun at ' + st()); keys.ArrowUp = true; for (let k = 0; k < 6; k++) tick(); keys.ArrowUp = false; for (let k = 0; k < 40 && !dan.onGround; k++) tick(); still = 0; } lastX = dan.x; tick(); if (!dan.onGround && !dan.onLift) { fellAt = Math.round(dan.x / 8); break; } }
      clear();
      if (fellAt == null) { for (let i = 0; i < 6; i++) tick(); return true; }
      if (gaps <= 0) { settle(); return false; }
      const dir = fellAt < cell ? 'right' : 'left';
      for (const lead of [1, 2, 3]) {
        restore(s0);
        jumpFrom(dir === 'right' ? fellAt - lead : fellAt + lead, dir);
        if (state.room !== r0 || Math.abs(dan.y + DAN_H - feet0) > 8) continue;
        if (gotoJumping(cell, gaps - 1)) return true;
      }
      restore(s0); return false;
    };
    // walk `dir` to `to`; at each gap, retry with a running jump from a few cells before it (up to `gaps` gaps)
    let offLevel = null;                                   // reached the room, but a level off: kept as a last resort
    const walkJumpingInner = (dir, to, from, gaps, wantFeet) => {
      const good = () => state.room === to && (wantFeet == null || Math.abs(dan.y + DAN_H - wantFeet) <= 14);
      const descending = wantFeet != null && wantFeet > dan.y + DAN_H + 8;
      const s0 = snapshot(); const r = walk(dir, to, wantFeet);
      if (window.TRACE) log.push('     walked ' + dir + ' -> ' + st() + ' fellAt=' + r.fellAt + ' gaps=' + gaps);
      if (good() && (r.fellAt == null || descending)) return true;
      if (state.room === to) offLevel = offLevel || snapshot();
      if (r.fellAt != null && gaps > 0) {
        // fell on the way: a gap to jump - keep the level he set off on
        for (const lead of [1, 2, 3, 0]) {
          restore(s0); jumpFrom(dir === 'right' ? r.fellAt - lead : r.fellAt + lead, dir);
          if (good()) return true;
          if (state.room === to) { offLevel = offLevel || snapshot(); continue; }
          if (state.room !== from) continue;
          if (walkJumpingInner(dir, to, from, gaps - 1, wantFeet)) return true;
        }
      }
      return false;
    };
    const walkJumping = (dir, to, from, gaps, wantFeet) => {
      offLevel = null;
      if (walkJumpingInner(dir, to, from, gaps, wantFeet)) return true;
      if (offLevel) { restore(offLevel); return true; }
      return false;
    };
    const stateKey = () => `${state.room}:${Math.round((dan.y + DAN_H) / 8)}:${Math.floor(dan.x / 40)}`;
    // reach `to` by one move, else by a short detour (back a room for a lift, up a level first)
    const tryMove = (to) => {
      const from = state.room;
      const s0 = snapshot();
      for (const m of movesFor(from).filter((m) => m.l.to === to)) { if (m.go() && state.room === to) return true; restore(s0); }
      const seen = new Set([stateKey()]);
      let frontier = [{ s: s0, d: 0 }];
      let budget = 6000;
      while (frontier.length && budget > 0) {
        const cur = frontier.shift();
        if (cur.d >= 4) continue;
        const room = JSON.parse(cur.s).room;
        for (const m of movesFor(room)) {
          if (--budget <= 0) break;
          restore(cur.s);
          m.go();
          if (window.TRACE) log.push(`   bfs d${cur.d} ${room} ${m.l.kind}->${m.l.to}@${m.l.feet ?? ''} => ${st()}`);
          if (state.mode !== 'play') continue;
          if (state.room === to) { if (window.TRACE) log.push('   via detour depth ' + (cur.d + 1)); return true; }
          if (PRISONS.includes(state.room)) continue;
          const k = stateKey();
          if (!seen.has(k)) { seen.add(k); frontier.push({ s: snapshot(), d: cur.d + 1 }); }
        }
      }
      restore(s0);
      return false;
    };
    // place Dan in the first room
    const r0 = ROOMS[String(seq[0])]; const sp = widestPlatform(r0); resetDan(sp.x, sp.y - DAN_H); enterRoom(String(seq[0]), sp.x, sp.y - DAN_H); dan.invuln = 1e9; settle();
    let ok = 0;
    for (let i = 1; i < seq.length; i++) {
      if (seq[i] == null) { const r = ROOMS[String(seq[i + 1])]; const p = widestPlatform(r); resetDan(p.x, p.y - DAN_H); enterRoom(String(seq[i + 1]), p.x, p.y - DAN_H); settle(); i++; continue; }
      const to = String(seq[i]); const from = state.room;
      if (from === to) continue;
      // in a part room, sweep to the part first
      const part = sdsParts.find((p) => p.key === from && !p.taken && p.id === state.fitted);
      if (part) {
        // the part may lie on another floor: jump from the edge of this one towards it, as in 185
        const c = Math.round(part.x / 8), feet = dan.y + DAN_H, cx = dan.x / 8;
        const plat = ROOMS[from].platforms.find((p) => Math.abs(p.y * 8 - feet) < 2 && cx >= p.x0 - 1 && cx <= p.x1 + 1);
        if (plat && c > plat.x1) jumpFrom(plat.x1 - 1, 'right'); else if (plat && c < plat.x0) jumpFrom(plat.x0 + 1, 'left');
        // it is taken on the way down, so the jump must end on it: five cells is a jump's reach
        goto(c); const plat2 = ROOMS[from].platforms.find((p) => Math.abs(p.y * 8 - (dan.y + DAN_H)) < 2 && c >= p.x0 - 1 && c <= p.x1 + 1);
        if (plat2 && c + 5 <= plat2.x1) { goto(c + 5); if (Math.abs(dan.x / 8 - (c + 5)) <= 1) jumpFrom(c + 5, 'left'); else jumpFrom(c - 5, 'right'); }   // a wall short of the takeoff: from the other side
        else jumpFrom(c - 5, 'right');
      }
      if (from === SDS_ROOM && state.carrying) { goto(2); for (let k = 0; k < 60; k++) tick(); }
      // captured on purpose: the walkthrough let the guards take Dan to the cells
      if (PRISONS.includes(to) && !LEVEL.links.some((l) => l.from === from && l.to === to)) {
        const r = ROOMS[to]; const p = widestPlatform(r); resetDan(p.x, p.y - DAN_H); enterRoom(to, p.x, p.y - DAN_H); settle();
        log.push(`ok ${from} -> ${to}: captured (by design)`); ok++; continue;
      }
      const got = state.room === to || tryMove(to);
      log.push(`${got ? 'ok ' : 'XX '}${from} -> ${to}: ${st()}${state.carrying ? ' carrying' : ''} fitted=${state.fitted}${state.mode !== 'play' ? ' MODE ' + state.mode : ''}`);
      if (!got) { // give up on this hop: teleport on so the rest can be checked
        const r = ROOMS[to]; if (!r) { log.push(`   no room ${to} in level`); break; }
        const p = widestPlatform(r); resetDan(p.x, p.y - DAN_H); enterRoom(to, p.x, p.y - DAN_H); settle(); state.mode = 'play';
      } else ok++;
    }
    log.push(`hops ok ${ok} of ${seq.filter((r, i) => i > 0 && r != null && seq[i - 1] != null).length}`);
    return log;
  }, [seq, fitted0]);
  console.log(out.join('\n'));
  await browser.close();
})();
