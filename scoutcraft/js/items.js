// ScoutCraft — a tiny Minecraft-inspired voxel sandbox built on three.js.
// Single finite world, chunked meshes for fast edits, no build step required.
//
// The game is split across the files in this js/ directory, loaded in a fixed order (see the
// SCOUTCRAFT_FILES list in ../index.html) as plain classic <script> tags sharing one global scope —
// no bundler, no import/export. See js/ARCHITECTURE.md for the full file map and the shared-state
// rules every file here depends on before you edit any one of them in isolation.

// ---------- items.js ----------
// World/gen constants, block IDs, the item/block registry (BLOCK_COLOR/BLOCK_NAME/ALL_ITEMS/CARRY_ONLY_ITEMS), hotbar defaults+persistence+icons, cooking ingredient/dish/recipe data (extends the same registry tables), toggle/collect maps.
// Loads FIRST — everything else reads from the tables defined here.
'use strict';

// ---------- Config ----------
const WORLD_SIZE = 128;     // x/z extent (4x the original 64x64 area, same generation algorithm)
const WORLD_HEIGHT = 48;    // y extent
const CHUNK_SIZE = 16;
const CHUNKS_PER_SIDE = WORLD_SIZE / CHUNK_SIZE;
const SEA_LEVEL = 18; // flooded 1 block higher again (originally 15)
const BASE_HEIGHT = 20;
const AMPLITUDE = 9;
const SEED = 1337;
const FAR = 400;

const AIR=0, GRASS=1, DIRT=2, STONE=3, SAND=4, WOOD=5, LEAVES=6, PLANKS=7, WATER=8, BEDROCK=9;
const CRAFTING_TABLE=10, BRICKS=11, STICK=12;
const WINDOW=13, WINDOW_OPEN=14, DOOR=15, DOOR_OPEN=16;
const SAPLING=17;
const FLINT=18, FIRE=19, TORCH=20, FIREWORK=21, LADDER=22, MEAT=23;
// ---------- ScoutCraft camp gear ----------
// ROPE, COMPASS and COOKED_MEAT are carried items — you never place them as blocks (right-clicking
// them does something instead, see doInteract). TENT, CAMPFIRE, LANTERN, FLAG and BACKPACK are real
// blocks that go in the world; CAMPFIRE and LANTERN also give off light (see updateTorchLight). TENT
// isn't a single cube like the rest — placing one builds a small walk-in shelter (see placeTent).
const ROPE=24, TENT=25, CAMPFIRE=26, LANTERN=27, FLAG=28, COMPASS=29, COOKED_MEAT=30, BACKPACK=31;
// DUTCH_OVEN/POT/PAN/GRIDDLE/BEAR_BOX are pre-placed camp-cooking fixtures (see buildCookingArea) —
// not craftable, not in any hotbar/inventory, and permanently protected from breaking (see
// PROTECTED_CELLS) rather than ordinary placeable blocks like the rest of this section.
const DUTCH_OVEN=32, POT=33, PAN=34, GRIDDLE=35, BEAR_BOX=36;
// FLAG_POLE is the bare-pole block placeFlag uses for the bottom two segments of a 3-tall Troop
// Flag — never craftable or held on its own, same non-inventory status as the cooking fixtures above.
const FLAG_POLE=37;
// The Scout's 10 Essentials (the real BSA list) plus a Scoutbook — carried items like ROPE/COMPASS,
// never placed as blocks (see CARRY_ONLY_ITEMS in doInteract). Not craftable; they only ever enter
// play already packed in the Backpack (see SCOUT_ESSENTIALS/loadBackpackStorage).
const POCKETKNIFE=38, FIRST_AID_KIT=39, EXTRA_CLOTHING=40, RAIN_GEAR=41, WATER_BOTTLE=42,
      FLASHLIGHT=43, TRAIL_FOOD=44, SUN_PROTECTION=45, SCOUTBOOK=46;
// FISHING_POLE is a carried tool like Compass — right-clicking it does something special (see
// tryFish) rather than either placing a block or being a no-op, so it's deliberately left out of
// CARRY_ONLY_ITEMS below. FISH is what it catches: a plain carried item like the essentials, no
// special interaction of its own.
const FISHING_POLE=47, FISH=48;
// SCOUT_LAW_BOX is a world fixture like DUTCH_OVEN/BEAR_BOX above — never craftable or held, just
// scattered across the map once at world-gen (see placeScoutLawBoxes) and removed for good the moment
// each one is collected.
const SCOUT_LAW_BOX=49;
// Two more carried camp-gear items, pre-packed alongside the essentials (see STARTER_CAMP_GEAR) —
// no block form, no recipe, same as the essentials above.
const SLEEPING_BAG=50, SLEEPING_PAD=51;
// A giant American flag at the cooking area (see buildGiantFlag) — six fixed panel blocks, one per
// cell of a 3-wide x 2-tall mural, each just its own slice of one shared flag image. World fixtures
// like DUTCH_OVEN/BEAR_BOX/SCOUT_LAW_BOX above: never craftable or held, just placed once at world-gen.
const US_FLAG_TL=52, US_FLAG_TC=53, US_FLAG_TR=54, US_FLAG_BL=55, US_FLAG_BC=56, US_FLAG_BR=57;
const US_FLAG_BLOCKS = new Set([US_FLAG_TL, US_FLAG_TC, US_FLAG_TR, US_FLAG_BL, US_FLAG_BC, US_FLAG_BR]);
// A pair of carved camp totems (see buildScoutOathTotem/buildOutdoorCodeTotem) — each one a stack of
// purpose-built rings, one per line of the real text it recites, rather than generic repeating
// symbols. World fixtures like DUTCH_OVEN/BEAR_BOX/SCOUT_LAW_BOX above: never craftable or held, just
// placed once at world-gen. Numbered from 115 (well past the ~57 cooking-item ids that get assigned
// programmatically starting at US_FLAG_BR+1 — see COOK_ID below) so the two ranges can never collide
// regardless of how many ingredients/dishes that table grows to.
// The Scout Oath totem: bottom to top, the "On my honor" plaque, the Physically Strong/Mentally
// Awake/Morally Straight creed, "To obey the Scout Law", and "Duty to God and Country".
const TOTEM_OATH_BASE=115, TOTEM_OATH_CREED=116, TOTEM_OATH_LAW=117, TOTEM_OATH_DUTY=118;
const SCOUT_OATH_TOTEM_BLOCKS = [TOTEM_OATH_BASE, TOTEM_OATH_CREED, TOTEM_OATH_LAW, TOTEM_OATH_DUTY];
// The Outdoor Code totem: bottom to top, an "As an American..." recap plaque (reusing the same blank-
// plaque tile as TOTEM_OATH_BASE — see BLOCK_TILES), then the Code's own 4 points in recitation order.
const TOTEM_CODE_BASE=119, TOTEM_CODE_CONSERVATION=120, TOTEM_CODE_CONSIDERATE=121, TOTEM_CODE_FIRE=122, TOTEM_CODE_CLEAN=123;
const OUTDOOR_CODE_TOTEM_BLOCKS = [TOTEM_CODE_BASE, TOTEM_CODE_CONSERVATION, TOTEM_CODE_CONSIDERATE, TOTEM_CODE_FIRE, TOTEM_CODE_CLEAN];
// What doInteract checks a hit block against to decide "was this any totem at all" before looking up
// which specific one via totemAt.
const ALL_TOTEM_BLOCKS = [...SCOUT_OATH_TOTEM_BLOCKS, ...OUTDOOR_CODE_TOTEM_BLOCKS];
// BOW is a carried tool like the Fishing Pole — right-clicking it does something special (see
// tryShootBow) rather than either placing a block or being a no-op, so it's deliberately left out of
// CARRY_ONLY_ITEMS below. ARCHERY_TARGET is a world fixture like DUTCH_OVEN/BEAR_BOX above — never
// craftable or held, just placed once at world-gen (see buildArcheryRange).
const BOW=124, ARCHERY_TARGET=125;
// Items with no block form at all (see doInteract) — right-clicking one does nothing, or whatever
// its own special case above already handles (Flint ignites, Compass takes a bearing).
const CARRY_ONLY_ITEMS = new Set([ROPE, POCKETKNIFE, FIRST_AID_KIT, EXTRA_CLOTHING, RAIN_GEAR,
  WATER_BOTTLE, FLASHLIGHT, TRAIL_FOOD, SUN_PROTECTION, SCOUTBOOK, FISH, SLEEPING_BAG, SLEEPING_PAD]);

const BLOCK_COLOR = {
  [GRASS]:  0x5b8a3a,
  [DIRT]:   0x7a5230,
  [STONE]:  0x8a8a8a,
  [SAND]:   0xe0d18f,
  [WOOD]:   0xa8825a,
  [LEAVES]: 0x3f7d34,
  [PLANKS]: 0xb8894f,
  [WATER]:  0x3a6fd8,
  [BEDROCK]:0x2b2b2b,
  [CRAFTING_TABLE]: 0xa5652f,
  [BRICKS]: 0x9a4a3a,
  [STICK]:  0xc9a06b,
  [WINDOW]: 0xbfe4f0,
  [WINDOW_OPEN]: 0xdff3fa,
  [DOOR]: 0x8a5a34,
  [DOOR_OPEN]: 0xa8815a,
  [SAPLING]: 0x5b8a3a,
  [FLINT]: 0x5c5f66,
  [FIRE]: 0xff8a2b,
  [TORCH]: 0xd98a3d,
  [FIREWORK]: 0xd94dcf,
  [LADDER]: 0x8a6a3a,
  [MEAT]: 0xc9695a,
  [ROPE]: 0xc8a366,
  [TENT]: 0xff0000,
  [CAMPFIRE]: 0xff7a1a,
  [LANTERN]: 0xffd36b,
  [FLAG]: 0xc23b28,
  [COMPASS]: 0xd8d2c0,
  [COOKED_MEAT]: 0x8f4a2c,
  [BACKPACK]: 0x6b4a2f,
  [DUTCH_OVEN]: 0x1c1c1c,
  [POT]: 0x8a8f94,
  [PAN]: 0x2c2420,
  [GRIDDLE]: 0x3a3a3a,
  [BEAR_BOX]: 0x3a5f3a,
  [POCKETKNIFE]: 0x8a1f1f,
  [FIRST_AID_KIT]: 0xd94a3a,
  [EXTRA_CLOTHING]: 0x4a6a8a,
  [RAIN_GEAR]: 0xd9c93a,
  [WATER_BOTTLE]: 0x3a7fd9,
  [FLASHLIGHT]: 0x3a3a3a,
  [TRAIL_FOOD]: 0x9a7a4a,
  [SUN_PROTECTION]: 0xf0d080,
  [SCOUTBOOK]: 0x2a5f8a,
  [FISHING_POLE]: 0x8a6a3a,
  [FISH]: 0x7ab0c9,
  [SCOUT_LAW_BOX]: 0xd4af37,
  [SLEEPING_BAG]: 0x2c3e6b,
  [SLEEPING_PAD]: 0x8a9a7a,
  [US_FLAG_TL]: 0x3c3b6e, [US_FLAG_TC]: 0xb22234, [US_FLAG_TR]: 0xb22234,
  [US_FLAG_BL]: 0xb22234, [US_FLAG_BC]: 0xffffff, [US_FLAG_BR]: 0xb22234,
  [TOTEM_OATH_BASE]: 0x6b4226, [TOTEM_OATH_CREED]: 0x6b4226, [TOTEM_OATH_LAW]: 0x6b4226, [TOTEM_OATH_DUTY]: 0x6b4226,
  [TOTEM_CODE_BASE]: 0x6b4226, [TOTEM_CODE_CONSERVATION]: 0x6b4226, [TOTEM_CODE_CONSIDERATE]: 0x6b4226, [TOTEM_CODE_FIRE]: 0x6b4226, [TOTEM_CODE_CLEAN]: 0x6b4226,
  [BOW]: 0x8a6a3a, [ARCHERY_TARGET]: 0xd9c9a0,
};
const BLOCK_NAME = {
  [GRASS]:'Grass', [DIRT]:'Dirt', [STONE]:'Stone', [SAND]:'Sand', [WOOD]:'Wood',
  [LEAVES]:'Leaves', [PLANKS]:'Planks', [WATER]:'Water',
  [CRAFTING_TABLE]:'Crafting Table', [BRICKS]:'Bricks', [STICK]:'Stick',
  [WINDOW]:'Window', [WINDOW_OPEN]:'Window (open)', [DOOR]:'Door', [DOOR_OPEN]:'Door (open)',
  [SAPLING]:'Sapling', [FLINT]:'Flint', [FIRE]:'Fire', [TORCH]:'Torch', [FIREWORK]:'Firework',
  [LADDER]:'Ladder', [MEAT]:'Raw Meat',
  [ROPE]:'Rope', [TENT]:'Tent', [CAMPFIRE]:'Campfire', [LANTERN]:'Lantern',
  [FLAG]:'Troop Flag', [COMPASS]:'Compass', [COOKED_MEAT]:'Cooked Meal', [BACKPACK]:'Backpack',
  [DUTCH_OVEN]:'Dutch Oven', [POT]:'Cooking Pot', [PAN]:'Frying Pan', [GRIDDLE]:'Griddle', [BEAR_BOX]:'Bear Box',
  [FLAG_POLE]:'Flagpole',
  [POCKETKNIFE]:'Pocketknife', [FIRST_AID_KIT]:'First Aid Kit', [EXTRA_CLOTHING]:'Extra Clothing',
  [RAIN_GEAR]:'Rain Gear', [WATER_BOTTLE]:'Water Bottle', [FLASHLIGHT]:'Flashlight',
  [TRAIL_FOOD]:'Trail Food', [SUN_PROTECTION]:'Sun Protection', [SCOUTBOOK]:'Scoutbook',
  [FISHING_POLE]:'Fishing Pole', [FISH]:'Fish',
  [SCOUT_LAW_BOX]:'Scout Law Box',
  [SLEEPING_BAG]:'Sleeping Bag', [SLEEPING_PAD]:'Sleeping Pad',
  [US_FLAG_TL]:'US Flag', [US_FLAG_TC]:'US Flag', [US_FLAG_TR]:'US Flag',
  [US_FLAG_BL]:'US Flag', [US_FLAG_BC]:'US Flag', [US_FLAG_BR]:'US Flag',
  [TOTEM_OATH_BASE]:'Scout Oath Totem', [TOTEM_OATH_CREED]:'Scout Oath Totem', [TOTEM_OATH_LAW]:'Scout Oath Totem', [TOTEM_OATH_DUTY]:'Scout Oath Totem',
  [TOTEM_CODE_BASE]:'Outdoor Code Totem', [TOTEM_CODE_CONSERVATION]:'Outdoor Code Totem', [TOTEM_CODE_CONSIDERATE]:'Outdoor Code Totem', [TOTEM_CODE_FIRE]:'Outdoor Code Totem', [TOTEM_CODE_CLEAN]:'Outdoor Code Totem',
  [BOW]:'Bow', [ARCHERY_TARGET]:'Archery Target',
};
// Every item the player can ever select. The hotbar only shows HOTBAR_SIZE of these at a time —
// the rest are reachable through the Items panel (the palette button, or the "I" key), which lets
// the player swap any hotbar slot for anything in this list.
// MEAT is deliberately left out — disabled from the inventory/hotbar entirely, so it can't be
// selected even though animals still yield it when killed (see killAnimal-style meat drops).
const ALL_ITEMS = [GRASS, DIRT, STONE, SAND, WOOD, LEAVES, PLANKS, WATER, CRAFTING_TABLE, BRICKS, STICK, WINDOW, DOOR, FLINT, TORCH, FIREWORK, LADDER,
  ROPE, TENT, CAMPFIRE, LANTERN, FLAG, COMPASS, COOKED_MEAT, BACKPACK,
  POCKETKNIFE, FIRST_AID_KIT, EXTRA_CLOTHING, RAIN_GEAR, WATER_BOTTLE, FLASHLIGHT, TRAIL_FOOD, SUN_PROTECTION, SCOUTBOOK,
  FISHING_POLE, FISH, SLEEPING_BAG, SLEEPING_PAD, BOW];
const HOTBAR_SIZE = 9;
// A scout's starting kit: building materials first, then the camp gear you earn badges with.
const DEFAULT_HOTBAR = [WOOD, PLANKS, STONE, CRAFTING_TABLE, CAMPFIRE, TENT, FLAG, FLINT, COMPASS];
const HOTBAR = DEFAULT_HOTBAR.slice();
const HOTBAR_KEY = 'scoutcraft_hotbar_v1';
function saveHotbar(){ try{ localStorage.setItem(HOTBAR_KEY, JSON.stringify(HOTBAR)); }catch(e){} }
function loadHotbar(){
  try{
    const raw = localStorage.getItem(HOTBAR_KEY);
    if(!raw) return;
    const arr = JSON.parse(raw);
    if(Array.isArray(arr) && arr.length===HOTBAR_SIZE && arr.every(id=>ALL_ITEMS.includes(id)))
      for(let i=0;i<HOTBAR_SIZE;i++) HOTBAR[i]=arr[i];
  }catch(e){}
}
// A few items are structures/tools, not plain materials — give them a distinct glyph on top of
// their swatch so they read at a glance instead of just being "another colored square."
const HOTBAR_ICON = { [CRAFTING_TABLE]: '🛠️', [WINDOW]: '🪟', [DOOR]: '🚪', [FLINT]: '🪨', [TORCH]: '🕯️', [FIREWORK]: '🎆', [LADDER]: '🪜', [MEAT]: '🍗',
  [ROPE]: '🪢', [TENT]: '⛺', [CAMPFIRE]: '🔥', [LANTERN]: '🏮', [FLAG]: '🚩', [COMPASS]: '🧭', [COOKED_MEAT]: '🍖', [BACKPACK]: '🎒',
  [POCKETKNIFE]: '🔪', [FIRST_AID_KIT]: '🩹', [EXTRA_CLOTHING]: '🧥', [RAIN_GEAR]: '☂️', [WATER_BOTTLE]: '🥤',
  [FLASHLIGHT]: '🔦', [TRAIL_FOOD]: '🥜', [SUN_PROTECTION]: '🧴', [SCOUTBOOK]: '📘',
  [FISHING_POLE]: '🎣', [FISH]: '🐟', [SLEEPING_BAG]: '🛌', [SLEEPING_PAD]: '🛏️', [BOW]: '🏹' };

// ---------- Cooking ingredients & dishes ----------
// 57 more items (31 raw ingredients + 26 finished dishes) generated from one data table instead of
// hand-written across BLOCK_COLOR/BLOCK_NAME/HOTBAR_ICON/ALL_ITEMS the way the ~13 essentials above
// are — at this scale a table beats 57x4 nearly-identical manual lines. Ids start right after
// US_FLAG_BR (57): ingredients first, then dishes, in the order they're listed below.
const INGREDIENT_DEFS = [
  ['PASTA','Pasta','🍝',0xe8c887], ['CHEESE','Cheese','🧀',0xf2c14e], ['MILK','Milk','🥛',0xf5f5f0],
  ['BUTTER','Butter','🧈',0xf7d358], ['BEEF','Beef','🥩',0x8b3a3a], ['VEGETABLES','Vegetables','🥕',0xe07b39],
  ['POTATOES','Potatoes','🥔',0xc9a06c], ['WATER_JUG','Jug of Water','🚰',0x6fa8dc], ['TOMATOES','Tomatoes','🍅',0xc0392b],
  ['OATS','Oats','🌾',0xd8c48a], ['SUGAR_SYRUP','Sugar/Syrup','🍯',0xd9a441], ['FRUIT','Fruit','🍎',0xb0281a],
  ['SAUSAGE','Sausage','🌭',0xa85c3b], ['BEANS','Beans','🫘',0x8a5a3a], ['SAUCE','Sauce','🥫',0xb03a2e],
  ['TORTILLAS','Tortillas','🫓',0xe8d5a0], ['CHICKEN','Chicken','🐔',0xd9b38c], ['EGGS','Eggs','🥚',0xf0e6d2],
  ['SEASONING','Seasoning','🧂',0xd8d8d8], ['BREAD','Bread','🍞',0xc68a4e], ['HASH_BROWNS','Hash Browns','🍟',0xd9a441],
  ['BACON','Bacon','🥓',0xa8453a], ['GROUND_MEAT','Ground Meat','🥩',0x9a3a3a], ['BAKING_MIX','Baking Mix','🥣',0xe8e0c8],
  ['SODA','Soda','🥤',0x8a5a2a], ['YEAST','Yeast','🫙',0xc9a86b], ['PIZZA_DOUGH','Pizza Dough','🍕',0xe0c898],
  ['PEPPERONI','Pepperoni','🔴',0xa8302a], ['GRAHAM_CRACKERS','Graham Crackers','🍪',0xc99a5c],
  ['MARSHMALLOWS','Marshmallows','⚪',0xf5f0e6], ['CHOCOLATE','Chocolate','🍫',0x5a3a26],
];
// Recipes, grouped by cookware "wareKey" — matching the 5 real stations in buildCookingArea, plus any
// player-placed CAMPFIRE (see doInteract/BLOCK_TO_WARE_KEY below). Deliberately NOT shown anywhere in
// the UI as a required-ingredients list — see openCookware's hint and the design note on tryCookRecipe.
const COOKWARE_DISH_DEFS = {
  pot: [
    ['MAC_CHEESE','Macaroni & Cheese','🧀',0xf2c14e,['PASTA','CHEESE','MILK','BUTTER']],
    ['CAMPFIRE_STEW','Campfire Stew','🍲',0x8a5a3a,['BEEF','VEGETABLES','POTATOES','WATER_JUG']],
    ['TOMATO_PASTA','Tomato Pasta','🍝',0xc0392b,['PASTA','TOMATOES','WATER_JUG','CHEESE']],
    ['SCOUTS_OATMEAL',"Scout's Oatmeal",'🥣',0xd8c48a,['OATS','WATER_JUG','SUGAR_SYRUP','FRUIT']],
    ['HOT_DOGS_BEANS','Hot Dogs & Beans','🌭',0xa85c3b,['SAUSAGE','BEANS','SAUCE']],
  ],
  pan: [
    ['QUESADILLAS','Campfire Quesadillas','🌮',0xe8d5a0,['TORTILLAS','CHEESE','CHICKEN','SAUCE']],
    ['EASY_SCRAMBLE','Easy Scramble','🍳',0xf0e6d2,['EGGS','SAUSAGE','BUTTER','SEASONING']],
    ['GRILLED_CHEESE','Classic Grilled Cheese','🥪',0xc68a4e,['BREAD','CHEESE','BUTTER']],
    ['QUICK_HASH','Quick Hash','🍽️',0xd9a441,['HASH_BROWNS','BACON','EGGS','VEGETABLES']],
    ['PAN_FAJITAS','Pan Fajitas','🌯',0xe07b39,['BEEF','VEGETABLES','SEASONING','BUTTER']],
  ],
  dutch: [
    ['MOUNTAIN_BREAKFAST','Mountain Man Breakfast','🍳',0x9a3a3a,['HASH_BROWNS','EGGS','GROUND_MEAT','CHEESE']],
    ['CHERRY_DUMP_CAKE','Cherry Dump Cake','🍒',0xb0281a,['FRUIT','BAKING_MIX','BUTTER','SODA']],
    ['DUTCH_CHILI','Dutch Oven Chili','🌶️',0x9a3a3a,['GROUND_MEAT','TOMATOES','BEANS','SEASONING']],
    ['CAMPFIRE_BREAD','Cast-Iron Campfire Bread','🍞',0xc68a4e,['BAKING_MIX','WATER_JUG','YEAST','SEASONING']],
    ['DEEP_DISH_PIZZA','Deep Dish Pizza','🍕',0xe0c898,['PIZZA_DOUGH','TOMATOES','CHEESE','PEPPERONI']],
    ['PEACH_COBBLER','Peach Cobbler','🍑',0xd9a441,['FRUIT','BAKING_MIX','MILK','SUGAR_SYRUP']],
  ],
  campfire: [
    ['SMORES',"Classic S'mores",'🍫',0x5a3a26,['GRAHAM_CRACKERS','MARSHMALLOWS','CHOCOLATE']],
    ['FOIL_CHICKEN','Foil Packet Chicken','🍗',0xd9b38c,['CHICKEN','VEGETABLES','BUTTER','SEASONING']],
    ['COAL_POTATOES','Coal-Baked Potatoes','🥔',0xc9a06c,['POTATOES','BUTTER','CHEESE','BACON']],
    ['ROASTED_CORN','Roasted Corn','🌽',0xe0c840,['VEGETABLES','BUTTER','SEASONING']],
    ['SAUSAGE_STICK','Sausage on a Stick','🌭',0xa85c3b,['SAUSAGE']],
  ],
  griddle: [
    ['CAMP_PANCAKES','Camp Pancakes','🥞',0xd9a441,['BAKING_MIX','WATER_JUG','BUTTER','SUGAR_SYRUP']],
    ['SMASH_BURGERS','Smash Burgers','🍔',0x9a3a3a,['GROUND_MEAT','BREAD','CHEESE','SEASONING']],
    ['FRENCH_TOAST','French Toast','🍞',0xc68a4e,['BREAD','EGGS','MILK','SUGAR_SYRUP']],
    ['BACON_EGGS','Bacon and Eggs','🥓',0xa8453a,['BACON','EGGS']],
    ['PHILLY_CHEESESTEAKS','Philly Cheesesteaks','🥖',0xc68a4e,['BEEF','BREAD','CHEESE','VEGETABLES']],
  ],
};
const COOKWARE_INFO = {
  pot:      { block: POT,        name:'Pot',        emoji:'🍲' },
  pan:      { block: PAN,        name:'Pan',        emoji:'🍳' },
  dutch:    { block: DUTCH_OVEN, name:'Dutch Oven', emoji:'🫕' },
  campfire: { block: CAMPFIRE,   name:'Campfire',   emoji:'🔥' },
  griddle:  { block: GRIDDLE,    name:'Griddle',    emoji:'🧇' },
};
// A clicked block id straight back to its recipe category — the reverse of COOKWARE_INFO[key].block.
const BLOCK_TO_WARE_KEY = {};
for(const key in COOKWARE_INFO) BLOCK_TO_WARE_KEY[COOKWARE_INFO[key].block] = key;
// COOK_ID.PASTA etc. — assigned sequentially right after the last hand-numbered id (US_FLAG_BR),
// ingredients first, then dishes, and every one of them gets threaded into the exact same lookup
// tables (BLOCK_COLOR/BLOCK_NAME/HOTBAR_ICON/ALL_ITEMS/CARRY_ONLY_ITEMS) the ~13 essentials go
// through by hand above.
const COOK_ID = {};
const ALL_DISH_IDS = []; // every dish id, across every cookware — FOOD_RESTORE (declared later) loops over this
let _nextCookItemId = US_FLAG_BR + 1;
for(const [key, name, emoji, color] of INGREDIENT_DEFS){
  const id = _nextCookItemId++;
  COOK_ID[key] = id;
  BLOCK_COLOR[id] = color;
  BLOCK_NAME[id] = name;
  HOTBAR_ICON[id] = emoji;
  ALL_ITEMS.push(id);
  CARRY_ONLY_ITEMS.add(id); // raw ingredients: no block form, not eaten raw — only useful in a recipe
}
const COOKWARE_RECIPES = {}; // wareKey -> [{id, name, ingredients:[id,...]}, ...]
for(const wareKey in COOKWARE_DISH_DEFS){
  COOKWARE_RECIPES[wareKey] = COOKWARE_DISH_DEFS[wareKey].map(([key, name, emoji, color, ingredientKeys]) => {
    const id = _nextCookItemId++;
    COOK_ID[key] = id;
    BLOCK_COLOR[id] = color;
    BLOCK_NAME[id] = name;
    HOTBAR_ICON[id] = emoji;
    ALL_ITEMS.push(id);
    ALL_DISH_IDS.push(id);
    return { id, name, ingredients: ingredientKeys.map(k => COOK_ID[k]) };
  });
}

// Blocks with an open/closed state: right-clicking one toggles it to the other id in this map.
const TOGGLE_MAP = { [WINDOW]:WINDOW_OPEN, [WINDOW_OPEN]:WINDOW, [DOOR]:DOOR_OPEN, [DOOR_OPEN]:DOOR };
// Breaking the open form of a toggleable block gives you back its closed (placeable) form.
const COLLECT_AS = { [WINDOW_OPEN]:WINDOW, [DOOR_OPEN]:DOOR };
// TENT and FLAG aren't here — they're multi-block structures now, not one cube, so breaking either
// back into a single carriable item needs the flood-fills in findTentCells/findFlagCells rather than
// this simple 1-for-1 map.
const COLLECTIBLE = new Set([GRASS, DIRT, STONE, SAND, WOOD, LEAVES, PLANKS, CRAFTING_TABLE, BRICKS, WINDOW, WINDOW_OPEN, DOOR, DOOR_OPEN, TORCH, LADDER,
  CAMPFIRE, LANTERN, BACKPACK]);

