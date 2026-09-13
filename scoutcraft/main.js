// ScoutCraft — a tiny Minecraft-inspired voxel sandbox built on three.js.
// Single finite world, chunked meshes for fast edits, no build step required.
(() => {
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
// A pair of carved camp totems (see buildTotem) — a 4-tall one playing the Scout Oath, a 3-tall one
// playing the Outdoor Code, each built from these 4 symbol segments cycled top to bottom so no two
// adjacent rings repeat. World fixtures like DUTCH_OVEN/BEAR_BOX/SCOUT_LAW_BOX above: never craftable
// or held, just placed once at world-gen. Numbered from 115 (well past the ~57 cooking-item ids that
// get assigned programmatically starting at US_FLAG_BR+1 — see COOK_ID below) so the two ranges can
// never collide regardless of how many ingredients/dishes that table grows to.
const TOTEM_COMPASS=115, TOTEM_STAR=116, TOTEM_FLAME=117, TOTEM_TENT=118;
const TOTEM_BLOCKS = [TOTEM_COMPASS, TOTEM_STAR, TOTEM_FLAME, TOTEM_TENT];
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
  [TOTEM_COMPASS]: 0x6b4226, [TOTEM_STAR]: 0x6b4226, [TOTEM_FLAME]: 0x6b4226, [TOTEM_TENT]: 0x6b4226,
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
  [TOTEM_COMPASS]:'Scout Totem', [TOTEM_STAR]:'Scout Totem', [TOTEM_FLAME]:'Scout Totem', [TOTEM_TENT]:'Scout Totem',
};
// Every item the player can ever select. The hotbar only shows HOTBAR_SIZE of these at a time —
// the rest are reachable through the Items panel (the palette button, or the "I" key), which lets
// the player swap any hotbar slot for anything in this list.
// MEAT is deliberately left out — disabled from the inventory/hotbar entirely, so it can't be
// selected even though animals still yield it when killed (see killAnimal-style meat drops).
const ALL_ITEMS = [GRASS, DIRT, STONE, SAND, WOOD, LEAVES, PLANKS, WATER, CRAFTING_TABLE, BRICKS, STICK, WINDOW, DOOR, FLINT, TORCH, FIREWORK, LADDER,
  ROPE, TENT, CAMPFIRE, LANTERN, FLAG, COMPASS, COOKED_MEAT, BACKPACK,
  POCKETKNIFE, FIRST_AID_KIT, EXTRA_CLOTHING, RAIN_GEAR, WATER_BOTTLE, FLASHLIGHT, TRAIL_FOOD, SUN_PROTECTION, SCOUTBOOK,
  FISHING_POLE, FISH, SLEEPING_BAG, SLEEPING_PAD];
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
  [FISHING_POLE]: '🎣', [FISH]: '🐟', [SLEEPING_BAG]: '🛌', [SLEEPING_PAD]: '🛏️' };

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

// ---------- Health / combat ----------
const HP_PER_HEART = 2;
const PLAYER_MAX_HP = 10 * HP_PER_HEART; // 10 hearts
const PLAYER_ATTACK_DMG = 2;
const ATTACK_RANGE = 4;
const ATTACK_ANGLE_COS = Math.cos(30 * Math.PI/180);
const AGGRO_RADIUS = 6;
const DEAGGRO_RADIUS = 11;
// How much further (in real 3D distance) a hostile animal can still lunge and land a hit once it's
// physically blocked from walking any closer — see updateAnimal. Keeps a short elevated ledge or a
// couple steps into deeper water from being free, permanent safety, while a large height gap (well up
// a cliff, far out over open water) still keeps a player genuinely out of reach.
const ANIMAL_LUNGE_RANGE = 2.5;
const RETALIATE_MS = 8000;
const FALL_DAMAGE_FREE_BLOCKS = 3; // first 3 blocks of any fall are damage-free, like stepping down normally

// ---------- Hunger ----------
// Mirrors the hearts exactly (10 icons, 2 points each) so it reads as a second, parallel stat rather
// than a differently-scaled bar. Ticks down purely on a real-time clock (no exhaustion-from-activity
// like real Minecraft — simplest version that still makes food a real, recurring need): a full bar
// lasts HUNGER_DECAY_INTERVAL_S * (PLAYER_MAX_HUNGER-1) real seconds, about 19 minutes at the numbers
// below. Passive HP regen (see updatePlayer) stops once hunger hits 0, and staying at 0 starts a slow
// starvation damage tick — same tick/tick-timer shape as the temperature-danger system.
const PLAYER_MAX_HUNGER = 20;
const HUNGER_PER_ICON = 2;
const HUNGER_DECAY_INTERVAL_S = 60; // lose 1 hunger point every real minute
const STARVE_DAMAGE_TICK_S = 4;
const STARVE_DAMAGE = 1;
const MEAT_HUNGER_RESTORE = 4; // 2 icons per piece eaten

// HP is scaled against the 20-HP (10-heart) human baseline to roughly track real-world size/toughness:
// rabbits, squirrels and deer are small and fragile prey; a black bear is a serious tank;
// a moose is the toughest animal in the woods, nearly bear-sized HP with a kick to match.
const ANIMAL_TYPES = ['rabbit','squirrel','deer','bear','moose'];
const ANIMAL_STATS = {
  rabbit:   { maxHp: 1*HP_PER_HEART,  dmg:0, retaliate:false, aggressive:false, speed:1.6, chaseSpeed:1.6, reach:0 },
  squirrel: { maxHp: 1*HP_PER_HEART,  dmg:0, retaliate:false, aggressive:false, speed:1.9, chaseSpeed:1.9, reach:0 },
  deer:   { maxHp: 4*HP_PER_HEART,  dmg:0, retaliate:false, aggressive:false, speed:1.3, chaseSpeed:2.2, reach:0 },
  // chaseSpeed is above WALK_SPEED (5.2) so a charging bear actually catches a player who's just
  // walking away — it was 3.2 (slower than even a walk) before, so it could roar and chase forever
  // without ever closing the gap unless the player stood still. Still below SPRINT_SPEED (8.4), so
  // sprinting away is a real (if risky) way to escape once one's after you.
  bear:   { maxHp: 16*HP_PER_HEART, dmg:5, retaliate:true,  aggressive:true,  speed:0.9, chaseSpeed:6.0, reach:0.6 },
  moose:  { maxHp: 18*HP_PER_HEART, dmg:5, retaliate:true,  aggressive:false, speed:1.0, chaseSpeed:2.8, reach:1.0 },
};

// ---------- Real-world scale ----------
// Each animal's model was originally built at an arbitrary "looks right together" size. These are
// the real shoulder/hip heights in meters — world units are ~1 unit = 1 meter throughout (the
// player is 1.8 units tall). ANIMAL_SCALE is derived once below by comparing this target height
// to each model's original bodyY.
const ANIMAL_REAL_HEIGHT = {
  rabbit: 0.3, squirrel: 0.22, deer: 1.0, bear: 1.0, moose: 2.1,
};
// How much Meat killing each animal drops, non-decreasing with its real size above (squirrel is the
// smallest, moose the biggest) — not a strict formula, just hand-picked round numbers in the same
// order. Birds/fish scale by size too: large flying/aquatic species (eagle, swan, tuna) drop 2.
const MEAT_YIELD = { rabbit:1, squirrel:1, deer:2, bear:3, moose:5,
  robin:1, sparrow:1, blue_jay:1, cardinal:1, crow:2, bluebird:1, finch:1, swallow:1, dove:1, woodpecker:1, owl:2, hawk:2, eagle:2, parrot:1, toucan:1, flamingo:2, hummingbird:1, kingfisher:1, heron:2, pelican:2, seagull:1, magpie:1, raven:2, wren:1, chickadee:1, oriole:1, warbler:1, swan:2, duck:1, goose:2,
  goldfish:1, bass:1, salmon:1, tuna:2, clownfish:1, catfish:1, shark:3, whaleshark:5,
  worm:1, gopher:2, bigeagle:3,
  greenturtle:1, hawksbill:1, loggerhead:2,
};
// Rough horizontal collision radius per species, used for entity-vs-entity collision below.
const ANIMAL_RADIUS = {
  rabbit: 0.18, squirrel: 0.13, deer: 0.4, bear: 0.55, moose: 0.75,
};
// Reproduction mechanics: animals reproduce when two of the same species meet.
// Cooldown is set in real-time ms further below (ANIMAL_REPRODUCE_INTERVAL_MS), once
// DAY_LENGTH_S is defined, since it's expressed as 30 in-game days.
const ANIMAL_REPRODUCE_RANGE = 2.0; // how close animals need to be to reproduce

// ---------- Merit badges ----------
// The scouting layer on top of the sandbox: instead of only building for its own sake, you earn
// badges for doing real scout things, and enough badges promote you through the ranks. Each badge
// is a pure test() over scoutStats, so earning one never depends on *when* the check runs — the
// whole set is re-tested after anything that moves a stat, and again once a second from animate().
const BADGES = [
  { id:'woodcraft',  emoji:'🪵', name:'Woodcraft',    hint:'Gather 25 wood from trees.',                   test:()=> scoutStats.wood >= 25 },
  { id:'pioneering', emoji:'🪢', name:'Pioneering',   hint:'Twist 6 lengths of rope.',                     test:()=> scoutStats.rope >= 6 },
  { id:'firecraft',  emoji:'🔥', name:'Firecraft',    hint:'Light your first campfire.',                   test:()=> scoutStats.campfires >= 1 },
  { id:'camping',    emoji:'⛺',          name:'Camping',      hint:'Pitch a tent.',                                test:()=> scoutStats.tents >= 1 },
  { id:'cooking',    emoji:'🍳', name:'Cooking',      hint:'Cook one dish on every kind of cookware.',     test:()=> scoutStats.cookwareUsed.length >= 5 },
  { id:'navigation', emoji:'🧭', name:'Navigation',   hint:'Take a bearing with your compass.',            test:()=> scoutStats.compassUses >= 1 },
  { id:'hiking',     emoji:'🥾', name:'Hiking',       hint:'Hike 1,000 blocks on foot.',                   test:()=> scoutStats.hiked >= 1000 },
  { id:'swimming',   emoji:'🏊', name:'Swimming',     hint:'Swim 60 blocks.',                              test:()=> scoutStats.swam >= 60 },
  { id:'climbing',   emoji:'🧗', name:'Climbing',     hint:'Get 18 blocks above sea level.',               test:()=> scoutStats.highest >= 18 },
  { id:'nature',     emoji:'🦌', name:'Nature Study', hint:'Study all 5 animals up close — the bear and moose included.', test:()=> scoutStats.species.length >= ANIMAL_TYPES.length },
  { id:'nightwatch', emoji:'🦉', name:'Night Watch',  hint:'Spend 5 minutes outdoors after dark.',         test:()=> scoutStats.nightSeconds >= 300 },
  { id:'firstaid',   emoji:'⛑️',          name:'First Aid',    hint:'Use your First Aid Kit.',                     test:()=> scoutStats.firstAidUses >= 1 },
  { id:'troopflag',  emoji:'🚩', name:'Troop Flag',   hint:'Raise your troop flag at camp.',               test:()=> scoutStats.flags >= 1 },
  { id:'astronomy',  emoji:'⭐', name:'Astronomy',    hint:'Find the Big Dipper and stare at it for 10 seconds.', test:()=> scoutStats.dipperFound },
  { id:'fishing',    emoji:'🎣', name:'Fishing',      hint:'Catch 5 fish.',                                test:()=> scoutStats.fishCaught >= 5 },
  { id:'kayaking',   emoji:'🛶', name:'Kayaking',     hint:'Paddle the lake for 30 seconds.',              test:()=> scoutStats.kayakSeconds >= 30 },
  { id:'horseback',  emoji:'🐴', name:'Horseback Riding', hint:'Ride 200 blocks on horseback.',            test:()=> scoutStats.horsebackBlocks >= HORSEBACK_BADGE_BLOCKS },
  { id:'scoutspirit',emoji:'🏅', name:'Scout Spirit', hint:'Find all 12 golden Scout Law boxes hidden around camp.', test:()=> scoutStats.lawsCollected.length >= SCOUT_LAW_POINTS.length },
];
// Ranks are purely derived from how many badges you hold — no separate progression to track. A brand
// new Scout hasn't earned anything yet, so rank starts at "None" rather than jumping straight to
// "Scout" — every other threshold below is just the old numbers shifted up by one to make room for it.
// Eagle Scout doesn't need every badge — real Scouting lets you count some from outside the required
// list, so this is modeled as "more than 3/4 of them" instead of literally all of them, tied to
// BADGES.length (rounded up) rather than a number that would need updating by hand every time a
// badge is added.
const EAGLE_BADGE_FRACTION = 0.75;
const RANKS = [
  { min:0,  name:'None' },
  { min:1,  name:'Scout' },
  { min:2,  name:'Tenderfoot' },
  { min:3,  name:'Second Class' },
  { min:6,  name:'First Class' },
  { min:9,  name:'Star Scout' },
  { min:12, name:'Life Scout' },
  { min: Math.ceil(BADGES.length * EAGLE_BADGE_FRACTION), name:'Eagle Scout' },
];
function rankIndexFor(count){
  let idx = 0;
  for(let i=0;i<RANKS.length;i++) if(count >= RANKS[i].min) idx = i;
  return idx;
}
function rankFor(count){
  return RANKS[rankIndexFor(count)].name;
}

const BADGE_KEY = 'scoutcraft_badges_v1';
const STATS_KEY = 'scoutcraft_stats_v1';
const earnedBadges = new Set();
// species is an array rather than a Set purely so it survives JSON.stringify into localStorage.
const scoutStats = {
  wood:0, rope:0, campfires:0, tents:0, flags:0, compassUses:0,
  hiked:0, swam:0, highest:0, nightSeconds:0, species:[],
  campX:null, campZ:null, dipperFound:false, fishCaught:0, firstAidUses:0, kayakSeconds:0, horsebackBlocks:0, lawsCollected:[], cookwareUsed:[],
};
function saveScoutProgress(){
  try{
    localStorage.setItem(BADGE_KEY, JSON.stringify([...earnedBadges]));
    localStorage.setItem(STATS_KEY, JSON.stringify(scoutStats));
  }catch(e){}
}
function loadScoutProgress(){
  try{
    const b = JSON.parse(localStorage.getItem(BADGE_KEY) || '[]');
    if(Array.isArray(b)) b.forEach(id=> earnedBadges.add(id));
    const st = JSON.parse(localStorage.getItem(STATS_KEY) || '{}');
    if(st && typeof st === 'object'){
      for(const k in scoutStats) if(k in st) scoutStats[k] = st[k];
      if(!Array.isArray(scoutStats.species)) scoutStats.species = [];
      if(!Array.isArray(scoutStats.lawsCollected)) scoutStats.lawsCollected = [];
      if(!Array.isArray(scoutStats.cookwareUsed)) scoutStats.cookwareUsed = [];
    }
  }catch(e){}
}
loadScoutProgress();

// A badge announcement, queued so earning two at once doesn't overwrite the first one's toast.
const badgeToastQueue = [];
let badgeToastTimer = 0;
function showBadgeToast(badge, newRank){
  badgeToastQueue.push({ badge, newRank });
}
function pumpBadgeToast(dt){
  const el = document.getElementById('badgeToast');
  if(!el) return;
  if(badgeToastTimer > 0){
    badgeToastTimer -= dt;
    if(badgeToastTimer <= 0) el.hidden = true;
    return;
  }
  const next = badgeToastQueue.shift();
  if(!next) return;
  el.innerHTML = `<span class="bt-emoji">${next.badge.emoji}</span>` +
    `<span class="bt-text"><b>Merit badge earned — ${next.badge.name}</b>` +
    (next.newRank ? `<span class="bt-rank">You are now a ${next.newRank}!</span>` : `<span class="bt-rank">${next.badge.hint}</span>`) +
    `</span>`;
  el.hidden = false;
  badgeToastTimer = 4.5;
}

function checkBadges(){
  const before = earnedBadges.size;
  let awarded = null;
  for(const b of BADGES){
    if(earnedBadges.has(b.id)) continue;
    let pass = false;
    try{ pass = !!b.test(); }catch(e){ pass = false; }
    if(pass){
      earnedBadges.add(b.id);
      awarded = b;
      const rankBefore = rankFor(earnedBadges.size - 1);
      const rankAfter = rankFor(earnedBadges.size);
      showBadgeToast(b, rankAfter !== rankBefore ? rankAfter : null);
    }
  }
  if(earnedBadges.size !== before){
    if(typeof SFX !== 'undefined' && SFX.badge) SFX.badge();
    saveScoutProgress();
    updateScoutHUD();
    if(sashOpen) renderSash();
  }
  return awarded;
}

// One place for "a stat changed" so every call site is a one-liner.
const Scout = {
  bump(key, by){
    if(typeof scoutStats[key] !== 'number') return;
    scoutStats[key] += (by==null ? 1 : by);
    checkBadges();
  },
  // Called from invAdd, so it catches wood chopped out of a tree and rope twisted at the table alike.
  gained(id, n){
    if(id===WOOD) scoutStats.wood += n;
    else if(id===ROPE) scoutStats.rope += n;
    else return;
    checkBadges();
  },
  // Called after a block is actually placed in the world.
  placed(id, x, z){
    if(id===CAMPFIRE){
      scoutStats.campfires++;
      // Your first campfire *is* your camp — the compass homes on it from then on.
      if(scoutStats.campX==null){ scoutStats.campX = x; scoutStats.campZ = z; }
    }
    else if(id===TENT) scoutStats.tents++;
    else if(id===FLAG) scoutStats.flags++;
    else return;
    saveScoutProgress();
    checkBadges();
  },
  sawSpecies(name){
    if(!name || scoutStats.species.includes(name)) return;
    scoutStats.species.push(name);
    checkBadges();
  },
  cookedOn(wareKey){
    if(scoutStats.cookwareUsed.includes(wareKey)) return;
    scoutStats.cookwareUsed.push(wareKey);
    saveScoutProgress();
    checkBadges();
  },
  foundDipper(){
    if(scoutStats.dipperFound) return;
    scoutStats.dipperFound = true;
    saveScoutProgress();
    checkBadges();
  },
};

// ---- Continuous tracking (distance, altitude, night time, wildlife) ----
let scoutLastX = null, scoutLastZ = null;
let scoutSpeciesScanTimer = 0;
let scoutSaveTimer = 0;
let dipperGazeTimer = 0, dipperGraceTimer = 0;
// Night, for badge purposes, is the part of the cycle with no sun at all (see DAY_KEYFRAMES:
// sunI is 0 from 0.80 through sunrise at 0.25).
function isScoutNight(){
  const t = currentDayTime();
  return t < 0.24 || t > 0.79;
}
// How close you have to get to an animal for it to count as studied.
const SPOT_RANGE = 9;
function updateScout(dt){
  pumpBadgeToast(dt);
  // Nothing counts while you're sitting on the start screen or a panel — badges are for playing.
  if(!locked || isDead){ scoutLastX = null; scoutLastZ = null; dipperGazeTimer = 0; dipperGraceTimer = 0; return; }

  // Distance travelled, split between hiking and swimming.
  if(scoutLastX != null){
    const d = Math.hypot(player.pos.x - scoutLastX, player.pos.z - scoutLastZ);
    // Ignore teleport-sized jumps (a respawn, or a position restored from a save).
    if(d < 2){
      if(player.inWater) scoutStats.swam += d;
      else scoutStats.hiked += d;
    }
  }
  scoutLastX = player.pos.x; scoutLastZ = player.pos.z;

  const above = player.pos.y - SEA_LEVEL;
  if(above > scoutStats.highest) scoutStats.highest = above;

  if(isScoutNight()) scoutStats.nightSeconds += dt;
  if(player.inKayak) scoutStats.kayakSeconds += dt;

  // Astronomy: keep the Big Dipper roughly in view, at night, for 10 seconds of attention. A brief
  // glance away (mouse drift, checking your footing) doesn't wipe the streak — only DIPPER_GAZE_GRACE_S
  // of genuinely looking elsewhere does, so this rewards "mostly watching it" rather than a pixel-
  // perfect, unblinking hold.
  if(isScoutNight() && getLookDir(player.yaw, player.pitch).dot(BIG_DIPPER_DIR) > DIPPER_GAZE_COS){
    dipperGazeTimer += dt;
    dipperGraceTimer = DIPPER_GAZE_GRACE_S;
    if(dipperGazeTimer >= DIPPER_GAZE_SECONDS) Scout.foundDipper();
  } else {
    dipperGraceTimer -= dt;
    if(dipperGraceTimer <= 0) dipperGazeTimer = 0;
  }

  // Nature study: what's within sight right now. Twice a second is plenty and keeps this off the
  // per-frame budget.
  scoutSpeciesScanTimer -= dt;
  if(scoutSpeciesScanTimer <= 0){
    scoutSpeciesScanTimer = 0.5;
    const px = player.pos.x, py = player.pos.y, pz = player.pos.z;
    if(typeof animals !== 'undefined'){
      for(const a of animals){
        if(Math.hypot(a.x-px, a.y-py, a.z-pz) <= SPOT_RANGE) Scout.sawSpecies(a.type);
      }
    }
    checkBadges();
  }

  // Distance/altitude/night badges are checked on the same cheap cadence rather than every frame.
  scoutSaveTimer -= dt;
  if(scoutSaveTimer <= 0){
    scoutSaveTimer = 1;
    checkBadges();
    updateScoutHUD();
    saveScoutProgress();
  }
}

function updateScoutHUD(){
  const c = document.getElementById('badgeCount');
  if(c) c.textContent = `${earnedBadges.size}/${BADGES.length}`;
  const r = document.getElementById('rankLabel');
  if(r) r.textContent = rankFor(earnedBadges.size);
  updateCharacterRankBadge();
}
// Re-draws the shirt's left-pocket rank badge only when the rank itself actually changed — called
// every time updateScoutHUD is (i.e. whenever the earned badge count changes), same trigger the sash
// and name tag refresh on.
function updateCharacterRankBadge(){
  const u = characterMesh && characterMesh.userData.uniform;
  if(!u) return;
  const idx = rankIndexFor(earnedBadges.size);
  if(u.lastRankIndex === idx) return;
  u.lastRankIndex = idx;
  u.shirtFrontMat.map = buildShirtFrontTexture(idx);
  u.shirtFrontMat.needsUpdate = true;
}

// ---- The compass: how far, and in which direction, camp is ----
const COMPASS_POINTS = ['N','NNE','NE','ENE','E','ESE','SE','SSE','S','SSW','SW','WSW','W','WNW','NW','NNW'];
function bearingName(dx, dz){
  // -z is north in this world (the minimap and the sun both assume it), so a bearing measured
  // clockwise from north is atan2(dx, -dz).
  let deg = Math.atan2(dx, -dz) * 180/Math.PI;
  if(deg < 0) deg += 360;
  return COMPASS_POINTS[Math.round(deg/22.5) % 16];
}
function useCompass(){
  const hasCamp = scoutStats.campX != null;
  const tx = hasCamp ? scoutStats.campX + 0.5 : WORLD_SIZE/2;
  const tz = hasCamp ? scoutStats.campZ + 0.5 : WORLD_SIZE/2;
  const dx = tx - player.pos.x, dz = tz - player.pos.z;
  const dist = Math.hypot(dx, dz);
  const where = hasCamp ? 'Camp' : 'World centre';
  const msg = dist < 4
    ? `🧭 ${where}: you're here.`
    : `🧭 ${where}: ${Math.round(dist)} blocks ${bearingName(dx,dz)}.`;
  addChatMessage('Camp', msg);
  Scout.bump('compassUses');
  saveScoutProgress();
}

// ---- Fishing: cast into water that has a fish nearby, then hold still for FISHING_HOLD_SECONDS ----
const FISHING_HOLD_SECONDS = 20;
const FISHING_FISH_RADIUS = 6;   // how close a live fish needs to be to the cast spot to bite at all
const FISHING_MAX_DRIFT = 1.5;   // wander further than this from where you cast and you lose the line
let fishingSpot = null; // {startX, startZ} of the player when the line went in, or null when not fishing
let fishingTimer = 0;
// A dedicated raycast rather than the shared raycastBlock(), which deliberately treats WATER as
// see-through (same as AIR) for break/place purposes — so it always reports whatever's under or past
// the water, never the water itself. This one stops at the first WATER voxel instead, and gives up if
// it hits solid ground first without ever passing through any.
function raycastWater(maxDist=8, step=0.05){
  const dir = getLookDir(player.yaw, player.pitch);
  const origin = camera.position;
  for(let t=0; t<maxDist; t+=step){
    const bx = Math.floor(origin.x+dir.x*t), by = Math.floor(origin.y+dir.y*t), bz = Math.floor(origin.z+dir.z*t);
    const b = getBlock(bx,by,bz);
    if(b===WATER) return {x:bx, y:by, z:bz};
    if(b!==AIR) return null;
  }
  return null;
}
function nearbyFish(x,y,z,radius){
  const r2 = radius*radius;
  for(const f of fish){
    if(!f.hasHome || !f.mesh.visible) continue;
    const dx=f.mesh.position.x-x, dy=f.mesh.position.y-y, dz=f.mesh.position.z-z;
    if(dx*dx+dy*dy+dz*dz <= r2) return true;
  }
  return false;
}
function tryFish(){
  if(fishingSpot){
    addChatMessage('Camp', '🎣 You reel your line back in.');
    fishingSpot = null; fishingTimer = 0;
    return;
  }
  const spot = raycastWater();
  if(!spot){
    addChatMessage('Camp', '🎣 Aim at some water to cast your line.');
    return;
  }
  if(!nearbyFish(spot.x+0.5, spot.y+0.5, spot.z+0.5, FISHING_FISH_RADIUS)){
    addChatMessage('Camp', "🎣 No fish are biting here — try a different spot.");
    return;
  }
  fishingSpot = { startX: player.pos.x, startZ: player.pos.z };
  fishingTimer = 0;
  SFX.placeBlock();
  addChatMessage('Camp', '🎣 You cast your line. Hold steady...');
}
function updateFishing(dt){
  if(!fishingSpot) return;
  // These two used to reset the line with no message at all — indistinguishable from a catch simply
  // never landing. Opening any panel (the Badges screen included, the obvious thing to check while
  // waiting out the 20-second hold) or swapping off the Fishing Pole both silently broke the line.
  if(!locked || isDead){
    if(!isDead) addChatMessage('Camp', '🎣 You lost your line.');
    fishingSpot = null; fishingTimer = 0;
    return;
  }
  if(HOTBAR[selectedSlot] !== FISHING_POLE){
    addChatMessage('Camp', '🎣 You lost your line.');
    fishingSpot = null; fishingTimer = 0;
    return;
  }
  if(keys['KeyW']||keys['KeyA']||keys['KeyS']||keys['KeyD']){
    addChatMessage('Camp', '🎣 You moved and lost your line.');
    fishingSpot = null; fishingTimer = 0;
    return;
  }
  const moved = Math.hypot(player.pos.x-fishingSpot.startX, player.pos.z-fishingSpot.startZ);
  if(moved > FISHING_MAX_DRIFT){
    addChatMessage('Camp', '🎣 You wandered off and lost your line.');
    fishingSpot = null; fishingTimer = 0;
    return;
  }
  fishingTimer += dt;
  if(fishingTimer >= FISHING_HOLD_SECONDS){
    invAdd(FISH, 1);
    saveInventory();
    updateHotbarUI();
    Scout.bump('fishCaught');
    saveScoutProgress();
    SFX.craft();
    addChatMessage('Camp', '🐟 You caught a fish!');
    fishingSpot = null; fishingTimer = 0;
  }
}

// ---- The sash: every badge, earned and still to earn ----
let sashOpen = false;
function openSash(){
  sashOpen = true;
  const modal = document.getElementById('sashModal');
  if(modal) modal.hidden = false;
  if(document.pointerLockElement) document.exitPointerLock();
  if(isTouchDevice) locked = false;
  overlay.hidden = true;
  renderSash();
}
function closeSash(relock){
  sashOpen = false;
  const modal = document.getElementById('sashModal');
  if(modal) modal.hidden = true;
  if(relock){
    if(isTouchDevice) locked = true;
    else document.body.requestPointerLock();
  } else if(!isTouchDevice) overlay.hidden = false;
}
// How far along an unearned badge is, as a "3 / 25" style line — much more motivating than a
// flat "not yet".
function badgeProgress(b){
  const p = {
    woodcraft:  ()=> [Math.floor(scoutStats.wood), 25, 'wood'],
    pioneering: ()=> [Math.floor(scoutStats.rope), 6, 'rope'],
    firecraft:  ()=> [scoutStats.campfires, 1, 'campfires'],
    camping:    ()=> [scoutStats.tents, 1, 'tents'],
    cooking:    ()=> [scoutStats.cookwareUsed.length, 5, 'cookware'],
    navigation: ()=> [scoutStats.compassUses, 1, 'bearings'],
    hiking:     ()=> [Math.floor(scoutStats.hiked), 1000, 'blocks'],
    swimming:   ()=> [Math.floor(scoutStats.swam), 60, 'blocks'],
    climbing:   ()=> [Math.max(0,Math.floor(scoutStats.highest)), 18, 'blocks up'],
    nature:     ()=> [scoutStats.species.length, ANIMAL_TYPES.length, 'animals'],
    nightwatch: ()=> [Math.floor(scoutStats.nightSeconds), 300, 'seconds'],
    firstaid:   ()=> [scoutStats.firstAidUses, 1, 'uses'],
    troopflag:  ()=> [scoutStats.flags, 1, 'flags'],
    astronomy:  ()=> [scoutStats.dipperFound?1:0, 1, 'found'],
    fishing:    ()=> [scoutStats.fishCaught, 5, 'fish'],
    kayaking:   ()=> [Math.floor(scoutStats.kayakSeconds), 30, 'seconds'],
    horseback:  ()=> [Math.floor(scoutStats.horsebackBlocks), HORSEBACK_BADGE_BLOCKS, 'blocks'],
    scoutspirit:()=> [scoutStats.lawsCollected.length, SCOUT_LAW_POINTS.length, 'boxes'],
  }[b.id];
  if(!p) return null;
  const [have, need, unit] = p();
  return { have: Math.min(have, need), need, unit };
}
function renderSash(){
  const grid = document.getElementById('sashGrid');
  if(!grid) return;
  const rankEl = document.getElementById('sashRank');
  if(rankEl){
    const next = RANKS.find(r => r.min > earnedBadges.size);
    // Eagle only needs EAGLE_BADGE_FRACTION of the badges now, not literally all of them, so reaching
    // it (the last rank with no "next") doesn't necessarily mean every badge is earned anymore —
    // check that separately rather than assuming the two are still the same thing.
    rankEl.textContent = next
      ? `${rankFor(earnedBadges.size)} — ${next.min - earnedBadges.size} more badge${next.min-earnedBadges.size===1?'':'s'} to ${next.name}`
      : (earnedBadges.size >= BADGES.length ? `${rankFor(earnedBadges.size)} — every badge earned!` : `${rankFor(earnedBadges.size)} — the highest rank!`);
  }
  const countEl = document.getElementById('sashCount');
  if(countEl) countEl.textContent = `${earnedBadges.size} of ${BADGES.length}`;
  grid.innerHTML = '';
  for(const b of BADGES){
    const got = earnedBadges.has(b.id);
    const tile = document.createElement('div');
    tile.className = 'badgeTile' + (got ? ' earned' : '');
    const prog = got ? null : badgeProgress(b);
    tile.innerHTML =
      `<div class="badgeEmoji">${b.emoji}</div>` +
      `<div class="badgeName">${b.name}</div>` +
      `<div class="badgeHint">${got ? 'Earned' : b.hint}</div>` +
      (prog ? `<div class="badgeBar"><span style="width:${Math.round(prog.have/prog.need*100)}%"></span></div>` +
              `<div class="badgeProg">${prog.have} / ${prog.need} ${prog.unit}</div>` : '');
    grid.appendChild(tile);
  }
}

// ---------- Crafting ----------
// Bricks, Window, Door, Flint, Ladder, Tent, Compass and Backpack are deliberately not craftable —
// Flint, Tent, Compass and Rope now come pre-packed in the Backpack instead (see SCOUT_ESSENTIALS/
// STARTER_CAMP_GEAR), Backpack storage itself is always open via the B key with no block required,
// and the rest (generic Minecraft-y building blocks with no scouting tie-in) are just gone. Lantern
// drops the Window it used to need as a result — Stick + Flint only now, same as a Torch.
const RECIPES = [
  { name:'Planks',         out:{id:PLANKS, qty:4},         in:[{id:WOOD, qty:1}] },
  { name:'Sticks',         out:{id:STICK, qty:4},          in:[{id:PLANKS, qty:2}] },
  { name:'Crafting Table', out:{id:CRAFTING_TABLE, qty:1}, in:[{id:PLANKS, qty:4}] },
  { name:'Torch',          out:{id:TORCH, qty:2},           in:[{id:STICK, qty:1}, {id:FLINT, qty:1}] },
  // Camp gear. Rope is the gateway item — you twist it out of leaves, and the troop flag and
  // fishing pole both need it.
  { name:'Rope',           out:{id:ROPE, qty:2},            in:[{id:LEAVES, qty:4}] },
  { name:'Campfire',       out:{id:CAMPFIRE, qty:1},        in:[{id:WOOD, qty:3}, {id:FLINT, qty:1}] },
  { name:'Lantern',        out:{id:LANTERN, qty:1},         in:[{id:STICK, qty:1}, {id:FLINT, qty:1}] },
  { name:'Troop Flag',     out:{id:FLAG, qty:1},            in:[{id:PLANKS, qty:2}, {id:STICK, qty:2}, {id:ROPE, qty:1}] },
  { name:'Fishing Pole',   out:{id:FISHING_POLE, qty:1},    in:[{id:STICK, qty:2}, {id:ROPE, qty:1}] },
];
const inventory = {};
// Fireworks are unlimited — no recipe, never consumed, always available regardless of what's saved.
function invCount(id){ return id===FIREWORK ? Infinity : (inventory[id]||0); }
function invAdd(id,n){ inventory[id] = (inventory[id]||0)+n; Scout.gained(id,n); }
function invSub(id,n){ inventory[id] = Math.max(0,(inventory[id]||0)-n); }
function canCraft(recipe){ return recipe.in.every(ing => invCount(ing.id) >= ing.qty); }
function craft(recipe){
  if(!canCraft(recipe)) return false;
  recipe.in.forEach(ing => invSub(ing.id, ing.qty));
  invAdd(recipe.out.id, recipe.out.qty);
  saveInventory();
  updateHotbarUI();
  SFX.craft();
  return true;
}

const craftingTables = new Set();
function tableKey(x,y,z){ return x+','+y+','+z; }
function nearestCraftingTable(maxDist){
  for(const k of craftingTables){
    const [x,y,z] = k.split(',').map(Number);
    const dx = (x+0.5)-player.pos.x, dy = (y+0.5)-(player.pos.y+player.eye), dz = (z+0.5)-player.pos.z;
    if(Math.hypot(dx,dy,dz) <= maxDist) return true;
  }
  return false;
}

// Every placed TENT cell, kept in sync by applyWorldEdit/loadEdits exactly like craftingTables above
// — lets nearestTent (used by the Sleep key) check "am I near my tent" without scanning the world.
const tentCells = new Set();
function nearestTent(maxDist){
  for(const k of tentCells){
    const [x,y,z] = k.split(',').map(Number);
    const dx = (x+0.5)-player.pos.x, dy = (y+0.5)-(player.pos.y+player.eye), dz = (z+0.5)-player.pos.z;
    if(Math.hypot(dx,dy,dz) <= maxDist) return true;
  }
  return false;
}

// Cells breakBlock refuses to touch, regardless of what block sits there — populated once by
// buildCookingArea for its pre-placed campfires/cookware/bear box. Position-based rather than
// type-based because CAMPFIRE itself must stay perfectly ordinary and breakable everywhere else the
// player places one; only these specific cells are permanent.
const PROTECTED_CELLS = new Set();

// ---------- Texture atlas (procedurally drawn pixel-art, no external image assets) ----------
// TILE=32 (was 16) gives 4x the pixel budget per block face — enough room for real structure
// (cracks, grain, brick-by-brick variation, ripples) rather than flat color + noise.
const TILE = 32, ATLAS_COLS = 4, ATLAS_ROWS = 12;
const T_GRASS_TOP=0, T_GRASS_SIDE=1, T_DIRT=2, T_STONE=3, T_SAND=4, T_LOG_SIDE=5, T_LOG_TOP=6,
      T_LEAVES=7, T_PLANKS=8, T_BEDROCK=9, T_CRAFT_TOP=10, T_CRAFT_SIDE=11, T_BRICKS=12, T_WATER=13,
      T_WINDOW=14, T_WINDOW_OPEN=15, T_DOOR=16, T_DOOR_OPEN=17, T_SAPLING=18, T_FLINT=19, T_FIRE=20,
      T_TORCH=21, T_LADDER=22, T_LEAVES_SPARSE=23, T_LEAVES_DENSE=24,
      T_TENT=25, T_CAMPFIRE=26, T_LANTERN=27, T_FLAG=28, T_BACKPACK=29,
      T_DUTCH_OVEN=30, T_POT=31, T_PAN=32, T_GRIDDLE=33, T_BEAR_BOX=34, T_FLAG_POLE=35,
      T_SCOUT_LAW_BOX=36,
      T_US_FLAG_TL=37, T_US_FLAG_TC=38, T_US_FLAG_TR=39, T_US_FLAG_BL=40, T_US_FLAG_BC=41, T_US_FLAG_BR=42,
      T_TOTEM_COMPASS=43, T_TOTEM_STAR=44, T_TOTEM_FLAME=45, T_TOTEM_TENT=46;

function hexRGB(hex){ return [(hex>>16)&255, (hex>>8)&255, hex&255]; }
function rgbStr(r,g,b){ return `rgb(${r|0},${g|0},${b|0})`; }
function shadeStr(hex, f, jitter){
  let [r,g,b] = hexRGB(hex);
  const j = jitter ? (Math.random()*2-1)*jitter : 0;
  r = Math.max(0,Math.min(255, r*f+j));
  g = Math.max(0,Math.min(255, g*f+j));
  b = Math.max(0,Math.min(255, b*f+j));
  return rgbStr(r,g,b);
}
function fillTile(ctx,x0,y0,baseHex){
  ctx.fillStyle = rgbStr(...hexRGB(baseHex));
  ctx.fillRect(x0,y0,TILE,TILE);
}
function speckle(ctx,x0,y0,baseHex,count,jitter){
  for(let i=0;i<count;i++){
    const px = x0 + Math.floor(Math.random()*TILE);
    const py = y0 + Math.floor(Math.random()*TILE);
    ctx.fillStyle = shadeStr(baseHex, 0.8+Math.random()*0.4, jitter||0);
    ctx.fillRect(px,py,1,1);
  }
}
// A soft, irregular clump of pixels around a point — used wherever flat speckle alone looked too
// uniform (grass tufts, dirt clumps, leaf clusters, rock chunks, flame licks).
function blob(ctx,cx,cy,r,baseHex,jitter){
  const n = Math.max(4, Math.round(r*r*0.9));
  for(let i=0;i<n;i++){
    const ang = Math.random()*Math.PI*2, rad = Math.random()*r;
    const px = Math.round(cx+Math.cos(ang)*rad), py = Math.round(cy+Math.sin(ang)*rad);
    ctx.fillStyle = shadeStr(baseHex, 0.75+Math.random()*0.5, jitter||0);
    ctx.fillRect(px,py,1,1);
  }
}
function drawGrassTop(ctx,x0,y0){
  fillTile(ctx,x0,y0,0x5b8a3a);
  for(let i=0;i<7;i++) blob(ctx, x0+Math.random()*TILE, y0+Math.random()*TILE, TILE*0.22, 0x5b8a3a, 20);
  speckle(ctx,x0,y0,0x5b8a3a,Math.round(TILE*TILE*0.3),18);
  for(let i=0;i<TILE*1.6;i++){
    const px=x0+Math.floor(Math.random()*TILE), py=y0+Math.floor(Math.random()*TILE);
    ctx.fillStyle = shadeStr(0x74b84a, 1, 10);
    ctx.fillRect(px,py,1,1+Math.floor(Math.random()*2));
  }
}
function drawGrassSide(ctx,x0,y0){
  fillTile(ctx,x0,y0,0x7a5230);
  speckle(ctx,x0,y0,0x7a5230,Math.round(TILE*TILE*0.2),14);
  for(let i=0;i<TILE*0.5;i++){
    const px=x0+Math.floor(Math.random()*TILE), py=y0+Math.floor(TILE*0.35)+Math.floor(Math.random()*Math.floor(TILE*0.6));
    ctx.fillStyle = shadeStr(0x4a2f18,1,6);
    ctx.fillRect(px,py,1,1);
  }
  const bandH = TILE*0.3;
  for(let x=0;x<TILE;x++){
    const h = bandH + Math.sin(x*0.9)*2 + Math.random()*3;
    for(let y=0;y<h;y++){
      ctx.fillStyle = shadeStr(0x5b8a3a, 0.8+Math.random()*0.35, 12);
      ctx.fillRect(x0+x, y0+TILE-1-y, 1, 1);
    }
  }
  ctx.fillStyle = shadeStr(0x3f2c18,1,4);
  ctx.fillRect(x0,y0+TILE-1-Math.floor(bandH),TILE,1);
}
function drawDirt(ctx,x0,y0){
  fillTile(ctx,x0,y0,0x7a5230);
  for(let i=0;i<5;i++) blob(ctx, x0+Math.random()*TILE, y0+Math.random()*TILE, TILE*0.16, 0x7a5230, 14);
  speckle(ctx,x0,y0,0x7a5230,Math.round(TILE*TILE*0.22),16);
  for(let i=0;i<TILE*0.5;i++){
    const px=x0+Math.floor(Math.random()*TILE), py=y0+Math.floor(Math.random()*TILE);
    ctx.fillStyle = shadeStr(0xc9b98f,1,6);
    ctx.fillRect(px,py,1,1);
  }
}
function drawStone(ctx,x0,y0){
  fillTile(ctx,x0,y0,0x8a8a8a);
  for(let i=0;i<5;i++) blob(ctx, x0+Math.random()*TILE, y0+Math.random()*TILE, TILE*0.2, 0x8a8a8a, 14);
  speckle(ctx,x0,y0,0x8a8a8a,Math.round(TILE*TILE*0.26),20);
  for(let c=0;c<3;c++){
    let px = x0+Math.random()*TILE, py = y0+Math.random()*TILE;
    const steps = 4+Math.floor(Math.random()*4);
    ctx.fillStyle = shadeStr(0x8a8a8a,0.55,6);
    for(let s=0;s<steps;s++){
      ctx.fillRect(Math.round(px),Math.round(py),1,1);
      px += (Math.random()*2-1)*2; py += (Math.random()*2-1)*2;
    }
  }
  for(let i=0;i<TILE*0.4;i++){
    const px=x0+Math.floor(Math.random()*TILE), py=y0+Math.floor(Math.random()*TILE);
    ctx.fillStyle = shadeStr(0xc4c4c4,1,8);
    ctx.fillRect(px,py,1,1);
  }
}
function drawSand(ctx,x0,y0){
  fillTile(ctx,x0,y0,0xe0d18f);
  speckle(ctx,x0,y0,0xe0d18f,Math.round(TILE*TILE*0.2),14);
  for(let i=0;i<4;i++){
    const y = y0+Math.floor(Math.random()*TILE);
    ctx.fillStyle = shadeStr(0xe0d18f, 1.08+Math.random()*0.1, 4);
    const len = TILE*0.4+Math.random()*TILE*0.5;
    ctx.fillRect(x0+Math.random()*(TILE-len),y,len,1);
  }
}
function drawLogSide(ctx,x0,y0){
  fillTile(ctx,x0,y0,0xa8825a);
  speckle(ctx,x0,y0,0xa8825a,Math.round(TILE*TILE*0.12),8);
  let x=0;
  while(x<TILE){
    const w = 2+Math.floor(Math.random()*3);
    const f = 0.65+Math.random()*0.3;
    for(let dx=0;dx<w && x+dx<TILE;dx++){
      for(let y=0;y<TILE;y++){
        if(Math.random()<0.85){
          ctx.fillStyle = shadeStr(0xa8825a,f+(Math.random()*0.1-0.05),6);
          ctx.fillRect(x0+x+dx,y0+y,1,1);
        }
      }
    }
    x += w;
  }
  if(Math.random()<0.7) blob(ctx, x0+TILE*0.3+Math.random()*TILE*0.4, y0+TILE*0.3+Math.random()*TILE*0.4, TILE*0.09, 0x3f2c18, 4);
}
function drawLogTop(ctx,x0,y0){
  fillTile(ctx,x0,y0,0xc9a06b);
  const cx=x0+TILE/2, cy=y0+TILE/2;
  const wobble = 0.4+Math.random()*0.3, wobbleSeed = Math.random()*10;
  for(let y=0;y<TILE;y++){
    for(let x=0;x<TILE;x++){
      const dx=x0+x+0.5-cx, dy=y0+y+0.5-cy;
      const d = Math.hypot(dx,dy) + Math.sin(Math.atan2(dy,dx)*5+wobbleSeed)*wobble;
      const ring = Math.floor(d/2.2)%2;
      ctx.fillStyle = shadeStr(0xc9a06b, ring===0 ? 1.0 : 0.8, 6);
      ctx.fillRect(x0+x,y0+y,1,1);
    }
  }
  ctx.fillStyle = shadeStr(0x6b4a2b,1,4);
  ctx.fillRect(x0,y0,TILE,2); ctx.fillRect(x0,y0+TILE-2,TILE,2);
  ctx.fillRect(x0,y0,2,TILE); ctx.fillRect(x0+TILE-2,y0,2,TILE);
}
// No base fill — the tile starts fully transparent, so the gaps between leaf clumps are genuine
// see-through holes (LEAVES is in TRANSPARENT_BLOCKS/the glass bucket) rather than a solid green
// cube with leaf-colored speckle painted on top of it. Shared by the three density tiers below
// (T_LEAVES/T_LEAVES_SPARSE/T_LEAVES_DENSE) — same clump technique, just more or fewer of them.
function drawLeavesDensity(ctx,x0,y0,clumps){
  for(let i=0;i<clumps;i++){
    const cx = x0+Math.random()*TILE, cy = y0+Math.random()*TILE;
    const r = TILE*(0.12+Math.random()*0.12);
    const n = Math.max(6, Math.round(r*r*1.1));
    for(let j=0;j<n;j++){
      const ang = Math.random()*Math.PI*2, rad = Math.random()*r;
      const px = Math.round(cx+Math.cos(ang)*rad), py = Math.round(cy+Math.sin(ang)*rad);
      if(px<x0||px>=x0+TILE||py<y0||py>=y0+TILE) continue;
      const dark = Math.random()<0.25;
      ctx.fillStyle = shadeStr(dark?0x24401f:0x3f7d34, 0.85+Math.random()*0.4, 20);
      ctx.fillRect(px,py,1,1);
    }
  }
}
function drawLeavesSparse(ctx,x0,y0){ drawLeavesDensity(ctx,x0,y0,34); } // ~58% coverage — willow, birch
function drawLeaves(ctx,x0,y0){ drawLeavesDensity(ctx,x0,y0,72); }       // ~80% (half the old gap) — oak, maple, apple
function drawLeavesDense(ctx,x0,y0){ drawLeavesDensity(ctx,x0,y0,90); }  // ~91% — pine, redwood
function drawPlanks(ctx,x0,y0){
  fillTile(ctx,x0,y0,0xb8894f);
  const boardH = TILE/4;
  for(let y=0;y<TILE;y+=boardH){
    const boardTone = 0.9+Math.random()*0.2;
    for(let dy=0;dy<boardH;dy++){
      for(let x=0;x<TILE;x++){
        ctx.fillStyle = shadeStr(0xb8894f, boardTone+(Math.random()*0.08-0.04), 6);
        ctx.fillRect(x0+x,y0+y+dy,1,1);
      }
    }
    for(let i=0;i<4;i++){
      const gy = y0+y+1+Math.floor(Math.random()*(boardH-2));
      ctx.fillStyle = shadeStr(0xb8894f,0.75,4);
      ctx.fillRect(x0+Math.floor(Math.random()*(TILE-6)),gy,4+Math.floor(Math.random()*4),1);
    }
    ctx.fillStyle = shadeStr(0xb8894f,0.6,4);
    ctx.fillRect(x0,y0+y,TILE,1);
    ctx.fillStyle = shadeStr(0xb8894f,0.7,4);
    ctx.fillRect(x0+Math.floor(Math.random()*TILE),y0+y,1,boardH);
  }
}
function drawBedrock(ctx,x0,y0){
  fillTile(ctx,x0,y0,0x2b2b2b);
  for(let i=0;i<6;i++) blob(ctx, x0+Math.random()*TILE, y0+Math.random()*TILE, TILE*0.22, 0x2b2b2b, 10);
  for(let i=0;i<TILE*TILE*0.16;i++){
    const x=x0+Math.floor(Math.random()*TILE), y=y0+Math.floor(Math.random()*TILE);
    ctx.fillStyle = shadeStr(0x2b2b2b,0.5+Math.random()*0.9,10);
    const s = 1+Math.floor(Math.random()*2);
    ctx.fillRect(x,y,s,s);
  }
}
function drawCraftTop(ctx,x0,y0){
  drawPlanks(ctx,x0,y0);
  ctx.fillStyle = shadeStr(0x3a2a1a,1,4);
  ctx.fillRect(x0+2,y0+2,TILE-4,2);
  ctx.fillRect(x0+2,y0+TILE-4,TILE-4,2);
  ctx.fillRect(x0+2,y0+2,2,TILE-4);
  ctx.fillRect(x0+TILE-4,y0+2,2,TILE-4);
  ctx.fillRect(x0+TILE/2-1,y0+5,2,TILE-10);
  ctx.fillRect(x0+5,y0+TILE/2-1,TILE-10,2);
  ctx.fillStyle = shadeStr(0x1c1410,1,2);
  [[3,3],[TILE-5,3],[3,TILE-5],[TILE-5,TILE-5]].forEach(([dx,dy])=> ctx.fillRect(x0+dx,y0+dy,2,2));
}
function drawCraftSide(ctx,x0,y0){
  drawPlanks(ctx,x0,y0);
  ctx.fillStyle = shadeStr(0x3a2a1a,1,4);
  ctx.fillRect(x0+4,y0+TILE*0.35,TILE-8,TILE*0.28);
  ctx.fillStyle = shadeStr(0xc9a06b,1,4);
  ctx.fillRect(x0+7,y0+TILE*0.42,4,4);
  ctx.fillRect(x0+TILE-11,y0+TILE*0.42,4,4);
  ctx.fillStyle = shadeStr(0x1c1410,1,2);
  ctx.fillRect(x0+3,y0+3,2,2);
  ctx.fillRect(x0+TILE-5,y0+3,2,2);
}
function drawBricks(ctx,x0,y0){
  fillTile(ctx,x0,y0,0x9a4a3a);
  const mortar = shadeStr(0x5a3a30,1,0);
  const brickH = TILE/4, brickW = TILE/2;
  let row=0;
  for(let y=0;y<TILE;y+=brickH){
    const offset = (row%2===0)?0:brickW/2;
    for(let bx=-brickW; bx<TILE+brickW; bx+=brickW){
      const tone = 0.85+Math.random()*0.3;
      for(let dy=1;dy<brickH-1;dy++){
        for(let dx=1;dx<brickW-1;dx++){
          const px = x0+bx+offset+dx, py = y0+y+dy;
          if(px<x0||px>=x0+TILE) continue;
          ctx.fillStyle = shadeStr(0x9a4a3a, tone+(Math.random()*0.06-0.03), 6);
          ctx.fillRect(px,py,1,1);
        }
      }
    }
    ctx.fillStyle = mortar;
    ctx.fillRect(x0,y0+y,TILE,1);
    for(let bx=offset; bx<TILE; bx+=brickW) ctx.fillRect(x0+bx,y0+y,1,brickH);
    row++;
  }
}
function drawWater(ctx,x0,y0){
  fillTile(ctx,x0,y0,0x3a6fd8);
  speckle(ctx,x0,y0,0x3a6fd8,Math.round(TILE*TILE*0.15),16);
  for(let i=0;i<5;i++){
    const y0r = Math.random()*TILE, amp = 1.5;
    ctx.fillStyle = shadeStr(0x3a6fd8,1.25,6);
    for(let x=0;x<TILE;x++){
      const yy = Math.round(y0r+Math.sin(x*0.5+i)*amp+TILE)%TILE;
      ctx.fillRect(x0+x,y0+yy,1,1);
    }
  }
}
function drawWindowFrame(ctx,x0,y0,glassHex){
  fillTile(ctx,x0,y0,glassHex);
  speckle(ctx,x0,y0,glassHex,Math.round(TILE*TILE*0.06),8);
  ctx.fillStyle = shadeStr(glassHex,1.3,4);
  for(let i=0;i<TILE*1.3;i++){
    const x = i, y = Math.round(i-TILE*0.3);
    if(y>=0 && y<TILE && x<TILE) ctx.fillRect(x0+x,y0+y,1,1);
  }
  const frame = shadeStr(0x6b4a2b,1,4);
  const fw = Math.max(2,Math.round(TILE/8));
  ctx.fillStyle = frame;
  ctx.fillRect(x0,y0,TILE,fw); ctx.fillRect(x0,y0+TILE-fw,TILE,fw);
  ctx.fillRect(x0,y0,fw,TILE); ctx.fillRect(x0+TILE-fw,y0,fw,TILE);
  ctx.fillRect(x0+TILE/2-fw/2,y0,fw,TILE); ctx.fillRect(x0,y0+TILE/2-fw/2,TILE,fw);
}
function drawWindow(ctx,x0,y0){ drawWindowFrame(ctx,x0,y0,0xbfe4f0); }
function drawWindowOpen(ctx,x0,y0){ drawWindowFrame(ctx,x0,y0,0xe8f6fb); }
function drawDoor(ctx,x0,y0){
  fillTile(ctx,x0,y0,0x8a5a34);
  speckle(ctx,x0,y0,0x8a5a34,Math.round(TILE*TILE*0.12),8);
  for(let i=0;i<6;i++){
    const gy = y0+2+Math.random()*(TILE-4);
    ctx.fillStyle = shadeStr(0x8a5a34,0.8,4);
    ctx.fillRect(x0+2+Math.random()*(TILE-8),gy,4+Math.random()*4,1);
  }
  const dark = shadeStr(0x5a3a20,1,4);
  ctx.fillStyle = dark;
  ctx.fillRect(x0+TILE/2-1,y0+2,2,TILE-4);
  ctx.fillRect(x0+2,y0+2,TILE-4,2);
  ctx.fillRect(x0+2,y0+TILE-4,TILE-4,2);
  ctx.fillRect(x0+5,y0+6,TILE/2-8,TILE*0.3);
  ctx.fillRect(x0+TILE/2+3,y0+6,TILE/2-8,TILE*0.3);
  ctx.fillRect(x0+5,y0+TILE*0.5,TILE/2-8,TILE*0.3);
  ctx.fillRect(x0+TILE/2+3,y0+TILE*0.5,TILE/2-8,TILE*0.3);
  ctx.fillStyle = shadeStr(0xd9c060,1,4);
  ctx.fillRect(x0+TILE/2+5,y0+TILE/2,3,3);
}
function drawDoorOpen(ctx,x0,y0){
  // faded/ghosted look signals "passable", matching how it renders semi-transparent in-world
  fillTile(ctx,x0,y0,0x8a5a34);
  speckle(ctx,x0,y0,0x8a5a34,Math.round(TILE*TILE*0.06),6);
  const dark = shadeStr(0x5a3a20,1,4);
  ctx.fillStyle = dark;
  ctx.fillRect(x0+2,y0+2,TILE-4,2);
  ctx.fillRect(x0+2,y0+TILE-4,TILE-4,2);
}
function drawSapling(ctx,x0,y0){
  fillTile(ctx,x0,y0,0x5b8a3a);
  ctx.fillStyle = shadeStr(0x3a5c22,1,4);
  ctx.fillRect(x0+TILE/2-1,y0+TILE*0.28,3,TILE*0.5);
  for(let i=0;i<4;i++) blob(ctx, x0+TILE*0.35+Math.random()*TILE*0.3, y0+TILE*0.2+Math.random()*TILE*0.3, TILE*0.14, 0x74b84a, 10);
  ctx.fillStyle = shadeStr(0x74b84a,1,10);
  for(let i=0;i<TILE*2.5;i++){
    const px = x0+TILE*0.15+Math.floor(Math.random()*TILE*0.7);
    const py = y0+TILE*0.15+Math.floor(Math.random()*TILE*0.6);
    ctx.fillRect(px,py,1,1);
  }
}
function drawFlint(ctx,x0,y0){
  fillTile(ctx,x0,y0,0x3a3d42);
  speckle(ctx,x0,y0,0x3a3d42,Math.round(TILE*TILE*0.18),14);
  const facet = shadeStr(0x8a90a0,1,10);
  ctx.fillStyle = facet;
  ctx.fillRect(x0+TILE*0.2,y0+TILE*0.18,TILE*0.3,3);
  ctx.fillRect(x0+TILE*0.5,y0+TILE*0.42,TILE*0.25,3);
  ctx.fillRect(x0+TILE*0.25,y0+TILE*0.68,TILE*0.35,3);
  ctx.fillStyle = shadeStr(0x1c1e22,1,6);
  ctx.fillRect(x0+TILE*0.55,y0+TILE*0.18,TILE*0.2,3);
  ctx.fillRect(x0+TILE*0.12,y0+TILE*0.48,TILE*0.2,3);
}
function drawFire(ctx,x0,y0){
  // drawn on a near-black base — combined with the glass bucket's transparency this reads as
  // flickering flame rather than a solid tile
  fillTile(ctx,x0,y0,0x120600);
  for(let i=0;i<3;i++) blob(ctx, x0+TILE*0.3+Math.random()*TILE*0.4, y0+TILE*0.55+Math.random()*TILE*0.3, TILE*0.24, 0xc62b0e, 20);
  for(let i=0;i<3;i++) blob(ctx, x0+TILE*0.32+Math.random()*TILE*0.36, y0+TILE*0.35+Math.random()*TILE*0.25, TILE*0.18, 0xff7a1a, 24);
  for(let i=0;i<2;i++) blob(ctx, x0+TILE*0.4+Math.random()*TILE*0.2, y0+TILE*0.18+Math.random()*TILE*0.18, TILE*0.12, 0xffce4d, 20);
  for(let i=0;i<TILE*0.6;i++){
    const px=x0+Math.floor(Math.random()*TILE), py=y0+Math.floor(Math.random()*TILE*0.5);
    ctx.fillStyle = shadeStr(0xffb066,1,10);
    ctx.fillRect(px,py,1,1);
  }
}
function drawTorch(ctx,x0,y0){
  // near-black base + the glass bucket's transparency reads as a thin stick rather than a solid cube
  fillTile(ctx,x0,y0,0x0a0a0a);
  ctx.fillStyle = shadeStr(0x6b4a2b,1,6);
  ctx.fillRect(x0+TILE/2-1,y0+TILE*0.48,3,TILE*0.45);
  for(let i=0;i<3;i++){
    ctx.fillStyle = shadeStr(0x4a3018,1,4);
    ctx.fillRect(x0+TILE/2-1,y0+TILE*0.5+i*TILE*0.12,3,1);
  }
  for(let i=0;i<2;i++) blob(ctx, x0+TILE*0.4+Math.random()*TILE*0.2, y0+TILE*0.28+Math.random()*TILE*0.15, TILE*0.13, 0xc62b0e, 14);
  for(let i=0;i<2;i++) blob(ctx, x0+TILE*0.42+Math.random()*TILE*0.16, y0+TILE*0.16+Math.random()*TILE*0.12, TILE*0.09, 0xff9a2e, 16);
  ctx.fillStyle = '#ffd75e';
  ctx.fillRect(x0+TILE/2-1,y0+TILE*0.04,2,TILE*0.1);
}
function drawLadder(ctx,x0,y0){
  // near-black base + the glass bucket's transparency (same trick as fire/torch) reads as an open
  // wooden ladder you can see through the gaps of, rather than a solid cube.
  fillTile(ctx,x0,y0,0x0a0a0a);
  ctx.fillStyle = shadeStr(0x8a6a3a,1,10);
  ctx.fillRect(x0+TILE*0.12, y0, TILE*0.14, TILE);
  ctx.fillRect(x0+TILE*0.74, y0, TILE*0.14, TILE);
  const rungs = 4;
  for(let i=0;i<rungs;i++){
    const ry = y0 + TILE*0.1 + i*(TILE*0.8/(rungs-1)) - TILE*0.045;
    ctx.fillStyle = shadeStr(0x9a7a48,1,10);
    ctx.fillRect(x0+TILE*0.12, ry, TILE*0.76, TILE*0.09);
  }
}
function drawTent(ctx,x0,y0){
  // A canvas A-frame seen side-on, pure red with no other markings — no ridge pole, door flap or
  // guy lines — just the sloped canvas panels, shaded so the ridge still reads as a fold.
  fillTile(ctx,x0,y0,0xff0000);
  speckle(ctx,x0,y0,0xff0000,Math.round(TILE*TILE*0.16),10);
  for(let py=0;py<TILE;py++){
    const spread = (py/TILE)*0.5; // how far the tent has opened out at this height
    const left = Math.round(TILE*(0.5-spread)), right = Math.round(TILE*(0.5+spread));
    for(let px=left;px<right;px++){
      const lit = px < TILE*0.5 ? 1.12 : 0.86;
      ctx.fillStyle = shadeStr(0xff0000, lit, 8);
      ctx.fillRect(x0+px,y0+py,1,1);
    }
  }
}
function drawCampfire(ctx,x0,y0){
  // A ring of stones, two crossed logs, and a flame — the scout's whole world revolves around this,
  // so unlike wildfire FIRE it's a solid, permanent block that lights up camp.
  fillTile(ctx,x0,y0,0x3a2a1c);
  speckle(ctx,x0,y0,0x3a2a1c,Math.round(TILE*TILE*0.2),12);
  // stone ring around the edge — a pale granite so it separates from the dark earth base
  const cx = TILE/2, cy = TILE/2;
  for(let a=0;a<16;a++){
    const ang = (a/16)*Math.PI*2;
    blob(ctx, x0+cx+Math.cos(ang)*TILE*0.41, y0+cy+Math.sin(ang)*TILE*0.41, TILE*0.13, 0xb4b0a6, 18);
  }
  // crossed logs
  ctx.save();
  ctx.translate(x0+cx,y0+cy);
  for(const rot of [0.6,-0.6]){
    ctx.rotate(rot);
    ctx.fillStyle = shadeStr(0x6b4a2b,1,10);
    ctx.fillRect(-TILE*0.3,-TILE*0.05,TILE*0.6,TILE*0.1);
    ctx.rotate(-rot);
  }
  ctx.restore();
  // embers, then flame licks on top — layered hot-to-hottest so the centre glows white-yellow
  for(let i=0;i<6;i++) blob(ctx, x0+cx+(Math.random()-0.5)*TILE*0.4,  y0+cy+(Math.random()-0.5)*TILE*0.3,  TILE*0.17, 0xe03a10, 22);
  for(let i=0;i<5;i++) blob(ctx, x0+cx+(Math.random()-0.5)*TILE*0.3,  y0+cy-TILE*0.03+(Math.random()-0.5)*TILE*0.22, TILE*0.14, 0xff8a1f, 24);
  for(let i=0;i<4;i++) blob(ctx, x0+cx+(Math.random()-0.5)*TILE*0.2,  y0+cy-TILE*0.08+(Math.random()-0.5)*TILE*0.14, TILE*0.1,  0xffce4d, 20);
  for(let i=0;i<2;i++) blob(ctx, x0+cx+(Math.random()-0.5)*TILE*0.1,  y0+cy-TILE*0.1, TILE*0.06, 0xfff2c0, 12);
}
function drawLantern(ctx,x0,y0){
  // near-black base + the glass bucket's transparency (same trick as fire/torch/ladder) so the
  // lantern reads as a hanging object rather than a solid cube.
  fillTile(ctx,x0,y0,0x0a0a0a);
  // hanging wire
  ctx.fillStyle = shadeStr(0x8a8a8a,1,8);
  ctx.fillRect(x0+TILE*0.48,y0,2,TILE*0.14);
  ctx.fillRect(x0+TILE*0.3,y0+TILE*0.12,TILE*0.4,2);
  // heavy dark metal frame — a tight silhouette rather than a wide pane
  ctx.fillStyle = shadeStr(0x2e2e34,1,8);
  ctx.fillRect(x0+TILE*0.3, y0+TILE*0.16, TILE*0.4,  TILE*0.1);   // cap
  ctx.fillRect(x0+TILE*0.3, y0+TILE*0.72, TILE*0.4,  TILE*0.12);  // base
  ctx.fillRect(x0+TILE*0.3, y0+TILE*0.24, TILE*0.08, TILE*0.5);   // left post
  ctx.fillRect(x0+TILE*0.62,y0+TILE*0.24, TILE*0.08, TILE*0.5);   // right post
  // amber glass, hottest at the wick
  for(let py=Math.round(TILE*0.26);py<TILE*0.72;py++){
    for(let px=Math.round(TILE*0.38);px<TILE*0.62;px++){
      const d = Math.hypot(px-TILE*0.5, py-TILE*0.52)/(TILE*0.3);
      ctx.fillStyle = shadeStr(0xff9c22, 1.25-d*0.55, 12);
      ctx.fillRect(x0+px,y0+py,1,1);
    }
  }
  // the flame itself
  blob(ctx, x0+TILE*0.5, y0+TILE*0.54, TILE*0.07, 0xfff0b0, 10);
}
// The pole's own position/width is shared by drawFlagPole below so the two segments line up exactly
// when three of these blocks are stacked into one tall flagpole (see placeFlag).
const FLAG_POLE_X = 0.2, FLAG_POLE_W = 0.09;
function drawFlagPole(ctx,x0,y0){
  // near-black base + transparency: just the bare pole, no pennant — the bottom two of the three
  // blocks a Troop Flag places (see placeFlag/drawFlag).
  fillTile(ctx,x0,y0,0x0a0a0a);
  ctx.fillStyle = shadeStr(0x8a6a3a,1,8);
  ctx.fillRect(x0+TILE*FLAG_POLE_X,y0,TILE*FLAG_POLE_W,TILE);
}
function drawFlag(ctx,x0,y0){
  // near-black base + transparency: the top of the pole, capped with a finial, flying a pennant —
  // the third (topmost) block of a Troop Flag, stacked above two plain drawFlagPole segments.
  fillTile(ctx,x0,y0,0x0a0a0a);
  ctx.fillStyle = shadeStr(0x8a6a3a,1,8);
  ctx.fillRect(x0+TILE*FLAG_POLE_X,y0+TILE*0.08,TILE*FLAG_POLE_W,TILE*0.92);
  // gold finial ball capping the very top of the pole
  ctx.fillStyle = shadeStr(0xd9b23a,1,6);
  ctx.beginPath();
  ctx.arc(x0+TILE*(FLAG_POLE_X+FLAG_POLE_W/2), y0+TILE*0.05, TILE*0.06, 0, Math.PI*2);
  ctx.fill();
  // triangular pennant flying to the right, right at the top where a real flag actually flies
  for(let py=Math.round(TILE*0.08);py<TILE*0.42;py++){
    const t = (py-TILE*0.08)/(TILE*0.34);
    const len = TILE*0.62*(1-Math.abs(t-0.5)*1.1);
    for(let px=0;px<len;px++){
      ctx.fillStyle = shadeStr(0x9c1f12, 1.15-px/TILE*0.45, 8);
      ctx.fillRect(x0+TILE*(FLAG_POLE_X+FLAG_POLE_W)+px,y0+py,1,1);
    }
  }
  // fleur-de-lis suggestion: a pale blaze in the middle of the pennant
  ctx.fillStyle = shadeStr(0xf0e4c0,1,8);
  ctx.fillRect(x0+TILE*0.45,y0+TILE*0.16,2,TILE*0.14);
  ctx.fillRect(x0+TILE*0.4,y0+TILE*0.23,TILE*0.16,2);
}
function drawBackpack(ctx,x0,y0){
  // A canvas rucksack seen from the front: rounded body, a flap, a front pocket, and two straps.
  fillTile(ctx,x0,y0,0x5a3a20);
  speckle(ctx,x0,y0,0x5a3a20,Math.round(TILE*TILE*0.1),8);
  ctx.fillStyle = shadeStr(0x6b4a2f,1,8);
  ctx.fillRect(x0+TILE*0.16,y0+TILE*0.22,TILE*0.68,TILE*0.68);
  ctx.fillStyle = shadeStr(0x4a3018,1,8);
  ctx.fillRect(x0+TILE*0.14,y0+TILE*0.14,TILE*0.72,TILE*0.22);
  ctx.fillStyle = shadeStr(0x7a5a38,1,8);
  ctx.fillRect(x0+TILE*0.28,y0+TILE*0.5,TILE*0.44,TILE*0.32);
  ctx.fillStyle = shadeStr(0xc8a366,1,6);
  ctx.fillRect(x0+TILE*0.44,y0+TILE*0.58,TILE*0.12,TILE*0.08);
  ctx.fillStyle = shadeStr(0x3a2412,1,6);
  ctx.fillRect(x0+TILE*0.2,y0,TILE*0.1,TILE*0.22);
  ctx.fillRect(x0+TILE*0.7,y0,TILE*0.1,TILE*0.22);
}
function drawDutchOven(ctx,x0,y0){
  // Near-black base, opaque: a squat cast-iron pot with legs and a bail handle.
  fillTile(ctx,x0,y0,0x0a0a0a);
  const cx = TILE*0.5;
  ctx.fillStyle = shadeStr(0x1c1c1c,1,6);
  ctx.fillRect(x0+TILE*0.22, y0+TILE*0.42, TILE*0.56, TILE*0.34);
  for(let py=0;py<TILE*0.16;py++){
    const t = py/(TILE*0.16);
    const half = TILE*0.3*Math.sqrt(Math.max(0,1-Math.pow(1-t,2)));
    ctx.fillStyle = shadeStr(0x2a2a2a, 1.1-t*0.15, 6);
    ctx.fillRect(x0+cx-half, y0+TILE*0.34-py, half*2, 1);
  }
  ctx.fillStyle = shadeStr(0x1c1c1c,1,4);
  ctx.fillRect(x0+cx-2, y0+TILE*0.30, 4, 5);
  ctx.fillRect(x0+TILE*0.24, y0+TILE*0.76, TILE*0.06, TILE*0.12);
  ctx.fillRect(x0+cx-TILE*0.03, y0+TILE*0.76, TILE*0.06, TILE*0.12);
  ctx.fillRect(x0+TILE*0.70, y0+TILE*0.76, TILE*0.06, TILE*0.12);
  ctx.strokeStyle = shadeStr(0x3a3a3a,1,4);
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(x0+TILE*0.26, y0+TILE*0.42);
  ctx.quadraticCurveTo(x0+cx, y0+TILE*0.12, x0+TILE*0.74, y0+TILE*0.42);
  ctx.stroke();
}
function drawPot(ctx,x0,y0){
  // Near-black base, opaque: a tall metal pot with side handles and a lid.
  fillTile(ctx,x0,y0,0x0a0a0a);
  const cx = TILE*0.5;
  ctx.fillStyle = shadeStr(0x9aa0a6,1,6);
  ctx.fillRect(x0+TILE*0.28, y0+TILE*0.30, TILE*0.44, TILE*0.5);
  ctx.fillStyle = shadeStr(0xc4c9ce,1,4);
  ctx.fillRect(x0+TILE*0.26, y0+TILE*0.28, TILE*0.48, TILE*0.05);
  ctx.fillStyle = shadeStr(0x7a8085,1,4);
  ctx.fillRect(x0+TILE*0.16, y0+TILE*0.36, TILE*0.1, TILE*0.06);
  ctx.fillRect(x0+TILE*0.74, y0+TILE*0.36, TILE*0.1, TILE*0.06);
  ctx.fillStyle = shadeStr(0xb0b6bb,1,4);
  ctx.fillRect(x0+TILE*0.30, y0+TILE*0.22, TILE*0.4, TILE*0.06);
  ctx.fillStyle = shadeStr(0x7a8085,1,4);
  ctx.fillRect(x0+cx-2, y0+TILE*0.16, 4, 6);
}
function drawPan(ctx,x0,y0){
  // Near-black base, opaque: a round pan seen from above with a long handle.
  fillTile(ctx,x0,y0,0x0a0a0a);
  const cx = TILE*0.42, cy = TILE*0.56, r = TILE*0.28;
  for(let py=-r;py<=r;py++){
    const half = Math.sqrt(Math.max(0,r*r-py*py));
    ctx.fillStyle = shadeStr(0x2c2420, 1.0+py/(r*3), 6);
    ctx.fillRect(x0+cx-half, y0+cy+py, half*2, 1);
  }
  const r2 = r*0.72;
  for(let py=-r2;py<=r2;py++){
    const half = Math.sqrt(Math.max(0,r2*r2-py*py));
    ctx.fillStyle = shadeStr(0x3a3028, 1.0, 8);
    ctx.fillRect(x0+cx-half, y0+cy+py, half*2, 1);
  }
  ctx.fillStyle = shadeStr(0x1c1c1c,1,4);
  ctx.fillRect(x0+cx+r*0.6, y0+cy-TILE*0.045, TILE*0.34, TILE*0.09);
}
function drawGriddle(ctx,x0,y0){
  // Near-black base, opaque: a flat plate with grill marks.
  fillTile(ctx,x0,y0,0x0a0a0a);
  ctx.fillStyle = shadeStr(0x3a3a3a,1,6);
  ctx.fillRect(x0+TILE*0.1, y0+TILE*0.32, TILE*0.8, TILE*0.5);
  ctx.fillStyle = shadeStr(0x555555,1,4);
  ctx.fillRect(x0+TILE*0.08, y0+TILE*0.30, TILE*0.84, TILE*0.05);
  ctx.fillRect(x0+TILE*0.08, y0+TILE*0.79, TILE*0.84, TILE*0.03);
  ctx.fillStyle = 'rgba(15,15,15,0.55)';
  for(let i=0;i<4;i++) ctx.fillRect(x0+TILE*0.16, y0+TILE*0.38+i*TILE*0.1, TILE*0.68, 2);
  ctx.fillStyle = shadeStr(0x1c1c1c,1,4);
  ctx.fillRect(x0+TILE*0.02, y0+TILE*0.5, TILE*0.08, TILE*0.1);
  ctx.fillRect(x0+TILE*0.9, y0+TILE*0.5, TILE*0.08, TILE*0.1);
}
function drawBearBox(ctx,x0,y0){
  // A solid, heavy-looking metal storage trunk: banded, hinged, padlocked shut.
  fillTile(ctx,x0,y0,0x3a5f3a);
  speckle(ctx,x0,y0,0x3a5f3a,Math.round(TILE*TILE*0.08),8);
  ctx.fillStyle = shadeStr(0x1c2a1c,1,6);
  ctx.fillRect(x0, y0, TILE, TILE*0.12);
  ctx.fillRect(x0, y0+TILE*0.44, TILE, TILE*0.12);
  ctx.fillRect(x0, y0+TILE*0.88, TILE, TILE*0.12);
  ctx.fillStyle = shadeStr(0x2a2a2a,1,6);
  ctx.fillRect(x0+TILE*0.04, y0+TILE*0.2, TILE*0.1, TILE*0.14);
  ctx.fillRect(x0+TILE*0.86, y0+TILE*0.2, TILE*0.1, TILE*0.14);
  const cx = TILE*0.5, cy = TILE*0.66;
  ctx.strokeStyle = shadeStr(0xd8d2c0,1,4);
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(x0+cx, y0+cy-TILE*0.08, TILE*0.07, Math.PI, 0);
  ctx.stroke();
  ctx.fillStyle = shadeStr(0xc9a020,1,6);
  ctx.fillRect(x0+cx-TILE*0.08, y0+cy-TILE*0.04, TILE*0.16, TILE*0.14);
}
function drawScoutLawBox(ctx,x0,y0){
  // A small golden keepsake box, not a working container — banded in dark wood trim with a five-
  // point star in the middle, since these are found and read once rather than opened and reused.
  fillTile(ctx,x0,y0,0xd4af37);
  speckle(ctx,x0,y0,0xd4af37,Math.round(TILE*TILE*0.06),10);
  ctx.fillStyle = shadeStr(0x6b4a1a,1,4);
  ctx.fillRect(x0, y0+TILE*0.04, TILE, TILE*0.08);
  ctx.fillRect(x0, y0+TILE*0.46, TILE, TILE*0.08);
  ctx.fillRect(x0, y0+TILE*0.88, TILE, TILE*0.08);
  ctx.fillRect(x0+TILE*0.04, y0, TILE*0.08, TILE);
  ctx.fillRect(x0+TILE*0.88, y0, TILE*0.08, TILE);
  ctx.fillStyle = shadeStr(0xfff3c8,1,4);
  const cx = x0+TILE*0.5, cy = y0+TILE*0.6, rOuter = TILE*0.15, rInner = TILE*0.06;
  ctx.beginPath();
  for(let i=0;i<5;i++){
    const a = -Math.PI/2 + i*(Math.PI*2/5), a2 = a + Math.PI/5;
    if(i===0) ctx.moveTo(cx+Math.cos(a)*rOuter, cy+Math.sin(a)*rOuter);
    else ctx.lineTo(cx+Math.cos(a)*rOuter, cy+Math.sin(a)*rOuter);
    ctx.lineTo(cx+Math.cos(a2)*rInner, cy+Math.sin(a2)*rInner);
  }
  ctx.closePath();
  ctx.fill();
}
// ---------- Scout totems (see buildTotem) ----------
// Four carved-wood symbol segments, cycled top to bottom so two camp totems (Scout Oath, Outdoor
// Code) each read as a real stack of distinct rings rather than one texture repeated. Kept deliberately
// generic/geometric — a compass, a star, a flame, a tent — rather than any specific real-world totem
// pole tradition, since this is meant to read as camp craft, not a reproduction of anyone's culture.
function drawTotemRing(ctx,x0,y0){
  fillTile(ctx,x0,y0,0x6b4226);
  speckle(ctx,x0,y0,0x6b4226,Math.round(TILE*TILE*0.14),10);
  // Dark grooves top and bottom suggest each ring is its own carved segment, stacked rather than one
  // continuous pole.
  ctx.fillStyle = shadeStr(0x2e1c0e,1,4);
  ctx.fillRect(x0, y0, TILE, TILE*0.07);
  ctx.fillRect(x0, y0+TILE*0.93, TILE, TILE*0.07);
}
function drawTotemCompass(ctx,x0,y0){
  drawTotemRing(ctx,x0,y0);
  const cx=x0+TILE*0.5, cy=y0+TILE*0.5, r=TILE*0.32;
  ctx.fillStyle = shadeStr(0xe8d9a0,1,4);
  ctx.beginPath();
  ctx.moveTo(cx, cy-r); ctx.lineTo(cx+r*0.28, cy-r*0.28); ctx.lineTo(cx+r, cy); ctx.lineTo(cx+r*0.28, cy+r*0.28);
  ctx.lineTo(cx, cy+r); ctx.lineTo(cx-r*0.28, cy+r*0.28); ctx.lineTo(cx-r, cy); ctx.lineTo(cx-r*0.28, cy-r*0.28);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = shadeStr(0x8a1f1f,1,4);
  ctx.beginPath(); ctx.arc(cx,cy,r*0.18,0,Math.PI*2); ctx.fill();
}
function drawTotemStar(ctx,x0,y0){
  drawTotemRing(ctx,x0,y0);
  ctx.fillStyle = shadeStr(0xe8d9a0,1,4);
  drawStar(ctx, x0+TILE*0.5, y0+TILE*0.5, TILE*0.34, TILE*0.14);
}
function drawTotemFlame(ctx,x0,y0){
  drawTotemRing(ctx,x0,y0);
  const cx = x0+TILE*0.5;
  blob(ctx, cx, y0+TILE*0.62, TILE*0.22, 0xc62b0e, 14);
  blob(ctx, cx, y0+TILE*0.46, TILE*0.16, 0xff7a1a, 16);
  blob(ctx, cx, y0+TILE*0.33, TILE*0.1, 0xffce4d, 14);
}
function drawTotemTent(ctx,x0,y0){
  drawTotemRing(ctx,x0,y0);
  ctx.fillStyle = shadeStr(0xe8d9a0,1,4);
  ctx.beginPath();
  ctx.moveTo(x0+TILE*0.5, y0+TILE*0.22);
  ctx.lineTo(x0+TILE*0.8, y0+TILE*0.74);
  ctx.lineTo(x0+TILE*0.2, y0+TILE*0.74);
  ctx.closePath();
  ctx.fill();
}
// ---------- Giant US flag (see buildGiantFlag) ----------
// Drawn once at real detail on an offscreen canvas well above tile resolution, then each of the 6
// mural blocks just crops+downscales its own slice out of it into the atlas — that's what lets 50
// individual stars actually read as stars instead of a blurry smear once shrunk to a 32px tile.
const US_FLAG_COLS = 3, US_FLAG_ROWS = 2;
const US_FLAG_CELL_PX = 160; // resolution per cell before downscaling into a TILE-sized atlas slot
function drawStar(ctx,cx,cy,rOuter,rInner){
  ctx.beginPath();
  for(let i=0;i<5;i++){
    const a = -Math.PI/2 + i*(Math.PI*2/5), a2 = a + Math.PI/5;
    if(i===0) ctx.moveTo(cx+Math.cos(a)*rOuter, cy+Math.sin(a)*rOuter);
    else ctx.lineTo(cx+Math.cos(a)*rOuter, cy+Math.sin(a)*rOuter);
    ctx.lineTo(cx+Math.cos(a2)*rInner, cy+Math.sin(a2)*rInner);
  }
  ctx.closePath();
  ctx.fill();
}
// Rank badge art — an original, simple design (not a reproduction of any real insignia): a colored
// disc that gets richer per tier, with one star per rank above None. Drawn straight onto whatever 2D
// context is handed in, so the exact same function puts the same-looking badge on the floating name
// tag, the shirt's left chest pocket, and the exit screen's achievement card — "what rank am I" always
// reads the same way wherever it shows up. rankIndex is an index into RANKS (0 = None).
const RANK_BADGE_COLORS = ['#6b6b6b','#a8825a','#8a9a5a','#7a9a4a','#5a8a4a','#b8b8c0','#c94a3a','#f0c020'];
function drawRankBadge(ctx, cx, cy, radius, rankIndex){
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI*2);
  ctx.fillStyle = RANK_BADGE_COLORS[rankIndex] || RANK_BADGE_COLORS[0];
  ctx.fill();
  ctx.lineWidth = Math.max(1, radius*0.12);
  ctx.strokeStyle = 'rgba(0,0,0,0.4)';
  ctx.stroke();
  if(rankIndex<=0) return;
  const n = rankIndex;
  const starR = radius*0.32, starInner = starR*0.42;
  const rows = n<=4 ? 1 : 2;
  const perRow = Math.ceil(n/rows);
  const rowSpacing = radius*0.7;
  ctx.fillStyle = '#fff8e0';
  for(let row=0; row<rows; row++){
    const count = row===rows-1 ? n-perRow*(rows-1) : perRow;
    const y = cy + (row-(rows-1)/2)*rowSpacing;
    for(let i=0;i<count;i++){
      const x = cx + (i-(count-1)/2)*(starR*1.7);
      drawStar(ctx, x, y, starR, starInner);
    }
  }
}
let usFlagMasterCanvas = null;
function buildUSFlagMaster(){
  const w = US_FLAG_COLS*US_FLAG_CELL_PX, h = US_FLAG_ROWS*US_FLAG_CELL_PX;
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d');
  // 13 stripes, but not all the same height: 7 sized to exactly fill the top mural row (where the
  // canton sits) and 6 sized to exactly fill the bottom row, so the canton's bottom edge lands
  // precisely on the row boundary instead of spilling a sliver of blue into the block below it (equal
  // stripe heights across all 13 would leave the canton's real-flag proportion — 7/13 of the total
  // height — taller than the top row it needs to fit inside).
  const cellH = h/US_FLAG_ROWS;
  const topStripeH = cellH/7, botStripeH = cellH/6;
  for(let i=0;i<7;i++){
    ctx.fillStyle = i%2===0 ? '#b22234' : '#ffffff';
    ctx.fillRect(0, i*topStripeH, w, topStripeH+1);
  }
  for(let i=0;i<6;i++){
    ctx.fillStyle = i%2===0 ? '#ffffff' : '#b22234'; // continues the alternation from stripe 7 onward
    ctx.fillRect(0, cellH + i*botStripeH, w, botStripeH+1);
  }
  // Canton (the blue star field) covers the whole top row and 2/5 of the width, real-flag proportions.
  const cantonW = w*0.4, cantonH = cellH;
  ctx.fillStyle = '#3c3b6e';
  ctx.fillRect(0, 0, cantonW, cantonH);
  // 50 stars, 9 rows alternating 6/5, each 5-star row offset half a column to interleave — the same
  // arrangement as the real flag.
  const rows = 9, rowSpacing = cantonH/rows, colSpacing = cantonW/6, starR = colSpacing*0.32;
  ctx.fillStyle = '#ffffff';
  for(let r=0;r<rows;r++){
    const count = r%2===0 ? 6 : 5;
    const y = rowSpacing*(r+0.5);
    for(let c=0;c<count;c++){
      const x = count===6 ? colSpacing*(c+0.5) : colSpacing*(c+1);
      drawStar(ctx, x, y, starR, starR*0.38);
    }
  }
  return canvas;
}
function getUSFlagMaster(){
  if(!usFlagMasterCanvas) usFlagMasterCanvas = buildUSFlagMaster();
  return usFlagMasterCanvas;
}
function drawUSFlagCell(ctx,x0,y0,col,row){
  const master = getUSFlagMaster();
  const cellW = master.width/US_FLAG_COLS, cellH = master.height/US_FLAG_ROWS;
  ctx.drawImage(master, col*cellW, row*cellH, cellW, cellH, x0, y0, TILE, TILE);
}
const drawUSFlagTL = (ctx,x0,y0)=> drawUSFlagCell(ctx,x0,y0,0,0);
const drawUSFlagTC = (ctx,x0,y0)=> drawUSFlagCell(ctx,x0,y0,1,0);
const drawUSFlagTR = (ctx,x0,y0)=> drawUSFlagCell(ctx,x0,y0,2,0);
const drawUSFlagBL = (ctx,x0,y0)=> drawUSFlagCell(ctx,x0,y0,0,1);
const drawUSFlagBC = (ctx,x0,y0)=> drawUSFlagCell(ctx,x0,y0,1,1);
const drawUSFlagBR = (ctx,x0,y0)=> drawUSFlagCell(ctx,x0,y0,2,1);
function buildAtlas(){
  const canvas = document.createElement('canvas');
  canvas.width = TILE*ATLAS_COLS;
  canvas.height = TILE*ATLAS_ROWS;
  const ctx = canvas.getContext('2d');
  const draw = [drawGrassTop, drawGrassSide, drawDirt, drawStone, drawSand, drawLogSide, drawLogTop,
                drawLeaves, drawPlanks, drawBedrock, drawCraftTop, drawCraftSide, drawBricks, drawWater,
                drawWindow, drawWindowOpen, drawDoor, drawDoorOpen, drawSapling, drawFlint, drawFire, drawTorch,
                drawLadder, drawLeavesSparse, drawLeavesDense,
                drawTent, drawCampfire, drawLantern, drawFlag, drawBackpack,
                drawDutchOven, drawPot, drawPan, drawGriddle, drawBearBox, drawFlagPole, drawScoutLawBox,
                drawUSFlagTL, drawUSFlagTC, drawUSFlagTR, drawUSFlagBL, drawUSFlagBC, drawUSFlagBR,
                drawTotemCompass, drawTotemStar, drawTotemFlame, drawTotemTent];
  draw.forEach((fn, i)=> fn(ctx, (i%ATLAS_COLS)*TILE, Math.floor(i/ATLAS_COLS)*TILE));
  const tex = new THREE.CanvasTexture(canvas);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  return tex;
}
function tileUV(i){
  const col = i % ATLAS_COLS, row = Math.floor(i/ATLAS_COLS);
  return {
    u0: col/ATLAS_COLS, u1: (col+1)/ATLAS_COLS,
    vBottom: 1-(row+1)/ATLAS_ROWS, vTop: 1-row/ATLAS_ROWS,
  };
}
const BLOCK_TILES = {
  [GRASS]:  {top:T_GRASS_TOP, side:T_GRASS_SIDE, bottom:T_DIRT},
  [DIRT]:   {top:T_DIRT, side:T_DIRT, bottom:T_DIRT},
  [STONE]:  {top:T_STONE, side:T_STONE, bottom:T_STONE},
  [SAND]:   {top:T_SAND, side:T_SAND, bottom:T_SAND},
  [WOOD]:   {top:T_LOG_TOP, side:T_LOG_SIDE, bottom:T_LOG_TOP},
  [LEAVES]: {top:T_LEAVES, side:T_LEAVES, bottom:T_LEAVES},
  [PLANKS]: {top:T_PLANKS, side:T_PLANKS, bottom:T_PLANKS},
  [WATER]:  {top:T_WATER, side:T_WATER, bottom:T_WATER},
  [BEDROCK]:{top:T_BEDROCK, side:T_BEDROCK, bottom:T_BEDROCK},
  [CRAFTING_TABLE]: {top:T_CRAFT_TOP, side:T_CRAFT_SIDE, bottom:T_PLANKS},
  [BRICKS]: {top:T_BRICKS, side:T_BRICKS, bottom:T_BRICKS},
  [WINDOW]: {top:T_WINDOW, side:T_WINDOW, bottom:T_WINDOW},
  [WINDOW_OPEN]: {top:T_WINDOW_OPEN, side:T_WINDOW_OPEN, bottom:T_WINDOW_OPEN},
  [DOOR]: {top:T_DOOR, side:T_DOOR, bottom:T_DOOR},
  [DOOR_OPEN]: {top:T_DOOR_OPEN, side:T_DOOR_OPEN, bottom:T_DOOR_OPEN},
  [SAPLING]: {top:T_SAPLING, side:T_SAPLING, bottom:T_SAPLING},
  [FLINT]: {top:T_FLINT, side:T_FLINT, bottom:T_FLINT},
  [FIRE]: {top:T_FIRE, side:T_FIRE, bottom:T_FIRE},
  [TORCH]: {top:T_TORCH, side:T_TORCH, bottom:T_TORCH},
  [LADDER]: {top:T_LADDER, side:T_LADDER, bottom:T_LADDER},
  [TENT]: {top:T_TENT, side:T_TENT, bottom:T_PLANKS},
  [CAMPFIRE]: {top:T_CAMPFIRE, side:T_CAMPFIRE, bottom:T_DIRT},
  [LANTERN]: {top:T_LANTERN, side:T_LANTERN, bottom:T_LANTERN},
  [FLAG]: {top:T_FLAG, side:T_FLAG, bottom:T_FLAG},
  [FLAG_POLE]: {top:T_FLAG_POLE, side:T_FLAG_POLE, bottom:T_FLAG_POLE},
  [BACKPACK]: {top:T_BACKPACK, side:T_BACKPACK, bottom:T_PLANKS},
  [DUTCH_OVEN]: {top:T_DUTCH_OVEN, side:T_DUTCH_OVEN, bottom:T_DUTCH_OVEN},
  [POT]: {top:T_POT, side:T_POT, bottom:T_POT},
  [PAN]: {top:T_PAN, side:T_PAN, bottom:T_PAN},
  [GRIDDLE]: {top:T_GRIDDLE, side:T_GRIDDLE, bottom:T_GRIDDLE},
  [BEAR_BOX]: {top:T_BEAR_BOX, side:T_BEAR_BOX, bottom:T_STONE},
  [SCOUT_LAW_BOX]: {top:T_SCOUT_LAW_BOX, side:T_SCOUT_LAW_BOX, bottom:T_SCOUT_LAW_BOX},
  [US_FLAG_TL]: {top:T_US_FLAG_TL, side:T_US_FLAG_TL, bottom:T_US_FLAG_TL},
  [US_FLAG_TC]: {top:T_US_FLAG_TC, side:T_US_FLAG_TC, bottom:T_US_FLAG_TC},
  [US_FLAG_TR]: {top:T_US_FLAG_TR, side:T_US_FLAG_TR, bottom:T_US_FLAG_TR},
  [US_FLAG_BL]: {top:T_US_FLAG_BL, side:T_US_FLAG_BL, bottom:T_US_FLAG_BL},
  [US_FLAG_BC]: {top:T_US_FLAG_BC, side:T_US_FLAG_BC, bottom:T_US_FLAG_BC},
  [US_FLAG_BR]: {top:T_US_FLAG_BR, side:T_US_FLAG_BR, bottom:T_US_FLAG_BR},
  [TOTEM_COMPASS]: {top:T_TOTEM_COMPASS, side:T_TOTEM_COMPASS, bottom:T_TOTEM_COMPASS},
  [TOTEM_STAR]: {top:T_TOTEM_STAR, side:T_TOTEM_STAR, bottom:T_TOTEM_STAR},
  [TOTEM_FLAME]: {top:T_TOTEM_FLAME, side:T_TOTEM_FLAME, bottom:T_TOTEM_FLAME},
  [TOTEM_TENT]: {top:T_TOTEM_TENT, side:T_TOTEM_TENT, bottom:T_TOTEM_TENT},
};
// per-face-direction UV winding (0/1 flags select u0/u1 and vBottom/vTop), aligned to FACES order below
const UV_PATTERNS = [
  [[0,0],[0,1],[1,1],[1,0]], // +x
  [[1,0],[1,1],[0,1],[0,0]], // -x
  [[0,0],[0,1],[1,1],[1,0]], // +y
  [[0,1],[0,0],[1,0],[1,1]], // -y
  [[1,0],[1,1],[0,1],[0,0]], // +z
  [[0,0],[0,1],[1,1],[1,0]], // -z
];

// ---------- Seeded noise (classic Perlin, seeded permutation) ----------
function mulberry32(a){
  return function(){
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
const perm = new Uint8Array(512);
(function initPerm(){
  const rand = mulberry32(SEED);
  const p = new Uint8Array(256);
  for(let i=0;i<256;i++) p[i]=i;
  for(let i=255;i>0;i--){
    const j = Math.floor(rand()*(i+1));
    const t=p[i]; p[i]=p[j]; p[j]=t;
  }
  for(let i=0;i<512;i++) perm[i]=p[i&255];
})();
function fade(t){ return t*t*t*(t*(t*6-15)+10); }
function lerp(a,b,t){ return a+t*(b-a); }
function grad(hash,x,y){
  const h = hash & 7;
  const u = h<4 ? x : y;
  const v = h<4 ? y : x;
  return ((h&1)?-u:u) + ((h&2)?-2*v:2*v);
}
function perlin2(x,y){
  const X = Math.floor(x)&255, Y = Math.floor(y)&255;
  x -= Math.floor(x); y -= Math.floor(y);
  const u = fade(x), v = fade(y);
  const aa=perm[perm[X]+Y], ab=perm[perm[X]+Y+1], ba=perm[perm[X+1]+Y], bb=perm[perm[X+1]+Y+1];
  return lerp(
    lerp(grad(aa,x,y),   grad(ba,x-1,y),   u),
    lerp(grad(ab,x,y-1), grad(bb,x-1,y-1), u),
    v
  );
}
function fbm(x,y,octaves){
  let e=0, amp=1, freq=1, max=0;
  for(let o=0;o<octaves;o++){
    e += perlin2(x*freq, y*freq)*amp;
    max += amp;
    amp*=0.5; freq*=2;
  }
  return e/max;
}
function hash2(x,z){
  const s = Math.sin(x*127.1 + z*311.7 + SEED*0.0001) * 43758.5453123;
  return s - Math.floor(s);
}
function heightAt(x,z){
  const e = fbm(x*0.02, z*0.02, 4);
  return Math.max(2, Math.min(WORLD_HEIGHT-6, Math.floor(BASE_HEIGHT + e*AMPLITUDE)));
}

// ---------- World storage ----------
const world = new Uint8Array(WORLD_SIZE*WORLD_SIZE*WORLD_HEIGHT);
function inBounds(x,y,z){ return x>=0 && x<WORLD_SIZE && z>=0 && z<WORLD_SIZE && y>=0 && y<WORLD_HEIGHT; }
function idx(x,y,z){ return (x*WORLD_SIZE+z)*WORLD_HEIGHT + y; }
function getBlock(x,y,z){ return inBounds(x,y,z) ? world[idx(x,y,z)] : AIR; }
function setBlock(x,y,z,v){ if(inBounds(x,y,z)) world[idx(x,y,z)] = v; }

// A scattering of fallen dead logs lying on open ground — plain WOOD blocks laid out in a short
// straight line at ground level instead of standing up, so they read as a downed trunk rather than
// another sapling. Deterministic per starting column (same hash2 approach as trees/bushes), so they
// stay put across reloads and breaking one for wood is a real, persistent world edit like any tree.
const FALLEN_LOG_CHANCE = 0.003;
const FALLEN_LOG_MIN_LEN = 2, FALLEN_LOG_MAX_LEN = 4;
function placeFallenLogs(){
  for(let x=2;x<WORLD_SIZE-2;x++){
    for(let z=2;z<WORLD_SIZE-2;z++){
      const h = heightAt(x,z);
      if(h<=SEA_LEVEL || getBlock(x,h,z)!==GRASS) continue;
      if(hash2(x+91,z+37) >= FALLEN_LOG_CHANCE) continue;
      const len = FALLEN_LOG_MIN_LEN + Math.floor(hash2(x+13,z+29)*(FALLEN_LOG_MAX_LEN-FALLEN_LOG_MIN_LEN+1));
      const axisX = hash2(x+5,z+61) < 0.5;
      const dir = hash2(x+77,z+3) < 0.5 ? 1 : -1;
      const cells = [];
      let ok = true;
      for(let i=0;i<len;i++){
        const cx = axisX ? x+i*dir : x;
        const cz = axisX ? z : z+i*dir;
        const ch = heightAt(cx,cz);
        if(ch!==h || getBlock(cx,ch,cz)!==GRASS || getBlock(cx,ch+1,cz)!==AIR){ ok=false; break; }
        cells.push({x:cx, y:ch+1, z:cz});
      }
      if(!ok) continue;
      for(const c of cells) setBlock(c.x, c.y, c.z, WOOD);
    }
  }
}
function generateWorld(){
  for(let x=0;x<WORLD_SIZE;x++){
    for(let z=0;z<WORLD_SIZE;z++){
      const h = heightAt(x,z);
      const beach = h<=SEA_LEVEL+1;
      for(let y=0;y<=h;y++){
        let b;
        if(y===0) b=BEDROCK;
        else if(y===h) b = beach ? SAND : GRASS;
        else if(y>h-4) b = beach ? SAND : DIRT;
        else b = STONE;
        setBlock(x,y,z,b);
      }
      if(h < SEA_LEVEL){
        for(let y=h+1;y<=SEA_LEVEL;y++) setBlock(x,y,z,WATER);
      }
    }
  }
  for(let x=2;x<WORLD_SIZE-2;x++){
    for(let z=2;z<WORLD_SIZE-2;z++){
      const h = heightAt(x,z);
      if(h>SEA_LEVEL && getBlock(x,h,z)===GRASS && hash2(x,z) < 0.012){
        if(hash2(x+3,z+5) < BUSH_CHANCE) plantBush(x,h+1,z); else plantTree(x,h+1,z);
      }
    }
  }
  placeFallenLogs();
  buildCookingArea();
  buildGiantFlag();
  buildTotems();
  placeScoutLawBoxes();
}
// ---------- Cooking area: a flat, permanent 20x20 camp-cooking clearing ----------
// A fixed, indestructible set of camp cooking stations near world center: four campfires each with
// a specific piece of cookware sitting on top, one bare campfire, and a bear box for food storage,
// spread evenly across a leveled clearing. Built once during world-gen, not player-placed — the
// fixtures are permanently protected from breaking (see PROTECTED_CELLS).
const COOKING_AREA_SIZE = 20;
const COOKING_AREA_ORIGIN = { x: 54, z: 54 }; // centers the clearing on the map (WORLD_SIZE/2 = 64)
const COOKING_AREA_Y = SEA_LEVEL + 3; // fixed height — flat and dry regardless of underlying terrain
function buildCookingArea(){
  const { x: x0, z: z0 } = COOKING_AREA_ORIGIN;
  for(let dx=0; dx<COOKING_AREA_SIZE; dx++){
    for(let dz=0; dz<COOKING_AREA_SIZE; dz++){
      const x=x0+dx, z=z0+dz;
      for(let y=1; y<COOKING_AREA_Y-1; y++) setBlock(x,y,z,STONE);
      setBlock(x,COOKING_AREA_Y-1,z,DIRT);
      setBlock(x,COOKING_AREA_Y,z,DIRT); // a bare, fire-safe clearing, not grass
      for(let y=COOKING_AREA_Y+1; y<WORLD_HEIGHT; y++) setBlock(x,y,z,AIR);
    }
  }
  const fy = COOKING_AREA_Y+1;
  const protect = (x,y,z,block) => { setBlock(x,y,z,block); PROTECTED_CELLS.add(x+','+y+','+z); };
  // A raw setBlock (like the rest of world-gen) never goes through applyWorldEdit, so it wouldn't
  // otherwise get the point light updateTorchLight normally attaches on placement — these campfires
  // need it called explicitly or they'd sit here glowless.
  const protectFire = (x,y,z) => { protect(x,y,z,CAMPFIRE); updateTorchLight(x,y,z,CAMPFIRE); };
  const stations = [
    { x:x0+5,  z:z0+6,  ware:DUTCH_OVEN },
    { x:x0+10, z:z0+6,  ware:POT },
    { x:x0+15, z:z0+6,  ware:PAN },
    { x:x0+5,  z:z0+14, ware:GRIDDLE },
  ];
  for(const s of stations){
    protectFire(s.x, fy, s.z);
    protect(s.x, fy+1, s.z, s.ware);
  }
  protectFire(x0+10, fy, z0+14); // a fifth, plain campfire
  protect(x0+15, fy, z0+14, BEAR_BOX);
}
// A giant American flag towering over the cooking area's far corner, clear of every station above —
// a flagpole (12 stacked segments, topped with the same gold-finial block the little Troop Flag
// already uses) with a 3-wide x 2-tall mural mounted flush against its hoist side, raised all the way
// up so its top row is level with the finial itself, not just the topmost bare pole segment below it.
// See buildUSFlagMaster for how the mural's 50 stars actually get drawn.
const GIANT_FLAG_POLE_HEIGHT = 12;
// Single source of truth for where the pole actually stands — buildGiantFlag uses it to place the
// thing, and raycastUSFlag's proximity check (see below) uses it to know how close counts as "close".
function giantFlagPolePos(){
  const { x: x0, z: z0 } = COOKING_AREA_ORIGIN;
  return { x: x0 + COOKING_AREA_SIZE - 2, z: z0 + COOKING_AREA_SIZE - 2 };
}
function buildGiantFlag(){
  const { x: poleX, z: poleZ } = giantFlagPolePos();
  const baseY = COOKING_AREA_Y + 1;
  const protect = (x,y,z,block) => { setBlock(x,y,z,block); PROTECTED_CELLS.add(x+','+y+','+z); };
  for(let i=0;i<GIANT_FLAG_POLE_HEIGHT;i++) protect(poleX, baseY+i, poleZ, FLAG_POLE);
  protect(poleX, baseY+GIANT_FLAG_POLE_HEIGHT, poleZ, FLAG);
  const flagTopY = baseY + GIANT_FLAG_POLE_HEIGHT;
  const grid = [
    [US_FLAG_TL, US_FLAG_TC, US_FLAG_TR],
    [US_FLAG_BL, US_FLAG_BC, US_FLAG_BR],
  ];
  for(let row=0; row<2; row++){
    for(let col=0; col<3; col++){
      protect(poleX-1-col, flagTopY-row, poleZ, grid[row][col]);
    }
  }
}
// ---------- Scout totems: two more fixed camp monuments, tucked into free corners of the cooking
// clearing clear of every station/the horse/the flag — a 4-tall one reciting the Scout Oath, a
// 3-tall one reciting the Outdoor Code. Segments cycle through TOTEM_BLOCKS bottom to top so no two
// adjacent rings repeat. `totems` is read by doInteract to find which one a click actually landed on
// (same block ids are reused across both, so position is what tells them apart) and rebuilt fresh
// every load rather than appended to, same reasoning as buildGiantFlag being re-asserted after
// loadEdits below — a stale saved edit on one of these two cells shouldn't be able to erase it.
const totems = []; // {x, z, play}
function totemAt(x,z){ return totems.find(t => t.x===x && t.z===z); }
function buildTotem(x, z, height, play){
  const baseY = COOKING_AREA_Y + 1;
  for(let i=0;i<height;i++){
    setBlock(x, baseY+i, z, TOTEM_BLOCKS[i % TOTEM_BLOCKS.length]);
    PROTECTED_CELLS.add(x+','+(baseY+i)+','+z);
  }
  totems.push({ x, z, play });
}
function buildTotems(){
  totems.length = 0;
  const { x: x0, z: z0 } = COOKING_AREA_ORIGIN;
  buildTotem(x0+COOKING_AREA_SIZE-2, z0+2, 4, playScoutOath);   // NE corner
  buildTotem(x0+2, z0+COOKING_AREA_SIZE-2, 3, playOutdoorCode); // SW corner
}
// ---------- Scout Law boxes: 12 golden keepsakes, one per point of the Scout Law ----------
// Scattered once at world-gen with their own seeded RNG (not Math.random()) so every fresh load
// re-derives the exact same 12 world positions. Unlike the purely ambient wildlife elsewhere in this
// file, these are real collectible progress toward the Scout Spirit badge, so — like the cooking
// area's fixtures — they need to stay put across reloads rather than reshuffle every load.
const SCOUT_LAW_POINTS = [
  { id:'trustworthy', word:'Trustworthy', text:"Tell the truth, and people can count on your word." },
  { id:'loyal',       word:'Loyal',       text:"Stick by your family, your friends, and your country." },
  { id:'helpful',     word:'Helpful',     text:"Lend a hand to others, expecting nothing back." },
  { id:'friendly',    word:'Friendly',    text:"Be a friend to everyone, even people very different from you." },
  { id:'courteous',   word:'Courteous',   text:"Treat people with good manners." },
  { id:'kind',        word:'Kind',        text:"Treat others the way you'd want to be treated." },
  { id:'obedient',    word:'Obedient',    text:"Follow reasonable rules — at home, at school, and in camp." },
  { id:'cheerful',    word:'Cheerful',    text:"Look for the bright side, and try to lift others up." },
  { id:'thrifty',     word:'Thrifty',     text:"Take care of what you have, and save for what's ahead." },
  { id:'brave',       word:'Brave',       text:"Do the right thing even when it's hard or scary." },
  { id:'clean',       word:'Clean',       text:"Keep your body, your words, and your actions clean." },
  { id:'reverent',    word:'Reverent',    text:"Respect your own faith and other people's beliefs." },
];
const SCOUT_LAW_BOX_MIN_SPACING = 12; // blocks apart, so 12 boxes actually spread across the map
const scoutLawBoxes = new Map();  // "x,y,z" -> the SCOUT_LAW_POINTS entry still sitting there
const scoutLawLabels = new Map(); // "x,y,z" -> the floating word-label sprite hovering over it
// Boxes steer clear of the cooking area's own footprint so none ever lands on top of a fixture there.
function inCookingArea(x,z){
  const { x: x0, z: z0 } = COOKING_AREA_ORIGIN;
  return x>=x0-4 && x<x0+COOKING_AREA_SIZE+4 && z>=z0-4 && z<z0+COOKING_AREA_SIZE+4;
}
function placeScoutLawBoxes(){
  const rng = mulberry32(SEED ^ 0x5c0575e5);
  const placed = [];
  for(const law of SCOUT_LAW_POINTS){
    let spot = null;
    for(let tries=0; tries<300 && !spot; tries++){
      const x = 6 + Math.floor(rng()*(WORLD_SIZE-12));
      const z = 6 + Math.floor(rng()*(WORLD_SIZE-12));
      if(inCookingArea(x,z)) continue;
      const h = heightAt(x,z);
      if(h<=SEA_LEVEL+1) continue; // dry land only
      if(getBlock(x,h+1,z)!==AIR) continue; // not already occupied by a tree or other structure
      if(placed.some(p=> Math.hypot(p.x-x, p.z-z) < SCOUT_LAW_BOX_MIN_SPACING)) continue;
      spot = {x, y:h+1, z};
    }
    if(!spot) continue; // the map would have to be extraordinarily crowded for this to ever happen
    placed.push(spot);
    setBlock(spot.x, spot.y, spot.z, SCOUT_LAW_BOX);
    scoutLawBoxes.set(spot.x+','+spot.y+','+spot.z, law);
    PROTECTED_CELLS.add(spot.x+','+spot.y+','+spot.z);
  }
}
// A small canvas-texture billboard (same technique as the player's floating name tag) showing the
// law's word in gold on a dark plaque, so a box reads at a glance from a few blocks off.
function buildLawLabelSprite(word){
  const canvas = document.createElement('canvas');
  canvas.width = 320; canvas.height = 72;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = 'rgba(20,14,0,0.6)';
  ctx.fillRect(2,2,316,68);
  ctx.strokeStyle = '#e8c56b';
  ctx.lineWidth = 3;
  ctx.strokeRect(2,2,316,68);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#ffe9a8';
  ctx.font = 'bold 32px sans-serif';
  ctx.fillText(word.toUpperCase(), 160, 37);
  const tex = new THREE.CanvasTexture(canvas);
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
  sprite.scale.set(2.0, 0.45, 1);
  return sprite;
}
const CAMPSITE_NAME = 'Camp Merit Ridge';
// A rustic wooden welcome sign floating over the cooking area — same canvas-texture sprite technique
// as the Scout Law labels above, just styled like carved wood planks instead of a gold plaque.
function buildCampSignSprite(text){
  const canvas = document.createElement('canvas');
  canvas.width = 512; canvas.height = 128;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#6b4a2b';
  ctx.fillRect(0,0,512,128);
  ctx.strokeStyle = 'rgba(0,0,0,0.2)';
  ctx.lineWidth = 2;
  for(let x=64;x<512;x+=64){ ctx.beginPath(); ctx.moveTo(x,4); ctx.lineTo(x,124); ctx.stroke(); }
  ctx.strokeStyle = '#3a2818';
  ctx.lineWidth = 10;
  ctx.strokeRect(5,5,502,118);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#f0dfa8';
  ctx.font = 'bold 46px sans-serif';
  ctx.fillText(text, 256, 66);
  const tex = new THREE.CanvasTexture(canvas);
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
  sprite.scale.set(4.0, 1.0, 1);
  return sprite;
}
function buildCampSign(){
  const { x: x0, z: z0 } = COOKING_AREA_ORIGIN;
  const sprite = buildCampSignSprite('🏕️ ' + CAMPSITE_NAME);
  sprite.position.set(x0 + COOKING_AREA_SIZE/2, COOKING_AREA_Y + 5, z0 + 2);
  scene.add(sprite);
}
// Runs once after loadEdits() has replayed any saved edits on top of the freshly generated world —
// a box collected in an earlier session now sits under an AIR edit, so this drops it (and skips its
// label) rather than leaving a floating word tag over a box that's no longer really there.
function restoreScoutLawBoxes(){
  for(const [key, law] of [...scoutLawBoxes]){
    const [x,y,z] = key.split(',').map(Number);
    if(getBlock(x,y,z) !== SCOUT_LAW_BOX){
      scoutLawBoxes.delete(key);
      continue;
    }
    const sprite = buildLawLabelSprite(law.word);
    sprite.position.set(x+0.5, y+1.3, z+0.5);
    scene.add(sprite);
    scoutLawLabels.set(key, sprite);
  }
}
function collectScoutLawBox(x,y,z){
  const key = x+','+y+','+z;
  const law = scoutLawBoxes.get(key);
  if(!law) return;
  scoutLawBoxes.delete(key);
  PROTECTED_CELLS.delete(key);
  applyWorldEdit(x, y, z, AIR);
  const label = scoutLawLabels.get(key);
  if(label){ scene.remove(label); scoutLawLabels.delete(key); }
  if(!scoutStats.lawsCollected.includes(law.id)){
    scoutStats.lawsCollected.push(law.id);
    saveScoutProgress();
    checkBadges();
  }
  SFX.badge();
  addChatMessage('Camp', `📜 ${law.word} — ${law.text} (${scoutStats.lawsCollected.length}/${SCOUT_LAW_POINTS.length})`);
}
// writeFn(bx,by,bz,block,unconditional) decides how each cell actually gets written — plantTree/
// plantBush use a raw setBlock (fast, unsynced — fine for deterministic world-gen), the *Synced
// variants route through applyWorldEdit so a sapling maturing at runtime is persisted/synced/
// rendered like any other edit.
const TALL_TREE_CHANCE = 0.05; // fraction of trees that grow to 5x their normal height
const TREE_BRANCH_SPACING = 4; // vertical blocks between each branch on a tall tree's trunk
// A minority of trees generate dead: same trunk, but most grow no canopy at all (a bare snag), and
// the rest keep a canopy of dry brown leaves instead of their species' usual color (see treeTintAt).
// Purely deterministic per root (x,z), like species — nothing extra to store or save.
const DEAD_TREE_CHANCE = 0.18;
const DEAD_TREE_LEAVES_CHANCE = 0.25; // of the dead trees, the fraction that keep brown leaves
function isDeadTree(x,z){ return hash2(x+91,z+53) < DEAD_TREE_CHANCE; }
function deadTreeHasLeaves(x,z){ return hash2(x+17,z+83) < DEAD_TREE_LEAVES_CHANCE; }
function plantTreeCells(x,y,z,writeFn){
  const baseHeight = 4 + Math.floor(hash2(x+1,z+1)*3);
  const isTall = hash2(x+13,z+29) < TALL_TREE_CHANCE;
  const height = isTall ? baseHeight*5 : baseHeight;
  const bare = isDeadTree(x,z) && !deadTreeHasLeaves(x,z);
  for(let i=0;i<height;i++) writeFn(x,y+i,z,WOOD,true);

  // Tall trees (5x normal height) grow branches along the trunk: short wood limbs jutting outward
  // at regular intervals, each with its own small leaf clump — otherwise a trunk that tall reads as
  // an unnaturally bare pole with a single canopy way up top. Deterministic per (x,branch-height), same
  // hash-based approach as the rest of world-gen, so this reconstructs identically every time
  // plantTreeCells is called for this tree (regrowth and the chop/collapse check both rely on that).
  if(isTall){
    for(let by=4; by<height-3; by+=TREE_BRANCH_SPACING){
      const dirSeed = hash2(x+by*7.7+0.5, z+by*3.3+0.5);
      const angle = dirSeed*Math.PI*2;
      const dirX = Math.round(Math.cos(angle)), dirZ = Math.round(Math.sin(angle));
      if(dirX===0 && dirZ===0) continue; // straight up/down isn't a valid branch direction, skip this slot
      const len = 2 + Math.floor(hash2(x+by*1.1, z+by*9.9)*2); // 2-3 blocks long
      let bx=x, bz=z, bY=y+by;
      for(let i=1;i<=len;i++){ bx+=dirX; bz+=dirZ; bY += (i>=len-1?1:0); writeFn(bx,bY,bz,WOOD,true); }
      if(bare) continue; // a bare dead snag: branches, but no leaf clump on them
      for(let dy=-1;dy<=1;dy++) for(let dx=-1;dx<=1;dx++) for(let dz=-1;dz<=1;dz++){
        if(Math.abs(dx)+Math.abs(dz)+Math.abs(dy)>2) continue; // rounder clump than a full cube
        writeFn(bx+dx, bY+dy, bz+dz, LEAVES, false);
      }
    }
  }

  if(bare) return; // no canopy at all — just the bare trunk (and branches, if it's tall)
  const top = y+height;
  for(let dy=-2;dy<=1;dy++){
    const r = dy>=0 ? 1 : 2;
    for(let dx=-r;dx<=r;dx++){
      for(let dz=-r;dz<=r;dz++){
        if(Math.abs(dx)===r && Math.abs(dz)===r && r===2) continue;
        if(dx===0 && dz===0 && dy<=0) continue;
        writeFn(x+dx, top+dy, z+dz, LEAVES, false);
      }
    }
  }
}
function plantTree(x,y,z){
  plantTreeCells(x,y,z,(bx,by,bz,b,unconditional)=>{
    if(unconditional || getBlock(bx,by,bz)===AIR) setBlock(bx,by,bz,b);
  });
}
function plantTreeSynced(x,y,z){
  plantTreeCells(x,y,z,(bx,by,bz,b,unconditional)=>{
    if(unconditional || getBlock(bx,by,bz)===AIR) applyWorldEdit(bx, by, bz, b);
  });
}
// A squat, trunk-less leaf clump (1-2 blocks tall, vs. a tree's 4-6) so the world isn't wall-to-wall
// tall trees — the same low shrub you'd expect scattered between them.
const BUSH_CHANCE = 0.4; // fraction of natural-growth spots that become a bush instead of a tree
function plantBushCells(x,y,z,writeFn){
  writeFn(x,y,z,LEAVES,true);
  for(let dx=-1;dx<=1;dx++){
    for(let dz=-1;dz<=1;dz++){
      if(dx===0 && dz===0) continue;
      if(Math.abs(dx)===1 && Math.abs(dz)===1 && hash2(x+dx*3+13,z+dz*5+17) < 0.4) continue;
      writeFn(x+dx, y, z+dz, LEAVES, false);
    }
  }
  if(hash2(x+7,z+11) < 0.5) writeFn(x, y+1, z, LEAVES, false);
}
function plantBush(x,y,z){
  plantBushCells(x,y,z,(bx,by,bz,b,unconditional)=>{
    if(unconditional || getBlock(bx,by,bz)===AIR) setBlock(bx,by,bz,b);
  });
}
function plantBushSynced(x,y,z){
  plantBushCells(x,y,z,(bx,by,bz,b,unconditional)=>{
    if(unconditional || getBlock(bx,by,bz)===AIR) applyWorldEdit(bx, by, bz, b);
  });
}

// ---------- Save / load edits ----------
const SAVE_KEY = 'scoutcraft_edits_v1';
const INV_KEY = 'scoutcraft_inventory_v1';
const edits = new Map();
let saveTimer = null;
function saveEdits(){
  clearTimeout(saveTimer);
  saveTimer = setTimeout(()=>{
    const obj = {};
    edits.forEach((v,k)=> obj[k]=v);
    try{ localStorage.setItem(SAVE_KEY, JSON.stringify(obj)); }catch(e){}
  }, 300);
  document.getElementById('blockCount').textContent = edits.size;
}
function loadEdits(){
  try{
    const raw = localStorage.getItem(SAVE_KEY);
    if(!raw) return;
    const obj = JSON.parse(raw);
    for(const k in obj){
      const [x,y,z] = k.split(',').map(Number);
      setBlock(x,y,z,obj[k]);
      edits.set(k, obj[k]);
      if(obj[k]===CRAFTING_TABLE) craftingTables.add(k);
      else craftingTables.delete(k);
      if(obj[k]===TENT) tentCells.add(k);
      else tentCells.delete(k);
    }
    document.getElementById('blockCount').textContent = edits.size;
  }catch(e){}
}
let invSaveTimer = null;
function saveInventory(){
  clearTimeout(invSaveTimer);
  invSaveTimer = setTimeout(()=>{
    try{ localStorage.setItem(INV_KEY, JSON.stringify(inventory)); }catch(e){}
  }, 300);
}
function loadInventory(){
  try{
    const raw = localStorage.getItem(INV_KEY);
    if(!raw){ inventory[CRAFTING_TABLE] = 1; return; }
    const obj = JSON.parse(raw);
    for(const k in obj) inventory[k] = obj[k];
  }catch(e){ inventory[CRAFTING_TABLE] = 1; }
}
// A player who leaves while alive comes back at the same spot next time, instead of a random spawn
// point — position changes every frame, so unlike the debounced saves above this is saved on a plain
// periodic timer (see the setInterval near the bottom of the file) plus once more right as the tab
// actually closes (beforeunload/pagehide), rather than debounced-on-change, which would just keep
// getting reset by continuous movement and might never actually fire. Skipped entirely while dead —
// see spawnPlayerAtStart — so the position restored next load is always one they were alive at.
const POS_KEY = 'scoutcraft_last_pos_v1';
const POSITION_SAVE_INTERVAL_MS = 5000; // how often the plain periodic timer below re-saves it
function savePosition(){
  if(isDead) return;
  try{
    localStorage.setItem(POS_KEY, JSON.stringify({ x: player.pos.x, y: player.pos.y, z: player.pos.z }));
  }catch(e){}
}
function loadPosition(){
  try{
    const raw = localStorage.getItem(POS_KEY);
    if(!raw) return null;
    const p = JSON.parse(raw);
    if(typeof p.x!=='number' || typeof p.y!=='number' || typeof p.z!=='number') return null;
    return p;
  }catch(e){ return null; }
}

// ---------- Chunked mesh building ----------
let scene, camera, renderer, hemiLight, sunLight, heldTorchLight;
const chunkMeshes = new Map();
function chunkKey(cx,cz){ return cx+','+cz; }

const FACES = [
  { n:[1,0,0],  c:[[1,0,0],[1,1,0],[1,1,1],[1,0,1]] },
  { n:[-1,0,0], c:[[0,0,1],[0,1,1],[0,1,0],[0,0,0]] },
  { n:[0,1,0],  c:[[0,1,0],[0,1,1],[1,1,1],[1,1,0]] },
  { n:[0,-1,0], c:[[0,0,1],[0,0,0],[1,0,0],[1,0,1]] },
  { n:[0,0,1],  c:[[1,0,1],[1,1,1],[0,1,1],[0,0,1]] },
  { n:[0,0,-1], c:[[0,0,0],[0,1,0],[1,1,0],[1,0,0]] },
];

const atlasTexture = buildAtlas();
const solidMaterial = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide, map: atlasTexture });
const waterMaterial = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide, map: atlasTexture, transparent:true, opacity:0.75 });
// Shared by every other see-through block (windows, an open door) -- a neutral, un-tinted glass
// material so their own texture supplies the color, unlike water's blue-tinted one.
const glassMaterial = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide, map: atlasTexture, transparent:true, opacity:0.65 });
// Any block that isn't fully opaque. A face between two blocks of the SAME transparent type is
// skipped (no point rendering the seam between two adjacent water, window, or leaf blocks); a face
// against a *different* transparent type, or against AIR, still draws.
const TRANSPARENT_BLOCKS = new Set([WATER, WINDOW, WINDOW_OPEN, DOOR_OPEN, SAPLING, FIRE, TORCH, LADDER, LEAVES, LANTERN, FLAG, FLAG_POLE]);
// Mostly the subset of the above that a "is this column covered by a roof" check treats as passing
// sky/light straight through. Leaves are deliberately left out — a tree's canopy still counts as real
// shelter/shade (indoor darkening, temperature danger) even though it now renders sparse and
// translucent rather than as a solid cube. The giant flag's 6 mural blocks are the one exception in
// the other direction: fully opaque (not in TRANSPARENT_BLOCKS, so they still render as solid color,
// no alpha blending) but listed here anyway, since without it the top row's own shadow was darkening
// the bottom row directly beneath it — a real roof would darken what's under it, but a paper-thin
// 2-block-tall panel floating in open air isn't meaningfully "indoors."
const SKY_PASS_BLOCKS = new Set([WATER, WINDOW, WINDOW_OPEN, DOOR_OPEN, SAPLING, FIRE, TORCH, LADDER, LANTERN, FLAG, FLAG_POLE,
  US_FLAG_TL, US_FLAG_TC, US_FLAG_TR, US_FLAG_BL, US_FLAG_BC, US_FLAG_BR]);
// A block that gives off light shouldn't be *shaded* by light: with MeshLambertMaterial a campfire
// sat as a black cube in the middle of its own pool of light, because its point light is inside the
// block and so contributes nothing to the outward-facing normals. MeshBasicMaterial ignores lighting
// entirely, so these render at full texture brightness day and night — which is what "glowing" means.
const glowMaterial = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide, map: atlasTexture });
// The see-through equivalent, for a lantern: same 0.65 opacity as glassMaterial so it still reads as
// a hanging object rather than a solid cube, but unlit like its opaque sibling above.
const glowGlassMaterial = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide, map: atlasTexture, transparent:true, opacity:0.65 });
// Keep in sync with LIGHT_BLOCKS further below — every block that casts light belongs here.
const GLOW_BLOCKS = new Set([TORCH, CAMPFIRE, LANTERN]);
function bucketFor(b){
  if(GLOW_BLOCKS.has(b)) return TRANSPARENT_BLOCKS.has(b) ? 'glowGlass' : 'glow';
  return b===WATER ? 'water' : (TRANSPARENT_BLOCKS.has(b) ? 'glass' : 'solid');
}
// Every geometry bucket a chunk splits into, and the material each one is drawn with. Kept as a
// table so adding a bucket doesn't mean touching three separate hard-coded lists.
const MESH_BUCKETS = ['solid','water','glass','glow','glowGlass'];
const BUCKET_MATERIAL = {
  solid: solidMaterial, water: waterMaterial, glass: glassMaterial,
  glow: glowMaterial, glowGlass: glowGlassMaterial,
};

// Blocks with a clear vertical path up to the sky get full outdoor light; anything with a solid
// roof over it (a cave ceiling, a building's roof, a closed door/window blocking a doorway) is
// darkened instead — otherwise every interior was exactly as bright as the surface, since the
// hemisphere/sun lights have no concept of occlusion. Computed once per column per chunk rebuild
// (top-down, O(WORLD_HEIGHT)) rather than per face, so it stays cheap.
const INDOOR_DARK_FACTOR = 0.28;
function computeSkyExposure(x,z){
  const exposed = new Uint8Array(WORLD_HEIGHT);
  let blocked = false;
  for(let y=WORLD_HEIGHT-1; y>=0; y--){
    exposed[y] = blocked ? 0 : 1;
    const b = getBlock(x,y,z);
    if(b!==AIR && !SKY_PASS_BLOCKS.has(b)) blocked = true;
  }
  return exposed;
}
// ---------- Tree species colors ----------
// Trees still all use the same generic WOOD/LEAVES block IDs — chopping any of them always gives
// plain Wood/Leaves items, no new resource types — but each tree's trunk+canopy is tinted per a
// species picked deterministically from its trunk's own (x,z), the same "no extra state to save"
// trick day/night/weather/seasons already use. mul values are RGB multipliers applied on top of the
// existing per-face lighting shade, not new textures. index 0 (untinted, [1,1,1]) is oak. leafTile
// picks which of the three leaf-density atlas tiles (T_LEAVES/_SPARSE/_DENSE) that species uses —
// evergreens read fuller, a willow's canopy reads wispier, same trick as the color tint.
const TREE_SPECIES = [
  { id:'oak',     leafMul:[1,1,1],           woodMul:[1,1,1],                                  leafTile:T_LEAVES },
  { id:'pine',    leafMul:[0.55,0.85,0.60],  woodMul:[0.85,0.72,0.68],                          leafTile:T_LEAVES_DENSE },
  { id:'birch',   leafMul:[1.10,1.25,0.55],  woodMul:[1.65,1.60,1.40],                          leafTile:T_LEAVES_SPARSE },
  { id:'willow',  leafMul:[0.85,1.15,0.75],  woodMul:[1.05,0.95,0.80],                          leafTile:T_LEAVES_SPARSE },
  { id:'maple',   leafMul:[1.55,0.55,0.35],  woodMul:[0.95,0.88,0.82],                          leafTile:T_LEAVES },
  { id:'redwood', leafMul:[0.55,0.82,0.58],  woodMul:[1.15,0.50,0.42],                          leafTile:T_LEAVES_DENSE },
  { id:'apple',   leafMul:[0.95,1.12,0.62],  woodMul:[1,1,1], fruitMul:[1.6,0.25,0.22],          leafTile:T_LEAVES },
];
// Dry, dead-brown canopy for the minority of dead trees that keep any leaves at all (see
// deadTreeHasLeaves) — sparse, so a bare-looking dead tree still reads as thinning rather than lush.
const DEAD_LEAF_TINT = { leafMul:[0.62,0.42,0.22], leafTile:T_LEAVES_SPARSE };
// Weathered grey for a dead tree's bark — applied on top of the ordinary wood texture, same trick as
// every species tint, so a dead trunk reads as grey even when (being bare) it has no canopy at all
// to give it away otherwise. Uneven per-channel multipliers, not a flat darken: the base wood texture
// is a warm brown (0xa8825a, R>G>B), so scaling R/G down to match B is what actually desaturates it
// toward neutral grey instead of just producing a darker brown.
const DEAD_WOOD_TINT = [0.54, 0.69, 1.0];
function speciesIndexForRoot(x,z){ return Math.floor(hash2(x+41,z+67)*TREE_SPECIES.length) % TREE_SPECIES.length; }
// Bounded look for canopy near a wood run's top — gates tinting to things that actually look like a
// tree (a trunk with leaves overhead) so ordinary player-built wood walls/floors stay untinted.
function hasCanopyNear(x,y,z){
  for(let dy=-1;dy<=2;dy++) for(let dx=-2;dx<=2;dx++) for(let dz=-2;dz<=2;dz++){
    if(getBlock(x+dx,y+dy,z+dz)===LEAVES) return true;
  }
  return false;
}
// Reconstructs, purely from (x,z), whether generateWorld's original growth pass would have rooted a
// tree (not a bush, and not on beach sand) right here — the exact same checks it used, just
// evaluated on demand rather than stored anywhere. Lets a bare dead trunk still get tinted grey even
// though — being leafless — hasCanopyNear alone would never find it.
function isTreeRoot(x,z){
  const h = heightAt(x,z);
  if(h<=SEA_LEVEL+1) return false; // beach sand at spawn time, never a tree
  if(hash2(x,z) >= 0.012) return false;
  return hash2(x+3,z+5) >= BUSH_CHANCE; // and it grew into a tree, not a bush
}
// One pass per column (same cost class as computeSkyExposure, called right alongside it): walks
// every contiguous WOOD run top-to-bottom and, if that run has canopy near its top (or this column
// is the tree's own root, canopy or not), tags the whole run with a species index (1-based; 0 = not
// tree wood) — so a tall/giant trunk is tinted consistently end to end, not just near the top.
function computeColumnTreeSpecies(x,z){
  const species = new Uint8Array(WORLD_HEIGHT);
  const rootHere = isTreeRoot(x,z);
  let runStart = -1;
  for(let y=0;y<=WORLD_HEIGHT;y++){
    const b = y<WORLD_HEIGHT ? getBlock(x,y,z) : AIR;
    if(b===WOOD){
      if(runStart<0) runStart = y;
    } else if(runStart>=0){
      if(rootHere || hasCanopyNear(x,y-1,z)){
        const sIdx = speciesIndexForRoot(x,z)+1;
        for(let ry=runStart; ry<y; ry++) species[ry] = sIdx;
      }
      runStart = -1;
    }
  }
  return species;
}
// For a LEAVES cell, find the (x,z) of whichever nearby WOOD column its canopy most likely belongs
// to — checked ring-by-ring (closest first) within the same small spread plantTreeCells ever uses.
function findTrunkColumnNear(x,y,z){
  for(let r=0;r<=2;r++){
    for(let dx=-r;dx<=r;dx++){
      for(let dz=-r;dz<=r;dz++){
        if(Math.max(Math.abs(dx),Math.abs(dz))!==r) continue;
        for(let dy=-3;dy<=2;dy++){
          if(getBlock(x+dx,y+dy,z+dz)===WOOD) return {x:x+dx, z:z+dz};
        }
      }
    }
  }
  return null;
}
function treeTintAt(b,x,y,z,columnSpecies){
  if(b===WOOD){
    const sIdx = columnSpecies[y];
    if(sIdx<=0) return null;
    if(isDeadTree(x,z)) return { mul: DEAD_WOOD_TINT, leafTile:null };
    return { mul: TREE_SPECIES[sIdx-1].woodMul, leafTile:null };
  }
  const trunk = findTrunkColumnNear(x,y,z);
  if(!trunk) return null;
  if(isDeadTree(trunk.x,trunk.z)) return { mul: DEAD_LEAF_TINT.leafMul, leafTile: DEAD_LEAF_TINT.leafTile };
  const species = TREE_SPECIES[speciesIndexForRoot(trunk.x,trunk.z)];
  const mul = (species.fruitMul && hash2(x*7+y*13+3, z*11+y*17+5) < 0.12) ? species.fruitMul : species.leafMul;
  return { mul, leafTile: species.leafTile };
}
function buildChunkGeometries(cx,cz){
  const buckets = {};
  for(const name of MESH_BUCKETS) buckets[name] = {positions:[],normals:[],colors:[],uvs:[],indices:[]};
  const x0=cx*CHUNK_SIZE, z0=cz*CHUNK_SIZE;
  for(let x=x0;x<x0+CHUNK_SIZE;x++){
    for(let z=z0;z<z0+CHUNK_SIZE;z++){
      const skyExposed = computeSkyExposure(x,z);
      const columnSpecies = computeColumnTreeSpecies(x,z);
      for(let y=0;y<WORLD_HEIGHT;y++){
        const b = getBlock(x,y,z);
        // Fire is rendered as its own non-solid crossed-billboard sprite (see ensureFireFx), not as
        // a cube face — it stays in TRANSPARENT_BLOCKS so it still doesn't occlude neighbors or block
        // sky exposure, but it no longer gets meshed into the chunk itself.
        if(b===AIR || b===FIRE) continue;
        const bucket = buckets[bucketFor(b)];
        const tiles = BLOCK_TILES[b];
        const indoorF = skyExposed[y] ? 1.0 : INDOOR_DARK_FACTOR;
        const tint = (b===WOOD || b===LEAVES) ? treeTintAt(b,x,y,z,columnSpecies) : null;
        for(let fi=0; fi<FACES.length; fi++){
          const f = FACES[fi];
          const nb = getBlock(x+f.n[0], y+f.n[1], z+f.n[2]);
          let draw;
          if(nb===AIR) draw = true;
          else if(TRANSPARENT_BLOCKS.has(nb) && nb!==b) draw = true;
          else draw = false;
          if(!draw) continue;
          const shadeF = (f.n[1]===1 ? 1.0 : (f.n[1]===-1 ? 0.5 : 0.75)) * indoorF;
          const tileIdx = (tint && tint.leafTile!=null) ? tint.leafTile
            : (f.n[1]===1 ? tiles.top : (f.n[1]===-1 ? tiles.bottom : tiles.side));
          const {u0,u1,vBottom,vTop} = tileUV(tileIdx);
          const pattern = UV_PATTERNS[fi];
          const base = bucket.positions.length/3;
          for(let ci=0; ci<4; ci++){
            const c = f.c[ci];
            bucket.positions.push(x+c[0], y+c[1], z+c[2]);
            bucket.normals.push(f.n[0],f.n[1],f.n[2]);
            if(tint) bucket.colors.push(shadeF*tint.mul[0], shadeF*tint.mul[1], shadeF*tint.mul[2]);
            else bucket.colors.push(shadeF,shadeF,shadeF);
            const [uf,vf] = pattern[ci];
            bucket.uvs.push(uf?u1:u0, vf?vTop:vBottom);
          }
          bucket.indices.push(base,base+1,base+2, base,base+2,base+3);
        }
      }
    }
  }
  function toGeo(bucket){
    if(bucket.positions.length===0) return null;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(bucket.positions,3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(bucket.normals,3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(bucket.colors,3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(bucket.uvs,2));
    geo.setIndex(bucket.indices);
    return geo;
  }
  const out = {};
  for(const name of MESH_BUCKETS) out[name] = toGeo(buckets[name]);
  return out;
}

function rebuildChunk(cx,cz){
  const key = chunkKey(cx,cz);
  const existing = chunkMeshes.get(key);
  if(existing){
    MESH_BUCKETS.forEach(k=>{
      if(existing[k]){ scene.remove(existing[k]); existing[k].geometry.dispose(); }
    });
  }
  const geos = buildChunkGeometries(cx,cz);
  const entry = {};
  // Only the solid terrain casts/receives shadows — water/glass/glow stay out of it, both because
  // translucent or self-lit shadow casters look wrong and because it keeps the shadow pass cheaper.
  for(const name of MESH_BUCKETS){
    const geo = geos[name];
    if(!geo) continue;
    const m = new THREE.Mesh(geo, BUCKET_MATERIAL[name]);
    if(name==='solid'){ m.castShadow = true; m.receiveShadow = true; }
    else if(name==='water' || name==='glass') m.receiveShadow = true;
    scene.add(m);
    entry[name] = m;
  }
  chunkMeshes.set(key, entry);
}
function rebuildAllChunks(){
  for(let cx=0;cx<CHUNKS_PER_SIDE;cx++)
    for(let cz=0;cz<CHUNKS_PER_SIDE;cz++)
      rebuildChunk(cx,cz);
}
function rebuildChunkAt(x,z){
  const cx = Math.floor(x/CHUNK_SIZE), cz = Math.floor(z/CHUNK_SIZE);
  if(cx<0||cz<0||cx>=CHUNKS_PER_SIDE||cz>=CHUNKS_PER_SIDE) return;
  rebuildChunk(cx,cz);
}
function onBlockChanged(x,y,z){
  rebuildChunkAt(x,z);
  const lx = ((x % CHUNK_SIZE)+CHUNK_SIZE)%CHUNK_SIZE;
  const lz = ((z % CHUNK_SIZE)+CHUNK_SIZE)%CHUNK_SIZE;
  if(lx===0) rebuildChunkAt(x-1,z);
  if(lx===CHUNK_SIZE-1) rebuildChunkAt(x+1,z);
  if(lz===0) rebuildChunkAt(x,z-1);
  if(lz===CHUNK_SIZE-1) rebuildChunkAt(x,z+1);
  updateMinimapColumn(x,z);
}

// ---------- Minimap: a static top-down view of the whole (fixed-size) world ----------
// The terrain layer is a 1px-per-block offscreen canvas, baked once at load from each column's
// topmost non-air block (so lakes read as water, clearings as grass, etc. using the exact same
// BLOCK_COLOR every hotbar swatch already uses) and patched a single pixel at a time as blocks
// change, rather than ever re-scanning the whole map. The visible canvas just rescales that image
// every frame (crisp/nearest, no smoothing) and draws the live player positions on top of it.
const MINIMAP_DISPLAY = 160;
let minimapTerrainCanvas, minimapTerrainCtx, minimapCanvas, minimapCtx;
function surfaceColorAt(x,z){
  for(let y=WORLD_HEIGHT-1;y>=0;y--){
    const b = getBlock(x,y,z);
    if(b!==AIR) return BLOCK_COLOR[b]!=null ? BLOCK_COLOR[b] : 0x223322;
  }
  return 0x223322;
}
function updateMinimapColumn(x,z){
  if(!minimapTerrainCtx) return;
  minimapTerrainCtx.fillStyle = '#'+surfaceColorAt(x,z).toString(16).padStart(6,'0');
  minimapTerrainCtx.fillRect(x,z,1,1);
}
function buildMinimapTerrain(){
  minimapTerrainCanvas = document.createElement('canvas');
  minimapTerrainCanvas.width = WORLD_SIZE;
  minimapTerrainCanvas.height = WORLD_SIZE;
  minimapTerrainCtx = minimapTerrainCanvas.getContext('2d');
  for(let x=0;x<WORLD_SIZE;x++) for(let z=0;z<WORLD_SIZE;z++) updateMinimapColumn(x,z);
  minimapCanvas = document.getElementById('minimapCanvas');
  if(minimapCanvas){
    minimapCtx = minimapCanvas.getContext('2d');
    minimapCtx.imageSmoothingEnabled = false;
  }
}
// Points in the direction the character is actually facing (same forward-vector convention used
// for door placement: (-sin(yaw), -cos(yaw))), so at a glance you can tell which way someone's
// looking, not just where they are. A thick black outline followed by a thin white one gives every
// triangle a high-contrast border that stays legible over any terrain color underneath it.
function drawMinimapTriangle(px,py,yaw,size,fillColor){
  const fx = -Math.sin(yaw), fz = -Math.cos(yaw);
  const rx = Math.cos(yaw), rz = -Math.sin(yaw);
  minimapCtx.beginPath();
  minimapCtx.moveTo(px+fx*size, py+fz*size);
  minimapCtx.lineTo(px-fx*size*0.6+rx*size*0.55, py-fz*size*0.6+rz*size*0.55);
  minimapCtx.lineTo(px-fx*size*0.6-rx*size*0.55, py-fz*size*0.6-rz*size*0.55);
  minimapCtx.closePath();
  minimapCtx.fillStyle = fillColor;
  minimapCtx.fill();
  minimapCtx.lineWidth = 2.5;
  minimapCtx.strokeStyle = '#000';
  minimapCtx.stroke();
  minimapCtx.lineWidth = 1;
  minimapCtx.strokeStyle = '#fff';
  minimapCtx.stroke();
}
function drawMinimapLabel(px,py,text){
  minimapCtx.font = '9px sans-serif';
  minimapCtx.textAlign = 'center';
  minimapCtx.textBaseline = 'top';
  minimapCtx.lineWidth = 2;
  minimapCtx.strokeStyle = 'rgba(0,0,0,0.85)';
  minimapCtx.strokeText(text, px, py);
  minimapCtx.fillStyle = '#fff';
  minimapCtx.fillText(text, px, py);
}
function updateMinimap(){
  if(!minimapCanvas) return;
  const S = MINIMAP_DISPLAY;
  minimapCtx.clearRect(0,0,S,S);
  minimapCtx.drawImage(minimapTerrainCanvas, 0,0, WORLD_SIZE, WORLD_SIZE, 0,0, S,S);
  if(!isDead){
    const px = (player.pos.x/WORLD_SIZE)*S, py = (player.pos.z/WORLD_SIZE)*S;
    drawMinimapTriangle(px,py,player.yaw,6,'#fff2b0');
    drawMinimapLabel(px, py+8, myName || 'You');
  }
}

// ---------- Player ----------
const GRAVITY = -28, JUMP_SPEED = 9, WALK_SPEED = 5.2, SPRINT_SPEED = 8.4, LADDER_CLIMB_SPEED = 4, SWIM_SPEED = 3.5;
const WATER_SINK_SPEED = 1.2; // gentle default sink in water when not actively holding Space to stay up
// Hold Ctrl to crawl: drops to a much shorter hitbox (comfortably under 1 block, so a 1-tall gap with
// solid floor and ceiling actually clears it) and moves slower, same "hold a modifier key" feel as
// sprint. player.height/eye shrink to these while crawling and pop back to PLAYER_HEIGHT/PLAYER_EYE
// the instant Ctrl is released (no "must find headroom before standing" gating — simplest version).
const PLAYER_HEIGHT = 1.8, PLAYER_EYE = 1.6;
const CRAWL_HEIGHT = 0.75, CRAWL_EYE = 0.55, CRAWL_SPEED = 2.2;
const player = {
  pos: new THREE.Vector3(0,0,0),
  vel: new THREE.Vector3(0,0,0),
  yaw: 0, pitch: 0, onGround: false, crawling: false, inWater: false,
  canDoubleJump: false, spaceWasDown: false, crawlMode: false, ridingEagle: null, inKayak: false, ridingHorse: false,
  width: 0.6, height: PLAYER_HEIGHT, eye: PLAYER_EYE,
};
// 10 fixed spawn points spread across the map, as fractions of WORLD_SIZE so they scale with it.
const SPAWN_POINTS = [
  [0.50,0.50], [0.20,0.20], [0.80,0.20], [0.20,0.80], [0.80,0.80],
  [0.60,0.22], [0.50,0.80], [0.20,0.50], [0.80,0.50], [0.35,0.65],
].map(([fx,fz]) => [Math.floor(fx*WORLD_SIZE), Math.floor(fz*WORLD_SIZE)]);
let lastSpawnIndex = -1;
function pickSpawnIndex(){
  let idx;
  do{ idx = Math.floor(Math.random()*SPAWN_POINTS.length); }while(idx===lastSpawnIndex);
  lastSpawnIndex = idx;
  return idx;
}
function spawnPlayer(){
  const [x,z] = SPAWN_POINTS[pickSpawnIndex()];
  const h = heightAt(x,z);
  player.pos.set(x+0.5, h+2, z+0.5);
  player.vel.set(0,0,0);
  player.fallFrom = player.pos.y;
}
// Only used once, at page load: restores wherever this browser's player last was (see savePosition)
// if it looks like sane, in-bounds data, falling back to a normal random spawnPlayer() otherwise —
// no saved position yet, corrupted localStorage, or the player last left while dead (savePosition
// skips writing in that case, so death always still means a fresh random spawn). The world can
// change while nobody's there to see it (water flowing in, leaves regrowing), so if the saved spot
// is now embedded in something solid, nudge upward a little rather than leaving the player stuck.
function spawnPlayerAtStart(){
  const p = loadPosition();
  const inBounds = p && p.x>=0 && p.x<=WORLD_SIZE && p.z>=0 && p.z<=WORLD_SIZE && p.y>0 && p.y<WORLD_HEIGHT;
  if(!inBounds){ spawnPlayer(); return; }
  player.pos.set(p.x, p.y, p.z);
  player.vel.set(0,0,0);
  player.fallFrom = player.pos.y;
  let tries = 0;
  while(collidesBox(player.pos.x, player.pos.y, player.pos.z) && tries<30){
    player.pos.y += 1;
    tries++;
  }
}

// ---------- Blocky character model (the player's own body, and other connected players) ----------
function buildFaceTexture(){
  const size = 16;
  const canvas = document.createElement('canvas');
  canvas.width = size; canvas.height = size;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = 'rgb(217,160,102)';
  ctx.fillRect(0,0,size,size);
  ctx.fillStyle = 'rgb(45,32,26)';
  ctx.fillRect(3,6,3,3);
  ctx.fillRect(10,6,3,3);
  ctx.fillStyle = 'rgb(250,250,250)';
  ctx.fillRect(4,6,1,1);
  ctx.fillRect(11,6,1,1);
  ctx.fillStyle = 'rgb(140,85,70)';
  ctx.fillRect(6,11,4,2);
  const tex = new THREE.CanvasTexture(canvas);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  return tex;
}
const skinMaterial = new THREE.MeshLambertMaterial({ color: 0xd9a066 });
const faceMaterial = new THREE.MeshLambertMaterial({ map: buildFaceTexture() });
// BoxGeometry material order is +x,-x,+y,-y,+z,-z; index 5 (-z) is the character's forward side,
// matching yaw=0 facing -Z (same convention as getLookDir/the camera).
const headMaterials = [skinMaterial, skinMaterial, skinMaterial, skinMaterial, skinMaterial, faceMaterial];
// Same NearestFilter/no-mipmap pixel-art treatment as buildFaceTexture — these are all tiny, viewed
// up close, and should read as blocky patches rather than blurry smears.
function pixelTexture(canvas){
  const tex = new THREE.CanvasTexture(canvas);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  return tex;
}
// Two chest pockets and a row of buttons down the placket — drawn onto the torso box's front (-z)
// face only, same face-array trick as the head's own faceMaterial above.
const SHIRT_COLOR_HEX = '#a89272'; // must track the shirtMat default a few lines down
// rankIndex (0=None) puts your current rank badge on the left chest pocket, same small vector art as
// drawRankBadge everywhere else — left blank until you've actually earned your way to at least Scout.
function buildShirtFrontTexture(rankIndex){
  const w=32, h=48;
  const canvas = document.createElement('canvas');
  canvas.width=w; canvas.height=h;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = SHIRT_COLOR_HEX;
  ctx.fillRect(0,0,w,h);
  ctx.fillStyle = '#8a7860';
  ctx.fillRect(3,9,10,11);
  ctx.fillRect(19,9,10,11);
  ctx.fillStyle = '#6b5a45';
  ctx.fillRect(3,9,10,3);
  ctx.fillRect(19,9,10,3);
  ctx.fillStyle = '#5a4a38';
  for(let i=0;i<5;i++) ctx.fillRect(15,5+i*8,2,2);
  // The canvas's own left (small x) lands on the character's own right once mapped onto the body's
  // front face and viewed face-on — confirmed by comparing against the right-sleeve flag patch in a
  // front-view render — so the *character's* left pocket is the second one, at larger x.
  if(rankIndex>0) drawRankBadge(ctx, 24, 14.5, 5, rankIndex);
  return pixelTexture(canvas);
}
// A small US flag patch, sewn-on-sleeve style — just a striped rectangle with a canton block, since
// individual stars would be unreadable at this size (the segment it sits on is 0.2x0.25 units).
function buildFlagPatchTexture(){
  const w=32, h=40;
  const canvas = document.createElement('canvas');
  canvas.width=w; canvas.height=h;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = SHIRT_COLOR_HEX;
  ctx.fillRect(0,0,w,h);
  const px=4, py=6, pw=24, ph=28;
  const stripeH = ph/7;
  for(let i=0;i<7;i++){
    ctx.fillStyle = i%2===0 ? '#b22234' : '#ffffff';
    ctx.fillRect(px, py+i*stripeH, pw, stripeH+0.6);
  }
  ctx.fillStyle = '#3c3b6e';
  ctx.fillRect(px, py, pw*0.45, ph*0.4);
  return pixelTexture(canvas);
}
// Regenerable (the troop number isn't known until the front-page overlay is submitted) — the sleeve
// patch just re-draws the text in army green over the same shirt-colored background each time.
function buildTroopPatchTexture(troop){
  const w=32, h=40;
  const canvas = document.createElement('canvas');
  canvas.width=w; canvas.height=h;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = SHIRT_COLOR_HEX;
  ctx.fillRect(0,0,w,h);
  if(troop){
    ctx.fillStyle = '#4b5320';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = troop.length>3 ? 'bold 11px monospace' : 'bold 14px monospace';
    ctx.fillText(troop, w/2, h/2+1);
  }
  return pixelTexture(canvas);
}
// A rolled neckerchief: a band wrapping the collar, plus its two rolled tails hanging down the front
// side by side rather than one solid triangle — each a thin shaft capped with a small diamond-rotated
// tip (same "rotate a box 45deg to read as a point" trick as the Kayak's bow/stern caps) so it reads
// as two long, sharp-ended strings. Color comes from the front-page picker, so the material is stashed
// on userData for applyUniformCustomization to recolor live without rebuilding the mesh.
function buildNeckerchiefMesh(colorHex){
  const mat = new THREE.MeshLambertMaterial({ color: colorHex });
  const g = new THREE.Group();
  const band = new THREE.Mesh(new THREE.BoxGeometry(0.56,0.12,0.34), mat);
  band.position.set(0, 1.38, 0);
  g.add(band);
  for(const side of [-1,1]){
    const shaft = new THREE.Mesh(new THREE.BoxGeometry(0.09,0.34,0.05), mat);
    shaft.position.set(side*0.08, 1.14, -0.17);
    shaft.rotation.z = side*0.12;
    g.add(shaft);
    const tip = new THREE.Mesh(new THREE.BoxGeometry(0.09,0.09,0.05), mat);
    tip.position.set(side*0.095, 0.95, -0.17);
    tip.rotation.z = Math.PI/4 + side*0.12;
    g.add(tip);
  }
  g.userData.mat = mat;
  return g;
}
// A dark iron belt buckle plate, stamped with a simple black fleur-de-lis-style scout emblem — the
// same generic three-pronged blaze already used for the Troop Flag's own pennant, just black-on-iron
// here instead of pale-on-red.
function buildBuckleTexture(){
  const w=32, h=24;
  const canvas = document.createElement('canvas');
  canvas.width=w; canvas.height=h;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#2a2a2a';
  ctx.fillRect(0,0,w,h);
  for(let i=0;i<40;i++){
    ctx.fillStyle = `rgba(255,255,255,${Math.random()*0.08})`;
    ctx.fillRect(Math.random()*w, Math.random()*h, 1, 1);
  }
  ctx.fillStyle = '#0a0a0a';
  const cx=w/2, cy=h/2;
  ctx.fillRect(cx-1, cy-8, 2, 11);
  ctx.beginPath();
  ctx.moveTo(cx-1, cy-8); ctx.lineTo(cx-6, cy-2); ctx.lineTo(cx-1, cy-2);
  ctx.closePath(); ctx.fill();
  ctx.beginPath();
  ctx.moveTo(cx+1, cy-8); ctx.lineTo(cx+6, cy-2); ctx.lineTo(cx+1, cy-2);
  ctx.closePath(); ctx.fill();
  ctx.fillRect(cx-5, cy+3, 10, 2);
  return pixelTexture(canvas);
}

function createCharacterMesh(shirtColor){
  const group = new THREE.Group();
  // A scout's uniform: short-sleeve khaki shirt, short army green pants, bare arms/legs between
  // them and the socks/shoes below, army green socks, hiking shoes, and a hat.
  const shirtMat = new THREE.MeshLambertMaterial({ color: shirtColor!==undefined ? shirtColor : 0xa89272 });
  const pantsMat = new THREE.MeshLambertMaterial({ color: 0x4b5320 });
  const sockMat = new THREE.MeshLambertMaterial({ color: 0x4b5320 });
  const shoeMat = new THREE.MeshLambertMaterial({ color: 0x4a3728 });
  const hatMat = new THREE.MeshLambertMaterial({ color: 0x4b5320 });

  function box(w,h,d,mat,pivotTop){
    const geo = new THREE.BoxGeometry(w,h,d);
    if(pivotTop) geo.translate(0,-h/2,0);
    return new THREE.Mesh(geo, mat);
  }
  // Stacks segments (top to bottom) into a group pivoted at the very top (the shoulder or hip), so
  // the existing walk-swing animation — which just rotates this group around its own origin — still
  // swings every segment together as one rigid limb, exactly like the single-box limbs this replaced.
  function makeLimb(w,d,segments){
    const g = new THREE.Group();
    let y = 0;
    for(const seg of segments){
      const mesh = box(w, seg.h, d, seg.mat);
      mesh.position.set(0, y-seg.h/2, 0);
      g.add(mesh);
      y -= seg.h;
    }
    return g;
  }

  const head = new THREE.Mesh(new THREE.BoxGeometry(0.5,0.5,0.5), headMaterials);
  head.position.set(0, 1.55, 0);
  const body = box(0.5,0.75,0.28, shirtMat);
  body.position.set(0, 1.05, 0);
  // Front (-z) face only gets the pockets/buttons texture — same per-face-array trick as the head.
  const initialRankIndex = rankIndexFor(earnedBadges.size);
  const shirtFrontMat = new THREE.MeshLambertMaterial({ map: buildShirtFrontTexture(initialRankIndex) });
  body.material = [shirtMat, shirtMat, shirtMat, shirtMat, shirtMat, shirtFrontMat];
  // Short sleeve up top, bare arm (skin) the rest of the way down.
  const armL = makeLimb(0.2,0.2, [{h:0.25,mat:shirtMat},{h:0.45,mat:skinMaterial}]);
  armL.position.set(-0.35, 1.4, 0);
  const armR = makeLimb(0.2,0.2, [{h:0.25,mat:shirtMat},{h:0.45,mat:skinMaterial}]);
  armR.position.set(0.35, 1.4, 0);
  // Flag patch on the right sleeve's outer face, troop number on the left's — the arms sit at
  // x=+-0.35 with no rotation, so "outer" is +x for the right arm (material index 0) and -x for the
  // left (index 1). Only the top (shirt-colored) segment of each sleeve carries a patch.
  const flagPatchMat = new THREE.MeshLambertMaterial({ map: buildFlagPatchTexture() });
  const troopPatchMat = new THREE.MeshLambertMaterial({ map: buildTroopPatchTexture(myTroop) });
  const rightSleeveTop = armR.children[0], leftSleeveTop = armL.children[0];
  rightSleeveTop.material = [flagPatchMat, shirtMat, shirtMat, shirtMat, shirtMat, shirtMat];
  leftSleeveTop.material = [shirtMat, troopPatchMat, shirtMat, shirtMat, shirtMat, shirtMat];
  const neckerchief = buildNeckerchiefMesh(myNeckerchiefColor);
  // A blue backpack worn on the back — flush against the torso box's rear (+z) face, opposite the
  // front-face pocket/button texture and the neckerchief hanging over the front.
  const backpackMat = new THREE.MeshLambertMaterial({ color: 0x2a5ca8 });
  const backpack = box(0.36, 0.48, 0.2, backpackMat);
  backpack.position.set(0, 1.05, 0.24);
  const backpackFlapMat = new THREE.MeshLambertMaterial({ color: 0x1f4783 });
  const backpackFlap = box(0.3, 0.14, 0.03, backpackFlapMat);
  backpackFlap.position.set(0, 1.22, 0.35);
  // Army green belt right at the shirt/pants seam — slightly wider and deeper than the torso so it
  // visibly wraps over it rather than looking flush-inset — with a dark iron buckle stamped with a
  // black scout emblem centered on the front face.
  const beltMat = new THREE.MeshLambertMaterial({ color: 0x3d4a1f });
  const belt = box(0.54, 0.09, 0.32, beltMat);
  belt.position.set(0, 0.68, 0);
  const buckleMat = new THREE.MeshLambertMaterial({ map: buildBuckleTexture() });
  const buckle = box(0.16, 0.11, 0.02, buckleMat);
  buckle.position.set(0, 0.68, -0.17);
  // Short pants up top, bare leg (skin) through the knee/shin, a short sock, then a hiking shoe.
  const legSegments = [{h:0.20,mat:pantsMat},{h:0.30,mat:skinMaterial},{h:0.10,mat:sockMat},{h:0.10,mat:shoeMat}];
  const legL = makeLimb(0.22,0.22, legSegments);
  legL.position.set(-0.14, 0.7, 0);
  const legR = makeLimb(0.22,0.22, legSegments);
  legR.position.set(0.14, 0.7, 0);
  // A wide-brimmed scout hat rather than a baseball cap — the crown sinks down over the top of the
  // head instead of stacking a full extra block above it (so it sits low enough to clear the name
  // tag floating above), and the brim extends evenly on every side, not just a front bill. Both are
  // wider than the head itself (0.5) — a worn hat should read as bigger than the head under it, not
  // smaller — while keeping the same heights/vertical position that clear the eyes and name tag.
  const hatCrown = box(0.58,0.16,0.58, hatMat);
  hatCrown.position.set(0, 1.78, 0);
  const hatBrim = box(0.9,0.05,0.9, hatMat);
  hatBrim.position.set(0, 1.675, 0);

  group.add(head, body, armL, armR, legL, legR, hatCrown, hatBrim, neckerchief, backpack, backpackFlap, belt, buckle);
  group.userData.parts = { armL, armR, legL, legR };
  // Stashed so applyUniformCustomization can update the troop number / neckerchief color live, after
  // the front-page overlay is actually submitted, without rebuilding this whole mesh.
  group.userData.uniform = { troopPatchMat, neckerchief, backpack, shirtFrontMat, lastRankIndex: initialRankIndex };
  group.traverse(o => { if(o.isMesh){ o.castShadow = true; } });
  return group;
}
// Re-applies the troop number and neckerchief color chosen on the front-page overlay — called once,
// right when the player actually clicks/taps to start, since createCharacterMesh() itself already ran
// during init() using whatever was last saved (or the defaults, for a first-time player).
function applyUniformCustomization(charGroup, troop, neckerchiefColorHex){
  const u = charGroup && charGroup.userData.uniform;
  if(!u) return;
  const newTex = buildTroopPatchTexture(troop);
  u.troopPatchMat.map = newTex;
  u.troopPatchMat.needsUpdate = true;
  u.neckerchief.userData.mat.color.set(neckerchiefColorHex);
}
function animateWalk(group, state, dt, moving, sprinting){
  state.amp += ((moving?1:0) - state.amp) * Math.min(1, dt*8);
  state.phase += dt * (sprinting ? 11 : 7);
  const swing = Math.sin(state.phase) * 0.6 * state.amp;
  const { armL, armR, legL, legR } = group.userData.parts;
  armR.rotation.x = swing;
  legL.rotation.x = swing;
  armL.rotation.x = -swing;
  legR.rotation.x = -swing;
}
// ---------- Floating name/HP tag (drawn on a canvas, shown as a billboard sprite above the head) ----------
function buildNameTagCanvas(name, badgeCount){
  const rankIndex = rankIndexFor(badgeCount);
  const rankName = RANKS[rankIndex].name;
  const canvas = document.createElement('canvas');
  canvas.width = 256; canvas.height = 64;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = 'rgba(0,0,0,0.45)';
  ctx.fillRect(2,2,252,60);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 24px sans-serif';
  ctx.fillText(name, 128, 28);
  // Rank badge + name, centered together as one unit — the badge sized/measured against the text
  // width so it never looks off-center regardless of how long the rank name is.
  ctx.font = '18px sans-serif';
  ctx.fillStyle = '#f0dfa8';
  const badgeD = 20, gap = 6;
  const textW = ctx.measureText(rankName).width;
  const startX = 128 - (badgeD+gap+textW)/2;
  drawRankBadge(ctx, startX+badgeD/2, 50, badgeD/2, rankIndex);
  ctx.textAlign = 'left';
  ctx.fillText(rankName, startX+badgeD+gap, 56);
  return canvas;
}
function createNameTagSprite(){
  const tex = new THREE.CanvasTexture(buildNameTagCanvas('', 0));
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true }));
  sprite.scale.set(1.6, 0.4, 1);
  sprite.position.set(0, 2.05, 0);
  return { sprite, tex, lastKey: null };
}
function updateNameTag(tag, name, badgeCount){
  const key = name + ':' + badgeCount;
  if(tag.lastKey === key) return;
  tag.lastKey = key;
  const canvas = buildNameTagCanvas(name, badgeCount);
  tag.tex.dispose();
  tag.tex = new THREE.CanvasTexture(canvas);
  tag.sprite.material.map = tag.tex;
  tag.sprite.material.needsUpdate = true;
}

// ---------- Animal models (blocky quadrupeds, with procedurally-drawn hide textures) ----------
function fillTileSized(ctx,size,baseHex){ ctx.fillStyle = rgbStr(...hexRGB(baseHex)); ctx.fillRect(0,0,size,size); }
function speckleSized(ctx,size,baseHex,count,jitter){
  for(let i=0;i<count;i++){
    const px=Math.floor(Math.random()*size), py=Math.floor(Math.random()*size);
    ctx.fillStyle = shadeStr(baseHex, 0.8+Math.random()*0.4, jitter||0);
    ctx.fillRect(px,py,1,1);
  }
}
function blobPatch(ctx,x,y,w,h){
  [[0.5,0.5,0.5,0.5],[0.2,0.3,0.32,0.32],[0.75,0.65,0.3,0.32]].forEach(([cx,cy,rw,rh])=>{
    ctx.beginPath();
    ctx.ellipse(x+w*cx, y+h*cy, w*rw, h*rh, 0, 0, Math.PI*2);
    ctx.fill();
  });
}
function buildHideTexture(drawFn){
  const size = 32;
  const canvas = document.createElement('canvas');
  canvas.width = size; canvas.height = size;
  drawFn(canvas.getContext('2d'), size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  return tex;
}
const ANIMAL_HIDE = {
  rabbit: buildHideTexture((ctx,size)=>{
    fillTileSized(ctx,size,0xcfc0a6);
    for(let i=0;i<22;i++){
      const x=Math.random()*size, y=Math.random()*size, r=1.2+Math.random()*1.4;
      ctx.fillStyle = shadeStr(0xcfc0a6, 0.8+Math.random()*0.35, 6);
      ctx.beginPath(); ctx.arc(x,y,r,0,Math.PI*2); ctx.fill();
    }
  }),
  squirrel: buildHideTexture((ctx,size)=>{
    fillTileSized(ctx,size,0xb0764a);
    speckleSized(ctx,size,0xb0764a,35,8);
  }),
  deer: buildHideTexture((ctx,size)=>{
    fillTileSized(ctx,size,0xa9713f);
    speckleSized(ctx,size,0xa9713f,45,10);
  }),
  bear: buildHideTexture((ctx,size)=>{
    fillTileSized(ctx,size,0x2b211a);
    speckleSized(ctx,size,0x2b211a,50,8);
  }),
  moose: buildHideTexture((ctx,size)=>{
    fillTileSized(ctx,size,0x4a3524);
    speckleSized(ctx,size,0x4a3524,40,8);
    ctx.strokeStyle = 'rgba(20,15,10,0.25)';
    for(let i=0;i<4;i++){
      const y = Math.random()*size;
      ctx.beginPath();
      ctx.moveTo(0,y);
      ctx.bezierCurveTo(size*0.3,y+Math.random()*5-2.5, size*0.7,y+Math.random()*5-2.5, size,y);
      ctx.stroke();
    }
  }),
};
const ANIMAL_HIDE_MAT = {};
for(const type of ANIMAL_TYPES) ANIMAL_HIDE_MAT[type] = new THREE.MeshLambertMaterial({ map: ANIMAL_HIDE[type] });

function animalBox(w,h,d,colorOrMat){
  const mat = (colorOrMat instanceof THREE.Material) ? colorOrMat : new THREE.MeshLambertMaterial({ color: colorOrMat });
  return new THREE.Mesh(new THREE.BoxGeometry(w,h,d), mat);
}
function makeQuadruped(opts){
  const g = new THREE.Group();
  const legH = opts.bodyY - opts.bodyH/2;
  const body = animalBox(opts.bodyW, opts.bodyH, opts.bodyD, opts.bodyMat);
  body.position.set(0, opts.bodyY, 0);
  g.add(body);

  const lx = opts.bodyW/2 - opts.legW*0.8;
  const lz = opts.bodyD/2 - opts.legW*0.8;
  const legMat = opts.legMat || opts.bodyMat;
  const legPositions = [[-lx,-lz],[lx,-lz],[-lx,lz],[lx,lz]]; // FL, FR, BL, BR (forward = -Z)
  const legs = legPositions.map(([px,pz])=>{
    const leg = animalBox(opts.legW, legH, opts.legW, legMat);
    leg.geometry.translate(0,-legH/2,0);
    leg.position.set(px, legH, pz);
    g.add(leg);
    return leg;
  });

  const head = animalBox(opts.headW, opts.headH, opts.headD, opts.headMat || opts.bodyMat);
  head.position.set(0, opts.headY, opts.headZ);
  g.add(head);

  if(opts.extras) opts.extras(g, { body, head, legs });

  g.userData.legs = legs;
  return g;
}
const ANIMAL_BUILDERS = {
  rabbit(){
    const hide = ANIMAL_HIDE_MAT.rabbit;
    return makeQuadruped({
      bodyW:0.34, bodyH:0.24, bodyD:0.3, bodyY:0.22, bodyMat:hide,
      legW:0.06,
      headW:0.18, headH:0.18, headD:0.18, headY:0.32, headZ:-0.16,
      extras(g){
        const earL=animalBox(0.05,0.22,0.04,hide); earL.position.set(-0.05,0.5,-0.14); earL.rotation.x=-0.15; g.add(earL);
        const earR=animalBox(0.05,0.22,0.04,hide); earR.position.set(0.05,0.5,-0.14); earR.rotation.x=-0.15; g.add(earR);
        const tail=animalBox(0.08,0.08,0.08,0xffffff); tail.position.set(0,0.26,0.16); g.add(tail);
      },
    });
  },
  squirrel(){
    const hide = ANIMAL_HIDE_MAT.squirrel;
    return makeQuadruped({
      bodyW:0.24, bodyH:0.2, bodyD:0.36, bodyY:0.16, bodyMat:hide,
      legW:0.05,
      headW:0.16, headH:0.15, headD:0.16, headY:0.24, headZ:-0.2,
      extras(g){
        const earL=animalBox(0.05,0.06,0.03,hide); earL.position.set(-0.05,0.34,-0.2); g.add(earL);
        const earR=animalBox(0.05,0.06,0.03,hide); earR.position.set(0.05,0.34,-0.2); g.add(earR);
        // Bushy tail: three stacked segments curling up and forward over the back.
        const t1=animalBox(0.09,0.09,0.12,hide); t1.position.set(0,0.22,0.22); g.add(t1);
        const t2=animalBox(0.1,0.11,0.1,hide); t2.position.set(0,0.34,0.24); g.add(t2);
        const t3=animalBox(0.1,0.12,0.09,hide); t3.position.set(0,0.44,0.18); g.add(t3);
      },
    });
  },
  deer(){
    const hide = ANIMAL_HIDE_MAT.deer;
    return makeQuadruped({
      bodyW:0.55, bodyH:0.45, bodyD:0.85, bodyY:0.85, bodyMat:hide,
      legW:0.09,
      headW:0.22, headH:0.24, headD:0.3, headY:1.05, headZ:-0.55,
      extras(g){
        const earL=animalBox(0.05,0.14,0.1,hide); earL.position.set(-0.13,1.18,-0.5); earL.rotation.z=0.4; g.add(earL);
        const earR=animalBox(0.05,0.14,0.1,hide); earR.position.set(0.13,1.18,-0.5); earR.rotation.z=-0.4; g.add(earR);
        const tail=animalBox(0.08,0.1,0.08,0xffffff); tail.position.set(0,0.9,0.42); g.add(tail);
        // Antlers: a short main beam per side with one forward tine — deliberately blocky, like everything else here.
        const beamL=animalBox(0.04,0.32,0.04,0x8a6a44); beamL.position.set(-0.1,1.34,-0.55); beamL.rotation.z=0.35; g.add(beamL);
        const beamR=animalBox(0.04,0.32,0.04,0x8a6a44); beamR.position.set(0.1,1.34,-0.55); beamR.rotation.z=-0.35; g.add(beamR);
        const tineL=animalBox(0.04,0.16,0.04,0x8a6a44); tineL.position.set(-0.2,1.48,-0.48); tineL.rotation.z=-0.5; g.add(tineL);
        const tineR=animalBox(0.04,0.16,0.04,0x8a6a44); tineR.position.set(0.2,1.48,-0.48); tineR.rotation.z=0.5; g.add(tineR);
      },
    });
  },
  bear(){
    const hide = ANIMAL_HIDE_MAT.bear;
    return makeQuadruped({
      bodyW:0.8, bodyH:0.62, bodyD:0.55, bodyY:0.55, bodyMat:hide,
      legW:0.16,
      headW:0.3, headH:0.28, headD:0.3, headY:0.62, headZ:-0.46,
      extras(g){
        const earL=animalBox(0.08,0.08,0.05,hide); earL.position.set(-0.11,0.8,-0.42); g.add(earL);
        const earR=animalBox(0.08,0.08,0.05,hide); earR.position.set(0.11,0.8,-0.42); g.add(earR);
        const snout=animalBox(0.16,0.12,0.14,0x3a2c22); snout.position.set(0,0.56,-0.62); g.add(snout);
        const hump=animalBox(0.5,0.2,0.3,hide); hump.position.set(0,0.86,0.05); g.add(hump);
        const tail=animalBox(0.08,0.08,0.06,hide); tail.position.set(0,0.5,0.3); g.add(tail);
      },
    });
  },
  moose(){
    const hide = ANIMAL_HIDE_MAT.moose;
    return makeQuadruped({
      bodyW:0.75, bodyH:0.65, bodyD:0.55, bodyY:1.6, bodyMat:hide,
      legW:0.2,
      headW:0.3, headH:0.34, headD:0.5, headY:2.15, headZ:-0.5,
      extras(g){
        const hump=animalBox(0.5,0.25,0.3,hide); hump.position.set(0,2.0,0.05); g.add(hump);
        const muzzle=animalBox(0.24,0.2,0.3,hide); muzzle.position.set(0,2.02,-0.75); g.add(muzzle);
        const dewlap=animalBox(0.08,0.22,0.08,hide); dewlap.position.set(0,1.9,-0.55); g.add(dewlap);
        const earL=animalBox(0.06,0.16,0.12,hide); earL.position.set(-0.17,2.28,-0.42); g.add(earL);
        const earR=animalBox(0.06,0.16,0.12,hide); earR.position.set(0.17,2.28,-0.42); g.add(earR);
        // Paddle antlers: a short beam flaring into a wide flat palm on each side.
        const beamL=animalBox(0.05,0.05,0.3,0x5a4530); beamL.position.set(-0.12,2.5,-0.5); beamL.rotation.y=0.5; g.add(beamL);
        const beamR=animalBox(0.05,0.05,0.3,0x5a4530); beamR.position.set(0.12,2.5,-0.5); beamR.rotation.y=-0.5; g.add(beamR);
        const palmL=animalBox(0.35,0.05,0.28,0x5a4530); palmL.position.set(-0.32,2.55,-0.62); palmL.rotation.y=0.5; g.add(palmL);
        const palmR=animalBox(0.35,0.05,0.28,0x5a4530); palmR.position.set(0.32,2.55,-0.62); palmR.rotation.y=-0.5; g.add(palmR);
      },
    });
  },
};
// Original bodyY (quadrupeds) / hip height (bipeds) each model was designed at, before rescaling.
const ANIMAL_ORIGINAL_BODY_Y = {
  rabbit:0.22, squirrel:0.16, deer:0.85, bear:0.55, moose:1.6,
};
const ANIMAL_SCALE = {};
for(const type of ANIMAL_TYPES) ANIMAL_SCALE[type] = ANIMAL_REAL_HEIGHT[type] / ANIMAL_ORIGINAL_BODY_Y[type];
function createAnimalMesh(type){
  const mesh = ANIMAL_BUILDERS[type]();
  mesh.scale.setScalar(ANIMAL_SCALE[type]);
  mesh.traverse(o => { if(o.isMesh){ o.castShadow = true; } });
  return mesh;
}
function animateQuadrupedWalk(group, state, dt, moving, speedMul){
  state.amp += ((moving?1:0) - state.amp) * Math.min(1, dt*8);
  state.phase += dt * 6 * (speedMul||1);
  const swing = Math.sin(state.phase) * 0.5 * state.amp;
  const [fl,fr,bl,br] = group.userData.legs;
  fl.rotation.x = swing;  br.rotation.x = swing;
  fr.rotation.x = -swing; bl.rotation.x = -swing;
}

// ---------- Animal AI ----------
const animals = [];
// Ground for animals excludes tree material (WOOD/LEAVES) so they never end up standing in a
// tree's trunk or canopy — only natural terrain and player-built blocks count as "ground".
function isAnimalGround(b){ return b!==AIR && b!==WATER && b!==WOOD && b!==LEAVES && b!==WINDOW_OPEN && b!==DOOR_OPEN && b!==SAPLING && b!==FIRE && b!==TORCH && b!==LANTERN && b!==FLAG && b!==FLAG_POLE; }
function groundHeightAt(x,z){
  const bx=Math.floor(x), bz=Math.floor(z);
  for(let y=WORLD_HEIGHT-1;y>=0;y--){
    if(isAnimalGround(getBlock(bx,y,bz))) return y+1;
  }
  return 1;
}
// Surface height of the topmost WATER block in this column, or null if there's none — lets a land
// animal that's wandered out over its depth float there instead of walking the submerged lake bed
// groundHeightAt alone would put it on (groundHeightAt ignores water entirely, on purpose, so it can
// find the real ground beneath it).
function waterSurfaceAt(x,z){
  const bx=Math.floor(x), bz=Math.floor(z);
  for(let y=WORLD_HEIGHT-1;y>=0;y--){
    if(getBlock(bx,y,bz)===WATER) return y+1;
  }
  return null;
}
const SPAWN_COUNTS = { deer:5, bear:1, rabbit:10, squirrel:10, moose:1 };
function findSpawnSpot(seedX, seedZ){
  let x,z,h,tries=0;
  do{
    const hx = seedX!=null ? hash2(seedX+tries*0.37, seedZ) : Math.random();
    const hz = seedX!=null ? hash2(seedX, seedZ+tries*0.53) : Math.random();
    x = 4 + Math.floor(hx*(WORLD_SIZE-8));
    z = 4 + Math.floor(hz*(WORLD_SIZE-8));
    h = heightAt(x,z);
    tries++;
  } while((h<=SEA_LEVEL || getBlock(x,h,z)!==GRASS || getBlock(x,h+1,z)!==AIR) && tries<30);
  return {x,z};
}
function addAnimal(type, id, spot, yawSeed){
  const stats = ANIMAL_STATS[type];
  const mesh = createAnimalMesh(type);
  const gy = groundHeightAt(spot.x+0.5, spot.z+0.5);
  mesh.position.set(spot.x+0.5, gy, spot.z+0.5);
  scene.add(mesh);
  const a = {
    id, type, mesh,
    hp: stats.maxHp, maxHp: stats.maxHp,
    x:spot.x+0.5, y:gy, z:spot.z+0.5, yaw: (yawSeed!=null ? yawSeed : Math.random())*Math.PI*2,
    wanderTimer: Math.random()*2, target:null,
    aggroUntil:0, attackCooldown:0, walk:{phase:0,amp:0}, wasAggro:false, swimming:false, fleeUntil:0,
    lastReproducedAt: Date.now(),
  };
  animals.push(a);
  return a;
}
function spawnAnimals(){
  let idx=0;
  for(const type of ANIMAL_TYPES){
    for(let i=0;i<SPAWN_COUNTS[type];i++){
      const spot = findSpawnSpot(idx*7.13+1.7, idx*11.3+2.9);
      addAnimal(type, type+'_'+idx, spot, hash2(idx*2.1,idx*5.7));
      idx++;
    }
  }
}
let respawnCheckTimer = 8;
function newRespawnId(type){
  return type+'_r'+Math.random().toString(36).slice(2,10);
}
function updateRespawns(dt){
  respawnCheckTimer -= dt;
  if(respawnCheckTimer>0) return;
  respawnCheckTimer = 8; // check periodically, replace at most one missing animal per type each time
  for(const type of ANIMAL_TYPES){
    const alive = animals.reduce((n,a)=> a.type===type ? n+1 : n, 0);
    if(alive < SPAWN_COUNTS[type]){
      addAnimal(type, newRespawnId(type), findSpawnSpot());
      break; // one new animal per check keeps respawns feeling gradual, not a sudden burst
    }
  }
}
function updateAnimal(a, dt){
  const stats = ANIMAL_STATS[a.type];
  a.attackCooldown = Math.max(0, a.attackCooldown - dt);

  const dxp = player.pos.x - a.x, dzp = player.pos.z - a.z;
  const distToPlayer = Math.hypot(dxp,dzp);
  const now = performance.now();

  const fleeing = now < a.fleeUntil;
  let isAggro = false;
  if(!fleeing){
    if(stats.aggressive && distToPlayer < AGGRO_RADIUS) a.aggroUntil = Math.max(a.aggroUntil, now + 1500);
    isAggro = now < a.aggroUntil && distToPlayer < DEAGGRO_RADIUS;
    if(isAggro && !a.wasAggro && a.type==='bear') SFX.roar();
  }
  a.wasAggro = isAggro;

  let moving = false;
  if(fleeing){
    // Scared off by the Stop Bear function (see scareBearsNear below) — run straight away from the
    // player, overriding aggro/wander entirely until the fright wears off. Clearing aggroUntil too
    // means it doesn't just spin around and resume the charge the instant the fright ends.
    a.aggroUntil = 0;
    if(distToPlayer > 0.05 && distToPlayer < DEAGGRO_RADIUS*2){
      const nx = -dxp/distToPlayer, nz = -dzp/distToPlayer;
      a.yaw = Math.atan2(-nx, -nz);
      stepAnimal(a, nx*stats.chaseSpeed*dt, nz*stats.chaseSpeed*dt);
      moving = true;
    }
  } else if(isAggro){
    if(distToPlayer > 0.05){
      const nx = dxp/distToPlayer, nz = dzp/distToPlayer;
      a.yaw = Math.atan2(-nx, -nz);
      const attackRange = ATTACK_RANGE*0.4 + stats.reach;
      // Horizontal-only on its own has no ceiling on height at all — a player passing directly over an
      // animal (e.g. riding a Giant Eagle high overhead) would read as "close enough" purely because
      // dx/dz are small, letting ground animals hit a player who's nowhere near them vertically. Capping
      // the vertical gap to the same generous attackRange keeps the original fix (a short ledge or a
      // couple steps into deep water is still in reach) while ruling out anything actually far overhead.
      const dyp = player.pos.y - a.y;
      if(distToPlayer <= attackRange && Math.abs(dyp) <= attackRange){
        // Close enough by the ordinary walk-up rule — same as always.
        if(a.attackCooldown<=0){ damagePlayer(stats.dmg, a.type); a.attackCooldown = 1.1; }
      } else if(animalStepBlocked(a.x+nx*0.3, a.z+nz*0.3, a.y)){
        // Can't actually step any closer along the ground — a real height drop (deep water, a ledge,
        // a low wall) is in the way, not just "hasn't walked over yet." Previously this meant the
        // animal just got stuck pacing at the edge forever, unable to ever close enough for the plain
        // horizontal check above to pass, so a player standing just past any such edge was permanently
        // safe regardless of how close that edge actually put them. Now, still blocked, it can lunge:
        // if the player is within a generous pounce range measured in real 3D space (so a large height
        // gap — well up a cliff — still keeps them out of reach, while a short elevated ledge or a
        // couple steps into deeper water doesn't), it reaches out and lands a hit from where it stands.
        const distToPlayer3D = Math.hypot(dxp, dyp, dzp);
        if(distToPlayer3D <= attackRange + ANIMAL_LUNGE_RANGE && a.attackCooldown<=0){
          damagePlayer(stats.dmg, a.type);
          a.attackCooldown = 1.1;
        }
      } else {
        stepAnimal(a, nx*stats.chaseSpeed*dt, nz*stats.chaseSpeed*dt);
        moving = true;
      }
    }
  } else {
    a.wanderTimer -= dt;
    if(a.wanderTimer<=0){
      a.wanderTimer = 2+Math.random()*3;
      a.target = Math.random()<0.6
        ? { x:a.x+(Math.random()*2-1)*3, z:a.z+(Math.random()*2-1)*3 }
        : null;
    }
    if(a.target){
      const tdx=a.target.x-a.x, tdz=a.target.z-a.z, td=Math.hypot(tdx,tdz);
      if(td>0.15){
        const nx=tdx/td, nz=tdz/td;
        a.yaw = Math.atan2(-nx,-nz);
        stepAnimal(a, nx*stats.speed*dt*0.5, nz*stats.speed*dt*0.5);
        moving = true;
      } else a.target = null;
    }
  }

  a.x = Math.max(1, Math.min(WORLD_SIZE-1, a.x));
  a.z = Math.max(1, Math.min(WORLD_SIZE-1, a.z));
  const groundY = groundHeightAt(a.x, a.z);
  const waterTop = waterSurfaceAt(a.x, a.z);
  const realH = ANIMAL_REAL_HEIGHT[a.type] || 0.8;
  // Deep enough that walking the real lake bed would put most of the animal underwater — float and
  // paddle at the surface instead, rather than the "invisible, strolling along the bottom" look
  // groundY alone would give it. Shallow water (a stream, a pond's edge) still just wades normally.
  a.swimming = waterTop!==null && (waterTop-groundY) > realH*0.6;
  a.y = a.swimming ? waterTop - realH*0.4 : groundY;

  a.mesh.position.set(a.x, a.y, a.z);
  a.mesh.rotation.y = a.yaw;
  animateQuadrupedWalk(a.mesh, a.walk, dt, moving, isAggro?1.6:1);

  // Reproduction: check for nearby animals of the same type
  const nowMs = Date.now();
  if(nowMs - a.lastReproducedAt >= ANIMAL_REPRODUCE_INTERVAL_MS){
    for(const other of animals){
      if(other.type!==a.type || other===a) continue;
      const dx = other.x-a.x, dz = other.z-a.z;
      if(Math.hypot(dx,dz) < ANIMAL_REPRODUCE_RANGE){
        a.lastReproducedAt = nowMs;
        other.lastReproducedAt = nowMs; // both animals just reproduced
        // Spawn a baby animal at the midpoint
        const babyX = (a.x+other.x)/2, babyZ = (a.z+other.z)/2;
        addAnimal(a.type, newRespawnId(a.type), {x:babyX,z:babyZ});
        break; // one reproduction per update pass per animal
      }
    }
  }
}
function updateAnimals(dt){ animals.forEach(a=>updateAnimal(a,dt)); }
const STOP_BEAR_RADIUS = 8;      // a bit past AGGRO_RADIUS, so it can interrupt one already charging
const STOP_BEAR_FLEE_MS = 6000;
// Shouting and clapping at any bear close enough to hear it — see the Stop Bear quick-access icon.
// Returns how many bears actually got scared, so the caller can react if there weren't any nearby.
function scareBearsNear(x, z, radius){
  let scared = 0;
  for(const a of animals){
    if(a.type!=='bear') continue;
    if(Math.hypot(a.x-x, a.z-z) > radius) continue;
    a.fleeUntil = performance.now() + STOP_BEAR_FLEE_MS;
    scared++;
  }
  return scared;
}
function killAnimal(a){
  scene.remove(a.mesh);
  const i = animals.indexOf(a);
  if(i>=0) animals.splice(i,1);
}
let lastAnimalWarningAt = 0;
const ANIMAL_WARNING_COOLDOWN_MS = 5000;
function damageAnimal(a, dmg){
  // Checked before retaliate below updates aggroUntil, so this reflects whether the animal was
  // already hostile BEFORE this hit — a Scout fighting off a charging bear isn't the same as
  // picking a fight with a calm one, so only the latter gets the nudge (same "nudge, not a rule"
  // spirit as the living-tree warning: it never blocks the attack, just names the ethic).
  const wasHostile = performance.now() < a.aggroUntil;
  a.hp = Math.max(0, a.hp - dmg);
  const stats = ANIMAL_STATS[a.type];
  if(stats.retaliate) a.aggroUntil = performance.now() + RETALIATE_MS;
  if(!wasHostile && Date.now()-lastAnimalWarningAt >= ANIMAL_WARNING_COOLDOWN_MS){
    lastAnimalWarningAt = Date.now();
    addChatMessage('Camp', "🦌 A real Scout leaves wildlife alone — only fight an animal that's already attacking you.");
  }
  if(a.hp<=0){
    SFX.animalDeath();
    invAdd(MEAT, MEAT_YIELD[a.type] || 1);
    saveInventory();
    updateHotbarUI();
    killAnimal(a);
  }
}
// awardMeat defaults true (the player landed the hit, via tryAttack below) — a big eagle eating a
// bird or fish passes false, same reasoning as killWorm's reason string: only a kill the player
// actually delivers should ever put Meat in their inventory.
function damageBirdOrFish(entity, dmg, type, awardMeat){
  if(awardMeat===undefined) awardMeat = true;
  entity.hp = Math.max(0, entity.hp - dmg);
  if(entity.hp<=0){
    SFX.animalDeath();
    if(awardMeat){
      const speciesId = entity.species.id;
      invAdd(MEAT, MEAT_YIELD[speciesId] || 1);
      saveInventory();
      updateHotbarUI();
    }
    scene.remove(entity.mesh);
    const arr = type==='bird' ? birds : fish;
    const idx = arr.indexOf(entity);
    if(idx>=0) arr.splice(idx, 1);
  }
}
function damageGopher(gopher, dmg){
  gopher.hp = Math.max(0, gopher.hp - dmg);
  if(gopher.hp<=0){
    SFX.animalDeath();
    invAdd(MEAT, MEAT_YIELD.gopher || 2);
    saveInventory();
    updateHotbarUI();
    scene.remove(gopher.mesh);
    const idx = gophers.indexOf(gopher);
    if(idx>=0) gophers.splice(idx, 1);
  }
}
function damageBigEagle(eagle, dmg){
  eagle.hp = Math.max(0, eagle.hp - dmg);
  if(eagle.hp<=0){
    SFX.animalDeath();
    invAdd(MEAT, MEAT_YIELD.bigeagle || 3);
    saveInventory();
    updateHotbarUI();
    scene.remove(eagle.mesh);
    const idx = bigEagles.indexOf(eagle);
    if(idx>=0) bigEagles.splice(idx, 1);
  }
}
function damageTurtle(turtle, dmg){
  turtle.hp = Math.max(0, turtle.hp - dmg);
  if(turtle.hp<=0){
    SFX.animalDeath();
    invAdd(MEAT, MEAT_YIELD[turtle.species.id] || 1);
    saveInventory();
    updateHotbarUI();
    scene.remove(turtle.mesh);
    const idx = turtles.indexOf(turtle);
    if(idx>=0) turtles.splice(idx, 1);
  }
}
// ---------- Sound effects (synthesized with Web Audio, no audio files needed) ----------
let audioCtx = null;
function ensureAudio(){
  if(!audioCtx){
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if(!Ctx) return null;
    audioCtx = new Ctx();
  }
  if(audioCtx.state==='suspended') audioCtx.resume();
  return audioCtx;
}
function playTone(freq, duration, type, volume, freqEnd, attack){
  const ctx = ensureAudio();
  if(!ctx) return;
  const now = ctx.currentTime;
  const a = attack!=null ? attack : 0.008; // tiny attack ramp avoids a harsh click at note-on
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type || 'sine';
  osc.frequency.setValueAtTime(freq, now);
  if(freqEnd) osc.frequency.exponentialRampToValueAtTime(Math.max(freqEnd,1), now+duration);
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(volume||0.2, now+a);
  gain.gain.exponentialRampToValueAtTime(0.001, now+duration);
  osc.connect(gain).connect(ctx.destination);
  osc.start(now);
  osc.stop(now+duration);
}
function playNoise(duration, volume, filterFreq, attack){
  const ctx = ensureAudio();
  if(!ctx) return;
  const now = ctx.currentTime;
  const bufferSize = Math.max(1, Math.floor(ctx.sampleRate*duration));
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for(let i=0;i<bufferSize;i++) data[i] = (Math.random()*2-1) * (1 - i/bufferSize);
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = filterFreq || 1500;
  const gain = ctx.createGain();
  const a = attack!=null ? attack : 0.004;
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.linearRampToValueAtTime(volume||0.3, now+a);
  src.connect(filter).connect(gain).connect(ctx.destination);
  src.start(now);
}
// Real recording (public domain, see assets/README.md) for the lion roar — loaded once up front,
// falls back to a synthesized growl if the file can't be fetched/decoded.
// offset: where in the source file playback starts each time (seconds) — lets a clip player pull a
// short clean moment out of a much longer recording (see firework-burst below) without needing to
// re-encode a separate trimmed file.
function makeClipPlayer(url, defaultClipDuration, tailFade, offset){
  let buffer = null;
  const startOffset = offset || 0;
  function load(){
    fetch(url)
      .then(r => { if(!r.ok) throw new Error('http '+r.status); return r.arrayBuffer(); })
      .then(buf => {
        const ctx = ensureAudio();
        if(!ctx) throw new Error('no audio context');
        return new Promise((resolve,reject) => ctx.decodeAudioData(buf, resolve, reject));
      })
      .then(decoded => { buffer = decoded; })
      .catch(() => {});
  }
  function play(clipDuration, volume){
    const ctx = ensureAudio();
    if(!ctx || !buffer) return false;
    const now = ctx.currentTime;
    const dur = Math.min(clipDuration!=null ? clipDuration : defaultClipDuration, buffer.duration-startOffset);
    const fade = tailFade!=null ? tailFade : 0.3;
    const fadeIn = 0.04; // avoids a click when starting mid-file (offset>0)
    const vol = volume!=null ? volume : 0.8;
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(vol, now+fadeIn);
    gain.gain.setValueAtTime(vol, now + Math.max(fadeIn, dur-fade));
    gain.gain.linearRampToValueAtTime(0.0001, now + dur);
    src.connect(gain).connect(ctx.destination);
    src.start(now, startOffset, dur);
    return true;
  }
  return { load, play };
}
const lionRoarClip = makeClipPlayer('assets/lion-roar.ogg', 2.2, 0.35);
// Public-domain "Fireworks in distance - 3" field recording (see assets/README.md) — pulls just the
// one clean burst moment (found by scanning the recording for its loudest window) out of the full
// 46s file rather than needing a separately re-encoded clip.
const fireworkBurstClip = makeClipPlayer('assets/firework-burst.ogg', 1.5, 0.4, 22.75);
// A full recitation (see assets/README.md), played end to end rather than trimmed like the clips
// above — pledgePlaying just blocks a second click from overlapping a recitation already underway,
// clearing itself once the clip's own length has actually elapsed.
const PLEDGE_CLIP_DURATION_S = 12;
const pledgeClip = makeClipPlayer('assets/pledge-of-allegiance.m4a', PLEDGE_CLIP_DURATION_S, 0.3);
let pledgePlaying = false;
function playPledge(){
  if(pledgePlaying) return;
  const started = pledgeClip.play();
  if(!started) return;
  pledgePlaying = true;
  setTimeout(()=>{ pledgePlaying = false; }, PLEDGE_CLIP_DURATION_S*1000);
}
// Same full-recitation-not-trimmed approach as the Pledge above, one clip per camp totem (see
// buildTotem/doInteract) — a bit of buffer past each file's real length (14.03s/11.44s) so the
// "still playing" guard clears a beat after the audio itself actually finishes.
const SCOUT_OATH_CLIP_DURATION_S = 15;
const scoutOathClip = makeClipPlayer('assets/scout-oath.m4a', SCOUT_OATH_CLIP_DURATION_S, 0.3);
let scoutOathPlaying = false;
function playScoutOath(){
  if(scoutOathPlaying) return;
  const started = scoutOathClip.play();
  if(!started) return;
  scoutOathPlaying = true;
  setTimeout(()=>{ scoutOathPlaying = false; }, SCOUT_OATH_CLIP_DURATION_S*1000);
}
const OUTDOOR_CODE_CLIP_DURATION_S = 12;
const outdoorCodeClip = makeClipPlayer('assets/outdoor-code.m4a', OUTDOOR_CODE_CLIP_DURATION_S, 0.3);
let outdoorCodePlaying = false;
function playOutdoorCode(){
  if(outdoorCodePlaying) return;
  const started = outdoorCodeClip.play();
  if(!started) return;
  outdoorCodePlaying = true;
  setTimeout(()=>{ outdoorCodePlaying = false; }, OUTDOOR_CODE_CLIP_DURATION_S*1000);
}
function playRoar(){
  if(lionRoarClip.play()) return;
  const ctx = ensureAudio();
  if(!ctx) return;
  const now = ctx.currentTime;
  const duration = 1.2;

  // low growling tone with a slow pitch wobble (vibrato) and a rise-then-fall contour
  const osc = ctx.createOscillator();
  osc.type = 'sawtooth';
  osc.frequency.setValueAtTime(85, now);
  osc.frequency.linearRampToValueAtTime(150, now+0.18);
  osc.frequency.linearRampToValueAtTime(60, now+duration);

  const lfo = ctx.createOscillator();
  lfo.frequency.value = 7.5;
  const lfoGain = ctx.createGain();
  lfoGain.gain.value = 14;
  lfo.connect(lfoGain).connect(osc.frequency);

  const lowpass = ctx.createBiquadFilter();
  lowpass.type = 'lowpass';
  lowpass.frequency.setValueAtTime(350, now);
  lowpass.frequency.linearRampToValueAtTime(1000, now+0.18);
  lowpass.frequency.linearRampToValueAtTime(250, now+duration);

  const oscGain = ctx.createGain();
  oscGain.gain.setValueAtTime(0.0001, now);
  oscGain.gain.exponentialRampToValueAtTime(0.32, now+0.14);
  oscGain.gain.exponentialRampToValueAtTime(0.18, now+0.55);
  oscGain.gain.exponentialRampToValueAtTime(0.0001, now+duration);

  osc.connect(lowpass).connect(oscGain).connect(ctx.destination);

  // filtered noise layer for a breathy, throaty growl texture
  const bufferSize = Math.floor(ctx.sampleRate*duration);
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for(let i=0;i<bufferSize;i++) data[i] = Math.random()*2-1;
  const noiseSrc = ctx.createBufferSource();
  noiseSrc.buffer = buffer;
  const noiseFilter = ctx.createBiquadFilter();
  noiseFilter.type = 'bandpass';
  noiseFilter.frequency.value = 500;
  noiseFilter.Q.value = 0.7;
  const noiseGain = ctx.createGain();
  noiseGain.gain.setValueAtTime(0.0001, now);
  noiseGain.gain.exponentialRampToValueAtTime(0.16, now+0.18);
  noiseGain.gain.exponentialRampToValueAtTime(0.0001, now+duration);
  noiseSrc.connect(noiseFilter).connect(noiseGain).connect(ctx.destination);

  osc.start(now); osc.stop(now+duration);
  lfo.start(now); lfo.stop(now+duration);
  noiseSrc.start(now);
}
function playDoorCreak(opening){
  const ctx = ensureAudio();
  if(!ctx) return;
  const now = ctx.currentTime;
  const duration = 0.35;
  const bufferSize = Math.floor(ctx.sampleRate*duration);
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for(let i=0;i<bufferSize;i++) data[i] = Math.random()*2-1;
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  const filter = ctx.createBiquadFilter();
  filter.type = 'bandpass';
  filter.Q.value = 8;
  filter.frequency.setValueAtTime(opening?250:500, now);
  filter.frequency.linearRampToValueAtTime(opening?500:200, now+duration);
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.linearRampToValueAtTime(0.22, now+0.03);
  gain.gain.exponentialRampToValueAtTime(0.0001, now+duration);
  src.connect(filter).connect(gain).connect(ctx.destination);
  src.start(now);
  if(!opening) setTimeout(()=>playTone(90, 0.1, 'sine', 0.15, 55), duration*1000*0.85); // soft thud on shut
}
function playWindowSlide(opening){
  playNoise(0.12, 0.12, opening?2200:1400);
  setTimeout(()=>playTone(opening?700:500, 0.08, 'sine', 0.1, opening?900:400), 60);
}
const SFX = {
  breakBlock(){ playNoise(0.15, 0.35, 1200); playTone(90, 0.12, 'sine', 0.15, 50); },
  placeBlock(){ playNoise(0.09, 0.22, 2400); playTone(180, 0.08, 'triangle', 0.1, 260); },
  swing(){ playTone(220, 0.08, 'triangle', 0.08, 180); },
  hitAnimal(){ playNoise(0.05, 0.16, 2600); playTone(320, 0.1, 'square', 0.15, 150); },
  animalDeath(){ playTone(220, 0.4, 'sawtooth', 0.18, 40); playNoise(0.3, 0.12, 500); },
  hurt(){ playTone(150, 0.25, 'sawtooth', 0.22, 80); playNoise(0.15, 0.1, 900); },
  jump(){ playTone(500, 0.1, 'sine', 0.1, 700); },
  land(){ playNoise(0.1, 0.2, 700); playTone(100, 0.1, 'sine', 0.12, 55); },
  craft(){
    playTone(660, 0.1, 'sine', 0.13, 880);
    setTimeout(()=>playTone(880, 0.12, 'sine', 0.13, 1100), 70);
    setTimeout(()=>playTone(1100, 0.18, 'sine', 0.11, 1320), 140);
  },
  death(){ playTone(300, 0.6, 'sawtooth', 0.2, 50); playNoise(0.5, 0.14, 400); },
  // Earning a merit badge: a bright four-note bugle call over the crafting chime's range.
  badge(){
    [0,110,220,380].forEach((delay,i)=>{
      const f = [523,659,784,1047][i];
      setTimeout(()=> playTone(f, i===3?0.45:0.16, 'sine', 0.14, f), delay);
    });
  },
  roar(){ playRoar(); },
  // Yelling and clapping to scare off a bear: a handful of quick, wavering shouts rather than any
  // one clean tone — deliberately silly-sounding, since it's the player making the noise, not the
  // game's own SFX library doing something musical.
  scareShout(){
    [0,140,270].forEach((delay,i)=>{
      setTimeout(()=>{
        playTone(180+i*30, 0.16, 'sawtooth', 0.16, 420+i*40);
        playNoise(0.08, 0.14, 1800);
      }, delay);
    });
  },
  // Waking up: two soft rising tones, the opposite shape of death's falling one.
  sleep(){
    playTone(320, 0.35, 'sine', 0.1, 420, 0.06);
    setTimeout(()=>playTone(440, 0.4, 'sine', 0.1, 560, 0.06), 220);
  },
  doorToggle(opening){ playDoorCreak(opening); },
  windowToggle(opening){ playWindowSlide(opening); },
  // A soft attack rounds the transient off into a light "patter" instead of a percussive tap, and
  // randomizing the tone/length each drop keeps rapid-fire hits from reading as one mechanical loop.
  rainPatter(vol){ playNoise(0.08+Math.random()*0.06, vol, 4200+Math.random()*3000, 0.025); },
  // A short bright crack up front (the "snap"), then the existing low rolling rumble follows it.
  thunder(){
    playNoise(0.18, 0.28, 6000, 0.002);
    playNoise(1.6, 0.32, 220, 0.02);
    playTone(55, 1.2, 'sawtooth', 0.15, 30);
  },
  igniteFire(){ playNoise(0.35, 0.3, 3000, 0.01); playTone(200, 0.3, 'sawtooth', 0.12, 500); },
  fireCrackle(){ playNoise(0.06, 0.06, 4000, 0.002); },
  windGust(vol, filterFreq){ playNoise(1.4, vol, filterFreq, 0.3); },
  // Rising whistle for the climb (freqEnd above freq sweeps the pitch upward), then a low thump
  // plus a handful of staggered bright crackle-pops for the colorful burst up top.
  fireworkLaunch(){ playTone(280, 0.9, 'sine', 0.1, 900, 0.05); playNoise(0.8, 0.05, 5500, 0.05); },
  fireworkBurst(){
    if(!fireworkBurstClip.play(null, 0.7)){
      playNoise(0.3, 0.32, 700, 0.004);
      playTone(75, 0.35, 'sawtooth', 0.2, 40);
    }
    for(let i=0;i<6;i++){
      setTimeout(()=>playNoise(0.05+Math.random()*0.05, 0.09, 2800+Math.random()*3400, 0.002), 50+i*65+Math.random()*40);
    }
  },
  // A short 2-3 note chirp; pitchMul shifts the whole thing up/down per species (small birds read
  // higher, large ones lower) and volume is computed by the caller from distance to the listener,
  // the closest thing this synth-only sound system has to positional audio.
  birdTweet(pitchMul, volume){
    const base = 2100*pitchMul;
    playTone(base+Math.random()*250, 0.045, 'sine', volume, base*1.25, 0.004);
    setTimeout(()=>playTone(base*0.82+Math.random()*250, 0.05, 'sine', volume*0.85, base*1.05, 0.004), 55+Math.random()*25);
    if(Math.random()<0.55) setTimeout(()=>playTone(base*1.05+Math.random()*200, 0.04, 'sine', volume*0.6, base*1.3, 0.004), 115+Math.random()*25);
  },
  splash(){ playNoise(0.22, 0.22, 2200, 0.004); playTone(180, 0.15, 'sine', 0.1, 70); },
  // Two quick low, dampened noise thuds — a "chomp, chomp" bite rather than anything sustained.
  eat(){
    playNoise(0.07, 0.18, 700, 0.004);
    setTimeout(()=>playNoise(0.08, 0.16, 650, 0.004), 90);
  },
};
lionRoarClip.load();
fireworkBurstClip.load();
pledgeClip.load();
scoutOathClip.load();
outdoorCodeClip.load();

// ---------- Combat ----------
let myHP = PLAYER_MAX_HP;
let myHunger = PLAYER_MAX_HUNGER; // same as myHP — in-memory only, resets to full on reload/respawn
let myName = 'Player';
try{ const savedName = localStorage.getItem('scoutcraft_player_name'); if(savedName) myName = savedName; }catch(e){}
let myTroop = '';
try{ const savedTroop = localStorage.getItem('scoutcraft_player_troop'); if(savedTroop) myTroop = savedTroop; }catch(e){}
let myNeckerchiefColor = '#c62828';
try{ const savedNeck = localStorage.getItem('scoutcraft_player_neckerchief'); if(savedNeck) myNeckerchiefColor = savedNeck; }catch(e){}
// Regen: standing still (no movement keys held) for a bit slowly heals a half-heart at a time.
const REGEN_IDLE_DELAY = 2;   // seconds of standing still before regen starts
const REGEN_INTERVAL = 1.5;   // seconds between each half-heart tick while idle
let idleTimer = 0, regenTimer = 0;
const RESPAWN_DELAY = 3;      // seconds a dead player is frozen before respawning
let isDead = false, respawnTimer = 0;
function heartSVG(kind, i){
  const red='#d9463c', gray='#4a4a4a', dark='#2a2a2a';
  const path = 'M12 21s-7.5-4.6-10-9.3C0.3 8.5 2 5 5.5 5c2 0 3.3 1.1 4 2.2C10.2 6.1 11.5 5 13.5 5 17 5 18.7 8.5 17 11.7 15.5 16.4 12 21 12 21z';
  if(kind==='half'){
    const cid = 'heartClip'+i;
    return `<svg viewBox="0 0 24 24" width="20" height="20"><defs><clipPath id="${cid}"><rect x="0" y="0" width="12" height="24"/></clipPath></defs><path d="${path}" fill="${gray}" stroke="${dark}" stroke-width="1"/><path d="${path}" fill="${red}" clip-path="url(#${cid})"/></svg>`;
  }
  const fill = kind==='full' ? red : 'none';
  const stroke = kind==='full' ? dark : gray;
  return `<svg viewBox="0 0 24 24" width="20" height="20"><path d="${path}" fill="${fill}" stroke="${stroke}" stroke-width="${kind==='full'?1:1.5}"/></svg>`;
}
function updateHeartsUI(){
  const el = document.getElementById('hearts');
  if(!el) return;
  el.innerHTML = '';
  const totalHearts = PLAYER_MAX_HP / HP_PER_HEART;
  for(let i=0;i<totalHearts;i++){
    const remaining = Math.max(0, Math.min(HP_PER_HEART, myHP - i*HP_PER_HEART));
    const kind = remaining>=HP_PER_HEART ? 'full' : (remaining>0 ? 'half' : 'empty');
    el.insertAdjacentHTML('beforeend', heartSVG(kind,i));
  }
}
// Emoji rather than hand-drawn SVG (unlike the hearts) — a drumstick silhouette isn't a simple enough
// shape to hand-derive a path for reliably, and this game already leans on plain emoji elsewhere in
// the HUD (weather, worm/butterfly counts). Full = a drumstick, half = the same drumstick dimmed, empty
// = a bare bone — reads at a glance without needing a legend.
function updateHungerUI(){
  const el = document.getElementById('hunger');
  if(!el) return;
  el.innerHTML = '';
  const totalIcons = PLAYER_MAX_HUNGER / HUNGER_PER_ICON;
  for(let i=0;i<totalIcons;i++){
    const remaining = Math.max(0, Math.min(HUNGER_PER_ICON, myHunger - i*HUNGER_PER_ICON));
    const span = document.createElement('span');
    span.textContent = remaining>0 ? '🍗' : '🦴';
    span.style.opacity = remaining>=HUNGER_PER_ICON ? '1' : (remaining>0 ? '0.45' : '0.7');
    el.appendChild(span);
  }
}
let hurtFlashTimeout = null;
function flashHurt(){
  const el = document.getElementById('hurtOverlay');
  if(!el) return;
  el.style.transition = 'none';
  el.style.opacity = '1';
  clearTimeout(hurtFlashTimeout);
  requestAnimationFrame(()=>{
    el.style.transition = 'opacity 0.5s ease-out';
    el.style.opacity = '0';
  });
}
function damagePlayer(dmg, sourceType){
  if(dmg<=0) return;
  // Floors at 1, not 0: badly hurt (half a heart, flashing red) is as bad as it gets — death and
  // respawn never trigger. die()/isDead/the respawn flow below stay in place, just permanently unused.
  myHP = Math.max(1, myHP - dmg);
  updateHeartsUI();
  flashHurt();
  SFX.hurt();
}
function die(){
  if(isDead) return;
  isDead = true;
  respawnTimer = RESPAWN_DELAY;
  const msg = document.getElementById('deathMessage');
  if(msg){ msg.hidden = false; msg.textContent = `You died — respawning in ${Math.ceil(respawnTimer)}…`; }
  SFX.death();
}
function respawnAfterDeath(){
  isDead = false;
  const msg = document.getElementById('deathMessage');
  if(msg) msg.hidden = true;
  spawnPlayer();
  myHP = PLAYER_MAX_HP;
  updateHeartsUI();
  myHunger = PLAYER_MAX_HUNGER;
  updateHungerUI();
}
// ---------- Sleep ----------
// Sleeping through the night can't actually fast-forward the wall clock everything else is driven
// from (see currentDayTime), so it uses the same local override the N key does (setTimeMode) to jump
// your own view to morning. What it actually gets you: a full rest (HP and hunger both topped up)
// plus that jump to morning.
let sleeping = false;
const WAKE_UP_HOUR = 7; // 7am
function trySleep(){
  if(sleeping || craftingOpen || itemsOpen || sashOpen || bearBoxOpen || backpackOpen || cookwareOpen) return;
  if(!nearestTent(4)){ addChatMessage('Camp', '⛺ You need to be near your tent to sleep.'); return; }
  if(invCount(SLEEPING_BAG)<=0 || invCount(SLEEPING_PAD)<=0){
    addChatMessage('Camp', "🛏️ You need your Sleeping Bag and Sleeping Pad out to make camp for the night — check your Backpack.");
    return;
  }
  if(!isScoutNight()){ addChatMessage('Camp', "☀️ You're not sleepy yet — try again after dark."); return; }
  sleeping = true;
  const el = document.getElementById('sleepOverlay');
  if(el){ el.style.transition = 'none'; el.style.opacity = '1'; }
  setTimeout(()=>{
    setTimeMode(WAKE_UP_HOUR/24);
    myHP = PLAYER_MAX_HP;
    updateHeartsUI();
    myHunger = PLAYER_MAX_HUNGER;
    updateHungerUI();
    SFX.sleep();
    addChatMessage('Camp', '💤 You wake up at camp, well rested.');
    if(el) requestAnimationFrame(()=>{ el.style.transition = 'opacity 1.2s ease-in'; el.style.opacity = '0'; });
    sleeping = false;
  }, 900);
}
function updateDeathState(dt){
  if(!isDead) return;
  respawnTimer -= dt;
  const msg = document.getElementById('deathMessage');
  if(msg) msg.textContent = `You died — respawning in ${Math.max(0,Math.ceil(respawnTimer))}…`;
  if(respawnTimer <= 0) respawnAfterDeath();
}
function findAttackTarget(){
  const dir = getLookDir(player.yaw, player.pitch);
  const origin = camera.position;
  let best = null, bestDist = Infinity;
  animals.forEach(a=>{
    // Bigger animals (moose, bear...) need a longer reach so the player can hit their
    // visible body, not just the exact ground point their position is tracked from.
    const aimY = ANIMAL_REAL_HEIGHT[a.type] || 0.4;
    const range = ATTACK_RANGE + (ANIMAL_STATS[a.type].reach||0);
    const dx=a.x-origin.x, dy=(a.y+aimY)-origin.y, dz=a.z-origin.z;
    const dist = Math.hypot(dx,dy,dz);
    if(dist>range || dist>=bestDist) return;
    const dot = (dx/dist)*dir.x + (dy/dist)*dir.y + (dz/dist)*dir.z;
    if(dot>ATTACK_ANGLE_COS){ best = {type:'animal', ref:a}; bestDist = dist; }
  });
  birds.forEach(b=>{
    const dx=b.mesh.position.x-origin.x, dy=(b.mesh.position.y)-origin.y, dz=b.mesh.position.z-origin.z;
    const dist = Math.hypot(dx,dy,dz);
    if(dist>ATTACK_RANGE || dist>=bestDist) return;
    const dot = (dx/dist)*dir.x + (dy/dist)*dir.y + (dz/dist)*dir.z;
    if(dot>ATTACK_ANGLE_COS){ best = {type:'bird', ref:b}; bestDist = dist; }
  });
  fish.forEach(f=>{
    const dx=f.mesh.position.x-origin.x, dy=(f.mesh.position.y)-origin.y, dz=f.mesh.position.z-origin.z;
    const dist = Math.hypot(dx,dy,dz);
    if(dist>ATTACK_RANGE || dist>=bestDist) return;
    const dot = (dx/dist)*dir.x + (dy/dist)*dir.y + (dz/dist)*dir.z;
    if(dot>ATTACK_ANGLE_COS){ best = {type:'fish', ref:f}; bestDist = dist; }
  });
  gophers.forEach(gopher=>{
    const dx=gopher.mesh.position.x-origin.x, dy=(gopher.mesh.position.y)-origin.y, dz=gopher.mesh.position.z-origin.z;
    const dist = Math.hypot(dx,dy,dz);
    if(dist>ATTACK_RANGE || dist>=bestDist) return;
    const dot = (dx/dist)*dir.x + (dy/dist)*dir.y + (dz/dist)*dir.z;
    if(dot>ATTACK_ANGLE_COS){ best = {type:'gopher', ref:gopher}; bestDist = dist; }
  });
  bigEagles.forEach(eagle=>{
    const dx=eagle.mesh.position.x-origin.x, dy=(eagle.mesh.position.y)-origin.y, dz=eagle.mesh.position.z-origin.z;
    const dist = Math.hypot(dx,dy,dz);
    if(dist>ATTACK_RANGE || dist>=bestDist) return;
    const dot = (dx/dist)*dir.x + (dy/dist)*dir.y + (dz/dist)*dir.z;
    if(dot>ATTACK_ANGLE_COS){ best = {type:'bigeagle', ref:eagle}; bestDist = dist; }
  });
  turtles.forEach(turtle=>{
    const dx=turtle.mesh.position.x-origin.x, dy=(turtle.mesh.position.y)-origin.y, dz=turtle.mesh.position.z-origin.z;
    const dist = Math.hypot(dx,dy,dz);
    if(dist>ATTACK_RANGE || dist>=bestDist) return;
    const dot = (dx/dist)*dir.x + (dy/dist)*dir.y + (dz/dist)*dir.z;
    if(dot>ATTACK_ANGLE_COS){ best = {type:'turtle', ref:turtle}; bestDist = dist; }
  });
  return best;
}
let lastPlayerAttack = 0;
function tryAttack(){
  const target = findAttackTarget();
  if(!target) return false;
  const now = performance.now();
  if(now - lastPlayerAttack >= 350){
    lastPlayerAttack = now;
    triggerSwing();
    SFX.swing();
    SFX.hitAnimal();
    if(target.type==='animal') damageAnimal(target.ref, PLAYER_ATTACK_DMG);
    else if(target.type==='bird') damageBirdOrFish(target.ref, PLAYER_ATTACK_DMG, 'bird');
    else if(target.type==='fish') damageBirdOrFish(target.ref, PLAYER_ATTACK_DMG, 'fish');
    else if(target.type==='gopher') damageGopher(target.ref, PLAYER_ATTACK_DMG);
    else if(target.type==='bigeagle') damageBigEagle(target.ref, PLAYER_ATTACK_DMG);
    else if(target.type==='turtle') damageTurtle(target.ref, PLAYER_ATTACK_DMG);
  }
  return true;
}

let thirdPerson = true;
// Cancels player.yaw's own contribution to the third-person camera's angle while the mouse is
// actively moving, so the camera holds its current view instead of always sitting directly behind
// you — the character (whose own rotation still tracks player.yaw untouched) spins freely in view,
// letting you turn all the way around to see your own face. Once the mouse stops for PEEK_HOLD_S,
// this eases back to 0 at PEEK_EASE_RATE, so the camera catches back up and settles behind you again.
let peekYaw = 0, peekTimer = 0;
const PEEK_HOLD_S = 1.5;
const PEEK_EASE_RATE = 3;
let characterMesh;
let myNameTag;
const myWalkState = { phase:0, amp:0 };
function updateCharacterAnim(dt, moving, sprinting){
  animateWalk(characterMesh, myWalkState, dt, moving, sprinting);
  characterMesh.position.set(player.pos.x, player.pos.y, player.pos.z);
  characterMesh.rotation.y = player.yaw;
  // Cheap third-person "crawling" tell: squash the whole body toward the ground rather than building a
  // separate prone pose. The group's origin is at the feet, so this alone keeps it planted correctly.
  characterMesh.scale.y = player.crawling ? 0.42 : 1;
  updateNameTag(myNameTag, myName, earnedBadges.size);
}

// ---------- World edits ----------
function applyWorldEdit(x, y, z, val){
  if(getBlock(x,y,z)===val) return;
  setBlock(x,y,z,val);
  const k = x+','+y+','+z;
  edits.set(k, val);
  if(val===CRAFTING_TABLE) craftingTables.add(k); else craftingTables.delete(k);
  if(val===TENT) tentCells.add(k); else tentCells.delete(k);
  updateTorchLight(x,y,z,val);
  onBlockChanged(x,y,z);
  onWaterRelevantEdit(x,y,z,val);
  saveEdits();
}
// Torches are permanent (unlike fire) — no lifecycle to track, just a light that follows the block.
// Placement/breaking always goes through applyWorldEdit above, so hooking the light there covers
// every case except the very first load, handled by restoreTorchLights() once after loadEdits()
// populates the world from localStorage.
const torchLights = new Map();
// Every light-emitting block and what its glow looks like. A campfire is the brightest and warmest
// (it's the middle of camp); a lantern is cooler and tighter, like a real glass-and-metal one.
const LIGHT_BLOCKS = {
  [TORCH]:    { color:0xffb060, intensity:6,  distance:8,  decay:1.6, yOffset:0.7 },
  [CAMPFIRE]: { color:0xff8a3a, intensity:8,   distance:13, decay:1.6, yOffset:0.85 },
  [LANTERN]:  { color:0xffe0a0, intensity:5.5, distance:10, decay:1.6, yOffset:0.6 },
};
function updateTorchLight(x,y,z,val){
  const key = x+','+y+','+z;
  const spec = LIGHT_BLOCKS[val];
  if(spec){
    if(!torchLights.has(key)){
      // Indoor faces get a fair amount of darkening baked straight into their vertex colors (see
      // INDOOR_DARK_FACTOR) — since MeshLambertMaterial multiplies a light's contribution by that
      // per-vertex color, a light weak enough to look reasonable in the open (intensity 1.1, decay 2,
      // the realistic inverse-square falloff) ends up essentially invisible against a torch-lit indoor
      // wall. A lower decay (softer falloff) lets the glow actually reach and fill a small room instead
      // of dying within a block or two of the torch.
      const light = new THREE.PointLight(spec.color, spec.intensity, spec.distance, spec.decay);
      light.position.set(x+0.5, y+spec.yOffset, z+0.5);
      scene.add(light);
      torchLights.set(key, light);
    }
    if(val===CAMPFIRE) ensureCampfireFlame(key,x,y,z);
  } else if(torchLights.has(key)){
    scene.remove(torchLights.get(key));
    torchLights.delete(key);
    removeCampfireFlame(key);
  }
}
function restoreTorchLights(){
  edits.forEach((val,key)=>{
    if(LIGHT_BLOCKS[val]){
      const [x,y,z] = key.split(',').map(Number);
      updateTorchLight(x,y,z,val);
    }
  });
}
// When a trunk block is cut, whatever wood+leaves are left connected to it but no longer resting on
// anything solid (the ground, or a block outside the cut cluster) breaks free and actually falls —
// real gravity, accelerating over time, until it hits something and settles as real blocks.
function fallLandingY(x, startY, z){
  for(let y=startY-1; y>=1; y--) if(blockSolid(x,y,z)) return y+1;
  return 1;
}
function checkTreeSupport(bx, by, bz){
  // Figures out which single tree the just-broken block belonged to and whether any of ITS
  // remaining wood/leaves are now floating — deliberately not a general flood-fill through touching
  // blocks. In a forest, neighboring trees' canopies constantly touch each other, so a flood-fill
  // from a cut tree routinely wanders into an untouched neighbor that's still fully rooted and
  // (correctly, but unhelpfully) reads the whole merged blob as supported — the chopped tree's own
  // leaves would then never fall except in open ground. Reconstructing this tree's exact cell list
  // from the same deterministic formula plantTree used to grow it sidesteps that entirely, and as a
  // bonus leaves ordinary player-built wood structures (which won't match that shape) untouched.
  const baseY = heightAt(bx,bz) + 1;
  const treeCells = [];
  plantTreeCells(bx, baseY, bz, (x,y,z,b) => treeCells.push([x,y,z,b]));
  const stillThere = treeCells.filter(([x,y,z,b]) => getBlock(x,y,z)===b);
  if(stillThere.length===0) return;
  let groundedTrunkTop = null;
  if(getBlock(bx,baseY,bz)===WOOD){
    let y = baseY;
    while(getBlock(bx,y,bz)===WOOD) y++;
    groundedTrunkTop = y-1;
  }
  const floating = stillThere.filter(([x,y,z]) =>
    !(x===bx && z===bz && groundedTrunkTop!=null && y<=groundedTrunkTop)
  );
  if(floating.length>0) dropCluster(floating);
}
function dropCluster(cells){
  // Clear the originals first (synced) so the landing/drop calc below sees a cluster-free world —
  // otherwise a piece could "land" on another piece of the very structure that's falling with it.
  for(const [x,y,z] of cells) applyWorldEdit(x, y, z, AIR);
  // The drop distance is decided by the structure's LOWEST layer only (its trunk stub if any wood
  // remains, otherwise its lowest leaves) — not the minimum across every cell. Using every cell was
  // too fragile: one leaf out at the edge of the canopy happening to sit close to unrelated terrain
  // could clamp the whole tree's fall to near zero even though the rest of it was clearly floating.
  const minY = cells.reduce((m,[,y])=>Math.min(m,y), Infinity);
  let drop = Infinity;
  for(const [x,y,z] of cells) if(y===minY) drop = Math.min(drop, y - fallLandingY(x,y,z));
  drop = Math.max(0, isFinite(drop) ? drop : 0);
  spawnFallingCluster(cells, drop);
}
// A short-lived local physics body: the whole disconnected chunk of trunk/canopy falls together
// under real gravity and only turns back into real (synced) blocks once it settles.
const fallingClusters = [];
let woodFxMat, leafFxMat, fallGeo;
function spawnFallingCluster(cells, drop){
  if(!fallGeo){
    fallGeo = new THREE.BoxGeometry(0.98,0.98,0.98);
    woodFxMat = new THREE.MeshLambertMaterial({ color: BLOCK_COLOR[WOOD] });
    leafFxMat = new THREE.MeshLambertMaterial({ color: BLOCK_COLOR[LEAVES] });
  }
  const group = new THREE.Group();
  const originX = cells[0][0], originY = cells[0][1], originZ = cells[0][2];
  for(const [x,y,z,b] of cells){
    const mesh = new THREE.Mesh(fallGeo, b===WOOD ? woodFxMat : leafFxMat);
    mesh.position.set(x-originX+0.5, y-originY+0.5, z-originZ+0.5);
    group.add(mesh);
  }
  group.position.set(originX, originY, originZ);
  scene.add(group);
  if(drop<=0){ settleCluster({group, cells, originX, originY, originZ, drop}); return; }
  fallingClusters.push({ group, cells, originX, originY, originZ, drop, fallen:0, vy:0 });
}
function settleCluster(f){
  scene.remove(f.group);
  for(const [x,y,z,b] of f.cells) applyWorldEdit(x, y-f.drop, z, b);
}
function updateFallingClusters(dt){
  for(let i=fallingClusters.length-1;i>=0;i--){
    const f = fallingClusters[i];
    f.vy += GRAVITY*dt;
    f.fallen = Math.min(f.drop, f.fallen - f.vy*dt);
    f.group.position.y = f.originY - f.fallen;
    if(f.fallen >= f.drop){
      fallingClusters.splice(i,1);
      settleCluster(f);
    }
  }
}

// ---------- Day/night cycle ----------
// dayTime (0..1) is derived straight from the wall clock rather than accumulated frame-by-frame, so
// every client (and a fresh page reload) is automatically on the same clock with no syncing needed.
// 0 = midnight, 0.25 = sunrise, 0.5 = noon, 0.75 = sunset.
const DAY_LENGTH_S = 3600; // 1 real hour per full day/night cycle
// Animal reproduction cooldown (see ANIMAL_REPRODUCE_RANGE above): 30 in-game days.
const ANIMAL_REPRODUCE_INTERVAL_MS = 30 * DAY_LENGTH_S * 1000;
const DAY_KEYFRAMES = [
  { t:0.00, sky:0x05070f, hemi:0.22, sunI:0.00, sunC:0x223355 },
  { t:0.20, sky:0x0d1330, hemi:0.25, sunI:0.00, sunC:0x223355 },
  { t:0.25, sky:0xff9a56, hemi:0.55, sunI:0.55, sunC:0xffb066 },
  { t:0.32, sky:0x8fd0ee, hemi:0.90, sunI:0.80, sunC:0xffffff },
  { t:0.68, sky:0x8fd0ee, hemi:0.90, sunI:0.80, sunC:0xffffff },
  { t:0.75, sky:0xff7f50, hemi:0.55, sunI:0.50, sunC:0xff8c50 },
  { t:0.80, sky:0x0d1330, hemi:0.25, sunI:0.00, sunC:0x223355 },
  { t:1.00, sky:0x05070f, hemi:0.22, sunI:0.00, sunC:0x223355 },
];
function lerpColorHex(a,b,t){
  const ar=(a>>16)&255, ag=(a>>8)&255, ab=a&255;
  const br=(b>>16)&255, bg=(b>>8)&255, bb=b&255;
  return (Math.round(ar+(br-ar)*t)<<16) | (Math.round(ag+(bg-ag)*t)<<8) | Math.round(ab+(bb-ab)*t);
}
// 'regular' (the normal wall-clock cycle), 'day' (frozen at noon), 'night' (frozen at midnight) — all
// three toggled with N (see the keydown handler) — or a raw number in [0,1) forcing one exact moment
// (waking up from sleep lands on 7am, i.e. 7/24, rather than either of the N-cycle's two fixed spots).
// Every consumer of currentDayTime() — sky/lighting, the sun/moon, the temperature swing, firefly
// night visibility, and the HH:MM World Time HUD label — reads it through this one function, so
// forcing it here is enough to make all of them agree.
let timeMode = 'regular';
function currentDayTime(){
  if(typeof timeMode === 'number') return timeMode;
  if(timeMode==='day') return 0.5;
  if(timeMode==='night') return 0;
  return (Date.now()/1000 % DAY_LENGTH_S) / DAY_LENGTH_S;
}
function setTimeMode(mode){
  timeMode = mode;
  const el = document.getElementById('timeModeLabel');
  if(el) el.textContent = mode==='day' ? ' ☀️ forced day' : mode==='night' ? ' 🌙 forced night' : (typeof mode==='number' ? ' ☀️ forced morning' : '');
}
function cycleTimeMode(){
  setTimeMode(timeMode==='regular' ? 'day' : timeMode==='day' ? 'night' : 'regular');
}

// ---------- Calendar: Year/Month/Day, anchored to a specific real-world instant ----------
// A parallel, purely cosmetic calendar for the HUD date — it doesn't feed into season/temperature/
// weather at all (those keep their own independent wall-clock cycle). 2026-09-06 08:00 PDT is fixed
// as the start of Year 0, Jan 1; every real hour after that is one month (matching the existing
// season length of 3 hours = 3 months), and each month is a nominal 30 "days" so the date visibly
// ticks forward (one every 2 real minutes) instead of sitting on "Day 1" for the whole month.
const CALENDAR_EPOCH_MS = Date.UTC(2026, 8, 6, 15, 0, 0); // 2026-09-06 08:00 PDT (UTC-7) == 15:00 UTC
const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const MONTH_LENGTH_S = 3600;                // 1 real hour per month
const CALENDAR_DAY_S = MONTH_LENGTH_S / 30;  // a nominal 30-day month
function currentCalendarDate(){
  const elapsedS = (Date.now() - CALENDAR_EPOCH_MS) / 1000;
  const totalMonths = Math.floor(elapsedS / MONTH_LENGTH_S);
  const year = Math.floor(totalMonths / 12);
  let monthIdx = totalMonths % 12;
  if(monthIdx < 0) monthIdx += 12;
  const intoMonthS = elapsedS - totalMonths*MONTH_LENGTH_S;
  const day = 1 + Math.floor(intoMonthS / CALENDAR_DAY_S);
  return { year, month: MONTH_NAMES[monthIdx], day };
}

// ---------- Sun, moon & shadows ----------
// Both bodies are billboard sprites riding the same day-time angle the lighting already uses, at a
// large fixed radius so they read as distant sky objects. The DirectionalLight's actual position
// (used for both lighting direction and its shadow camera) is kept at that same angle/height but
// re-centered on the PLAYER every frame — shadows only need to be correct near you, and a shadow
// camera that follows you can use a small, sharp frustum instead of trying to cover the whole world.
const SUN_ORBIT_R = 150;
const SHADOW_RADIUS = 32;
const SYNODIC_MONTH_DAYS = 29.530588; // real lunar month length
let sunSprite, moonSprite, moonBaseCanvas, moonBaseImageData, moonPhaseCanvas;
let lastMoonPhaseKey = null;
function buildGlowSpriteTexture(stops){
  const S = 64;
  const canvas = document.createElement('canvas');
  canvas.width=S; canvas.height=S;
  const ctx = canvas.getContext('2d');
  const grad = ctx.createRadialGradient(S/2,S/2,0, S/2,S/2,S/2);
  stops.forEach(([off,color])=> grad.addColorStop(off,color));
  ctx.fillStyle = grad;
  ctx.fillRect(0,0,S,S);
  return new THREE.CanvasTexture(canvas);
}
function buildMoonBaseCanvas(){
  const S = 64;
  const canvas = document.createElement('canvas');
  canvas.width=S; canvas.height=S;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#d8d4c8';
  ctx.beginPath(); ctx.arc(S/2,S/2,S/2-1,0,Math.PI*2); ctx.fill();
  for(let i=0;i<8;i++){
    const cx=S*0.2+Math.random()*S*0.6, cy=S*0.2+Math.random()*S*0.6;
    const r=S*(0.04+Math.random()*0.07);
    if(Math.hypot(cx-S/2,cy-S/2)>S/2-r) continue;
    ctx.fillStyle='rgba(140,138,125,0.5)';
    ctx.beginPath(); ctx.arc(cx,cy,r,0,Math.PI*2); ctx.fill();
  }
  return canvas;
}
// Per-pixel sphere-lighting test (not canvas path arcs — much easier to get exactly right): a point
// on the visible hemisphere is lit if it faces the phase's implied light direction. theta=0 -> new
// moon (light from directly behind, as seen by us), theta=PI -> full (light from directly in front).
function buildMoonPhaseCanvas(phase01){
  const S = moonBaseCanvas.width;
  const canvas = document.createElement('canvas');
  canvas.width=S; canvas.height=S;
  const ctx = canvas.getContext('2d');
  const out = ctx.createImageData(S,S);
  const theta = phase01*Math.PI*2;
  const sinT = Math.sin(theta), cosT = Math.cos(theta);
  const cx=S/2, cy=S/2, r=S/2-1;
  const base = moonBaseImageData.data;
  for(let y=0;y<S;y++){
    for(let x=0;x<S;x++){
      const i=(y*S+x)*4;
      const nx=(x-cx)/r, ny=(y-cy)/r;
      const d2=nx*nx+ny*ny;
      if(d2>1){ out.data[i+3]=0; continue; }
      const nz = Math.sqrt(1-d2);
      const lit = (nx*sinT - nz*cosT) > 0;
      let br=base[i], bg=base[i+1], bb=base[i+2];
      if(!lit){ br*=0.12; bg*=0.12; bb*=0.18; }
      out.data[i]=br; out.data[i+1]=bg; out.data[i+2]=bb; out.data[i+3]=base[i+3];
    }
  }
  ctx.putImageData(out,0,0);
  return canvas;
}
function currentMoonPhase(){
  // 0 = new, 0.5 = full, cyclical. CALENDAR_EPOCH_MS is anchored to a full moon (see the calendar
  // section above), so phase = 0.5 exactly at that instant, moving in real elapsed days regardless
  // of the game's own compressed day/night or calendar speed.
  const elapsedDays = (Date.now() - CALENDAR_EPOCH_MS) / 86400000;
  let f = (0.5 + elapsedDays / SYNODIC_MONTH_DAYS) % 1;
  if(f < 0) f += 1;
  return f;
}
function buildCelestialBodies(){
  const sunTex = buildGlowSpriteTexture([[0,'rgba(255,255,230,1)'],[0.5,'rgba(255,235,150,0.95)'],[1,'rgba(255,200,80,0)']]);
  sunSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map:sunTex, transparent:true, depthWrite:false, depthTest:false }));
  sunSprite.scale.set(28,28,1);
  sunSprite.renderOrder = -1;
  scene.add(sunSprite);

  moonBaseCanvas = buildMoonBaseCanvas();
  moonBaseImageData = moonBaseCanvas.getContext('2d').getImageData(0,0,moonBaseCanvas.width,moonBaseCanvas.height);
  const moonMat = new THREE.SpriteMaterial({ transparent:true, depthWrite:false, depthTest:false });
  moonSprite = new THREE.Sprite(moonMat);
  moonSprite.scale.set(20,20,1);
  moonSprite.renderOrder = -1;
  scene.add(moonSprite);
}
// +X is East, -X is West (matching the usual Minecraft-style convention) — both bodies ride a single
// vertical east-west plane through the player rather than a full horizontal circle, so "rise due east,
// climb overhead, set due west" is actually true instead of the sun also drifting through a third,
// unlabeled compass point at solar noon.
function updateCelestialBodies(dayTime){
  const theta = dayTime*Math.PI*2;
  const sunHeight = -Math.cos(theta); // unclamped: true rise/set through the horizon
  const sunX = Math.sin(theta);       // +1 (east) at sunrise, 0 (overhead) at noon, -1 (west) at sunset
  sunSprite.position.set(player.pos.x+sunX*SUN_ORBIT_R, player.pos.y+sunHeight*SUN_ORBIT_R*0.6+20, player.pos.z);
  sunSprite.visible = sunHeight > -0.06;

  // The moon sits opposite the sun (rises as the sun sets) and its own arc uses the same sunHeight
  // shape mirrored, so it's up for the night half of the cycle and below the horizon during the day.
  // Negating sunX doesn't reverse its direction of travel — it's the same east-west sine curve, just
  // running exactly half a cycle out of phase — so the moon crosses east-to-west too, same as the sun.
  const moonHeight = -sunHeight;
  const moonX = -sunX;
  moonSprite.position.set(player.pos.x+moonX*SUN_ORBIT_R, player.pos.y+moonHeight*SUN_ORBIT_R*0.6+20, player.pos.z);
  moonSprite.visible = moonHeight > -0.06;

  const phase = currentMoonPhase();
  const phaseKey = Math.round(phase*100); // real lunar month is ~29.5 days — no need to redraw often
  if(phaseKey !== lastMoonPhaseKey){
    lastMoonPhaseKey = phaseKey;
    if(moonSprite.material.map) moonSprite.material.map.dispose();
    moonPhaseCanvas = buildMoonPhaseCanvas(phase);
    const tex = new THREE.CanvasTexture(moonPhaseCanvas);
    moonSprite.material.map = tex;
    moonSprite.material.needsUpdate = true;
  }

  // Keep the sun (and its shadow) at the same angle/height, but centered on the player instead of
  // the world origin, so the shadow camera's small frustum always covers the ground right around you.
  sunLight.position.set(player.pos.x+sunX*SUN_ORBIT_R, Math.max(5, sunHeight*SUN_ORBIT_R*0.6+40), player.pos.z);
  sunLight.target.position.set(player.pos.x, player.pos.y, player.pos.z);
}

// ---------- Night sky: stars + the Big Dipper ----------
// A field of distant points plus one real, recognizable constellation — the Big Dipper, since it's
// the one shape most people already know how to spot. Both live at a fixed distance in a fixed
// compass direction (no real sidereal rotation — simplicity over realism), recentered on the player
// every frame exactly like the sun/moon above, so they read as infinitely far away rather than
// panning as you walk. Fading is the same smooth night/day blend fireflies already use.
const STAR_COUNT = 260;
const STAR_DOME_RADIUS = 300;
// Fixed direction the Dipper sits in: due north (matches bearingName's -Z-is-north convention) and
// well up in the sky, so "look north and up" is a real, learnable instruction.
const BIG_DIPPER_DIR = new THREE.Vector3(0, Math.sin(55*Math.PI/180), -Math.cos(55*Math.PI/180)).normalize();
const DIPPER_GAZE_COS = Math.cos(18 * Math.PI/180); // ~18° cone — roughly the whole drawn shape, forgiving of ordinary mouse drift
const DIPPER_GAZE_SECONDS = 10;
const DIPPER_GAZE_GRACE_S = 1.5; // briefly glancing away doesn't wipe out the whole streak, only stopping this long does
// The real ladle asterism in local (right, up) offsets around BIG_DIPPER_DIR — handle tip to bowl:
// Alkaid, Mizar, Alioth, Megrez, then the bowl itself Megrez-Phecda-Merak-Dubhe back to Megrez.
const DIPPER_STARS = [
  [-4.0, 2.6], [-2.6, 2.0], [-1.3, 1.6], [0.0, 1.0], [0.1,-0.3], [1.8,-0.5], [2.0, 1.0],
];
const DIPPER_SEGMENTS = [[0,1],[1,2],[2,3],[3,4],[4,5],[5,6],[6,3]];
let starPoints = null, dipperPoints = null, dipperLines = null;
function buildStarField(){
  const positions = new Float32Array(STAR_COUNT*3);
  for(let i=0;i<STAR_COUNT;i++){
    const u = Math.random(), v = Math.random();
    const az = u*Math.PI*2, elev = v*Math.PI*0.5; // upper hemisphere only — no stars underfoot
    positions[i*3+0] = Math.cos(elev)*Math.sin(az)*STAR_DOME_RADIUS;
    positions[i*3+1] = Math.sin(elev)*STAR_DOME_RADIUS;
    positions[i*3+2] = -Math.cos(elev)*Math.cos(az)*STAR_DOME_RADIUS;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions,3));
  const mat = new THREE.PointsMaterial({ color:0xffffff, size:1.6, sizeAttenuation:false, transparent:true, opacity:0, depthWrite:false, fog:false });
  starPoints = new THREE.Points(geo, mat);
  starPoints.renderOrder = -2;
  scene.add(starPoints);

  // Tangent-plane basis around the fixed Dipper direction, so its local (right,up) offsets above
  // land as a small, correctly-oriented cluster in the actual sky rather than a flat world-plane.
  const worldUp = new THREE.Vector3(0,1,0);
  const right = new THREE.Vector3().crossVectors(worldUp, BIG_DIPPER_DIR).normalize();
  const up = new THREE.Vector3().crossVectors(BIG_DIPPER_DIR, right).normalize();
  const scale = 0.018; // controls the Dipper's apparent size in the sky
  const dipperDir = (sx,sy) => BIG_DIPPER_DIR.clone()
    .addScaledVector(right, sx*scale).addScaledVector(up, sy*scale).normalize();

  const starPos = new Float32Array(DIPPER_STARS.length*3);
  DIPPER_STARS.forEach(([sx,sy], i)=>{
    const d = dipperDir(sx,sy).multiplyScalar(STAR_DOME_RADIUS*0.97); // just inside the star dome
    starPos[i*3]=d.x; starPos[i*3+1]=d.y; starPos[i*3+2]=d.z;
  });
  const dGeo = new THREE.BufferGeometry();
  dGeo.setAttribute('position', new THREE.BufferAttribute(starPos,3));
  const dMat = new THREE.PointsMaterial({ color:0xfff8e0, size:4.5, sizeAttenuation:false, transparent:true, opacity:0, depthWrite:false, fog:false });
  dipperPoints = new THREE.Points(dGeo, dMat);
  dipperPoints.renderOrder = -2;
  scene.add(dipperPoints);

  const linePos = new Float32Array(DIPPER_SEGMENTS.length*2*3);
  DIPPER_SEGMENTS.forEach(([a,b], i)=>{
    linePos[i*6]=starPos[a*3]; linePos[i*6+1]=starPos[a*3+1]; linePos[i*6+2]=starPos[a*3+2];
    linePos[i*6+3]=starPos[b*3]; linePos[i*6+4]=starPos[b*3+1]; linePos[i*6+5]=starPos[b*3+2];
  });
  const lGeo = new THREE.BufferGeometry();
  lGeo.setAttribute('position', new THREE.BufferAttribute(linePos,3));
  const lMat = new THREE.LineBasicMaterial({ color:0xfff8e0, transparent:true, opacity:0, depthWrite:false, fog:false });
  dipperLines = new THREE.LineSegments(lGeo, lMat);
  dipperLines.renderOrder = -2;
  scene.add(dipperLines);
}
function updateStarField(){
  const night = fireflyNightFactor();
  starPoints.position.copy(player.pos);
  dipperPoints.position.copy(player.pos);
  dipperLines.position.copy(player.pos);
  starPoints.material.opacity = night*0.9;
  dipperPoints.material.opacity = night;
  dipperLines.material.opacity = night*0.55;
}

let lastWorldTimeLabel = null, lastDateLabel = null;
function updateDayNight(){
  const dayTime = currentDayTime();
  const totalMinutes = Math.floor(dayTime*24*60) % (24*60);
  const timeText = String(Math.floor(totalMinutes/60)).padStart(2,'0')+':'+String(totalMinutes%60).padStart(2,'0');
  if(timeText !== lastWorldTimeLabel){
    lastWorldTimeLabel = timeText;
    const el = document.getElementById('worldTimeLabel');
    if(el) el.textContent = timeText;
  }
  const { year, month, day } = currentCalendarDate();
  const dateText = `${month} ${day}, Y${year}`;
  if(dateText !== lastDateLabel){
    lastDateLabel = dateText;
    const el = document.getElementById('dateLabel');
    if(el) el.textContent = dateText;
  }
  let k0 = DAY_KEYFRAMES[0], k1 = DAY_KEYFRAMES[DAY_KEYFRAMES.length-1];
  for(let i=0;i<DAY_KEYFRAMES.length-1;i++){
    if(dayTime>=DAY_KEYFRAMES[i].t && dayTime<=DAY_KEYFRAMES[i+1].t){ k0=DAY_KEYFRAMES[i]; k1=DAY_KEYFRAMES[i+1]; break; }
  }
  const span = k1.t-k0.t;
  const lt = span>0 ? (dayTime-k0.t)/span : 0;
  const skyColor = lerpColorHex(k0.sky, k1.sky, lt);
  scene.background.setHex(skyColor);
  scene.fog.color.setHex(skyColor);
  hemiLight.intensity = k0.hemi + (k1.hemi-k0.hemi)*lt;
  sunLight.intensity = k0.sunI + (k1.sunI-k0.sunI)*lt;
  sunLight.color.setHex(lerpColorHex(k0.sunC, k1.sunC, lt));
  updateCelestialBodies(dayTime);
  updateStarField();
}

// ---------- Weather ----------
// Like the day/night cycle, weather is derived straight from the wall clock, so it's automatically
// consistent across a reload with no state to save.
const WEATHER_PERIOD_S = 1200;     // how long one weather episode lasts (20 min)
const WEATHER_TRANSITION_S = 90;   // how long it takes to blend into a freshly-rolled episode (1.5 min)
const WEATHER_TYPES = [
  // cumulative selection order matters only in that it's applied consistently; percentages per the spec
  // chillF: how many degrees this weather knocks off the temperature (see currentTemperatureF) —
  // wetter/stormier weather runs colder, on top of whatever season/time-of-day already has it at.
  { id:'sunny',        p:0.50, fogMul:1.00, darken:0.00, rain:0.0,  thunder:false, chillF:0,  label:'Sunny' },
  { id:'cloudy',       p:0.15, fogMul:0.80, darken:0.28, rain:0.0,  thunder:false, chillF:2,  label:'Cloudy' },
  { id:'rainy',        p:0.20, fogMul:0.55, darken:0.42, rain:0.5,  thunder:false, chillF:6,  label:'Rainy' },
  { id:'rainstorm',    p:0.10, fogMul:0.40, darken:0.55, rain:1.0,  thunder:false, chillF:10, label:'Rainstorm' },
  { id:'thunderstorm', p:0.05, fogMul:0.30, darken:0.68, rain:1.5,  thunder:true,  chillF:14, label:'Heavy Thunderstorm' },
];
function weatherHash(n){
  const s = Math.sin(n*12.9898 + SEED*0.0007)*43758.5453123;
  return s - Math.floor(s);
}
function weatherForEpoch(epoch){
  const r = weatherHash(epoch);
  let cum = 0;
  for(const w of WEATHER_TYPES){ cum += w.p; if(r<cum) return w; }
  return WEATHER_TYPES[0];
}
function currentWeatherBlend(){
  const t = Date.now()/1000;
  const epoch = Math.floor(t/WEATHER_PERIOD_S);
  const into = t - epoch*WEATHER_PERIOD_S;
  const to = weatherForEpoch(epoch);
  if(into < WEATHER_TRANSITION_S){
    const from = weatherForEpoch(epoch-1);
    return { from, to, lt: into/WEATHER_TRANSITION_S };
  }
  return { from: to, to, lt: 1 };
}
function lerp(a,b,t){ return a+(b-a)*t; }

// ---------- Seasons & temperature ----------
// Same wall-clock philosophy as day/night and weather — no state to save, everyone's always in
// sync. A year is 4 seasons of 3 real hours each (12h/year); temperature is that season's average,
// swung warmer at noon / colder at midnight by a cosine curve, plus a small organic wobble so it's
// never exactly the same twice. Being outdoors (no roof, cave ceiling, or tree canopy overhead —
// reusing the same sky-exposure idea the indoor-lighting fix uses) in genuinely dangerous heat or
// cold drains HP faster than standing still can regenerate it.
const SEASON_LENGTH_S = 3*3600;
const YEAR_LENGTH_S = 4*SEASON_LENGTH_S;
const SEASON_TRANSITION_S = 900; // 15 min blend into a freshly-arrived season
const SEASONS = [
  { id:'spring', label:'Spring', avgF:50 },
  { id:'summer', label:'Summer', avgF:90 },
  { id:'fall',   label:'Fall',   avgF:50 },
  { id:'winter', label:'Winter', avgF:20 },
];
const DAILY_TEMP_SWING_F = 18; // +/- this many degrees between noon and midnight
// Two danger tiers per direction: past DANGER_F you lose HP slowly, past the more extreme SUPER_F
// you lose it rapidly — both a higher per-tick amount and a shorter tick interval.
const COLD_DANGER_F = 20, COLD_SUPER_F = 0;
const HOT_DANGER_F = 105, HOT_SUPER_F = 110;
const TEMP_DAMAGE_TICK_S = 4, TEMP_DAMAGE_TICK_SUPER_S = 2;
const TEMP_DAMAGE_MILD = 1, TEMP_DAMAGE_SUPER = 4;
function currentSeasonBlend(){
  const t = Date.now()/1000;
  const yearT = ((t % YEAR_LENGTH_S) + YEAR_LENGTH_S) % YEAR_LENGTH_S;
  const idx = Math.floor(yearT / SEASON_LENGTH_S);
  const into = yearT - idx*SEASON_LENGTH_S;
  const to = SEASONS[idx];
  if(into < SEASON_TRANSITION_S){
    const from = SEASONS[(idx-1+4)%4];
    return { from, to, lt: into/SEASON_TRANSITION_S };
  }
  return { from: to, to, lt: 1 };
}
function currentTemperatureF(){
  const t = Date.now()/1000;
  const { from, to, lt } = currentSeasonBlend();
  const avgF = lerp(from.avgF, to.avgF, lt);
  const dayTime = currentDayTime();
  const dailyOffset = DAILY_TEMP_SWING_F * Math.cos((dayTime-0.5)*Math.PI*2);
  const noise = (smoothNoise01(t*0.05, 91)*2-1) * 4;
  const wb = currentWeatherBlend();
  const chillF = lerp(wb.from.chillF, wb.to.chillF, wb.lt);
  // Season, time of day, and weather still all push it around within the range — winter still reads
  // cooler than summer, a storm still knocks a few degrees off — it just never leaves a comfortable
  // 40-90°F band, so the temperature-danger tiers below (calibrated for a wider swing) never trigger.
  return Math.max(40, Math.min(90, avgF + dailyOffset + noise - chillF));
}
// Straight-up sky check from an arbitrary live position (the player), as opposed to
// computeSkyExposure() which is baked per-column into chunk mesh vertex colors at build time.
function isPositionSkyExposed(x,y,z){
  const bx=Math.floor(x), bz=Math.floor(z);
  for(let cy=Math.floor(y)+1; cy<WORLD_HEIGHT; cy++){
    const b = getBlock(bx,cy,bz);
    if(b!==AIR && !SKY_PASS_BLOCKS.has(b)) return false;
  }
  return true;
}
let tempDamageTimer = TEMP_DAMAGE_TICK_S;
let lastSeasonLabel = null;
function updateTemperature(dt){
  const { to } = currentSeasonBlend();
  const tempF = currentTemperatureF();
  const outdoors = isPositionSkyExposed(player.pos.x, player.pos.y+player.eye, player.pos.z);
  let danger = null, severe = false;
  if(tempF < COLD_DANGER_F){ danger = 'cold'; severe = tempF < COLD_SUPER_F; }
  else if(tempF > HOT_DANGER_F){ danger = 'hot'; severe = tempF > HOT_SUPER_F; }
  const inPeril = danger && outdoors && locked && !isDead;

  if(to.label !== lastSeasonLabel){
    lastSeasonLabel = to.label;
    const el = document.getElementById('seasonLabel');
    if(el) el.textContent = to.label;
  }
  const tempEl = document.getElementById('tempLabel');
  if(tempEl){
    let text = `${Math.round(tempF)}°F`;
    if(inPeril){
      if(danger==='cold') text += severe ? ' ❄ Severe Frostbite!' : ' ❄ Freezing!';
      else text += severe ? ' 🔥 Heatstroke!' : ' 🔥 Overheating!';
    }
    tempEl.textContent = text;
    tempEl.classList.toggle('danger', !!inPeril);
  }

  tempDamageTimer -= dt;
  if(tempDamageTimer<=0){
    if(inPeril){
      tempDamageTimer = severe ? TEMP_DAMAGE_TICK_SUPER_S : TEMP_DAMAGE_TICK_S;
      damagePlayer(severe ? TEMP_DAMAGE_SUPER : TEMP_DAMAGE_MILD, 'temperature');
    } else {
      tempDamageTimer = TEMP_DAMAGE_TICK_S;
    }
  }
}

let hungerDecayTimer = HUNGER_DECAY_INTERVAL_S, starveDamageTimer = STARVE_DAMAGE_TICK_S;
function updateHunger(dt){
  if(!locked || isDead) return;
  hungerDecayTimer -= dt;
  if(hungerDecayTimer<=0){
    hungerDecayTimer = HUNGER_DECAY_INTERVAL_S;
    if(myHunger>0){ myHunger--; updateHungerUI(); }
  }
  starveDamageTimer -= dt;
  if(starveDamageTimer<=0){
    starveDamageTimer = STARVE_DAMAGE_TICK_S;
    if(myHunger<=0) damagePlayer(STARVE_DAMAGE, 'hunger');
  }
}

// ---------- Wind ----------
// Same philosophy as day/night and weather: derived purely from the wall clock, so it's random
// (nobody chose it) but perfectly in sync for every player with no networking at all. Strength is a
// smooth, organic-looking signal built from a few sine waves at unrelated frequencies (a cheap stand-
// in for real noise) — a slow-moving base plus a faster gust layer — biased by the current weather
// (storms are windier than a clear sky on average) and clamped to [0,1] (calm to a full gale).
const WIND_DIR_PERIOD_S = 900; // wind direction slowly drifts all the way around every 15 min
const WEATHER_WIND_BIAS = { sunny:0.7, cloudy:0.95, rainy:1.15, rainstorm:1.5, thunderstorm:1.8 };
const WIND_LEVELS = [
  { max:0.12, label:'Calm' },
  { max:0.32, label:'Light breeze' },
  { max:0.55, label:'Breezy' },
  { max:0.78, label:'Strong wind' },
  { max:Infinity, label:'Very strong wind' },
];
function smoothNoise01(t, seed){
  return 0.5 + 0.28*Math.sin(t*0.0173 + seed*1.7)
             + 0.15*Math.sin(t*0.0071 + seed*3.1)
             + 0.07*Math.sin(t*0.0311 + seed*5.9);
}
function windLabel(strength){
  for(const lvl of WIND_LEVELS) if(strength<=lvl.max) return lvl.label;
  return WIND_LEVELS[WIND_LEVELS.length-1].label;
}
function currentWind(){
  const t = Date.now()/1000;
  const { from, to, lt } = currentWeatherBlend();
  const biasFrom = WEATHER_WIND_BIAS[from.id]!=null ? WEATHER_WIND_BIAS[from.id] : 1;
  const biasTo = WEATHER_WIND_BIAS[to.id]!=null ? WEATHER_WIND_BIAS[to.id] : 1;
  const bias = lerp(biasFrom, biasTo, lt);
  const base = smoothNoise01(t, 11);
  const gust = smoothNoise01(t*7, 29);
  const strength = Math.max(0, Math.min(1, (base*0.7 + gust*0.3) * bias));
  const angle = (t/WIND_DIR_PERIOD_S)*Math.PI*2 + (smoothNoise01(t*0.4, 53)-0.5)*1.2;
  return { strength, angle };
}

let rainGeo, rainMat, rainPoints, rainVelocities;
const RAIN_COUNT = 700;
function ensureRain(){
  if(rainPoints) return;
  rainGeo = new THREE.BufferGeometry();
  const positions = new Float32Array(RAIN_COUNT*3);
  rainVelocities = new Float32Array(RAIN_COUNT);
  for(let i=0;i<RAIN_COUNT;i++){
    positions[i*3+1] = -9999;
    rainVelocities[i] = 20 + Math.random()*10;
  }
  rainGeo.setAttribute('position', new THREE.BufferAttribute(positions,3));
  rainMat = new THREE.PointsMaterial({ color:0xaad0f5, size:0.12, transparent:true, opacity:0.55, depthWrite:false });
  rainPoints = new THREE.Points(rainGeo, rainMat);
  rainPoints.frustumCulled = false;
  scene.add(rainPoints);
}
const MAX_RAIN_DRIFT = 7; // sideways speed (units/s) rain drifts at full wind strength
function updateRain(dt, intensity, wind){
  if(intensity<=0){ if(rainPoints) rainPoints.visible=false; return; }
  ensureRain();
  rainPoints.visible = true;
  const positions = rainGeo.attributes.position.array;
  const activeCount = Math.min(RAIN_COUNT, Math.round(RAIN_COUNT * Math.min(1, intensity)));
  const cx=player.pos.x, cy=player.pos.y, cz=player.pos.z;
  const windSpeed = (wind ? wind.strength : 0) * MAX_RAIN_DRIFT;
  const windDx = wind ? Math.cos(wind.angle)*windSpeed : 0;
  const windDz = wind ? Math.sin(wind.angle)*windSpeed : 0;
  for(let i=0;i<RAIN_COUNT;i++){
    if(i>=activeCount){ positions[i*3+1] = -9999; continue; }
    let y = positions[i*3+1];
    if(y < cy-2){
      positions[i*3] = cx + (Math.random()*2-1)*22;
      positions[i*3+1] = cy + 14 + Math.random()*8;
      positions[i*3+2] = cz + (Math.random()*2-1)*22;
    } else {
      positions[i*3+1] = y - rainVelocities[i]*dt;
      positions[i*3] += windDx*dt;
      positions[i*3+2] += windDz*dt;
    }
  }
  rainGeo.attributes.position.needsUpdate = true;
}
let rainSoundTimer = 0, lightningTimer = 8+Math.random()*8, windSoundTimer = 3+Math.random()*4;
let lastWeatherLabel = null, lastWindLabel = null;
function updateWeather(dt){
  const { from, to, lt } = currentWeatherBlend();
  const fogMul = lerp(from.fogMul, to.fogMul, lt);
  const darken = lerp(from.darken, to.darken, lt);
  const rain = lerp(from.rain, to.rain, lt);
  const thunderActive = lt>0.5 ? to.thunder : from.thunder;

  scene.fog.near = FAR*0.35*fogMul;
  scene.fog.far = FAR*fogMul;
  if(darken>0){
    const grayHex = lerpColorHex(scene.background.getHex(), 0x30363d, darken);
    scene.background.setHex(grayHex);
    scene.fog.color.setHex(grayHex);
  }
  hemiLight.intensity *= (1 - darken*0.6);
  sunLight.intensity *= (1 - darken*0.7);

  const wind = currentWind();
  updateRain(dt, rain, wind);

  if(rain>0 && locked){
    rainSoundTimer -= dt;
    if(rainSoundTimer<=0){
      rainSoundTimer = 0.07 + Math.random()*0.11;
      SFX.rainPatter(Math.min(0.08, 0.02 + rain*0.035));
    }
  }
  if(thunderActive && locked){
    lightningTimer -= dt;
    if(lightningTimer<=0){
      lightningTimer = 6 + Math.random()*14;
      triggerLightning();
    }
  }
  if(wind.strength>0.12 && locked){
    windSoundTimer -= dt;
    if(windSoundTimer<=0){
      windSoundTimer = 2.5 + Math.random()*2.5;
      SFX.windGust(Math.min(0.16, wind.strength*0.14), 900+wind.strength*1400);
    }
  }

  const label = to.label;
  if(label !== lastWeatherLabel){
    lastWeatherLabel = label;
    const el = document.getElementById('weatherLabel');
    if(el) el.textContent = label;
  }
  const windText = windLabel(wind.strength);
  if(windText !== lastWindLabel){
    lastWindLabel = windText;
    const el = document.getElementById('windLabel');
    if(el) el.textContent = windText;
  }
}
function triggerLightning(){
  const el = document.getElementById('lightningFlash');
  if(el){
    el.style.transition = 'none';
    el.style.opacity = '0.85';
    requestAnimationFrame(()=>{
      el.style.transition = 'opacity 0.6s ease-out';
      el.style.opacity = '0';
    });
  }
  setTimeout(()=> SFX.thunder(), 300+Math.random()*1200);
}

// ---------- Fireflies: small glowing ambiance, only out after dark ----------
// A fixed pool that's always recycled to wherever the player currently is (same trick as rain),
// so there's always a scattering of them nearby instead of only near world origin. Each blinks on
// an independent cycle (a sine wave raised to a power, so it snaps into short bright pulses with
// long dark gaps rather than smoothly breathing) and drifts lazily around its own "home" spot.
const FIREFLY_COUNT = 26;
const FIREFLY_RADIUS = 22; // recycle a firefly's home once it's this far (in x/z) from the player
let fireflyGlowTexture = null;
function buildFireflyGlowTexture(){
  const S = 32;
  const canvas = document.createElement('canvas');
  canvas.width = S; canvas.height = S;
  const ctx = canvas.getContext('2d');
  const grad = ctx.createRadialGradient(S/2,S/2,0, S/2,S/2,S/2);
  grad.addColorStop(0, 'rgba(255,255,210,1)');
  grad.addColorStop(0.35, 'rgba(215,255,140,0.9)');
  grad.addColorStop(1, 'rgba(215,255,140,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0,0,S,S);
  return new THREE.CanvasTexture(canvas);
}
const fireflies = [];
function spawnFireflyHome(f){
  let x,z,gy,tries=0;
  do{
    const ang = Math.random()*Math.PI*2, r = 6+Math.random()*16;
    x = player.pos.x + Math.cos(ang)*r;
    z = player.pos.z + Math.sin(ang)*r;
    gy = heightAt(Math.floor(x), Math.floor(z));
    tries++;
  } while(gy<=SEA_LEVEL && tries<8); // steer away from open water where reasonably possible
  f.homeX = x; f.homeZ = z;
  f.baseY = gy + 1.2 + Math.random()*1.6;
}
function ensureFireflies(){
  if(fireflies.length) return;
  if(!fireflyGlowTexture) fireflyGlowTexture = buildFireflyGlowTexture();
  for(let i=0;i<FIREFLY_COUNT;i++){
    const mat = new THREE.SpriteMaterial({ map:fireflyGlowTexture, transparent:true, opacity:0, blending:THREE.AdditiveBlending, depthWrite:false });
    const sprite = new THREE.Sprite(mat);
    sprite.scale.set(0.45,0.45,1);
    scene.add(sprite);
    const light = new THREE.PointLight(0xccff66, 0, 3.5, 2);
    scene.add(light);
    const f = {
      sprite, light, homeX:0, homeZ:0, baseY:0,
      freqX: 0.2+Math.random()*0.3, freqY: 0.3+Math.random()*0.4, freqZ: 0.2+Math.random()*0.3,
      ampXZ: 1.2+Math.random()*1.8, ampY: 0.5+Math.random()*0.7, phase: Math.random()*Math.PI*2,
      blinkSpeed: 1.2+Math.random()*1.6, blinkPhase: Math.random()*Math.PI*2,
    };
    spawnFireflyHome(f);
    fireflies.push(f);
  }
}
// 1 through the heart of the night, fading out around dawn and back in around dusk, 0 all day —
// mirrors the sunrise/sunset windows in DAY_KEYFRAMES above (~0.20-0.32 and ~0.68-0.80).
function fireflyNightFactor(){
  const t = currentDayTime();
  if(t>=0.80 || t<0.20) return 1;
  if(t<0.32) return Math.max(0, 1-(t-0.20)/0.12);
  if(t>=0.68) return Math.max(0, (t-0.68)/0.12);
  return 0;
}
function updateFireflies(dt){
  ensureFireflies();
  const night = fireflyNightFactor();
  const t = performance.now()/1000;
  for(const f of fireflies){
    const dx = f.homeX-player.pos.x, dz = f.homeZ-player.pos.z;
    if(dx*dx+dz*dz > FIREFLY_RADIUS*FIREFLY_RADIUS) spawnFireflyHome(f);
    const x = f.homeX + Math.sin(t*f.freqX+f.phase)*f.ampXZ;
    const z = f.homeZ + Math.cos(t*f.freqZ+f.phase*1.3)*f.ampXZ;
    const y = f.baseY + Math.sin(t*f.freqY+f.phase*0.7)*f.ampY;
    f.sprite.position.set(x,y,z);
    f.light.position.set(x,y,z);
    const blink = Math.pow(Math.max(0, Math.sin(t*f.blinkSpeed+f.blinkPhase)), 4);
    const vis = blink*night;
    f.sprite.material.opacity = vis*0.9;
    f.light.intensity = vis*0.9;
  }
}

// ---------- Worms: slowly eat tree leaves, breed, turn into butterflies, and can be burned to death ----------
// A single worm spawns on one of the world's trees the first time you ever load the game. Every 0.4
// in-game hours (ScoutCraft's clock, not the wall clock — DAY_LENGTH_S real seconds is a full 24-hour
// in-game day, so this works out to DAY_LENGTH_S/60 real seconds) each worm eats the nearest leaf
// block within reach (a genuine world edit, saved the same as any other block change); every 1
// in-game hour (DAY_LENGTH_S/24 real seconds) it has 2 children nearby. Population is capped so an
// unattended world can't grow it forever. Standing in an active fire cell kills it instantly, same
// "you're in the fire" test the fire-damage tick already uses for animals/players. Once a worm has
// personally eaten WORM_BUTTERFLY_THRESHOLD leaves over its lifetime, it metamorphoses into a
// butterfly right where it's standing (see the Butterflies section below) instead of continuing to
// eat/reproduce as a worm.
// Every worm's existence, position, both timers, and its running eaten-leaves count are saved to
// localStorage (see saveWorms/loadWorms) precisely so those timers survive a reload — without
// persistence every page load would reset every timer to "now", so the only way either interval
// could ever actually fire would be leaving a single tab open and never reloading it.
const WORM_EAT_INTERVAL_MS = DAY_LENGTH_S*1000 * (2/24) / 5; // one leaf block every 0.4 in-game hours (5x the original 2)
const WORM_REPRODUCE_INTERVAL_MS = DAY_LENGTH_S*1000 * (1/24); // 2 children every 1 in-game hour
const WORM_CHILDREN_PER_REPRODUCE = 2;
const WORM_MAX_POPULATION = 100;
const WORM_SEARCH_RADIUS = 6;
const WORM_BUTTERFLY_THRESHOLD = 100; // leaves eaten (lifetime) before a worm becomes a butterfly
// A worm needs real physical support underneath it — it lives either nested inside a leaf cell (the
// same spot the eat cycle above teleports it into, which is also exactly the leaf it just bit into,
// so eating routinely leaves it standing on thin air) or resting on solid ground. If neither is true —
// its leaf got eaten out from under it, a baby spawned at an offset with nothing there, or its tree
// got chopped down — it falls straight down like anything else in this world, lands on the ground,
// and then wanders in search of the nearest tree to climb back into (the existing eat cycle, once a
// leaf comes within its normal WORM_SEARCH_RADIUS, does the actual "climbing back in").
const WORM_FALL_SPEED = 3;               // blocks/sec while falling
const WORM_GROUND_SEARCH_RADIUS = 12;    // how far a grounded worm looks for a tree to head toward
const WORM_GROUND_SEARCH_INTERVAL_S = 3; // how often a grounded worm re-checks for one
const WORM_WALK_SPEED = 0.5;             // slow crawl while searching on open ground
// Set to false to turn worms off entirely — no initial spawn, no restoring a previously-saved
// population, no reproduction. Doesn't touch whatever's already saved in localStorage, so flipping
// this back on later picks the population up again right where it left off.
const WORMS_ENABLED = false;
const worms = [];
let wormGeo, wormMat;
const WORMS_KEY = 'scoutcraft_worms_v1';
function saveWorms(){
  try{
    localStorage.setItem(WORMS_KEY, JSON.stringify(worms.map(w=>({
      id:w.id, x:w.x, y:w.y, z:w.z,
      lastAteAt:w.lastAteAt, lastReproducedAt:w.lastReproducedAt, eatenCount:w.eatenCount,
    }))));
  }catch(e){}
}
function loadWorms(){
  if(!WORMS_ENABLED) return;
  let list = null;
  try{ list = JSON.parse(localStorage.getItem(WORMS_KEY) || 'null'); }catch(e){}
  if(Array.isArray(list) && list.length){
    for(const w of list) spawnWorm(w.id, w.x, w.y, w.z, w.lastAteAt, w.lastReproducedAt, w.eatenCount);
    return;
  }
  const spot = findInitialWormSpot();
  if(spot) createWorm(spot.x, spot.y, spot.z);
}
// Returns the worm's settled y if (x,y,z) is currently supported — nested inside a leaf cell, or
// resting on solid ground directly beneath it — or null if there's nothing holding it up.
function wormRestY(x,y,z){
  const bx=Math.floor(x), by=Math.floor(y), bz=Math.floor(z);
  if(getBlock(bx,by,bz)===LEAVES) return by+0.25;
  if(blockSolid(bx,by-1,bz)) return by+0.1;
  return null;
}
function findNearestLeaf(cx,cy,cz,radius){
  let best=null, bestD2=Infinity;
  const r = Math.ceil(radius), r2 = radius*radius;
  const bx=Math.floor(cx), by=Math.floor(cy), bz=Math.floor(cz);
  for(let dx=-r;dx<=r;dx++) for(let dy=-r;dy<=r;dy++) for(let dz=-r;dz<=r;dz++){
    const d2 = dx*dx+dy*dy+dz*dz;
    if(d2>r2 || d2>=bestD2) continue;
    const x=bx+dx, y=by+dy, z=bz+dz;
    if(getBlock(x,y,z)===LEAVES){ best={x,y,z}; bestD2=d2; }
  }
  return best;
}
function findInitialWormSpot(){
  for(let tries=0; tries<200; tries++){
    const x = 4+Math.floor(Math.random()*(WORLD_SIZE-8));
    const z = 4+Math.floor(Math.random()*(WORLD_SIZE-8));
    const h = heightAt(x,z);
    for(let y=h; y<h+10 && y<WORLD_HEIGHT; y++){
      if(getBlock(x,y,z)===LEAVES) return {x,y,z};
    }
  }
  return null;
}
// Adds a worm to the local scene/array — used both for a genuinely new worm (via createWorm, below,
// which passes an already block-centered position) and to restore one from loadWorms.
function spawnWorm(id,x,y,z,lastAteAt,lastReproducedAt,eatenCount){
  if(worms.length>=WORM_MAX_POPULATION || worms.some(w=>w.id===id)) return null;
  if(!wormGeo){
    wormGeo = new THREE.SphereGeometry(0.16,6,6);
    wormMat = new THREE.MeshLambertMaterial({ color: 0xc98a6b });
  }
  const mesh = new THREE.Mesh(wormGeo, wormMat);
  mesh.scale.set(1, 0.55, 2.4);
  mesh.position.set(x, y, z);
  scene.add(mesh);
  const w = { id, mesh, x, y, z, lastAteAt, lastReproducedAt, eatenCount: eatenCount||0, phase: Math.random()*Math.PI*2 };
  worms.push(w);
  return w;
}
// Spawns a brand-new worm (initial spawn or reproduction) and saves the updated population.
function createWorm(x,y,z){
  if(!WORMS_ENABLED) return null;
  if(worms.length>=WORM_MAX_POPULATION) return null;
  const now = Date.now();
  const id = 'w_'+Math.random().toString(36).slice(2,10);
  const w = spawnWorm(id, x+0.5, y+0.25, z+0.5, now, now, 0);
  if(w) saveWorms();
  return w;
}
function killWorm(w, reason){
  scene.remove(w.mesh);
  const i = worms.indexOf(w);
  if(i>=0) worms.splice(i,1);
  if(reason==='squashed'){
    invAdd(MEAT, MEAT_YIELD.worm || 1);
    saveInventory();
    updateHotbarUI();
    SFX.animalDeath();
  }
  saveWorms();
}
function updateWorms(dt){
  const now = Date.now();
  const t = performance.now()/1000;
  for(const w of Array.from(worms)){
    let burned = false;
    for(const key of fires.keys()){
      const [fx,fy,fz] = key.split(',').map(Number);
      if(Math.floor(w.x)===fx && Math.floor(w.y)===fy && Math.floor(w.z)===fz){ burned = true; break; }
    }
    if(burned){ killWorm(w, 'burned'); continue; }

    // Squash worm if player steps on it
    const dx = w.x - player.pos.x, dz = w.z - player.pos.z;
    const dist = Math.hypot(dx, dz);
    if(dist<0.4 && player.pos.y<=w.y && player.pos.y+player.height>=w.y){
      killWorm(w, 'squashed');
      continue;
    }

    // Physical support: fall if there's nothing beneath (its leaf just got eaten, its tree got
    // chopped, or it spawned at an offset with nothing there), then hunt for a tree once grounded.
    let falling = false;
    const restY = wormRestY(w.x, w.y, w.z);
    if(restY===null){
      falling = true;
      w.y -= WORM_FALL_SPEED*dt;
      const landedY = wormRestY(w.x, w.y, w.z);
      if(landedY!==null){ w.y = landedY; falling = false; }
    } else {
      w.y = restY;
    }

    if(!falling && getBlock(Math.floor(w.x), Math.floor(w.y), Math.floor(w.z))!==LEAVES){
      // Grounded but not on a tree — periodically look for one and slowly crawl toward it.
      w.groundSearchTimer = (w.groundSearchTimer||0) - dt;
      if(w.groundSearchTimer<=0){
        w.groundSearchTimer = WORM_GROUND_SEARCH_INTERVAL_S + Math.random();
        const leaf = findNearestLeaf(w.x, w.y, w.z, WORM_GROUND_SEARCH_RADIUS);
        if(leaf){ w.wanderX = leaf.x+0.5; w.wanderZ = leaf.z+0.5; }
        else { const ang = Math.random()*Math.PI*2; w.wanderX = w.x+Math.cos(ang)*4; w.wanderZ = w.z+Math.sin(ang)*4; }
      }
      if(w.wanderX!=null){
        const wdx = w.wanderX-w.x, wdz = w.wanderZ-w.z, wd = Math.hypot(wdx,wdz);
        if(wd>0.2){
          const step = Math.min(WORM_WALK_SPEED*dt, wd);
          w.x += wdx/wd*step; w.z += wdz/wd*step;
        }
      }
    }

    if(falling){
      w.mesh.position.set(w.x, w.y, w.z);
      continue; // skip eating/reproducing while it's still falling
    }

    if(now - w.lastAteAt >= WORM_EAT_INTERVAL_MS){
      w.lastAteAt = now;
      const leaf = findNearestLeaf(w.x, w.y, w.z, WORM_SEARCH_RADIUS);
      if(leaf){
        applyWorldEdit(leaf.x, leaf.y, leaf.z, AIR);
        w.x = leaf.x+0.5; w.y = leaf.y+0.25; w.z = leaf.z+0.5;
        w.eatenCount++;
      }
      saveWorms();
      if(w.eatenCount>=WORM_BUTTERFLY_THRESHOLD){
        const bx=Math.floor(w.x), by=Math.floor(w.y), bz=Math.floor(w.z);
        killWorm(w, 'butterfly');
        createButterfly(bx,by,bz);
        continue;
      }
    }
    if(now - w.lastReproducedAt >= WORM_REPRODUCE_INTERVAL_MS){
      w.lastReproducedAt = now;
      if(worms.length<WORM_MAX_POPULATION){
        for(let i=0;i<WORM_CHILDREN_PER_REPRODUCE;i++){
          createWorm(Math.floor(w.x)+(Math.random()<0.5?-1:1), Math.floor(w.y), Math.floor(w.z)+(Math.random()<0.5?-1:1));
        }
      }
      saveWorms();
    }
    w.mesh.position.set(w.x, w.y + Math.sin(t*1.5+w.phase)*0.04, w.z);
    w.mesh.rotation.y = Math.sin(t*0.3+w.phase)*0.6;
  }
}

// ---------- Gophers: dig tunnels underground ----------
// Gophers spawn underground and slowly dig tunnels through dirt, creating passages large enough
// for the player to crawl through (2 blocks wide, 2 blocks high).
const GOPHER_COUNT = 4;
const GOPHER_RADIUS = 40; // recycle a gopher's home once it's this far from player
const gophers = [];
function buildGopherMesh(){
  const g = new THREE.Group();
  const mat = new THREE.MeshLambertMaterial({ color: 0x7a6a5a });
  // Simple gopher body: rounded mound shape
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.3, 6, 6), mat);
  body.scale.set(1.2, 0.7, 1.4);
  body.castShadow = true;
  g.add(body);
  // Two small ears
  for(const side of [1,-1]){
    const ear = new THREE.Mesh(new THREE.SphereGeometry(0.1, 4, 4), mat);
    ear.position.set(side*0.2, 0.25, -0.15);
    ear.castShadow = true;
    g.add(ear);
  }
  return g;
}
function findUndergroundSpot(){
  // Find a spot 4-8 blocks underground with mostly dirt around it
  for(let tries=0; tries<40; tries++){
    const ang = Math.random()*Math.PI*2, r = 3+Math.random()*(GOPHER_RADIUS-3);
    const x = Math.floor(player.pos.x + Math.cos(ang)*r);
    const z = Math.floor(player.pos.z + Math.sin(ang)*r);
    const h = heightAt(x,z);
    const y = Math.max(3, h - 4 - Math.floor(Math.random()*4)); // 4-8 blocks below surface
    if(y<3) continue;
    // Check if there's enough dirt around
    let dirtCount = 0;
    for(let dy=-1; dy<=1; dy++) for(let dx=-1; dx<=1; dx++) for(let dz=-1; dz<=1; dz++){
      const b = getBlock(x+dx, y+dy, z+dz);
      if(b===DIRT || b===GRASS) dirtCount++;
    }
    if(dirtCount>=15) return { x:x+0.5, y:y+0.5, z:z+0.5 };
  }
  return null;
}
function spawnGopherHome(g){
  const spot = findUndergroundSpot();
  if(!spot){ g.mesh.visible = false; return; }
  g.mesh.visible = true;
  g.homeX = spot.x; g.homeY = spot.y; g.homeZ = spot.z;
  g.digTimer = 1+Math.random()*2; // time before digging next block
}
function ensureGophers(){
  if(gophers.length) return;
  for(let i=0; i<GOPHER_COUNT; i++){
    const mesh = buildGopherMesh();
    scene.add(mesh);
    const g = {
      mesh, hp:3, maxHp:3,
      homeX:0, homeY:0, homeZ:0,
      digTimer:0, digSpeed:0.3, wanderTimer:0,
    };
    spawnGopherHome(g);
    gophers.push(g);
  }
}
function updateGophers(dt){
  ensureGophers();
  for(const g of gophers){
    if(!g.mesh.visible) spawnGopherHome(g);
    if(!g.mesh.visible) continue;

    const dx = g.homeX-player.pos.x, dz = g.homeZ-player.pos.z;
    if(dx*dx+dz*dz > GOPHER_RADIUS*GOPHER_RADIUS) spawnGopherHome(g);

    // Slow underground wandering + digging
    g.wanderTimer -= dt;
    if(g.wanderTimer<=0){
      g.wanderTimer = 2+Math.random()*3;
      // Pick a random direction to wander
      const ang = Math.random()*Math.PI*2;
      g.wanderX = Math.cos(ang)*0.5; g.wanderY = (Math.random()-0.5)*0.3; g.wanderZ = Math.sin(ang)*0.5;
    }
    g.homeX += g.wanderX*g.digSpeed*dt;
    g.homeY += g.wanderY*g.digSpeed*dt;
    g.homeZ += g.wanderZ*g.digSpeed*dt;

    g.digTimer -= dt;
    if(g.digTimer<=0){
      g.digTimer = 1+Math.random()*2;
      // Dig a small tunnel (2x2x2) around the gopher
      const cx = Math.floor(g.homeX), cy = Math.floor(g.homeY), cz = Math.floor(g.homeZ);
      for(let dy=-1; dy<=0; dy++) for(let dx=-1; dx<=0; dx++) for(let dz=-1; dz<=0; dz++){
        const x = cx+dx, y = cy+dy, z = cz+dz;
        const b = getBlock(x,y,z);
        if(b===DIRT || b===GRASS){
          applyWorldEdit(x, y, z, AIR);
        }
      }
    }

    g.mesh.position.set(g.homeX, g.homeY, g.homeZ);
  }
}

// ---------- Butterflies: a worm's final form ----------
// Once a worm has eaten WORM_BUTTERFLY_THRESHOLD leaves it stops being a worm and becomes a butterfly
// right where it stood — colorful, and free to roam. Its flight path is a pure function of its
// id-derived seed and elapsed time since birth (the same wall-clock-derived trick used throughout
// this file for the sun/moon, weather, and tree species), so only its id, origin point, and birth
// time ever need saving (see saveButterflies/loadButterflies) — its color and flight parameters are
// always re-derived from the id rather than stored. It roams broadly across the whole map (a slow,
// large-radius drift with a faster flutter layered on top) but stays within BUTTERFLY_WATER_RANGE
// blocks of SEA_LEVEL vertically, and dies of old age after BUTTERFLY_LIFESPAN_MS.
const BUTTERFLY_LIFESPAN_MS = DAY_LENGTH_S*1000 * 30; // 30 in-game days
const BUTTERFLY_WATER_RANGE = 15; // stays within this many blocks of sea level, vertically
// See WORMS_ENABLED above — same idea, kept as a separate flag since a worm's metamorphosis into a
// butterfly is a distinct spawn path (createButterfly) from a worm's own initial spawn/reproduction.
const BUTTERFLIES_ENABLED = false;
const butterflies = [];
const BUTTERFLIES_KEY = 'scoutcraft_butterflies_v1';
function saveButterflies(){
  try{
    localStorage.setItem(BUTTERFLIES_KEY, JSON.stringify(butterflies.map(b=>(
      { id:b.id, x:b.originX, y:0, z:b.originZ, bornAt:b.bornAt }
    ))));
  }catch(e){}
}
function loadButterflies(){
  if(!BUTTERFLIES_ENABLED) return;
  try{
    const list = JSON.parse(localStorage.getItem(BUTTERFLIES_KEY) || '[]');
    if(Array.isArray(list)) for(const b of list) spawnButterfly(b.id, b.x, b.y, b.z, b.bornAt);
  }catch(e){}
}
function hashIdToSeed(id){
  let h=0;
  for(let i=0;i<id.length;i++) h = (h*31 + id.charCodeAt(i)) >>> 0;
  return h;
}
// Per-pixel, not canvas arcs — a symmetric two-lobe-per-side
// silhouette (a bigger upper wing, a smaller lower wing) with a dark body line down the middle, plus
// scattered dark "vein" speckles and lighter accent-hue spots so each butterfly reads as genuinely
// colorful rather than a single flat tint.
function buildButterflyTexture(seed){
  const W=40, H=28;
  const canvas = document.createElement('canvas');
  canvas.width=W; canvas.height=H;
  const ctx = canvas.getContext('2d');
  const hue = Math.floor(hash2(seed,21)*360);
  const accentHue = (hue + 30 + Math.floor(hash2(seed,22)*90)) % 360;
  const cx = W/2;
  for(let y=0;y<H;y++){
    for(let x=0;x<W;x++){
      const side = Math.abs(x-cx);
      if(side<1.2 && y>1 && y<H-2){
        ctx.fillStyle = '#241a14';
        ctx.fillRect(x,y,1,1);
        continue;
      }
      const ux=(side-9)/9, uy=(y-9)/7.5;
      const inUpper = side>1.5 && side<19 && y>1 && y<17 && ux*ux+uy*uy<1;
      const lx=(side-6)/6.5, ly=(y-20)/6.5;
      const inLower = side>1.5 && side<13 && y>=15 && y<H-1 && lx*lx+ly*ly<1;
      if(!inUpper && !inLower) continue;
      const n = hash2(x*3.1+seed*0.7, y*4.3+seed*1.3);
      const dark = n<0.12;
      const spot = !dark && n>0.82;
      const h = spot?accentHue:hue;
      const light = dark?22:(spot?68:(inUpper?58:48));
      const sat = dark?35:82;
      ctx.fillStyle = `hsl(${h},${sat}%,${light}%)`;
      ctx.fillRect(x,y,1,1);
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  return tex;
}
// A real 3D butterfly — not a camera-facing sprite — built the same way as the flame billboards
// (MeshBasicMaterial + alphaTest, so the transparent background cuts out cleanly instead of z-fighting,
// and DoubleSide so a paper-thin wing plane doesn't vanish from behind): two wing planes hinged on
// their own pivots either side of a thin 3D body, so they open/close in a real up-down flap and read
// as an actual silhouette from any angle, edge-on included, instead of a flat cutout that always faces
// you. Reuses buildButterflyTexture's existing per-butterfly pattern — since that canvas is already
// left/right symmetric (drawn from side=|x-center|), both wing planes just sample the same texture
// half rather than needing two separate textures.
function buildButterflyMesh(seed){
  const tex = buildButterflyTexture(seed);
  tex.repeat.set(0.5, 1);
  tex.offset.set(0.5, 0); // one full wing lobe's worth of the (symmetric) artwork
  const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, alphaTest: 0.3, side: THREE.DoubleSide });

  const g = new THREE.Group();
  const body = animalBox(0.035, 0.035, 0.5, new THREE.MeshBasicMaterial({ color: 0x241a14 }));
  g.add(body);

  const WING_W = 0.45, WING_H = 0.63;
  const wings = [];
  for(const side of [1,-1]){
    const pivot = new THREE.Group();
    const wingGeo = new THREE.PlaneGeometry(WING_W, WING_H);
    // PlaneGeometry starts facing the camera (its normal along Z, lying flat in the XY plane) — flapping
    // that around Z (the body's spine axis) would just spin it in place like a pinwheel, not open/close
    // it. Rotate it flat into the XZ plane first (matching the bird wings' box orientation) so the same
    // rotation.z flap genuinely swings it between spread-open (near horizontal) and folded-up (near
    // vertical), instead of just spinning the flat rectangle toward and away from the viewer.
    wingGeo.rotateX(Math.PI/2);
    wingGeo.translate(side*WING_W/2, 0, 0); // inner edge at the pivot (the body's spine), not centered
    const wingMesh = new THREE.Mesh(wingGeo, mat);
    pivot.add(wingMesh);
    pivot.userData.side = side;
    g.add(pivot);
    wings.push(pivot);
  }
  g.userData.wings = wings;
  g.userData.material = mat; // single shared material/texture, disposed once in killButterfly
  return g;
}
// The x/z wander offset from wherever the butterfly was born, at a given elapsed time — split out so
// butterflyPositionAt can subtract its own t=0 value and guarantee the flight path actually starts at
// the origin point (see below) instead of teleporting to wherever a phase-shifted curve happens to be.
function butterflyWanderOffset(seed, elapsedS){
  const driftPeriodX = 30000 + hash2(seed,1)*30000, driftPeriodZ = 30000 + hash2(seed,2)*30000;
  const driftPhaseX = hash2(seed,3)*Math.PI*2, driftPhaseZ = hash2(seed,4)*Math.PI*2;
  const driftR = WORLD_SIZE*0.38;
  const flutterPeriod = 18 + hash2(seed,5)*22, flutterPhase = hash2(seed,6)*Math.PI*2;
  const flutterR = 5 + hash2(seed,7)*6;
  const dx = Math.sin(elapsedS/driftPeriodX*Math.PI*2 + driftPhaseX)*driftR
    + Math.sin(elapsedS/flutterPeriod*Math.PI*2 + flutterPhase)*flutterR;
  const dz = Math.sin(elapsedS/driftPeriodZ*Math.PI*2 + driftPhaseZ)*driftR
    + Math.cos(elapsedS/flutterPeriod*Math.PI*2*1.3 + flutterPhase)*flutterR;
  return {dx,dz};
}
// A pure function of (seed, birth point, elapsed seconds since birth) — every client computes the
// identical flight position with no network traffic. A slow Lissajous "drift" plus a faster, smaller
// "flutter" carries it away from its birth point and across most of the map over its lifetime, always
// starting exactly at (originX, originZ) at elapsedS=0 rather than jumping there from wherever the
// underlying curve happens to be; height is an independent sine wave clamped to stay within
// BUTTERFLY_WATER_RANGE of SEA_LEVEL (not anchored to the origin — it settles into that band right
// away even if the worm turned into it high up in a tall tree).
function butterflyPositionAt(seed, originX, originZ, elapsedS){
  const at0 = butterflyWanderOffset(seed, 0);
  const atT = butterflyWanderOffset(seed, elapsedS);
  const x = Math.max(1, Math.min(WORLD_SIZE-1, originX + (atT.dx-at0.dx)));
  const z = Math.max(1, Math.min(WORLD_SIZE-1, originZ + (atT.dz-at0.dz)));

  const yPeriod = 12 + hash2(seed,8)*18, yPhase = hash2(seed,9)*Math.PI*2;
  const y = Math.max(1, Math.min(WORLD_HEIGHT-1, SEA_LEVEL + Math.sin(elapsedS/yPeriod*Math.PI*2 + yPhase)*BUTTERFLY_WATER_RANGE));
  return {x,y,z};
}
// Adds a butterfly to the local scene/array — used both for a genuinely new one (via createButterfly,
// below) and to restore one from loadButterflies.
function spawnButterfly(id,x,y,z,bornAt){
  if(butterflies.some(b=>b.id===id)) return null;
  const seed = hashIdToSeed(id);
  const mesh = buildButterflyMesh(seed);
  const p = butterflyPositionAt(seed, x, z, Math.max(0,(Date.now()-bornAt)/1000));
  mesh.position.set(p.x,p.y,p.z);
  scene.add(mesh);
  const b = { id, mesh, seed, bornAt, originX:x, originZ:z };
  butterflies.push(b);
  return b;
}
// Spawns a brand-new butterfly (a worm's metamorphosis) and saves the updated population.
function createButterfly(x,y,z){
  if(!BUTTERFLIES_ENABLED) return null;
  const id = 'b_'+Math.random().toString(36).slice(2,10);
  const b = spawnButterfly(id,x,y,z,Date.now());
  if(b) saveButterflies();
  return b;
}
function killButterfly(b){
  scene.remove(b.mesh);
  b.mesh.userData.material.map.dispose();
  b.mesh.userData.material.dispose();
  const i = butterflies.indexOf(b);
  if(i>=0) butterflies.splice(i,1);
  saveButterflies();
}
// A small time step used only to numerically estimate the flight direction (for facing yaw) from
// butterflyPositionAt's layered drift+flutter curve — safer than hand-deriving an analytic velocity
// for a function with this many mixed sin/cos terms, and cheap enough for the handful of butterflies
// that ever exist at once.
const BUTTERFLY_YAW_DT = 0.05;
function updateButterflies(dt){
  const now = Date.now();
  const t = performance.now()/1000;
  for(const b of Array.from(butterflies)){
    if(now-b.bornAt>=BUTTERFLY_LIFESPAN_MS){ killButterfly(b); continue; }
    const elapsedS = (now-b.bornAt)/1000;
    const p = butterflyPositionAt(b.seed, b.originX, b.originZ, elapsedS);
    b.mesh.position.set(p.x,p.y,p.z);

    const pNext = butterflyPositionAt(b.seed, b.originX, b.originZ, elapsedS+BUTTERFLY_YAW_DT);
    const vx = pNext.x-p.x, vz = pNext.z-p.z;
    if(vx*vx+vz*vz > 1e-8) b.mesh.rotation.y = Math.atan2(-vx,-vz);

    const flap = Math.sin(t*9+b.seed)*0.9;
    for(const wingPivot of b.mesh.userData.wings) wingPivot.rotation.z = wingPivot.userData.side*flap;
  }
}

// Shared by every ambient creature below (birds, fish, turtles, Giant Eagles) that recycles its "home"
// point to a fresh spot near the player once the old one falls too far away, then glides there smoothly
// over a short fixed window rather than teleporting. That's the right call for an ordinary recycle (a
// short hop at the edge of its radius) — but the update loop's home += (target-home)*alpha formula is
// an ease-in curve, not constant speed: regardless of how long the window nominally is, the bulk of the
// distance gets covered in roughly its first sqrt(time) fraction. So once the player covers real ground
// fast — sprinting, swimming, or riding a Giant Eagle on a long tour — and a home that's fallen far
// behind gets recycled toward the player's new, much more distant position, simply lengthening the
// window (an earlier attempt at this) barely helps: nearly all of a 500-block gap still closes in the
// first few seconds no matter what the window is set to, so it still reads as a sudden warp — and with
// the player still moving, it can retrigger and do it again every few seconds. Past a small multiple of
// the creature's normal radius, it's better to just re-materialize instantly at the new spot, exactly
// like a creature's very first spawn — nobody is watching it continuously across a gap that size anyway.
function relocateTransitionTime(fromX, fromZ, toX, toZ, radius, baseTime){
  return Math.hypot(toX-fromX, toZ-fromZ) > radius*3 ? 0 : baseTime;
}

// ---------- Birds: 30 flyable species, ambient wildlife that circles nearby and occasionally tweets ----------
// Modeled on the fireflies' "home point recycled near the player + closed-form sinusoidal drift"
// approach rather than the ground animals' wander/aggro state machine — birds fly through open 3D
// space, not along the ground, and like fireflies they're a purely local, non-persistent
// decoration: nothing about them is saved or synced, so every client just sees its own equally-alive
// sky. 20 birds are aloft at any time, cycling through the 30 species. There's no true positional audio in this
// game's synth-only sound system, so "hearing" a tweet is faked by only ever playing one for a bird
// currently within BIRD_EARSHOT_RADIUS, with volume scaled by how close it actually is.
const BIRD_SPECIES = [
  { id:'robin',       name:'Robin',       body:0x8a5a3a, accent:0xd9702f, size:1.00, pitch:1.00 },
  { id:'sparrow',     name:'Sparrow',     body:0x9a8a5f, accent:0xc9b98a, size:0.85, pitch:1.15 },
  { id:'blue_jay',    name:'Blue Jay',    body:0x3a5fbf, accent:0xe8eef5, size:1.05, pitch:0.95 },
  { id:'cardinal',    name:'Cardinal',    body:0xd41a2a, accent:0x2a2020, size:1.00, pitch:1.05 },
  { id:'crow',        name:'Crow',        body:0x1c1c1c, accent:0x3a3a3a, size:1.20, pitch:0.65 },
  { id:'bluebird',    name:'Bluebird',    body:0x3a7fd9, accent:0xd97a3a, size:0.90, pitch:1.10 },
  { id:'finch',       name:'Finch',       body:0xd9c93a, accent:0x8a9a3a, size:0.80, pitch:1.25 },
  { id:'swallow',     name:'Swallow',     body:0x1a2a4a, accent:0xe8e4d8, size:0.90, pitch:1.10 },
  { id:'dove',        name:'Dove',        body:0xc9c2b5, accent:0xa89a8a, size:1.05, pitch:0.85 },
  { id:'woodpecker',  name:'Woodpecker',  body:0x1a1a1a, accent:0xd41a2a, size:1.05, pitch:0.90 },
  { id:'owl',         name:'Owl',         body:0x7a5a3a, accent:0xc9a86a, size:1.25, pitch:0.55 },
  { id:'hawk',        name:'Hawk',        body:0x6a4a2a, accent:0xc9a06a, size:1.30, pitch:0.60 },
  { id:'eagle',       name:'Eagle',       body:0x3a2a1a, accent:0xe8e0c8, size:1.45, pitch:0.50 },
  { id:'parrot',      name:'Parrot',      body:0x2a9a4a, accent:0xd4341a, size:1.10, pitch:1.00 },
  { id:'toucan',      name:'Toucan',      body:0x1a1a1a, accent:0xf0a020, size:1.10, pitch:0.90 },
  { id:'flamingo',    name:'Flamingo',    body:0xf07aa0, accent:0xd4508a, size:1.35, pitch:0.75 },
  { id:'hummingbird', name:'Hummingbird', body:0x2a9a6a, accent:0xd4341a, size:0.55, pitch:1.60 },
  { id:'kingfisher',  name:'Kingfisher',  body:0x2a7ac9, accent:0xd9702f, size:0.85, pitch:1.15 },
  { id:'heron',       name:'Heron',       body:0x6a7a7a, accent:0xd9d4c5, size:1.35, pitch:0.65 },
  { id:'pelican',     name:'Pelican',     body:0xe8e4d8, accent:0xa89a8a, size:1.40, pitch:0.60 },
  { id:'seagull',     name:'Seagull',     body:0xe8e4d8, accent:0x9a9a9a, size:1.10, pitch:0.95 },
  { id:'magpie',      name:'Magpie',      body:0x1a1a1a, accent:0xe8e4d8, size:1.05, pitch:0.90 },
  { id:'raven',       name:'Raven',       body:0x0a0a0a, accent:0x2a2a2a, size:1.20, pitch:0.55 },
  { id:'wren',        name:'Wren',        body:0x8a6a3a, accent:0xc9a86a, size:0.60, pitch:1.40 },
  { id:'chickadee',   name:'Chickadee',   body:0x2a2a2a, accent:0xe8e4d8, size:0.65, pitch:1.35 },
  { id:'oriole',      name:'Oriole',      body:0xf0801a, accent:0x1a1a1a, size:0.95, pitch:1.05 },
  { id:'warbler',     name:'Warbler',     body:0xd4c93a, accent:0x8a9a4a, size:0.75, pitch:1.30 },
  { id:'swan',        name:'Swan',        body:0xf5f2e8, accent:0xf0a020, size:1.40, pitch:0.60 },
  { id:'duck',        name:'Duck',        body:0x2a5a3a, accent:0x8a6a3a, size:1.00, pitch:0.85 },
  { id:'goose',       name:'Goose',       body:0x8a8270, accent:0x3a3a3a, size:1.25, pitch:0.70 },
];
const BIRD_COUNT = 20;
const BIRD_RADIUS = 32; // recycle a bird's home once it's this far (x/z) from the player
const BIRD_EARSHOT_RADIUS = 20; // only a bird within this many blocks of the player is ever heard
// Birds occasionally snack on nearby worms — but only once the worm population is healthy (>=
// WORM_MIN_POPULATION_FOR_PREDATION), so birds can't ever hunt worms to extinction. A worm eaten
// this way is just gone (no meat drop — the bird ate it, not the player).
const BIRD_EAT_WORM_INTERVAL_S = 6; // how often each bird checks for a nearby worm to eat
const BIRD_EAT_WORM_RADIUS = 3; // how close a worm needs to be to the bird's current position
const WORM_MIN_POPULATION_FOR_PREDATION = 10;
const birds = [];
const birdMatCache = new Map(); // species.id -> {body, accent} materials, shared across that species' instances
const birdBeakMat = new THREE.MeshLambertMaterial({ color: 0xe8a83d });
function birdMaterials(species){
  let m = birdMatCache.get(species.id);
  if(!m){
    m = { body: new THREE.MeshLambertMaterial({ color: species.body }), accent: new THREE.MeshLambertMaterial({ color: species.accent }) };
    // species.head is optional — only a bald-eagle-style distinct head color (the Giant Eagle) sets
    // it; every regular species falls back to the same body material its wings/torso already use.
    m.head = species.head!=null ? new THREE.MeshLambertMaterial({ color: species.head }) : m.body;
    birdMatCache.set(species.id, m);
  }
  return m;
}
// A genuinely 3D low-poly bird — body/head/beak/tail plus two wings on flapping hinges, all simple
// boxes composed into a THREE.Group, the exact same "compose primitives" approach the animal models
// already use (see makeQuadruped/animalBox above). Replaces an earlier billboard-sprite version that
// always faced the camera and read as a flat cutout from any angle other than straight-on; a real 3D
// shape actually looks like a bird — and looks like a DIFFERENT bird depending which way you're
// looking at it from — the way a sprite fundamentally can't.
function buildBirdMesh(species){
  const { body: bodyMat, accent: accentMat, head: headMat } = birdMaterials(species);
  const g = new THREE.Group();

  g.add(animalBox(0.22, 0.2, 0.42, bodyMat));
  const belly = animalBox(0.17, 0.1, 0.26, accentMat);
  belly.position.set(0, -0.09, 0.02);
  g.add(belly);

  const head = animalBox(0.15, 0.15, 0.15, headMat);
  head.position.set(0, 0.09, -0.25); // -Z is "forward", matching the rest of this file's convention
  g.add(head);
  const beak = animalBox(0.05, 0.05, 0.13, birdBeakMat);
  beak.position.set(0, 0.07, -0.38);
  g.add(beak);

  const tail = animalBox(0.05, 0.1, 0.24, accentMat);
  tail.position.set(0, 0.02, 0.33);
  tail.rotation.x = 0.2;
  g.add(tail);

  // Each wing is a box offset from its own pivot group, not centered on it, so rotating the pivot
  // around Z swings the wing up/down about the shoulder like a real hinge instead of the wing's own
  // center.
  const wings = [];
  for(const side of [1,-1]){
    const pivot = new THREE.Group();
    pivot.position.set(side*0.11, 0.03, 0);
    const wing = animalBox(0.34, 0.03, 0.2, bodyMat);
    wing.geometry.translate(side*0.17, 0, 0);
    pivot.add(wing);
    pivot.userData.side = side;
    g.add(pivot);
    wings.push(pivot);
  }
  g.userData.wings = wings;
  g.scale.setScalar(species.size);
  g.traverse(o => { if(o.isMesh) o.castShadow = true; });
  return g;
}
function spawnBirdHome(b){
  const ang = Math.random()*Math.PI*2, r = 8+Math.random()*(BIRD_RADIUS-8);
  const x = player.pos.x + Math.cos(ang)*r;
  const z = player.pos.z + Math.sin(ang)*r;
  const targetBaseY = heightAt(Math.floor(x), Math.floor(z)) + 6 + Math.random()*8; // above the canopy line
  // Smoothly transition to a new home instead of teleporting instantly — see relocateTransitionTime.
  b.transitionTime = relocateTransitionTime(b.homeX, b.homeZ, x, z, BIRD_RADIUS, 1.5);
  b.homeXTarget = x; b.homeZTarget = z; b.baseYTarget = targetBaseY;
  b.transitionElapsed = 0;
  // First spawn, or the gap is large enough that animating it would look like a warp either way —
  // just re-materialize there directly instead of easing toward it.
  if((b.homeX===0 && b.homeZ===0) || b.transitionTime===0){
    b.homeX = x; b.homeZ = z; b.baseY = targetBaseY;
    b.homeXTarget = x; b.homeZTarget = z; b.baseYTarget = targetBaseY;
    b.transitionTime = 0;
  }
}
function ensureBirds(){
  if(birds.length) return;
  for(let i=0;i<BIRD_COUNT;i++){
    const species = BIRD_SPECIES[i % BIRD_SPECIES.length];
    const mesh = buildBirdMesh(species);
    scene.add(mesh);
    const b = {
      mesh, species, homeX:0, homeZ:0, baseY:0,
      hp: 2, maxHp: 2,
      freqX: 0.15+Math.random()*0.2, freqY: 0.4+Math.random()*0.5, freqZ: 0.15+Math.random()*0.2,
      ampXZ: 5+Math.random()*7, ampY: 1+Math.random()*1.5, phase: Math.random()*Math.PI*2,
      tweetTimer: 2+Math.random()*8, flapPhase: Math.random()*Math.PI*2, flapSpeed: 9+Math.random()*4,
      eatWormTimer: Math.random()*BIRD_EAT_WORM_INTERVAL_S,
    };
    spawnBirdHome(b);
    birds.push(b);
  }
}
function updateBirds(dt){
  ensureBirds();
  const t = performance.now()/1000;
  for(const b of birds){
    // Smooth transition to new home point over 1.5 seconds
    if(b.transitionTime > 0){
      b.transitionElapsed += dt;
      const alpha = Math.min(1, b.transitionElapsed / b.transitionTime);
      b.homeX += (b.homeXTarget - b.homeX) * alpha;
      b.homeZ += (b.homeZTarget - b.homeZ) * alpha;
      b.baseY += (b.baseYTarget - b.baseY) * alpha;
    }

    const dx = b.homeXTarget-player.pos.x, dz = b.homeZTarget-player.pos.z;
    if(dx*dx+dz*dz > BIRD_RADIUS*BIRD_RADIUS) spawnBirdHome(b);
    const ax = t*b.freqX+b.phase, az = t*b.freqZ+b.phase*1.3, ay = t*b.freqY+b.phase*0.7;
    const x = b.homeX + Math.sin(ax)*b.ampXZ;
    const z = b.homeZ + Math.cos(az)*b.ampXZ;
    const y = Math.max(2, b.baseY + Math.sin(ay)*b.ampY);
    b.mesh.position.set(x,y,z);
    // Face the direction it's actually moving — the analytic derivative of the x/z formulas above —
    // using the same atan2(-vx,-vz) convention the player itself uses for yaw-from-forward-vector.
    const vx = Math.cos(ax)*b.freqX*b.ampXZ, vz = -Math.sin(az)*b.freqZ*b.ampXZ;
    if(vx*vx+vz*vz > 0.0001) b.mesh.rotation.y = Math.atan2(-vx,-vz);

    b.flapPhase += dt*b.flapSpeed;
    const flap = Math.sin(b.flapPhase)*0.9;
    for(const wingPivot of b.mesh.userData.wings) wingPivot.rotation.z = wingPivot.userData.side*flap;

    b.tweetTimer -= dt;
    if(b.tweetTimer<=0){
      b.tweetTimer = 4+Math.random()*8;
      const dist = Math.hypot(x-player.pos.x, y-(player.pos.y+player.eye), z-player.pos.z);
      if(dist < BIRD_EARSHOT_RADIUS) SFX.birdTweet(b.species.pitch, Math.max(0,1-dist/BIRD_EARSHOT_RADIUS)*0.13);
    }

    b.eatWormTimer -= dt;
    if(b.eatWormTimer<=0){
      b.eatWormTimer = BIRD_EAT_WORM_INTERVAL_S*0.5 + Math.random()*BIRD_EAT_WORM_INTERVAL_S;
      if(worms.length >= WORM_MIN_POPULATION_FOR_PREDATION){
        let nearest = null, bestD2 = BIRD_EAT_WORM_RADIUS*BIRD_EAT_WORM_RADIUS;
        for(const w of worms){
          const wdx = w.x-x, wdy = w.y-y, wdz = w.z-z;
          const d2 = wdx*wdx+wdy*wdy+wdz*wdz;
          if(d2<bestD2){ nearest = w; bestD2 = d2; }
        }
        if(nearest) killWorm(nearest, 'eaten');
      }
    }
  }
}

// ---------- Big Eagles: 2 apex predators that hunt other birds and fish ----------
// Reuses the exact same bird model (buildBirdMesh) and home-point-recycling as the regular birds
// above, just scaled way up and with its own slower, more majestic wingbeat — same "one model,
// differentiate by size/color" approach used for the big Shark/Whale Shark fish. Unlike a regular
// bird's Lissajous-ish drift, an eagle actually circles — a true closed loop around its home point,
// the way a real bird of prey soars while scanning the ground — with the two eagles independently
// randomized to circle clockwise or counterclockwise. Only 2 exist, ranging much further than a
// regular bird (BIG_EAGLE_RADIUS). Roughly once per in-game day each one hunts down the 2 nearest
// birds/fish within range and eats them — a clean kill, no meat drop (see damageBirdOrFish's
// awardMeat flag: only a kill the player lands themselves ever puts Meat in their inventory, same
// reasoning as birds eating worms below WORM_MIN_POPULATION_FOR_PREDATION). They're themselves
// attackable and drop Meat like every other creature here.
const BIG_EAGLE_COUNT = 2;
// Land on a Giant Eagle's back (fall onto it from above, same as landing on any big animal) and you
// ride it: it stops circling and instead flies a slow, broad tour of random points across the whole
// map, like a sightseeing bus, carrying you along — see the riding branch at the top of updatePlayer
// and the beingRidden branch in updateBigEagles. Press Space to get off wherever you currently are;
// the eagle then picks a fresh home nearby and goes back to its normal circling.
const EAGLE_MOUNT_RADIUS = 1.1;   // how close (horizontally) counts as "landed on its back"
const EAGLE_MOUNT_HEIGHT = 0.75;  // how tall its body reads for mounting/sitting purposes
const EAGLE_TOUR_SPEED = 9;       // blocks/sec while touring with a rider
// Classic bald-eagle coloring: near-black body/wings, a white head (birdMaterials' optional `head`
// override — every regular bird species omits it and just reuses its body color), and the golden
// beak every bird already has for free (birdBeakMat, shared globally).
const BIG_EAGLE_SPECIES = { id:'bigeagle', name:'Giant Eagle', body:0x1c1c1c, accent:0xe8dcc8, head:0xf5f2e8, size:3.0, pitch:0.4 };
const BIG_EAGLE_RADIUS = 40;
const BIG_EAGLE_HUNT_INTERVAL_MS = DAY_LENGTH_S*1000; // once per in-game day
const BIG_EAGLE_HUNT_RADIUS = 15;
const BIG_EAGLE_PREY_PER_HUNT = 2; // eats double what it used to
const bigEagles = [];
function spawnBigEagleHome(e){
  const ang = Math.random()*Math.PI*2, r = 10+Math.random()*(BIG_EAGLE_RADIUS-10);
  const x = player.pos.x + Math.cos(ang)*r;
  const z = player.pos.z + Math.sin(ang)*r;
  const targetBaseY = heightAt(Math.floor(x), Math.floor(z)) + 10 + Math.random()*10; // soars higher than regular birds
  e.transitionTime = relocateTransitionTime(e.homeX, e.homeZ, x, z, BIG_EAGLE_RADIUS, 2);
  e.homeXTarget = x; e.homeZTarget = z; e.baseYTarget = targetBaseY;
  e.transitionElapsed = 0;
  if((e.homeX===0 && e.homeZ===0) || e.transitionTime===0){
    e.homeX = x; e.homeZ = z; e.baseY = targetBaseY;
    e.homeXTarget = x; e.homeZTarget = z; e.baseYTarget = targetBaseY;
    e.transitionTime = 0;
  }
}
function ensureBigEagles(){
  if(bigEagles.length) return;
  for(let i=0;i<BIG_EAGLE_COUNT;i++){
    const mesh = buildBirdMesh(BIG_EAGLE_SPECIES);
    scene.add(mesh);
    const e = {
      mesh, species: BIG_EAGLE_SPECIES, homeX:0, homeZ:0, baseY:0,
      hp: 4, maxHp: 4,
      // A true circle around the home point — period 20-40s, independently clockwise or
      // counterclockwise per eagle — plus a gentle independent bob in altitude.
      circleRadius: 10+Math.random()*8,
      angularSpeed: (Math.PI*2/(20+Math.random()*20)) * (Math.random()<0.5 ? 1 : -1),
      anglePhase: Math.random()*Math.PI*2,
      freqY: 0.15+Math.random()*0.1, ampY: 1.5+Math.random()*1.5, phaseY: Math.random()*Math.PI*2,
      flapPhase: Math.random()*Math.PI*2, flapSpeed: 4+Math.random()*2, // slower, more majestic than small birds
      // Staggered so the two eagles don't both hunt the instant the world loads.
      lastHuntAt: Date.now() - Math.random()*BIG_EAGLE_HUNT_INTERVAL_MS,
      beingRidden: false, tourTargetX:0, tourTargetY:0, tourTargetZ:0, tourTimer:0,
    };
    spawnBigEagleHome(e);
    bigEagles.push(e);
  }
}
function updateBigEagles(dt){
  ensureBigEagles();
  const t = performance.now()/1000;
  const now = Date.now();
  for(const e of bigEagles){
    if(e.beingRidden){
      // Touring: fly a slow, broad, meandering route — a fresh random point anywhere on the map every
      // time it gets close to (or takes too long reaching) the last one — instead of circling home.
      e.tourTimer -= dt;
      const dtx = e.tourTargetX - e.mesh.position.x, dtz = e.tourTargetZ - e.mesh.position.z;
      const tourDist = Math.hypot(dtx, dtz);
      if(e.tourTimer<=0 || tourDist<3){
        e.tourTargetX = 4 + Math.random()*(WORLD_SIZE-8);
        e.tourTargetZ = 4 + Math.random()*(WORLD_SIZE-8);
        e.tourTargetY = heightAt(Math.floor(e.tourTargetX), Math.floor(e.tourTargetZ)) + 12 + Math.random()*10;
        e.tourTimer = 20 + Math.random()*15; // a generous safety timeout, in case it can't quite reach
      }
      if(tourDist>0.01){
        const step = Math.min(EAGLE_TOUR_SPEED*dt, tourDist);
        e.mesh.position.x += dtx/tourDist*step;
        e.mesh.position.z += dtz/tourDist*step;
        e.mesh.rotation.y = Math.atan2(-dtx/tourDist, -dtz/tourDist);
      }
      const dyToTarget = e.tourTargetY - e.mesh.position.y;
      e.mesh.position.y += Math.sign(dyToTarget) * Math.min(Math.abs(dyToTarget), EAGLE_TOUR_SPEED*dt);

      e.flapPhase += dt*e.flapSpeed;
      const flap = Math.sin(e.flapPhase)*0.7;
      for(const wingPivot of e.mesh.userData.wings) wingPivot.rotation.z = wingPivot.userData.side*flap;
      continue; // no circling, no hunting, while it's busy giving a tour
    }

    if(e.transitionTime > 0){
      e.transitionElapsed += dt;
      const alpha = Math.min(1, e.transitionElapsed / e.transitionTime);
      e.homeX += (e.homeXTarget - e.homeX) * alpha;
      e.homeZ += (e.homeZTarget - e.homeZ) * alpha;
      e.baseY += (e.baseYTarget - e.baseY) * alpha;
    }

    const dx = e.homeXTarget-player.pos.x, dz = e.homeZTarget-player.pos.z;
    if(dx*dx+dz*dz > BIG_EAGLE_RADIUS*BIG_EAGLE_RADIUS) spawnBigEagleHome(e);

    const angle = t*e.angularSpeed + e.anglePhase;
    const x = e.homeX + Math.cos(angle)*e.circleRadius;
    const z = e.homeZ + Math.sin(angle)*e.circleRadius;
    const y = Math.max(4, e.baseY + Math.sin(t*e.freqY+e.phaseY)*e.ampY);
    e.mesh.position.set(x,y,z);
    // Face the direction of travel along the circle — the analytic tangent of (cos,sin)(angle) —
    // same atan2(-vx,-vz) convention used everywhere else in this file.
    const vx = -Math.sin(angle)*e.angularSpeed, vz = Math.cos(angle)*e.angularSpeed;
    if(vx*vx+vz*vz > 0.0001) e.mesh.rotation.y = Math.atan2(-vx,-vz);

    e.flapPhase += dt*e.flapSpeed;
    const flap = Math.sin(e.flapPhase)*0.7;
    for(const wingPivot of e.mesh.userData.wings) wingPivot.rotation.z = wingPivot.userData.side*flap;

    if(now - e.lastHuntAt >= BIG_EAGLE_HUNT_INTERVAL_MS){
      const candidates = [];
      for(const b of birds){
        const bdx=b.mesh.position.x-x, bdy=b.mesh.position.y-y, bdz=b.mesh.position.z-z;
        const d2 = bdx*bdx+bdy*bdy+bdz*bdz;
        if(d2 < BIG_EAGLE_HUNT_RADIUS*BIG_EAGLE_HUNT_RADIUS) candidates.push({ref:b, type:'bird', d2});
      }
      for(const f of fish){
        const fdx=f.mesh.position.x-x, fdy=f.mesh.position.y-y, fdz=f.mesh.position.z-z;
        const d2 = fdx*fdx+fdy*fdy+fdz*fdz;
        if(d2 < BIG_EAGLE_HUNT_RADIUS*BIG_EAGLE_HUNT_RADIUS) candidates.push({ref:f, type:'fish', d2});
      }
      candidates.sort((a,b)=>a.d2-b.d2);
      const prey = candidates.slice(0, BIG_EAGLE_PREY_PER_HUNT);
      if(prey.length){
        e.lastHuntAt = now;
        for(const c of prey) damageBirdOrFish(c.ref, c.ref.hp, c.type, false);
      }
    }
  }
}

// ---------- Kayak: a fixed prop moored at the lake near camp — hop in and it paddles a slow loop
// around the lake entirely on its own, the same "along for the ride" idea as riding a Giant Eagle
// (see player.ridingEagle above: position overridden every frame, mouse-look untouched) but grounded
// in something a Scout would actually do at camp. The loop's center/radius were picked by hand
// against this seed's real generated terrain (see heightAt) so the whole circle stays over open
// water without ever brushing the shore, and the dock sits exactly on that circle so the ride starts
// with no snap. It's a free-standing THREE mesh like the animals, not a voxel block — nothing to
// place or break.
const KAYAK_LAKE_CENTER = { x: 54, z: 29 };
const KAYAK_LAKE_RADIUS = 10;
const KAYAK_START_ANGLE = Math.atan2(9.5, 3.5); // the dock's own angle on the circle
const KAYAK_SPEED = 2; // blocks/second — a full loop takes ~31s, about one badge's worth
const KAYAK_ANGULAR_SPEED = KAYAK_SPEED / KAYAK_LAKE_RADIUS;
const KAYAK_ENTER_RADIUS = 1.3;
const KAYAK_SIT_Y = SEA_LEVEL + 0.35; // floating just above the water surface
let kayakMesh = null;
let kayakAngle = KAYAK_START_ANGLE;
function kayakDockPos(){
  return {
    x: KAYAK_LAKE_CENTER.x + Math.cos(KAYAK_START_ANGLE)*KAYAK_LAKE_RADIUS,
    z: KAYAK_LAKE_CENTER.z + Math.sin(KAYAK_START_ANGLE)*KAYAK_LAKE_RADIUS,
  };
}
// Box-composition build, same technique as the fish/bird models above: a flattened hull, two corner-
// rotated boxes at bow and stern to read as points from above, a dark cockpit rim, and a paddle laid
// across it at rest.
function buildKayakMesh(){
  const g = new THREE.Group();
  const hullMat = new THREE.MeshLambertMaterial({ color: 0xf0b429 });
  const rimMat = new THREE.MeshLambertMaterial({ color: 0x2a2420 });
  const hull = animalBox(0.85, 0.3, 1.9, hullMat);
  hull.position.y = 0.15;
  g.add(hull);
  for(const side of [1,-1]){
    const cap = animalBox(0.6, 0.3, 0.6, hullMat);
    cap.position.set(0, 0.15, side*1.28);
    cap.rotation.y = Math.PI/4;
    g.add(cap);
  }
  const cockpit = animalBox(0.5, 0.08, 0.9, rimMat);
  cockpit.position.y = 0.32;
  g.add(cockpit);
  const paddle = new THREE.Group();
  const shaftMat = new THREE.MeshLambertMaterial({ color: 0x8a6a3a });
  paddle.add(animalBox(0.06, 0.06, 1.4, shaftMat));
  for(const side of [1,-1]){
    const blade = animalBox(0.18, 0.03, 0.35, hullMat);
    blade.position.z = side*0.72;
    paddle.add(blade);
  }
  paddle.rotation.y = Math.PI/5;
  paddle.position.set(0.1, 0.4, 0);
  g.add(paddle);
  return g;
}
function buildKayak(){
  kayakMesh = buildKayakMesh();
  const dock = kayakDockPos();
  kayakMesh.position.set(dock.x, KAYAK_SIT_Y, dock.z);
  scene.add(kayakMesh);
}
// Walking (or swimming) up to the moored kayak hops you in automatically — no key needed, same as
// stepping into the flow of a real dock. Checked every normal-movement frame from updatePlayer.
function tryEnterKayak(){
  if(player.inKayak || player.ridingEagle || player.ridingHorse || isDead) return;
  const dock = kayakDockPos();
  const dx = player.pos.x-dock.x, dz = player.pos.z-dock.z;
  if(dx*dx+dz*dz > KAYAK_ENTER_RADIUS*KAYAK_ENTER_RADIUS) return;
  player.inKayak = true;
  kayakAngle = KAYAK_START_ANGLE;
  player.vel.set(0,0,0);
  addChatMessage('Camp', '🛶 You hop in the kayak — it starts paddling on its own!');
}
function updateKayakRide(dt){
  kayakAngle += KAYAK_ANGULAR_SPEED*dt;
  const x = KAYAK_LAKE_CENTER.x + Math.cos(kayakAngle)*KAYAK_LAKE_RADIUS;
  const z = KAYAK_LAKE_CENTER.z + Math.sin(kayakAngle)*KAYAK_LAKE_RADIUS;
  player.pos.set(x, KAYAK_SIT_Y, z);
  player.vel.set(0,0,0);
  player.onGround = false;
  // Face of travel — same atan2(-vx,-vz) tangent convention as the eagle's circling above.
  const vx = -Math.sin(kayakAngle), vz = Math.cos(kayakAngle);
  kayakMesh.position.set(x, KAYAK_SIT_Y, z);
  kayakMesh.rotation.y = Math.atan2(-vx, -vz);
}

// ---------- Horse: tied up at camp — mount it and steer it yourself, unlike the hands-free Kayak
// above or riding a Giant Eagle. Reuses the same box-composition makeQuadruped/animateQuadrupedWalk
// helpers as the regular wildlife (see ANIMAL_BUILDERS) but isn't one of ANIMAL_TYPES — a single named
// mount kept deliberately outside the wildlife roster, same precedent as the Big Eagles being their
// own array rather than ordinary birds.
const HORSE_MOUNT_RADIUS = 1.3;
const HORSE_MOUNT_HEIGHT = 1.7; // eye-to-saddle offset above the ground the horse is standing on
const HORSE_GALLOP_SPEED = 12;  // faster than SPRINT_SPEED (8.4)
const HORSEBACK_BADGE_BLOCKS = 200;
let horseMesh = null;
const horseWalkState = { phase: 0, amp: 0 };
function horseHomePos(){
  const { x: x0, z: z0 } = COOKING_AREA_ORIGIN;
  return { x: x0+2.5, z: z0+2.5 }; // a free corner of the clearing, clear of every cooking station
}
function buildHorseMesh(){
  const bodyMat = new THREE.MeshLambertMaterial({ color: 0x6b4423 });
  const maneMat = new THREE.MeshLambertMaterial({ color: 0x2a1a10 });
  return makeQuadruped({
    bodyW:0.8, bodyH:0.65, bodyD:1.35, bodyY:1.25, bodyMat,
    legW:0.14,
    headW:0.32, headH:0.4, headD:0.55, headY:1.62, headZ:-0.85,
    extras(g){
      const earL=animalBox(0.08,0.16,0.08,bodyMat); earL.position.set(-0.11,1.86,-0.7); earL.rotation.z=0.2; g.add(earL);
      const earR=animalBox(0.08,0.16,0.08,bodyMat); earR.position.set(0.11,1.86,-0.7); earR.rotation.z=-0.2; g.add(earR);
      // Mane: a row of dark segments along the top of the neck, tallest near the head.
      for(let i=0;i<4;i++){
        const seg = animalBox(0.1, 0.18-i*0.02, 0.14, maneMat);
        seg.position.set(0, 1.66-i*0.03, -0.55+i*0.16);
        g.add(seg);
      }
      // Tail: two hanging segments off the back, angled backward.
      const t1=animalBox(0.12,0.35,0.12,maneMat); t1.position.set(0,1.05,0.68); t1.rotation.x=0.25; g.add(t1);
      const t2=animalBox(0.1,0.3,0.1,maneMat); t2.position.set(0,0.78,0.8); t2.rotation.x=0.35; g.add(t2);
    },
  });
}
function buildHorse(){
  horseMesh = buildHorseMesh();
  const home = horseHomePos();
  horseMesh.position.set(home.x, COOKING_AREA_Y+1, home.z);
  scene.add(horseMesh);
}
// Walking (or swimming) up to the horse mounts it automatically — no key needed, same as the Kayak's
// dock. Checked against wherever the horse actually currently stands (not its original tied-up spot),
// since dismounting leaves it right where you left it rather than snapping back — a grounded animal
// staying put is more natural than the Kayak paddling off without you.
let horseRemountBlockedUntil = 0;
function tryMountHorse(){
  if(player.ridingHorse || player.ridingEagle || player.inKayak || isDead) return;
  if(performance.now() < horseRemountBlockedUntil) return;
  const dx = player.pos.x-horseMesh.position.x, dz = player.pos.z-horseMesh.position.z;
  if(dx*dx+dz*dz > HORSE_MOUNT_RADIUS*HORSE_MOUNT_RADIUS) return;
  player.ridingHorse = true;
  player.vel.set(0,0,0);
  addChatMessage('Camp', '🐴 You mount up!');
}
// Unlike the Kayak, this one you actually steer: same WASD-relative-to-look-direction convention as
// ordinary walking, just faster, with no gravity/jump/collision — the horse always rides the ground
// surface directly under it (see groundHeightAt, the same lookup regular land animals use).
function updateHorseRide(dt){
  const fx = -Math.sin(player.yaw), fz = -Math.cos(player.yaw);
  const rx =  Math.cos(player.yaw), rz = -Math.sin(player.yaw);
  let mx=0, mz=0;
  if(keys['KeyW']){ mx+=fx; mz+=fz; }
  if(keys['KeyS']){ mx-=fx; mz-=fz; }
  if(keys['KeyD']){ mx+=rx; mz+=rz; }
  if(keys['KeyA']){ mx-=rx; mz-=rz; }
  const len = Math.hypot(mx,mz);
  const moving = len>0;
  if(moving){ mx/=len; mz/=len; }
  const dx = mx*HORSE_GALLOP_SPEED*dt, dz = mz*HORSE_GALLOP_SPEED*dt;
  player.pos.x = Math.max(1, Math.min(WORLD_SIZE-1, player.pos.x+dx));
  player.pos.z = Math.max(1, Math.min(WORLD_SIZE-1, player.pos.z+dz));
  const groundY = groundHeightAt(player.pos.x, player.pos.z);
  player.pos.y = groundY + HORSE_MOUNT_HEIGHT;
  player.vel.set(0,0,0);
  player.onGround = true;
  if(moving){
    scoutStats.horsebackBlocks += Math.hypot(dx,dz);
    checkBadges();
  }
  horseMesh.position.set(player.pos.x, groundY, player.pos.z);
  horseMesh.rotation.y = player.yaw;
  animateQuadrupedWalk(horseMesh, horseWalkState, dt, moving, 2.2);
}

// ---------- Fish: swim in the water, ambient wildlife ----------
// Same local-only, recycled-near-the-player home-point approach as birds/fireflies, but a fish's home
// is a specific nearby water column (found by scanning for heightAt(x,z) < SEA_LEVEL, the exact
// condition world generation itself uses to flood a column) and its drift is clamped to that column's
// real water depth (its bottom is the terrain, its top is SEA_LEVEL) rather than open space. If no
// water happens to be within FISH_RADIUS of the player (deep inland) a fish just stays invisible until
// one wanders into range, instead of popping up stranded on dry land.
// size is a multiplier on buildFishMesh's total nose-to-tail length (0.48 local units: the 0.32-long
// body plus the tail fin that extends further back off its own pivot) — so size 4.167 / 6.25 come out
// to exactly 2 / 3 blocks long nose-to-tail. Big fish are deliberately rarer (count) and need deeper
// water to swim in without clipping the sea floor or surface (minDepth) than the regular schooling
// fish, which default to count:4 and minDepth:1.
const FISH_SPECIES = [
  { id:'goldfish',   name:'Goldfish',   body:0xf0801a, accent:0xffe0a0, size:0.75 },
  { id:'bass',       name:'Bass',       body:0x5a7a5a, accent:0x2a3a2a, size:1.10 },
  { id:'salmon',     name:'Salmon',     body:0xe08a8a, accent:0xc95a6a, size:1.00 },
  { id:'tuna',       name:'Tuna',       body:0x3a5a7a, accent:0xd8e0e8, size:1.30 },
  { id:'clownfish',  name:'Clownfish',  body:0xf0601a, accent:0xffffff, size:0.65 },
  { id:'catfish',    name:'Catfish',    body:0x6a5a4a, accent:0x4a3a2a, size:1.15 },
  { id:'shark',      name:'Shark',      body:0x74828c, accent:0xe8ecec, size:4.167, count:2, hp:3, minDepth:2 },
  { id:'whaleshark', name:'Whale Shark',body:0x2f4a5c, accent:0xcfe0e8, size:6.25,  count:1, hp:5, minDepth:3 },
];
const FISH_COUNT = FISH_SPECIES.reduce((sum,s)=>sum+(s.count||4), 0);
const FISH_RADIUS = 26;
const fish = [];
const fishMatCache = new Map(); // species.id -> {body, accent} materials, shared across that species' instances
const fishEyeMat = new THREE.MeshLambertMaterial({ color: 0x141414 });
function fishMaterials(species){
  let m = fishMatCache.get(species.id);
  if(!m){
    m = { body: new THREE.MeshLambertMaterial({ color: species.body }), accent: new THREE.MeshLambertMaterial({ color: species.accent }) };
    fishMatCache.set(species.id, m);
  }
  return m;
}
// A real 3D torpedo body (same "compose animalBox primitives into a THREE.Group" approach as the
// birds and the animal models) — a body, a belly stripe, two eye dots, a dorsal fin, two side
// (pectoral) fins, and a tail on its own pivot so it can wiggle side to side like a swimming fish
// actually does, instead of flapping like a bird's wings.
function buildFishMesh(species){
  const { body: bodyMat, accent: accentMat } = fishMaterials(species);
  const g = new THREE.Group();

  g.add(animalBox(0.14, 0.13, 0.32, bodyMat));
  const belly = animalBox(0.1, 0.06, 0.22, accentMat);
  belly.position.set(0, -0.06, 0.02);
  g.add(belly);

  for(const side of [1,-1]){
    const eye = animalBox(0.02, 0.02, 0.02, fishEyeMat);
    eye.position.set(side*0.06, 0.02, -0.13);
    g.add(eye);
  }

  const dorsal = animalBox(0.02, 0.08, 0.1, accentMat);
  dorsal.position.set(0, 0.09, 0);
  g.add(dorsal);

  for(const side of [1,-1]){
    const fin = animalBox(0.1, 0.02, 0.08, accentMat);
    fin.position.set(side*0.08, -0.01, -0.08);
    fin.rotation.z = side*0.4;
    g.add(fin);
  }

  const tailPivot = new THREE.Group();
  tailPivot.position.set(0, 0, 0.16);
  const tail = animalBox(0.02, 0.12, 0.16, accentMat);
  tail.geometry.translate(0, 0, 0.08); // offset so it extends backward from the pivot, not centered on it
  tailPivot.add(tail);
  g.add(tailPivot);

  g.userData.tail = tailPivot;
  g.scale.setScalar(species.size);
  g.traverse(o => { if(o.isMesh) o.castShadow = true; });
  return g;
}
function findFishSpot(minDepth){
  for(let tries=0; tries<20; tries++){
    const ang = Math.random()*Math.PI*2, r = 4+Math.random()*(FISH_RADIUS-4);
    const x = Math.floor(player.pos.x + Math.cos(ang)*r);
    const z = Math.floor(player.pos.z + Math.sin(ang)*r);
    const h = heightAt(x,z);
    if(h < SEA_LEVEL && SEA_LEVEL-h >= (minDepth||1)) return { x:x+0.5, z:z+0.5, bottom:h+1, top:SEA_LEVEL };
  }
  return null;
}
function spawnFishHome(f){
  const spot = findFishSpot(f.species.minDepth);
  if(!spot){ f.hasHome = false; f.mesh.visible = false; return; }
  f.hasHome = true; f.mesh.visible = true;
  f.bottom = spot.bottom; f.top = spot.top;
  const depth = spot.top - spot.bottom + 1;
  const targetBaseY = spot.bottom + depth/2;
  // Smoothly transition to a new home instead of teleporting instantly — see relocateTransitionTime.
  f.transitionTime = relocateTransitionTime(f.homeX, f.homeZ, spot.x, spot.z, FISH_RADIUS, 1.5);
  f.homeXTarget = spot.x; f.homeZTarget = spot.z; f.baseYTarget = targetBaseY;
  f.transitionElapsed = 0;
  // First spawn, or the gap is large enough that animating it would look like a warp either way.
  if((f.homeX===0 && f.homeZ===0) || f.transitionTime===0){
    f.homeX = spot.x; f.homeZ = spot.z; f.baseY = targetBaseY;
    f.homeXTarget = spot.x; f.homeZTarget = spot.z; f.baseYTarget = targetBaseY;
    f.transitionTime = 0;
  }
}
function ensureFish(){
  if(fish.length) return;
  const speciesList = [];
  for(const species of FISH_SPECIES) for(let i=0;i<(species.count||4);i++) speciesList.push(species);
  for(const species of speciesList){
    const mesh = buildFishMesh(species);
    scene.add(mesh);
    const hp = species.hp||1;
    const f = {
      mesh, species, homeX:0, homeZ:0, bottom:1, top:1, baseY:1, hasHome:false,
      hp, maxHp: hp,
      freqX: 0.2+Math.random()*0.3, freqZ: 0.2+Math.random()*0.3,
      ampXZ: 1.5+Math.random()*2.5, phase: Math.random()*Math.PI*2,
      vertPeriod: 6+Math.random()*10, vertPhase: Math.random()*Math.PI*2,
      tailPhase: Math.random()*Math.PI*2, tailSpeed: 5+Math.random()*3,
    };
    spawnFishHome(f);
    fish.push(f);
  }
}
function updateFish(dt){
  ensureFish();
  const t = performance.now()/1000;
  for(const f of fish){
    if(!f.hasHome){ spawnFishHome(f); if(!f.hasHome) continue; }

    // Smooth transition to new home point over 1.5 seconds
    if(f.transitionTime > 0){
      f.transitionElapsed += dt;
      const alpha = Math.min(1, f.transitionElapsed / f.transitionTime);
      f.homeX += (f.homeXTarget - f.homeX) * alpha;
      f.homeZ += (f.homeZTarget - f.homeZ) * alpha;
      f.baseY += (f.baseYTarget - f.baseY) * alpha;
    }

    const dx = f.homeXTarget-player.pos.x, dz = f.homeZTarget-player.pos.z;
    if(dx*dx+dz*dz > FISH_RADIUS*FISH_RADIUS){ spawnFishHome(f); if(!f.hasHome) continue; }
    const ax = t*f.freqX+f.phase, az = t*f.freqZ+f.phase*1.3;
    let x = f.homeX + Math.sin(ax)*f.ampXZ;
    let z = f.homeZ + Math.cos(az)*f.ampXZ;
    const vertRange = Math.max(0.3, (f.top-f.bottom)/2 - 0.3);
    let y = f.baseY + Math.sin(t/f.vertPeriod*Math.PI*2+f.vertPhase)*vertRange;
    if(getBlock(Math.floor(x), Math.floor(y), Math.floor(z)) !== WATER){ x=f.homeX; z=f.homeZ; y=f.baseY; }
    f.mesh.position.set(x,y,z);
    // Face the direction it's actually swimming — same analytic-derivative + atan2(-vx,-vz)
    // convention used for the player and the birds.
    const vx = Math.cos(ax)*f.freqX*f.ampXZ, vz = -Math.sin(az)*f.freqZ*f.ampXZ;
    if(vx*vx+vz*vz > 0.0001) f.mesh.rotation.y = Math.atan2(-vx,-vz);

    f.tailPhase += dt*f.tailSpeed;
    f.mesh.userData.tail.rotation.y = Math.sin(f.tailPhase)*0.6; // side-to-side wiggle, not a bird's up/down flap
  }
}

// ---------- Turtles: slow-swimming water dwellers ----------
// Same home-point-in-a-water-column approach as fish (reuses findFishSpot directly — it isn't
// actually fish-specific, just "a nearby water column at least this deep"), but noticeably slower and
// lower-amplitude, matching a turtle's leisurely paddle instead of a fish's darting swim, and a real
// shell-plus-flippers body instead of a torpedo one. Four flippers each paddle on their own pivot.
const TURTLE_SPECIES = [
  { id:'greenturtle', name:'Green Sea Turtle', shell:0x3a5a2a, skin:0x5a8a4a, size:1.0 },
  { id:'hawksbill',   name:'Hawksbill Turtle',  shell:0x8a5a2a, skin:0xc9a25a, size:0.9 },
  { id:'loggerhead',  name:'Loggerhead Turtle', shell:0x7a4a2a, skin:0xa87850, size:1.15 },
];
const TURTLE_COUNT = TURTLE_SPECIES.length * 3;
const TURTLE_RADIUS = 24;
const turtles = [];
const turtleMatCache = new Map();
const turtleEyeMat = new THREE.MeshLambertMaterial({ color: 0x141414 });
function turtleMaterials(species){
  let m = turtleMatCache.get(species.id);
  if(!m){
    m = { shell: new THREE.MeshLambertMaterial({ color: species.shell }), skin: new THREE.MeshLambertMaterial({ color: species.skin }) };
    turtleMatCache.set(species.id, m);
  }
  return m;
}
function buildTurtleMesh(species){
  const { shell: shellMat, skin: skinMat } = turtleMaterials(species);
  const g = new THREE.Group();

  const shell = animalBox(0.32, 0.14, 0.36, shellMat);
  shell.position.set(0, 0.06, 0);
  g.add(shell);

  const head = animalBox(0.1, 0.09, 0.12, skinMat);
  head.position.set(0, 0.03, -0.22);
  g.add(head);

  for(const side of [1,-1]){
    const eye = animalBox(0.015, 0.015, 0.015, turtleEyeMat);
    eye.position.set(side*0.035, 0.05, -0.27);
    g.add(eye);
  }

  // Four flippers, each on its own hinge so they can paddle independently of the shell — front pair
  // sweeps opposite the back pair, the way a real sea turtle actually strokes.
  const flippers = [];
  for(const side of [1,-1]){
    for(const front of [1,-1]){
      const pivot = new THREE.Group();
      pivot.position.set(side*0.17, 0.03, front*-0.13);
      const flipper = animalBox(0.13, 0.02, 0.1, skinMat);
      flipper.geometry.translate(side*0.065, 0, 0);
      pivot.add(flipper);
      pivot.userData.side = side; pivot.userData.front = front;
      g.add(pivot);
      flippers.push(pivot);
    }
  }
  g.userData.flippers = flippers;

  const tail = animalBox(0.04, 0.03, 0.08, skinMat);
  tail.position.set(0, 0.03, 0.19);
  g.add(tail);

  g.scale.setScalar(species.size);
  g.traverse(o => { if(o.isMesh) o.castShadow = true; });
  return g;
}
function spawnTurtleHome(tu){
  const spot = findFishSpot(tu.species.minDepth);
  if(!spot){ tu.hasHome = false; tu.mesh.visible = false; return; }
  tu.hasHome = true; tu.mesh.visible = true;
  tu.bottom = spot.bottom; tu.top = spot.top;
  const depth = spot.top - spot.bottom + 1;
  const targetBaseY = spot.bottom + depth/2;
  // A slower, more leisurely relocation window than a fish's — see relocateTransitionTime.
  tu.transitionTime = relocateTransitionTime(tu.homeX, tu.homeZ, spot.x, spot.z, TURTLE_RADIUS, 2);
  tu.homeXTarget = spot.x; tu.homeZTarget = spot.z; tu.baseYTarget = targetBaseY;
  tu.transitionElapsed = 0;
  if((tu.homeX===0 && tu.homeZ===0) || tu.transitionTime===0){
    tu.homeX = spot.x; tu.homeZ = spot.z; tu.baseY = targetBaseY;
    tu.homeXTarget = spot.x; tu.homeZTarget = spot.z; tu.baseYTarget = targetBaseY;
    tu.transitionTime = 0;
  }
}
function ensureTurtles(){
  if(turtles.length) return;
  const speciesList = [];
  for(const species of TURTLE_SPECIES) for(let i=0;i<(species.count||3);i++) speciesList.push(species);
  for(const species of speciesList){
    const mesh = buildTurtleMesh(species);
    scene.add(mesh);
    const hp = species.hp||1;
    const tu = {
      mesh, species, homeX:0, homeZ:0, bottom:1, top:1, baseY:1, hasHome:false,
      hp, maxHp: hp,
      freqX: 0.07+Math.random()*0.1, freqZ: 0.07+Math.random()*0.1, // noticeably slower than fish
      ampXZ: 1.0+Math.random()*1.2, phase: Math.random()*Math.PI*2,
      vertPeriod: 10+Math.random()*12, vertPhase: Math.random()*Math.PI*2,
      paddlePhase: Math.random()*Math.PI*2, paddleSpeed: 2+Math.random()*1.5,
    };
    spawnTurtleHome(tu);
    turtles.push(tu);
  }
}
function updateTurtles(dt){
  ensureTurtles();
  const t = performance.now()/1000;
  for(const tu of turtles){
    if(!tu.hasHome){ spawnTurtleHome(tu); if(!tu.hasHome) continue; }

    if(tu.transitionTime > 0){
      tu.transitionElapsed += dt;
      const alpha = Math.min(1, tu.transitionElapsed / tu.transitionTime);
      tu.homeX += (tu.homeXTarget - tu.homeX) * alpha;
      tu.homeZ += (tu.homeZTarget - tu.homeZ) * alpha;
      tu.baseY += (tu.baseYTarget - tu.baseY) * alpha;
    }

    const dx = tu.homeXTarget-player.pos.x, dz = tu.homeZTarget-player.pos.z;
    if(dx*dx+dz*dz > TURTLE_RADIUS*TURTLE_RADIUS){ spawnTurtleHome(tu); if(!tu.hasHome) continue; }
    const ax = t*tu.freqX+tu.phase, az = t*tu.freqZ+tu.phase*1.3;
    let x = tu.homeX + Math.sin(ax)*tu.ampXZ;
    let z = tu.homeZ + Math.cos(az)*tu.ampXZ;
    const vertRange = Math.max(0.2, (tu.top-tu.bottom)/2 - 0.3);
    let y = tu.baseY + Math.sin(t/tu.vertPeriod*Math.PI*2+tu.vertPhase)*vertRange;
    if(getBlock(Math.floor(x), Math.floor(y), Math.floor(z)) !== WATER){ x=tu.homeX; z=tu.homeZ; y=tu.baseY; }
    tu.mesh.position.set(x,y,z);
    const vx = Math.cos(ax)*tu.freqX*tu.ampXZ, vz = -Math.sin(az)*tu.freqZ*tu.ampXZ;
    if(vx*vx+vz*vz > 0.0001) tu.mesh.rotation.y = Math.atan2(-vx,-vz);

    tu.paddlePhase += dt*tu.paddleSpeed;
    const stroke = Math.sin(tu.paddlePhase)*0.35;
    for(const flipperPivot of tu.mesh.userData.flippers){
      // Front and back flippers on the same side stroke in opposite phase, like a real swim stroke.
      flipperPivot.rotation.x = flipperPivot.userData.front*stroke;
    }
  }
}

// ---------- Hercules beetles: purely decorative, fixed population clinging to tree trunks ----------
// Unlike birds/fish/turtles they never roam and are never recycled toward the player — each one
// picks one real trunk in the world at spawn time and stays there for the session. Like the rest of
// this ambient wildlife, they're not saved to localStorage; a reload just re-rolls 10 fresh spots.
const HERCULES_BEETLE_COUNT = 10;
const beetles = [];
let beetleShellMat, beetleLegMat;
function beetleMaterials(){
  if(!beetleShellMat){
    beetleShellMat = new THREE.MeshLambertMaterial({ color: 0x0b0b0d }); // near-black shell
    beetleLegMat = new THREE.MeshLambertMaterial({ color: 0x1c1c1e });
  }
  return { shell: beetleShellMat, leg: beetleLegMat };
}
// A low-poly beetle built the same "compose primitives" way as the birds/animals above: three body
// segments stacked along +Y (it clings to bark vertically, so "up the body" is "up the trunk"), a
// pair of curved horns meeting like forceps — the signature a male Hercules beetle fights with — and
// three pairs of splayed legs gripping the sides.
function buildBeetleMesh(){
  const { shell, leg } = beetleMaterials();
  const g = new THREE.Group();

  const abdomen = animalBox(0.20, 0.16, 0.14, shell);
  abdomen.position.set(0, 0.10, 0);
  g.add(abdomen);

  const thorax = animalBox(0.16, 0.10, 0.12, shell);
  thorax.position.set(0, 0.22, 0);
  g.add(thorax);

  const head = animalBox(0.11, 0.08, 0.10, shell);
  head.position.set(0, 0.30, 0);
  g.add(head);

  const headHorn = animalBox(0.035, 0.22, 0.035, shell);
  headHorn.geometry.translate(0, 0.11, 0); // pivot at its base so rotation curves the tip, not the root
  headHorn.position.set(0, 0.34, 0);
  headHorn.rotation.x = -0.6;
  g.add(headHorn);

  const thoraxHorn = animalBox(0.04, 0.15, 0.04, shell);
  thoraxHorn.geometry.translate(0, 0.075, 0);
  thoraxHorn.position.set(0, 0.27, -0.02);
  thoraxHorn.rotation.x = 0.9; // curves down to meet the head horn's tip
  g.add(thoraxHorn);

  const legPositions = [
    [ 0.10, 0.24, -0.03], [-0.10, 0.24, -0.03], // front
    [ 0.10, 0.17,  0.00], [-0.10, 0.17,  0.00], // middle
    [ 0.09, 0.10,  0.03], [-0.09, 0.10,  0.03], // back
  ];
  const legs = legPositions.map(([px,py,pz])=>{
    const side = px>0 ? 1 : -1;
    const l = animalBox(0.13, 0.025, 0.025, leg);
    l.geometry.translate(side*0.065, 0, 0); // pivot at the body end
    l.position.set(px, py, pz);
    l.rotation.z = side * -0.5;
    g.add(l);
    return l;
  });
  g.userData.legs = legs;
  g.traverse(o => { if(o.isMesh) o.castShadow = true; });
  return g;
}
// Picks a random exposed face of the trunk at (x,y,z) — one whose neighboring cell is open air, so
// the beetle sits visibly on the bark surface rather than embedded in solid ground or foliage.
function pickBeetleFace(x,y,z){
  const dirs = [[1,0],[-1,0],[0,1],[0,-1]];
  for(let i=dirs.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [dirs[i],dirs[j]]=[dirs[j],dirs[i]]; }
  for(const [dx,dz] of dirs) if(getBlock(x+dx,y,z+dz)===AIR) return {dx,dz};
  return null;
}
// Finds up to `count` distinct trees (one beetle per tree) and a real trunk block + exposed face on
// each. Trees are sparse enough across a 128x128 world that random column sampling (the approach
// findInitialWormSpot uses when it only ever needs one hit) unreliably comes up short of 10 — so
// this does one exhaustive pass over every column instead, collects every tree found, then shuffles
// and takes the first `count`. Same one-time cost class as generateWorld's own per-column pass.
function findBeetleSpots(count){
  const candidates = [];
  for(let x=4; x<WORLD_SIZE-4; x++){
    for(let z=4; z<WORLD_SIZE-4; z++){
      const h = heightAt(x,z);
      if(h<=SEA_LEVEL+1) continue;
      for(let y=h; y<h+5 && y<WORLD_HEIGHT; y++){
        if(getBlock(x,y,z)===WOOD){ candidates.push({x, y, z}); break; }
      }
    }
  }
  for(let i=candidates.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [candidates[i],candidates[j]]=[candidates[j],candidates[i]]; }
  const spots = [];
  for(const c of candidates){
    if(spots.length>=count) break;
    const face = pickBeetleFace(c.x, c.y, c.z);
    if(!face) continue;
    spots.push({x:c.x, y:c.y, z:c.z, dx:face.dx, dz:face.dz});
  }
  return spots;
}
function ensureBeetles(){
  if(beetles.length) return;
  for(const s of findBeetleSpots(HERCULES_BEETLE_COUNT)){
    const mesh = buildBeetleMesh();
    mesh.rotation.y = Math.random()*Math.PI*2;
    mesh.position.set(s.x+0.5+s.dx*0.46, s.y+0.15, s.z+0.5+s.dz*0.46);
    scene.add(mesh);
    beetles.push({ mesh, phase: Math.random()*Math.PI*2 });
  }
}
function updateBeetles(dt){
  ensureBeetles();
  const t = performance.now()/1000;
  for(const be of beetles){
    // A small idle leg twitch so they read as alive rather than a static prop, without ever leaving
    // the trunk they spawned on.
    const twitch = Math.sin(t*2 + be.phase)*0.06;
    for(const l of be.mesh.userData.legs) l.rotation.x = twitch;
  }
}

// ---------- Saplings: little trees that randomly appear on grass and slowly grow into full trees ----------
const SAPLING_MAX_STAGE = 3;          // height in blocks while still growing, before it becomes a real tree
const SAPLING_STAGE_MS = 400000;      // real time between each extra block of height (10x slower)
const SAPLING_MATURE_MS = 3000000;    // real time (50 min) from planting until it becomes a full tree (10x slower)
const SAPLING_CAP = 30;               // roughly how many can be growing across the map at once
const SAPLING_SPAWN_CHECK_S = 15;     // how often each client rolls the dice on spawning a new one
const saplings = new Map(); // key "x,z" -> {y: baseY, plantedAt: ms-since-epoch}
let saplingTickTimer = 0, saplingSpawnTimer = SAPLING_SPAWN_CHECK_S;
const SAPLINGS_KEY = 'scoutcraft_saplings_v1';
function saveSaplings(){
  try{ localStorage.setItem(SAPLINGS_KEY, JSON.stringify([...saplings])); }catch(e){}
}
function loadSaplings(){
  try{
    const list = JSON.parse(localStorage.getItem(SAPLINGS_KEY) || '[]');
    if(Array.isArray(list)) for(const [key, info] of list) saplings.set(key, info);
  }catch(e){}
}
function saplingStageForElapsed(elapsedMs){
  return Math.min(SAPLING_MAX_STAGE, 1 + Math.floor(elapsedMs / SAPLING_STAGE_MS));
}
function findSaplingColumn(x,y,z){
  let baseY = y;
  while(getBlock(x,baseY-1,z)===SAPLING) baseY--;
  const cells = [];
  let cy = baseY;
  while(getBlock(x,cy,z)===SAPLING){ cells.push({x,y:cy,z}); cy++; }
  return cells;
}
function cancelSapling(x,z){
  const key = x+','+z;
  saplings.delete(key);
  saveSaplings();
}
function plantSapling(x,y,z){
  const key = x+','+z;
  saplings.set(key, { y, plantedAt: Date.now() });
  applyWorldEdit(x, y, z, SAPLING);
  saveSaplings();
}
function trySpawnSapling(){
  if(saplings.size >= SAPLING_CAP) return;
  for(let tries=0; tries<10; tries++){
    const x = 2 + Math.floor(Math.random()*(WORLD_SIZE-4));
    const z = 2 + Math.floor(Math.random()*(WORLD_SIZE-4));
    const h = heightAt(x,z);
    if(h<=SEA_LEVEL) continue;
    if(getBlock(x,h,z)!==GRASS) continue;
    if(getBlock(x,h+1,z)!==AIR) continue;
    if(saplings.has(x+','+z)) continue;
    plantSapling(x,h+1,z);
    return;
  }
}
function updateSaplings(dt){
  saplingTickTimer -= dt;
  if(saplingTickTimer<=0){
    saplingTickTimer = 2;
    const now = Date.now();
    for(const [key, info] of Array.from(saplings.entries())){
      const [xs,zs] = key.split(',');
      const x = Number(xs), z = Number(zs), y = info.y;
      const elapsed = now - info.plantedAt;
      if(elapsed >= SAPLING_MATURE_MS){
        for(let dy=0; dy<SAPLING_MAX_STAGE; dy++){
          if(getBlock(x,y+dy,z)===SAPLING) applyWorldEdit(x, y+dy, z, AIR);
        }
        if(hash2(x+3,z+5) < BUSH_CHANCE) plantBushSynced(x,y,z); else plantTreeSynced(x,y,z);
        saplings.delete(key);
        saveSaplings();
        continue;
      }
      const stage = saplingStageForElapsed(elapsed);
      for(let dy=0; dy<stage; dy++){
        if(getBlock(x,y+dy,z)===AIR) applyWorldEdit(x, y+dy, z, SAPLING);
      }
    }
  }
  saplingSpawnTimer -= dt;
  if(saplingSpawnTimer<=0){ saplingSpawnTimer = SAPLING_SPAWN_CHECK_S; trySpawnSapling(); }
}

// ---------- Tree regrowth: leaves slowly grow back as long as the trunk still stands ----------
// A tree's exact original shape (trunk + canopy + any branches) is fully deterministic — the same
// plantTreeCells(x,baseY,z,...) call used to plant it in the first place always reconstructs the
// identical cell layout (see checkTreeSupport above, which relies on the same trick). So regrowth
// doesn't need its own registry of "which trees exist": each tick, sample a few random columns near
// the player, and any one whose base cell (heightAt(x,z)+1) is still WOOD is a living trunk — replay
// its shape and fill back in one missing LEAVES cell at a time, on a per-tree cooldown so it reads as
// gradual regrowth rather than an instant refill. A trunk that's been chopped down to the ground no
// longer matches (its base cell is AIR), so it simply stops being found and never regrows.
const TREE_REGROW_CHECK_S = 3;          // how often each client samples nearby columns for trunks
const TREE_REGROW_SCAN_RADIUS = 24;     // how far from the player to sample
const TREE_REGROW_SAMPLES_PER_CHECK = 20;
const TREE_REGROW_LEAF_INTERVAL_S = 8;  // real seconds between each leaf a given tree regrows
const treeRegrowCooldowns = new Map();  // key "x,z" (trunk base column) -> next allowed regrow time (s)
let treeRegrowTimer = 0;
function updateTreeRegrowth(dt){
  treeRegrowTimer -= dt;
  if(treeRegrowTimer>0) return;
  treeRegrowTimer = TREE_REGROW_CHECK_S;

  const nowS = performance.now()/1000;
  const px = Math.floor(player.pos.x), pz = Math.floor(player.pos.z);
  for(let tries=0; tries<TREE_REGROW_SAMPLES_PER_CHECK; tries++){
    const x = px + Math.floor((Math.random()*2-1)*TREE_REGROW_SCAN_RADIUS);
    const z = pz + Math.floor((Math.random()*2-1)*TREE_REGROW_SCAN_RADIUS);
    if(x<1 || z<1 || x>=WORLD_SIZE-1 || z>=WORLD_SIZE-1) continue;
    const h = heightAt(x,z);
    if(h<=SEA_LEVEL) continue;
    const baseY = h+1;
    if(getBlock(x,baseY,z)!==WOOD) continue; // no living trunk rooted at this column

    const key = x+','+z;
    if(nowS < (treeRegrowCooldowns.get(key)||0)) continue;

    let missing = null;
    plantTreeCells(x, baseY, z, (bx,by,bz,b)=>{
      if(missing || b!==LEAVES) return;
      if(getBlock(bx,by,bz)===AIR) missing = {x:bx,y:by,z:bz};
    });
    if(missing){
      applyWorldEdit(missing.x, missing.y, missing.z, LEAVES);
      treeRegrowCooldowns.set(key, nowS + TREE_REGROW_LEAF_INTERVAL_S);
    }
  }
}

// ---------- Fire: light a wood block with flint, burns for half a ScoutCraft day (30 real min) ----------
// Fire is a non-solid hazard, not a block you can stand on or bump into (see blockSolid/TRANSPARENT_
// BLOCKS): it's drawn as two crossed billboard sprites rather than a cube (ensureFireFx), it hurts
// any player or animal standing in its cell, and it can catch adjacent wood/leaves alight — so a
// single flint spark can grow into a real, spreading blaze rather than a single static block.
const FIRE_DURATION_MS = 1800000; // 30 real minutes == half a 1-hour ScoutCraft day
const FLAMMABLE_BLOCKS = new Set([WOOD, LEAVES]);
const FIRE_SPREAD_INTERVAL_S = 4;
const FIRE_SPREAD_CHANCE = 0.12;
const MAX_ACTIVE_FIRES = 60; // caps runaway spread so light/sprite count stays cheap to render
const FIRE_DAMAGE_TICK_S = 1;
const FIRE_DAMAGE = 2;
const FIRE_NEIGHBOR_OFFSETS = [[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]];
const fires = new Map(); // key "x,y,z" -> {ignitedAt: ms-since-epoch}
const fireFx = new Map(); // key -> { light, flame, phase }
const FIRES_KEY = 'scoutcraft_fires_v1';
function saveFires(){
  try{ localStorage.setItem(FIRES_KEY, JSON.stringify([...fires])); }catch(e){}
}
function loadFires(){
  try{
    const list = JSON.parse(localStorage.getItem(FIRES_KEY) || '[]');
    if(Array.isArray(list)) for(const [key, info] of list) fires.set(key, info);
  }catch(e){}
}

// A small transparent-background sprite (not a full opaque tile like the other block textures) so
// the crossed billboards read as a flame silhouette instead of a translucent cube.
function buildFireSpriteTexture(){
  const W = 32, H = 48;
  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d');
  const cx = W/2;
  for(let row=0; row<H; row++){
    const frac = 1 - row/(H-1); // 1 at the base, 0 at the tip
    const taper = Math.pow(frac, 0.65);
    const jag = (Math.sin(row*1.7)*0.5 + (Math.random()-0.5)) * W*0.09;
    const half = Math.max(1, W*0.46*taper + jag);
    const x0 = Math.round(cx-half), x1 = Math.round(cx+half);
    const color = frac>0.7 ? 0xff3d12 : (frac>0.35 ? 0xff8a1a : 0xffd24d);
    for(let x=x0; x<x1; x++){
      if(x<0 || x>=W) continue;
      const hot = Math.random()<0.15;
      ctx.fillStyle = shadeStr(hot ? 0xfff2b0 : color, 1, hot?0:14);
      ctx.fillRect(x,row,1,1);
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  return tex;
}
const fireFlameMaterial = new THREE.MeshBasicMaterial({ map: buildFireSpriteTexture(), alphaTest:0.5, side:THREE.DoubleSide });
const fireFlameGeo = new THREE.PlaneGeometry(0.95, 1.0);

function tryIgniteFire(hit){
  if(!hit) return;
  // Ignites the wood/leaf block you're actually aiming at (not some adjacent empty air cell) — same
  // instant "catches and starts burning" transition fire spread already uses on its neighbors, so
  // what you point the flint at is what visibly starts burning, and eventually disappears once its
  // fire burns out, same as it would for the rest of the tree.
  if(!FLAMMABLE_BLOCKS.has(getBlock(hit.x,hit.y,hit.z))) return; // flint only catches wood or leaves
  if(invCount(FLINT)<=0) return;
  const key = hit.x+','+hit.y+','+hit.z;
  if(fires.has(key)) return; // already burning
  igniteFire(hit.x,hit.y,hit.z);
  invSub(FLINT,1);
  saveInventory();
  updateHotbarUI();
  triggerSwing();
}
function igniteFire(x,y,z){
  const key = x+','+y+','+z;
  fires.set(key, { ignitedAt: Date.now() });
  applyWorldEdit(x, y, z, FIRE);
  saveFires();
  SFX.igniteFire();
}
function extinguishFire(key){
  const [x,y,z] = key.split(',').map(Number);
  if(getBlock(x,y,z)===FIRE) applyWorldEdit(x, y, z, AIR);
  fires.delete(key);
  saveFires();
  removeFireFx(key);
}
let fireTickTimer = 0, fireSpreadTimer = 0, fireDamageTimer = 0;
function updateFires(dt){
  fireTickTimer -= dt;
  if(fireTickTimer<=0){
    fireTickTimer = 3;
    const now = Date.now();
    for(const [key,info] of Array.from(fires.entries())){
      if(now - info.ignitedAt >= FIRE_DURATION_MS) extinguishFire(key);
    }
  }

  fireSpreadTimer -= dt;
  if(fireSpreadTimer<=0){
    fireSpreadTimer = FIRE_SPREAD_INTERVAL_S;
    for(const key of Array.from(fires.keys())){
      if(fires.size>=MAX_ACTIVE_FIRES) break;
      const [x,y,z] = key.split(',').map(Number);
      for(const [dx,dy,dz] of FIRE_NEIGHBOR_OFFSETS){
        if(fires.size>=MAX_ACTIVE_FIRES) break;
        const nx=x+dx, ny=y+dy, nz=z+dz;
        if(!FLAMMABLE_BLOCKS.has(getBlock(nx,ny,nz))) continue;
        if(fires.has(nx+','+ny+','+nz)) continue;
        if(Math.random()<FIRE_SPREAD_CHANCE) igniteFire(nx,ny,nz);
      }
    }
  }

  fireDamageTimer -= dt;
  if(fireDamageTimer<=0){
    fireDamageTimer = FIRE_DAMAGE_TICK_S;
    if(locked && !isDead){
      for(const key of fires.keys()){
        const [x,y,z] = key.split(',').map(Number);
        if(playerOverlapsCell(x,y,z)){ damagePlayer(FIRE_DAMAGE,'fire'); break; }
      }
    }
    for(const a of animals){
      for(const key of fires.keys()){
        const [x,y,z] = key.split(',').map(Number);
        if(animalOverlapsCell(a,x,y,z)){ damageAnimal(a, FIRE_DAMAGE); break; }
      }
    }
  }

  const t = performance.now()/1000;
  for(const [key, info] of fires){
    const [x,y,z] = key.split(',').map(Number);
    const fx = ensureFireFx(key,x,y,z);
    fx.light.intensity = 2.6 + Math.random()*0.8;
    const wob = Math.sin(t*9 + fx.phase);
    fx.flame.scale.set(1 + wob*0.06, 1 + Math.sin(t*6+fx.phase*1.3)*0.08, 1 + wob*0.06);
    fx.flame.rotation.y = Math.sin(t*3 + fx.phase)*0.25;
  }
  for(const key of Array.from(fireFx.keys())) if(!fires.has(key)) removeFireFx(key);

  fireCrackleTimer -= dt;
  if(fireCrackleTimer<=0){
    let near = false;
    for(const key of fires.keys()){
      const [x,y,z] = key.split(',').map(Number);
      if(Math.hypot(x+0.5-player.pos.x, y+0.5-player.pos.y, z+0.5-player.pos.z) < 6){ near=true; break; }
    }
    if(near && locked){ fireCrackleTimer = 0.4+Math.random()*0.5; SFX.fireCrackle(); }
    else fireCrackleTimer = 1;
  }
}
let fireCrackleTimer = 1;
function ensureFireFx(key,x,y,z){
  let fx = fireFx.get(key);
  if(!fx){
    const light = new THREE.PointLight(0xff8a2b, 2.6, 16, 1.4);
    light.position.set(x+0.5, y+0.5, z+0.5);
    scene.add(light);

    const flame = new THREE.Group();
    const p1 = new THREE.Mesh(fireFlameGeo, fireFlameMaterial);
    const p2 = new THREE.Mesh(fireFlameGeo, fireFlameMaterial);
    p2.rotation.y = Math.PI/2;
    flame.add(p1, p2);
    flame.position.set(x+0.5, y+0.5, z+0.5);
    scene.add(flame);

    fx = { light, flame, phase: Math.random()*Math.PI*2 };
    fireFx.set(key, fx);
  }
  return fx;
}
function removeFireFx(key){
  const fx = fireFx.get(key);
  if(fx){ scene.remove(fx.light); scene.remove(fx.flame); fireFx.delete(key); }
}
// A campfire block's own flame — same crossed-billboard sprite as wildfire above, just smaller and
// perched right at the top of the stone ring, poking up out of it, rather than filling the whole
// block. A campfire already has its own point light (see LIGHT_BLOCKS/updateTorchLight); without an
// actual flame to look at, that light just seemed to come from nowhere — an invisible glow floating
// inside an otherwise flat painted block instead of visibly radiating from a real fire.
const campfireFlames = new Map(); // "x,y,z" -> { flame, phase }
function ensureCampfireFlame(key,x,y,z){
  let cf = campfireFlames.get(key);
  if(!cf){
    const flame = new THREE.Group();
    const p1 = new THREE.Mesh(fireFlameGeo, fireFlameMaterial);
    const p2 = new THREE.Mesh(fireFlameGeo, fireFlameMaterial);
    p2.rotation.y = Math.PI/2;
    flame.add(p1, p2);
    flame.scale.set(0.5, 0.42, 0.5);
    // Anchored so roughly the bottom half sits inside the solid block (hidden, harmless) and the top
    // half actually pokes up above it into open air, where it's visible instead of fully occluded.
    flame.position.set(x+0.5, y+1.13, z+0.5);
    scene.add(flame);
    cf = { flame, phase: Math.random()*Math.PI*2 };
    campfireFlames.set(key, cf);
  }
  return cf;
}
function removeCampfireFlame(key){
  const cf = campfireFlames.get(key);
  if(cf){ scene.remove(cf.flame); campfireFlames.delete(key); }
}
function updateCampfireFlames(){
  const t = performance.now()/1000;
  for(const cf of campfireFlames.values()){
    const wob = Math.sin(t*9 + cf.phase);
    cf.flame.scale.set(0.5*(1+wob*0.08), 0.42*(1+Math.sin(t*6+cf.phase*1.3)*0.12), 0.5*(1+wob*0.08));
    cf.flame.rotation.y = Math.sin(t*3 + cf.phase)*0.3;
  }
}

// ---------- Water flow: water spreads into adjacent empty gaps/holes over time ----------
// Not a full per-tick fluid simulation across the whole world (way too expensive at this world size,
// and the initial ocean is already "settled" from world-gen — it doesn't need to re-simulate itself
// on load). Instead this is purely reactive and queue-driven: applyWorldEdit calls onWaterRelevantEdit
// below for every edit, and any block breaking (a fresh AIR gap) or water being placed queues the
// cells right around it as flow candidates. Each tick drains a few entries off that queue; a candidate
// that's still empty AND still has a water neighbor becomes water itself and queues its own downstream
// neighbors in turn — so a flow cascades outward exactly like water finding its way into a freshly-dug
// hole, a visible trickle at a time rather than an instant fill. A per-tick rate cap and a max BFS
// distance from the triggering edit keep a tunnel dug next to the ocean from flooding the whole map at
// once. Every client runs this independently off the same synced edits (same client-authoritative, no-
// transactions approach as blocks/fires/saplings elsewhere), so everyone ends up seeing the same flow.
const WATER_FLOW_TICK_S = 0.35;      // how often the flow queue drains
const WATER_FLOW_PER_TICK = 5;       // cells filled per tick — a visible trickle, not instant
const WATER_FLOW_MAX_DIST = 14;      // how far (BFS hops) one flow event can travel from its trigger
// Water only ever spreads down or sideways, never up — a hole dug directly under a lake shouldn't pull
// water out of thin air above it. These two offset lists are deliberately NOT the same set, even
// though they look like they should mirror each other: WATER_SPREAD_OFFSETS is "which of MY neighbors
// might I now be able to reach" (asked by a cell that just became water, so down + sideways); a
// candidate cell's eligibility question is the inverse along the vertical axis — "is there water
// positioned such that it could reach ME" is true if water sits directly ABOVE me (it can drip down)
// or beside me (it can spread sideways), but never if water is merely below me (that would mean water
// flowing upward into me, which real fluid never does).
const WATER_SPREAD_OFFSETS = [[0,-1,0],[1,0,0],[-1,0,0],[0,0,1],[0,0,-1]];
const WATER_NEIGHBOR_OFFSETS = [[0,1,0],[1,0,0],[-1,0,0],[0,0,1],[0,0,-1]];
const waterFlowQueue = [];         // [{x,y,z,dist}]
const waterFlowQueued = new Set(); // dedupe key "x,y,z", mirrors what's currently queued
function hasWaterNeighbor(x,y,z){
  for(const [dx,dy,dz] of WATER_NEIGHBOR_OFFSETS) if(getBlock(x+dx,y+dy,z+dz)===WATER) return true;
  return false;
}
function enqueueWaterFlow(x,y,z,dist){
  if(getBlock(x,y,z)!==AIR) return;
  const key = x+','+y+','+z;
  if(waterFlowQueued.has(key)) return;
  waterFlowQueued.add(key);
  waterFlowQueue.push({x,y,z,dist});
}
// Only reacts to a cell turning to AIR (a fresh gap next to water). Deliberately does NOT also react
// to val===WATER here: applyWorldEdit calls this for every edit including the flow system's own
// fills, and reseeding dist=1 every time a fill happens would silently defeat WATER_FLOW_MAX_DIST —
// every new cell would re-announce itself as a fresh distance-1 source forever, so a flow could never
// actually run out of distance budget as long as it kept finding new empty neighbors. updateWaterFlow's
// own explicit dist+1 propagation below is the sole mechanism for cascading a flow forward; placeBlock
// separately calls seedWaterFlowFromPlacement for a genuinely new player-placed water source.
function onWaterRelevantEdit(x,y,z,val){
  if(val===AIR && hasWaterNeighbor(x,y,z)) enqueueWaterFlow(x,y,z,1);
}
// Called once, directly, when a player places a water block — gives its empty neighbors a fresh
// distance-1 source to spread from, same as if a gap had just opened up next to existing water.
function seedWaterFlowFromPlacement(x,y,z){
  for(const [dx,dy,dz] of WATER_SPREAD_OFFSETS) enqueueWaterFlow(x+dx,y+dy,z+dz,1);
}
let waterFlowTimer = 0;
function updateWaterFlow(dt){
  waterFlowTimer -= dt;
  if(waterFlowTimer>0) return;
  waterFlowTimer = WATER_FLOW_TICK_S;
  let filled = 0;
  while(filled<WATER_FLOW_PER_TICK && waterFlowQueue.length){
    const cell = waterFlowQueue.shift();
    waterFlowQueued.delete(cell.x+','+cell.y+','+cell.z);
    if(getBlock(cell.x,cell.y,cell.z)!==AIR) continue; // no longer empty — built on, or already filled
    if(!hasWaterNeighbor(cell.x,cell.y,cell.z)) continue; // stale — its water neighbor is gone now
    applyWorldEdit(cell.x, cell.y, cell.z, WATER);
    filled++;
    if(cell.dist<WATER_FLOW_MAX_DIST){
      for(const [dx,dy,dz] of WATER_SPREAD_OFFSETS) enqueueWaterFlow(cell.x+dx,cell.y+dy,cell.z+dz,cell.dist+1);
    }
  }
}

// ---------- Fireworks: unlimited, purely a fun effect — no crafting, never consumed ----------
// A small rocket climbs straight up from wherever you're standing, then blooms into an evenly-
// spaced spherical shower of colored sparks (a fibonacci-sphere point distribution, which reads as
// a symmetric "flower" opening outward rather than a random scatter) with a bright flash-light and
// a boom+crackle sound. Both the climb and the burst are driven from the same per-frame update list
// pattern as fallingClusters/fires, so a burst that's still fading doesn't block launching another.
const FIREWORK_COLORS = [0xff4d4d, 0xffb347, 0xfff066, 0x7cfc8a, 0x66d9ff, 0xb388ff, 0xff7edb, 0xffffff];
const FIREWORK_PARTICLES = 48;
const SPEED_OF_SOUND = 343; // world units (~meters) per second
const fireworks = [];
// The launch whistle gets the same speed-of-sound delay as the burst boom — for a firework you just
// launched that's imperceptible (you're right next to it), but it means the delay math already
// generalizes correctly to a firework launched from anywhere else in the world.
function spawnFireworkEffect(x,z,startY,targetY){
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.1,6,6), new THREE.MeshBasicMaterial({color:0xfff2b0}));
  mesh.position.set(x, startY, z);
  scene.add(mesh);
  const trailLight = new THREE.PointLight(0xfff2b0, 1.4, 6, 2);
  mesh.add(trailLight);
  fireworks.push({ mesh, x, z, startY, targetY, t:0, riseTime: 0.9, burst:null });
  const dist = Math.hypot(x-player.pos.x, startY-(player.pos.y+player.eye), z-player.pos.z);
  setTimeout(()=>SFX.fireworkLaunch(), (dist/SPEED_OF_SOUND)*1000);
}
function launchFirework(){
  const x = player.pos.x, z = player.pos.z;
  const startY = player.pos.y + player.eye;
  const targetY = startY + 9 + Math.random()*5;
  spawnFireworkEffect(x,z,startY,targetY);
}
function createFireworkBurst(x,y,z){
  const n = FIREWORK_PARTICLES;
  const positions = new Float32Array(n*3);
  const velocities = new Float32Array(n*3);
  const colors = new Float32Array(n*3);
  const goldenAngle = Math.PI*(3-Math.sqrt(5));
  const speed = 3.2 + Math.random()*1.6;
  const colorA = new THREE.Color(FIREWORK_COLORS[Math.floor(Math.random()*FIREWORK_COLORS.length)]);
  const colorB = new THREE.Color(FIREWORK_COLORS[Math.floor(Math.random()*FIREWORK_COLORS.length)]);
  for(let i=0;i<n;i++){
    const yv = 1 - (i/(n-1))*2;
    const r = Math.sqrt(Math.max(0, 1-yv*yv));
    const theta = goldenAngle*i;
    const dx = Math.cos(theta)*r, dz = Math.sin(theta)*r;
    positions[i*3]=x; positions[i*3+1]=y; positions[i*3+2]=z;
    velocities[i*3]=dx*speed; velocities[i*3+1]=yv*speed; velocities[i*3+2]=dz*speed;
    const c = i%2===0 ? colorA : colorB;
    colors[i*3]=c.r; colors[i*3+1]=c.g; colors[i*3+2]=c.b;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions,3));
  geo.setAttribute('color', new THREE.BufferAttribute(colors,3));
  const mat = new THREE.PointsMaterial({ size:0.32, vertexColors:true, transparent:true, opacity:1, depthWrite:false, sizeAttenuation:true });
  const points = new THREE.Points(geo, mat);
  scene.add(points);
  const light = new THREE.PointLight(colorA.getHex(), 3.2, 14, 2);
  light.position.set(x,y,z);
  scene.add(light);
  return { points, velocities, light, t:0, life:1.3 };
}
function updateFireworkBurst(b, dt){
  const pos = b.points.geometry.attributes.position.array;
  for(let i=0;i<b.velocities.length/3;i++){
    pos[i*3]   += b.velocities[i*3]*dt;
    pos[i*3+1] += b.velocities[i*3+1]*dt;
    pos[i*3+2] += b.velocities[i*3+2]*dt;
    b.velocities[i*3+1] -= 2.2*dt; // gentle droop instead of expanding forever
    b.velocities[i*3]   *= 0.98;
    b.velocities[i*3+2] *= 0.98;
  }
  b.points.geometry.attributes.position.needsUpdate = true;
  b.t += dt;
  const lt = Math.min(1, b.t/b.life);
  b.points.material.opacity = 1-lt;
  b.light.intensity = Math.max(0, 3.2*(1-lt*3)); // the flash itself only lasts the first third
}
function updateFireworks(dt){
  for(let i=fireworks.length-1; i>=0; i--){
    const f = fireworks[i];
    if(!f.burst){
      f.t += dt;
      const p = Math.min(1, f.t/f.riseTime);
      f.mesh.position.y = f.startY + (f.targetY-f.startY)*p;
      if(p>=1){
        const bx=f.mesh.position.x, by=f.mesh.position.y, bz=f.mesh.position.z;
        scene.remove(f.mesh);
        f.burst = createFireworkBurst(bx,by,bz);
        // Light reaches you instantly, sound doesn't — delay the boom by how long it actually takes
        // to travel from the burst to your ears (speed of sound, world units treated as meters), so a
        // burst you're right under is basically instant while a distant one visibly lags its sound.
        const dist = Math.hypot(bx-player.pos.x, by-(player.pos.y+player.eye), bz-player.pos.z);
        setTimeout(()=>SFX.fireworkBurst(), (dist/SPEED_OF_SOUND)*1000);
      }
    } else {
      updateFireworkBurst(f.burst, dt);
      if(f.burst.t>=f.burst.life){
        scene.remove(f.burst.points);
        scene.remove(f.burst.light);
        fireworks.splice(i,1);
      }
    }
  }
}

function findDoorCells(x,y,z){
  const isDoor = b => b===DOOR || b===DOOR_OPEN;
  let baseY = y;
  while(isDoor(getBlock(x,baseY-1,z))) baseY--;
  let axis=null, dir=1;
  if(isDoor(getBlock(x+1,baseY,z))){ axis='x'; dir=1; }
  else if(isDoor(getBlock(x-1,baseY,z))){ axis='x'; dir=-1; }
  else if(isDoor(getBlock(x,baseY,z+1))){ axis='z'; dir=1; }
  else if(isDoor(getBlock(x,baseY,z-1))){ axis='z'; dir=-1; }
  else return null;
  const baseX = axis==='x' ? (dir===1?x:x-1) : x;
  const baseZ = axis==='z' ? (dir===1?z:z-1) : z;
  const cells = [];
  for(let dy=0; dy<3; dy++)
    for(let w=0; w<2; w++)
      cells.push({ x: axis==='x'?baseX+w:baseX, y: baseY+dy, z: axis==='z'?baseZ+w:baseZ });
  return cells;
}
function toggleOpenable(x,y,z,current){
  const opening = current===WINDOW || current===DOOR; // toggling FROM the closed state
  if(current===DOOR || current===DOOR_OPEN){
    const cells = findDoorCells(x,y,z) || [{x,y,z}];
    for(const c of cells) applyWorldEdit(c.x, c.y, c.z, TOGGLE_MAP[current]);
    SFX.doorToggle(opening);
    return;
  }
  applyWorldEdit(x, y, z, TOGGLE_MAP[current]);
  SFX.windowToggle(opening);
}
// ---------- First-person view-model (a floating map, rendered as a separate overlay pass) ----------
// A small drawn paper-map texture (aged cream background, a fold crease, a few contour-line
// squiggles, a dashed trail and a north arrow) — same canvas-texture technique as the name tag and
// the Scout Law box labels, just standing in for a scout's map rather than any specific held item.
function buildMapTexture(){
  const canvas = document.createElement('canvas');
  canvas.width = 160; canvas.height = 128;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#e8d9ae';
  ctx.fillRect(0,0,160,128);
  for(let i=0;i<40;i++){
    ctx.fillStyle = `rgba(${150+Math.random()*40|0},${120+Math.random()*40|0},${70+Math.random()*30|0},0.15)`;
    ctx.beginPath();
    ctx.arc(Math.random()*160, Math.random()*128, 6+Math.random()*14, 0, Math.PI*2);
    ctx.fill();
  }
  ctx.strokeStyle = '#6b4a2b';
  ctx.lineWidth = 4;
  ctx.strokeRect(4,4,152,120);
  ctx.strokeStyle = 'rgba(90,60,30,0.4)';
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(80,6); ctx.lineTo(80,122); ctx.stroke();
  ctx.strokeStyle = '#8a6a3a';
  ctx.lineWidth = 1.5;
  for(let i=0;i<5;i++){
    ctx.beginPath();
    const y0 = 20+i*18;
    ctx.moveTo(16, y0);
    for(let x=16;x<=144;x+=16) ctx.quadraticCurveTo(x+8, y0+(Math.random()*14-7), x+16, y0+(Math.random()*10-5));
    ctx.stroke();
  }
  ctx.strokeStyle = '#a83b2c';
  ctx.lineWidth = 2;
  ctx.setLineDash([5,4]);
  ctx.beginPath(); ctx.moveTo(20,110); ctx.lineTo(140,20); ctx.stroke();
  ctx.setLineDash([]);
  const cx=128, cy=28;
  ctx.fillStyle = '#3a2a18';
  ctx.beginPath();
  ctx.moveTo(cx, cy-14); ctx.lineTo(cx-5, cy+6); ctx.lineTo(cx, cy+2); ctx.lineTo(cx+5, cy+6);
  ctx.closePath(); ctx.fill();
  ctx.font = 'bold 11px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('N', cx, cy-16);
  return new THREE.CanvasTexture(canvas);
}
// The whole rod tilts up and out from the grip at this fixed angle; the line (below) cancels it
// out with the inverse rotation so it still hangs straight down toward the water.
const FISHING_ROD_TILT = new THREE.Euler(-0.3, 0.3, 0.5, 'XYZ');
// A simple rod-and-line prop shown instead of the map while a line is actually cast (see fishingSpot
// in the Fishing module above) — the base pivots at the grip so the whole rod tilts as one piece.
function buildFishingPoleMesh(){
  const g = new THREE.Group();
  g.rotation.copy(FISHING_ROD_TILT);
  const rodMat = new THREE.MeshLambertMaterial({ color: 0x6b4a2b });
  const reelMat = new THREE.MeshLambertMaterial({ color: 0x2a2a2a });
  const lineMat = new THREE.MeshLambertMaterial({ color: 0xd8d8d8 });

  const rod = new THREE.Mesh(new THREE.BoxGeometry(0.035,1.0,0.035), rodMat);
  rod.geometry.translate(0,0.5,0);
  g.add(rod);

  const reel = new THREE.Mesh(new THREE.BoxGeometry(0.08,0.1,0.08), reelMat);
  reel.position.set(0,0.08,0);
  g.add(reel);

  const line = new THREE.Mesh(new THREE.BoxGeometry(0.012,0.9,0.012), lineMat);
  line.geometry.translate(0,-0.45,0);
  line.position.set(0,1.0,0);
  // Cancel the group's own tilt so the line hangs straight down in world space, not at the rod's angle.
  line.quaternion.copy(new THREE.Quaternion().setFromEuler(FISHING_ROD_TILT).invert());
  g.add(line);

  return g;
}
let handScene, handCamera, handGroup, armMesh, heldItemMesh, fishingPoleMesh;
let handBobPhase = 0, handBobAmp = 0, swingT = 0;
function buildHandModel(){
  handScene = new THREE.Scene();
  handScene.add(new THREE.HemisphereLight(0xffffff, 0x445533, 1.0));
  handCamera = new THREE.PerspectiveCamera(70, window.innerWidth/window.innerHeight, 0.01, 10);

  handGroup = new THREE.Group();
  // The arm/hand block itself is gone now — just the map floats in view. armMesh still exists
  // (unattached, never rendered) purely so updateHandView below has something harmless to keep
  // setting rotation on, rather than needing a null check on every frame.
  const armGeo = new THREE.BoxGeometry(0.22,0.6,0.22);
  armGeo.translate(0,-0.3,0);
  armMesh = new THREE.Mesh(armGeo, new THREE.MeshLambertMaterial({ color: 0xd9a066 }));
  armMesh.position.set(0.32,-0.05,-0.55);
  armMesh.rotation.set(0.15, 0, -0.25);

  // A folded paper map instead of a held-block cube — a thin box so it reads as a flat sheet, with
  // the map texture on its front/back faces (the two facing the camera) and a plain paper-edge
  // color on the four thin sides. Always the same prop regardless of what's actually selected —
  // it's a fixed piece of gear, not a per-item indicator the way the old color-tinted cube was.
  const paperEdge = new THREE.MeshLambertMaterial({ color: 0xd8c89a });
  const mapFace = new THREE.MeshLambertMaterial({ map: buildMapTexture() });
  heldItemMesh = new THREE.Mesh(new THREE.BoxGeometry(0.34,0.26,0.018),
    [paperEdge, paperEdge, paperEdge, paperEdge, mapFace, mapFace]);
  heldItemMesh.position.set(0.20,-0.30,-0.68);
  heldItemMesh.rotation.set(-0.2, 0.25, 0.15);
  handGroup.add(heldItemMesh);

  fishingPoleMesh = buildFishingPoleMesh();
  fishingPoleMesh.position.set(0.30,-0.45,-0.55);
  fishingPoleMesh.visible = false;
  handGroup.add(fishingPoleMesh);

  handScene.add(handGroup);
}
// The map is a fixed prop now, not a color-coded stand-in for the held item — kept as a no-op
// (rather than removing every call site) so selecting a different hotbar slot stays harmless.
function updateHeldItemColor(){}
function triggerSwing(){ swingT = 1; }
function updateHandView(dt, moving, sprinting){
  handBobAmp += ((moving?1:0) - handBobAmp) * Math.min(1, dt*8);
  handBobPhase += dt * (sprinting?14:9);
  const bobX = Math.sin(handBobPhase) * 0.02 * handBobAmp;
  const bobY = Math.abs(Math.sin(handBobPhase*2)) * 0.015 * handBobAmp;
  swingT = Math.max(0, swingT - dt*4);
  const swing = Math.sin(swingT*Math.PI) * 0.9;
  handGroup.position.set(bobX, -bobY, 0);
  armMesh.rotation.x = 0.15 - swing;
  // Swap the map out for the rod whenever a line is actually cast, and back once it isn't.
  heldItemMesh.visible = !fishingSpot;
  fishingPoleMesh.visible = !!fishingSpot;
}

function blockSolid(bx,by,bz){
  const b = getBlock(bx,by,bz);
  return b!==AIR && b!==WATER && b!==WINDOW_OPEN && b!==DOOR_OPEN && b!==SAPLING && b!==FIRE && b!==TORCH && b!==LADDER && b!==LANTERN && b!==FLAG;
}
function collidesBox(px,py,pz){
  const w = player.width/2;
  const minX = Math.floor(px-w), maxX = Math.floor(px+w);
  const minY = Math.floor(py),   maxY = Math.floor(py+player.height);
  const minZ = Math.floor(pz-w), maxZ = Math.floor(pz+w);
  for(let x=minX;x<=maxX;x++)
    for(let y=minY;y<=maxY;y++)
      for(let z=minZ;z<=maxZ;z++)
        if(blockSolid(x,y,z)) return true;
  return false;
}
// Animals only ever blocked HORIZONTAL player movement (entityBlockedByOthers, a radius push-back) —
// there was no vertical collision against them at all, so jumping over one (or just falling near one)
// let the player's Y movement clip straight through its body with nothing to land on, instead of
// landing on its back like any other solid obstacle. Same per-animal AABB (ANIMAL_RADIUS horizontally,
// ANIMAL_REAL_HEIGHT vertically) already used by animalOverlapsCell, checked against the player's own
// hitbox the same way collidesBox checks it against solid blocks.
function collidesAnimal(px,py,pz){
  const w = player.width/2;
  for(const a of animals){
    const r = ANIMAL_RADIUS[a.type]||0.4;
    const h = ANIMAL_REAL_HEIGHT[a.type]||0.8;
    if(px+w>a.x-r && px-w<a.x+r && pz+w>a.z-r && pz-w<a.z+r && py<a.y+h && py+player.height>a.y) return true;
  }
  return false;
}
// Same idea as collidesAnimal, but for a Giant Eagle specifically — falling onto one mounts it (see
// the Y-collision check in updatePlayer) instead of just stopping the fall.
function findMountableEagle(px,py,pz){
  const w = player.width/2;
  const now = performance.now();
  for(const e of bigEagles){
    if(e.beingRidden) continue;
    if(e.remountBlockedUntil && now < e.remountBlockedUntil) continue;
    const ex = e.mesh.position.x, ey = e.mesh.position.y, ez = e.mesh.position.z;
    if(px+w>ex-EAGLE_MOUNT_RADIUS && px-w<ex+EAGLE_MOUNT_RADIUS &&
       pz+w>ez-EAGLE_MOUNT_RADIUS && pz-w<ez+EAGLE_MOUNT_RADIUS &&
       py<ey+EAGLE_MOUNT_HEIGHT && py+player.height>ey) return e;
  }
  return null;
}

// ---------- Entity-vs-entity collision (players & animals can't walk through each other) ----------
// excludeAnimal: pass the animal doing the checking (so it also gets checked against the local
// player); leave undefined when the local player itself is the one moving.
// fromX/fromZ: the entity's position BEFORE this move. If given, a candidate that's still inside
// another entity's radius is only blocked when it's not moving away from that entity (i.e. its
// distance didn't increase). Without this, two entities that ever end up overlapping — simultaneous
// spawns, a lagged remote position, a shove from a third entity — would deadlock: every candidate
// position is still "inside" the other one, including every direction that would let them separate,
// so neither side could ever move again.
function entityBlockedByOthers(px,pz,radius,excludeAnimal,fromX,fromZ){
  const wasMoving = fromX!=null;
  for(const a of animals){
    if(a===excludeAnimal) continue;
    const r = radius + (ANIMAL_RADIUS[a.type]||0.4);
    const dx=px-a.x, dz=pz-a.z;
    if(dx*dx+dz*dz >= r*r) continue;
    if(wasMoving){
      const odx=fromX-a.x, odz=fromZ-a.z;
      if(dx*dx+dz*dz >= odx*odx+odz*odz) continue;
    }
    return true;
  }
  if(excludeAnimal){
    const r = radius + player.width/2;
    const dx=px-player.pos.x, dz=pz-player.pos.z;
    if(dx*dx+dz*dz < r*r){
      let blocked = true;
      if(wasMoving){
        const odx=fromX-player.pos.x, odz=fromZ-player.pos.z;
        if(dx*dx+dz*dz >= odx*odx+odz*odz) blocked = false;
      }
      if(blocked) return true;
    }
  }
  return false;
}
// Animals don't jump, so a step up of more than one block (a wall, a building) simply blocks them —
// matches how groundHeightAt already snaps them onto gradual terrain.
function animalStepBlocked(nx,nz,baseY){
  return groundHeightAt(nx,nz) - baseY > 1;
}
function stepAnimal(a,dxMove,dzMove){
  const r = ANIMAL_RADIUS[a.type]||0.4;
  const fromX = a.x, fromZ = a.z;
  const tryX = a.x+dxMove;
  if(!animalStepBlocked(tryX,a.z,a.y) && !entityBlockedByOthers(tryX,a.z,r,a,fromX,fromZ)) a.x = tryX;
  const tryZ = a.z+dzMove;
  if(!animalStepBlocked(a.x,tryZ,a.y) && !entityBlockedByOthers(a.x,tryZ,r,a,fromX,fromZ)) a.z = tryZ;
}

function getLookDir(yaw,pitch){
  return new THREE.Vector3(
    -Math.sin(yaw)*Math.cos(pitch),
    Math.sin(pitch),
    -Math.cos(yaw)*Math.cos(pitch)
  );
}

function isTouchingLadder(){
  const w = player.width/2;
  const minX = Math.floor(player.pos.x-w), maxX = Math.floor(player.pos.x+w);
  const minY = Math.floor(player.pos.y),   maxY = Math.floor(player.pos.y+player.height);
  const minZ = Math.floor(player.pos.z-w), maxZ = Math.floor(player.pos.z+w);
  for(let x=minX;x<=maxX;x++)
    for(let y=minY;y<=maxY;y++)
      for(let z=minZ;z<=maxZ;z++)
        if(getBlock(x,y,z)===LADDER) return true;
  return false;
}
// A single check at body-center height, not "any part of the hitbox touches water" — so wading
// through ankle-deep shoreline water (only the bottom sliver of the hitbox in a WATER cell) still
// walks normally, and only genuinely being submerged switches on swim controls.
function isInWater(){
  return getBlock(Math.floor(player.pos.x), Math.floor(player.pos.y+player.height*0.5), Math.floor(player.pos.z))===WATER;
}
function updatePlayer(dt){
  // Riding a Giant Eagle overrides everything else — no gravity, no WASD, no jumping, just along for
  // the tour (see the beingRidden branch in updateBigEagles). Mouse-look still works normally, since
  // that's driven by its own separate mousemove listener, not anything in here. Space gets off.
  if(player.ridingEagle){
    const e = player.ridingEagle;
    const stillExists = bigEagles.includes(e);
    const spaceDown = !!keys['Space'];
    const dismountPressed = spaceDown && !player.spaceWasDown;
    player.spaceWasDown = spaceDown;
    if(!stillExists || dismountPressed){
      // Dismount (or the eagle was killed mid-ride) — give it a fresh nearby home and let it resume
      // circling; normal physics (gravity included) picks back up for the player starting next frame.
      if(stillExists){
        e.beingRidden = false;
        // Dismounting doesn't move the player away from the eagle's back — without this, the very
        // next physics frame's gravity tick would find them still sitting exactly in its mount
        // hitbox and immediately remount them, over and over, forever (vel.y resets to 0 on every
        // mount, so they'd never actually fall). A brief cooldown on just this eagle gives the
        // player time to actually fall clear before it's mountable again.
        e.remountBlockedUntil = performance.now() + 1000;
        spawnBigEagleHome(e);
      }
      player.ridingEagle = null;
      player.vel.set(0,0,0);
      player.onGround = false;
      return;
    }
    player.pos.set(e.mesh.position.x, e.mesh.position.y + EAGLE_MOUNT_HEIGHT, e.mesh.position.z);
    player.vel.set(0,0,0);
    player.onGround = false;
    player.fallFrom = player.pos.y; // no fall damage accrued while riding, however high it flies
    return;
  }

  if(!player.inKayak) tryEnterKayak();
  if(player.inKayak){
    // Space hops you out wherever you are on the loop — the kayak doesn't wait, it just paddles on
    // without you, so getting back requires swimming to shore like any other lake crossing.
    const spaceDown = !!keys['Space'];
    const exitPressed = spaceDown && !player.spaceWasDown;
    player.spaceWasDown = spaceDown;
    if(exitPressed){
      player.inKayak = false;
      player.onGround = false;
      // Snap the kayak itself straight back to the dock — otherwise it'd sit abandoned wherever you
      // bailed, while tryEnterKayak keeps checking distance to the fixed dock spot, permanently
      // desyncing the one visible boat from the one spot that can actually re-launch it.
      const dock = kayakDockPos();
      kayakMesh.position.set(dock.x, KAYAK_SIT_Y, dock.z);
      kayakAngle = KAYAK_START_ANGLE;
      addChatMessage('Camp', '🛶 You climb out and swim clear of the kayak.');
      return;
    }
    updateKayakRide(dt);
    return;
  }

  if(!player.ridingHorse) tryMountHorse();
  if(player.ridingHorse){
    const spaceDown = !!keys['Space'];
    const dismountPressed = spaceDown && !player.spaceWasDown;
    player.spaceWasDown = spaceDown;
    if(dismountPressed){
      player.ridingHorse = false;
      player.onGround = false;
      // Same reasoning as the Giant Eagle's remountBlockedUntil: without a brief cooldown, standing
      // right next to the horse (there's no falling clear of it the way you fall clear of an eagle)
      // means the very next frame's tryMountHorse just puts you straight back on.
      horseRemountBlockedUntil = performance.now() + 1000;
      addChatMessage('Camp', '🐴 You hop down off the horse.');
      return;
    }
    updateHorseRide(dt);
    return;
  }

  const fx = -Math.sin(player.yaw), fz = -Math.cos(player.yaw);
  const rx =  Math.cos(player.yaw), rz = -Math.sin(player.yaw);

  let mx=0, mz=0;
  if(keys['KeyW']){ mx+=fx; mz+=fz; }
  if(keys['KeyS']){ mx-=fx; mz-=fz; }
  if(keys['KeyD']){ mx+=rx; mz+=rz; }
  if(keys['KeyA']){ mx-=rx; mz-=rz; }
  const len = Math.hypot(mx,mz);
  if(len>0){ mx/=len; mz/=len; }

  player.crawling = player.crawlMode || !!(keys['ControlLeft']||keys['ControlRight']);
  player.height = player.crawling ? CRAWL_HEIGHT : PLAYER_HEIGHT;
  player.eye = player.crawling ? CRAWL_EYE : PLAYER_EYE;
  const speed = player.crawling ? CRAWL_SPEED : (keys['ShiftLeft']||keys['ShiftRight']) ? SPRINT_SPEED : WALK_SPEED;

  const wasOnGround = player.onGround;
  const onLadder = isTouchingLadder();
  const inWater = isInWater();
  if(inWater && !player.inWater) SFX.splash();
  player.inWater = inWater;

  // Double jump: landing recharges one extra mid-air jump; pressing Space again while already
  // airborne — a genuine fresh press, not just still holding it down from the first jump, which is
  // why this needs edge detection rather than the ground jump's simpler "held + onGround" check —
  // spends it for a second upward boost. It's applied on top of whatever vertical speed you already
  // have at that moment, so timing the second press near the top of the first jump's arc reaches
  // noticeably higher than a single jump ever could.
  if(player.onGround) player.canDoubleJump = true;
  const spaceDown = !!keys['Space'];
  const spaceJustPressed = spaceDown && !player.spaceWasDown;
  player.spaceWasDown = spaceDown;

  if(onLadder){
    // Climbing overrides gravity entirely — hold W/Space to go up, S to go down, let go to hang in
    // place, same feel as swimming.
    let climbY = 0;
    if(keys['KeyW'] || keys['Space']) climbY = LADDER_CLIMB_SPEED;
    else if(keys['KeyS']) climbY = -LADDER_CLIMB_SPEED;
    player.vel.y = climbY;
  } else if(inWater){
    // Only Space actively swims up (not W) — W/A/S/D stay purely horizontal in water, same as on
    // land. Letting go sinks gently by default rather than holding position, so simply holding W to
    // cross a lake no longer keeps you pinned at the surface for free the whole way across; staying
    // up takes actually holding Space, the same way real swimming does. S swims down faster still.
    let swimY = -WATER_SINK_SPEED;
    if(keys['Space']) swimY = SWIM_SPEED;
    else if(keys['KeyS']) swimY = -SWIM_SPEED;
    player.vel.y = swimY;
  } else {
    player.vel.y += GRAVITY*dt;
    if(player.vel.y < -50) player.vel.y = -50;
    if(keys['Space'] && player.onGround){
      player.vel.y = JUMP_SPEED;
      player.onGround = false;
      SFX.jump();
    } else if(spaceJustPressed && !player.onGround && player.canDoubleJump){
      player.vel.y = JUMP_SPEED;
      player.canDoubleJump = false;
      SFX.jump();
    }
  }

  const dx = mx*speed*dt, dz = mz*speed*dt, dy = player.vel.y*dt;

  const pr = player.width/2;
  const fromX = player.pos.x, fromZ = player.pos.z;
  if(!collidesBox(player.pos.x+dx, player.pos.y, player.pos.z) && !entityBlockedByOthers(player.pos.x+dx, player.pos.z, pr, undefined, fromX, fromZ)) player.pos.x += dx;
  if(!collidesBox(player.pos.x, player.pos.y, player.pos.z+dz) && !entityBlockedByOthers(player.pos.x, player.pos.z+dz, pr, undefined, fromX, fromZ)) player.pos.z += dz;
  const mountEagle = dy<0 ? findMountableEagle(player.pos.x, player.pos.y+dy, player.pos.z) : null;
  if(mountEagle){
    player.ridingEagle = mountEagle;
    mountEagle.beingRidden = true;
    player.vel.set(0,0,0);
    player.onGround = false;
  } else if(!collidesBox(player.pos.x, player.pos.y+dy, player.pos.z) && !collidesAnimal(player.pos.x, player.pos.y+dy, player.pos.z)){
    player.pos.y += dy;
    player.onGround = false;
  } else {
    if(dy<0) player.onGround = true;
    player.vel.y = 0;
  }

  if(!wasOnGround && player.onGround){
    const fallDist = player.fallFrom - player.pos.y;
    if(fallDist > FALL_DAMAGE_FREE_BLOCKS){
      damagePlayer(Math.round(fallDist - FALL_DAMAGE_FREE_BLOCKS), 'fall');
    }
    SFX.land();
  }
  if(player.onGround || onLadder || inWater) player.fallFrom = player.pos.y;

  player.pos.x = Math.max(1, Math.min(WORLD_SIZE-1, player.pos.x));
  player.pos.z = Math.max(1, Math.min(WORLD_SIZE-1, player.pos.z));
  if(player.pos.y < -20) spawnPlayer();

  if(len>0 || !player.onGround || myHP<=0){
    idleTimer = 0;
    regenTimer = 0;
  } else if(myHP < PLAYER_MAX_HP && myHunger>0){
    idleTimer += dt;
    if(idleTimer >= REGEN_IDLE_DELAY){
      regenTimer += dt;
      if(regenTimer >= REGEN_INTERVAL){
        regenTimer -= REGEN_INTERVAL;
        myHP = Math.min(PLAYER_MAX_HP, myHP + HP_PER_HEART/2);
        updateHeartsUI();
      }
    }
  }
}

// ---------- Block interaction ----------
function raycastBlock(maxDist=6, step=0.02){
  const dir = getLookDir(player.yaw, player.pitch);
  const origin = camera.position;
  let prev = null;
  for(let t=0; t<maxDist; t+=step){
    const px = origin.x+dir.x*t, py = origin.y+dir.y*t, pz = origin.z+dir.z*t;
    const bx=Math.floor(px), by=Math.floor(py), bz=Math.floor(pz);
    const b = getBlock(bx,by,bz);
    if(b!==AIR && b!==WATER) return { x:bx,y:by,z:bz, prev };
    prev = {x:bx,y:by,z:bz};
  }
  return null;
}
// The giant flag's mural sits atop a 12-block pole — well past raycastBlock's normal ~6-block reach,
// which is deliberately short for ordinary mining/attacking. Reciting the Pledge in front of it isn't
// that kind of interaction, so it gets its own much longer raycast instead of widening reach for
// everything else. A coarser 0.1 step is fine here since it only needs to catch a chunky 3x2 target.
// The long reach is just to handle looking steeply up at the mural from nearby — FLAG_PLEDGE_PROXIMITY
// below is what actually stops it firing from clear across camp.
const FLAG_PLEDGE_MAX_DIST = 40;
const FLAG_PLEDGE_PROXIMITY = 10; // horizontal blocks from the pole — has to be standing in front of it
function raycastUSFlag(){
  const pole = giantFlagPolePos();
  const dx = player.pos.x-(pole.x+0.5), dz = player.pos.z-(pole.z+0.5);
  if(dx*dx+dz*dz > FLAG_PLEDGE_PROXIMITY*FLAG_PLEDGE_PROXIMITY) return false;
  const dir = getLookDir(player.yaw, player.pitch);
  const origin = camera.position;
  for(let t=0; t<FLAG_PLEDGE_MAX_DIST; t+=0.1){
    const bx=Math.floor(origin.x+dir.x*t), by=Math.floor(origin.y+dir.y*t), bz=Math.floor(origin.z+dir.z*t);
    const b = getBlock(bx,by,bz);
    if(b===AIR || b===WATER) continue;
    return US_FLAG_BLOCKS.has(b); // first solid thing in the way must actually be the flag, not something in front of it
  }
  return false;
}
let lastTreeWarningAt = 0;
const TREE_WARNING_COOLDOWN_MS = 5000;
function breakBlock(){
  const hit = raycastBlock();
  if(!hit) return;
  const b = getBlock(hit.x,hit.y,hit.z);
  if(b===BEDROCK) return;
  if(PROTECTED_CELLS.has(hit.x+','+hit.y+','+hit.z)) return;
  if(b===DOOR || b===DOOR_OPEN){
    const cells = findDoorCells(hit.x,hit.y,hit.z) || [{x:hit.x,y:hit.y,z:hit.z}];
    for(const c of cells) applyWorldEdit(c.x, c.y, c.z, AIR);
    invAdd(DOOR, 1);
    saveInventory();
    updateHotbarUI();
    triggerSwing();
    SFX.breakBlock();
    return;
  }
  if(b===SAPLING){
    const cells = findSaplingColumn(hit.x,hit.y,hit.z);
    for(const c of cells) applyWorldEdit(c.x, c.y, c.z, AIR);
    cancelSapling(hit.x, hit.z);
    updateHotbarUI();
    triggerSwing();
    SFX.breakBlock();
    return;
  }
  if(b===FIRE){
    extinguishFire(hit.x+','+hit.y+','+hit.z);
    triggerSwing();
    SFX.breakBlock();
    return;
  }
  if(b===TENT){
    // Breaking any one wall takes the whole shelter down and hands back a single Tent item, same as
    // a door — the alternative (COLLECTIBLE's plain 1-for-1 map) would refund a full Tent for every
    // one of its ~23 cells broken individually.
    const cells = findTentCells(hit.x,hit.y,hit.z);
    for(const c of cells) applyWorldEdit(c.x, c.y, c.z, AIR);
    invAdd(TENT, 1);
    saveInventory();
    updateHotbarUI();
    triggerSwing();
    SFX.breakBlock();
    return;
  }
  if(b===FLAG || b===FLAG_POLE){
    // Same reasoning as a tent: breaking any part of the 3-tall pole takes the whole thing down and
    // hands back exactly one Troop Flag, not one per segment.
    const cells = findFlagCells(hit.x,hit.y,hit.z);
    for(const c of cells) applyWorldEdit(c.x, c.y, c.z, AIR);
    invAdd(FLAG, 1);
    saveInventory();
    updateHotbarUI();
    triggerSwing();
    SFX.breakBlock();
    return;
  }
  applyWorldEdit(hit.x, hit.y, hit.z, AIR);
  if(COLLECTIBLE.has(b)){ invAdd(COLLECT_AS[b] || b, 1); saveInventory(); }
  if(b===WOOD){
    // A canopy overhead means this was a living tree, not a dead snag or something you built — the
    // real Scout ethic is dead wood for the fire, living trees left standing. Cooldown just keeps
    // felling one whole tree from repeating the same line for every trunk block near its canopy.
    if(hasCanopyNear(hit.x, hit.y, hit.z) && Date.now()-lastTreeWarningAt >= TREE_WARNING_COOLDOWN_MS){
      lastTreeWarningAt = Date.now();
      addChatMessage('Camp', "🌳 That's a living tree — a real Scout cuts only dead wood and leaves living trees standing.");
    }
    checkTreeSupport(hit.x, hit.y, hit.z);
  }
  updateHotbarUI();
  triggerSwing();
  SFX.breakBlock();
}
function playerOverlapsCell(x,y,z){
  const w = player.width/2;
  const px=player.pos.x, py=player.pos.y, pz=player.pos.z;
  return (x+1>px-w && x<px+w && z+1>pz-w && z<pz+w && y<py+player.height && y+1>py);
}
function animalOverlapsCell(a,x,y,z){
  const r = ANIMAL_RADIUS[a.type]||0.4;
  const h = ANIMAL_REAL_HEIGHT[a.type]||0.8;
  return (x+1>a.x-r && x<a.x+r && z+1>a.z-r && z<a.z+r && y<a.y+h && y+1>a.y);
}
function placeDoor(hit){
  const {x,y,z} = hit.prev;
  if(invCount(DOOR)<=0) return;
  // Orientation is driven by which way the player is actually looking (yaw), not by which exact
  // face the raycast happened to hit — the old face-normal approach could pick a different axis
  // depending on subtle aim differences even when the player felt like they were facing the same
  // way, which read as "random." Facing more along X/Z decides the door's width axis (perpendicular
  // to your view, like something you'd walk through), and it always extends toward your right hand
  // from the cell you targeted, so the same aim always produces the same door.
  const fx = -Math.sin(player.yaw), fz = -Math.cos(player.yaw);
  const axis = Math.abs(fx) > Math.abs(fz) ? 'z' : 'x';
  const rx = Math.cos(player.yaw), rz = -Math.sin(player.yaw);
  const widthDir = (axis==='x' ? rx : rz) >= 0 ? 1 : -1;
  const cells = [];
  for(let dy=0; dy<3; dy++)
    for(let w=0; w<2; w++)
      cells.push({ x: axis==='x'?x+w*widthDir:x, y: y+dy, z: axis==='z'?z+w*widthDir:z });
  for(const c of cells){
    if(getBlock(c.x,c.y,c.z)!==AIR) return;
    if(playerOverlapsCell(c.x,c.y,c.z)) return;
  }
  for(const c of cells) applyWorldEdit(c.x, c.y, c.z, DOOR);
  invSub(DOOR,1);
  saveInventory();
  updateHotbarUI();
  triggerSwing();
  SFX.placeBlock();
}
const LADDER_PLACE_HEIGHT = 5;
// One Ladder item places a run of up to 5 rungs going straight up from the targeted cell (stopping
// early if it runs into something, rather than requiring the full run to be clear like a door does)
// — climbing any of them is handled in updatePlayer via isTouchingLadder.
function placeLadder(hit){
  const {x,y,z} = hit.prev;
  if(invCount(LADDER)<=0) return;
  const cells = [];
  for(let dy=0; dy<LADDER_PLACE_HEIGHT; dy++){
    const cy = y+dy;
    if(getBlock(x,cy,z)!==AIR || playerOverlapsCell(x,cy,z)) break;
    cells.push({x,y:cy,z});
  }
  if(cells.length===0) return;
  for(const c of cells) applyWorldEdit(c.x, c.y, c.z, LADDER);
  invSub(LADDER,1);
  saveInventory();
  updateHotbarUI();
  triggerSwing();
  SFX.placeBlock();
}
// A tent is a whole walk-in shelter, not one cube: a real A-frame silhouette, five blocks wide at
// the base tapering to a one-block ridge at the top (5-3-1 — the closest a voxel slope ever gets to
// a straight line), three rows deep, with a one-block-wide gap kept open through the front and
// middle rows, two levels tall, so you can actually walk in and stand upright under the ridge.
// Oriented the same way placeDoor works out a door's width axis — whichever of x/z you're more
// square-on to becomes the tent's depth, extending away from you so the entrance ends up facing
// back the way you were standing when you placed it.
function findTentCells(x,y,z){
  // Flood fill rather than reconstructing the fixed shape geometrically (like findDoorCells does) —
  // a tent has too many cells for that to stay simple, and a plain bounded flood fill handles any
  // orientation for free. Capped well above one tent's 23 cells purely as a runaway-search guard.
  const cells = [], seen = new Set(), stack = [{x,y,z}];
  while(stack.length && cells.length<40){
    const c = stack.pop();
    const k = c.x+','+c.y+','+c.z;
    if(seen.has(k)) continue;
    seen.add(k);
    if(getBlock(c.x,c.y,c.z)!==TENT) continue;
    cells.push(c);
    stack.push({x:c.x+1,y:c.y,z:c.z},{x:c.x-1,y:c.y,z:c.z},{x:c.x,y:c.y+1,z:c.z},
               {x:c.x,y:c.y-1,z:c.z},{x:c.x,y:c.y,z:c.z+1},{x:c.x,y:c.y,z:c.z-1});
  }
  return cells;
}
function placeTent(hit){
  const {x,y,z} = hit.prev;
  if(invCount(TENT)<=0) return;
  const fx = -Math.sin(player.yaw), fz = -Math.cos(player.yaw);
  const depthAxis = Math.abs(fx) > Math.abs(fz) ? 'x' : 'z';
  const depthDir = (depthAxis==='x' ? fx : fz) >= 0 ? 1 : -1;
  // How far the walls reach out from the centerline at each height — the taper that makes this read
  // as a peaked "A" instead of a box. The top level is just the ridge: one block, always solid.
  const REACH = [2, 1, 0];
  const cells = []; // wall:true cells become TENT; the rest just need to be clear, walkable space
  for(let depth=0; depth<=2; depth++){
    const back = depth===2; // the far row is a plain solid gable end, no opening at any height
    for(let dy=0; dy<REACH.length; dy++){
      const reach = REACH[dy];
      for(let w=-reach; w<=reach; w++){
        const dx = depthAxis==='x' ? depth*depthDir : w;
        const dz = depthAxis==='x' ? w : depth*depthDir;
        const isOpening = !back && dy<=1 && w===0; // door (front row) / headroom (middle row)
        cells.push({ x:x+dx, y:y+dy, z:z+dz, wall: !isOpening });
      }
    }
  }
  for(const c of cells){
    if(getBlock(c.x,c.y,c.z)!==AIR) return;
    if(c.wall && playerOverlapsCell(c.x,c.y,c.z)) return;
  }
  for(const c of cells) if(c.wall) applyWorldEdit(c.x, c.y, c.z, TENT);
  Scout.placed(TENT, x, z);
  invSub(TENT,1);
  saveInventory();
  updateHotbarUI();
  triggerSwing();
  SFX.placeBlock();
}
// A Troop Flag is a real 3-tall flagpole now, not one squashed cube: two bare FLAG_POLE segments
// with the pennant-topped FLAG block itself on top, so the banner actually flies above head height
// instead of sitting at your feet. Flood-filled back into one item on breaking, same as a tent.
function findFlagCells(x,y,z){
  const isFlagPart = b => b===FLAG || b===FLAG_POLE;
  const cells = [], seen = new Set(), stack = [{x,y,z}];
  while(stack.length && cells.length<10){
    const c = stack.pop();
    const k = c.x+','+c.y+','+c.z;
    if(seen.has(k)) continue;
    seen.add(k);
    if(!isFlagPart(getBlock(c.x,c.y,c.z))) continue;
    cells.push(c);
    stack.push({x:c.x+1,y:c.y,z:c.z},{x:c.x-1,y:c.y,z:c.z},{x:c.x,y:c.y+1,z:c.z},
               {x:c.x,y:c.y-1,z:c.z},{x:c.x,y:c.y,z:c.z+1},{x:c.x,y:c.y,z:c.z-1});
  }
  return cells;
}
function placeFlag(hit){
  const {x,y,z} = hit.prev;
  if(invCount(FLAG)<=0) return;
  const cells = [
    {x, y,   z, block:FLAG_POLE},
    {x, y:y+1, z, block:FLAG_POLE},
    {x, y:y+2, z, block:FLAG},
  ];
  for(const c of cells){
    if(getBlock(c.x,c.y,c.z)!==AIR) return;
    if(playerOverlapsCell(c.x,c.y,c.z)) return;
  }
  for(const c of cells) applyWorldEdit(c.x, c.y, c.z, c.block);
  Scout.placed(FLAG, x, z);
  invSub(FLAG,1);
  saveInventory();
  updateHotbarUI();
  triggerSwing();
  SFX.placeBlock();
}
function placeBlock(){
  const hit = raycastBlock();
  if(!hit || !hit.prev) return;
  const block = HOTBAR[selectedSlot];
  if(block===DOOR){ placeDoor(hit); return; }
  if(block===LADDER){ placeLadder(hit); return; }
  if(block===TENT){ placeTent(hit); return; }
  if(block===FLAG){ placeFlag(hit); return; }
  const {x,y,z} = hit.prev;
  if(getBlock(x,y,z)!==AIR) return;
  if(invCount(block)<=0) return;
  if(playerOverlapsCell(x,y,z)) return;
  applyWorldEdit(x, y, z, block);
  Scout.placed(block, x, z);
  if(block===WATER) seedWaterFlowFromPlacement(x, y, z);
  invSub(block,1);
  saveInventory();
  updateHotbarUI();
  triggerSwing();
  SFX.placeBlock();
}

// ---------- Input ----------
const hotkeyPanel = document.getElementById('hotkeyPanel');
function toggleHotkeyPanel(){ hotkeyPanel.hidden = !hotkeyPanel.hidden; }
const keys = {};
let selectedSlot = 0;
// Direct letter shortcuts for the hotbar, one per slot — no numbers, no scroll-wheel cycling.
// Picked to avoid every letter already bound to something else (WASD move, E craft, I inventory,
// V third-person, B backpack, M badges, K sleep, N day/night, Z crawl toggle, H hotkey panel), and
// clustered as tightly as possible around WASD so they're reachable without moving your hand.
// L took Z's old slot once crawl toggle moved onto Z, and J takes H's old slot now that H opens the
// hotkey panel instead (see the keydown handler below).
const HOTBAR_KEYS = ['KeyQ','KeyR','KeyF','KeyT','KeyG','KeyC','KeyX','KeyL','KeyJ'];
window.addEventListener('keydown', e=>{
  keys[e.code]=true;
  if(e.code==='KeyD' && e.altKey && e.shiftKey && !e.ctrlKey && !e.metaKey){
    // Alt+Shift+D (Option+Shift+D on macOS) rather than Ctrl/Cmd+Shift+D — that one's "bookmark all
    // tabs" in Chrome on both Windows/Linux (Ctrl+Shift+D) and macOS (Cmd+Shift+D), and neither Chrome
    // nor macOS binds anything to Alt+Shift+D by default.
    e.preventDefault();
    toggleDebugPanel();
    return;
  }
  if(e.code==='Escape'){
    if(craftingOpen){ closeCrafting(false); return; }
    if(itemsOpen){ closeItems(false); return; }
    if(bearBoxOpen){ closeBearBox(false); return; }
    if(backpackOpen){ closeBackpackStorage(false); return; }
    if(cookwareOpen){ closeCookware(false); return; }
    if(sashOpen){ closeSash(false); return; }
  }
  if(e.code==='KeyM'){
    if(sashOpen){ closeSash(true); return; }
    if(craftingOpen || itemsOpen || bearBoxOpen || backpackOpen || cookwareOpen) return;
    if(locked && !isDead) openSash();
    return;
  }
  if(e.code==='KeyE'){
    if(craftingOpen){ closeCrafting(false); return; }
    if(locked && !isDead && nearestCraftingTable(4)) openCrafting();
    return;
  }
  if(e.code==='KeyI'){
    if(itemsOpen){ closeItems(true); return; }
    if(craftingOpen) return;
    if(locked && !isDead) openItems();
    return;
  }
  if(e.code==='KeyB'){
    if(backpackOpen){ closeBackpackStorage(true); return; }
    if(craftingOpen || itemsOpen || bearBoxOpen || sashOpen || cookwareOpen) return;
    if(locked && !isDead) openBackpackStorage();
    return;
  }
  if(e.code==='KeyV' && locked){ thirdPerson = !thirdPerson; return; }
  if(e.code==='KeyN' && locked){ cycleTimeMode(); return; }
  if(e.code==='KeyK' && locked && !isDead){ trySleep(); return; }
  if(e.code==='KeyZ' && locked){ player.crawlMode = !player.crawlMode; return; }
  if(e.code==='KeyH' && locked){ toggleHotkeyPanel(); return; }
  if(e.code==='KeyP'){ useFirstAid(); return; }
  if(e.code==='KeyO'){ useStopBear(); return; }
  const slotIdx = HOTBAR_KEYS.indexOf(e.code);
  if(slotIdx>=0 && slotIdx<HOTBAR.length){
    selectedSlot = slotIdx; updateHotbarUI(); updateHeldItemColor();
    if(itemsOpen) renderItemsGrid();
  }
});
window.addEventListener('keyup', e=>{ keys[e.code]=false; });

const isTouchDevice = ('ontouchstart' in window) || navigator.maxTouchPoints > 0;
function doAttackOrBreak(){
  if(raycastUSFlag()){ playPledge(); return; }
  if(!tryAttack()) breakBlock();
}
// Cooking meat over a campfire doubles what it's worth — the practical payoff for Firecraft.
const FOOD_RESTORE = { [MEAT]: MEAT_HUNGER_RESTORE, [COOKED_MEAT]: MEAT_HUNGER_RESTORE*2 };
function tryEatFood(id){
  const restore = FOOD_RESTORE[id];
  if(!restore || invCount(id)<=0 || myHunger>=PLAYER_MAX_HUNGER) return;
  invSub(id,1);
  saveInventory();
  updateHotbarUI();
  myHunger = Math.min(PLAYER_MAX_HUNGER, myHunger + restore);
  updateHungerUI();
  SFX.eat();
}
function doInteract(){
  const hit = raycastBlock();
  const hitBlock = hit ? getBlock(hit.x,hit.y,hit.z) : null;
  const held = HOTBAR[selectedSlot];
  // Any cookware — Pot/Pan/Dutch Oven/Griddle at the fixed camp stations, or any Campfire anywhere,
  // fixed or player-placed — opens its recipe window regardless of what's in hand, same priority a
  // Crafting Table or the Bear Box already gets below.
  if(hitBlock in BLOCK_TO_WARE_KEY){ openCookware(BLOCK_TO_WARE_KEY[hitBlock]); return; }
  if(hit && TOTEM_BLOCKS.includes(hitBlock)){
    const totem = totemAt(hit.x, hit.z);
    if(totem) totem.play();
    return;
  }
  if(held===FLINT){ tryIgniteFire(hit); return; }
  if(held===FIREWORK){ launchFirework(); return; }
  if(FOOD_RESTORE[held]!=null){ tryEatFood(held); return; }
  if(held===COMPASS){ useCompass(); return; }
  if(held===FISHING_POLE){ tryFish(); return; }
  // Carried items with no block form at all — without this they'd place as an untextured cube,
  // since none of them has a BLOCK_TILES entry.
  if(CARRY_ONLY_ITEMS.has(held)) return;
  if(hitBlock===CRAFTING_TABLE) openCrafting();
  else if(hitBlock===BACKPACK) openBackpackStorage();
  else if(hitBlock===BEAR_BOX) openBearBox();
  else if(hitBlock===SCOUT_LAW_BOX) collectScoutLawBox(hit.x, hit.y, hit.z);
  else if(hitBlock in TOGGLE_MAP) toggleOpenable(hit.x, hit.y, hit.z, hitBlock);
  else placeBlock();
}

const overlay = document.getElementById('overlay');
const touchControls = document.getElementById('touchControls');
let locked = false;
const nameInput = document.getElementById('nameInput');
nameInput.value = myName==='Player' ? '' : myName;
nameInput.addEventListener('click', e=> e.stopPropagation());
nameInput.addEventListener('touchstart', e=> e.stopPropagation());
nameInput.addEventListener('keydown', e=> e.stopPropagation());
// Troop number and neckerchief color, same stopPropagation reasoning as the name field above —
// otherwise a click here would bubble up into overlay's click-to-play handler.
const troopInput = document.getElementById('troopInput');
troopInput.value = myTroop;
troopInput.addEventListener('click', e=> e.stopPropagation());
troopInput.addEventListener('touchstart', e=> e.stopPropagation());
troopInput.addEventListener('keydown', e=> e.stopPropagation());
const neckerchiefColorInput = document.getElementById('neckerchiefColorInput');
neckerchiefColorInput.value = myNeckerchiefColor;
neckerchiefColorInput.addEventListener('click', e=> e.stopPropagation());
neckerchiefColorInput.addEventListener('input', e=> e.stopPropagation());
// Same reasoning as the name field above: without this, clicking the popcorn link would also bubble
// up into overlay's own click-to-play handler and start the game right underneath the new tab.
const overlayCreditsLink = document.querySelector('#overlay .credits a');
if(overlayCreditsLink) overlayCreditsLink.addEventListener('click', e=> e.stopPropagation());
// The long how-to-play paragraph starts collapsed so the front page reads clean at a glance —
// this just reveals/re-hides it in place, same stopPropagation reasoning as the name field above.
const btnHelp = document.getElementById('btnHelp');
const playHint = document.getElementById('playHint');
if(btnHelp && playHint){
  btnHelp.addEventListener('click', e=>{
    e.stopPropagation();
    playHint.hidden = !playHint.hidden;
    btnHelp.textContent = playHint.hidden ? '❓ How to play' : '✕ Hide help';
  });
}
if(isTouchDevice){
  document.body.classList.add('touch-device');
  const controlsP = document.getElementById('controlsText');
  if(controlsP) controlsP.innerHTML = 'A tiny Minecraft-inspired voxel sandbox that runs entirely in your browser.<br><br>Left stick: move &nbsp; Drag right side: look<br>⛏ break/attack &nbsp; ▦ place/interact &nbsp; JUMP jump &nbsp; CRAWL hold to crawl &nbsp; 3rd camera &nbsp; 🕐 cycle day/night';
  const tapP = document.getElementById('tapToPlay');
  if(tapP) tapP.innerHTML = '<strong>Tap anywhere to play</strong>';
  const hintP = document.getElementById('playHint');
  if(hintP) hintP.textContent = 'Tap Backpack (B) for your tent, compass and other starting gear, then break blocks to gather materials and place your Crafting Table to craft a campfire, lantern and troop flag. Rabbits and deer are harmless — the moose will fight back if you attack it, and the black bear will attack on sight if you get too close. Progress is saved automatically in this browser.';
}
overlay.addEventListener('click', ()=>{
  ensureAudio();
  if(craftingOpen) return;
  const typedName = nameInput.value.trim().slice(0,16);
  if(typedName) myName = typedName;
  try{ localStorage.setItem('scoutcraft_player_name', myName); }catch(e){}
  myTroop = troopInput.value.trim().slice(0,4);
  myNeckerchiefColor = neckerchiefColorInput.value;
  try{
    localStorage.setItem('scoutcraft_player_troop', myTroop);
    localStorage.setItem('scoutcraft_player_neckerchief', myNeckerchiefColor);
  }catch(e){}
  applyUniformCustomization(characterMesh, myTroop, myNeckerchiefColor);
  if(isTouchDevice){
    locked = true;
    overlay.hidden = true;
    touchControls.hidden = false;
  } else {
    // requestPointerLock() can silently fail (browser rate-limiting a rapid re-request, a focus
    // quirk, etc.) without ever firing 'pointerlockchange' — and since that event is the only place
    // `locked`/overlay.hidden normally get set, a failed request used to leave the game stuck at this
    // menu forever: WASD does nothing (updatePlayer is gated on `locked`), while animals, birds and
    // day/night keep animating behind the overlay, which reads just like the game hanging. Catch a
    // rejection and fall back to unblocking movement/attack directly — mouse-look may need one more
    // click to actually engage, but the game is never stuck unresponsive because of it.
    const req = document.body.requestPointerLock();
    if(req && typeof req.catch==='function'){
      req.catch(()=>{
        locked = true;
        overlay.hidden = true;
      });
    }
  }
});
document.addEventListener('pointerlockchange', ()=>{
  if(isTouchDevice) return;
  locked = document.pointerLockElement === document.body;
  overlay.hidden = locked || craftingOpen || itemsOpen || bearBoxOpen || backpackOpen || cookwareOpen;
});
document.addEventListener('mousemove', e=>{
  if(!locked || isTouchDevice) return;
  player.yaw -= e.movementX * 0.0022;
  player.pitch -= e.movementY * 0.0022;
  player.pitch = Math.max(-Math.PI/2+0.01, Math.min(Math.PI/2-0.01, player.pitch));
  // Exactly cancels the player.yaw change above for camera purposes (see peekYaw's own comment) —
  // the camera holds still while the character keeps turning with the mouse.
  if(thirdPerson){
    peekYaw += e.movementX * 0.0022;
    peekTimer = PEEK_HOLD_S;
  }
});
document.addEventListener('contextmenu', e=> e.preventDefault());
document.addEventListener('mousedown', e=>{
  if(!locked || isDead) return;
  if(e.button===0) doAttackOrBreak();
  if(e.button===2) doInteract();
});

// ---------- Touch controls (phones/tablets: virtual joystick, drag-look, action buttons) ----------
if(isTouchDevice){
  const joyBase = document.getElementById('joystickBase');
  const joyKnob = document.getElementById('joystickKnob');
  const maxR = 38;
  let joyTouchId = null, joyCenter = {x:0,y:0};
  function setMoveKeys(forward, strafe, mag){
    keys['KeyW'] = forward > 0.25;
    keys['KeyS'] = forward < -0.25;
    keys['KeyD'] = strafe > 0.25;
    keys['KeyA'] = strafe < -0.25;
    keys['ShiftLeft'] = mag > 0.85;
  }
  function updateJoystick(cx,cy){
    const dx = cx-joyCenter.x, dy = cy-joyCenter.y;
    const dist = Math.hypot(dx,dy);
    const clamped = Math.min(dist, maxR);
    const ang = Math.atan2(dy,dx);
    const kx = Math.cos(ang)*clamped, ky = Math.sin(ang)*clamped;
    joyKnob.style.transform = `translate(${kx}px, ${ky}px)`;
    setMoveKeys(-(ky/maxR), kx/maxR, clamped/maxR);
  }
  function resetJoystick(){
    joyTouchId = null;
    joyKnob.style.transform = 'translate(0px,0px)';
    setMoveKeys(0,0,0);
  }
  joyBase.addEventListener('touchstart', e=>{
    const t = e.changedTouches[0];
    joyTouchId = t.identifier;
    const rect = joyBase.getBoundingClientRect();
    joyCenter = { x: rect.left+rect.width/2, y: rect.top+rect.height/2 };
    updateJoystick(t.clientX, t.clientY);
    e.preventDefault();
  }, {passive:false});
  joyBase.addEventListener('touchmove', e=>{
    for(const t of e.changedTouches) if(t.identifier===joyTouchId) updateJoystick(t.clientX, t.clientY);
    e.preventDefault();
  }, {passive:false});
  joyBase.addEventListener('touchend', e=>{
    for(const t of e.changedTouches) if(t.identifier===joyTouchId) resetJoystick();
  });
  joyBase.addEventListener('touchcancel', resetJoystick);

  const lookZone = document.getElementById('touchLookZone');
  let lookTouchId = null, lastLook = {x:0,y:0};
  lookZone.addEventListener('touchstart', e=>{
    if(craftingOpen) return;
    const t = e.changedTouches[0];
    lookTouchId = t.identifier;
    lastLook = {x:t.clientX, y:t.clientY};
    e.preventDefault();
  }, {passive:false});
  lookZone.addEventListener('touchmove', e=>{
    for(const t of e.changedTouches){
      if(t.identifier===lookTouchId){
        const dx = t.clientX-lastLook.x, dy = t.clientY-lastLook.y;
        lastLook = {x:t.clientX, y:t.clientY};
        player.yaw -= dx*0.0045;
        player.pitch -= dy*0.0045;
        player.pitch = Math.max(-Math.PI/2+0.01, Math.min(Math.PI/2-0.01, player.pitch));
      }
    }
    e.preventDefault();
  }, {passive:false});
  lookZone.addEventListener('touchend', e=>{
    for(const t of e.changedTouches) if(t.identifier===lookTouchId) lookTouchId = null;
  });

  function bindTouchButton(id, onDown, onUp){
    const el = document.getElementById(id);
    el.addEventListener('touchstart', e=>{ e.preventDefault(); e.stopPropagation(); onDown(); }, {passive:false});
    if(onUp) el.addEventListener('touchend', e=>{ e.preventDefault(); e.stopPropagation(); onUp(); }, {passive:false});
  }
  bindTouchButton('btnAttack', ()=>{ if(locked && !craftingOpen && !isDead) doAttackOrBreak(); });
  bindTouchButton('btnPlace', ()=>{ if(locked && !craftingOpen && !isDead) doInteract(); });
  bindTouchButton('btnJump', ()=>{ keys['Space']=true; }, ()=>{ keys['Space']=false; });
  const crawlBtn = document.getElementById('btnCrawl');
  bindTouchButton('btnCrawl', ()=>{ keys['ControlLeft']=true; crawlBtn.classList.add('active'); }, ()=>{ keys['ControlLeft']=false; crawlBtn.classList.remove('active'); });
  bindTouchButton('btn3p', ()=>{ if(locked) thirdPerson = !thirdPerson; });
  bindTouchButton('btnTime', ()=>{ if(locked) cycleTimeMode(); });
}

// ---------- Debug panel (Alt+Shift+D) ----------
// A read-only developer overlay: a full census of every block currently in the world (trees, wood,
// leaves, water called out up top, everything else below) plus a grab-bag of other live counts that
// are handy to eyeball while testing. It doesn't pause the game or grab the pointer — it's just an
// overlay, like Minecraft's own F3 screen — and refreshes on a slow timer while open rather than every
// frame, since walking the whole world array is cheap but pointless to redo 60 times a second for
// numbers that only change when someone breaks a block or a worm eats a leaf.
// "Trees" specifically counts live trunk bases — a WOOD block sitting directly on the natural terrain
// surface (heightAt(x,z)+1) — rather than trying to flood-fill distinct trees out of the census, which
// runs into the exact same neighboring-trees-blur problem already noted on checkTreeSupport. This
// undercounts a giant tree as just one tree (correct) and only counts ones with an intact base (also
// what "how many trees are still standing" should mean), at the cost of occasionally miscounting a
// single player-placed wood block that happens to sit exactly at natural ground level as a "tree" —
// an acceptable rough edge for a debug readout, not a scored feature.
let debugPanelOpen = false;
let debugPanelTimer = 0;
function debugBlockName(id){
  if(id===AIR) return 'Air';
  if(id===BEDROCK) return 'Bedrock';
  return BLOCK_NAME[id] || ('Block #'+id);
}
function computeWorldCensus(){
  const counts = new Uint32Array(256);
  for(let i=0;i<world.length;i++) counts[world[i]]++;
  let treeCount = 0;
  for(let x=0;x<WORLD_SIZE;x++){
    for(let z=0;z<WORLD_SIZE;z++){
      const h = heightAt(x,z);
      if(h+1<WORLD_HEIGHT && getBlock(x,h+1,z)===WOOD) treeCount++;
    }
  }
  return { counts, treeCount };
}
function renderDebugPanel(){
  const panel = document.getElementById('debugPanel');
  if(!panel || !debugPanelOpen) return;
  const { counts, treeCount } = computeWorldCensus();
  const rows = [];
  for(let id=1; id<256; id++) if(counts[id]>0) rows.push({ id, name: debugBlockName(id), count: counts[id] });
  rows.sort((a,b)=>b.count-a.count);
  const chunkX = Math.floor(player.pos.x/CHUNK_SIZE), chunkZ = Math.floor(player.pos.z/CHUNK_SIZE);
  const fps = document.getElementById('fps');
  panel.innerHTML = `
    <h3>World census</h3>
    <table>
      <tr><td>🌳 Trees (standing)</td><td>${treeCount.toLocaleString()}</td></tr>
      <tr><td>🪵 Wood if all cut</td><td>${(counts[WOOD]||0).toLocaleString()}</td></tr>
      <tr><td>🍃 Leaves blocks</td><td>${(counts[LEAVES]||0).toLocaleString()}</td></tr>
      <tr><td>💧 Water blocks</td><td>${(counts[WATER]||0).toLocaleString()}</td></tr>
    </table>
    <h3>All block types</h3>
    <table>${rows.map(r=>`<tr><td>${r.name}</td><td>${r.count.toLocaleString()}</td></tr>`).join('')}</table>
    <h3>Live stats</h3>
    <table>
      <tr><td>FPS</td><td>${fps?fps.textContent:'?'}</td></tr>
      <tr><td>Block edits</td><td>${edits.size.toLocaleString()}</td></tr>
      <tr><td>Chunk meshes built</td><td>${chunkMeshes.size} / ${CHUNKS_PER_SIDE*CHUNKS_PER_SIDE}</td></tr>
      <tr><td>Animals</td><td>${animals.length}</td></tr>
      <tr><td>Worms</td><td>${worms.length}</td></tr>
      <tr><td>Butterflies</td><td>${butterflies.length}</td></tr>
      <tr><td>Birds</td><td>${birds.length}</td></tr>
      <tr><td>Fish</td><td>${fish.length}</td></tr>
      <tr><td>Active fires</td><td>${fires.size}</td></tr>
      <tr><td>Falling clusters</td><td>${fallingClusters.length}</td></tr>
      <tr><td>Your position</td><td>${player.pos.x.toFixed(1)}, ${player.pos.y.toFixed(1)}, ${player.pos.z.toFixed(1)}</td></tr>
      <tr><td>Your chunk</td><td>${chunkX}, ${chunkZ}</td></tr>
      <tr><td>World size</td><td>${WORLD_SIZE}×${WORLD_SIZE}×${WORLD_HEIGHT}</td></tr>
    </table>
  `;
}
function toggleDebugPanel(){
  debugPanelOpen = !debugPanelOpen;
  const panel = document.getElementById('debugPanel');
  if(panel) panel.hidden = !debugPanelOpen;
  if(debugPanelOpen){ debugPanelTimer = 0; renderDebugPanel(); }
}

function swatchColor(id){ return '#' + BLOCK_COLOR[id].toString(16).padStart(6,'0'); }

function updateHotbarUI(){
  const el = document.getElementById('hotbar');
  el.innerHTML = '';
  HOTBAR.forEach((b,i)=>{
    const count = invCount(b);
    const slot = document.createElement('div');
    slot.className = 'slot' + (i===selectedSlot ? ' active' : '') + (count<=0 ? ' empty' : '');
    const sw = document.createElement('div');
    sw.className = 'swatch';
    sw.style.background = swatchColor(b);
    slot.appendChild(sw);
    if(HOTBAR_ICON[b]){
      const icon = document.createElement('div');
      icon.className = 'icon';
      icon.textContent = HOTBAR_ICON[b];
      slot.appendChild(icon);
    }
    const key = document.createElement('div');
    key.className='key'; key.textContent = HOTBAR_KEYS[i] ? HOTBAR_KEYS[i].slice(3) : '';
    slot.appendChild(key);
    const count_el = document.createElement('div');
    count_el.className='count'; count_el.textContent = count===Infinity ? '∞' : count;
    slot.appendChild(count_el);
    slot.title = BLOCK_NAME[b] + ' (click again to change)';
    slot.addEventListener('click', ()=>{
      if(selectedSlot===i) openItems();
      else { selectedSlot = i; updateHotbarUI(); updateHeldItemColor(); }
    });
    el.appendChild(slot);
  });
  if(craftingOpen) renderCrafting();
}

// ---------- Crafting UI ----------
let craftingOpen = false;
const craftingModal = document.getElementById('craftingModal');
const craftHint = document.getElementById('craftHint');
const fishingHint = document.getElementById('fishingHint');
document.getElementById('craftingClose').addEventListener('click', ()=> closeCrafting(true));
craftingModal.addEventListener('click', e=>{ if(e.target===craftingModal) closeCrafting(true); });

function openCrafting(){
  craftingOpen = true;
  craftingModal.hidden = false;
  if(document.pointerLockElement) document.exitPointerLock();
  if(isTouchDevice) locked = false;
  overlay.hidden = true;
  renderCrafting();
}
function closeCrafting(relock){
  craftingOpen = false;
  craftingModal.hidden = true;
  if(relock){
    if(isTouchDevice) locked = true;
    else document.body.requestPointerLock();
  } else if(!isTouchDevice) overlay.hidden = false;
}
function renderCrafting(){
  const invEl = document.getElementById('craftingInventory');
  invEl.innerHTML = '';
  const held = Object.keys(inventory).map(Number).filter(id => invCount(id)>0);
  if(held.length===0){
    invEl.innerHTML = '<span style="opacity:0.6">Nothing yet — break some blocks to gather materials.</span>';
  } else {
    held.forEach(id=>{
      const row = document.createElement('div');
      row.className = 'invItem';
      row.innerHTML = `<span class="sw" style="background:${swatchColor(id)}"></span>${BLOCK_NAME[id]} × ${invCount(id)}`;
      invEl.appendChild(row);
    });
  }

  const recEl = document.getElementById('craftingRecipes');
  recEl.innerHTML = '';
  RECIPES.forEach((r,i)=>{
    const ok = canCraft(r);
    const row = document.createElement('div');
    row.className = 'recipe';
    const needText = r.in.map(ing => `${ing.qty} ${BLOCK_NAME[ing.id]} (have ${invCount(ing.id)})`).join(', ');
    row.innerHTML = `
      <span class="sw" style="background:${swatchColor(r.out.id)}"></span>
      <div class="info"><b>${r.name} × ${r.out.qty}</b><span class="need${ok?'':' short'}">Needs: ${needText}</span></div>
    `;
    const btn = document.createElement('button');
    btn.textContent = 'Craft';
    btn.disabled = !ok;
    btn.addEventListener('click', ()=>{ craft(r); renderCrafting(); });
    row.appendChild(btn);
    recEl.appendChild(row);
  });
}

// ---------- Items panel (pick what goes in the currently-selected hotbar slot) ----------
let itemsOpen = false;
const itemsModal = document.getElementById('itemsModal');
document.getElementById('itemsClose').addEventListener('click', ()=> closeItems(true));
itemsModal.addEventListener('click', e=>{ if(e.target===itemsModal) closeItems(true); });
document.getElementById('btnItems').addEventListener('click', ()=>{ if(locked && !isDead) openItems(); });
const sashModalEl = document.getElementById('sashModal');
if(sashModalEl){
  document.getElementById('sashClose').addEventListener('click', ()=> closeSash(true));
  sashModalEl.addEventListener('click', e=>{ if(e.target===sashModalEl) closeSash(true); });
  document.getElementById('btnSash').addEventListener('click', ()=>{ if(locked && !isDead) openSash(); });
}

// ---------- Quit / thank-you screen ----------
// A deliberate in-game "I'm done for now" action, not tied to actually closing the tab (a page can't
// intercept that with anything beyond a native browser prompt) — clicking the "Share My Achievements"
// button unlocks the mouse and swaps in a full-screen thank-you screen with Andre's popcorn fundraiser
// link. World/inventory/badge
// progress is already saved continuously during play, so there's nothing extra to do on the way out;
// "Keep playing instead" just puts the overlay away again.
const thankYouScreen = document.getElementById('thankYouScreen');
// ---- Sharing: the game's own URL plus a one-line brag about badges earned so far ----
// location.origin+pathname (not the full href) so a stray query string or #hash from however the
// page was opened never rides along into a shared link.
function shareGameUrl(){ return location.origin + location.pathname; }
function shareBadgeSummary(){
  const count = earnedBadges.size, total = BADGES.length;
  if(count===0) return "🏕️ I'm playing ScoutCraft, a scouting-themed voxel building game!";
  const emojis = BADGES.filter(b=>earnedBadges.has(b.id)).map(b=>b.emoji).join('');
  return `🏕️ I'm a ${rankFor(count)} in ScoutCraft with ${count}/${total} merit badges: ${emojis}`;
}
// Draws a small rounded-rect path (canvas has no cross-browser roundRect yet) reused by every tile
// in the achievement card below.
function roundRectPath(ctx,x,y,w,h,r){
  ctx.beginPath();
  ctx.moveTo(x+r,y);
  ctx.arcTo(x+w,y,x+w,y+h,r);
  ctx.arcTo(x+w,y+h,x,y+h,r);
  ctx.arcTo(x,y+h,x,y,r);
  ctx.arcTo(x,y,x+w,y,r);
  ctx.closePath();
}
// A shareable "trading card" of the player's rank and every merit badge, earned ones lit up and the
// rest dimmed — same visual language as the in-game sash (see renderSash) so it feels like a snapshot
// of that screen rather than a separate design.
function buildAchievementCanvas(){
  const cols = 4, rows = Math.ceil(BADGES.length/cols);
  const margin = 40, tileW = 210, tileH = 140, gap = 14;
  const headerH = 210, footerH = 50;
  const width = margin*2 + cols*tileW + (cols-1)*gap;
  const height = headerH + rows*tileH + (rows-1)*gap + footerH;
  const canvas = document.createElement('canvas');
  canvas.width = width; canvas.height = height;
  const ctx = canvas.getContext('2d');

  const bg = ctx.createLinearGradient(0,0,0,height);
  bg.addColorStop(0,'#24402a'); bg.addColorStop(1,'#0e1a0e');
  ctx.fillStyle = bg; ctx.fillRect(0,0,width,height);
  ctx.strokeStyle = '#c8a44d'; ctx.lineWidth = 6;
  ctx.strokeRect(3,3,width-6,height-6);

  ctx.textAlign = 'center';
  ctx.fillStyle = '#f2e9d8';
  ctx.font = 'bold 36px sans-serif';
  ctx.fillText('🏕️ ScoutCraft', width/2, 46);

  const count = earnedBadges.size, total = BADGES.length;
  drawRankBadge(ctx, width/2, 96, 30, rankIndexFor(count));
  ctx.fillStyle = '#e8c46a';
  ctx.font = 'bold 52px sans-serif';
  ctx.fillText(rankFor(count), width/2, 160);

  ctx.fillStyle = '#c8e0a8';
  ctx.font = '26px sans-serif';
  ctx.fillText(`${count} of ${total} Merit Badges Earned`, width/2, 195);

  BADGES.forEach((b,i)=>{
    const col = i%cols, row = Math.floor(i/cols);
    const x = margin + col*(tileW+gap), y = headerH + row*(tileH+gap);
    const got = earnedBadges.has(b.id);
    roundRectPath(ctx, x, y, tileW, tileH, 12);
    ctx.fillStyle = got ? 'rgba(200,164,77,0.18)' : 'rgba(255,255,255,0.05)';
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = got ? '#c8a44d' : 'rgba(255,255,255,0.12)';
    ctx.stroke();
    ctx.globalAlpha = got ? 1 : 0.35;
    ctx.font = '40px sans-serif';
    ctx.fillStyle = '#fff';
    ctx.fillText(b.emoji, x+tileW/2, y+56);
    ctx.globalAlpha = 1;
    ctx.font = 'bold 15px sans-serif';
    ctx.fillStyle = got ? '#f0dfa8' : 'rgba(240,223,168,0.55)';
    ctx.fillText(b.name, x+tileW/2, y+90);
  });

  ctx.fillStyle = 'rgba(242,233,216,0.75)';
  ctx.font = '18px sans-serif';
  ctx.fillText(shareGameUrl(), width/2, height-22);

  return canvas;
}
const shareNativeBtn = document.getElementById('shareNative');
const shareFacebookLink = document.getElementById('shareFacebook');
const shareXLink = document.getElementById('shareX');
const shareInstagramBtn = document.getElementById('shareInstagram');
const shareMessageLink = document.getElementById('shareMessage');
const shareEmailLink = document.getElementById('shareEmail');
const shareCopiedNote = document.getElementById('shareCopiedNote');
const achievementImg = document.getElementById('achievementImg');
const downloadAchievementLink = document.getElementById('downloadAchievement');
let achievementBlob = null, achievementObjectUrl = null;
// Regenerated fresh each time the quit screen opens (see refreshShareLinks) so the picture always
// reflects whatever badges are actually earned by the moment the player quits, not a stale snapshot.
function refreshAchievementImage(){
  buildAchievementCanvas().toBlob(blob=>{
    if(!blob) return;
    if(achievementObjectUrl) URL.revokeObjectURL(achievementObjectUrl);
    achievementBlob = blob;
    achievementObjectUrl = URL.createObjectURL(blob);
    achievementImg.src = achievementObjectUrl;
    downloadAchievementLink.href = achievementObjectUrl;
  }, 'image/png');
}
function achievementFile(){
  return achievementBlob ? new File([achievementBlob], 'scoutcraft-badges.png', { type:'image/png' }) : null;
}
// Refreshed every time the quit screen opens, not just once at load, so the badge count in every
// link is always whatever's actually been earned by the moment the player quits.
function refreshShareLinks(){
  const text = shareBadgeSummary(), url = shareGameUrl();
  shareFacebookLink.href = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`;
  shareXLink.href = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`;
  shareMessageLink.href = `sms:?&body=${encodeURIComponent(text+' '+url)}`;
  shareEmailLink.href = `mailto:?subject=${encodeURIComponent('Check out ScoutCraft!')}&body=${encodeURIComponent(text+'\n\n'+url)}`;
  // Web Share API isn't available on every browser (mainly a mobile/HTTPS thing) — the button only
  // shows up where it'll actually work, since the explicit per-platform links above always work.
  shareNativeBtn.hidden = !navigator.share;
  refreshAchievementImage();
}
shareNativeBtn.addEventListener('click', ()=>{
  const text = shareBadgeSummary(), url = shareGameUrl(), file = achievementFile();
  if(file && navigator.canShare && navigator.canShare({ files:[file] })){
    navigator.share({ title:'ScoutCraft', text:text+' '+url, files:[file] }).catch(()=>{});
  } else {
    navigator.share({ title:'ScoutCraft', text, url }).catch(()=>{});
  }
});
// Instagram has no web "share to Instagram" link the way Facebook/X do — on a phone with Instagram
// installed, the native share sheet (which lists Instagram as one of its targets, and can carry the
// badge picture as an attached file) is the real way in, so this defers to that when it's available;
// otherwise it just copies the caption text, and the player attaches the already-downloadable image
// by hand.
shareInstagramBtn.addEventListener('click', async ()=>{
  const text = shareBadgeSummary(), url = shareGameUrl(), file = achievementFile();
  if(file && navigator.canShare && navigator.canShare({ files:[file] })){
    navigator.share({ title:'ScoutCraft', text:text+' '+url, files:[file] }).catch(()=>{});
    return;
  }
  if(navigator.share){ navigator.share({ title:'ScoutCraft', text, url }).catch(()=>{}); return; }
  try{
    await navigator.clipboard.writeText(text+' '+url);
    shareCopiedNote.hidden = false;
    setTimeout(()=> shareCopiedNote.hidden = true, 4000);
  }catch(e){
    try{ window.prompt('Copy this to share on Instagram:', text+' '+url); }catch(e2){}
  }
});
function quitGame(){
  if(document.pointerLockElement) document.exitPointerLock();
  locked = false;
  refreshShareLinks();
  thankYouScreen.hidden = false;
}
function keepPlaying(){
  thankYouScreen.hidden = true;
  if(isTouchDevice) locked = true;
  else document.body.requestPointerLock();
}
document.getElementById('btnQuit').addEventListener('click', ()=>{ if(locked && !isDead) quitGame(); });
document.getElementById('btnKeepPlaying').addEventListener('click', keepPlaying);
function openItems(){
  itemsOpen = true;
  itemsModal.hidden = false;
  if(document.pointerLockElement) document.exitPointerLock();
  if(isTouchDevice) locked = false;
  overlay.hidden = true;
  renderItemsGrid();
}
function closeItems(relock){
  itemsOpen = false;
  itemsModal.hidden = true;
  if(relock){
    if(isTouchDevice) locked = true;
    else document.body.requestPointerLock();
  } else if(!isTouchDevice) overlay.hidden = false;
}
function makeItemTile(id){
  const count = invCount(id);
  const tile = document.createElement('div');
  tile.className = 'itemTile' + (HOTBAR[selectedSlot]===id ? ' active' : '') + (count<=0 ? ' empty' : '');
  const sw = document.createElement('div');
  sw.className = 'swatch';
  sw.style.background = swatchColor(id);
  tile.appendChild(sw);
  if(HOTBAR_ICON[id]){
    const icon = document.createElement('div');
    icon.className = 'icon';
    icon.textContent = HOTBAR_ICON[id];
    tile.appendChild(icon);
  }
  const countEl = document.createElement('div');
  countEl.className = 'itemCount';
  countEl.textContent = count===Infinity ? '∞' : (count>0 ? count : '');
  tile.appendChild(countEl);
  const label = document.createElement('div');
  label.className = 'itemLabel';
  label.textContent = BLOCK_NAME[id];
  tile.appendChild(label);
  const countText = count===Infinity ? ' — unlimited' : (count>0 ? ` — you have ${count}` : ' — you have none yet');
  // Meat is food, not a block/tool you'd ever want to select into a hotbar slot — clicking it here
  // eats it on the spot (same tryEatMeat used when you right-click it from the hotbar), so resolving
  // hunger doesn't require first freeing up a slot and switching to it.
  const isFood = id===MEAT || id===COOKED_MEAT;
  tile.title = isFood ? BLOCK_NAME[id] + countText + ' — click to eat' : BLOCK_NAME[id] + countText;
  tile.addEventListener('click', ()=>{
    if(isFood){
      tryEatFood(id);
      renderItemsGrid();
      return;
    }
    HOTBAR[selectedSlot] = id;
    saveHotbar();
    updateHotbarUI();
    updateHeldItemColor();
    renderItemsGrid();
  });
  return tile;
}
function renderItemsGrid(){
  document.getElementById('itemsSlotNum').textContent = HOTBAR_KEYS[selectedSlot] ? HOTBAR_KEYS[selectedSlot].slice(3) : selectedSlot+1;
  const grid = document.getElementById('itemsGrid');
  grid.innerHTML = '';
  const held = ALL_ITEMS.filter(id => invCount(id)>0);
  const rest = ALL_ITEMS.filter(id => invCount(id)<=0);
  if(held.length>0){
    const lbl = document.createElement('div');
    lbl.className = 'sectionLabel';
    lbl.textContent = 'Items in your hands';
    grid.appendChild(lbl);
    held.forEach(id => grid.appendChild(makeItemTile(id)));
  }
  if(rest.length>0){
    const lbl = document.createElement('div');
    lbl.className = 'sectionLabel';
    lbl.textContent = 'Not yet obtained';
    grid.appendChild(lbl);
    rest.forEach(id => grid.appendChild(makeItemTile(id)));
  }
}

// ---------- Bear box (fixed camp food storage, up to 100 items total) ----------
// A single shared stash, independent of your own pack, sitting at the cooking area — click an item
// on either side to move one across. Capacity is a combined total across every item type, not
// per-type, same as "1,000 items" reads literally — raised well past its original 100 once the box
// became the camp's whole cooking pantry too (see the pre-stock below: 10 of every raw ingredient per
// recipe that calls for it, ~950 items total before a single player deposit).
const BEAR_BOX_CAPACITY = 1000;
const BEAR_BOX_KEY = 'scoutcraft_bearbox_v1';
const bearBoxStorage = {}; // id -> qty
let bearBoxOpen = false;
function bearBoxTotal(){ return Object.values(bearBoxStorage).reduce((a,b)=>a+b,0); }
function saveBearBox(){
  try{ localStorage.setItem(BEAR_BOX_KEY, JSON.stringify(bearBoxStorage)); }catch(e){}
}
function loadBearBox(){
  try{
    const raw = localStorage.getItem(BEAR_BOX_KEY);
    if(raw){
      const obj = JSON.parse(raw);
      for(const k in obj) bearBoxStorage[k] = obj[k];
      return;
    }
  }catch(e){}
  // First time ever: stock the pantry with every raw ingredient every camp recipe needs — 10 per
  // recipe that calls for it, so something used in 3 different dishes starts with 30 (see
  // COOKWARE_RECIPES). Doesn't touch a bear box that's already been saved once, same "first run only"
  // gate as the Backpack's own starter gear below.
  const counts = {};
  for(const wareKey in COOKWARE_RECIPES){
    for(const recipe of COOKWARE_RECIPES[wareKey]){
      for(const ing of recipe.ingredients) counts[ing] = (counts[ing]||0)+1;
    }
  }
  for(const id in counts) bearBoxStorage[id] = counts[id]*10;
  saveBearBox();
}
function depositToBearBox(id){
  if(invCount(id)<=0 || bearBoxTotal()>=BEAR_BOX_CAPACITY) return;
  invSub(id,1);
  bearBoxStorage[id] = (bearBoxStorage[id]||0)+1;
  saveInventory();
  saveBearBox();
  updateHotbarUI();
  renderBearBox();
}
function withdrawFromBearBox(id){
  if(!bearBoxStorage[id]) return;
  bearBoxStorage[id]--;
  if(bearBoxStorage[id]<=0) delete bearBoxStorage[id];
  invAdd(id,1);
  saveInventory();
  saveBearBox();
  updateHotbarUI();
  renderBearBox();
}
function makeBearBoxTile(id, count, onClick){
  const tile = document.createElement('div');
  tile.className = 'itemTile';
  const sw = document.createElement('div');
  sw.className = 'swatch';
  sw.style.background = swatchColor(id);
  tile.appendChild(sw);
  if(HOTBAR_ICON[id]){
    const icon = document.createElement('div');
    icon.className = 'icon';
    icon.textContent = HOTBAR_ICON[id];
    tile.appendChild(icon);
  }
  const countEl = document.createElement('div');
  countEl.className = 'itemCount';
  countEl.textContent = count;
  tile.appendChild(countEl);
  const label = document.createElement('div');
  label.className = 'itemLabel';
  label.textContent = BLOCK_NAME[id];
  tile.appendChild(label);
  tile.title = `${BLOCK_NAME[id]} — ${count}`;
  tile.addEventListener('click', onClick);
  return tile;
}
function renderBearBox(){
  document.getElementById('bearBoxCount').textContent = bearBoxTotal();
  const yourGrid = document.getElementById('bearBoxYourGrid');
  const boxGrid = document.getElementById('bearBoxStorageGrid');
  yourGrid.innerHTML = '';
  boxGrid.innerHTML = '';
  // Firework is unlimited/never-consumed — storing it away would just eat the box's real capacity
  // for nothing, so it's left out of the deposit side entirely.
  const held = ALL_ITEMS.filter(id => id!==FIREWORK && invCount(id)>0);
  if(held.length===0){
    const note = document.createElement('div'); note.className = 'bearBoxEmptyNote'; note.textContent = "You aren't carrying anything.";
    yourGrid.appendChild(note);
  } else {
    held.forEach(id => yourGrid.appendChild(makeBearBoxTile(id, invCount(id), ()=> depositToBearBox(id))));
  }
  const stored = Object.keys(bearBoxStorage).map(Number).filter(id => bearBoxStorage[id]>0);
  if(stored.length===0){
    const note = document.createElement('div'); note.className = 'bearBoxEmptyNote'; note.textContent = 'Nothing stored yet.';
    boxGrid.appendChild(note);
  } else {
    stored.forEach(id => boxGrid.appendChild(makeBearBoxTile(id, bearBoxStorage[id], ()=> withdrawFromBearBox(id))));
  }
}
const bearBoxModal = document.getElementById('bearBoxModal');
document.getElementById('bearBoxClose').addEventListener('click', ()=> closeBearBox(true));
bearBoxModal.addEventListener('click', e=>{ if(e.target===bearBoxModal) closeBearBox(true); });
function openBearBox(){
  bearBoxOpen = true;
  bearBoxModal.hidden = false;
  if(document.pointerLockElement) document.exitPointerLock();
  if(isTouchDevice) locked = false;
  overlay.hidden = true;
  renderBearBox();
}
function closeBearBox(relock){
  bearBoxOpen = false;
  bearBoxModal.hidden = true;
  if(relock){
    if(isTouchDevice) locked = true;
    else document.body.requestPointerLock();
  } else if(!isTouchDevice) overlay.hidden = false;
}

// ---------- Cookware: click any Pot/Pan/Dutch Oven/Griddle/Campfire (see BLOCK_TO_WARE_KEY) to try
// cooking one of its secret recipes. Up to 4 ingredients you're already holding go into fixed slots
// (a small array, not a free-form dict like the Bear Box/Backpack above — there's nowhere to browse a
// stash from here, just your own pack on one side and the 4 slots on the other), then Cook! checks
// them against COOKWARE_RECIPES for that cookware as an unordered exact set — extra or missing
// ingredients both miss. Deliberately no ingredient list shown anywhere; opening the window drops one
// hint in the camp chat instead (see openCookware) and the rest is trial and error.
let cookwareOpen = false;
let cookwareWareKey = null;
const cookwareSlots = [null, null, null, null]; // each an item id or null
const DISH_HUNGER_RESTORE = 6; // every dish restores the same amount — a real meal, better than a snack
for(const id of ALL_DISH_IDS) FOOD_RESTORE[id] = DISH_HUNGER_RESTORE;
function addToCookware(id){
  const slot = cookwareSlots.indexOf(null);
  if(slot<0 || invCount(id)<=0) return;
  invSub(id,1);
  cookwareSlots[slot] = id;
  saveInventory();
  updateHotbarUI();
  renderCookware();
}
function removeFromCookware(slotIdx){
  const id = cookwareSlots[slotIdx];
  if(id==null) return;
  invAdd(id,1);
  cookwareSlots[slotIdx] = null;
  saveInventory();
  updateHotbarUI();
  renderCookware();
}
function tryCookRecipe(){
  const used = cookwareSlots.filter(x=>x!=null);
  if(used.length===0) return;
  const sortedUsed = [...used].sort((a,b)=>a-b);
  const match = COOKWARE_RECIPES[cookwareWareKey].find(r=>{
    const sortedRecipe = [...r.ingredients].sort((a,b)=>a-b);
    return sortedRecipe.length===sortedUsed.length && sortedRecipe.every((v,i)=>v===sortedUsed[i]);
  });
  if(!match){
    addChatMessage('Camp', "🍳 That doesn't look like any recipe anyone's ever heard of.");
    return;
  }
  for(let i=0;i<cookwareSlots.length;i++) cookwareSlots[i] = null; // spent, not returned — unlike closing the window
  invAdd(match.id, 1);
  saveInventory();
  updateHotbarUI();
  SFX.craft();
  addChatMessage('Camp', `${HOTBAR_ICON[match.id]} You cooked up ${match.name}!`);
  Scout.cookedOn(cookwareWareKey);
  renderCookware();
}
function renderCookware(){
  const info = COOKWARE_INFO[cookwareWareKey];
  const title = document.getElementById('cookwareTitle');
  if(title) title.textContent = `${info.emoji} ${info.name}`;
  const yourGrid = document.getElementById('cookwareYourGrid');
  const slotsGrid = document.getElementById('cookwareSlotsGrid');
  yourGrid.innerHTML = '';
  slotsGrid.innerHTML = '';
  const held = ALL_ITEMS.filter(id => id!==FIREWORK && invCount(id)>0);
  if(held.length===0){
    const note = document.createElement('div'); note.className = 'bearBoxEmptyNote'; note.textContent = "You aren't holding any ingredients.";
    yourGrid.appendChild(note);
  } else {
    held.forEach(id => yourGrid.appendChild(makeBearBoxTile(id, invCount(id), ()=> addToCookware(id))));
  }
  for(let i=0;i<cookwareSlots.length;i++){
    const id = cookwareSlots[i];
    if(id==null){
      const empty = document.createElement('div'); empty.className = 'cookwareSlotEmpty'; empty.textContent = '+';
      slotsGrid.appendChild(empty);
    } else {
      slotsGrid.appendChild(makeBearBoxTile(id, 1, ()=> removeFromCookware(i)));
    }
  }
}
const cookwareModal = document.getElementById('cookwareModal');
document.getElementById('cookwareClose').addEventListener('click', ()=> closeCookware(true));
document.getElementById('cookwareCookBtn').addEventListener('click', tryCookRecipe);
cookwareModal.addEventListener('click', e=>{ if(e.target===cookwareModal) closeCookware(true); });
function openCookware(wareKey){
  cookwareOpen = true;
  cookwareWareKey = wareKey;
  cookwareModal.hidden = false;
  if(document.pointerLockElement) document.exitPointerLock();
  if(isTouchDevice) locked = false;
  overlay.hidden = true;
  // One hint per visit, not the recipe itself — a single random ingredient off a random recipe for
  // this cookware, so checking back in keeps being (a little) useful without spelling anything out.
  const recipes = COOKWARE_RECIPES[wareKey];
  const pick = recipes[Math.floor(Math.random()*recipes.length)];
  const ing = pick.ingredients[Math.floor(Math.random()*pick.ingredients.length)];
  addChatMessage('Camp', `${COOKWARE_INFO[wareKey].emoji} Hint: one of the ${COOKWARE_INFO[wareKey].name} recipes uses ${BLOCK_NAME[ing]}.`);
  renderCookware();
}
function closeCookware(relock){
  // The 4 slots are just a staging area, not real storage — anything still sitting in one when you
  // close goes straight back to your pack instead of being lost.
  for(let i=0;i<cookwareSlots.length;i++){
    if(cookwareSlots[i]!=null){ invAdd(cookwareSlots[i],1); cookwareSlots[i]=null; }
  }
  saveInventory();
  updateHotbarUI();
  cookwareOpen = false;
  cookwareModal.hidden = true;
  if(relock){
    if(isTouchDevice) locked = true;
    else document.body.requestPointerLock();
  } else if(!isTouchDevice) overlay.hidden = false;
}

// ---------- Backpack storage (your own pack, 20 slots — one per distinct item type) ----------
// Unlike the Bear Box's single combined count, this caps the number of different item TYPES it can
// hold at once, not the total quantity — one slot per type, unlimited within that slot, same as your
// own hotbar/inventory already work. It's a personal stash rather than a camp-wide one, so it starts
// pre-packed with the Scout's 10 Essentials (the real BSA list) plus a Scoutbook, instead of empty.
const BACKPACK_SLOTS = 20;
const BACKPACK_KEY = 'scoutcraft_backpack_v1';
// Fire starter and map-and-compass are the two of the ten that are already real, functional items
// elsewhere in the game (Flint ignites fires, Compass takes a bearing) — reused here rather than
// invented twice.
const SCOUT_ESSENTIALS = [POCKETKNIFE, FIRST_AID_KIT, EXTRA_CLOTHING, RAIN_GEAR, WATER_BOTTLE,
  FLASHLIGHT, TRAIL_FOOD, FLINT, SUN_PROTECTION, COMPASS];
// Beyond the 10 Essentials proper: the rest of a scout's basic camp kit, pre-packed the same way.
// Tent no longer has a recipe (see RECIPES) — this is its only source now. Rope keeps its own
// recipe too (see RECIPES), so this is just a starting supply on top of what you can still twist
// from leaves yourself.
const STARTER_CAMP_GEAR = [TENT, SLEEPING_BAG, SLEEPING_PAD, ROPE];
const backpackStorage = {}; // id -> qty
let backpackOpen = false;
function backpackSlotCount(){ return Object.keys(backpackStorage).filter(id=>backpackStorage[id]>0).length; }
function saveBackpackStorage(){
  try{ localStorage.setItem(BACKPACK_KEY, JSON.stringify(backpackStorage)); }catch(e){}
}
function loadBackpackStorage(){
  try{
    const raw = localStorage.getItem(BACKPACK_KEY);
    if(raw){
      const obj = JSON.parse(raw);
      for(const k in obj) backpackStorage[k] = obj[k];
      return;
    }
  }catch(e){}
  // First time ever: pack it before the player even opens it.
  for(const id of SCOUT_ESSENTIALS) backpackStorage[id] = 1;
  for(const id of STARTER_CAMP_GEAR) backpackStorage[id] = 1;
  backpackStorage[SCOUTBOOK] = 1;
  saveBackpackStorage();
}
function depositToBackpackStorage(id){
  if(invCount(id)<=0) return;
  if(!backpackStorage[id] && backpackSlotCount()>=BACKPACK_SLOTS) return; // no free slot for a new type
  invSub(id,1);
  backpackStorage[id] = (backpackStorage[id]||0)+1;
  saveInventory();
  saveBackpackStorage();
  updateHotbarUI();
  renderBackpackStorage();
}
function withdrawFromBackpackStorage(id){
  if(!backpackStorage[id]) return;
  backpackStorage[id]--;
  if(backpackStorage[id]<=0) delete backpackStorage[id];
  invAdd(id,1);
  saveInventory();
  saveBackpackStorage();
  updateHotbarUI();
  renderBackpackStorage();
}
function renderBackpackStorage(){
  document.getElementById('backpackCount').textContent = `${backpackSlotCount()}/${BACKPACK_SLOTS}`;
  const yourGrid = document.getElementById('backpackYourGrid');
  const packGrid = document.getElementById('backpackStorageGrid');
  yourGrid.innerHTML = '';
  packGrid.innerHTML = '';
  const held = ALL_ITEMS.filter(id => id!==FIREWORK && invCount(id)>0);
  if(held.length===0){
    const note = document.createElement('div'); note.className = 'bearBoxEmptyNote'; note.textContent = "You aren't carrying anything.";
    yourGrid.appendChild(note);
  } else {
    held.forEach(id => yourGrid.appendChild(makeBearBoxTile(id, invCount(id), ()=> depositToBackpackStorage(id))));
  }
  const stored = Object.keys(backpackStorage).map(Number).filter(id => backpackStorage[id]>0);
  if(stored.length===0){
    const note = document.createElement('div'); note.className = 'bearBoxEmptyNote'; note.textContent = 'Empty slots.';
    packGrid.appendChild(note);
  } else {
    stored.forEach(id => packGrid.appendChild(makeBearBoxTile(id, backpackStorage[id], ()=> withdrawFromBackpackStorage(id))));
  }
}
const backpackModal = document.getElementById('backpackModal');
document.getElementById('backpackClose').addEventListener('click', ()=> closeBackpackStorage(true));
backpackModal.addEventListener('click', e=>{ if(e.target===backpackModal) closeBackpackStorage(true); });
function openBackpackStorage(){
  backpackOpen = true;
  backpackModal.hidden = false;
  if(document.pointerLockElement) document.exitPointerLock();
  if(isTouchDevice) locked = false;
  overlay.hidden = true;
  renderBackpackStorage();
}
function closeBackpackStorage(relock){
  backpackOpen = false;
  backpackModal.hidden = true;
  if(relock){
    if(isTouchDevice) locked = true;
    else document.body.requestPointerLock();
  } else if(!isTouchDevice) overlay.hidden = false;
}
document.getElementById('btnBackpack').addEventListener('click', ()=>{ if(locked && !isDead) openBackpackStorage(); });

// ---------- Special function icons (Backpack, Camp Workbench, First Aid, Stop Bear) ----------
// A small fixed cluster to the left of the hotbar — always the same four actions, never swapped out
// for an item the way an ordinary hotbar slot can be.
const FIRST_AID_HEAL_HP = 2 * HP_PER_HEART; // 2 hearts
const FIRST_AID_COOLDOWN_S = 10;
const STOP_BEAR_COOLDOWN_S = 3;
let firstAidCooldown = 0, stopBearCooldown = 0;
// Named so the keydown handler below and the on-screen icon's click both call the exact same logic
// rather than duplicating it — Backpack and Camp Workbench already had B/E, these are the two new ones.
function useQuickBackpack(){
  if(locked && !isDead) openBackpackStorage();
}
function useQuickWorkbench(){
  if(!locked || isDead) return;
  if(nearestCraftingTable(4)) openCrafting();
  else addChatMessage('Camp', '🛠️ You need to be near your Camp Workbench to craft.');
}
function useFirstAid(){
  if(!locked || isDead) return;
  if(firstAidCooldown>0){
    addChatMessage('Camp', `➕ First Aid is still resting — ${Math.ceil(firstAidCooldown)}s.`);
    return;
  }
  if(myHP >= PLAYER_MAX_HP){
    addChatMessage('Camp', "➕ You're already at full health.");
    return;
  }
  myHP = Math.min(PLAYER_MAX_HP, myHP + FIRST_AID_HEAL_HP);
  updateHeartsUI();
  firstAidCooldown = FIRST_AID_COOLDOWN_S;
  Scout.bump('firstAidUses');
  saveScoutProgress();
  SFX.craft();
  addChatMessage('Camp', '➕ First Aid: patched up a couple hearts.');
}
const stopBearBanner = document.getElementById('stopBearBanner');
let stopBearBannerTimer = null;
function useStopBear(){
  if(!locked || isDead) return;
  if(stopBearCooldown>0){
    addChatMessage('Camp', `🐻🚫 Give it a moment — ${Math.ceil(stopBearCooldown)}s.`);
    return;
  }
  stopBearCooldown = STOP_BEAR_COOLDOWN_S;
  SFX.scareShout();
  stopBearBanner.hidden = false;
  if(stopBearBannerTimer) clearTimeout(stopBearBannerTimer);
  stopBearBannerTimer = setTimeout(()=>{ stopBearBanner.hidden = true; }, 1600);
  const scared = scareBearsNear(player.pos.x, player.pos.z, STOP_BEAR_RADIUS);
  addChatMessage('Camp', scared>0
    ? `🐻🚫 GO AWAY, BEAR! ${scared>1?'The bears run':'The bear runs'} off.`
    : "🐻🚫 GO AWAY, BEAR! ...no bear was close enough to hear you.");
}
document.getElementById('btnQuickBackpack').addEventListener('click', useQuickBackpack);
document.getElementById('btnQuickWorkbench').addEventListener('click', useQuickWorkbench);
document.getElementById('btnQuickFirstAid').addEventListener('click', useFirstAid);
document.getElementById('btnStopBear').addEventListener('click', useStopBear);

// ---------- Camp log ----------
// A small on-screen message log for local feedback (cooking hints, sleep, badge-adjacent tips) —
// there's no chat to send here, single-player has no one else to send it to.
const CHAT_DISPLAY_LIMIT = 8; // how many recent lines actually stay on screen
const chatMessages = [];
const chatLogEl = document.getElementById('chatLog');
function escapeHtml(s){
  return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);
}
function renderChatLog(){
  chatLogEl.innerHTML = chatMessages.slice(-CHAT_DISPLAY_LIMIT)
    .map(m => `<div class="chatLine"><b>${escapeHtml(m.name)}:</b> ${escapeHtml(m.text)}</div>`).join('');
  chatLogEl.scrollTop = chatLogEl.scrollHeight;
}
function addChatMessage(name, text){
  chatMessages.push({ name, text });
  if(chatMessages.length > CHAT_DISPLAY_LIMIT*4) chatMessages.shift();
  renderChatLog();
}

// ---------- Init & loop ----------
function init(){
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x8fd0ee);
  scene.fog = new THREE.Fog(0x8fd0ee, FAR*0.35, FAR);

  camera = new THREE.PerspectiveCamera(75, window.innerWidth/window.innerHeight, 0.1, FAR);
  camera.rotation.order = 'YXZ';

  // Lights up around you while a Torch is your held item, same warm glow as a placed one — off
  // otherwise. A child of the camera so it always tracks wherever you're looking/standing for free.
  // See the placed-torch light (updateTorchLight) for why the intensity/decay are tuned this high.
  heldTorchLight = new THREE.PointLight(0xffb060, 6, 8, 1.6);
  heldTorchLight.visible = false;
  camera.add(heldTorchLight);
  scene.add(camera);

  renderer = new THREE.WebGLRenderer({ antialias:true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio,2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  document.body.appendChild(renderer.domElement);

  hemiLight = new THREE.HemisphereLight(0xffffff, 0x445533, 0.9);
  scene.add(hemiLight);
  sunLight = new THREE.DirectionalLight(0xffffff, 0.8);
  sunLight.position.set(80,120,40);
  sunLight.castShadow = true;
  sunLight.shadow.mapSize.set(1536,1536);
  // The shadow camera is a small box that follows the player (see updateDayNight) rather than
  // trying to cover the whole 128x128 world at once — keeps shadow resolution usable regardless of
  // how big the world is. SHADOW_RADIUS/far need to stay in sync with the light's own orbit radius.
  const sc = sunLight.shadow.camera;
  sc.left = -SHADOW_RADIUS; sc.right = SHADOW_RADIUS;
  sc.top = SHADOW_RADIUS; sc.bottom = -SHADOW_RADIUS;
  sc.near = 1; sc.far = SUN_ORBIT_R*2.2;
  sunLight.shadow.bias = -0.0015;
  scene.add(sunLight);
  scene.add(sunLight.target);
  buildCelestialBodies();
  buildStarField();

  characterMesh = createCharacterMesh();
  characterMesh.visible = false;
  myNameTag = createNameTagSprite();
  characterMesh.add(myNameTag.sprite);
  scene.add(characterMesh);
  buildHandModel();
  renderer.autoClear = false;

  generateWorld();
  loadEdits();
  // A returning player's own saved edits replay on top of world-gen above — if any of them happen to
  // land on the flag's footprint (mining or building nearby in an earlier session, before this existed),
  // they'd silently punch through it. Unlike a Scout Law box, there's no legitimate way for this to be
  // missing, so it just gets placed again rather than accepting the loss.
  buildGiantFlag();
  buildTotems();
  buildCampSign();
  buildKayak();
  buildHorse();
  restoreTorchLights();
  restoreScoutLawBoxes();
  updateScoutHUD();
  buildMinimapTerrain();
  loadInventory();
  loadHotbar();
  rebuildAllChunks();
  spawnPlayerAtStart();
  spawnAnimals();
  updateHotbarUI();
  updateHeldItemColor();
  updateHeartsUI();
  updateHungerUI();
  loadSaplings();
  loadFires();
  loadWorms();
  loadButterflies();
  loadBearBox();
  loadBackpackStorage();

  window.addEventListener('resize', ()=>{
    camera.aspect = window.innerWidth/window.innerHeight;
    camera.updateProjectionMatrix();
    handCamera.aspect = window.innerWidth/window.innerHeight;
    handCamera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  requestAnimationFrame(animate);
}

let lastTime = performance.now();
let fpsCount=0, fpsTimer=0;
function animate(now){
  requestAnimationFrame(animate);
  const dt = Math.min(0.05, (now-lastTime)/1000);
  lastTime = now;

  if(locked && !isDead) updatePlayer(dt);
  updateDeathState(dt);
  updateScout(dt);
  updateFishing(dt);
  firstAidCooldown = Math.max(0, firstAidCooldown - dt);
  stopBearCooldown = Math.max(0, stopBearCooldown - dt);

  const moving = locked && !isDead && (keys['KeyW']||keys['KeyA']||keys['KeyS']||keys['KeyD']);
  const sprinting = !!(keys['ShiftLeft']||keys['ShiftRight']);
  updateCharacterAnim(dt, moving, sprinting);
  updateHandView(dt, moving, sprinting);
  updateAnimals(dt);
  updateRespawns(dt);
  updateFallingClusters(dt);
  updateSaplings(dt);
  updateTreeRegrowth(dt);
  updateFires(dt);
  updateCampfireFlames();
  updateWaterFlow(dt);
  updateFireworks(dt);
  updateFireflies(dt);
  updateWorms(dt);
  updateButterflies(dt);
  updateBirds(dt);
  updateFish(dt);
  updateTurtles(dt);
  updateBeetles(dt);
  updateBigEagles(dt);
  updateGophers(dt);
  heldTorchLight.visible = HOTBAR[selectedSlot]===TORCH;
  if(heldTorchLight.visible) heldTorchLight.intensity = 1.0 + Math.random()*0.3;
  updateDayNight();
  updateWeather(dt);
  updateTemperature(dt);
  updateHunger(dt);

  if(thirdPerson){
    characterMesh.visible = true;
    // Once the mouse has been still for PEEK_HOLD_S, ease the extra swing back out so the camera
    // settles behind the character again instead of staying wherever the last peek left it.
    if(peekTimer > 0) peekTimer -= dt;
    else peekYaw += (0 - peekYaw) * Math.min(1, dt*PEEK_EASE_RATE);
    const dir = getLookDir(player.yaw + peekYaw, player.pitch);
    const dist = 4.5;
    camera.position.set(
      player.pos.x - dir.x*dist,
      player.pos.y + player.eye - dir.y*dist,
      player.pos.z - dir.z*dist
    );
    camera.lookAt(player.pos.x, player.pos.y+player.eye, player.pos.z);
  } else {
    characterMesh.visible = false;
    camera.rotation.set(player.pitch, player.yaw, 0);
    camera.position.set(player.pos.x, player.pos.y+player.eye, player.pos.z);
  }

  renderer.clear();
  renderer.render(scene, camera);
  if(!thirdPerson){
    renderer.clearDepth();
    renderer.render(handScene, handCamera);
  }

  craftHint.classList.toggle('show', locked && !craftingOpen && nearestCraftingTable(4));
  if(fishingSpot){
    fishingHint.textContent = `🎣 Fishing... ${Math.max(0, Math.ceil(FISHING_HOLD_SECONDS - fishingTimer))}s`;
    fishingHint.classList.add('show');
  } else {
    fishingHint.classList.remove('show');
  }

  const coordsEl = document.getElementById('coordsLabel');
  if(coordsEl) coordsEl.textContent = `${player.pos.x.toFixed(1)}, ${player.pos.y.toFixed(1)}, ${player.pos.z.toFixed(1)}`;
  updateMinimap();

  fpsTimer += dt; fpsCount++;
  if(fpsTimer>=0.5){
    document.getElementById('fps').textContent = Math.round(fpsCount/fpsTimer);
    fpsTimer=0; fpsCount=0;
    document.getElementById('wormCount').textContent = worms.length;
    document.getElementById('butterflyCount').textContent = butterflies.length;
  }

  if(debugPanelOpen){
    debugPanelTimer -= dt;
    if(debugPanelTimer<=0){ debugPanelTimer = 2; renderDebugPanel(); }
  }
}

// ---------- Update checker ----------
// Detects when a newer build has been deployed while this tab is still open, and shows a small
// persistent banner nudging the player to reload — the exact class of confusion a stale cached script
// has caused before in this project (fireworks that seemed not to sync, a hotkey that silently did
// nothing), just surfaced proactively instead of debugged after the fact. No version number to
// remember to bump by hand: it just compares main.js's own ETag/Last-Modified HTTP header against
// whatever it was the last time this tab checked. If neither header is available (some local dev
// servers, or a fetch that fails for any reason) it silently does nothing rather than false-alarm.
const UPDATE_CHECK_INTERVAL_MS = 5*60*1000; // every 5 real minutes
let currentBuildTag = null;
async function fetchBuildTag(){
  try{
    const res = await fetch('main.js', { method:'HEAD', cache:'no-store' });
    if(!res.ok) return null;
    return res.headers.get('etag') || res.headers.get('last-modified') || null;
  }catch(e){ return null; }
}
async function checkForUpdate(){
  const tag = await fetchBuildTag();
  if(!tag) return;
  if(currentBuildTag===null){ currentBuildTag = tag; return; } // first successful check just sets the baseline
  if(tag !== currentBuildTag){
    const banner = document.getElementById('updateBanner');
    if(banner) banner.hidden = false;
  }
}
const updateReloadBtn = document.getElementById('updateReloadBtn');
if(updateReloadBtn) updateReloadBtn.addEventListener('click', ()=> location.reload());
checkForUpdate();
setInterval(checkForUpdate, UPDATE_CHECK_INTERVAL_MS);

// Keeps "leave the game alive, come back at the same spot" fresh even if the tab is killed outright
// (mobile task-switching, a crash) rather than closed cleanly — the periodic timer is the real
// safety net; beforeunload/pagehide below just make the very last moment before a clean close exact.
setInterval(savePosition, POSITION_SAVE_INTERVAL_MS);
window.addEventListener('beforeunload', savePosition);
window.addEventListener('pagehide', savePosition);
// Browsers don't let a page show its own custom UI at the moment of leaving — the tab just tears
// down — so there's no way to actually pop the thank-you screen open on a close/navigate-away the
// way clicking Quit does. The closest real equivalent is the browser's own generic "Leave site?"
// prompt, which at least gives a beat to reconsider before going. Skipped once they've already seen
// the real thank-you screen (clicked Quit themselves) — no need to prompt twice on the way out.
window.addEventListener('beforeunload', e=>{
  if(!thankYouScreen.hidden) return;
  e.preventDefault();
  e.returnValue = '';
});

init();
})();
