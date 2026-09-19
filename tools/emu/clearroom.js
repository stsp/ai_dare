// Every room, every floor: guards shot as they come (the game served at 127.0.0.1:8801). A floor fails when a guard is alive off screen or inside a wall, or the room is never declared safe.
const { chromium } = require('playwright-core');
(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const page = await browser.newPage({ viewport: { width: 1040, height: 800 } });
  page.on('pageerror', (e) => console.log('PAGEERROR', e.message));
  await page.goto('http://127.0.0.1:8801/index.html'); await page.waitForTimeout(1500);
  await page.click('#screen'); await page.waitForTimeout(200);
  const out = await page.evaluate(() => {
    startGame(); state.fitted = 9; state.timeLeft = 99999;
    const bad = []; let floors = 0;
    for (const key of ROOM_IDS) {
      const r = ROOMS[key];
      if (key === ESCAPE_ROOM) continue;                       // stepping in there ends the game
      if (unguardedRoom(key, r) || entryOnlyRoom(key, r)) continue;
      for (const p of r.platforms.filter((p) => p.x1 - p.x0 >= 5)) {
        const cx = Math.round((p.x0 + p.x1) / 2) * 8;
        state.clearedRooms.delete(key); state.deadTreens.delete(key);
        state.mode = 'play'; treens = []; state.pursuer = null; resetDan(cx, p.y * 8 - DAN_H); enterRoom(key, cx, p.y * 8 - DAN_H); dan.invuln = 1e9;
        floors++;
        let kills = 0, hidden = null;
        for (let i = 0; i < 60 * 60 && !state.clearedRooms.has(key); i++) {
          if (state.mode !== 'play' || state.room !== key) break;
          state.treenClock += 0.1;
          updateDan(1 / 60); updateTreens(1 / 60); updateLasers(1 / 60);
          for (const t of treens) {
            if (t.dead) continue;
            if ((t.x < 0 || t.x + TREEN_W > VIEW_W) && !t.riding) hidden = `alive off screen at ${t.x.toFixed(1)},${t.y}`;
            if (!t.riding && treenInWall(key, t.x, t.y)) hidden = `alive in a wall at ${t.x.toFixed(1)},${t.y}`;
            if (i % 30 === 0 && !t.riding) { killTreen(t); kills++; }
          }
          if (hidden) break;
        }
        if (hidden) bad.push(`${key} feet ${p.y * 8}: ${hidden}`);
        else if (!state.clearedRooms.has(key)) bad.push(`${key} feet ${p.y * 8}: not safe after ${kills} kills, alive ${treens.filter((t) => !t.dead).length}, dead here ${(state.deadTreens.get(key) || new Set()).size}`);
      }
    }
    return { floors, bad };
  });
  console.log('floors', out.floors, 'problems', out.bad.length); console.log(out.bad.slice(0, 30).join('\n'));
  await browser.close();
})();
