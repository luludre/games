// ---------- animals.js ----------
// Land-animal AI (rabbit/squirrel/deer/bear/moose): spawn, update, damage, kill, warnings.
'use strict';

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
    // Scared off by the Stop Bear function (see scareHostileAnimalsNear below) — run straight away
    // from the player, overriding aggro/wander entirely until the fright wears off. Clearing aggroUntil too
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
// Shouting and clapping at anything nearby actually capable of hurting you — see the Stop Bear
// quick-access icon. Filtered on dmg>0 rather than a hardcoded type list so it automatically covers
// the bear AND the moose (moose is retaliate-only, not aggressive-on-sight like the bear, but it's
// just as dangerous once it's charging) and keeps covering any future hostile species for free.
// Returns how many animals actually got scared, so the caller can react if there weren't any nearby.
function scareHostileAnimalsNear(x, z, radius){
  let scared = 0;
  for(const a of animals){
    if(!ANIMAL_STATS[a.type].dmg) continue;
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
