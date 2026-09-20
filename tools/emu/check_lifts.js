// Replay every lift ride the survey recorded in the original against the recreation's engine.
const { chromium } = require('playwright-core');
const fs = require('fs');
const graphs = process.argv.slice(2);
const edges = [];
for (const gf of graphs) {
  const g = JSON.parse(fs.readFileSync(gf, 'utf8'));
  for (const e of g.edges) {
    const via = e.via.replace(/[~*!]/g, '');
    if (!['up', 'down'].includes(via) || e.via.endsWith('!')) continue;
    const n = g.nodes[e.from]; if (!n) continue;
    edges.push({ from: n.room, y: n.y, x0: e.x0, x1: e.x1, via, to: g.nodes[e.to] ? g.nodes[e.to].room : e.to.split(':')[0], ay: (e.arrive || {}).y, through: e.through || [], fell: !!e.fell });
  }
}
// one case per (from, floor, via, x)
const seen = new Map();
for (const e of edges) for (let x = e.x0; x <= e.x1; x++) { const k = `${e.from}:${e.y >> 4}:${e.via}:${x}`; if (!seen.has(k)) seen.set(k, { ...e, x }); }
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const page = await browser.newPage({ viewport: { width: 800, height: 620 } });
  page.on('pageerror', (e) => console.log('PAGEERROR', e.message));
  await page.goto('http://127.0.0.1:8801/index.html'); await page.waitForTimeout(600);
  await page.click('#screen'); await page.waitForTimeout(200);
  const res = await page.evaluate((cases) => {
    startGame(); state.fitted = 9;
    const out = [];
    const feetOf = (y) => 128 - (7 - (y >> 4)) * 16;
    for (const c of cases) {
      if (!ROOMS[String(c.from)]) { out.push({ ...c, got: 'no room' }); continue; }
      const feet = feetOf(c.y);
      resetAi(c.x * 8, feet - AI_H - 12); enterRoom(String(c.from), c.x * 8, feet - AI_H - 12); ai.invuln = 1e9; state.energy = 999; ai.onLift = null; ai.liftLatch = false; ai.vy = 0;
      for (const k in keys) keys[k] = false;
      for (let i = 0; i < 60; i++) updateAi(1 / 60);
      const before = `${state.room}/${ai.y + AI_H}`;
      const key = c.via === 'up' ? 'ArrowUp' : 'ArrowDown';
      keys[key] = true; for (let i = 0; i < 6; i++) updateAi(1 / 60); keys[key] = false;
      const rooms = [state.room]; let rest = 0, i = 0;
      for (; i < 900 && rest < 30; i++) { updateAi(1 / 60); if (state.room !== rooms[rooms.length - 1]) rooms.push(state.room); if (ai.onGround && !ai.onLift) rest++; else rest = 0; if (state.mode !== 'play') break; }
      out.push({ ...c, before, got: `${state.room}/${Math.round(ai.y + AI_H)}`, rooms, mode: state.mode, moved: rooms.length > 1 || Math.abs(ai.y + AI_H - feet) > 6 });
    }
    return out;
  }, [...seen.values()]);
  let bad = 0;
  for (const r of res) {
    const expFeet = r.ay == null ? null : 128 - (7 - (r.ay >> 4)) * 16;
    const same = String(r.to) === String(r.from) && Math.abs((r.ay >> 4) - (r.y >> 4)) <= 0;
    const [gr, gf] = r.got.split('/');
    const ok = r.got !== 'no room' && gr === String(r.to) && expFeet != null && Math.abs(+gf - expFeet) <= 14 && r.mode === 'play';
    if (r.got === 'no room' || !ok || same !== !r.moved) { bad++; console.log(`${r.from}:${r.y >> 4} x${r.x} ${r.via} -> want ${r.to}/${expFeet}${r.through.length ? ' via ' + r.through : ''}${r.fell ? ' FELL' : ''}  got ${r.got} rooms ${(r.rooms || []).join('>')} ${r.mode}`); }
  }
  console.log(`${res.length} rides, ${bad} differ`);
  await browser.close();
})();
