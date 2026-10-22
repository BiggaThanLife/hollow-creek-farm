// Render app icons from the game's own art.  node tools/make_icons.js  -> icons/*.png
const { chromium } = require('/opt/npm-tools/node_modules/playwright');
const path = require('path'), fs = require('fs');
(async () => {
  const b = await chromium.launch(); const p = await b.newPage();
  await p.route(/fonts/, r => r.abort());
  await p.goto('file://' + path.resolve(__dirname, '../dist/index.html'));
  await p.waitForFunction(() => window.G && G.art && G.art.drawPlayer && Object.keys(G.art.sprites).length > 20);
  const out = await p.evaluate(() => {
    // logical 128x128 scene, scaled up with nearest-neighbour
    const scene = (safe) => {
      const L = 128, c = G.makeCanvas(L, L), x = c.getContext('2d');
      // sky-to-grass backdrop using real grass tiles
      G.state.season = 0;
      const rows = []; for (let i = 0; i < 4; i++) rows.push('gggg');
      G.defMap({ id: '__icon', w: 4, h: 4, ground: rows });
      for (let ty = 0; ty < 3; ty++) for (let tx = 0; tx < 3; tx++) G.art.drawGround(x, G.maps.__icon, 'g', tx + 1, ty + 1, tx * 48 - 8, ty * 48 - 8, 0);
      // soft vignette
      const g = x.createRadialGradient(64, 60, 20, 64, 64, 96); g.addColorStop(0, 'rgba(255,240,180,0.18)'); g.addColorStop(1, 'rgba(20,40,10,0.45)');
      x.fillStyle = g; x.fillRect(0, 0, L, L);
      // full-width tilled row (background, never cropped by the mask)
      for (let i = -1; i < 4; i++) G.art.drawSoil(x, i * 48 - 4, 82, true, null, 0, 0);
      const k = safe ? 0.8 : 1; // maskable: keep the subject inside the safe circle
      x.save(); x.translate(64 * (1 - k), 64 * (1 - k)); x.scale(k, k);
      x.drawImage(G.assets.carrot_crop, -4, 64, 48, 48);
      x.drawImage(G.assets.pumpkin_crop, 84, 70, 46, 46);
      // the farmer at 2x, facing us
      x.save(); x.translate(64, 116); x.scale(2, 2); G.art.drawPlayer(x, { dir: 'down', moving: false, animT: 0, swingT: 0 }, 0, 0); x.restore();
      x.restore();
      return c;
    };
    const up = (src, n) => { const c = G.makeCanvas(n, n), x = c.getContext('2d'); x.imageSmoothingEnabled = n < src.width * 2; x.imageSmoothingQuality = 'high'; x.drawImage(src, 0, 0, n, n); return c.toDataURL('image/png'); };
    const any = scene(false), mask = scene(true);
    // big versions: integer nearest-neighbour from 128 -> 512, then downsample smoothly for small sizes
    const big = G.makeCanvas(512, 512); { const x = big.getContext('2d'); x.imageSmoothingEnabled = false; x.drawImage(any, 0, 0, 512, 512); }
    const bigM = G.makeCanvas(512, 512); { const x = bigM.getContext('2d'); x.imageSmoothingEnabled = false; x.drawImage(mask, 0, 0, 512, 512); }
    return { 'icon-512.png': big.toDataURL(), 'icon-192.png': up(big, 192), 'icon-maskable-512.png': bigM.toDataURL(), 'icon-maskable-192.png': up(bigM, 192), 'apple-touch-icon.png': up(big, 180), 'favicon-32.png': up(big, 32), 'favicon-64.png': up(big, 64) };
  });
  for (const [n, u] of Object.entries(out)) fs.writeFileSync(path.resolve(__dirname, '../icons', n), Buffer.from(u.split(',')[1], 'base64'));
  console.log('icons:', Object.keys(out).join(' ')); await b.close();
})();
