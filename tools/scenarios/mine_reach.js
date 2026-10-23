// Every generated mine floor: all floor tiles reachable from the arrival spot when only the
// permanent solid objects (ladder up, elevator, treasure chest) block.
module.exports = async (page, h) => {
  const r = await h.eval(async () => {
    const PERM = new Set(['ladder_up', 'mine_elevator', 'mine_treasure', 'mine_torch', 'mine_sign']);
    let bad = [], n = 0;
    G.world.go('mine', 'top', true);
    for (let i = 0; i < 300; i++) {
      const floor = 1 + (i % 60);
      G.mining.goFloor(floor); await new Promise(r => setTimeout(r, 0));
      // goFloor uses a fade; call the map's onEnter directly for speed
      G.maps.mine.onEnter('down');
      const m = G.maps.mine, objs = G.world.objects('mine');
      const block = new Set(objs.filter(o => PERM.has(o.type)).map(o => o.x + ',' + o.y));
      const sp = m.spawns.down; const seen = new Set([sp.x + ',' + sp.y]); const q = [[sp.x, sp.y]];
      while (q.length) { const [x, y] = q.pop(); for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1]]) { const X = x + dx, Y = y + dy, k = X + ',' + Y; if (seen.has(k) || block.has(k)) continue; const ch = G.world.ground('mine', X, Y); if (ch !== 'm') continue; seen.add(k); q.push([X, Y]); } }
      let total = 0; for (let y = 0; y < m.h; y++) for (let x = 0; x < m.w; x++) if (m.ground[y][x] === 'm' && !block.has(x + ',' + y)) total++;
      n++; if (seen.size < total) bad.push({ floor, reach: seen.size, total });
    }
    return { floors: n, bad: bad.length, sample: bad.slice(0, 5) };
  });
  console.log('[reach]', JSON.stringify(r));
  if (r.bad) h.errors.push('unreachable floor areas: ' + JSON.stringify(r.sample));
};
