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
html = f'''<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Hollow Creek Farm</title>
<style>{css}</style></head>
<body>
<div id="game-root"><canvas id="game"></canvas><div id="ui"></div></div>
<script>window.G_ASSET_DATA = {json.dumps(assets)};</script>
<script>
{chr(10).join(js)}
</script>
</body></html>'''
if '--artifact' in sys.argv:
    # Artifact publishing wraps the page in its own doctype/head/body skeleton: emit content only.
    html = html.replace('<!doctype html>\n<html lang="en"><head><meta charset="utf-8">\n<meta name="viewport" content="width=device-width,initial-scale=1">\n', '').replace('</head>\n<body>\n', '\n').replace('</body></html>', '')
    outname = 'dist/hollow_creek_farm.html'
out = os.path.join(ROOT, outname)
open(out, 'w', encoding='utf-8').write(html)
print(f'built {out} ({len(html)//1024} KB, {len(assets)} assets, js: {[os.path.basename(x.splitlines()[0][9:-6]) for x in js]})')
print('asset keys:', ' '.join(assets.keys()) if '-v' in sys.argv else len(assets))
