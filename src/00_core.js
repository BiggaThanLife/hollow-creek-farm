/* =====================================================================
   HOLLOW CREEK FARM — CORE ENGINE  (owned by lead designer)
   Everything lives on window.G. Modules (10_art, 20_farm, 30_mine_fish,
   40_economy) register content via the APIs here. See CONTRACT.md.
   ===================================================================== */
'use strict';
const G = window.G = {};
G.TILE = 48;
G.SAVE_KEY = 'hollowcreek-save-v1';
G.TIME_SCALE = 10 / 7;           // game minutes per real second (10 min / 7 s, like Stardew)
G.DAY_LEN = 1440;                // minutes; state.time = minutes since 6:00 AM
G.SEASONS = ['Spring', 'Summer', 'Fall', 'Winter'];
G.DAYS_PER_SEASON = 28;
G.QUALITY = ['Normal', 'Silver', 'Gold', 'Iridium'];
G.QUALITY_MULT = [1, 1.25, 1.5, 2];
G.TOOL_TIERS = ['Basic', 'Copper', 'Iron', 'Gold', 'Iridium'];
G.debug = /[?&]debug/.test(location.search);

/* ---------------- events ---------------- */
G._ev = {};
G.on = (e, f) => { (G._ev[e] = G._ev[e] || []).push(f); };
G.emit = (e, ...a) => {
  const list = G._ev[e]; if (!list) return;
  for (const f of list) { try { f(...a); } catch (err) { console.error('[event ' + e + ']', err); } }
};

/* ---------------- utils ---------------- */
G.rand = (a, b) => a + Math.random() * (b - a);
G.randInt = (a, b) => Math.floor(a + Math.random() * (b - a + 1));
G.chance = p => Math.random() < p;
G.pick = arr => arr[Math.floor(Math.random() * arr.length)];
G.clamp = (v, a, b) => Math.max(a, Math.min(b, v));
G.key = (x, y) => x + ',' + y;
G.weighted = list => { // [{w, ...}] -> item
  let t = 0; for (const o of list) t += o.w; let r = Math.random() * t;
  for (const o of list) { r -= o.w; if (r <= 0) return o; } return list[list.length - 1];
};
G.fmtMoney = n => Math.floor(n).toLocaleString() + 'g';
G.uid = () => Math.random().toString(36).slice(2, 10);

/* ---------------- assets & icons ---------------- */
G.assets = {};
G.assetsReady = (async () => {
  const data = window.G_ASSET_DATA || {};
  await Promise.all(Object.entries(data).map(([k, src]) => new Promise(res => {
    const im = new Image(); im.onload = () => { G.assets[k] = im; res(); }; im.onerror = res; im.src = src;
  })));
})();
G.makeCanvas = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; const x = c.getContext('2d'); x.imageSmoothingEnabled = false; return c; };

// art module fills these; core supplies fallbacks so nothing ever crashes
G.art = G.art || { icons: {}, sprites: {} };
G.art.icons = G.art.icons || {}; G.art.sprites = G.art.sprites || {};
G._placeholders = {};
G.placeholder = (name, w = 48, h = 48) => {
  const k = name + w + 'x' + h; if (G._placeholders[k]) return G._placeholders[k];
  const c = G.makeCanvas(w, h), x = c.getContext('2d');
  let hsh = 0; for (const ch of name) hsh = (hsh * 31 + ch.charCodeAt(0)) | 0;
  x.fillStyle = `hsl(${Math.abs(hsh) % 360},45%,45%)`; x.fillRect(4, 4, w - 8, h - 8);
  x.strokeStyle = '#000'; x.lineWidth = 2; x.strokeRect(4, 4, w - 8, h - 8);
  x.fillStyle = '#fff'; x.font = 'bold 14px monospace'; x.textAlign = 'center';
  x.fillText(name.slice(0, 3).toUpperCase(), w / 2, h / 2 + 5);
  return (G._placeholders[k] = c);
};
// icon name -> drawable (48x48). Order: art icons, tool icons, pack assets, placeholder.
G.icon = name => {
  if (!name) return G.placeholder('?');
  if (G.art.icons[name]) return G.art.icons[name];
  if (name.startsWith('tool:')) {
    const [, id, tier] = name.split(':');
    if (G.art.toolIcon) { const c = G.art.toolIcon(id, +tier || 0); if (c) return c; }
  }
  if (G.assets[name]) return G.assets[name];
  if (G.art.sprites[name]) return G.art.sprites[name]; // e.g. portrait_* are built as sprites
  return G.placeholder(name);
};
G.sprite = (name, w, h) => G.art.sprites[name] || G.assets[name] || G.placeholder(name, w || 48, h || 48);
G._iconURL = {};
G.iconURL = name => { // data URL for DOM <img>, cached
  if (G._iconURL[name]) return G._iconURL[name];
  const src = G.icon(name), c = G.makeCanvas(48, 48);
  try { c.getContext('2d').drawImage(src, 0, 0, 48, 48); } catch (e) { }
  const url = c.toDataURL();
  if (src.tagName !== 'CANVAS' || !String(name).startsWith('?')) G._iconURL[name] = url;
  return url;
};
G.clearIconCache = () => { G._iconURL = {}; };

/* ---------------- items ---------------- */
G.items = {};
/** def: {id, name, icon?, price (sell value, base quality), cat, desc, stack (max), use(ctx)?, place?:objType, edible?} */
G.defItem = def => {
  if (G.items[def.id]) console.warn('defItem: duplicate id', def.id);
  G.items[def.id] = Object.assign({ icon: def.id, price: 0, cat: 'misc', desc: '', stack: 999 }, def);
  return G.items[def.id];
};
G.item = id => G.items[id] || { id, name: id, icon: id, price: 0, cat: 'misc', desc: '(unknown item)', stack: 999 };
G.itemName = (id, q) => (q ? G.QUALITY[q] + ' ' : '') + G.item(id).name;
G.priceOf = (id, q = 0) => Math.floor(G.item(id).price * (G.QUALITY_MULT[q || 0] || 1));
G.itemIcon = id => {
  const it = G.item(id);
  if (it.cat === 'tool') return 'tool:' + id + ':' + (G.state ? (G.state.tools[id] || 0) : 0);
  return it.icon;
};

// Shared base materials (other modules define their own domain items)
[
  ['wood', 'Wood', 2, 'material', 'Sturdy timber from trees.'],
  ['hardwood', 'Hardwood', 15, 'material', 'Dense wood from large stumps.'],
  ['stone', 'Stone', 2, 'material', 'A common building material.'],
  ['fiber', 'Fiber', 1, 'material', 'Plant fiber from weeds.'],
  ['sap', 'Sap', 2, 'material', 'Sticky tree sap.'],
  ['clay', 'Clay', 20, 'material', 'Soft clay, found while digging.'],
  ['coal', 'Coal', 15, 'material', 'Fuel for smelting.'],
  ['copper_ore', 'Copper Ore', 5, 'mineral', 'Smelt into copper bars.'],
  ['iron_ore', 'Iron Ore', 10, 'mineral', 'Smelt into iron bars.'],
  ['gold_ore', 'Gold Ore', 25, 'mineral', 'Smelt into gold bars.'],
  ['iridium_ore', 'Iridium Ore', 100, 'mineral', 'An exotic, precious ore.'],
  ['copper_bar', 'Copper Bar', 60, 'material', 'Used in crafting and tool upgrades.'],
  ['iron_bar', 'Iron Bar', 120, 'material', 'Used in crafting and tool upgrades.'],
  ['gold_bar', 'Gold Bar', 250, 'material', 'Used in crafting and tool upgrades.'],
  ['iridium_bar', 'Iridium Bar', 1000, 'material', 'The rarest metal.'],
  ['quartz', 'Quartz', 25, 'mineral', 'A clear crystal.'],
  ['amethyst', 'Amethyst', 100, 'mineral', 'A purple gem.'],
  ['topaz', 'Topaz', 80, 'mineral', 'A golden gem.'],
  ['emerald', 'Emerald', 250, 'mineral', 'A brilliant green gem.'],
  ['ruby', 'Ruby', 250, 'mineral', 'A deep red gem.'],
  ['diamond', 'Diamond', 750, 'mineral', 'A rare and valuable gem.'],
  ['worm', 'Worm', 5, 'bait', 'Wriggly. Craft into bait.'],
  ['bait', 'Bait', 2, 'bait', 'Required to fish. One is used per cast.'],
  ['deluxe_bait', 'Deluxe Bait', 7, 'bait', 'Fish bite faster and quality improves.'],
  ['coffee', 'Coffee', 25, 'food', 'Drink to shake off 4 hours of tiredness.'],
].forEach(([id, name, price, cat, desc]) => G.defItem({ id, name, price, cat, desc }));
G.items.coffee.use = ctx => {
  G.inv.removeSlot(G.state.hotbar, 1);
  G.state.awake = Math.max(0, G.state.awake - 240);
  G.ui.toast('You feel more alert. (-4h tiredness)', 'coffee'); G.sfx('pickup');
  return true;
};

// Tools: tier stored in state.tools[id]; tool items are unique, unstackable
['hoe:Hoe', 'watering_can:Watering Can', 'axe:Axe', 'pickaxe:Pickaxe', 'scythe:Scythe', 'fishing_rod:Fishing Rod']
  .forEach(s => { const [id, name] = s.split(':'); G.defItem({ id, name, cat: 'tool', stack: 1, price: 0, desc: '' }); });
G.toolName = id => { const t = G.state.tools[id] || 0; return (t ? G.TOOL_TIERS[t] + ' ' : '') + G.item(id).name; };

/* ---------------- state ---------------- */
G.newState = () => ({
  v: 1,
  name: 'Farmer',
  farmName: 'Hollow Creek',
  day: 1, season: 0, year: 1,
  time: 0,           // minutes since 6:00 AM
  awake: 0,          // minutes awake since last real sleep
  money: 500,
  totalEarned: 0,
  inv: new Array(36).fill(null),
  hotbar: 0,
  tools: { hoe: 0, watering_can: 0, axe: 0, pickaxe: 0, scythe: 0, fishing_rod: 0 },
  skills: { farming: { lvl: 0, xp: 0 }, mining: { lvl: 0, xp: 0 }, fishing: { lvl: 0, xp: 0 }, foraging: { lvl: 0, xp: 0 }, crafting: { lvl: 0, xp: 0 } },
  player: { map: 'farm', x: 0, y: 0, dir: 'down', spawn: 'start' },
  maps: {},          // persistent per-map data: {objects:[], ...module data}
  recipes: [],       // unlocked crafting recipe ids (economy)
  flags: {},         // misc one-off flags
  stats: { cropsHarvested: 0, fishCaught: 0, oreMined: 0, itemsCrafted: 0, itemsSold: 0, deepestMine: 0, daysPlayed: 1 },
  mod: {},           // free namespace: modules store their own data at state.mod.<module>
});

/* ---------------- inventory ---------------- */
G.inv = {
  slots: () => G.state.inv,
  selected: () => G.state.inv[G.state.hotbar],
  /** add items; returns leftover qty (0 = all added). silent=true suppresses pickup toast */
  add(id, qty = 1, q = 0, silent = false) {
    const inv = G.state.inv, it = G.item(id); let left = qty;
    if (it.stack > 1) for (const s of inv) {
      if (left <= 0) break;
      if (s && s.id === id && (s.q || 0) === (q || 0) && s.qty < it.stack) { const n = Math.min(left, it.stack - s.qty); s.qty += n; left -= n; }
    }
    for (let i = 0; i < inv.length && left > 0; i++) if (!inv[i]) { const n = Math.min(left, it.stack); inv[i] = { id, qty: n, q: q || 0 }; left -= n; }
    const added = qty - left;
    if (added > 0 && !silent) G.ui.pickup(id, added, q);
    if (left > 0 && !silent) G.ui.toast('Inventory full!', null, 'warn');
    G.emit('invChange');
    return left;
  },
  /** add or drop on ground near player if full (never loses items) */
  give(id, qty = 1, q = 0) {
    const left = G.inv.add(id, qty, q);
    if (left > 0) G.world.dropItem(G.player.map, G.player.x, G.player.y, id, left, q);
  },
  count(id, q) { let n = 0; for (const s of G.state.inv) if (s && s.id === id && (q === undefined || (s.q || 0) === q)) n += s.qty; return n; },
  has(id, qty = 1) { return G.inv.count(id) >= qty; },
  /** remove qty of id (lowest quality first unless q given). returns true if removed */
  remove(id, qty = 1, q) {
    if (G.inv.count(id, q) < qty) return false;
    let left = qty;
    const order = G.state.inv.map((s, i) => i).filter(i => { const s = G.state.inv[i]; return s && s.id === id && (q === undefined || (s.q || 0) === q); })
      .sort((a, b) => (G.state.inv[a].q || 0) - (G.state.inv[b].q || 0));
    for (const i of order) { const s = G.state.inv[i]; const n = Math.min(left, s.qty); s.qty -= n; left -= n; if (s.qty <= 0) G.state.inv[i] = null; if (!left) break; }
    G.emit('invChange'); return true;
  },
  removeSlot(i, qty = 1) { const s = G.state.inv[i]; if (!s) return; s.qty -= qty; if (s.qty <= 0) G.state.inv[i] = null; G.emit('invChange'); },
  /** costs: [[id, qty], ...] */
  canAfford(costs, money = 0) { return G.state.money >= money && costs.every(([id, n]) => G.inv.count(id) >= n); },
  pay(costs, money = 0) { if (!G.inv.canAfford(costs, money)) return false; costs.forEach(([id, n]) => G.inv.remove(id, n)); G.spend(money); return true; },
  freeSlots() { return G.state.inv.filter(s => !s).length; },
};
G.earn = (n, silent) => { n = Math.floor(n); G.state.money += n; G.state.totalEarned += n; if (!silent) G.sfx('coin'); G.emit('money', n); };
G.spend = n => { n = Math.floor(n); if (G.state.money < n) return false; G.state.money -= n; G.emit('money', -n); return true; };

/* ---------------- skills ---------------- */
G.XP_LEVELS = [100, 380, 770, 1300, 2150, 3300, 4800, 6900, 10000, 15000];
G.skillLvl = s => G.state.skills[s] ? G.state.skills[s].lvl : 0;
G.addXP = (skill, amt) => {
  const s = G.state.skills[skill]; if (!s) return;
  s.xp += amt;
  while (s.lvl < 10 && s.xp >= G.XP_LEVELS[s.lvl]) {
    s.lvl++;
    G.ui.toast(`${skill[0].toUpperCase() + skill.slice(1)} level ${s.lvl}!`, null, 'level');
    G.sfx('level'); G.emit('levelUp', skill, s.lvl);
  }
};

/* ---------------- time & fatigue ---------------- */
G.clock = () => { const m = G.state.time + 360; const h = Math.floor(m / 60) % 24, mm = Math.floor(m % 60 / 10) * 10; return { h, m: mm }; };
G.hour = () => G.clock().h;  // 0..23 wall-clock hour
G.timeStr = (t = G.state.time) => {
  const m = t + 360; let h = Math.floor(m / 60) % 24; const mm = Math.floor(m % 60 / 10) * 10;
  const ap = h < 12 ? 'am' : 'pm'; const hh = h % 12 === 0 ? 12 : h % 12;
  return `${hh}:${String(mm).padStart(2, '0')} ${ap}`;
};
G.dateStr = () => `${G.SEASONS[G.state.season]} ${G.state.day}, Year ${G.state.year}`;
G.weekday = () => ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'][(G.state.day - 1) % 7];
G.isNight = () => { const h = G.hour(); return h >= 19 || h < 6; };

/** Fatigue: no energy bar. Staying awake 24h+ degrades work quality. */
G.FATIGUE = [
  { at: 0, label: 'Rested', color: '#7ed957', yield: 1, qShift: 0, fumble: 0 },
  { at: 16 * 60, label: 'Tired', color: '#f2c94c', yield: 1, qShift: 0, fumble: 0 },
  { at: 24 * 60, label: 'Exhausted', color: '#f2994a', yield: 0.75, qShift: -1, fumble: 0.15 },
  { at: 36 * 60, label: 'Delirious', color: '#eb5757', yield: 0.5, qShift: -3, fumble: 0.3 },
];
G.fatigue = () => { let f = G.FATIGUE[0]; for (const t of G.FATIGUE) if (G.state.awake >= t.at) f = t; return f; };
G.fatigueLevel = () => G.FATIGUE.indexOf(G.fatigue());
/** multiply yields (ore count, extra harvest, fish size) by this */
G.workMult = () => G.fatigue().yield;
/** true -> this tool action fumbles (no effect). Only when exhausted. */
G.fumble = () => { const f = G.fatigue().fumble; if (f && Math.random() < f) { G.fx.float('*yawn*', G.player.x, G.player.y - 60, '#ccc'); G.sfx('error'); return true; } return false; };
/** Roll item quality 0..3 from a skill level + bonus (fertilizer, bait…), then apply fatigue penalty. */
G.rollQuality = (skillLvl = 0, bonus = 0) => {
  const r = Math.random(), s = skillLvl / 10 + bonus;
  let q = 0;
  if (r < s * 0.12) q = 3; else if (r < s * 0.35 + 0.02) q = 2; else if (r < s * 0.6 + 0.12) q = 1;
  if (bonus >= 1 && q < 1) q = 1;
  return G.clamp(q + G.fatigue().qShift, 0, 3);
};

G.advanceTime = mins => {
  const st = G.state; const before = st.time;
  st.time += mins; st.awake += mins;
  const b10 = Math.floor(before / 10), a10 = Math.floor(st.time / 10);
  for (let i = b10 + 1; i <= a10; i++) {
    G.emit('minute10', i * 10);
    if (i % 6 === 0) G.emit('hour', G.hour());
  }
  if (st.time >= G.DAY_LEN) { st.time -= G.DAY_LEN; G.newDay(false); }
};
G.dayReport = [];
G.report = (line, icon) => G.dayReport.push({ line, icon });
G.newDay = (slept) => {
  const st = G.state;
  G.emit('dayEnd', slept);
  st.day++; st.stats.daysPlayed++;
  if (st.day > G.DAYS_PER_SEASON) { st.day = 1; st.season++; if (st.season > 3) { st.season = 0; st.year++; } G.emit('newSeason', st.season); }
  G.emit('newDay', slept);
  if (!slept) {
    G.ui.toast(`A new day dawns: ${G.dateStr()} (you didn't sleep)`, null, 'warn');
    G.flushReport();
  }
  G.save();
};
G.flushReport = () => { if (G.dayReport.length) { const r = G.dayReport; G.dayReport = []; G.ui.morningReport(r); } };
/** type: 'full' (until 6am next day, resets tiredness, triggers newDay with slept=true) | 'nap' (3h, -8h tiredness) */
G.sleep = (type = 'full') => {
  if (type === 'nap') {
    if (G.state.time + 180 >= G.DAY_LEN) return G.sleep('full'); // a nap past 6am is just a night's sleep
    G.ui.fade(() => { G.advanceTime(180); G.state.awake = Math.max(0, G.state.awake - 480); G.ui.toast('You took a nap. (-8h tiredness)'); }, 600);
    return;
  }
  G.ui.fade(() => {
    const st = G.state;
    G._sleeping = true;
    // fire the remaining minute10/hour events of the night so machines keep processing
    const b10 = Math.floor(st.time / 10), a10 = Math.floor(G.DAY_LEN / 10);
    for (let i = b10 + 1; i < a10; i++) { G.emit('minute10', i * 10); if (i % 6 === 0) G.emit('hour', Math.floor((i * 10 + 360) / 60) % 24); }
    st.time = 0; st.awake = 0;
    G.newDay(true);
    G._sleeping = false;
    const p = G.player; const sp = (G.bedSpot && G.bedSpot(p.map)) || (G.maps[p.map] && G.maps[p.map].spawns && G.maps[p.map].spawns.bed);
    if (sp) { p.x = (sp.x + 0.5) * G.TILE; p.y = (sp.y + 0.8) * G.TILE; p.dir = sp.dir || 'down'; }
    G.ui.toast(`Good morning! ${G.weekday()}, ${G.dateStr()}`, null, 'level');
    G.flushReport();
  }, 900);
};

/* ---------------- world: maps, objects, entities ---------------- */
G.maps = {};
/** def: {id, name, w, h, ground: string[] rows, persistent (default true), indoor, dark (0..1),
 *   spawns:{name:{x,y,dir}}, warps:[{x,y,w,h,to,spawn}],
 *   solid?(x,y)->bool extra, onEnter?(), onLeave?(), update?(dt), draw hooks: drawGround?(ctx,cam) (after tiles),
 *   collect?(list,cam) push {y, draw(ctx)} for y-sorted drawables, drawOverlay?(ctx,cam),
 *   useTile?(ctx)->bool, interactTile?(x,y)->bool, generate?() (first visit/new game, persistent maps) }
 * Ground chars (art draws them): g grass, d dirt, p cobble path, s sand, w water, b bridge, f wood floor,
 *   W wall(solid), c cliff(solid), m mine floor, M mine wall(solid), v void(solid), t tilled-able? (use 'g'/'d') */
G.SOLID_CHARS = new Set(['w', 'W', 'c', 'M', 'v', 'X']);
G.defMap = def => { G.maps[def.id] = Object.assign({ persistent: true, spawns: {}, warps: [], indoor: false, dark: 0 }, def); return G.maps[def.id]; };
G.objTypes = {};
/** def: {w=1, h=1, solid=true, draw(ctx,o,px,py) px/py = screen top-left of footprint,
 *   interact?(o,mapId)->bool, onTool?(o,toolId,tier,ctx)->bool, onItem?(o,slot,ctx)->bool,
 *   update?(o,dt,mapId), newDay?(o,mapId), minute10?(o,mapId), label?(o)->string, sortY? } */
G.defObj = (type, def) => { G.objTypes[type] = Object.assign({ w: 1, h: 1, solid: true }, def); return G.objTypes[type]; };
G.temp = {}; // non-persistent per-map data (mine floors etc.)
G.ents = {}; // mapId -> [entity]; entities: {x,y (px), update(dt), draw(ctx,sx,sy), interact?(), solid?}

G.world = {
  map: id => G.maps[id || G.player.map],
  /** data store for a map: persistent maps -> state.maps[id]; others -> G.temp[id] */
  data(id) {
    id = id || G.player.map; const m = G.maps[id];
    const store = (m && m.persistent === false) ? G.temp : G.state.maps;
    return store[id] || (store[id] = { objects: [] });
  },
  objects: id => G.world.data(id).objects,
  addObject(id, o) { o.uid = o.uid || G.uid(); G.world.objects(id).push(o); G.world._dirty = true; return o; },
  removeObject(id, o) { const arr = G.world.objects(id); const i = arr.indexOf(o); if (i >= 0) arr.splice(i, 1); G.world._dirty = true; },
  objDef: o => G.objTypes[o.type] || { w: 1, h: 1, solid: true },
  size(o) { const d = G.world.objDef(o); return { w: o.w || d.w, h: o.h || d.h }; },
  objectAt(id, x, y) {
    const arr = G.world.objects(id);
    for (let i = arr.length - 1; i >= 0; i--) { const o = arr[i]; const { w, h } = G.world.size(o); if (x >= o.x && x < o.x + w && y >= o.y && y < o.y + h) return o; }
    return null;
  },
  objectsIn(id, x, y, w, h) { return G.world.objects(id).filter(o => { const s = G.world.size(o); return o.x < x + w && o.x + s.w > x && o.y < y + h && o.y + s.h > y; }); },
  ground(id, x, y) { const m = G.maps[id]; if (!m || x < 0 || y < 0 || x >= m.w || y >= m.h) return 'v'; const row = m.ground[y]; return (row && row[x]) || 'v'; },
  setGround(id, x, y, ch) { const m = G.maps[id]; const r = m.ground[y]; m.ground[y] = r.slice(0, x) + ch + r.slice(x + 1); },
  isSolid(id, x, y) {
    const m = G.maps[id]; if (!m) return true;
    if (G.SOLID_CHARS.has(G.world.ground(id, x, y))) return true;
    if (m.solid && m.solid(x, y)) return true;
    const o = G.world.objectAt(id, x, y);
    if (o) { const d = G.world.objDef(o); const s = typeof d.solid === 'function' ? d.solid(o, x, y) : d.solid; if (s) return true; }
    return false;
  },
  /** free = walkable, no objects */
  isFree(id, x, y) { return !G.world.isSolid(id, x, y) && !G.world.objectAt(id, x, y); },
  canPlace(id, x, y, w = 1, h = 1) {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
      const gx = x + i, gy = y + j;
      if (!G.world.isFree(id, gx, gy)) return false;
      const m = G.maps[id]; if (m.canPlace && !m.canPlace(gx, gy)) return false;
      // don't place on player
      const pt = G.player.tile(); if (G.player.map === id && pt.x === gx && pt.y === gy) return false;
    }
    return true;
  },
  addEnt(id, e) { (G.ents[id] = G.ents[id] || []).push(e); return e; },
  removeEnt(id, e) { const a = G.ents[id]; if (!a) return; const i = a.indexOf(e); if (i >= 0) a.splice(i, 1); },
  entsOf: id => G.ents[id] || (G.ents[id] = []),
  /** drop an item pickup on the ground (px coords). Auto-collected when the player walks near. */
  dropItem(id, px, py, itemId, qty = 1, q = 0) {
    G.world.addEnt(id, { kind: 'drop', itemId, qty, q, x: px + G.rand(-10, 10), y: py + G.rand(-10, 10), t: 0, vz: -3, z: 0 });
  },
  /** run map.generate() once per save for persistent maps (flag stored in the map's data) */
  ensureGenerated(id) {
    const m = G.maps[id]; if (!m || m.persistent === false || !m.generate) return;
    const d = G.world.data(id); if (d._gen) return; d._gen = true;
    try { m.generate(); } catch (e) { console.error('generate ' + id, e); }
  },
  /** change map with fade */
  go(mapId, spawn = 'start', instant = false) {
    const doGo = () => {
      const old = G.maps[G.player.map];
      if (old && old.onLeave) try { old.onLeave(); } catch (e) { console.error(e); }
      const m = G.maps[mapId]; if (!m) { console.error('no map', mapId); return; }
      G.player.map = mapId;
      G.world.ensureGenerated(mapId);
      if (m.onEnter) try { m.onEnter(spawn); } catch (e) { console.error(e); }
      const sp = (m.spawns && (m.spawns[spawn] || m.spawns.start)) || { x: 1, y: 1 };
      G.player.x = (sp.x + 0.5) * G.TILE; G.player.y = (sp.y + 0.8) * G.TILE; G.player.dir = sp.dir || G.player.dir;
      G.player.warpLock = 0.4;
      G.emit('mapChange', mapId, spawn);
    };
    if (instant) doGo(); else G.ui.fade(doGo, 250);
  },
};
// built-in ground drop pickup behaviour
G.on('tick', dt => {
  const id = G.player.map, arr = G.ents[id]; if (!arr) return;
  for (let i = arr.length - 1; i >= 0; i--) {
    const e = arr[i]; if (e.kind !== 'drop') continue;
    e.t += dt; e.z += e.vz; e.vz += 0.4; if (e.z > 0) { e.z = 0; e.vz = 0; }
    if (e.t > 0.5) {
      const dx = G.player.x - e.x, dy = (G.player.y - 10) - e.y, d = Math.hypot(dx, dy);
      if (d < 110) { e.x += dx / d * Math.min(d, 600 * dt); e.y += dy / d * Math.min(d, 600 * dt); }
      if (d < 20) { const left = G.inv.add(e.itemId, e.qty, e.q); if (left <= 0) { arr.splice(i, 1); G.sfx('pickup'); } else { e.qty = left; e.t = -2; } }
    }
  }
});

/* ---------------- player ---------------- */
G.player = {
  map: 'farm', x: 100, y: 100, dir: 'down', moving: false, animT: 0, speed: 4.2 * 48,
  swingT: 0, swingTool: null, cooldown: 0, warpLock: 0, busy: false, // busy: e.g. fishing minigame locks movement
  tile() { return { x: Math.floor(this.x / G.TILE), y: Math.floor((this.y - 4) / G.TILE) }; },
  facingTile() {
    const t = this.tile(); const d = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] }[this.dir];
    return { x: t.x + d[0], y: t.y + d[1] };
  },
};
G.input = { keys: {}, mouse: { x: 0, y: 0, inside: false, lastMove: 0 } };
/** target tile for actions: hovered tile if within reach (and mouse recently used), else facing tile */
G.targetTile = (reach = 1.5) => {
  const m = G.input.mouse, p = G.player;
  if (m.inside && performance.now() - m.lastMove < 4000) {
    const wx = m.x + G.cam.x, wy = m.y + G.cam.y; const tx = Math.floor(wx / G.TILE), ty = Math.floor(wy / G.TILE);
    const pt = p.tile();
    if (Math.abs(tx - pt.x) <= reach && Math.abs(ty - pt.y) <= reach && !(tx === pt.x && ty === pt.y)) return { x: tx, y: ty };
  }
  return p.facingTile();
};
G._boxFree = (mapId, x, y) => {
  const hw = 12, top = y - 14, bot = y - 1;
  const pts = [[x - hw, top], [x + hw, top], [x - hw, bot], [x + hw, bot], [x, top], [x, bot]];
  for (const [px, py] of pts) if (G.world.isSolid(mapId, Math.floor(px / G.TILE), Math.floor(py / G.TILE))) return false;
  for (const e of G.world.entsOf(mapId)) if (e.solid && Math.abs(e.x - x) < 24 && Math.abs(e.y - y) < 16) return false;
  return true;
};
G.updatePlayer = dt => {
  const p = G.player, k = G.input.keys;
  p.cooldown = Math.max(0, p.cooldown - dt); p.swingT = Math.max(0, p.swingT - dt); p.warpLock = Math.max(0, p.warpLock - dt);
  let dx = 0, dy = 0;
  if (!G.ui.modal && !p.busy) {
    if (k.ArrowLeft || k.KeyA) dx -= 1; if (k.ArrowRight || k.KeyD) dx += 1;
    if (k.ArrowUp || k.KeyW) dy -= 1; if (k.ArrowDown || k.KeyS) dy += 1;
  }
  p.moving = !!(dx || dy);
  if (p.moving) {
    if (p.swingT <= 0) { if (Math.abs(dx) > Math.abs(dy) || (dx && !dy)) p.dir = dx < 0 ? 'left' : 'right'; else p.dir = dy < 0 ? 'up' : 'down'; if (dx && dy) p.dir = dy < 0 ? 'up' : 'down'; if (dx && !dy) p.dir = dx < 0 ? 'left' : 'right'; }
    const len = Math.hypot(dx, dy); const sp = p.speed * (k.ShiftLeft || k.ShiftRight ? 0.6 : 1) * (p.swingT > 0 ? 0.3 : 1) * dt;
    const nx = p.x + dx / len * sp, ny = p.y + dy / len * sp;
    // move each axis; when blocked, creep up to the obstacle so contact is the same at any frame rate
    const tryAxis = (ax, target) => {
      const cur = p[ax];
      for (const f of [1, 0.5, 0.25, 0.125]) { const v = cur + (target - cur) * f; if (ax === 'x' ? G._boxFree(p.map, v, p.y) : G._boxFree(p.map, p.x, v)) { p[ax] = v; return; } }
    };
    tryAxis('x', nx); tryAxis('y', ny);
    p.animT += dt;
  } else p.animT = 0;
  // warps
  if (p.warpLock <= 0) {
    const m = G.maps[p.map], t = p.tile();
    for (const w of m.warps || []) if (t.x >= w.x && t.x < w.x + (w.w || 1) && t.y >= w.y && t.y < w.y + (w.h || 1)) {
      if (w.cond && !w.cond()) continue;
      G.world.go(w.to, w.spawn); break;
    }
  }
};
/** primary action: use held item / tool on target tile */
G.doAction = () => {
  const p = G.player; if (p.cooldown > 0 || p.busy || G.ui.modal) return;
  const slot = G.inv.selected(); const t = G.targetTile(); const mapId = p.map, m = G.maps[mapId];
  const it = slot ? G.item(slot.id) : null;
  const ctx = { map: mapId, x: t.x, y: t.y, slot, slotIndex: G.state.hotbar, item: it, tier: it && it.cat === 'tool' ? (G.state.tools[it.id] || 0) : 0 };
  ctx.obj = G.world.objectAt(mapId, t.x, t.y);
  // face the target
  const pt = p.tile(); const ddx = t.x - pt.x, ddy = t.y - pt.y;
  if (Math.abs(ddx) > Math.abs(ddy)) p.dir = ddx < 0 ? 'left' : 'right'; else if (ddy) p.dir = ddy < 0 ? 'up' : 'down';
  if (it && it.cat === 'tool') { p.swingT = 0.3; p.swingTool = it.id; p.cooldown = 0.32; }
  else p.cooldown = 0.18;
  let done = false;
  try {
    if (it && it.cat === 'tool' && ctx.obj) { const d = G.world.objDef(ctx.obj); if (d.onTool) done = !!d.onTool(ctx.obj, it.id, ctx.tier, ctx); }
    if (!done && it && ctx.obj) { const d = G.world.objDef(ctx.obj); if (d.onItem) done = !!d.onItem(ctx.obj, slot, ctx); }
    if (!done && it && it.use) done = !!it.use(ctx);
    if (!done && m.useTile) done = !!m.useTile(ctx);
    if (!done && it && it.cat === 'tool') G.emit('toolMiss', ctx);
  } catch (e) { console.error('action error', e); }
  G.emit('action', ctx, done);
};
/** secondary: interact (talk, open, harvest by hand, sleep...) */
G.doInteract = () => {
  const p = G.player; if (p.busy || G.ui.modal) return;
  const mapId = p.map, m = G.maps[mapId];
  // entities (NPCs) near facing point first
  const f = p.facingTile(); const fx = (f.x + 0.5) * G.TILE, fy = (f.y + 0.5) * G.TILE;
  for (const e of G.world.entsOf(mapId)) if (e.interact && Math.hypot(e.x - fx, e.y - 10 - fy) < 40) { if (e.interact()) return; }
  const tiles = [G.targetTile(), f];
  for (const t of tiles) {
    const o = G.world.objectAt(mapId, t.x, t.y);
    if (o) { const d = G.world.objDef(o); if (d.interact && d.interact(o, mapId)) { G.emit('interact', o); return; } }
    if (m.interactTile && m.interactTile(t.x, t.y)) return;
  }
};

/* ---------------- camera & rendering ---------------- */
G.cam = { x: 0, y: 0, w: 800, h: 600, zoom: 1 };
G.fx = {
  list: [],
  float(text, x, y, color = '#fff', icon) { this.list.push({ type: 'float', text, x, y, color, icon, t: 0, life: 1.2 }); },
  burst(x, y, color = '#a0703c', n = 8, size = 4) {
    for (let i = 0; i < n; i++) this.list.push({ type: 'p', x, y, vx: G.rand(-120, 120), vy: G.rand(-220, -40), color, t: 0, life: G.rand(0.4, 0.8), size });
  },
  update(dt) {
    for (const f of this.list) { f.t += dt; if (f.type === 'p') { f.x += f.vx * dt; f.y += f.vy * dt; f.vy += 600 * dt; } else f.y -= 30 * dt; }
    this.list = this.list.filter(f => f.t < f.life);
  },
  draw(ctx) {
    for (const f of this.list) {
      const sx = Math.round(f.x - G.cam.x), sy = Math.round(f.y - G.cam.y);
      ctx.globalAlpha = 1 - f.t / f.life;
      if (f.type === 'p') { ctx.fillStyle = f.color; ctx.fillRect(sx, sy, f.size, f.size); }
      else {
        ctx.font = 'bold 16px "Press Start 2P", monospace'; ctx.textAlign = 'center';
        ctx.fillStyle = '#000'; ctx.fillText(f.text, sx + 2, sy + 2); ctx.fillStyle = f.color; ctx.fillText(f.text, sx, sy);
      }
      ctx.globalAlpha = 1;
    }
  },
};
G.drawGroundFallback = (ctx, ch, sx, sy) => {
  const col = { g: '#5a9e3a', G: '#4e8f33', d: '#b08a57', p: '#9a958c', s: '#e2cf8f', w: '#3b7dd8', b: '#8a5a2b', f: '#a8743f', W: '#5b3c22', c: '#6d6253', m: '#6b5b4a', M: '#3a2f27', v: '#000' }[ch] || '#f0f';
  ctx.fillStyle = col; ctx.fillRect(sx, sy, G.TILE, G.TILE);
};
G.render = () => {
  const cv = G.canvas, T = G.TILE;
  const m = G.maps[G.player.map]; if (!m) return;
  const z = G.cam.zoom;
  const vw = Math.ceil(cv.width / z), vh = Math.ceil(cv.height / z);
  // at fractional zoom, draw the world 1:1 into a buffer, then scale it once (no seams between tiles)
  let ctx = G.ctx; const buffered = z !== 1;
  if (buffered) {
    if (!G._buf || G._buf.width !== vw || G._buf.height !== vh) { G._buf = G.makeCanvas(vw, vh); }
    ctx = G._buf.getContext('2d'); ctx.imageSmoothingEnabled = false;
  }
  G.cam.w = vw; G.cam.h = vh;
  // camera follow, clamp
  let cx = G.player.x - vw / 2, cy = G.player.y - 24 - vh / 2;
  const mw = m.w * T, mh = m.h * T;
  cx = mw <= vw ? (mw - vw) / 2 : G.clamp(cx, 0, mw - vw);
  cy = mh <= vh ? (mh - vh) / 2 : G.clamp(cy, 0, mh - vh);
  G.cam.x = Math.round(cx); G.cam.y = Math.round(cy);
  ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, vw, vh);
  const x0 = Math.max(0, Math.floor(G.cam.x / T)), y0 = Math.max(0, Math.floor(G.cam.y / T));
  const x1 = Math.min(m.w - 1, Math.floor((G.cam.x + vw) / T)), y1 = Math.min(m.h - 1, Math.floor((G.cam.y + vh) / T));
  const now = performance.now() / 1000;
  for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) {
    const ch = m.ground[ty][tx]; const sx = tx * T - G.cam.x, sy = ty * T - G.cam.y;
    if (G.art.drawGround) { try { G.art.drawGround(ctx, m, ch, tx, ty, sx, sy, now); } catch (e) { G.drawGroundFallback(ctx, ch, sx, sy); } }
    else G.drawGroundFallback(ctx, ch, sx, sy);
  }
  if (m.drawGround) try { m.drawGround(ctx, G.cam); } catch (e) { console.error(e); }
  // y-sorted drawables
  const list = [];
  for (const o of G.world.objects(m.id)) {
    const d = G.world.objDef(o), s = G.world.size(o);
    if (o.x + s.w < x0 - 3 || o.x > x1 + 3 || o.y > y1 + 6 || o.y + s.h < y0 - 1) continue;
    list.push({ y: (o.y + s.h) * T + (d.sortY || 0), draw: c => { const px = o.x * T - G.cam.x, py = o.y * T - G.cam.y; if (d.draw) d.draw(c, o, px, py); else c.drawImage(G.placeholder(o.type), px, py); } });
  }
  for (const e of G.world.entsOf(m.id)) {
    if (e.kind === 'drop') { list.push({ y: e.y, draw: c => { const ic = G.icon(G.item(e.itemId).icon); const bob = Math.sin(now * 4 + e.x) * 2; c.drawImage(ic, Math.round(e.x - G.cam.x - 16), Math.round(e.y - G.cam.y - 28 + e.z + bob), 32, 32); } }); continue; }
    if (e.draw) list.push({ y: e.y + (e.sortY || 0), draw: c => e.draw(c, Math.round(e.x - G.cam.x), Math.round(e.y - G.cam.y)) });
  }
  const p = G.player;
  list.push({ y: p.y, draw: c => { const sx = Math.round(p.x - G.cam.x), sy = Math.round(p.y - G.cam.y); if (G.art.drawPlayer) G.art.drawPlayer(c, p, sx, sy); else { c.fillStyle = '#2d6cdf'; c.fillRect(sx - 12, sy - 40, 24, 40); } } });
  if (m.collect) try { m.collect(list, G.cam); } catch (e) { console.error(e); }
  list.sort((a, b) => a.y - b.y);
  for (const d of list) { try { d.draw(ctx); } catch (e) { if (!G._drawErr) { console.error('draw error', e); G._drawErr = 1; } } }
  // target highlight
  if (!G.ui.modal && !p.busy) {
    const t = G.targetTile(); ctx.strokeStyle = 'rgba(255,255,255,0.55)'; ctx.lineWidth = 2;
    ctx.strokeRect(t.x * T - G.cam.x + 1, t.y * T - G.cam.y + 1, T - 2, T - 2);
  }
  if (m.drawOverlay) try { m.drawOverlay(ctx, G.cam); } catch (e) { console.error(e); }
  G.fx.draw(ctx);
  // lighting
  let dark = m.dark || 0;
  if (!m.indoor && !m.dark) {
    const h = (G.state.time + 360) / 60 % 24;
    if (h >= 18 && h < 21) dark = (h - 18) / 3 * 0.55; else if (h >= 21 || h < 5) dark = 0.55; else if (h >= 5 && h < 6.5) dark = 0.55 * (1 - (h - 5) / 1.5);
  }
  if (dark > 0) {
    ctx.fillStyle = `rgba(10,15,50,${dark})`; ctx.fillRect(0, 0, vw, vh);
    if (G.art.drawLights) try { G.art.drawLights(ctx, m, dark); } catch (e) { }
  }
  // fatigue vignette
  const fl = G.fatigueLevel();
  if (fl >= 2) {
    const g = ctx.createRadialGradient(vw / 2, vh / 2, Math.min(vw, vh) * 0.25, vw / 2, vh / 2, Math.max(vw, vh) * 0.62);
    g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, fl === 2 ? 'rgba(40,0,30,0.5)' : 'rgba(60,0,20,0.68)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, vw, vh);
  }
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  if (buffered) { const c = G.ctx; c.setTransform(1, 0, 0, 1, 0, 0); c.imageSmoothingEnabled = false; c.drawImage(G._buf, 0, 0, vw * z, vh * z); }
};

/* ---------------- sound (tiny synth) ---------------- */
G.audio = null; G.muted = false;
G.sfx = name => {
  if (G.muted) return;
  try {
    if (!G.audio) G.audio = new (window.AudioContext || window.webkitAudioContext)();
    const a = G.audio, t = a.currentTime;
    const S = {
      hit: [[180, 90, 0.08, 'square', 0.12]], dig: [[120, 60, 0.1, 'triangle', 0.2]], water: [[600, 300, 0.15, 'sine', 0.08]],
      pickup: [[660, 990, 0.08, 'square', 0.06]], coin: [[988, 988, 0.06, 'square', 0.06], [1319, 1319, 0.12, 'square', 0.06, 0.06]],
      splash: [[400, 100, 0.25, 'sawtooth', 0.05]], bite: [[880, 880, 0.05, 'square', 0.1], [880, 880, 0.05, 'square', 0.1, 0.1]],
      craft: [[523, 523, 0.07, 'triangle', 0.1], [659, 659, 0.07, 'triangle', 0.1, 0.07], [784, 784, 0.12, 'triangle', 0.1, 0.14]],
      error: [[200, 150, 0.15, 'square', 0.08]], level: [[523, 523, 0.1, 'square', 0.07], [659, 659, 0.1, 'square', 0.07, 0.1], [784, 784, 0.1, 'square', 0.07, 0.2], [1047, 1047, 0.25, 'square', 0.07, 0.3]],
      chop: [[220, 110, 0.07, 'square', 0.12]], break: [[300, 60, 0.2, 'sawtooth', 0.1]], reel: [[500, 520, 0.03, 'square', 0.03]],
      open: [[300, 500, 0.1, 'triangle', 0.1]], step: [[100, 80, 0.03, 'triangle', 0.03]], catch: [[523, 1047, 0.3, 'square', 0.08]],
    }[name]; if (!S) return;
    for (const [f0, f1, dur, type, vol, delay = 0] of S) {
      const o = a.createOscillator(), g = a.createGain(); o.type = type;
      o.frequency.setValueAtTime(f0, t + delay); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + delay + dur);
      g.gain.setValueAtTime(vol, t + delay); g.gain.exponentialRampToValueAtTime(0.0001, t + delay + dur);
      o.connect(g).connect(a.destination); o.start(t + delay); o.stop(t + delay + dur + 0.02);
    }
  } catch (e) { }
};

/* ---------------- save / load ---------------- */
G.save = () => {
  if (!G.state || G.noSave) return;
  try {
    const p = G.player; Object.assign(G.state.player, { map: p.map, x: p.x, y: p.y, dir: p.dir });
    // don't save the player inside non-persistent maps (mine floors): put them at map's exitTo
    const m = G.maps[p.map]; if (m && m.persistent === false && m.saveAs) Object.assign(G.state.player, { map: m.saveAs.map, spawn: m.saveAs.spawn, x: null });
    localStorage.setItem(G.SAVE_KEY, JSON.stringify(G.state));
  } catch (e) { console.warn('save failed', e); }
};
G.hasSave = () => { try { return !!localStorage.getItem(G.SAVE_KEY); } catch (e) { return false; } };
G.loadSave = () => {
  try { const s = JSON.parse(localStorage.getItem(G.SAVE_KEY)); if (s && s.v) return Object.assign(G.newState(), s); } catch (e) { }
  return null;
};

/* ---------------- UI (DOM overlay) ---------------- */
G.ui = {
  modal: null, tabs: [], hotkeys: {},
  el: null,
  init() {
    this.el = document.getElementById('ui');
    this.el.innerHTML = `
      <div id="hud"><div class="hud-date"></div><div class="hud-time"></div><div class="hud-money"></div><div class="hud-fatigue"></div></div>
      <div id="hotbar"></div>
      <div id="toasts"></div>
      <div id="tooltip"></div>
      <div id="helpbar">WASD move · Click/Space use · Right-click/E interact · 1-0 hotbar · Tab inventory · C crafting · H help</div>
      <div id="fade"></div>`;
    this.hotbarEl = this.el.querySelector('#hotbar');
    this.renderHotbar();
    G.on('invChange', () => this.renderHotbar());
    // tooltip follow
    document.addEventListener('mousemove', e => { const tt = document.getElementById('tooltip'); if (tt) { tt.style.left = (e.clientX + 16) + 'px'; tt.style.top = (e.clientY + 16) + 'px'; } });
  },
  esc(s) { return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); },
  /** Free screen space for canvas pop-ups, in canvas draw units (screen px / zoom).
   *  top = below the clock panel and toasts, bottom = above the hotbar, ctrlTop = above the touch buttons. */
  safeArea() {
    const cv = G.canvas, z = G.cam.zoom || 1, r = cv.getBoundingClientRect();
    const k = (cv.width / (r.width || 1)) / z, vw = cv.width / z, vh = cv.height / z;
    const rectOf = sel => { const e = document.querySelector(sel); if (!e || !e.offsetParent && getComputedStyle(e).position !== 'fixed') return null; const b = e.getBoundingClientRect(); return b.width && b.height ? b : null; };
    let top = 8, bottom = vh - 8, ctrlTop = vh - 8;
    const hud = rectOf('#hud'); if (hud) top = Math.max(top, (hud.bottom - r.top) * k + 8);
    const ts = document.querySelectorAll('#toasts .toast:not(.out)');
    if (ts.length && G.isTouch) { const b = ts[ts.length - 1].getBoundingClientRect(); if (b.height) top = Math.max(top, (b.bottom - r.top) * k + 8); }
    const hb = rectOf('#hotbar'); if (hb) bottom = Math.min(bottom, (hb.top - r.top) * k - 8);
    ctrlTop = bottom;
    const tc = document.getElementById('touch');
    if (tc && tc.style.display !== 'none') for (const sel of ['#joy', '#tbtns']) { const b = rectOf(sel); if (b) ctrlTop = Math.min(ctrlTop, (b.top - r.top) * k - 8); }
    return { top, bottom, ctrlTop, vw, vh, narrow: vw < 520 };
  },
  updateHUD() {
    const h = this.el.querySelector('#hud'); if (!h) return;
    const f = G.fatigue(), hrs = Math.floor(G.state.awake / 60);
    h.querySelector('.hud-date').textContent = `${G.weekday()} · ${G.dateStr()}`;
    h.querySelector('.hud-time').textContent = G.timeStr();
    h.querySelector('.hud-money').textContent = G.fmtMoney(G.state.money);
    const fe = h.querySelector('.hud-fatigue');
    fe.innerHTML = `<span class="dot" style="background:${f.color}"></span>${f.label} · awake ${hrs}h${f.qShift ? ' · work quality ↓' : ''}`;
    fe.title = 'No energy bar here. But after 24h awake your harvests, ore and fish lose quality and you fumble actions. Sleep in your bed to reset.';
  },
  slotHTML(s, extra = '') {
    if (!s) return `<div class="slot empty" ${extra}></div>`;
    const it = G.item(s.id);
    const star = s.q ? `<span class="q q${s.q}">★</span>` : '';
    const qty = it.stack > 1 && s.qty > 1 ? `<span class="qty">${s.qty}</span>` : '';
    return `<div class="slot" ${extra} data-tip="${this.esc(this.tipFor(s))}"><img src="${G.iconURL(G.itemIcon(s.id))}">${qty}${star}</div>`;
  },
  tipFor(s) {
    const it = G.item(s.id);
    if (it.cat === 'tool') return `<b>${G.toolName(s.id)}</b><br>${it.desc || ''}`;
    const p = G.priceOf(s.id, s.q);
    return `<b>${this.esc(G.itemName(s.id, s.q))}</b><br><i>${it.cat}</i><br>${this.esc(it.desc || '')}${p ? `<br>Value: ${p}g` : ''}`;
  },
  bindTips(root) {
    const tt = document.getElementById('tooltip');
    root.querySelectorAll('[data-tip]').forEach(n => {
      n.addEventListener('mouseenter', () => { tt.innerHTML = n.dataset.tip; tt.style.display = 'block'; });
      n.addEventListener('mouseleave', () => { tt.style.display = 'none'; });
    });
  },
  hideTip() { const tt = document.getElementById('tooltip'); if (tt) tt.style.display = 'none'; },
  renderHotbar() {
    if (!this.hotbarEl || !G.state) return;
    let h = '';
    for (let i = 0; i < 12; i++) h += this.slotHTML(G.state.inv[i], `data-i="${i}"`);
    this.hotbarEl.innerHTML = h;
    const sel = this.hotbarEl.children[G.state.hotbar]; if (sel) sel.classList.add('sel');
    this.hotbarEl.querySelectorAll('.slot').forEach((n, i) => { const k = document.createElement('span'); k.className = 'hk'; k.textContent = i < 9 ? i + 1 : ['0', '-', '='][i - 9]; n.appendChild(k); });
    this.hotbarEl.querySelectorAll('.slot').forEach(n => n.addEventListener('mousedown', e => { e.stopPropagation(); G.state.hotbar = +n.dataset.i; this.renderHotbar(); }));
    this.bindTips(this.hotbarEl);
  },
  toast(msg, icon, kind = '') {
    const box = document.getElementById('toasts'); if (!box) return;
    const d = document.createElement('div'); d.className = 'toast ' + kind;
    d.innerHTML = (icon ? `<img src="${G.iconURL(icon)}">` : '') + `<span>${this.esc(msg)}</span>`;
    box.appendChild(d); setTimeout(() => d.classList.add('out'), 2600); setTimeout(() => d.remove(), 3100);
    while (box.children.length > 6) box.firstChild.remove();
  },
  _pickups: {},
  pickup(id, qty, q) {
    const k = id + ':' + (q || 0); const now = performance.now(); const box = document.getElementById('toasts');
    const prev = this._pickups[k];
    if (prev && now - prev.t < 2000 && prev.el.isConnected) { prev.n += qty; prev.t = now; prev.el.querySelector('span').textContent = `+${prev.n} ${G.itemName(id, q)}`; return; }
    const d = document.createElement('div'); d.className = 'toast pickup';
    d.innerHTML = `<img src="${G.iconURL(G.item(id).icon)}"><span>+${qty} ${this.esc(G.itemName(id, q))}</span>`;
    box.appendChild(d); this._pickups[k] = { el: d, n: qty, t: now };
    setTimeout(() => d.classList.add('out'), 2600); setTimeout(() => d.remove(), 3100);
  },
  fade(fn, ms = 300) {
    const f = document.getElementById('fade'); if (!f) { fn(); return; }
    f.style.transition = `opacity ${ms}ms`; f.style.opacity = 1; f.style.pointerEvents = 'auto';
    setTimeout(() => { try { fn(); } catch (e) { console.error(e); } f.style.opacity = 0; f.style.pointerEvents = 'none'; }, ms);
  },
  /** generic modal panel. opts: {title, width, render(bodyEl, panel), onClose, cls}. returns panel {el, body, close(), refresh()} */
  panel(opts) {
    this.close();
    const wrap = document.createElement('div'); wrap.className = 'modal-wrap';
    wrap.innerHTML = `<div class="panel ${opts.cls || ''}" style="${opts.width ? 'width:' + opts.width + 'px' : ''}"><div class="panel-head"><span>${this.esc(opts.title || '')}</span><button class="x" title="Close (Esc)">✕</button></div><div class="panel-body"></div></div>`;
    this.el.appendChild(wrap);
    const panel = { el: wrap, body: wrap.querySelector('.panel-body'), opts };
    panel.refresh = () => { this.hideTip(); panel.body.innerHTML = ''; opts.render(panel.body, panel); this.bindTips(panel.body); };
    panel.close = () => this.close();
    wrap.querySelector('.x').onclick = () => this.close();
    wrap.addEventListener('mousedown', e => { if (e.target === wrap) this.close(); });
    this.modal = panel; panel.refresh(); G.sfx('open');
    return panel;
  },
  close() {
    if (!this.modal) return; const m = this.modal; this.modal = null; this.hideTip();
    m.el.remove(); if (m.opts.onClose) try { m.opts.onClose(); } catch (e) { console.error(e); }
    this.renderHotbar();
  },
  /** dialogue box with optional choices: [{label, fn}] */
  dialog(speaker, text, choices = [{ label: 'OK' }], portraitIcon) {
    this.panel({
      title: speaker || '', width: 520, cls: 'dialog',
      render: (b) => {
        b.innerHTML = `<div class="dlg">${portraitIcon ? `<img class="portrait" src="${G.iconURL(portraitIcon)}">` : ''}<p>${text}</p></div><div class="choices"></div>`;
        const c = b.querySelector('.choices');
        choices.forEach((ch, i) => { const btn = document.createElement('button'); btn.textContent = (i < 9 ? (i + 1) + '. ' : '') + ch.label; if (ch.disabled) btn.disabled = true; btn.onclick = () => { this.close(); ch.fn && ch.fn(); }; c.appendChild(btn); });
      }
    });
  },
  confirm(text, yes, noLabel = 'Cancel', yesLabel = 'Yes') { this.dialog('', text, [{ label: yesLabel, fn: yes }, { label: noLabel }]); },
  sleepMenu() {
    const f = G.fatigue();
    this.dialog('Bed', `It's ${G.timeStr()}. You've been awake ${Math.floor(G.state.awake / 60)}h (${f.label}).`, [
      { label: 'Sleep until morning (saves game)', fn: () => G.sleep('full') },
      { label: 'Take a 3-hour nap (-8h tiredness)', fn: () => G.sleep('nap') },
      { label: 'Not now' },
    ], 'farm_bed');
  },
  morningReport(lines) {
    this.panel({
      title: 'Overnight Report', width: 480,
      render: b => {
        b.innerHTML = '<div class="report">' + lines.map(l => `<div class="rline">${l.icon ? `<img src="${G.iconURL(l.icon)}">` : '<span class="bullet">•</span>'}<span>${l.line}</span></div>`).join('') + '</div><div class="choices"><button>Start the day</button></div>';
        b.querySelector('button').onclick = () => this.close();
      }
    });
  },
  /** inventory grid element. onClick(i, slot, event) */
  invGrid(onClick, opts = {}) {
    const g = document.createElement('div'); g.className = 'grid inv-grid';
    const slots = opts.slots || G.state.inv;
    slots.forEach((s, i) => {
      const filt = opts.filter ? opts.filter(s) : true;
      const d = document.createElement('div'); d.innerHTML = this.slotHTML(s, `data-i="${i}"`); const n = d.firstChild;
      if (i === opts.highlight) n.classList.add('sel');
      if (s && !filt) n.classList.add('dim');
      if (i < 12 && !opts.slots) n.classList.add('hb');
      n.addEventListener('click', e => onClick(i, s, e));
      n.addEventListener('contextmenu', e => { e.preventDefault(); onClick(i, s, Object.assign(e, { right: true })); });
      g.appendChild(n);
    });
    return g;
  },
  addTab(id, label, render, order = 50) { this.tabs.push({ id, label, render, order }); this.tabs.sort((a, b) => a.order - b.order); },
  hotkey(code, fn) { this.hotkeys[code] = fn; },
  openInventory(tab = 'items') {
    let cur = tab;
    this.panel({
      title: 'Inventory', width: 720, cls: 'inv-panel',
      render: (b, panel) => {
        const tabs = document.createElement('div'); tabs.className = 'tabs';
        this.tabs.forEach(t => { const bt = document.createElement('button'); bt.textContent = t.label; if (t.id === cur) bt.className = 'on'; bt.onclick = () => { cur = t.id; panel.refresh(); }; tabs.appendChild(bt); });
        b.appendChild(tabs);
        const body = document.createElement('div'); body.className = 'tab-body'; b.appendChild(body);
        const t = this.tabs.find(t => t.id === cur) || this.tabs[0];
        t.render(body, panel);
      }
    });
  },
  /** transfer UI between a container array and player inventory. items: array (mutated) of slots */
  openContainer(title, items, opts = {}) {
    this.panel({
      title, width: 720,
      render: (b, panel) => {
        const h1 = document.createElement('h4'); h1.textContent = opts.label || title; b.appendChild(h1);
        b.appendChild(this.invGrid((i, s) => {
          if (!s) return; const left = G.inv.add(s.id, s.qty, s.q, true);
          if (left === s.qty) { this.toast('Inventory full!', null, 'warn'); return; }
          if (left > 0) s.qty = left; else items[i] = null;
          opts.onChange && opts.onChange(); panel.refresh();
        }, { slots: items }));
        const h2 = document.createElement('h4'); h2.textContent = 'Your inventory (click to store)'; b.appendChild(h2);
        b.appendChild(this.invGrid((i, s) => {
          if (!s) return; const it = G.item(s.id);
          if (opts.filter && !opts.filter(s)) { this.toast(opts.filterMsg || "That can't go in here.", null, 'warn'); return; }
          if (it.cat === 'tool') { this.toast("Keep your tools with you.", null, 'warn'); return; }
          let left = s.qty;
          for (const c of items) if (left && c && c.id === s.id && (c.q || 0) === (s.q || 0) && c.qty < it.stack) { const n = Math.min(left, it.stack - c.qty); c.qty += n; left -= n; }
          for (let k = 0; k < items.length && left; k++) if (!items[k]) { items[k] = { id: s.id, qty: left, q: s.q || 0 }; left = 0; }
          if (left === s.qty) { this.toast('Container is full.', null, 'warn'); return; }
          if (left) s.qty = left; else G.state.inv[i] = null;
          G.emit('invChange'); opts.onChange && opts.onChange(); panel.refresh();
        }, { filter: opts.filter }));
        if (opts.footer) opts.footer(b, panel);
      }
    });
  },
  /** generic merchant UI. stock: [{id, price, q?, label?, desc?, icon?, onBuy?() (custom; return false to cancel), soldOut?, req?: string (unmet requirement)}]
   *  opts.sell: true or fn(slot)->bool  sell items to merchant at opts.sellMult*value (default 1) */
  openShop(title, stock, opts = {}) {
    let qtyMult = 1;
    this.panel({
      title, width: 760, cls: 'shop',
      render: (b, panel) => {
        if (opts.greeting) { const p = document.createElement('p'); p.className = 'greet'; p.innerHTML = opts.greeting; b.appendChild(p); }
        const bar = document.createElement('div'); bar.className = 'shop-bar';
        bar.innerHTML = `<span>Your gold: <b>${G.fmtMoney(G.state.money)}</b></span><span class="qtysel">Buy qty: ${[1, 5, 10, 25].map(n => `<button class="${n === qtyMult ? 'on' : ''}" data-n="${n}">×${n}</button>`).join('')}</span>`;
        bar.querySelectorAll('[data-n]').forEach(bt => bt.onclick = () => { qtyMult = +bt.dataset.n; panel.refresh(); });
        b.appendChild(bar);
        const list = document.createElement('div'); list.className = 'shop-list';
        (typeof stock === 'function' ? stock() : stock).forEach(s => {
          const it = G.item(s.id); const row = document.createElement('div'); row.className = 'shop-row' + (s.soldOut || s.req ? ' dis' : '');
          const n = s.single ? 1 : qtyMult; const cost = s.price * n;
          row.innerHTML = `<img src="${G.iconURL(s.icon || it.icon)}"><div class="nm"><b>${this.esc(s.label || it.name)}</b><small>${s.req ? '🔒 ' + this.esc(s.req) : this.esc(s.desc || it.desc || '')}</small></div><div class="pr">${s.costText || G.fmtMoney(cost)}</div>`;
          row.onclick = () => {
            if (s.soldOut || s.req) { G.sfx('error'); return; }
            if (s.onBuy) { const r = s.onBuy(n); if (r !== false) G.sfx('coin'); panel.refresh(); return; }
            if (G.state.money < cost) { this.toast('Not enough gold.', null, 'warn'); G.sfx('error'); return; }
            const left = G.inv.add(s.id, n, s.q || 0, true);
            const bought = n - left; if (!bought) { this.toast('Inventory full!', null, 'warn'); return; }
            G.spend(s.price * bought); G.sfx('coin'); this.toast(`Bought ${bought} ${it.name}`, it.icon); panel.refresh();
          };
          list.appendChild(row);
        });
        b.appendChild(list);
        if (opts.sell) {
          const mult = opts.sellMult || 1;
          const h = document.createElement('h4'); h.textContent = `Sell items (click a stack · right-click sells one) — pays ${Math.round(mult * 100)}% of value`; b.appendChild(h);
          const canSell = s => s && G.item(s.id).price > 0 && G.item(s.id).cat !== 'tool' && (opts.sell === true || opts.sell(s));
          b.appendChild(this.invGrid((i, s, e) => {
            if (!canSell(s)) return; const n = e.right ? 1 : s.qty; const val = Math.floor(G.priceOf(s.id, s.q) * mult) * n;
            G.inv.removeSlot(i, n); G.earn(val); G.state.stats.itemsSold += n; G.emit('itemSold', s.id, n, val, 'merchant');
            this.toast(`Sold ${n} ${G.itemName(s.id, s.q)} for ${val}g`); panel.refresh();
          }, { filter: canSell }));
        }
      }
    });
  },
  help() {
    this.panel({
      title: 'How to Play', width: 640, render: b => {
        b.innerHTML = `<div class="help">
<p><b>Move</b> WASD / arrows (hold Shift to walk) · <b>Use tool/item</b> left-click or Space · <b>Interact</b> right-click or E · <b>Hotbar</b> 1-0, -, = or mouse wheel · <b>Inventory</b> Tab or I · <b>Crafting</b> C · <b>Mute</b> M</p>
<p><b>No energy bar.</b> Work as long as you like — but after <b>24 hours awake</b> you're Exhausted: harvests, ore and fish come out lower quality, yields drop and you sometimes fumble. After 36h you're Delirious. Sleep in your bed (or nap) to recover. Coffee helps a little.</p>
<p><b>Making money:</b> stock the display shelves of your <b>farm shop</b> and customers will buy while you or a hired shopkeeper are nearby. You can also sell to merchants in town at a lower rate.</p>
<p><b>Progress:</b> grow crops, fish in the pond (needs <b>bait</b>), mine ore in the cave north of the farm. Smelt bars, craft machines, upgrade tools at the blacksmith, construct buildings with the carpenter and hire helpers at the inn.</p>
${(G.helpExtra || []).map(h => `<p>${h}</p>`).join('')}
</div>`;
      }
    });
  },
};
G.helpExtra = [];

// core inventory tab
G.ui.addTab('items', 'Items', (body, panel) => {
  const info = document.createElement('div'); info.className = 'inv-info';
  info.innerHTML = `<span>${G.fmtMoney(G.state.money)}</span><span>Click two slots to swap · first row is your hotbar · right-click a slot to trash it</span>`;
  body.appendChild(info);
  body.appendChild(G.ui.invGrid((i, s, e) => {
    if (e.right) {
      if (!s) return; const it = G.item(s.id); if (it.cat === 'tool') { G.ui.toast("You can't trash tools.", null, 'warn'); return; }
      G.ui.confirm(`Trash ${s.qty} ${G.itemName(s.id, s.q)}?`, () => { G.state.inv[i] = null; G.emit('invChange'); G.ui.openInventory('items'); }); return;
    }
    if (G.ui._swapFrom === undefined || G.ui._swapFrom === null) { G.ui._swapFrom = i; panel.refresh(); return; }
    const a = G.ui._swapFrom; G.ui._swapFrom = null; const inv = G.state.inv;
    if (a !== i) {
      const A = inv[a], B = inv[i];
      if (A && B && A.id === B.id && (A.q || 0) === (B.q || 0) && G.item(A.id).stack > 1) { const n = Math.min(A.qty, G.item(A.id).stack - B.qty); B.qty += n; A.qty -= n; if (!A.qty) inv[a] = null; }
      else { inv[a] = B; inv[i] = A; }
    }
    G.emit('invChange'); panel.refresh();
  }, { highlight: G.ui._swapFrom }));
}, 0);
G.ui.addTab('skills', 'Skills', body => {
  const st = G.state; let h = '<div class="skills">';
  for (const [k, s] of Object.entries(st.skills)) {
    const next = G.XP_LEVELS[s.lvl] || s.xp, prev = s.lvl ? G.XP_LEVELS[s.lvl - 1] : 0; const pct = s.lvl >= 10 ? 100 : Math.floor((s.xp - prev) / (next - prev) * 100);
    h += `<div class="skill"><b>${k[0].toUpperCase() + k.slice(1)}</b><span>Lv ${s.lvl}</span><div class="bar"><div style="width:${pct}%"></div></div></div>`;
  }
  const f = G.fatigue();
  h += `</div><p class="statline">Awake: ${Math.floor(st.awake / 60)}h ${st.awake % 60 | 0}m — <span style="color:${f.color}">${f.label}</span>. ${f.qShift ? `Quality ${f.qShift} tier(s), yield ×${f.yield}, fumble ${f.fumble * 100}%.` : 'Working at full quality.'}</p>`;
  h += `<p class="statline">Total earned: ${G.fmtMoney(st.totalEarned)} · Crops harvested: ${st.stats.cropsHarvested} · Fish caught: ${st.stats.fishCaught} · Ore mined: ${st.stats.oreMined} · Items crafted: ${st.stats.itemsCrafted} · Deepest mine level: ${st.stats.deepestMine}</p>`;
  body.innerHTML = h;
}, 90);

/* ---------------- input ---------------- */
G.initInput = () => {
  const cv = G.canvas;
  window.addEventListener('keydown', e => {
    if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
    G.input.keys[e.code] = true;
    if (G.ui.modal) {
      if (e.code === 'Escape' || ((e.code === 'Tab' || e.code === 'KeyI') && G.ui.modal.opts.cls === 'inv-panel')) { e.preventDefault(); G.ui.close(); }
      else if (G.ui.modal.opts.cls === 'dialog' && /^Digit[1-9]$/.test(e.code)) { const b = G.ui.modal.body.querySelectorAll('.choices button')[+e.code.slice(5) - 1]; if (b && !b.disabled) b.click(); }
      else if (e.code === 'KeyC' && G.ui.modal.opts.cls === 'craft') G.ui.close();
      return;
    }
    if (!G.started) return;
    if (/^Digit[0-9]$/.test(e.code)) { const n = +e.code.slice(5); G.state.hotbar = n === 0 ? 9 : n - 1; G.ui.renderHotbar(); }
    else if (e.code === 'Minus') { G.state.hotbar = 10; G.ui.renderHotbar(); }
    else if (e.code === 'Equal') { G.state.hotbar = 11; G.ui.renderHotbar(); }
    else if (e.code === 'Space') { e.preventDefault(); G.doAction(); }
    else if (e.code === 'KeyE' || e.code === 'KeyX' || e.code === 'Enter') G.doInteract();
    else if (e.code === 'Tab' || e.code === 'KeyI') { e.preventDefault(); G.ui.openInventory(); }
    else if (e.code === 'KeyH' || e.code === 'F1') { e.preventDefault(); G.ui.help(); }
    else if (e.code === 'KeyM') { G.muted = !G.muted; G.ui.toast(G.muted ? 'Sound off' : 'Sound on'); }
    else if (G.ui.hotkeys[e.code]) { e.preventDefault(); G.ui.hotkeys[e.code](); }
  });
  window.addEventListener('keyup', e => { G.input.keys[e.code] = false; });
  window.addEventListener('blur', () => { G.input.keys = {}; });
  const mpos = e => { const r = cv.getBoundingClientRect(); G.input.mouse.x = (e.clientX - r.left) * (cv.width / r.width) / G.cam.zoom; G.input.mouse.y = (e.clientY - r.top) * (cv.height / r.height) / G.cam.zoom; };
  cv.addEventListener('mousemove', e => { mpos(e); G.input.mouse.inside = true; G.input.mouse.lastMove = performance.now(); });
  cv.addEventListener('mouseleave', () => { G.input.mouse.inside = false; });
  cv.addEventListener('mousedown', e => {
    if (!G.started || G.ui.modal) return; mpos(e); G.input.mouse.inside = true; G.input.mouse.lastMove = performance.now();
    if (e.button === 0) { G.input.mouseHeld = true; G.doAction(); } else if (e.button === 2) G.doInteract();
  });
  window.addEventListener('mouseup', () => { G.input.mouseHeld = false; });
  cv.addEventListener('contextmenu', e => e.preventDefault());
  cv.addEventListener('wheel', e => { if (!G.started || G.ui.modal) return; e.preventDefault(); G.state.hotbar = (G.state.hotbar + (e.deltaY > 0 ? 1 : 11)) % 12; G.ui.renderHotbar(); }, { passive: false });
};

/* ---------------- boot & loop ---------------- */
G.resize = () => {
  const cv = G.canvas; const dpr = 1; cv.width = Math.floor(window.innerWidth * dpr); cv.height = Math.floor(window.innerHeight * dpr);
  // zoom: desktop shows tiles at 1:1; small screens zoom out so the short side shows ~9.5 tiles
  const short = Math.min(cv.width, cv.height);
  G.cam.zoom = Math.min(1, Math.max(0.55, short / (9.5 * G.TILE)));
  if (cv.width / G.cam.zoom < 8 * G.TILE) G.cam.zoom = Math.max(0.5, cv.width / (8 * G.TILE));
  G.ctx.imageSmoothingEnabled = false;
};
G.startGame = (state) => {
  G.state = state;
  const fresh = !state.started;
  G.state.started = true;
  G.emit('beforeStart', fresh);
  if (fresh) {
    // generate all persistent maps first (debris etc.), then let modules seed state/objects
    for (const id in G.maps) G.world.ensureGenerated(id);
    G.emit('newGame');   // modules seed inventory/state
  }
  G.emit('loadGame', fresh);  // always: modules rebuild runtime from state
  const p = G.state.player;
  const mapId = G.maps[p.map] ? p.map : 'farm';
  G.world.go(mapId, p.spawn || 'start', true);
  if (p.x != null && !fresh && G.maps[p.map] && G.maps[p.map].persistent !== false) { G.player.x = p.x; G.player.y = p.y; G.player.dir = p.dir || 'down'; }
  G.started = true; G.ui.renderHotbar();
  if (fresh) setTimeout(() => G.ui.help(), 400);
};
// Android/Chrome install prompt: show an "Install app" button on the title screen when available
G._installEvt = null;
window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); G._installEvt = e; G._showInstall && G._showInstall(); });
window.addEventListener('appinstalled', () => { G._installEvt = null; const b = document.getElementById('installbtn'); if (b) b.remove(); });
G.titleScreen = () => {
  const ui = G.ui.el; const has = G.hasSave();
  const d = document.createElement('div'); d.id = 'title';
  d.innerHTML = `<div class="title-card"><h1>Hollow Creek Farm</h1><p class="sub">farm · fish · mine · craft · run your own shop</p>
    <div class="title-icons">${['carrot_crop_2', 'tomato', 'pumpkin_crop', 'corn_plant', 'strawberry', 'sunflower'].map(n => `<img src="${G.iconURL(n)}">`).join('')}</div>
    <label>Your name <input id="pname" maxlength="16" value="Farmer"></label>
    <div class="title-btns">${has ? '<button id="cont">Continue</button>' : ''}<button id="newg">New Game</button></div>
    ${has ? '<p class="warn-small">Starting a new game overwrites your save.</p>' : ''}</div>`;
  ui.appendChild(d);
  G._showInstall = () => {
    if (!G._installEvt || document.getElementById('installbtn') || !d.isConnected) return;
    const b = document.createElement('button'); b.id = 'installbtn'; b.className = 'install'; b.textContent = 'Install app';
    b.onclick = async () => { const ev = G._installEvt; if (!ev) return; ev.prompt(); try { await ev.userChoice; } catch (e) { } G._installEvt = null; b.remove(); };
    d.querySelector('.title-btns').appendChild(b);
  };
  G._showInstall();
  const start = st => { d.remove(); G.startGame(st); };
  d.querySelector('#newg').onclick = () => { const s = G.newState(); s.name = (d.querySelector('#pname').value || 'Farmer').slice(0, 16); start(s); };
  if (has) d.querySelector('#cont').onclick = () => { const s = G.loadSave(); if (s) start(s); else start(G.newState()); };
};
G.boot = async () => {
  G.canvas = document.getElementById('game'); G.ctx = G.canvas.getContext('2d');
  window.addEventListener('resize', G.resize); G.resize();
  await G.assetsReady;
  G.emit('assetsLoaded');  // art module builds sprites here
  G.state = G.newState();  // placeholder so UI can render
  G.ui.init(); G.initInput();
  G.emit('init');          // modules define maps/objects/items needing assets
  G.titleScreen();
  let last = performance.now(), saveT = 0, hudT = 0;
  const loop = now => {
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    if (G.started) {
      if (!G.ui.modal && !G.paused && !document.hidden) G.advanceTime(dt * G.TIME_SCALE * (G.timeSpeed || 1));
      G.updatePlayer(dt);
      if (G.input.mouseHeld && !G.ui.modal) { const s = G.inv.selected(); if (s && G.item(s.id).cat === 'tool' && s.id !== 'fishing_rod') G.doAction(); }
      const m = G.maps[G.player.map];
      if (m && m.update) try { m.update(dt); } catch (e) { console.error(e); }
      for (const e of G.world.entsOf(G.player.map).slice()) if (e.update) try { e.update(dt); } catch (err) { console.error(err); }
      G.emit('tick', dt);
      G.fx.update(dt);
      G.render();
      hudT -= dt; if (hudT <= 0) { G.ui.updateHUD(); hudT = 0.25; }
      saveT += dt; if (saveT > 30) { saveT = 0; G.save(); }
    }
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
};
window.addEventListener('beforeunload', () => G.save());
window.addEventListener('load', () => G.boot());
