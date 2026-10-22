// Paths become cobblestone ground; decorations can be picked up, placed, sold; beds can move.
module.exports = async (page, h) => {
  const log = (k, v) => console.log('[decor]', k, JSON.stringify(v));
  log('converted', await h.eval(() => ['farm', 'house'].map(m => G.world.objects(m).filter(o => o.type === 'furniture').map(o => o.key).join(','))));
  log('leftover old types', await h.eval(() => ['farm', 'house'].flatMap(m => G.world.objects(m).filter(o => ['decor', 'furn', 'bed', 'bookshelf'].includes(o.type)).map(o => o.type))));
  // --- paths: lay a 3x2 patch below the stall road
  const r = await h.eval(() => {
    G.inv.add('path_stone', 10, 0, true); const slot = G.state.inv.findIndex(s => s && s.id === 'path_stone'); G.state.hotbar = slot;
    // find a clear grass patch near the house
    const tiles = []; for (let y = 13; y < 20 && tiles.length < 6; y++) for (let x = 22; x < 34 && tiles.length < 6; x++) if (G.world.ground('farm', x, y) === 'g' && !G.world.objectAt('farm', x, y)) tiles.push([x, y]);
    const placed = [];
    const want = [[24, 14], [25, 14], [26, 14], [26, 15], [26, 16]];
    for (const [x, y] of want) { const o = G.world.objectAt('farm', x, y); if (o) G.world.removeObject('farm', o); G.items.path_stone.use({ map: 'farm', x, y, slotIndex: G.state.hotbar }); placed.push(G.world.ground('farm', x, y)); }
    G.player.x = 25.5 * 48; G.player.y = 13.8 * 48; G.player.dir = 'down';
    return { placed, left: G.inv.count('path_stone') };
  });
  log('paths placed', r);
  await h.wait(300); await h.shot('decor_paths');
  // pick one back up with the pickaxe
  log('pickaxe removal', await h.eval(() => { G.state.hotbar = 3; G.input.mouse.lastMove = 0; G.player.x = 24.5 * 48; G.player.y = 13.8 * 48; G.player.dir = 'down'; G.player.cooldown = 0; G.doAction(); return { ground: G.world.ground('farm', 24, 14), stones: G.inv.count('path_stone') }; }));
  // --- pick up flowers via the furniture dialog, place them elsewhere, sell one
  log('pickup flowers', await h.eval(() => {
    const o = G.world.objects('farm').find(o => o.key === 'flower_patch'); G.objTypes.furniture.interact(o, 'farm');
    const btn = [...document.querySelectorAll('.choices button')].find(b => /Pick up/.test(b.textContent)); btn.click();
    return { gone: !G.world.objects('farm').includes(o), have: G.inv.count('furn_flower_patch') };
  }));
  log('place flowers', await h.eval(() => {
    const slot = G.state.inv.findIndex(s => s && s.id === 'furn_flower_patch');
    G.items.furn_flower_patch.use({ map: 'farm', x: 28, y: 14, slotIndex: slot });
    return G.world.objects('farm').some(o => o.key === 'flower_patch' && o.x === 28 && o.y === 14);
  }));
  log('sell value', await h.eval(() => ({ well: G.priceOf('furn_well'), mailbox: G.priceOf('furn_mailbox'), bed: G.priceOf('furn_farm_bed') })));
  // mailbox still works
  log('mailbox dialog', await h.eval(() => { const o = G.world.objects('farm').find(o => o.key === 'mailbox'); G.objTypes.furniture.interact(o, 'farm'); const t = [...document.querySelectorAll('.choices button')].map(b => b.textContent); G.ui.close(); return t; }));
  // --- move the bed: pick up with axe, place at (8,5)... house
  log('bed move', await h.eval(() => {
    G.world.go('house', 'door', true);
    const bed = G.world.objects('house').find(o => o.key === 'farm_bed');
    G.objTypes.furniture.onTool(bed, 'axe', 0, {});
    const slot = G.state.inv.findIndex(s => s && s.id === 'furn_farm_bed');
    // clear a spot
    G.items.furn_farm_bed.use({ map: 'house', x: 2, y: 5, slotIndex: slot });
    const nb = G.world.objects('house').find(o => o.key === 'farm_bed');
    return nb ? { x: nb.x, y: nb.y, w: nb.w, spot: G.bedSpot('house') } : 'not placed';
  }));
  await h.eval(() => G.sleep('full')); await h.wait(1400); await h.eval(() => G.ui.close());
  log('woke at', await h.eval(() => G.player.tile()));
  await h.shot('decor_house');
  // --- save & reload keeps paths
  await h.eval(() => G.save());
  await page.reload(); await page.waitForSelector('#cont'); await page.click('#cont'); await h.wait(700);
  log('after reload', await h.eval(() => ({ p26_15: G.world.ground('farm', 26, 15), p24_14: G.world.ground('farm', 24, 14), flowers: G.world.objects('farm').some(o => o.key === 'flower_patch' && o.x === 28) })));
  await h.eval(() => { G.world.go('farm', 'start', true); G.player.x = 25.5 * 48; G.player.y = 13 * 48; }); await h.wait(300); await h.shot('decor_after_reload');
};
