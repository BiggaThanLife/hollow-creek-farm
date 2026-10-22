#!/usr/bin/env python3
"""Build dist/index.html: one self-contained file.
Order: src/*.js sorted by filename. Pack PNGs embedded as data URIs in G_ASSET_DATA.
Asset key = filename minus 'Farm Sim ' prefix, lowercased, non-alnum -> '_'  e.g. 'Wheat Bundle 2.png' -> 'wheat_bundle_2'."""
import base64, glob, os, re, json, sys
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
assets = {}
for f in sorted(glob.glob(os.path.join(ROOT, 'assets', '*.png'))):
    name = os.path.basename(f)[:-4]
    name = re.sub(r'^Farm Sim ', '', name)
    key = re.sub(r'[^a-z0-9]+', '_', name.lower()).strip('_')
    assets[key] = 'data:image/png;base64,' + base64.b64encode(open(f, 'rb').read()).decode()
# --only=10_art,20_farm  -> core (00_*) + listed prefixes (+ 99_stub_test if --stub)   --out=dist/x.html
only = next((a.split('=',1)[1].split(',') for a in sys.argv if a.startswith('--only=')), None)
outname = next((a.split('=',1)[1] for a in sys.argv if a.startswith('--out=')), 'dist/index.html')
def wanted(fn):
    b = os.path.basename(fn)
    if only is None: return b != '99_stub_test.js' or '--stub' in sys.argv
    if b.startswith('00_'): return True
    if b == '99_stub_test.js': return '--stub' in sys.argv
    return any(b.startswith(p) for p in only)
js = []
for f in sorted(glob.glob(os.path.join(ROOT, 'src', '*.js'))):
    if not wanted(f): continue
    js.append(f'// ===== {os.path.basename(f)} =====\n' + open(f, encoding='utf-8').read())
css = open(os.path.join(ROOT, 'src', 'style.css'), encoding='utf-8').read() if os.path.exists(os.path.join(ROOT,'src','style.css')) else ''
import hashlib, shutil
PWA = '--artifact' not in sys.argv and only is None
pwa_head = '''<link rel="manifest" href="manifest.webmanifest">
<meta name="theme-color" content="#3d7a2a">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-title" content="Hollow Creek">
<link rel="icon" type="image/png" sizes="32x32" href="icons/favicon-32.png">
<link rel="icon" type="image/png" sizes="192x192" href="icons/icon-192.png">
<link rel="apple-touch-icon" href="icons/apple-touch-icon.png">''' if PWA else ''
pwa_js = '''<script>
if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}
</script>''' if PWA else ''
html = f'''<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
{pwa_head}
<title>Hollow Creek Farm</title>
<style>{css}</style></head>
<body>
<div id="game-root"><canvas id="game"></canvas><div id="ui"></div></div>
<script>window.G_ASSET_DATA = {json.dumps(assets)};</script>
<script>
{chr(10).join(js)}
</script>
{pwa_js}
</body></html>'''
if '--artifact' in sys.argv:
    # Artifact publishing wraps the page in its own doctype/head/body skeleton: emit content only.
    html = html.replace('<!doctype html>\n<html lang="en"><head><meta charset="utf-8">\n<meta name="viewport" content="width=device-width,initial-scale=1">\n', '').replace('</head>\n<body>\n', '\n').replace('</body></html>', '')
    outname = 'dist/hollow_creek_farm.html'
out = os.path.join(ROOT, outname)
if PWA:
    dist = os.path.join(ROOT, 'dist'); os.makedirs(os.path.join(dist, 'icons'), exist_ok=True)
    for f in glob.glob(os.path.join(ROOT, 'icons', '*.png')): shutil.copy(f, os.path.join(dist, 'icons'))
    ver = hashlib.sha1(html.encode()).hexdigest()[:10]
    manifest = {
        "name": "Hollow Creek Farm", "short_name": "Hollow Creek",
        "description": "A cozy farming game: grow crops, fish, mine, craft, build and run your own farm shop.",
        "start_url": "./index.html", "scope": "./", "id": "./index.html",
        "display": "fullscreen", "display_override": ["fullscreen", "standalone"], "orientation": "any",
        "background_color": "#1d1410", "theme_color": "#3d7a2a", "categories": ["games", "entertainment"],
        "icons": [
            {"src": "icons/icon-192.png", "sizes": "192x192", "type": "image/png", "purpose": "any"},
            {"src": "icons/icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "any"},
            {"src": "icons/icon-maskable-192.png", "sizes": "192x192", "type": "image/png", "purpose": "maskable"},
            {"src": "icons/icon-maskable-512.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable"}]}
    open(os.path.join(dist, 'manifest.webmanifest'), 'w').write(json.dumps(manifest, indent=2))
    open(os.path.join(dist, 'sw.js'), 'w').write(f'''// Hollow Creek Farm service worker — offline play. Build {ver}
const CACHE = 'hollow-creek-{ver}';
const FILES = ['./', './index.html', './manifest.webmanifest', './icons/icon-192.png', './icons/icon-512.png', './icons/icon-maskable-192.png', './icons/icon-maskable-512.png', './icons/favicon-32.png', './icons/apple-touch-icon.png'];
self.addEventListener('install', e => {{ e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)).then(() => self.skipWaiting())); }});
self.addEventListener('activate', e => {{ e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())); }});
self.addEventListener('fetch', e => {{
  const req = e.request; if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return; // fonts etc. go straight to the network
  if (req.mode === 'navigate' || url.pathname.endsWith('.html')) {{
    // network first so updates arrive; cached copy when offline
    e.respondWith(fetch(req).then(r => {{ const cp = r.clone(); caches.open(CACHE).then(c => c.put(req, cp)); return r; }}).catch(() => caches.match(req).then(r => r || caches.match('./index.html'))));
    return;
  }}
  e.respondWith(caches.match(req).then(r => r || fetch(req)));
}});
''')
open(out, 'w', encoding='utf-8').write(html)
print(f'built {out} ({len(html)//1024} KB, {len(assets)} assets, js: {[os.path.basename(x.splitlines()[0][9:-6]) for x in js]})')
print('asset keys:', ' '.join(assets.keys()) if '-v' in sys.argv else len(assets))
