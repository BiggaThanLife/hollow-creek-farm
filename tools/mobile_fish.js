// Phone-size fishing: catch card and reel meter must not overlap the clock panel, toasts, hotbar or buttons.
const { chromium } = require('/opt/npm-tools/node_modules/playwright');
const path = require('path'), fs = require('fs');
const D = '/tmp/claude-0/-home-claude/66e851f3-880e-53cd-a5fd-6673a29cdfd6/scratchpad/mobile_fish'; fs.mkdirSync(D, { recursive: true });
(async () => {
  const b = await chromium.launch(); let fail = 0;
  for (const [w, hgt] of [[412, 880], [360, 740]]) {
    const ctx = await b.newContext({ viewport: { width: w, height: hgt }, deviceScaleFactor: 2.6, isMobile: true, hasTouch: true });
    const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message)); await p.route(/fonts/, r => r.abort());
    await p.goto('file://' + path.resolve(__dirname, '../dist/index.html')); await p.waitForSelector('#newg'); await p.evaluate(() => { try { localStorage.clear() } catch (e) {} });
    await p.tap('#newg'); await p.waitForTimeout(700); await p.tap('.panel-head .x');
    await p.evaluate(() => { const pd = G.maps.farm.meta.pond; for (let y = pd.y; y < pd.y + pd.h; y++) for (let x = pd.x; x < pd.x + pd.w; x++) if (G.world.ground('farm', x, y) === 'w' && G.world.ground('farm', x, y - 1) !== 'w' && !G.world.isSolid('farm', x, y - 1)) { G.player.x = (x + .5) * 48; G.player.y = (y - 1 + .8) * 48; G.player.dir = 'down'; G.state.hotbar = 5; G.input.mouse.lastMove = 0; return; } });
    // a few pickups so toasts are showing too
    await p.evaluate(() => { G.inv.add('wood', 3); G.inv.add('stone', 2); G.inv.add('fiber', 1); });
    await p.tap('#tb-use'); await p.waitForTimeout(500);
    await p.evaluate(() => { G.fishing._state.waitT = 0.01; }); await p.waitForTimeout(150);
    await p.evaluate(() => { G.fishing._state.fishId = 'sturgeon'; });
    await p.tap('#tb-use'); await p.waitForTimeout(150);
    await p.evaluate(() => { window._bot = setInterval(() => { const mg = G.fishing._state.mg; if (!mg) return; G.input.keys.Space = mg.f > mg.zone + mg.zsize * 0.5 - 0.02; }, 30); });
    await p.waitForTimeout(1200); await p.screenshot({ path: `${D}/reel_${w}.png` });
    for (let i = 0; i < 60; i++) { if (!(await p.evaluate(() => G.fishing.isFishing()))) break; await p.waitForTimeout(250); }
    await p.evaluate(() => { clearInterval(window._bot); G.input.keys.Space = false; G.rollQualityOrig = G.rollQuality; });
    await p.waitForTimeout(500); await p.screenshot({ path: `${D}/card_${w}.png` });
    const sa = await p.evaluate(() => G.ui.safeArea());
    console.log(w, 'safeArea', JSON.stringify(sa), errs.length ? errs : 'no errors'); if (errs.length) fail = 1;
    await ctx.close();
  }
  await b.close(); process.exit(fail);
})();
