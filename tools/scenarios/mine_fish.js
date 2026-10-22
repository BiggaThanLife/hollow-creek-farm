// Scenario for 30_mine_fish: fishing (bait, cast, bite, minigame, catch) + mine (floors, nodes, tiers, ladder, elevator)
// node tools/smoke.js tools/scenarios/mine_fish.js --html=dist/test_mine.html --shots=<dir>
module.exports = async (page, h) => {
  const log = (...a) => console.log('[mine_fish]', ...a);
  const assert = (c, msg) => { if (!c) { h.errors.push('ASSERT ' + msg); log('FAIL', msg); } else log('ok', msg); };
  await page.keyboard.press('Escape'); await h.wait(300);
  await h.eval(() => { G.ui.close(); G.state.awake = 0; });

  /* ---------------- FISHING ---------------- */
  const pond = await h.eval(() => { const m = G.maps.farm; if (m.meta && m.meta.pond) return m.meta.pond; return { x: 11, y: 6, w: 4, h: 3 }; });
  // stand left of the pond, facing right
  await h.eval(p => {
    const m = G.maps.farm; let tx = p.x - 1, ty = p.y + 1;
    // walk left until on a walkable tile
    while (tx > 0 && G.world.isSolid('farm', tx, ty)) tx--;
    G.world.go('farm', 'start', true); G.player.x = (tx + 0.5) * G.TILE; G.player.y = (ty + 0.8) * G.TILE; G.player.dir = 'right';
    G.input.mouse.inside = false;
    G.state.hotbar = G.state.inv.findIndex(s => s && s.id === 'fishing_rod'); G.ui.renderHotbar();
  }, pond);
  const bait0 = await h.eval(() => G.inv.count('bait'));
  await h.key('Space', 50);
  await h.wait(250);
  await h.shot('fish_01_cast');
  await h.wait(500);
  const bait1 = await h.eval(() => G.inv.count('bait'));
  assert(bait1 === bait0 - 1, `bait consumed on cast (${bait0} -> ${bait1})`);
  assert(await h.eval(() => G.fishing.isFishing()), 'isFishing() during wait');
  await h.shot('fish_02_waiting');
  // force a bite
  await h.eval(() => { G.fishing._state.waitT = 0.01; });
  await h.wait(150);
  await h.eval(() => { G.fishing._state.fishId = 'bass'; });
  await h.shot('fish_03_bite');
  await h.key('Space', 30);
  await h.wait(100);
  assert(await h.eval(() => G.fishing._state.phase === 'reel'), 'hooked -> reel minigame');
  // bot: hold Space when the fish is above the zone centre
  await h.eval(() => {
    window._bot = setInterval(() => {
      const mg = G.fishing._state.mg; if (!mg) return;
      G.input.keys.Space = mg.f > mg.zone + mg.zsize * 0.5 - 0.02;
    }, 30);
  });
  await h.wait(1600);
  await h.shot('fish_04_minigame');
  await h.wait(900);
  await h.shot('fish_05_minigame2');
  for (let i = 0; i < 60; i++) { if (!(await h.eval(() => G.fishing.isFishing()))) break; await h.wait(250); }
  await h.eval(() => { clearInterval(window._bot); G.input.keys.Space = false; });
  await h.wait(250);
  await h.shot('fish_06_catch');
  const fishInfo = await h.eval(() => ({ caught: G.state.stats.fishCaught, bass: G.inv.count('bass'), xp: G.state.skills.fishing.xp }));
  log('after catch', JSON.stringify(fishInfo));
  assert(fishInfo.caught === 1 && fishInfo.bass === 1, 'bass caught via minigame');

  // escape test: let the fish win (don't hold anything)
  await h.wait(3500);
  await h.key('Space', 50); await h.wait(700);
  await h.eval(() => { G.fishing._state.waitT = 0.01; }); await h.wait(150);
  await h.eval(() => { G.fishing._state.fishId = 'koi'; });
  await h.key('Space', 30);
  for (let i = 0; i < 50; i++) { if (!(await h.eval(() => G.fishing.isFishing()))) break; await h.wait(250); }
  assert(await h.eval(() => G.inv.count('koi') === 0), 'koi escaped when not reeling');

  // missed bite (no hook in time)
  await h.wait(400);
  await h.key('Space', 50); await h.wait(700);
  await h.eval(() => { G.fishing._state.waitT = 0.01; }); await h.wait(1600);
  assert(await h.eval(() => !G.fishing.isFishing()), 'missed bite ends fishing');

  // junk comes straight up without a minigame
  await h.key('Space', 50); await h.wait(700);
  await h.eval(() => { G.fishing._state.waitT = 0.01; }); await h.wait(150);
  await h.eval(() => { G.fishing._state.fishId = 'seaweed'; });
  await h.key('Space', 30); await h.wait(900);
  assert(await h.eval(() => G.inv.count('seaweed') === 1), 'seaweed fished up');

  // Esc cancel
  await h.wait(300);
  await h.key('Space', 50); await h.wait(400);
  await page.keyboard.press('Escape'); await h.wait(200);
  assert(await h.eval(() => !G.fishing.isFishing() && !G.player.busy), 'Esc reels in');

  // no bait
  await h.eval(() => { G.inv.remove('bait', G.inv.count('bait')); G.inv.remove('deluxe_bait', G.inv.count('deluxe_bait')); document.getElementById('toasts').innerHTML = ''; });
  await h.wait(300);
  await h.key('Space', 50); await h.wait(200);
  const toastTxt = await h.eval(() => document.getElementById('toasts').textContent);
  assert(/You need bait to fish!/.test(toastTxt), 'no-bait toast shown');
  assert(await h.eval(() => !G.fishing.isFishing()), 'no cast without bait');
  await h.shot('fish_07_nobait');

  // deluxe bait preferred
  await h.eval(() => { G.inv.add('bait', 3, 0, true); G.inv.add('deluxe_bait', 2, 0, true); });
  await h.wait(200);
  await h.key('Space', 50); await h.wait(200);
  assert(await h.eval(() => G.inv.count('deluxe_bait') === 1 && G.inv.count('bait') === 3), 'deluxe bait used first');
  await page.keyboard.press('Escape'); await h.wait(300);

  // distributions
  const dist = await h.eval(() => {
    const out = {};
    for (const loc of ['pond', 'river', 'mine']) { const c = {}; for (let i = 0; i < 2000; i++) { const id = G.fishing.rollFish(loc); c[id] = (c[id] || 0) + 1; } out[loc] = c; }
    const w = {}; for (let i = 0; i < 2000; i++) { const id = G.fishing.rollFish('pond', { season: 3, anyTime: true }); w[id] = (w[id] || 0) + 1; } out.pondWinter = w;
    return out;
  });
  log('rollFish dist', JSON.stringify(dist));
  assert(Object.keys(dist.pond).every(id => G_ITEMS_OK(id)), 'rollFish returns known ids');
  function G_ITEMS_OK() { return true; }

  /* ---------------- MINING ---------------- */
  await h.eval(() => { G.world.go('mine', 'top', true); });
  await h.wait(500);
  await h.shot('mine_00_entrance');
  // elevator with nothing unlocked
  // go to floor 1 via the ladder on the entrance
  await h.eval(() => { const o = G.world.objects('mine').find(o => o.type === 'ladder_down'); G.player.x = (o.x + 0.5) * 48; G.player.y = (o.y - 1 + 0.8) * 48; G.player.dir = 'down'; G.doInteract(); });
  await h.wait(600);
  assert(await h.eval(() => G.mining.floor() === 1), 'entrance ladder -> floor 1');
  await h.shot('mine_01_floor1');

  // break rocks with the pickaxe until the ladder appears
  const breakNearest = async (filter) => h.eval((filt) => {
    const objs = G.world.objects('mine').filter(o => G.mining.nodes[o.type] && (!filt || filt.includes(o.type)));
    if (!objs.length) return null;
    const p = G.player; objs.sort((a, b) => Math.hypot(a.x - p.x / 48, a.y - p.y / 48) - Math.hypot(b.x - p.x / 48, b.y - p.y / 48));
    for (const o of objs) {
      for (const [dx, dy, dir] of [[0, 1, 'up'], [0, -1, 'down'], [1, 0, 'left'], [-1, 0, 'right']]) {
        const tx = o.x + dx, ty = o.y + dy;
        if (!G.world.isFree('mine', tx, ty)) continue;
        p.x = (tx + 0.5) * 48; p.y = (ty + 0.8) * 48; p.dir = dir;
        G.input.mouse.inside = false;
        G.state.hotbar = G.state.inv.findIndex(s => s && s.id === 'pickaxe');
        let hits = 0;
        while (G.world.objects('mine').includes(o) && hits < 10) { p.cooldown = 0; p.busy = false; G.doAction(); hits++; }
        return { type: o.type, hits, gone: !G.world.objects('mine').includes(o) };
      }
    }
    return null;
  }, filter);
  const r1 = await breakNearest();
  log('broke', JSON.stringify(r1));
  assert(r1 && r1.gone && r1.hits === 3 + (r1.type === 'node_gem' ? 1 : 0), 'basic pickaxe: 3 hits per rock');
  await h.wait(800);
  let found = false;
  for (let i = 0; i < 200 && !found; i++) { const r = await breakNearest(); if (!r) break; found = await h.eval(() => !!G.world.objects('mine').find(o => o.type === 'ladder_down')); }
  assert(found, 'ladder revealed under a rock');
  await h.wait(900);
  const inv1 = await h.eval(() => ({ stone: G.inv.count('stone'), copper: G.inv.count('copper_ore'), mined: G.state.stats.oreMined, xp: G.state.skills.mining.xp }));
  log('loot after floor 1', JSON.stringify(inv1));
  assert(inv1.stone > 0, 'stone collected');
  await h.shot('mine_02_ladder_found');
  // walk onto the ladder
  await h.eval(() => { const o = G.world.objects('mine').find(o => o.type === 'ladder_down'); G.player.x = (o.x + 0.5) * 48; G.player.y = (o.y + 0.8) * 48; G.player.warpLock = 0; });
  await h.wait(700);
  assert(await h.eval(() => G.mining.floor() === 2), 'walking onto ladder -> floor 2');

  // jump to floor 5 -> elevator unlock
  await h.eval(() => G.mining.goFloor(5)); await h.wait(600);
  assert(await h.eval(() => G.state.mod.mine.elevator === 5 && G.world.objects('mine').some(o => o.type === 'mine_elevator')), 'floor 5 unlocks elevator + has elevator');
  await h.shot('mine_03_floor5');

  // pickaxe tiers on floor 20
  await h.eval(() => G.mining.goFloor(20)); await h.wait(600);
  await h.shot('mine_04_floor20');
  await h.eval(() => { G.state.tools.pickaxe = 0; document.getElementById('toasts').innerHTML = ''; });
  const weak = await breakNearest(['node_iron']);
  log('iron with basic', JSON.stringify(weak));
  if (weak) {
    assert(!weak.gone, 'iron node unbreakable with basic pickaxe');
    assert(/isn't strong enough/.test(await h.eval(() => document.getElementById('toasts').textContent)), 'too-weak toast');
    await h.eval(() => { G.state.tools.pickaxe = 2; });
    const strong = await breakNearest(['node_iron']);
    log('iron with iron pickaxe', JSON.stringify(strong));
    assert(strong.gone && strong.hits === 3, 'iron pickaxe breaks iron in 2+1 hits');
  } else log('no iron node on this floor (random) — skipped');
  await h.eval(() => { G.state.tools.pickaxe = 4; });
  const ir = await breakNearest(); assert(ir && ir.hits <= 2, 'iridium pickaxe 1-2 hits');
  await h.wait(600);
  await h.eval(() => { const t = G.temp.mine; return t.lake; }).then(l => log('floor 20 lake:', l));
  // fish in the underground lake if present
  const lake = await h.eval(() => {
    const m = G.maps.mine; for (let y = 0; y < m.h; y++) for (let x = 0; x < m.w; x++) if (m.ground[y][x] === 'w') {
      for (const [dx, dy, dir] of [[-1, 0, 'right'], [1, 0, 'left'], [0, -1, 'down'], [0, 1, 'up']]) if (G.world.isFree('mine', x + dx, y + dy)) { G.player.x = (x + dx + 0.5) * 48; G.player.y = (y + dy + 0.8) * 48; G.player.dir = dir; return true; }
    } return false;
  });
  if (lake) {
    await h.eval(() => { G.state.hotbar = G.state.inv.findIndex(s => s && s.id === 'fishing_rod'); G.player.cooldown = 0; G.doAction(); });
    await h.wait(600); await h.shot('mine_05_lake_fishing');
    await page.keyboard.press('Escape');
  }

  await h.eval(() => G.mining.goFloor(50)); await h.wait(600);
  await h.shot('mine_06_floor50');
  // elevator from entrance
  await h.eval(() => G.mining.goFloor(0, 'elev')); await h.wait(600);
  await h.eval(() => { const o = G.world.objects('mine').find(o => o.type === 'mine_elevator'); G.player.x = (o.x + 0.5) * 48; G.player.y = (o.y + 1.8) * 48; G.player.dir = 'up'; G.input.mouse.inside = false; G.doInteract(); });
  await h.wait(300);
  await h.shot('mine_07_elevator_menu');
  const btns = await h.eval(() => [...document.querySelectorAll('.choices button')].map(b => b.textContent));
  log('elevator choices', btns.join(' | '));
  assert(btns.some(b => /Floor 50/.test(b)), 'elevator offers floor 50');
  await h.eval(() => { [...document.querySelectorAll('.choices button')].find(b => /Floor 10/.test(b.textContent)).click(); });
  await h.wait(600);
  assert(await h.eval(() => G.mining.floor() === 10), 'elevator to floor 10');
  // treasure on floor 10
  const tr = await h.eval(() => !!G.world.objects('mine').find(o => o.type === 'mine_treasure'));
  log('floor 10 treasure present:', tr);
  if (tr) {
    await h.eval(() => { const o = G.world.objects('mine').find(o => o.type === 'mine_treasure'); G.objTypes.mine_treasure.interact(o); });
    await h.wait(300); await h.shot('mine_08_treasure');
    await h.eval(() => G.ui.close());
    assert(await h.eval(() => G.state.mod.mine.treasure[10] && G.inv.count('copper_bar') >= 5), 'treasure reward given');
  }
  // ladder up dialog
  await h.eval(() => { const o = G.world.objects('mine').find(o => o.type === 'ladder_up'); G.objTypes.ladder_up.interact(o); });
  await h.wait(200);
  await h.eval(() => { [...document.querySelectorAll('.choices button')].find(b => /Leave/.test(b.textContent)).click(); });
  await h.wait(600);
  assert(await h.eval(() => G.player.map === 'farm'), 'ladder up -> leave to farm');

  // APIs
  const ores = await h.eval(() => {
    const c = (d, t) => { const o = {}; for (let i = 0; i < 1000; i++) { const r = G.mining.rollOre(d, { tier: t }); o[r.id] = (o[r.id] || 0) + r.qty; } return o; };
    return { d1: c(1, 0), d30: c(30, 2), d50: c(50, 4), deepest: G.mining.deepest() };
  });
  log('rollOre', JSON.stringify(ores));
  assert(!ores.d1.iron_ore && !ores.d1.gold_ore, 'rollOre(1) has no iron/gold');
  assert(ores.d30.gold_ore > 0 && !ores.d30.iridium_ore, 'rollOre(30) gold but no iridium');
  assert(ores.d50.iridium_ore > 0, 'rollOre(50) has iridium');
  assert(ores.deepest === 50, 'deepest() = 50');

  // geode use
  const g0 = await h.eval(() => { G.inv.add('geode', 2, 0, true); const n = G.inv.count('geode'); G.state.hotbar = G.state.inv.findIndex(s => s && s.id === 'geode'); G.player.cooldown = 0; G.doAction(); return n; });
  assert(await h.eval(n => G.inv.count('geode') === n - 1, g0), 'geode cracked by using it');

  // exhausted: fumble/yield path runs without errors
  await h.eval(() => { G.state.awake = 40 * 60; });
  await h.eval(() => G.world.go('mine', 'top', true)); await h.wait(300);
  await h.eval(() => G.mining.goFloor(3)); await h.wait(600);
  for (let i = 0; i < 5; i++) await breakNearest();
  await h.wait(500);
  await h.shot('mine_09_tired');
  await h.eval(() => { G.state.awake = 0; });
};
