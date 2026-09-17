// Shared emulator driver: boot the page, expose peek/poke-by-snapshot, keys.
const { chromium } = require('playwright-core');
const fs = require('fs');
const OUT = '/tmp/claude-0/-home-user-dandare/f7bf143d-9228-50d5-9e85-e4004f770064/scratchpad/';
const POKES = { 47714: 201, 44413: 201, 43526: 0 };   // Virgin release: infinite energy, no wall guns, infinite ammo
async function boot(opts = {}) {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--autoplay-policy=no-user-gesture-required'] });
  const page = await browser.newPage({ viewport: { width: 600, height: 500 } });
  await page.addInitScript(() => {
    const W = window.Worker; window.__workers = [];
    window.Worker = function (...a) { const w = new W(...a); window.__workers.push(w); return w; };
    window.Worker.prototype = W.prototype;
  });
  await page.goto('http://127.0.0.1:8802/index.html');
  await page.waitForTimeout(2500);
  await page.evaluate(() => {
    const w = window.__workers[0];
    window.__peek = (start, len) => new Promise((res) => {
      const id = Math.random();
      const h = (e) => { if (e.data.message === 'mem' && e.data.id === id) { w.removeEventListener('message', h); res(Array.from(e.data.data)); } };
      w.addEventListener('message', h); w.postMessage({ message: 'peekRange', id, start, len });
    });
    window.__snap = () => new Promise((res) => {
      const id = Math.random();
      const h = (e) => { if (e.data.message === 'snapshot' && e.data.id === id) { w.removeEventListener('message', h); res(e.data.snapshot); } };
      w.addEventListener('message', h); w.postMessage({ message: 'getSnapshot', id });
    });
    window.__load = (s) => emu.loadSnapshotFromStruct(s);
  });
  const loadFile = async (file, pokes = POKES) => {
    const s = JSON.parse(fs.readFileSync(OUT + file, 'utf8'));
    await page.evaluate(({ s, pokes }) => {
      const pages = {};
      for (const k in s.pages) { const bin = atob(s.pages[k]); const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); pages[k] = u; }
      const base = { 5: 0x4000, 2: 0x8000, 0: 0xC000 };
      for (const a in pokes) { const addr = +a; for (const k in base) if (addr >= base[k] && addr < base[k] + 16384) pages[k][addr - base[k]] = pokes[a]; }
      __load({ model: s.model, registers: s.registers, halted: s.halted, tstates: s.tstates, ulaState: s.ulaState, memoryPages: pages });
    }, { s, pokes });
    await page.waitForTimeout(300);
    await page.focus('#jsspeccy [tabindex]');
  };
  const peek = (a, n) => page.evaluate(([a, n]) => __peek(a, n), [a, n]);
  const room = async () => (await peek(0x6297, 1))[0];
  const shot = (name) => page.screenshot({ path: OUT + name, clip: { x: 40, y: 52, width: 240, height: 144 } });
  return { browser, page, loadFile, peek, room, shot, OUT };
}
module.exports = { boot, OUT };
