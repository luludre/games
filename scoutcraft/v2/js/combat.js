// ---------- combat.js ----------
// HP/hunger UI, damage, death, respawn, sleep, findAttackTarget/tryAttack, third-person/peek camera state.
'use strict';

// ---------- Combat ----------
let myHP = PLAYER_MAX_HP;
let myHunger = PLAYER_MAX_HUNGER; // same as myHP — in-memory only, resets to full on reload/respawn
let myName = 'Player';
try{ const savedName = localStorage.getItem('scoutcraft_player_name'); if(savedName) myName = savedName; }catch(e){}
let myTroop = '';
try{ const savedTroop = localStorage.getItem('scoutcraft_player_troop'); if(savedTroop) myTroop = savedTroop; }catch(e){}
let myNeckerchiefColor = '#c62828';
try{ const savedNeck = localStorage.getItem('scoutcraft_player_neckerchief'); if(savedNeck) myNeckerchiefColor = savedNeck; }catch(e){}
// Regen: standing still (no movement keys held) for a bit slowly heals a half-heart at a time.
const REGEN_IDLE_DELAY = 2;   // seconds of standing still before regen starts
const REGEN_INTERVAL = 1.5;   // seconds between each half-heart tick while idle
let idleTimer = 0, regenTimer = 0;
const RESPAWN_DELAY = 3;      // seconds a dead player is frozen before respawning
let isDead = false, respawnTimer = 0;
function heartSVG(kind, i){
  const red='#d9463c', gray='#4a4a4a', dark='#2a2a2a';
  const path = 'M12 21s-7.5-4.6-10-9.3C0.3 8.5 2 5 5.5 5c2 0 3.3 1.1 4 2.2C10.2 6.1 11.5 5 13.5 5 17 5 18.7 8.5 17 11.7 15.5 16.4 12 21 12 21z';
  if(kind==='half'){
    const cid = 'heartClip'+i;
    return `<svg viewBox="0 0 24 24" width="20" height="20"><defs><clipPath id="${cid}"><rect x="0" y="0" width="12" height="24"/></clipPath></defs><path d="${path}" fill="${gray}" stroke="${dark}" stroke-width="1"/><path d="${path}" fill="${red}" clip-path="url(#${cid})"/></svg>`;
  }
  const fill = kind==='full' ? red : 'none';
  const stroke = kind==='full' ? dark : gray;
  return `<svg viewBox="0 0 24 24" width="20" height="20"><path d="${path}" fill="${fill}" stroke="${stroke}" stroke-width="${kind==='full'?1:1.5}"/></svg>`;
}
function updateHeartsUI(){
  const el = document.getElementById('hearts');
  if(!el) return;
  el.innerHTML = '';
  const totalHearts = PLAYER_MAX_HP / HP_PER_HEART;
  for(let i=0;i<totalHearts;i++){
    const remaining = Math.max(0, Math.min(HP_PER_HEART, myHP - i*HP_PER_HEART));
    const kind = remaining>=HP_PER_HEART ? 'full' : (remaining>0 ? 'half' : 'empty');
    el.insertAdjacentHTML('beforeend', heartSVG(kind,i));
  }
}
// Emoji rather than hand-drawn SVG (unlike the hearts) — a drumstick silhouette isn't a simple enough
// shape to hand-derive a path for reliably, and this game already leans on plain emoji elsewhere in
// the HUD (weather, worm/butterfly counts). Full = a drumstick, half = the same drumstick dimmed, empty
// = a bare bone — reads at a glance without needing a legend.
function updateHungerUI(){
  const el = document.getElementById('hunger');
  if(!el) return;
  el.innerHTML = '';
  const totalIcons = PLAYER_MAX_HUNGER / HUNGER_PER_ICON;
  for(let i=0;i<totalIcons;i++){
    const remaining = Math.max(0, Math.min(HUNGER_PER_ICON, myHunger - i*HUNGER_PER_ICON));
    const span = document.createElement('span');
    span.textContent = remaining>0 ? '🍗' : '🦴';
    span.style.opacity = remaining>=HUNGER_PER_ICON ? '1' : (remaining>0 ? '0.45' : '0.7');
    el.appendChild(span);
  }
}
let hurtFlashTimeout = null;
function flashHurt(){
  const el = document.getElementById('hurtOverlay');
  if(!el) return;
  el.style.transition = 'none';
  el.style.opacity = '1';
  clearTimeout(hurtFlashTimeout);
  requestAnimationFrame(()=>{
    el.style.transition = 'opacity 0.5s ease-out';
    el.style.opacity = '0';
  });
}
function damagePlayer(dmg, sourceType){
  if(dmg<=0) return;
  // Floors at 1, not 0: badly hurt (half a heart, flashing red) is as bad as it gets — death and
  // respawn never trigger. die()/isDead/the respawn flow below stay in place, just permanently unused.
  myHP = Math.max(1, myHP - dmg);
  updateHeartsUI();
  flashHurt();
  SFX.hurt();
}
function die(){
  if(isDead) return;
  isDead = true;
  respawnTimer = RESPAWN_DELAY;
  const msg = document.getElementById('deathMessage');
  if(msg){ msg.hidden = false; msg.textContent = `You died — respawning in ${Math.ceil(respawnTimer)}…`; }
  SFX.death();
}
function respawnAfterDeath(){
  isDead = false;
  const msg = document.getElementById('deathMessage');
  if(msg) msg.hidden = true;
  spawnPlayer();
  myHP = PLAYER_MAX_HP;
  updateHeartsUI();
  myHunger = PLAYER_MAX_HUNGER;
  updateHungerUI();
}
// ---------- Sleep ----------
// Sleeping through the night can't actually fast-forward the wall clock everything else is driven
// from (see currentDayTime), so it uses the same local override the N key does (setTimeMode) to jump
// your own view to morning. What it actually gets you: a full rest (HP and hunger both topped up)
// plus that jump to morning.
let sleeping = false;
const WAKE_UP_HOUR = 7; // 7am
function trySleep(){
  if(sleeping || craftingOpen || itemsOpen || sashOpen || bearBoxOpen || backpackOpen || cookwareOpen) return;
  if(!nearestTent(4)){ addChatMessage('Camp', '⛺ You need to be near your tent to sleep.'); return; }
  if(invCount(SLEEPING_BAG)<=0 || invCount(SLEEPING_PAD)<=0){
    addChatMessage('Camp', "🛏️ You need your Sleeping Bag and Sleeping Pad out to make camp for the night — check your Backpack.");
    return;
  }
  if(!isScoutNight()){ addChatMessage('Camp', "☀️ You're not sleepy yet — try again after dark."); return; }
  sleeping = true;
  const el = document.getElementById('sleepOverlay');
  if(el){ el.style.transition = 'none'; el.style.opacity = '1'; }
  setTimeout(()=>{
    setTimeMode(WAKE_UP_HOUR/24);
    myHP = PLAYER_MAX_HP;
    updateHeartsUI();
    myHunger = PLAYER_MAX_HUNGER;
    updateHungerUI();
    SFX.sleep();
    addChatMessage('Camp', '💤 You wake up at camp, well rested.');
    if(el) requestAnimationFrame(()=>{ el.style.transition = 'opacity 1.2s ease-in'; el.style.opacity = '0'; });
    sleeping = false;
  }, 900);
}
function updateDeathState(dt){
  if(!isDead) return;
  respawnTimer -= dt;
  const msg = document.getElementById('deathMessage');
  if(msg) msg.textContent = `You died — respawning in ${Math.max(0,Math.ceil(respawnTimer))}…`;
  if(respawnTimer <= 0) respawnAfterDeath();
}
function findAttackTarget(){
  const dir = getLookDir(player.yaw, player.pitch);
  const origin = camera.position;
  let best = null, bestDist = Infinity;
  animals.forEach(a=>{
    // Bigger animals (moose, bear...) need a longer reach so the player can hit their
    // visible body, not just the exact ground point their position is tracked from.
    const aimY = ANIMAL_REAL_HEIGHT[a.type] || 0.4;
    const range = ATTACK_RANGE + (ANIMAL_STATS[a.type].reach||0);
    const dx=a.x-origin.x, dy=(a.y+aimY)-origin.y, dz=a.z-origin.z;
    const dist = Math.hypot(dx,dy,dz);
    if(dist>range || dist>=bestDist) return;
    const dot = (dx/dist)*dir.x + (dy/dist)*dir.y + (dz/dist)*dir.z;
    if(dot>ATTACK_ANGLE_COS){ best = {type:'animal', ref:a}; bestDist = dist; }
  });
  birds.forEach(b=>{
    const dx=b.mesh.position.x-origin.x, dy=(b.mesh.position.y)-origin.y, dz=b.mesh.position.z-origin.z;
    const dist = Math.hypot(dx,dy,dz);
    if(dist>ATTACK_RANGE || dist>=bestDist) return;
    const dot = (dx/dist)*dir.x + (dy/dist)*dir.y + (dz/dist)*dir.z;
    if(dot>ATTACK_ANGLE_COS){ best = {type:'bird', ref:b}; bestDist = dist; }
  });
  fish.forEach(f=>{
    const dx=f.mesh.position.x-origin.x, dy=(f.mesh.position.y)-origin.y, dz=f.mesh.position.z-origin.z;
    const dist = Math.hypot(dx,dy,dz);
    if(dist>ATTACK_RANGE || dist>=bestDist) return;
    const dot = (dx/dist)*dir.x + (dy/dist)*dir.y + (dz/dist)*dir.z;
    if(dot>ATTACK_ANGLE_COS){ best = {type:'fish', ref:f}; bestDist = dist; }
  });
  gophers.forEach(gopher=>{
    const dx=gopher.mesh.position.x-origin.x, dy=(gopher.mesh.position.y)-origin.y, dz=gopher.mesh.position.z-origin.z;
    const dist = Math.hypot(dx,dy,dz);
    if(dist>ATTACK_RANGE || dist>=bestDist) return;
    const dot = (dx/dist)*dir.x + (dy/dist)*dir.y + (dz/dist)*dir.z;
    if(dot>ATTACK_ANGLE_COS){ best = {type:'gopher', ref:gopher}; bestDist = dist; }
  });
  bigEagles.forEach(eagle=>{
    const dx=eagle.mesh.position.x-origin.x, dy=(eagle.mesh.position.y)-origin.y, dz=eagle.mesh.position.z-origin.z;
    const dist = Math.hypot(dx,dy,dz);
    if(dist>ATTACK_RANGE || dist>=bestDist) return;
    const dot = (dx/dist)*dir.x + (dy/dist)*dir.y + (dz/dist)*dir.z;
    if(dot>ATTACK_ANGLE_COS){ best = {type:'bigeagle', ref:eagle}; bestDist = dist; }
  });
  turtles.forEach(turtle=>{
    const dx=turtle.mesh.position.x-origin.x, dy=(turtle.mesh.position.y)-origin.y, dz=turtle.mesh.position.z-origin.z;
    const dist = Math.hypot(dx,dy,dz);
    if(dist>ATTACK_RANGE || dist>=bestDist) return;
    const dot = (dx/dist)*dir.x + (dy/dist)*dir.y + (dz/dist)*dir.z;
    if(dot>ATTACK_ANGLE_COS){ best = {type:'turtle', ref:turtle}; bestDist = dist; }
  });
  return best;
}
// Small songbirds are off-limits to the player entirely — unlike the ground animals' "nudge, not a
// rule" warning (see damageAnimal), which still lets the hit land, this actually blocks the damage
// and just explains why. Big Eagles still hunt them fine (see updateBigEagles/damageBirdOrFish) —
// this only intercepts the player's own tryAttack, not predation between animals.
let lastBirdWarningAt = 0;
const BIRD_WARNING_COOLDOWN_MS = 5000;
function warnBirdProtected(){
  if(Date.now()-lastBirdWarningAt < BIRD_WARNING_COOLDOWN_MS) return;
  lastBirdWarningAt = Date.now();
  addChatMessage('Camp', "🐦 Birds can't be hurt — a real Scout studies wildlife, not hunts it.");
}
let lastPlayerAttack = 0;
function tryAttack(){
  const target = findAttackTarget();
  if(!target) return false;
  const now = performance.now();
  if(now - lastPlayerAttack >= 350){
    lastPlayerAttack = now;
    triggerSwing();
    SFX.swing();
    if(target.type==='bird'){
      warnBirdProtected();
    } else {
      SFX.hitAnimal();
      if(target.type==='animal') damageAnimal(target.ref, PLAYER_ATTACK_DMG);
      else if(target.type==='fish') damageBirdOrFish(target.ref, PLAYER_ATTACK_DMG, 'fish');
      else if(target.type==='gopher') damageGopher(target.ref, PLAYER_ATTACK_DMG);
      else if(target.type==='bigeagle') damageBigEagle(target.ref, PLAYER_ATTACK_DMG);
      else if(target.type==='turtle') damageTurtle(target.ref, PLAYER_ATTACK_DMG);
    }
  }
  return true;
}

let thirdPerson = true;
// Cancels player.yaw's own contribution to the third-person camera's angle while the mouse is
// actively moving, so the camera holds its current view instead of always sitting directly behind
// you — the character (whose own rotation still tracks player.yaw untouched) spins freely in view,
// letting you turn all the way around to see your own face. Once the mouse stops for PEEK_HOLD_S,
// this eases back to 0 at PEEK_EASE_RATE, so the camera catches back up and settles behind you again.
let peekYaw = 0, peekTimer = 0;
const PEEK_HOLD_S = 1.5;
const PEEK_EASE_RATE = 3;
let characterMesh;
let myNameTag;
const myWalkState = { phase:0, amp:0 };
function updateCharacterAnim(dt, moving, sprinting){
  animateWalk(characterMesh, myWalkState, dt, moving, sprinting);
  characterMesh.position.set(player.pos.x, player.pos.y, player.pos.z);
  characterMesh.rotation.y = player.yaw;
  // Cheap third-person "crawling" tell: squash the whole body toward the ground rather than building a
  // separate prone pose. The group's origin is at the feet, so this alone keeps it planted correctly.
  characterMesh.scale.y = player.crawling ? 0.42 : 1;
  updateNameTag(myNameTag, myName, earnedBadges.size);
}

