// A wall gun's shot through Ai, in the engine, next to what the original does
// (disassembled, and filmed in its room 127 from the walkthrough's snapshot):
// the shot flies on through him and every turn it is inside him - his three
// cells, feet to five rows over his crown - costs three pixels of the bar.
//   node wallgun.js ROOM CELL FEET [KEYS] [FRAMES] [OUTPREFIX]
// prints each turn's shots and the energy lost, in the original's bar pixels;
// with OUTPREFIX saves every third frame's canvas.
const { chromium } = require('playwright-core');
const [room, cell, feet, keys = '', frames = '120', out = ''] = process.argv.slice(2);
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const page = await browser.newPage({ viewport: { width: 1040, height: 800 } });
  page.on('pageerror', (e) => console.log('PAGEERROR', e.message));
  await page.goto('http://127.0.0.1:8801/index.html'); await page.waitForTimeout(1500);
  await page.click('#screen'); await page.waitForTimeout(200);
  await page.evaluate(([room, cell, feet, held]) => {
    window.requestAnimationFrame = () => 0;
    startGame(); state.fitted = 9; state.timeLeft = 99999; state.clearedRooms.add(room);
    resetAi(cell * 8, feet - AI_H); enterRoom(room, cell * 8, feet - AI_H); guards = [];
    for (const k of held.split(',').filter(Boolean)) keys[k] = true;
  }, [room, +cell, +feet, keys]);
  let lost = 0;
  for (let f = 1; f <= +frames; f++) {
    const st = await page.evaluate(() => {
      const e0 = state.energy;
      guards = []; updateAi(FRAME); updateGuns(FRAME); draw();
      return { lost: (e0 - state.energy) * ENERGY_BAR_PX / ENERGY_MAX, cell: Math.floor((ai.x + AI_W / 2) / 8), feet: ai.y + AI_H,
               shots: gunShots.map((s) => [s.y, Math.floor(s.x / 8)]) };
    });
    lost += st.lost;
    console.log(f, 'cell', st.cell, 'feet', st.feet, 'lost', Math.round(lost), JSON.stringify(st.shots));
    if (out && f % 3 === 0) {
      const png = await page.evaluate(() => document.getElementById('screen').toDataURL());
      require('fs').writeFileSync(`${out}_${String(f).padStart(3, '0')}.png`, Buffer.from(png.split(',')[1], 'base64'));
    }
  }
  await browser.close();
})();
