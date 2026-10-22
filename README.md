# Hollow Creek Farm

A cozy Stardew Valley / Harvest Moon–style farming game that runs in the browser — on desktop or phone — as a single HTML file.

Farm, fish, mine, craft, build, hire helpers and run your own little farm shop.

## Play
Open `dist/index.html` in a browser. No server or install needed.

**Desktop:** WASD to move · click/Space to use a tool · right-click/E to interact · 1–0 hotbar · Tab inventory · C crafting · H help
**Phone:** joystick to move · USE / TALK-OPEN buttons · BAG, CRAFT, ? buttons

## Design highlights
- **No energy bar.** Instead, staying awake 24h+ makes you Exhausted (lower quality, smaller yields, fumbles); 36h+ is Delirious. Sleep, naps and coffee recover.
- **Your own farm shop:** stock the stall's shelves, set prices, and customers walk up to buy. Town merchants pay only 60%.
- **Three money pillars:** crops (4 seasons, greenhouse), fishing in the farm pond (bait required) with a reel minigame, and a 60-floor mine.
- **Progression:** furnace → bars → tool upgrades (Copper → Iridium), sprinklers, artisan machines, buildings (worker cabins, shed, silo, greenhouse, shop expansions).
- **Workers:** shopkeeper, farmhand, miner and fisher, paid daily.

## Project layout
| Path | Contents |
|---|---|
| `src/00_core.js` | Engine: loop, input, maps, inventory, time & fatigue, UI framework, save/load |
| `src/10_art.js` | All procedural pixel art (tiles, characters, buildings, icons, tool tiers) |
| `src/20_farm.js` | Farm, house & greenhouse maps; soil, crops, seasons, weather, debris |
| `src/30_mine_fish.js` | Procedural mine floors, ore nodes, elevator; fishing & reel minigame |
| `src/40_economy.js` | Town, merchants, farm shop & customers, crafting, machines, buildings, upgrades, workers |
| `src/50_touch.js` | Touch controls for phones |
| `src/style.css` | UI styles |
| `assets/` | Original 48×48 pixel-art asset pack |
| `tools/build.py` | Builds `dist/index.html` (embeds assets). `--artifact` emits a skeleton-less variant |
| `tools/smoke.js`, `tools/mobile.js`, `tools/scenarios/` | Headless Playwright tests |
| `CONTRACT.md` | Design doc & module contract |

## Build & test
```
python3 tools/build.py                          # -> dist/index.html
node tools/smoke.js tools/scenarios/farm.js     # headless smoke test (needs Playwright + Chromium)
node tools/mobile.js                            # phone emulation test
```
