// Dan walks for eight seconds; Backspace; he must be where he was five seconds before, and everything else with him
const { chromium } = require('playwright-core');
(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const page = await browser.newPage({ viewport: { width: 1040, height: 800 } });
  page.on('pageerror', (e) => console.log('PAGEERROR', e.message));
  await page.goto('http://127.0.0.1:8801/index.html'); await page.waitForTimeout(1500);
  await page.click('#screen'); await page.waitForTimeout(200);
  const out = await page.evaluate(() => {
    window.requestAnimationFrame = () => 0;
    startGame(); state.timeLeft = 99999;
    const r = ROOMS['113']; const p = widestPlatform(r); resetDan(24, p.y - DAN_H); enterRoom('113', 24, p.y - DAN_H);
    const dt = 1 / 60, trail = [];
    const tick = () => { state.timeLeft -= dt; if (state.messageTimer > 0) state.messageTimer -= dt; updateDan(dt); updateTreens(dt); updateGuns(dt); updateLasers(dt); updatePickups(); runCues(dt); remember(dt); };
    let t = 0;
    for (let i = 0; i < 8 * 60; i++) {
      keys.ArrowRight = (i % 120) < 60;                  // a second right, a second still
      if (i === 200) state.score += 100;
      tick(); t += dt;
      trail.push({ t, x: dan.x, room: state.room, score: state.score, time: state.timeLeft, treens: treens.filter((x) => !x.dead).length, hist: history.length });
    }
    const before = trail[trail.length - 1];
    rewind(REWIND_SECS);
    const after = { x: dan.x, room: state.room, score: state.score, time: state.timeLeft, treens: treens.filter((x) => !x.dead).length, hist: history.length };
    const want = trail.reduce((a, b) => (Math.abs(b.t - (before.t - 5)) < Math.abs(a.t - (before.t - 5)) ? b : a));
    // and the second rewind goes back further still (to the oldest kept)
    rewind(REWIND_SECS);
    const after2 = { x: dan.x, score: state.score, time: state.timeLeft, hist: history.length };
    return { before, want, after, after2 };
  });
  console.log(JSON.stringify(out, null, 1));
  await browser.close();
})();
