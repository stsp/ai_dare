// every room: Ai on each platform, 20 s of guards coming and going; report any live guard overlapping a wall
const { chromium } = require('playwright-core');
(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const page = await browser.newPage({ viewport: { width: 1040, height: 800 } });
  page.on('pageerror', (e) => console.log('PAGEERROR', e.message));
  await page.goto('http://127.0.0.1:8801/index.html'); await page.waitForTimeout(1500);
  await page.click('#screen'); await page.waitForTimeout(200);
  const out = await page.evaluate(() => {
    startGame(); state.fitted = 9; state.timeLeft = 99999;
    const bad = [], seen = { rooms: 0, spawned: 0 };
    for (const key of ROOM_IDS) {
      const r = ROOMS[key];
      if (key === ESCAPE_ROOM) continue;                       // stepping in there ends the game
      const plats = r.platforms.filter((p) => p.x1 - p.x0 >= 5);
      for (const p of plats) {
        const cx = Math.round((p.x0 + p.x1) / 2) * 8;
        state.mode = 'play'; guards = []; state.pursuer = null; resetAi(cx, p.y * 8 - AI_H); enterRoom(key, cx, p.y * 8 - AI_H); ai.invuln = 1e9; ai.energy = 999;
        state.clearedRooms.delete(key);
        seen.rooms++;
        for (let i = 0; i < 20 * 60; i++) {
          if (state.mode !== 'play') break;
          state.guardClock += 0.5;                               // hurry them in
          updateAi(1 / 60); updateGuards(1 / 60);
          if (state.room !== key) break;
          for (const t of guards) {
            if (t.dead || t.riding) continue;
            for (const wl of wallsOf(key)) if (overlaps(t.x, t.y, GUARD_W, GUARD_H - 8, wl.x0, wl.y0, wl.x1 - wl.x0, wl.y1 - wl.y0)) {
              bad.push(`${key} feet ${p.y * 8}: guard at ${t.x.toFixed(1)},${t.y} in wall ${wl.x0}-${wl.x1} rows ${wl.y0 / 8}-${wl.y1 / 8}${t.entering ? ' entering' : ''}`);
              t.dead = true;
            }
          }
          seen.spawned = Math.max(seen.spawned, guards.length);
        }
      }
    }
    return { bad: [...new Set(bad)].slice(0, 40), n: bad.length, seen };
  });
  console.log(JSON.stringify(out.seen), 'overlaps:', out.n); console.log(out.bad.join('\n'));
  await browser.close();
})();
