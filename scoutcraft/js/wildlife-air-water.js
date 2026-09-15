// ---------- wildlife-air-water.js ----------
// Flying and aquatic ambient wildlife: birds (30 species), big eagles, fish, turtles, frogs.
'use strict';

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

// ---------- Frogs: small amphibians perched right at the water's edge ----------
// Unlike fish/turtles they don't swim — they sit on the dry shoreline tile beside water and hop a
// short, arcing distance to a new nearby edge spot every so often. Same recycled-near-player idea as
// the rest of this ambient wildlife (findFrogSpot is the land-beside-water equivalent of findFishSpot
// above), and just hides itself if there's no shoreline to be found nearby at all.
const FROG_SPECIES = [
  { id:'greenfrog',  name:'Green Frog',       body:0x4a7a3a, belly:0xd9c98a, size:1.0 },
  { id:'bullfrog',   name:'Bullfrog',         body:0x5a6a3a, belly:0xc9c090, size:1.3 },
  { id:'poisonfrog', name:'Poison Dart Frog', body:0x1a2a1a, belly:0xffcc22, size:0.7 },
];
const FROG_COUNT = FROG_SPECIES.length * 3;
const FROG_RADIUS = 20; // relocate-near-player range, same role as FISH_RADIUS/TURTLE_RADIUS
const FROG_HOP_RADIUS = 2.2; // how far a single hop can land from where the frog already is
const frogs = [];
const frogMatCache = new Map();
const frogEyeMat = new THREE.MeshLambertMaterial({ color: 0x141414 });
function frogMaterials(species){
  let m = frogMatCache.get(species.id);
  if(!m){
    m = { body: new THREE.MeshLambertMaterial({ color: species.body }), belly: new THREE.MeshLambertMaterial({ color: species.belly }) };
    frogMatCache.set(species.id, m);
  }
  return m;
}
// A squat little body built the same "compose primitives" way as the rest of this file's wildlife —
// a rounded torso, two bulging eyes on top so it reads as a frog even at a glance, and four legs on
// hinges that kick back at launch and tuck under mid-hop.
function buildFrogMesh(species){
  const { body: bodyMat, belly: bellyMat } = frogMaterials(species);
  const g = new THREE.Group();

  const body = animalBox(0.26, 0.14, 0.32, bodyMat);
  body.position.set(0, 0.1, 0);
  g.add(body);
  const belly = animalBox(0.18, 0.08, 0.2, bellyMat);
  belly.position.set(0, 0.06, 0.03);
  g.add(belly);

  for(const side of [1,-1]){
    const eye = animalBox(0.08, 0.08, 0.08, bodyMat);
    eye.position.set(side*0.08, 0.19, -0.1);
    g.add(eye);
    const pupil = animalBox(0.03, 0.03, 0.03, frogEyeMat);
    pupil.position.set(side*0.08, 0.2, -0.14);
    g.add(pupil);
  }

  const legs = [];
  // Back legs: longer, the ones that actually do the jumping — pivoted at the hip so they swing back
  // on launch and tuck forward mid-air, same hinge-not-centered trick as the bird wings above.
  for(const side of [1,-1]){
    const pivot = new THREE.Group();
    pivot.position.set(side*0.13, 0.08, 0.13);
    const leg = animalBox(0.06, 0.05, 0.22, bodyMat);
    leg.geometry.translate(0, 0, 0.11);
    pivot.add(leg);
    pivot.userData.back = true;
    g.add(pivot);
    legs.push(pivot);
  }
  // Front legs: short, mostly just for the landing pose.
  for(const side of [1,-1]){
    const pivot = new THREE.Group();
    pivot.position.set(side*0.1, 0.07, -0.14);
    const leg = animalBox(0.05, 0.04, 0.1, bodyMat);
    leg.geometry.translate(0, 0, -0.05);
    pivot.add(leg);
    pivot.userData.back = false;
    g.add(pivot);
    legs.push(pivot);
  }
  g.userData.legs = legs;

  g.scale.setScalar(species.size);
  g.traverse(o => { if(o.isMesh) o.castShadow = true; });
  return g;
}
// A dry land cell within `radius` of (cx,cz) that has at least one WATER neighbor — the frog
// equivalent of findFishSpot's "a nearby water column," just inverted to land-beside-water.
function findFrogSpot(cx, cz, radius){
  for(let tries=0; tries<20; tries++){
    const ang = Math.random()*Math.PI*2, r = Math.random()*radius;
    const x = Math.floor(cx + Math.cos(ang)*r);
    const z = Math.floor(cz + Math.sin(ang)*r);
    const h = heightAt(x,z);
    if(h < SEA_LEVEL) continue; // underwater here, not the shore
    const isWaterEdge = [[x+1,z],[x-1,z],[x,z+1],[x,z-1]].some(([nx,nz]) => heightAt(nx,nz) < SEA_LEVEL);
    if(isWaterEdge) return { x:x+0.5, z:z+0.5, y:h+1 };
  }
  return null;
}
function spawnFrogHome(fr, cx, cz){
  const spot = findFrogSpot(cx, cz, FROG_RADIUS);
  if(!spot){ fr.hasHome = false; fr.mesh.visible = false; return; }
  fr.hasHome = true; fr.mesh.visible = true;
  fr.x = spot.x; fr.z = spot.z; fr.y = spot.y;
  fr.mesh.position.set(fr.x, fr.y, fr.z);
  fr.hopping = false;
  fr.idleTimer = 1 + Math.random()*3;
}
function ensureFrogs(){
  if(frogs.length) return;
  for(const species of FROG_SPECIES) for(let i=0;i<3;i++){
    const mesh = buildFrogMesh(species);
    scene.add(mesh);
    const fr = {
      mesh, species, x:0, z:0, y:0, hasHome:false,
      hopping:false, idleTimer:0, hopElapsed:0, hopDuration:0,
      fromX:0, fromZ:0, toX:0, toZ:0, toY:0,
    };
    spawnFrogHome(fr, player.pos.x, player.pos.z);
    frogs.push(fr);
  }
}
function updateFrogs(dt){
  ensureFrogs();
  for(const fr of frogs){
    if(!fr.hasHome){ spawnFrogHome(fr, player.pos.x, player.pos.z); if(!fr.hasHome) continue; }
    const dx = fr.x-player.pos.x, dz = fr.z-player.pos.z;
    if(dx*dx+dz*dz > FROG_RADIUS*FROG_RADIUS){ spawnFrogHome(fr, player.pos.x, player.pos.z); if(!fr.hasHome) continue; }

    if(fr.hopping){
      fr.hopElapsed += dt;
      const t = Math.min(1, fr.hopElapsed / fr.hopDuration);
      const arcH = Math.sin(t*Math.PI) * 0.35;
      fr.mesh.position.set(
        fr.fromX + (fr.toX-fr.fromX)*t,
        fr.toY + arcH,
        fr.fromZ + (fr.toZ-fr.fromZ)*t,
      );
      const squash = 1 - Math.sin(t*Math.PI)*0.25;
      fr.mesh.scale.set(fr.species.size/squash, fr.species.size*squash, fr.species.size/squash);
      for(const leg of fr.mesh.userData.legs) leg.rotation.x = (leg.userData.back?-1:1) * Math.sin(t*Math.PI) * (leg.userData.back?1.1:0.6);
      if(t>=1){
        fr.hopping = false;
        fr.x = fr.toX; fr.z = fr.toZ; fr.y = fr.toY;
        fr.mesh.scale.setScalar(fr.species.size);
        fr.idleTimer = 1.5 + Math.random()*4;
      }
    } else {
      fr.idleTimer -= dt;
      if(fr.idleTimer <= 0){
        const spot = findFrogSpot(fr.x, fr.z, FROG_HOP_RADIUS);
        if(spot){
          fr.hopping = true; fr.hopElapsed = 0; fr.hopDuration = 0.35+Math.random()*0.15;
          fr.fromX = fr.x; fr.fromZ = fr.z;
          fr.toX = spot.x; fr.toZ = spot.z; fr.toY = spot.y;
          fr.mesh.rotation.y = Math.atan2(-(fr.toX-fr.fromX), -(fr.toZ-fr.fromZ));
        } else {
          fr.idleTimer = 1 + Math.random()*2; // nowhere to hop to right now — try again shortly
        }
      }
    }
  }
}

