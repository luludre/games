// ---------- interaction.js ----------
// First-person view-model (hand/held item, map texture), physics collision (block/entity), updatePlayer (the main per-frame physics function), block raycast/break/place, door/ladder/tent/flag find+place+toggle.
'use strict';

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
// Specifically the eye/camera cell, not body-center like isInWater above — this is what actually
// decides whether you're "scuba diving" (mask on, blue first-person overlay) rather than just wading
// or swimming with your head above the surface.
function isHeadUnderwater(){
  return getBlock(Math.floor(player.pos.x), Math.floor(player.pos.y+player.eye), Math.floor(player.pos.z))===WATER;
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
// The giant flag's mural sits high up (near the top of a 12-block pole) and immediately beside the
// bare pole shaft, which is its own solid column the same height. FLAG_PLEDGE_PROXIMITY below is what
// stops this firing from clear across camp — this just has to confirm you're actually looking toward
// the mural once you're that close.
const FLAG_PLEDGE_MAX_DIST = 40;
const FLAG_PLEDGE_PROXIMITY = 10; // horizontal blocks from the pole — has to be standing in front of it
const FLAG_PLEDGE_COS = Math.cos(10 * Math.PI/180); // ~10° cone — deliberate but forgiving of imprecise aim
function raycastUSFlag(){
  const pole = giantFlagPolePos();
  const dx = player.pos.x-(pole.x+0.5), dz = player.pos.z-(pole.z+0.5);
  if(dx*dx+dz*dz > FLAG_PLEDGE_PROXIMITY*FLAG_PLEDGE_PROXIMITY) return false;
  // A pixel-thin raycast here used to make it easy to instead clip the bare pole shaft standing right
  // next to the mural and miss by a hair, so this checks the angle to the mural's own center instead
  // of demanding an exact hit — the same forgiving-cone approach as the Big Dipper gaze check.
  const { x: poleX, z: poleZ } = pole;
  const flagTopY = COOKING_AREA_Y + 1 + GIANT_FLAG_POLE_HEIGHT;
  const muralCenter = new THREE.Vector3(poleX-1.5, flagTopY, poleZ+0.5);
  const toMural = muralCenter.clone().sub(camera.position);
  const dist = toMural.length();
  if(dist > FLAG_PLEDGE_MAX_DIST) return false;
  toMural.normalize();
  const lookDir = getLookDir(player.yaw, player.pitch);
  return lookDir.dot(toMural) > FLAG_PLEDGE_COS;
}
let lastTreeWarningAt = 0;
const TREE_WARNING_COOLDOWN_MS = 5000;
let lastDigWarningAt = 0;
const DIG_WARNING_COOLDOWN_MS = 5000;
// Without a word, a block that just won't break reads as a glitch.
function warnCantDig(msg){
  if(Date.now()-lastDigWarningAt < DIG_WARNING_COOLDOWN_MS) return;
  lastDigWarningAt = Date.now();
  addChatMessage('Camp', msg);
}
function breakBlock(){
  const hit = raycastBlock();
  if(!hit) return;
  const b = getBlock(hit.x,hit.y,hit.z);
  if(b===BEDROCK) return;
  if(PROTECTED_CELLS.has(hit.x+','+hit.y+','+hit.z)){
    if(hit.y===ARCHERY_RANGE_Y && inArcheryRange(hit.x,hit.z)) warnCantDig("🏹 The archery lane is kept level — the ground here can't be dug up.");
    else if(hit.y===COOKING_AREA_Y && inCookingArea(hit.x,hit.z)) warnCantDig("⛺ Camp's ground is kept flat and level — no digging holes around the cooking fires.");
    return;
  }
  if(belowDigLimit(hit.x,hit.y,hit.z,b)){
    warnCantDig("⛏️ That's as deep as you can dig here — the ground below is solid.");
    return;
  }
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

