// Economy scenario: node tools/smoke.js tools/scenarios/economy.js --html=dist/test_econ.html --shots=<dir>
module.exports = async (page, h) => {
  const log = (...a) => console.log('[econ]', ...a);
  const check = (name, ok, extra = '') => { console.log(ok ? '  PASS' : '  FAIL', name, extra); if (!ok) h.errors.push('CHECK FAILED: ' + name + ' ' + extra); };
  await h.eval(() => {
    window.T_ = {
      E: () => G.state.mod.econ,
      at(x, y, dir = 'down') { G.player.x = (x + .5) * 48; G.player.y = (y + .8) * 48; G.player.dir = dir; G.input.mouse.inside = false; },
      sel(id) { const i = G.state.inv.findIndex(s => s && s.id === id); if (i >= 0) G.state.hotbar = i; return i; },
      night() { G.ui.close(); G.state.time = 0; G.newDay(true); G.flushReport(); },
      clickRow(text) { const r = [...document.querySelectorAll('.shop-row')].find(r => r.textContent.includes(text)); if (r) r.click(); return !!r; },
      clickBtn(text) { const b = [...document.querySelectorAll('.panel button')].find(b => b.textContent.includes(text)); if (b) b.click(); return !!b; },
    };
    G._noFumble = true; G.fumble = () => false;
    G.state.money = 200000; G.state.time = 240; // 10am
    const give = [['wood', 900], ['stone', 400], ['hardwood', 300], ['copper_bar', 30], ['iron_bar', 40], ['gold_bar', 30], ['copper_ore', 60], ['coal', 30], ['fiber', 40], ['sap', 10], ['amethyst', 5], ['quartz', 12]];
    for (const [id, n] of give) G.inv.add(id, n, 0, true);
  });
  const hasFarm = await h.eval(() => !!(G.farming && G.farming.crops));
  log('farm module present:', hasFarm);

  // ---- farm objects
  const fo = await h.eval(() => ({ stall: !!G.economy.shopStall(), crate: !!G.world.objects('farm').find(o => o.type === 'shop_crate'), s: G.economy.shopStall() }));
  check('shop stall + crate placed', fo.stall && fo.crate, JSON.stringify(fo.s));

  // ---- town
  await h.eval(() => { G.world.go('town', 'west', true); });
  await h.wait(300); await h.shot('10_town_west');
  check('town map', await h.eval(() => G.player.map === 'town' && G.world.objects('town').filter(o => o.type === 'town_building').length === 4));
  await h.eval(() => T_.at(21, 14)); await h.wait(200); await h.shot('11_town_center');
  await h.eval(() => T_.at(24, 22)); await h.wait(200); await h.shot('12_town_south');
  // walk into the general store door (door cols x=5,6; front row y=11)
  await h.eval(() => T_.at(5, 11, 'up'));
  await h.walk('up', 400);
  check('walking into door opens dialog', await h.eval(() => !!G.ui.modal && G.ui.modal.opts.cls === 'dialog'));
  await h.shot('13_mabel_dialog');
  await h.eval(() => T_.clickBtn('Browse')); await h.wait(150); await h.shot('14_general_store');
  const seedsBefore = await h.eval(() => G.inv.count('seeds_carrot'));
  await h.eval(() => { const rows = document.querySelectorAll('.shop-row'); rows[0].click(); });
  check('bought seeds', await h.eval((b) => G.inv.count(G.state.inv.find(s => s && s.id.startsWith('seeds_')) ? 'seeds_carrot' : 'x') > b || G.state.inv.some(s => s && s.id.startsWith('seeds_')), seedsBefore));
  await h.eval(() => { G.ui.close(); G.economy.visitShop('general'); T_.clickBtn('Recipes'); }); await h.wait(100); await h.shot('15_recipes');
  await h.eval(() => T_.clickRow('Preserves Jar'));
  check('bought recipe', await h.eval(() => G.state.recipes.includes('preserves_jar')));

  // ---- closed hours
  await h.eval(() => { G.ui.close(); G.state.time = 1200; G.economy.visitShop('smith'); });
  check('closed at night', await h.eval(() => !G.ui.modal));
  await h.eval(() => { G.state.time = 240; });

  // ---- blacksmith upgrade
  await h.eval(() => { G.economy.visitShop('smith'); T_.clickBtn('Upgrade'); }); await h.wait(150); await h.shot('16_blacksmith_upgrades');
  await h.eval(() => T_.clickRow('Hoe →'));
  const up = await h.eval(() => ({ u: T_.E().upgrading, hasHoe: G.inv.has('hoe') }));
  check('upgrade started & hoe taken', !!up.u && !up.hasHoe, JSON.stringify(up));
  await h.wait(100); await h.shot('17_upgrade_in_progress');
  await h.eval(() => { G.ui.close(); G.economy.visitShop('smith'); T_.clickBtn('Ore'); }); await h.wait(100); await h.shot('18_smelting');
  const bars0 = await h.eval(() => G.inv.count('copper_bar'));
  await h.eval(() => T_.clickRow('Smelt: Copper'));
  check('smelt service', await h.eval(b => G.inv.count('copper_bar') === b + 1, bars0));

  // ---- carpenter
  await h.eval(() => { G.ui.close(); G.economy.visitShop('carpenter'); T_.clickBtn('Buildings'); }); await h.wait(150); await h.shot('19_carpenter_buildings');
  await h.eval(() => { G.ui.close(); G.economy.visitShop('carpenter'); T_.clickBtn('Supplies'); }); await h.wait(150); await h.shot('20_carpenter_furniture');
  await h.eval(() => T_.clickRow('Rocking Chair'));
  check('bought furniture', await h.eval(() => G.inv.has('furn_rocking_chair')));
  // inn
  await h.eval(() => { G.ui.close(); G.economy.visitShop('inn'); }); await h.wait(100); await h.shot('21_inn_dialog');

  // ---- sleep -> upgraded hoe
  await h.eval(() => { G.ui.close(); T_.night(); }); await h.wait(1200);
  await h.shot('22_report_upgrade');
  const tools = await h.eval(() => ({ tier: G.state.tools.hoe, has: G.inv.has('hoe'), up: T_.E().upgrading }));
  check('hoe returned upgraded', tools.tier === 1 && tools.has && !tools.up, JSON.stringify(tools));

  // ---- building placement (cabin)
  await h.eval(() => { G.ui.close(); G.state.time = 240; G.world.go('town', 'west', true); G.economy.visitShop('carpenter'); T_.clickBtn('Buildings'); T_.clickRow('Worker Cabin'); });
  await h.wait(900);
  check('placement mode on farm', await h.eval(() => !!G.economy._.placement() && G.player.map === 'farm'));
  // find a valid spot and aim the mouse there
  const spot = await h.eval(() => {
    const _ = G.economy._, m = G.maps.farm;
    const bz = (m.meta && m.meta.buildZone) || { x: 2, y: 2, w: m.w - 4, h: m.h - 4 };
    for (let y = bz.y; y < bz.y + bz.h - 3; y++) for (let x = bz.x; x < bz.x + bz.w - 3; x++) if (_.plValid(x, y)) return { x, y };
    // clear debris in build zone and retry
    for (const o of G.world.objectsIn('farm', bz.x, bz.y, 8, 8)) if (['weeds', 'twig', 'rock', 'stump', 'tree_oak', 'tree_pine', 'sapling'].includes(o.type)) G.world.removeObject('farm', o);
    for (let y = bz.y; y < bz.y + bz.h - 3; y++) for (let x = bz.x; x < bz.x + bz.w - 3; x++) if (_.plValid(x, y)) return { x, y };
    return null;
  });
  log('cabin spot', JSON.stringify(spot));
  await h.eval((s) => { G.player.x = (s.x + 1.5) * 48; G.player.y = (s.y + 5.8) * 48; }, spot);
  await h.wait(100);
  // move mouse to the bottom-centre tile of the footprint
  await h.eval((s) => { const m = G.input.mouse; m.inside = true; m.lastMove = performance.now(); m.x = (s.x + 1.5) * 48 - G.cam.x; m.y = (s.y + 2.5) * 48 - G.cam.y; }, spot);
  await h.wait(150); await h.shot('23_placement_ghost');
  const cab0 = await h.eval(() => G.world.objects('farm').filter(o => o.type === 'worker_cabin').length);
  await h.eval((s) => { const m = G.input.mouse; m.inside = true; m.x = (s.x + 1.5) * 48 - G.cam.x; m.y = (s.y + 2.5) * 48 - G.cam.y; G.economy._.plPlace(); }, spot);
  await h.wait(200); await h.shot('24_cabin_built');
  check('cabin placed', await h.eval(c => G.world.objects('farm').filter(o => o.type === 'worker_cabin').length === c + 1 && T_.E().built.cabin === 1, cab0));
  // cancel refund
  await h.eval(() => { const m0 = G.state.money; G.inv.pay([['wood', 300], ['stone', 100]], 8000); G.economy._.startPlacement('shed'); window._m0 = m0; });
  await h.wait(500); await h.eval(() => G.economy._.plCancel());
  check('placement cancel refunds', await h.eval(() => G.state.money === window._m0 && !G.economy._.placement()));

  // ---- crafting
  await h.eval(() => { G.ui.close(); G.ui.hotkeys.KeyC(); }); await h.wait(150); await h.shot('25_crafting');
  await h.eval(() => { G.economy._.craft('furnace'); G.economy._.craft('chest'); G.economy._.craft('preserves_jar'); G.economy._.craft('bait', 2); G.ui.close(); });
  check('crafted furnace/chest/jar/bait', await h.eval(() => G.inv.has('furnace') && G.inv.has('chest') && G.inv.has('preserves_jar') && G.inv.count('bait') >= 10));
  await h.eval(() => { G.ui.openInventory('craft'); }); await h.wait(100); await h.shot('26_inventory_crafting_tab');
  // place furnace + chest + jar next to player
  const placed = await h.eval(() => {
    G.ui.close(); const p = G.player.tile(); const out = {};
    const spots = []; for (let r = 1; r < 6 && spots.length < 5; r++) for (let i = -r; i <= r && spots.length < 5; i++) { const x = p.x + i, y = p.y - r; if (G.world.canPlace('farm', x, y, 1, 1)) spots.push({ x, y }); }
    const items = ['furnace', 'chest', 'preserves_jar', 'furn_rocking_chair', 'torch'];
    G.economy._.craft('torch');
    items.forEach((id, k) => { const s = spots[k]; if (!s) return; const idx = T_.sel(id); const it = G.item(id); out[id] = it.use({ map: 'farm', x: s.x, y: s.y, slot: G.state.inv[idx], slotIndex: idx, item: it, obj: null }); out[id + '_xy'] = s; });
    return out;
  });
  log('placed', JSON.stringify(placed));
  const fur = placed.furnace_xy;
  await h.eval((s) => { const o = G.world.objectAt('farm', s.x, s.y); T_.sel('copper_ore'); G.world.objDef(o).onItem(o, G.inv.selected(), { slotIndex: G.state.hotbar }); }, fur);
  await h.wait(100); await h.shot('27_furnace_working');
  await h.eval(() => G.advanceTime(30));
  const fstate = await h.eval((s) => { const o = G.world.objectAt('farm', s.x, s.y); return { done: o.done, queue: o.queue }; }, fur);
  check('furnace produced a bar after 30 min', fstate.done >= 1, JSON.stringify(fstate));
  await h.eval(() => G.advanceTime(60)); await h.shot('28_furnace_ready');
  const b0 = await h.eval(() => G.inv.count('copper_bar'));
  await h.eval((s) => { const o = G.world.objectAt('farm', s.x, s.y); T_.sel('chest'); G.world.objDef(o).interact(o, 'farm'); }, fur);
  check('collect bars', await h.eval(b => G.inv.count('copper_bar') > b, b0));
  // preserves jar with a crop (only if farm module present)
  if (hasFarm) {
    const jar = placed.preserves_jar_xy;
    await h.eval((s) => { G.inv.add('cabbage', 3, 0, true); const o = G.world.objectAt('farm', s.x, s.y); T_.sel('cabbage'); G.world.objDef(o).onItem(o, G.inv.selected(), { slotIndex: G.state.hotbar }); }, jar);
    await h.eval(() => G.advanceTime(2880));
    const js = await h.eval((s) => G.world.objectAt('farm', s.x, s.y), jar);
    check('jar finished', js.out && js.left <= 0, JSON.stringify(js));
    await h.shot('29_jar_ready');
    await h.eval((s) => { const o = G.world.objectAt('farm', s.x, s.y); T_.sel('chest'); G.world.objDef(o).interact(o, 'farm'); }, jar);
    check('pickles collected', await h.eval(() => G.inv.count('pickles') >= 3));
  }
  // pick up furniture with axe
  await h.eval((s) => { const o = G.world.objectAt('farm', s.x, s.y); G.world.objDef(o).onTool(o, 'axe', 0, {}); }, placed.furn_rocking_chair_xy);
  check('furniture picked up', await h.eval(() => G.inv.has('furn_rocking_chair')));

  // ---- farm shop
  await h.eval(() => {
    G.state.time = 240; G.state.money = 100000;
    const e = T_.E(); const d = e.shop.display;
    const crop = G.items.carrot ? 'carrot' : 'quartz';
    G.inv.add(crop, 40, 0, true); G.inv.add('pickles', 0, 0, true);
    d[0] = { id: crop, qty: 30, q: 0 }; d[1] = { id: 'amethyst', qty: 3, q: 0 }; d[2] = { id: G.items.cabbage ? 'cabbage' : 'quartz', qty: 5, q: 1 };
    e.crate[0] = { id: 'quartz', qty: 8, q: 0 };
    const s = G.economy.shopStall(); T_.at(s.x + 1, s.y + 3, 'up');
  });
  await h.wait(200);
  check('shop open when player near', await h.eval(() => G.economy.shopStatus().open));
  await h.eval(() => { const s = G.economy.shopStall(); G.world.objDef(s).interact(s, 'farm'); }); await h.wait(150);
  await h.shot('30_shop_panel');
  await h.eval(() => T_.clickBtn('125%'));
  check('markup set', await h.eval(() => T_.E().shop.markup === 1.25));
  await h.eval(() => G.ui.close());
  // customers walk in (speed up time)
  const money0 = await h.eval(() => G.state.money);
  await h.eval(() => { G.economy._.spawnCustomer(); setTimeout(() => G.economy._.spawnCustomer(), 1500); G.timeSpeed = 25; });
  await h.wait(2500); await h.shot('31_customers_walking');
  await h.wait(5000); await h.shot('32_customers_buying');
  await h.eval(() => { G.timeSpeed = 1; });
  const sales = await h.eval(() => ({ n: T_.E().shop.today.n, gold: T_.E().shop.today.gold, log: T_.E().shop.log.length }));
  check('customers bought items', sales.n > 0 && (await h.eval(() => G.state.money)) > money0, JSON.stringify(sales));
  // abstract simulation (player away, shopkeeper) later

  // ---- workers
  await h.eval(() => { G.state.money = 100000; T_.E().built.cabin = 2; G.ui.close(); G.world.go('town', 'west', true); G.economy.visitShop('inn'); T_.clickBtn('Job board'); });
  await h.wait(150); await h.shot('33_job_board');
  await h.eval(() => { for (const t of ['shopkeeper', 'farmhand', 'miner', 'fisher']) G.economy._.hire(t); G.ui.close(); G.economy._.openJobBoard(); });
  await h.wait(100); await h.shot('34_job_board_hired');
  check('hired 4 workers', await h.eval(() => G.economy.workers().length === 4 && G.economy.hasWorker('fisher')));
  await h.eval(() => { G.ui.close(); T_.E().workerCrate[0] = { id: 'bait', qty: 6, q: 0 }; });
  // shopkeeper sells while player is in town (abstract sim)
  await h.eval(() => { G.state.time = 300; const d = T_.E().shop.display; d[0] = d[0] || { id: 'quartz', qty: 10, q: 0 }; T_.E().shop.today = { n: 0, gold: 0 }; T_.E().shop.nextCust = null; });
  check('shop open via shopkeeper while away', await h.eval(() => G.economy.shopStatus().open && G.player.map === 'town'));
  await h.eval(() => { G.advanceTime(240); });
  const away = await h.eval(() => T_.E().shop.today);
  check('off-screen sales by shopkeeper', away.n > 0, JSON.stringify(away));
  // farm view with workers
  await h.eval(() => { G.world.go('farm', 'east', true); G.state.time = 300; const s = G.economy.shopStall(); T_.at(s.x + 1, s.y + 3, 'up'); });
  await h.wait(400); await h.shot('35_farm_workers');
  // new day: wages + jobs
  await h.eval(() => { G.ui.close(); T_.night(); }); await h.wait(1200);
  await h.shot('36_report_workers');
  const rep = await h.eval(() => [...document.querySelectorAll('.report .rline')].map(r => r.textContent));
  log('report:\n   ' + rep.join('\n   '));
  check('worker report lines', rep.some(l => /Miner/.test(l)) && rep.some(l => /Fisher/.test(l)) && rep.some(l => /wages/.test(l)));
  check('worker crate has goods', await h.eval(() => T_.E().workerCrate.filter(Boolean).length > 0));
  await h.eval(() => { G.ui.close(); const c = G.world.objects('farm').find(o => o.type === 'worker_crate'); if (c) G.world.objDef(c).interact(c, 'farm'); }); await h.wait(100);
  await h.shot('37_worker_crate');
  // unpaid wages
  await h.eval(() => { G.ui.close(); G.state.money = 50; T_.night(); }); await h.wait(1200);
  const rep2 = await h.eval(() => [...document.querySelectorAll('.report .rline')].map(r => r.textContent).join(' | '));
  check('unpaid workers take day off', /took the day off/.test(rep2), rep2.slice(0, 200));
  await h.eval(() => { G.ui.close(); G.state.money = 50000; });
  // shop expansion
  await h.eval(() => { G.world.go('town', 'west', true); G.state.time = 240; G.economy.visitShop('carpenter'); T_.clickBtn('Buildings'); T_.clickRow('Shop Expansion I'); G.ui.close(); });
  check('shop expansion', await h.eval(() => T_.E().shop.level === 1));
  // night town lights
  await h.eval(() => { G.ui.close(); G.state.time = 900; T_.at(18, 13); }); await h.wait(300); await h.shot('38_town_night');
  // help
  await h.eval(() => { G.ui.help(); }); await h.wait(100); await h.shot('39_help');
  await h.eval(() => G.ui.close());
};
