// ---------- rendering.js ----------
// Chunked mesh building (chunk geometry, materials, buckets, rebuild), tree species/tint logic, minimap.
'use strict';

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

