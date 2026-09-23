// The guards' draw: every new game places them afresh, `?seed=N` repeats a game's, and within a game a room keeps its draw (re-entering, rewinding)
const { chromium } = require('playwright-core');
async function layouts(page, url) {
  await page.goto(url); await page.waitForTimeout(1500);
  return page.evaluate(() => {
    window.requestAnimationFrame = () => 0;
    // eight guarded rooms, spread through the level
    const all = Object.keys(ROOMS).filter((k) => !unguardedRoom(k, ROOMS[k]) && !entryOnlyRoom(k, ROOMS[k]) && ROOMS[k].platforms.some((p) => p.x1 - p.x0 >= 5));
    const keys = all.filter((k, i) => i % Math.ceil(all.length / 8) === 0);
    const draw = () => keys.map((k) => { const r = ROOMS[k]; if (!r) return ''; const p = widestPlatform(r); resetAi(24, p.y - AI_H); enterRoom(k, 24, p.y - AI_H);
      return guards.map((g) => `${Math.round(g.x)},${g.y},${g.dir}`).join(' '); }).join(' | ');
    const out = [];
    for (let i = 0; i < 4; i++) {
      startGame();
      const seed = state.seed, first = draw();
      state.roomGuards = new Map();
      const again = draw();
      const snap = snapshotPlay(); state.seed = 12345; restorePlay(snap);
      out.push({ seed, first, sameInGame: first === again, seedKept: state.seed === seed });
    }
    return out;
  });
}
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const page = await browser.newPage();
  page.on('pageerror', (e) => console.log('PAGEERROR', e.message));
  const free = await layouts(page, 'http://127.0.0.1:8801/index.html');
  const fixedA = await layouts(page, 'http://127.0.0.1:8801/index.html?seed=7');
  const fixedB = await layouts(page, 'http://127.0.0.1:8801/index.html?seed=7');
  const distinct = new Set(free.map((g) => g.first)).size;
  const ok = distinct > 1 && free.every((g) => g.sameInGame && g.seedKept)
    && fixedA.every((g, i) => g.seed === 7 && g.first === fixedB[i].first);
  console.log(JSON.stringify({ seeds: free.map((g) => g.seed), distinct, free, fixed: fixedA[0] }, null, 1));
  console.log(ok ? 'PASS' : 'FAIL');
  await browser.close();
  process.exit(ok ? 0 : 1);
})();
