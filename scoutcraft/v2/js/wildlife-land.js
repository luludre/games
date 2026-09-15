// ---------- wildlife-land.js ----------
// Ground-dwelling ambient wildlife: fireflies, worms, gophers, butterflies, Hercules beetles.
'use strict';

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

