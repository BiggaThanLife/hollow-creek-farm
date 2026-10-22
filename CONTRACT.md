# Hollow Creek Farm — Design Doc & Module Contract

A cozy Stardew/Harvest-Moon-style farming game in **one self-contained HTML file** (vanilla JS + Canvas 2D, DOM overlay for UI).
Build: `python3 tools/build.py` → `dist/index.html`. **While other agents are working in parallel, build an isolated bundle** so their half-written files can't break you: `python3 tools/build.py --only=20_farm --stub --out=dist/test_farm.html` (core + your file [+ `10_art` if it currently builds] + stub) then `node tools/smoke.js tools/scenarios/farm.js --html=dist/test_farm.html --shots=<scratch>/shots_farm`. Test: `node tools/smoke.js [scenario.js]` (headless Chromium; prints console errors, saves screenshots to the scratchpad `shots/` dir). **Read `src/00_core.js` fully before writing code** — it is the engine and the source of truth for every API below.

## Design pillars (from the player's brief — do not violate)
1. **Farming, fishing, mining** are the three money pillars. Everything sells.
2. **NO ENERGY BAR.** The player can act forever. Instead: **tiredness** = minutes awake (`G.state.awake`). At 24h+ awake ("Exhausted") and 36h+ ("Delirious") the *quality of work* drops: use `G.rollQuality(skillLvl, bonus)` for every produced item (it applies the fatigue penalty), multiply yields by `G.workMult()`, and call `G.fumble()` at the start of every tool action (returns true → the action does nothing this swing). Never block the player.
3. **Sell crops in your own little shop** (farm stall with display shelves; customers walk up and buy). Selling to town merchants also exists but at a worse rate (60%).
4. **Build on the farm** & **progress naturally** from money: buildings, tool upgrades, crafting unlocks.
5. **Crafting is part of progression** (furnace → bars → tool upgrades/sprinklers/buildings; artisan machines multiply crop value).
6. **Hire people**: shopkeeper, farmhand, miner, fisher. Daily wages.
7. **Pond on the farm** for fishing. **Fishing requires bait** (one consumed per cast).
8. **Tool upgrades** at the blacksmith (Basic → Copper → Iron → Gold → Iridium).

Feel: chill, generous, Stardew-like pacing. A day is ~17 real minutes (`G.TIME_SCALE`). Day starts 6:00 AM (`state.time = 0`). If the player stays up past 6:00 AM the next day begins automatically (crops grow, workers work) without resetting tiredness.

## Files & ownership (only edit your own file; ask the lead for core changes)
| File | Owner | Contents |
|---|---|---|
| `src/00_core.js`, `src/style.css` | Lead | engine, UI framework, items base, time/fatigue, save |
| `src/10_art.js` | **Art agent** | all procedural pixel art: ground tiles, player & NPC sprites, world sprites, item icons, tool icons per tier, lights |
| `src/20_farm.js` | **Farm agent** | maps `farm` + `house`; soil/crops/seasons; debris (trees, rocks, weeds); trees regrow; pond tiles; bed/sleep; seeds & crop items; scythe/hoe/can/axe/pick behaviour on farm; sprinklers, fertilizer, scarecrow effects; greenhouse growing rule; starting inventory |
| `src/30_mine_fish.js` | **Mine+Fish agent** | map `mine` (procedural floors) ; ore/gem/stone nodes; ladders; elevator every 5 floors; fishing (cast, bite, reel minigame), fish items, bait use; fishing in any water tile on any map |
| `src/40_economy.js` | **Economy agent** | map `town`; merchants (General Store, Blacksmith, Carpenter, Inn); **farm shop stall** & customers; crafting system + recipes + machines (furnace, preserves jar, keg, chest); buildings & placement; tool upgrades; workers (hire, wages, daily jobs); crafting tab + `C` hotkey |
| `src/99_stub_test.js` | Lead | temporary; will be deleted. Don't depend on it. |

Load order is filename order; all modules must only do work inside events (`init`, `newGame`, `loadGame`, …) so order doesn't matter. Wrap your file in an IIFE `(() => { ... })();`.

## Lifecycle events (G.on / G.emit)
- `assetsLoaded` — pack PNGs in `G.assets[key]`. **Art builds sprites/icons here.**
- `init` — define maps, objTypes, items, recipes, UI tabs, hotkeys.
- `newGame` — fresh save: seed `G.state` (inventory, map objects, `state.mod.<you>`).
- `loadGame(fresh)` — every start (new or loaded): rebuild runtime-only things from state (NPC entities etc.).
- `tick(dt)` every frame · `minute10(t)` every 10 game min · `hour(h)` (wall clock hour 0–23) · `dayEnd(slept)` · `newDay(slept)` · `newSeason(s)` · `mapChange(mapId, spawn)` · `invChange` · `levelUp(skill,lvl)` · `money(delta)` · `itemSold(id, qty, gold, channel)` (`channel`: 'shop' | 'merchant') · `action(ctx, done)` · `toolMiss(ctx)`.
- Use `G.report(text, icon)` during `newDay` for the overnight summary (worker results, machine output, shop takings).

## World layout & warps (exact ids — everyone relies on these)
- `farm` (Farm agent, ~56×44). Spawns: `start` (outside house door), `house_door` (same spot), `east` (arriving from town, at east edge on the road), `mine` (arriving from mine, at the cave mouth in the north cliff). Warps: house door → `house`/`door`; east road edge → `town`/`west`; cave mouth → `mine`/`top`.
  `G.maps.farm.meta` **must** expose: `shopSpot:{x,y}` (top-left of a free 3×2 area beside the road near the house where the stall goes), `crateSpot:{x,y}` (free 1×1 next to stall for the shop stock crate), `customerPath:[{x,y},...]` (tile waypoints from east edge → standing tile in front of the stall), `buildZone:{x,y,w,h}` (cleared-ish area where buildings may be placed), `pond:{x,y,w,h}`, `field:{x,y,w,h}` (starting tillable area).
- `house` (Farm agent, indoor). Spawns `door`, `bed`. Bed object → `G.ui.sleepMenu()`. Warp door → `farm`/`house_door`. Decorate with pack furniture (`farm_bed`, `fireplace`, `bookshelf`, `kitchen_counter`, `wooden_table`, `wooden_chair`, `rocking_chair`, `candle_table`, `plant_pot`...).
- `town` (Economy agent, ~44×32). Spawn `west`. Warp west edge → `farm`/`east`. Buildings with doors you **interact** with (no interiors): General Store, Blacksmith, Carpenter, Inn (hire workers, buy coffee). A river/fountain is nice (fishable water works automatically).
- `mine` (Mine agent, `persistent:false`, `saveAs:{map:'farm',spawn:'mine'}`). Spawn `top`. Floor 0 = entrance room with ladder up → `farm`/`mine` and ladder down + elevator. Floors 1..60.

Ground chars (Art draws, core collides): `g` grass, `G` grass variant, `d` dirt, `p` cobble path, `s` sand, `w` water (solid; fishable), `b` bridge/dock (walkable), `f` wood floor, `W` interior wall (solid), `c` cliff/rock wall (solid), `m` mine floor, `M` mine wall (solid), `v` void (solid), `X` invisible solid. Maps are arrays of equal-length strings.

## Map generation order (core guarantees)
On a NEW game, core calls every persistent map's `generate()` exactly once (flag `data._gen`) **before** emitting `newGame`. So: Farm agent puts debris in `generate()` (keep `shopSpot`/`crateSpot`/`customerPath`/house door area clear); Economy agent places the stall in `newGame` and may remove any object overlapping it. `G.world.ensureGenerated(id)` is idempotent.

## Objects (persisted) vs entities (runtime)
- **Objects**: plain JSON in `G.world.objects(mapId)` → `{type, x, y, ...data}` (tile coords, top-left of footprint). Behaviour in `G.defObj(type, {w,h,solid,draw,interact,onTool,onItem,update,label})`. Use `G.world.addObject/removeObject/objectAt/canPlace`. Hooks you call yourself from `newDay`/`minute10` by iterating objects (core does NOT auto-call `newDay`/`minute10` on objects — iterate in your own listeners).
- `draw(ctx,o,px,py)`: px,py = screen position of footprint top-left. Tall sprites draw upward: `ctx.drawImage(spr, px, py + h*48 - spr.height)`.
- **Entities**: `G.world.addEnt(mapId, {x,y (px, feet), update(dt), draw(ctx,sx,sy), interact?()})` — NPCs, customers, workers. Not saved; rebuild on `loadGame`/`mapChange`.
- Ground item drops: `G.world.dropItem(mapId, px, py, id, qty, q)` (auto-magnet pickup). Prefer `G.inv.give()` for rewards (falls back to dropping).

## Actions
- Left-click/Space → `G.doAction()`: target = `G.targetTile()`. Order: held tool → `objType.onTool(o, toolId, tier, ctx)`; any item → `objType.onItem(o, slot, ctx)`; `item.use(ctx)`; `map.useTile(ctx)`. Return true when handled. `ctx = {map,x,y,slot,slotIndex,item,tier,obj}`.
- Right-click/E → `G.doInteract()`: entity `interact()` near the facing tile, then `objType.interact(o,mapId)`, then `map.interactTile(x,y)`.
- Tools tick with mouse held (not rod). Tool tier: `G.state.tools[id]` 0–4.
- **Tool effects by tier** (Farm & Mine agents implement; Economy sells upgrades):
  - Hoe / Watering can: area 1, 3 (line), 5 (line), 9 (3×3), 18 (3×6) — apply on press. Can has no water limit (refill not needed — keep it chill).
  - Axe: hits to fell tree = 5,4,3,2,1; stump needs tier ≥1 (copper) for large stumps (hardwood).
  - Pickaxe: hits per rock = 3,2,2,1,1 (farm) ; mine node hardness: stone 1, copper 1, iron needs tier≥1, gold needs ≥2, iridium needs ≥3; big boulders on the farm need ≥2.
  - Scythe: cuts weeds/harvests in radius 0,1,1,2,2.
  - Fishing rod: tier widens the catch bar and speeds the reel (Mine+Fish agent).

## Items (ids are global — check `G.items` before defining)
Core already defines: tools (`hoe watering_can axe pickaxe scythe fishing_rod`), `wood hardwood stone fiber sap clay coal copper_ore iron_ore gold_ore iridium_ore copper_bar iron_bar gold_bar iridium_bar quartz amethyst topaz emerald ruby diamond worm bait deluxe_bait coffee`.
- **Farm agent** defines crops (produce) + seeds: crop ids `carrot potato cabbage strawberry tomato corn sunflower wheat pumpkin`; seeds `seeds_<crop>`; plus `fertilizer`, `speed_gro`, `sprinkler`, `quality_sprinkler`, `iridium_sprinkler`, `scarecrow`, `acorn` (plants an oak), `pine_cone`.
  Crop table (cat `'crop'`; Farm agent finalises numbers; seed price in General Store ~ crop price × 0.4–0.6):
  | crop | seasons | days | regrow | sell |
  |---|---|---|---|---|
  | carrot | Spring | 4 | – | 45 |
  | potato | Spring | 6 | – | 80 (chance of extra) |
  | cabbage | Spring | 8 | – | 160 |
  | strawberry | Spring | 8 | 4 | 120 |
  | tomato | Summer | 11 | 4 | 60 |
  | corn | Summer, Fall | 14 | 4 | 50 |
  | sunflower | Summer, Fall | 8 | – | 80 (+ drops seeds) |
  | wheat | Summer, Fall | 4 | – | 25 |
  | pumpkin | Fall | 13 | – | 320 |
  Winter: nothing grows outdoors (greenhouse grows any crop any season). Crops die at season change if out of season (except greenhouse).
- **Mine+Fish agent** defines fish (cat `'fish'`): `sunfish carp bream perch catfish bass pike eel trout salmon sturgeon koi` + `trash` (cat 'misc', 0g? give 1g) + `seaweed`. Also `geode` optional. Ores/gems/coal/stone use core ids.
- **Economy agent** defines crafted/machine items: `chest furnace preserves_jar keg workbench? jam pickles wine juice` and furniture items for decoration (pack furniture keys as item ids e.g. `furn_bookshelf`), `torch`, `path_stone`, `fence` etc.
Item def: `{id, name, icon, price, cat, desc, stack, use?(ctx), place?}` — `icon` is a name resolved by `G.icon()` (art icons → pack assets → placeholder). Categories used by the shop: `crop, fish, mineral, material, artisan, bait, food, seed, tool, craftable, furniture, misc`.

## Cross-module APIs (exact names — implement if you own them, call if you need them)
Farm agent exposes `G.farming = {`
- `waterAll(mapId='farm')` → number of tiles watered (used by farmhand/sprinkler logic)
- `harvestReady(max=Infinity)` → `[{id, qty, q}]` harvests ready crops on farm (+greenhouse), removes/regrows them, gives XP to nobody (worker). Quality via `G.rollQuality(G.skillLvl('farming')*0.5)`.
- `isTillable(mapId,x,y)`, `soilAt(mapId,x,y)` → `{tilled, watered, crop?}` or null
- `crops` (the crop table object keyed by crop id) `}`
Mine+Fish agent exposes `G.mining = { rollOre(depth) → {id, qty}, deepest() }` and `G.fishing = { rollFish(locationId, opts) → id, startCast(waterTile), isFishing() }`.
Economy agent exposes `G.economy = { workers(), hasWorker(type), shopStall(), addRecipe(id) }`.

## Art contract (Art agent produces; everyone else uses names)
`G.art` API (attach to the existing `G.art` object — don't replace it):
- `drawGround(ctx, map, ch, tx, ty, sx, sy, now)` — 48px tiles, neighbour-aware edges for water/cliff/path; animated water.
- `drawSoil(ctx, sx, sy, watered, map, tx, ty)` — tilled soil overlay (neighbour-aware nice-to-have).
- `drawCrop(ctx, cropId, stage, maxStage, sx, sy, now)` — stage 0..maxStage (maxStage = harvestable, use pack image). Draw anchored to the tile, may extend upward.
- `drawPlayer(ctx, p, sx, sy)` — p: `{dir, moving, animT, swingT, swingTool}`; sx,sy = feet centre. 4-direction walk animation; tool swing pose showing the tool icon.
- `drawNPC(ctx, look, dir, moving, animT, sx, sy)` — look `{skin, hair, hairColor, shirt, pants, hat?}`. Same body as player with palette swaps.
- `toolIcon(id, tier)` → 48×48 canvas; tiers recoloured metal (basic grey/brown, copper, iron silver, gold, iridium purple).
- `drawLights(ctx, map, darkness)` — optional warm glows (windows, lamps, torches) — read `map.lights=[{x,y,r}]` (tile coords) if present.
- `icons[name]` 48×48 canvases, `sprites[name]` canvases. Use `G.sprite(name)`/`G.icon(name)`.
Required **icon** names (beyond pack images): all core items above, `seeds_<crop>` (packet with crop tint), crops that lack a pack icon (`cabbage`→pack `cabbage_crop` ok via icon field; Farm agent will map icons), all 12 fish + `trash seaweed`, `fertilizer speed_gro sprinkler quality_sprinkler iridium_sprinkler scarecrow acorn pine_cone chest furnace preserves_jar keg jam pickles wine juice torch path_stone geode`.
Required **sprite** names (world, with sizes):
- `tree_oak` (96×144, trunk centred on bottom tile), `tree_pine` (96×144), `tree_oak_winter`, `tree_sapling` (48×48; or pack `apple_tree_sapling`), `stump` (48×48), `big_stump` (96×96), `rock` (48×48), `boulder` (96×96), `weeds` (48×48, 3 variants `weeds`,`weeds2`,`weeds3`), `twig` (48×48), `bush` (96×96), `flowers` decor (48×48)
- Mine: `mine_rock` (+`mine_rock2`), `node_copper node_iron node_gold node_iridium node_gem node_coal` (48×48), `ladder_down`, `ladder_up`, `elevator` (48×96), `mine_entrance` (144×144 cave mouth set into cliff), `crystal_decor`.
- Buildings (width = footprint×48, bottom aligned): `farmhouse` (5×3 footprint → 240×240, door at footprint column 2, bottom row), `shop_stall` (3×2 → 144×168, awning; display shelves on counter), `store_general`, `store_blacksmith`, `store_carpenter`, `inn` (each 6×4 → 288×288, door at centre bottom), `worker_cabin` (3×3 → 144×192), `greenhouse` (6×5 → 288×288), `shed` (4×3 → 192×192), `silo` (2×2 → 96×168).
- Placeables: `chest`, `furnace`, `furnace_on`, `preserves_jar`, `preserves_jar_ready`, `keg`, `keg_ready`, `sprinkler`, `quality_sprinkler`, `iridium_sprinkler`, `scarecrow` (48×96), `torch`, `fence` (pack `wooden_fence` ok), `path_stone`.
- Fishing: `bobber` (16×16), `fish_bar` UI handled by mine agent.
- Characters' portraits for dialog: `portrait_<npc>` (48×48) for the original town NPCs: General Store = **Mabel**, Blacksmith = **Bram**, Carpenter = **Wren**, Innkeeper = **Otis** → `portrait_mabel portrait_bram portrait_wren portrait_otis`, plus worker portraits `portrait_worker1..4`.
Until art lands, `G.icon/G.sprite` return labelled placeholders — **always go through them**, never hard-fail on missing art.

Pack images (keys in `G.assets`): apple_tree_sapling axe axe_2 basket basket_2 basket_3 birdhouse bookshelf bookshelf2 bucket bucket_2 cabbage_crop candle_table candle_table_2 carrot_crop carrot_crop_2 corn_plant farm_bed farm_cart farm_cart_2 fireplace fireplace_2 fireplace_3 flower_patch hay_bale hay_bale_2 hoe kitchen_counter kitchen_counter_2 plant_pot potato_plant potato pumpkin_crop rake rake_2 rocking_chair scythe scythe_2 scythe_3 scythe_4 shovel shovel_2 shovel_3 strawberry sunflower tomato_plant tomato toolbox toolbox_2 toolbox_3 watering_can well well_2 well_3 wheat_bundle wheat_bundle_2 wooden_cabinet wooden_chair wooden_fence wooden_sign wooden_storage_barrel wooden_storage_crate wooden_table. All 48×48 RGBA, detailed pixel art. Note `scythe`, `scythe_3`, `scythe_4` actually look like pickaxes; `scythe_2` is a hammer-ish tool. The art agent should draw a proper scythe and use a pack pickaxe image as the base pickaxe.

## Economy targets (Economy agent tunes, others respect)
Start: 500g, basic tools, 15 carrot seeds, 10 bait, 3 coffee. Day-1 income ≈ 0–150g; Week-1 ≈ 1.5–3k; end of Spring ≈ 15–30k. Buildings 3k–25k + materials. Tool upgrade costs: Copper 2,000g + 5 copper bars; Iron 5,000g + 5 iron bars; Gold 10,000g + 5 gold bars; Iridium 25,000g + 5 iridium bars (ready next morning). Worker wages: 60–150g/day. Furnace: 5 bars from 5 ore + 1 coal, 30 game min each bar.

## Quality & XP
XP: harvest crop = price/8ish (min 3); catch fish = 5–40; break mine node 2–15; craft item 5. Quality ★ multiplies price by `G.QUALITY_MULT`. Always roll quality through `G.rollQuality`. Show "Exhausted" consequences visibly (e.g. a gray "(tired)" float text when quality got reduced is a nice touch).

## UI helpers you get for free
`G.ui.panel`, `dialog`, `confirm`, `toast`, `openShop(title, stock, {sell, sellMult, greeting})`, `openContainer(title, itemsArray, {filter})`, `invGrid`, `addTab(id,label,render,order)`, `hotkey(code, fn)`, `G.helpExtra.push(html)`, `G.fx.float/burst`, `G.sfx(name)` (`hit dig water pickup coin splash bite craft error level chop break reel open step catch`).

## Quality bar
- No console errors. Run `python3 tools/build.py && node tools/smoke.js tools/scenarios/<yours>.js` and look at the screenshots with the Read tool.
- Write a scenario file `tools/scenarios/<module>.js` exercising your features through `window.G` (teleport, give items, call actions, advance time with `G.advanceTime(m)`), and screenshot the results.
- Keep it fun and readable: tooltips, toasts and float text explain what happened. Short in-world dialogue with charm (original characters only; no Stardew names/characters).
