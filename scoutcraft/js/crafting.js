// ---------- crafting.js ----------
// RECIPES, inventory helpers (invCount/invAdd/invSub/canCraft/craft), crafting-table and tent lookups, protected cells.
'use strict';

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
  { name:'Bow',            out:{id:BOW, qty:1},             in:[{id:STICK, qty:3}, {id:ROPE, qty:1}] },
];
const inventory = {};
// Fireworks are unlimited — no recipe, never consumed, always available regardless of what's saved.
// Flint is the same way: it's no longer craftable, the Backpack only ever packs the one starting
// unit, and running out would permanently lock you out of ever lighting another fire, Torch,
// Campfire, or Lantern — so once you've got it out of the Backpack at all, it never runs out. Also
// excluded from the Bear Box/Cookware/Backpack deposit lists below (see UNLIMITED_ITEMS there) —
// "storing" part of an infinite supply into a finite container doesn't really mean anything.
const UNLIMITED_ITEMS = new Set([FIREWORK, FLINT]);
function invCount(id){ return UNLIMITED_ITEMS.has(id) ? Infinity : (inventory[id]||0); }
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

