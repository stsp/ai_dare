// room 83: Ai jumps onto the part; frames saved at the pickup (flash), mid flash gap, and a second later (messages, viewer)
const { chromium } = require('playwright-core');
(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const page = await browser.newPage({ viewport: { width: 1040, height: 800 } });
  page.on('pageerror', (e) => console.log('PAGEERROR', e.message));
  await page.goto('http://127.0.0.1:8801/index.html'); await page.waitForTimeout(1500);
  await page.click('#screen'); await page.waitForTimeout(200);
  const grab = async (name) => { const png = await page.evaluate(() => { const c = document.getElementById('screen'); return c.toDataURL(); }); require('fs').writeFileSync(name, Buffer.from(png.split(',')[1], 'base64')); };
  const step = (n) => page.evaluate((n) => { for (let i = 0; i < n; i++) { updateAi(1 / 60); updatePickups(); updateGuards(1 / 60); updateLasers(1 / 60); if (state.partFlash > 0) state.partFlash -= 1 / 60; tickMessages(1 / 60); if (state.viewerTimer > 0 && (state.viewerTimer -= 1 / 60) <= 0) state.viewer = 'asteroid'; if (state.viewerStatic > 0) state.viewerStatic -= 1 / 60; runCues(1 / 60); } draw(); return { x: ai.x, y: ai.y, carrying: state.carrying, flash: state.partFlash, msg: state.msgTop, low: state.msgBottom, viewer: state.viewer }; }, n);
  const info = await page.evaluate(() => {
    window.requestAnimationFrame = () => 0;   // the page's own loop stops: frames are stepped by hand
    startGame(); state.fitted = 0; state.timeLeft = 99999; state.clearedRooms.add('83');
    const r = ROOMS['83']; const p = widestPlatform(r); resetAi(64, p.y - AI_H); enterRoom('83', 64, p.y - AI_H); ai.invuln = 1e9; guards = [];
    for (let i = 0; i < 20; i++) updateAi(1 / 60);
    keys.ArrowLeft = true; return sdsParts.filter((k) => k.key === '83');
  });
  console.log(JSON.stringify(info));
  let st;
  for (let i = 0; i < 4; i++) st = await step(1);
  await page.evaluate(() => { keys.ArrowUp = true; });
  for (let i = 0; i < 6; i++) st = await step(1);
  await page.evaluate(() => { keys.ArrowUp = false; keys.ArrowLeft = false; });
  for (let i = 0; i < 90; i++) { st = await step(1); if (st.carrying) break; }
  console.log('pickup', JSON.stringify(st)); await grab(process.argv[2] + '_a.png');
  st = await step(3); console.log(JSON.stringify(st)); await grab(process.argv[2] + '_b.png');
  st = await step(20); console.log(JSON.stringify(st)); await grab(process.argv[2] + '_c.png');
  st = await step(40); console.log(JSON.stringify(st)); await grab(process.argv[2] + '_d.png');
  // the timeline: when the flash and the messages come and go, in seconds from the pickup
  let t = 63 / 60, prev = ''; const log = [];
  for (let i = 0; i < 60 * 12; i++) { st = await step(1); t += 1 / 60; const k = (st.flash > 0 ? 'FLASH ' : '') + (st.msg ? 'top:' + st.msg[0] : '') + ' ' + (st.low ? 'low:' + st.low[0] : '') + ' viewer=' + st.viewer; if (k !== prev) { log.push(t.toFixed(2) + 's ' + k); prev = k; } }
  console.log(log.join('\n'));
  await browser.close();
})();
