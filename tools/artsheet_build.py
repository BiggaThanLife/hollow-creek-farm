import json, html
S='/tmp/claude-0/-home-claude/66e851f3-880e-53cd-a5fd-6673a29cdfd6/scratchpad/'
data=json.load(open(S+'art.json'))
order=[('pack','Your asset pack','The 63 original images you supplied. All are 48×48. Shown for comparison; everything below was drawn to match them.'),
 ('ground','Ground tiles','Every tile is 48×48 (the game grid). Water animates over 8 frames; edges and shores are picked from neighbouring tiles.'),
 ('crops','Soil & crops','Growth stages 0–3 are drawn; stage 4 (ready to harvest) uses the pack image.'),
 ('characters','Characters','Drawn at 2× pixel scale. Villagers and workers reuse the player rig with different palettes.'),
 ('buildings','Buildings','Width = footprint in tiles × 48. Taller than the footprint because roofs extend upward.'),
 ('sprites','World objects','Trees, rocks, debris, mine nodes and placeable machines.'),
 ('icons','Item icons','All inventory icons are 48×48.'),
 ('tools','Tool icons by upgrade tier','Basic → Copper → Iron → Gold → Iridium. Hoe, axe, pickaxe and watering can are recoloured pack images; scythe and rod are drawn.'),
 ('portraits','Portraits','48×48 dialogue portraits for the townsfolk and hired workers.')]
cnt={k:sum(1 for d in data if d['section']==k) for k,_,_ in order}
made=sum(v for k,v in cnt.items() if k!='pack')
def card(d):
    w,h=d['w'],d['h']; scale=2 if max(w,h)<=64 else 1
    if max(w,h)>420: scale=0.5
    tiles=f"{w/48:g}×{h/48:g} tiles" if w%24==0 and h%24==0 and (w>48 or h>48) else ''
    return f'''<figure class="card" data-name="{html.escape(d['name'].lower())}" style="--w:{w*scale}px;--h:{h*scale}px">
<div class="art"><img src="{d['url']}" width="{w*scale:g}" height="{h*scale:g}" alt="{html.escape(d['name'])}" loading="lazy"></div>
<figcaption><b>{html.escape(d['name'])}</b><span class="dim">{w}×{h} px{(' · '+tiles) if tiles else ''}</span>{f'<span class="note">{html.escape(d["note"])}</span>' if d['note'] and d['section']!='pack' else ''}</figcaption></figure>'''
secs=''.join(f'''<section id="{k}"><header><h2>{t}</h2><span class="count">{cnt[k]}</span></header><p class="lede">{html.escape(desc)}</p>
<div class="grid">{''.join(card(d) for d in data if d['section']==k)}</div></section>''' for k,t,desc in order if cnt.get(k))
short={'pack':'Pack','ground':'Ground','crops':'Crops','characters':'Characters','buildings':'Buildings','sprites':'Objects','icons':'Items','tools':'Tools','portraits':'Portraits'}
nav=''.join(f'<a href="#{k}">{short[k]} <small>{cnt[k]}</small></a>' for k,t,_ in order if cnt.get(k))
page=f'''<title>Hollow Creek Art Sheet</title>
<meta name="claude:viewport-fit-sides" content="cover">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Pixelify+Sans:wght@500;700&family=IBM+Plex+Mono:wght@400;500&display=swap">
<style>
/* Layout: a field-guide catalogue — sticky section nav, wrapping cards sized to each asset's real pixels */
:root {{ --bg:#f3ead6; --panel:#fffaf0; --ink:#3b2412; --dim:#7a5c3e; --line:#d9c39a; --accent:#4f9e3b; --chk1:#e7dcc3; --chk2:#f6efdf;
  --display:'Pixelify Sans', 'Courier New', monospace; --mono:'IBM Plex Mono', ui-monospace, Menlo, monospace; }}
@media (prefers-color-scheme: dark) {{ :root:not([data-theme="light"]) {{ --bg:#1f1812; --panel:#2a2119; --ink:#f3e6cc; --dim:#bfa27f; --line:#4a3a2a; --accent:#7cc35a; --chk1:#3a2f25; --chk2:#2f261e; color-scheme:dark; }} }}
:root[data-theme="dark"] {{ --bg:#1f1812; --panel:#2a2119; --ink:#f3e6cc; --dim:#bfa27f; --line:#4a3a2a; --accent:#7cc35a; --chk1:#3a2f25; --chk2:#2f261e; color-scheme:dark; }}
body {{ background:var(--bg); color:var(--ink); font-family:var(--mono); font-size:13px; padding-left:max(16px, env(safe-area-inset-left,0px)); padding-right:max(16px, env(safe-area-inset-right,0px)); padding-block:0 48px; }}
.top {{ max-width:1200px; margin:0 auto; padding-block:28px 8px; }}
h1 {{ font-family:var(--display); font-size:clamp(28px,5vw,44px); margin:0; text-wrap:balance; }}
.sub {{ color:var(--dim); margin:6px 0 0; max-width:65ch; line-height:1.5; }}
.stats {{ display:flex; flex-wrap:wrap; gap:8px 20px; margin-top:12px; font-variant-numeric:tabular-nums; }}
.stats b {{ font-family:var(--display); font-size:20px; color:var(--accent); }}
nav {{ position:sticky; top:env(safe-area-inset-top,0px); z-index:5; background:var(--bg); border-bottom:2px solid var(--line); margin:16px auto 0; max-width:1200px; display:flex; gap:6px; flex-wrap:wrap; padding-block:8px; align-items:center; }}
body::before {{ content:""; position:fixed; inset:0 0 auto; height:env(safe-area-inset-top,0px); z-index:10; background:var(--bg); }}
nav a {{ color:var(--ink); text-decoration:none; font-family:var(--display); font-size:14px; padding:4px 9px; border:2px solid var(--line); border-radius:4px; }}
nav a small {{ color:var(--dim); font-family:var(--mono); font-size:11px; }}
nav a:hover, nav a:focus-visible {{ border-color:var(--accent); outline:none; }}
nav input {{ margin-left:auto; font:inherit; color:var(--ink); background:var(--panel); border:2px solid var(--line); border-radius:4px; padding:5px 8px; min-width:0; width:180px; }}
nav input:focus-visible {{ border-color:var(--accent); outline:none; }}
main {{ max-width:1200px; margin:0 auto; }}
section {{ padding-top:22px; }}
section header {{ display:flex; align-items:baseline; gap:10px; }}
h2 {{ font-family:var(--display); font-size:24px; margin:0; }}
.count {{ color:var(--dim); font-variant-numeric:tabular-nums; }}
.lede {{ color:var(--dim); margin:4px 0 12px; max-width:65ch; line-height:1.5; }}
.grid {{ display:flex; flex-wrap:wrap; gap:10px; align-items:flex-start; }}
.card {{ margin:0; background:var(--panel); border:2px solid var(--line); border-radius:6px; padding:8px; display:flex; flex-direction:column; gap:6px; max-width:100%; min-width:120px; }}
.art {{ display:flex; align-items:flex-end; justify-content:center; min-height:96px; padding:6px; border-radius:3px; overflow:auto; max-width:100%;
  background-color:var(--chk2); background-image:linear-gradient(45deg,var(--chk1) 25%,transparent 25%,transparent 75%,var(--chk1) 75%),linear-gradient(45deg,var(--chk1) 25%,transparent 25%,transparent 75%,var(--chk1) 75%); background-size:16px 16px; background-position:0 0,8px 8px; }}
.art img {{ image-rendering:pixelated; max-width:none; display:block; }}
figcaption {{ display:flex; flex-direction:column; gap:2px; max-width:max(120px, var(--w)); min-width:0; }}
figcaption b {{ font-weight:500; overflow-wrap:anywhere; }}
.dim {{ color:var(--dim); font-variant-numeric:tabular-nums; }}
.note {{ color:var(--dim); font-size:11px; font-style:italic; }}
.hide {{ display:none !important; }}
@media (max-width:600px) {{ nav input {{ width:100%; margin-left:0; }} }}
</style>
<div class="top"><h1>Hollow Creek Art Sheet</h1>
<p class="sub">Every image in the game, at its exact pixel size, pulled straight from the live build. Small items are shown at 2× so the pixels are easy to see; the size label is always the true size. The checkerboard is transparency.</p>
<div class="stats"><span><b>{made}</b> drawn for the game</span><span><b>{cnt['pack']}</b> from your pack</span><span><b>48 px</b> = 1 tile</span></div></div>
<nav>{nav}<input id="q" type="search" placeholder="Filter by name…" aria-label="Filter assets by name"></nav>
<main>{secs}</main>
<script>
const q=document.getElementById('q');
q.addEventListener('input',()=>{{const v=q.value.trim().toLowerCase();document.querySelectorAll('.card').forEach(c=>c.classList.toggle('hide',v&&!c.dataset.name.includes(v)));document.querySelectorAll('section').forEach(s=>s.classList.toggle('hide',!!v&&!s.querySelector('.card:not(.hide)')));}});
</script>'''
open(S+'art_sheet.html','w').write(page)
print(len(page)//1024,'KB')
