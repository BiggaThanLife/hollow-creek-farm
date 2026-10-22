// Usage: node tools/smoke.js [scenario.js] [--shots=dir] [--html=dist/test_x.html]
// Builds nothing — run `python3 tools/build.py` first. Loads dist/index.html headless,
// starts a New Game, optionally runs a scenario file: module.exports = async (page, h) => {...}
// h helpers: h.eval(fn,arg), h.key(code, ms), h.walk(dir, ms), h.shot(name), h.wait(ms), h.tp(map,x,y)
const { chromium } = require('/opt/npm-tools/node_modules/playwright');
const path = require('path'), fs = require('fs');
(async () => {
  const args = process.argv.slice(2);
  const scen = args.find(a => !a.startsWith('--'));
  const shotsDir = (args.find(a => a.startsWith('--shots=')) || '--shots=/tmp/claude-0/-home-claude/66e851f3-880e-53cd-a5fd-6673a29cdfd6/scratchpad/shots').slice(8);
  fs.mkdirSync(shotsDir, { recursive: true });
  const browser = await chromium.launch({ executablePath: fs.existsSync('/opt/pw-browsers/chromium') ? undefined : undefined });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errors = [];
  page.on('console', m => { if (m.type() === 'error' && !/fonts\.g|Failed to load resource|ERR_/.test(m.text())) errors.push(m.text()); if (m.type()==='warning' && !/fonts/.test(m.text())) console.log('[warn]', m.text()); });
  page.on('pageerror', e => errors.push('PAGEERROR ' + e.message + '\n' + (e.stack||'').split('\n').slice(0,4).join('\n')));
  await page.route(/fonts\.(googleapis|gstatic)/, r => r.abort());
  const htmlArg = (args.find(a => a.startsWith('--html=')) || '--html=dist/index.html').slice(7);
  await page.goto('file://' + path.resolve(__dirname, '..', htmlArg) + '?debug');
  await page.waitForFunction(() => document.querySelector('#newg'), null, { timeout: 15000 });
  await page.evaluate(() => { try { localStorage.clear(); } catch (e) {} });
  await page.click('#newg');
  await page.waitForTimeout(800);
  await page.keyboard.press('Escape');
  const h = {
    eval: (fn, arg) => page.evaluate(fn, arg),
    wait: ms => page.waitForTimeout(ms),
    key: async (code, ms = 60) => { await page.keyboard.down(code); await page.waitForTimeout(ms); await page.keyboard.up(code); },
    walk: async (dir, ms) => { const k = { up: 'KeyW', down: 'KeyS', left: 'KeyA', right: 'KeyD' }[dir]; await page.keyboard.down(k); await page.waitForTimeout(ms); await page.keyboard.up(k); },
    shot: async name => { const f = path.join(shotsDir, name + '.png'); await page.screenshot({ path: f }); console.log('shot', f); return f; },
    tp: (map, x, y) => page.evaluate(([m, x, y]) => { G.world.go(m, 'start', true); G.player.x = (x + .5) * G.TILE; G.player.y = (y + .8) * G.TILE; }, [map, x, y]),
    errors,
  };
  await h.shot('00_start');
  if (scen) { try { await require(path.resolve(scen))(page, h); } catch (e) { errors.push('SCENARIO ' + e.stack); } }
  const info = await page.evaluate(() => ({ map: G.player.map, time: G.timeStr(), money: G.state.money, inv: G.state.inv.filter(Boolean).map(s => s.id + 'x' + s.qty).join(' ') }));
  console.log('state:', JSON.stringify(info));
  console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'NO ERRORS');
  await browser.close();
  process.exit(errors.length ? 1 : 0);
})();
