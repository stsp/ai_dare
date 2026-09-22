// Look at the game itself: Ai put down at CELL on the widest platform of ROOM, one frame drawn, the canvas saved at 4x.
//   FITTED=n NODE_PATH=... node shot.js ROOM CELL OUT.png [fire|kneel]     (the game served at 127.0.0.1:8801)
const { chromium } = require('playwright-core');
const [room, cell, out, pose] = process.argv.slice(2);
(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const page = await browser.newPage({ viewport: { width: 1040, height: 800 } });
  page.on('pageerror', (e) => console.log('PAGEERROR', e.message));
  await page.goto('http://127.0.0.1:8801/index.html'); await page.waitForTimeout(1500);
  await page.click('#screen'); await page.waitForTimeout(200);
  const info = await page.evaluate(([room, cell, pose, process_fitted]) => {
    startGame(); state.fitted = +(process_fitted || 0); state.timeLeft = 99999;
    const r = ROOMS[room]; const p = widestPlatform(r); resetAi(cell * 8, p.y - AI_H); enterRoom(room, cell * 8, p.y - AI_H); ai.invuln = 1e9;
    for (let i = 0; i < 30; i++) { updateAi(1 / 60); }
    if (pose === 'fire') { keys.Space = true; }
    if (pose === 'kneel') { keys.ArrowDown = true; }
    for (let i = 0; i < 3; i++) { updateAi(1 / 60); }
    if (typeof updateGuards === 'function') for (let i = 0; i < 3; i++) updateGuards(1 / 60);
    draw();
    return { room: state.room, x: ai.x, y: ai.y, guards: guards.map((t) => [Math.round(t.x), Math.round(t.y), t.dir, t.entering]) };
  }, [room, +cell, pose || '', +(process.env.FITTED || 0)]);
  console.log(JSON.stringify(info));
  const png = await page.evaluate(() => { const c = document.getElementById('screen'); const cv = document.createElement('canvas'); cv.width = c.width * 4; cv.height = c.height * 4; const x = cv.getContext('2d'); x.imageSmoothingEnabled = false; x.drawImage(c, 0, 0, cv.width, cv.height); return cv.toDataURL(); });
  require('fs').writeFileSync(out, Buffer.from(png.split(',')[1], 'base64'));
  await browser.close();
})();
