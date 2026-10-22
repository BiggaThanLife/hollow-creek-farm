/* =====================================================================
   HOLLOW CREEK FARM — FARMING MODULE (Farm agent)
   Maps: farm, house, greenhouse. Soil, crops, seasons, weather, debris,
   trees, sprinklers, scarecrows, seeds & crop items, starting inventory.
   ===================================================================== */
(() => {
  const T = 48;
  const FW = 56, FH = 44;

  /* ---------------- crop table ---------------- */
  // seasons: 0 Spring 1 Summer 2 Fall 3 Winter. seed = suggested store price.
  const CROPS = {
    carrot:     { name: 'Carrot',     seasons: [0],    days: 4,  regrow: 0, price: 45,  seed: 20,  fb: 'carrot_crop_2', color: '#f08a24', desc: 'A crunchy, sweet root.' },
    potato:     { name: 'Potato',     seasons: [0],    days: 6,  regrow: 0, price: 80,  seed: 40,  fb: 'potato',        color: '#c9a36a', extra: 0.25, desc: 'Sometimes you dig up a few extra.' },
    cabbage:    { name: 'Cabbage',    seasons: [0],    days: 8,  regrow: 0, price: 160, seed: 70,  fb: 'cabbage_crop',  color: '#9fd36b', desc: 'Leafy and hearty.' },
    strawberry: { name: 'Strawberry', seasons: [0],    days: 8,  regrow: 4, price: 120, seed: 100, fb: 'strawberry',    color: '#e8394a', desc: 'Keeps producing every 4 days.' },
    tomato:     { name: 'Tomato',     seasons: [1],    days: 11, regrow: 4, price: 60,  seed: 50,  fb: 'tomato',        color: '#e33b2f', extra: 0.05, desc: 'Juicy. Regrows every 4 days.' },
    corn:       { name: 'Corn',       seasons: [1, 2], days: 14, regrow: 4, price: 50,  seed: 75,  fb: 'corn_plant',    color: '#f4d03f', desc: 'Grows all Summer and Fall.' },
    sunflower:  { name: 'Sunflower',  seasons: [1, 2], days: 8,  regrow: 0, price: 80,  seed: 40,  fb: 'sunflower',     color: '#f7c600', desc: 'Drops a few seeds when harvested.' },
    wheat:      { name: 'Wheat',      seasons: [1, 2], days: 4,  regrow: 0, price: 25,  seed: 10,  fb: 'wheat_bundle',  color: '#d9b45a', extra: 0.1, desc: 'Fast-growing grain.' },
    pumpkin:    { name: 'Pumpkin',    seasons: [2],    days: 13, regrow: 0, price: 320, seed: 120, fb: 'pumpkin_crop',  color: '#e8771f', desc: 'The pride of the Fall harvest.' },
  };
  const MAX_STAGE = 4;
  for (const id in CROPS) CROPS[id].id = id, CROPS[id].maxStage = MAX_STAGE;

  /* ---------------- helpers ---------------- */
  const mod = () => { const s = G.state; s.mod = s.mod || {}; return s.mod.farm || (s.mod.farm = { weather: 'sun' }); };
  const soilMap = mapId => { const d = G.world.data(mapId); return d.soil || (d.soil = {}); };
  const K = (x, y) => x + ',' + y;
  const isGreen = mapId => mapId === 'greenhouse';
  const SOIL_MAPS = ['farm', 'greenhouse'];
  const spr = name => (G.art.sprites && G.art.sprites[name]) || G.assets[name] || null;
  const cropStage = c => c.d >= c.t ? MAX_STAGE : Math.min(MAX_STAGE - 1, Math.floor(c.d / c.t * MAX_STAGE));
  const isReady = c => c && !c.dead && c.d >= c.t;
  const seasonName = () => G.SEASONS[G.state.season];
  const raining = () => G.state && mod().weather === 'rain';
  let _toastT = 0;
  const hint = (msg, icon) => { const n = performance.now(); if (n - _toastT < 900) return; _toastT = n; G.ui.toast(msg, icon); };
  const cx = x => (x + 0.5) * T, cy = y => (y + 0.5) * T;
  // seeded rng for the static layout (same map every time)
  const rng = (seed => () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; })(20240917);

  // draw a sprite bottom-aligned & horizontally centred on a footprint. returns false if missing
  function drawSpr(ctx, name, px, py, fw = 1, fh = 1, scale = 1, dx = 0, dy = 0) {
    const s = spr(name); if (!s) return false;
    const w = s.width * scale, h = s.height * scale;
    ctx.drawImage(s, Math.round(px + fw * T / 2 - w / 2 + dx), Math.round(py + fh * T - h + dy), w, h);
    return true;
  }
  const seasonalName = base => {
    const sfx = ['', '_summer', '_fall', '_winter'][G.state.season];
    return (sfx && spr(base + sfx)) ? base + sfx : base;
  };

  /* ---------------- FARM LAYOUT ---------------- */
  const HOUSE = { x: 11, y: 6, w: 5, h: 3 };      // door at (13,8)
  const DOOR = { x: HOUSE.x + 2, y: HOUSE.y + 2 };
  const SHOP = { x: 19, y: 10 };                  // 3x2 -> rows 10..11 ; front tile (20,12)
  const CRATE = { x: 22, y: 11 };
  const FIELD = { x: 10, y: 15, w: 10, h: 8 };
  const BUILD = { x: 30, y: 16, w: 20, h: 18 };
  const CAVE = { x: 26, y: 1 };                   // mine_entrance 3x3, opening (27,3)
  const ROAD_Y = 12;
  const road = new Set();
  let POND = { x: 0, y: 0, w: 0, h: 0 };

  function buildFarmGround() {
    const g = [];
    for (let y = 0; y < FH; y++) { g.push([]); for (let x = 0; x < FW; x++) g[y].push('g'); }
    const set = (x, y, ch) => { if (x >= 0 && y >= 0 && x < FW && y < FH) g[y][x] = ch; };
    // border cliffs
    for (let y = 0; y < FH; y++) for (let x = 0; x < FW; x++) if (x < 2 || x >= FW - 2 || y < 4 || y >= FH - 3) g[y][x] = 'c';
    // irregular cliff bumps
    const bumps = [[2, 4, 7, 1], [36, 4, 5, 1], [47, 4, 7, 1], [44, 5, 3, 1], [2, 40, 9, 1], [20, 40, 6, 1], [40, 40, 5, 1], [2, 30, 1, 8], [53, 20, 1, 6], [53, 34, 1, 6], [52, 37, 1, 3], [3, 39, 3, 1]];
    for (const [bx, by, bw, bh] of bumps) for (let j = 0; j < bh; j++) for (let i = 0; i < bw; i++) set(bx + i, by + j, 'c');
    // cave opening + mine path
    for (let y = 3; y < ROAD_Y; y++) { set(27, y, 'd'); road.add(K(27, y)); }
    // path from door to road
    for (let y = DOOR.y + 1; y < ROAD_Y; y++) { set(DOOR.x, y, 'p'); road.add(K(DOOR.x, y)); }
    for (let x = DOOR.x - 1; x <= DOOR.x + 1; x++) { set(x, DOOR.y + 1, 'p'); road.add(K(x, DOOR.y + 1)); }
    // the main road east (2 wide)
    for (let x = DOOR.x - 1; x < FW; x++) for (let y = ROAD_Y; y <= ROAD_Y + 1; y++) { set(x, y, 'd'); road.add(K(x, y)); }
    // pond (irregular ellipse)
    const pcx = 10.5, pcy = 32.5, rx = 4.3, ry = 3.3;
    let minx = 99, miny = 99, maxx = 0, maxy = 0;
    for (let y = 26; y < 40; y++) for (let x = 3; x < 20; x++) {
      const a = Math.atan2(y - pcy, x - pcx);
      const r = 1 + 0.13 * Math.sin(a * 3 + 1) + 0.08 * Math.cos(a * 5);
      const dx = (x + 0.5 - pcx) / rx, dy = (y + 0.5 - pcy) / ry;
      if (dx * dx + dy * dy < r) { set(x, y, 'w'); minx = Math.min(minx, x); miny = Math.min(miny, y); maxx = Math.max(maxx, x); maxy = Math.max(maxy, y); }
    }
    POND = { x: minx, y: miny, w: maxx - minx + 1, h: maxy - miny + 1 };
    // little sandy beach on the east shore
    for (let y = miny + 1; y < maxy; y++) for (let x = maxx - 1; x <= maxx + 1; x++) if (g[y][x] === 'g' && (g[y][x - 1] === 'w')) set(x, y, 's');
    // wooden dock jutting in from the north shore
    let dockX = 10, top = miny; while (top < 40 && g[top][dockX] !== 'w') top++;
    for (let i = 0; i < 3; i++) set(dockX, top + i, 'b');
    road.add(K(dockX, top - 1));
    // grass variant patches
    for (let y = 0; y < FH; y++) for (let x = 0; x < FW; x++) if (g[y][x] === 'g') {
      const n = Math.sin(x * 0.37 + 1.3) + Math.sin(y * 0.43 + 0.2) + Math.sin((x + y) * 0.19) + rng() * 0.5;
      if (n > 1.75) g[y][x] = 'G';
    }
    return g.map(r => r.join(''));
  }

  // tiles that should never get debris on new game / overnight
  function protectedTile(x, y) {
    if (road.has(K(x, y))) return true;
    if (x >= HOUSE.x - 1 && x <= HOUSE.x + HOUSE.w && y >= HOUSE.y - 1 && y <= HOUSE.y + HOUSE.h + 2) return true;
    if (x >= SHOP.x - 1 && x <= SHOP.x + 4 && y >= SHOP.y - 1 && y <= SHOP.y + 2) return true;
    if (x >= CAVE.x - 1 && x <= CAVE.x + 3 && y <= 6) return true;
    if (x >= 50 && y >= ROAD_Y - 1 && y <= ROAD_Y + 2) return true;
    if (Math.abs(x - 10) <= 1 && y >= POND.y - 2 && y < POND.y) return true; // dock approach
    if (y === ROAD_Y - 1 || y === ROAD_Y + 2) return x < 30; // keep road edges tidy near house/shop
    return false;
  }
  const inRect = (x, y, r) => x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h;

  /* ---------------- object types: debris, trees ---------------- */
  const DEBRIS = new Set(['weeds', 'twig', 'rock', 'big_stump', 'boulder', 'tree_oak', 'tree_pine', 'stump', 'sapling']);
  const shakes = {}; // uid -> time of last hit
  const hitShake = o => { shakes[o.uid] = performance.now(); };
  const shakeOff = o => { const t = shakes[o.uid]; if (!t) return 0; const e = (performance.now() - t) / 1000; if (e > 0.35) return 0; return Math.sin(e * 50) * 3 * (1 - e / 0.35); };
  const AXE_TREE = [5, 4, 3, 2, 1], PICK_ROCK = [3, 2, 2, 1, 1], AXE_STUMP = [3, 2, 2, 1, 1];
  const AXE_BIG = [99, 6, 4, 3, 2], PICK_BOULDER = [99, 99, 5, 3, 2];

  function damage(o, hits) { o.dmg = (o.dmg || 0) + 1 / hits; return o.dmg >= 0.999; }
  function giveAt(mapId, x, y, id, qty, q = 0) { if (qty > 0) G.inv.give(id, qty, q); }
  const wm = () => G.workMult();
  const yieldN = (a, b) => Math.max(1, Math.round(G.randInt(a, b) * wm()));

  function cutWeeds(mapId, o) {
    G.world.removeObject(mapId, o);
    G.fx.burst(cx(o.x), cy(o.y), '#5f9e35', 8, 4);
    G.inv.give('fiber', 1);
    if (G.chance(0.05)) {
      const s = G.state.season; const opts = Object.values(CROPS).filter(c => c.seasons.includes(s));
      if (opts.length) G.inv.give('seeds_' + G.pick(opts).id, 1);
    }
    G.addXP('foraging', 1);
  }

  function fallbackTree(ctx, kind, px, py, season) {
    const bx = px + 24;
    ctx.fillStyle = '#6b4226'; ctx.fillRect(bx - 7, py - 30, 14, 72);
    ctx.fillStyle = 'rgba(0,0,0,0.2)'; ctx.beginPath(); ctx.ellipse(bx, py + 42, 22, 7, 0, 0, 7); ctx.fill();
    if (kind === 'pine') {
      ctx.fillStyle = season === 3 ? '#cfe0e6' : '#2f6b3a';
      for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.moveTo(bx, py - 90 + i * 30); ctx.lineTo(bx - 34 + i * -3, py - 20 + i * 18); ctx.lineTo(bx + 34 + i * 3, py - 20 + i * 18); ctx.fill(); }
    } else {
      if (season === 3) { ctx.strokeStyle = '#6b4226'; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(bx, py - 20); ctx.lineTo(bx - 22, py - 60); ctx.moveTo(bx, py - 30); ctx.lineTo(bx + 20, py - 70); ctx.stroke(); return; }
      const col = season === 2 ? ['#c8661f', '#e09a2c'] : ['#3d8b37', '#56a845'];
      ctx.fillStyle = col[0]; ctx.beginPath(); ctx.arc(bx - 18, py - 40, 26, 0, 7); ctx.arc(bx + 18, py - 40, 26, 0, 7); ctx.arc(bx, py - 66, 30, 0, 7); ctx.fill();
      ctx.fillStyle = col[1]; ctx.beginPath(); ctx.arc(bx - 8, py - 70, 14, 0, 7); ctx.arc(bx + 14, py - 50, 10, 0, 7); ctx.fill();
    }
  }

  function defDebris() {
    G.defObj('weeds', {
      label: () => 'Weeds',
      draw(ctx, o, px, py) {
        const n = ['weeds', 'weeds2', 'weeds3'][o.v || 0];
        if (drawSpr(ctx, n, px + shakeOff(o), py) || drawSpr(ctx, 'weeds', px + shakeOff(o), py)) return;
        ctx.fillStyle = G.state.season === 2 ? '#a9822f' : '#3f7f2a';
        for (let i = 0; i < 5; i++) { const x = px + 10 + i * 7, h = 14 + ((i * 7 + (o.v || 0) * 3) % 10); ctx.beginPath(); ctx.moveTo(x - 4, py + 40); ctx.lineTo(x, py + 40 - h); ctx.lineTo(x + 4, py + 40); ctx.fill(); }
      },
      onTool(o, tool, tier, ctx) {
        if (tool === 'fishing_rod') return false;
        if (G.fumble()) return true;
        if (tool === 'scythe') { scytheArea(ctx.map, o.x, o.y, tier); return true; }
        G.sfx('hit'); cutWeeds(ctx.map, o); return true;
      },
    });
    G.defObj('twig', {
      label: () => 'Twig',
      draw(ctx, o, px, py) {
        if (drawSpr(ctx, 'twig', px + shakeOff(o), py)) return;
        ctx.strokeStyle = '#7a5230'; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(px + 8, py + 34); ctx.lineTo(px + 40, py + 26); ctx.moveTo(px + 24, py + 30); ctx.lineTo(px + 30, py + 18); ctx.stroke();
      },
      onTool(o, tool, tier, ctx) {
        if (tool !== 'axe' && tool !== 'scythe' && tool !== 'pickaxe') return false;
        if (G.fumble()) return true;
        if (tool === 'scythe') { G.sfx('hit'); hitShake(o); return true; }
        G.sfx('chop'); G.world.removeObject(ctx.map, o); G.fx.burst(cx(o.x), cy(o.y), '#8a5a2b', 8, 4);
        G.inv.give('wood', yieldN(1, 2)); G.addXP('foraging', 1); return true;
      },
    });
    G.defObj('rock', {
      label: () => 'Rock',
      draw(ctx, o, px, py) {
        if (drawSpr(ctx, o.v ? 'rock2' : 'rock', px + shakeOff(o), py) || drawSpr(ctx, 'rock', px + shakeOff(o), py)) return;
        ctx.fillStyle = '#7d7a75'; ctx.beginPath(); ctx.ellipse(px + 24 + shakeOff(o), py + 30, 17, 13, 0, 0, 7); ctx.fill();
        ctx.fillStyle = '#a19d96'; ctx.beginPath(); ctx.ellipse(px + 19 + shakeOff(o), py + 25, 8, 5, 0, 0, 7); ctx.fill();
      },
      onTool(o, tool, tier, ctx) {
        if (tool !== 'pickaxe') { if (tool === 'axe' || tool === 'hoe') { G.sfx('hit'); hitShake(o); hint('Use the pickaxe on rocks.', 'pickaxe'); return true; } return false; }
        if (G.fumble()) return true;
        hitShake(o); G.fx.burst(cx(o.x), cy(o.y), '#9a958c', 5, 4);
        if (!damage(o, PICK_ROCK[tier])) { G.sfx('hit'); return true; }
        G.sfx('break'); G.world.removeObject(ctx.map, o); G.fx.burst(cx(o.x), cy(o.y), '#8b8680', 12, 5);
        G.inv.give('stone', yieldN(1, 3)); if (G.chance(0.05)) G.inv.give('coal', 1);
        G.addXP('mining', 1); return true;
      },
    });
    G.defObj('big_stump', {
      w: 2, h: 2, label: () => 'Large Stump',
      draw(ctx, o, px, py) {
        if (drawSpr(ctx, 'big_stump', px + shakeOff(o), py, 2, 2)) return;
        ctx.fillStyle = '#5e3a1e'; ctx.beginPath(); ctx.ellipse(px + 48, py + 62, 38, 26, 0, 0, 7); ctx.fill();
        ctx.fillStyle = '#b48552'; ctx.beginPath(); ctx.ellipse(px + 48, py + 52, 32, 18, 0, 0, 7); ctx.fill();
        ctx.strokeStyle = '#8a5f35'; ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(px + 48, py + 52, 18, 10, 0, 0, 7); ctx.stroke();
      },
      onTool(o, tool, tier, ctx) {
        if (tool !== 'axe') { if (tool === 'pickaxe' || tool === 'hoe') { G.sfx('hit'); hitShake(o); } return tool === 'pickaxe' || tool === 'hoe'; }
        if (tier < 1) { G.sfx('error'); hitShake(o); hint('This stump is too tough. You need a Copper Axe (Blacksmith).', 'axe'); return true; }
        if (G.fumble()) return true;
        hitShake(o); G.fx.burst(cx(o.x + 0.5), cy(o.y + 0.5), '#8a5a2b', 6, 4);
        if (!damage(o, AXE_BIG[tier])) { G.sfx('chop'); return true; }
        G.sfx('break'); G.world.removeObject(ctx.map, o); G.fx.burst(cx(o.x + 0.5), cy(o.y + 0.5), '#6b4226', 18, 5);
        G.inv.give('hardwood', yieldN(2, 4)); G.addXP('foraging', 12); return true;
      },
    });
    G.defObj('boulder', {
      w: 2, h: 2, label: () => 'Boulder',
      draw(ctx, o, px, py) {
        if (drawSpr(ctx, 'boulder', px + shakeOff(o), py, 2, 2)) return;
        ctx.fillStyle = '#6e6a64'; ctx.beginPath(); ctx.ellipse(px + 48, py + 56, 42, 34, 0, 0, 7); ctx.fill();
        ctx.fillStyle = '#8f8a83'; ctx.beginPath(); ctx.ellipse(px + 38, py + 44, 22, 14, 0, 0, 7); ctx.fill();
      },
      onTool(o, tool, tier, ctx) {
        if (tool !== 'pickaxe') { if (tool === 'axe' || tool === 'hoe') { G.sfx('hit'); hitShake(o); return true; } return false; }
        if (tier < 2) { G.sfx('error'); hitShake(o); hint('This boulder is too hard. You need an Iron Pickaxe.', 'pickaxe'); return true; }
        if (G.fumble()) return true;
        hitShake(o); G.fx.burst(cx(o.x + 0.5), cy(o.y + 0.5), '#9a958c', 6, 4);
        if (!damage(o, PICK_BOULDER[tier])) { G.sfx('hit'); return true; }
        G.sfx('break'); G.world.removeObject(ctx.map, o); G.fx.burst(cx(o.x + 0.5), cy(o.y + 0.5), '#8b8680', 20, 6);
        G.inv.give('stone', yieldN(10, 15)); if (G.chance(0.3)) G.inv.give('coal', 1); if (G.chance(0.15)) G.inv.give('copper_ore', G.randInt(1, 3));
        G.addXP('mining', 12); return true;
      },
    });
    const treeDef = kind => ({
      label: () => kind === 'oak' ? 'Oak Tree' : 'Pine Tree', sortY: -2,
      draw(ctx, o, px, py) {
        const off = shakeOff(o);
        if (drawSpr(ctx, seasonalName('tree_' + kind), px + off, py)) return;
        fallbackTree(ctx, kind, px + off, py, G.state.season);
      },
      onTool(o, tool, tier, ctx) {
        if (tool !== 'axe') { if (tool === 'pickaxe' || tool === 'hoe' || tool === 'scythe') { G.sfx('hit'); hitShake(o); return true; } return false; }
        if (G.fumble()) return true;
        hitShake(o); G.fx.burst(cx(o.x), cy(o.y) - 10, '#a0703c', 6, 4);
        if (G.state.season !== 3 && G.chance(0.5)) G.fx.burst(cx(o.x), cy(o.y) - 70, kind === 'pine' ? '#2f6b3a' : (G.state.season === 2 ? '#d9822b' : '#4c9a3f'), 5, 4);
        if (!damage(o, AXE_TREE[tier])) { G.sfx('chop'); return true; }
        // timber!
        G.sfx('break'); G.fx.burst(cx(o.x), cy(o.y) - 40, '#4c9a3f', 24, 5); G.fx.float('Timber!', cx(o.x), cy(o.y) - 60, '#ffe39a');
        G.world.removeObject(ctx.map, o);
        G.world.addObject(ctx.map, { type: 'stump', x: o.x, y: o.y, kind });
        G.inv.give('wood', yieldN(8, 12)); G.inv.give('sap', G.randInt(1, 2));
        if (G.chance(0.35)) G.inv.give(kind === 'oak' ? 'acorn' : 'pine_cone', 1);
        G.addXP('foraging', 10); return true;
      },
    });
    G.defObj('tree_oak', treeDef('oak'));
    G.defObj('tree_pine', treeDef('pine'));
    G.defObj('stump', {
      label: () => 'Stump',
      draw(ctx, o, px, py) {
        if (drawSpr(ctx, 'stump', px + shakeOff(o), py)) return;
        ctx.fillStyle = '#5e3a1e'; ctx.fillRect(px + 10, py + 22, 28, 20); ctx.fillStyle = '#b48552'; ctx.beginPath(); ctx.ellipse(px + 24, py + 22, 14, 7, 0, 0, 7); ctx.fill();
      },
      onTool(o, tool, tier, ctx) {
        if (tool !== 'axe') return false;
        if (G.fumble()) return true;
        hitShake(o); G.fx.burst(cx(o.x), cy(o.y), '#8a5a2b', 5, 4);
        if (!damage(o, AXE_STUMP[tier])) { G.sfx('chop'); return true; }
        G.sfx('break'); G.world.removeObject(ctx.map, o);
        G.inv.give('wood', yieldN(2, 4)); G.addXP('foraging', 2); return true;
      },
    });
    G.defObj('sapling', {
      label: o => (o.kind === 'pine' ? 'Pine' : 'Oak') + ' Sapling (' + Math.max(0, 10 - (o.age || 0)) + ' days)',
      draw(ctx, o, px, py) {
        const big = (o.age || 0) >= 5;
        if (drawSpr(ctx, 'tree_sapling', px, py, 1, 1, big ? 1.4 : 1) || drawSpr(ctx, 'apple_tree_sapling', px, py, 1, 1, big ? 1.4 : 1)) return;
        ctx.fillStyle = '#6b4226'; ctx.fillRect(px + 22, py + 18, 4, 24); ctx.fillStyle = '#4c9a3f'; ctx.beginPath(); ctx.arc(px + 24, py + 18, big ? 12 : 8, 0, 7); ctx.fill();
      },
      onTool(o, tool, tier, ctx) {
        if (tool !== 'axe' && tool !== 'pickaxe' && tool !== 'hoe') return false;
        if (G.fumble()) return true;
        G.sfx('dig'); G.world.removeObject(ctx.map, o);
        G.inv.give(o.kind === 'pine' ? 'pine_cone' : 'acorn', 1); return true;
      },
    });
  }

  /* ---------------- structures, decor, furniture ---------------- */
  function defStructures() {
    G.defObj('farmhouse', {
      w: 5, h: 3,
      solid: (o, x, y) => !(x === o.x + 2 && y === o.y + 2),
      label: () => 'Farmhouse',
      draw(ctx, o, px, py) {
        if (drawSpr(ctx, 'farmhouse', px, py, 5, 3)) return;
        ctx.fillStyle = '#c9a26b'; ctx.fillRect(px + 6, py + 20, 228, 124);
        ctx.fillStyle = '#9b3b2e'; ctx.beginPath(); ctx.moveTo(px - 8, py + 30); ctx.lineTo(px + 120, py - 80); ctx.lineTo(px + 248, py + 30); ctx.fill();
        ctx.fillStyle = '#5b3c22'; ctx.fillRect(px + 100, py + 92, 40, 52);
        ctx.fillStyle = '#ffe9a8'; ctx.fillRect(px + 30, py + 60, 36, 30); ctx.fillRect(px + 174, py + 60, 36, 30);
        ctx.strokeStyle = '#5b3c22'; ctx.lineWidth = 3; ctx.strokeRect(px + 30, py + 60, 36, 30); ctx.strokeRect(px + 174, py + 60, 36, 30);
      },
    });
    G.defObj('mine_entrance', {
      w: 3, h: 3, solid: false, sortY: -200, label: () => 'Old Mine',
      draw(ctx, o, px, py) {
        if (drawSpr(ctx, 'mine_entrance', px, py, 3, 3)) return;
        ctx.fillStyle = '#4a4036'; ctx.beginPath(); ctx.moveTo(px + 20, py + 144); ctx.lineTo(px + 20, py + 70); ctx.quadraticCurveTo(px + 72, py + 10, px + 124, py + 70); ctx.lineTo(px + 124, py + 144); ctx.fill();
        ctx.fillStyle = '#120d09'; ctx.beginPath(); ctx.moveTo(px + 50, py + 144); ctx.lineTo(px + 50, py + 96); ctx.quadraticCurveTo(px + 72, py + 66, px + 94, py + 96); ctx.lineTo(px + 94, py + 144); ctx.fill();
        ctx.fillStyle = '#7a5230'; ctx.fillRect(px + 44, py + 86, 8, 58); ctx.fillRect(px + 92, py + 86, 8, 58); ctx.fillRect(px + 40, py + 80, 64, 9);
      },
    });
    // generic decor: o.spr, o.s (scale), o.walk (non-solid), o.kind for interactions
    G.defObj('decor', {
      solid: o => !o.walk,
      label: o => o.name || '',
      draw(ctx, o, px, py) {
        const s = G.world.size(o);
        if (o.spr === 'mailbox') {
          ctx.fillStyle = '#6b4226'; ctx.fillRect(px + 21, py + 18, 6, 26);
          ctx.fillStyle = '#3d6fb5'; ctx.fillRect(px + 10, py + 6, 28, 16); ctx.beginPath(); ctx.arc(px + 24, py + 6, 14, Math.PI, 0); ctx.fill();
          ctx.fillStyle = '#d33'; ctx.fillRect(px + 36, py - 4, 4, 14);
          return;
        }
        if (!drawSpr(ctx, o.spr, px, py, s.w, s.h, o.s || 1)) ctx.drawImage(G.sprite(o.spr), px, py);
      },
      interact(o) {
        if (o.kind === 'sign') { G.ui.dialog('Sign', `<b>${G.ui.esc(G.state.farmName || 'Hollow Creek')} Farm</b><br>Owner: ${G.ui.esc(G.state.name)}`); return true; }
        if (o.kind === 'mailbox') { G.ui.dialog('Mailbox', G.pick(['No mail today. Just a curious snail.', 'Empty. Someone has left a pressed flower inside, though.', 'Nothing but a seed catalogue. Check the bookshelf at home for a crop calendar!'])); return true; }
        if (o.kind === 'well') { G.ui.toast('The water is cool and clear. (Your watering can never runs dry.)', 'watering_can'); G.sfx('water'); return true; }
        return false;
      },
    });
    G.defObj('furn', {
      label: o => o.name || '',
      solid: o => !o.walk,
      draw(ctx, o, px, py) { const s = G.world.size(o); drawSpr(ctx, o.spr, px, py, s.w, s.h, o.s || 1, 0, o.dy || 0) || ctx.drawImage(G.sprite(o.spr), px, py); },
      interact(o) {
        if (o.kind === 'fire') { G.ui.toast('The fire crackles warmly.', 'fireplace'); return true; }
        if (o.kind === 'chair') { G.ui.toast(G.pick(['You rock gently for a moment. Ahh.', 'A good spot to plan tomorrow.']), 'rocking_chair'); return true; }
        return false;
      },
    });
    G.defObj('bed', {
      w: 2, h: 2, label: () => 'Bed',
      draw(ctx, o, px, py) { drawSpr(ctx, 'farm_bed', px, py, 2, 2, 2) || ctx.drawImage(G.sprite('farm_bed'), px, py); },
      interact() { G.ui.sleepMenu(); return true; },
    });
    G.defObj('bookshelf', {
      w: 2, h: 1, label: () => 'Bookshelf',
      draw(ctx, o, px, py) { drawSpr(ctx, 'bookshelf2', px, py, 2, 1, 2, 0, 6) || ctx.drawImage(G.sprite('bookshelf2'), px, py); },
      interact() { cropCalendar(); return true; },
    });
  }

  /* ---------------- placeables ---------------- */
  const PLACE = {
    sprinkler: { name: 'Sprinkler', price: 100, desc: 'Waters the 4 adjacent tiles every morning.', range: 's4' },
    quality_sprinkler: { name: 'Quality Sprinkler', price: 225, desc: 'Waters the 8 surrounding tiles every morning.', range: 's8' },
    iridium_sprinkler: { name: 'Iridium Sprinkler', price: 500, desc: 'Waters a 5×5 area every morning.', range: 's24' },
    scarecrow: { name: 'Scarecrow', price: 50, desc: 'Keeps crows away from crops within 8 tiles.' },
  };
  function sprinklerTiles(o) {
    const r = PLACE[o.type].range, out = [];
    if (r === 's4') for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) out.push([o.x + dx, o.y + dy]);
    else { const n = r === 's8' ? 1 : 2; for (let dy = -n; dy <= n; dy++) for (let dx = -n; dx <= n; dx++) if (dx || dy) out.push([o.x + dx, o.y + dy]); }
    return out;
  }
  function defPlaceables() {
    for (const [type, p] of Object.entries(PLACE)) {
      G.defObj(type, {
        label: () => p.name,
        draw(ctx, o, px, py) {
          if (drawSpr(ctx, type, px, py)) return;
          if (type === 'scarecrow') {
            ctx.fillStyle = '#7a5230'; ctx.fillRect(px + 22, py - 30, 5, 72); ctx.fillRect(px + 6, py - 14, 36, 5);
            ctx.fillStyle = '#d9b45a'; ctx.beginPath(); ctx.arc(px + 24, py - 30, 10, 0, 7); ctx.fill();
            ctx.fillStyle = '#7a3b2e'; ctx.fillRect(px + 12, py - 44, 24, 6); ctx.fillRect(px + 17, py - 54, 14, 10);
            ctx.fillStyle = '#5577aa'; ctx.fillRect(px + 15, py - 12, 18, 22);
          } else {
            const col = { sprinkler: '#9a9a9a', quality_sprinkler: '#d6b54a', iridium_sprinkler: '#9a6ad6' }[type];
            ctx.fillStyle = '#555'; ctx.fillRect(px + 20, py + 26, 8, 14);
            ctx.fillStyle = col; ctx.beginPath(); ctx.arc(px + 24, py + 24, 9, 0, 7); ctx.fill();
            ctx.fillStyle = '#6cf'; ctx.fillRect(px + 22, py + 14, 4, 6);
          }
        },
        onTool(o, tool, tier, ctx) {
          if (tool !== 'pickaxe' && tool !== 'axe') return false;
          G.sfx('hit'); G.world.removeObject(ctx.map, o); G.inv.give(type, 1); return true;
        },
        interact(o) { G.ui.toast(p.name + ': ' + p.desc + ' (hit with pickaxe to pick up)', type); return true; },
      });
    }
  }

  /* ---------------- soil & crops ---------------- */
  function isTillable(mapId, x, y) {
    const m = G.maps[mapId]; if (!m) return false;
    const ch = G.world.ground(mapId, x, y);
    if (mapId === 'greenhouse') { if (ch !== 'd') return false; }
    else if (mapId === 'farm') { if (!'gGd'.includes(ch) || road.has(K(x, y))) return false; }
    else return false;
    if (G.world.objectAt(mapId, x, y)) return false;
    if (soilMap(mapId)[K(x, y)]) return false;
    for (const w of m.warps || []) if (x >= w.x && x < w.x + (w.w || 1) && y >= w.y && y < w.y + (w.h || 1)) return false;
    return true;
  }
  function soilAt(mapId, x, y) {
    if (!SOIL_MAPS.includes(mapId)) return null;
    const s = soilMap(mapId)[K(x, y)]; if (!s) return null;
    const out = { tilled: true, watered: !!s.w, fertilized: !!s.f };
    if (s.c) out.crop = { id: s.c.id, stage: s.c.dead ? 0 : cropStage(s.c), maxStage: MAX_STAGE, ready: isReady(s.c), dead: !!s.c.dead, days: s.c.d, total: s.c.t };
    return out;
  }
  function till(mapId, x, y) {
    if (!isTillable(mapId, x, y)) return false;
    soilMap(mapId)[K(x, y)] = { w: (!isGreen(mapId) && raining()) ? 1 : 0 };
    G.fx.burst(cx(x), cy(y), '#7a5432', 5, 4);
    if (G.chance(0.08)) { G.inv.give('worm', 1); G.fx.float('worm!', cx(x), cy(y) - 20, '#f6b'); }
    else if (G.chance(0.03)) G.inv.give('clay', 1);
    return true;
  }
  function inSeason(cropId, mapId) { return isGreen(mapId) || CROPS[cropId].seasons.includes(G.state.season); }
  function plant(mapId, x, y, cropId, silent = true) {
    const crop = CROPS[cropId]; if (!crop) return false;
    const s = soilMap(mapId)[K(x, y)];
    if (!s || s.c) return false;
    if (!inSeason(cropId, mapId)) return false;
    s.c = { id: cropId, d: 0, t: s.sg ? Math.max(1, Math.ceil(crop.days * 0.75)) : crop.days };
    if (s.sg) s.c.sg = 1;
    return true;
  }
  /** harvest the crop on a tile. who: 'player' | 'worker'. returns [{id,qty,q}] or null */
  function harvestTile(mapId, x, y, who = 'player') {
    const s = soilMap(mapId)[K(x, y)]; if (!s || !isReady(s.c)) return null;
    const crop = CROPS[s.c.id]; if (!crop) { delete s.c; return null; }
    const player = who === 'player';
    const fert = s.f ? 0.5 : 0;
    const q = player ? G.rollQuality(G.skillLvl('farming'), fert) : G.rollQuality(G.skillLvl('farming') * 0.5, fert);
    let qty = 1;
    if (crop.extra) { let n = 0; while (n < 3 && G.chance(crop.extra * (player ? wm() : 1))) { qty++; n++; } }
    const out = [{ id: crop.id, qty, q }];
    if (crop.id === 'sunflower') { const n = G.chance(0.6 * (player ? wm() : 1)) ? G.randInt(1, 2) : 0; if (n) out.push({ id: 'seeds_sunflower', qty: n, q: 0 }); }
    if (crop.regrow) { s.c.d = Math.max(0, s.c.t - crop.regrow); s.c.h = (s.c.h || 0) + 1; }
    else delete s.c;
    G.state.stats.cropsHarvested += qty;
    if (player) {
      for (const r of out) G.inv.give(r.id, r.qty, r.q);
      G.addXP('farming', Math.max(3, Math.round(crop.price / 8)));
      G.sfx('pickup'); G.fx.burst(cx(x), cy(y) - 10, crop.color, 8, 4);
      if (G.fatigue().qShift < 0) G.fx.float('(tired)', cx(x), cy(y) - 40, '#9a9a9a');
      else if (q >= 2) G.fx.float(q === 3 ? '★ Iridium!' : '★ Gold!', cx(x), cy(y) - 40, q === 3 ? '#c9a0ff' : '#ffd84a');
    }
    return out;
  }
  function water(mapId, x, y) { const s = soilMap(mapId)[K(x, y)]; if (!s) return false; const was = s.w; s.w = 1; return !was; }

  function areaTiles(tx, ty, tier, dir) {
    const f = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] }[dir] || [0, 1];
    const l = [f[1], f[0]];
    const out = [];
    const cfg = [[1, 0], [3, 0], [5, 0], [3, 1], [6, 1]][G.clamp(tier, 0, 4)];
    for (let i = 0; i < cfg[0]; i++) for (let j = -cfg[1]; j <= cfg[1]; j++) out.push([tx + f[0] * i + l[0] * j, ty + f[1] * i + l[1] * j]);
    return out;
  }
  function scytheArea(mapId, tx, ty, tier) {
    const r = [0, 1, 1, 2, 2][G.clamp(tier, 0, 4)];
    let did = 0;
    G.sfx('hit');
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      const x = tx + dx, y = ty + dy;
      const o = G.world.objectAt(mapId, x, y);
      if (o && o.type === 'weeds') { cutWeeds(mapId, o); did++; continue; }
      if (SOIL_MAPS.includes(mapId)) {
        const s = soilMap(mapId)[K(x, y)];
        if (s && s.c && s.c.dead) { delete s.c; G.fx.burst(cx(x), cy(y), '#8a6a3a', 5, 3); did++; }
        else if (s && isReady(s.c)) { harvestTile(mapId, x, y, 'player'); did++; }
      }
    }
    for (let i = 0; i < 4; i++) G.fx.burst(cx(tx) + G.rand(-20, 20), cy(ty), '#9fd36b', 1, 3);
    return did;
  }

  // map.useTile for soil maps (hoe / can / scythe / pickaxe / bare hand)
  function useTile(ctx) {
    const mapId = ctx.map, it = ctx.item, x = ctx.x, y = ctx.y;
    const s = soilMap(mapId)[K(x, y)];
    if (!it || it.cat !== 'tool') {
      if (s && isReady(s.c)) { harvestTile(mapId, x, y, 'player'); return true; }
      return false;
    }
    const tool = it.id, tier = ctx.tier || 0, dir = G.player.dir;
    if (tool === 'hoe') {
      if (G.fumble()) return true;
      let n = 0; for (const [ax, ay] of areaTiles(x, y, tier, dir)) if (till(mapId, ax, ay)) n++;
      if (n) { G.sfx('dig'); G.addXP('farming', n > 3 ? 1 : 0); }
      else {
        G.sfx('hit');
        if (mapId === 'farm' && road.has(K(x, y))) hint("The road is packed too hard to till.");
        else if (s && s.c && s.c.dead) { delete s.c; G.sfx('dig'); }
      }
      return true;
    }
    if (tool === 'watering_can') {
      if (G.fumble()) return true;
      let n = 0;
      for (const [ax, ay] of areaTiles(x, y, tier, dir)) {
        G.fx.burst(cx(ax), cy(ay) - 6, '#7fc8ff', 4, 3);
        if (water(mapId, ax, ay)) n++;
      }
      G.sfx('water');
      return true;
    }
    if (tool === 'scythe') { if (G.fumble()) return true; scytheArea(mapId, x, y, tier); return true; }
    if (tool === 'pickaxe' && s) {
      if (G.fumble()) return true;
      if (s.c && !s.c.dead) { hint('Careful! There is a crop growing there.'); return true; }
      delete soilMap(mapId)[K(x, y)]; G.sfx('dig'); G.fx.burst(cx(x), cy(y), '#7a5432', 5, 4); return true;
    }
    return false;
  }
  function interactTile(mapId, x, y) {
    const s = soilMap(mapId)[K(x, y)];
    if (s && isReady(s.c)) { harvestTile(mapId, x, y, 'player'); return true; }
    if (s && s.c && !s.c.dead) {
      const c = s.c, crop = CROPS[c.id];
      hint(`${crop.name}: ${Math.max(0, c.t - c.d)} day(s) left${s.w ? '' : ' — needs water!'}`, crop.id);
      return true;
    }
    if (s && s.c && s.c.dead) { hint('This crop withered. Clear it with the scythe or hoe.'); return true; }
    return false;
  }

  /* ---------------- drawing soil, crops, weather ---------------- */
  function drawSoilLayer(mapId, ctx, cam) {
    const soil = soilMap(mapId), m = G.maps[mapId];
    const x0 = Math.floor(cam.x / T) - 1, y0 = Math.floor(cam.y / T) - 1, x1 = x0 + Math.ceil(cam.w / T) + 2, y1 = y0 + Math.ceil(cam.h / T) + 2;
    for (const k in soil) {
      const i = k.indexOf(','), x = +k.slice(0, i), y = +k.slice(i + 1);
      if (x < x0 || x > x1 || y < y0 || y > y1) continue;
      const s = soil[k], sx = x * T - cam.x, sy = y * T - cam.y;
      let ok = false;
      if (G.art.drawSoil) { try { G.art.drawSoil(ctx, sx, sy, !!s.w, m, x, y); ok = true; } catch (e) { } }
      if (!ok) {
        ctx.fillStyle = s.w ? '#4a3220' : '#8a603a'; ctx.fillRect(sx + 2, sy + 2, T - 4, T - 4);
        ctx.fillStyle = s.w ? '#3a2618' : '#76502f'; for (let r = 0; r < 3; r++) ctx.fillRect(sx + 6, sy + 10 + r * 13, T - 12, 3);
      }
      if (s.f) { ctx.fillStyle = 'rgba(160,190,255,0.55)'; for (let r = 0; r < 5; r++) ctx.fillRect(sx + 8 + (r * 13) % 32, sy + 8 + (r * 17) % 30, 3, 3); }
    }
  }
  function drawCropAt(ctx, c, sx, sy, now) {
    if (c.dead) {
      ctx.strokeStyle = '#7a6040'; ctx.lineWidth = 3; ctx.beginPath();
      ctx.moveTo(sx + 24, sy + 40); ctx.lineTo(sx + 22, sy + 20); ctx.lineTo(sx + 12, sy + 26); ctx.moveTo(sx + 23, sy + 28); ctx.lineTo(sx + 34, sy + 22); ctx.stroke();
      return;
    }
    const stage = cropStage(c), crop = CROPS[c.id];
    if (G.art.drawCrop) { try { G.art.drawCrop(ctx, c.id, stage, MAX_STAGE, sx, sy, now); return; } catch (e) { } }
    const sway = Math.sin(now * 2 + sx * 0.05) * 1.5;
    if (stage >= MAX_STAGE) { const img = G.assets[crop.fb] || G.icon(c.id); ctx.drawImage(img, sx, sy - 8, 48, 48); return; }
    ctx.fillStyle = '#4c9a3f';
    if (stage === 0) { ctx.fillStyle = '#5b3a22'; ctx.fillRect(sx + 18, sy + 28, 4, 4); ctx.fillRect(sx + 26, sy + 30, 4, 4); ctx.fillStyle = '#7dc35b'; ctx.fillRect(sx + 23, sy + 24, 3, 6); return; }
    const h = 8 + stage * 7;
    ctx.fillRect(sx + 23, sy + 38 - h, 3, h);
    for (let i = 0; i < stage + 1; i++) { const yy = sy + 38 - h * (i + 1) / (stage + 2); ctx.beginPath(); ctx.ellipse(sx + 24 + (i % 2 ? 6 : -6) + sway, yy, 7, 3.5, i % 2 ? 0.4 : -0.4, 0, 7); ctx.fill(); }
    if (stage === 3) { ctx.fillStyle = crop.color; ctx.beginPath(); ctx.arc(sx + 24 + sway, sy + 38 - h, 4, 0, 7); ctx.fill(); }
  }
  function collectCrops(mapId, list, cam) {
    const soil = soilMap(mapId), now = performance.now() / 1000;
    const x0 = Math.floor(cam.x / T) - 1, y0 = Math.floor(cam.y / T) - 1, x1 = x0 + Math.ceil(cam.w / T) + 2, y1 = y0 + Math.ceil(cam.h / T) + 3;
    for (const k in soil) {
      const s = soil[k]; if (!s.c) continue;
      const i = k.indexOf(','), x = +k.slice(0, i), y = +k.slice(i + 1);
      if (x < x0 || x > x1 || y < y0 || y > y1) continue;
      list.push({ y: (y + 1) * T - 6, draw: c => drawCropAt(c, s.c, x * T - G.cam.x, y * T - G.cam.y, now) });
    }
  }
  function drawWeather(ctx, cam) {
    const w = mod().weather, now = performance.now() / 1000;
    if (w === 'rain') {
      ctx.fillStyle = 'rgba(30,50,90,0.16)'; ctx.fillRect(0, 0, cam.w, cam.h);
      ctx.strokeStyle = 'rgba(190,215,255,0.55)'; ctx.lineWidth = 1.5; ctx.beginPath();
      for (let i = 0; i < 140; i++) {
        const sp = 700 + (i * 37) % 300, x = ((i * 97.3 + now * 120) % (cam.w + 60)) - 30, y = ((i * 53.7 + now * sp) % (cam.h + 40)) - 20;
        ctx.moveTo(x, y); ctx.lineTo(x - 5, y + 16);
      }
      ctx.stroke();
    } else if (w === 'snow') {
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      for (let i = 0; i < 110; i++) {
        const x = ((i * 89.1 + Math.sin(now + i) * 20 + now * 15) % (cam.w + 20)) - 10, y = ((i * 61.3 + now * (40 + i % 30)) % (cam.h + 20)) - 10;
        ctx.fillRect(x, y, 3, 3);
      }
    }
  }

  /* ---------------- items ---------------- */
  function defItems() {
    const iconFor = (id, fb) => (G.art.icons[id] || G.assets[id]) ? id : fb;
    for (const c of Object.values(CROPS)) {
      if (!G.items[c.id]) G.defItem({ id: c.id, name: c.name, icon: iconFor(c.id, c.fb), price: c.price, cat: 'crop', desc: c.desc });
      G.defItem({
        id: 'seeds_' + c.id, name: c.name + ' Seeds', icon: 'seeds_' + c.id, price: Math.floor(c.seed / 2), cat: 'seed',
        desc: `Plant in tilled soil. ${c.seasons.map(s => G.SEASONS[s]).join('/')} · ${c.days} days${c.regrow ? ' · regrows every ' + c.regrow : ''}. Sells for ${c.price}g.`,
        crop: c.id, buyPrice: c.seed,
        use: ctx => useSeed(ctx, c.id),
      });
    }
    G.defItem({ id: 'fertilizer', name: 'Fertilizer', price: 2, cat: 'craftable', desc: 'Apply to tilled soil to improve the quality of the crop grown there.', use: ctx => useSoilBooster(ctx, 'f') });
    G.defItem({ id: 'speed_gro', name: 'Speed-Gro', price: 20, cat: 'craftable', desc: 'Apply to tilled soil: crops grow 25% faster.', use: ctx => useSoilBooster(ctx, 'sg') });
    for (const [id, p] of Object.entries(PLACE)) G.defItem({ id, name: p.name, price: p.price, cat: 'craftable', desc: p.desc + ' Place it on the ground.', place: id, use: ctx => usePlaceable(ctx, id) });
    G.defItem({ id: 'acorn', name: 'Acorn', price: 5, cat: 'seed', desc: 'Plant on the farm to grow an oak tree (~10 days).', use: ctx => useTreeSeed(ctx, 'oak') });
    G.defItem({ id: 'pine_cone', name: 'Pine Cone', price: 5, cat: 'seed', desc: 'Plant on the farm to grow a pine tree (~10 days).', use: ctx => useTreeSeed(ctx, 'pine') });
  }
  function useSeed(ctx, cropId) {
    if (!SOIL_MAPS.includes(ctx.map)) return false;
    const crop = CROPS[cropId], s = soilMap(ctx.map)[K(ctx.x, ctx.y)];
    if (ctx.obj) return false;
    if (!s) { hint('Till the soil with your hoe first.', 'hoe'); return true; }
    if (s.c) { if (isReady(s.c)) { harvestTile(ctx.map, ctx.x, ctx.y, 'player'); return true; } return false; }
    if (!inSeason(cropId, ctx.map)) {
      hint(G.state.season === 3 ? `Nothing grows outdoors in Winter. Try a greenhouse!` : `${crop.name} won't grow in ${seasonName()}.`, 'seeds_' + cropId);
      G.sfx('error'); return true;
    }
    plant(ctx.map, ctx.x, ctx.y, cropId);
    G.inv.removeSlot(ctx.slotIndex, 1); G.sfx('dig'); G.fx.burst(cx(ctx.x), cy(ctx.y), '#5b3a22', 4, 3);
    return true;
  }
  function useSoilBooster(ctx, key) {
    if (!SOIL_MAPS.includes(ctx.map)) return false;
    const s = soilMap(ctx.map)[K(ctx.x, ctx.y)];
    if (!s) { hint('Apply it to tilled soil.', 'hoe'); return true; }
    if (s[key]) { hint('This soil already has that.'); return true; }
    s[key] = 1;
    if (key === 'sg' && s.c && !s.c.sg && !s.c.dead) { s.c.t = Math.max(1, Math.ceil(s.c.t * 0.75)); s.c.sg = 1; }
    G.inv.removeSlot(ctx.slotIndex, 1); G.sfx('dig'); G.fx.burst(cx(ctx.x), cy(ctx.y), key === 'f' ? '#a0bfff' : '#8fe39a', 8, 3);
    return true;
  }
  function usePlaceable(ctx, type) {
    const m = G.maps[ctx.map]; if (!m || m.persistent === false || ctx.map === 'town') { hint("You can't place that here."); return true; }
    const s = SOIL_MAPS.includes(ctx.map) ? soilMap(ctx.map)[K(ctx.x, ctx.y)] : null;
    if (s && s.c && !s.c.dead) { hint('There is a crop there.'); return true; }
    if (!G.world.canPlace(ctx.map, ctx.x, ctx.y)) { hint("Can't place that here."); G.sfx('error'); return true; }
    if (s) delete soilMap(ctx.map)[K(ctx.x, ctx.y)];
    G.world.addObject(ctx.map, { type, x: ctx.x, y: ctx.y });
    G.inv.removeSlot(ctx.slotIndex, 1); G.sfx('dig');
    if (type.includes('sprinkler')) { // water right away so placing one feels good
      const o = { type, x: ctx.x, y: ctx.y }; for (const [x, y] of sprinklerTiles(o)) water(ctx.map, x, y);
      G.fx.burst(cx(ctx.x), cy(ctx.y) - 10, '#7fc8ff', 12, 3);
    }
    return true;
  }
  function useTreeSeed(ctx, kind) {
    if (ctx.map !== 'farm') { hint('Plant tree seeds on your farm.'); return true; }
    const ch = G.world.ground('farm', ctx.x, ctx.y);
    if (!'gGd'.includes(ch) || road.has(K(ctx.x, ctx.y)) || soilMap('farm')[K(ctx.x, ctx.y)] || !G.world.canPlace('farm', ctx.x, ctx.y)) { hint("Can't plant a tree there."); return true; }
    G.world.addObject('farm', { type: 'sapling', x: ctx.x, y: ctx.y, kind, age: 0 });
    G.inv.removeSlot(ctx.slotIndex, 1); G.sfx('dig');
    return true;
  }

  /* ---------------- crop calendar (bookshelf) ---------------- */
  function cropCalendar() {
    let season = G.state.season;
    G.ui.panel({
      title: 'Farmer\'s Almanac', width: 600,
      render: (b, panel) => {
        const list = Object.values(CROPS).filter(c => c.seasons.includes(season));
        b.innerHTML = `<div class="tabs">${G.SEASONS.map((s, i) => `<button data-s="${i}" class="${i === season ? 'on' : ''}">${s}</button>`).join('')}</div>
          ${season === 3 ? '<p>Nothing grows outdoors in Winter. Crops in a <b>greenhouse</b> grow in any season. A good time to mine, fish and craft!</p>' :
          `<table style="width:100%;border-collapse:collapse;margin:8px 0">
            <tr style="text-align:left"><th></th><th>Crop</th><th>Days</th><th>Regrows</th><th>Seeds</th><th>Sells</th></tr>
            ${list.map(c => `<tr><td><img src="${G.iconURL(G.item(c.id).icon)}" style="width:28px;height:28px;image-rendering:pixelated"></td><td>${c.name}</td><td>${c.days}</td><td>${c.regrow ? 'every ' + c.regrow + 'd' : '–'}</td><td>~${c.seed}g</td><td>${c.price}g</td></tr>`).join('')}
          </table>`}
          <p style="font-size:12px;opacity:.85">Tips: till with the hoe, plant, and water every day (rain does it for you). Crops die when the season changes unless they also grow next season. Fertilizer improves quality; Speed-Gro makes crops grow faster. Sprinklers water automatically each morning. Plant 15+ crops? Place a scarecrow or the crows will help themselves.</p>`;
        b.querySelectorAll('[data-s]').forEach(bt => bt.onclick = () => { season = +bt.dataset.s; panel.refresh(); });
      },
    });
  }

  /* ---------------- maps ---------------- */
  function defFarm() {
    const ground = buildFarmGround();
    const farm = G.defMap({
      id: 'farm', name: 'Hollow Creek Farm', w: FW, h: FH, ground,
      spawns: {
        start: { x: DOOR.x, y: DOOR.y + 1, dir: 'down' },
        house_door: { x: DOOR.x, y: DOOR.y + 1, dir: 'down' },
        east: { x: FW - 3, y: ROAD_Y, dir: 'left' },
        mine: { x: 27, y: 4, dir: 'down' },
        greenhouse: { x: BUILD.x + 3, y: BUILD.y + 5, dir: 'down' },
      },
      warps: [
        { x: DOOR.x, y: DOOR.y, to: 'house', spawn: 'door' },
        { x: FW - 1, y: ROAD_Y, w: 1, h: 2, to: 'town', spawn: 'west', cond: () => !!G.maps.town || (hint('The road to town is closed for repairs.'), false) },
        { x: 27, y: 3, to: 'mine', spawn: 'top', cond: () => !!G.maps.mine || (hint('The old mine is boarded up... for now.'), false) },
      ],
      lights: [{ x: HOUSE.x + 1, y: HOUSE.y + 1.2, r: 1.6 }, { x: HOUSE.x + 3.6, y: HOUSE.y + 1.2, r: 1.6 }, { x: 27.5, y: 3.5, r: 1.2 }],
      meta: {
        shopSpot: { x: SHOP.x, y: SHOP.y },
        crateSpot: { x: CRATE.x, y: CRATE.y },
        customerPath: [{ x: FW - 1, y: ROAD_Y }, { x: 45, y: ROAD_Y }, { x: 35, y: ROAD_Y }, { x: 27, y: ROAD_Y }, { x: SHOP.x + 1, y: ROAD_Y }],
        buildZone: Object.assign({}, BUILD),
        pond: Object.assign({}, POND),
        field: Object.assign({}, FIELD),
        houseDoor: { x: DOOR.x, y: DOOR.y },
        caveMouth: { x: 27, y: 3 },
      },
      canPlace: (x, y) => !road.has(K(x, y)),
      generate: generateFarm,
      onEnter(spawn) {
        if (spawn === 'greenhouse') {
          const gh = G.world.objects('farm').find(o => o.type === 'greenhouse');
          if (gh) { const s = G.world.size(gh); farm.spawns.greenhouse = { x: gh.x + Math.floor(s.w / 2), y: gh.y + s.h, dir: 'down' }; }
        }
      },
      useTile: ctx => useTile(ctx),
      interactTile: (x, y) => interactTile('farm', x, y),
      drawGround: (ctx, cam) => drawSoilLayer('farm', ctx, cam),
      collect: (list, cam) => collectCrops('farm', list, cam),
      drawOverlay: (ctx, cam) => drawWeather(ctx, cam),
    });
    return farm;
  }

  function generateFarm() {
    const id = 'farm';
    const objs = G.world.objects(id);
    if (objs.some(o => o.type === 'farmhouse')) return;
    const add = o => G.world.addObject(id, o);
    add({ type: 'farmhouse', x: HOUSE.x, y: HOUSE.y });
    add({ type: 'mine_entrance', x: CAVE.x, y: CAVE.y });
    // decor near the house
    add({ type: 'decor', spr: 'mailbox', kind: 'mailbox', name: 'Mailbox', x: DOOR.x + 1, y: DOOR.y + 2 });
    add({ type: 'decor', spr: 'wooden_sign', kind: 'sign', name: 'Farm Sign', x: DOOR.x - 2, y: ROAD_Y - 1 });
    add({ type: 'decor', spr: 'well', kind: 'well', name: 'Well', x: HOUSE.x + HOUSE.w + 1, y: HOUSE.y + 1, w: 2, h: 2, s: 2 });
    add({ type: 'decor', spr: 'hay_bale', name: 'Hay Bale', x: HOUSE.x - 2, y: HOUSE.y + 1 });
    add({ type: 'decor', spr: 'hay_bale_2', name: 'Hay Bale', x: HOUSE.x - 2, y: HOUSE.y + 2 });
    add({ type: 'decor', spr: 'farm_cart', name: 'Farm Cart', x: HOUSE.x - 3, y: HOUSE.y + 3, w: 2, h: 1, s: 1.5 });
    add({ type: 'decor', spr: 'flower_patch', name: 'Flowers', x: HOUSE.x, y: HOUSE.y + 3, walk: true });
    add({ type: 'decor', spr: 'flower_patch', name: 'Flowers', x: HOUSE.x + 4, y: HOUSE.y + 3, walk: true });
    add({ type: 'decor', spr: 'wooden_storage_barrel', name: 'Barrel', x: HOUSE.x + HOUSE.w, y: HOUSE.y + 2 });
    add({ type: 'decor', spr: 'wooden_storage_crate', name: 'Crate', x: HOUSE.x - 1, y: HOUSE.y });
    add({ type: 'decor', spr: 'birdhouse', name: 'Birdhouse', x: 9, y: 33 - 0, walk: false });

    const occupied = (x, y, w = 1, h = 1) => {
      for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
        const gx = x + i, gy = y + j, ch = G.world.ground(id, gx, gy);
        if (!'gG'.includes(ch) || protectedTile(gx, gy) || G.world.objectAt(id, gx, gy)) return true;
      }
      return false;
    };
    const tryAdd = o => { const d = G.objTypes[o.type]; if (occupied(o.x, o.y, d.w, d.h)) return false; add(o); return true; };
    // the birdhouse should sit by the pond on land
    const bh = objs.find(o => o.spr === 'birdhouse'); if (bh) { G.world.removeObject(id, bh); for (let y = POND.y + POND.h; y < 40; y++) if (!occupied(POND.x + 2, y)) { add(Object.assign(bh, { x: POND.x + 2, y })); break; } }

    // big stumps & boulders
    const bigs = [['big_stump', 6], ['boulder', 5]];
    for (const [type, n] of bigs) { let placed = 0, tries = 0; while (placed < n && tries++ < 400) { const x = G.randInt(3, FW - 6), y = G.randInt(15, FH - 6); if (inRect(x, y, FIELD) || inRect(x + 1, y + 1, FIELD)) continue; if (tryAdd({ type, x, y })) placed++; } }

    // trees: forest band along the cliffs + groves
    const distEdge = (x, y) => Math.min(x - 2, FW - 3 - x, y - 4, FH - 4 - y);
    const groves = [{ x: 2, y: 14, w: 6, h: 14, p: 0.45 }, { x: 43, y: 33, w: 10, h: 8, p: 0.4 }, { x: 32, y: 4, w: 21, h: 6, p: 0.33 }, { x: 2, y: 4, w: 7, h: 8, p: 0.4 }, { x: 18, y: 35, w: 8, h: 5, p: 0.3 }];
    for (let y = 4; y < FH - 3; y++) for (let x = 2; x < FW - 2; x++) {
      if (occupied(x, y) || inRect(x, y, FIELD)) continue;
      const d = distEdge(x, y);
      let p = d <= 0 ? 0.55 : d === 1 ? 0.35 : d === 2 ? 0.12 : 0.012;
      for (const gr of groves) if (inRect(x, y, gr)) p = Math.max(p, gr.p);
      if (inRect(x, y, BUILD)) p *= 0.3;
      // keep pond shore mostly open
      if (x >= POND.x - 1 && x <= POND.x + POND.w && y >= POND.y - 1 && y <= POND.y + POND.h) p *= 0.3;
      if (G.chance(p)) { add({ type: G.chance(0.62) ? 'tree_oak' : 'tree_pine', x, y }); continue; }
    }
    // scattered debris
    for (let y = 4; y < FH - 3; y++) for (let x = 2; x < FW - 2; x++) {
      if (occupied(x, y)) continue;
      let mul = 1;
      if (inRect(x, y, FIELD)) mul = 0.18;
      else if (inRect(x, y, BUILD)) mul = 0.6;
      const r = Math.random();
      if (r < 0.12 * mul) add({ type: 'weeds', x, y, v: G.randInt(0, 2) });
      else if (r < 0.16 * mul) add({ type: 'rock', x, y, v: G.randInt(0, 1) });
      else if (r < 0.2 * mul) add({ type: 'twig', x, y });
      else if (r < 0.204 * mul) add({ type: 'stump', x, y, kind: 'oak' });
    }
    mod().generated = true;
  }

  function defHouse() {
    const W = 12, H = 9, rows = [];
    for (let y = 0; y < H; y++) { let r = ''; for (let x = 0; x < W; x++) r += (y < 2 || y === H - 1 || x === 0 || x === W - 1) ? 'W' : 'f'; rows.push(r); }
    rows[H - 1] = rows[H - 1].slice(0, 6) + 'f' + rows[H - 1].slice(7);
    G.defMap({
      id: 'house', name: 'Farmhouse', w: W, h: H, ground: rows, indoor: true,
      spawns: { door: { x: 6, y: H - 2, dir: 'up' }, bed: { x: 3, y: 3, dir: 'down' }, start: { x: 6, y: H - 2, dir: 'up' } },
      warps: [{ x: 6, y: H - 1, to: 'farm', spawn: 'house_door' }],
      lights: [{ x: 5.5, y: 2, r: 3 }],
      generate() {
        const add = o => G.world.addObject('house', o);
        add({ type: 'bed', x: 1, y: 2 });
        add({ type: 'bookshelf', x: 3, y: 1 });
        add({ type: 'furn', spr: 'fireplace', kind: 'fire', name: 'Fireplace', x: 5, y: 1, w: 2, h: 1, s: 2, dy: 8 });
        add({ type: 'furn', spr: 'kitchen_counter', name: 'Kitchen Counter', x: 8, y: 1, s: 1, dy: 4 });
        add({ type: 'furn', spr: 'kitchen_counter_2', name: 'Kitchen Counter', x: 9, y: 1, s: 1, dy: 4 });
        add({ type: 'furn', spr: 'wooden_cabinet', name: 'Cabinet', x: 10, y: 1, s: 1, dy: 4 });
        add({ type: 'furn', spr: 'rocking_chair', kind: 'chair', name: 'Rocking Chair', x: 7, y: 3 });
        add({ type: 'furn', spr: 'wooden_table', name: 'Table', x: 8, y: 5, w: 2, h: 1, s: 1.5 });
        add({ type: 'furn', spr: 'wooden_chair', name: 'Chair', x: 7, y: 5 });
        add({ type: 'furn', spr: 'wooden_chair', name: 'Chair', x: 10, y: 5 });
        add({ type: 'furn', spr: 'candle_table', name: 'Candle Table', x: 1, y: 5 });
        add({ type: 'furn', spr: 'plant_pot', name: 'Plant', x: 10, y: 7 });
        add({ type: 'furn', spr: 'plant_pot', name: 'Plant', x: 1, y: 7 });
        add({ type: 'furn', spr: 'basket', name: 'Basket', x: 4, y: 7, walk: true });
      },
    });
  }

  function defGreenhouse() {
    const W = 14, H = 12, rows = [];
    for (let y = 0; y < H; y++) {
      let r = '';
      for (let x = 0; x < W; x++) {
        if (y < 2 || y === H - 1 || x === 0 || x === W - 1) r += 'W';
        else if (x >= 2 && x <= 11 && y >= 2 && y <= 8) r += 'd';
        else r += 'f';
      }
      rows.push(r);
    }
    rows[H - 1] = rows[H - 1].slice(0, 7) + 'f' + rows[H - 1].slice(8);
    G.defMap({
      id: 'greenhouse', name: 'Greenhouse', w: W, h: H, ground: rows, indoor: true,
      spawns: { door: { x: 7, y: H - 2, dir: 'up' }, start: { x: 7, y: H - 2, dir: 'up' } },
      warps: [{ x: 7, y: H - 1, to: 'farm', spawn: 'greenhouse' }],
      useTile: ctx => useTile(ctx),
      interactTile: (x, y) => interactTile('greenhouse', x, y),
      drawGround: (ctx, cam) => drawSoilLayer('greenhouse', ctx, cam),
      collect: (list, cam) => collectCrops('greenhouse', list, cam),
      generate() {
        G.world.addObject('greenhouse', { type: 'furn', spr: 'plant_pot', name: 'Plant', x: 1, y: 9 });
        G.world.addObject('greenhouse', { type: 'furn', spr: 'plant_pot', name: 'Plant', x: 12, y: 9 });
        G.world.addObject('greenhouse', { type: 'furn', spr: 'bucket', name: 'Bucket', x: 12, y: 2 });
      },
    });
  }

  /* ---------------- daily simulation ---------------- */
  function growNight(mapId) {
    const soil = soilMap(mapId), green = isGreen(mapId), s = G.state.season;
    for (const k in soil) {
      const t = soil[k];
      // objects built over soil remove it
      if (!green && mapId === 'farm') { const i = k.indexOf(','); const o = G.world.objectAt(mapId, +k.slice(0, i), +k.slice(i + 1)); if (o && !PLACE[o.type]) { delete soil[k]; continue; } }
      if (t.c && !t.c.dead && t.w && (green || CROPS[t.c.id].seasons.includes(s))) t.c.d = Math.min(t.c.t, t.c.d + 1);
      if (!t.c && !t.w && !green && !t.f && G.chance(0.05)) { delete soil[k]; continue; }
      t.w = 0;
    }
  }
  function runSprinklers(mapId) {
    let n = 0;
    for (const o of G.world.objects(mapId)) if (PLACE[o.type] && PLACE[o.type].range) for (const [x, y] of sprinklerTiles(o)) if (water(mapId, x, y)) n++;
    return n;
  }
  function crows() {
    if (G.state.season === 3) return;
    if (G.state.year === 1 && G.state.season === 0 && G.state.day <= 8) return; // grace week: the 15 starter seeds are safe
    const soil = soilMap('farm'); const crops = [];
    for (const k in soil) if (soil[k].c && !soil[k].c.dead) crops.push(k);
    if (crops.length < 15 || !G.chance(0.1)) return;
    const scare = G.world.objects('farm').filter(o => o.type === 'scarecrow');
    const open = crops.filter(k => { const i = k.indexOf(','), x = +k.slice(0, i), y = +k.slice(i + 1); return !scare.some(s => Math.hypot(s.x - x, s.y - y) <= 8); });
    if (!open.length) return;
    const k = G.pick(open), name = CROPS[soil[k].c.id].name;
    delete soil[k].c;
    G.report(`A crow pecked up one of your ${name} plants overnight. A scarecrow would keep them away.`, 'scarecrow');
  }
  function treesNight() {
    if (G.state.season === 3) return;
    for (const o of G.world.objects('farm').slice()) {
      if (o.type === 'sapling') { o.age = (o.age || 0) + 1; if (o.age >= 10) { G.world.removeObject('farm', o); G.world.addObject('farm', { type: o.kind === 'pine' ? 'tree_pine' : 'tree_oak', x: o.x, y: o.y }); } }
      else if (o.type === 'stump' && o.kind && G.chance(0.04)) { G.world.removeObject('farm', o); G.world.addObject('farm', { type: 'sapling', x: o.x, y: o.y, kind: o.kind, age: 4 }); }
      else if ((o.type === 'tree_oak' || o.type === 'tree_pine') && o.dmg) o.dmg = 0; // trees heal overnight
    }
  }
  function spawnDebris() {
    const objs = G.world.objects('farm');
    const count = objs.filter(o => o.type === 'weeds' || o.type === 'twig' || o.type === 'rock').length;
    if (count > 260) return;
    const winter = G.state.season === 3;
    const n = winter ? G.randInt(0, 2) : G.randInt(3, 6);
    const soil = soilMap('farm');
    let placed = 0;
    for (let tries = 0; tries < 80 && placed < n; tries++) {
      const x = G.randInt(2, FW - 3), y = G.randInt(4, FH - 4);
      if (!'gG'.includes(G.world.ground('farm', x, y)) || protectedTile(x, y) || soil[K(x, y)]) continue;
      if (!G.world.isFree('farm', x, y)) continue;
      if (inRect(x, y, BUILD) && G.chance(0.5)) continue;
      if (G.world.objectsIn('farm', x - 1, y - 1, 3, 3).some(o => !DEBRIS.has(o.type))) continue;
      const r = Math.random();
      G.world.addObject('farm', winter ? { type: r < 0.5 ? 'twig' : 'rock', x, y } : r < 0.6 ? { type: 'weeds', x, y, v: G.randInt(0, 2) } : r < 0.8 ? { type: 'twig', x, y } : { type: 'rock', x, y, v: G.randInt(0, 1) });
      placed++;
    }
  }

  /* ---------------- G.farming API ---------------- */
  G.farming = {
    crops: CROPS,
    waterAll(mapId = 'farm') { let n = 0; const soil = soilMap(mapId); for (const k in soil) if (!soil[k].w) { soil[k].w = 1; n++; } return n; },
    harvestReady(max = Infinity) {
      const out = {}; let n = 0;
      for (const mapId of SOIL_MAPS) {
        if (!G.maps[mapId] || (mapId === 'greenhouse' && !G.state.maps.greenhouse)) continue;
        const soil = soilMap(mapId);
        for (const k in soil) {
          if (n >= max) break;
          if (!isReady(soil[k].c)) continue;
          const i = k.indexOf(','); const res = harvestTile(mapId, +k.slice(0, i), +k.slice(i + 1), 'worker');
          if (!res) continue; n++;
          for (const r of res) { const key = r.id + ':' + r.q; (out[key] = out[key] || { id: r.id, qty: 0, q: r.q }).qty += r.qty; }
        }
      }
      return Object.values(out);
    },
    isTillable: (mapId, x, y) => isTillable(mapId, x, y),
    soilAt: (mapId, x, y) => soilAt(mapId, x, y),
    plant: (mapId, x, y, cropId) => plant(mapId, x, y, cropId),
    till: (mapId, x, y) => till(mapId, x, y),
    enterGreenhouse: () => G.world.go('greenhouse', 'door'),
    weather: () => mod().weather,
    isRaining: () => raining(),
    cropCalendar,
    isRoad: (x, y) => road.has(K(x, y)),
  };

  /* ---------------- lifecycle ---------------- */
  G.on('init', () => {
    defDebris(); defStructures(); defPlaceables(); defItems();
    defFarm(); defHouse(); defGreenhouse();
    G.helpExtra.push('<b>Farming:</b> Hoe grass or dirt to till it, plant seeds (in season!), and water with the can every day — rain waters for you. Right-click or swing the scythe to harvest. Crops die when the season changes unless they grow next season too. Debris (weeds, twigs, rocks, trees) yields fiber, wood and stone — big stumps need a Copper Axe, boulders an Iron Pickaxe. Check the <b>bookshelf</b> in your house for a crop calendar.');
  });
  G.on('newGame', () => {
    const st = G.state; mod().weather = 'sun';
    st.inv = new Array(st.inv.length || 36).fill(null);
    ['hoe', 'watering_can', 'axe', 'pickaxe', 'scythe', 'fishing_rod'].forEach(t => G.inv.add(t, 1, 0, true));
    G.inv.add('seeds_carrot', 15, 0, true); G.inv.add('bait', 10, 0, true); G.inv.add('coffee', 3, 0, true);
    st.player.map = 'farm'; st.player.spawn = 'start'; st.player.x = null;
    G.world.ensureGenerated && G.world.ensureGenerated('farm');
    if (!G.world.objects('farm').some(o => o.type === 'farmhouse')) generateFarm();
  });
  G.on('loadGame', () => { mod(); });
  G.on('newSeason', s => {
    let died = 0; const soil = soilMap('farm');
    for (const k in soil) { const c = soil[k].c; if (c && !c.dead && !CROPS[c.id].seasons.includes(s)) { c.dead = 1; died++; } }
    if (died) G.report(`${died} crop(s) withered with the change of season.`, null);
    G.report(`Welcome to ${G.SEASONS[s]}!` + (s === 3 ? ' Nothing grows outdoors now — a greenhouse grows crops all year.' : ''), null);
  });
  G.on('newDay', () => {
    for (const mapId of SOIL_MAPS) if (G.state.maps[mapId]) growNight(mapId);
    crows();
    const s = G.state.season, f = mod();
    f.weather = s === 3 ? (G.chance(0.3) ? 'snow' : 'sun') : (G.chance(0.2) ? 'rain' : 'sun');
    if (f.weather === 'rain') { const n = G.farming.waterAll('farm'); G.report('It\'s raining today — your crops are watered.', 'watering_can'); setTimeout(() => G.ui.toast("It's raining — crops are watered", 'watering_can'), 1200); }
    for (const mapId of SOIL_MAPS) if (G.state.maps[mapId]) runSprinklers(mapId);
    treesNight(); spawnDebris();
  });
})();
