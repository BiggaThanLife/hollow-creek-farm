// Extract every art asset from the running game -> scratchpad/art.json   (run via smoke.js)
module.exports = async (page, h) => {
  const data = await h.eval(() => {
    const out = []; const T = G.TILE;
    const add = (section, name, src, note) => { try { const c = G.makeCanvas(src.width, src.height); c.getContext('2d').drawImage(src, 0, 0); out.push({ section, name, w: src.width, h: src.height, url: c.toDataURL(), note: note || '' }); } catch (e) { } };
    for (const k of Object.keys(G.assets).sort()) add('pack', k, G.assets[k], 'from your asset pack');
    const iconSrc = (n) => { const v = G.art.icons[n]; return v; };
    for (const k of Object.keys(G.art.icons).sort()) { const v = G.art.icons[k]; const isPack = Object.values(G.assets).includes(v); if (!isPack) add('icons', k, v); }
    for (const k of Object.keys(G.art.sprites).sort()) { const v = G.art.sprites[k]; const isPack = Object.values(G.assets).includes(v); if (!isPack) add(/^portrait_/.test(k) ? 'portraits' : /store_|inn|farmhouse|shop_stall|worker_cabin|greenhouse|shed|silo/.test(k) ? 'buildings' : 'sprites', k, v); }
    for (const t of ['hoe', 'watering_can', 'axe', 'pickaxe', 'scythe', 'fishing_rod']) for (let i = 0; i < 5; i++) { const c = G.art.toolIcon(t, i); if (c) add('tools', `${t} · ${G.TOOL_TIERS[i]}`, c); }
    // ground tiles (rendered in context of a small test map so edges show)
    const rows = ['ggggggggg', 'gGGgddddg', 'ggwwwwbdg', 'ggwwwwbdg', 'gggppppsg', 'cccccccsg', 'mmmmMMMMv', 'fffffWWWW'];
    G.defMap({ id: '__sheet', w: 9, h: 8, ground: rows.slice() });
    const map = G.maps.__sheet; const big = G.makeCanvas(9 * T, 8 * T), bx = big.getContext('2d');
    for (let y = 0; y < 8; y++) for (let x = 0; x < 9; x++) G.art.drawGround(bx, map, rows[y][x], x, y, x * T, y * T, 0);
    add('ground', 'tile sampler (9×8 tiles, shows edges & shores)', big, 'each tile is 48×48');
    const names = { g: 'grass', G: 'grass variant', d: 'dirt', p: 'cobble path', s: 'sand', w: 'water (8-frame anim)', b: 'bridge/dock', f: 'wood floor', W: 'interior wall', c: 'cliff', m: 'mine floor', M: 'mine wall' };
    for (const ch of Object.keys(names)) { G.defMap({ id: '__one', w: 3, h: 3, ground: [ch.repeat(3), ch.repeat(3), ch.repeat(3)] }); const c = G.makeCanvas(T, T); G.art.drawGround(c.getContext('2d'), G.maps.__one, ch, 1, 1, 0, 0, 0); add('ground', `${names[ch]} ('${ch}')`, c); }
    // soil & crops
    { const c = G.makeCanvas(T, T); G.art.drawSoil(c.getContext('2d'), 0, 0, false, null, 0, 0); add('crops', 'tilled soil (dry)', c); }
    { const c = G.makeCanvas(T, T); G.art.drawSoil(c.getContext('2d'), 0, 0, true, null, 0, 0); add('crops', 'tilled soil (wet)', c); }
    for (const cr of ['carrot', 'potato', 'cabbage', 'strawberry', 'tomato', 'corn', 'sunflower', 'wheat', 'pumpkin']) {
      const c = G.makeCanvas(T * 5, T * 2), x = c.getContext('2d'); for (let s = 0; s <= 4; s++) G.art.drawCrop(x, cr, s, 4, s * T, T, 0);
      add('crops', `${cr} — stages 0→4`, c, '5 stages, each 48 wide (may extend upward)');
    }
    // characters
    const dirs = ['down', 'left', 'right', 'up'];
    { const c = G.makeCanvas(48 * 4, 64 * 4), x = c.getContext('2d');
      dirs.forEach((d, i) => { for (let f = 0; f < 4; f++) G.art.drawPlayer(x, { dir: d, moving: f > 0, animT: f * 0.13, swingT: 0 }, f * 48 + 24, i * 64 + 58); });
      add('characters', 'player — 4 directions × walk frames', c, 'each frame ~32×44, drawn in a 48×64 cell'); }
    { const c = G.makeCanvas(64 * 4, 72), x = c.getContext('2d');
      dirs.forEach((d, i) => { G.player.swingTool = 'pickaxe'; G.art.drawPlayer(x, { dir: d, moving: false, animT: 0, swingT: 0.15, swingTool: 'pickaxe' }, i * 64 + 32, 62); });
      add('characters', 'player — tool swing', c); }
    const looks = [{ skin: '#f1c7a3', hair: 'bun', hairColor: '#cfcfcf', shirt: '#4f9e3b', pants: '#5b3a1e' }, { skin: '#c68863', hair: 'short', hairColor: '#3a2412', shirt: '#7a7f8c', pants: '#3b3b46' }, { skin: '#f6d2b8', hair: 'long', hairColor: '#b8442c', shirt: '#e0b347', pants: '#4a5d8c', hat: 'cap' }, { skin: '#8d5a3b', hair: 'bald', hairColor: '#222', shirt: '#9b59b6', pants: '#2e2e2e', hat: 'straw' }];
    { const c = G.makeCanvas(48 * 8, 64), x = c.getContext('2d'); looks.forEach((l, i) => { G.art.drawNPC(x, l, 'down', false, 0, i * 96 + 24, 58); G.art.drawNPC(x, l, 'left', true, 0.2, i * 96 + 72, 58); });
      add('characters', 'villagers / workers (palette swaps)', c); }
    return out;
  });
  require('fs').writeFileSync('/tmp/claude-0/-home-claude/66e851f3-880e-53cd-a5fd-6673a29cdfd6/scratchpad/art.json', JSON.stringify(data));
  const c = {}; data.forEach(d => c[d.section] = (c[d.section] || 0) + 1); console.log('extracted', JSON.stringify(c));
};
