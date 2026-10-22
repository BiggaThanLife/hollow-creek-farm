// Phone emulation test: node tools/mobile.js
const { chromium } = require('/opt/npm-tools/node_modules/playwright');
const path = require('path'), fs = require('fs');
const D = '/tmp/claude-0/-home-claude/66e851f3-880e-53cd-a5fd-6673a29cdfd6/scratchpad/mobile'; fs.mkdirSync(D, { recursive: true });
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 412, height: 880 }, deviceScaleFactor: 2.6, isMobile: true, hasTouch: true, colorScheme: 'dark' });
  const page = await ctx.newPage(); const errors = [];
  page.on('pageerror', e => errors.push(e.message)); page.on('console', m => { if (m.type() === 'error' && !/fonts|Failed to load/.test(m.text())) errors.push(m.text()); });
  await page.route(/fonts\.(googleapis|gstatic)/, r => r.abort());
  await page.goto('file://' + path.resolve(__dirname, '../dist/index.html'));
  await page.waitForSelector('#newg'); await page.evaluate(() => { try { localStorage.clear() } catch (e) {} });
  await page.fill('#pname', 'Farmer Barry'); await page.screenshot({ path: D + '/1_title.png' });
  await page.tap('#newg'); await page.waitForTimeout(800); await page.screenshot({ path: D + '/2_help.png' });
  await page.tap('.panel-head .x'); await page.waitForTimeout(300); await page.screenshot({ path: D + '/3_game.png' });
  // joystick: walk down
  const j = await page.$('#joy'); const bb = await j.boundingBox(); const cx = bb.x + bb.width / 2, cy = bb.y + bb.height / 2;
  const cdp = await ctx.newCDPSession(page);
  const touch = (type, x, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y, id: 1 }] });
  const p0 = await page.evaluate(() => [G.player.x, G.player.y]);
  await touch('touchStart', cx, cy); await touch('touchMove', cx, cy + 50); await page.waitForTimeout(700); await touch('touchEnd');
  const p1 = await page.evaluate(() => [G.player.x, G.player.y, G.player.dir]);
  console.log('joystick move', p0, '->', p1);
  // use button with hoe on grass: count soil
  await page.evaluate(() => { G.state.hotbar = 0; });
  await page.tap('#tb-use'); await page.waitForTimeout(400);
  console.log('tilled tiles', await page.evaluate(() => Object.keys((G.state.maps.farm && G.state.maps.farm.soil) || {}).length));
  await page.tap('#tb-inv'); await page.waitForTimeout(400); await page.screenshot({ path: D + '/4_inv.png' });
  await page.tap('.panel-head .x'); await page.tap('#tb-craft'); await page.waitForTimeout(400); await page.screenshot({ path: D + '/5_craft.png' });
  await page.tap('.panel-head .x');
  await page.evaluate(() => { const st = G.world.objects('farm').find(o => o.type === 'shop_stall'); G.objTypes.shop_stall.interact(st, 'farm'); }); await page.waitForTimeout(300);
  await page.screenshot({ path: D + '/6_shop.png' }); await page.tap('.panel-head .x');
  await page.evaluate(() => G.world.go('town', 'west', true)); await page.waitForTimeout(400); await page.screenshot({ path: D + '/7_town.png' });
  // fishing at pond via buttons
  await page.evaluate(() => { G.world.go('farm', 'start', true); const pd = G.maps.farm.meta.pond; for (let y = pd.y; y < pd.y + pd.h; y++) for (let x = pd.x; x < pd.x + pd.w; x++) if (G.world.ground('farm', x, y) === 'w' && G.world.ground('farm', x, y + 1) !== 'w' && !G.world.isSolid('farm', x, y + 1)) { G.player.x = (x + .5) * 48; G.player.y = (y + 1.8) * 48; G.player.dir = 'up'; G.state.hotbar = 5; return; } });
  await page.tap('#tb-use'); await page.waitForTimeout(600); console.log('fishing?', await page.evaluate(() => G.fishing.isFishing()));
  await page.screenshot({ path: D + '/8_fish.png' });
  await page.tap('#tb-act'); await page.waitForTimeout(400); console.log('cancelled?', !(await page.evaluate(() => G.fishing.isFishing())));
  console.log(errors.length ? 'ERRORS\n' + errors.join('\n') : 'NO ERRORS'); await b.close();
})();
