// room 255: run until a ceiling gun's shot is out, save frames of it
const { chromium } = require('playwright-core');
(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const page = await browser.newPage({ viewport: { width: 1040, height: 800 } });
  page.on('pageerror', (e) => console.log('PAGEERROR', e.message));
  await page.goto('http://127.0.0.1:8801/index.html'); await page.waitForTimeout(1500);
  await page.click('#screen'); await page.waitForTimeout(200);
  const grab = async (name) => { const png = await page.evaluate(() => document.getElementById('screen').toDataURL()); require('fs').writeFileSync(name, Buffer.from(png.split(',')[1], 'base64')); };
  const info = await page.evaluate(() => {
    window.requestAnimationFrame = () => 0;
    startGame(); state.fitted = 9; state.timeLeft = 99999; state.clearedRooms.add('255');
    const r = ROOMS['255']; resetAi(120, 96); enterRoom('255', 120, 96); ai.invuln = 1e9; guards = [];
    return guns.map((g) => ({ type: g.type, x: g.x, y: g.y, w: g.w, h: g.h, cy: g.cy }));
  });
  console.log(JSON.stringify(info));
  let n = 0;
  for (let i = 0; i < 600 && n < 3; i++) {
    const st = await page.evaluate(() => { updateAi(1 / 60); updateGuns(1 / 60); draw(); return gunShots.filter((s) => !s.done && s.by.type === 0).map((s) => [s.x, s.y, s.dx, s.dy]); });
    if (st.length && (i % 4 === 0)) { console.log(i, JSON.stringify(st)); await grab(process.argv[2] + '_' + n + '.png'); n++; }
  }
  await browser.close();
})();
