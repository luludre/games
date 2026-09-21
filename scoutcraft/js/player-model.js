// ---------- player-model.js ----------
// Player state/spawn, the blocky avatar model (body, face/shirt/patch textures, neckerchief, buckle), floating name/HP tag, and the animal 3D models (hide textures, quadruped builder, per-species builders). How everything LOOKS, not how it behaves.
'use strict';

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
  // Diving mask + snorkel — hidden unless actually head-underwater (see updateScubaGear), so it only
  // shows up while genuinely scuba diving, not just standing waist-deep.
  const scubaGear = new THREE.Group();
  const maskMat = new THREE.MeshLambertMaterial({ color: 0x1a1a1a });
  const lensMat = new THREE.MeshLambertMaterial({ color: 0x8fd0e8, transparent:true, opacity:0.6 });
  const snorkelMat = new THREE.MeshLambertMaterial({ color: 0x2a6b4a });
  const maskStrap = box(0.5, 0.05, 0.05, maskMat);
  maskStrap.position.set(0, 1.58, 0);
  scubaGear.add(maskStrap);
  const maskBand = box(0.4, 0.15, 0.06, maskMat);
  maskBand.position.set(0, 1.55, -0.26);
  scubaGear.add(maskBand);
  const maskLens = box(0.3, 0.09, 0.02, lensMat);
  maskLens.position.set(0, 1.56, -0.29);
  scubaGear.add(maskLens);
  const snorkelTube = box(0.05, 0.4, 0.05, snorkelMat);
  snorkelTube.position.set(0.24, 1.65, -0.05);
  scubaGear.add(snorkelTube);
  const snorkelMouthpiece = box(0.08, 0.05, 0.1, snorkelMat);
  snorkelMouthpiece.position.set(0.16, 1.42, -0.24);
  scubaGear.add(snorkelMouthpiece);
  scubaGear.visible = false;

  group.add(head, body, armL, armR, legL, legR, hatCrown, hatBrim, neckerchief, backpack, backpackFlap, belt, buckle, scubaGear);
  group.userData.parts = { armL, armR, legL, legR };
  group.userData.scubaGear = scubaGear;
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
// Draws a small standalone front-on render of the player's own character into destCtx at
// (dx,dy,dw,dh) — a completely separate THREE scene/camera/renderer from the main game view (a fresh
// createCharacterMesh(), not the live characterMesh), so grabbing this snapshot never touches actual
// gameplay state. The character's own "front" (the shirt-pocket/face textures) is the box geometry's
// -z face — see createCharacterMesh — so the camera sits on the -z side looking back toward +z at it,
// the same convention used everywhere else in this file. Everything here is torn down before
// returning, since the renderer's canvas would go blank the moment it's disposed.
function drawAvatarPortrait(destCtx, dx, dy, dw, dh){
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xffffff, 0x445533, 1.1));
  const dir = new THREE.DirectionalLight(0xffffff, 0.9);
  dir.position.set(1, 2, -2);
  scene.add(dir);

  const avatar = createCharacterMesh();
  applyUniformCustomization(avatar, myTroop, myNeckerchiefColor);
  // Turned 30° off dead-on rather than a straight front view, angling toward the backpack worn on
  // the back (opposite the front-facing shirt/face textures — see createCharacterMesh). At just 30°
  // the arms still mostly occlude it — a bigger angle shows more if that's ever wanted.
  avatar.rotation.y = THREE.MathUtils.degToRad(30);
  scene.add(avatar);

  const camera = new THREE.PerspectiveCamera(35, dw/dh, 0.1, 10);
  camera.position.set(0, 0.9, -3.6);
  camera.lookAt(0, 0.9, 0);

  const renderer = new THREE.WebGLRenderer({ alpha:true, antialias:true });
  renderer.setSize(dw, dh);
  renderer.render(scene, camera);
  // Copied via a scratch canvas + manual alpha blending rather than destCtx.drawImage(renderer.
  // domElement, ...) directly — reproducibly, once a destination canvas has ever had a gradient
  // fillStyle used on it (exactly what buildAchievementCanvas's header background is), Chrome fails
  // to actually composite a WebGL canvas drawn into it afterward: no error, just silently leaves the
  // destination untouched. Drawing onto a fresh scratch canvas first sidesteps that, and since the
  // destination here is always fully opaque already, a manual "source over opaque" blend is all
  // getImageData/putImageData needs to reproduce what drawImage would have done.
  const scratch = document.createElement('canvas');
  scratch.width = dw; scratch.height = dh;
  scratch.getContext('2d').drawImage(renderer.domElement, 0, 0);
  const src = scratch.getContext('2d').getImageData(0, 0, dw, dh).data;
  const dst = destCtx.getImageData(dx, dy, dw, dh);
  const dstData = dst.data;
  for(let i=0;i<src.length;i+=4){
    const a = src[i+3]/255;
    if(a<=0) continue;
    dstData[i]   = src[i]  *a + dstData[i]  *(1-a);
    dstData[i+1] = src[i+1]*a + dstData[i+1]*(1-a);
    dstData[i+2] = src[i+2]*a + dstData[i+2]*(1-a);
  }
  destCtx.putImageData(dst, dx, dy);

  avatar.traverse(o=>{
    if(!o.isMesh) return;
    o.geometry.dispose();
    (Array.isArray(o.material) ? o.material : [o.material]).forEach(m=>{
      if(m.map) m.map.dispose();
      m.dispose();
    });
  });
  renderer.dispose();
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

