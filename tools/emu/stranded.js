// every room with two floors: Ai on one, a guard put on another with no lift between; he must be out within 15 s and one must arrive on Ai's floor
const { chromium } = require('playwright-core');
(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const page = await browser.newPage({ viewport: { width: 1040, height: 800 } });
  page.on('pageerror', (e) => console.log('PAGEERROR', e.message));
  await page.goto('http://127.0.0.1:8801/index.html' + (process.env.SEED ? '?seed=' + process.env.SEED : '')); await page.waitForTimeout(1500);
  await page.click('#screen'); await page.waitForTimeout(200);
  const out = await page.evaluate(() => {
    startGame(); state.fitted = 9; state.timeLeft = 99999;
    const bad = [], stuck = []; let cases = 0, left = 0, arrived = 0, noEdge = 0;
    for (const key of ROOM_IDS) {
      const r = ROOMS[key];
      if (key === ESCAPE_ROOM || unguardedRoom(key, r) || entryOnlyRoom(key, r)) continue;
      const wide = r.platforms.filter((p) => p.x1 - p.x0 >= 5);
      for (const pd of wide) for (const pg of wide) {
        if (Math.abs(pd.y - pg.y) < 2) continue;
        const cx = Math.round((pd.x0 + pd.x1) / 2) * 8;
        state.clearedRooms.delete(key); state.deadGuards.delete(key);
        state.mode = 'play'; guards = []; state.pursuer = null; resetAi(cx, pd.y * 8 - AI_H); enterRoom(key, cx, pd.y * 8 - AI_H); ai.invuln = 1e9;
        for (let i = 0; i < 120; i++) updateAi(1 / 60);            // let him come to rest: put down he may drop, or stand on a block
        if (state.mode !== 'play' || state.room !== key || !ai.onGround) continue;   // he did not stay where he was put
        guards = [];
        const gx = Math.round((pg.x0 + pg.x1) / 2) * 8;
        if (guardInWall(key, gx, pg.y * 8 - GUARD_H)) continue;
        const g = { id: state.guardSeq++, x: gx, y: pg.y * 8 - GUARD_H, x0: pg.x0 * 8, x1: pg.x1 * 8 - GUARD_W, dir: 1, anim: 0, dead: false, react: 0, lifts: false };
        guards.push(g);
        if (liftToAi(g, key)) continue;                    // a lift would bring him: another test's business
        if (!wayToAi(key, ROOMS[key])) continue;          // no doorway onto the floor he came to rest on: he keeps his beat, rightly
        const hisFloors = aiFloors(ROOMS[key]).map((p) => p.y * 8);   // the floor a guard would have to reach to be with him
        cases++;
        let gone = false, came = false;
        for (let i = 0; i < 15 * 60; i++) {
          if (state.mode !== 'play' || state.room !== key) break;
          updateAi(1 / 60); updateGuards(1 / 60); updateLasers(1 / 60);
          if (g.gone) gone = true;
          if (guards.some((t) => !t.dead && t !== g && hisFloors.some((f) => Math.abs(t.y + GUARD_H - f) < 12))) came = true;
          if (gone && came) break;
        }
        if (state.mode !== 'play' || state.room !== key) continue;   // knocked out of the room mid-test: nothing to judge
        if (!gone && !g.leaving && g.noWay && g.noWay.size && !guardLeaves(g, key)) { noEdge++; continue; }   // walls on every way out
        if (!gone && !guardLeaves(g, key) && !(g.noWay && g.noWay.size)) { noEdge++; continue; }
        if (gone) left++; if (came) arrived++;
        if (!gone) stuck.push(`${key}: guard on feet ${pg.y * 8} (beat ${g.x0}-${g.x1}) never left, at ${g.x.toFixed(0)}, Ai on ${pd.y * 8}; room now ${state.room} ai ${ai.x.toFixed(0)},${ai.y.toFixed(0)} ground ${ai.onGround} mode ${state.mode} wayToAi ${wayToAi(key, ROOMS[key])} apart ${(g.apart || 0).toFixed(1)} leaving ${g.leaving} noWay ${[...(g.noWay || [])]}`);
        else if (!came) bad.push(`${key}: guard left but none came to Ai's floor ${pd.y * 8} in 15 s`);
      }
    }
    return { cases, left, arrived, noEdge, stuck: stuck.slice(0, 12), bad: bad.slice(0, 12), nStuck: stuck.length, nBad: bad.length };
  });
  console.log(JSON.stringify({ cases: out.cases, left: out.left, arrived: out.arrived, floorsWithNoEdge: out.noEdge, stuck: out.nStuck, noArrival: out.nBad }));
  console.log(out.stuck.join('\n')); console.log(out.bad.join('\n'));
  await browser.close();
})();
