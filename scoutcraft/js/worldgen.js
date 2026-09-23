// ---------- worldgen.js ----------
// Seeded Perlin noise, world storage (get/setBlock), generateWorld, and the fixed camp landmarks: cooking area, giant flag, scout totems (build), archery range, meditation hill, scout law boxes, tree/bush planting.
'use strict';

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
  buildArcheryRange();
  buildMeditationHill();
  placeScoutLawBoxes();
  computeGroundSurface();
}
// ---------- Dig depth limit: the ground is only diggable DIG_DEPTH blocks down ----------
// "Ground" is the terrain exactly as world-gen leaves it — camp clearings, the archery lane and the
// reflection hill included, which is why this scans the finished world instead of trusting heightAt()
// (those areas are carved to their own fixed heights). Captured once at the end of generateWorld,
// before any saved edits replay, so a mound you built or a pit an older save already dug doesn't
// shift the line. Only natural terrain blocks are limited — a ladder, torch or anything you placed
// still comes out of a hole normally.
const DIG_DEPTH = 2; // the surface block plus the one under it
const DIG_LIMITED_BLOCKS = new Set([GRASS, DIRT, STONE, SAND]);
const groundSurface = new Int16Array(WORLD_SIZE*WORLD_SIZE); // top terrain y for each x/z column
function computeGroundSurface(){
  for(let x=0;x<WORLD_SIZE;x++){
    for(let z=0;z<WORLD_SIZE;z++){
      let top = 0;
      for(let y=WORLD_HEIGHT-1;y>0;y--){
        if(DIG_LIMITED_BLOCKS.has(getBlock(x,y,z))){ top = y; break; }
      }
      groundSurface[x*WORLD_SIZE+z] = top;
    }
  }
}
function belowDigLimit(x,y,z,b){
  if(!DIG_LIMITED_BLOCKS.has(b)) return false;
  // Anything put down after world-gen is the player's own block, always theirs to take back — even
  // sitting deep inside a hole an older save dug before this limit existed, where the limit would
  // otherwise strand it there permanently. `edits` holds exactly the cells changed since world-gen
  // (see applyWorldEdit), so what's left for the depth rule below is the original ground.
  if(edits.has(x+','+y+','+z)) return false;
  return y <= groundSurface[x*WORLD_SIZE+z] - DIG_DEPTH;
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
      // Camp's floor can't be dug up, so the clearing stays flat and hole-free — the same rule the
      // archery lane already had (see buildArcheryRange). Protecting the surface is enough to
      // protect everything under it too, since a dig has to break the surface block to reach down.
      PROTECTED_CELLS.add(x+','+COOKING_AREA_Y+','+z);
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
// Fills in any hole already dug out of the camp floor by a save from before it was protected above.
// Unlike the flag and the totems — which are re-placed wholesale after loadEdits — this can't just
// call buildCookingArea() again: that clears everything above the floor to AIR, which would delete
// the tent, workbench and anything else the player has built in camp. So it restores the ground
// only, exactly as world-gen laid it down, and leaves the airspace alone.
//
// The stale entries come out of `edits` as well as being re-filled. Left in, they'd keep replaying
// on every future load (making this repair permanent work), keep bloating the save, and — since
// `edits` is what tells belowDigLimit "the player put this here, it's theirs to take back" — quietly
// re-open the deeper layers the depth limit is supposed to keep shut.
function repairCookingFloor(){
  const { x: x0, z: z0 } = COOKING_AREA_ORIGIN;
  let filled = 0;
  for(let dx=0; dx<COOKING_AREA_SIZE; dx++){
    for(let dz=0; dz<COOKING_AREA_SIZE; dz++){
      const x=x0+dx, z=z0+dz;
      for(let y=1; y<=COOKING_AREA_Y; y++){
        const want = y >= COOKING_AREA_Y-1 ? DIRT : STONE;
        if(getBlock(x,y,z)===want) continue;
        setBlock(x,y,z,want);
        edits.delete(x+','+y+','+z);
        filled++;
      }
    }
  }
  if(filled) saveEdits();
  return filled;
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
// 5-tall one reciting the Outdoor Code. `totems` is read by doInteract to find which one a click
// actually landed on (matched purely by position, since the two totems no longer share block ids)
// and rebuilt fresh every load rather than appended to, same reasoning as buildGiantFlag being
// re-asserted after loadEdits below — a stale saved edit on one of these two cells shouldn't be able
// to erase it.
const totems = []; // {x, z, play, meshes} — meshes is everything buildTotems needs to scene.remove()
function totemAt(x,z){ return totems.find(t => t.x===x && t.z===z); }
// A carved eagle capping each totem, the way a real hand-carved camp totem often is — reuses the
// exact same box-composition bird model as the ambient wildlife (see buildBirdMesh/BIG_EAGLE_SPECIES),
// just posed statically (wings left flat at their neutral, un-flapped angle) rather than animated.
function buildTotemEagleMesh(){
  const eagle = buildBirdMesh(BIG_EAGLE_SPECIES);
  eagle.scale.setScalar(2.2);
  return eagle;
}
// A small carved-wood plaque, same canvas-texture billboard technique as the campsite welcome sign
// (buildCampSignSprite) and the Scout Law box labels, just sized to sit against one totem ring rather
// than float over the whole clearing. Optional smaller subtitle line for the base plaque's oath text.
function buildTotemPlaqueSprite(title, subtitle){
  const canvas = document.createElement('canvas');
  canvas.width = 360; canvas.height = subtitle ? 108 : 76;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#5a3d22';
  ctx.fillRect(0,0,canvas.width,canvas.height);
  ctx.strokeStyle = '#2e1c0e';
  ctx.lineWidth = 6;
  ctx.strokeRect(3,3,canvas.width-6,canvas.height-6);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#f0dfa8';
  ctx.font = 'bold 26px sans-serif';
  ctx.textBaseline = 'middle';
  ctx.fillText(title, canvas.width/2, subtitle ? 36 : canvas.height/2);
  if(subtitle){
    ctx.font = '15px sans-serif';
    ctx.fillStyle = '#e0cf98';
    const words = subtitle.split(' ');
    let line = '', y = 68, lineH = 19;
    for(const w of words){
      const test = line ? line+' '+w : w;
      if(ctx.measureText(test).width > canvas.width-24 && line){
        ctx.fillText(line, canvas.width/2, y);
        line = w; y += lineH;
      } else line = test;
    }
    if(line) ctx.fillText(line, canvas.width/2, y);
  }
  const tex = new THREE.CanvasTexture(canvas);
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
  sprite.scale.set(1.7, 1.7*canvas.height/canvas.width, 1);
  return sprite;
}
// A small hanging lantern with a warm, always-lit point light — the campfire glow at the base of the
// clearing's other fixtures, brought up to totem height. Purely decorative (unlike the placeable
// Lantern item, this one can't be picked up), positioned off to one side like it's hung from a wing.
function buildTotemLantern(){
  const g = new THREE.Group();
  const bodyMat = new THREE.MeshLambertMaterial({ color: 0x3a3a3a });
  const glassMat = new THREE.MeshLambertMaterial({ color: 0xffd980, emissive: 0xffaa33, emissiveIntensity: 0.8 });
  const hook = animalBox(0.05, 0.14, 0.05, bodyMat);
  hook.position.set(0,0.14,0);
  g.add(hook);
  const glass = animalBox(0.16, 0.2, 0.16, glassMat);
  glass.position.y = -0.03;
  g.add(glass);
  const cap = animalBox(0.2, 0.05, 0.2, bodyMat);
  cap.position.y = 0.08;
  g.add(cap);
  const light = new THREE.PointLight(0xffaa44, 1.6, 8, 1.8);
  g.add(light);
  return g;
}
// The Scout Oath totem: 4 purpose-built rings instead of the generic cycling symbols (see
// TOTEM_OATH_BASE etc.), an eagle topper reused from the generic totem, and a small hanging lantern
// for the warm glow real hand-carved camp totems are often lit with at night.
function buildScoutOathTotem(x, z){
  const baseY = COOKING_AREA_Y + 1;
  const rings = [TOTEM_OATH_BASE, TOTEM_OATH_CREED, TOTEM_OATH_LAW, TOTEM_OATH_DUTY];
  const meshes = [];
  rings.forEach((block, i) => {
    setBlock(x, baseY+i, z, block);
    PROTECTED_CELLS.add(x+','+(baseY+i)+','+z);
  });
  const height = rings.length;
  const eagleMesh = buildTotemEagleMesh();
  eagleMesh.position.set(x+0.5, baseY+height, z+0.5);
  scene.add(eagleMesh);
  meshes.push(eagleMesh);
  const lantern = buildTotemLantern();
  lantern.position.set(x+0.5+0.9, baseY+height-0.3, z+0.5);
  scene.add(lantern);
  meshes.push(lantern);
  totems.push({ x, z, play: playScoutOath, meshes });
}
// The Outdoor Code totem: the same eagle topper as the Oath totem, over 5 purpose-built rings — an
// "As an American..." recap at the base, then the Code's own 4 points in recitation order, tallest
// of the two totems since the Code has one more line than the Oath's creed.
function buildOutdoorCodeTotem(x, z){
  const baseY = COOKING_AREA_Y + 1;
  const rings = [TOTEM_CODE_BASE, TOTEM_CODE_CONSERVATION, TOTEM_CODE_CONSIDERATE, TOTEM_CODE_FIRE, TOTEM_CODE_CLEAN];
  const meshes = [];
  rings.forEach((block, i) => {
    setBlock(x, baseY+i, z, block);
    PROTECTED_CELLS.add(x+','+(baseY+i)+','+z);
  });
  const height = rings.length;
  const eagleMesh = buildTotemEagleMesh();
  eagleMesh.position.set(x+0.5, baseY+height, z+0.5);
  scene.add(eagleMesh);
  meshes.push(eagleMesh);
  const lantern = buildTotemLantern();
  lantern.position.set(x+0.5+0.8, baseY+height-0.2, z+0.5);
  scene.add(lantern);
  meshes.push(lantern);
  totems.push({ x, z, play: playOutdoorCode, meshes });
}
function buildTotems(){
  // Called again after loadEdits (see init()), same as buildGiantFlag — without clearing the old
  // meshes first, a second call would leave duplicates stacked on top of each totem.
  for(const t of totems) for(const m of t.meshes) scene.remove(m);
  totems.length = 0;
  const { x: x0, z: z0 } = COOKING_AREA_ORIGIN;
  buildScoutOathTotem(x0+COOKING_AREA_SIZE-2, z0+2);      // NE corner
  buildOutdoorCodeTotem(x0+2, z0+COOKING_AREA_SIZE-2);    // SW corner
}
// ---------- Archery Range: a fixed shooting lane just south of the cooking area ----------
// A flattened lane at the same elevation as the rest of camp, framed by four short corner posts, with
// 3 straw targets at the far end. Shooting only works while standing somewhere inside these bounds
// (see tryShootBow) — the whole point of a range is that you don't loose arrows just anywhere. Pure
// voxel blocks, no THREE objects of its own, so — unlike buildGiantFlag/buildTotems above — the
// second call after loadEdits (see init()) needs no old-instance cleanup first, just a re-assert.
const ARCHERY_RANGE_ORIGIN = { x: 57, z: 74 }; // flush against the cooking area's south edge
const ARCHERY_RANGE_WIDTH = 10;
const ARCHERY_RANGE_LENGTH = 16;
const ARCHERY_RANGE_Y = COOKING_AREA_Y; // same fixed elevation as the rest of camp
function inArcheryRange(x,z){
  const { x: x0, z: z0 } = ARCHERY_RANGE_ORIGIN;
  return x>=x0 && x<x0+ARCHERY_RANGE_WIDTH && z>=z0 && z<z0+ARCHERY_RANGE_LENGTH;
}
function buildArcheryRange(){
  const { x: x0, z: z0 } = ARCHERY_RANGE_ORIGIN;
  for(let dx=0; dx<ARCHERY_RANGE_WIDTH; dx++){
    for(let dz=0; dz<ARCHERY_RANGE_LENGTH; dz++){
      const x=x0+dx, z=z0+dz;
      for(let y=1; y<ARCHERY_RANGE_Y-1; y++) setBlock(x,y,z,STONE);
      setBlock(x,ARCHERY_RANGE_Y-1,z,DIRT);
      setBlock(x,ARCHERY_RANGE_Y,z,GRASS);
      for(let y=ARCHERY_RANGE_Y+1; y<WORLD_HEIGHT; y++) setBlock(x,y,z,AIR);
      // The lane's surface can't be dug up, so the floor stays level (nothing can be dug below it
      // either, since every dig starts by breaking the surface block). No fixture sits on it to
      // protect, unlike the corner posts and targets below.
      PROTECTED_CELLS.add(x+','+ARCHERY_RANGE_Y+','+z);
    }
  }
  const groundY = ARCHERY_RANGE_Y + 1;
  const protect = (x,y,z,block) => { setBlock(x,y,z,block); PROTECTED_CELLS.add(x+','+y+','+z); };
  // Four corner posts, just tall enough to visually frame the lane without blocking a shot.
  for(const [cx,cz] of [[0,0],[ARCHERY_RANGE_WIDTH-1,0],[0,ARCHERY_RANGE_LENGTH-1],[ARCHERY_RANGE_WIDTH-1,ARCHERY_RANGE_LENGTH-1]]){
    protect(x0+cx, groundY, z0+cz, WOOD);
    protect(x0+cx, groundY+1, z0+cz, WOOD);
  }
  // 3 targets side by side at the far end, each 2 tall on a short post — a forgiving enough vertical
  // window that a level shot's natural gravity drop over the lane's length still lands on it.
  const targetZ = z0 + ARCHERY_RANGE_LENGTH - 3;
  for(const tx of [x0+2, Math.round(x0+ARCHERY_RANGE_WIDTH/2), x0+ARCHERY_RANGE_WIDTH-3]){
    protect(tx, groundY, targetZ, WOOD);
    protect(tx, groundY+1, targetZ, ARCHERY_TARGET);
    protect(tx, groundY+2, targetZ, ARCHERY_TARGET);
  }
}
// ---------- Meditation hilltop: a quiet, deliberately non-denominational reflection spot ----------
// A freestanding hill rises out of the terrain well clear of camp's noise, topped with a small ring
// of plain fieldstone flush with the ground — no carved faces, no symbols, nothing tied to any one
// faith, just an open circle to stand inside — the same idea as a real camp's "Council Ring," used
// for quiet reflection rather than any particular practice. Carved into whatever terrain is already
// there the same way the cooking area and archery range are, just radial (a cosine falloff from a
// flat peak back down to the natural height at the rim) instead of another flat rectangle, so it
// actually reads as a hill instead of a plateau dropped onto the map.
const ALTAR_ORIGIN = { x: 24, z: 24 };
const ALTAR_HILL_RADIUS = 13;    // where the slope tapers back into natural terrain
const ALTAR_PLATEAU_RADIUS = 3;  // flat ground at the peak, and the stone ring's own radius
const ALTAR_HILL_HEIGHT = 9;     // how far the peak rises above the natural ground right under it
let altarStandPos = null; // {x,y,z} world position of the ring's center — read by updateScout below
function inAltarArea(x,z){
  return Math.hypot(x-ALTAR_ORIGIN.x, z-ALTAR_ORIGIN.z) < ALTAR_HILL_RADIUS + 2;
}
function buildMeditationHill(){
  const { x: x0, z: z0 } = ALTAR_ORIGIN;
  const R = ALTAR_HILL_RADIUS;
  let peakY = 0;
  for(let dx=-R-1; dx<=R+1; dx++){
    for(let dz=-R-1; dz<=R+1; dz++){
      const dist = Math.hypot(dx,dz);
      if(dist > R) continue;
      const x = x0+dx, z = z0+dz;
      if(!inBounds(x,0,z)) continue;
      const base = heightAt(x,z);
      const t = Math.min(1, Math.max(0, (dist-ALTAR_PLATEAU_RADIUS) / (R-ALTAR_PLATEAU_RADIUS)));
      const boost = ALTAR_HILL_HEIGHT * (0.5 + 0.5*Math.cos(t*Math.PI));
      const h = Math.min(WORLD_HEIGHT-4, Math.round(base + boost));
      for(let y=1; y<=h; y++) setBlock(x,y,z, y===h ? GRASS : (y>h-4 ? DIRT : STONE));
      for(let y=h+1; y<WORLD_HEIGHT; y++) setBlock(x,y,z,AIR);
      if(dx===0 && dz===0) peakY = h;
    }
  }
  // The ring itself: plain fieldstone flush with the ground, wide enough to stand inside rather than
  // an object to look at. RING_POINTS chosen so the gaps between stones stay small enough to still
  // read as a ring rather than scattered rocks (some points round to the same cell at this radius,
  // which only makes the ring a bit denser on that side — a real stacked-stone ring isn't perfectly
  // even either).
  const protect = (x,y,z,block) => { setBlock(x,y,z,block); PROTECTED_CELLS.add(x+','+y+','+z); };
  const RING_POINTS = 12;
  for(let i=0;i<RING_POINTS;i++){
    const a = (i/RING_POINTS) * Math.PI*2;
    const rx = Math.round(x0 + Math.cos(a)*ALTAR_PLATEAU_RADIUS);
    const rz = Math.round(z0 + Math.sin(a)*ALTAR_PLATEAU_RADIUS);
    protect(rx, peakY, rz, STONE);
  }
  // y matches the same "+0.5" convention nearestCraftingTable/nearestTent use for their own fixed
  // fixtures — the ring's own block height, not a feet or eye position — MEDITATE_RADIUS is generous
  // enough to cover a Scout actually standing at ground level over it either way.
  altarStandPos = { x: x0+0.5, y: peakY+0.5, z: z0+0.5 };
  // Same floating wooden sign technique as the camp's own welcome sign — just enough to tell a
  // Scout who's found this place what it's for, without any posted text beyond that.
  const sign = buildCampSignSprite('🧘 Reflection Circle');
  sign.position.set(x0+0.5, peakY+4, z0+0.5);
  scene.add(sign);
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
      if(inCookingArea(x,z) || inArcheryRange(x,z) || inAltarArea(x,z)) continue;
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

