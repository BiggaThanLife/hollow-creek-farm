// Art module scenario: mock scenes + galleries of every icon/sprite/character frame.
module.exports = async (page, h) => {
  // 1) stub farm map
  await h.tp('farm', 8, 8);
  await h.wait(300);
  await h.shot('art_stubfarm');

  // 2) define a mock scene map
  await h.eval(() => {
    const rows = [
      'cccccccccccccccccccccccccccccccc',
      'cccccccccccccccccccccccccccccccc',
      'gggggggggggggggggggggggggggggggg',
      'gggggGgggggggggggggggggggggggggg',
      'ggggggggggggggggggggggggggggggggg'.slice(0, 32),
      'gggggggggggggggggggggggggggggggg',
      'gggggggggggggggggggggggggggggggg',
      'ppppppppppppppppppppgggggwwwwggg',
      'gggggggggggpgggggggggggwwwwwwwgg',
      'gggggGggggggpggggdddgggwwwwwwwgg',
      'ggggggggggggpggggdddgggwwbbwwwgg',
      'ggggggggggggpgggggggggggwbbwwsgg',
      'gggggggggggggpggggggggggggbbsssg',
      'ggggggggGgggggggggggggggggggssgg',
      'gggggggggggggggggggggggggggggggg',
      'gggggggggggggggggggggggggggggggg',
    ];
    G.defMap({
      id: 'arttest', name: 'Art Test', w: 32, h: rows.length, ground: rows, spawns: { start: { x: 10, y: 8 } },
      lights: [{ x: 6, y: 5, r: 2.5 }, { x: 15, y: 7, r: 3 }],
      collect(list, cam) {
        const T = 48, put = (name, tx, ty, w = 1, hh = 1) => list.push({ y: (ty + hh) * T, draw: c => { const s = G.sprite(name); c.drawImage(s, tx * T - cam.x, (ty + hh) * T - s.height - cam.y); } });
        put('farmhouse', 3, 3, 5, 3);
        put('shop_stall', 14, 4, 3, 2);
        put('tree_oak', 0, 9, 2, 1); put('tree_pine', 2, 12, 2, 1); put('tree_oak_fall', 8, 12, 2, 1);
        put('bush', 20, 3, 2, 2); put('rock', 18, 9); put('boulder', 9, 9, 2, 2); put('weeds', 6, 9); put('weeds2', 7, 10); put('weeds3', 5, 11); put('twig', 4, 9); put('stump', 6, 13); put('flowers', 11, 13);
        put('chest', 9, 6); put('scarecrow', 21, 9); put('sprinkler', 19, 11); put('torch', 13, 6); put('furnace_on', 18, 5); put('keg_ready', 19, 5);
      },
      drawGround(ctx, cam) {
        const T = 48, now = performance.now() / 1000;
        // crop field at x 17..22? -> use rows 13..14 cols 13..22
        const crops = ['carrot', 'potato', 'cabbage', 'strawberry', 'tomato', 'corn', 'sunflower', 'wheat', 'pumpkin'];
        for (let i = 0; i < 5; i++) for (let j = 0; j < 2; j++) G.art.drawSoil(ctx, (17 + i) * T - cam.x, (9 + j) * T - cam.y, j === 1, { id: 'x' }, 17 + i, 9 + j);
        G._artCropRows = crops;
      },
      drawOverlay(ctx, cam) { },
    });
    G.defMap({ id: 'artcrops', name: 'Crops', w: 20, h: 14, ground: Array.from({ length: 14 }, () => 'gggggggggggggggggggg'), spawns: { start: { x: 1, y: 12 } },
      drawGround(ctx, cam) {
        const T = 48, now = performance.now() / 1000;
        const crops = ['carrot', 'potato', 'cabbage', 'strawberry', 'tomato', 'corn', 'sunflower', 'wheat', 'pumpkin'];
        crops.forEach((c, j) => { for (let s = 0; s <= 4; s++) { const sx = (2 + s * 2) * T - cam.x, sy = (1 + j * 1.3) * T - cam.y; G.art.drawSoil(ctx, sx, sy, s % 2, null); } });
      },
      collect(list, cam) {
        const T = 48, now = performance.now() / 1000;
        const crops = ['carrot', 'potato', 'cabbage', 'strawberry', 'tomato', 'corn', 'sunflower', 'wheat', 'pumpkin'];
        crops.forEach((c, j) => { for (let s = 0; s <= 4; s++) { const sx = (2 + s * 2) * T - cam.x, sy = (1 + j * 1.3) * T - cam.y; list.push({ y: (1 + j * 1.3 + 1) * T, draw: ctx => G.art.drawCrop(ctx, c, s, 4, sx, sy, now) }); } });
      } });
    const inner = ['WWWWWWWWWWWW', 'WWWWWWWWWWWW', 'WffffffffffW', 'WffffffffffW', 'WffffffffffW', 'WffffffffffW', 'WffffffffffW', 'WWWWWffWWWWW'];
    G.defMap({ id: 'artinside', name: 'In', w: 12, h: 8, indoor: true, ground: inner, spawns: { start: { x: 5, y: 4 } } });
    const mine = ['MMMMMMMMMMMMMMMMMMMM', 'MMMMMMMMMMMMMMMMMMMM', 'MMmmmmmmmmmmmmmmmMMM', 'MmmmmmmmmmmmmmmmmmMM', 'MmmmmmmMMMmmmmmmmmmM', 'MmmmmmmMMMmmmmmmmmmM', 'Mmmmmmmmmmmmmmmmmmm M'.replace(' ', 'm'), 'MmmmmmmmmmmmmmmmmmmM', 'MmmmmmmmmmmmmmmmmmmM', 'MMMMMMMMMMMMMMMMMMMM'];
    G.defMap({ id: 'artmine', name: 'Mine', w: 20, h: 10, dark: 0.35, ground: mine, spawns: { start: { x: 9, y: 7 } },
      lights: [{ x: 4, y: 3, r: 2 }],
      collect(list, cam) {
        const T = 48, put = (name, tx, ty, w = 1, hh = 1) => list.push({ y: (ty + hh) * T, draw: c => { const s = G.sprite(name); c.drawImage(s, tx * T - cam.x, (ty + hh) * T - s.height - cam.y); } });
        ['mine_rock', 'mine_rock2', 'node_copper', 'node_iron', 'node_gold', 'node_iridium', 'node_gem', 'node_coal', 'crystal_decor', 'ladder_down', 'ladder_up'].forEach((n, i) => put(n, 2 + i, 3 + (i % 2) * 4));
        put('elevator', 15, 2, 1, 1); put('mine_entrance', 11, 4, 3, 2);
      } });
  });
  // NPCs walking
  await h.eval(() => {
    const looks = [
      { skin: '#f0c8a0', hair: 'bun', hairColor: '#b8b8c0', shirt: '#4e8f4a', pants: '#6a4a3a' },
      { skin: '#c88a5a', hair: 'bald', hairColor: '#3a2a1a', shirt: '#6a6a7a', pants: '#3a3a4a', hat: null },
      { skin: '#f4d0b0', hair: 'long', hairColor: '#c0502a', shirt: '#e0b040', pants: '#4a5a8a', hat: 'cap', capColor: '#c8302a' },
      { skin: '#8a5a3a', hair: 'short', hairColor: '#1a1210', shirt: '#7a4ab0', pants: '#2a2a3a', hat: 'straw' },
    ];
    const dirs = ['down', 'left', 'right', 'up'];
    looks.forEach((look, i) => G.world.addEnt('arttest', { x: (21 + i * 1.5) * 48, y: 14.8 * 48, look, dir: dirs[i], t: 0, update(dt) { this.t += dt; }, draw(c, sx, sy) { G.art.drawNPC(c, this.look, this.dir, true, this.t, sx, sy); } }));
  });
  await h.eval(() => { G.world.go('arttest', 'start', true); G.player.x = 11.5 * 48; G.player.y = 9.8 * 48; G.state.time = 300; });
  await h.wait(400);
  await h.shot('art_scene_spring');
  // walk around in each direction
  for (const d of ['right', 'down', 'left', 'up']) { await h.walk(d, 260); }
  await h.eval(() => { G.player.x = 24.5 * 48; G.player.y = 12.8 * 48; });
  await h.wait(200);
  await h.shot('art_scene_pond');
  for (const s of [1, 2, 3]) { await h.eval(s => { G.state.season = s; G.player.x = 13.5 * 48; G.player.y = 9.8 * 48; }, s); await h.wait(250); await h.shot('art_scene_season' + s); }
  await h.eval(() => { G.state.season = 0; G.state.time = 900; });
  await h.wait(250);
  await h.shot('art_scene_night');
  await h.eval(() => { G.state.time = 300; G.world.go('artcrops', 'start', true); G.player.x = 6 * 48; G.player.y = 12.8 * 48; });
  await h.wait(250);
  await h.shot('art_crops');
  await h.eval(() => { G.world.go('artinside', 'start', true); });
  await h.wait(250);
  await h.shot('art_inside');
  await h.eval(() => { G.world.go('artmine', 'start', true); });
  await h.wait(250);
  await h.shot('art_mine');

  // tool swing poses
  await h.eval(() => { G.world.go('arttest', 'start', true); G.player.x = 11.5 * 48; G.player.y = 9.8 * 48; G.paused = true; });

  // 3) galleries
  const gallery = async (name, items, cell = 64, scale = 1, cols = 0) => {
    await h.eval(([items, cell, scale, cols]) => {
      let cv = document.getElementById('artgal'); if (!cv) { cv = document.createElement('canvas'); cv.id = 'artgal'; cv.style.cssText = 'position:fixed;left:0;top:0;z-index:9999;background:#3a3f4a'; document.body.appendChild(cv); }
      cv.width = 1280; cv.height = 800; const x = cv.getContext('2d'); x.imageSmoothingEnabled = false; x.fillStyle = '#4a4f5a'; x.fillRect(0, 0, 1280, 800);
      let px = 8, py = 8, rowH = 0;
      for (const it of items) {
        let img = null; try { img = it.kind === 'icon' ? G.icon(it.n) : it.kind === 'tool' ? G.art.toolIcon(it.n, it.t) : it.kind === 'char' ? G.art._lib.charFrame(it.look, it.dir, it.f) : G.sprite(it.n); } catch (e) { console.error(e); }
        if (!img) continue;
        const w = Math.max(cell, img.width * scale), hh = img.height * scale + 14;
        if (px + w > 1272) { px = 8; py += rowH + 6; rowH = 0; }
        x.fillStyle = '#5a6070'; x.fillRect(px, py, w, img.height * scale);
        x.drawImage(img, px + (w - img.width * scale) / 2, py, img.width * scale, img.height * scale);
        x.fillStyle = '#fff'; x.font = '10px monospace'; x.fillText((it.label || it.n || '').slice(0, Math.floor(w / 6)), px, py + img.height * scale + 11);
        px += w + 6; rowH = Math.max(rowH, hh);
      }
    }, [items, cell, scale, cols]);
    await h.shot(name);
    await h.eval(() => { const c = document.getElementById('artgal'); if (c) c.remove(); });
  };
  const iconNames = ['wood', 'hardwood', 'stone', 'fiber', 'sap', 'clay', 'coal', 'copper_ore', 'iron_ore', 'gold_ore', 'iridium_ore', 'copper_bar', 'iron_bar', 'gold_bar', 'iridium_bar', 'quartz', 'amethyst', 'topaz', 'emerald', 'ruby', 'diamond', 'worm', 'bait', 'deluxe_bait', 'coffee',
    'seeds_carrot', 'seeds_potato', 'seeds_cabbage', 'seeds_strawberry', 'seeds_tomato', 'seeds_corn', 'seeds_sunflower', 'seeds_wheat', 'seeds_pumpkin',
    'carrot', 'potato', 'cabbage', 'strawberry', 'tomato', 'corn', 'sunflower', 'wheat', 'pumpkin',
    'sunfish', 'carp', 'bream', 'perch', 'catfish', 'bass', 'pike', 'eel', 'trout', 'salmon', 'sturgeon', 'koi', 'trash', 'seaweed',
    'fertilizer', 'speed_gro', 'sprinkler', 'quality_sprinkler', 'iridium_sprinkler', 'scarecrow', 'acorn', 'pine_cone', 'chest', 'furnace', 'preserves_jar', 'keg', 'jam', 'pickles', 'wine', 'juice', 'torch', 'path_stone', 'geode'];
  await gallery('art_gallery_icons', iconNames.map(n => ({ kind: 'icon', n })), 70, 1);
  const tools = []; for (const n of ['hoe', 'watering_can', 'axe', 'pickaxe', 'scythe', 'fishing_rod']) for (let t = 0; t < 5; t++) tools.push({ kind: 'tool', n, t, label: n.slice(0, 6) + t });
  await gallery('art_gallery_tools', tools, 64, 1.5);
  const sprA = ['tree_oak', 'tree_oak_fall', 'tree_oak_winter', 'tree_pine', 'tree_pine_winter', 'tree_sapling', 'stump', 'big_stump', 'rock', 'boulder', 'weeds', 'weeds2', 'weeds3', 'twig', 'bush', 'flowers',
    'mine_rock', 'mine_rock2', 'node_copper', 'node_iron', 'node_gold', 'node_iridium', 'node_gem', 'node_coal', 'ladder_down', 'ladder_up', 'elevator', 'mine_entrance', 'crystal_decor'];
  await gallery('art_gallery_sprites', sprA.map(n => ({ kind: 'spr', n })), 60, 1);
  const sprB = ['farmhouse', 'shop_stall', 'store_general', 'store_blacksmith', 'worker_cabin', 'silo'];
  await gallery('art_gallery_buildings1', sprB.map(n => ({ kind: 'spr', n })), 60, 1);
  const sprC = ['store_carpenter', 'inn', 'greenhouse', 'shed'];
  await gallery('art_gallery_buildings2', sprC.map(n => ({ kind: 'spr', n })), 60, 1);
  const sprD = ['chest', 'furnace', 'furnace_on', 'preserves_jar', 'preserves_jar_ready', 'keg', 'keg_ready', 'sprinkler', 'quality_sprinkler', 'iridium_sprinkler', 'scarecrow', 'torch', 'fence', 'path_stone', 'bobber',
    'portrait_mabel', 'portrait_bram', 'portrait_wren', 'portrait_otis', 'portrait_worker1', 'portrait_worker2', 'portrait_worker3', 'portrait_worker4'];
  await gallery('art_gallery_placeables', sprD.map(n => ({ kind: 'spr', n })), 60, 2);
  const chars = []; const PL = await h.eval(() => G.art.playerLook);
  for (const dir of ['down', 'up', 'left', 'right']) for (let f = 0; f < 6; f++) chars.push({ kind: 'char', look: PL, dir, f, label: dir[0] + f });
  await gallery('art_gallery_chars', chars, 60, 2);

  // swing frames
  await h.eval(() => {
    let cv = document.createElement('canvas'); cv.id = 'artgal'; cv.width = 1280; cv.height = 800; cv.style.cssText = 'position:fixed;left:0;top:0;z-index:9999'; document.body.appendChild(cv);
    const x = cv.getContext('2d'); x.imageSmoothingEnabled = false; x.fillStyle = '#5d9f3d'; x.fillRect(0, 0, 1280, 800);
    x.scale(2, 2);
    const tools = ['hoe', 'axe', 'pickaxe', 'scythe', 'watering_can', 'fishing_rod'];
    tools.forEach((tool, ti) => ['down', 'up', 'left', 'right'].forEach((dir, di) => [0.28, 0.2, 0.12, 0.04].forEach((st, si) => {
      const p = { dir, moving: false, animT: 0, swingT: st, swingTool: tool };
      G.art.drawPlayer(x, p, 30 + (di * 4 + si) * 38, 60 + ti * 64);
    })));
  });
  await h.shot('art_gallery_swing');
  await h.eval(() => { const c = document.getElementById('artgal'); if (c) c.remove(); G.paused = false; });
  const ms = await h.eval(() => G.art.buildMs);
  console.log('art build ms', ms);
};
