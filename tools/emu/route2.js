// Play the sector-2 route of the original's walkthrough in the recreation, step by step, reporting where it breaks.
const { chromium } = require('playwright-core');
(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const page = await browser.newPage({ viewport: { width: 800, height: 620 } });
  page.on('pageerror', (e) => console.log('PAGEERROR', e.message));
  await page.goto('http://127.0.0.1:8801/index.html'); await page.waitForTimeout(600);
  await page.click('#screen'); await page.waitForTimeout(200);
  const out = await page.evaluate(() => {
    startGame(); state.fitted = 1; state.timeLeft = 99999;
    const _upd = updateAi; const step1 = (dt) => { _upd(dt); updatePickups(); };
    const log = [];
    const K = { right: 'ArrowRight', left: 'ArrowLeft', up: 'ArrowUp', down: 'ArrowDown', fire: 'Space' };
    const clear = () => { for (const k in keys) keys[k] = false; };
    const tick = (n, held) => { clear(); for (const h of held) keys[K[h]] = true; for (let i = 0; i < n; i++) step1(1 / 60); clear(); };
    const st = () => `${state.room}@${Math.round(ai.x / 8)},${Math.round(ai.y + AI_H)}`;
    const settle = () => { for (let i = 0; i < 400; i++) { step1(1 / 60); if (ai.onGround && !ai.onLift && i > 10) break; } };
    const hole = (dir) => { if (!ai.onGround) return false; const ax = ai.x + (dir === 'right' || dir > 0 ? AI_W + 4 : -4), feet = ai.y + AI_H; if (ax < 0 || ax >= VIEW_W) return false; const under = platformsOf(currentRoom()).some((p) => Math.abs(p.y - feet) < 2 && ax >= p.x0 && ax < p.x1); return !under; };
    const walk = (dir) => { const r0 = state.room; let lastX = ai.x, still = 0; for (let i = 0; i < 900; i++) { keys[K[dir]] = true; if (hole(dir) && !EXITS[r0].drops.some((d) => d.to === window.__target)) { keys.ArrowUp = true; for (let k = 0; k < 6; k++) step1(1 / 60); keys.ArrowUp = false; for (let k = 0; k < 40 && !ai.onGround; k++) step1(1 / 60); } step1(1 / 60); if (state.room !== r0) { clear(); settle(); return true; } if (Math.abs(ai.x - lastX) < 0.5) { if (++still > 8 && guns.some((g) => !g.dead && g.type === GUN_FLOOR && Math.abs(g.x - ai.x) < 24)) { keys.ArrowUp = true; for (let k = 0; k < 6; k++) step1(1 / 60); keys.ArrowUp = false; for (let k = 0; k < 40 && !ai.onGround; k++) step1(1 / 60); still = 0; } else if (++still > 60) break; } else still = 0; lastX = ai.x; if (state.mode !== 'play') break; } clear(); return false; };
    const goto = (cell) => { const tx = cell * 8; let lastX = ai.x, still = 0; for (let i = 0; i < 600 && Math.abs(ai.x - tx) > 2; i++) { keys[K[ai.x < tx ? 'right' : 'left']] = true; if (Math.abs(ai.x - lastX) < 0.5 && ++still > 8 && guns.some((g) => !g.dead && g.type === GUN_FLOOR && Math.abs(g.x - ai.x) < 24)) { keys.ArrowUp = true; for (let k = 0; k < 6; k++) step1(1 / 60); keys.ArrowUp = false; for (let k = 0; k < 40 && !ai.onGround; k++) step1(1 / 60); still = 0; } lastX = ai.x; step1(1 / 60); } clear(); for (let i = 0; i < 6; i++) step1(1 / 60); };
    const jump = (dir) => { const tr = []; keys[K[dir]] = true; for (let i = 0; i < 2; i++) step1(1 / 60); tr.push(st() + (ai.onGround ? 'g' : '')); keys.ArrowUp = true; for (let i = 0; i < 6; i++) step1(1 / 60); tr.push(st()); keys.ArrowUp = false; for (let i = 0; i < 90; i++) { step1(1 / 60); if (i % 6 === 0) tr.push(st() + (ai.onGround ? 'g' : '')); if (i > 12 && ai.onGround) break; } clear(); settle(); log.push('   jump trace: ' + tr.join(' ')); };
    const lift = (dir) => { keys[K[dir]] = true; for (let i = 0; i < 6; i++) step1(1 / 60); clear(); for (let i = 0; i < 600; i++) { step1(1 / 60); if (i > 20 && ai.onGround && !ai.onLift) break; } settle(); };
    const step = (name, fn, expect) => { window.__target = expect; fn(); const ok = expect ? String(state.room) === String(expect) : true; log.push(`${ok ? 'ok ' : 'XX '}${name.padEnd(28)} -> ${st()}${state.carrying ? ' carrying' : ''} fitted=${state.fitted}${state.mode !== 'play' ? ' MODE ' + state.mode : ''}`); return ok; };
    resetAi(24, 96); enterRoom('85', 24, 96); ai.invuln = 1e9; settle();
    const plan = [
      ['85: to cell 15', () => { goto(15); }, '85'],
      ['85: jump right', () => { jump('right'); }, '85'],
      ['85: walk right', () => { walk('right'); }, '86'],
      ['86: walk right', () => walk('right'), '87'],
      ['87: walk right', () => walk('right'), '88'],
      ['88: lift up from the floor', () => { const l = EXITS['88'].lifts.find((l) => l.kind === 'up' && l.feet === 128); goto(l.x0); lift('up'); }, '88'],   // as the walkthrough went: up, along the gallery into 89, and the lift down into 121
      ['88: walk right (gallery)', () => walk('right'), '89'],
      ['89: lift down at 19', () => { goto(19); lift('down'); }, '121'],
      ['121: walk left', () => walk('left'), '120'],
      ['120: walk left', () => walk('left'), '119'],
      ['119: walk left', () => walk('left'), '118'],
      ['118: lift up at 21', () => { goto(21); lift('up'); }, '118'],
      ['118: walk left (upper)', () => walk('left'), '117'],
      ['117: to cell 24, jump left', () => { goto(24); jump('left'); }, '117'],
      ['117: walk left', () => walk('left'), '116'],
      ['116: to cell 18, down', () => { goto(18); lift('down'); walk('left'); }, '148'],
      ['148: to cell 3, jump (part)', () => { goto(4); jump('left'); goto(3); jump('right'); }, '148'],
      ['148: walk right', () => walk('right'), '149'],
      ['149: walk right', () => walk('right'), '150'],
      ['150: lift up at 6', () => { goto(6); lift('up'); }, '150'],
      ['150: to 12, jump right', () => { goto(12); jump('right'); }, '150'],
      ['150: to 20, jump right', () => { goto(20); jump('right'); walk('right'); }, '151'],
      ['151: lift down at 20, walk right', () => { goto(20); lift('down'); walk('right'); }, '152'],   // the gallery ends in a wall: down to the floor first
      ['152: walk right', () => walk('right'), '153'],
      ['153: lift up at 20', () => { goto(20); lift('up'); }, '121'],
      ['121: lift up at 20 (to 89)', () => { goto(20); lift('up'); }, '89'],
      ['89: jump the two gaps, walk left', () => { goto(19); jump('left'); goto(8); jump('left'); walk('left'); }, '88'],
      ['88: jump left off the ledge', () => { goto(26); jump('left'); }, '88'],
      ['88: lift down at 14', () => { goto(14); lift('down'); }, '88'],
      ['88: walk left', () => walk('left'), '87'],
      ['87: walk left', () => walk('left'), '86'],
      ['86: walk left', () => walk('left'), '85'],
      ['85: to cell 22, jump left', () => { goto(22); jump('left'); }, '85'],
      ['85: walk left', () => walk('left'), '84'],
      ['84: walk left', () => walk('left'), '83'],
      ['83: lift down at 19', () => { goto(19); lift('down'); }, '115'],
      ['115: lift down at 19', () => { goto(19); lift('down'); }, '147'],
      ['147: walk left', () => walk('left'), '146'],
      ['146: walk left', () => walk('left'), '145'],
      ['145: walk left', () => walk('left'), '144'],
      ['144: walk left', () => walk('left'), '143'],
      ['143: walk to the slot', () => { goto(2); for (let i = 0; i < 120; i++) step1(1 / 60); }, '143'],
      ['143: walk right', () => walk('right'), '144'],
      ['144: walk right', () => walk('right'), '145'],
      ['145: walk right', () => walk('right'), '146'],
      ['146: lift up at 13', () => { goto(13); lift('up'); }, '146'],
      ['146: walk left (upper)', () => walk('left'), '145'],
      ['145: lift down at 13', () => { goto(13); lift('down'); }, '177'],
      ['177: lift down at 13', () => { goto(13); lift('down'); }, '209'],
      ['209: walk right (door)', () => walk('right'), '210'],
    ];
    for (const [name, fn, expect] of plan) { if (!step(name, fn, expect)) break; }
    return log;
  });
  console.log(out.join('\n'));
  await browser.close();
})();
