// The rooms a player must walk to finish the game, read off the level itself:
// each part in turn, each one carried to the slot, then the way out. Doors the
// original keeps shut until enough parts are fitted are respected on the way.
//   node quest_seq.js > quest_seq.json && node route_follow.js quest_seq.json 0
const { chromium } = require('playwright-core');
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const page = await browser.newPage({ viewport: { width: 800, height: 620 } });
  page.on('pageerror', (e) => console.error('PAGEERROR', e.message));
  await page.goto('http://127.0.0.1:8801/index.html'); await page.waitForTimeout(600);
  await page.click('#screen'); await page.waitForTimeout(200);
  const seq = await page.evaluate(() => {
    startGame();
    const path = (from, to, fitted) => {
      const prev = new Map([[from, null]]), q = [from];
      while (q.length) {
        const k = q.shift();
        if (k === to) break;
        for (const l of LEVEL.links.filter((l) => l.from === k && !(l.needs > fitted) && l.n !== 0)) {
          if (!prev.has(l.to)) { prev.set(l.to, k); q.push(l.to); }
        }
      }
      if (!prev.has(to)) return null;
      const out = [];
      for (let k = to; k != null; k = prev.get(k)) out.unshift(k);
      return out;
    };
    const seq = [LEVEL.start];
    const add = (p) => { if (!p) throw new Error('no way through the level'); for (let i = 1; i < p.length; i++) seq.push(p[i]); };
    let where = LEVEL.start;
    for (let i = 0; i < LEVEL.parts.length; i++) {
      const room = LEVEL.parts[i].room;
      add(path(where, room, i));
      add(path(room, LEVEL.slot, i));
      where = LEVEL.slot;
    }
    add(path(LEVEL.slot, ESCAPE_ROOM, LEVEL.parts.length));
    return seq;
  });
  console.log(JSON.stringify(seq));
  await browser.close();
})();
