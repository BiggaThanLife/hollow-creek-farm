/* =====================================================================
   HOLLOW CREEK FARM — ART MODULE (procedural pixel art)
   Builds ground tiles, characters, tool icons, item icons, world sprites
   and lights. Everything is pre-rendered once on 'assetsLoaded'.
   Logical pixels are drawn at 2x to match the chunky pack style.
   ===================================================================== */
(() => {
  'use strict';
  const T = 48;
  const OUTLINE = '#2b1a0d';

  /* ------------------------------------------------------------------ */
  /* colour utilities                                                   */
  /* ------------------------------------------------------------------ */
  const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
  const _rgb = Object.create(null);
  function rgb(c) {
    if (Array.isArray(c)) return c;
    let k = _rgb[c]; if (k) return k;
    let h = c.slice(1); if (h.length === 3) h = h.split('').map(x => x + x).join('');
    k = [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16), h.length >= 8 ? parseInt(h.slice(6, 8), 16) : 255];
    return (_rgb[c] = k);
  }
  const hex = (r, g, b) => '#' + [r, g, b].map(v => clamp(Math.round(v), 0, 255).toString(16).padStart(2, '0')).join('');
  function rgb2hsl(r, g, b) {
    r /= 255; g /= 255; b /= 255; const mx = Math.max(r, g, b), mn = Math.min(r, g, b); let h = 0, s = 0; const l = (mx + mn) / 2;
    if (mx !== mn) { const d = mx - mn; s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn); h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; h /= 6; }
    return [h, s, l];
  }
  function hsl2rgb(h, s, l) {
    if (!s) return [l * 255, l * 255, l * 255];
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
    const f = t => { t = ((t % 1) + 1) % 1; return t < 1 / 6 ? p + (q - p) * 6 * t : t < 1 / 2 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p; };
    return [f(h + 1 / 3) * 255, f(h) * 255, f(h - 1 / 3) * 255];
  }
  function hueToward(h, target, amt) { let d = target - h; if (d > 0.5) d -= 1; if (d < -0.5) d += 1; return h + Math.sign(d) * Math.min(Math.abs(d), amt); }
  /** lighten/darken with pixel-art hue shifting (shadows -> cool, highlights -> warm) */
  function shade(c, dl, ds = 0) {
    const [r, g, b] = rgb(c); let [h, s, l] = rgb2hsl(r, g, b);
    if (s > 0.05) h = dl > 0 ? hueToward(h, 55 / 360, dl * 0.12) : hueToward(h, 250 / 360, -dl * 0.1);
    return hex(...hsl2rgb((h + 1) % 1, clamp(s + ds, 0, 1), clamp(l + dl, 0, 1)));
  }
  function ramp(c, n = 4, span = 0.34) { const out = []; for (let i = 0; i < n; i++) { const t = i / (n - 1) - 0.5; out.push(shade(c, t * span, -Math.abs(t) * 0.04)); } return out; }
  const mix = (a, b, t) => { const A = rgb(a), B = rgb(b); return hex(A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t, A[2] + (B[2] - A[2]) * t); };
  const rgbaStr = (c, a) => { const k = rgb(c); return `rgba(${k[0]},${k[1]},${k[2]},${a})`; };

  function rng(seed) { let a = (seed >>> 0) || 1; return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  const hash2 = (x, y) => { let h = (x * 374761393 + y * 668265263) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return (h ^ (h >>> 16)) >>> 0; };
  const strHash = s => { let h = 7; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return h >>> 0; };
  const BAYER = [[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]];

  /* ------------------------------------------------------------------ */
  /* Pix: tiny RGBA buffer painter at logical resolution                 */
  /* ------------------------------------------------------------------ */
  class Pix {
    constructor(w, h) { this.w = w; this.h = h; this.d = new Uint8ClampedArray(w * h * 4); }
    set(x, y, c, alpha) {
      x = Math.floor(x); y = Math.floor(y);
      if (c == null || x < 0 || y < 0 || x >= this.w || y >= this.h) return;
      const k = rgb(c), d = this.d, i = (y * this.w + x) * 4;
      const a = alpha === undefined ? k[3] : alpha * 255;
      if (a >= 255 || d[i + 3] === 0) { d[i] = k[0]; d[i + 1] = k[1]; d[i + 2] = k[2]; d[i + 3] = a >= 255 ? 255 : Math.max(d[i + 3], a); return; }
      const t = a / 255; d[i] += (k[0] - d[i]) * t; d[i + 1] += (k[1] - d[i + 1]) * t; d[i + 2] += (k[2] - d[i + 2]) * t; d[i + 3] = Math.max(d[i + 3], a);
    }
    /** darken/lighten existing pixel (only if opaque) */
    tint(x, y, c, t) { x = Math.floor(x); y = Math.floor(y); if (x < 0 || y < 0 || x >= this.w || y >= this.h) return; const i = (y * this.w + x) * 4; if (!this.d[i + 3]) return; const k = rgb(c), d = this.d; d[i] += (k[0] - d[i]) * t; d[i + 1] += (k[1] - d[i + 1]) * t; d[i + 2] += (k[2] - d[i + 2]) * t; }
    a(x, y) { x = Math.floor(x); y = Math.floor(y); if (x < 0 || y < 0 || x >= this.w || y >= this.h) return 0; return this.d[(y * this.w + x) * 4 + 3]; }
    get(x, y) { const i = (Math.floor(y) * this.w + Math.floor(x)) * 4; return [this.d[i], this.d[i + 1], this.d[i + 2], this.d[i + 3]]; }
    clear(x, y) { x = Math.floor(x); y = Math.floor(y); if (x < 0 || y < 0 || x >= this.w || y >= this.h) return; this.d[(y * this.w + x) * 4 + 3] = 0; }
    rect(x, y, w, h, c, alpha) { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.set(x + i, y + j, c, alpha); return this; }
    hline(x0, x1, y, c) { for (let x = x0; x <= x1; x++) this.set(x, y, c); }
    vline(x, y0, y1, c) { for (let y = y0; y <= y1; y++) this.set(x, y, c); }
    ell(cx, cy, rx, ry, c, alpha) {
      for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
        const nx = (x + 0.5 - cx) / rx, ny = (y + 0.5 - cy) / ry; if (nx * nx + ny * ny <= 1) this.set(x, y, c, alpha);
      }
      return this;
    }
    /** shaded ellipse, light from top-left; cols dark->light; dither 0..1 */
    ball(cx, cy, rx, ry, cols, dither = 0.6, lx = -0.55, ly = -0.65) {
      const lz = Math.sqrt(Math.max(0, 1 - lx * lx - ly * ly)), n = cols.length;
      for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
        const nx = (x + 0.5 - cx) / rx, ny = (y + 0.5 - cy) / ry, d2 = nx * nx + ny * ny; if (d2 > 1) continue;
        const nz = Math.sqrt(1 - d2); let v = nx * lx + ny * ly + nz * lz; // -1..1
        let t = clamp((v + 0.15) / 1.1, 0, 1) * (n - 1) + (BAYER[y & 3][x & 3] / 16 - 0.47) * dither;
        this.set(x, y, cols[clamp(Math.round(t), 0, n - 1)]);
      }
      return this;
    }
    line(x0, y0, x1, y1, c, w = 1) {
      const n = Math.max(1, Math.ceil(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)) * 2));
      for (let i = 0; i <= n; i++) { const t = i / n, x = x0 + (x1 - x0) * t, y = y0 + (y1 - y0) * t; if (w <= 1) this.set(x, y, c); else this.rect(Math.round(x - w / 2), Math.round(y - w / 2), w, w, c); }
      return this;
    }
    poly(pts, c, alpha) {
      let y0 = Infinity, y1 = -Infinity; for (const p of pts) { y0 = Math.min(y0, p[1]); y1 = Math.max(y1, p[1]); }
      for (let y = Math.floor(y0); y <= Math.ceil(y1); y++) {
        const yc = y + 0.5, xs = [];
        for (let i = 0; i < pts.length; i++) { const a = pts[i], b = pts[(i + 1) % pts.length]; if ((a[1] <= yc && b[1] > yc) || (b[1] <= yc && a[1] > yc)) xs.push(a[0] + (yc - a[1]) / (b[1] - a[1]) * (b[0] - a[0])); }
        xs.sort((a, b) => a - b);
        for (let i = 0; i + 1 < xs.length; i += 2) for (let x = Math.ceil(xs[i] - 0.5); x <= Math.floor(xs[i + 1] - 0.5); x++) this.set(x, y, c, alpha);
      }
      return this;
    }
    rows(strs, pal, ox = 0, oy = 0) { strs.forEach((s, y) => { for (let x = 0; x < s.length; x++) { const c = pal[s[x]]; if (c) this.set(ox + x, oy + y, c); } }); return this; }
    /** random speckles on opaque pixels inside a rect */
    speck(x, y, w, h, cols, n, r, onlyOpaque = true) { for (let i = 0; i < n; i++) { const px = x + Math.floor(r() * w), py = y + Math.floor(r() * h); if (!onlyOpaque || this.a(px, py)) this.set(px, py, cols[Math.floor(r() * cols.length)]); } }
    /** auto outline: transparent pixels next to opaque get a dark colour derived from the neighbour */
    outline(col = 'auto', diag = false, thr = 100) {
      const w = this.w, h = this.h, d = this.d, add = [];
      const O = rgb(OUTLINE);
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        if (d[(y * w + x) * 4 + 3] > 20) continue;
        let n = -1;
        const nb = diag ? [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]] : [[1, 0], [-1, 0], [0, 1], [0, -1]];
        for (const [dx, dy] of nb) { const X = x + dx, Y = y + dy; if (X < 0 || Y < 0 || X >= w || Y >= h) continue; const j = (Y * w + X) * 4; if (d[j + 3] > thr) { n = j; break; } }
        if (n < 0) continue;
        if (col === 'auto') add.push([x, y, [d[n] * 0.28 + O[0] * 0.72, d[n + 1] * 0.28 + O[1] * 0.72, d[n + 2] * 0.28 + O[2] * 0.72, 255]]);
        else add.push([x, y, rgb(col)]);
      }
      for (const [x, y, c] of add) this.set(x, y, c);
      return this;
    }
    flipX() { const o = new Pix(this.w, this.h); for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) { const i = (y * this.w + x) * 4, j = (y * this.w + (this.w - 1 - x)) * 4; for (let k = 0; k < 4; k++) o.d[j + k] = this.d[i + k]; } return o; }
    rot90() { // clockwise, square only
      const o = new Pix(this.h, this.w); for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) { const i = (y * this.w + x) * 4; const nx = this.h - 1 - y, ny = x; const j = (ny * o.w + nx) * 4; for (let k = 0; k < 4; k++) o.d[j + k] = this.d[i + k]; } return o;
    }
    blit(src, ox, oy) { for (let y = 0; y < src.h; y++) for (let x = 0; x < src.w; x++) { const i = (y * src.w + x) * 4; if (src.d[i + 3]) this.set(ox + x, oy + y, [src.d[i], src.d[i + 1], src.d[i + 2], src.d[i + 3]]); } return this; }
    toCanvas(scale = 2) {
      const small = G.makeCanvas(this.w, this.h), sx = small.getContext('2d');
      const id = sx.createImageData(this.w, this.h); id.data.set(this.d); sx.putImageData(id, 0, 0);
      if (scale === 1) return small;
      const c = G.makeCanvas(this.w * scale, this.h * scale), x = c.getContext('2d'); x.imageSmoothingEnabled = false;
      x.drawImage(small, 0, 0, c.width, c.height); return c;
    }
  }
  const mk = (w, h, fn, scale = 2, outline = 'auto', diag = false) => { const P = new Pix(w, h); fn(P); if (outline) P.outline(outline, diag); return P.toCanvas(scale); };

  /* tiny pixel font for signs */
  const FONT = {
    S: ['111', '100', '111', '001', '111'], H: ['101', '101', '111', '101', '101'], O: ['111', '101', '101', '101', '111'], P: ['111', '101', '111', '100', '100'],
    T: ['111', '010', '010', '010', '010'], R: ['110', '101', '110', '101', '101'], E: ['111', '100', '110', '100', '111'], I: ['111', '010', '010', '010', '111'],
    N: ['1001', '1101', '1011', '1001', '1001'], F: ['111', '100', '110', '100', '100'], G: ['111', '100', '101', '101', '111'], A: ['010', '101', '111', '101', '101'],
    M: ['10001', '11011', '10101', '10001', '10001'], W: ['10001', '10001', '10101', '11011', '10001'], D: ['110', '101', '101', '101', '110'], L: ['100', '100', '100', '100', '111'],
    ' ': ['0', '0', '0', '0', '0'],
  };
  function text(P, str, x, y, c, shadowC) {
    let cx = x;
    for (const ch of str) { const g = FONT[ch] || FONT[' ']; g.forEach((row, j) => { for (let i = 0; i < row.length; i++) if (row[i] === '1') { if (shadowC) P.set(cx + i + 1, y + j + 1, shadowC); P.set(cx + i, y + j, c); } }); cx += g[0].length + 1; }
    return cx - x - 1;
  }
  const textW = str => { let w = 0; for (const ch of str) w += (FONT[ch] || FONT[' '])[0].length + 1; return w - 1; };

  /* ------------------------------------------------------------------ */
  /* palettes                                                           */
  /* ------------------------------------------------------------------ */
  const GRASS = [
    ['#3a722c', '#4a8a34', '#5d9f3d', '#76b84b', '#97cf61'],   // spring
    ['#2f6427', '#3d782d', '#4e8c35', '#64a240', '#80b851'],   // summer
    ['#5a4620', '#6f5726', '#876a2c', '#a07c36', '#bb944a'],   // fall olive-orange
    ['#93a6c2', '#b3c4d9', '#cfdcea', '#e6eef7', '#ffffff'],   // winter
  ];
  const DIRT = ['#6a4529', '#845a36', '#9f7146', '#b98a58', '#cfa36f'];
  const SAND = ['#b8955b', '#d0ad6f', '#e2c387', '#eed59c', '#f8e7bb'];
  const STONE = ['#4e463d', '#6f665a', '#8c8373', '#a99f8c', '#c6bda7'];
  const WATER = ['#22528f', '#2c66aa', '#3579bf', '#4d92d2', '#82c0ea', '#d4f1fb'];
  const WOOD = ['#4f2f18', '#6e4324', '#8c5a31', '#a8713f', '#c38b53'];
  const CLIFF = ['#3a2e26', '#514036', '#6a5646', '#86705a', '#a28a70'];
  const MFLOOR = ['#3e3229', '#504034', '#62503f', '#76624d', '#8d775e'];
  const MWALL = ['#1c1613', '#2a211c', '#3b2f27', '#504034', '#6a5644'];
  const TIER = [
    ['#2f2c2b', '#55504b', '#7f7871', '#a8a097', '#cec7bd'],
    ['#4a1f10', '#8a3f1c', '#c4652e', '#e8935a', '#f8c79a'],
    ['#26324a', '#55698a', '#8ea4c2', '#c8d8ea', '#ffffff'],
    ['#5a3505', '#a8700f', '#e0a826', '#f6d65a', '#fff6c0'],
    ['#2d0f45', '#62238a', '#a347c4', '#d986ec', '#f8d0ff'],
  ];
  const season = () => (G.state && G.state.season) || 0;

  /* ================================================================== */
  /* GROUND TILES                                                       */
  /* ================================================================== */
  const GT = {};       // cache: key -> canvas
  const gtile = (key, fn) => GT[key] || (GT[key] = fn());
  const tile24 = (seed, fn) => { const P = new Pix(24, 24); fn(P, rng(seed)); return P; };

  function tuft(P, x, y, g) { P.set(x, y + 1, g[1]); P.set(x, y, g[3]); P.set(x - 1, y + 1, g[1]); P.set(x + 1, y, g[3]); P.set(x + 1, y + 1, g[2]); P.set(x, y - 1, g[4]); }
  function blotches(P, r, cols, n, rmin, rmax) {
    for (let i = 0; i < n; i++) {
      const cx = r() * 24, cy = r() * 24, rad = rmin + r() * (rmax - rmin), c = cols[Math.floor(r() * cols.length)];
      for (let dy = -rad; dy <= rad; dy++) for (let dx = -rad; dx <= rad; dx++) {
        if (dx * dx + dy * dy > rad * rad) continue; const x = ((Math.floor(cx + dx) % 24) + 24) % 24, y = ((Math.floor(cy + dy) % 24) + 24) % 24;
        if (dx * dx + dy * dy > (rad - 1) * (rad - 1) && (x + y) & 1) continue; P.set(x, y, c);
      }
    }
  }
  function grassPix(s, v, dense) {
    const g = GRASS[s];
    return tile24(1000 + v * 17 + s * 101 + (dense ? 7 : 0), (P, r) => {
      P.rect(0, 0, 24, 24, g[2]);
      blotches(P, r, [g[1], g[3]], dense ? 7 : 5, 2, 4.5);
      if (s === 3) { // snow: soft blue shading + grass poking out
        blotches(P, r, [g[1], g[3], g[4]], 6, 1.5, 3);
        const gg = GRASS[1];
        for (let i = 0; i < (dense ? 6 : 3); i++) { const x = 1 + Math.floor(r() * 22), y = 2 + Math.floor(r() * 20); P.set(x, y, gg[1]); P.set(x, y - 1, gg[3]); P.set(x + 1, y, gg[0]); P.set(x, y + 1, g[0]); }
        for (let i = 0; i < 4; i++) P.set(Math.floor(r() * 24), Math.floor(r() * 24), '#ffffff');
        return;
      }
      const n = dense ? 16 : 9;
      for (let i = 0; i < n; i++) tuft(P, 1 + Math.floor(r() * 22), 1 + Math.floor(r() * 22), g);
      for (let i = 0; i < 18; i++) P.set(Math.floor(r() * 24), Math.floor(r() * 24), r() < 0.5 ? g[1] : g[3]);
      if (dense) for (let i = 0; i < 3; i++) { // taller clumps
        const x = 3 + Math.floor(r() * 18), y = 4 + Math.floor(r() * 16);
        P.set(x, y, g[4]); P.set(x, y + 1, g[3]); P.set(x - 1, y + 1, g[3]); P.set(x + 1, y + 1, g[3]); P.set(x - 1, y + 2, g[1]); P.set(x, y + 2, g[1]); P.set(x + 1, y + 2, g[1]); P.set(x - 2, y + 1, g[4]); P.set(x + 2, y, g[4]);
      }
      // seasonal sprinkles
      if (s === 0 && r() < 0.22) for (let i = 0, k = 1; i < k; i++) {
        const x = 2 + Math.floor(r() * 20), y = 2 + Math.floor(r() * 20), pc = ['#ffffff', '#f7d84a', '#f4a6c8', '#c9b7f5'][Math.floor(r() * 4)];
        P.set(x, y - 1, pc); P.set(x - 1, y, pc); P.set(x + 1, y, pc); P.set(x, y + 1, pc); P.set(x, y, '#f2b33a'); P.set(x, y + 2, g[0]);
      }
      if (s === 1 && r() < 0.12) { const x = 2 + Math.floor(r() * 20), y = 2 + Math.floor(r() * 20); P.set(x, y, '#f6e05a'); P.set(x + 1, y + 1, g[0]); }
      if (s === 2) for (let i = 0, k = Math.floor(r() * 4); i < k; i++) { const x = Math.floor(r() * 23), y = Math.floor(r() * 23), lc = ['#d8642a', '#b8401f', '#e8a032', '#9a5a24'][Math.floor(r() * 4)]; P.set(x, y, lc); P.set(x + 1, y, lc); P.set(x + 1, y + 1, shade(lc, -0.15)); }
    });
  }
  const grassTile = (s, v, dense) => gtile(`g${s}_${v}_${dense ? 1 : 0}`, () => grassPix(s, v, dense).toCanvas(2));

  function dirtPix(v) {
    return tile24(2000 + v, (P, r) => {
      P.rect(0, 0, 24, 24, DIRT[2]);
      blotches(P, r, [DIRT[1], DIRT[3]], 5, 2, 4);
      for (let i = 0; i < 26; i++) P.set(Math.floor(r() * 24), Math.floor(r() * 24), r() < 0.55 ? DIRT[1] : DIRT[3]);
      for (let i = 0; i < 4; i++) { const x = 1 + Math.floor(r() * 22), y = 1 + Math.floor(r() * 22); P.set(x, y, DIRT[4]); P.set(x + 1, y, DIRT[3]); P.set(x, y + 1, DIRT[0]); P.set(x + 1, y + 1, DIRT[1]); }
    });
  }
  function sandPix(v) {
    return tile24(3000 + v, (P, r) => {
      P.rect(0, 0, 24, 24, SAND[2]);
      blotches(P, r, [SAND[1], SAND[3]], 4, 2, 4);
      for (let i = 0; i < 30; i++) P.set(Math.floor(r() * 24), Math.floor(r() * 24), [SAND[1], SAND[3], SAND[4]][Math.floor(r() * 3)]);
      for (let i = 0; i < 2; i++) { const x = Math.floor(r() * 18), y = 3 + Math.floor(r() * 18); for (let k = 0; k < 5; k++) P.set(x + k, y + (k === 2 ? -1 : 0), SAND[1]); }
      if (r() < 0.4) { const x = 3 + Math.floor(r() * 18), y = 3 + Math.floor(r() * 18); P.set(x, y, '#f6efe0'); P.set(x + 1, y, '#e8b8a0'); P.set(x, y + 1, '#c99a80'); } // shell
    });
  }
  function cobblePix(v) {
    return tile24(4000 + v, (P, r) => {
      P.rect(0, 0, 24, 24, '#5e5446');
      for (let i = 0; i < 40; i++) P.set(Math.floor(r() * 24), Math.floor(r() * 24), '#6b604f');
      // offset rows of rounded stones
      const rowsY = [0, 8, 16];
      rowsY.forEach((ry, ri) => {
        let x = -((ri * 5 + v * 3) % 8);
        while (x < 24) {
          const w = 6 + Math.floor(r() * 4), h = 7;
          const base = STONE[1 + Math.floor(r() * 3)];
          const cols = ramp(base, 4, 0.3);
          for (let yy = 0; yy < h - 1; yy++) for (let xx = 0; xx < w - 1; xx++) {
            const corner = (xx === 0 || xx === w - 2) && (yy === 0 || yy === h - 2); if (corner) continue;
            const px = ((x + xx) % 24 + 24) % 24, py = ry + yy + 1;
            let c = cols[2]; if (yy === 0 || xx === 0) c = cols[3]; if (yy === h - 2 || xx === w - 2) c = cols[1];
            if (yy === 1 && xx === 1) c = cols[3];
            P.set(px, py, c);
          }
          if (r() < 0.5) P.set(((x + 2 + Math.floor(r() * (w - 4))) % 24 + 24) % 24, ry + 3 + Math.floor(r() * 2), cols[1]);
          x += w;
        }
      });
    });
  }
  function floorPix(v) {
    return tile24(5000 + v, (P, r) => {
      for (let row = 0; row < 4; row++) {
        const y0 = row * 6, base = [WOOD[2], WOOD[3], WOOD[2], shade(WOOD[3], -0.03)][(row + v) % 4];
        P.rect(0, y0, 24, 6, base);
        P.hline(0, 23, y0, shade(base, 0.07)); P.hline(0, 23, y0 + 5, WOOD[0]);
        for (let i = 0; i < 4; i++) { const gx = Math.floor(r() * 20), gy = y0 + 2 + Math.floor(r() * 2); for (let k = 0; k < 3 + Math.floor(r() * 4); k++) P.set(gx + k, gy, shade(base, -0.06)); }
        const seam = (row * 9 + v * 7 + 4) % 24; P.vline(seam, y0, y0 + 4, WOOD[0]); P.set(seam + 1, y0 + 1, shade(base, 0.08));
        P.set((seam + 2) % 24, y0 + 2, WOOD[1]); P.set((seam + 21) % 24, y0 + 2, WOOD[1]); // nails
      }
    });
  }
  function wallFacePix(v, cap) {
    return tile24(6000 + v, (P, r) => {
      const wp = '#ecd5a6', wp2 = '#d6b47e', wp3 = '#c9a571';
      P.rect(0, 0, 24, 24, wp);
      for (let x = 0; x < 24; x += 6) { P.vline(x + 2, 0, 17, wp2); P.vline(x + 3, 0, 17, wp2); }
      for (let x = 0; x < 24; x += 6) for (let y = 2; y < 17; y += 5) { P.set(x + 5, y, '#c86f52'); P.set(x + 5, y + 1, '#9a4a3a'); }
      if (cap) { P.rect(0, 0, 24, 3, '#6a4124'); P.hline(0, 23, 0, '#8d5a33'); P.hline(0, 23, 3, wp3); }
      P.rect(0, 18, 24, 6, '#7a4a28'); P.hline(0, 23, 18, '#a46a3a'); P.hline(0, 23, 19, '#8d5a33'); P.hline(0, 23, 23, '#4f2e17');
      P.hline(0, 23, 17, wp3);
      if (v === 1) { P.vline(11, 19, 22, '#5e381e'); }
    });
  }
  function wallUpperPix(v) {
    return tile24(6050 + v, (P, r) => {
      const wp = '#ecd5a6';
      P.rect(0, 0, 24, 24, wp);
      for (let x = 0; x < 24; x += 6) { P.vline(x + 2, 7, 23, '#d6b47e'); P.vline(x + 3, 7, 23, '#d6b47e'); }
      for (let x = 0; x < 24; x += 6) for (let y = 12; y < 24; y += 5) { P.set(x + 5, y, '#c86f52'); P.set(x + 5, y + 1, '#9a4a3a'); }
      P.rect(0, 0, 24, 4, '#4a2e1a'); P.hline(0, 23, 4, '#8d5a33'); P.hline(0, 23, 5, '#6a4124'); P.hline(0, 23, 6, '#c9a571');
      if (v === 1 && false) { P.rect(8, 10, 8, 9, '#8a5a33'); P.rect(9, 11, 6, 7, '#9cc8ec'); P.rect(9, 11, 6, 2, '#d8f0ff'); P.vline(12, 11, 17, '#8a5a33'); } // small picture/window
    });
  }
  function wallTopPix(v) {
    return tile24(6100 + v, (P, r) => {
      P.rect(0, 0, 24, 24, '#3b2414');
      P.rect(1, 1, 22, 22, '#4a2e1a');
      for (let i = 0; i < 20; i++) P.set(1 + Math.floor(r() * 22), 1 + Math.floor(r() * 22), '#553520');
    });
  }
  function rockFace(P, r, pal, grassTop) {
    P.rect(0, 0, 24, 24, pal[0]);
    // packed rounded boulders, wrapped horizontally so tiles join
    const rowsY = [3, 9, 15, 21];
    rowsY.forEach((cy, ri) => {
      let x = -Math.floor(r() * 5) - 2;
      while (x < 26) {
        const rx = 3 + r() * 2.5, ry = 3 + r() * 1.2, cx = x + rx;
        const cols = [pal[1], pal[2], pal[3], pal[4]].map((c, i) => ri > 2 ? shade(c, -0.05) : c);
        for (const off of [-24, 0, 24]) {
          const lx = -0.55, ly = -0.7, lz = Math.sqrt(1 - lx * lx - ly * ly);
          for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) for (let xx = Math.floor(cx - rx); xx <= Math.ceil(cx + rx); xx++) {
            const nx = (xx + 0.5 - cx) / rx, ny = (y + 0.5 - cy) / ry, d2 = nx * nx + ny * ny; if (d2 > 1) continue;
            const v = nx * lx + ny * ly + Math.sqrt(1 - d2) * lz; const t = clamp((v + 0.1) / 1.05, 0, 1) * 3 + (BAYER[y & 3][xx & 3] / 16 - 0.47) * 0.8;
            P.set(xx + off, y, cols[clamp(Math.round(t), 0, 3)]);
          }
        }
        if (r() < 0.5) P.set(cx + 1, cy + 1, pal[1]);
        x += rx * 2 + 0.5;
      }
    });
    return rockFaceFinish(P, r, pal, grassTop);
  }
  function rockFaceFinish(P, r, pal, grassTop) {
    for (let yy = 14; yy < 24; yy++) for (let x = 0; x < 24; x++) P.tint(x, yy, '#140c08', (yy - 13) * 0.035);
    if (grassTop) {
      const g = GRASS[season.cur];
      for (let x = 0; x < 24; x++) { const d = 2 + ((hash2(x, 3) % 3) === 0 ? 1 : 0) + (x % 7 === 3 ? 2 : 0); for (let yy = 0; yy < d; yy++) P.set(x, yy, yy === 0 ? g[3] : g[2]); P.set(x, d, g[0]); P.set(x, d + 1, '#140c08', 0.3); }
    } else { P.hline(0, 23, 0, pal[4]); P.hline(0, 23, 1, pal[3]); }
  }
  season.cur = 0;
  function cliffFacePix(s, v) { season.cur = s; return tile24(7000 + v, (P, r) => rockFace(P, r, CLIFF, true)); }
  function cliffTopPix(s, v) {
    const g = GRASS[s];
    return tile24(7100 + v + s * 13, (P, r) => {
      P.rect(0, 0, 24, 24, shade(g[2], -0.06));
      blotches(P, r, [g[1], shade(g[3], -0.05)], 5, 2, 4);
      for (let i = 0; i < 8; i++) tuft(P, 1 + Math.floor(r() * 22), 1 + Math.floor(r() * 22), g.map(c => shade(c, -0.05)));
      if (r() < 0.5) { const x = 4 + Math.floor(r() * 16), y = 4 + Math.floor(r() * 16); P.ell(x + 0.5, y + 2, 3, 1.2, '#000', 0.2); P.ball(x, y, 3, 2.4, ['#5e574e', '#7f776b', '#a39a8a', '#c2b9a6'], 0.4); }
    });
  }
  function mineFloorPix(v) {
    return tile24(8000 + v, (P, r) => {
      P.rect(0, 0, 24, 24, MFLOOR[2]);
      blotches(P, r, [MFLOOR[1], MFLOOR[3]], 6, 2, 4);
      for (let i = 0; i < 30; i++) P.set(Math.floor(r() * 24), Math.floor(r() * 24), r() < 0.5 ? MFLOOR[1] : MFLOOR[3]);
      for (let i = 0; i < 3; i++) { const x = 2 + Math.floor(r() * 20), y = 2 + Math.floor(r() * 20); P.set(x, y, MFLOOR[4]); P.set(x + 1, y, MFLOOR[3]); P.set(x, y + 1, MFLOOR[0]); P.set(x + 1, y + 1, MFLOOR[0]); }
      if (r() < 0.5) { let x = Math.floor(r() * 20), y = Math.floor(r() * 20); for (let k = 0; k < 6; k++) { P.set(x, y, MFLOOR[0]); x += 1; y += r() < 0.5 ? 1 : 0; } }
    });
  }
  function mineFacePix(v) { return tile24(8100 + v, (P, r) => rockFace(P, r, MWALL, false)); }
  function mineTopPix(v) {
    return tile24(8200 + v, (P, r) => {
      P.rect(0, 0, 24, 24, '#16110e');
      for (let i = 0; i < 40; i++) P.set(Math.floor(r() * 24), Math.floor(r() * 24), r() < 0.6 ? '#211a15' : '#2c231c');
      for (let i = 0; i < 3; i++) { const x = 2 + Math.floor(r() * 20), y = 2 + Math.floor(r() * 20); P.set(x, y, '#3b2f27'); P.set(x + 1, y, '#2c231c'); }
    });
  }

  /* --- overlays: grass fringe onto lower terrains (per season, per side) --- */
  function orientSet(P, side, u, v, c, a) {
    if (side === 'n') P.set(u, v, c, a); else if (side === 's') P.set(u, 23 - v, c, a); else if (side === 'w') P.set(v, u, c, a); else P.set(23 - v, u, c, a);
  }
  function grassFringe(s, side) {
    return gtile(`gf${s}${side}`, () => {
      const g = GRASS[s], P = new Pix(24, 24);
      for (let u = 0; u < 24; u++) {
        const d = 2 + ((hash2(u, 11) % 3)) + (u % 6 === 2 ? 1 : 0) - (u % 9 === 5 ? 1 : 0);
        for (let v = 0; v < d; v++) orientSet(P, side, u, v, v === d - 1 ? g[1] : (v === 0 && side === 'n' ? g[2] : g[2]));
        orientSet(P, side, u, d, g[0]);
        orientSet(P, side, u, d + 1, '#000000', 0.16);
        if (hash2(u, 5) % 5 === 0) orientSet(P, side, u, d, g[3]);
      }
      return P.toCanvas(2);
    });
  }
  function grassCorner(s, corner) { // corner: 'nw','ne','sw','se' — diagonal grass only
    return gtile(`gc${s}${corner}`, () => {
      const g = GRASS[s], P = new Pix(24, 24);
      for (let y = 0; y < 5; y++) for (let x = 0; x < 5; x++) {
        const d = Math.hypot(x, y); if (d > 4.2) continue;
        const X = corner[1] === 'w' ? x : 23 - x, Y = corner[0] === 'n' ? y : 23 - y;
        P.set(X, Y, d > 3.2 ? g[0] : g[2]);
      }
      return P.toCanvas(2);
    });
  }
  const shadowBand = () => gtile('shadowN', () => { const c = G.makeCanvas(48, 48), x = c.getContext('2d'); for (let i = 0; i < 10; i++) { x.fillStyle = `rgba(20,10,5,${0.32 * (1 - i / 10)})`; x.fillRect(0, i * 2, 48, 2); } return c; });
  const shadowSide = (side) => gtile('shadow' + side, () => { const c = G.makeCanvas(48, 48), x = c.getContext('2d'); for (let i = 0; i < 4; i++) { x.fillStyle = `rgba(20,10,5,${0.22 * (1 - i / 4)})`; x.fillRect(side === 'w' ? i * 2 : 46 - i * 2, 0, 2, 48); } return c; });

  /* --- water --- */
  const WFRAMES = 8;
  function waterFrame(v, f) {
    return gtile(`w${v}_${f}`, () => {
      const r = rng(9000 + v), P = new Pix(24, 24);
      P.rect(0, 0, 24, 24, WATER[2]);
      // static darker wave bands (periodic)
      for (let y = 0; y < 24; y++) for (let x = 0; x < 24; x++) {
        const w = Math.sin((x / 24) * Math.PI * 2 * 2 + Math.floor(y / 3) * 1.7 + v * 2) * Math.sin((y / 24) * Math.PI * 2 * 3 + v);
        if (y % 3 === 0 && w > 0.55) P.set(x, y, WATER[1]); else if (y % 3 === 1 && w < -0.7) P.set(x, y, WATER[3]);
      }
      // moving shimmer dashes
      const n = 6;
      for (let i = 0; i < n; i++) {
        const bx = Math.floor(r() * 24), by = Math.floor(r() * 24), ph = Math.floor(r() * WFRAMES);
        const st = (f + ph) % WFRAMES; if (st > 4) continue;
        const len = [1, 2, 3, 2, 1][st], col = st === 2 ? WATER[5] : WATER[4];
        const x0 = bx + st;
        for (let k = 0; k < len; k++) P.set((x0 + k) % 24, by, col);
        if (st >= 1 && st <= 3) P.set((x0 + len) % 24, by + 1, WATER[3]);
      }
      return P.toCanvas(2);
    });
  }
  const LANDCOL = { grass: null, sand: SAND, dirt: DIRT, rock: CLIFF, wood: WOOD, mine: MFLOOR };
  function landGroup(c) {
    if (c === 'g' || c === 'G') return 'grass';
    if (c === 's') return 'sand';
    if (c === 'd' || c === 'p' || c === 'f') return 'dirt';
    if (c === 'c' || c === 'M' || c === 'W') return 'rock';
    if (c === 'm') return 'mine';
    return 'dirt';
  }
  function shoreOverlay(side, grp, s, f) {
    return gtile(`sh${side}${grp}${grp === 'grass' ? s : ''}${f}`, () => {
      const L = grp === 'grass' ? GRASS[s] : LANDCOL[grp];
      const P = new Pix(24, 24);
      for (let u = 0; u < 24; u++) {
        const wob = ((hash2(u, side.charCodeAt(0)) % 3) === 0 ? 1 : 0);
        let v = 0;
        const lip = (side === 'n' ? 2 : 1) + wob;
        for (let k = 0; k < lip; k++) orientSet(P, side, u, v++, k === lip - 1 ? L[3] : L[2]);
        if (side === 'n') { orientSet(P, side, u, v++, '#6a4a30'); orientSet(P, side, u, v++, '#5a3e28'); orientSet(P, side, u, v++, (u % 5 === 1) ? '#5a3e28' : '#45301f'); orientSet(P, side, u, v++, WATER[0]); }
        else { orientSet(P, side, u, v++, grp === 'grass' ? '#6a5a3a' : shade(L[1], -0.1)); }
        // foam
        const foamOn = ((u + f * 2) % 5) < 3;
        orientSet(P, side, u, v, foamOn ? WATER[5] : WATER[4]);
        if ((u + f) % 4 === 0) orientSet(P, side, u, v + 1, WATER[4]);
        orientSet(P, side, u, v + 2, WATER[1], 0.5);
      }
      return P.toCanvas(2);
    });
  }
  function shoreCorner(corner, grp, s, f) {
    return gtile(`shc${corner}${grp}${grp === 'grass' ? s : ''}${f}`, () => {
      const L = grp === 'grass' ? GRASS[s] : LANDCOL[grp];
      const P = new Pix(24, 24);
      for (let y = 0; y < 7; y++) for (let x = 0; x < 7; x++) {
        const d = Math.hypot(x, y); const X = corner[1] === 'w' ? x : 23 - x, Y = corner[0] === 'n' ? y : 23 - y;
        if (d <= 2.6) P.set(X, Y, L[2]); else if (d <= 3.4) P.set(X, Y, corner[0] === 'n' ? '#45301f' : L[3]); else if (d <= 4.5) P.set(X, Y, (f + x) % 2 ? WATER[5] : WATER[4]);
      }
      return P.toCanvas(2);
    });
  }
  function bridgePix(orient, v, railA = true, railB = true) { // orient 'v' (runs N-S) or 'h' (runs E-W)
    const P = tile24(9500 + v, (P, r) => {
      for (let i = 0; i < 6; i++) {
        const base = [WOOD[3], WOOD[2], shade(WOOD[3], 0.03), WOOD[2]][(i + v) % 4];
        P.rect(0, i * 4, 24, 4, base); P.hline(0, 23, i * 4, shade(base, 0.08)); P.hline(0, 23, i * 4 + 3, WOOD[0]);
        P.set(3, i * 4 + 1, WOOD[0]); P.set(20, i * 4 + 1, WOOD[0]);
        for (let k = 0; k < 2; k++) { const gx = 5 + Math.floor(r() * 12); P.hline(gx, gx + 3, i * 4 + 2, shade(base, -0.06)); }
      }
      // rails at the sides
      if (railA) { P.rect(0, 0, 2, 24, WOOD[1]); P.vline(0, 0, 23, WOOD[0]); P.vline(1, 0, 23, WOOD[3]); [2, 13].forEach(y => P.rect(0, y, 2, 3, WOOD[4])); }
      if (railB) { P.rect(22, 0, 2, 24, WOOD[1]); P.vline(23, 0, 23, WOOD[0]); P.vline(22, 0, 23, WOOD[2]); [2, 13].forEach(y => P.rect(22, y, 2, 3, WOOD[3])); }
    });
    return orient === 'v' ? P : P.rot90();
  }

  const isGrass = c => c === 'g' || c === 'G';
  const isWater = c => c === 'w';
  const WALLISH = { c: 1, M: 1, W: 1 };

  function resolveX(map, tx, ty) { // invisible solid: draw like neighbouring ground
    const rowU = map.ground[ty - 1], rowD = map.ground[ty + 1], row = map.ground[ty];
    const cands = [row && row[tx - 1], row && row[tx + 1], rowU && rowU[tx], rowD && rowD[tx]];
    for (const c of cands) if (c && c !== 'X' && c !== 'v') return c;
    return 'g';
  }

  function drawGround(ctx, map, ch, tx, ty, sx, sy, now) {
    if (ch === 'X') ch = resolveX(map, tx, ty);
    const h = hash2(tx, ty), s = season();
    const gr = map.ground;
    const at = (x, y) => { const r = gr[y]; if (!r) return null; const c = r[x]; return c === undefined ? null : (c === 'X' ? resolveX(map, x, y) : c); };
    const N = at(tx, ty - 1), S = at(tx, ty + 1), W = at(tx - 1, ty), E = at(tx + 1, ty);
    let img;
    switch (ch) {
      case 'g': case 'G': img = grassTile(s, h % 6, ch === 'G' || (h % 13 === 0)); break;
      case 'd': img = gtile('d' + (h % 6), () => dirtPix(h % 6).toCanvas(2)); break;
      case 'p': img = gtile('p' + (h % 4), () => cobblePix(h % 4).toCanvas(2)); break;
      case 's': img = gtile('s' + (h % 5), () => sandPix(h % 5).toCanvas(2)); break;
      case 'f': img = gtile('f' + (h % 4), () => floorPix(h % 4).toCanvas(2)); break;
      case 'W': {
        const face = S !== null && S !== 'W';
        const SS = at(tx, ty + 2), upper = !face && S === 'W' && SS !== null && SS !== 'W' && SS !== 'v';
        const cap = N !== 'W';
        img = face ? gtile('wf' + (h % 2) + (cap ? 'c' : ''), () => wallFacePix(h % 2, cap).toCanvas(2)) : upper ? gtile('wu' + (h % 2), () => wallUpperPix(h % 2).toCanvas(2)) : gtile('wt' + (h % 3), () => wallTopPix(h % 3).toCanvas(2));
        ctx.drawImage(img, sx, sy); return;
      }
      case 'c': {
        const face = S !== null && S !== 'c' && S !== 'v';
        img = face ? gtile(`cf${s}_${h % 4}`, () => cliffFacePix(s, h % 4).toCanvas(2)) : gtile(`ct${s}_${h % 4}`, () => cliffTopPix(s, h % 4).toCanvas(2));
        ctx.drawImage(img, sx, sy);
        if (!face) { // side faces where the top meets lower ground
          if (W !== null && W !== 'c' && W !== 'v') ctx.drawImage(gtile('cside_w', () => cliffSide('w', CLIFF)), sx, sy);
          if (E !== null && E !== 'c' && E !== 'v') ctx.drawImage(gtile('cside_e', () => cliffSide('e', CLIFF)), sx, sy);
          if (N !== null && N !== 'c' && N !== 'v') ctx.drawImage(gtile('cside_n', () => cliffSide('n', CLIFF)), sx, sy);
        }
        return;
      }
      case 'm': img = gtile('m' + (h % 6), () => mineFloorPix(h % 6).toCanvas(2)); break;
      case 'M': {
        const face = S !== null && S !== 'M' && S !== 'v';
        img = face ? gtile('mf' + (h % 4), () => mineFacePix(h % 4).toCanvas(2)) : gtile('mt' + (h % 3), () => mineTopPix(h % 3).toCanvas(2));
        ctx.drawImage(img, sx, sy);
        if (!face) {
          if (W === 'm') ctx.drawImage(gtile('mside_w', () => cliffSide('w', MWALL)), sx, sy);
          if (E === 'm') ctx.drawImage(gtile('mside_e', () => cliffSide('e', MWALL)), sx, sy);
          if (N === 'm') ctx.drawImage(gtile('mside_n', () => cliffSide('n', MWALL)), sx, sy);
        }
        return;
      }
      case 'w': {
        const f = (Math.floor(now * 5) + (h % 3)) % WFRAMES;
        ctx.drawImage(waterFrame(h % 3, f), sx, sy);
        const ff = Math.floor(now * 2 + (tx + ty) * 0.5) % 2;
        const land = c => c !== null && c !== 'w' && c !== 'b' && c !== 'v';
        if (land(N)) ctx.drawImage(shoreOverlay('n', landGroup(N), s, ff), sx, sy);
        if (land(S)) ctx.drawImage(shoreOverlay('s', landGroup(S), s, ff), sx, sy);
        if (land(W)) ctx.drawImage(shoreOverlay('w', landGroup(W), s, ff), sx, sy);
        if (land(E)) ctx.drawImage(shoreOverlay('e', landGroup(E), s, ff), sx, sy);
        if (N === 'b' || S === 'b' || W === 'b' || E === 'b') { /* shadow under bridge */ if (N === 'b') ctx.drawImage(shadowBand(), sx, sy); }
        const NW = at(tx - 1, ty - 1), NE = at(tx + 1, ty - 1), SW = at(tx - 1, ty + 1), SE = at(tx + 1, ty + 1);
        if (!land(N) && !land(W) && land(NW)) ctx.drawImage(shoreCorner('nw', landGroup(NW), s, ff), sx, sy);
        if (!land(N) && !land(E) && land(NE)) ctx.drawImage(shoreCorner('ne', landGroup(NE), s, ff), sx, sy);
        if (!land(S) && !land(W) && land(SW)) ctx.drawImage(shoreCorner('sw', landGroup(SW), s, ff), sx, sy);
        if (!land(S) && !land(E) && land(SE)) ctx.drawImage(shoreCorner('se', landGroup(SE), s, ff), sx, sy);
        return;
      }
      case 'b': {
        const vert = (W === 'w' || E === 'w') || !(N === 'w' || S === 'w');
        if (W === 'w' || E === 'w' || N === 'w' || S === 'w') ctx.drawImage(waterFrame(h % 3, (Math.floor(now * 5) + (h % 3)) % WFRAMES), sx, sy);
        const ra = vert ? W !== 'b' : S !== 'b', rb = vert ? E !== 'b' : N !== 'b'; // rot90 maps left rail->top
        img = gtile('b' + (vert ? 'v' : 'h') + (h % 2) + (ra ? 1 : 0) + (rb ? 1 : 0), () => bridgePix(vert ? 'v' : 'h', h % 2, vert ? ra : rb, vert ? rb : ra).toCanvas(2));
        ctx.drawImage(img, sx, sy); return;
      }
      case 'v': ctx.fillStyle = '#000'; ctx.fillRect(sx, sy, T, T); return;
      default: G.drawGroundFallback(ctx, ch, sx, sy); return;
    }
    ctx.drawImage(img, sx, sy);
    // grass fringes creep over lower terrains
    if (ch === 'd' || ch === 'p' || ch === 's') {
      const gN = isGrass(N), gS = isGrass(S), gW = isGrass(W), gE = isGrass(E);
      if (gN) ctx.drawImage(grassFringe(s, 'n'), sx, sy);
      if (gS) ctx.drawImage(grassFringe(s, 's'), sx, sy);
      if (gW) ctx.drawImage(grassFringe(s, 'w'), sx, sy);
      if (gE) ctx.drawImage(grassFringe(s, 'e'), sx, sy);
      if (!gN && !gW && isGrass(at(tx - 1, ty - 1))) ctx.drawImage(grassCorner(s, 'nw'), sx, sy);
      if (!gN && !gE && isGrass(at(tx + 1, ty - 1))) ctx.drawImage(grassCorner(s, 'ne'), sx, sy);
      if (!gS && !gW && isGrass(at(tx - 1, ty + 1))) ctx.drawImage(grassCorner(s, 'sw'), sx, sy);
      if (!gS && !gE && isGrass(at(tx + 1, ty + 1))) ctx.drawImage(grassCorner(s, 'se'), sx, sy);
    }
    // cast shadow from walls/cliffs to the north
    if (N && WALLISH[N] && ch !== 'w') ctx.drawImage(shadowBand(), sx, sy);
    if (ch === 'f' || ch === 'm') { if (W && WALLISH[W]) ctx.drawImage(shadowSide('w'), sx, sy); if (E && WALLISH[E]) ctx.drawImage(shadowSide('e'), sx, sy); }
  }
  function cliffSide(side, pal) {
    const P = new Pix(24, 24);
    for (let u = 0; u < 24; u++) {
      const d = 3 + (hash2(u, 77) % 2);
      for (let v = 0; v < d; v++) orientSet(P, side, u, v, v === 0 ? pal[0] : (v === 1 ? pal[1] : pal[2]));
      orientSet(P, side, u, d, pal[3]);
    }
    return P.toCanvas(2);
  }

  /* ================================================================== */
  /* SOIL                                                               */
  /* ================================================================== */
  const SOIL_DRY = ['#4f311b', '#664024', '#7b502e', '#916239', '#a87648'];
  const SOIL_WET = ['#26170c', '#352213', '#432b19', '#533621', '#64442b'];
  function soilTile(mask, wet) { // mask bits: 1=N 2=E 4=S 8=W tilled neighbour
    return gtile(`soil${mask}_${wet ? 1 : 0}`, () => {
      const S = wet ? SOIL_WET : SOIL_DRY, P = new Pix(24, 24), r = rng(mask * 3 + 1);
      const x0 = mask & 8 ? 0 : 1, x1 = mask & 2 ? 23 : 22, y0 = mask & 1 ? 0 : 1, y1 = mask & 4 ? 23 : 22;
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
        const cut = (x === x0 && y === y0 && !(mask & 9)) || (x === x1 && y === y0 && !(mask & 3)) || (x === x0 && y === y1 && !(mask & 12)) || (x === x1 && y === y1 && !(mask & 6));
        if (cut) continue;
        const n = Math.sin(x * 1.7 + y * 0.6) + Math.sin(y * 2.3 - x * 0.9) + (BAYER[y & 3][x & 3] / 16 - 0.5) * 1.2;
        P.set(x, y, n > 1.1 ? S[3] : n < -1.2 ? S[1] : S[2]);
      }
      for (let i = 0; i < 40; i++) { const x = x0 + Math.floor(r() * (x1 - x0)), y = y0 + Math.floor(r() * (y1 - y0)); if (P.a(x, y)) P.set(x, y, r() < 0.4 ? S[3] : r() < 0.5 ? S[1] : S[0]); }
      for (let i = 0; i < 16; i++) { const x = x0 + 2 + Math.floor(r() * (x1 - x0 - 4)), y = y0 + 2 + Math.floor(r() * (y1 - y0 - 4)); P.set(x, y, S[4]); P.set(x + 1, y, S[3]); P.set(x, y + 1, S[1]); P.set(x + 1, y + 1, S[0]); }
      // border
      for (let x = x0; x <= x1; x++) { if (!(mask & 1)) P.set(x, y0, S[0]); if (!(mask & 4)) { P.set(x, y1, S[0]); P.set(x, y1 - 1, S[1]); } }
      for (let y = y0; y <= y1; y++) { if (!(mask & 8)) P.set(x0, y, S[1]); if (!(mask & 2)) P.set(x1, y, S[0]); }
      if (!(mask & 1)) for (let x = x0 + 1; x < x1; x++) P.set(x, y0 + 1, S[3]);
      if (wet) for (let i = 0; i < 4; i++) { const x = x0 + 2 + Math.floor(r() * 18), y = y0 + 2 + Math.floor(r() * 18); P.set(x, y, '#6a5a4e'); }
      return P.toCanvas(2);
    });
  }
  function drawSoil(ctx, sx, sy, watered, map, tx, ty) {
    let mask = 0;
    if (map && tx !== undefined && G.farming && G.farming.soilAt) {
      const id = map.id || map; const t = (x, y) => { try { const s = G.farming.soilAt(id, x, y); return s && s.tilled !== false; } catch (e) { return false; } };
      if (t(tx, ty - 1)) mask |= 1; if (t(tx + 1, ty)) mask |= 2; if (t(tx, ty + 1)) mask |= 4; if (t(tx - 1, ty)) mask |= 8;
    }
    ctx.drawImage(soilTile(mask, !!watered), sx, sy);
  }

  /* ================================================================== */
  /* CROPS                                                              */
  /* ================================================================== */
  const CROPS = {
    carrot: { leaf: '#5ea83a', type: 'leafy', fruit: '#f08a24', seed: '#d9b27a', final: 'carrot_crop' },
    potato: { leaf: '#69a63c', type: 'bushy', fruit: '#f3f0e0', seed: '#c9a26a', final: 'potato_plant' },
    cabbage: { leaf: '#93c95a', type: 'rosette', fruit: '#c6e58a', seed: '#7a5a3a', final: 'cabbage_crop' },
    strawberry: { leaf: '#4e9a3a', type: 'bushy', fruit: '#e0383c', flower: '#ffffff', seed: '#e0c070', final: null },
    tomato: { leaf: '#4f9436', type: 'vine', fruit: '#e04a2a', flower: '#f7d84a', seed: '#e6d39a', final: 'tomato_plant' },
    corn: { leaf: '#7cb446', type: 'tall', fruit: '#f2d04a', seed: '#f2c94c', final: 'corn_plant' },
    sunflower: { leaf: '#5e9e38', type: 'stalk', fruit: '#f6c22a', seed: '#4a3a2a', final: 'sunflower' },
    wheat: { leaf: '#93bf4c', type: 'grass', fruit: '#e2c25a', seed: '#d8b860', final: 'wheat_bundle' },
    pumpkin: { leaf: '#5e9a34', type: 'groundvine', fruit: '#e8892a', seed: '#f0e6c8', final: 'pumpkin_crop' },
  };
  function leaf(P, x0, y0, ang, len, wid, C) {
    const dx = Math.cos(ang), dy = Math.sin(ang);
    for (let t = 0; t <= len; t += 0.35) {
      const w = wid * Math.sin(Math.PI * Math.min(1, (t + 0.6) / (len + 0.6)));
      const cx = x0 + dx * t, cy = y0 + dy * t;
      for (let s = -w; s <= w; s += 0.35) P.set(cx - dy * s, cy + dx * s, s < -0.2 ? C[2] : C[1]);
    }
    for (let t = 0.5; t < len - 0.5; t += 0.5) P.set(x0 + dx * t, y0 + dy * t, C[0]);
    P.set(x0 + dx * len * 0.35 - dy * wid * 0.4, y0 + dy * len * 0.35 + dx * wid * 0.4, C[3]);
  }
  const deg = d => d * Math.PI / 180;
  function cropPix(id, look) {
    const cd = CROPS[id] || CROPS.carrot, C = ramp(cd.leaf, 4, 0.36), F = ramp(cd.fruit, 4, 0.3);
    const tall = (cd.type === 'tall' || cd.type === 'stalk') && look >= 2;
    const H = tall ? 40 : 24, P = new Pix(24, H), r = rng(strHash(id) + look * 7), base = H - 3;
    const k = [0, 0.45, 0.72, 1][look];
    if (look === 0) { // seed mounds
      [[7, base], [12, base - 2], [17, base]].forEach(([x, y]) => { P.ball(x, y, 2.6, 1.6, SOIL_DRY.slice(1), 0.4); P.set(x, y - 1, cd.seed); P.set(x - 1, y - 1, shade(cd.seed, 0.12)); });
      return P;
    }
    if (look === 1) { // sprout
      P.vline(12, base - 3, base, C[0]); leaf(P, 12, base - 3, deg(-150), 3.6, 1.3, C); leaf(P, 12, base - 3, deg(-30), 3.6, 1.3, C);
      if (cd.type === 'grass' || cd.type === 'tall') { P.vline(10, base - 3, base, C[1]); P.vline(14, base - 2, base, C[2]); }
      P.ell(12, base + 1, 3, 1, '#000', 0.18);
      return P;
    }
    const cx = 12;
    P.ell(cx, base + 1, 6, 1.5, '#000', 0.18);
    switch (cd.type) {
      case 'leafy': { // carrot: feathery fronds
        const n = look === 2 ? 4 : 6;
        for (let i = 0; i < n; i++) { const a = deg(-90 + (i - (n - 1) / 2) * (look === 2 ? 22 : 18)); leaf(P, cx, base, a, 7 * k + 2, 1.1, C); }
        if (look === 3) { P.set(cx - 1, base, F[2]); P.set(cx, base, F[3]); P.set(cx + 1, base, F[1]); }
        break;
      }
      case 'bushy': {
        const n = look === 2 ? 5 : 8, rad = 6 * k;
        for (let i = 0; i < n; i++) { const a = deg(-170 + i * (160 / (n - 1))); leaf(P, cx, base, a, rad + 1 + (i % 2), 2, C); }
        for (let i = 0; i < 3; i++) leaf(P, cx + (i - 1) * 2, base - 1, deg(-90 + (i - 1) * 25), rad, 2, C);
        if (look === 3 && cd.flower) for (let i = 0; i < 3; i++) { const x = cx - 5 + i * 5, y = base - 5 - (i % 2) * 3; P.set(x, y, cd.flower); P.set(x + 1, y, cd.flower); P.set(x, y + 1, cd.flower); P.set(x + 1, y + 1, '#f2c94c'); }
        break;
      }
      case 'rosette': {
        const R = 7 * k + 1, D = ramp('#4f9a3a', 4, 0.36);
        for (let i = 0; i < 7; i++) { const a = deg(-185 + i * 32); leaf(P, cx, base - 2, a, R + 1, 2.6, D); }
        for (let i = 0; i < 5; i++) { const a = deg(-160 + i * 35); leaf(P, cx, base - 2, a, R * 0.7, 2.2, C); }
        if (look === 3) { P.ball(cx, base - R * 0.55, R * 0.55, R * 0.48, ramp(cd.fruit, 4, 0.3), 0.4); P.line(cx - 1, base - R * 0.9, cx + 1, base - R * 0.3, shade(cd.fruit, -0.15)); }
        break;
      }
      case 'vine': { // tomato on a stake
        const hgt = Math.round(18 * k + 2);
        P.vline(cx + 3, base - hgt - 1, base, WOOD[2]); P.vline(cx + 4, base - hgt - 1, base, WOOD[1]);
        P.vline(cx, base - hgt, base, C[0]);
        for (let y = base - hgt + 1, i = 0; y < base - 1; y += 3, i++) leaf(P, cx, y, deg(i % 2 ? -20 : -160), 4 + k * 2, 1.7, C);
        leaf(P, cx, base - hgt, deg(-90), 3, 1.5, C);
        if (look === 3) for (let i = 0; i < 3; i++) { const x = cx - 4 + i * 4, y = base - hgt + 4 + i * 4; P.set(x, y, cd.flower); P.set(x + 1, y, cd.flower); P.set(x, y + 1, F[2]); }
        break;
      }
      case 'tall': { // corn
        const hgt = Math.round((look === 2 ? 22 : 33));
        P.vline(cx, base - hgt, base, C[1]); P.vline(cx + 1, base - hgt + 2, base, C[0]);
        for (let i = 0; i < (look === 2 ? 4 : 6); i++) { const y = base - 3 - i * (hgt / 6.5); leaf(P, cx + (i % 2), y, deg(i % 2 ? -25 : -155), 7 + (i < 3 ? 2 : 0), 1.3, C); }
        if (look === 3) { P.vline(cx, base - hgt - 3, base - hgt, '#d8c070'); P.set(cx - 1, base - hgt - 2, '#d8c070'); P.set(cx + 1, base - hgt - 1, '#d8c070'); P.ball(cx + 2, base - 15, 1.6, 3.5, ramp('#a6c95a', 4, 0.3), 0.3); }
        break;
      }
      case 'stalk': { // sunflower
        const hgt = look === 2 ? 22 : 32;
        P.vline(cx, base - hgt, base, C[1]); P.vline(cx + 1, base - hgt, base, C[0]);
        for (let i = 0; i < (look === 2 ? 3 : 4); i++) { const y = base - 4 - i * 6; leaf(P, cx, y, deg(i % 2 ? -30 : -150), 5, 2.4, C); }
        if (look === 3) { P.ball(cx, base - hgt - 2, 3.4, 3, C, 0.4); for (let i = 0; i < 5; i++) P.set(cx - 2 + i, base - hgt - 5, F[2]); }
        else leaf(P, cx, base - hgt, deg(-90), 3, 1.6, C);
        break;
      }
      case 'grass': { // wheat
        const n = look === 2 ? 6 : 9, hgt = 16 * k + 3;
        for (let i = 0; i < n; i++) {
          const x = cx - n / 2 + i + 0.5, lean = (i - n / 2) * 0.35, hh = hgt - (i % 3);
          P.line(x, base, x + lean, base - hh, i % 2 ? C[1] : C[2]);
          if (look === 3) { P.set(x + lean, base - hh - 1, shade(cd.fruit, -0.1)); P.set(x + lean, base - hh, '#bccf5a'); P.set(x + lean, base - hh + 1, '#bccf5a'); }
        }
        break;
      }
      case 'groundvine': { // pumpkin
        const R = 8 * k + 1;
        for (let i = 0; i < 5; i++) { const a = deg(-180 + i * 45); leaf(P, cx, base - 2, a, R, 3, C); }
        P.line(cx - R, base, cx + R, base - 1, C[0]);
        P.set(cx + R + 1, base - 2, C[2]); P.set(cx + R + 2, base - 3, C[2]); P.set(cx - R - 1, base - 3, C[2]);
        if (look === 3) { P.ball(cx + 3, base - 2, 3.2, 2.4, ramp('#8fbf4a', 4, 0.3), 0.3); P.set(cx + 3, base - 5, WOOD[1]); P.set(cx - 5, base - 6, '#f7d84a'); P.set(cx - 4, base - 6, '#f7c82a'); }
        break;
      }
    }
    return P;
  }
  const CROPCACHE = {};
  function cropCanvas(id, look) {
    const k = id + look; if (CROPCACHE[k]) return CROPCACHE[k];
    const P = cropPix(id, look); P.outline('auto');
    return (CROPCACHE[k] = P.toCanvas(2));
  }
  function strawberryFinal() {
    if (CROPCACHE.strawberry_final) return CROPCACHE.strawberry_final;
    const base = cropCanvas('strawberry', 3), c = G.makeCanvas(48, 48), x = c.getContext('2d');
    x.drawImage(base, 0, 0);
    const sb = G.assets.strawberry;
    if (sb) [[8, 22], [26, 18], [17, 30]].forEach(([px, py]) => x.drawImage(sb, px, py, 15, 15));
    return (CROPCACHE.strawberry_final = c);
  }
  function drawCrop(ctx, cropId, stage, maxStage, sx, sy, now) {
    const cd = CROPS[cropId];
    let img, ox = 0, oy = 0;
    if (stage >= maxStage && maxStage > 0) {
      if (cropId === 'strawberry') img = strawberryFinal();
      else img = (cd && G.assets[cd.final]) || G.assets[cropId] || cropCanvas(cropId, 3);
      oy = -6;
    } else {
      let look = stage <= 0 ? 0 : 1 + Math.min(2, Math.floor((stage - 1) / Math.max(1, maxStage - 1) * 3));
      img = cropCanvas(cropId in CROPS ? cropId : 'carrot', look);
    }
    const H = img.height;
    const sway = stage > 0 && now !== undefined ? Math.sin(now * 1.6 + sx * 0.05 + sy * 0.03) * 0.035 : 0;
    if (sway) {
      ctx.save(); ctx.translate(sx + 24, sy + T + oy); ctx.transform(1, 0, sway, 1, 0, 0); ctx.drawImage(img, -24 + ox, -H); ctx.restore();
    } else ctx.drawImage(img, sx + ox, sy + T - H + oy);
  }

  /* ================================================================== */
  /* CHARACTERS                                                         */
  /* ================================================================== */
  const PLAYER_LOOK = { skin: '#f1c19a', hair: 'short', hairColor: '#7a4520', shirt: '#d9574a', pants: '#3e6cb4', hat: 'straw', overalls: true, boots: '#5a3820' };
  const lookKey = L => [L.skin, L.hair, L.hairColor, L.shirt, L.pants, L.hat || '', L.overalls ? 1 : 0, L.boots || ''].join('|');
  /** frames: 0 stand, 1 stepA, 2 stand, 3 stepB, 4 idle-breath, 5 tool pose */
  function charPix(L, dir, frame) {
    const P = new Pix(20, 25), O = 2, OY = 1;
    const side = dir === 'left' || dir === 'right';
    const sk = ramp(L.skin || '#f1c19a', 3, 0.22), hr = ramp(L.hairColor || '#6a4020', 3, 0.3), sh = ramp(L.shirt || '#5a8acb', 3, 0.28), pa = ramp(L.pants || '#5a4a3a', 3, 0.28);
    const bo = ramp(L.boots || '#5a3820', 3, 0.22);
    const hatStraw = ['#b8893a', '#e2bb62', '#f4d98a'], band = '#b4452f';
    const capC = ramp(L.capColor || L.shirt || '#c84a3a', 3, 0.28);
    const S = (x, y, c) => P.set(x + O, y + OY, c), R = (x, y, w, h, c) => P.rect(x + O, y + OY, w, h, c);
    const by = frame === 4 ? 1 : 0; // breathing bob for upper body
    const pose = frame === 5;
    const step = frame === 1 ? 1 : frame === 3 ? -1 : 0;
    const longHair = L.hair === 'long';

    if (!side) {
      const up = dir === 'up';
      // long hair behind body
      if (longHair && !up) { R(3, 6 + by, 1, 7, hr[0]); R(12, 6 + by, 1, 7, hr[0]); }
      // legs
      const lLift = step === 1 ? 1 : 0, rLift = step === -1 ? 1 : 0;
      R(5, 17, 3, 3 - lLift, pa[1]); S(7, 17, pa[0]); S(7, 18, pa[0]);
      R(8, 17, 3, 3 - rLift, pa[1]); S(10, 17, pa[0]); S(10, 18, pa[0]);
      R(5, 20 - lLift, 3, 2, bo[1]); S(5, 20 - lLift, bo[2]);
      R(8, 20 - rLift, 3, 2, bo[1]); S(8, 20 - rLift, bo[2]);
      // torso
      R(4, 11 + by, 8, 6, sh[1]); R(11, 11 + by, 1, 6, sh[0]); R(4, 11 + by, 1, 2, sh[2]); R(5, 11 + by, 6, 1, sh[2]);
      if (L.overalls) {
        if (!up) { R(5, 13 + by, 6, 4 - by, pa[1]); R(10, 13 + by, 1, 4 - by, pa[0]); S(5, 11 + by, pa[1]); S(5, 12 + by, pa[1]); S(10, 11 + by, pa[1]); S(10, 12 + by, pa[1]); S(5, 13 + by, '#f2d27a'); S(10, 13 + by, '#f2d27a'); R(7, 14 + by, 2, 1, pa[2]); }
        else { S(5, 11 + by, pa[1]); S(6, 12 + by, pa[1]); S(10, 11 + by, pa[1]); S(9, 12 + by, pa[1]); R(7, 13 + by, 2, 1, pa[1]); R(5, 14 + by, 6, 3 - by, pa[1]); R(10, 14 + by, 1, 3 - by, pa[0]); }
      } else { R(4, 16, 8, 1, '#4a2e1a'); if (!up) S(7, 16, '#d8b060'); }
      // arms
      if (pose) {
        if (!up) { S(3, 11 + by, sh[1]); S(3, 12 + by, sh[0]); S(12, 11 + by, sh[0]); S(12, 12 + by, sh[0]); S(4, 13 + by, sh[1]); S(11, 13 + by, sh[0]); R(5, 13 + by, 2, 1, sk[1]); R(9, 13 + by, 2, 1, sk[1]); R(6, 14 + by, 4, 1, sk[1]); S(9, 14 + by, sk[0]); }
        else { R(3, 9 + by, 1, 4, sh[1]); R(12, 9 + by, 1, 4, sh[0]); S(3, 8 + by, sk[1]); S(12, 8 + by, sk[0]); }
      } else {
        const la = step === 1 ? 1 : step === -1 ? -1 : 0;
        R(3, 11 + by, 1, 3 + la, sh[1]); R(3, 14 + by + la, 1, 2, sk[1]); S(3, 11 + by, sh[2]);
        R(12, 11 + by, 1, 3 - la, sh[0]); R(12, 14 + by - la, 1, 2, sk[0]);
      }
      // head
      const hy = 3 + by;
      R(4, hy, 8, 8, sk[1]); P.clear(4 + O, hy + OY); P.clear(11 + O, hy + OY); P.clear(4 + O, hy + 7 + OY); P.clear(11 + O, hy + 7 + OY);
      R(11, hy + 1, 1, 6, sk[0]); R(5, hy + 7, 6, 1, sk[0]);
      if (!up) {
        S(3, hy + 4, sk[0]); S(12, hy + 4, sk[0]);
        S(6, hy + 4, '#2b1a0d'); S(6, hy + 5, '#2b1a0d'); S(9, hy + 4, '#2b1a0d'); S(9, hy + 5, '#2b1a0d');
        S(5, hy + 6, mix(sk[1], '#e86a6a', 0.45)); S(10, hy + 6, mix(sk[1], '#e86a6a', 0.45));
        S(7, hy + 6, sk[0]); S(8, hy + 6, sk[0]);
      }
      // hair
      const hasHat = L.hat === 'straw' || L.hat === 'cap';
      if (L.hair !== 'bald') {
        if (up) {
          R(4, hy - 1, 8, 7, hr[1]); R(3, hy + 1, 10, 4, hr[1]); R(5, hy - 1, 3, 1, hr[2]); R(11, hy, 1, 5, hr[0]); R(5, hy + 5, 6, 1, hr[0]);
          if (longHair) { R(4, hy + 6, 8, 5, hr[1]); R(4, hy + 10, 8, 1, hr[0]); R(11, hy + 6, 1, 5, hr[0]); }
          else { R(6, hy + 6, 4, 1, sk[0]); }
        } else {
          R(5, hy - 1, 6, 1, hr[1]); R(3, hy, 10, 2, hr[1]); R(3, hy + 2, 3, 1, hr[1]); R(10, hy + 2, 3, 1, hr[1]); S(3, hy + 3, hr[0]); S(12, hy + 3, hr[0]);
          R(5, hy, 3, 1, hr[2]); S(6, hy + 2, hr[1]); R(11, hy, 2, 2, hr[0]);
          if (longHair) { R(3, hy + 3, 1, 6, hr[1]); R(12, hy + 3, 1, 6, hr[0]); }
        }
        if (L.hair === 'bun') { R(6, hy - 4, 4, 3, hr[1]); S(6, hy - 4, hr[2]); S(9, hy - 2, hr[0]); }
      } else {
        S(3, hy + 3, hr[1]); S(12, hy + 3, hr[1]); S(3, hy + 4, hr[0]); S(12, hy + 4, hr[0]);
        S(6, hy, sk[2]); S(7, hy, sk[2]);
      }
      if (L.hat === 'straw') {
        R(5, hy - 4, 6, 1, hatStraw[2]); R(4, hy - 3, 8, 2, hatStraw[1]); R(10, hy - 3, 2, 2, hatStraw[0]); S(5, hy - 3, hatStraw[2]);
        R(4, hy - 1, 8, 1, band);
        R(1, hy, 14, 1, hatStraw[1]); R(2, hy + 1, 12, 1, hatStraw[0]); R(2, hy, 4, 1, hatStraw[2]);
        if (!up) R(4, hy + 2, 8, 1, sk[0]); // shadow under brim
      } else if (L.hat === 'cap') {
        R(4, hy - 2, 8, 3, capC[1]); R(5, hy - 3, 6, 1, capC[1]); S(5, hy - 2, capC[2]); R(10, hy - 2, 2, 3, capC[0]);
        if (!up) { R(4, hy + 1, 8, 1, capC[0]); S(7, hy - 1, '#f2e6c8'); } else R(4, hy + 1, 8, 1, capC[1]);
      }
      if (hasHat && L.hair !== 'bald' && !up) { /* keep sides */ }
    } else {
      // ---- side view, facing right (left = mirrored) ----
      if (longHair) { R(3, 6 + by, 3, 7, hr[0]); }
      // legs
      if (step !== 0) {
        R(4, 17, 3, 3, pa[0]); R(3, 20, 4, 2, bo[0]);              // back leg
        R(8, 17, 3, 3, pa[1]); S(10, 17, pa[0]); R(8, 20, 5, 2, bo[1]); S(8, 20, bo[2]); // front leg
      } else {
        R(6, 17, 4, 3, pa[1]); S(9, 17, pa[0]); S(9, 18, pa[0]); R(6, 20, 5, 2, bo[1]); S(6, 20, bo[2]);
      }
      // torso
      R(5, 11 + by, 6, 6, sh[1]); R(5, 11 + by, 6, 1, sh[2]); R(10, 12 + by, 1, 5, sh[0]);
      if (L.overalls) { R(7, 13 + by, 4, 4 - by, pa[1]); S(8, 11 + by, pa[1]); S(8, 12 + by, pa[1]); S(8, 13 + by, '#f2d27a'); R(10, 13 + by, 1, 4 - by, pa[0]); R(5, 16, 2, 1, pa[1]); }
      else R(5, 16, 6, 1, '#4a2e1a');
      // head
      const hy = 3 + by;
      R(5, hy, 7, 8, sk[1]); P.clear(5 + O, hy + OY); P.clear(11 + O, hy + OY); P.clear(5 + O, hy + 7 + OY); P.clear(11 + O, hy + 7 + OY);
      S(12, hy + 4, sk[1]); S(12, hy + 5, sk[0]); R(6, hy + 7, 5, 1, sk[0]);
      S(10, hy + 3, '#2b1a0d'); S(10, hy + 4, '#2b1a0d'); S(11, hy + 6, mix(sk[1], '#e86a6a', 0.45));
      S(7, hy + 4, sk[0]); S(7, hy + 5, sk[0]); // ear
      if (L.hair !== 'bald') {
        R(5, hy - 1, 6, 2, hr[1]); R(4, hy, 4, 5, hr[1]); R(8, hy + 1, 4, 1, hr[1]); S(4, hy + 5, hr[0]); R(6, hy - 1, 3, 1, hr[2]); R(4, hy + 3, 1, 2, hr[0]);
        if (longHair) { R(4, hy + 5, 3, 4, hr[1]); R(4, hy + 8, 3, 1, hr[0]); }
        if (L.hair === 'bun') { R(2, hy - 1, 3, 3, hr[1]); S(2, hy - 1, hr[2]); }
        S(7, hy + 4, sk[0]);
      } else { S(5, hy + 3, hr[1]); S(5, hy + 4, hr[0]); S(6, hy + 3, hr[1]); }
      if (L.hat === 'straw') {
        R(5, hy - 4, 6, 1, hatStraw[2]); R(4, hy - 3, 7, 2, hatStraw[1]); R(9, hy - 3, 2, 2, hatStraw[0]); R(4, hy - 1, 7, 1, band);
        R(2, hy, 13, 1, hatStraw[1]); R(3, hy + 1, 11, 1, hatStraw[0]); R(2, hy, 4, 1, hatStraw[2]);
      } else if (L.hat === 'cap') {
        R(4, hy - 2, 7, 3, capC[1]); R(5, hy - 3, 5, 1, capC[1]); S(5, hy - 2, capC[2]); R(11, hy, 3, 1, capC[0]); R(9, hy - 2, 2, 3, capC[0]);
      }
      // arm (on top)
      if (pose) { R(7, 12 + by, 5, 2, sh[1]); R(7, 13 + by, 5, 1, sh[0]); R(12, 12 + by, 2, 2, sk[1]); }
      else {
        const ax = step === 1 ? 1 : step === -1 ? -1 : 0;
        R(7 + ax, 11 + by, 2, 4, sh[1]); S(8 + ax, 12 + by, sh[0]); S(8 + ax, 13 + by, sh[0]); R(7 + ax * 2, 15 + by, 2, 1, sk[1]);
      }
    }
    P.outline('auto');
    let out = P;
    if (dir === 'left') out = P.flipX();
    return out;
  }
  const CHARCACHE = {};
  function charFrame(L, dir, frame) {
    const k = lookKey(L) + dir + frame; let c = CHARCACHE[k];
    if (!c) c = CHARCACHE[k] = charPix(L, dir, frame).toCanvas(2);
    return c;
  }
  let SHADOW;
  function shadowImg() {
    if (SHADOW) return SHADOW;
    const P = new Pix(16, 6); P.ell(8, 3, 7, 2.4, '#1a0f08', 0.28); P.ell(8, 3, 5, 1.6, '#1a0f08', 0.12);
    return (SHADOW = P.toCanvas(2));
  }
  const TOOL_AXIS = { scythe: Math.PI / 4, fishing_rod: Math.PI / 4 };
  const TOOL_PIVOT = { scythe: [9, 41], fishing_rod: [8, 42] };
  function drawHeldTool(ctx, p, sx, sy, phase) {
    const tier = (G.state && G.state.tools && G.state.tools[p.swingTool]) || 0;
    const icon = G.icon('tool:' + p.swingTool + ':' + tier); if (!icon) return;
    const t = clamp(1 - p.swingT / 0.3, 0, 1), dir = p.dir;
    const piv = TOOL_PIVOT[p.swingTool] || [24, 44], axis = TOOL_AXIS[p.swingTool] || 0, sc = 0.72;
    const can = p.swingTool === 'watering_can';
    ctx.save();
    if (dir === 'left' || dir === 'right') {
      const m = dir === 'left' ? -1 : 1;
      ctx.translate(sx + 9 * m, sy - 19); ctx.scale(m, 1);
      let a;
      if (can) a = 0.15 + t * 0.6; else if (p.swingTool === 'fishing_rod') a = -1.2 + 1.9 * t; else a = -0.55 + 2.45 * t * t;
      if (can) { ctx.rotate(a); ctx.drawImage(icon, -10, -22, 34, 34); }
      else { ctx.rotate(a - axis); ctx.drawImage(icon, -piv[0] * sc, -piv[1] * sc, 48 * sc, 48 * sc); }
    } else {
      const down = dir === 'down';
      if (can) {
        if (down) ctx.drawImage(icon, sx - 14 + t * 2, sy - 30 + t * 4, 30, 30);
        else ctx.drawImage(icon, sx - 14, sy - 42, 28, 28);
      } else {
        const th = down ? Math.PI * t * t : Math.PI * (1 - t);
        const cy = Math.cos(th);
        ctx.translate(sx, sy + (down ? (cy > 0 ? -24 : -18) : -28)); ctx.scale(1.1, Math.abs(cy) < 0.15 ? 0.15 * Math.sign(cy || 1) : cy * 1.1);
        ctx.rotate(-axis * 0);
        if (axis) ctx.rotate(-axis);
        ctx.drawImage(icon, -piv[0] * sc, -piv[1] * sc, 48 * sc, 48 * sc);
      }
    }
    ctx.restore();
  }
  function toolInFront(p) {
    const t = clamp(1 - p.swingT / 0.3, 0, 1);
    if (p.dir === 'left' || p.dir === 'right') return true;
    if (p.swingTool === 'watering_can') return p.dir === 'down';
    if (p.dir === 'down') return Math.cos(Math.PI * t * t) < 0.2;
    return Math.cos(Math.PI * (1 - t)) < -0.2;
  }
  function drawPlayer(ctx, p, sx, sy) {
    ctx.drawImage(shadowImg(), sx - 16, sy - 6);
    const swinging = p.swingT > 0 && p.swingTool;
    const dir = p.dir || 'down';
    let frame;
    if (swinging) frame = 5;
    else if (p.moving) frame = Math.floor(p.animT * 8) % 4;
    else frame = (Math.floor(performance.now() / 700) % 2) ? 4 : 0;
    const look = G.art.playerLook || PLAYER_LOOK;
    const img = charFrame(look, dir, frame);
    const front = swinging && toolInFront(p);
    if (swinging && !front) drawHeldTool(ctx, p, sx, sy);
    ctx.drawImage(img, sx - 20, sy - 46);
    if (swinging && front) drawHeldTool(ctx, p, sx, sy);
  }
  function normLook(look) {
    look = look || {};
    return { skin: look.skin || '#e8b48a', hair: look.hair || 'short', hairColor: look.hairColor || '#5a3a22', shirt: look.shirt || '#5a8acb', pants: look.pants || '#5a4a3a', hat: look.hat || null, overalls: !!look.overalls, boots: look.boots || '#4a3020', capColor: look.capColor };
  }
  const NLOOK = new WeakMap();
  function drawNPC(ctx, look, dir, moving, animT, sx, sy) {
    let L = look && NLOOK.get(look); if (!L) { L = normLook(look); if (look && typeof look === 'object') NLOOK.set(look, L); }
    ctx.drawImage(shadowImg(), sx - 16, sy - 6);
    const frame = moving ? Math.floor((animT || 0) * 8) % 4 : ((Math.floor(performance.now() / 800 + sx * 0.01) % 2) ? 4 : 0);
    ctx.drawImage(charFrame(L, dir || 'down', frame), sx - 20, sy - 46);
  }

  /* ================================================================== */
  /* TOOL ICONS                                                         */
  /* ================================================================== */
  const TOOLCACHE = {};
  function recolorMetal(src, tier, test) {
    const c = G.makeCanvas(48, 48), x = c.getContext('2d'); x.drawImage(src, 0, 0, 48, 48);
    const id = x.getImageData(0, 0, 48, 48), d = id.data, R = TIER[tier];
    for (let i = 0; i < d.length; i += 4) {
      if (!d[i + 3]) continue;
      const [h, s, l] = rgb2hsl(d[i], d[i + 1], d[i + 2]);
      if (!test(h * 360, s, l)) continue;
      const f = clamp((l - 0.12) / 0.78, 0, 1) * 4, i0 = Math.floor(f), i1 = Math.min(4, i0 + 1), tt = f - i0;
      const A = rgb(R[i0]), B = rgb(R[i1]);
      d[i] = A[0] + (B[0] - A[0]) * tt; d[i + 1] = A[1] + (B[1] - A[1]) * tt; d[i + 2] = A[2] + (B[2] - A[2]) * tt;
    }
    x.putImageData(id, 0, 0); return c;
  }
  function tierRamp(t) { return TIER[t]; }
  function drawScythe(tier) {
    const M = TIER[tier];
    return mk(24, 24, P => {
      // handle: diagonal from bottom-left to top-right
      P.line(3, 21, 17, 4, WOOD[2], 1); P.line(4, 21, 18, 4, WOOD[3], 1); P.line(4, 22, 18, 5, WOOD[1], 1);
      P.rect(7, 16, 2, 2, WOOD[4]); P.set(8, 17, WOOD[1]); // grip
      // curved blade from top of handle sweeping left/down
      const pts = [];
      for (let a = 0; a <= 1; a += 0.04) { const ang = deg(-60 - a * 150); pts.push([12 + Math.cos(ang) * 9 * (1 - a * 0.25), 11 + Math.sin(ang) * 7]); }
      for (let i = 0; i < pts.length; i++) { const [x, y] = pts[i], w = 2.2 * (1 - i / pts.length) + 0.4; for (let k = 0; k <= w; k += 0.5) { P.set(x, y + k, k < 0.6 ? M[4] : (k < w - 0.6 ? M[3] : M[1])); } }
      P.rect(16, 3, 3, 3, M[1]); P.set(16, 3, M[3]);
    });
  }
  function drawRod(tier) {
    const rodCols = [['#a8803a', '#d8b060', '#7a5a22'], ['#b86a3a', '#e09060', '#7a3a1a'], ['#6a7a8a', '#b8c8d8', '#3a4a5a'], ['#c09020', '#f6d65a', '#7a5a08'], ['#7a3a9a', '#d08aec', '#3a1450']][tier];
    const M = TIER[tier];
    return mk(24, 24, P => {
      P.line(3, 21, 20, 2, rodCols[0], 1); P.line(4, 21, 21, 2, rodCols[1], 1);
      for (let i = 0; i < 4; i++) { const t = 0.25 + i * 0.18; P.set(3 + 17 * t, 21 - 19 * t, rodCols[2]); P.set(4 + 17 * t, 21 - 19 * t, rodCols[2]); } // bamboo nodes
      P.rect(3, 18, 3, 3, '#5a3a22'); P.set(3, 18, '#7a5030'); // grip
      P.ball(8.5, 17.5, 2.2, 2.2, M.slice(1), 0.3); P.set(8, 17, M[4]); P.set(10, 16, '#2b1a0d');
      // line
      for (let y = 3; y < 15; y++) P.set(21 + (y > 9 ? 1 : 0), y, '#e8e8f0');
      P.set(21, 15, '#d83a2a'); P.set(22, 15, '#f4f4f4'); P.set(21, 16, '#f4f4f4'); P.set(22, 16, '#d83a2a');
    });
  }
  function toolIcon(id, tier) {
    tier = clamp(tier | 0, 0, 4);
    const k = id + tier; if (TOOLCACHE[k]) return TOOLCACHE[k];
    let c = null;
    const grey = minL => (h, s, l) => s < 0.2 && l > minL;
    switch (id) {
      case 'hoe': c = G.assets.hoe ? recolorMetal(G.assets.hoe, tier, grey(0.4)) : null; break;
      case 'axe': c = G.assets.axe_2 ? recolorMetal(G.assets.axe_2, tier, (h, s, l) => (s < 0.16 && l > 0.32) || (h > 220 && h < 300 && l > 0.32)) : null; break;
      case 'pickaxe': c = G.assets.scythe_3 ? recolorMetal(G.assets.scythe_3, tier, (h, s, l) => (h > 280 || h < 2) && l > 0.3 && s < 0.6) : null; break;
      case 'watering_can': c = G.assets.watering_can ? recolorMetal(G.assets.watering_can, tier, (h, s, l) => h >= 5 && h <= 45 && s > 0.3 && l > 0.25) : null; break;
      case 'scythe': c = drawScythe(tier); break;
      case 'fishing_rod': c = drawRod(tier); break;
      default: return null;
    }
    if (c && tier >= 3) { // a little sparkle on gold/iridium
      const x = c.getContext('2d'); x.fillStyle = '#fffbe8'; x.fillRect(34, 6, 2, 6); x.fillRect(32, 8, 6, 2);
    }
    return (TOOLCACHE[k] = c);
  }

  /* ================================================================== */
  /* LIGHTS                                                             */
  /* ================================================================== */
  let GLOW;
  function glowImg() {
    if (GLOW) return GLOW;
    const c = G.makeCanvas(128, 128), x = c.getContext('2d');
    const g = x.createRadialGradient(64, 64, 0, 64, 64, 64);
    g.addColorStop(0, 'rgba(255,200,120,0.9)'); g.addColorStop(0.35, 'rgba(255,160,70,0.45)'); g.addColorStop(1, 'rgba(255,120,40,0)');
    x.fillStyle = g; x.fillRect(0, 0, 128, 128); return (GLOW = c);
  }
  function drawLights(ctx, map, darkness) {
    if (!darkness) return;
    const img = glowImg(), cam = G.cam;
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    const flick = Math.sin(performance.now() / 130) * 0.04 + Math.sin(performance.now() / 47) * 0.02;
    ctx.globalAlpha = clamp(darkness * 1.1 + flick, 0, 1);
    for (const L of (map.lights || [])) {
      const r = (L.r || 2.5) * T, sx = (L.x + 0.5) * T - cam.x, sy = (L.y + 0.5) * T - cam.y;
      if (sx < -r || sy < -r || sx > cam.w + r || sy > cam.h + r) continue;
      ctx.drawImage(img, sx - r, sy - r, r * 2, r * 2);
    }
    if (darkness > 0.2 && G.player) {
      const r = (map.dark ? 4 : 2.6) * T; ctx.globalAlpha = clamp(darkness * (map.dark ? 0.9 : 0.45), 0, 1);
      ctx.drawImage(img, G.player.x - cam.x - r, G.player.y - 24 - cam.y - r, r * 2, r * 2);
    }
    ctx.restore();
  }
  function seasonTint(s) { return ['rgba(255,240,220,0)', 'rgba(255,220,120,0.04)', 'rgba(255,140,40,0.07)', 'rgba(170,200,255,0.08)'][s | 0] || 'rgba(0,0,0,0)'; }

  /* ================================================================== */
  /* ITEM ICONS & WORLD SPRITES — see below                              */
  /* ================================================================== */
  const ICONS = G.art.icons, SPR = G.art.sprites;

  // (filled in by buildIcons / buildSprites)
  /* ------------------------------------------------------------------ */
  /* shape helpers for sprites                                           */
  /* ------------------------------------------------------------------ */
  /** irregular shaded blob (rocks, canopy clumps, bushes) */
  function blob(P, cx, cy, rx, ry, cols, seed = 1, bump = 0.12, dither = 0.7) {
    const r = rng(seed), p1 = r() * 6.28, p2 = r() * 6.28, f1 = 2 + Math.floor(r() * 3), f2 = 4 + Math.floor(r() * 3);
    const lx = -0.55, ly = -0.65, lz = Math.sqrt(1 - lx * lx - ly * ly), n = cols.length;
    for (let y = Math.floor(cy - ry * 1.3); y <= Math.ceil(cy + ry * 1.3); y++) for (let x = Math.floor(cx - rx * 1.3); x <= Math.ceil(cx + rx * 1.3); x++) {
      const nx = (x + 0.5 - cx) / rx, ny = (y + 0.5 - cy) / ry, a = Math.atan2(ny, nx);
      const rr = 1 + bump * Math.sin(a * f1 + p1) + bump * 0.6 * Math.sin(a * f2 + p2);
      const d2 = (nx * nx + ny * ny) / (rr * rr); if (d2 > 1) continue;
      const nz = Math.sqrt(1 - d2); const v = (nx / rr) * lx + (ny / rr) * ly + nz * lz;
      const t = clamp((v + 0.15) / 1.1, 0, 1) * (n - 1) + (BAYER[y & 3][x & 3] / 16 - 0.47) * dither;
      P.set(x, y, cols[clamp(Math.round(t), 0, n - 1)]);
    }
  }
  function groundShadow(P, cx, cy, rx, ry, a = 0.25) { P.ell(cx, cy, rx, ry, '#1a0f08', a); P.ell(cx, cy, rx * 0.7, ry * 0.7, '#1a0f08', a * 0.5); }
  /** draw outline-free shadow first then sprite parts; shadow must not get outlined -> use separate pass */
  function withShadow(w, h, shadowFn, fn, scale = 2) {
    const P = new Pix(w, h); fn(P); P.outline('auto');
    const S = new Pix(w, h); shadowFn(S);
    S.blit(P, 0, 0); return S.toCanvas(scale);
  }
  const LEAF_SPRING = ['#1d4422', '#2a632c', '#3b8234', '#55a23c', '#80c257'];
  const LEAF_SUMMER = ['#183d1f', '#245a28', '#337630', '#4a9338', '#6eb04c'];
  const LEAF_FALL = ['#5a2410', '#8a3a14', '#c05a1c', '#e2862a', '#f6b847'];
  const PINE = ['#10261f', '#18392d', '#235138', '#336a44', '#4d8a52'];
  const BARK = ['#33200f', '#4f3219', '#6b4524', '#87592f', '#a06e3c'];
  const ROCK = ['#3b3631', '#57504a', '#746b62', '#948a7e', '#b4ab9c', '#d2cabb'];

  function trunk(P, cx, top, bot, w) {
    for (let y = top; y <= bot; y++) {
      const flare = y > bot - 4 ? (y - (bot - 4)) * 0.8 : 0, hw = w / 2 + flare;
      for (let x = Math.floor(cx - hw); x <= Math.ceil(cx + hw - 1); x++) {
        const t = (x - (cx - hw)) / (2 * hw); let c = t < 0.25 ? BARK[3] : t < 0.6 ? BARK[2] : t < 0.85 ? BARK[1] : BARK[0];
        if ((x * 7 + y * 3) % 11 === 0) c = BARK[1]; if ((x + y * 5) % 13 === 0 && t < 0.5) c = BARK[4];
        P.set(x, y, c);
      }
    }
    P.vline(Math.round(cx), top + 2, bot - 3, BARK[1]); P.vline(Math.round(cx) - 2, top + 5, bot - 6, BARK[3]);
  }
  function oakTree(leaf, seed) {
    return withShadow(48, 72, S => groundShadow(S, 24, 68, 15, 3.6, 0.28), P => {
      trunk(P, 24, 40, 68, 8);
      // roots
      P.set(17, 68, BARK[2]); P.set(18, 67, BARK[2]); P.set(30, 68, BARK[1]); P.set(29, 67, BARK[1]);
      const r = rng(seed);
      blob(P, 24, 27, 21, 19, [leaf[0], leaf[1], leaf[1], leaf[2]], seed, 0.1, 0.5);
      const clumps = [[13, 32, 9], [35, 32, 9], [24, 36, 10], [16, 20, 9], [32, 19, 9], [24, 12, 9], [10, 26, 7], [38, 25, 7], [24, 25, 9]];
      clumps.forEach(([x, y, rad], i) => blob(P, x, y, rad, rad * 0.88, leaf.slice(0, 5), seed + i * 13, 0.15, 0.8));
      [[17, 14, 5], [27, 9, 4], [11, 22, 4], [22, 21, 5]].forEach(([x, y, rad], i) => blob(P, x, y, rad, rad * 0.8, [leaf[2], leaf[3], leaf[4]], seed + 99 + i, 0.2, 0.6));
      for (let i = 0; i < 60; i++) { const x = 4 + Math.floor(r() * 40), y = 6 + Math.floor(r() * 38); if (P.a(x, y) && P.a(x + 1, y)) { P.set(x, y, r() < 0.5 ? leaf[4] : leaf[1]); } }
      // a peek of branch inside canopy
      P.line(24, 40, 19, 33, BARK[1]); P.line(25, 40, 30, 34, BARK[1]);
    });
  }
  function bareTree(seed, snow) {
    return withShadow(48, 72, S => groundShadow(S, 24, 68, 13, 3.2, 0.25), P => {
      const r = rng(seed);
      trunk(P, 24, 30, 68, 7);
      const branch = (x, y, ang, len, w, depth) => {
        const x2 = x + Math.cos(ang) * len, y2 = y + Math.sin(ang) * len;
        P.line(x, y, x2, y2, depth < 2 ? BARK[2] : BARK[1], w);
        if (snow && depth >= 1 && Math.abs(Math.cos(ang)) > 0.35) P.line(x + (x2 - x) * 0.3, y + (y2 - y) * 0.3 - 1, x2, y2 - 1, '#f4f8fc', 1);
        if (depth < 4) { branch(x2, y2, ang - 0.45 - r() * 0.3, len * 0.68, Math.max(1, w - 1), depth + 1); branch(x2, y2, ang + 0.4 + r() * 0.3, len * 0.66, Math.max(1, w - 1), depth + 1); }
      };
      branch(24, 34, -Math.PI / 2 - 0.5, 12, 3, 0); branch(24, 34, -Math.PI / 2 + 0.5, 12, 3, 0); branch(24, 32, -Math.PI / 2, 14, 3, 1);
      if (snow) { P.rect(19, 67, 10, 1, '#ffffff'); }
    });
  }
  function pineTree(seed, snow) {
    return withShadow(48, 72, S => groundShadow(S, 24, 68, 13, 3.4, 0.28), P => {
      trunk(P, 24, 52, 68, 6);
      const tiers = [[60, 22, 18], [47, 18, 16], [35, 14, 14], [24, 10, 12], [14, 6, 10]];
      tiers.forEach(([by, hw, hh], i) => {
        const top = by - hh;
        for (let y = top; y <= by; y++) {
          const t = (y - top) / hh, w = 1 + hw * t;
          const jag = (y === by || y === by - 1) ? 0 : 0;
          for (let x = Math.floor(24 - w); x <= Math.ceil(24 + w); x++) {
            if (y >= by - 1 && ((x + i) % 4 === 0)) continue; // jagged hem
            const u = (x - (24 - w)) / (2 * w);
            let c = u < 0.3 ? PINE[3] : u < 0.62 ? PINE[2] : u < 0.85 ? PINE[1] : PINE[0];
            if (y > by - 3) c = u < 0.4 ? PINE[2] : PINE[1];
            if ((x * 3 + y * 7) % 9 === 0 && u < 0.6) c = PINE[4];
            P.set(x, y, c);
          }
          if (snow) for (let x = Math.floor(24 - w); x <= Math.ceil(24 + w); x++) { if (y < top + hh * 0.3 + (hash2(x, i) % 3)) { const u = (x - (24 - w)) / (2 * w); P.set(x, y, u < 0.55 ? '#ffffff' : u < 0.85 ? '#dfe9f4' : '#b8c8dc'); } }
        }
        if (snow) for (let x = 24 - hw + 2; x < 24 + hw * 0.5; x++) if (hash2(x, by) % 3) P.set(x, by - 2, '#f4f8fc');
      });
      P.set(24, 3, PINE[3]); P.set(24, 2, PINE[4]);
    });
  }
  function stumpSpr(big) {
    const W = big ? 48 : 24, sc = big ? 2 : 1;
    return withShadow(W, W, S => groundShadow(S, W / 2, W - 3 * sc, 9 * sc, 2.6 * sc, 0.25), P => {
      const cx = W / 2, top = W - 14 * sc, bot = W - 4 * sc, rx = 7 * sc;
      for (let y = top; y <= bot; y++) for (let x = cx - rx; x < cx + rx; x++) { const u = (x - (cx - rx)) / (2 * rx); P.set(x, y, u < 0.25 ? BARK[3] : u < 0.6 ? BARK[2] : u < 0.85 ? BARK[1] : BARK[0]); if ((x * 5 + y) % 7 === 0) P.set(x, y, BARK[1]); }
      P.ell(cx, bot, rx, 2 * sc, BARK[1]);
      // roots
      P.poly([[cx - rx - 3 * sc, bot + 1], [cx - rx + 1, bot - 4 * sc], [cx - rx + 3 * sc, bot + 1]], BARK[2]);
      P.poly([[cx + rx - 2 * sc, bot + 1], [cx + rx - 1, bot - 4 * sc], [cx + rx + 3 * sc, bot + 1]], BARK[1]);
      P.ell(cx, top, rx, 3.8 * sc, '#c9a06a'); P.ell(cx - sc, top - sc * 0.6, rx * 0.7, 2.4 * sc, '#dcb47a');
      for (let k = 1; k <= (big ? 4 : 2); k++) { const rr = rx * k / (big ? 5 : 3); for (let a = 0; a < 6.28; a += 0.08) P.set(cx + Math.cos(a) * rr, top + Math.sin(a) * rr * 0.54, '#a87c4a'); }
      P.set(cx, top, '#7a5430'); for (let x = cx - rx; x < cx + rx; x++) { const yy = top + Math.sqrt(Math.max(0, 1 - ((x + 0.5 - cx) / rx) ** 2)) * 3.8 * sc; P.set(x, yy, BARK[4]); P.set(x, yy + 1, BARK[3]); }
      if (big) { P.line(cx - 3, top + 8, cx - 1, bot - 4, BARK[0]); P.ell(cx + 6, top + 12, 2, 2, '#6aa83f'); }
    });
  }
  /** 3/4 top-down rock: lit top face, darker front face, rim highlight. pal dark->light (5-6) */
  function rock3q(P, cx, cy, rx, ry, pal, seed, opts = {}) {
    const r = rng(seed), p1 = r() * 6.28, p2 = r() * 6.28, n = pal.length;
    const rimY = x => { const nx = clamp((x + 0.5 - cx) / rx, -1, 1); return cy + ry * (opts.topFrac !== undefined ? opts.topFrac : 0.05) + Math.sqrt(1 - nx * nx) * ry * 0.28 + Math.sin(x * 0.9 + p1) * 0.6; };
    for (let y = Math.floor(cy - ry - 2); y <= Math.ceil(cy + ry + 1); y++) for (let x = Math.floor(cx - rx - 2); x <= Math.ceil(cx + rx + 2); x++) {
      const nx = (x + 0.5 - cx) / rx, ny = (y + 0.5 - cy) / ry, a = Math.atan2(ny, nx);
      let rr = 1 + 0.1 * Math.sin(a * 3 + p1) + 0.06 * Math.sin(a * 5 + p2); if (ny > 0.3) rr += (ny - 0.3) * 0.25; // flatter, wider base
      if (Math.hypot(nx, ny) > rr) continue;
      const yb = rimY(x), b = BAYER[y & 3][x & 3] / 16 - 0.47;
      if (y < yb) { // top face
        const ty = (y - (cy - ry)) / Math.max(1, yb - (cy - ry)), tx = (nx + 1) / 2;
        const t = 1 - (tx * 0.55 + ty * 0.45);
        P.set(x, y, pal[clamp(Math.round(2 + t * (n - 3) + b * 0.9), 2, n - 1)]);
      } else { // front face
        const t = (y - yb) / Math.max(1, cy + ry - yb);
        P.set(x, y, pal[clamp(Math.round(1.6 - t * 1.2 - (nx > 0.3 ? 0.5 : 0) + b * 0.9), 0, 2)]);
      }
    }
    // rim highlight along top/front edge
    for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) { const y = Math.floor(rimY(x)); if (P.a(x, y) && P.a(x, y - 1)) { P.set(x, y - 1, x < cx + rx * 0.3 ? pal[n - 1] : pal[n - 2]); P.set(x, y, pal[1]); } }
    // facets / cracks
    if (opts.crack !== false) { for (let k = 0; k < (rx > 12 ? 3 : 2); k++) { let x = cx - rx * 0.5 + r() * rx, y = rimY(x) + 1; for (let i = 0; i < ry * 0.5; i++) { if (P.a(x, y + 1)) P.set(x, y, pal[0]); x += r() < 0.3 ? 1 : 0; y += 1; } } const fx = cx - rx * 0.1; P.line(fx, cy - ry * 0.55, fx + rx * 0.35, rimY(fx + rx * 0.35) - 1, pal[2]); }
    for (let i = 0; i < rx * ry * 0.25; i++) { const x = cx - rx + r() * rx * 2, y = cy - ry + r() * ry * 1.2; if (P.a(x, y) && y < rimY(x) - 1) P.set(x, y, r() < 0.5 ? pal[n - 1] : pal[2]); }
    return rimY;
  }
  function rockSpr(W, pal, seed, opts = {}) {
    const cx = W / 2, rx = W * (opts.rx || 0.38), ry = W * (opts.ry || 0.3), cy = W - 3 - ry * 1.1;
    return withShadow(W, W, S => groundShadow(S, cx + 1, cy + ry * 1.05, rx * 1.12, Math.max(2, ry * 0.35), 0.3), P => {
      const rimY = rock3q(P, cx, cy, rx, ry, pal, seed, opts);
      const r = rng(seed + 5);
      if (opts.moss) for (let i = 0; i < W; i++) { const x = cx - rx * 0.8 + r() * rx * 1.1, y = cy - ry * 0.95 + r() * ry * 0.6; if (P.a(x, y) && y < rimY(x) - 1) P.set(x, y, r() < 0.5 ? '#5a8a36' : '#86b44c'); }
      if (opts.ore) opts.ore(P, cx, cy - ry * 0.25, rx * 0.75, ry * 0.55, r);
    });
  }
  /** leafy clump seen from above-front: overlapping shaded leaf blobs, back row first */
  function leafClump(P, cx, base, w, h, pal, seed, n, tipPal) {
    const r = rng(seed), parts = [];
    for (let i = 0; i < n; i++) { const v = r(), u = (r() * 2 - 1) * (1 - v * 0.35); parts.push([cx + u * w, base - 2.5 - v * h, 2.6 + r() * 1.5]); }
    parts.sort((a, b) => a[1] - b[1]);
    // pointed leaf tips poking out around the clump
    const T = tipPal || pal;
    for (let i = 0; i < 7; i++) { const a = deg(-180 + i * 30 + r() * 10), x = cx + Math.cos(a) * w * 0.7, y = base - 3 - h * 0.45 + Math.sin(a) * h * 0.6; leaf(P, x, y, a, 3.5 + r() * 1.5, 1.3, [T[1], T[2], T[3], T[4]]); }
    parts.forEach(([x, y, rr], i) => blob(P, x, y, rr, rr * 0.82, pal, seed + i * 7, 0.28, 0.8));
    // leaf veins / separations for texture
    for (let i = 0; i < n * 2; i++) { const x = cx - w + r() * w * 2, y = base - 2 - r() * (h + 3); if (P.a(x, y) && P.a(x + 1, y)) P.set(x, y, r() < 0.6 ? pal[4] : pal[1]); }
  }
  const WEED_PAL = ['#14341a', '#235420', '#387628', '#5c9a32', '#90c44c'];
  function weedsSpr(kind) {
    return withShadow(24, 24, S => groundShadow(S, 12, 20.5, 9, 2.4, 0.32), P => {
      if (kind === 0) leafClump(P, 12, 21, 6.5, 7, WEED_PAL, 401, 9);
      if (kind === 1) {
        leafClump(P, 12, 21, 6, 6, ['#183a18', '#2a5c22', '#42802a', '#68a636', '#9ccc52'], 411, 8);
        [[8, 12, '#ffffff', '#c8c8dc'], [14, 10, '#f7d84a', '#c8961a'], [16, 15, '#ffffff', '#c8c8dc'], [10, 16, '#f4a6c8', '#c86a92']].forEach(([x, y, a, d]) => {
          P.set(x, y - 1, a); P.set(x - 1, y, a); P.set(x + 1, y, d); P.set(x, y + 1, d); P.set(x, y, '#f2a630'); P.set(x - 1, y - 1, a);
        });
      }
      if (kind === 2) { // tall grass tuft: blades fan up from a dense base, back blades darker
        const r = rng(421), G2 = ['#22401a', '#34601e', '#4c8026', '#70a032', '#9cc04a'];
        P.ell(12, 19.5, 7, 2.6, G2[1]);
        const blades = []; for (let i = 0; i < 16; i++) { const bx = 5.5 + r() * 13, by = 18 + r() * 3; blades.push([bx, by, (bx - 12) * 0.55 + (r() - 0.5) * 3, 9 + r() * 7]); }
        blades.sort((a, b) => a[1] - b[1]);
        blades.forEach(([bx, by, lean, hh], i) => { const front = by > 19.5, c = front ? [G2[3], G2[4]] : [G2[1], G2[2]]; P.poly([[bx - 1.1, by], [bx + lean, by - hh], [bx + 1.1, by]], c[0]); P.line(bx - 0.4, by - 1, bx + lean * 0.9, by - hh * 0.9, c[1]); });
        P.ell(12, 20.3, 6, 1.4, G2[0]);
        for (let x = 7; x < 18; x += 2) P.set(x, 19, G2[2]);
      }
      for (let y = 15; y < 23; y++) for (let x = 0; x < 24; x++) P.tint(x, y, '#0a160a', (y - 14) * 0.035); // front faces in shade
    });
  }

  /* ---------------- building helpers ---------------- */
  function shingles(P, x0, y0, w, h, base, inset = 0, seed = 1) {
    const C = ramp(base, 5, 0.4), r = rng(seed);
    for (let y = y0; y < y0 + h; y++) {
      const t = (y - y0) / h, l = Math.round(x0 + inset * (1 - t)), rr = Math.round(x0 + w - inset * (1 - t));
      const row = Math.floor((y - y0) / 4), ry = (y - y0) % 4, off = (row % 2) * 3;
      for (let x = l; x < rr; x++) {
        const cx = (x - x0 + off) % 6; let c = C[2];
        if (ry === 3) c = C[0]; else if (ry === 0) c = C[3]; else if (cx === 0) c = C[1]; else if (cx === 1 && ry === 1) c = C[4];
        if (ry !== 3 && ((x * 13 + row * 7) % 17 === 0)) c = C[1];
        P.set(x, y, c);
      }
      P.set(l, y, C[3]); P.set(rr - 1, y, C[0]);
    }
    for (let x = x0 + inset; x < x0 + w - inset; x++) { P.set(x, y0, C[4]); P.set(x, y0 + 1, C[3]); }
  }
  function siding(P, x0, y0, w, h, base, plank = 4) {
    const C = ramp(base, 4, 0.3);
    for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) {
      const k = (y - y0) % plank; let c = k === plank - 1 ? C[0] : k === 0 ? C[3] : C[2];
      if (k !== plank - 1 && (x * 7 + Math.floor((y - y0) / plank) * 11) % 23 === 0) c = C[1];
      P.set(x, y, c);
    }
  }
  function vplanks(P, x0, y0, w, h, base, pw = 4) {
    const C = ramp(base, 4, 0.3);
    for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) { const k = (x - x0) % pw; let c = k === pw - 1 ? C[0] : k === 0 ? C[3] : C[2]; if ((y * 5 + x) % 19 === 0 && k) c = C[1]; P.set(x, y, c); }
  }
  function logs(P, x0, y0, w, h, base) {
    const C = ramp(base, 5, 0.4);
    for (let y = y0; y < y0 + h; y++) { const k = (y - y0) % 5; for (let x = x0; x < x0 + w; x++) { let c = [C[3], C[2], C[2], C[1], C[0]][k]; if (k === 1 && (x * 3 + y) % 9 === 0) c = C[4]; if (k === 2 && (x + y * 7) % 11 === 0) c = C[1]; P.set(x, y, c); } }
    for (let y = y0; y + 4 < y0 + h + 1; y += 5) { [x0 - 2, x0 + w - 2].forEach(ex => { P.ball(ex + 2, y + 2, 2.6, 2.4, ['#7a5430', '#c9a06a', '#e0bc84'], 0.2); P.set(ex + 2, y + 2, '#9a7040'); }); }
  }
  function stoneWall(P, x0, y0, w, h, pal, seed = 3) {
    const r = rng(seed); P.rect(x0, y0, w, h, pal[0]);
    let y = y0;
    while (y < y0 + h) {
      const bh = 4 + Math.floor(r() * 2); let x = x0 - Math.floor(r() * 4);
      while (x < x0 + w) {
        const bw = 5 + Math.floor(r() * 5), base = pal[2 + Math.floor(r() * 2)];
        for (let yy = 0; yy < bh - 1; yy++) for (let xx = 0; xx < bw - 1; xx++) {
          const px = x + xx, py = y + yy; if (px < x0 || px >= x0 + w || py >= y0 + h) continue;
          let c = base; if (yy === 0 || xx === 0) c = shade(base, 0.08); if (yy === bh - 2 || xx === bw - 2) c = shade(base, -0.08);
          P.set(px, py, c);
        }
        x += bw;
      }
      y += bh;
    }
  }
  function windowW(P, x, y, w, h, o = {}) {
    const fr = o.frame || '#f2e6c8', frD = shade(fr, -0.25);
    P.rect(x - 1, y - 1, w + 2, h + 2, frD); P.rect(x, y, w, h, fr);
    const gl = o.lit ? ['#f2a640', '#ffd27a', '#fff0b8'] : ['#2f4f7a', '#5a86b8', '#9cc8ec'];
    P.rect(x + 1, y + 1, w - 2, h - 2, gl[0]);
    for (let j = 1; j < h - 1; j++) for (let i = 1; i < w - 1; i++) { if ((i + (h - j)) % 7 < 2 && j < h - 2) P.set(x + i, y + j, gl[2]); else if (j < h / 2) P.set(x + i, y + j, gl[1]); }
    P.vline(x + Math.floor(w / 2), y, y + h - 1, fr); P.hline(x, x + w - 1, y + Math.floor(h / 2), fr);
    P.hline(x - 2, x + w + 1, y + h + 1, frD); P.hline(x - 2, x + w + 1, y + h, fr); // sill
    if (o.shutters) { const S = ramp(o.shutters, 3, 0.3); [x - 5, x + w + 1].forEach(sx => { P.rect(sx, y - 1, 4, h + 1, S[1]); for (let j = 0; j < h + 1; j += 2) P.hline(sx, sx + 3, y - 1 + j, S[0]); P.vline(sx, y - 1, y + h - 1, S[2]); }); }
    if (o.box) { P.rect(x - 1, y + h + 2, w + 2, 3, WOOD[2]); P.hline(x - 1, x + w, y + h + 2, WOOD[3]); for (let i = 0; i < w + 2; i += 2) { P.set(x - 1 + i, y + h + 1, '#4a8a34'); P.set(x + i, y + h, i % 4 ? '#e85a5a' : '#f6d65a'); } }
  }
  function doorD(P, x, y, w, h, col, o = {}) {
    const C = ramp(col, 4, 0.3);
    P.rect(x - 2, y - 2, w + 4, h + 2, WOOD[1]); P.rect(x - 1, y - 1, w + 2, h + 1, WOOD[3]);
    vplanks(P, x, y, w, h, col, 3);
    if (o.arch) for (let i = 0; i < w; i++) { const d = Math.abs(i - (w - 1) / 2) / (w / 2); const cut = Math.round((1 - Math.sqrt(1 - d * d)) * 3); for (let k = 0; k < cut; k++) P.set(x + i, y + k, WOOD[1]); }
    if (o.double) P.vline(x + Math.floor(w / 2), y, y + h - 1, C[0]);
    if (o.window) { P.rect(x + 2, y + 3, w - 4, 4, '#ffd27a'); P.rect(x + 2, y + 3, w - 4, 1, '#fff0b8'); P.vline(x + Math.floor(w / 2), y + 3, y + 6, C[0]); }
    P.hline(x, x + w - 1, y + Math.floor(h * 0.3), C[0]); P.hline(x, x + w - 1, y + Math.floor(h * 0.75), C[0]);
    P.set(x + w - 3, y + Math.floor(h * 0.55), '#f2d27a'); P.set(x + w - 3, y + Math.floor(h * 0.55) + 1, '#a8700f');
    if (o.double) P.set(x + Math.floor(w / 2) - 2, y + Math.floor(h * 0.55), '#f2d27a');
  }
  function smoke(P, x, y) { [[0, 0, 3], [2, -5, 3.6], [-1, -11, 4.2], [3, -17, 4.6]].forEach(([dx, dy, r], i) => P.ell(x + dx, y + dy, r, r * 0.85, i % 2 ? '#d8d4d0' : '#c4c0bc', 0.55 - i * 0.1)); }
  function chimney(P, x, y, w, h, brick = '#9a4a32') {
    const C = ramp(brick, 4, 0.3);
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) { const row = Math.floor(j / 3), off = row % 2 ? 2 : 0; let c = (j % 3 === 2) || ((i + off) % 4 === 3) ? C[0] : (i < 2 ? C[3] : C[2]); P.set(x + i, y + j, c); }
    P.rect(x - 1, y - 2, w + 2, 3, C[1]); P.hline(x - 1, x + w, y - 2, C[3]);
  }
  function sign(P, x, y, str, bg = WOOD[2], fg = '#f8e8c0') {
    const w = textW(str) + 6, C = ramp(bg, 4, 0.3);
    P.rect(x, y, w, 9, C[1]); P.rect(x + 1, y + 1, w - 2, 7, C[2]); P.hline(x + 1, x + w - 2, y + 1, C[3]);
    text(P, str, x + 3, y + 2, fg, C[0]);
    return w;
  }
  function crate(P, x, y, s = 8) { const C = ramp('#b07a42', 4, 0.3); P.rect(x, y, s, s, C[2]); P.rect(x, y, s, 1, C[3]); P.rect(x, y + s - 1, s, 1, C[0]); P.vline(x, y, y + s - 1, C[1]); P.vline(x + s - 1, y, y + s - 1, C[0]); P.line(x + 1, y + 1, x + s - 2, y + s - 2, C[1]); P.hline(x, x + s - 1, Math.floor(y + s / 2), C[1]); }
  function barrel(P, x, y, w = 8, h = 10) { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) { const u = i / (w - 1); let c = u < 0.3 ? WOOD[4] : u < 0.7 ? WOOD[3] : WOOD[1]; if (j === 1 || j === h - 2) c = '#4a4a52'; P.set(x + i, y + j, c); } P.ell(x + w / 2, y, w / 2, 1.5, WOOD[2]); }

  /* ---------------- buildings ---------------- */
  function buildFarmhouse() {
    return withShadow(120, 120, S => { S.rect(6, 112, 108, 6, '#1a0f08', 0.22); }, P => {
      chimney(P, 86, 12, 9, 22, '#a04a30'); smoke(P, 91, 7);
      shingles(P, 2, 14, 116, 52, '#a8452f', 12, 3);
      // gable vent
      P.ell(60, 30, 6, 5, '#7a3020'); P.ell(60, 30, 5, 4, '#3a1c12'); for (let i = -4; i <= 4; i += 2) P.vline(60 + i, 27, 33, '#7a3020');
      siding(P, 8, 64, 104, 50, '#c8925a', 4);
      P.rect(8, 64, 104, 2, '#4a2a18'); // eave shadow
      P.vline(8, 64, 113, '#8a5a34'); P.vline(111, 64, 113, '#6a4024');
      stoneWall(P, 6, 110, 108, 9, STONE, 11);
      // porch roof over door
      P.poly([[44, 74], [76, 74], [79, 80], [41, 80]], '#8a3a26'); P.hline(41, 78, 80, '#5a2416'); P.hline(45, 75, 74, '#c0583c');
      P.vline(44, 81, 110, WOOD[3]); P.vline(45, 81, 110, WOOD[1]); P.vline(75, 81, 110, WOOD[3]); P.vline(76, 81, 110, WOOD[1]);
      doorD(P, 51, 85, 18, 27, '#7a4626', { window: true });
      P.rect(48, 112, 24, 3, STONE[3]); P.rect(48, 115, 24, 3, STONE[2]); P.hline(48, 71, 112, STONE[4]);
      windowW(P, 18, 80, 18, 16, { shutters: '#4f8a4a', box: true });
      windowW(P, 84, 80, 18, 16, { shutters: '#4f8a4a', box: true });
      // lantern
      P.rect(40, 84, 3, 4, '#3a2a1a'); P.rect(41, 85, 1, 2, '#ffd27a');
      // little attic window
      windowW(P, 54, 44, 12, 10, { frame: '#f2e6c8' });
    });
  }
  function buildShopStall() {
    return withShadow(72, 84, S => S.rect(2, 80, 68, 4, '#1a0f08', 0.22), P => {
      // posts
      [4, 66].forEach(x => { P.rect(x, 16, 3, 66, WOOD[2]); P.vline(x, 16, 81, WOOD[3]); P.vline(x + 2, 16, 81, WOOD[1]); });
      // back wall with shelf
      vplanks(P, 7, 28, 59, 24, '#8c5a31', 5);
      P.rect(7, 38, 59, 2, WOOD[4]); P.hline(7, 65, 40, WOOD[0]);
      [[10, 33], [18, 34], [46, 33], [56, 34]].forEach(([x, y], i) => { P.rect(x, y, 4, 5, ['#e8a0a0', '#9ad0f0', '#f2d27a', '#b8e090'][i]); P.rect(x, y - 1, 4, 1, '#c8b8a0'); });
      crate(P, 27, 41, 9); crate(P, 37, 43, 7); barrel(P, 54, 42, 8, 10);
      // awning
      for (let y = 8; y < 26; y++) {
        const t = (y - 8) / 18, l = Math.round(10 - 8 * t), r = Math.round(62 + 8 * t);
        for (let x = l; x < r; x++) { const stripe = Math.floor((x - 36) / (6 + 2 * t) + 100) % 2; let c = stripe ? '#d8463a' : '#f6ecd6'; if (y === 8) c = stripe ? '#f0705a' : '#ffffff'; if (y > 22) c = stripe ? '#b4362c' : '#e0d4bc'; P.set(x, y, c); }
      }
      for (let i = 0; i < 12; i++) { const cx = 3 + i * 6 + 3; const stripe = i % 2; P.ell(cx, 26, 3, 2.4, stripe ? '#f6ecd6' : '#d8463a'); P.hline(cx - 2, cx + 2, 27, stripe ? '#d8ccb4' : '#a8302a'); }
      // sign
      P.rect(24, 0, 24, 10, WOOD[1]); P.rect(25, 1, 22, 8, WOOD[3]); P.hline(25, 46, 1, WOOD[4]);
      text(P, 'SHOP', 28, 3, '#fff2cc', WOOD[0]);
      P.vline(28, 10, 8, WOOD[1]); P.vline(43, 10, 8, WOOD[1]);
      // counter
      P.rect(4, 52, 65, 6, '#d6a46a'); P.hline(4, 68, 52, '#ecc48a'); P.hline(4, 68, 57, WOOD[1]);
      // three shelf spots on the counter top (cloth mats)
      [[8, 53], [28, 53], [48, 53]].forEach(([x, y]) => { P.rect(x, y, 16, 4, '#efe2c0'); P.hline(x, x + 15, y + 3, '#cdb990'); P.set(x, y, '#c8463a'); P.set(x + 15, y, '#c8463a'); });
      vplanks(P, 5, 58, 63, 23, '#9a6234', 5);
      P.hline(5, 67, 58, WOOD[0]); P.hline(5, 67, 69, WOOD[1]); P.hline(5, 67, 80, WOOD[0]);
    });
  }
  function storeBase(opts) {
    return withShadow(144, 144, S => S.rect(6, 138, 132, 6, '#1a0f08', 0.22), P => opts(P));
  }
  function buildGeneral() {
    return storeBase(P => {
      chimney(P, 22, 10, 8, 20, '#8a4a32');
      shingles(P, 2, 14, 140, 52, '#3f7a4e', 14, 7);
      siding(P, 8, 64, 128, 76, '#ead3a0', 4);
      P.rect(8, 64, 128, 2, '#4a3418');
      [8, 135].forEach(x => P.rect(x, 64, 2, 76, '#a87a48'));
      stoneWall(P, 6, 134, 132, 10, STONE, 21);
      // sign
      const w = textW('GENERAL STORE') + 6; sign(P, 72 - Math.floor(w / 2), 68, 'GENERAL STORE', '#3f6e4a', '#fff2cc');
      // awnings over windows
      const awn = (x0, w) => { for (let y = 84; y < 92; y++) for (let x = x0 - (y - 84) / 3; x < x0 + w + (y - 84) / 3; x++) P.set(x, y, Math.floor((x - x0) / 5) % 2 ? '#f4ecd8' : '#3f8a4e'); for (let i = 0; i < w; i += 5) P.ell(x0 + i + 2.5, 92, 2.6, 1.8, Math.floor(i / 5) % 2 ? '#f4ecd8' : '#3f8a4e'); };
      windowW(P, 18, 94, 34, 22, { frame: '#f2e6c8' }); awn(16, 40);
      windowW(P, 92, 94, 34, 22, { frame: '#f2e6c8' }); awn(90, 40);
      // goods in windows
      [[22, 108, '#e04a2a'], [28, 109, '#f2c94c'], [34, 108, '#8fbf4a'], [98, 108, '#e8892a'], [106, 109, '#d8463a'], [114, 108, '#f2e6c8']].forEach(([x, y, c]) => P.ball(x, y, 2.2, 2, ramp(c, 3, 0.3), 0.2));
      doorD(P, 62, 104, 20, 34, '#5a7a4a', { window: true, double: true });
      P.rect(58, 138, 28, 4, STONE[3]); P.hline(58, 85, 138, STONE[4]);
      crate(P, 6, 124, 10); crate(P, 14, 128, 9); crate(P, 9, 117, 8); barrel(P, 128, 124, 9, 12); crate(P, 118, 128, 9);
      P.ball(12, 116, 3, 2, ramp('#e8892a', 3, 0.3)); P.ball(16, 118, 2.5, 2, ramp('#e04a2a', 3, 0.3));
    });
  }
  function buildBlacksmith() {
    return storeBase(P => {
      const SL = ['#2a2f3a', '#3a4252', '#4c566a', '#606b82', '#7b87a0'];
      stoneWall(P, 106, 12, 18, 54, ['#2e2a27', '#3e3934', '#5a534b', '#6e665c', '#857c70'], 4); P.rect(104, 10, 22, 3, '#3e3934'); P.hline(104, 125, 10, '#6e665c');
      smoke(P, 114, 6); smoke(P, 118, 1);
      shingles(P, 2, 18, 140, 48, '#4c566a', 12, 9);
      stoneWall(P, 8, 64, 128, 78, ['#3a3530', '#544c44', '#6e665b', '#857c6f', '#9a9184'], 31);
      P.rect(8, 64, 128, 2, '#1a1612');
      // forge window glowing
      P.rect(16, 94, 30, 22, '#2a1a10'); for (let j = 0; j < 20; j++) for (let i = 0; i < 28; i++) { const d = Math.hypot(i - 14, j - 16) / 16; P.set(17 + i, 95 + j, d < 0.4 ? '#ffe28a' : d < 0.7 ? '#f6a040' : d < 1 ? '#c8502a' : '#5a2a14'); }
      P.rect(14, 92, 34, 2, '#3a3530'); P.rect(14, 116, 34, 3, '#6e665b');
      for (let i = 0; i < 5; i++) P.vline(20 + i * 6, 95, 115, '#2a2420');
      windowW(P, 100, 92, 26, 18, { frame: '#9a9184', lit: true });
      // sign with anvil
      sign(P, 52, 70, 'FORGE', '#4a3a2a', '#ffd27a');
      doorD(P, 62, 104, 20, 34, '#5a3a22', { double: true, arch: true });
      P.rect(58, 138, 28, 4, STONE[2]);
      // anvil on stump out front
      P.rect(112, 130, 12, 10, BARK[2]); P.hline(112, 123, 130, '#c9a06a'); P.vline(123, 130, 139, BARK[0]);
      P.rect(108, 124, 20, 3, '#5a5f6a'); P.rect(106, 123, 22, 2, '#8a909c'); P.rect(114, 127, 8, 3, '#4a4e58'); P.rect(104, 124, 4, 2, '#6a707c');
      // tools on wall
      P.line(28, 76, 28, 88, WOOD[2]); P.rect(25, 75, 7, 3, '#8a909c'); P.line(38, 76, 38, 88, WOOD[2]); P.rect(36, 75, 4, 4, '#8a909c');
    });
  }
  function buildCarpenter() {
    return storeBase(P => {
      chimney(P, 108, 12, 9, 22, '#7a6a5a');
      shingles(P, 2, 16, 140, 50, '#b0602a', 14, 13);
      logs(P, 10, 64, 124, 76, '#9a6236');
      P.rect(10, 64, 124, 2, '#3a2010');
      stoneWall(P, 6, 136, 132, 8, STONE, 41);
      windowW(P, 22, 92, 24, 20, { shutters: '#a8452f', box: true });
      windowW(P, 98, 92, 24, 20, { shutters: '#a8452f', box: true });
      doorD(P, 62, 102, 20, 36, '#8a5228', { double: true, window: true });
      P.rect(58, 138, 28, 4, '#c9a06a');
      // hanging saw sign on a bracket
      P.hline(84, 104, 72, WOOD[0]); P.vline(84, 70, 76, WOOD[0]); P.vline(90, 72, 76, '#3a2a1a'); P.vline(102, 72, 76, '#3a2a1a');
      P.rect(86, 76, 20, 12, WOOD[3]); P.rect(87, 77, 18, 10, '#d6a46a');
      P.rect(89, 79, 12, 4, '#b8c0cc'); for (let i = 0; i < 12; i += 2) P.set(89 + i, 83, '#7a828e'); P.rect(100, 78, 3, 6, '#8a4a22');
      sign(P, 40, 70, 'WOOD', WOOD[1], '#ffe8b0');
      // lumber stack & sawhorse
      for (let k = 0; k < 4; k++) { P.rect(2, 120 + k * 4, 22, 3, k % 2 ? '#c9935a' : '#b07a42'); P.hline(2, 23, 120 + k * 4, '#e0b07a'); P.ball(3, 121 + k * 4, 1.6, 1.6, ['#7a5430', '#c9a06a'], 0); }
      P.rect(112, 126, 22, 3, '#c9935a'); P.line(114, 129, 112, 140, WOOD[1]); P.line(118, 129, 120, 140, WOOD[1]); P.line(128, 129, 126, 140, WOOD[1]); P.line(132, 129, 134, 140, WOOD[1]);
    });
  }
  function buildInn() {
    return storeBase(P => {
      chimney(P, 18, 4, 9, 22, '#9a4a32'); chimney(P, 116, 2, 9, 22, '#9a4a32'); smoke(P, 120, -4);
      shingles(P, 2, 10, 140, 36, '#b2402e', 12, 17);
      const plaster = '#efe0c0', beam = '#5a3820';
      // second storey (slightly overhanging)
      P.rect(6, 44, 132, 40, plaster); P.rect(6, 44, 132, 2, '#3a2010');
      for (let x = 6; x < 138; x += 22) { P.rect(x, 44, 3, 40, beam); }
      P.rect(6, 62, 132, 2, beam); P.rect(6, 82, 132, 3, beam);
      for (let k = 0; k < 6; k++) { const x = 12 + k * 22; P.line(x, 64, x + 10, 81, beam); }
      [[13, 48], [57, 48], [101, 48]].forEach(([x, y]) => windowW(P, x + 4, y, 14, 12, { lit: true, frame: '#f2e6c8', box: true }));
      // ground floor
      P.rect(10, 85, 124, 55, plaster);
      for (let x = 10; x < 134; x += 31) P.rect(x, 85, 3, 55, beam);
      P.rect(133, 85, 3, 55, beam);
      windowW(P, 18, 98, 22, 18, { lit: true, frame: '#f2e6c8' });
      windowW(P, 104, 98, 22, 18, { lit: true, frame: '#f2e6c8' });
      stoneWall(P, 8, 134, 128, 10, STONE, 51);
      doorD(P, 61, 104, 22, 34, '#7a3a22', { double: true, arch: true, window: true });
      P.rect(57, 138, 30, 4, STONE[3]);
      // lanterns
      [[54, 104], [87, 104]].forEach(([x, y]) => { P.rect(x, y, 4, 6, '#2a2018'); P.rect(x + 1, y + 1, 2, 4, '#ffd27a'); P.set(x + 1, y - 1, '#2a2018'); });
      // hanging sign with mug + INN
      P.hline(98, 126, 86, '#2a2018'); P.vline(126, 84, 90, '#2a2018');
      P.vline(101, 86, 89, '#2a2018'); P.vline(123, 86, 89, '#2a2018');
      P.rect(98, 89, 28, 14, WOOD[1]); P.rect(99, 90, 26, 12, '#2f5a3a');
      text(P, 'INN', 101, 93, '#ffd27a', '#10241a');
      P.rect(117, 93, 4, 6, '#f2d27a'); P.rect(117, 92, 4, 1, '#ffffff'); P.vline(121, 94, 97, '#f2d27a');
      // flower barrels
      barrel(P, 46, 128, 8, 10); P.ball(50, 127, 4, 2.5, ramp('#4a8a34', 3, 0.3)); P.set(48, 126, '#e85a5a'); P.set(52, 126, '#f6d65a');
      barrel(P, 90, 128, 8, 10); P.ball(94, 127, 4, 2.5, ramp('#4a8a34', 3, 0.3)); P.set(92, 126, '#f4a6c8'); P.set(96, 126, '#e85a5a');
    });
  }
  function buildWorkerCabin() {
    return withShadow(72, 96, S => S.rect(4, 91, 64, 5, '#1a0f08', 0.22), P => {
      chimney(P, 52, 4, 7, 18, '#8a4a32');
      shingles(P, 1, 10, 70, 36, '#6a5a8a', 8, 23);
      logs(P, 6, 44, 60, 48, '#a8703c');
      P.rect(6, 44, 60, 2, '#3a2010');
      doorD(P, 28, 64, 16, 28, '#7a4626', {});
      windowW(P, 10, 58, 12, 11, { shutters: '#8a5a9a' }); windowW(P, 50, 58, 12, 11, { shutters: '#8a5a9a' });
      P.rect(26, 92, 20, 3, STONE[3]);
    });
  }
  function buildGreenhouse() {
    return withShadow(144, 144, S => S.rect(4, 138, 136, 6, '#1a0f08', 0.22), P => {
      const fr = '#f2f2ea', frD = '#b8bcb4';
      // roof (glass)
      for (let y = 26; y < 72; y++) { const t = (y - 26) / 46, l = Math.round(16 - 12 * t), r = Math.round(128 + 12 * t); for (let x = l; x < r; x++) { const k = (x + y) % 9; P.set(x, y, k < 2 ? '#d8f0f8' : (y < 40 ? '#8cc8e0' : '#6aaed0')); } }
      for (let y = 26; y < 72; y += 9) { const t = (y - 26) / 46; P.hline(Math.round(16 - 12 * t), Math.round(128 + 12 * t), y, fr); }
      for (let i = 0; i <= 8; i++) P.line(16 + i * 14, 26, 4 + i * 17, 71, fr);
      P.hline(14, 130, 24, frD); P.hline(14, 130, 25, fr);
      // walls (glass, with plants)
      P.rect(6, 72, 132, 64, '#7cc0d8');
      for (let i = 0; i < 9; i++) blob(P, 16 + i * 14, 118, 6, 9, ramp('#4f9a3a', 4, 0.36), 70 + i, 0.15, 0.5);
      for (let i = 0; i < 9; i++) P.ball(12 + i * 15, 112, 1.4, 1.4, ['#c8302a', '#f06050'], 0);
      for (let y = 74; y < 136; y++) for (let x = 7; x < 137; x++) { if ((x - y + 400) % 15 < 3) P.tint(x, y, '#ffffff', 0.35); else P.tint(x, y, '#9ad4e8', 0.25); }
      for (let x = 6; x <= 138; x += 16) P.rect(x, 72, 2, 64, fr);
      P.rect(6, 72, 132, 2, fr); P.rect(6, 100, 132, 2, fr); P.rect(6, 70, 132, 2, frD);
      stoneWall(P, 4, 132, 136, 12, ['#5a2a1c', '#7a3a28', '#9a4a32', '#b05a3a', '#c86a48'], 61);
      // door
      P.rect(60, 100, 24, 36, frD); P.rect(62, 102, 20, 34, '#a8dcec'); P.vline(72, 102, 135, fr); P.rect(62, 116, 20, 2, fr);
      P.set(69, 120, '#f2d27a'); P.set(75, 120, '#f2d27a');
      P.rect(58, 138, 28, 4, STONE[3]);
    });
  }
  function buildShed() {
    return withShadow(96, 96, S => S.rect(4, 91, 88, 5, '#1a0f08', 0.22), P => {
      shingles(P, 1, 8, 94, 38, '#5a4a3a', 10, 29);
      vplanks(P, 6, 44, 84, 48, '#b03a2c', 5);
      P.rect(6, 44, 84, 2, '#3a1410'); P.rect(6, 44, 3, 48, '#f2e6c8'); P.rect(87, 44, 3, 48, '#f2e6c8');
      // double barn doors
      P.rect(30, 56, 36, 36, '#f2e6c8');
      [[32, 58], [49, 58]].forEach(([x, y]) => { vplanks(P, x, y, 15, 34, '#a03428', 5); P.line(x, y, x + 14, y + 33, '#f2e6c8'); P.line(x + 14, y, x, y + 33, '#f2e6c8'); P.rect(x, y, 15, 2, '#f2e6c8'); });
      P.set(46, 74, '#3a3a3a'); P.set(50, 74, '#3a3a3a');
      windowW(P, 40, 26, 16, 10, { frame: '#f2e6c8' });
      windowW(P, 12, 58, 10, 10, { frame: '#f2e6c8' }); windowW(P, 74, 58, 10, 10, { frame: '#f2e6c8' });
    });
  }
  function buildSilo() {
    return withShadow(48, 84, S => S.rect(2, 80, 44, 4, '#1a0f08', 0.22), P => {
      const body = ['#6a3a2a', '#8a4a32', '#a85a3a', '#c06e48', '#d88a5c'];
      for (let y = 18; y < 76; y++) for (let x = 6; x < 42; x++) { const u = (x - 6) / 36; let c = u < 0.15 ? body[3] : u < 0.45 ? body[2] : u < 0.8 ? body[1] : body[0]; if ((y - 18) % 6 === 5) c = shade(c, -0.12); if (u > 0.2 && u < 0.3 && (y - 18) % 6 === 0) c = body[4]; P.set(x, y, c); }
      [30, 50, 68].forEach(y => { P.hline(6, 41, y, '#4a4e58'); P.hline(6, 41, y + 1, '#8a909c'); });
      for (let y = 4; y < 20; y++) { const t = (y - 4) / 16, hw = 18 * Math.sqrt(1 - (1 - t) * (1 - t)) + 1; for (let x = Math.round(24 - hw); x < Math.round(24 + hw); x++) { const u = (x - (24 - hw)) / (2 * hw); P.set(x, y, u < 0.3 ? '#c8ccd4' : u < 0.7 ? '#9aa0ac' : '#6a707c'); } }
      P.hline(5, 42, 19, '#4a4e58');
      P.rect(20, 30, 8, 10, '#5a3a22'); P.rect(21, 31, 6, 8, '#7a4a2a');
      stoneWall(P, 4, 74, 40, 10, STONE, 71);
      P.vline(37, 22, 73, '#4a4e58'); for (let y = 24; y < 72; y += 4) P.hline(36, 38, y, '#6a707c');
    });
  }

  /* ---------------- mine ---------------- */
  const MROCK = ['#2f2620', '#463a30', '#5e4f42', '#7a6858', '#98846f', '#b09c86'];
  const MROCK2 = ['#28242e', '#3c3746', '#544e60', '#6e687c', '#8a8498', '#a6a0b2'];
  function oreChunks(cols, n = 5) { return (P, cx, cy, rx, ry, r) => { for (let i = 0; i < n; i++) { const a = r() * 6.28, d = r() * 0.6; const x = cx + Math.cos(a) * rx * d, y = cy + Math.sin(a) * ry * d - 1; P.ball(x, y, 1.8 + r() * 0.8, 1.6 + r() * 0.6, cols, 0.2); P.set(x - 0.5, y - 0.8, cols[cols.length - 1]); } }; }
  function crystals(cols, n = 4) { return (P, cx, cy, rx, ry, r) => { for (let i = 0; i < n; i++) { const x = cx - rx * 0.6 + i * rx * 0.4 + r() * 2, base = cy + ry * 0.2, hgt = 6 + r() * 5, w = 1.6 + r(); const lean = (i - n / 2) * 0.8; P.poly([[x - w, base], [x + lean - w * 0.4, base - hgt], [x + lean, base - hgt - 2], [x + lean + w * 0.4, base - hgt], [x + w, base]], cols[1]); P.line(x - w * 0.3, base - 1, x + lean - w * 0.2, base - hgt, cols[2]); P.set(x + lean, base - hgt - 1, cols[3]); } }; }
  function ladderDown() {
    return mk(24, 24, P => {
      P.ell(12, 13, 10, 7, MROCK[3]); P.ell(12, 13, 9, 6, MROCK[2]); P.ell(12, 13.5, 7.5, 5, '#120c09'); P.ell(12, 14.5, 6, 3.6, '#000000');
      for (let i = 0; i < 18; i++) { const a = i / 18 * 6.28; P.set(12 + Math.cos(a) * 9.5, 13 + Math.sin(a) * 6.5, i % 3 ? MROCK[4] : MROCK[1]); }
      P.vline(8, 7, 16, WOOD[3]); P.vline(16, 7, 16, WOOD[2]); P.vline(9, 9, 16, WOOD[1]); P.vline(15, 9, 16, WOOD[1]);
      for (let y = 9; y < 17; y += 3) P.hline(9, 15, y, y > 13 ? WOOD[1] : WOOD[3]);
      P.set(8, 6, WOOD[4]); P.set(16, 6, WOOD[3]);
    });
  }
  function ladderUp() {
    return withShadow(24, 24, S => { S.ell(12, 22, 9, 2, '#1a0f08', 0.3); for (let y = 0; y < 22; y++) S.rect(5, y, 14, 1, '#ffe8a0', 0.12 * (1 - y / 22)); }, P => {
      P.rect(6, 0, 2, 23, WOOD[3]); P.vline(7, 0, 22, WOOD[1]); P.rect(16, 0, 2, 23, WOOD[2]); P.vline(17, 0, 22, WOOD[0]);
      for (let y = 2; y < 22; y += 4) { P.hline(8, 15, y, WOOD[3]); P.hline(8, 15, y + 1, WOOD[1]); }
      P.ball(4, 21, 2.4, 1.8, MROCK.slice(1, 5), 0.3); P.ball(20, 21, 2.6, 2, MROCK.slice(1, 5), 0.3);
    });
  }
  function elevatorSpr() {
    return mk(24, 48, P => {
      stoneWall(P, 0, 0, 24, 48, MWALL, 81);
      P.rect(2, 10, 20, 37, '#2a2a30'); P.rect(3, 11, 18, 35, '#4a4e58');
      P.rect(4, 14, 16, 32, '#1a1a1e');
      for (let x = 5; x < 20; x += 3) P.vline(x, 14, 45, '#8a909c');
      P.line(5, 16, 19, 30, '#6a707c'); P.line(19, 16, 5, 30, '#6a707c'); P.line(5, 30, 19, 44, '#6a707c'); P.line(19, 30, 5, 44, '#6a707c');
      P.rect(2, 8, 20, 3, '#a87a3a'); P.hline(2, 21, 8, '#e0b060');
      P.rect(8, 2, 8, 6, '#2a2a30'); P.rect(9, 3, 6, 4, '#3a1a10'); P.poly([[12, 3.5], [14.5, 6.5], [9.5, 6.5]], '#f6a040'); // arrow lamp
      P.rect(21, 22, 2, 5, '#3a3a40'); P.set(21, 23, '#e04a2a'); P.set(21, 25, '#7ad04a');
    });
  }
  function mineEntrance() {
    return withShadow(72, 72, S => { S.ell(36, 70, 18, 3, '#000', 0.35); }, P => {
      // rock mass
      blob(P, 36, 38, 35, 32, CLIFF, 91, 0.06, 0.6);
      P.rect(2, 44, 68, 28, CLIFF[1]);
      { const r = rng(97); for (let y = 30; y < 72; y += 7) for (let x = 2 + (y % 2) * 4; x < 70; x += 9) blob(P, x + r() * 3, y + r() * 2, 5 + r() * 2, 4 + r(), CLIFF.slice(1), 300 + x * 7 + y, 0.18, 0.7); }
      blob(P, 14, 22, 12, 10, CLIFF.slice(1), 92, 0.15, 0.6); blob(P, 56, 20, 13, 11, CLIFF.slice(1), 94, 0.15, 0.6); blob(P, 36, 12, 14, 10, CLIFF.slice(1), 95, 0.15, 0.6);
      // grass on top
      const g = GRASS[0]; for (let i = 0; i < 16; i++) { const x = 6 + i * 4, y = 6 + Math.abs(i - 8) * 1.4; P.set(x, y, g[3]); P.set(x + 1, y, g[2]); P.set(x, y + 1, g[1]); P.set(x + 2, y - 1, g[4]); }
      // cave opening (arch)
      for (let y = 30; y < 72; y++) for (let x = 20; x < 52; x++) { const dx = (x + 0.5 - 36) / 16, dy = (y - 44) / 14; if (y < 44 && dx * dx + dy * dy > 1) continue; const depth = clamp((y - 30) / 42, 0, 1); P.set(x, y, depth > 0.7 ? '#0a0605' : mix('#000000', '#1e1410', 1 - depth)); }
      // wooden frame
      const B = ['#3a2412', '#5a3a1e', '#7a5028', '#9a6a36'];
      P.rect(20, 36, 4, 36, B[2]); P.vline(20, 36, 71, B[3]); P.vline(23, 36, 71, B[0]);
      P.rect(48, 36, 4, 36, B[1]); P.vline(48, 36, 71, B[2]); P.vline(51, 36, 71, B[0]);
      P.rect(17, 32, 38, 5, B[2]); P.hline(17, 54, 32, B[3]); P.hline(17, 54, 36, B[0]); P.set(21, 34, B[0]); P.set(50, 34, B[0]);
      P.line(24, 37, 30, 31, B[1]); P.line(47, 37, 42, 31, B[1]);
      // lantern
      P.vline(56, 38, 41, '#2a2018'); P.rect(55, 42, 4, 5, '#2a2018'); P.rect(56, 43, 2, 3, '#ffd27a');
      // rails into the cave
      for (let y = 56; y < 72; y += 3) P.hline(28 - (y - 56) * 0.3, 44 + (y - 56) * 0.3, y, B[1]);
      P.line(30, 52, 26, 71, '#8a909c'); P.line(42, 52, 46, 71, '#8a909c');
      // rubble
      P.ball(12, 68, 4, 3, ROCK.slice(1, 5), 0.5); P.ball(60, 67, 5, 3.4, ROCK.slice(1, 5), 0.5); P.ball(6, 64, 3, 2.4, ROCK.slice(1, 5), 0.5);
    });
  }
  function crystalDecor() {
    return withShadow(24, 24, S => { groundShadow(S, 12, 21, 9, 2.2, 0.32); S.ell(12, 16, 9, 6, '#a0e8ff', 0.1); }, P => {
      rock3q(P, 12, 18, 8, 3.6, MROCK.slice(0, 6), 77, { crack: false });
      const prism = (x, base, hgt, w, lean, C) => { // lit left face, darker right face, faceted top
        P.poly([[x - w, base], [x - w + lean, base - hgt], [x + lean, base - hgt - 2.2], [x + lean, base]], C[2]);
        P.poly([[x + lean, base], [x + lean, base - hgt - 2.2], [x + w + lean, base - hgt], [x + w, base]], C[1]);
        P.poly([[x - w + lean, base - hgt], [x + lean, base - hgt - 2.2], [x + w + lean, base - hgt], [x + lean, base - hgt + 0.8]], C[3]);
        P.line(x - w + 0.6, base - 1, x - w + lean + 0.6, base - hgt + 0.5, C[3]);
      };
      prism(8, 18, 6, 2, -1.2, ['#3a1a5a', '#7a3ab0', '#b47ae0', '#f0d8ff']);
      prism(16.5, 18, 7, 2, 1.2, ['#1a4a6a', '#3a8ac0', '#7ad0f0', '#e0f8ff']);
      prism(12, 19, 11, 2.6, 0, ['#1a4a6a', '#3a9ad0', '#8ae0f8', '#ffffff']);
      P.set(11, 9, '#ffffff'); P.set(20, 6, '#e0f8ff'); P.set(19, 7, '#e0f8ff'); P.set(21, 7, '#e0f8ff'); P.set(20, 8, '#e0f8ff');
    });
  }

  /* ---------------- placeables ---------------- */
  function chestSpr() {
    return withShadow(24, 24, S => groundShadow(S, 12, 21, 9, 2, 0.25), P => {
      const C = ramp('#a8682e', 4, 0.32);
      P.rect(3, 9, 18, 12, C[2]); for (let x = 3; x < 21; x += 4) P.vline(x, 9, 20, C[1]);
      P.rect(3, 4, 18, 6, C[3]); P.ell(12, 5, 9, 2.4, C[3]); P.hline(4, 19, 3, C[3]); P.hline(4, 19, 4, shade(C[3], 0.08));
      P.hline(3, 20, 9, C[0]); P.hline(3, 20, 10, '#5a5f6a');
      [5, 18].forEach(x => { P.vline(x, 3, 20, '#6a707c'); P.vline(x + 1, 3, 20, '#9aa0ac'); });
      P.rect(10, 8, 4, 5, '#d8a830'); P.rect(11, 9, 2, 2, '#fff0a0'); P.set(11, 11, '#5a3a10');
      P.hline(3, 20, 20, C[0]);
    });
  }
  function furnaceSpr(on) {
    return withShadow(24, 24, S => { groundShadow(S, 12, 21, 9, 2, 0.25); if (on) S.ell(12, 16, 10, 7, '#ffa040', 0.22); }, P => {
      blob(P, 12, 13, 9, 9, ['#3a3530', '#544c44', '#6e665b', '#857c6f', '#9a9184'], 101, 0.05, 0.4);
      P.rect(3, 13, 18, 8, '#6e665b'); stoneWall(P, 3, 13, 18, 8, ['#3a3530', '#544c44', '#6e665b', '#857c6f', '#9a9184'], 103);
      for (let y = 5; y < 13; y += 3) for (let x = 4; x < 21; x += 4) if (P.a(x, y)) P.set(x + (y % 2), y, '#3a3530');
      P.rect(8, 1, 6, 4, '#544c44'); P.hline(8, 13, 1, '#857c6f');
      for (let y = 13; y < 21; y++) for (let x = 7; x < 17; x++) { const dx = (x + 0.5 - 12) / 5, dy = (y - 16) / 4; if (y < 16 && dx * dx + dy * dy > 1) continue; P.set(x, y, on ? (y > 17 ? '#ffe28a' : '#f6802a') : '#1a1410'); }
      if (on) { P.poly([[9, 20], [10, 15], [11, 18], [12, 13], [13, 18], [14, 15], [15, 20]], '#ffd040'); P.poly([[11, 20], [12, 16], [13, 20]], '#fff6c0'); }
      P.hline(6, 17, 21, '#3a3530');
    });
  }
  function jarSpr(ready) {
    return withShadow(24, 24, S => groundShadow(S, 12, 21, 8, 2, 0.25), P => {
      P.rect(4, 17, 16, 4, WOOD[2]); P.hline(4, 19, 17, WOOD[3]); P.hline(4, 19, 20, WOOD[0]);
      P.rect(6, 6, 12, 11, '#bfe4ee'); P.ell(12, 6, 6, 1.5, '#d8f0f6');
      const fill = ready ? ['#8a1a2a', '#c8304a', '#f06080'] : ['#5a3a1a', '#8a6030', '#b08a50'];
      P.rect(7, ready ? 8 : 11, 10, ready ? 8 : 5, fill[1]); P.hline(7, 16, ready ? 8 : 11, fill[2]); P.vline(16, ready ? 8 : 11, 15, fill[0]);
      P.vline(7, 7, 15, '#ffffff'); P.vline(8, 7, 10, '#e8f8fc');
      P.rect(6, 3, 12, 3, '#d8b878'); P.hline(6, 17, 3, '#f0d898'); P.hline(5, 18, 5, '#a8884a');
      if (ready) { P.set(19, 3, '#fff6c0'); P.set(19, 1, '#fff6c0'); P.set(18, 2, '#fff6c0'); P.set(20, 2, '#fff6c0'); P.set(19, 2, '#ffffff'); }
    });
  }
  function kegSpr(ready) {
    return withShadow(24, 24, S => groundShadow(S, 12, 21, 8, 2, 0.25), P => {
      for (let y = 4; y < 21; y++) { const bulge = Math.sin((y - 4) / 16 * Math.PI) * 1.6; for (let x = Math.round(5 - bulge); x < Math.round(19 + bulge); x++) { const u = (x - 5 + bulge) / (14 + 2 * bulge); P.set(x, y, u < 0.25 ? WOOD[4] : u < 0.6 ? WOOD[3] : u < 0.85 ? WOOD[2] : WOOD[1]); } }
      for (let x = 5; x < 19; x += 3) P.vline(x, 5, 19, WOOD[1]);
      [6, 12, 18].forEach(y => { P.hline(4, 19, y, '#4a4e58'); P.hline(5, 18, y - 1, '#8a909c'); });
      P.ell(12, 4, 7, 1.8, WOOD[2]); P.ell(12, 4, 5, 1, WOOD[1]);
      P.rect(10, 13, 4, 2, '#c8a030'); P.rect(11, 15, 2, 2, '#a87a10');
      if (ready) { P.ell(12, 3, 6, 2, '#f6ecd6'); P.set(9, 2, '#ffffff'); P.set(14, 1, '#ffffff'); P.set(12, 1, '#f6ecd6'); P.set(20, 3, '#fff6c0'); P.set(20, 1, '#fff6c0'); P.set(19, 2, '#fff6c0'); P.set(21, 2, '#fff6c0'); P.set(20, 2, '#ffffff'); }
    });
  }
  function sprinklerSpr(tier) {
    const M = TIER[tier === 0 ? 1 : tier === 1 ? 2 : 4];
    return withShadow(24, 24, S => groundShadow(S, 12, 18, 7, 2, 0.25), P => {
      P.ell(12, 16, 6, 3, M[1]); P.ell(12, 15, 5.4, 2.4, M[2]); P.ell(11, 14.5, 3, 1.2, M[3]);
      P.rect(11, 9, 3, 6, M[2]); P.vline(11, 9, 14, M[3]); P.vline(13, 9, 14, M[1]);
      P.ball(12, 8, 2.4, 2, M.slice(1), 0.2);
      if (tier >= 1) { P.rect(6, 11, 12, 2, M[2]); P.hline(6, 17, 11, M[3]); P.ball(6, 11, 1.6, 1.6, M.slice(1), 0); P.ball(18, 11, 1.6, 1.6, M.slice(1), 0); }
      if (tier >= 2) { P.ball(12, 5, 2, 2, ['#3a1450', '#a347c4', '#f8d0ff'], 0); P.set(12, 4, '#ffffff'); }
      P.set(12, 7, '#e8f8ff');
    });
  }
  function scarecrowSpr() {
    return withShadow(24, 48, S => groundShadow(S, 12, 45, 6, 1.8, 0.25), P => {
      P.rect(11, 18, 3, 28, WOOD[2]); P.vline(11, 18, 45, WOOD[3]); P.vline(13, 18, 45, WOOD[1]);
      P.rect(2, 20, 20, 2, WOOD[2]); P.hline(2, 21, 20, WOOD[3]);
      // shirt (plaid)
      for (let y = 19; y < 33; y++) for (let x = 5; x < 20; x++) { if (y > 23 && (x < 7 || x > 17)) continue; const c = ((x >> 1) + (y >> 1)) % 2 ? '#c8463a' : '#e86a50'; P.set(x, y, (x % 4 === 0 || y % 4 === 0) ? '#8a2a20' : c); }
      P.rect(1, 20, 4, 3, '#c8463a'); P.rect(19, 20, 4, 3, '#c8463a');
      [[0, 21], [0, 23], [23, 21], [23, 23], [1, 24], [22, 24]].forEach(([x, y]) => P.set(x, y, '#e8c26a'));
      [[8, 33], [10, 34], [14, 34], [16, 33]].forEach(([x, y]) => P.vline(x, y, y + 2, '#e8c26a'));
      // sack head
      P.ball(12, 13, 6, 6, ['#a8884a', '#c8a868', '#e0c890'], 0.4);
      P.set(10, 12, '#2b1a0d'); P.set(14, 12, '#2b1a0d'); P.hline(9, 15, 16, '#5a3a1a'); for (let x = 9; x < 16; x += 2) P.set(x, 15, '#5a3a1a');
      P.hline(8, 16, 19, '#8a6a3a');
      // hat
      P.rect(6, 5, 12, 4, '#e2bb62'); P.rect(7, 2, 10, 4, '#d8a848'); P.hline(7, 16, 6, '#b4452f'); P.rect(3, 8, 18, 2, '#e2bb62'); P.hline(3, 20, 9, '#b8893a'); P.hline(8, 15, 2, '#f4d98a');
      // crow
      P.ball(20, 18, 2, 1.6, ['#1a1a24', '#2a2a3a', '#4a4a5a'], 0); P.set(22, 17, '#f2c94c'); P.set(19, 17, '#4a4a5a');
    });
  }
  function torchSpr() {
    return withShadow(24, 24, S => { groundShadow(S, 12, 22, 4, 1.4, 0.25); }, P => {
      P.rect(11, 10, 3, 12, WOOD[2]); P.vline(11, 10, 21, WOOD[3]); P.vline(13, 10, 21, WOOD[1]);
      P.rect(9, 9, 7, 3, '#5a5f6a'); P.hline(9, 15, 9, '#8a909c');
      P.poly([[9, 9], [10, 5], [11, 7], [12, 2], [13, 6], [14, 4], [16, 9]], '#f6802a'); P.poly([[10.5, 9], [12, 4], [13.5, 9]], '#ffd040'); P.poly([[11.5, 9], [12, 6.5], [12.5, 9]], '#fff6c0');
    });
  }
  function pathStoneSpr() {
    return mk(24, 24, P => {
      [[7, 8, 5, 3.6, 1], [16, 10, 5.5, 4, 2], [10, 17, 6, 4, 3]].forEach(([x, y, rx, ry, s]) => { P.ell(x, y + 1, rx, ry, '#000000', 0.2); blob(P, x, y, rx, ry, STONE.slice(1), 200 + s, 0.08, 0.5); P.hline(x - rx + 2, x + rx - 2, y - ry + 1, STONE[4]); });
    }, 2, 'auto');
  }
  function bobberSpr() {
    return mk(8, 8, P => { P.ball(4, 4.5, 2.8, 2.8, ['#a01a1a', '#e03a2a', '#ff7a6a'], 0.2); for (let x = 1; x < 8; x++) for (let y = 5; y < 8; y++) if (P.a(x, y)) P.set(x, y, y === 5 ? '#d8d8d8' : '#f4f4f4'); P.vline(4, 0, 1, '#2b1a0d'); P.set(3, 3, '#ffd0c8'); }, 2);
  }

  /* ---------------- portraits ---------------- */
  function portrait(o) {
    const P = new Pix(24, 24);
    const bg = ramp(o.bg, 3, 0.2);
    for (let y = 0; y < 24; y++) for (let x = 0; x < 24; x++) { const c = (x === 0 || y === 0 || x === 23 || y === 23) ? null : (y < 12 ? bg[2] : bg[1]); if (c && !((x === 1 || x === 22) && (y === 1 || y === 22))) P.set(x, y, c); }
    const sk = ramp(o.skin, 4, 0.26), hr = ramp(o.hair, 4, 0.32), sh = ramp(o.shirt, 4, 0.3);
    // shoulders
    P.poly([[3, 23], [5, 18], [9, 16], [15, 16], [19, 18], [21, 23]], sh[2]); P.poly([[15, 16], [19, 18], [21, 23], [16, 23]], sh[1]);
    if (o.apron) { P.rect(8, 18, 8, 6, o.apron); P.set(9, 17, o.apron); P.set(14, 17, o.apron); P.hline(8, 15, 18, shade(o.apron, 0.1)); }
    if (o.bandana) { P.poly([[8, 16], [16, 16], [12, 20]], o.bandana); }
    P.rect(10, 14, 4, 3, sk[1]); P.set(13, 15, sk[0]);
    // head
    P.ell(12, 9.5, 5.6, 6.2, sk[2]); for (let y = 4; y < 16; y++) for (let x = 14; x < 18; x++) if (P.a(x, y) && x > 14 + (y < 9 ? 1 : 0)) P.tint(x, y, sk[1], 0.7);
    P.set(6, 10, sk[1]); P.set(6, 11, sk[1]); P.set(18, 10, sk[0]); P.set(18, 11, sk[0]);
    // eyes
    [[9, 10], [14, 10]].forEach(([x, y]) => { P.set(x, y, '#2b1a0d'); P.set(x, y + 1, '#2b1a0d'); P.set(x + 1, y, '#2b1a0d'); P.set(x + 1, y + 1, '#4a3020'); P.set(x, y, '#ffffff'); });
    P.hline(9, 10, 8, hr[0]); P.hline(14, 15, 8, hr[0]);
    P.set(12, 12, sk[0]); P.set(12, 11, sk[1]);
    P.set(8, 12, mix(sk[2], '#e86a6a', 0.5)); P.set(16, 12, mix(sk[2], '#e86a6a', 0.5));
    if (o.moustache) { P.hline(10, 14, 13, hr[1]); P.set(9, 14, hr[1]); P.set(15, 14, hr[1]); P.hline(11, 13, 14, '#7a2a2a'); }
    else { P.hline(11, 13, 14, '#a83a3a'); if (o.smile) { P.set(10, 13, '#a83a3a'); P.set(14, 13, '#a83a3a'); } }
    if (o.beard) { for (let y = 12; y < 18; y++) for (let x = 7; x < 18; x++) { const d = Math.hypot((x - 12) / 5.5, (y - 12) / 6); if (d < 1 && y >= 12 + (Math.abs(x - 12) < 3 ? 2 : 0)) P.set(x, y, (x + y) % 3 ? hr[1] : hr[2]); } P.hline(11, 13, 14, '#5a2a1a'); P.hline(10, 14, 13, hr[2]); }
    // hair
    if (o.hairStyle === 'bun') { P.ell(12, 5.5, 6, 3, hr[2]); P.rect(6, 5, 2, 6, hr[1]); P.rect(17, 5, 2, 6, hr[1]); P.ball(12, 2.2, 3, 2.2, hr.slice(1), 0.3); P.hline(8, 12, 4, hr[3]); }
    if (o.hairStyle === 'short') { P.ell(12, 5, 6.2, 3.2, hr[2]); P.rect(6, 5, 2, 4, hr[1]); P.rect(17, 5, 2, 4, hr[1]); P.hline(8, 11, 3, hr[3]); for (let x = 8; x < 17; x += 2) P.set(x, 7, hr[2]); }
    if (o.hairStyle === 'bald') { P.set(6, 8, hr[1]); P.set(6, 9, hr[1]); P.set(18, 8, hr[1]); P.set(18, 9, hr[1]); P.set(10, 5, sk[3]); P.set(11, 5, sk[3]); }
    if (o.hairStyle === 'long') { P.ell(12, 5, 6.4, 3.4, hr[2]); P.rect(5, 5, 3, 12, hr[1]); P.rect(17, 5, 3, 12, hr[1]); P.hline(8, 11, 3, hr[3]); }
    if (o.bandanaHead) { P.ell(12, 4.6, 6.2, 2.6, o.bandanaHead); P.hline(7, 17, 6, shade(o.bandanaHead, -0.15)); P.set(9, 3, '#ffffff'); P.set(14, 4, '#ffffff'); P.set(18, 6, o.bandanaHead); P.set(19, 7, o.bandanaHead); }
    if (o.cap) { P.ell(12, 4.5, 6.2, 2.8, o.cap); P.hline(6, 18, 6, shade(o.cap, -0.2)); P.hline(5, 12, 7, shade(o.cap, -0.25)); }
    if (o.glasses) { P.hline(8, 16, 10, '#2b1a0d'); P.rect(8, 10, 3, 2, '#c8e8f8'); P.rect(13, 10, 3, 2, '#c8e8f8'); P.set(9, 11, '#2b1a0d'); P.set(14, 11, '#2b1a0d'); }
    P.outline('auto');
    return P.toCanvas(2);
  }

  function buildSprites() {
    // nature
    SPR.tree_oak = oakTree(LEAF_SPRING, 11);
    SPR.tree_oak_summer = oakTree(LEAF_SUMMER, 11);
    SPR.tree_oak_fall = oakTree(LEAF_FALL, 11);
    SPR.tree_oak_winter = bareTree(5, true);
    SPR.tree_oak_bare = bareTree(5, false);
    SPR.tree_pine = pineTree(3, false);
    SPR.tree_pine_winter = pineTree(3, true);
    SPR.tree_sapling = G.assets.apple_tree_sapling || mk(24, 24, P => { P.vline(12, 12, 21, BARK[2]); leaf(P, 12, 13, deg(-140), 5, 2, ramp('#5aa83a', 4)); leaf(P, 12, 12, deg(-40), 5, 2, ramp('#5aa83a', 4)); leaf(P, 12, 12, deg(-90), 4, 1.8, ramp('#5aa83a', 4)); });
    SPR.stump = stumpSpr(false);
    SPR.big_stump = stumpSpr(true);
    SPR.rock = rockSpr(24, ROCK.slice(0, 5), 21, { rx: 0.4, ry: 0.32 });
    SPR.boulder = rockSpr(48, ROCK, 23, { rx: 0.4, ry: 0.33, moss: true });
    SPR.weeds = weedsSpr(0); SPR.weeds2 = weedsSpr(1); SPR.weeds3 = weedsSpr(2);
    // twig: a small branch lying flat on the ground (lit top edge, dark underside, contact shadow)
    SPR.twig = withShadow(24, 24, S => {
      const sh = (x0, y0, x1, y1, w) => { for (let t = 0; t <= 1; t += 0.03) S.ell(x0 + (x1 - x0) * t + 1, y0 + (y1 - y0) * t + 1.6, w, w * 0.7, '#1a0f08', 0.22); };
      sh(3, 16, 20, 11, 1.6); sh(10, 14, 8, 8, 1); sh(15, 12.5, 20, 17, 1);
    }, P => {
      const stick = (x0, y0, x1, y1, w) => { for (let t = 0; t <= 1; t += 0.02) { const x = x0 + (x1 - x0) * t, y = y0 + (y1 - y0) * t, ww = w * (1 - t * 0.35); P.ell(x, y, ww, ww * 0.8, BARK[2]); } for (let t = 0; t <= 1; t += 0.02) { const x = x0 + (x1 - x0) * t, y = y0 + (y1 - y0) * t, ww = w * (1 - t * 0.35); P.set(x, y - ww * 0.6, BARK[4]); P.set(x, y + ww * 0.6, BARK[0]); } };
      stick(3, 16, 20, 11, 1.6); stick(10, 14, 8, 8, 1); stick(15, 12.5, 20, 17, 1);
      P.ell(3, 16, 1.2, 1.4, '#c9a06a'); P.set(3, 16, '#8a6a3a'); // cut end
      P.ell(7, 7.5, 1.8, 1, '#5aa83a'); P.set(6, 7, '#8ccc5a'); P.ell(21, 18, 1.6, 0.9, '#4a8a2a'); P.set(20, 17.6, '#7ab84a');
      P.set(13, 12.4, BARK[1]); P.set(17, 11.6, BARK[1]);
    });
    // bush: back clumps higher, front clumps lower; front faces darker, tops lit
    SPR.bush = withShadow(48, 48, S => { groundShadow(S, 24, 42, 22, 5, 0.34); }, P => {
      const L = ['#173a1c', '#245a26', '#357a2e', '#4e9a38', '#78bc50'];
      blob(P, 24, 30, 20, 13, [L[0], L[1], L[1], L[2]], 301, 0.1, 0.5);
      [[16, 20, 8], [32, 19, 8], [24, 16, 9], [9, 28, 8], [39, 28, 8], [24, 26, 10], [15, 34, 9], [33, 34, 9], [24, 36, 8]].forEach(([x, y, r], i) => blob(P, x, y, r, r * 0.8, L, 310 + i, 0.2, 0.8));
      for (let y = 30; y < 46; y++) for (let x = 0; x < 48; x++) P.tint(x, y, '#0c1a0c', (y - 29) * 0.022);
      const r = rng(7); for (let i = 0; i < 30; i++) { const x = 6 + r() * 36, y = 10 + r() * 18; if (P.a(x, y) && P.a(x + 1, y)) P.set(x, y, r() < 0.6 ? L[4] : '#a0d468'); }
      for (let i = 0; i < 10; i++) { const x = 8 + r() * 32, y = 15 + r() * 22; if (P.a(x - 1, y) && P.a(x + 2, y + 2)) { P.set(x, y, '#d83a4a'); P.set(x + 1, y, '#a01a2a'); P.set(x, y + 1, '#a01a2a'); P.set(x + 1, y + 1, '#7a1020'); P.set(x, y, '#ff8a9a'); } }
    });
    // flower patch decor: low leafy rosettes with round flower heads seen from above
    SPR.flowers = withShadow(24, 24, S => groundShadow(S, 12, 19.5, 10, 2.8, 0.28), P => {
      leafClump(P, 12, 20.5, 8, 4, ['#1e4418', '#326622', '#4f8a2a', '#72a838', '#a6d05a'], 431, 10);
      const heads = [[7, 13, '#f4a6c8', '#d0608e'], [13, 11, '#ffffff', '#c4c4d8'], [18, 14, '#f7d84a', '#c8961a'], [10, 17, '#c9b7f5', '#8a6ad0'], [16, 18, '#f08a5a', '#c04a2a']];
      heads.forEach(([x, y, a, d]) => { P.ell(x + 0.5, y + 0.5, 2.2, 1.8, a); P.set(x + 1, y + 1, d); P.set(x + 2, y + 1, d); P.set(x, y + 2, d); P.set(x + 1, y + 2, d); P.set(x - 1, y - 1, '#ffffff'); P.set(x, y, '#f2a630'); P.set(x + 1, y, '#c8701a'); });
    });
    // mine
    SPR.mine_rock = rockSpr(24, MROCK.slice(0, 6), 31, { ry: 0.33 });
    SPR.mine_rock2 = rockSpr(24, MROCK2.slice(0, 6), 33, { rx: 0.4, ry: 0.26 });
    SPR.node_copper = rockSpr(24, MROCK.slice(0, 5), 35, { crack: false, ore: oreChunks(['#6a2a10', '#c4652e', '#f0a060', '#ffd0a0'], 5) });
    SPR.node_iron = rockSpr(24, MROCK2.slice(0, 5), 37, { crack: false, ore: oreChunks(['#5a4a48', '#a8908a', '#d8c8c0', '#ffffff'], 5) });
    SPR.node_gold = rockSpr(24, MROCK.slice(0, 5), 39, { crack: false, ore: oreChunks(['#7a4a05', '#e0a826', '#f6d65a', '#fffbe0'], 5) });
    SPR.node_iridium = rockSpr(24, ['#1e1824', '#2e2638', '#40364e', '#564a68', '#6e6084'], 41, { crack: false, ore: oreChunks(['#3a1060', '#a347c4', '#e08af0', '#ffe0ff'], 6) });
    SPR.node_gem = rockSpr(24, MROCK2.slice(0, 5), 43, { crack: false, ore: crystals(['#1a6a4a', '#3ac88a', '#a0f0c8', '#ffffff'], 3) });
    SPR.node_coal = rockSpr(24, MROCK.slice(0, 5), 45, { crack: false, ore: oreChunks(['#0a0a0c', '#1e1e24', '#3a3a46', '#7a7a8e'], 6) });
    SPR.ladder_down = ladderDown(); SPR.ladder_up = ladderUp(); SPR.elevator = elevatorSpr(); SPR.mine_entrance = mineEntrance(); SPR.crystal_decor = crystalDecor();
    // buildings
    SPR.farmhouse = buildFarmhouse(); SPR.shop_stall = buildShopStall();
    SPR.store_general = buildGeneral(); SPR.store_blacksmith = buildBlacksmith(); SPR.store_carpenter = buildCarpenter(); SPR.inn = buildInn();
    SPR.worker_cabin = buildWorkerCabin(); SPR.greenhouse = buildGreenhouse(); SPR.shed = buildShed(); SPR.silo = buildSilo();
    // placeables
    SPR.chest = chestSpr(); SPR.furnace = furnaceSpr(false); SPR.furnace_on = furnaceSpr(true);
    SPR.preserves_jar = jarSpr(false); SPR.preserves_jar_ready = jarSpr(true); SPR.keg = kegSpr(false); SPR.keg_ready = kegSpr(true);
    SPR.sprinkler = sprinklerSpr(0); SPR.quality_sprinkler = sprinklerSpr(1); SPR.iridium_sprinkler = sprinklerSpr(2);
    SPR.scarecrow = scarecrowSpr(); SPR.torch = torchSpr(); SPR.path_stone = pathStoneSpr(); SPR.bobber = bobberSpr();
    if (G.assets.wooden_fence) SPR.fence = G.assets.wooden_fence;
    // portraits
    SPR.portrait_mabel = portrait({ bg: '#a8c890', skin: '#f2c8a4', hair: '#b8b4bc', hairStyle: 'bun', shirt: '#c86a5a', apron: '#4e8f4a', smile: true, glasses: true });
    SPR.portrait_bram = portrait({ bg: '#c8a080', skin: '#d0946a', hair: '#6a3a1e', hairStyle: 'bald', shirt: '#5a5f6a', beard: true, apron: '#5a3a22' });
    SPR.portrait_wren = portrait({ bg: '#e0c890', skin: '#f4d2b4', hair: '#8a4a22', hairStyle: 'long', shirt: '#4a6a9a', bandanaHead: '#c8302a', smile: true });
    SPR.portrait_otis = portrait({ bg: '#d0a8a0', skin: '#eab08a', hair: '#3a2a1a', hairStyle: 'short', shirt: '#7a3a5a', moustache: true, apron: '#f2e6c8' });
    SPR.portrait_worker1 = portrait({ bg: '#a8b8d8', skin: '#e8b48a', hair: '#2a1a10', hairStyle: 'short', shirt: '#4a8a5a', smile: true });
    SPR.portrait_worker2 = portrait({ bg: '#d8b8a8', skin: '#8a5a3a', hair: '#1a1210', hairStyle: 'long', shirt: '#c8a040', smile: true });
    SPR.portrait_worker3 = portrait({ bg: '#b8d0a8', skin: '#f0caa8', hair: '#c88a3a', hairStyle: 'short', shirt: '#8a4a3a', cap: '#3a5a8a' });
    SPR.portrait_worker4 = portrait({ bg: '#c8b8d8', skin: '#c8906a', hair: '#5a5a5a', hairStyle: 'short', shirt: '#3a6a8a', beard: true });
  }

  /* ------------------------------------------------------------------ */
  /* item icons (24x24 logical -> 48x48)                                 */
  /* ------------------------------------------------------------------ */
  const ic = (fn) => mk(24, 24, fn, 2, 'auto');
  function logIcon(P, x, y, len, r, bark, end) {
    const B = ramp(bark, 4, 0.34);
    for (let i = 0; i < len; i++) for (let j = -r; j <= r; j++) { const t = (j + r) / (2 * r); P.set(x + i, y + j, t < 0.3 ? B[3] : t < 0.65 ? B[2] : t < 0.88 ? B[1] : B[0]); if ((i * 5 + j * 3) % 7 === 0) P.set(x + i, y + j, B[1]); }
    const E = ramp(end, 3, 0.3); P.ell(x + len, y + 0.5, r * 0.75, r + 0.5, E[1]); P.ell(x + len, y + 0.5, r * 0.45, r * 0.6, E[2]); P.set(x + len, y, E[0]);
  }
  function ingot(P, cols) {
    P.poly([[3, 18], [21, 18], [18, 9], [6, 9]], cols[2]);
    P.poly([[6, 9], [18, 9], [16.5, 6], [7.5, 6]], cols[4]);
    P.poly([[18, 9], [21, 18], [21, 16], [18.5, 8]], cols[1]);
    P.hline(4, 20, 18, cols[0]); P.hline(5, 19, 17, cols[1]); P.line(7, 10, 5, 16, cols[3]);
    P.hline(8, 12, 7, '#ffffff'); P.set(14, 7, cols[3]);
  }
  function gem(P, shape, cols) {
    // cols: dark, mid, light, highlight
    if (shape === 'round') { P.ball(12, 12, 8, 8, cols.slice(0, 3), 0.3); P.poly([[8, 9], [12, 6], [16, 9], [12, 12]], cols[2]); P.line(4, 12, 20, 12, cols[0]); P.line(12, 4, 12, 20, shade(cols[1], -0.05)); }
    else if (shape === 'oval') { P.ball(12, 12, 6.5, 8.5, cols.slice(0, 3), 0.3); P.poly([[9, 8], [12, 5], [15, 8], [15, 14], [12, 17], [9, 14]], cols[1]); P.poly([[9, 8], [12, 5], [12, 11]], cols[2]); }
    else if (shape === 'rect') { P.rect(6, 5, 12, 14, cols[1]); P.poly([[6, 5], [18, 5], [15, 8], [9, 8]], cols[2]); P.poly([[18, 5], [18, 19], [15, 16], [15, 8]], cols[0]); P.poly([[6, 19], [18, 19], [15, 16], [9, 16]], shade(cols[0], 0.05)); P.rect(9, 8, 6, 8, cols[1]); P.line(9, 8, 14, 15, cols[2]); }
    else if (shape === 'diamond') { P.poly([[3, 9], [7, 4], [17, 4], [21, 9], [12, 21]], cols[1]); P.poly([[3, 9], [21, 9], [12, 21]], cols[0]); P.poly([[7, 4], [12, 9], [17, 4]], cols[2]); P.poly([[3, 9], [12, 21], [8, 9]], cols[2]); P.hline(3, 21, 9, cols[3]); }
    else if (shape === 'cluster') { [[8, 20, 10, 3], [13, 20, 14, 3.5], [17, 20, 9, 2.6]].forEach(([x, b, h, w]) => { P.poly([[x - w, b], [x - w, b - h + 2], [x, b - h - 1], [x + w, b - h + 2], [x + w, b]], cols[1]); P.poly([[x - w, b], [x - w, b - h + 2], [x, b - h - 1], [x, b]], cols[2]); P.vline(x, b - h, b - 1, cols[0]); }); P.ell(12, 20.5, 8, 1.6, shade(cols[0], -0.1)); }
    // sparkles
    P.set(8, 7, cols[3]); P.set(7, 8, cols[3]);
  }
  function oreIcon(P, fleck) {
    blob(P, 12, 13, 9, 7.5, ROCK.slice(0, 5), 501, 0.12, 0.7);
    oreChunks(fleck, 5)(P, 12, 13, 8, 6, rng(502));
  }
  function seedPacket(crop, bandCol) {
    const c = ic(P => {
      const paper = ['#b8a27a', '#e2d0a8', '#f4e8c8', '#fff8e6'];
      P.poly([[4, 4], [20, 4], [20, 21], [4, 21]], paper[2]);
      P.hline(4, 20, 4, paper[3]); for (let x = 4; x <= 20; x += 2) P.set(x, 3, paper[2]); // serrated top
      P.vline(19, 5, 20, paper[1]); P.vline(20, 5, 21, paper[0]); P.hline(4, 20, 21, paper[0]); P.hline(5, 19, 20, paper[1]);
      P.rect(5, 6, 14, 3, bandCol); P.hline(5, 18, 6, shade(bandCol, 0.12)); P.hline(5, 18, 8, shade(bandCol, -0.12));
      P.rect(6, 10, 12, 9, '#cfe6b8'); P.hline(6, 17, 18, '#8a6040'); P.hline(6, 17, 17, '#a8784a');
    });
    const x = c.getContext('2d'), img = G.assets[{ carrot: 'carrot_crop_2', potato: 'potato', cabbage: 'cabbage_crop', strawberry: 'strawberry', tomato: 'tomato', corn: 'corn_plant', sunflower: 'sunflower', wheat: 'wheat_bundle_2', pumpkin: 'pumpkin_crop' }[crop]];
    if (img) x.drawImage(img, 12, 18, 24, 22);
    // little seeds spilling
    x.fillStyle = '#7a5a30'; x.fillRect(36, 40, 4, 3); x.fillRect(40, 43, 3, 3); x.fillStyle = '#c8a060'; x.fillRect(36, 40, 2, 1);
    return c;
  }
  /* fish: body along x, head on the left */
  function fishIcon(o) {
    return ic(P => {
      const L = o.len || 16, H = o.h || 4.5, x0 = 12 - L / 2 - 1, x1 = x0 + L, tilt = o.tilt === undefined ? -0.35 : o.tilt;
      const cyAt = t => 12 + tilt * (t - 0.5) * L;
      const back = ramp(o.back, 3, 0.25), belly = o.belly;
      // tail
      const tc = cyAt(1), tl = o.tail || 5;
      P.poly([[x1 - 1, tc], [x1 + tl, tc - tl * 0.9 + tilt * tl], [x1 + tl - 2, tc + tilt * tl], [x1 + tl, tc + tl * 0.9 + tilt * tl]], o.fin || back[0]);
      // dorsal fin
      if (o.dorsal !== false) P.poly([[x0 + L * 0.3, cyAt(0.3) - H * 0.8], [x0 + L * 0.42, cyAt(0.42) - H - (o.dorsalH || 3)], [x0 + L * 0.68, cyAt(0.68) - H * 0.7]], o.fin || back[0]);
      for (let x = Math.floor(x0); x <= Math.ceil(x1); x++) {
        const t = (x - x0) / L; if (t < 0 || t > 1) continue;
        const prof = o.profile ? o.profile(t) : (t < 0.25 ? Math.sin(t / 0.25 * Math.PI / 2) : 0.15 + 0.85 * Math.cos((t - 0.25) / 0.75 * Math.PI / 2));
        const hh = Math.max(0.8, H * prof), c = cyAt(t);
        for (let y = Math.floor(c - hh); y <= Math.ceil(c + hh); y++) {
          const v = (y + 0.5 - c) / hh; if (Math.abs(v) > 1.05) continue;
          let col = v < -0.45 ? back[0] : v < 0.1 ? back[1] : v < 0.45 ? back[2] : belly;
          if (o.pattern) col = o.pattern(x, y, t, v, col) || col;
          P.set(x, y, col);
        }
      }
      // pectoral fin
      P.poly([[x0 + L * 0.3, cyAt(0.3) + 1], [x0 + L * 0.38, cyAt(0.38) + H * 0.9 + 1], [x0 + L * 0.44, cyAt(0.44) + 1]], o.fin || back[0]);
      // eye + gill
      const ex = x0 + L * 0.13, ey = cyAt(0.13) - H * 0.25;
      P.set(ex, ey, '#ffffff'); P.set(ex + 1, ey, '#1a1010'); P.set(ex + 1, ey + 1, '#1a1010'); P.set(ex, ey + 1, '#e8e8e8');
      for (let k = -1; k <= 1; k++) P.set(x0 + L * 0.24, cyAt(0.24) + k, back[0]);
      P.set(x0 + 0.5, cyAt(0) + 1, '#2b1a0d');
      if (o.whiskers) { P.line(x0, cyAt(0) + 1, x0 - 3, cyAt(0) + 4, '#3a2a1a'); P.line(x0 + 1, cyAt(0), x0 - 2, cyAt(0) - 2, '#3a2a1a'); }
      if (o.extra) o.extra(P, x0, x1, cyAt, H);
    });
  }
  function eelIcon() {
    return ic(P => {
      const C = ramp('#5a6a2a', 3, 0.3);
      for (let i = 0; i <= 60; i++) { const t = i / 60, x = 2 + t * 20, y = 12 + Math.sin(t * Math.PI * 2.2) * 4 - (t - 0.5) * 4, r = 2.2 * (t < 0.1 ? 0.7 + t * 3 : 1 - (t - 0.1) * 0.75); P.ell(x, y, r, r, C[1]); P.set(x, y - r + 0.5, C[0]); P.set(x, y + r - 0.5, '#d8c870'); }
      P.set(3, 11, '#ffffff'); P.set(4, 11, '#1a1010'); P.set(2, 13, '#2b1a0d');
    });
  }
  function bottleIcon(liquid, opts = {}) {
    return ic(P => {
      const G1 = opts.glass || ['#2a4a2a', '#3a6a3a', '#5a8a5a'];
      P.rect(10, 2, 4, 2, '#a8784a'); P.rect(10, 4, 4, 5, G1[1]); P.vline(10, 4, 8, G1[2]);
      P.poly([[10, 8], [14, 8], [18, 12], [18, 21], [6, 21], [6, 12]], G1[1]);
      P.rect(7, 12, 10, 9, liquid); P.vline(16, 12, 20, shade(liquid, -0.15)); P.vline(7, 12, 20, shade(liquid, 0.1));
      P.rect(8, 13, 8, 5, '#f4e8c8'); P.hline(8, 15, 13, '#fff8e6'); P.rect(10, 15, 4, 2, opts.label || liquid);
      P.vline(7, 9, 11, '#ffffff'); P.set(8, 10, '#e8f8ff');
    });
  }
  function jarIcon(fill, lid = '#e8d8b0', bits) {
    return ic(P => {
      const F = ramp(fill, 3, 0.3);
      P.rect(6, 8, 12, 13, '#cfe8f0'); P.hline(7, 16, 21, '#9ab8c8'); P.vline(17, 8, 20, '#9ab8c8');
      P.rect(7, 10, 10, 10, F[1]); P.hline(7, 16, 10, F[2]); P.vline(16, 10, 19, F[0]);
      if (bits) bits(P);
      P.vline(7, 9, 18, '#ffffff'); P.vline(8, 10, 13, '#e8f8ff');
      P.rect(5, 4, 14, 4, lid); P.hline(5, 18, 4, shade(lid, 0.12)); P.hline(5, 18, 7, shade(lid, -0.2)); for (let x = 5; x < 19; x += 3) P.set(x, 8, lid);
      P.rect(9, 13, 6, 4, '#fff8e6'); P.hline(9, 14, 16, '#d8c8a8');
    });
  }
  const scaledSprite = (name) => { const s = SPR[name]; if (!s) return null; const c = G.makeCanvas(48, 48), x = c.getContext('2d'); x.imageSmoothingEnabled = false; const k = Math.min(48 / s.width, 48 / s.height); const w = s.width * k, h = s.height * k; x.drawImage(s, (48 - w) / 2, (48 - h) / 2, w, h); return c; };

  function buildIcons() {
    const I = ICONS;
    I.wood = ic(P => { logIcon(P, 3, 15, 15, 3, '#7a4a26', '#d8a868'); logIcon(P, 5, 8, 14, 3, '#8a5630', '#e0b478'); });
    I.hardwood = ic(P => { logIcon(P, 3, 12, 15, 5, '#5a2a1a', '#a8603a'); P.line(5, 9, 15, 9, '#3a1810'); });
    I.stone = ic(P => { blob(P, 12, 13, 8.5, 7, ROCK.slice(0, 5), 601, 0.14, 0.7); P.line(10, 8, 13, 14, ROCK[0]); P.set(8, 9, ROCK[5]); P.set(9, 8, ROCK[5]); });
    I.fiber = ic(P => { const C = ramp('#7aa83a', 4, 0.36); for (let i = 0; i < 8; i++) P.line(6 + i * 1.3, 21, 9 + i * 0.8, 3 + (i % 3) * 2, i % 2 ? C[1] : C[2]); P.rect(7, 13, 10, 3, '#c8a868'); P.hline(7, 16, 13, '#e0c890'); P.hline(7, 16, 15, '#8a6a3a'); });
    I.sap = ic(P => { P.poly([[12, 3], [17, 12], [7, 12]], '#c8701a'); P.ball(12, 14, 5.5, 5.5, ['#7a3a08', '#c8701a', '#f0a030', '#ffd070'], 0.3); P.set(10, 12, '#fff0c0'); P.set(10, 13, '#ffd070'); });
    I.clay = ic(P => { blob(P, 12, 14, 8, 6, ['#6a3a22', '#9a5a36', '#b8744a', '#d08e60'], 603, 0.18, 0.6); P.set(9, 11, '#e8a878'); P.line(13, 12, 16, 14, '#7a4228'); });
    I.coal = ic(P => { [[9, 14, 5.5], [15, 12, 5], [13, 17, 4]].forEach(([x, y, r], i) => blob(P, x, y, r, r * 0.85, ['#0c0c10', '#1e1e26', '#33333e', '#5a5a6e'], 610 + i, 0.2, 0.5)); P.set(8, 11, '#a8a8c0'); P.set(14, 9, '#a8a8c0'); });
    I.copper_ore = ic(P => oreIcon(P, ['#6a2a10', '#c4652e', '#f0a060', '#ffd0a0']));
    I.iron_ore = ic(P => oreIcon(P, ['#5a4a48', '#a8908a', '#d8c8c0', '#ffffff']));
    I.gold_ore = ic(P => oreIcon(P, ['#7a4a05', '#e0a826', '#f6d65a', '#fffbe0']));
    I.iridium_ore = ic(P => oreIcon(P, ['#3a1060', '#a347c4', '#e08af0', '#ffe0ff']));
    I.copper_bar = ic(P => ingot(P, TIER[1])); I.iron_bar = ic(P => ingot(P, TIER[2])); I.gold_bar = ic(P => ingot(P, TIER[3])); I.iridium_bar = ic(P => ingot(P, TIER[4]));
    I.quartz = ic(P => gem(P, 'cluster', ['#a8b8c8', '#e0e8f0', '#ffffff', '#ffffff']));
    I.amethyst = ic(P => gem(P, 'cluster', ['#4a1a7a', '#8a4ac8', '#c890f0', '#ffffff']));
    I.topaz = ic(P => gem(P, 'oval', ['#a86a08', '#f0b020', '#ffe070', '#ffffff']));
    I.emerald = ic(P => gem(P, 'rect', ['#0a5a3a', '#1aa060', '#6ae0a0', '#ffffff']));
    I.ruby = ic(P => gem(P, 'round', ['#7a0a1a', '#d02040', '#ff6a80', '#ffffff']));
    I.diamond = ic(P => gem(P, 'diamond', ['#6aa8c8', '#c8ecff', '#ffffff', '#ffffff']));
    I.worm = ic(P => { for (let i = 0; i <= 40; i++) { const t = i / 40, x = 4 + t * 16, y = 13 + Math.sin(t * Math.PI * 2.5) * 4; P.ell(x, y, 1.8, 1.8, i % 6 < 1 ? '#c8606a' : '#e8909a'); P.set(x, y - 1, '#f8c0c8'); } P.set(19, 13, '#2b1a0d'); });
    I.bait = ic(P => { P.rect(5, 8, 14, 13, '#8a6a4a'); P.ell(12, 8, 7, 2, '#a8886a'); P.ell(12, 8, 5.5, 1.4, '#5a3a22'); P.rect(5, 12, 14, 5, '#e8d8b0'); P.rect(9, 13, 6, 3, '#c8606a'); P.vline(18, 8, 20, '#6a4a2a'); [[9, 7], [12, 6], [15, 7]].forEach(([x, y]) => { P.set(x, y, '#e8909a'); P.set(x + 1, y - 1, '#c8606a'); }); });
    I.deluxe_bait = ic(P => { P.rect(5, 8, 14, 13, '#3a4a7a'); P.ell(12, 8, 7, 2, '#5a6a9a'); P.ell(12, 8, 5.5, 1.4, '#1a2040'); P.rect(5, 12, 14, 5, '#f2d27a'); P.rect(9, 13, 6, 3, '#e8892a'); P.vline(18, 8, 20, '#2a3a5a'); [[9, 7], [12, 6], [15, 7]].forEach(([x, y]) => { P.set(x, y, '#f0a050'); P.set(x + 1, y - 1, '#e04a2a'); }); P.set(20, 4, '#fff6c0'); P.set(20, 2, '#fff6c0'); P.set(19, 3, '#fff6c0'); P.set(21, 3, '#fff6c0'); });
    I.coffee = ic(P => { P.rect(5, 10, 12, 11, '#f4ecd8'); P.vline(16, 10, 20, '#c8bca0'); P.hline(5, 16, 20, '#c8bca0'); P.ell(11, 10, 6, 1.6, '#5a3018'); P.ell(11, 10, 4, 1, '#7a4a28'); P.rect(17, 12, 3, 6, '#f4ecd8'); P.rect(18, 13, 1, 4, '#4a4a52'); P.rect(6, 14, 10, 2, '#c8463a'); [[9, 6], [12, 4], [10, 2]].forEach(([x, y]) => { P.set(x, y, '#e8e8f0'); P.set(x + 1, y + 1, '#e8e8f0'); }); });
    const band = { carrot: '#e8892a', potato: '#b8905a', cabbage: '#7ab84a', strawberry: '#d83a4a', tomato: '#e04a2a', corn: '#e0b830', sunflower: '#f0c020', wheat: '#c8a040', pumpkin: '#e07a20' };
    for (const c in band) I['seeds_' + c] = seedPacket(c, band[c]);
    // produce aliases (pack images)
    const alias = { carrot: 'carrot_crop_2', potato: 'potato', cabbage: 'cabbage_crop', strawberry: 'strawberry', tomato: 'tomato', corn: 'corn_plant', sunflower: 'sunflower', wheat: 'wheat_bundle_2', pumpkin: 'pumpkin_crop' };
    for (const k in alias) if (G.assets[alias[k]]) I[k] = G.assets[alias[k]];
    // fish
    I.sunfish = fishIcon({ len: 13, h: 6, back: '#3a8a8a', belly: '#f0a040', fin: '#2a6a6a', pattern: (x, y, t, v, c) => (v > 0.2 && v < 0.6 && t > 0.15 && t < 0.6) ? '#f06a2a' : ((x + y) % 4 === 0 && v < 0.2 ? '#5ab0a8' : null) });
    I.carp = fishIcon({ len: 16, h: 5, back: '#8a7a3a', belly: '#e8d8a0', fin: '#6a5a2a', pattern: (x, y, t, v, c) => ((x + (y % 2)) % 2 === 0 && v < 0.3 && v > -0.6) ? shade(c, 0.08) : null, whiskers: true });
    I.bream = fishIcon({ len: 15, h: 6.2, back: '#8a8a7a', belly: '#e8e4d8', fin: '#5a5a50', profile: t => t < 0.3 ? Math.sin(t / 0.3 * Math.PI / 2) : 0.2 + 0.8 * Math.cos((t - 0.3) / 0.7 * Math.PI / 2), pattern: (x, y, t, v, c) => (v > -0.2 && v < 0.1 && t > 0.2) ? '#c8c4b0' : null });
    I.perch = fishIcon({ len: 15, h: 5, back: '#6a8a2a', belly: '#f0e070', fin: '#e06a2a', pattern: (x, y, t, v, c) => (Math.floor(t * 14) % 3 === 0 && t > 0.2 && t < 0.85 && v < 0.5) ? '#3a4a1a' : null, dorsalH: 4 });
    I.catfish = fishIcon({ len: 18, h: 4.6, back: '#5a4a3a', belly: '#c8b89a', fin: '#3a2e24', whiskers: true, dorsalH: 2, pattern: (x, y, t, v, c) => ((x * 3 + y * 5) % 11 === 0 && v < 0.2) ? '#3a2e24' : null });
    I.bass = fishIcon({ len: 17, h: 5.4, back: '#4a6a2a', belly: '#e0e0b0', fin: '#3a5020', pattern: (x, y, t, v, c) => (Math.abs(v + 0.05) < 0.18 && t > 0.15 && t < 0.95 && (x % 3)) ? '#2a3a18' : null, dorsalH: 4 });
    I.pike = fishIcon({ len: 20, h: 3.6, back: '#4a6a3a', belly: '#e8e0b0', fin: '#5a6a2a', tilt: -0.25, pattern: (x, y, t, v, c) => ((x * 7 + y * 3) % 6 === 0 && v < 0.4) ? '#c8d890' : null });
    I.eel = eelIcon();
    I.trout = fishIcon({ len: 17, h: 4.6, back: '#6a7a4a', belly: '#f0e8d8', fin: '#7a7a5a', pattern: (x, y, t, v, c) => (v > -0.05 && v < 0.35 && t > 0.1) ? '#e87a8a' : ((x * 5 + y * 3) % 7 === 0 && v < -0.1 ? '#2a2a1a' : null) });
    I.salmon = fishIcon({ len: 18, h: 5, back: '#7a4a5a', belly: '#f8b090', fin: '#8a4a4a', pattern: (x, y, t, v, c) => (v > -0.2 && v < 0.5) ? '#f07a5a' : null });
    I.sturgeon = fishIcon({ len: 21, h: 3.6, back: '#5a6060', belly: '#d8d4c8', fin: '#4a5050', tilt: -0.22, profile: t => t < 0.12 ? 0.35 + t / 0.12 * 0.65 : 0.15 + 0.85 * Math.cos((t - 0.12) / 0.88 * Math.PI / 2), extra: (P, x0, x1, cyAt, H) => { for (let t = 0.18; t < 0.9; t += 0.09) { const x = x0 + (x1 - x0) * t; P.set(x, cyAt(t) - H * 0.75, '#f0ece0'); P.set(x, cyAt(t) + 0.5, '#e8e4d8'); } P.line(x0 - 2, cyAt(0) + 0.5, x0, cyAt(0) + 0.5, '#5a6060'); } });
    I.koi = fishIcon({ len: 17, h: 5, back: '#f08a3a', belly: '#fff4ea', fin: '#f4c8a8', whiskers: true, pattern: (x, y, t, v, c) => { const n = Math.sin(x * 0.9) + Math.cos(y * 1.3 + x * 0.4); return n > 0.6 ? '#fff4ea' : (n < -1.2 ? '#d8402a' : null); } });
    I.trash = ic(P => { P.rect(6, 7, 9, 13, '#8a909c'); P.rect(6, 7, 9, 2, '#b8c0cc'); P.vline(14, 7, 19, '#5a5f6a'); P.rect(6, 11, 9, 5, '#c8463a'); P.hline(6, 14, 11, '#e86a5a'); P.line(9, 6, 12, 8, '#5a5f6a'); P.poly([[13, 15], [21, 13], [20, 21], [12, 20]], '#e8e0c8'); P.line(14, 16, 19, 15, '#b8b0a0'); P.line(14, 18, 19, 18, '#b8b0a0'); });
    I.seaweed = ic(P => { const C = ramp('#2a8a4a', 4, 0.36); for (let k = 0; k < 4; k++) for (let i = 0; i < 40; i++) { const t = i / 40, x = 6 + k * 4 + Math.sin(t * 7 + k) * 2, y = 21 - t * (15 + k % 2 * 3); P.set(x, y, C[1 + (k % 2)]); P.set(x + 1, y, C[k % 2 ? 2 : 3]); } });
    I.fertilizer = ic(P => { P.poly([[5, 7], [19, 7], [20, 21], [4, 21]], '#c8a870'); P.hline(5, 18, 7, '#e0c890'); P.vline(19, 8, 20, '#9a7a48'); P.hline(4, 20, 21, '#8a6a3a'); P.rect(6, 4, 12, 4, '#b8985a'); P.hline(7, 16, 3, '#d8b878'); P.line(9, 5, 15, 5, '#7a5a30'); P.rect(7, 11, 10, 7, '#6a4a2a'); P.ball(12, 14.5, 2.5, 2.5, ramp('#5aa83a', 3, 0.3), 0); P.vline(12, 15, 17, '#3a7a2a'); });
    I.speed_gro = bottleIcon('#4ad08a', { glass: ['#3a6a7a', '#5a9aaa', '#9ad0e0'], label: '#f0c020' });
    I.acorn = ic(P => { P.ball(12, 14, 6, 6.5, ['#7a4a1a', '#b8762e', '#e0a050', '#f6c880'], 0.3); P.poly([[5, 12], [19, 12], [18, 8], [12, 6], [6, 8]], '#6a4a2a'); for (let x = 6; x < 19; x += 2) for (let y = 8; y < 12; y += 2) P.set(x + (y % 4 ? 1 : 0), y, '#8a6a3a'); P.hline(5, 18, 12, '#4a301a'); P.vline(12, 3, 6, '#5a3a1a'); P.set(13, 3, '#5a3a1a'); });
    I.pine_cone = ic(P => { for (let r = 0; r < 7; r++) { const y = 5 + r * 2.4, w = 6.5 - Math.abs(r - 2.5) * 1.1; for (let k = -1; k <= 1; k++) { P.ball(12 + k * w * 0.6, y + (k ? 1 : 0), w * 0.45 + 0.8, 1.8, ['#4a2a12', '#8a5428', '#c08040'], 0.2); } } P.vline(12, 2, 4, '#4a2a12'); });
    I.jam = jarIcon('#c8304a', '#e8b8b8', P => { P.set(10, 12, '#ff8090'); P.set(14, 18, '#7a1020'); });
    I.pickles = jarIcon('#7aa83a', '#d8c890', P => { for (let i = 0; i < 3; i++) { P.ball(9 + i * 3, 15, 1.4, 4, ['#3a6a1a', '#5a8a2a', '#8ac04a'], 0.2); } });
    I.wine = bottleIcon('#8a1a3a', { glass: ['#1a2a1a', '#2a3a2a', '#4a5a4a'], label: '#8a1a3a' });
    I.juice = ic(P => { P.poly([[6, 6], [18, 6], [16, 21], [8, 21]], '#d8f0f6'); P.poly([[7, 9], [17, 9], [15.6, 20], [8.4, 20]], '#f0a030'); P.hline(7, 16, 9, '#ffd070'); P.vline(15, 10, 19, '#c8701a'); P.vline(8, 7, 18, '#ffffff'); P.line(14, 3, 11, 12, '#e04a6a'); P.line(15, 3, 12, 12, '#ff8aa0'); P.ball(17, 7, 2.5, 2.5, ['#7a9a1a', '#b8d84a', '#e8f8a0'], 0); });
    I.geode = ic(P => { blob(P, 12, 13, 9, 8, ['#4a3e34', '#6a5a4a', '#8a7a66', '#a8987e'], 701, 0.14, 0.7); P.ell(13, 13, 5, 4.5, '#3a2a4a'); crystals(['#4a2a7a', '#9a6ad8', '#e0c8ff', '#ffffff'], 3)(P, 13, 14, 4, 3, rng(3)); P.ell(13, 13, 5.5, 5, '#d8d0c0', 0.25); });
    // world objects as icons
    ['chest', 'furnace', 'preserves_jar', 'keg', 'sprinkler', 'quality_sprinkler', 'iridium_sprinkler', 'scarecrow', 'torch', 'path_stone'].forEach(n => { const c = scaledSprite(n); if (c) I[n] = c; });
    if (G.assets.wooden_fence && !I.fence) I.fence = G.assets.wooden_fence;
  }


  /* ================================================================== */
  /* export                                                             */
  /* ================================================================== */
  Object.assign(G.art, {
    drawGround, drawSoil, drawCrop, drawPlayer, drawNPC, toolIcon, drawLights, seasonTint,
    playerLook: PLAYER_LOOK,
    _lib: { Pix, mk, ramp, shade, mix, rng, TIER, GRASS, cropCanvas, charFrame },
  });
  G.on('assetsLoaded', () => {
    const t0 = performance.now();
    try { if (typeof buildSprites === 'function') buildSprites(); } catch (e) { console.error('[art] sprites', e); }
    try { if (typeof buildIcons === 'function') buildIcons(); } catch (e) { console.error('[art] icons', e); }
    // warm caches for current season so the first frame doesn't stutter
    try { for (let v = 0; v < 6; v++) { grassTile(0, v, false); grassTile(0, v, true); } for (let v = 0; v < 3; v++) for (let f = 0; f < WFRAMES; f++) waterFrame(v, f); ['hoe', 'watering_can', 'axe', 'pickaxe', 'scythe', 'fishing_rod'].forEach(t => toolIcon(t, 0)); } catch (e) { console.error('[art] warm', e); }
    G.art.buildMs = Math.round(performance.now() - t0);
    if (G.debug) console.log('[art] built in ' + G.art.buildMs + 'ms');
  });
})();
