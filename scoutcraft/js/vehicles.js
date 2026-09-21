// ---------- vehicles.js ----------
// Rideable camp props: the kayak (hands-free loop) and the horse (player-steered).
'use strict';

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
// The water surface itself is SEA_LEVEL+1, not SEA_LEVEL — the topmost water block is placed AT
// SEA_LEVEL and, like any voxel, its visible top face is one full block above that (see
// waterSurfaceAt above, which returns exactly this). KAYAK_SIT_Y sits the hull right on that surface.
const KAYAK_SIT_Y = SEA_LEVEL + 1.05;
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

