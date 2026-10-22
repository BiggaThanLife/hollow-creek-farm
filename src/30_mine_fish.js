/* =====================================================================
   30_mine_fish.js — MINING & FISHING  (Mine+Fish agent)
   - map 'mine': entrance (floor 0) + procedurally generated floors 1..60
   - ore / gem / stone nodes, hidden ladders, elevator every 5 floors, treasure
   - fishing on any 'w' tile of any map: bait, cast, bite, reel minigame, catch card
   APIs: G.mining = { rollOre(depth, opts) -> {id, qty}, deepest(), floor(), nodeTypes }
         G.fishing = { rollFish(locationId, opts) -> id, startCast(tile), isFishing(), fish, cancel() }
   Monkey-patch: G.render is wrapped (inside 'init') to draw screen-space overlays
   (minigame, "!" bubble, catch card, floor banner, fallback torch glow).
   ===================================================================== */
(() => {
  'use strict';
  const T = 48;
  const MAX_FLOOR = 60;
  const FONT = '"Pixelify Sans", "VT323", monospace';

  /* ------------------------------------------------------------------
     tiny seeded rng + pixel painter for fallback art (used only when the
     art module doesn't supply a sprite/icon)
     ------------------------------------------------------------------ */
  const rng = seed => { let s = (seed * 9301 + 49297) % 233280 || 1; return () => (s = (s * 16807) % 2147483647) / 2147483647; };
  const hashStr = str => { let h = 7; for (const c of str) h = (h * 31 + c.charCodeAt(0)) | 0; return Math.abs(h); };
  function pix(w, h, fn, s = 3) {
    const c = G.makeCanvas(w * s, h * s), x = c.getContext('2d');
    fn((X, Y, col) => { if (!col) return; x.fillStyle = col; x.fillRect(Math.round(X) * s, Math.round(Y) * s, s, s); }, x, s);
    return c;
  }
  const _fb = {};
  function rockArt(seed, pal, flecks, crystals) {
    const r = rng(seed);
    return pix(16, 16, P => {
      const cx = 7.5, cy = 9.6, rx = 6.9, ry = 5.4, jit = [];
      for (let i = 0; i < 256; i++) jit.push(r() * 0.35 - 0.1);
      const inside = (X, Y) => { if (X < 0 || Y < 0 || X > 15 || Y > 15) return false; const dx = (X - cx) / rx, dy = (Y - cy) / ry; return dx * dx + dy * dy <= 1 + jit[Y * 16 + X]; };
      const inner = [];
      for (let Y = 0; Y < 16; Y++) for (let X = 0; X < 16; X++) {
        if (!inside(X, Y)) continue;
        const edge = !inside(X - 1, Y) || !inside(X + 1, Y) || !inside(X, Y - 1) || !inside(X, Y + 1);
        if (edge) { P(X, Y, pal.o); continue; }
        let col = pal.b;
        if (Y < cy - 2.2 || (Y < cy - 0.8 && X < cx - 2)) col = pal.l;
        if (Y > cy + 2 || (X > cx + 3.5 && Y > cy)) col = pal.d;
        if (r() < 0.08) col = pal.d;
        P(X, Y, col); inner.push([X, Y]);
      }
      // highlight streak
      P(cx - 3, cy - 3, pal.h); P(cx - 2, cy - 3, pal.h); P(cx - 3, cy - 2, pal.h);
      if (flecks) for (let i = 0; i < flecks.n; i++) {
        const [X, Y] = inner[Math.floor(r() * inner.length)];
        P(X, Y, flecks.c); if (inside(X + 1, Y)) P(X + 1, Y, flecks.c2 || flecks.c); if (r() < 0.6) P(X, Y - 1, flecks.h || '#fff');
      }
      if (crystals) {
        const spots = [[5, 6], [8, 4], [11, 6]];
        spots.forEach(([X, Y], i) => {
          const col = crystals[i % crystals.length];
          for (let k = 0; k < 4; k++) P(X, Y + k, col); P(X + 1, Y + 1, col); P(X + 1, Y + 2, col); P(X, Y, '#fff'); P(X - 1, Y + 3, '#2a2420');
        });
      }
    });
  }
  const NODE_PAL = {
    mine_rock: { b: '#8d847a', l: '#aaa196', d: '#6b635a', o: '#2e2924', h: '#cfc7bb' },
    mine_rock2: { b: '#7f7268', l: '#9c8f83', d: '#5f544b', o: '#2a231e', h: '#c4b6a8' },
  };
  function fallbackSprite(name) {
    if (_fb[name]) return _fb[name];
    let c;
    const grey = NODE_PAL.mine_rock;
    switch (name) {
      case 'mine_rock': c = rockArt(3, NODE_PAL.mine_rock); break;
      case 'mine_rock2': c = rockArt(11, NODE_PAL.mine_rock2); break;
      case 'node_coal': c = rockArt(5, grey, { n: 9, c: '#1c1c1c', c2: '#2d2d2d', h: '#555' }); break;
      case 'node_copper': c = rockArt(7, grey, { n: 8, c: '#d9774b', c2: '#b85a33', h: '#ffc29a' }); break;
      case 'node_iron': c = rockArt(13, { b: '#7c7a7e', l: '#9a989c', d: '#5d5b60', o: '#29272b', h: '#d0d0d6' }, { n: 8, c: '#d8dbe6', c2: '#a59a96', h: '#fff' }); break;
      case 'node_gold': c = rockArt(17, grey, { n: 9, c: '#f5c542', c2: '#d79b1f', h: '#fff4b0' }); break;
      case 'node_iridium': c = rockArt(19, { b: '#5d5266', l: '#776a82', d: '#433a4b', o: '#1e1922', h: '#bfb0cf' }, { n: 9, c: '#c46bf0', c2: '#8d3fc0', h: '#f2d6ff' }); break;
      case 'node_gem': c = rockArt(23, grey, null, ['#ff6fcf', '#6fe7ff', '#b2ff8a']); break;
      case 'ladder_down': c = pix(16, 16, P => {
        for (let Y = 0; Y < 16; Y++) for (let X = 0; X < 16; X++) { const dx = (X - 7.5) / 7, dy = (Y - 8) / 6; const d = dx * dx + dy * dy; if (d <= 1) P(X, Y, d > 0.75 ? '#4a3a2c' : '#0d0906'); }
        for (let Y = 3; Y < 14; Y++) { const a = Y < 9 ? '#9c6a3a' : '#5c3e22'; P(5, Y, a); P(10, Y, a); }
        for (let Y = 4; Y < 13; Y += 3) for (let X = 5; X <= 10; X++) P(X, Y, Y < 9 ? '#c08a52' : '#6d4a28');
      }); break;
      case 'ladder_up': c = pix(16, 24, P => {
        for (let Y = 0; Y < 24; Y++) { P(4, Y, '#8b5a2b'); P(11, Y, '#8b5a2b'); P(5, Y, '#5b3a1e'); P(12, Y, '#5b3a1e'); }
        for (let Y = 2; Y < 23; Y += 4) for (let X = 4; X <= 12; X++) P(X, Y, X % 2 ? '#c8894a' : '#b07540');
        for (let X = 3; X <= 13; X++) P(X, 23, 'rgba(0,0,0,0.35)');
      }); break;
      case 'elevator': c = pix(16, 32, P => {
        for (let Y = 0; Y < 32; Y++) for (let X = 0; X < 16; X++) {
          let col = null;
          if (X === 0 || X === 15 || Y === 0) col = '#2c2f36';
          else if (Y < 7) col = Y === 3 && X > 4 && X < 11 ? '#ffd257' : '#59606b';
          else if (X === 1 || X === 14) col = '#7d8592';
          else if (Y > 8 && Y < 31) col = X === 7 || X === 8 ? '#1b1d22' : ((X + Y) % 5 === 0 ? '#3a3f48' : '#4a505b');
          else col = '#6b7380';
          P(X, Y, col);
        }
        P(7, 5, '#ff5b5b'); P(8, 5, '#7dff7d');
      }); break;
      case 'treasure': c = pix(16, 16, P => {
        for (let Y = 4; Y < 15; Y++) for (let X = 1; X < 15; X++) {
          let col = Y < 8 ? '#a0612b' : '#8a4f22';
          if (X === 1 || X === 14 || Y === 4 || Y === 14) col = '#3b2412';
          if (Y === 8) col = '#3b2412';
          if (X === 4 || X === 11) col = '#f2c94c';
          if ((X === 7 || X === 8) && Y >= 7 && Y <= 10) col = '#ffe680';
          P(X, Y, col);
        }
        P(7, 9, '#3b2412'); P(5, 5, '#d08a4a'); P(6, 5, '#d08a4a');
      }); break;
      case 'crystal_decor': c = pix(16, 16, P => {
        const sh = [[4, 9, 4, '#7fd6ff'], [7, 5, 7, '#b88cff'], [10, 8, 5, '#7fd6ff'], [12, 11, 3, '#ff9de6']];
        sh.forEach(([X, Y, h, col]) => { for (let k = 0; k < h; k++) { P(X, Y + k, col); P(X + 1, Y + k, k < 1 ? '#fff' : col); } P(X, Y, '#fff'); for (let k = 0; k < h; k++) P(X + 2, Y + k + 1, 'rgba(0,0,0,0.25)'); });
        for (let X = 3; X < 14; X++) P(X, 14, '#4a3f37');
      }); break;
      case 'bobber': c = pix(8, 8, P => {
        for (let Y = 0; Y < 8; Y++) for (let X = 0; X < 8; X++) { const d = Math.hypot(X - 3.5, Y - 3.5); if (d < 3.6) P(X, Y, d > 2.8 ? '#2a1a12' : (Y < 4 ? '#e8402f' : '#f6f0e6')); }
        P(2, 1, '#ffb0a8');
      }, 2); break;
      default: c = G.placeholder(name);
    }
    return (_fb[name] = c);
  }
  /** sprite resolver: art sprites -> pack assets -> my fallback pixel art */
  const spr = name => G.art.sprites[name] || G.assets[name] || fallbackSprite(name);

  /* ------------------------------------------------------------------
     FISH TABLE
     seasons: 0 spring 1 summer 2 fall 3 winter · hours: [from,to) wall clock, may wrap
     move: mixed | smooth | dart | sinker | floater
     ------------------------------------------------------------------ */
  const ALL = [0, 1, 2, 3];
  const FISH = {
    sunfish: { name: 'Sunfish', price: 30, diff: 18, move: 'mixed', seasons: [0, 1], hours: [6, 19], loc: ['pond', 'river'], w: 12, col: ['#f2b233', '#d9772b', '#ffe08a'], desc: 'A cheerful little panfish.' },
    carp: { name: 'Carp', price: 30, diff: 14, move: 'smooth', seasons: ALL, hours: null, loc: ['pond', 'mine'], w: 12, col: ['#9a8a4a', '#6f6232', '#cfc08a'], desc: 'A common pond fish.' },
    bream: { name: 'Bream', price: 45, diff: 30, move: 'smooth', seasons: ALL, hours: [18, 2], loc: ['river', 'pond'], w: 9, col: ['#8e9aa8', '#5d6875', '#d3dbe4'], desc: 'Comes out to feed at night.' },
    perch: { name: 'Perch', price: 55, diff: 32, move: 'mixed', seasons: [3], hours: null, loc: ['river', 'pond'], w: 10, col: ['#9bbf45', '#5f7f22', '#e5f0a0'], stripes: '#3f5a16', desc: 'A striped winter fish.' },
    catfish: { name: 'Catfish', price: 200, diff: 70, move: 'mixed', seasons: [0, 2], hours: [6, 24], loc: ['river', 'pond'], w: 3, rain: true, col: ['#6d6a5c', '#4a4739', '#a8a38d'], whiskers: true, desc: 'Loves rainy days. Fights hard.' },
    bass: { name: 'Bass', price: 100, diff: 46, move: 'mixed', seasons: [1, 2], hours: [6, 19], loc: ['pond'], w: 6, col: ['#6c9a4b', '#3f6a2a', '#d6e8a6'], desc: 'A prized lunker of the pond.' },
    pike: { name: 'Pike', price: 100, diff: 60, move: 'dart', seasons: [1, 3], hours: null, loc: ['river', 'pond'], w: 5, long: 1.2, col: ['#5f8a5a', '#3a5c38', '#cfe0b5'], desc: 'A long, toothy predator.' },
    eel: { name: 'Eel', price: 85, diff: 66, move: 'smooth', seasons: [0, 2], hours: [16, 2], loc: ['river', 'mine'], w: 5, eel: true, col: ['#4f5a3a', '#30381f', '#8c9a6a'], desc: 'Slippery. Only bites late in the day.' },
    trout: { name: 'Trout', price: 65, diff: 42, move: 'mixed', seasons: [0, 1], hours: [6, 19], loc: ['river', 'pond'], w: 8, col: ['#d6a0a8', '#8f5a6a', '#f6e0e4'], stripes: '#e86a8a', desc: 'Its sides shimmer like a rainbow.' },
    salmon: { name: 'Salmon', price: 75, diff: 50, move: 'mixed', seasons: [2], hours: [6, 19], loc: ['river', 'pond'], w: 8, col: ['#e07a5f', '#a84a35', '#ffd0bf'], desc: 'Swims upstream every fall.' },
    sturgeon: { name: 'Sturgeon', price: 200, diff: 76, move: 'sinker', seasons: [1, 3], hours: [6, 19], loc: ['pond'], w: 2, long: 1.25, col: ['#7d7f86', '#4f5157', '#c9cbd1'], desc: 'An ancient bottom-feeder. Rare and valuable.' },
    koi: { name: 'Koi', price: 900, diff: 88, move: 'floater', seasons: ALL, hours: [6, 20], loc: ['pond'], w: 0.35, legendary: true, col: ['#fbf7ef', '#e0d6c4', '#ffffff'], patches: '#f26b1d', desc: 'A legendary golden-hearted koi. Brings good luck.' },
    ghostfish: { name: 'Ghostfish', price: 120, diff: 52, move: 'mixed', seasons: ALL, hours: null, loc: ['mine'], w: 7, col: ['#d8e9f2', '#9fb8c7', '#ffffff'], ghost: true, desc: 'A pale, eyeless fish from underground lakes.' },
  };
  const TRASH = { trash: { name: 'Trash', price: 1, cat: 'misc', desc: 'Someone dumped this in the water. Rude.' }, seaweed: { name: 'Seaweed', price: 5, cat: 'misc', desc: 'Slimy, salty, surprisingly useful.' } };

  function fishIconArt(id) {
    const f = FISH[id];
    if (id === 'trash') return pix(16, 16, P => { for (let Y = 3; Y < 14; Y++) for (let X = 4; X < 12; X++) P(X, Y, X === 4 || X === 11 || Y === 3 || Y === 13 ? '#3d4247' : (Y === 6 || Y === 10 ? '#c94a3b' : (X < 6 ? '#c9ced4' : '#8f969e'))); P(6, 2, '#3d4247'); P(9, 2, '#3d4247'); });
    if (id === 'seaweed') return pix(16, 16, P => { [[4, '#2f8a3f'], [7, '#3fae52'], [10, '#257a35'], [12, '#4cc463']].forEach(([X0, col], i) => { for (let Y = 3 + i; Y < 15; Y++) P(X0 + Math.round(Math.sin(Y * 0.7 + i) * 1.2), Y, col); }); });
    if (id === 'geode') return pix(16, 16, P => { for (let Y = 0; Y < 16; Y++) for (let X = 0; X < 16; X++) { const d = Math.hypot(X - 7.5, Y - 8.5); if (d < 6.2) P(X, Y, d > 5.3 ? '#3b2d22' : (Y < 7 ? '#a08a72' : '#7d6a56')); } [[6, 6], [7, 7], [8, 7], [9, 8], [8, 9]].forEach(([X, Y]) => P(X, Y, '#b07cf0')); P(5, 5, '#d8c8b0'); });
    if (!f) return G.placeholder(id);
    const [b, d, l] = f.col;
    return pix(16, 16, P => {
      const long = f.long || 1, eel = f.eel;
      const cx = 7, cy = 8, rx = eel ? 6.8 : 4.8 * long, ry = eel ? 1.7 : 3.1;
      const inB = (X, Y) => { const dx = (X - cx) / rx, dy = (Y - cy) / ry; return dx * dx + dy * dy <= 1; };
      // tail
      const tx = Math.round(cx + rx - 0.5);
      for (let k = 0; k < 4; k++) for (let j = -k; j <= k; j++) if (tx + k < 16) P(tx + k, cy + j, k === 3 || Math.abs(j) === k ? f.ghost ? '#8fa8b8' : d : b);
      // dorsal fin
      if (!eel) for (let X = cx - 2; X <= cx + 1; X++) P(X, cy - ry - (X === cx ? 1 : 0), d);
      for (let Y = 0; Y < 16; Y++) for (let X = 0; X < 16; X++) {
        if (!inB(X, Y)) continue;
        const edge = !inB(X - 1, Y) || !inB(X + 1, Y) || !inB(X, Y - 1) || !inB(X, Y + 1);
        let col = Y > cy + 0.5 ? l : b;
        if (edge) col = f.ghost ? '#7e98a8' : '#2a1d14';
        else if (f.stripes && (X % 3 === 0) && Y <= cy) col = f.stripes;
        else if (f.patches && ((X * 7 + Y * 3) % 5 < 2)) col = f.patches;
        P(X, Y, col);
      }
      // eye
      const ex = Math.round(cx - rx + 2);
      if (!f.ghost) { P(ex, cy - 1, '#fff'); P(ex, cy - 1 + 0, '#111'); P(ex + 1, cy - 1, '#fff'); } else P(ex, cy - 1, '#c9e4f2');
      if (f.whiskers) { P(ex - 2, cy + 1, '#2a1d14'); P(ex - 3, cy + 2, '#2a1d14'); P(ex - 1, cy + 2, '#2a1d14'); }
      if (f.legendary) { P(cx, cy - 2, '#ffd23f'); P(cx + 1, cy - 2, '#ffd23f'); }
    });
  }

  /* ------------------------------------------------------------------
     MINE NODE TABLE
     ------------------------------------------------------------------ */
  const GEMS = [
    { id: 'quartz', from: 0, w: 40 }, { id: 'amethyst', from: 1, w: 22 }, { id: 'topaz', from: 5, w: 22 },
    { id: 'emerald', from: 20, w: 12 }, { id: 'ruby', from: 30, w: 10 }, { id: 'diamond', from: 40, w: 5 },
  ];
  const gemFor = depth => G.weighted(GEMS.filter(g => depth >= g.from).map(g => ({ w: g.w * (g.from > 0 ? 1 + depth / 60 : 1), id: g.id }))).id;
  const NODES = {
    mine_rock: { name: 'Rock', req: 0, hard: 0, xp: 2, col: '#8d847a', drops: d => [['stone', G.randInt(1, 2)], G.chance(0.06) && ['coal', 1]] },
    mine_rock2: { name: 'Rock', req: 0, hard: 0, xp: 2, col: '#7f7268', drops: d => [['stone', G.randInt(1, 2)], G.chance(0.05) && ['coal', 1], G.chance(0.012 + d * 0.0006) && ['geode', 1]] },
    node_coal: { name: 'Coal Node', req: 0, hard: 0, xp: 4, col: '#2b2b2b', from: 0, drops: d => [['coal', G.randInt(1, 3)], G.chance(0.3) && ['stone', 1]] },
    node_copper: { name: 'Copper Node', req: 0, hard: 0, xp: 5, col: '#d9774b', from: 1, ore: 'copper_ore', drops: d => [['copper_ore', G.randInt(1, 3)], G.chance(0.3) && ['stone', 1]] },
    node_iron: { name: 'Iron Node', req: 1, hard: 1, xp: 8, col: '#cfd2dc', from: 15, ore: 'iron_ore', drops: d => [['iron_ore', G.randInt(1, 3)], G.chance(0.3) && ['stone', 1]] },
    node_gold: { name: 'Gold Node', req: 2, hard: 1, xp: 12, col: '#f5c542', from: 30, ore: 'gold_ore', drops: d => [['gold_ore', G.randInt(1, 3)], G.chance(0.3) && ['stone', 1]] },
    node_iridium: { name: 'Iridium Node', req: 3, hard: 1, xp: 15, col: '#b25fe0', from: 45, ore: 'iridium_ore', drops: d => [['iridium_ore', G.randInt(1, 3)], G.chance(0.3) && ['stone', 1]] },
    crystal_decor: { name: 'Crystal Cluster', req: 0, hard: 0, xp: 4, col: '#9fe7ff', gem: true, drops: d => [['quartz', 1], G.chance(0.18) && [gemFor(d), 1]] },
    node_gem: { name: 'Gem Node', req: 0, hard: 1, xp: 10, col: '#ff7ad9', from: 0, gem: true, drops: d => [[gemFor(d), 1], G.chance(0.15) && ['geode', 1]] },
  };
  const HITS = [3, 2, 2, 1, 1];
  function nodeWeights(n) {
    return [
      { t: 'mine_rock', w: 44 }, { t: 'mine_rock2', w: 30 },
      { t: 'node_coal', w: 5 + Math.min(5, n / 8) },
      { t: 'node_copper', w: n >= 1 ? (n < 30 ? 14 : 7) : 0 },
      { t: 'node_iron', w: n >= 15 ? 11 : 0 },
      { t: 'node_gold', w: n >= 30 ? 8 : 0 },
      { t: 'node_iridium', w: n >= 45 ? 4 + (n - 45) * 0.25 : 0 },
      { t: 'node_gem', w: 1.5 + n / 20 },
    ].filter(o => o.w > 0);
  }
  const TREASURE = {
    10: [['copper_bar', 5], ['deluxe_bait', 10], ['geode', 2]],
    20: [['iron_bar', 3], ['amethyst', 2], ['geode', 3]],
    30: [['gold_ore', 10], ['emerald', 1], ['deluxe_bait', 15]],
    40: [['gold_bar', 3], ['ruby', 1], ['geode', 4]],
    50: [['iridium_ore', 6], ['diamond', 1]],
    60: [['iridium_bar', 2], ['diamond', 2], ['$', 2000]],
  };

  /* ------------------------------------------------------------------
     MINE state helpers
     ------------------------------------------------------------------ */
  const MS = () => (G.state.mod.mine = G.state.mod.mine || { elevator: 0, current: 0, treasure: {} });
  const FS = () => (G.state.mod.fishing = G.state.mod.fishing || { caught: {} });
  const tmp = () => G.temp.mine || (G.temp.mine = { objects: [], floor: 0 });
  let banner = null; // {text, sub, t}

  /* ------------------------------------------------------------------
     FLOOR GENERATION
     ------------------------------------------------------------------ */
  function cave(W, H) {
    cave._best = null; cave._bestScore = 1e9;
    const inb = (x, y) => x >= 1 && y >= 2 && x < W - 1 && y < H - 1;
    for (let attempt = 0; attempt < 30; attempt++) {
      let g = [];
      for (let y = 0; y < H; y++) { g.push([]); for (let x = 0; x < W; x++) g[y].push(inb(x, y) ? (Math.random() < 0.44 ? 1 : 0) : 1); }
      const cnt = (x, y) => { let n = 0; for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) { const X = x + i, Y = y + j; if (X < 0 || Y < 0 || X >= W || Y >= H || g[Y][X]) n++; } return n; };
      for (let it = 0; it < 5; it++) {
        const ng = g.map(r => r.slice());
        for (let y = 2; y < H - 1; y++) for (let x = 1; x < W - 1; x++) { const n = cnt(x, y); ng[y][x] = n >= 5 || (it < 2 && n <= 1) ? 1 : 0; }
        g = ng;
      }
      // label regions
      const reg = new Array(W * H).fill(-1), regions = [];
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        if (g[y][x] || reg[y * W + x] >= 0) continue;
        const id = regions.length, tiles = []; const st = [[x, y]]; reg[y * W + x] = id;
        while (st.length) { const [cx, cy] = st.pop(); tiles.push([cx, cy]); for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const X = cx + dx, Y = cy + dy; if (X >= 0 && Y >= 0 && X < W && Y < H && !g[Y][X] && reg[Y * W + X] < 0) { reg[Y * W + X] = id; st.push([X, Y]); } } }
        regions.push(tiles);
      }
      regions.sort((a, b) => b.length - a.length);
      if (!regions.length || regions[0].length < W * H * 0.15) continue;
      // fill tiny pockets, tunnel the rest into the main cave
      const main = regions[0];
      for (const r of regions.slice(1)) {
        if (r.length < 10) { for (const [x, y] of r) g[y][x] = 1; continue; }
        const [ax, ay] = G.pick(r); let best = null, bd = 1e9;
        for (let k = 0; k < 40; k++) { const t = G.pick(main); const d = Math.abs(t[0] - ax) + Math.abs(t[1] - ay); if (d < bd) { bd = d; best = t; } }
        let x = ax, y = ay; const [bx, by] = best; const horizFirst = Math.random() < 0.5;
        const carve = (X, Y) => { if (inb(X, Y)) g[Y][X] = 0; };
        while (x !== bx || y !== by) {
          if ((horizFirst && x !== bx) || y === by) x += Math.sign(bx - x); else y += Math.sign(by - y);
          carve(x, y); if (Math.random() < 0.5) carve(x + 1, y); if (Math.random() < 0.3) carve(x, y + 1);
        }
        main.push(...r);
      }
      let floor = 0; for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (!g[y][x]) floor++;
      if (floor >= W * H * 0.27 && floor <= W * H * 0.68) return g;
      if (!cave._best || Math.abs(floor / (W * H) - 0.4) < cave._bestScore) { cave._best = g; cave._bestScore = Math.abs(floor / (W * H) - 0.4); }
    }
    // fallback: best attempt so far, else an open box
    const best = cave._best; cave._best = null; cave._bestScore = 1e9;
    if (best && best.length === H) return best;
    const g = []; for (let y = 0; y < H; y++) { g.push([]); for (let x = 0; x < W; x++) g[y].push(inb(x, y) ? 0 : 1); } return g;
  }
  function bfs(g, W, H, sx, sy, blocked) {
    const dist = new Array(W * H).fill(-1); const q = [[sx, sy]]; dist[sy * W + sx] = 0;
    while (q.length) { const [x, y] = q.shift(); for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const X = x + dx, Y = y + dy; if (X < 0 || Y < 0 || X >= W || Y >= H || g[Y][X] || dist[Y * W + X] >= 0 || (blocked && blocked(X, Y))) continue; dist[Y * W + X] = dist[y * W + x] + 1; q.push([X, Y]); } }
    return dist;
  }

  function addObj(type, x, y, extra) { const o = Object.assign({ type, x, y, uid: G.uid() }, extra || {}); tmp().objects.push(o); return o; }

  function buildEntrance(m) {
    const W = 17, H = 13, rows = [];
    for (let y = 0; y < H; y++) {
      let r = '';
      for (let x = 0; x < W; x++) {
        let floor = x >= 2 && x <= 14 && y >= 3 && y <= 10;
        if ((x === 2 || x === 14) && (y === 3 || y === 10)) floor = false;
        if (x === 1 && y >= 5 && y <= 8) floor = true;
        if (x === 15 && y >= 6 && y <= 9) floor = true;
        if (y === 11 && x >= 6 && x <= 10) floor = true;
        r += floor ? 'm' : 'M';
      }
      rows.push(r);
    }
    Object.assign(m, { w: W, h: H, ground: rows, dark: 0.12, name: 'Mine Entrance' });
    m.spawns = { top: { x: 8, y: 4, dir: 'down' }, start: { x: 8, y: 4, dir: 'down' }, down: { x: 8, y: 4, dir: 'down' }, elev: { x: 12, y: 4, dir: 'down' } };
    addObj('ladder_up', 8, 3);
    addObj('mine_elevator', 12, 3);
    addObj('ladder_down', 5, 8);
    addObj('mine_sign', 4, 3);
    addObj('crystal_decor', 13, 9); addObj('crystal_decor', 2, 9);
    addObj('mine_rock', 10, 8); addObj('mine_rock2', 11, 9); addObj('node_copper', 13, 7); addObj('mine_rock', 3, 6);
    m.lights = [];
    for (const x of [3, 6, 10, 14]) { addObj('mine_torch', x, 2); m.lights.push({ x, y: 2, r: 3 }); }
    tmp().ladderFound = true;
  }

  function buildFloor(m, n) {
    const W = 26 + G.randInt(0, 8), H = 20 + G.randInt(0, 5);
    const g = cave(W, H);
    const isFloor = (x, y) => x >= 0 && y >= 0 && x < W && y < H && !g[y][x];
    // ladder-up spot: floor with wall above and floor below
    const cands = [];
    for (let y = 2; y < H - 2; y++) for (let x = 1; x < W - 1; x++) if (isFloor(x, y) && !isFloor(x, y - 1) && isFloor(x, y + 1) && isFloor(x, y + 2)) cands.push({ x, y });
    let L = cands.length ? G.pick(cands) : null;
    if (!L) { // carve one
      for (let y = 2; y < H - 2 && !L; y++) for (let x = 1; x < W - 1; x++) if (isFloor(x, y + 1)) { g[y][x] = 0; L = { x, y }; break; }
    }
    const S = { x: L.x, y: L.y + 1 };
    // optional underground lake on floors 20/40/60
    let lake = false;
    if (n % 20 === 0) {
      // carve an open grotto around a far-away floor tile and fill its middle with water
      const d0 = bfs(g, W, H, S.x, S.y);
      const spots = [];
      for (let y = 5; y < H - 6; y++) for (let x = 6; x < W - 7; x++) if (!g[y][x] && d0[y * W + x] > 6 && Math.abs(x - S.x) + Math.abs(y - S.y) > 10) spots.push({ x, y });
      if (spots.length) {
        const c = G.pick(spots);
        for (let j = -3; j <= 3; j++) for (let i = -4; i <= 4; i++) { const dx = i / 4.6, dy = j / 3.6; if (dx * dx + dy * dy <= 1) g[c.y + j][c.x + i] = 0; }
        for (let j = -1; j <= 1; j++) for (let i = -2; i <= 2; i++) { if (Math.abs(i) === 2 && Math.abs(j) === 1) continue; g[c.y + j][c.x + i] = 2; }
        g[c.y][c.x - 2] = 2; g[c.y][c.x + 2] = 2; g[c.y - 1][c.x] = 2; g[c.y + 1][c.x] = 2;
        lake = true;
      }
    }
    const rows = g.map(r => r.map(v => v === 2 ? 'w' : (v ? 'M' : 'm')).join(''));
    const solidG = g.map(r => r.map(v => v ? 1 : 0));
    const dist = bfs(solidG, W, H, S.x, S.y);
    const fl = (x, y) => isFloor(x, y) && g[y][x] === 0;
    const open8 = (x, y) => { for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) if (!fl(x + i, y + j)) return false; return true; };
    Object.assign(m, { w: W, h: H, ground: rows, dark: Math.min(0.58, 0.2 + 0.38 * n / MAX_FLOOR), name: 'Mine Floor ' + n });
    const taken = new Set([G.key(L.x, L.y), G.key(S.x, S.y)]);
    addObj('ladder_up', L.x, L.y);
    m.spawns = { down: { x: S.x, y: S.y, dir: 'down' }, start: { x: S.x, y: S.y, dir: 'down' }, top: { x: S.x, y: S.y, dir: 'down' }, elev: { x: S.x, y: S.y, dir: 'down' } };
    // elevator on every 5th floor
    if (n % 5 === 0) {
      let best = null, bd = 1e9;
      for (const c of cands) { if (Math.abs(c.x - L.x) < 2 && c.y === L.y) continue; if (taken.has(G.key(c.x, c.y)) || taken.has(G.key(c.x, c.y + 1))) continue; const d = dist[(c.y + 1) * W + c.x]; if (d >= 2 && d < bd) { bd = d; best = c; } }
      if (best) { addObj('mine_elevator', best.x, best.y); taken.add(G.key(best.x, best.y)); taken.add(G.key(best.x, best.y + 1)); m.spawns.elev = { x: best.x, y: best.y + 1, dir: 'down' }; }
    }
    // free floor tiles
    const free = [];
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (fl(x, y) && !taken.has(G.key(x, y)) && dist[y * W + x] > 2) free.push({ x, y });
    for (let i = free.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [free[i], free[j]] = [free[j], free[i]]; }
    const occ = new Set(taken);
    const take = pred => { for (let i = 0; i < free.length; i++) { const f = free[i]; if (occ.has(G.key(f.x, f.y))) continue; if (pred && !pred(f)) continue; occ.add(G.key(f.x, f.y)); free.splice(i, 1); return f; } return null; };
    const sp = m.spawns.elev; occ.add(G.key(sp.x, sp.y));
    // guaranteed treasure every 10 floors (first visit)
    const st = MS();
    if (TREASURE[n] && !st.treasure[n]) {
      const f = take(f => open8(f.x, f.y) && dist[f.y * W + f.x] <= 12) || take(f => open8(f.x, f.y)) || take();
      if (f) addObj('mine_treasure', f.x, f.y, { floor: n });
    }
    // crates / barrels
    const nCrates = G.chance(0.55) ? G.randInt(1, 2) : 0;
    for (let i = 0; i < nCrates; i++) { const f = take(); if (f) addObj(G.chance(0.5) ? 'mine_crate' : 'mine_barrel', f.x, f.y); }
    // nodes
    const nNodes = Math.floor(free.length * G.rand(0.16, 0.22));
    const weights = nodeWeights(n);
    let placed = 0;
    for (let i = 0; i < nNodes; i++) {
      let t = G.weighted(weights).t;
      const f = take(); if (!f) break;
      if (NODES[t].req > 0 && !open8(f.x, f.y)) t = G.chance(0.5) ? 'mine_rock' : 'mine_rock2';
      addObj(t, f.x, f.y); placed++;
      // ore veins: neighbours of an ore node sometimes match
      if (NODES[t].ore && G.chance(0.45)) {
        for (const [dx, dy] of [[1, 0], [0, 1], [-1, 0], [0, -1]]) {
          const X = f.x + dx, Y = f.y + dy;
          if (!fl(X, Y) || occ.has(G.key(X, Y)) || dist[Y * W + X] <= 2 || !G.chance(0.4)) continue;
          if (NODES[t].req > 0 && !open8(X, Y)) continue;
          occ.add(G.key(X, Y)); addObj(t, X, Y); placed++;
        }
      }
    }
    // visible ladder sometimes
    tmp().ladderFound = false;
    if (n < MAX_FLOOR && G.chance(0.15)) { const f = take(f => dist[f.y * W + f.x] > 6); if (f) { addObj('ladder_down', f.x, f.y); tmp().ladderFound = true; } }
    if (n >= MAX_FLOOR) tmp().ladderFound = true;
    // decor (non-solid)
    const nDecor = G.randInt(2, 5) + (n > 30 ? 2 : 0);
    for (let i = 0; i < nDecor; i++) { const f = take(); if (f) addObj('crystal_decor', f.x, f.y, { hue: G.randInt(0, 3) }); }
    // torches on walls that face floor
    m.lights = [];
    const walls = [];
    for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) if (g[y][x] === 1 && fl(x, y + 1) && !occ.has(G.key(x, y + 1))) walls.push({ x, y });
    walls.sort(() => Math.random() - 0.5);
    const nT = Math.max(3, Math.round(W * H / 110)); const tor = [];
    for (const w of walls) { if (tor.length >= nT) break; if (tor.some(t => Math.abs(t.x - w.x) + Math.abs(t.y - w.y) < 7)) continue; if (Math.abs(w.x - L.x) <= 1 && w.y === L.y - 0) continue; tor.push(w); }
    if (!tor.some(t => Math.abs(t.x - L.x) < 5 && Math.abs(t.y - L.y) < 4)) { const near = walls.find(w => Math.abs(w.x - L.x) >= 1 && Math.abs(w.x - L.x) < 5 && Math.abs(w.y - L.y) < 4); if (near) tor.push(near); }
    for (const t of tor) { addObj('mine_torch', t.x, t.y); m.lights.push({ x: t.x, y: t.y, r: 3 }); }
    tmp().lake = lake;
    tmp().rocksBroken = 0;
  }

  function spawnDust(m) {
    G.ents.mine = [];
    const n = G.randInt(4, 7);
    for (let i = 0; i < n; i++) {
      const d = { kind: 'dust', x: G.rand(2, m.w - 2) * T, y: G.rand(2, m.h - 2) * T, ph: G.rand(0, 6.28), hue: G.pick(['#fff3b0', '#b8f0ff', '#ffd1f0']), vx: G.rand(-8, 8), vy: G.rand(-6, 6), sortY: 30 };
      d.update = dt => {
        d.ph += dt; d.vx += Math.sin(d.ph * 0.7) * 6 * dt; d.vy += Math.cos(d.ph * 0.9) * 6 * dt; d.vx *= 0.99; d.vy *= 0.99;
        // shy: drift away from the player
        const dx = d.x - G.player.x, dy = d.y - G.player.y, dd = Math.hypot(dx, dy);
        if (dd < 90) { d.vx += dx / dd * 40 * dt; d.vy += dy / dd * 40 * dt; }
        d.x = G.clamp(d.x + d.vx * dt, T, (m.w - 1) * T); d.y = G.clamp(d.y + d.vy * dt, T * 2, (m.h - 1) * T);
      };
      d.draw = (ctx, sx, sy) => {
        const a = 0.5 + Math.sin(d.ph * 3) * 0.3, yy = sy - 40 + Math.sin(d.ph * 2) * 4;
        ctx.globalAlpha = a * 0.35; ctx.fillStyle = d.hue; ctx.beginPath(); ctx.arc(sx, yy, 6, 0, 7); ctx.fill();
        ctx.globalAlpha = a; ctx.fillRect(sx - 1.5, yy - 1.5, 3, 3); ctx.globalAlpha = 1;
      };
      G.ents.mine.push(d);
    }
  }

  function enterFloor(n, spawn) {
    const m = G.maps.mine;
    G.temp.mine = { objects: [], floor: n };
    if (n === 0) buildEntrance(m); else buildFloor(m, n);
    spawnDust(m);
    G.world._dirty = true;
    const st = MS(); st.current = n;
    if (n > (G.state.stats.deepestMine || 0)) G.state.stats.deepestMine = n;
    let sub = '';
    if (n > 0 && n % 5 === 0 && n > (st.elevator || 0)) { st.elevator = n; sub = 'Elevator unlocked!'; setTimeout(() => G.ui.toast(`Elevator unlocked: floor ${n}`, null, 'level'), 300); G.sfx('level'); }
    if (n === 15 && (G.state.tools.pickaxe || 0) < 1) sub = sub || 'Iron here needs a Copper pickaxe';
    if (n === 30 && (G.state.tools.pickaxe || 0) < 2) sub = sub || 'Gold here needs an Iron pickaxe';
    if (n === 45 && (G.state.tools.pickaxe || 0) < 3) sub = sub || 'Iridium here needs a Gold pickaxe';
    if (tmp().lake) sub = sub || 'An underground lake... something pale swims here.';
    banner = { text: n === 0 ? 'Mine Entrance' : 'Floor ' + n, sub, t: 0 };
  }
  let nextFloor = null;
  function goFloor(n, spawn = 'down') { nextFloor = G.clamp(n, 0, MAX_FLOOR); G.world.go('mine', spawn); }

  /* ------------------------------------------------------------------
     NODES — breaking
     ------------------------------------------------------------------ */
  function remainingRocks() { return tmp().objects.filter(o => NODES[o.type] || o.type === 'mine_crate' || o.type === 'mine_barrel').length; }
  function revealLadderMaybe(x, y) {
    const t = tmp(); if (t.ladderFound || t.floor >= MAX_FLOOR || t.floor === 0) return;
    const rem = remainingRocks();
    const p = Math.max(0.07, 1 / Math.max(1, rem));
    if (Math.random() < p || rem <= 1) {
      addObj('ladder_down', x, y); t.ladderFound = true; G.world._dirty = true;
      G.fx.float('A ladder!', (x + 0.5) * T, y * T, '#ffe680'); G.sfx('open');
    }
  }
  function dropAt(o, id, qty, q) { G.world.dropItem('mine', (o.x + 0.5) * T, (o.y + 0.7) * T, id, qty, q || 0); }

  function hitNode(o, tool, tier) {
    const N = NODES[o.type];
    if (tool !== 'pickaxe') return false;
    if (G.fumble()) return true;
    if (tier < N.req) {
      const now = performance.now();
      if (!hitNode._warn || now - hitNode._warn > 2500) { hitNode._warn = now; G.ui.toast("Your pickaxe isn't strong enough. Upgrade at the blacksmith.", 'tool:pickaxe:' + tier, 'warn'); }
      G.sfx('error');
      o.shake = 0.25; G.fx.burst((o.x + 0.5) * T, (o.y + 0.5) * T, '#ccc', 3, 3); return true;
    }
    if (o.hp == null) o.hp = HITS[G.clamp(tier, 0, 4)] + N.hard;
    o.hp--; o.shake = 0.22;
    G.fx.burst((o.x + 0.5) * T, (o.y + 0.5) * T, N.col, 5, 4); G.fx.burst((o.x + 0.5) * T, (o.y + 0.5) * T, '#8d847a', 3, 3);
    G.sfx('hit');
    if (o.hp > 0) return true;
    // broken!
    G.world.removeObject('mine', o);
    G.fx.burst((o.x + 0.5) * T, (o.y + 0.5) * T, N.col, 14, 5); G.fx.burst((o.x + 0.5) * T, (o.y + 0.5) * T, '#6b635a', 8, 4);
    G.sfx('break');
    const depth = tmp().floor, wm = G.workMult();
    let ore = 0, tiredLoss = false;
    for (const d of N.drops(depth)) {
      if (!d) continue;
      const [id, base] = d; let q = 0, qty = base;
      if (G.items[id] && G.items[id].cat === 'mineral' && /quartz|amethyst|topaz|emerald|ruby|diamond/.test(id)) {
        q = G.rollQuality(G.skillLvl('mining'), depth / 120); if (G.fatigue().qShift) tiredLoss = true;
      } else {
        // deeper floors are a little richer
        if (N.ore && G.chance(Math.min(0.4, depth / 120))) qty++;
        qty = Math.max(1, Math.round(qty * wm)); if (wm < 1) tiredLoss = true;
      }
      if (N.ore || N.gem || id === 'coal') ore += qty;
      dropAt(o, id, qty, q);
    }
    G.state.stats.oreMined = (G.state.stats.oreMined || 0) + ore;
    G.addXP('mining', N.xp + Math.floor(depth / 20));
    if (tiredLoss) G.fx.float('(tired)', (o.x + 0.5) * T, o.y * T - 16, '#aaa');
    tmp().rocksBroken = (tmp().rocksBroken || 0) + 1;
    revealLadderMaybe(o.x, o.y);
    return true;
  }
  function openCrate(o, big) {
    G.world.removeObject('mine', o);
    const depth = tmp().floor;
    G.fx.burst((o.x + 0.5) * T, (o.y + 0.5) * T, '#a0703c', 14, 5); G.sfx('break');
    const loot = [];
    loot.push(['coal', G.randInt(1, 3)]);
    const ore = G.weighted(nodeWeights(depth).filter(w => NODES[w.t].ore).map(w => ({ w: w.w, id: NODES[w.t].ore })).concat([{ w: 3, id: 'copper_ore' }])).id;
    loot.push([ore, G.randInt(1, 4)]);
    if (G.chance(0.35)) loot.push(['geode', 1]);
    if (G.chance(0.18)) loot.push(['bait', G.randInt(2, 5)]);
    if (G.chance(0.06 + depth / 400)) loot.push([gemFor(depth), 1]);
    for (const [id, n] of loot) dropAt(o, id, Math.max(1, Math.round(n * G.workMult())), 0);
    revealLadderMaybe(o.x, o.y);
    return true;
  }
  function openTreasure(o) {
    const st = MS(); const n = o.floor;
    if (st.treasure[n]) return false;
    st.treasure[n] = true;
    G.world.removeObject('mine', o);
    const reward = TREASURE[n] || [['geode', 3]];
    G.sfx('craft'); G.fx.burst((o.x + 0.5) * T, (o.y + 0.5) * T, '#ffe680', 22, 5);
    const names = [];
    for (const [id, q] of reward) {
      if (id === '$') { G.earn(q); names.push(G.fmtMoney(q)); continue; }
      G.inv.give(id, q, 0); names.push(`${q} ${G.item(id).name}`);
    }
    G.ui.dialog('Treasure!', `You pry open an old miner's chest from floor ${n}.<br><br><b>${names.join(', ')}</b>`, [{ label: 'Sweet!' }], 'treasure');
    return true;
  }

  /* ------------------------------------------------------------------
     FISHING
     ------------------------------------------------------------------ */
  const isRain = () => !!(G.state.mod.farm && G.state.mod.farm.weather === 'rain');
  const hasWeather = () => !!(G.state.mod.farm && G.state.mod.farm.weather !== undefined);
  const inHours = (hrs, h) => { if (!hrs) return true; const [a, b] = hrs; return a <= b ? h >= a && h < b : h >= a || h < b; };
  const locationOf = mapId => { const m = G.maps[mapId]; if (m && m.meta && m.meta.fishLocation) return m.meta.fishLocation; return { farm: 'pond', town: 'river', mine: 'mine' }[mapId] || 'pond'; };

  /** opts: {season, hour, rain, skill, deluxe, anyTime (ignore time windows — for the hired Fisher)} */
  function rollFish(loc = 'pond', opts = {}) {
    const season = opts.season != null ? opts.season : G.state.season;
    const hour = opts.hour != null ? opts.hour : G.hour();
    const rain = opts.rain != null ? opts.rain : isRain();
    const skill = opts.skill != null ? opts.skill : G.skillLvl('fishing');
    const trashP = Math.max(0.03, 0.12 - skill * 0.008 - (opts.deluxe ? 0.04 : 0));
    if (Math.random() < trashP) return Math.random() < (loc === 'mine' ? 0.3 : 0.5) ? 'seaweed' : 'trash';
    const list = [];
    for (const [id, f] of Object.entries(FISH)) {
      if (!f.loc.includes(loc)) continue;
      if (!f.seasons.includes(season)) continue;
      if (!opts.anyTime && !inHours(f.hours, hour)) continue;
      let w = f.w;
      if (f.rain) w = rain ? w * 3 : (hasWeather() ? 0 : w * 0.3);
      if (f.legendary) w += skill * 0.12 + (opts.deluxe ? 0.4 : 0);
      if (f.diff > 60) w *= 1 + skill * 0.06;
      if (w > 0) list.push({ id, w });
    }
    if (!list.length) return Math.random() < 0.5 ? 'seaweed' : 'trash';
    return G.weighted(list).id;
  }

  // fishing state
  const F = { phase: null };
  let needRelease = false, catchCard = null, bang = null, shake = 0;
  const rodTier = () => G.state.tools.fishing_rod || 0;
  const tired = () => G.fatigueLevel() >= 2;

  function rodTip() {
    const p = G.player;
    return {
      down: { x: p.x + 16, y: p.y - 14 }, up: { x: p.x + 12, y: p.y - 82 },
      left: { x: p.x - 44, y: p.y - 58 }, right: { x: p.x + 44, y: p.y - 58 },
    }[p.dir] || { x: p.x, y: p.y - 40 };
  }
  function rodHand() {
    const p = G.player;
    return { down: { x: p.x + 8, y: p.y - 26 }, up: { x: p.x + 9, y: p.y - 34 }, left: { x: p.x - 8, y: p.y - 28 }, right: { x: p.x + 8, y: p.y - 28 } }[p.dir];
  }

  function findWater(ctx) {
    const p = G.player, map = p.map, pt = p.tile();
    const d = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] }[p.dir];
    for (let k = 3; k >= 1; k--) { const x = pt.x + d[0] * k, y = pt.y + d[1] * k; if (G.world.ground(map, x, y) === 'w') return { x, y }; }
    if (ctx && G.world.ground(map, ctx.x, ctx.y) === 'w') return { x: ctx.x, y: ctx.y };
    return null;
  }

  function startCast(tile) {
    const p = G.player;
    if (F.phase || p.busy) return false;
    if (!tile || G.world.ground(p.map, tile.x, tile.y) !== 'w') return false;
    if (G.fumble()) return true;
    const bait = G.inv.has('deluxe_bait') ? 'deluxe_bait' : (G.inv.has('bait') ? 'bait' : null);
    if (!bait) { G.ui.toast('You need bait to fish! Buy some at the General Store or craft it.', 'bait', 'warn'); G.sfx('error'); return true; }
    G.inv.remove(bait, 1);
    const left = G.inv.count('bait') + G.inv.count('deluxe_bait');
    if (left === 0) G.ui.toast('That was your last bait!', 'bait', 'warn');
    // face the water
    const pt = p.tile(), dx = tile.x - pt.x, dy = tile.y - pt.y;
    if (Math.abs(dx) > Math.abs(dy)) p.dir = dx < 0 ? 'left' : 'right'; else if (dy) p.dir = dy < 0 ? 'up' : 'down';
    p.busy = true; p.swingT = 0.3; p.swingTool = 'fishing_rod';
    const deluxe = bait === 'deluxe_bait';
    let wait = G.rand(2, 8) * (deluxe ? 0.6 : 1) * (1 - 0.06 * rodTier());
    Object.assign(F, {
      phase: 'cast', t: 0, map: p.map, tile, bx: (tile.x + 0.5) * T, by: (tile.y + 0.55) * T, deluxe, bait,
      waitT: wait, biteT: 0, fishId: null, ripples: [], nibble: 0, nibbleT: G.rand(0.8, 2), dip: 0, mg: null, pullT: 0,
    });
    const tip = rodTip(); F.sx = tip.x; F.sy = tip.y;
    F.ent = G.world.addEnt(p.map, { kind: 'bobber', x: F.bx, y: F.by, sortY: 0, draw: drawBobberEnt });
    G.sfx('reel');
    return true;
  }

  function endFishing(msg, color) {
    const p = G.player;
    if (F.ent) G.world.removeEnt(F.map, F.ent);
    F.phase = null; F.ent = null; F.mg = null; bang = null;
    p.busy = false; p.cooldown = 0.35;
    needRelease = true;
    if (msg) G.fx.float(msg, p.x, p.y - 70, color || '#fff');
  }

  function hook() {
    if (F.phase !== 'bite') return;
    bang = null;
    const id = F.fishId;
    if (!FISH[id]) { // junk comes straight up
      F.phase = 'pull'; F.pullT = 0; F.result = { id, q: 0, perfect: false };
      G.sfx('reel'); return;
    }
    const f = FISH[id], tier = rodTier();
    let zone = 0.28 * (1 + 0.15 * tier) + G.skillLvl('fishing') * 0.006;
    if (tired()) zone *= 0.82;
    F.phase = 'reel';
    F.mg = {
      t: 0, zone: 0, zv: 0, zsize: Math.min(0.6, zone), f: 0.18, fv: 0, target: 0.5, timer: 0.5,
      prog: 0.3, perfect: true, inside: false, diff: f.diff / 100, move: f.move, bubbles: [], reelT: 0, spin: 0, glow: 0, end: null, endT: 0,
    };
    G.sfx('bite');
  }

  function updateMinigame(dt) {
    const mg = F.mg; mg.t += dt;
    if (mg.end) { // short outro then resolve
      mg.endT += dt;
      if (mg.endT > 0.55) {
        if (mg.end === 'caught') { F.phase = 'pull'; F.pullT = 0; F.result = { id: F.fishId, perfect: mg.perfect }; }
        else { shake = 0.3; G.sfx('splash'); endFishing('It got away...', '#9fd3ff'); }
      }
      return;
    }
    const held = !!(G.input.keys.Space || G.input.mouseHeld);
    const tier = rodTier(), d = mg.diff;
    // --- catch zone physics (sub-stepped for smoothness)
    const steps = 3, h = dt / steps;
    for (let s = 0; s < steps; s++) {
      mg.zv += (held ? 3.3 : -2.7) * h;
      mg.zv = G.clamp(mg.zv, -1.5, 1.5);
      mg.zone += mg.zv * h;
      if (mg.zone < 0) { mg.zone = 0; mg.zv = mg.zv < -0.35 ? -mg.zv * 0.35 : 0; }
      if (mg.zone + mg.zsize > 1) { mg.zone = 1 - mg.zsize; if (mg.zv > 0) mg.zv = 0; }
      // --- fish brain
      mg.timer -= h;
      if (mg.timer <= 0) {
        const r = Math.random;
        switch (mg.move) {
          case 'smooth': mg.target = G.clamp(mg.f + (r() - 0.5) * 0.7, 0.05, 0.95); mg.timer = 0.8 + r() * 1.3; break;
          case 'dart': mg.target = mg.f > 0.5 ? 0.05 + r() * 0.35 : 0.6 + r() * 0.35; mg.timer = (0.45 + r()) * (1.25 - d * 0.5); break;
          case 'sinker': mg.target = r() < 0.75 ? 0.04 + r() * 0.45 : 0.5 + r() * 0.45; mg.timer = 0.6 + r() * 1.2; break;
          case 'floater': mg.target = r() < 0.75 ? 0.5 + r() * 0.46 : 0.05 + r() * 0.45; mg.timer = 0.6 + r() * 1.2; break;
          default: mg.target = 0.05 + r() * 0.9; mg.timer = (0.5 + r() * 1.3) * (1.25 - d * 0.6);
        }
        if (mg.t < 1) mg.target = G.clamp(mg.target, 0.1, 0.5);
      }
      const k = 3 + d * 9 + (mg.move === 'dart' ? 6 : 0), c = 2 * Math.sqrt(k) * 0.75;
      mg.fv += ((mg.target - mg.f) * k - mg.fv * c) * h;
      mg.f += mg.fv * h + Math.sin(mg.t * 9 + d * 4) * 0.0015 * d;
      if (mg.f < 0.02) { mg.f = 0.02; mg.fv = Math.abs(mg.fv) * 0.4; }
      if (mg.f > 0.98) { mg.f = 0.98; mg.fv = -Math.abs(mg.fv) * 0.4; }
    }
    const was = mg.inside;
    mg.inside = mg.f >= mg.zone - 0.015 && mg.f <= mg.zone + mg.zsize + 0.015;
    if (mg.inside) {
      mg.prog += (0.32 + 0.06 * tier) * dt; mg.glow = Math.min(1, mg.glow + dt * 6);
      mg.reelT -= dt; if (mg.reelT <= 0) { G.sfx('reel'); mg.reelT = 0.14; }
    } else {
      mg.glow = Math.max(0, mg.glow - dt * 4);
      if (mg.t > 0.7) { mg.prog -= (0.10 + d * 0.14) * dt; mg.perfect = false; }
    }
    if (was && !mg.inside && mg.t > 0.7) mg.wob = 0.25;
    mg.wob = Math.max(0, (mg.wob || 0) - dt);
    mg.spin += (held ? 14 : 3) * dt;
    if (Math.random() < dt * (mg.inside ? 9 : 3)) mg.bubbles.push({ x: G.rand(-10, 10), y: mg.f, t: 0, r: G.rand(1.5, 3.5) });
    mg.bubbles.forEach(b => { b.t += dt; b.y += dt * 0.25; }); mg.bubbles = mg.bubbles.filter(b => b.t < 1.2 && b.y < 1);
    if (mg.prog >= 1) { mg.prog = 1; mg.end = 'caught'; G.sfx('catch'); }
    else if (mg.prog <= 0) { mg.prog = 0; mg.end = 'lost'; }
  }

  function giveCatch() {
    const r = F.result, id = r.id, f = FISH[id];
    let q = 0, tiredNote = false;
    if (f) {
      q = G.rollQuality(G.skillLvl('fishing'), F.deluxe ? 0.3 : 0);
      if (r.perfect) q = Math.min(3, q + 1);
      tiredNote = G.fatigue().qShift < 0;
    }
    G.inv.give(id, 1, q);
    const fs = FS(); const isNew = !fs.caught[id]; fs.caught[id] = (fs.caught[id] || 0) + 1;
    if (f) {
      G.state.stats.fishCaught = (G.state.stats.fishCaught || 0) + 1;
      let xp = Math.round(5 + f.diff * 0.33); if (r.perfect) xp = Math.round(xp * 1.25); G.addXP('fishing', Math.min(40, xp));
      G.sfx('catch');
    } else { G.addXP('fishing', 1); G.sfx('pickup'); }
    catchCard = { id, q, val: G.priceOf(id, q), perfect: r.perfect && !!f, isNew: isNew && !!f, tired: tiredNote, t: 0 };
    const p = G.player;
    if (r.perfect && f) G.fx.float('PERFECT!', p.x, p.y - 90, '#ffe14d');
    if (tiredNote) G.fx.float('(tired)', p.x + 30, p.y - 60, '#aaa');
    G.fx.burst(F.bx, F.by, '#9fd3ff', 10, 4);
  }

  function updateFishing(dt) {
    if (!F.phase) return;
    const p = G.player;
    if (p.map !== F.map) { endFishing(); return; }
    F.t += dt;
    F.ripples.forEach(r => r.t += dt); F.ripples = F.ripples.filter(r => r.t < 1.2);
    if (F.ent) F.ent.sortY = Math.max(0, p.y - F.by) + 2;
    if (F.phase === 'cast') {
      if (F.t >= 0.5) {
        F.phase = 'wait'; F.t = 0; G.sfx('splash'); F.ripples.push({ t: 0 }, { t: -0.25 });
        G.fx.burst(F.bx, F.by, '#cfe9ff', 8, 3);
      }
    } else if (F.phase === 'wait') {
      F.waitT -= dt; F.nibbleT -= dt;
      if (F.nibbleT <= 0 && F.waitT > 0.8) { F.nibble = 0.18; F.nibbleT = G.rand(0.9, 2.2); F.ripples.push({ t: 0, small: true }); }
      F.nibble = Math.max(0, F.nibble - dt);
      if (F.waitT <= 0) {
        F.phase = 'bite'; F.t = 0;
        F.fishId = rollFish(locationOf(F.map), { deluxe: F.deluxe });
        F.biteT = 1.0 + 0.1 * rodTier();
        bang = { t: 0 }; G.sfx('bite'); F.ripples.push({ t: 0 }, { t: -0.15 }, { t: -0.3 });
        G.fx.burst(F.bx, F.by, '#ffffff', 6, 3);
      }
    } else if (F.phase === 'bite') {
      F.biteT -= dt; if (bang) bang.t += dt;
      if (F.biteT <= 0) endFishing('Missed it!', '#ffb3b3');
    } else if (F.phase === 'reel') {
      updateMinigame(dt);
    } else if (F.phase === 'pull') {
      F.pullT += dt;
      if (F.pullT >= 0.45) { giveCatch(); endFishing(); }
    }
  }

  function drawBobberEnt(ctx) {
    if (!F.phase) return;
    const p = G.player, cx = G.cam.x, cy = G.cam.y;
    const hand = rodHand(), tip = rodTip();
    // rod
    ctx.strokeStyle = '#5b3a1e'; ctx.lineWidth = 4; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(hand.x - cx, hand.y - cy); ctx.lineTo(tip.x - cx, tip.y - cy); ctx.stroke();
    ctx.strokeStyle = ['#a8743f', '#d9774b', '#cfd2dc', '#f5c542', '#b25fe0'][rodTier()] || '#a8743f'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(hand.x - cx, hand.y - cy); ctx.lineTo(tip.x - cx, tip.y - cy); ctx.stroke();
    // bobber position
    let bx = F.bx, by = F.by, under = false;
    if (F.phase === 'cast') {
      const t = Math.min(1, F.t / 0.5);
      bx = tip.x + (F.bx - tip.x) * t; by = tip.y + (F.by - tip.y) * t - Math.sin(t * Math.PI) * 70;
    } else if (F.phase === 'pull') {
      const t = Math.min(1, F.pullT / 0.45);
      bx = F.bx + (p.x - F.bx) * t; by = F.by + (p.y - 40 - F.by) * t - Math.sin(t * Math.PI) * 60;
    } else {
      const now = performance.now() / 1000;
      by += Math.sin(now * 3) * 1.5;
      if (F.nibble > 0) by += 3;
      if (F.phase === 'bite') { by += 6; under = true; }
      if (F.phase === 'reel') { bx += Math.sin(now * 13) * 4 * (F.mg ? F.mg.diff + 0.3 : 1); by += 5; under = true; }
    }
    // ripples
    for (const r of F.ripples) {
      if (r.t < 0) continue; const k = r.t / 1.2;
      ctx.strokeStyle = `rgba(230,245,255,${(1 - k) * 0.7})`; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.ellipse(F.bx - cx, F.by - cy + 4, (r.small ? 6 : 8) + k * (r.small ? 10 : 22), (r.small ? 2.5 : 3) + k * (r.small ? 4 : 8), 0, 0, 7); ctx.stroke();
    }
    // line
    const tight = F.phase === 'bite' || F.phase === 'reel';
    const mx = (tip.x + bx) / 2, my = (tip.y + by) / 2 + (tight ? 4 : 26);
    ctx.strokeStyle = 'rgba(240,240,240,0.85)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(tip.x - cx, tip.y - cy); ctx.quadraticCurveTo(mx - cx, my - cy, bx - cx, by - cy - 3); ctx.stroke();
    // bobber / fish
    if (F.phase === 'pull' && F.result) {
      const ic = G.icon(G.item(F.result.id).icon);
      ctx.drawImage(ic, Math.round(bx - cx - 16), Math.round(by - cy - 16), 32, 32);
    } else {
      const b = spr('bobber');
      const s = 16;
      if (under) { ctx.save(); ctx.beginPath(); ctx.rect(bx - cx - 12, by - cy - 14, 24, 12); ctx.clip(); }
      ctx.drawImage(b, Math.round(bx - cx - s / 2), Math.round(by - cy - s + 2), s, s);
      if (under) ctx.restore();
    }
  }

  /* ------------------------------------------------------------------
     OVERLAYS (screen space, drawn after core render)
     ------------------------------------------------------------------ */
  function rr(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
  function text(ctx, s, x, y, size, col, align = 'center', outline = '#000') {
    ctx.font = `bold ${size}px ${FONT}`; ctx.textAlign = align; ctx.textBaseline = 'alphabetic';
    if (outline) { ctx.fillStyle = outline; for (const [a, b] of [[2, 2], [-1, 1], [1, -1], [2, 0], [0, 2]]) ctx.fillText(s, x + a, y + b); }
    ctx.fillStyle = col; ctx.fillText(s, x, y);
  }
  function stars(ctx, q, x, y, size) {
    if (!q) return; const col = ['', '#d9e1e8', '#ffd23f', '#c56cf0'][q];
    text(ctx, '★', x, y, size, col, 'left');
  }

  function drawMinigame(ctx, vw, vh) {
    const mg = F.mg, p = G.player;
    const psx = p.x - G.cam.x, psy = p.y - G.cam.y;
    const BH = 320, BW = 54, PW = 14;
    // put the meter on the side away from the cast so the bobber stays visible
    const leftSide = p.dir === 'right' || (p.dir !== 'left' && psx + 64 + BW + PW + 30 > vw);
    let bx = leftSide ? psx - 70 - BW - PW - 12 : psx + 64, by = psy - 60 - BH / 2;
    if (bx < 10) bx = psx + 64;
    bx = G.clamp(bx, 10, vw - BW - PW - 30); by = G.clamp(by, 60, vh - BH - 110);
    // intro pop / outro
    let sc = Math.min(1, mg.t / 0.22); sc = 1 + 2.2 * Math.pow(sc - 1, 3) + 1.2 * Math.pow(sc - 1, 2); // easeOutBack-ish
    if (mg.end) sc = 1 - Math.max(0, (mg.endT - 0.3) / 0.25) * 0.15;
    const jx = (mg.wob > 0 ? Math.sin(mg.t * 60) * 3 * mg.wob * 4 : 0) + (mg.end === 'lost' ? Math.sin(mg.endT * 70) * 4 : 0);
    ctx.save();
    ctx.translate(bx + BW / 2 + jx, by + BH / 2); ctx.scale(sc, sc); ctx.translate(-(BW / 2), -(BH / 2));
    if (mg.end) ctx.globalAlpha = 1 - Math.max(0, (mg.endT - 0.35) / 0.2);
    // frame
    ctx.fillStyle = 'rgba(0,0,0,0.35)'; rr(ctx, 4, 6, BW + PW + 12, BH, 10); ctx.fill();
    ctx.fillStyle = '#5b3a1e'; rr(ctx, 0, 0, BW + PW + 12, BH, 10); ctx.fill();
    ctx.fillStyle = '#8b5a2b'; rr(ctx, 3, 3, BW + PW + 6, BH - 6, 8); ctx.fill();
    ctx.strokeStyle = '#c8894a'; ctx.lineWidth = 2; rr(ctx, 5, 5, BW + PW + 2, BH - 10, 7); ctx.stroke();
    // water track
    const tx = 10, ty = 12, tw = BW - 14, th = BH - 24;
    const wg = ctx.createLinearGradient(0, ty, 0, ty + th); wg.addColorStop(0, '#2f78b8'); wg.addColorStop(1, '#0d2c55');
    ctx.fillStyle = wg; ctx.fillRect(tx, ty, tw, th);
    // subtle caustics
    ctx.fillStyle = 'rgba(255,255,255,0.05)';
    for (let i = 0; i < 6; i++) { const yy = ty + ((i * 53 + mg.t * 20) % th); ctx.fillRect(tx + 3, yy, tw - 6, 2); }
    const Y = v => ty + th - v * th;
    // catch zone
    const zy = Y(mg.zone + mg.zsize), zh = mg.zsize * th;
    const ga = 0.38 + mg.glow * 0.3;
    ctx.fillStyle = `rgba(120,230,110,${ga})`; ctx.fillRect(tx + 1, zy, tw - 2, zh);
    ctx.strokeStyle = mg.inside ? '#e6ffd0' : '#8fdc7a'; ctx.lineWidth = 2; ctx.strokeRect(tx + 2, zy + 1, tw - 4, zh - 2);
    if (mg.glow > 0) { ctx.fillStyle = `rgba(255,255,255,${mg.glow * 0.18})`; ctx.fillRect(tx + 4, zy + 3, tw - 8, 4); }
    // bubbles
    for (const b of mg.bubbles) { ctx.strokeStyle = `rgba(220,240,255,${1 - b.t / 1.2})`; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(tx + tw / 2 + b.x, Y(b.y) - 8, b.r, 0, 7); ctx.stroke(); }
    // fish
    const ic = G.icon(G.item(F.fishId).icon);
    const fy = Y(mg.f);
    ctx.save(); ctx.translate(tx + tw / 2, fy); ctx.rotate(G.clamp(mg.fv * -0.5, -0.5, 0.5) + Math.sin(mg.t * 12) * 0.08);
    if (mg.inside) { ctx.shadowColor = '#fff6a0'; ctx.shadowBlur = 10; }
    ctx.drawImage(ic, -16, -16, 32, 32); ctx.restore();
    // progress meter
    const px = BW + 2, pw = PW, ph = th;
    ctx.fillStyle = '#2b1a0d'; ctx.fillRect(px, ty, pw, ph);
    const pr = G.clamp(mg.prog, 0, 1);
    const hue = Math.round(pr * 120);
    ctx.fillStyle = `hsl(${hue},75%,52%)`; ctx.fillRect(px + 2, ty + ph - pr * ph, pw - 4, pr * ph);
    ctx.fillStyle = 'rgba(255,255,255,0.25)'; ctx.fillRect(px + 2, ty + ph - pr * ph, 3, pr * ph);
    // reel handle
    ctx.save(); ctx.translate(-4, BH - 26);
    ctx.fillStyle = '#3b2412'; ctx.beginPath(); ctx.arc(0, 0, 11, 0, 7); ctx.fill();
    ctx.fillStyle = '#cfd2dc'; ctx.beginPath(); ctx.arc(0, 0, 8, 0, 7); ctx.fill();
    ctx.rotate(mg.spin); ctx.strokeStyle = '#3b2412'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, -12); ctx.stroke();
    ctx.fillStyle = '#e8402f'; ctx.beginPath(); ctx.arc(0, -12, 3.5, 0, 7); ctx.fill();
    ctx.restore();
    ctx.restore();
    ctx.globalAlpha = 1;
    // labels
    const lx = bx + (BW + PW + 12) / 2;
    if (!mg.end) {
      text(ctx, 'REEL IT IN!', lx, by - 10, 15, '#fff6d6');
      if (tired()) text(ctx, '(tired)', lx, by - 28, 12, '#bbb');
      text(ctx, 'hold SPACE / mouse', lx, by + BH + 22, 12, '#ddd');
      if (mg.inside && mg.perfect && mg.t > 1) text(ctx, 'perfect so far', lx, by + BH + 38, 11, '#ffe14d');
    } else if (mg.end === 'caught') {
      const k = Math.min(1, mg.endT / 0.2);
      text(ctx, mg.perfect ? 'PERFECT!' : 'CAUGHT!', lx, by + BH / 2 - 10 * k, 18 + 6 * k, mg.perfect ? '#ffe14d' : '#b6ff9e');
    }
  }

  function drawBang(ctx) {
    const p = G.player, sx = p.x - G.cam.x, sy = p.y - G.cam.y - 92;
    const t = bang.t, pop = t < 0.15 ? t / 0.15 * 1.3 : 1.3 - Math.min(0.3, (t - 0.15) * 2);
    const bob = Math.sin(t * 25) * 2;
    ctx.save(); ctx.translate(sx, sy + bob); ctx.scale(pop, pop);
    ctx.fillStyle = '#fff'; ctx.strokeStyle = '#3b2412'; ctx.lineWidth = 3;
    rr(ctx, -14, -20, 28, 32, 8); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-4, 12); ctx.lineTo(0, 20); ctx.lineTo(4, 12); ctx.fill();
    text(ctx, '!', 0, 6, 24, '#e8402f', 'center', null);
    ctx.restore();
  }

  function drawCatchCard(ctx, vw) {
    const c = catchCard; const life = 3.4;
    const k = c.t < 0.25 ? 1 - Math.pow(1 - c.t / 0.25, 3) : (c.t > life - 0.35 ? (life - c.t) / 0.35 : 1);
    const W = 380, H = 104, x = vw / 2 - W / 2, y = -H + (H + 70) * k;
    ctx.save(); ctx.globalAlpha = Math.max(0, Math.min(1, k * 1.2));
    ctx.fillStyle = 'rgba(0,0,0,0.35)'; rr(ctx, x + 4, y + 6, W, H, 10); ctx.fill();
    ctx.fillStyle = '#5b3a1e'; rr(ctx, x, y, W, H, 10); ctx.fill();
    ctx.fillStyle = '#f6e6c2'; rr(ctx, x + 4, y + 4, W - 8, H - 8, 8); ctx.fill();
    // icon w/ sparkle
    const ic = G.icon(G.item(c.id).icon);
    ctx.fillStyle = '#e9d1a0'; rr(ctx, x + 14, y + 14, 76, 76, 8); ctx.fill();
    const wob = Math.sin(c.t * 6) * 0.08;
    ctx.save(); ctx.translate(x + 52, y + 52); ctx.rotate(wob); ctx.drawImage(ic, -32, -32, 64, 64); ctx.restore();
    if (c.q) stars(ctx, c.q, x + 18, y + 86, 18);
    const nm = G.item(c.id).name;
    text(ctx, (FISH[c.id] ? 'You caught a ' : 'You fished up ') , x + 104, y + 32, 14, '#6b4a2b', 'left', null);
    text(ctx, (c.q ? G.QUALITY[c.q] + ' ' : '') + nm + '!', x + 104, y + 56, 22, '#3b2412', 'left', null);
    text(ctx, `Worth ${c.val}g`, x + 104, y + 82, 15, '#8a5a00', 'left', null);
    let tx = x + 210;
    if (c.perfect) { text(ctx, 'PERFECT', tx, y + 82, 13, '#c58a00', 'left', null); tx += 74; }
    if (c.isNew) text(ctx, 'NEW!', tx, y + 82, 13, '#2f8a3f', 'left', null);
    if (c.tired) text(ctx, '(tired)', x + W - 16, y + 28, 12, '#888', 'right', null);
    ctx.restore();
  }

  function drawBanner(ctx, vw) {
    const b = banner, life = 2.4; const k = b.t < 0.3 ? b.t / 0.3 : (b.t > life - 0.5 ? (life - b.t) / 0.5 : 1);
    ctx.save(); ctx.globalAlpha = Math.max(0, k);
    const y = 110;
    const w = Math.max(220, b.sub ? b.sub.length * 9 + 40 : 0);
    ctx.fillStyle = 'rgba(20,12,6,0.7)'; rr(ctx, vw / 2 - w / 2, y - 34, w, b.sub ? 64 : 46, 10); ctx.fill();
    text(ctx, b.text, vw / 2, y, 26, '#ffe8b0');
    if (b.sub) text(ctx, b.sub, vw / 2, y + 22, 13, '#c9e4ff');
    ctx.restore();
  }

  function drawFallbackLights(ctx, m) {
    if (G.art.drawLights || !m.lights) return;
    const now = performance.now() / 1000;
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    for (const l of m.lights) {
      const sx = (l.x + 0.5) * T - G.cam.x, sy = (l.y + 0.6) * T - G.cam.y, r = (l.r || 3) * T * (0.95 + Math.sin(now * 7 + l.x) * 0.03);
      if (sx < -r || sy < -r || sx > G.cam.w + r || sy > G.cam.h + r) continue;
      const g = ctx.createRadialGradient(sx, sy, 4, sx, sy, r);
      g.addColorStop(0, 'rgba(255,190,90,0.38)'); g.addColorStop(0.4, 'rgba(255,140,50,0.14)'); g.addColorStop(1, 'rgba(255,120,40,0)');
      ctx.fillStyle = g; ctx.fillRect(sx - r, sy - r, r * 2, r * 2);
    }
    ctx.restore();
  }

  function overlay() {
    const ctx = G.ctx, z = G.cam.zoom; if (!ctx) return;
    const vw = G.canvas.width / z, vh = G.canvas.height / z;
    ctx.setTransform(z, 0, 0, z, 0, 0);
    try {
      const m = G.maps[G.player.map];
      if (G.player.map === 'mine') drawFallbackLights(ctx, m);
      if (shake > 0) ctx.translate(Math.sin(performance.now() / 15) * 3 * shake * 3, 0);
      if (bang && F.phase === 'bite') drawBang(ctx);
      if (F.phase === 'reel' && F.mg) drawMinigame(ctx, vw, vh);
      if (catchCard) drawCatchCard(ctx, vw);
      if (banner && G.player.map === 'mine') drawBanner(ctx, vw);
    } catch (e) { if (!overlay._err) { console.error('mine_fish overlay', e); overlay._err = 1; } }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }

  /* ------------------------------------------------------------------
     INIT
     ------------------------------------------------------------------ */
  G.on('init', () => {
    // ---- items
    for (const [id, f] of Object.entries(FISH)) if (!G.items[id]) G.defItem({ id, name: f.name, price: f.price, cat: 'fish', desc: f.desc + (f.legendary ? ' ★ Legendary' : '') });
    for (const [id, t] of Object.entries(TRASH)) if (!G.items[id]) G.defItem({ id, name: t.name, price: t.price, cat: t.cat, desc: t.desc });
    if (!G.items.geode) G.defItem({ id: 'geode', name: 'Geode', price: 50, cat: 'mineral', desc: 'A lumpy rock. Use it to crack it open — or sell it whole.' });
    if (!G.items.geode.use) G.items.geode.use = ctx => {
      if (!ctx.slot || ctx.slot.id !== 'geode') return false;
      G.inv.removeSlot(ctx.slotIndex, 1);
      const r = G.weighted([{ w: 30, id: 'quartz' }, { w: 15, id: 'amethyst' }, { w: 15, id: 'topaz' }, { w: 12, id: 'coal', n: 3 }, { w: 12, id: 'copper_ore', n: 5 }, { w: 8, id: 'iron_ore', n: 4 }, { w: 5, id: 'gold_ore', n: 3 }, { w: 3, id: 'emerald' }, { w: 2, id: 'ruby' }, { w: 0.6, id: 'diamond' }, { w: 0.4, id: 'iridium_ore', n: 2 }]);
      const gem = !r.n; const q = gem ? G.rollQuality(G.skillLvl('mining')) : 0;
      G.inv.give(r.id, r.n || 1, q);
      G.fx.burst(G.player.x, G.player.y - 40, '#b07cf0', 12, 4); G.sfx('break');
      G.fx.float('Crack!', G.player.x, G.player.y - 70, '#e6c8ff');
      G.player.cooldown = 0.4;
      return true;
    };
    // fallback icons for my items only when art didn't provide them
    for (const id of [...Object.keys(FISH), 'trash', 'seaweed', 'geode']) if (!G.art.icons[id] && !G.assets[id]) G.art.icons[id] = fishIconArt(id);
    if (!G.art.icons.treasure && !G.assets.treasure) G.art.icons.treasure = fallbackSprite('treasure');

    // ---- fishing rod use
    const rod = G.items.fishing_rod;
    rod.desc = rod.desc || 'Cast into any water. Needs bait. Upgrades widen the catch bar and reel faster.';
    const prevUse = rod.use;
    rod.use = ctx => {
      if (F.phase) return true;
      if (needRelease && (G.input.keys.Space || G.input.mouseHeld)) return true;
      const tile = findWater(ctx);
      if (!tile) {
        if (prevUse) return prevUse(ctx);
        const now = performance.now();
        if (!rod._hintT || now - rod._hintT > 2500) { rod._hintT = now; G.ui.toast('Face the water (pond, river) to cast your line.', 'tool:fishing_rod:' + rodTier()); }
        return true;
      }
      return startCast(tile);
    };

    // ---- objects
    const shadow = (ctx, px, py, w = 34) => { ctx.fillStyle = 'rgba(0,0,0,0.28)'; ctx.beginPath(); ctx.ellipse(px + 24, py + 40, w / 2, 6, 0, 0, 7); ctx.fill(); };
    for (const [type, N] of Object.entries(NODES)) {
      G.defObj(type, {
        solid: true,
        label: () => N.name,
        draw(ctx, o, px, py) {
          const s = spr(type); const dx = o.shake > 0 ? Math.sin(o.shake * 80) * 3 : 0;
          shadow(ctx, px, py);
          ctx.drawImage(s, Math.round(px + dx + (T - s.width) / 2), py + T - s.height);
          if (o.hp != null && o.hp > 0) { // damage cracks
            ctx.strokeStyle = 'rgba(20,10,5,0.7)'; ctx.lineWidth = 2; ctx.beginPath();
            ctx.moveTo(px + 20 + dx, py + 18); ctx.lineTo(px + 26 + dx, py + 28); ctx.lineTo(px + 22 + dx, py + 36); ctx.stroke();
          }
        },
        onTool: (o, tool, tier) => hitNode(o, tool, tier),
      });
    }
    const crateDef = (type, img) => G.defObj(type, {
      solid: true, label: () => 'Old Crate',
      draw(ctx, o, px, py) { const s = spr(img); const dx = o.shake > 0 ? Math.sin(o.shake * 80) * 3 : 0; shadow(ctx, px, py, 38); ctx.drawImage(s, px + dx, py + T - s.height, T, s.height * T / s.width); },
      onTool(o, tool) { if (tool !== 'pickaxe' && tool !== 'axe') return false; if (G.fumble()) return true; return openCrate(o); },
      interact(o) { G.ui.toast('Smash it with your pickaxe!', 'tool:pickaxe:' + (G.state.tools.pickaxe || 0)); return true; },
    });
    crateDef('mine_crate', 'wooden_storage_crate'); crateDef('mine_barrel', 'wooden_storage_barrel');
    G.defObj('mine_treasure', {
      solid: true, label: () => 'Treasure Chest',
      draw(ctx, o, px, py) {
        const s = spr('treasure'); const now = performance.now() / 1000;
        shadow(ctx, px, py, 40); ctx.drawImage(s, px, py + T - s.height, T, s.height * T / s.width);
        ctx.fillStyle = `rgba(255,240,160,${0.5 + Math.sin(now * 4) * 0.4})`; const sp = (now * 1.3) % 1;
        ctx.fillRect(px + 10 + sp * 26, py + 6 + Math.sin(sp * 6) * 4, 3, 3); ctx.fillRect(px + 36 - sp * 20, py + 12, 2, 2);
      },
      interact: o => openTreasure(o), onTool: (o, tool) => tool === 'pickaxe' ? openTreasure(o) : false,
    });
    G.defObj('ladder_down', {
      solid: false, label: () => 'Ladder down',
      draw(ctx, o, px, py) { const s = spr('ladder_down'); ctx.drawImage(s, px, py + T - s.height * T / s.width, T, s.height * T / s.width); },
      interact: () => { descend(); return true; },
    });
    G.defObj('ladder_up', {
      solid: true, label: () => 'Ladder up', sortY: -40,
      draw(ctx, o, px, py) { const s = spr('ladder_up'); const h = s.height * T / s.width; ctx.drawImage(s, px, py + T - h, T, h); },
      interact: () => {
        const n = tmp().floor;
        if (n === 0) { G.world.go('farm', 'mine'); return true; }
        G.ui.dialog('Ladder', `You're on floor ${n}. Climb up?`, [
          { label: 'Climb to the mine entrance', fn: () => goFloor(0, 'down') },
          { label: 'Leave the mine', fn: () => G.world.go('farm', 'mine') },
          { label: 'Keep mining' },
        ]);
        return true;
      },
    });
    G.defObj('mine_elevator', {
      solid: true, label: () => 'Elevator', sortY: -40,
      draw(ctx, o, px, py) { const s = spr('elevator'); const h = s.height * T / s.width; ctx.drawImage(s, px, py + T - h, T, h); },
      interact: () => { elevatorMenu(); return true; },
    });
    G.defObj('mine_torch', {
      solid: true,
      draw(ctx, o, px, py) {
        const art = G.art.sprites.torch;
        const now = performance.now() / 1000;
        if (art) { ctx.drawImage(art, px + (T - art.width) / 2, py + T - art.height - 4); return; }
        ctx.fillStyle = '#3b2412'; ctx.fillRect(px + 21, py + 24, 6, 18); ctx.fillStyle = '#6b6b6b'; ctx.fillRect(px + 18, py + 36, 12, 4);
        const f = Math.sin(now * 13 + o.x) * 2;
        ctx.fillStyle = '#ff8a2a'; ctx.beginPath(); ctx.ellipse(px + 24, py + 18, 7, 10 + f, 0, 0, 7); ctx.fill();
        ctx.fillStyle = '#ffd257'; ctx.beginPath(); ctx.ellipse(px + 24, py + 20, 4, 6 + f * 0.6, 0, 0, 7); ctx.fill();
        ctx.fillStyle = '#fff8d0'; ctx.fillRect(px + 23, py + 20, 2, 3);
      },
    });
    G.defObj('mine_sign', {
      solid: true,
      draw(ctx, o, px, py) { const s = spr('wooden_sign'); ctx.drawImage(s, px, py + T - s.height * T / s.width, T, s.height * T / s.width); },
      interact: () => { G.ui.dialog('Old Sign', '<i>"Hollow Creek Mines. Ore gets richer the deeper you go. Ladders hide under rocks. Mind your head — and get a stronger pickaxe for the shiny stuff."</i><br><br>Someone has scratched underneath: <i>"the lake on 20 has ghosts. fish ones."</i>'); return true; },
    });

    // ---- mine map
    const m = G.defMap({
      id: 'mine', name: 'Mine Entrance', w: 17, h: 13, ground: new Array(13).fill('M'.repeat(17)),
      persistent: false, saveAs: { map: 'farm', spawn: 'mine' }, indoor: true, dark: 0.15,
      spawns: { top: { x: 8, y: 4, dir: 'down' } }, lights: [], meta: { fishLocation: 'mine' },
      onEnter(spawn) {
        const n = (spawn === 'top' || nextFloor == null) ? 0 : nextFloor; nextFloor = null;
        enterFloor(n, spawn);
      },
      update(dt) {
        for (const o of G.world.objects('mine')) if (o.shake > 0) o.shake -= dt;
        const p = G.player;
        if (p.warpLock <= 0 && !p.busy && !G.ui.modal && !descending) {
          const t = p.tile(); const o = G.world.objectAt('mine', t.x, t.y);
          if (o && o.type === 'ladder_down') descend();
        }
      },
      drawGround(ctx, cam) {
        // floor tint by depth band + pebbles for variety
        const n = tmp().floor || 0;
        const tint = n === 0 ? null : n < 15 ? null : n < 30 ? 'rgba(80,110,160,0.12)' : n < 45 ? 'rgba(170,70,50,0.12)' : 'rgba(130,70,180,0.14)';
        const x0 = Math.max(0, Math.floor(cam.x / T)), y0 = Math.max(0, Math.floor(cam.y / T));
        const x1 = Math.min(m.w - 1, Math.floor((cam.x + cam.w) / T)), y1 = Math.min(m.h - 1, Math.floor((cam.y + cam.h) / T));
        for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
          const ch = m.ground[y][x]; const sx = x * T - cam.x, sy = y * T - cam.y;
          if (tint) { ctx.fillStyle = tint; ctx.fillRect(sx, sy, T, T); }
          if (ch !== 'm') continue;
          const hsh = (x * 73856093 ^ y * 19349663 ^ n * 83492791) >>> 0;
          if (hsh % 7 === 0) { ctx.fillStyle = 'rgba(0,0,0,0.18)'; ctx.fillRect(sx + (hsh % 30) + 6, sy + ((hsh >> 5) % 30) + 8, 6, 4); ctx.fillStyle = 'rgba(255,255,255,0.10)'; ctx.fillRect(sx + (hsh % 30) + 6, sy + ((hsh >> 5) % 30) + 7, 4, 2); }
          if (hsh % 11 === 3) { ctx.strokeStyle = 'rgba(0,0,0,0.15)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(sx + 10, sy + 30); ctx.lineTo(sx + 20, sy + 26); ctx.lineTo(sx + 26, sy + 34); ctx.stroke(); }
          // fallback wall shading (only if art hasn't taken over the ground)
          if (!G.art.drawGround && y > 0 && m.ground[y - 1][x] === 'M') { ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.fillRect(sx, sy, T, 8); }
        }
      },
    });

    // ---- input: hook / cancel
    window.addEventListener('keydown', e => {
      if (!G.started || G.ui.modal) return;
      if (e.code === 'Escape' && F.phase) { endFishing('Reeled in.', '#ddd'); return; }
      if (e.code === 'Space' && !e.repeat) {
        if (F.phase === 'bite') hook();
        else if (catchCard && !F.phase && catchCard.t > 0.4) catchCard.t = Math.max(catchCard.t, 3.0);
      }
    });
    G.canvas.addEventListener('mousedown', e => {
      if (!G.started || G.ui.modal) return;
      if (e.button === 0 && F.phase === 'bite') hook();
      else if (e.button === 2 && (F.phase === 'wait' || F.phase === 'cast' || F.phase === 'bite')) endFishing('Reeled in.', '#ddd');
    });

    // ---- render overlay (monkey-patch)
    const baseRender = G.render;
    G.render = () => { baseRender(); overlay(); };

    G.helpExtra.push('<b>Fishing:</b> hold the rod facing water (pond, river, underground lakes) and click/Space to cast — every cast uses one <b>bait</b> (Deluxe Bait bites faster and gives better quality). When the <b>!</b> pops up, click/Space right away to hook. Then <b>hold</b> Space or the mouse to raise the green bar and keep the fish inside it until the meter fills. Never letting it slip = <b>Perfect</b> (+1 quality). Esc or right-click reels in. Better rods = bigger bar, faster reeling.');
    G.helpExtra.push('<b>Mining:</b> the cave north of the farm. Smash rocks with the pickaxe; a <b>ladder</b> down hides under one of them. Every 5th floor unlocks the <b>elevator</b>. Iron (floor 15+) needs a Copper pickaxe, gold (30+) Iron, iridium (45+) Gold. Gems and geodes everywhere — use a geode to crack it. Treasure chests wait on floors 10, 20, 30...');
  });

  function descend() {
    if (descending) return;
    const n = tmp().floor;
    if (n >= MAX_FLOOR) { G.ui.toast("This is the bottom of the mine. Wow.", null, 'level'); return; }
    descending = true; G.sfx('step');
    goFloor(n + 1, 'down');
    setTimeout(() => { descending = false; }, 400);
  }
  let descending = false;

  function elevatorMenu() {
    const max = MS().elevator || 0;
    const cur = tmp().floor;
    const choices = [];
    if (cur !== 0) choices.push({ label: 'Mine entrance', fn: () => goFloor(0, 'elev') });
    for (let f = 5; f <= max; f += 5) if (f !== cur) choices.push({ label: 'Floor ' + f, fn: () => goFloor(f, 'elev') });
    choices.push({ label: 'Cancel' });
    G.ui.dialog('Elevator', max ? `The old cage creaks. Deepest unlocked: floor ${max}.` : 'The elevator only stops at floors you have reached (every 5th floor). Head down the ladder!', choices);
  }

  /* ------------------------------------------------------------------
     lifecycle
     ------------------------------------------------------------------ */
  G.on('newGame', () => { MS(); FS(); });
  G.on('loadGame', () => {
    const st = MS(); st.treasure = st.treasure || {}; st.elevator = st.elevator || 0; FS();
    F.phase = null; catchCard = null; banner = null; needRelease = false;
  });
  G.on('mapChange', mapId => { if (F.phase && mapId !== F.map) endFishing(); if (mapId !== 'mine') banner = null; });
  G.on('tick', dt => {
    if (G.ui.modal) return;
    try { updateFishing(dt); } catch (e) { console.error('fishing', e); endFishing(); }
    if (needRelease && !G.input.keys.Space && !G.input.mouseHeld) needRelease = false;
    if (catchCard) { catchCard.t += dt; if (catchCard.t > 3.4) catchCard = null; }
    if (banner) { banner.t += dt; if (banner.t > 2.4) banner = null; }
    if (shake > 0) shake = Math.max(0, shake - dt);
  });

  /* ------------------------------------------------------------------
     public APIs
     ------------------------------------------------------------------ */
  G.mining = {
    /** realistic single haul from a node at this depth (for the hired Miner). opts: {tier} (pickaxe tier gate, default: player's) */
    rollOre(depth = 1, opts = {}) {
      depth = G.clamp(Math.floor(depth || 0), 0, MAX_FLOOR);
      const tier = opts.tier != null ? opts.tier : (G.state && G.state.tools ? G.state.tools.pickaxe || 0 : 0);
      const w = nodeWeights(depth).filter(o => opts.ignoreTier || NODES[o.t].req <= tier);
      const t = G.weighted(w).t;
      const first = NODES[t].drops(depth).filter(Boolean)[0];
      return { id: first[0], qty: first[1] };
    },
    deepest: () => (G.state && G.state.stats.deepestMine) || 0,
    floor: () => (G.player.map === 'mine' ? tmp().floor : null),
    goFloor, nodes: NODES, maxFloor: MAX_FLOOR,
  };
  G.fishing = {
    /** locationId: 'pond' | 'river' | 'mine'. opts: {season, hour, rain, skill, deluxe, anyTime} → item id */
    rollFish,
    /** start a cast at a water tile {x,y} on the current map (consumes bait). returns true if handled */
    startCast,
    isFishing: () => !!F.phase,
    cancel: () => { if (F.phase) endFishing(); },
    locationOf, fish: FISH,
    _state: F, _hook: hook,
  };
})();
