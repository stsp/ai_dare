// The rooms the game builds out of its tiles, saved as one picture, so it can
// be compared with the original's own screens cell by cell.
//   NODE_PATH=... node tools/check_tiles.js OUT.png     (the game served at 127.0.0.1:8801)
const { chromium } = require('playwright-core');
const out = process.argv[2] || 'sheet.png';
(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const page = await browser.newPage({ viewport: { width: 1040, height: 800 } });
  page.on('pageerror', (e) => console.log('PAGEERROR', e.message));
  await page.goto('http://127.0.0.1:8801/index.html');
  await page.waitForFunction(() => typeof SHEETS !== 'undefined' && SHEETS.rooms, null, { timeout: 20000 });
  const info = await page.evaluate(() => ({
    w: SHEETS.rooms.img.width, h: SHEETS.rooms.img.height,
    tiles: ROOMS_TILES.count, rooms: Object.keys(ROOMS_TILES.rooms).length,
  }));
  console.log(JSON.stringify(info));
  const png = await page.evaluate(() => SHEETS.rooms.img.toDataURL());
  require('fs').writeFileSync(out, Buffer.from(png.split(',')[1], 'base64'));
  await browser.close();
})();
