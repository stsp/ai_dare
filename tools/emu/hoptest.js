// Run primitive actions in the engine from a room and print the state after each: node hoptest.js ROOM 'walk right;goto 21;lift up;walk left;goto 9;lift down'
const { chromium } = require('playwright-core');
const [room, plan] = process.argv.slice(2);
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const page = await browser.newPage({ viewport: { width: 800, height: 620 } });
  page.on('pageerror', (e) => console.log('PAGEERROR', e.message));
  await page.goto('http://127.0.0.1:8801/index.html'); await page.waitForTimeout(600);
  await page.click('#screen'); await page.waitForTimeout(200);
  const out = await page.evaluate(([room, plan]) => {
    startGame(); state.fitted = 9; state.timeLeft = 99999;
    const log = [];
    const K = { right: 'ArrowRight', left: 'ArrowLeft', up: 'ArrowUp', down: 'ArrowDown' };
    const clear = () => { for (const k in keys) keys[k] = false; };
    const tick = () => { if (state.mode !== 'play') return; updateAi(1 / 60); updatePickups(); };
    const st = () => `${state.room}@${Math.round(ai.x / 8)},${Math.round(ai.y + AI_H)}${ai.onLift ? ' lift' : ''}${state.tops.length ? ' msg=' + state.tops.map((m) => m.lines.join('/')).join(' + ') : ''}`;
    const settle = () => { for (let i = 0; i < 400; i++) { tick(); if (ai.onGround && !ai.onLift && i > 10) break; } };
    const goto = (cell) => { const tx = cell * 8; for (let i = 0; i < 600 && Math.abs(ai.x - tx) > 2; i++) { keys[K[ai.x < tx ? 'right' : 'left']] = true; tick(); if (!ai.onGround && !ai.onLift) { clear(); settle(); } } clear(); for (let i = 0; i < 6; i++) tick(); };
    const walk = (dir) => { const r0 = state.room; let lastX = ai.x, still = 0; for (let i = 0; i < 900; i++) { keys[K[dir]] = true; tick(); if (state.room !== r0) { clear(); settle(); return; } if (Math.abs(ai.x - lastX) < 0.5) { if (++still > 60) break; } else still = 0; lastX = ai.x; } clear(); };
    const lift = (dir) => { keys[K[dir]] = true; for (let i = 0; i < 6; i++) tick(); clear(); for (let i = 0; i < 600; i++) { tick(); if (i > 20 && ai.onGround && !ai.onLift) break; } settle(); };
    const jump = (dir) => { keys[K[dir]] = true; for (let i = 0; i < 2; i++) tick(); keys.ArrowUp = true; for (let i = 0; i < 6; i++) tick(); keys.ArrowUp = false; for (let i = 0; i < 90; i++) { tick(); if (i > 12 && ai.onGround) break; } clear(); settle(); };
    const r = ROOMS[room]; const p = widestPlatform(r); resetAi(p.x, p.y - AI_H); enterRoom(room, p.x, p.y - AI_H); ai.invuln = 1e9; settle();
    log.push('start ' + st());
    for (const step of plan.split(';')) {
      const [op, arg] = step.trim().split(/\s+/);
      if (op === 'walklog') { for (let i = 0; i < +arg; i++) { keys[K.right] = true; tick(); if (i % 2 === 0) log.push('   ' + i + ': ' + st() + ' x=' + ai.x.toFixed(1) + ' y=' + ai.y.toFixed(2) + ' vy ' + ai.vy.toFixed(1) + ' g ' + ai.onGround + ' guards ' + guards.filter((t) => !t.dead).map((t) => Math.round(t.x / 8) + ',' + (t.y + GUARD_H)).join(' ')); } clear(); }
      if (op === 'jumplog') { keys[K[arg]] = true; for (let i = 0; i < 2; i++) tick(); keys.ArrowUp = true; for (let i = 0; i < 6; i++) tick(); keys.ArrowUp = false; for (let i = 0; i < 60; i++) { tick(); if (i % 5 === 0) log.push('   ' + i + ': ' + st() + ' x=' + ai.x.toFixed(1) + ' y=' + ai.y.toFixed(1) + ' vy=' + ai.vy.toFixed(0) + ' g=' + ai.onGround + ' lift=' + !!ai.onLift + ' latch=' + ai.liftLatch); } clear(); }
      if (op === 'walk') walk(arg); else if (op === 'goto') goto(+arg); else if (op === 'lift') lift(arg); else if (op === 'jump') jump(arg); else if (op === 'wait') { for (let i = 0; i < +arg; i++) tick(); }
      log.push(step.trim().padEnd(14) + ' -> ' + st());
    }
    return log;
  }, [room, plan]);
  console.log(out.join('\n'));
  await browser.close();
})();
