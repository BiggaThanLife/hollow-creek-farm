// QA play-through: drives the game mostly through real keyboard/mouse input.
// node tools/smoke.js tools/scenarios/qa_playthrough.js --shots=<dir>   (QA_PARTS=1,2,3 to run a subset)
module.exports = async (page, h) => {
  const log = (...a) => console.log('[qa]', ...a);
  const parts = (process.env.QA_PARTS || 'all').split(',');
  const run = n => parts.includes('all') || parts.includes(String(n));
  const fails = [];
  const check = (cond, msg, extra) => { if (!cond) { fails.push(msg); console.log('  FAIL', msg, extra !== undefined ? JSON.stringify(extra) : ''); } else console.log('  ok  ', msg, extra !== undefined ? JSON.stringify(extra) : ''); };
  const ev = (fn, arg) => page.evaluate(fn, arg);
  const ptile = () => ev(() => ({ ...G.player.tile(), px: G.player.x, py: G.player.y, map: G.player.map, dir: G.player.dir }));
  const keyTap = async (code, ms = 50) => { await page.keyboard.down(code); await h.wait(ms); await page.keyboard.up(code); await h.wait(30); };
  /** walk with WASD until the player's feet are at tile (tx,ty) centre. axis order: 'xy' or 'yx'. */
  async function walkTo(tx, ty, order = 'xy', timeout = 15000) {
    const t0 = Date.now();
    for (const ax of order) {
      let last = null, stuckT = Date.now();
      while (Date.now() - t0 < timeout) {
        const p = await ptile();
        const goal = ax === 'x' ? (tx + 0.5) * 48 : (ty + 0.8) * 48;
        const cur = ax === 'x' ? p.px : p.py;
        const d = goal - cur;
        if (Math.abs(d) < 5) break;
        const k = ax === 'x' ? (d > 0 ? 'KeyD' : 'KeyA') : (d > 0 ? 'KeyS' : 'KeyW');
        const ms = Math.max(16, Math.min(250, Math.abs(d) / 0.2 - 10));
        await page.keyboard.down(k); await h.wait(ms); await page.keyboard.up(k);
        if (last !== null && Math.abs(cur - last) < 0.5) { if (Date.now() - stuckT > 700) return { ok: false, stuck: p }; } else stuckT = Date.now();
        last = cur;
      }
    }
    const p = await ptile();
    return { ok: p.x === tx && p.y === ty, p };
  }
  /** BFS path on walkable tiles, then walk it with WASD (real input). Falls back to straight walkTo. */
  async function goTo(tx, ty, _order, timeout = 20000) {
    const path = await ev(([tx, ty]) => {
      const m = G.maps[G.player.map], s = G.player.tile(), W = m.w, H = m.h;
      const prev = new Map(); const q = [[s.x, s.y]]; prev.set(s.x + ',' + s.y, null);
      const ok = (x, y) => x >= 0 && y >= 0 && x < W && y < H && !G.world.isSolid(m.id, x, y);
      while (q.length) {
        const [x, y] = q.shift(); if (x === tx && y === ty) break;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const X = x + dx, Y = y + dy, k = X + ',' + Y; if (prev.has(k) || !ok(X, Y)) continue; prev.set(k, [x, y]); q.push([X, Y]); }
      }
      if (!prev.has(tx + ',' + ty)) return null;
      const out = []; let c = [tx, ty]; while (c) { out.unshift(c); c = prev.get(c[0] + ',' + c[1]); }
      return out;
    }, [tx, ty]);
    if (!path) return walkTo(tx, ty, 'xy', timeout);
    if (process.env.QA_DEBUG) log('path', JSON.stringify(path), await ev(() => { const t = G.player.tile(); let s = ''; for (let y = t.y - 3; y <= t.y + 3; y++) { for (let x = t.x - 4; x <= t.x + 4; x++) s += x === t.x && y === t.y ? '@' : G.world.isSolid(G.player.map, x, y) ? '#' : '.'; s += '/'; } return s; }));
    // compress into straight segments
    const segs = []; for (let i = 1; i < path.length; i++) { const [x, y] = path[i]; const last = segs[segs.length - 1]; const ax = x !== path[i - 1][0] ? 'x' : 'y'; if (last && last.ax === ax) { last.x = x; last.y = y; } else segs.push({ ax, x, y }); }
    let r = { ok: true };
    for (const s of segs) { r = await walkTo(s.x, s.y, s.ax, timeout); if (!r.ok && r.stuck) break; }
    const p = await ptile();
    if ((p.x !== tx || p.y !== ty) && (goTo.depth || 0) < 2) { goTo.depth = (goTo.depth || 0) + 1; if (process.env.QA_DEBUG) log('goTo retry', JSON.stringify(p), tx, ty); const r2 = await goTo(tx, ty, _order, timeout); goTo.depth--; return r2; }
    return { ok: p.x === tx && p.y === ty, p };
  }
  const face = async dir => { const k = { up: 'KeyW', down: 'KeyS', left: 'KeyA', right: 'KeyD' }[dir]; await keyTap(k, 20); };
  const tileScreen = (tx, ty) => ev(([tx, ty]) => { const r = G.canvas.getBoundingClientRect(), z = G.cam.zoom; return { x: r.left + ((tx + 0.5) * 48 - G.cam.x) * z, y: r.top + ((ty + 0.5) * 48 - G.cam.y) * z }; }, [tx, ty]);
  async function clickTile(tx, ty, button = 'left') { const s = await tileScreen(tx, ty); await page.mouse.move(s.x, s.y); await h.wait(30); await page.mouse.click(s.x, s.y, { button }); await h.wait(60); }
  const selectItem = async id => { const i = await ev(id => G.state.inv.findIndex(s => s && s.id === id), id); if (i < 0) return false; if (i < 12) await keyTap(i < 9 ? 'Digit' + (i + 1) : ['Digit0', 'Minus', 'Equal'][i - 9]); else await ev(i => { G.state.hotbar = i; }, i); return true; };
  const modal = () => ev(() => G.ui.modal ? (G.ui.modal.opts.title || G.ui.modal.opts.cls || '?') : null);
  const money = () => ev(() => G.state.money);
  const count = id => ev(id => G.inv.count(id), id);
  const clickText = async (sel, text) => { const loc = page.locator(sel, { hasText: text }).first(); await loc.click(); await h.wait(80); };
  const mouseAway = () => page.mouse.move(5, 300); // keyboard targeting (facing tile)
  // ensure the mouse doesn't steer targeting at start
  await ev(() => { G.input.mouse.inside = false; });
  h.errors.length = h.errors.length; // keep

  /* ---------------- 1. title, help, collision ---------------- */
  if (run(1)) {
    log('--- 1. title / help / collision');
    // reload to see the real title screen with a save present
    await ev(() => G.save());
    await page.reload(); await page.waitForSelector('#newg');
    check(await page.locator('#cont').count() === 1, 'title shows Continue when a save exists');
    await h.shot('q01_title');
    await ev(() => localStorage.clear());
    await page.click('#newg'); await h.wait(900);
    check((await modal()) === 'How to Play', 'help panel opens on new game', await modal());
    await h.shot('q01_help');
    await page.click('.modal-wrap .x'); await h.wait(150);
    check(!(await modal()), 'help closes with X');
    await mouseAway(); await ev(() => { G.input.mouse.inside = false; });
    const p0 = await ptile(); log('spawn', JSON.stringify(p0));
    // house is directly north of spawn except door -> walking up enters house
    let r = await walkTo(p0.x, p0.y - 1, 'y', 3000); await h.wait(500);
    check((await ptile()).map === 'house', 'walking into the door enters the house', await ptile());
    await h.shot('q01_house');
    // bed: walk to bed spawn tile area and interact
    r = await goTo(6, 6, 'xy'); r = await goTo(3, 4, 'xy');
    log('near bed', JSON.stringify(r));
    // walk out of house
    r = await goTo(6, 7, 'xy'); r = await walkTo(6, 8, 'y', 3000); await h.wait(500);
    check((await ptile()).map === 'farm', 'walk out through house door', await ptile());
    // collision: try walk into house wall from (11,9)->up
    await goTo(12, 9, 'yx');
    const before = await ptile(); await page.keyboard.down('KeyW'); await h.wait(600); await page.keyboard.up('KeyW');
    const after = await ptile();
    check(after.y >= 9 && after.map === 'farm', 'house wall is solid', { before, after });
    // stall solid: walk up from (20,13) into stall at rows 10-11
    await goTo(20, 13, 'yx');
    await page.keyboard.down('KeyW'); await h.wait(700); await page.keyboard.up('KeyW');
    check((await ptile()).y >= 12, 'stall is solid', await ptile());
    // water solid: teleport near pond and walk into it
    const pond = await ev(() => G.maps.farm.meta.pond);
    await ev(([x, y]) => { G.player.x = (x + .5) * 48; G.player.y = (y + .8) * 48; }, [pond.x + (pond.w >> 1), pond.y - 1]);
    await ev(() => { for (const o of G.world.objectsIn('farm', G.player.tile().x - 1, G.player.tile().y - 2, 3, 3)) if (['weeds','twig','rock'].includes(o.type)) G.world.removeObject('farm', o); });
    const pp = await ptile();
    await page.keyboard.down('KeyS'); await h.wait(900); await page.keyboard.up('KeyS');
    const pa = await ptile();
    const groundUnder = await ev(() => G.world.ground('farm', G.player.tile().x, G.player.tile().y));
    check(groundUnder !== 'w', 'cannot walk onto water', { pp, pa, groundUnder });
    await h.shot('q01_pond_edge');
    // tree solid: find a tree with free tile to its south
    const tr = await ev(() => { const o = G.world.objects('farm').find(o => o.type === 'tree_oak' && o.y > 14 && G.world.isFree('farm', o.x, o.y + 1) && G.world.isFree('farm', o.x, o.y + 2)); return o && { x: o.x, y: o.y }; });
    if (tr) {
      await ev(([x, y]) => { G.player.x = (x + .5) * 48; G.player.y = (y + 2.8) * 48; }, [tr.x, tr.y]);
      await page.keyboard.down('KeyW'); await h.wait(900); await page.keyboard.up('KeyW');
      check((await ptile()).y > tr.y, 'tree is solid', { tr, p: await ptile() });
    }
    // back home
    await ev(() => G.world.go('farm', 'start', true)); await h.wait(100);
  }

  /* ---------------- 2. day-1 loop: farm, sleep, harvest, sell ---------------- */
  if (run(2)) {
    log('--- 2. farming loop');
    await ev(() => { G.world.go('farm', 'start', true); G.ui.close(); });
    await mouseAway(); await ev(() => { G.input.mouse.inside = false; });
    const f = await ev(() => G.maps.farm.meta.field);
    // walk down the path to the field
    let r = await goTo(13, 13, 'xy'); log('to road', JSON.stringify(r));
    r = await goTo(f.x + 1, f.y - 1, 'xy'); log('to field top', JSON.stringify(r));
    // plan: 3 rows x 5 cols at f.x+1..f.x+5, rows f.y+1..f.y+3
    const cols = [f.x + 1, f.x + 2, f.x + 3, f.x + 4, f.x + 5], rows = [f.y + 1, f.y + 2, f.y + 3];
    // clear debris in area with scythe/pick/axe by real swings standing west of each tile row
    const debrisIn = () => ev(([x, y]) => G.world.objectsIn('farm', x, y, 5, 3).map(o => ({ t: o.type, x: o.x, y: o.y })), [cols[0], rows[0]]);
    log('debris in plot', JSON.stringify(await debrisIn()));
    const tileAct = async (tool, tx, ty) => { await selectItem(tool); await clickTile(tx, ty); await h.wait(340); };
    for (let pass = 0; pass < 4; pass++) {
      const ds = await debrisIn(); if (!ds.length) break;
      for (const d of ds) {
        const tool = d.t === 'weeds' ? 'scythe' : d.t === 'rock' ? 'pickaxe' : 'axe';
        // stand on a free neighbour
        const stand = await ev(([x, y]) => [[x, y - 1], [x - 1, y], [x + 1, y], [x, y + 1]].find(([a, b]) => !G.world.isSolid('farm', a, b) && !(G.farming.soilAt('farm', a, b) || {}).crop), [d.x, d.y]);
        if (!stand) continue;
        await goTo(stand[0], stand[1], 'yx', 6000);
        for (let k = 0; k < 6; k++) { await tileAct(tool, d.x, d.y); if (!(await ev(([x, y]) => G.world.objectAt('farm', x, y), [d.x, d.y]))) break; }
      }
    }
    check((await debrisIn()).length === 0, 'plot cleared of debris with tools', await debrisIn());
    // till / plant / water each tile by mouse while walking along row above
    for (const y of rows) {
      for (const x of cols) {
        await goTo(x, y - 1 < f.y ? y - 1 : y - 1, 'xy', 6000);
        await tileAct('hoe', x, y);
        await tileAct('seeds_carrot', x, y);
        await tileAct('watering_can', x, y);
      }
    }
    const planted = await ev(([c, r]) => { let n = 0, w = 0, miss = []; for (const y of r) for (const x of c) { const s = G.farming.soilAt('farm', x, y); if (s && s.crop) n++; else miss.push([x, y, G.world.ground('farm', x, y), (G.world.objectAt('farm', x, y) || {}).type, !!s]); if (s && s.watered) w++; } return { n, w, seeds: G.inv.count('seeds_carrot'), miss }; }, [cols, rows]);
    check(planted.n === 15 && planted.w === 15 && planted.seeds === 0, 'planted & watered all 15 carrots', planted);
    await mouseAway(); await h.wait(300); await h.shot('q02_planted');
    // sleep loop until ready: walk home, enter door, walk to bed, E, choose sleep
    for (let day = 0; day < 4; day++) {
      await ev(() => { G.ui.close(); G.world.go('farm', 'start', true); G.input.mouse.inside = false; });
      await mouseAway();
      let rr = await goTo(13, 9, 'xy'); rr = await walkTo(13, 8, 'y', 3000); await h.wait(450);
      if ((await ptile()).map !== 'house') { check(false, 'enter house day ' + day, await ptile()); break; }
      rr = await goTo(3, 3, 'xy'); await face('left');
      await keyTap('KeyE'); await h.wait(200);
      const m = await modal();
      if (day === 0) { check(m === 'Bed', 'E on bed opens sleep menu', m); await h.shot('q02_bed_menu'); }
      if (m !== 'Bed') { await ev(() => G.ui.sleepMenu()); }
      await keyTap('Digit1'); await h.wait(1300);
      const rep = await modal();
      if (day === 0) { check(rep === 'Overnight Report' || rep === null, 'morning after sleep', { rep, date: await ev(() => G.dateStr() + ' ' + G.timeStr()) }); await h.shot('q02_morning'); }
      if (rep) await page.click('.modal-wrap .choices button'); await h.wait(100);
      // water (unless rain) — walk out and water by real input
      const st = await ev(() => ({ day: G.state.day, time: G.state.time, awake: G.state.awake, rain: G.farming.isRaining() }));
      log('morning', JSON.stringify(st));
      await goTo(6, 7, 'xy'); await walkTo(6, 8, 'y', 3000); await h.wait(450);
      const ready = await ev(([c, r]) => r.every(y => c.every(x => (G.farming.soilAt('farm', x, y) || {}).crop && G.farming.soilAt('farm', x, y).crop.ready)), [cols, rows]);
      if (ready) break;
      await goTo(13, 13, 'xy');
      for (const y of rows) for (const x of cols) { if ((await ev(([x, y]) => (G.farming.soilAt('farm', x, y) || {}).watered, [x, y]))) continue; await goTo(x, y - 1, 'xy', 6000); await tileAct('watering_can', x, y); }
    }
    const grown = await ev(([c, r]) => { let n = 0; for (const y of r) for (const x of c) if (((G.farming.soilAt('farm', x, y) || {}).crop || {}).ready) n++; return n; }, [cols, rows]);
    check(grown === 15, 'all 15 carrots ready after 4 nights', grown);
    await goTo(13, 13, 'xy'); await goTo(f.x + 3, f.y, 'xy'); await mouseAway(); await h.wait(200); await h.shot('q02_ready');
    // harvest by right-click
    const c0 = await count('carrot');
    for (const y of rows) for (const x of cols) { await goTo(x, y - 1, 'xy', 6000); await clickTile(x, y, 'right'); await h.wait(120); }
    await h.wait(400);
    const got = (await count('carrot')) - c0;
    check(got >= 15, 'harvested carrots by right-click', got);
    // put carrots on the stall: walk to stall front, interact
    await goTo(f.x + 3, 13, 'yx'); await goTo(20, 12, 'xy'); await face('up'); await mouseAway(); await ev(() => { G.input.mouse.inside = false; });
    await keyTap('KeyE'); await h.wait(200);
    check((await modal()) === 'My Farm Shop', 'E on stall opens farm shop', await modal());
    // click carrots stack in inventory grid of shop panel
    const ci = await ev(() => G.state.inv.findIndex(s => s && s.id === 'carrot'));
    await page.locator('.modal-wrap .inv-grid .slot').nth(ci).click(); await h.wait(150);
    const disp = await ev(() => G.state.mod.econ.shop.display.filter(Boolean).map(s => s.id + 'x' + s.qty));
    check(disp.length > 0, 'carrots placed on shelf', disp);
    await h.shot('q02_shop_panel');
    await page.keyboard.press('Escape'); await h.wait(100);
    // wait for customers: set time to 9am, speed up
    await ev(() => { if (G.state.time < 180) G.advanceTime(180 - G.state.time); G.timeSpeed = 10; });
    const m0 = await money(); let sawCust = false, sawAtStall = false, custThroughSolid = false, shotDone = false;
    for (let i = 0; i < 120; i++) {
      await h.wait(250);
      const cs = await ev(() => G.world.entsOf('farm').filter(e => e.kind === 'econ_customer').map(e => ({ x: e.x, y: e.y, st: e.state, solid: G.world.isSolid('farm', Math.floor(e.x / 48), Math.floor((e.y - 4) / 48)) })));
      if (cs.length) sawCust = true;
      if (cs.some(c => c.st === 'browse' || c.st === 'linger')) { sawAtStall = true; if (!shotDone) { await h.shot('q02_customer_at_stall'); shotDone = true; } }
      if (cs.some(c => c.solid)) custThroughSolid = true;
      if (sawAtStall && (await money()) > m0 + 100) break;
    }
    await ev(() => { G.timeSpeed = 1; });
    const m1 = await money();
    check(sawCust && sawAtStall, 'customers walked to the stall', { sawCust, sawAtStall });
    check(m1 > m0, 'money increased from stall sales', { m0, m1 });
    check(!custThroughSolid, 'customers never stood inside solid tiles');
  }

  /* ---------------- 3. town & merchants ---------------- */
  if (run(3)) {
    log('--- 3. town');
    await ev(() => { G.ui.close(); G.world.go('farm', 'start', true); G.input.mouse.inside = false; if (G.state.time < 200) G.advanceTime(200 - G.state.time); G.inv.add('carrot', 5, 0, true); });
    await mouseAway();
    await goTo(50, 12, 'xy');
    await page.keyboard.down('KeyD'); await h.wait(1500); await page.keyboard.up('KeyD'); await h.wait(500);
    check((await ptile()).map === 'town', 'walking off the east road edge reaches town', await ptile());
    await h.shot('q03_town_arrive');
    const bl = await ev(() => G.world.objects('town').filter(o => o.type === 'town_building').map(o => ({ k: o.k, x: o.x, y: o.y })));
    const doorOf = k => { const b = bl.find(b => b.k === k); return { x: b.x + 2, y: b.y + 4 }; };
    // closed hours first: set time to 7:30pm
    const t0 = await ev(() => G.state.time);
    await ev(() => { G.state.time = 13.5 * 60; });
    let d = doorOf('general'); await goTo(d.x, d.y, 'xy');
    await page.keyboard.down('KeyW'); await h.wait(400); await page.keyboard.up('KeyW'); await h.wait(150);
    const closedToast = await ev(() => [...document.querySelectorAll('#toasts .toast')].map(t => t.textContent).join(' | '));
    check(!(await modal()) && /closed/i.test(closedToast), 'closed-hours message at General Store', closedToast);
    await ev(t => { G.state.time = t; }, t0 < 200 ? 200 : t0);
    // re-enter (step back then up)
    await page.keyboard.down('KeyS'); await h.wait(200); await page.keyboard.up('KeyS'); await goTo(d.x, d.y, 'xy');
    await page.keyboard.down('KeyW'); await h.wait(400); await page.keyboard.up('KeyW'); await h.wait(150);
    check((await modal()) === 'Mabel', 'walking into the General Store door opens Mabel', await modal());
    await h.shot('q03_mabel');
    await clickText('.modal-wrap .choices button', 'Browse'); await h.wait(100);
    const mb = await money(), pb = await count('seeds_potato'), bb = await count('bait');
    await clickText('.shop-row', 'Potato Seeds'); await clickText('.shop-row', 'Bait');
    const ma = await money();
    check((await count('seeds_potato')) === pb + 1 && (await count('bait')) === bb + 1 && ma === mb - 45, 'bought potato seeds + bait', { mb, ma });
    // sell 1 carrot (right-click in sell grid) at 60%
    const ci = await ev(() => G.state.inv.findIndex(s => s && s.id === 'carrot' && !s.q));
    const m2 = await money();
    await page.locator('.modal-wrap .inv-grid .slot').nth(ci).click({ button: 'right' }); await h.wait(100);
    check((await money()) - m2 === Math.floor(45 * 0.6), 'sold a carrot at 60%', (await money()) - m2);
    await h.shot('q03_general_shop');
    await page.keyboard.press('Escape');
    // visit each other merchant
    for (const [k, who] of [['smith', 'Bram'], ['carpenter', 'Wren'], ['inn', 'Otis']]) {
      if (k === 'inn') await ev(() => { if (G.hour() < 10) G.advanceTime((10 - G.hour()) * 60); });
      d = doorOf(k); await page.keyboard.down('KeyS'); await h.wait(150); await page.keyboard.up('KeyS');
      const gr = await goTo(d.x + 1, d.y, 'xy'); await page.keyboard.down('KeyW'); await h.wait(400); await page.keyboard.up('KeyW'); await h.wait(150);
      check((await modal()) === who, `door opens ${who}`, { m: await modal(), gr, p: await ptile(), t: await ev(() => G.timeStr()) });
      if ((await modal()) !== who) continue;
      if (k === 'smith') { await clickText('.modal-wrap .choices button', 'Ore'); await h.shot('q03_smith'); }
      await page.keyboard.press('Escape'); await h.wait(80);
    }
    // interact with a villager via E
    const vill = await ev(() => { const e = G.world.entsOf('town').find(e => e.kind === 'econ_npc'); return e && { x: Math.floor(e.x / 48), y: Math.floor((e.y - 4) / 48) }; });
    log('villager at', JSON.stringify(vill));
    await goTo(2, 14, 'xy');
    await page.keyboard.down('KeyA'); await h.wait(800); await page.keyboard.up('KeyA'); await h.wait(500);
    check((await ptile()).map === 'farm', 'walk west edge back to farm', await ptile());
  }

  /* ---------------- 4. fishing ---------------- */
  if (run(4)) {
    log('--- 4. fishing');
    await ev(() => { G.ui.close(); G.world.go('farm', 'start', true); G.input.mouse.inside = false; if (G.hour() < 9 || G.hour() > 17) G.state.time = 240; });
    await mouseAway();
    const pond = await ev(() => G.maps.farm.meta.pond);
    // find a land tile on the north shore with water south of it
    const spot = await ev(p => { for (let x = p.x; x < p.x + p.w; x++) for (let y = p.y - 1; y < p.y + p.h; y++) if (G.world.ground('farm', x, y + 1) === 'w' && !G.world.isSolid('farm', x, y) && G.world.ground('farm', x, y) !== 'w') return { x, y }; }, pond);
    const r = await goTo(spot.x, spot.y, 'xy'); log('fishing spot', JSON.stringify(spot), JSON.stringify(r));
    await face('down');
    await selectItem('fishing_rod');
    const bait0 = await count('bait');
    let caught = 0, attempts = 0, casts = 0, sawBang = false, sawMg = false;
    const fish0 = await ev(() => G.state.stats.fishCaught);
    while (caught < 2 && attempts < 6) {
      attempts++;
      await keyTap('Space', 40);
      let ph = await ev(() => G.fishing._state.phase);
      if (ph) casts++;
      else log('no cast on attempt', attempts, JSON.stringify(await ev(() => ({ ft: G.player.facingTile(), tt: G.targetTile(), gr: G.world.ground('farm', G.player.facingTile().x, G.player.facingTile().y), obj: (G.world.objectAt('farm', G.targetTile().x, G.targetTile().y) || {}).type, mouse: G.input.mouse, cd: G.player.cooldown, busy: G.player.busy, dir: G.player.dir, sel: G.inv.selected() && G.inv.selected().id, modal: !!G.ui.modal, toasts: [...document.querySelectorAll('#toasts .toast')].map(t => t.textContent).join('|') }))));
      if (attempts === 1) check(ph === 'cast' || ph === 'wait', 'Space with rod casts into the pond', ph);
      // wait for bite
      for (let i = 0; i < 120 && ph !== 'bite'; i++) { await h.wait(100); ph = await ev(() => G.fishing._state.phase); if (!ph) break; }
      if (ph !== 'bite') continue;
      sawBang = true; await h.shot('q04_bite');
      await keyTap('Space', 30);
      ph = await ev(() => G.fishing._state.phase);
      if (ph === 'pull') { await h.wait(800); caught++; continue; }
      // reel minigame: hold/release Space based on what's visible (fish vs bar)
      let held = false, shot = false;
      for (let i = 0; i < 400; i++) {
        const mg = await ev(() => { const F = G.fishing._state; return F.mg ? { f: F.mg.f, z: F.mg.zone, s: F.mg.zsize, zv: F.mg.zv, end: F.mg.end, prog: F.mg.prog } : { ph: F.phase }; });
        if (!mg.f && mg.f !== 0) break;
        sawMg = true;
        if (!shot && mg.prog > 0.5) { await h.shot('q04_minigame'); shot = true; }
        if (mg.end) break;
        const want = (mg.z + mg.s * 0.5 + mg.zv * 0.25) < mg.f;
        if (want && !held) { await page.keyboard.down('Space'); held = true; } else if (!want && held) { await page.keyboard.up('Space'); held = false; }
        await h.wait(30);
      }
      if (held) await page.keyboard.up('Space');
      await h.wait(1800);
      if ((await ev(() => G.state.stats.fishCaught)) > fish0 + caught) { caught++; await h.shot('q04_catch_card'); }
    }
    const fish1 = await ev(() => G.state.stats.fishCaught);
    check(sawBang && sawMg, 'saw bite "!" and reel minigame', { sawBang, sawMg });
    check(fish1 > fish0, 'caught fish through the minigame', { fish0, fish1, attempts });
    check((await count('bait')) === bait0 - casts, 'one bait per cast', { bait0, now: await count('bait'), casts, attempts });
    check(!(await ev(() => G.player.busy)), 'player not stuck busy after fishing');
    // no bait
    await h.wait(1500);
    await ev(() => { G.inv.remove('bait', G.inv.count('bait')); G.inv.remove('deluxe_bait', G.inv.count('deluxe_bait')); });
    await keyTap('Space', 40); await h.wait(150);
    const tt = await ev(() => [...document.querySelectorAll('#toasts .toast')].map(t => t.textContent).join(' | '));
    check(/need bait/i.test(tt) && !(await ev(() => G.fishing._state.phase)), 'fishing without bait shows a message', tt);
    await ev(() => G.inv.add('bait', 10, 0, true));
  }

  /* ---------------- 5. mining ---------------- */
  if (run(5)) {
    log('--- 5. mining');
    await ev(() => { G.ui.close(); G.world.go('farm', 'start', true); G.input.mouse.inside = false; });
    await mouseAway();
    await goTo(27, 5, 'xy'); await walkTo(27, 3, 'y', 3000); await h.wait(600);
    check((await ptile()).map === 'mine', 'walk north into the cave mouth', await ptile());
    await h.shot('q05_mine_entrance');
    // walk onto the ladder down at (5,8)
    await goTo(5, 7, 'xy'); await page.keyboard.down('KeyS'); await h.wait(300); await page.keyboard.up('KeyS'); await h.wait(600);
    check((await ev(() => G.mining.floor())) === 1, 'walk onto ladder → floor 1', await ev(() => G.mining.floor()));
    await selectItem('pickaxe');
    // break rocks until the ladder shows (real swings; nearest rocks first)
    let found = false, broken = 0;
    for (let i = 0; i < 60 && !found; i++) {
      found = await ev(() => G.world.objects('mine').some(o => o.type === 'ladder_down'));
      if (found) break;
      const tgt = await ev(() => {
        const pt = G.player.tile(); const objs = G.world.objects('mine').filter(o => G.mining.nodes[o.type] || o.type === 'mine_crate' || o.type === 'mine_barrel');
        const reach = new Set([pt.x + ',' + pt.y]); const q = [[pt.x, pt.y]];
        while (q.length) { const [x, y] = q.shift(); for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const k = (x + dx) + ',' + (y + dy); if (!reach.has(k) && !G.world.isSolid('mine', x + dx, y + dy)) { reach.add(k); q.push([x + dx, y + dy]); } } }
        objs.sort((a, b) => Math.abs(a.x - pt.x) + Math.abs(a.y - pt.y) - Math.abs(b.x - pt.x) - Math.abs(b.y - pt.y));
        for (const o of objs) for (const [dx, dy] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) if (reach.has((o.x + dx) + ',' + (o.y + dy))) return { o: { x: o.x, y: o.y, t: o.type }, s: { x: o.x + dx, y: o.y + dy } };
        return null;
      });
      if (!tgt) break;
      const g = await goTo(tgt.s.x, tgt.s.y, 'xy', 8000);
      if (process.env.QA_DEBUG) log('mine iter', i, JSON.stringify(tgt), JSON.stringify(g));
      if (!g.ok) continue;
      for (let k = 0; k < 6; k++) { await clickTile(tgt.o.x, tgt.o.y); await h.wait(340); if (!(await ev(([x, y]) => G.world.objectAt('mine', x, y), [tgt.o.x, tgt.o.y]))) { broken++; break; } }
    }
    await h.wait(600);
    check(found, 'ladder revealed by breaking rocks', { broken });
    await h.shot('q05_floor1');
    const lad = await ev(() => { const o = G.world.objects('mine').find(o => o.type === 'ladder_down'); return o && { x: o.x, y: o.y }; });
    if (lad) { await goTo(lad.x, lad.y, 'xy'); await h.wait(700); check((await ev(() => G.mining.floor())) === 2, 'took ladder to floor 2', await ev(() => G.mining.floor())); }
    const ores = await ev(() => ({ stone: G.inv.count('stone'), copper: G.inv.count('copper_ore'), coal: G.inv.count('coal') }));
    log('mined so far', JSON.stringify(ores));
    // fast-forward to floor 5 (elevator), use elevator via E
    await ev(() => G.mining.goFloor(5, 'elev')); await h.wait(700);
    const el = await ev(() => { const o = G.world.objects('mine').find(o => o.type === 'mine_elevator'); return o && { x: o.x, y: o.y }; });
    check(!!el, 'floor 5 has an elevator', el);
    if (el) {
      await goTo(el.x, el.y + 1, 'xy'); await face('up'); await mouseAway(); await ev(() => { G.input.mouse.inside = false; });
      await keyTap('KeyE'); await h.wait(150);
      check((await modal()) === 'Elevator', 'E on elevator opens menu', await modal());
      await h.shot('q05_elevator');
      await clickText('.modal-wrap .choices button', 'Mine entrance'); await h.wait(700);
      check((await ev(() => G.mining.floor())) === 0, 'elevator to entrance', await ev(() => G.mining.floor()));
    }
    // leave via ladder up at (8,3): stand at (8,4) face up, E
    await goTo(8, 4, 'xy'); await face('up'); await keyTap('KeyE'); await h.wait(700);
    check((await ptile()).map === 'farm', 'ladder up leaves the mine to the farm', await ptile());
  }

  const toTown = async () => { await ev(() => { G.ui.close(); G.world.go('town', 'west', true); G.input.mouse.inside = false; }); await h.wait(100); };
  const enterShop = async (k) => {
    const b = await ev(k => { const o = G.world.objects('town').find(o => o.type === 'town_building' && o.k === k); return { x: o.x + 2, y: o.y + 4 }; }, k);
    await page.keyboard.down('KeyS'); await h.wait(120); await page.keyboard.up('KeyS');
    await goTo(b.x, b.y, 'xy'); await page.keyboard.down('KeyW'); await h.wait(450); await page.keyboard.up('KeyW'); await h.wait(150);
    return modal();
  };
  const sleepNow = async () => { await ev(() => { G.ui.close(); G.sleep('full'); }); await h.wait(1300); const r = await ev(() => G.ui.modal ? G.ui.modal.body.innerText : ''); await ev(() => G.ui.close()); return r; };
  const freeSpotNear = (x, y) => ev(([x, y]) => { for (let r = 0; r < 8; r++) for (let j = -r; j <= r; j++) for (let i = -r; i <= r; i++) { const X = x + i, Y = y + j; if (G.world.isFree('farm', X, Y) && !G.farming.isRoad(X, Y) && G.world.isFree('farm', X, Y + 1)) return { x: X, y: Y }; } }, [x, y]);

  /* ---------------- 6. crafting & furnace ---------------- */
  if (run(6)) {
    log('--- 6. crafting & furnace');
    await ev(() => { G.ui.close(); G.world.go('farm', 'start', true); G.input.mouse.inside = false; G.inv.add('fiber', 10, 0, true); G.inv.add('sap', 4, 0, true); G.inv.add('copper_ore', 35, 0, true); G.inv.add('stone', 30, 0, true); G.inv.add('coal', 3, 0, true); });
    await mouseAway();
    await keyTap('KeyC'); await h.wait(150);
    check((await modal()) === 'Crafting', 'C opens crafting', await modal());
    const b0 = await count('bait');
    await page.locator('.econ-craft', { hasText: 'Bait ×5' }).locator('button', { hasText: 'Craft' }).click(); await h.wait(100);
    check((await count('bait')) === b0 + 5, 'crafted 5 bait', await count('bait'));
    await page.locator('.econ-craft', { hasText: 'Furnace' }).locator('button', { hasText: 'Craft' }).click(); await h.wait(100);
    check((await count('furnace')) === 1, 'crafted furnace');
    await h.shot('q06_crafting');
    await keyTap('KeyC'); await h.wait(100);
    check(!(await modal()), 'C closes crafting');
    // place furnace two tiles east of the house path
    const spot = await freeSpotNear(17, 10);
    await goTo(spot.x - 1, spot.y, 'xy');
    await selectItem('furnace'); await clickTile(spot.x, spot.y); await h.wait(100);
    const fur = await ev(([x, y]) => (G.world.objectAt('farm', x, y) || {}).type, [spot.x, spot.y]);
    check(fur === 'furnace' && (await count('furnace')) === 0, 'furnace placed with mouse', { fur, spot });
    // try placing another object on top: chest (craft one)
    await ev(() => G.inv.add('chest', 1, 0, true));
    await selectItem('chest'); await clickTile(spot.x, spot.y); await h.wait(100);
    check((await count('chest')) === 1, 'cannot place chest on top of furnace');
    // smelt: select copper ore, click furnace (5 ore + 1 coal per bar)
    const ore0 = await count('copper_ore'), coal0 = await count('coal'), bar0 = await count('copper_bar');
    await selectItem('copper_ore'); await clickTile(spot.x, spot.y); await h.wait(100);
    const fo = await ev(([x, y]) => { const o = G.world.objectAt('farm', x, y); return { q: o.queue, left: o.left, bar: o.bar }; }, [spot.x, spot.y]);
    check(fo.q === Math.min(Math.floor(ore0 / 5), coal0) && (await count('copper_ore')) === ore0 - 5 * fo.q && (await count('coal')) === coal0 - fo.q, 'furnace loaded (ore/coal consumed per bar)', { fo, ore: await count('copper_ore') });
    await h.shot('q06_furnace_on');
    await ev(n => G.advanceTime(30 * n + 5), fo.q); await h.wait(100);
    await mouseAway(); await clickTile(spot.x, spot.y, 'right'); await h.wait(100);
    check((await count('copper_bar')) === bar0 + fo.q, 'collected all smelted copper bars (30 min each)', await count('copper_bar'));
  }

  /* ---------------- 7. tool upgrade ---------------- */
  if (run(7)) {
    log('--- 7. blacksmith upgrade');
    await ev(() => { G.state.money += 2000; G.inv.add('copper_bar', 5, 0, true); if (G.hour() < 9 || G.hour() >= 17) G.state.time = 200; });
    const m0 = await money(); const bars0 = await count('copper_bar');
    await toTown();
    check((await enterShop('smith')) === 'Bram', 'reach Bram');
    await clickText('.modal-wrap .choices button', 'Upgrade'); await h.wait(100);
    await h.shot('q07_upgrades');
    await clickText('.shop-row', 'Hoe → Copper'); await h.wait(100);
    check((await money()) === m0 - 2000 && (await count('copper_bar')) === bars0 - 5 && (await count('hoe')) === 0, 'paid 2000g + 5 bars, hoe left with Bram', { m: await money(), bars: await count('copper_bar') });
    await page.keyboard.press('Escape');
    const rep = await sleepNow();
    check(/Bram delivered/.test(rep) && (await ev(() => G.state.tools.hoe)) === 1 && (await count('hoe')) === 1, 'copper hoe delivered next morning', rep.slice(0, 200));
    // verify bigger area: till facing down in an open grass area
    await ev(() => { G.world.go('farm', 'start', true); G.input.mouse.inside = false; });
    const sp = await ev(() => { for (let y = 24; y < 38; y++) for (let x = 22; x < 48; x++) { let ok = true; for (let k = 0; k < 4; k++) if (!G.farming.isTillable('farm', x, y + k) || (k === 0 && G.world.isSolid('farm', x, y))) ok = false; if (ok) return { x, y }; } });
    await goTo(sp.x, sp.y, 'xy'); await face('down'); await mouseAway(); await ev(() => { G.input.mouse.inside = false; });
    await selectItem('hoe'); await keyTap('Space'); await h.wait(200);
    const n = await ev(sp => [1, 2, 3].filter(k => G.farming.soilAt('farm', sp.x, sp.y + k)).length, sp);
    check(n === 3, 'copper hoe tills 3 tiles in a line', n);
    await h.shot('q07_copper_hoe');
  }

  /* ---------------- 8. carpenter: worker cabin ---------------- */
  if (run(8)) {
    log('--- 8. carpenter');
    await ev(() => { G.state.money += 4000; G.inv.add('wood', 150, 0, true); G.inv.add('stone', 50, 0, true); if (G.hour() < 9 || G.hour() >= 17) G.state.time = 200; });
    const m0 = await money();
    await toTown();
    check((await enterShop('carpenter')) === 'Wren', 'reach Wren');
    await clickText('.modal-wrap .choices button', 'Buildings'); await h.wait(100);
    await h.shot('q08_buildings');
    await clickText('.shop-row', 'Worker Cabin'); await h.wait(700);
    check((await ev(() => !!G.economy._.placement())) && (await ptile()).map === 'farm', 'placement mode on the farm', await ptile());
    // pick a valid spot near the player
    const spot = await ev(() => { const pt = G.player.tile(); let best = null; for (let y = 14; y < 30; y++) for (let x = 30; x < 50; x++) if (G.economy._.plValid(x, y)) { const d = Math.abs(x + 1 - pt.x) + Math.abs(y - pt.y); if (!best || d < best.d) best = { x, y, d }; } return best; });
    log('cabin spot', JSON.stringify(spot));
    // walk near it so it's on screen, then hover + click
    await goTo(spot.x + 1, spot.y + 4, 'xy');
    const s = await tileScreen(spot.x + 1, spot.y + 2);
    await page.mouse.move(s.x, s.y); await h.wait(150); await h.shot('q08_placement_ghost');
    await page.mouse.click(s.x, s.y); await h.wait(200);
    const cab = await ev(sp => { const o = G.world.objectAt('farm', sp.x + 1, sp.y + 1); return o && o.type; }, spot);
    check(cab === 'worker_cabin' && (await money()) === m0 - 4000, 'cabin built where clicked', { cab, money: await money() });
    await mouseAway(); await ev(() => { G.input.mouse.inside = false; });
    // walk into it from below (door side) — must be blocked
    await goTo(spot.x + 1, spot.y + 4, 'xy');
    await page.keyboard.down('KeyW'); await h.wait(800); await page.keyboard.up('KeyW');
    check((await ptile()).y >= spot.y + 3, 'cabin is solid', await ptile());
    await h.shot('q08_cabin');
  }

  /* ---------------- 9. inn: workers ---------------- */
  if (run(9)) {
    log('--- 9. workers');
    await ev(() => { if (!G.economy.housingCap || G.economy.housingCap() < 3) G.state.mod.econ.built.cabin = Math.max(1, G.state.mod.econ.built.cabin); G.state.money += 3000; if (G.hour() < 10 || G.hour() >= 17) G.state.time = 300; });
    await toTown();
    check((await enterShop('inn')) === 'Otis', 'reach Otis');
    await clickText('.modal-wrap .choices button', 'Job board'); await h.wait(100);
    await page.locator('.econ-worker', { hasText: 'Shopkeeper' }).locator('button', { hasText: 'Hire' }).click(); await h.wait(100);
    await page.locator('.econ-worker', { hasText: 'Farmhand' }).locator('button', { hasText: 'Hire' }).click(); await h.wait(100);
    await h.shot('q09_jobboard');
    const ws = await ev(() => G.economy.workers().map(w => w.type));
    check(ws.includes('shopkeeper') && ws.includes('farmhand'), 'hired shopkeeper + farmhand', ws);
    await page.keyboard.press('Escape');
    // set up: ripe crops (planted & grown) and stock in the crate via the crate UI
    await ev(() => {
      const f = G.maps.farm.meta.field; let n = 0;
      for (let y = f.y + 5; y < f.y + 7; y++) for (let x = f.x + 1; x < f.x + 6; x++) { for (const o of G.world.objectsIn('farm', x, y, 1, 1)) G.world.removeObject('farm', o); G.farming.till('farm', x, y); if (G.farming.plant('farm', x, y, 'carrot')) { G.state.maps.farm.soil[x + ',' + y].c.d = 3; G.state.maps.farm.soil[x + ',' + y].w = 1; n++; } }
      G.inv.add('carrot', 30, 0, true); G.inv.add('sunfish', 6, 0, true);
      G.world.go('farm', 'start', true); G.input.mouse.inside = false;
    });
    const crate = await ev(() => { const o = G.world.objects('farm').find(o => o.type === 'shop_crate'); return { x: o.x, y: o.y }; });
    await goTo(crate.x, crate.y + 1, 'xy'); await face('up'); await mouseAway(); await ev(() => { G.input.mouse.inside = false; });
    await keyTap('KeyE'); await h.wait(150);
    check((await modal()) === 'Shop Stock Crate', 'E opens the stock crate', await modal());
    for (const id of ['carrot', 'sunfish']) { const i = await ev(id => G.state.inv.findIndex(s => s && s.id === id && !s.q), id); await page.locator('.modal-wrap .inv-grid').nth(1).locator('.slot').nth(i).click(); await h.wait(80); }
    const crateN = await ev(() => G.state.mod.econ.crate.filter(Boolean).reduce((a, s) => a + s.qty, 0));
    check(crateN >= 36, 'stocked the crate', crateN);
    await page.keyboard.press('Escape');
    const m0 = await money();
    const rep = await sleepNow();
    log('report:', rep.replace(/\n+/g, ' | '));
    check(/Farmhand\) watered/.test(rep) && /harvested/.test(rep), 'report: farmhand watered & harvested', rep.slice(0, 300));
    check(/Paid/.test(rep), 'report: wages paid');
    const wc = await ev(() => G.state.mod.econ.workerCrate.filter(Boolean).map(s => s.id + 'x' + s.qty));
    check(wc.some(s => s.startsWith('carrot')), 'harvest landed in worker crate', wc);
    // restock the crate through its UI, then go to the mine and let the shopkeeper work 9am-1pm
    await ev(() => { G.world.go('farm', 'start', true); G.input.mouse.inside = false; G.inv.add('carrot', 20, 0, true); });
    await goTo(crate.x, crate.y + 1, 'xy'); await face('up'); await keyTap('KeyE'); await h.wait(150);
    { const i = await ev(() => G.state.inv.findIndex(s => s && s.id === 'carrot' && !s.q)); await page.locator('.modal-wrap .inv-grid').nth(1).locator('.slot').nth(i).click(); await h.wait(80); }
    await page.keyboard.press('Escape');
    await goTo(27, 5, 'xy'); await walkTo(27, 3, 'y', 3000); await h.wait(600);
    check((await ptile()).map === 'mine', 'in the mine');
    const mA = await money();
    await ev(() => { if (G.state.time < 180) G.advanceTime(180 - G.state.time); G.advanceTime(240); });
    const sold = await ev(() => ({ n: G.state.mod.econ.shop.today.n, gold: G.state.mod.econ.shop.today.gold, disp: G.state.mod.econ.shop.display.filter(Boolean).map(s => s.id + 'x' + s.qty) }));
    check(sold.n > 0 && (await money()) > mA, 'shopkeeper sold stock while player is in the mine', { sold, mA, m: await money() });
    await ev(() => G.world.go('farm', 'mine', true));
  }

  /* ---------------- 10. fatigue ---------------- */
  if (run(10)) {
    log('--- 10. fatigue');
    await ev(() => { G.ui.close(); G.world.go('farm', 'start', true); G.input.mouse.inside = false; G.state.time = 600; G.state.awake = 23 * 60 + 50; });
    await h.wait(400);
    let hud = await page.locator('.hud-fatigue').innerText();
    check(/Tired/.test(hud), 'HUD shows Tired before 24h', hud);
    await ev(() => G.advanceTime(20)); await h.wait(400);
    hud = await page.locator('.hud-fatigue').innerText();
    check(/Exhausted/.test(hud) && /quality/.test(hud), 'HUD shows Exhausted at 24h', hud);
    await mouseAway(); await h.wait(100); await h.shot('q10_exhausted_vignette');
    // corner pixel darker than centre-ish grass because of vignette
    // quality: compare rested vs exhausted harvest quality at farming lvl 8 (statistical)
    const q = await ev(() => {
      const lvl = G.state.skills.farming.lvl; G.state.skills.farming.lvl = 8;
      const roll = () => { let s = 0; for (let i = 0; i < 400; i++) s += G.rollQuality(G.skillLvl('farming')); return s / 400; };
      const aw = G.state.awake; G.state.awake = 0; const rested = roll(); G.state.awake = 25 * 60; const ex = roll(); G.state.awake = 37 * 60; const del = roll(); G.state.awake = aw;
      G.state.skills.farming.lvl = lvl; return { rested, ex, del, workMult: G.workMult() };
    });
    check(q.ex < q.rested && q.del < q.ex, 'quality drops when exhausted/delirious', q);
    // real tool spam: 60 hoe swings on grass — every swing processes (no energy blocker), some fumble
    const sp = await ev(() => { for (let y = 24; y < 38; y++) for (let x = 22; x < 48; x++) { let ok = true; for (let k = 0; k < 2; k++) if (!G.farming.isTillable('farm', x, y + k) || (k === 0 && G.world.isSolid('farm', x, y))) ok = false; if (ok) return { x, y }; } });
    await goTo(sp.x, sp.y, 'xy'); await face('down'); await ev(() => { G.input.mouse.inside = false; G.state.tools.hoe = 0; });
    await selectItem('hoe');
    const yawns = await ev(async () => {
      let fum = 0, acts = 0; const of = G.fumble; G.fumble = () => { const r = of(); if (r) fum++; acts++; return r; };
      for (let i = 0; i < 60; i++) { G.player.cooldown = 0; G.doAction(); const s = G.farming.soilAt('farm', G.player.facingTile().x, G.player.facingTile().y); if (s && !s.crop) { delete G.state.maps.farm.soil[G.player.facingTile().x + ',' + G.player.facingTile().y]; } }
      G.fumble = of; return { fum, acts };
    });
    check(yawns.acts === 60 && yawns.fum > 0 && yawns.fum < 25, 'exhausted: all 60 swings processed, ~15% fumbles', yawns);
    // real input swings still work
    await keyTap('Space'); await h.wait(350); await keyTap('Space'); await h.wait(350);
    // stay up past 6am -> new day without sleeping, awake keeps counting
    const d0 = await ev(() => ({ day: G.state.day, awake: G.state.awake }));
    await ev(() => G.advanceTime(G.DAY_LEN - G.state.time + 10)); await h.wait(300);
    const d1 = await ev(() => ({ day: G.state.day, awake: G.state.awake, time: G.state.time, modal: G.ui.modal && G.ui.modal.opts.title }));
    check(d1.day === d0.day + 1 && d1.awake > d0.awake && d1.time < 60, 'staying up past 6am rolls to a new day, tiredness kept', { d0, d1 });
    await ev(() => G.ui.close());
    hud = await page.locator('.hud-fatigue').innerText();
    check(/Delirious|Exhausted/.test(hud), 'still exhausted/delirious next morning', hud);
    // sleep resets
    await sleepNow();
    await h.wait(300); hud = await page.locator('.hud-fatigue').innerText();
    check(/Rested/.test(hud) && (await ev(() => G.state.awake)) < 5, 'sleeping resets tiredness', hud);
    // no energy-like blocker: grep DOM/HUD for energy/stamina
    const txt = await ev(() => document.body.innerText + ' ' + JSON.stringify(Object.keys(G.state)));
    check(!/stamina|energy:/i.test(txt), 'no energy/stamina anywhere in UI/state');
  }

  /* ---------------- 11. save / load ---------------- */
  if (run(11)) {
    log('--- 11. save/load');
    await ev(() => { G.ui.close(); G.world.go('farm', 'start', true); G.inv.add('ruby', 2, 2, true); G.state.money = 12345; });
    const snap = () => ev(() => ({ day: G.state.day, season: G.state.season, money: G.state.money, inv: G.state.inv.map(s => s ? s.id + ':' + s.qty + ':' + (s.q || 0) : '').join(','), soil: Object.keys(G.state.maps.farm.soil || {}).length, crops: Object.values(G.state.maps.farm.soil || {}).filter(s => s.c).length, objs: G.world.objects('farm').length, bld: G.world.objects('farm').filter(o => ['worker_cabin', 'furnace', 'shop_stall'].includes(o.type)).map(o => o.type).sort().join(), workers: G.economy.workers().map(w => w.type).join(), tools: JSON.stringify(G.state.tools), map: G.player.map, x: Math.round(G.player.x), y: Math.round(G.player.y) }));
    const a = await snap();
    await page.reload(); await page.waitForSelector('#cont'); await page.click('#cont'); await h.wait(800);
    const b = await snap();
    const diff = Object.keys(a).filter(k => a[k] !== b[k]);
    check(diff.length === 0, 'state preserved after reload → Continue', diff.map(k => [k, a[k], b[k]]));
    await h.shot('q11_continued');
    // save while in the mine
    await mouseAway(); await ev(() => { G.input.mouse.inside = false; });
    await goTo(27, 5, 'xy'); await walkTo(27, 3, 'y', 3000); await h.wait(600);
    await goTo(5, 7, 'xy'); await page.keyboard.down('KeyS'); await h.wait(300); await page.keyboard.up('KeyS'); await h.wait(700);
    check((await ev(() => G.mining.floor())) === 1, 'in mine floor 1 before reload');
    await page.reload(); await page.waitForSelector('#cont'); await page.click('#cont'); await h.wait(800);
    const p = await ptile();
    check(p.map === 'farm' && Math.abs(p.x - 27) <= 1 && p.y <= 5, 'reloading from the mine resumes on the farm by the cave', p);
    check(!(await modal()), 'no stray modal after continue', await modal());
  }

  /* ---------------- 12. seasons ---------------- */
  if (run(12)) {
    log('--- 12. seasons');
    await ev(() => { G.ui.close(); G.state.day = 28; G.state.season = 0; const f = G.maps.farm.meta.field; const x = f.x + 8, y = f.y + 7; for (const o of G.world.objectsIn('farm', x, y, 2, 1)) G.world.removeObject('farm', o); G.farming.till('farm', x, y); G.farming.plant('farm', x, y, 'carrot'); G.farming.till('farm', x + 1, y); G.farming.plant('farm', x + 1, y, 'strawberry'); });
    const rep = await sleepNow();
    const st = await ev(() => { const f = G.maps.farm.meta.field; return { date: G.dateStr(), c1: G.farming.soilAt('farm', f.x + 8, f.y + 7), c2: G.farming.soilAt('farm', f.x + 9, f.y + 7) }; });
    check(st.date.startsWith('Summer 1') && /Summer/.test(rep), 'day 28 + sleep → Summer 1 with welcome report', { date: st.date, rep: rep.slice(0, 160) });
    check(st.c1.crop && st.c1.crop.dead && st.c2.crop && st.c2.crop.dead, 'spring crops withered in summer', st);
    await ev(() => { if (G.hour() < 9 || G.hour() >= 18) G.state.time = 200; });
    await toTown();
    await enterShop('general');
    await clickText('.modal-wrap .choices button', 'Browse'); await h.wait(100);
    const rows = await page.locator('.shop-row .nm b').allInnerTexts();
    check(rows.some(r => /Tomato/.test(r)) && !rows.some(r => /Carrot/.test(r)), 'summer seeds in store', rows.join(', '));
    await h.shot('q12_summer_store');
    await page.keyboard.press('Escape');
    await ev(() => { G.state.season = 0; G.state.day = 2; G.world.go('farm', 'start', true); });
  }

  /* ---------------- 13. UI ---------------- */
  if (run(13)) {
    log('--- 13. UI');
    await ev(() => { G.ui.close(); G.world.go('farm', 'start', true); G.inv.add('stone', 7, 0, true); G.inv.add('wood', 9, 0, true); });
    for (const [k, i] of [['Digit3', 2], ['Digit0', 9], ['Minus', 10], ['Equal', 11], ['Digit1', 0]]) { await keyTap(k); check((await ev(() => G.state.hotbar)) === i, `hotbar key ${k} → slot ${i}`); }
    const cvs = await page.locator('#game').boundingBox();
    await page.mouse.move(cvs.width / 2, cvs.height / 2); await page.mouse.wheel(0, 120); await h.wait(80);
    check((await ev(() => G.state.hotbar)) === 1, 'mouse wheel scrolls hotbar', await ev(() => G.state.hotbar));
    await page.mouse.wheel(0, -120); await h.wait(80);
    await keyTap('Tab'); await h.wait(150);
    check((await modal()) === 'Inventory', 'Tab opens inventory', await modal());
    const si = await ev(() => G.state.inv.findIndex(s => s && s.id === 'stone')), wi = await ev(() => G.state.inv.findIndex(s => s && s.id === 'wood'));
    const grid = page.locator('.modal-wrap .inv-grid .slot');
    await grid.nth(si).click(); await h.wait(60); await grid.nth(wi).click(); await h.wait(80);
    check((await ev(([si, wi]) => G.state.inv[si] && G.state.inv[si].id === 'wood' && G.state.inv[wi].id === 'stone', [si, wi])), 'click-click swaps inventory slots');
    // tooltip
    await page.locator('.modal-wrap .inv-grid .slot').nth(si).hover(); await h.wait(100);
    const tip = await page.locator('#tooltip').innerText();
    check(/Wood/.test(tip), 'tooltip on hover', tip);
    await h.shot('q13_inventory_tooltip');
    // trash (right-click → confirm)
    await page.locator('.modal-wrap .inv-grid .slot').nth(wi).click({ button: 'right' }); await h.wait(100);
    await clickText('.modal-wrap .choices button', 'Yes'); await h.wait(150);
    check((await count('stone')) === 0 && (await modal()) === 'Inventory', 'trash removes stack and returns to inventory', { stone: await count('stone'), m: await modal() });
    // other tabs
    for (const t of ['Crafting', 'Skills']) { await clickText('.modal-wrap .tabs button', t); }
    await h.shot('q13_skills_tab');
    await keyTap('Tab'); await h.wait(100);
    check(!(await modal()), 'Tab closes inventory');
    // resize checks
    const overlaps = async () => ev(() => {
      const r = s => { const e = document.querySelector(s); return e ? e.getBoundingClientRect() : null; };
      const hud = r('#hud'), hb = r('#hotbar'), help = r('#helpbar'), pan = r('.modal-wrap .panel');
      const W = innerWidth, H = innerHeight; const out = [];
      const inside = (b, n) => { if (b && (b.left < -1 || b.top < -1 || b.right > W + 1 || b.bottom > H + 1)) out.push(n + ' overflows viewport ' + JSON.stringify([b.left | 0, b.top | 0, b.right | 0, b.bottom | 0])); };
      inside(hud, 'hud'); inside(hb, 'hotbar'); inside(pan, 'panel');
      const ov = (a, b) => a && b && a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
      if (ov(hud, hb)) out.push('hud overlaps hotbar');
      if (ov(help, hb)) out.push('helpbar overlaps hotbar');
      if (help && (help.left < 0 || help.right > W)) out.push('helpbar wider than screen');
      const pb = document.querySelector('.modal-wrap .panel-body'); if (pb && pb.scrollWidth > pb.clientWidth + 2) out.push('panel body horizontal overflow');
      return out;
    });
    for (const [w, hh] of [[900, 600], [1920, 1080], [1280, 800]]) {
      await page.setViewportSize({ width: w, height: hh }); await h.wait(300);
      const o1 = await overlaps(); await h.shot(`q13_${w}x${hh}`);
      await keyTap('Tab'); await h.wait(150); const o2 = await overlaps(); await h.shot(`q13_${w}x${hh}_inv`); await keyTap('Tab');
      await ev(() => G.economy.openShop()); await h.wait(150); const o3 = await overlaps(); await h.shot(`q13_${w}x${hh}_shop`); await page.keyboard.press('Escape');
      check(!o1.length && !o2.length && !o3.length, `layout ok at ${w}x${hh}`, { hud: o1, inv: o2, shop: o3 });
    }
  }

  /* ---------------- 14. performance ---------------- */
  if (run(14)) {
    log('--- 14. performance');
    await ev(() => { G.ui.close(); G.world.go('farm', 'start', true); });
    await h.wait(500);
    const perf = await ev(() => new Promise(res => {
      const base = G.render; let work = [], frames = [], last = performance.now();
      G.render = function () { const t = performance.now(); base.apply(this, arguments); work.push(performance.now() - t); };
      const t0 = performance.now();
      const f = now => { frames.push(now - last); last = now; if (now - t0 < 5000) requestAnimationFrame(f); else { G.render = base; const avg = a => a.reduce((s, v) => s + v, 0) / a.length; const sorted = work.slice().sort((a, b) => a - b); res({ frames: frames.length, avgFrame: +avg(frames.slice(1)).toFixed(2), avgRender: +avg(work).toFixed(2), p95Render: +sorted[Math.floor(sorted.length * 0.95)].toFixed(2), maxRender: +sorted[sorted.length - 1].toFixed(2) }); } };
      requestAnimationFrame(f);
    }));
    log('perf', JSON.stringify(perf));
    check(perf.avgRender < 16, 'render well under 16ms', perf);
  }

  /* ---------------- 15. buy-low / sell-high audit ---------------- */
  if (run(15)) {
    log('--- 15. exploit audit');
    await ev(() => { G.ui.close(); G.state.time = 300; G.state.money = 999999; if (window.__oldPrices) { G.items.coffee.price = 50; G.items.bait.price = 3; } });
    const rowsOf = async () => ev(() => [...document.querySelectorAll('.shop-row')].map(r => ({ name: r.querySelector('.nm b').textContent, price: r.querySelector('.pr').textContent })));
    const all = [];
    for (const [k, btn] of [['general', 'Browse'], ['smith', 'Ore'], ['carpenter', 'Supplies'], ['inn', 'coffee']]) {
      await ev(k => G.economy.visitShop(k), k); await h.wait(80);
      await clickText('.modal-wrap .choices button', btn); await h.wait(80);
      all.push(...(await rowsOf()).map(r => ({ ...r, k })));
      await page.keyboard.press('Escape');
    }
    const bad = await ev(rows => {
      const out = [];
      for (const r of rows) {
        const id = Object.keys(G.items).find(i => G.items[i].name === r.name); if (!id) continue;
        const buy = parseInt(r.price.replace(/[^0-9]/g, ''), 10); if (!buy || /\+/.test(r.price)) continue;
        const best = Math.floor(G.priceOf(id, 0) * 2); // own shop at max markup
        if (best > buy) out.push(`${r.k}: ${r.name} buy ${buy}g → shop @200% ${best}g`);
      }
      return out;
    }, all);
    log('audited', all.length, 'merchant rows');
    check(bad.length === 0, 'no item can be bought from a merchant and resold in the farm shop for profit', bad);
  }

  /* ---------------- 16. regression checks for fixed bugs ---------------- */
  if (run(16)) {
    log('--- 16. regressions');
    // portraits resolve to art, not placeholders
    const ph = await ev(() => { const s = new Set(Object.values(G._placeholders)); return ['portrait_mabel', 'portrait_worker1'].filter(n => s.has(G.icon(n))); });
    check(ph.length === 0, 'portraits use art (not "POR" placeholders)', ph);
    // buying a building then reloading before placing refunds it
    await ev(() => { G.ui.close(); G.state.money = 5000; G.inv.add('wood', 150, 0, true); G.inv.add('stone', 50, 0, true); G.state.time = 200; G.economy.visitShop('carpenter'); });
    await clickText('.modal-wrap .choices button', 'Buildings'); await clickText('.shop-row', 'Worker Cabin'); await h.wait(700);
    check((await money()) === 1000, 'cabin paid', await money());
    await ev(() => G.save());
    await page.reload(); await page.waitForSelector('#cont'); await page.click('#cont'); await h.wait(1000);
    check((await money()) === 5000 && (await count('wood')) >= 150 && !(await ev(() => G.economy._.placement())), 'unplaced building refunded after reload', { m: await money(), wood: await count('wood') });
    // can't place a chest on a growing crop
    await ev(() => { G.world.go('farm', 'start', true); const x = 15, y = 10; G.farming.till('farm', x, y) || 0; G.farming.plant('farm', x, y, 'carrot'); G.inv.add('chest', 1, 0, true); });
    const placed = await ev(() => { const i = G.state.inv.findIndex(s => s && s.id === 'chest'); G.state.hotbar = i; G.player.x = 15.5 * 48; G.player.y = 9.8 * 48; G.player.dir = 'down'; G.input.mouse.inside = false; G.player.cooldown = 0; G.doAction(); return { obj: (G.world.objectAt('farm', 15, 10) || {}).type || null, soil: !!G.farming.soilAt('farm', 15, 10) }; });
    check(!placed.soil || placed.obj !== 'chest', 'cannot place a chest on a growing crop', placed);
    // facing away from water with the rod gives a hint
    await ev(() => { G.world.go('farm', 'start', true); const i = G.state.inv.findIndex(s => s && s.id === 'fishing_rod'); G.state.hotbar = i; G.player.cooldown = 0; G.input.mouse.inside = false; G.doAction(); });
    const tt = await ev(() => [...document.querySelectorAll('#toasts .toast')].map(t => t.textContent).join(' | '));
    check(/Face the water/.test(tt), 'rod away from water shows a hint', tt);
  }

  log(fails.length ? `${fails.length} FAILED CHECKS:\n  - ` + fails.join('\n  - ') : 'ALL CHECKS PASSED');
};
