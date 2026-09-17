const { chromium } = require('playwright-core');
const [room, x, y, key, frames] = process.argv.slice(2);
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const page = await browser.newPage({ viewport: { width: 800, height: 620 } });
  page.on('pageerror', e => console.log('PAGEERROR', e.message));
  await page.goto('http://127.0.0.1:8801/index.html'); await page.waitForTimeout(600);
  await page.click('#screen'); await page.keyboard.press('Enter'); await page.waitForTimeout(300);
  const out = await page.evaluate(([room, x, y, key, frames]) => {
    const log = [];
    resetDan(+x, +y); enterRoom(room, +x, +y); dan.invuln = 1e9;
    for (let i = 0; i < 90; i++) updateDan(1 / 60);
    const st = () => `room ${state.room} x ${dan.x.toFixed(1)} y ${dan.y.toFixed(1)} g ${dan.onGround} lift ${dan.onLift ? (dan.onLift.dir + (dan.onLift.link ? '>' + dan.onLift.link.to : '') + (dan.onLift.shaft ? ' sh' : '')) : '-'}`;
    log.push('settled: ' + st());
    keys[key] = true;
    for (let i = 0; i < +frames; i++) { updateDan(1 / 60); if (i % 10 === 0) log.push(`${i}: ` + st()); }
    keys[key] = false;
    return log;
  }, [room, x, y, key, frames]);
  console.log(out.join('\n'));
  await browser.close();
})();
