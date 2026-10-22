/* =====================================================================
   HOLLOW CREEK FARM — ECONOMY & PROGRESSION  (economy agent)
   Map `town`, merchants, farm shop stall + customers, crafting & machines,
   buildings + placement mode, tool upgrades, workers.
   State: G.state.mod.econ  ·  API: G.economy
   ===================================================================== */
(() => {
  'use strict';
  const T = 48;
  const E = () => G.state.mod.econ;
  const absDay = () => (G.state.year - 1) * 112 + G.state.season * 28 + G.state.day;
  const has = id => !!G.items[id];
  const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
  const esc = s => G.ui.esc(s);
  const farmObjs = () => (G.state.maps.farm && G.state.maps.farm.objects) || [];
  const findObj = (type, mapId = 'farm') => { const d = G.state.maps[mapId]; return d && d.objects ? d.objects.find(o => o.type === type) : null; };
  const nm = id => G.item(id).name;
  /** first available art sprite / pack asset among names, else placeholder */
  const spr = (names, w = 48, h = 48) => { for (const n of [].concat(names)) { if (G.art.sprites[n]) return G.art.sprites[n]; if (G.assets[n]) return G.assets[n]; } return G.placeholder([].concat(names)[0], w, h); };
  const hasArt = n => !!(G.art.sprites[n] || G.assets[n]);
  const fmtH = h => { h = h % 24; return (h % 12 === 0 ? 12 : h % 12) + (h < 12 ? 'am' : 'pm'); };

  /* ================================================================
     STATE
     ================================================================ */
  const defaults = () => ({
    v: 1,
    upgrading: null,                        // {tool, tier, readyDay}
    shop: { display: new Array(9).fill(null), markup: 1, level: 0, log: [], today: { n: 0, gold: 0 }, sendHarvest: false, nextCust: null },
    crate: new Array(36).fill(null),        // shop stock crate
    workerCrate: new Array(36).fill(null),  // worker output / fisher bait
    overflow: [],                           // worker output that didn't fit
    workers: [],
    candidates: null, candWeek: -1,
    built: { cabin: 0, shed: 0, greenhouse: 0, silo: 0 },
  });
  function ensureState() {
    const st = G.state.mod;
    if (!st.econ) st.econ = defaults();
    const e = st.econ, d = defaults();
    for (const k in d) if (e[k] === undefined) e[k] = d[k];
    for (const k in d.shop) if (e.shop[k] === undefined) e.shop[k] = d.shop[k];
    for (const k in d.built) if (e.built[k] === undefined) e.built[k] = d.built[k];
    while (e.shop.display.length < 9) e.shop.display.push(null);
    return e;
  }

  /* ================================================================
     LOOKS / PEOPLE (shared by villagers, customers, workers)
     ================================================================ */
  const SKINS = ['#f5d0b0', '#e8b48f', '#c98e62', '#9a6440', '#6e4528'];
  const HAIRC = ['#2b1b10', '#5a3a1e', '#a0632b', '#d9b25a', '#c0c0c0', '#8a2f1f', '#1f2f5a'];
  const SHIRTS = ['#c0392b', '#2e86c1', '#27ae60', '#8e44ad', '#d35400', '#f1c40f', '#16a085', '#e67e9f', '#7f8c8d'];
  const PANTS = ['#3b3b58', '#5b3a1e', '#2c3e50', '#4a6741', '#6d4c41'];
  const randLook = () => ({ skin: G.pick(SKINS), hair: G.pick(['short', 'long', 'bun']), hairColor: G.pick(HAIRC), shirt: G.pick(SHIRTS), pants: G.pick(PANTS), hat: G.chance(0.2) ? G.pick(['straw', 'cap']) : null });

  function drawBubble(ctx, text, sx, sy) {
    ctx.font = '13px "Pixelify Sans", monospace';
    const w = Math.ceil(ctx.measureText(text).width) + 14, h = 20, x = Math.round(sx - w / 2), y = sy - 86;
    ctx.fillStyle = '#fffaf0'; ctx.strokeStyle = '#3b2412'; ctx.lineWidth = 2;
    ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(x, y, w, h, 5); else ctx.rect(x, y, w, h); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(sx - 5, y + h - 1); ctx.lineTo(sx, y + h + 6); ctx.lineTo(sx + 5, y + h - 1); ctx.fill();
    ctx.beginPath(); ctx.moveTo(sx - 5, y + h); ctx.lineTo(sx, y + h + 6); ctx.lineTo(sx + 5, y + h); ctx.stroke();
    ctx.fillStyle = '#3b2412'; ctx.textAlign = 'center'; ctx.fillText(text, sx, y + 14);
  }
  function drawPersonFallback(ctx, look, dir, moving, animT, sx, sy) {
    const bob = moving ? Math.round(Math.sin(animT * 12)) : 0;
    ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.beginPath(); ctx.ellipse(sx, sy - 2, 12, 5, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = look.pants; ctx.fillRect(sx - 8, sy - 16, 7, 14 + (moving ? bob : 0)); ctx.fillRect(sx + 1, sy - 16, 7, 14 - (moving ? bob : 0));
    ctx.fillStyle = look.shirt; ctx.fillRect(sx - 10, sy - 32 + bob, 20, 18);
    ctx.fillStyle = look.skin; ctx.fillRect(sx - 8, sy - 46 + bob, 16, 14);
    ctx.fillStyle = look.hairColor; ctx.fillRect(sx - 9, sy - 49 + bob, 18, 6); if (dir !== 'down') ctx.fillRect(sx - 9, sy - 45 + bob, 18, dir === 'up' ? 12 : 4);
    if (dir === 'down') { ctx.fillStyle = '#222'; ctx.fillRect(sx - 4, sy - 40 + bob, 2, 2); ctx.fillRect(sx + 2, sy - 40 + bob, 2, 2); }
  }
  function drawPerson(ctx, e, sx, sy) {
    let ok = false;
    if (G.art.drawNPC) { try { G.art.drawNPC(ctx, e.look, e.dir, e.moving, e.animT, sx, sy); ok = true; } catch (err) { } }
    if (!ok) drawPersonFallback(ctx, e.look, e.dir, e.moving, e.animT, sx, sy);
    if (e.say) drawBubble(ctx, e.say.text, sx, sy);
  }
  function say(e, text, t = 2.6) { e.say = { text, t }; }
  /** wander around e.home within e.radius tiles, colliding with the world */
  function stepWander(e, dt, mapId) {
    if (e.say) { e.say.t -= dt; if (e.say.t <= 0) e.say = null; }
    if (e.static || e.radius === 0) { e.moving = false; return; }
    if (e.wait > 0) { e.wait -= dt; e.moving = false; return; }
    if (e.tx == null) {
      for (let k = 0; k < 10; k++) {
        const r = e.radius; const tx = e.home.x + G.randInt(-r, r), ty = e.home.y + G.randInt(-r, r);
        if (e.rect && (tx < e.rect.x || ty < e.rect.y || tx >= e.rect.x + e.rect.w || ty >= e.rect.y + e.rect.h)) continue;
        if (!G.world.isSolid(mapId, tx, ty)) { e.tx = (tx + 0.5) * T; e.ty = (ty + 0.8) * T; break; }
      }
      if (e.tx == null) { e.wait = 1; return; }
    }
    const dx = e.tx - e.x, dy = e.ty - e.y, sp = (e.speed || 55) * dt;
    let nx = e.x, ny = e.y;
    if (Math.abs(dx) > 2) { nx += Math.sign(dx) * Math.min(sp, Math.abs(dx)); e.dir = dx < 0 ? 'left' : 'right'; }
    else if (Math.abs(dy) > 2) { ny += Math.sign(dy) * Math.min(sp, Math.abs(dy)); e.dir = dy < 0 ? 'up' : 'down'; }
    else { e.tx = null; e.wait = G.rand(1.5, 5); e.moving = false; return; }
    if (G._boxFree(mapId, nx, ny)) { e.x = nx; e.y = ny; e.moving = true; e.animT += dt; e.stuck = 0; }
    else { e.moving = false; e.stuck = (e.stuck || 0) + dt; if (e.stuck > 0.4) { e.tx = null; e.wait = 0.6; } }
  }
  function freeTileNear(mapId, x, y, maxR = 6) {
    for (let r = 0; r <= maxR; r++) for (let j = -r; j <= r; j++) for (let i = -r; i <= r; i++) {
      if (Math.max(Math.abs(i), Math.abs(j)) !== r) continue;
      if (!G.world.isSolid(mapId, x + i, y + j)) return { x: x + i, y: y + j };
    }
    return { x, y };
  }

  /* ================================================================
     ITEMS (crafted goods, machines, artisan goods, furniture)
     ================================================================ */
  const FURN = [
    ['bookshelf', 'Bookshelf', 600], ['bookshelf2', 'Tall Bookshelf', 650], ['fireplace', 'Fireplace', 1200], ['fireplace_2', 'Stone Hearth', 1300],
    ['fireplace_3', 'Iron Stove', 1400], ['rocking_chair', 'Rocking Chair', 400], ['wooden_table', 'Wooden Table', 300], ['wooden_chair', 'Wooden Chair', 150],
    ['candle_table', 'Candle Table', 250], ['candle_table_2', 'Side Table', 250], ['plant_pot', 'Potted Plant', 120], ['birdhouse', 'Birdhouse', 200],
    ['hay_bale', 'Hay Bale', 80], ['farm_cart', 'Farm Cart', 900], ['farm_cart_2', 'Hand Cart', 700], ['well', 'Stone Well', 1500],
    ['wooden_storage_barrel', 'Barrel', 150], ['kitchen_counter', 'Kitchen Counter', 500], ['kitchen_counter_2', 'Kitchen Stove', 600], ['basket', 'Basket', 60],
    ['wooden_cabinet', 'Cabinet', 450], ['flower_patch', 'Flower Patch', 100], ['farm_bed', 'Bed', 800], ['wheat_bundle', 'Wheat Sheaf', 60],
    ['bucket', 'Bucket', 40], ['toolbox', 'Toolbox', 200],
    ['hay_bale_2', 'Round Hay Bale', 80], ['wooden_storage_crate', 'Crate', 120], ['wooden_sign', 'Wooden Sign', 100], ['mailbox', 'Mailbox', 150],
    ['well_2', 'Covered Well', 1500], ['well_3', 'Old Well', 1500], ['farm_cart', 'Farm Cart', 900], ['bucket_2', 'Fruit Bucket', 60], ['basket_2', 'Bread Basket', 60], ['basket_3', 'Wicker Basket', 60],
  ].filter((f, i, a) => a.findIndex(g => g[0] === f[0]) === i);
  // footprint / draw scale for big pieces (matches how the farm module lays out the house & yard)
  const FURN_SIZE = {
    well: { w: 2, h: 2, s: 2 }, well_2: { w: 2, h: 2, s: 2 }, well_3: { w: 2, h: 2, s: 2 },
    fireplace: { w: 2, h: 1, s: 2, dy: 8 }, fireplace_2: { w: 2, h: 1, s: 2, dy: 8 }, fireplace_3: { w: 2, h: 1, s: 2, dy: 8 },
    farm_bed: { w: 2, h: 2, s: 2 }, bookshelf2: { w: 2, h: 1, s: 2, dy: 6 },
    wooden_table: { w: 2, h: 1, s: 1.5 }, farm_cart: { w: 2, h: 1, s: 1.5 }, farm_cart_2: { w: 2, h: 1, s: 1.5 },
    kitchen_counter: { dy: 4 }, kitchen_counter_2: { dy: 4 }, wooden_cabinet: { dy: 4 },
    flower_patch: { walk: true }, basket: { walk: true }, basket_2: { walk: true }, basket_3: { walk: true },
  };
  // what talking to a piece does (besides picking it up)
  const FURN_KIND = { farm_bed: 'bed', bookshelf: 'calendar', bookshelf2: 'calendar', fireplace: 'fire', fireplace_2: 'fire', fireplace_3: 'fire',
    rocking_chair: 'chair', wooden_sign: 'sign', mailbox: 'mailbox', well: 'well', well_2: 'well', well_3: 'well' };
  const furnExtra = key => () => Object.assign({ key }, FURN_SIZE[key] || {}, FURN_KIND[key] ? { kind: FURN_KIND[key] } : {});
  const ARTISAN_BASE = { jam: 100, pickles: 90, wine: 150, juice: 100 };
  const FRUIT = new Set(['strawberry', 'tomato']);

  function defItems() {
    const def = (o) => { if (!G.items[o.id]) G.defItem(o); };
    def({ id: 'chest', name: 'Chest', price: 25, cat: 'craftable', stack: 99, desc: 'Place it to store 36 stacks of items. Pick up with axe/pickaxe.', place: 'chest', use: placeUse('chest', () => ({ items: new Array(36).fill(null) })) });
    def({ id: 'furnace', name: 'Furnace', price: 50, cat: 'craftable', stack: 99, desc: 'Smelts 5 ore + 1 coal into a bar (30 min each). Place it, then use ore on it.', place: 'furnace', use: placeUse('furnace', () => ({ queue: 0, left: 0, done: 0, bar: null })) });
    def({ id: 'preserves_jar', name: 'Preserves Jar', price: 100, cat: 'craftable', stack: 99, desc: 'Turns a crop into jam (fruit) or pickles (veg) worth ~2× + 50g. 2 days.', place: 'preserves_jar', use: placeUse('preserves_jar') });
    def({ id: 'keg', name: 'Keg', price: 150, cat: 'craftable', stack: 99, desc: 'Fruit → wine (3× value, 5 days). Veg/grain → juice (2.25×, 3 days).', place: 'keg', use: placeUse('keg') });
    def({ id: 'jam', name: 'Jam', price: ARTISAN_BASE.jam, cat: 'artisan', desc: 'Sweet homemade fruit jam.' });
    def({ id: 'pickles', name: 'Pickles', price: ARTISAN_BASE.pickles, cat: 'artisan', desc: 'Crunchy pickled vegetables.' });
    def({ id: 'wine', name: 'Wine', price: ARTISAN_BASE.wine, cat: 'artisan', desc: 'Aged fruit wine. Collectors adore it.' });
    def({ id: 'juice', name: 'Juice', price: ARTISAN_BASE.juice, cat: 'artisan', desc: 'Fresh pressed juice.' });
    def({ id: 'torch', name: 'Torch', price: 5, cat: 'craftable', desc: 'A warm light for dark nights.', place: 'torch', use: placeUse('torch') });
    def({ id: 'path_stone', name: 'Stone Path', price: 1, cat: 'craftable', desc: 'Lays cobblestone that joins up with neighbouring paths. Pick it back up with a pickaxe.', use: placePath });
    def({ id: 'fence', name: 'Wooden Fence', price: 2, cat: 'craftable', icon: G.art.icons.fence ? 'fence' : 'wooden_fence', desc: 'Keeps things tidy.', place: 'fence', use: placeUse('fence') });
    for (const [key, name, buy] of FURN) def({ id: 'furn_' + key, name, icon: key, price: Math.floor(buy / 2), cat: 'furniture', stack: 99, desc: 'Decoration. Place it on the farm or in your house. Talk to it (or hit it with an axe/pickaxe) to pick it up again.', place: 'furniture', use: placeUse('furniture', furnExtra(key)) });
  }

  /** item.use factory: place an object on the targeted tile */
  function placeUse(type, extra) {
    return ctx => {
      if (ctx.obj) return false;
      const m = G.maps[ctx.map];
      if (!m || m.persistent === false || ctx.map === 'town') { G.ui.toast("You can't place that here.", null, 'warn'); return true; }
      const ex = extra ? extra() : {}; const w = ex.w || 1, h = ex.h || 1;
      if (!G.world.canPlace(ctx.map, ctx.x, ctx.y, w, h)) { G.sfx('error'); if (w > 1 || h > 1) G.ui.toast(`Needs a clear ${w}×${h} space (it fills right and down from here).`, null, 'warn'); return true; }
      for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
        const soil = G.farming && G.farming.soilAt ? G.farming.soilAt(ctx.map, ctx.x + i, ctx.y + j) : null;
        if (soil && soil.crop && !soil.crop.dead) { G.sfx('error'); G.ui.toast('There is a crop growing there.', null, 'warn'); return true; }
      }
      const o = Object.assign({ type, x: ctx.x, y: ctx.y }, ex);
      G.world.addObject(ctx.map, o); G.inv.removeSlot(ctx.slotIndex, 1); G.sfx('dig');
      G.fx.burst((ctx.x + 0.5) * T, (ctx.y + 0.7) * T, '#c8a26b', 6, 3);
      if (type === 'torch') refreshLights(ctx.map);
      return true;
    };
  }

  /* ================================================================
     MACHINES & PLACEABLE OBJECTS
     ================================================================ */
  const ORE_BAR = { copper_ore: 'copper_bar', iron_ore: 'iron_bar', gold_ore: 'gold_bar', iridium_ore: 'iridium_bar' };
  function drawIconBubble(ctx, icon, cx, top) {
    const bob = Math.round(Math.sin(performance.now() / 250) * 2);
    ctx.fillStyle = '#fffaf0'; ctx.strokeStyle = '#3b2412'; ctx.lineWidth = 2;
    ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(cx - 15, top - 32 + bob, 30, 28, 6); else ctx.rect(cx - 15, top - 32 + bob, 30, 28); ctx.fill(); ctx.stroke();
    ctx.drawImage(G.icon(icon), cx - 12, top - 30 + bob, 24, 24);
  }
  const drawUp = (ctx, s, px, py, w = 1, h = 1) => ctx.drawImage(s, px + (w * T - s.width) / 2, py + h * T - s.height);
  function dropContents(mapId, o, items) {
    for (const s of items || []) if (s) G.world.dropItem(mapId, (o.x + 0.5) * T, (o.y + 0.8) * T, s.id, s.qty, s.q || 0);
  }
  /** pick up a placed object -> item (+contents) */
  function pickUp(o, mapId, itemId) {
    if (o.type === 'chest') dropContents(mapId, o, o.items);
    if (o.type === 'furnace') { if (o.done) G.inv.give(o.bar, o.done); const ore = Object.keys(ORE_BAR).find(k => ORE_BAR[k] === o.bar); if (o.queue && ore) { G.inv.give(ore, o.queue * 5); G.inv.give('coal', o.queue); } }
    if ((o.type === 'preserves_jar' || o.type === 'keg') && o.inp) { if (o.left > 0) G.inv.give(o.inp, 1, o.q || 0); else if (o.out) G.inv.give(o.out.id, o.out.qty); }
    G.world.removeObject(mapId, o); G.inv.give(itemId, 1); G.sfx('pickup');
    if (o.type === 'torch') refreshLights(mapId);
    return true;
  }
  const curMap = () => G.player.map;
  function heldSlot() { return G.inv.selected(); }

  function defMachines() {
    G.defObj('chest', {
      draw: (ctx, o, px, py) => drawUp(ctx, spr('chest'), px, py),
      interact: (o) => { o.items = o.items || new Array(36).fill(null); G.ui.openContainer('Chest', o.items); G.sfx('open'); return true; },
      onTool: (o, tool) => (tool === 'axe' || tool === 'pickaxe') ? pickUp(o, curMap(), 'chest') : false,
      label: () => 'Chest',
    });
    G.defObj('furnace', {
      draw(ctx, o, px, py) {
        drawUp(ctx, o.queue > 0 ? spr(['furnace_on', 'furnace']) : spr('furnace'), px, py);
        if (o.queue > 0 && !hasArt('furnace_on')) { ctx.fillStyle = `rgba(255,${120 + Math.random() * 60 | 0},20,.8)`; ctx.fillRect(px + 18, py + 28, 12, 8); }
        if (o.done > 0) drawIconBubble(ctx, G.item(o.bar).icon, px + 24, py);
      },
      interact(o) {
        if (o.done > 0) { G.inv.give(o.bar, o.done); G.sfx('pickup'); G.addXP('mining', 2 * o.done); o.done = 0; return true; }
        const s = heldSlot();
        if (s && ORE_BAR[s.id]) return loadFurnace(o, s.id);
        if (o.queue > 0) G.ui.toast(`Smelting ${o.queue} ${nm(o.bar)}${o.queue > 1 ? 's' : ''}… next in ${Math.max(10, o.left)} min.`, 'furnace');
        else G.ui.toast('Use ore on the furnace: 5 ore + 1 coal → 1 bar.', 'furnace');
        return true;
      },
      onItem: (o, slot) => ORE_BAR[slot.id] ? loadFurnace(o, slot.id) : (slot.id === 'coal' ? (G.ui.toast('Hold the ore and use it on the furnace (coal is used automatically).', 'coal'), true) : false),
      onTool: (o, tool) => (tool === 'axe' || tool === 'pickaxe') ? pickUp(o, curMap(), 'furnace') : false,
    });
    for (const type of ['preserves_jar', 'keg']) G.defObj(type, {
      draw(ctx, o, px, py) {
        const ready = o.out && o.left <= 0;
        drawUp(ctx, ready ? spr([type + '_ready', type]) : spr(type), px, py);
        if (ready) drawIconBubble(ctx, G.item(o.out.id).icon, px + 24, py);
        else if (o.out && performance.now() % 1600 < 800) { ctx.fillStyle = '#fff8'; ctx.fillRect(px + 20, py - 6, 3, 3); ctx.fillRect(px + 27, py - 10, 3, 3); }
      },
      interact(o) {
        if (o.out && o.left <= 0) { G.inv.give(o.out.id, o.out.qty); G.sfx('pickup'); G.addXP('farming', 3); o.out = null; o.inp = null; return true; }
        const s = heldSlot();
        if (s && !o.out && G.item(s.id).cat === 'crop') return loadArtisan(o, type, s, G.state.hotbar);
        if (o.out) G.ui.toast(`${nm(o.out.id)} ×${o.out.qty} ready in ${fmtDur(o.left)}.`, G.item(o.out.id).icon);
        else G.ui.toast(type === 'keg' ? 'Use a fruit (wine) or vegetable (juice) on the keg.' : 'Use a fruit (jam) or vegetable (pickles) on the jar.', type);
        return true;
      },
      onItem: (o, slot, ctx) => (!o.out && G.item(slot.id).cat === 'crop') ? loadArtisan(o, type, slot, ctx.slotIndex) : false,
      onTool: (o, tool) => (tool === 'axe' || tool === 'pickaxe') ? pickUp(o, curMap(), type) : false,
    });
    G.defObj('torch', {
      draw(ctx, o, px, py) {
        drawUp(ctx, spr('torch'), px, py);
        if (!hasArt('torch')) { ctx.fillStyle = '#6b4423'; ctx.fillRect(px + 21, py + 18, 6, 26); ctx.fillStyle = ['#ffcf3f', '#ff9a2a'][(performance.now() / 150 | 0) % 2]; ctx.fillRect(px + 18, py + 8, 12, 12); }
      },
      onTool: (o, tool) => ['axe', 'pickaxe', 'scythe', 'hoe'].includes(tool) ? pickUp(o, curMap(), 'torch') : false,
    });
    G.defObj('path_stone', {
      solid: false, sortY: -9999,
      draw(ctx, o, px, py) {
        if (hasArt('path_stone')) { ctx.drawImage(spr('path_stone'), px, py); return; }
        ctx.fillStyle = '#9d978c'; ctx.fillRect(px + 4, py + 6, 18, 14); ctx.fillRect(px + 26, py + 10, 18, 15); ctx.fillRect(px + 8, py + 26, 20, 16); ctx.fillRect(px + 31, py + 30, 13, 12);
        ctx.fillStyle = '#7d776c'; ctx.fillRect(px + 4, py + 18, 18, 2); ctx.fillRect(px + 26, py + 23, 18, 2); ctx.fillRect(px + 8, py + 40, 20, 2);
      },
      onTool: (o, tool) => (tool === 'pickaxe' || tool === 'axe') ? pickUp(o, curMap(), 'path_stone') : false,
    });
    G.defObj('fence', {
      draw: (ctx, o, px, py) => drawUp(ctx, spr(['fence', 'wooden_fence']), px, py),
      onTool: (o, tool) => (tool === 'axe' || tool === 'pickaxe') ? pickUp(o, curMap(), 'fence') : false,
    });
    G.defObj('furniture', {
      solid: o => !o.walk,
      draw(ctx, o, px, py) {
        const sp = spr(o.key);
        if (o.s) { const w = sp.width * o.s, h = sp.height * o.s, fw = o.w || 1, fh = o.h || 1; ctx.drawImage(sp, Math.round(px + fw * T / 2 - w / 2), Math.round(py + fh * T - h + (o.dy || 0)), w, h); }
        else if (o.dy) ctx.drawImage(sp, px + (T - sp.width) / 2, py + T - sp.height + o.dy);
        else drawUp(ctx, sp, px, py);
      },
      interact(o, mapId) {
        const name = nm('furn_' + o.key);
        if (o.kind === 'bed') { G.ui.sleepMenu(); return true; }
        const pick = { label: `Pick up the ${name}`, fn: () => pickUp(o, mapId, 'furn_' + o.key) };
        const act = {
          calendar: { label: 'Read the crop calendar', fn: () => G.farming && G.farming.cropCalendar ? G.farming.cropCalendar() : G.ui.toast('Nothing to read yet.') },
          fire: { label: 'Warm your hands', fn: () => G.ui.toast('The fire crackles warmly.', 'fireplace') },
          chair: { label: 'Sit for a moment', fn: () => G.ui.toast(G.pick(['You rock gently for a moment. Ahh.', 'A good spot to plan tomorrow.']), 'rocking_chair') },
          sign: { label: 'Read the sign', fn: () => G.ui.dialog('Sign', `<b>${esc(G.state.farmName || 'Hollow Creek')} Farm</b><br>Owner: ${esc(G.state.name)}`) },
          mailbox: { label: 'Check the mail', fn: () => G.ui.dialog('Mailbox', G.pick(['No mail today. Just a curious snail.', 'Empty. Someone has left a pressed flower inside, though.', 'Nothing but a seed catalogue. Check the bookshelf at home for a crop calendar!'])) },
          well: { label: 'Look into the well', fn: () => { G.ui.toast('The water is cool and clear. (Your watering can never runs dry.)', 'watering_can'); G.sfx('water'); } },
        }[o.kind];
        G.ui.dialog(name, act ? 'What would you like to do?' : `Pick up the ${name}? You can place it somewhere else or sell it.`, act ? [act, pick, { label: 'Leave it' }] : [pick, { label: 'Leave it' }], G.item('furn_' + o.key).icon);
        return true;
      },
      onTool: (o, tool) => (tool === 'axe' || tool === 'pickaxe') ? pickUp(o, curMap(), 'furn_' + o.key) : false,
      label: o => nm('furn_' + o.key),
    });
  }
  const fmtDur = m => m >= 1440 ? `${Math.ceil(m / 1440)} day${m > 1440 ? 's' : ''}` : m >= 60 ? `${Math.ceil(m / 60)}h` : `${Math.max(10, m)} min`;
  function loadFurnace(o, ore) {
    const bar = ORE_BAR[ore];
    if (o.queue > 0 && o.bar !== bar) { G.ui.toast(`The furnace is busy smelting ${nm(o.bar)}s.`, null, 'warn'); return true; }
    if (o.done > 0 && o.bar !== bar) { G.inv.give(o.bar, o.done); o.done = 0; }
    const room = 10 - o.queue;
    const n = Math.min(Math.floor(G.inv.count(ore) / 5), G.inv.count('coal'), room);
    if (n <= 0) { G.sfx('error'); G.ui.toast(room <= 0 ? 'The furnace is full (10 bars queued).' : `Needs 5 ${nm(ore)} + 1 Coal per bar.`, null, 'warn'); return true; }
    G.inv.remove(ore, n * 5); G.inv.remove('coal', n);
    o.bar = bar; if (!o.queue) o.left = 30; o.queue += n;
    G.sfx('craft'); G.ui.toast(`Smelting ${n} ${nm(bar)}${n > 1 ? 's' : ''} (30 min each).`, G.item(bar).icon);
    G.fx.burst((o.x + 0.5) * T, o.y * T + 20, '#ff9a2a', 8, 3);
    return true;
  }
  function artisanFor(type, cropId) {
    const p = Math.max(1, G.item(cropId).price);
    const cdef = G.farming && G.farming.crops && G.farming.crops[cropId];
    const fruit = FRUIT.has(cropId) || !!(cdef && cdef.fruit);
    if (type === 'preserves_jar') return { out: fruit ? 'jam' : 'pickles', value: 2 * p + 50, mins: 2 * 1440 };
    return fruit ? { out: 'wine', value: 3 * p, mins: 5 * 1440 } : { out: 'juice', value: Math.round(2.25 * p), mins: 3 * 1440 };
  }
  function loadArtisan(o, type, slot, slotIndex) {
    const a = artisanFor(type, slot.id), base = G.item(a.out).price || 100;
    const exact = a.value / base; let qty = Math.floor(exact) + (Math.random() < exact % 1 ? 1 : 0); qty = Math.max(1, qty);
    o.inp = slot.id; o.q = slot.q || 0; o.out = { id: a.out, qty }; o.left = a.mins;
    G.inv.removeSlot(slotIndex, 1); G.sfx('craft');
    G.ui.toast(`${nm(slot.id)} → ${qty} ${nm(a.out)} in ${fmtDur(a.mins)}.`, G.item(a.out).icon);
    return true;
  }
  function tickMachines() {
    for (const id in G.state.maps) {
      const d = G.state.maps[id]; if (!d || !d.objects) continue;
      for (const o of d.objects) {
        if (o.type === 'furnace' && o.queue > 0) { o.left -= 10; if (o.left <= 0) { o.queue--; o.done++; o.left = o.queue > 0 ? 30 : 0; } }
        else if ((o.type === 'preserves_jar' || o.type === 'keg') && o.out && o.left > 0) o.left -= 10;
      }
    }
  }
  function machineReport() {
    let ready = 0;
    for (const id in G.state.maps) { const d = G.state.maps[id]; if (d && d.objects) for (const o of d.objects) if ((o.type === 'preserves_jar' || o.type === 'keg') && o.out && o.left <= 0 && !o.reported) { ready++; o.reported = 1; } }
    if (ready) G.report(`${ready} artisan machine${ready > 1 ? 's have' : ' has'} finished — collect your goods!`, 'keg');
  }
  function refreshLights(mapId) {
    const m = G.maps[mapId]; if (!m) return;
    if (!m._econBaseLights) m._econBaseLights = (m.lights || []).slice();
    const d = G.state.maps[mapId];
    const extra = d && d.objects ? d.objects.filter(o => o.type === 'torch').map(o => ({ x: o.x + 0.5, y: o.y + 0.3, r: 2.2 })) : [];
    m.lights = m._econBaseLights.concat(extra);
  }

  /* ================================================================
     CRAFTING
     ================================================================ */
  const RECIPES = [
    { id: 'chest', out: 'chest', qty: 1, cost: [['wood', 50]], start: true },
    { id: 'bait', out: 'bait', qty: 5, cost: [['fiber', 3], ['sap', 1]], start: true, name: 'Bait ×5' },
    { id: 'bait_worm', out: 'bait', qty: 8, cost: [['worm', 1], ['fiber', 2]], start: true, name: 'Bait ×8 (worm)' },
    { id: 'furnace', out: 'furnace', qty: 1, cost: [['copper_ore', 20], ['stone', 25]], start: true },
    { id: 'torch', out: 'torch', qty: 2, cost: [['wood', 2], ['sap', 1]], start: true },
    { id: 'path_stone', out: 'path_stone', qty: 4, cost: [['stone', 4]], start: true },
    { id: 'fence', out: 'fence', qty: 4, cost: [['wood', 4]], start: true },
    { id: 'scarecrow', out: 'scarecrow', qty: 1, cost: [['wood', 50], ['coal', 1], ['fiber', 20]], start: true },
    { id: 'fertilizer', out: 'fertilizer', qty: 2, cost: [['sap', 2], ['fiber', 2]], unlock: ['farming', 1] },
    { id: 'sprinkler', out: 'sprinkler', qty: 1, cost: [['copper_bar', 1], ['iron_bar', 1]], unlock: ['farming', 2], buy: 2000 },
    { id: 'speed_gro', out: 'speed_gro', qty: 2, cost: [['fiber', 5], ['coal', 1]], unlock: ['farming', 3], buy: 800 },
    { id: 'preserves_jar', out: 'preserves_jar', qty: 1, cost: [['wood', 50], ['stone', 40], ['coal', 8]], unlock: ['farming', 4], buy: 1500 },
    { id: 'quality_sprinkler', out: 'quality_sprinkler', qty: 1, cost: [['iron_bar', 1], ['gold_bar', 1], ['quartz', 1]], unlock: ['farming', 6], buy: 8000 },
    { id: 'keg', out: 'keg', qty: 1, cost: [['wood', 30], ['copper_bar', 1], ['iron_bar', 1]], unlock: ['farming', 8], buy: 5000 },
    { id: 'iridium_sprinkler', out: 'iridium_sprinkler', qty: 1, cost: [['gold_bar', 1], ['iridium_bar', 1], ['emerald', 1]], unlock: ['farming', 9] },
    { id: 'deluxe_bait', out: 'deluxe_bait', qty: 5, cost: [['bait', 5], ['coal', 1]], unlock: ['fishing', 3], buy: 750, name: 'Deluxe Bait ×5' },
  ];
  const recipe = id => RECIPES.find(r => r.id === id);
  const known = id => G.state.recipes.includes(id);
  function addRecipe(id, silent) {
    if (known(id)) return false;
    G.state.recipes.push(id);
    const r = recipe(id);
    if (!silent && r) G.ui.toast(`New recipe: ${r.name || nm(r.out)}!`, G.item(r.out).icon, 'level');
    return true;
  }
  function checkUnlocks(silent) {
    for (const r of RECIPES) if (r.start || (r.unlock && G.skillLvl(r.unlock[0]) >= r.unlock[1])) addRecipe(r.id, silent);
  }
  function craft(r, times = 1) {
    let made = 0;
    for (let i = 0; i < times; i++) { if (!G.inv.canAfford(r.cost)) break; G.inv.pay(r.cost); G.inv.give(r.out, r.qty); made++; }
    if (!made) { G.sfx('error'); G.ui.toast('Missing ingredients.', null, 'warn'); return; }
    G.sfx('craft'); G.state.stats.itemsCrafted += made; G.addXP('crafting', 5 * made);
  }
  function renderCrafting(body, refresh) {
    const wrap = document.createElement('div');
    wrap.innerHTML = `<p class="econ-hint">Crafting turns raw materials into tools of progress. New recipes unlock with skill levels — or buy them from Mabel.</p>`;
    const list = document.createElement('div'); list.className = 'econ-craft-list';
    const sorted = RECIPES.slice().sort((a, b) => (known(b.id) - known(a.id)));
    for (const r of sorted) {
      const avail = has(r.out), k = known(r.id) && avail, can = k && G.inv.canAfford(r.cost);
      const row = document.createElement('div'); row.className = 'econ-craft' + (k ? '' : ' locked') + (can ? ' can' : '');
      const it = G.item(r.out);
      let lock = '';
      if (!avail) lock = 'Not available yet';
      else if (!k) lock = r.unlock ? `Unlocks at ${cap(r.unlock[0])} Lv ${r.unlock[1]}${r.buy ? ` — or buy at Mabel's (${G.fmtMoney(r.buy)})` : ''}` : 'Locked';
      const ings = r.cost.map(([id, n]) => { const c = G.inv.count(id); return `<span class="econ-ing ${c >= n ? 'ok' : 'no'}" data-tip="${esc(nm(id))}"><img src="${G.iconURL(G.item(id).icon)}">${k ? Math.min(c, 999) + '/' : ''}${n}</span>`; }).join('');
      row.innerHTML = `<img class="ic" src="${G.iconURL(it.icon)}"><div class="nm"><b>${esc(r.name || it.name)}${r.qty > 1 && !r.name ? ' ×' + r.qty : ''}</b><small>${lock ? '🔒 ' + esc(lock) : esc(it.desc || '')}</small><div>${ings}</div></div>`;
      if (k) {
        const b1 = document.createElement('button'); b1.textContent = 'Craft'; b1.disabled = !can; b1.onclick = () => { craft(r, 1); refresh(); };
        const b5 = document.createElement('button'); b5.textContent = '×5'; b5.disabled = !can; b5.onclick = () => { craft(r, 5); refresh(); };
        const bx = document.createElement('div'); bx.className = 'btns'; bx.append(b1, b5); row.appendChild(bx);
      }
      list.appendChild(row);
    }
    wrap.appendChild(list); body.appendChild(wrap);
  }
  function openCrafting() {
    G.ui.panel({ title: 'Crafting', width: 680, cls: 'craft', render: (b, p) => renderCrafting(b, () => p.refresh()) });
  }

  /* ================================================================
     FARM SHOP (stall, crate, customers)
     ================================================================ */
  const MARKUPS = [0.8, 1, 1.25, 1.5, 2];
  const DEMAND = { crop: 1, artisan: 1, fish: 0.85, mineral: 0.75, food: 0.8, seed: 0.7, bait: 0.6, material: 0.5, craftable: 0.6, furniture: 0.45, misc: 0.4 };
  const shelfCount = () => 3 + 3 * E().shop.level;
  const buyChance = mk => G.clamp(1.6 - mk * 0.7, 0.05, 0.95);
  function demandOf(id) {
    const cat = G.item(id).cat; let d = DEMAND[cat] != null ? DEMAND[cat] : 0.5;
    if (cat === 'fish' && G.weekday() === 'Fri') d = 1.25;
    return d;
  }
  const unitPrice = (id, q) => Math.max(1, Math.floor(G.priceOf(id, q) * E().shop.markup));
  function stall() { return findObj('shop_stall'); }
  function playerNearStall() {
    const s = stall(); if (!s || G.player.map !== 'farm') return false;
    const t = G.player.tile(); const cx = s.x + 1, cy = s.y + 1;
    return Math.abs(t.x - cx) <= 7 && Math.abs(t.y - cy) <= 6;
  }
  function workingWorker(type) { return E().workers.find(w => w.type === type && w.working) || null; }
  function shopStatus() {
    const t = G.state.time;
    if (t < 120 || t >= 840) return { open: false, why: 'Closed for the night — shop hours are 8am–8pm.' };
    const k = workingWorker('shopkeeper');
    if (k && t >= 180 && t < 720) return { open: true, why: `Open — ${k.name} is minding the shop (9am–6pm).`, keeper: true };
    if (playerNearStall()) return { open: true, why: 'Open — you are tending the stall.' };
    return { open: false, why: k ? `Closed — ${k.name} works 9am–6pm; otherwise stay near the stall.` : 'Closed — stay near the stall to sell (or hire a shopkeeper at the Inn).' };
  }
  function custInterval() {
    const e = E(); const base = G.rand(20, 60);
    let mult = 1 + 0.35 * e.shop.level + (e.built.silo ? 0.1 : 0);
    if (['Sat', 'Sun'].includes(G.weekday())) mult *= 1.3;
    const variety = new Set(e.shop.display.slice(0, shelfCount()).filter(Boolean).map(s => s.id)).size;
    mult *= 1 + 0.08 * Math.max(0, variety - 1);
    return Math.max(10, base / mult);
  }
  const LINES_YES = {
    crop: ['Ooh, fresh {n}!', 'These {n} look perfect!', 'Straight from the field!', "I'll take some {n}."],
    fish: ['Caught this morning? Lovely.', 'Fish for supper tonight!', 'What a fine {n}!'],
    mineral: ['A {n} for my collection!', 'Ooh, sparkly!', 'Collectors pay well for these.'],
    artisan: ['Homemade {n}? Yes please!', 'My grandma made {n} like this!'],
    other: ['Just what I needed.', 'Handy! Thanks!', 'Good find.'],
  };
  const LINES_NO = ['Hmm... a bit pricey.', 'Maybe next time.', 'Too rich for me.', 'Just browsing!'];
  /** one customer purchase attempt. returns {ok, text, gold} */
  function sellOnce(visual) {
    const e = E(), sh = e.shop, n = shelfCount();
    const opts = []; for (let i = 0; i < n; i++) { const s = sh.display[i]; if (s && s.qty > 0) opts.push({ i, s, w: demandOf(s.id) }); }
    if (!opts.length) return { ok: false, text: 'Empty shelves today?' };
    const pick = G.weighted(opts), s = pick.s, it = G.item(s.id);
    const chance = buyChance(sh.markup) * Math.min(1.1, pick.w + 0.15);
    if (Math.random() > chance) return { ok: false, text: G.pick(LINES_NO) };
    const maxQ = (it.cat === 'artisan' || it.cat === 'mineral' || it.price >= 250) ? 2 : 3;
    const qty = Math.min(s.qty, G.randInt(1, maxQ));
    const gold = unitPrice(s.id, s.q) * qty;
    s.qty -= qty; if (s.qty <= 0) sh.display[pick.i] = null;
    G.earn(gold, !visual);
    sh.today.n += qty; sh.today.gold += gold;
    sh.log.push({ t: G.state.time, id: s.id, q: s.q || 0, qty, gold }); if (sh.log.length > 40) sh.log.shift();
    G.state.stats.itemsSold += qty;
    G.emit('itemSold', s.id, qty, gold, 'shop');
    if (workingWorker('shopkeeper') && shopStatus().keeper) restock();
    refreshShopPanel();
    const lines = LINES_YES[it.cat] || LINES_YES.other;
    return { ok: true, text: G.pick(lines).replace('{n}', it.name), gold, id: s.id, qty };
  }
  function restock() {
    const e = E(), sh = e.shop, n = shelfCount(); let moved = 0;
    for (let i = 0; i < n; i++) {
      if (sh.display[i]) continue;
      const shown = new Set(sh.display.filter(Boolean).map(s => s.id));
      let ci = e.crate.findIndex(c => c && !shown.has(c.id) && G.item(c.id).cat !== 'tool');
      if (ci < 0) ci = e.crate.findIndex(c => c);
      if (ci < 0) break;
      sh.display[i] = e.crate[ci]; e.crate[ci] = null; moved++;
    }
    return moved;
  }
  function refreshShopPanel() { const m = G.ui.modal; if (m && m.opts.cls === 'econ-shop') m.refresh(); }
  function customerPath() {
    const s = stall(), m = G.maps.farm; if (!s || !m) return null;
    const meta = m.meta || {};
    if (meta.customerPath && meta.shopSpot && meta.shopSpot.x === s.x && meta.shopSpot.y === s.y) return meta.customerPath.map(p => ({ x: p.x, y: p.y }));
    const front = { x: s.x + 1, y: s.y + 2 };
    const ey = m.spawns && m.spawns.east ? m.spawns.east.y : front.y;
    return [{ x: m.w - 1, y: ey }, { x: front.x, y: ey }, front];
  }
  function spawnCustomer() {
    const path = customerPath(); if (!path) return false;
    const pts = path.map(p => ({ x: (p.x + 0.5) * T, y: (p.y + 0.8) * T }));
    const c = {
      kind: 'econ_customer', x: pts[0].x, y: pts[0].y, dir: 'left', moving: true, animT: 0, look: randLook(),
      pts, wp: 1, state: 'in', t: 0, speed: G.rand(110, 140),
      update(dt) {
        if (this.say) { this.say.t -= dt; if (this.say.t <= 0) this.say = null; }
        if (this.state === 'browse') {
          this.moving = false; this.dir = 'up'; this.t -= dt;
          if (this.t <= 0) {
            const r = sellOnce(true); say(this, r.text, 2.8);
            if (r.ok) { G.fx.float(`+${r.gold}g`, this.x, this.y - 70, '#ffd84a'); G.sfx('coin'); }
            this.state = 'linger'; this.t = 1.2;
          }
          return;
        }
        if (this.state === 'linger') { this.t -= dt; if (this.t <= 0) { this.state = 'out'; this.wp = this.pts.length - 2; } return; }
        const tgt = this.pts[this.wp]; if (!tgt) { G.world.removeEnt('farm', this); return; }
        const dx = tgt.x - this.x, dy = tgt.y - this.y, d = Math.hypot(dx, dy), sp = this.speed * dt;
        if (d <= sp) {
          this.x = tgt.x; this.y = tgt.y;
          if (this.state === 'in') { if (this.wp >= this.pts.length - 1) { this.state = 'browse'; this.t = G.rand(1, 2); } else this.wp++; }
          else { if (this.wp <= 0) { G.world.removeEnt('farm', this); return; } this.wp--; }
        } else {
          this.x += dx / d * sp; this.y += dy / d * sp; this.moving = true; this.animT += dt;
          this.dir = Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? 'left' : 'right') : (dy < 0 ? 'up' : 'down');
        }
      },
      draw(ctx, sx, sy) { drawPerson(ctx, this, sx, sy); },
    };
    G.world.addEnt('farm', c); return true;
  }
  function customerTick(t) {
    const sh = E().shop; const st = shopStatus();
    if (!st.open) { sh.nextCust = null; return; }
    if (sh.nextCust == null || sh.nextCust - t > 120) { sh.nextCust = t + custInterval(); return; }
    if (t < sh.nextCust) return;
    sh.nextCust = t + custInterval();
    const onFarm = G.player.map === 'farm' && stall() && !G._sleeping;
    const live = G.world.entsOf('farm').filter(e => e.kind === 'econ_customer').length;
    if (onFarm && live < 3) spawnCustomer();
    else sellOnce(false);
  }

  function openShopPanel(greet) {
    let sel = null;
    G.ui.panel({
      title: 'My Farm Shop', width: 760, cls: 'econ-shop',
      render: (b, panel) => {
        const e = E(), sh = e.shop, n = shelfCount(), st = shopStatus();
        const lvlName = ['Roadside Stall', 'Expanded Stall', 'Grand Farm Shop'][sh.level];
        b.innerHTML = `${greet ? `<p class="greet">${greet}</p>` : ''}
          <div class="econ-top"><span class="econ-status ${st.open ? 'open' : 'closed'}">${st.open ? 'OPEN' : 'CLOSED'}</span><span class="econ-why">${esc(st.why)}</span></div>
          <h4>${lvlName} — display shelves (${n}/9) · click an empty shelf, then an item below · click a shelf to take it back</h4>`;
        const shelves = document.createElement('div'); shelves.className = 'econ-shelves';
        for (let i = 0; i < 9; i++) {
          const s = sh.display[i], cell = document.createElement('div'); cell.className = 'econ-shelf';
          if (i >= n) { cell.innerHTML = `<div class="slot locked" data-tip="Unlock with a Shop Expansion from Wren the carpenter.">🔒</div><small>&nbsp;</small>`; shelves.appendChild(cell); continue; }
          cell.innerHTML = G.ui.slotHTML(s) + `<small>${s ? unitPrice(s.id, s.q) + 'g ea' : 'empty'}</small>`;
          const slotEl = cell.firstChild; if (sel === i) slotEl.classList.add('pick');
          slotEl.onclick = () => {
            if (s) { const left = G.inv.add(s.id, s.qty, s.q, true); if (left === s.qty) { G.ui.toast('Inventory full!', null, 'warn'); return; } if (left) s.qty = left; else sh.display[i] = null; G.sfx('pickup'); }
            else sel = (sel === i ? null : i);
            panel.refresh();
          };
          shelves.appendChild(cell);
        }
        b.appendChild(shelves);
        const pr = document.createElement('div'); pr.className = 'econ-prices';
        pr.innerHTML = `<b>Price:</b> ` + MARKUPS.map(m => `<button data-m="${m}" class="${m === sh.markup ? 'on' : ''}">${Math.round(m * 100)}%</button>`).join('') +
          `<span class="econ-why">of item value · customers buy ~${Math.round(buyChance(sh.markup) * 100)}% of the time · town merchants pay only 60%</span>`;
        pr.querySelectorAll('[data-m]').forEach(bt => bt.onclick = () => { sh.markup = +bt.dataset.m; panel.refresh(); });
        b.appendChild(pr);
        const h = document.createElement('h4'); h.textContent = 'Your inventory — click a stack to display it (right-click: just one)'; b.appendChild(h);
        const canShow = s => s && G.item(s.id).cat !== 'tool' && G.item(s.id).price > 0;
        b.appendChild(G.ui.invGrid((i, s, ev) => {
          if (!canShow(s)) return;
          const take = ev.right ? 1 : s.qty;
          let tgt = -1;
          if (sel != null && (!sh.display[sel] || (sh.display[sel].id === s.id && (sh.display[sel].q || 0) === (s.q || 0)))) tgt = sel;
          if (tgt < 0) tgt = sh.display.slice(0, n).findIndex(d => d && d.id === s.id && (d.q || 0) === (s.q || 0));
          if (tgt < 0) tgt = sh.display.slice(0, n).findIndex(d => !d);
          if (tgt < 0) { G.ui.toast('All shelves are full.', null, 'warn'); return; }
          if (sh.display[tgt]) sh.display[tgt].qty += take; else sh.display[tgt] = { id: s.id, qty: take, q: s.q || 0 };
          G.inv.removeSlot(i, take); sel = null; G.sfx('pickup'); panel.refresh();
        }, { filter: canShow }));
        const lg = document.createElement('div'); lg.className = 'econ-cols';
        const logH = sh.log.slice(-8).reverse().map(l => `<div><img src="${G.iconURL(G.item(l.id).icon)}"> ${G.timeStr(l.t)} · ${l.qty} ${esc(G.itemName(l.id, l.q))} · <b>${l.gold}g</b></div>`).join('') || '<div><i>No sales yet today.</i></div>';
        lg.innerHTML = `<div><h4>Today: ${sh.today.n} sold · ${G.fmtMoney(sh.today.gold)}</h4><div class="econ-log">${logH}</div></div><div class="econ-side"></div>`;
        const side = lg.querySelector('.econ-side');
        const cb = document.createElement('button'); cb.textContent = `Open stock crate (${e.crate.filter(Boolean).length}/36)`;
        cb.onclick = () => openCrate(); side.appendChild(cb);
        const tip = document.createElement('small'); tip.textContent = workingWorker('shopkeeper') ? 'Your shopkeeper refills empty shelves from the stock crate.' : 'Hire a shopkeeper at the Inn and they will refill empty shelves from the stock crate.'; side.appendChild(tip);
        if (e.workers.some(w => w.type === 'farmhand')) {
          const tg = document.createElement('button'); tg.textContent = `Farmhand harvest → ${sh.sendHarvest ? 'stock crate ✔' : 'worker crate'}`;
          tg.onclick = () => { sh.sendHarvest = !sh.sendHarvest; panel.refresh(); }; side.appendChild(tg);
        }
        b.appendChild(lg);
      },
    });
  }
  function openCrate() { G.ui.openContainer('Shop Stock Crate', E().crate, { label: 'Stock crate — your shopkeeper restocks empty shelves from here' }); }
  function openWorkerCrate() {
    const e = E();
    while (e.overflow.length) { const s = e.overflow[0]; if (deposit(e.workerCrate, s.id, s.qty, s.q) > 0) break; e.overflow.shift(); }
    G.ui.openContainer('Worker Crate', e.workerCrate, { label: 'Worker crate — your helpers drop their goods here. Put bait here for your fisher.' });
  }

  /* ================================================================
     FARM OBJECTS (stall, crates, buildings)
     ================================================================ */
  function defFarmObjects() {
    G.defObj('shop_stall', {
      w: 3, h: 2,
      draw(ctx, o, px, py) {
        const s = spr('shop_stall', 144, 168); ctx.drawImage(s, px, py + 2 * T - s.height);
        const disp = E().shop.display.slice(0, shelfCount()).filter(Boolean).slice(0, 6);
        disp.forEach((d, i) => { const col = i % 3, row = Math.floor(i / 3); ctx.drawImage(G.icon(G.itemIcon(d.id)), px + 22 + col * 36 + row * 16, py + 34 - row * 14, 26, 26); });
        const st = shopStatus(), top = py + 2 * T - s.height;
        ctx.font = 'bold 11px "Press Start 2P", monospace'; ctx.textAlign = 'center';
        const label = st.open ? 'OPEN' : 'CLOSED', w = st.open ? 52 : 70;
        ctx.fillStyle = '#5b3a1e'; ctx.fillRect(px + 72 - w / 2 - 3, top - 22, w + 6, 22);
        ctx.fillStyle = st.open ? '#4f9e3b' : '#a0402a'; ctx.fillRect(px + 72 - w / 2, top - 19, w, 16);
        ctx.fillStyle = '#fff'; ctx.fillText(label, px + 72, top - 7);
      },
      interact: () => { openShopPanel(); return true; },
      label: () => 'Farm Shop',
    });
    G.defObj('shop_crate', {
      draw: (ctx, o, px, py) => drawUp(ctx, spr(['shop_crate', 'wooden_storage_crate']), px, py),
      interact: () => { openCrate(); return true; },
      label: () => 'Shop Stock Crate',
    });
    G.defObj('worker_crate', {
      draw: (ctx, o, px, py) => { drawUp(ctx, spr(['worker_crate', 'wooden_storage_barrel']), px, py); if (E().workerCrate.some(Boolean)) drawIconBubble(ctx, (E().workerCrate.find(Boolean) || {}).id ? G.item(E().workerCrate.find(Boolean).id).icon : 'chest', px + 24, py - 4); },
      interact: () => { openWorkerCrate(); return true; },
      label: () => 'Worker Crate',
    });
    const bdraw = (name, w, h) => (ctx, o, px, py) => {
      const s = spr(name, w * T, BLD_H[name] || h * T); ctx.drawImage(s, px + (w * T - s.width) / 2, py + h * T - s.height);
      if (!hasArt(name)) { ctx.fillStyle = '#fff'; ctx.font = 'bold 12px monospace'; ctx.textAlign = 'center'; ctx.fillText(BUILDINGS_BY_TYPE[name] ? BUILDINGS_BY_TYPE[name].label : name, px + w * T / 2, py + h * T - 10); }
    };
    G.defObj('worker_cabin', {
      w: 3, h: 3, draw: bdraw('worker_cabin', 3, 3),
      interact() { const ws = E().workers.map(w => esc(w.name)).join(', ') || 'nobody yet'; G.ui.dialog('Worker Cabin', `A snug cabin with two bunks. Your crew: <b>${ws}</b>.<br>Housing: ${E().workers.length}/${housingCap()} (farmhouse 1 + 2 per cabin).`, [{ label: 'OK' }], 'portrait_worker1'); return true; },
    });
    G.defObj('shed', {
      w: 4, h: 3, draw: bdraw('shed', 4, 3),
      interact(o) { o.items = o.items || new Array(72).fill(null); G.ui.openContainer('Storage Shed', o.items, { label: 'Storage shed — 72 slots' }); return true; },
    });
    G.defObj('silo', { w: 2, h: 2, draw: bdraw('silo', 2, 2), interact() { G.ui.toast('A proud silo. Folks from town can see it from the road (+10% shop visitors).'); return true; } });
    G.defObj('greenhouse', {
      w: 6, h: 5, draw: bdraw('greenhouse', 6, 5),
      interact() {
        if (G.maps.greenhouse) { if (G.farming && G.farming.enterGreenhouse) G.farming.enterGreenhouse(); else G.world.go('greenhouse', 'door'); }
        else G.ui.toast('The greenhouse beds are still being prepared.', null, 'warn');
        return true;
      },
    });
  }
  const BLD_H = { worker_cabin: 192, shed: 192, greenhouse: 288, silo: 168 };

  /** remove debris overlapping a footprint (for reserved spots) */
  function clearSpot(mapId, x, y, w, h) {
    for (const o of G.world.objectsIn(mapId, x, y, w, h)) { const s = G.world.size(o); if (s.w * s.h <= 4 && !PROTECT.has(o.type)) G.world.removeObject(mapId, o); }
  }
  const PROTECT = new Set(['shop_stall', 'shop_crate', 'worker_crate', 'chest', 'furnace', 'keg', 'preserves_jar', 'farmhouse', 'mine_entrance', 'bed', 'worker_cabin', 'shed', 'greenhouse', 'silo']);
  function areaFree(mapId, x, y, w, h) {
    const m = G.maps[mapId];
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
      const gx = x + i, gy = y + j;
      if (gx < 1 || gy < 1 || gx >= m.w - 1 || gy >= m.h - 1) return false;
      if (!G.world.isFree(mapId, gx, gy)) return false;
      if (m.canPlace && !m.canPlace(gx, gy)) return false;
    }
    return true;
  }
  function warpNear(mapId, x, y, w, h) {
    const m = G.maps[mapId];
    for (const wp of m.warps || []) if (wp.x < x + w + 1 && wp.x + (wp.w || 1) > x - 1 && wp.y < y + h + 1 && wp.y + (wp.h || 1) > y - 1) return true;
    return false;
  }
  function ensureFarmObjects() {
    const m = G.maps.farm; if (!m || !G.state) return;
    G.world.data('farm');
    const meta = m.meta || {}; const e = E();
    let st = stall();
    if (!st) {
      let spot = null;
      if (meta.shopSpot) { spot = meta.shopSpot; clearSpot('farm', spot.x, spot.y, 3, 2); }
      else {
        const sp = (m.spawns && (m.spawns.start || m.spawns.east)) || { x: Math.floor(m.w / 2), y: Math.floor(m.h / 2) };
        outer: for (let r = 2; r < 16; r++) for (let j = -r; j <= r; j++) for (let i = -r; i <= r; i++) {
          if (Math.max(Math.abs(i), Math.abs(j)) !== r) continue;
          const x = sp.x + i, y = sp.y + j;
          if (areaFree('farm', x, y, 4, 3) && !warpNear('farm', x, y, 4, 3) && !(sp.x >= x - 1 && sp.x <= x + 4 && sp.y >= y - 1 && sp.y <= y + 3)) { spot = { x, y }; break outer; }
        }
      }
      if (spot) st = G.world.addObject('farm', { type: 'shop_stall', x: spot.x, y: spot.y });
    }
    if (!st) return;
    if (!findObj('shop_crate')) {
      let c = meta.crateSpot && meta.shopSpot && meta.shopSpot.x === st.x && meta.shopSpot.y === st.y ? meta.crateSpot : null;
      if (c) clearSpot('farm', c.x, c.y, 1, 1);
      else c = [{ x: st.x + 3, y: st.y + 1 }, { x: st.x - 1, y: st.y + 1 }, { x: st.x + 3, y: st.y }, { x: st.x - 1, y: st.y }].find(p => areaFree('farm', p.x, p.y, 1, 1));
      if (c) G.world.addObject('farm', { type: 'shop_crate', x: c.x, y: c.y });
    }
    if (e.workers.some(w => w.type !== 'shopkeeper') && !findObj('worker_crate')) {
      const cr = findObj('shop_crate') || st;
      const cands = [{ x: cr.x + 1, y: cr.y }, { x: cr.x, y: cr.y - 1 }, { x: cr.x + 1, y: cr.y - 1 }, { x: st.x - 1, y: st.y }, { x: st.x - 2, y: st.y + 1 }];
      let c = cands.find(p => areaFree('farm', p.x, p.y, 1, 1));
      if (!c) { const f = freeTileNear('farm', st.x + 4, st.y, 6); if (areaFree('farm', f.x, f.y, 1, 1)) c = f; }
      if (c) G.world.addObject('farm', { type: 'worker_crate', x: c.x, y: c.y });
    }
  }

  /* ================================================================
     BUILDINGS + PLACEMENT MODE
     ================================================================ */
  const BUILDINGS = {
    cabin: { label: 'Worker Cabin', type: 'worker_cabin', w: 3, h: 3, money: 4000, mats: [['wood', 150], ['stone', 50]], max: 3, desc: 'Houses 2 more workers.' },
    shed: { label: 'Storage Shed', type: 'shed', w: 4, h: 3, money: 8000, mats: [['wood', 300], ['stone', 100]], max: 2, desc: 'A walk-in shed with 72 storage slots.' },
    silo: { label: 'Silo', type: 'silo', w: 2, h: 2, money: 2500, mats: [['stone', 100], ['copper_bar', 5]], max: 1, desc: 'A landmark visible from the road: +10% shop visitors.' },
    greenhouse: { label: 'Greenhouse', type: 'greenhouse', w: 6, h: 5, money: 25000, mats: [['hardwood', 200], ['iron_bar', 20], ['gold_bar', 10]], max: 1, desc: 'Grow any crop in any season — even Winter.' },
    exp1: { label: 'Shop Expansion I', money: 5000, mats: [['wood', 200], ['iron_bar', 5]], shop: 1, desc: '6 display shelves and ~35% more customers.' },
    exp2: { label: 'Shop Expansion II', money: 15000, mats: [['hardwood', 100], ['gold_bar', 10]], shop: 2, desc: '9 display shelves and even busier days.' },
  };
  const BUILDINGS_BY_TYPE = {}; for (const k in BUILDINGS) if (BUILDINGS[k].type) BUILDINGS_BY_TYPE[BUILDINGS[k].type] = BUILDINGS[k];
  let PL = null;   // active placement {key, d}
  let bannerEl = null;
  function startPlacement(key) {
    PL = { key, d: BUILDINGS[key] };
    if (G.player.map !== 'farm') G.world.go('farm', 'east');
    if (!bannerEl) { bannerEl = document.createElement('div'); bannerEl.id = 'econ-banner'; G.ui.el.appendChild(bannerEl); }
    bannerEl.innerHTML = `Placing <b>${PL.d.label}</b> — move the mouse, click (or Space) to build · Esc / right-click to cancel (refund)`;
    bannerEl.style.display = 'block';
  }
  function endPlacement() { PL = null; if (bannerEl) bannerEl.style.display = 'none'; if (G.state && G.state.mod.econ) E().pendingBuild = null; }
  function plTarget() {
    const d = PL.d, m = G.input.mouse; let tx, ty;
    if (m.inside) { tx = Math.floor((m.x + G.cam.x) / T); ty = Math.floor((m.y + G.cam.y) / T); }
    else { const f = G.player.facingTile(); tx = f.x; ty = f.y - (G.player.dir === 'up' ? 0 : -d.h); }
    return { x: tx - Math.floor(d.w / 2), y: ty - d.h + 1 };
  }
  function plValid(x, y) {
    if (G.player.map !== 'farm' || !G.maps.farm) return false;
    const d = PL.d;
    if (!areaFree('farm', x, y, d.w, d.h)) return false;
    if (warpNear('farm', x, y, d.w, d.h)) return false;
    const pt = G.player.tile(); if (pt.x >= x && pt.x < x + d.w && pt.y >= y && pt.y < y + d.h) return false;
    if (G.farming && G.farming.soilAt) for (let j = 0; j < d.h; j++) for (let i = 0; i < d.w; i++) { const s = G.farming.soilAt('farm', x + i, y + j); if (s && s.tilled !== false) return false; }
    // doorway in front must be walkable
    const dx = x + Math.floor(d.w / 2); if (G.world.isSolid('farm', dx, y + d.h)) return false;
    return true;
  }
  function plPlace() {
    const { x, y } = plTarget();
    if (!plValid(x, y)) { G.sfx('error'); G.ui.toast("Can't build there — needs clear, untilled ground.", null, 'warn'); return; }
    const d = PL.d, key = PL.key;
    const o = G.world.addObject('farm', { type: d.type, x, y });
    if (d.type === 'shed') o.items = new Array(72).fill(null);
    E().built[key] = (E().built[key] || 0) + 1;
    if (key === 'greenhouse') G.state.flags.greenhouse = true;
    for (let j = 0; j < d.h; j++) for (let i = 0; i < d.w; i++) G.fx.burst((x + i + 0.5) * T, (y + j + 0.5) * T, G.pick(['#c8a26b', '#e9d1a0', '#8b5a2b']), 4, 4);
    G.sfx('craft'); G.ui.toast(`${d.label} built! Wren waves from the road.`, null, 'level');
    G.emit('buildingPlaced', d.type, o);
    endPlacement();
  }
  function plCancel() {
    const d = PL.d;
    G.state.money += d.money; G.emit('money', d.money);
    for (const [id, n] of d.mats) G.inv.give(id, n);
    G.ui.toast(`Construction cancelled — ${G.fmtMoney(d.money)} and materials refunded.`);
    endPlacement();
  }
  function drawPlacement() {
    if (!PL || G.player.map !== 'farm' || !G.started) return;
    const ctx = G.ctx, z = G.cam.zoom, d = PL.d; const { x, y } = plTarget(); const ok = plValid(x, y);
    ctx.setTransform(z, 0, 0, z, 0, 0);
    const px = x * T - G.cam.x, py = y * T - G.cam.y;
    ctx.globalAlpha = 0.55; const s = spr(d.type, d.w * T, BLD_H[d.type] || d.h * T); ctx.drawImage(s, px + (d.w * T - s.width) / 2, py + d.h * T - s.height); ctx.globalAlpha = 1;
    ctx.fillStyle = ok ? 'rgba(80,220,90,.35)' : 'rgba(230,60,50,.4)'; ctx.fillRect(px, py, d.w * T, d.h * T);
    ctx.strokeStyle = ok ? '#5fe36b' : '#ff5a4a'; ctx.lineWidth = 3; ctx.strokeRect(px + 1.5, py + 1.5, d.w * T - 3, d.h * T - 3);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }
  // monkey-patch #1: overlay the placement ghost after the world render
  function patchRender() {
    if (G.render._econ) return;
    const orig = G.render;
    G.render = function () { orig.apply(this, arguments); try { drawPlacement(); } catch (e) { } };
    G.render._econ = true;
  }
  function installPlacementInput() {
    window.addEventListener('mousedown', ev => {
      if (!PL || !G.started || G.ui.modal || ev.target !== G.canvas) return;
      ev.stopImmediatePropagation(); ev.preventDefault();
      if (ev.button === 0) plPlace(); else if (ev.button === 2) plCancel();
    }, true);
    window.addEventListener('keydown', ev => {
      if (!PL || !G.started || G.ui.modal) return;
      if (ev.code === 'Escape') { ev.stopImmediatePropagation(); plCancel(); }
      else if (ev.code === 'Space' || ev.code === 'Enter') { ev.stopImmediatePropagation(); ev.preventDefault(); plPlace(); }
    }, true);
  }
  function buyBuilding(key) {
    const d = BUILDINGS[key], e = E();
    if (!G.inv.canAfford(d.mats, d.money)) { G.ui.toast('You need more gold or materials.', null, 'warn'); G.sfx('error'); return false; }
    if (d.shop) {
      G.inv.pay(d.mats, d.money); e.shop.level = d.shop;
      G.ui.toast(`${d.label} done! You now have ${shelfCount()} display shelves.`, null, 'level');
      const s = stall(); if (s && G.player.map === 'farm') G.fx.burst((s.x + 1.5) * T, (s.y + 1) * T, '#e9d1a0', 16, 4);
      return true;
    }
    if (!G.maps.farm) { G.ui.toast('No farm to build on!', null, 'warn'); return false; }
    G.inv.pay(d.mats, d.money);
    e.pendingBuild = key; // refunded on load if the game is closed before placing
    setTimeout(() => { G.ui.close(); startPlacement(key); }, 0);
    return true;
  }

  /* ================================================================
     TOOL UPGRADES (Blacksmith)
     ================================================================ */
  const TOOLS = ['hoe', 'watering_can', 'axe', 'pickaxe', 'scythe', 'fishing_rod'];
  const UPG = [null, { money: 2000, bar: 'copper_bar' }, { money: 5000, bar: 'iron_bar' }, { money: 10000, bar: 'gold_bar' }, { money: 25000, bar: 'iridium_bar' }];
  const EFFECT = {
    hoe: ['', 'tills 3 tiles in a line', 'tills 5 tiles in a line', 'tills a 3×3 area', 'tills a 3×6 area'],
    watering_can: ['', 'waters 3 tiles in a line', 'waters 5 tiles in a line', 'waters a 3×3 area', 'waters a 3×6 area'],
    axe: ['', 'fells trees in 4 hits; splits large stumps for hardwood', 'fells trees in 3 hits', 'fells trees in 2 hits', 'fells trees in one swing'],
    pickaxe: ['', 'rocks in 2 hits; can mine iron', 'can mine gold; smashes boulders', 'one-hit rocks; can mine iridium', 'one-hit everything'],
    scythe: ['', 'cuts & harvests a 3×3 area', 'sturdier 3×3 sweep', 'cuts & harvests a 5×5 area', 'razor-sharp 5×5 sweep'],
    fishing_rod: ['', 'wider catch bar', 'wider bar, faster reel', 'much wider bar, faster reel', 'the widest bar & fastest reel'],
  };
  function upgradeStock() {
    const e = E(), rows = [];
    for (const t of TOOLS) {
      const cur = G.state.tools[t] || 0;
      if (e.upgrading && e.upgrading.tool === t) { rows.push({ id: t, price: 0, icon: `tool:${t}:${e.upgrading.tier}`, label: `${G.TOOL_TIERS[e.upgrading.tier]} ${nm(t)}`, desc: 'On the anvil — ready tomorrow morning.', soldOut: true, costText: 'working…', single: true }); continue; }
      if (cur >= 4) { rows.push({ id: t, price: 0, icon: `tool:${t}:4`, label: `Iridium ${nm(t)}`, desc: 'Fully upgraded. Bram is impressed.', soldOut: true, costText: 'MAX', single: true }); continue; }
      const nt = cur + 1, u = UPG[nt];
      rows.push({
        id: t, price: 0, icon: `tool:${t}:${nt}`, single: true,
        label: `${nm(t)} → ${G.TOOL_TIERS[nt]}`, desc: `${G.TOOL_TIERS[nt]}: ${EFFECT[t][nt]}`,
        costText: `${G.fmtMoney(u.money)} + 5 ${nm(u.bar)}`,
        req: e.upgrading ? `Bram is busy with your ${nm(e.upgrading.tool)} (one at a time).` : null,
        onBuy: () => startUpgrade(t, nt),
      });
    }
    return rows;
  }
  function startUpgrade(t, tier) {
    const e = E(), u = UPG[tier];
    const idx = G.state.inv.findIndex(s => s && s.id === t);
    if (idx < 0) { G.ui.toast(`Bring your ${nm(t)} with you.`, null, 'warn'); G.sfx('error'); return false; }
    if (!G.inv.canAfford([[u.bar, 5]], u.money)) { G.ui.toast(`Needs ${G.fmtMoney(u.money)} and 5 ${nm(u.bar)}.`, null, 'warn'); G.sfx('error'); return false; }
    G.inv.pay([[u.bar, 5]], u.money);
    G.state.inv[idx] = null; G.emit('invChange');
    e.upgrading = { tool: t, tier, readyDay: absDay() + 1 };
    G.ui.toast(`Bram takes your ${nm(t)}: "Come back tomorrow, it'll sing!"`, `tool:${t}:${tier}`);
    return true;
  }
  function finishUpgrade() {
    const e = E(), u = e.upgrading; if (!u || absDay() < u.readyDay) return;
    G.state.tools[u.tool] = u.tier; e.upgrading = null;
    G.inv.give(u.tool, 1);
    G.report(`Bram delivered your <b>${G.toolName(u.tool)}</b>: ${EFFECT[u.tool][u.tier]}.`, `tool:${u.tool}:${u.tier}`);
  }

  /* ================================================================
     WORKERS
     ================================================================ */
  const WTYPES = {
    shopkeeper: { label: 'Shopkeeper', wage: 80, n: 1, desc: "Minds your farm shop 9am–6pm, even while you're away, and refills empty shelves from the stock crate." },
    farmhand: { label: 'Farmhand', wage: 100, n: 2, desc: 'Each morning harvests ripe crops (30 + 10/level) into the worker crate, then waters everything.' },
    miner: { label: 'Miner', wage: 120, n: 3, desc: 'Brings back ore, coal and gems daily — digs deeper as they level up (and as you explore).' },
    fisher: { label: 'Fisher', wage: 90, n: 4, desc: 'Catches up to 4 fish a day. Uses 2 bait per fish from the worker crate.' },
  };
  const NAMES = ['Ivy', 'Milo', 'Rosa', 'Tam', 'Edie', 'Finn', 'Lark', 'Opal', 'Rufus', 'Wynn', 'Sage', 'Bea', 'Cass', 'Dov', 'Juno', 'Kit', 'Nico', 'Pell', 'Hollis', 'Mae'];
  const PITCH = {
    shopkeeper: ['I can sell sand to a fish. Well, vegetables to a villager.', 'Counting coins is my favourite hobby.'],
    farmhand: ['Grew up on a farm three valleys over. I know a ripe carrot.', "I'll water every sprout like it's my own."],
    miner: ["Dark tunnels don't scare me. Spiders do, a bit.", 'My pickaxe and I have been through a lot.'],
    fisher: ['The fish and I have an understanding.', "Just keep me in bait and I'll keep you in fish."],
  };
  const housingCap = () => 1 + 2 * (E().built.cabin || 0);
  function candidates() {
    const e = E(), wk = Math.floor((absDay() - 1) / 7);
    if (!e.candidates || e.candWeek !== wk) {
      e.candWeek = wk; e.candidates = {};
      const used = new Set(e.workers.map(w => w.name));
      for (const t in WTYPES) { let n; do n = G.pick(NAMES); while (used.has(n)); used.add(n); e.candidates[t] = { name: n, look: randLook(), pitch: G.pick(PITCH[t]) }; }
    }
    return e.candidates;
  }
  function hire(type) {
    const e = E();
    if (e.workers.some(w => w.type === type)) return;
    if (e.workers.length >= housingCap()) { G.ui.toast('No room! Build a Worker Cabin at the carpenter.', null, 'warn'); return; }
    const c = candidates()[type];
    e.workers.push({ type, name: c.name, look: c.look, portrait: 'portrait_worker' + WTYPES[type].n, days: 0, lvl: 0, working: true, hired: absDay(), last: 'Just started — excited to help!' });
    delete e.candidates[type];
    e.candidates[type] = (() => { let n; const used = new Set(e.workers.map(w => w.name)); do n = G.pick(NAMES); while (used.has(n)); return { name: n, look: randLook(), pitch: G.pick(PITCH[type]) }; })();
    G.sfx('level'); G.ui.toast(`${c.name} joins your farm as ${WTYPES[type].label}!`, 'portrait_worker' + WTYPES[type].n, 'level');
    ensureFarmObjects(); rebuildFarmEnts();
  }
  function fire(w) {
    const e = E(); e.workers.splice(e.workers.indexOf(w), 1);
    G.ui.toast(`${w.name} packs up with a wave. "Thanks for having me!"`);
    rebuildFarmEnts();
  }
  function deposit(arr, id, qty, q = 0) {
    const st = G.item(id).stack; let left = qty;
    for (const c of arr) if (left && c && c.id === id && (c.q || 0) === (q || 0) && c.qty < st) { const n = Math.min(left, st - c.qty); c.qty += n; left -= n; }
    for (let k = 0; k < arr.length && left; k++) if (!arr[k]) { const n = Math.min(left, st); arr[k] = { id, qty: n, q: q || 0 }; left -= n; }
    return left;
  }
  function stash(id, qty, q, toShop) {
    const e = E();
    let left = deposit(toShop ? e.crate : e.workerCrate, id, qty, q);
    if (left) left = deposit(toShop ? e.workerCrate : e.crate, id, left, q);
    if (left) e.overflow.push({ id, qty: left, q: q || 0 });
  }
  const summarize = list => { const m = {}; for (const r of list) m[r.id] = (m[r.id] || 0) + r.qty; return Object.entries(m).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([id, n]) => `${n} ${esc(nm(id))}`).join(', '); };
  function takeBait(n) {
    const e = E(); const cnt = e.workerCrate.reduce((a, s) => a + (s && (s.id === 'bait' || s.id === 'deluxe_bait') ? s.qty : 0), 0);
    if (cnt < n) return false;
    let left = n;
    for (const id of ['bait', 'deluxe_bait']) for (let i = 0; i < e.workerCrate.length && left; i++) { const s = e.workerCrate[i]; if (s && s.id === id) { const k = Math.min(left, s.qty); s.qty -= k; left -= k; if (!s.qty) e.workerCrate[i] = null; } }
    return true;
  }
  function fallbackOre(depth) {
    return G.weighted([{ w: 40, id: 'stone', qty: G.randInt(3, 8) }, { w: 25, id: 'copper_ore', qty: G.randInt(1, 4) }, { w: 15, id: 'coal', qty: G.randInt(1, 2) },
      { w: depth >= 20 ? 12 : 0, id: 'iron_ore', qty: G.randInt(1, 3) }, { w: depth >= 40 ? 6 : 0, id: 'gold_ore', qty: G.randInt(1, 2) }, { w: 4, id: 'quartz', qty: 1 }, { w: depth >= 30 ? 2 : 0.5, id: 'amethyst', qty: 1 }]);
  }
  const FALLBACK_FISH = ['sunfish', 'carp', 'bream', 'perch', 'catfish', 'bass'];
  function workerQ(w) { const r = Math.random(); return r < w.lvl * 0.01 ? 2 : r < w.lvl * 0.05 ? 1 : 0; }
  function doJob(w) {
    const e = E(), icon = w.portrait;
    if (w.type === 'shopkeeper') { w.last = 'Ready to open the stall at 9!'; return; }
    if (w.type === 'farmhand') {
      let got = [], watered = 0;
      if (G.farming && G.farming.harvestReady) { try { got = G.farming.harvestReady(30 + 10 * w.lvl) || []; } catch (err) { console.error(err); } }
      if (G.farming && G.farming.waterAll) {
        try { watered += G.farming.waterAll('farm') || 0; } catch (err) { }
        if (G.maps.greenhouse && e.built.greenhouse) try { watered += G.farming.waterAll('greenhouse') || 0; } catch (err) { }
      }
      for (const r of got) stash(r.id, r.qty, r.q || 0, e.shop.sendHarvest);
      const n = got.reduce((a, r) => a + r.qty, 0);
      w.last = `Watered ${watered} tiles, harvested ${n} crops.`;
      G.report(`<b>${esc(w.name)}</b> (Farmhand) watered ${watered} tiles${n ? ` and harvested ${summarize(got)} → ${e.shop.sendHarvest ? 'shop stock crate' : 'worker crate'}` : ''}.`, icon);
      return;
    }
    if (w.type === 'miner') {
      const deepest = (G.mining && G.mining.deepest ? G.mining.deepest() : 0) || G.state.stats.deepestMine || 0;
      const depth = Math.max(1, Math.min(Math.max(deepest, 5), 20 + 5 * w.lvl));
      const rolls = G.randInt(4, 7) + Math.floor(w.lvl / 2); const got = [];
      for (let i = 0; i < rolls; i++) {
        let r = null;
        const roll = () => G.mining && G.mining.rollOre ? G.mining.rollOre(depth, { ignoreTier: true }) : fallbackOre(depth);
        try { r = roll(); for (let k = 0; k < 3 && r && r.id === 'stone'; k++) r = roll(); if (r && r.id === 'stone') r.qty = (r.qty || 1) * 3; } catch (err) { r = fallbackOre(depth); }
        if (r && r.id) { got.push({ id: r.id, qty: r.qty || 1 }); stash(r.id, r.qty || 1, 0, false); }
      }
      w.last = `Mined around floor ${depth}.`;
      G.report(`<b>${esc(w.name)}</b> (Miner) worked floor ${depth} and brought back ${summarize(got) || 'nothing'}.`, icon);
      return;
    }
    if (w.type === 'fisher') {
      const max = 4 + Math.floor(w.lvl / 3); const got = []; let noBait = false;
      for (let i = 0; i < max; i++) {
        if (!takeBait(2)) { noBait = true; break; }
        let id = null;
        try {
          const rf = () => G.fishing.rollFish('pond', { worker: true, anyTime: true });
          id = G.fishing && G.fishing.rollFish ? rf() : G.pick(FALLBACK_FISH);
          if (id === 'trash' || id === 'seaweed') id = rf();
        } catch (err) { id = G.pick(FALLBACK_FISH); }
        if (id && typeof id === 'object') id = id.id;
        if (id) { got.push({ id, qty: 1 }); stash(id, 1, workerQ(w), false); }
      }
      w.last = got.length ? `Caught ${got.length} fish.` : 'No bait in the worker crate!';
      if (got.length) G.report(`<b>${esc(w.name)}</b> (Fisher) caught ${summarize(got)}${noBait ? ' — then ran out of bait' : ''}.`, icon);
      else G.report(`<b>${esc(w.name)}</b> (Fisher) had no bait — put bait in the worker crate (2 per fish).`, icon);
    }
  }
  function runWorkers() {
    const e = E(); let wages = 0;
    for (const w of e.workers) {
      const wage = WTYPES[w.type].wage;
      if (G.state.money < wage) { w.working = false; w.last = 'Took the day off (unpaid).'; G.report(`Couldn't pay <b>${esc(w.name)}</b>'s wage (${wage}g) — they took the day off.`, w.portrait); continue; }
      G.spend(wage); wages += wage; w.working = true; w.days++;
      const nl = Math.min(10, Math.floor(w.days / 4));
      if (nl > w.lvl) { w.lvl = nl; G.report(`<b>${esc(w.name)}</b> is getting better at the job (level ${nl})!`, w.portrait); }
      try { doJob(w); } catch (err) { console.error('worker', err); }
    }
    if (wages) G.report(`Paid ${G.fmtMoney(wages)} in wages to your crew.`, null);
  }
  function workplace(w) {
    const m = G.maps.farm, meta = (m && m.meta) || {}, s = stall();
    const sx = s ? s.x : 10, sy = s ? s.y : 10;
    if (w.type === 'shopkeeper') {
      const c = [{ x: sx - 1, y: sy + 1 }, { x: sx + 3, y: sy + 1 }, { x: sx - 1, y: sy }].find(p => !G.world.isSolid('farm', p.x, p.y)) || freeTileNear('farm', sx + 1, sy + 2);
      return { x: c.x, y: c.y, radius: 0 };
    }
    if (w.type === 'farmhand' && meta.field) { const f = meta.field; const c = freeTileNear('farm', f.x + (f.w >> 1), f.y + (f.h >> 1)); return { x: c.x, y: c.y, radius: Math.max(2, Math.min(5, f.w >> 1)), rect: { x: f.x - 1, y: f.y - 1, w: f.w + 2, h: f.h + 2 } }; }
    if (w.type === 'miner') { const sp = (m.spawns && m.spawns.mine) || meta.caveMouth; if (sp) { const c = freeTileNear('farm', sp.x + 1, sp.y + 1); return { x: c.x, y: c.y, radius: 1 }; } }
    if (w.type === 'fisher' && meta.pond && meta.pond.w) { const p = meta.pond; const c = freeTileNear('farm', p.x + (p.w >> 1), p.y + p.h); return { x: c.x, y: c.y, radius: 1, face: 'up' }; }
    const c = freeTileNear('farm', sx + 4 + WTYPES[w.type].n, sy + 3); return { x: c.x, y: c.y, radius: 2 };
  }
  function rebuildFarmEnts() {
    const a = G.ents.farm; if (a) G.ents.farm = a.filter(x => x.kind !== 'econ_worker');
    if (!G.maps.farm) return;
    for (const w of E().workers) {
      const wp = workplace(w);
      G.world.addEnt('farm', {
        kind: 'econ_worker', worker: w, look: w.look, x: (wp.x + 0.5) * T, y: (wp.y + 0.8) * T, dir: wp.face || 'down', moving: false, animT: 0,
        home: { x: wp.x, y: wp.y }, radius: wp.radius, rect: wp.rect, wait: G.rand(0, 2), speed: 45,
        onDuty() { return this.worker.working && G.state.time < (this.worker.type === 'shopkeeper' ? 720 : 720) && G.state.time >= (this.worker.type === 'shopkeeper' ? 180 : 0); },
        update(dt) { if (!this.onDuty()) return; stepWander(this, dt, 'farm'); if (!this.moving && wp.face) this.dir = wp.face; },
        draw(ctx, sx, sy) { if (this.onDuty()) drawPerson(ctx, this, sx, sy); },
        interact() {
          if (!this.onDuty()) return false;
          const w = this.worker, T2 = WTYPES[w.type];
          if (w.type === 'shopkeeper') { openShopPanel(`<b>${esc(w.name)}:</b> "${E().shop.today.n ? `Sold ${E().shop.today.n} items so far today!` : 'Waiting for our first customer of the day!'}"`); return true; }
          G.ui.dialog(`${w.name} — ${T2.label} (Lv ${w.lvl})`, `"${esc(w.last || 'All good, boss!')}"<br><small>Employed ${w.days} day${w.days === 1 ? '' : 's'} · wage ${T2.wage}g/day</small>`, [{ label: 'Keep up the good work!' }], w.portrait);
          return true;
        },
      });
    }
  }
  function openJobBoard() {
    G.ui.panel({
      title: 'Creekside Inn — Job Board', width: 720, cls: 'econ-jobs',
      render: (b, panel) => {
        const e = E(), capN = housingCap();
        b.innerHTML = `<p class="greet">Otis: "Folks looking for work pin their notes here. Wages are paid each morning — if you can't pay, they'll take the day off, no hard feelings."</p>
          <h4>Your crew — housing ${e.workers.length}/${capN} (farmhouse 1 + 2 per Worker Cabin)</h4>`;
        const crew = document.createElement('div'); crew.className = 'econ-list';
        if (!e.workers.length) crew.innerHTML = '<div class="econ-why"><i>Nobody hired yet.</i></div>';
        for (const w of e.workers) {
          const row = document.createElement('div'); row.className = 'econ-worker';
          row.innerHTML = `<img src="${G.iconURL(w.portrait)}"><div class="nm"><span><b>${esc(w.name)}</b> · ${WTYPES[w.type].label} · Lv ${w.lvl}</span><small>${w.days} days · ${WTYPES[w.type].wage}g/day · ${w.working ? 'working' : 'off today'} — "${esc(w.last || '')}"</small></div>`;
          const bt = document.createElement('button'); bt.textContent = 'Let go';
          bt.onclick = () => G.ui.confirm(`Let ${esc(w.name)} go?`, () => { fire(w); openJobBoard(); }, 'Keep', 'Let go');
          row.appendChild(bt); crew.appendChild(row);
        }
        b.appendChild(crew);
        const h = document.createElement('h4'); h.textContent = 'Looking for work'; b.appendChild(h);
        const list = document.createElement('div'); list.className = 'econ-list'; const cands = candidates();
        for (const t in WTYPES) {
          if (e.workers.some(w => w.type === t)) continue;
          const c = cands[t], W = WTYPES[t];
          const row = document.createElement('div'); row.className = 'econ-worker';
          row.innerHTML = `<img src="${G.iconURL('portrait_worker' + W.n)}"><div class="nm"><span><b>${esc(c.name)}</b> · ${W.label} · <b>${W.wage}g/day</b></span><small>${esc(W.desc)}</small><small><i>"${esc(c.pitch)}"</i></small></div>`;
          const bt = document.createElement('button'); bt.textContent = 'Hire';
          if (e.workers.length >= capN) { bt.disabled = true; bt.title = 'No housing — build a Worker Cabin'; }
          bt.onclick = () => { hire(t); panel.refresh(); };
          row.appendChild(bt); list.appendChild(row);
        }
        if (!list.children.length) list.innerHTML = '<div class="econ-why"><i>Your crew is complete!</i></div>';
        b.appendChild(list);
        if (e.workers.length >= capN && Object.keys(WTYPES).some(t => !e.workers.some(w => w.type === t))) { const p = document.createElement('p'); p.className = 'econ-why'; p.textContent = 'All beds are taken. Wren the carpenter can build a Worker Cabin (houses 2).'; b.appendChild(p); }
      },
    });
  }

  /* ================================================================
     MERCHANTS
     ================================================================ */
  const SHOPS = {
    general: { name: 'Mabel', title: "Mabel's General Store", sprite: 'store_general', portrait: 'portrait_mabel', open: 9, close: 18 },
    smith: { name: 'Bram', title: "Bram's Smithy", sprite: 'store_blacksmith', portrait: 'portrait_bram', open: 9, close: 17 },
    carpenter: { name: 'Wren', title: "Wren's Carpentry", sprite: 'store_carpenter', portrait: 'portrait_wren', open: 9, close: 17 },
    inn: { name: 'Otis', title: 'The Creekside Inn', sprite: 'inn', portrait: 'portrait_otis', open: 10, close: 24 },
  };
  const isOpen = k => { const h = G.hour(), s = SHOPS[k]; return h >= s.open && h < s.close; };
  const SEED_FALLBACK = { carrot: [[0], 20, 45], potato: [[0], 40, 80], cabbage: [[0], 70, 160], strawberry: [[0], 100, 120], tomato: [[1], 50, 60], corn: [[1, 2], 75, 50], sunflower: [[1, 2], 40, 80], wheat: [[1, 2], 10, 25], pumpkin: [[2], 120, 320] };
  function cropSeasons(id, def) {
    let s = def && (def.seasons != null ? def.seasons : def.season);
    if (s == null) return SEED_FALLBACK[id] ? SEED_FALLBACK[id][0] : [0, 1, 2];
    if (!Array.isArray(s)) s = [s];
    return s.map(v => typeof v === 'number' ? v : G.SEASONS.findIndex(n => n.toLowerCase() === String(v).toLowerCase())).filter(v => v >= 0);
  }
  const greenhouseBuilt = () => !!E().built.greenhouse;
  function seedStock() {
    const crops = (G.farming && G.farming.crops) || null;
    const ids = crops ? Object.keys(crops) : Object.keys(SEED_FALLBACK);
    const season = G.state.season, gh = greenhouseBuilt(), out = [];
    for (const id of ids) {
      const def = crops ? crops[id] : null, fb = SEED_FALLBACK[id];
      const seasons = cropSeasons(id, def), inSeason = seasons.includes(season);
      if (!inSeason && !gh) continue;
      const seedId = (def && typeof def.seedId === 'string' && def.seedId) || 'seeds_' + id;
      if (crops && !G.items[seedId]) continue;
      const sell = (G.items[id] && G.items[id].price) || (def && def.price) || (fb && fb[2]) || 50;
      const price = (def && typeof def.seed === 'number' ? def.seed : null) || (def && (def.seedPrice || def.seedCost)) || (fb && fb[1]) || Math.round(sell * 0.45);
      out.push({
        id: seedId, price, label: G.items[seedId] ? undefined : cap(id) + ' Seeds', icon: G.items[seedId] ? undefined : (G.items[id] ? G.item(id).icon : seedId),
        desc: `${seasons.map(i => G.SEASONS[i]).join('/')}${def && def.days ? ` · ${def.days} days` : ''}${def && def.regrow ? ` · regrows every ${def.regrow}` : ''} · sells for ${sell}g${!inSeason ? ' · greenhouse only' : ''}`,
      });
    }
    return out;
  }
  function generalStock() {
    const rows = seedStock();
    rows.push({ id: 'bait', price: 5, desc: 'Needed to fish — one per cast.' });
    rows.push({ id: 'deluxe_bait', price: 15, req: G.skillLvl('fishing') < 2 ? 'Requires Fishing level 2' : null });
    if (has('fertilizer')) rows.push({ id: 'fertilizer', price: 20 });
    if (has('speed_gro')) rows.push({ id: 'speed_gro', price: 60, req: G.skillLvl('farming') < 3 ? 'Requires Farming level 3' : null });
    if (has('acorn')) rows.push({ id: 'acorn', price: 40 });
    if (has('pine_cone')) rows.push({ id: 'pine_cone', price: 40 });
    return rows;
  }
  function recipeStock() {
    return RECIPES.filter(r => r.buy).map(r => ({
      id: r.out, price: r.buy, single: true, label: `Recipe: ${r.name || nm(r.out)}`,
      desc: known(r.id) ? 'You already know this recipe.' : `Learn to craft it now (otherwise unlocks at ${cap(r.unlock[0])} Lv ${r.unlock[1]}). Needs: ${r.cost.map(([id, n]) => n + ' ' + nm(id)).join(', ')}.`,
      soldOut: known(r.id) || !has(r.out), costText: known(r.id) ? 'known' : G.fmtMoney(r.buy),
      onBuy: () => { if (!G.spend(r.buy)) { G.ui.toast('Not enough gold.', null, 'warn'); G.sfx('error'); return false; } addRecipe(r.id); return true; },
    }));
  }
  const SMELT = [['copper_ore', 'copper_bar'], ['iron_ore', 'iron_bar'], ['gold_ore', 'gold_bar'], ['iridium_ore', 'iridium_bar']];
  function smithStock() {
    const rows = [
      { id: 'copper_ore', price: 20, desc: 'Fresh from the deep seams. Pricey, but saves a trip.' },
      { id: 'iron_ore', price: 40 }, { id: 'gold_ore', price: 80, req: G.state.stats.deepestMine < 10 && G.skillLvl('mining') < 3 ? 'Reach mine floor 10 (or Mining Lv 3)' : null },
      { id: 'coal', price: 50, desc: 'Fuel for smelting.' },
    ];
    for (const [ore, bar] of SMELT) rows.push({
      id: bar, price: 20, label: `Smelt: ${nm(bar)}`, costText: '20g + ore',
      desc: `5 ${nm(ore)} + 1 Coal + 20g → 1 bar, instantly. (You have ${G.inv.count(ore)} ore, ${G.inv.count('coal')} coal)`,
      onBuy: n => {
        let made = 0; for (let i = 0; i < n; i++) { if (!G.inv.pay([[ore, 5], ['coal', 1]], 20)) break; G.inv.add(bar, 1, 0, true); made++; }
        if (!made) { G.ui.toast(`Needs 5 ${nm(ore)}, 1 Coal and 20g.`, null, 'warn'); G.sfx('error'); return false; }
        G.ui.toast(`Bram smelts ${made} ${nm(bar)}${made > 1 ? 's' : ''}. *clang clang*`, G.item(bar).icon); return true;
      },
    });
    return rows;
  }
  function buildingStock() {
    const e = E(), rows = [];
    for (const key in BUILDINGS) {
      const d = BUILDINGS[key];
      const costText = [G.fmtMoney(d.money)].concat(d.mats.map(([id, n]) => `${n} ${nm(id)}`)).join(' · ');
      const haveMats = d.mats.map(([id, n]) => `${nm(id)} ${Math.min(G.inv.count(id), n)}/${n}`).join(', ');
      let req = null, soldOut = false, desc = `${d.desc} (You have: ${haveMats})`;
      if (d.shop) {
        if (e.shop.level >= d.shop) { soldOut = true; desc = 'Done! Your shop is bigger already.'; }
        else if (e.shop.level < d.shop - 1) req = 'Build Shop Expansion I first';
      } else {
        const n = e.built[key] || 0;
        if (n >= d.max) { soldOut = true; desc = `Built (${n}/${d.max}).`; }
        else desc += ` · ${d.w}×${d.h} · built ${n}/${d.max}`;
      }
      rows.push({ id: 'econ_bld_' + key, price: 0, icon: 'econ_bld_' + key, label: d.label, desc, req, soldOut, single: true, costText: soldOut ? '✔' : costText, onBuy: () => buyBuilding(key) });
    }
    return rows;
  }
  function suppliesStock() {
    const rows = [{ id: 'wood', price: 10 }, { id: 'stone', price: 10 }, { id: 'hardwood', price: 60, desc: 'Dense timber for fine construction.' }, { id: 'fence', price: 15 }];
    for (const [key, , buy] of FURN) rows.push({ id: 'furn_' + key, price: buy });
    return rows;
  }
  const TALK = {
    general: ['"Seeds are seasonal, dear. Plant what the season wants and it\'ll love you back."', '"Your own stall pays far better than I can. I only give 60% — I\'ve got a store to run!"', '"No bait, no bites. I keep plenty in stock."', '"Recipes are the secret to a good farm. I sell a few, if you\'re impatient."'],
    smith: ['"Bring me bars and gold and I\'ll make your tools sing."', '"Copper first. Then iron. Then we talk about gold."', '"A furnace of your own is cheaper than my smelting fee. Just saying."'],
    carpenter: ['"A cabin for your helpers, a shed for your clutter, a greenhouse for winter. I build it all."', '"Hardwood comes from big stumps. You\'ll need a copper axe."', '"A bigger shop means more shelves and more customers. Simple maths."'],
    inn: ['"Coffee\'s fresh. Keeps the yawns away."', '"Lots of folk looking for work round here. Check the board."', '"A shopkeeper minds your stall even while you\'re down the mine. Worth every coin."'],
  };
  function visitShop(k) {
    const s = SHOPS[k];
    if (!isOpen(k)) { G.sfx('error'); G.ui.toast(`${s.title} is closed. Open ${fmtH(s.open)}–${fmtH(s.close)}.`, null, 'warn'); return; }
    const talk = () => G.ui.dialog(s.name, G.pick(TALK[k]), [{ label: 'Back', fn: () => visitShop(k) }, { label: 'Bye!' }], s.portrait);
    if (k === 'general') {
      const winter = G.state.season === 3;
      G.ui.dialog(s.name, `Welcome to the General Store! ${winter ? (greenhouseBuilt() ? 'All seeds are in for your greenhouse.' : "Nothing grows outside in winter — a greenhouse would let you plant any seed.") : `Fresh ${G.SEASONS[G.state.season]} seeds just came in.`}`, [
        { label: 'Browse & sell', fn: () => G.ui.openShop(s.title, generalStock, { sell: true, sellMult: 0.6, greeting: '"Seeds, bait, sundries. And I\'ll buy anything you bring — at 60%."' }) },
        { label: 'Recipes', fn: () => G.ui.openShop('Recipes', recipeStock, { greeting: '"Learn these now instead of waiting for experience."' }) },
        { label: 'Chat', fn: talk }, { label: 'Leave' }], s.portrait);
    } else if (k === 'smith') {
      const up = E().upgrading;
      G.ui.dialog(s.name, up ? `"Your ${esc(nm(up.tool))} is on the anvil. Tomorrow morning, I promise."` : '"Hm. Need something hammered?"', [
        { label: 'Upgrade tools', fn: () => G.ui.openShop('Tool Upgrades', upgradeStock, { greeting: '"Leave the tool with me overnight. Copper: 2,000g + 5 bars. Iron 5,000g, Gold 10,000g, Iridium 25,000g."' }) },
        { label: 'Ore, coal & smelting', fn: () => G.ui.openShop(s.title, smithStock, { sell: x => ['mineral'].includes(G.item(x.id).cat) || /_bar$|^coal$/.test(x.id), sellMult: 0.6, greeting: '"I buy ores, bars and gems too. 60%, fair\'s fair."' }) },
        { label: 'Chat', fn: talk }, { label: 'Leave' }], s.portrait);
    } else if (k === 'carpenter') {
      G.ui.dialog(s.name, '"Oh hi! Thinking of building something?"', [
        { label: 'Buildings', fn: () => G.ui.openShop('Construction', buildingStock, { greeting: '"Pay up and pick a spot on your farm — I build fast!"' }) },
        { label: 'Supplies & furniture', fn: () => G.ui.openShop(s.title, suppliesStock, { greeting: '"Furniture goes anywhere on your farm or in your house. Right-click it to pick it back up."' }) },
        { label: 'Chat', fn: talk }, { label: 'Leave' }], s.portrait);
    } else if (k === 'inn') {
      G.ui.dialog(s.name, '"Welcome to the Creekside! Warm coffee, warm hearth."', [
        { label: 'Job board (hire help)', fn: openJobBoard },
        { label: 'Buy coffee', fn: () => G.ui.openShop(s.title, [{ id: 'coffee', price: 50, desc: 'Shakes off 4 hours of tiredness.' }], { greeting: '"Best brew in the valley."' }) },
        { label: 'Chat', fn: talk }, { label: 'Leave' }], s.portrait);
    }
  }

  /* ================================================================
     TOWN MAP
     ================================================================ */
  const TW = 44, TH = 32;
  const BLDG = [{ k: 'general', x: 3, y: 7 }, { k: 'smith', x: 13, y: 7 }, { k: 'carpenter', x: 23, y: 7 }, { k: 'inn', x: 33, y: 7 }];
  function townChar(x, y) {
    if (y === 0 || y === TH - 1 || x === TW - 1) return 'c';
    if (x === 0) return (y === 14 || y === 15) ? 'p' : 'c';
    if (y === 14 || y === 15) return 'p';
    for (const b of BLDG) if ((x === b.x + 2 || x === b.x + 3) && y >= 11 && y <= 13) return 'p';
    if ((x === 21 || x === 22) && y >= 16 && y <= 22) return 'p';
    if (y >= 23 && y <= 25) return (x === 21 || x === 22) ? 'b' : 'w';
    if ((x === 21 || x === 22) && y >= 26 && y <= 27) return 'p';
    if (x >= 25 && x <= 27 && y >= 18 && y <= 20) return 'w';
    if (x >= 23 && x <= 29 && y >= 17 && y <= 21) return 'p';
    if (x >= 17 && x <= 26 && y >= 28 && y <= 29) return 'p';
    return ((x * 73 + y * 151) % 7 === 0) ? 'G' : 'g';
  }
  const TOWN_DECOR = [
    // trees (north band, road edges, south meadow)
    ...[1, 4, 8, 12, 16, 20, 24, 28, 32, 36, 40].map(x => ['tree', x, 2]), ...[1, 11, 21, 31, 41].map(x => ['tree', x, 5]),
    ['tree', 3, 19], ['tree', 6, 21], ['tree', 12, 18], ['tree', 16, 21], ['tree', 33, 19], ['tree', 37, 21], ['tree', 40, 17], ['tree', 2, 17],
    ['tree', 3, 28], ['tree', 8, 29], ['tree', 13, 27], ['tree', 30, 27], ['tree', 35, 29], ['tree', 40, 28], ['tree', 6, 27], ['tree', 38, 26],
    // flowers & props
    ...[2, 9, 12, 19, 22, 29, 32, 39].map(x => ['flower_patch', x, 12]),
    ['wooden_sign', 1, 13], ['well', 9, 18], ['wooden_storage_barrel', 19, 11], ['wooden_storage_barrel', 12, 11], ['toolbox', 20, 12],
    ['hay_bale', 22, 11], ['farm_cart', 30, 11], ['wheat_bundle', 29, 11], ['plant_pot', 23, 17], ['plant_pot', 29, 17], ['plant_pot', 23, 21], ['plant_pot', 29, 21],
    ['hay_bale', 18, 30], ['hay_bale', 25, 30], ['flower_patch', 16, 28], ['flower_patch', 27, 28], ['birdhouse', 31, 18], ['bucket', 8, 19],
    ['basket', 32, 11], ['wooden_storage_barrel', 39, 11], ['flower_patch', 15, 17], ['flower_patch', 35, 22], ['flower_patch', 10, 26],
    ['lamp', 10, 13], ['lamp', 20, 13], ['lamp', 30, 13], ['lamp', 40, 13], ['lamp', 20, 21], ['lamp', 23, 26],
  ];
  const TOWN_LIGHTS = [].concat(...BLDG.map(b => [{ x: b.x + 1.5, y: b.y + 2.5, r: 1.6 }, { x: b.x + 4.5, y: b.y + 2.5, r: 1.6 }, { x: b.x + 3, y: b.y + 3.6, r: 1.2 }]),
    TOWN_DECOR.filter(d => d[0] === 'lamp').map(d => ({ x: d[1] + 0.5, y: d[2] + 0.2, r: 2.4 })));
  const VILLAGERS = [
    { name: 'Hazel', x: 8, y: 16 }, { name: 'Pip', x: 18, y: 16 }, { name: 'Tobias', x: 30, y: 16 }, { name: 'June', x: 27, y: 22 },
    { name: 'Marigold', x: 12, y: 28 }, { name: 'Basil', x: 34, y: 27 }, { name: 'Nell', x: 38, y: 15 },
  ];
  const VLINES = [
    "Morning! The creek's been sparkling lately.", "Have you tried Otis's coffee? Strong enough to wake a scarecrow.", 'Bram says the deeper you dig, the shinier things get.',
    "I'd pay good coin for fresh strawberries in spring!", 'Wren built my porch swing. Best purchase I ever made.', 'Fish bite better with good bait. Mabel sells it cheap.',
    'I love walking past farm stalls on my way home.', 'They say Fridays are fish days at the farm stalls.', 'Collectors in town pay full price for a nice gem.',
    'A keg turns fruit into something wonderful, given time.', "Weekends I do all my shopping at the farm stalls. Fresher than the store!", 'The river here has the fattest carp. Try the bridge.',
    'Have you seen the old mine north of your farm? Spooky!', "I heard cabbages fetch a pretty penny.", 'A shop with more on the shelves draws a bigger crowd, you know.',
  ];
  function townGenerate() {
    for (const b of BLDG) { clearSpot('town', b.x, b.y, 6, 4); G.world.addObject('town', { type: 'town_building', k: b.k, x: b.x, y: b.y }); }
    for (const [kind, x, y] of TOWN_DECOR) {
      if (G.world.objectAt('town', x, y) || G.SOLID_CHARS.has(G.world.ground('town', x, y))) continue;
      G.world.addObject('town', kind === 'tree' ? { type: 'town_tree', x, y } : { type: 'econ_decor', spr: kind, x, y });
    }
  }
  function defTown() {
    const rows = []; for (let y = 0; y < TH; y++) { let r = ''; for (let x = 0; x < TW; x++) r += townChar(x, y); rows.push(r); }
    G.defMap({
      id: 'town', name: 'Hollow Creek Town', w: TW, h: TH, ground: rows, fishLocation: 'river', meta: { fishLocation: 'river' },
      spawns: { west: { x: 2, y: 14, dir: 'right' }, start: { x: 2, y: 14, dir: 'right' } },
      warps: [{ x: 0, y: 14, w: 1, h: 2, to: 'farm', spawn: 'east' }],
      lights: TOWN_LIGHTS.slice(),
      generate: townGenerate,
    });
    G.defObj('town_building', {
      w: 6, h: 4,
      draw(ctx, o, px, py) {
        const s = SHOPS[o.k], im = spr(s.sprite, 288, 288);
        ctx.drawImage(im, px + (6 * T - im.width) / 2, py + 4 * T - im.height);
        if (!hasArt(s.sprite)) { ctx.fillStyle = '#4a2c14'; ctx.fillRect(px + 2 * T + 10, py + 3 * T - 6, T * 2 - 20, T + 6); ctx.fillStyle = '#fff'; ctx.font = 'bold 14px monospace'; ctx.textAlign = 'center'; ctx.fillText(s.title, px + 3 * T, py + T); }
        // little hanging sign with hours state
        const open = isOpen(o.k), sx = px + 4 * T + 8, sy = py + 3 * T + 8;
        ctx.fillStyle = '#5b3a1e'; ctx.fillRect(sx - 2, sy - 2, 48, 18);
        ctx.fillStyle = open ? '#4f9e3b' : '#a0402a'; ctx.fillRect(sx, sy, 44, 14);
        ctx.fillStyle = '#fff'; ctx.font = 'bold 10px monospace'; ctx.textAlign = 'center'; ctx.fillText(open ? 'OPEN' : 'CLOSED', sx + 22, sy + 11);
      },
      interact(o) {
        const t = G.targetTile(), f = G.player.facingTile();
        const isDoor = p => p.y === o.y + 3 && (p.x === o.x + 2 || p.x === o.x + 3);
        if (isDoor(t) || isDoor(f) || G.player.tile().y === o.y + 4) { visitShop(o.k); return true; }
        G.ui.toast(`That's ${SHOPS[o.k].title}. The door is at the front.`); return true;
      },
      label: o => SHOPS[o.k].title,
    });
    G.defObj('town_tree', {
      draw(ctx, o, px, py) { const s = spr(G.state.season === 3 ? ['tree_oak_winter', 'tree_oak'] : 'tree_oak', 96, 144); ctx.drawImage(s, px + (T - s.width) / 2, py + T - s.height); },
    });
    G.defObj('econ_decor', {
      draw(ctx, o, px, py) {
        if (o.spr === 'lamp') {
          if (hasArt('lamp_post')) { drawUp(ctx, spr('lamp_post'), px, py); return; }
          ctx.fillStyle = '#2e2a26'; ctx.fillRect(px + 21, py - 30, 6, 74); ctx.fillRect(px + 15, py + 38, 18, 6);
          ctx.fillStyle = G.isNight() ? '#ffe28a' : '#d9d2b0'; ctx.fillRect(px + 15, py - 44, 18, 16); ctx.strokeStyle = '#2e2a26'; ctx.lineWidth = 2; ctx.strokeRect(px + 15, py - 44, 18, 16);
          return;
        }
        drawUp(ctx, spr(o.spr), px, py);
      },
      interact(o) {
        if (o.spr === 'wooden_sign') { G.ui.dialog('Sign', '<b>Hollow Creek</b><br>← Farm road · General Store · Smithy · Carpentry · Creekside Inn<br><small>Shops open around 9am. The Inn stays open late.</small>'); return true; }
        if (o.spr === 'well') { G.ui.toast('You toss in a pebble... *plunk*. Feels lucky.'); return true; }
        return false;
      },
    });
  }
  function spawnVillagers() {
    const a = G.ents.town; if (a) G.ents.town = a.filter(e => e.kind !== 'econ_npc');
    for (const v of VILLAGERS) {
      G.world.addEnt('town', {
        kind: 'econ_npc', name: v.name, look: randLook(), x: (v.x + 0.5) * T, y: (v.y + 0.8) * T, dir: 'down', moving: false, animT: 0,
        home: { x: v.x, y: v.y }, radius: 4, rect: { x: 1, y: 11, w: 42, h: 20 }, wait: G.rand(0, 3), speed: G.rand(40, 60),
        update(dt) { stepWander(this, dt, 'town'); },
        draw(ctx, sx, sy) { drawPerson(ctx, this, sx, sy); },
        interact() {
          const p = G.player; this.dir = { up: 'down', down: 'up', left: 'right', right: 'left' }[p.dir]; this.wait = 3; this.tx = null;
          const line = G.pick(VLINES); say(this, '♪', 1.5);
          G.ui.dialog(this.name, `"${line}"`, [{ label: 'Nice chatting!' }]); return true;
        },
      });
    }
  }
  // walking into a door (pressing up against it) opens the merchant
  let doorLatch = null;
  function doorCheck() {
    const p = G.player; if (p.map !== 'town' || G.ui.modal || p.busy) { return; }
    const t = p.tile(); const key = t.x + ',' + t.y;
    if (doorLatch && doorLatch !== key) doorLatch = null;
    if (!p.moving || p.dir !== 'up' || doorLatch) return;
    const o = G.world.objectAt('town', t.x, t.y - 1);
    if (!o || o.type !== 'town_building' || t.y - 1 !== o.y + 3 || !(t.x === o.x + 2 || t.x === o.x + 3)) return;
    if (p.y - (t.y * T) > 28) return; // must be pressed against the door (tolerant of slow frames)
    doorLatch = key; G.input.keys = {}; visitShop(o.k);
  }

  /* ================================================================
     CSS
     ================================================================ */
  function injectCSS() {
    const st = document.createElement('style');
    st.textContent = `
.econ-top{display:flex;align-items:center;gap:10px;margin-bottom:4px}
.econ-status{padding:3px 10px;border-radius:4px;font-weight:700;border:2px solid #0003}
.econ-status.open{background:#cfeebc;color:#24561a}.econ-status.closed{background:#f6d2c2;color:#8a2a10}
.econ-why{font-size:13px;color:#6b4a2b}
.econ-shelves{display:flex;gap:8px;flex-wrap:wrap;margin:4px 0 8px}
.econ-shelf{display:flex;flex-direction:column;align-items:center;gap:1px;font-size:13px;min-width:56px}
.econ-shelf .slot.pick{box-shadow:0 0 0 3px #4f9e3b;background:#eaffd8}
.econ-shelf .slot.locked{opacity:.45;cursor:default;font-size:18px}
.econ-prices{display:flex;gap:5px;align-items:center;flex-wrap:wrap;margin-bottom:4px}
.econ-prices button{padding:2px 8px;font-size:14px}
.econ-cols{display:grid;grid-template-columns:1fr 220px;gap:12px;align-items:start}
.econ-log{font-size:13px;max-height:120px;overflow-y:auto;background:#fff7e2;border:2px solid var(--paper-d);border-radius:4px;padding:4px 8px}
.econ-log img{width:18px;height:18px;vertical-align:-4px}
.econ-side{display:flex;flex-direction:column;gap:6px;margin-top:10px}.econ-side small{font-size:12px;color:#6b4a2b}
.econ-hint{margin:0 0 8px;font-size:14px;color:#6b4a2b}
.econ-craft-list{display:flex;flex-direction:column;gap:4px;max-height:440px;overflow-y:auto;padding-right:4px}
.econ-craft{display:flex;align-items:center;gap:10px;background:#fff7e2;border:2px solid var(--paper-d);border-radius:5px;padding:4px 8px}
.econ-craft.can{border-color:#8cc56f}.econ-craft.locked{opacity:.6}
.econ-craft .ic{width:40px;height:40px}.econ-craft .nm{flex:1;display:flex;flex-direction:column;gap:1px}
.econ-craft .nm small{font-size:13px;color:#6b4a2b}.econ-craft .btns{display:flex;gap:4px}.econ-craft .btns button{padding:3px 9px;font-size:14px}
.econ-ing{display:inline-flex;align-items:center;gap:2px;margin-right:9px;font-size:14px;font-weight:600}
.econ-ing img{width:22px;height:22px}.econ-ing.ok{color:#2c6e1f}.econ-ing.no{color:#b0301a}
.econ-list{display:flex;flex-direction:column;gap:4px}
.econ-worker{display:flex;gap:10px;align-items:center;background:#fff7e2;border:2px solid var(--paper-d);border-radius:5px;padding:4px 8px}
.econ-worker img{width:48px;height:48px;border:2px solid var(--wood-d);border-radius:4px;background:var(--paper-d)}
.econ-worker .nm{flex:1;display:flex;flex-direction:column;font-size:15px}.econ-worker .nm small{font-size:13px;color:#6b4a2b}
#econ-banner{position:absolute;top:12px;left:50%;transform:translateX(-50%);background:var(--paper);border:3px solid var(--wood-d);padding:6px 14px;border-radius:6px;font-size:16px;pointer-events:none !important;display:none;box-shadow:0 3px 0 rgba(0,0,0,.3);z-index:15}
`;
    document.head.appendChild(st);
  }
  function makeBuildingIcons() {
    for (const key in BUILDINGS) {
      const d = BUILDINGS[key], c = G.makeCanvas(48, 48), x = c.getContext('2d');
      const s = d.type ? spr(d.type, d.w * T, BLD_H[d.type] || d.h * T) : spr('shop_stall', 144, 168);
      const k = Math.min(46 / s.width, 46 / s.height); x.drawImage(s, (48 - s.width * k) / 2, (48 - s.height * k) / 2, s.width * k, s.height * k);
      if (d.shop) { x.fillStyle = '#4f9e3b'; x.fillRect(30, 30, 16, 16); x.fillStyle = '#fff'; x.font = 'bold 14px monospace'; x.textAlign = 'center'; x.fillText('+', 38, 43); }
      G.art.icons['econ_bld_' + key] = c;
    }
  }

  /* ================================================================
     EVENTS
     ================================================================ */
  G.on('init', () => {
    injectCSS(); defItems(); defMachines(); defFarmObjects(); defTown();
    makeBuildingIcons(); patchRender(); installPlacementInput();
    G.ui.hotkey('KeyC', openCrafting);
    G.ui.addTab('craft', 'Crafting', (body, panel) => renderCrafting(body, () => panel.refresh()), 20);
    G.helpExtra.push('<b>Your farm shop:</b> right-click the stall by the road to put goods on its shelves and set prices. Customers come by 8am–8pm while you are nearby (or a hired shopkeeper minds it 9–6) and pay <b>full value × your markup</b> — far better than town merchants (60%). Higher prices = fewer sales. Crops are popular, fish sell best on Fridays, collectors pay full price for gems.');
    G.helpExtra.push('<b>Town</b> (east road): Mabel sells seeds & bait and buys anything; Bram upgrades tools overnight & smelts; Wren builds cabins, sheds, shop expansions & the greenhouse; Otis at the Inn sells coffee and has the <b>job board</b> for hiring a shopkeeper, farmhand, miner or fisher. <b>Crafting</b>: press C. A furnace turns 5 ore + 1 coal into a bar; preserves jars and kegs multiply crop value.');
  });
  G.on('newGame', () => {
    G.state.mod.econ = defaults();
    checkUnlocks(true);
    ensureFarmObjects();
  });
  /* ---- cobblestone paths: placed paths become real 'p' ground so they join like the house path ---- */
  const PATHABLE = new Set(['g', 'G', 'd', 's']);
  const pathStore = () => { const e = E(); return e.paths || (e.paths = {}); };
  function placePath(ctx) {
    const m = G.maps[ctx.map];
    if (!m || m.persistent === false) { G.ui.toast("You can't lay a path here.", null, 'warn'); return true; }
    const ch = G.world.ground(ctx.map, ctx.x, ctx.y);
    if (ch === 'p') { G.ui.toast('There is already a path here.', null, 'warn'); return true; }
    if (!PATHABLE.has(ch) || G.world.objectAt(ctx.map, ctx.x, ctx.y)) { G.sfx('error'); return true; }
    const soil = G.farming && G.farming.soilAt ? G.farming.soilAt(ctx.map, ctx.x, ctx.y) : null;
    if (soil && soil.tilled) { G.ui.toast('Clear the tilled soil first.', null, 'warn'); G.sfx('error'); return true; }
    for (const w of m.warps || []) if (ctx.x >= w.x && ctx.x < w.x + (w.w || 1) && ctx.y >= w.y && ctx.y < w.y + (w.h || 1)) { G.sfx('error'); return true; }
    const st = pathStore(); (st[ctx.map] = st[ctx.map] || {})[ctx.x + ',' + ctx.y] = ch;
    G.world.setGround(ctx.map, ctx.x, ctx.y, 'p'); G.inv.removeSlot(ctx.slotIndex, 1); G.sfx('dig');
    G.fx.burst((ctx.x + 0.5) * T, (ctx.y + 0.7) * T, '#a7a29a', 6, 3);
    return true;
  }
  G.on('toolMiss', ctx => {
    if (!ctx || !ctx.item || ctx.item.id !== 'pickaxe') return;
    const st = pathStore()[ctx.map]; const k = ctx.x + ',' + ctx.y;
    if (!st || st[k] === undefined) return;
    G.world.setGround(ctx.map, ctx.x, ctx.y, st[k]); delete st[k];
    G.inv.give('path_stone', 1); G.sfx('pickup'); G.fx.burst((ctx.x + 0.5) * T, (ctx.y + 0.7) * T, '#a7a29a', 6, 3);
  });
  function applyPaths() {
    const st = pathStore();
    // old saves: loose-stone path objects -> real paths
    for (const mapId of ['farm', 'greenhouse']) {
      if (!G.maps[mapId] || !G.state.maps[mapId]) continue;
      for (const o of G.world.objects(mapId).filter(o => o.type === 'path_stone')) {
        const ch = G.world.ground(mapId, o.x, o.y); G.world.removeObject(mapId, o);
        if (PATHABLE.has(ch)) (st[mapId] = st[mapId] || {})[o.x + ',' + o.y] = ch; else G.inv.give('path_stone', 1);
      }
    }
    for (const [mapId, tiles] of Object.entries(st)) { if (!G.maps[mapId]) continue; for (const k of Object.keys(tiles)) { const [x, y] = k.split(',').map(Number); G.world.setGround(mapId, x, y, 'p'); } }
  }
  /* ---- turn the farm's built-in decorations & house furniture into pick-up-able furniture ---- */
  function convertDecor() {
    for (const mapId of ['farm', 'house', 'greenhouse']) {
      if (!G.maps[mapId] || !G.state.maps[mapId]) continue;
      for (const o of G.world.objects(mapId)) {
        if (!['decor', 'furn', 'bed', 'bookshelf'].includes(o.type)) continue;
        const key = o.type === 'bed' ? 'farm_bed' : o.type === 'bookshelf' ? 'bookshelf2' : o.spr;
        if (!G.items['furn_' + key]) continue;
        const keep = { w: o.w, h: o.h, s: o.s, dy: o.dy, walk: o.walk };
        for (const k of Object.keys(o)) if (!['uid', 'x', 'y'].includes(k)) delete o[k];
        Object.assign(o, { type: 'furniture', key }, FURN_SIZE[key] || {}, FURN_KIND[key] ? { kind: FURN_KIND[key] } : {});
        for (const [k, v] of Object.entries(keep)) if (v !== undefined) o[k] = v;
        if (key === 'farm_bed') Object.assign(o, { w: 2, h: 2, s: 2 });
        if (key === 'bookshelf2') Object.assign(o, { w: 2, h: 1, s: 2, dy: 6 });
      }
    }
  }
  // wake up next to whichever bed you slept in (beds can be moved now)
  G.bedSpot = mapId => {
    const bed = G.world.objects(mapId).find(o => (o.type === 'furniture' && o.key === 'farm_bed') || o.type === 'bed');
    if (!bed) return null;
    const w = bed.w || 2, h = bed.h || 2;
    const opts = [[bed.x + w, bed.y + h - 1], [bed.x + w, bed.y], [bed.x, bed.y + h], [bed.x + 1, bed.y + h], [bed.x - 1, bed.y + h - 1]];
    for (const [x, y] of opts) if (!G.world.isSolid(mapId, x, y)) return { x, y, dir: 'down' };
    return null;
  };
  function mailboxArt() {
    if (G.art.sprites.mailbox) return;
    const c = G.makeCanvas(48, 48), x = c.getContext('2d');
    x.fillStyle = 'rgba(0,0,0,.18)'; x.beginPath(); x.ellipse(24, 44, 10, 3, 0, 0, Math.PI * 2); x.fill();
    x.fillStyle = '#3b2412'; x.fillRect(20, 21, 8, 24); x.fillStyle = '#6b4226'; x.fillRect(21, 21, 6, 23);
    x.fillStyle = '#23406e'; x.beginPath(); x.arc(24, 13, 14, Math.PI, 0); x.fill(); x.fillRect(10, 12, 28, 12);
    x.fillStyle = '#3d6fb5'; x.beginPath(); x.arc(24, 13, 12, Math.PI, 0); x.fill(); x.fillRect(12, 12, 24, 10);
    x.fillStyle = '#6a97d8'; x.fillRect(14, 7, 10, 2);
    x.fillStyle = '#7a1414'; x.fillRect(35, 2, 6, 14); x.fillStyle = '#d33'; x.fillRect(36, 3, 4, 12);
    G.art.sprites.mailbox = c; G.art.icons.mailbox = c;
  }
  G.on('assetsLoaded', mailboxArt);

  G.on('loadGame', () => {
    try { mailboxArt(); convertDecor(); applyPaths(); } catch (err) { console.error('decor/paths', err); }
    ensureState(); checkUnlocks(true); candidates();
    const pend = E().pendingBuild && BUILDINGS[E().pendingBuild];
    if (pend) { // bought but never placed (game closed mid-placement): refund
      G.state.money += pend.money; for (const [id, n] of pend.mats) G.inv.add(id, n, 0, true);
      setTimeout(() => G.ui.toast(`Wren refunded your unplaced ${pend.label} (${G.fmtMoney(pend.money)} + materials).`, null, 'level'), 600);
    }
    endPlacement();
    if (G.ents.farm) G.ents.farm = G.ents.farm.filter(e => e.kind !== 'econ_customer' && e.kind !== 'econ_worker');
  });
  G.on('mapChange', (mapId) => {
    if (!G.state.mod.econ) return;
    refreshLights(mapId);
    if (mapId === 'town' && !G.world.entsOf('town').some(e => e.kind === 'econ_npc')) spawnVillagers();
    if (mapId === 'farm') { ensureFarmObjects(); rebuildFarmEnts(); }
    else if (PL && mapId !== 'farm') plCancel();
  });
  G.on('minute10', t => {
    if (!G.state.mod.econ) return;
    tickMachines();
    if (workingWorker('shopkeeper') && shopStatus().keeper) restock();
    customerTick(t);
  });
  G.on('tick', () => { if (G.state.mod.econ) doorCheck(); });
  G.on('levelUp', () => checkUnlocks(false));
  G.on('newDay', () => {
    const e = E(); if (!e) return;
    const sh = e.shop;
    if (sh.today.n > 0) {
      const best = {}; for (const l of sh.log) best[l.id] = (best[l.id] || 0) + l.gold;
      const top = Object.entries(best).sort((a, b) => b[1] - a[1])[0];
      G.report(`Your farm shop sold <b>${sh.today.n}</b> item${sh.today.n > 1 ? 's' : ''} for <b>${G.fmtMoney(sh.today.gold)}</b>${top ? ` (best seller: ${esc(nm(top[0]))})` : ''}.`, top ? G.item(top[0]).icon : null);
    }
    sh.today = { n: 0, gold: 0 }; sh.log = []; sh.nextCust = null;
    if (G.ents.farm) G.ents.farm = G.ents.farm.filter(x => x.kind !== 'econ_customer');
    finishUpgrade();
    runWorkers();
    machineReport();
    candidates();
    if (G.player.map === 'farm') rebuildFarmEnts();
  });

  /* ================================================================
     API
     ================================================================ */
  G.economy = {
    workers: () => (G.state.mod.econ ? E().workers.slice() : []),
    hasWorker: type => !!(G.state.mod.econ && E().workers.some(w => w.type === type)),
    shopStall: () => stall(),
    addRecipe: id => addRecipe(id),
    openCrafting,
    openShop: openShopPanel,
    visitShop,
    shopStatus,
    housingCap: () => housingCap(),
    recipes: RECIPES, buildings: BUILDINGS, upgradeCosts: UPG,
    // test / debug hooks
    _: { sellOnce, spawnCustomer, customerTick, runWorkers, restock, startPlacement, plPlace, plCancel, plValid, plTarget, hire, fire, craft: (id, n) => craft(recipe(id), n || 1), ensureFarmObjects, tickMachines, openJobBoard, absDay, placement: () => PL },
  };
})();
