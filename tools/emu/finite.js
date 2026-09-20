// every room, every floor: shoot only the first guard, leave the next standing, and count who else arrives in 90 s
const { chromium } = require('playwright-core');
(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const page = await browser.newPage({ viewport: { width: 1040, height: 800 } });
  page.on('pageerror', (e) => console.log('PAGEERROR', e.message));
  await page.goto('http://127.0.0.1:8801/index.html'); await page.waitForTimeout(1500);
  await page.click('#screen'); await page.waitForTimeout(200);
  const out = await page.evaluate(() => {
    startGame(); state.fitted = 9; state.timeLeft = 99999;
    const bad = []; let floors = 0, most = 0;
    for (const key of ROOM_IDS) {
      const r = ROOMS[key];
      if (key === ESCAPE_ROOM || unguardedRoom(key, r) || entryOnlyRoom(key, r)) continue;
      for (const p of r.platforms.filter((p) => p.x1 - p.x0 >= 5)) {
        const cx = Math.round((p.x0 + p.x1) / 2) * 8;
        state.clearedRooms.delete(key); state.deadTreens.delete(key);
        state.mode = 'play'; treens = []; state.pursuer = null; resetDan(cx, p.y * 8 - DAN_H); enterRoom(key, cx, p.y * 8 - DAN_H); dan.invuln = 1e9;
        floors++;
        let killed = false;
        for (let i = 0; i < 90 * 60; i++) {
          if (state.mode !== 'play' || state.room !== key) break;
          state.treenClock += 0.1;
          updateDan(1 / 60); updateTreens(1 / 60); updateLasers(1 / 60);
          if (!killed) { const t = treens.find((t) => !t.dead && !t.riding); if (t) { killTreen(t); killed = true; } }
        }
        const seen = treens.filter((t) => !t.gone).length;   // one who ran out to come in where Ai is is the same guard
        most = Math.max(most, seen);
        if (seen > TREEN_MAX) bad.push(`${key} feet ${p.y * 8}: ${seen} guards came in all, one shot, ${treens.filter((t) => !t.dead).length} standing`);
      }
    }
    return { floors, most, bad };
  });
  console.log('floors', out.floors, 'most guards a floor saw', out.most, 'over the share:', out.bad.length); console.log(out.bad.slice(0, 10).join('\n'));
  await browser.close();
})();
