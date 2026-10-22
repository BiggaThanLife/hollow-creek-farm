// Farm module scenario: node tools/smoke.js tools/scenarios/farm.js --html=dist/test_farm.html --shots=<dir>
module.exports = async (page, h) => {
  const log = (...a) => console.log('[farm]', ...a);
  // install helpers in page
  await h.eval(() => {
    window.T_ = {
      sel(id) { const i = G.state.inv.findIndex(s => s && s.id === id); if (i >= 0) G.state.hotbar = i; return i; },
      at(x, y, dir = 'down') { const d = { up: [0, 1], down: [0, -1], left: [1, 0], right: [-1, 0] }[dir]; G.player.x = (x + d[0] + .5) * 48; G.player.y = (y + d[1] + .8) * 48; G.player.dir = dir; G.input.mouse.inside = false; },
      act(id, x, y, dir) { G.ui.close(); this.sel(id); this.at(x, y, dir); G.player.cooldown = 0; G.doAction(); },
      interact(x, y, dir) { G.ui.close(); this.at(x, y, dir); G.doInteract(); },
      night() { G.ui.close(); G.state.time = 0; G.newDay(true); G.ui.close(); },
      clear(x, y, w, hh) { for (const o of G.world.objectsIn('farm', x, y, w, hh)) if (['weeds', 'twig', 'rock', 'stump', 'tree_oak', 'tree_pine'].includes(o.type)) G.world.removeObject('farm', o); },
    };
    G.fumble = (orig => () => G._noFumble ? false : orig())(G.fumble);
    G._noFumble = true;
  });
  await h.wait(300);
  const meta = await h.eval(() => JSON.stringify(G.maps.farm.meta));
  log('meta', meta);
  const cnt = await h.eval(() => { const c = {}; for (const o of G.world.objects('farm')) c[o.type] = (c[o.type] || 0) + 1; return JSON.stringify(c); });
  log('objects', cnt);
  // check shop spot & path clear
  const clear = await h.eval(() => { const m = G.maps.farm.meta; let ok = G.world.canPlace('farm', m.shopSpot.x, m.shopSpot.y, 3, 2) && G.world.isFree('farm', m.crateSpot.x, m.crateSpot.y); for (const p of m.customerPath) ok = ok && !G.world.isSolid('farm', p.x, p.y); return ok; });
  log('shopSpot/crate/customerPath clear:', clear);
  await h.shot('01_farm_start');
  // overview at several camera positions
  for (const [n, x, y] of [['02_north_cave', 27, 6], ['03_east_road', 46, 12], ['04_pond', 11, 33], ['05_buildzone', 40, 25], ['06_south_east', 46, 37], ['07_field', 14, 19]]) {
    await h.eval(([x, y]) => { T_.at(x, y); }, [x, y]); await h.wait(150); await h.shot(n);
  }
  // farm work: till 3x3 in field, plant, water
  const res = await h.eval(() => {
    const f = G.maps.farm.meta.field; const x0 = f.x + 2, y0 = f.y + 2;
    T_.clear(x0, y0, 3, 3);
    for (let j = 0; j < 3; j++) for (let i = 0; i < 3; i++) T_.act('hoe', x0 + i, y0 + j);
    let tilled = 0; for (let j = 0; j < 3; j++) for (let i = 0; i < 3; i++) if (G.farming.soilAt('farm', x0 + i, y0 + j)) tilled++;
    for (let j = 0; j < 3; j++) for (let i = 0; i < 3; i++) T_.act('seeds_carrot', x0 + i, y0 + j);
    for (let j = 0; j < 3; j++) for (let i = 0; i < 3; i++) T_.act('watering_can', x0 + i, y0 + j);
    // out-of-season
    G.inv.add('seeds_corn', 2); T_.clear(x0 + 4, y0, 1, 1); T_.act('hoe', x0 + 4, y0); T_.act('seeds_corn', x0 + 4, y0);
    const s = G.farming.soilAt('farm', x0, y0);
    return { tilled, s, cornPlanted: !!(G.farming.soilAt('farm', x0 + 4, y0) || {}).crop, seeds: G.inv.count('seeds_carrot') };
  });
  log('till/plant/water', JSON.stringify(res));
  await h.wait(200); await h.shot('08_planted');
  // grow 2 days -> screenshot, then till ready
  for (let d = 0; d < 2; d++) await h.eval(() => { T_.night(); G.farming.waterAll('farm'); });
  await h.eval(() => { const f = G.maps.farm.meta.field; T_.at(f.x + 3, f.y + 1); }); await h.wait(150); await h.shot('09_growing');
  for (let d = 0; d < 2; d++) await h.eval(() => { T_.night(); G.farming.waterAll('farm'); });
  const st = await h.eval(() => { const f = G.maps.farm.meta.field; return JSON.stringify(G.farming.soilAt('farm', f.x + 2, f.y + 2)); });
  log('after 4 days', st);
  await h.eval(() => { const f = G.maps.farm.meta.field; T_.at(f.x + 3, f.y + 1); }); await h.wait(150); await h.shot('10_ready');
  const harv = await h.eval(() => {
    const f = G.maps.farm.meta.field; const x0 = f.x + 2, y0 = f.y + 2;
    const before = G.inv.count('carrot');
    T_.interact(x0, y0);                    // by hand
    T_.act('scythe', x0 + 1, y0);           // scythe (tier 0 radius 0)
    G.state.tools.scythe = 1; T_.act('scythe', x0 + 1, y0 + 1); // radius 1 harvests the rest
    return { got: G.inv.count('carrot') - before, xp: G.state.skills.farming.xp, harvested: G.state.stats.cropsHarvested };
  });
  log('harvest', JSON.stringify(harv));
  // exhausted quality
  const tired = await h.eval(() => {
    const f = G.maps.farm.meta.field; const x0 = f.x + 2, y0 = f.y + 2; const qs = [];
    G.state.skills.farming.lvl = 10;
    for (let i = 0; i < 40; i++) { const s = G.state.maps.farm.soil[x0 + ',' + y0] || (G.state.maps.farm.soil[x0 + ',' + y0] = {}); s.c = { id: 'carrot', d: 4, t: 4 }; }
    const roll = () => { const r = []; for (let i = 0; i < 40; i++) { G.state.maps.farm.soil[x0 + ',' + y0].c = { id: 'carrot', d: 4, t: 4 }; const before = G.state.inv.map(s => s ? s.id + s.q + ':' + s.qty : '').join(); G.farming.harvestReady(1).forEach(x => r.push(x.q)); } return r; };
    G.state.awake = 0; const rested = roll();
    G.state.awake = 25 * 60; const ex = roll();
    G.state.maps.farm.soil[x0 + ',' + y0].c = { id: 'carrot', d: 4, t: 4 }; T_.interact(x0, y0);
    G.state.skills.farming.lvl = 0;
    const avg = a => a.reduce((s, v) => s + v, 0) / a.length;
    return { rested: avg(rested), exhausted: avg(ex), mult: G.workMult() };
  });
  log('quality avg rested vs exhausted', JSON.stringify(tired));
  await h.wait(100); await h.shot('11_tired_harvest');
  await h.eval(() => { G.state.awake = 0; });
  // chop a tree & break a rock
  const chop = await h.eval(() => {
    const objs = G.world.objects('farm');
    const tree = objs.find(o => o.type === 'tree_oak' && G.world.isFree('farm', o.x, o.y - 1));
    const rock = objs.find(o => o.type === 'rock' && G.world.isFree('farm', o.x, o.y - 1));
    const w0 = G.inv.count('wood'), s0 = G.inv.count('stone');
    for (let i = 0; i < 5; i++) T_.act('axe', tree.x, tree.y);
    const stump = G.world.objectAt('farm', tree.x, tree.y);
    for (let i = 0; i < 3; i++) T_.act('pickaxe', rock.x, rock.y);
    const big = objs.find(o => o.type === 'big_stump'); if (big) T_.act('axe', big.x, big.y);
    return { wood: G.inv.count('wood') - w0, stone: G.inv.count('stone') - s0, stumpLeft: stump && stump.type, rockGone: !G.world.objectAt('farm', rock.x, rock.y) };
  });
  log('chop/break', JSON.stringify(chop));
  // items: sprinkler, scarecrow, fertilizer, acorn
  const items = await h.eval(() => {
    const f = G.maps.farm.meta.field; const x = f.x + 6, y = f.y + 5;
    T_.clear(x - 1, y - 1, 3, 3);
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) T_.act('hoe', x + dx, y + dy, 'down');
    G.inv.add('sprinkler', 1); G.inv.add('scarecrow', 1); G.inv.add('acorn', 1); G.inv.add('fertilizer', 2);
    T_.act('sprinkler', x, y);
    const placed = !!G.world.objectAt('farm', x, y);
    T_.act('fertilizer', x + 1, y);
    T_.clear(x + 3, y, 1, 1); T_.act('scarecrow', x + 3, y);
    T_.clear(x + 3, y + 3, 1, 1); T_.act('acorn', x + 3, y + 3);
    T_.night();
    const watered = G.farming.soilAt('farm', x + 1, y);
    return { placed, watered: watered && watered.watered, fert: watered && watered.fertilized, scare: (G.world.objectAt('farm', x + 3, y) || {}).type, sap: (G.world.objectAt('farm', x + 3, y + 3) || {}).type, weather: G.farming.weather() };
  });
  log('items', JSON.stringify(items));
  // house
  await h.eval(() => { G.ui.close(); G.world.go('house', 'door', true); }); await h.wait(300); await h.shot('12_house');
  await h.eval(() => { T_.interact(3, 1, 'up'); }); await h.wait(200); await h.shot('13_bookshelf');
  await h.eval(() => { G.ui.close(); T_.interact(1, 3, 'left'); }); await h.wait(200);
  const bedOpen = await h.eval(() => !!G.ui.modal && G.ui.modal.opts.title);
  log('bed dialog:', bedOpen); await h.shot('14_bed');
  await h.eval(() => { const b = G.ui.modal && G.ui.modal.body.querySelector('.choices button'); b && b.click(); });
  await h.wait(1300);
  const after = await h.eval(() => ({ map: G.player.map, date: G.dateStr(), awake: G.state.awake, tile: G.player.tile() }));
  log('after sleep', JSON.stringify(after));
  await h.eval(() => G.ui.close());
  // walk out the door
  await h.eval(() => { G.player.x = 6.5 * 48; G.player.y = 7.8 * 48; }); await h.walk('down', 600); await h.wait(500);
  log('after door', await h.eval(() => G.player.map + ' ' + JSON.stringify(G.player.tile())));
  await h.walk('up', 500); await h.wait(500);
  log('re-enter', await h.eval(() => G.player.map));
  await h.eval(() => G.world.go('farm', 'house_door', true));
  // rain
  await h.eval(() => { G.state.mod.farm.weather = 'rain'; T_.at(16, 16); }); await h.wait(200); await h.shot('15_rain');
  // season change: plant spring carrots, jump to Summer
  const season = await h.eval(() => {
    const f = G.maps.farm.meta.field; const x = f.x + 6, y = f.y + 1; T_.clear(x, y, 1, 1);
    T_.act('hoe', x, y); G.inv.add('seeds_carrot', 1); T_.act('seeds_carrot', x, y);
    G.state.day = 28; T_.night();
    return { season: G.dateStr(), crop: G.farming.soilAt('farm', x, y) };
  });
  log('season change', JSON.stringify(season));
  await h.eval(() => { G.ui.close(); G.state.mod.farm.weather = 'sun'; const f = G.maps.farm.meta.field; T_.at(f.x + 5, f.y + 2); }); await h.wait(200); await h.shot('16_summer');
  await h.eval(() => { G.state.season = 2; G.state.time = 600; }); await h.wait(200); await h.shot('17_fall_evening');
  await h.eval(() => { G.state.season = 3; G.state.mod.farm.weather = 'snow'; G.state.time = 300; T_.at(27, 8); }); await h.wait(200); await h.shot('18_winter');
  // greenhouse
  const gh = await h.eval(() => {
    G.state.season = 3; G.world.go('greenhouse', 'door', true);
    T_.act('hoe', 4, 4, 'down'); G.inv.add('seeds_pumpkin', 1); T_.act('seeds_pumpkin', 4, 4);
    const ok = !!(G.farming.soilAt('greenhouse', 4, 4) || {}).crop;
    for (let i = 0; i < 13; i++) { G.farming.waterAll('greenhouse'); T_.night(); }
    const ready = (G.farming.soilAt('greenhouse', 4, 4) || {}).crop;
    const hr = G.farming.harvestReady();
    return { ok, ready, hr };
  });
  log('greenhouse', JSON.stringify(gh));
  await h.wait(200); await h.shot('19_greenhouse');
  await h.eval(() => { G.ui.close(); G.state.time = 100; G.state.season = 0; G.state.mod.farm.weather = 'sun'; G.world.go('farm', 'east', true); }); await h.wait(300); await h.shot('20_east_spawn');
  await h.eval(() => { T_.at(14, 10); G.cam.zoom = 0.45; }); await h.wait(200); await h.shot('21_zoomed_west');
  await h.eval(() => { T_.at(40, 26); }); await h.wait(200); await h.shot('22_zoomed_east');
  await h.eval(() => { G.cam.zoom = 1; });
};
