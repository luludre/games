// ---------- world-edits.js ----------
// Things that modify the world at runtime: applyWorldEdit, torch lights, tree-support/fall physics, falling clusters, saplings, tree regrowth, fire (ignite/spread/extinguish+fx), water flow, fireworks.
'use strict';

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

