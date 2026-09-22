# ScoutCraft code layout

The game used to be one 10,000-line `main.js`. It's now split into the files below, each covering
one area of functionality, so you can work on (say) just the animals or just the cooking UI without
reading the whole thing. Read this file before editing any one of them in isolation — the split is
purely organizational, not architectural: there's no build step, no bundler, and no `import`/`export`.
Every file below is loaded as a plain classic `<script>` tag (see the `SCOUTCRAFT_FILES` list in
`../index.html`), and classic `<script>` tags on one page all share **one global scope** — a
top-level `const`/`let`/`function` in one file is directly visible to every file loaded after it,
exactly as if this were still one file. That's what makes the split possible without a rewrite.

## Load order matters — but less than you'd think

`index.html` loads these files in the fixed order listed below. Two hard rules bookend it:

- **`items.js` loads first.** It defines the block/item registry (`BLOCK_COLOR`, `BLOCK_NAME`,
  `ALL_ITEMS`, `CARRY_ONLY_ITEMS`, `HOTBAR_ICON`) that every other file reads from — and cooking's
  ingredient/dish data in that same file *mutates* those tables (pushes new ids into them) rather
  than building its own. If you add a new item family anywhere else, don't build a parallel registry —
  extend these same tables, the way cooking already does.
- **`bootstrap.js` loads last.** It's the only file that actually *calls* anything at the top level
  (`init()`, then `animate()`, then the update-checker's `setInterval`s) — everything before it just
  defines functions and data for `bootstrap.js` to kick off once the whole world exists.

Between those two bookends, order mostly doesn't matter. Almost every cross-file reference in this
codebase is *inside a function body* (e.g. `updateBirds()` in `wildlife-air-water.js` reads the
`worms` array from `wildlife-land.js`), and function bodies aren't evaluated until they're *called* —
by which point every file has already finished loading. The one thing that does need real ordering is
a top-level statement that *runs immediately* at load time — a `const` built by calling another file's
function (e.g. `worldgen.js`'s `const atlasTexture = buildAtlas()` needs `textures.js`'s `buildAtlas`
already defined), or a top-level loop that reads another file's data table. If you ever add one of
those, make sure the file it depends on is listed earlier in `SCOUTCRAFT_FILES`.

One harmless pre-existing quirk carried over from the original file: both `worldgen.js` and
`sky-weather.js` define a top-level `function lerp(a,b,t)` (same formula, written two different ways).
Redeclaring a `function` — unlike `const`/`let` — is legal and just makes the later one win, exactly
as it did when both were in the same file. Not a bug; left alone rather than "fixed" as part of the
split.

## The files, in load order

| File | Covers |
|---|---|
| `items.js` | World/gen constants, block ID constants, the item/block registry, hotbar defaults + persistence + icons, cooking ingredient/dish/recipe data, toggle/collect maps. |
| `badges.js` | Balance constants (HP/hunger/animal stats/real-world scale), merit badges & ranks, Scout progress persistence, badge toasts, `checkBadges`, the `Scout` tracker + HUD + rank badge, compass, fishing, archery-shoot, sash UI. |
| `crafting.js` | `RECIPES`, inventory helpers, crafting-table/tent lookups, protected cells. |
| `textures.js` | The procedural texture atlas — every `draw*` pixel-art function, atlas assembly, rank emblem art, US flag master canvas. |
| `worldgen.js` | Perlin noise, world storage (`getBlock`/`setBlock`), `generateWorld`, the fixed camp landmarks (cooking area, totems, archery range, meditation hill, scout law boxes), tree/bush planting. |
| `persistence.js` | Core save/load: world edits, inventory, last position. Other subsystems (worms, butterflies, saplings, fires, bear box, backpack) keep their own save/load next to their own logic. Also `resetAllProgress` + the `wipingSave` flag, which *do* reach across all of them — see below. |
| `rendering.js` | Chunked mesh building, tree species/tint, minimap. |
| `player-model.js` | Player state/spawn, the blocky avatar model + its textures, the floating name/HP tag, and every animal's 3D model. How things *look*. |
| `animals.js` | Land-animal AI (rabbit/squirrel/deer/bear/moose) — spawn, update, damage, kill. How land animals *behave*. |
| `sound.js` | Web Audio synth tones/noise, the real audio-clip players, the SFX dispatch table. |
| `combat.js` | HP/hunger UI, damage, death, respawn, sleep, attack targeting, third-person/peek camera state. |
| `world-edits.js` | Runtime world mutation: `applyWorldEdit`, torch lights, tree-fall physics, saplings, tree regrowth, fire, water flow, fireworks. |
| `sky-weather.js` | Day/night cycle, calendar, sun/moon/shadows, stars + Big Dipper, weather, seasons/temperature, wind/rain/lightning, scuba view. |
| `wildlife-land.js` | Fireflies, worms, gophers, butterflies, Hercules beetles. |
| `wildlife-air-water.js` | Birds (30 species), big eagles, fish, turtles, frogs. |
| `vehicles.js` | The kayak and the horse. |
| `interaction.js` | First-person hand/held-item view-model, physics collision, `updatePlayer` (the per-frame physics function), block raycast/break/place, door/ladder/tent/flag placement. |
| `input.js` | Keyboard/mouse input, hotbar keys, touch controls, the debug panel, hotbar UI. |
| `ui-menus.js` | Crafting modal, items panel, quit/thank-you screen, achievement share image. |
| `ui-storage.js` | Bear box, cookware, backpack storage, quick-action icons, camp log/chat. |
| `bootstrap.js` | `init()`, the `animate()` loop, the update checker. **Loads last.** |

## Resetting: one flag that crosses every file

`resetAllProgress()` (persistence.js) is the only thing here that has to know about *all* the save
code at once, and it deliberately doesn't. Rather than calling twelve `clear*` functions it sweeps
`localStorage` for the `scoutcraft_` prefix every save in the project already uses, then reloads —
so a new subsystem that stores something gets cleaned up for free, as long as it keeps the prefix.
**If you add a saved key, prefix it `scoutcraft_`, or the reset will quietly leave it behind.**

The catch is the reload itself, which runs the normal teardown path — and that path *saves*.
`savePosition` fires on `beforeunload`/`pagehide` and would write the old camp straight back into
the store that was just emptied. Hence `wipingSave`: set once at the start of the wipe, never
unset, and checked by `savePosition` and by bootstrap.js's "Leave site?" handler. **Any new
save-on-exit work needs the same guard**, or resetting will silently half-fail — the worst kind of
bug here, because the player sees a fresh world and only notices the leftovers much later.

## Cache-busting

`index.html` appends the *same* `?v=<timestamp>` to every file in `SCOUTCRAFT_FILES` on every page
load — one shared timestamp, so a deploy invalidates all 21 files atomically, the same guarantee the
single-`main.js` version had. The in-game update checker (`bootstrap.js`) polls every file in that
same list (without the cache-busting param, so it sees real server state) and compares their combined
ETag/Last-Modified headers to catch a deploy that only touched one file.
