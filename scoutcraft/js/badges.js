// ---------- badges.js ----------
// Balance constants (HP/hunger/animal stats/real-world scale), merit badges & ranks, Scout progress persistence, badge toasts, checkBadges, the Scout tracker + HUD + rank badge, compass, fishing, archery-shoot, sash UI.
'use strict';

// ---------- Health / combat ----------
const HP_PER_HEART = 2;
const PLAYER_MAX_HP = 10 * HP_PER_HEART; // 10 hearts
const PLAYER_ATTACK_DMG = 2;
const ATTACK_RANGE = 4;
const ATTACK_ANGLE_COS = Math.cos(30 * Math.PI/180);
const AGGRO_RADIUS = 6;
const DEAGGRO_RADIUS = 11;
// How much further (in real 3D distance) a hostile animal can still lunge and land a hit once it's
// physically blocked from walking any closer — see updateAnimal. Keeps a short elevated ledge or a
// couple steps into deeper water from being free, permanent safety, while a large height gap (well up
// a cliff, far out over open water) still keeps a player genuinely out of reach.
const ANIMAL_LUNGE_RANGE = 2.5;
const RETALIATE_MS = 8000;
const FALL_DAMAGE_FREE_BLOCKS = 3; // first 3 blocks of any fall are damage-free, like stepping down normally

// ---------- Hunger ----------
// Mirrors the hearts exactly (10 icons, 2 points each) so it reads as a second, parallel stat rather
// than a differently-scaled bar. Ticks down purely on a real-time clock (no exhaustion-from-activity
// like real Minecraft — simplest version that still makes food a real, recurring need): a full bar
// lasts HUNGER_DECAY_INTERVAL_S * (PLAYER_MAX_HUNGER-1) real seconds, about 19 minutes at the numbers
// below. Passive HP regen (see updatePlayer) stops once hunger hits 0, and staying at 0 starts a slow
// starvation damage tick — same tick/tick-timer shape as the temperature-danger system.
const PLAYER_MAX_HUNGER = 20;
const HUNGER_PER_ICON = 2;
const HUNGER_DECAY_INTERVAL_S = 60; // lose 1 hunger point every real minute
const STARVE_DAMAGE_TICK_S = 4;
const STARVE_DAMAGE = 1;
const MEAT_HUNGER_RESTORE = 4; // 2 icons per piece eaten

// HP is scaled against the 20-HP (10-heart) human baseline to roughly track real-world size/toughness:
// rabbits, squirrels and deer are small and fragile prey; a black bear is a serious tank;
// a moose is the toughest animal in the woods, nearly bear-sized HP with a kick to match.
const ANIMAL_TYPES = ['rabbit','squirrel','deer','bear','moose'];
const ANIMAL_STATS = {
  rabbit:   { maxHp: 1*HP_PER_HEART,  dmg:0, retaliate:false, aggressive:false, speed:1.6, chaseSpeed:1.6, reach:0 },
  squirrel: { maxHp: 1*HP_PER_HEART,  dmg:0, retaliate:false, aggressive:false, speed:1.9, chaseSpeed:1.9, reach:0 },
  deer:   { maxHp: 4*HP_PER_HEART,  dmg:0, retaliate:false, aggressive:false, speed:1.3, chaseSpeed:2.2, reach:0 },
  // chaseSpeed is above WALK_SPEED (5.2) so a charging bear actually catches a player who's just
  // walking away — it was 3.2 (slower than even a walk) before, so it could roar and chase forever
  // without ever closing the gap unless the player stood still. Still below SPRINT_SPEED (8.4), so
  // sprinting away is a real (if risky) way to escape once one's after you.
  bear:   { maxHp: 16*HP_PER_HEART, dmg:5, retaliate:true,  aggressive:true,  speed:0.9, chaseSpeed:6.0, reach:0.6 },
  moose:  { maxHp: 18*HP_PER_HEART, dmg:5, retaliate:true,  aggressive:false, speed:1.0, chaseSpeed:2.8, reach:1.0 },
};

// ---------- Real-world scale ----------
// Each animal's model was originally built at an arbitrary "looks right together" size. These are
// the real shoulder/hip heights in meters — world units are ~1 unit = 1 meter throughout (the
// player is 1.8 units tall). ANIMAL_SCALE is derived once below by comparing this target height
// to each model's original bodyY.
const ANIMAL_REAL_HEIGHT = {
  rabbit: 0.3, squirrel: 0.22, deer: 1.0, bear: 1.0, moose: 2.1,
};
// How much Meat killing each animal drops, non-decreasing with its real size above (squirrel is the
// smallest, moose the biggest) — not a strict formula, just hand-picked round numbers in the same
// order. Birds/fish scale by size too: large flying/aquatic species (eagle, swan, tuna) drop 2.
const MEAT_YIELD = { rabbit:1, squirrel:1, deer:2, bear:3, moose:5,
  robin:1, sparrow:1, blue_jay:1, cardinal:1, crow:2, bluebird:1, finch:1, swallow:1, dove:1, woodpecker:1, owl:2, hawk:2, eagle:2, parrot:1, toucan:1, flamingo:2, hummingbird:1, kingfisher:1, heron:2, pelican:2, seagull:1, magpie:1, raven:2, wren:1, chickadee:1, oriole:1, warbler:1, swan:2, duck:1, goose:2,
  goldfish:1, bass:1, salmon:1, tuna:2, clownfish:1, catfish:1, shark:3, whaleshark:5,
  worm:1, gopher:2, bigeagle:3,
  greenturtle:1, hawksbill:1, loggerhead:2,
};
// Rough horizontal collision radius per species, used for entity-vs-entity collision below.
const ANIMAL_RADIUS = {
  rabbit: 0.18, squirrel: 0.13, deer: 0.4, bear: 0.55, moose: 0.75,
};
// Reproduction mechanics: animals reproduce when two of the same species meet.
// Cooldown is set in real-time ms further below (ANIMAL_REPRODUCE_INTERVAL_MS), once
// DAY_LENGTH_S is defined, since it's expressed as 30 in-game days.
const ANIMAL_REPRODUCE_RANGE = 2.0; // how close animals need to be to reproduce

// ---------- Merit badges ----------
// The scouting layer on top of the sandbox: instead of only building for its own sake, you earn
// badges for doing real scout things, and enough badges promote you through the ranks. Each badge
// is a pure test() over scoutStats, so earning one never depends on *when* the check runs — the
// whole set is re-tested after anything that moves a stat, and again once a second from animate().
const BADGES = [
  { id:'woodcraft',  emoji:'🪵', name:'Woodcraft',    hint:'Gather 25 wood from trees.',                   test:()=> scoutStats.wood >= 25 },
  { id:'pioneering', emoji:'🪢', name:'Pioneering',   hint:'Twist 6 lengths of rope.',                     test:()=> scoutStats.rope >= 6 },
  { id:'firecraft',  emoji:'🔥', name:'Firecraft',    hint:'Light your first campfire.',                   test:()=> scoutStats.campfires >= 1 },
  { id:'camping',    emoji:'⛺',          name:'Camping',      hint:'Pitch a tent.',                                test:()=> scoutStats.tents >= 1 },
  { id:'cooking',    emoji:'🍳', name:'Cooking',      hint:'Cook one dish on every kind of cookware.',     test:()=> scoutStats.cookwareUsed.length >= 5 },
  { id:'navigation', emoji:'🧭', name:'Navigation',   hint:'Take a bearing with your compass.',            test:()=> scoutStats.compassUses >= 1 },
  { id:'hiking',     emoji:'🥾', name:'Hiking',       hint:'Hike 1,000 blocks on foot.',                   test:()=> scoutStats.hiked >= 1000 },
  { id:'swimming',   emoji:'🏊', name:'Swimming',     hint:'Swim 60 blocks.',                              test:()=> scoutStats.swam >= 60 },
  { id:'climbing',   emoji:'🧗', name:'Climbing',     hint:'Get 18 blocks above sea level.',               test:()=> scoutStats.highest >= 18 },
  { id:'nature',     emoji:'🦌', name:'Nature Study', hint:'Study all 5 animals up close — the bear and moose included.', test:()=> scoutStats.species.length >= ANIMAL_TYPES.length },
  { id:'nightwatch', emoji:'🦉', name:'Night Watch',  hint:'Spend 5 minutes outdoors after dark.',         test:()=> scoutStats.nightSeconds >= 300 },
  { id:'firstaid',   emoji:'⛑️',          name:'First Aid',    hint:'Use your First Aid Kit.',                     test:()=> scoutStats.firstAidUses >= 1 },
  { id:'troopflag',  emoji:'🚩', name:'Troop Flag',   hint:'Raise your troop flag at camp.',               test:()=> scoutStats.flags >= 1 },
  { id:'astronomy',  emoji:'⭐', name:'Astronomy',    hint:'Find the Big Dipper and stare at it for 10 seconds.', test:()=> scoutStats.dipperFound },
  { id:'fishing',    emoji:'🎣', name:'Fishing',      hint:'Catch 5 fish.',                                test:()=> scoutStats.fishCaught >= 5 },
  { id:'kayaking',   emoji:'🛶', name:'Kayaking',     hint:'Paddle the lake for 30 seconds.',              test:()=> scoutStats.kayakSeconds >= 30 },
  { id:'horseback',  emoji:'🐴', name:'Horseback Riding', hint:'Ride 200 blocks on horseback.',            test:()=> scoutStats.horsebackBlocks >= HORSEBACK_BADGE_BLOCKS },
  { id:'weather',    emoji:'🌦️', name:'Weather',      hint:'Experience 3 different weather conditions.',   test:()=> scoutStats.weatherSeen.length >= 3 },
  { id:'scuba',      emoji:'🤿', name:'Scuba Diving', hint:'Spend 20 seconds fully underwater.',           test:()=> scoutStats.scubaSeconds >= 20 },
  { id:'camptraditions', emoji:'📜', name:'Citizenship', hint:'Recite the Pledge of Allegiance, the Scout Oath, and the Outdoor Code.', test:()=> scoutStats.recitations.length >= 3 },
  { id:'archery',    emoji:'🏹', name:'Archery',       hint:'Hit the target 5 times at the Archery Range.', test:()=> scoutStats.archeryHits >= ARCHERY_HITS_NEEDED },
  { id:'birdstudy',  emoji:'🦅', name:'Bird Study',    hint:'Look at an eagle and 3 other kinds of birds.', test:()=> (scoutStats.birdsSeen.includes('eagle')||scoutStats.birdsSeen.includes('bigeagle')) && scoutStats.birdsSeen.filter(id=>id!=='eagle'&&id!=='bigeagle').length>=3 },
  { id:'scoutspirit',emoji:'🏅', name:'Scout Spirit', hint:'Find all 12 golden Scout Law boxes hidden around camp.', test:()=> scoutStats.lawsCollected.length >= SCOUT_LAW_POINTS.length },
  { id:'dutytogod',  emoji:'🙏', name:'Duty to God',  hint:'Meditate at the hilltop reflection circle for 30 seconds.', test:()=> scoutStats.meditated },
];
// Ranks are purely derived from how many badges you hold — no separate progression to track. A brand
// new Scout hasn't earned anything yet, so rank starts at "None" rather than jumping straight to
// "Scout" — every other threshold below is just the old numbers shifted up by one to make room for it.
// Eagle Scout doesn't need every badge — real Scouting lets you count some from outside the required
// list, so this is modeled as "more than 3/4 of them" instead of literally all of them, tied to
// BADGES.length (rounded up) rather than a number that would need updating by hand every time a
// badge is added.
const EAGLE_BADGE_FRACTION = 0.75;
const RANKS = [
  { min:0,  name:'None' },
  { min:1,  name:'Scout' },
  { min:2,  name:'Tenderfoot' },
  { min:3,  name:'Second Class' },
  { min:6,  name:'First Class' },
  { min:9,  name:'Star Scout' },
  { min:12, name:'Life Scout' },
  { min: Math.ceil(BADGES.length * EAGLE_BADGE_FRACTION), name:'Eagle Scout' },
];
function rankIndexFor(count){
  let idx = 0;
  for(let i=0;i<RANKS.length;i++) if(count >= RANKS[i].min) idx = i;
  return idx;
}
function rankFor(count){
  return RANKS[rankIndexFor(count)].name;
}

const BADGE_KEY = 'scoutcraft_badges_v1';
const STATS_KEY = 'scoutcraft_stats_v1';
const earnedBadges = new Set();
// species is an array rather than a Set purely so it survives JSON.stringify into localStorage.
const scoutStats = {
  wood:0, rope:0, campfires:0, tents:0, flags:0, compassUses:0,
  hiked:0, swam:0, highest:0, nightSeconds:0, species:[],
  campX:null, campZ:null, dipperFound:false, fishCaught:0, firstAidUses:0, kayakSeconds:0, horsebackBlocks:0, lawsCollected:[], cookwareUsed:[], weatherSeen:[], scubaSeconds:0, recitations:[], archeryHits:0, birdsSeen:[], meditated:false,
};
function saveScoutProgress(){
  try{
    localStorage.setItem(BADGE_KEY, JSON.stringify([...earnedBadges]));
    localStorage.setItem(STATS_KEY, JSON.stringify(scoutStats));
  }catch(e){}
}
function loadScoutProgress(){
  try{
    const b = JSON.parse(localStorage.getItem(BADGE_KEY) || '[]');
    if(Array.isArray(b)) b.forEach(id=> earnedBadges.add(id));
    const st = JSON.parse(localStorage.getItem(STATS_KEY) || '{}');
    if(st && typeof st === 'object'){
      for(const k in scoutStats) if(k in st) scoutStats[k] = st[k];
      if(!Array.isArray(scoutStats.species)) scoutStats.species = [];
      if(!Array.isArray(scoutStats.lawsCollected)) scoutStats.lawsCollected = [];
      if(!Array.isArray(scoutStats.cookwareUsed)) scoutStats.cookwareUsed = [];
      if(!Array.isArray(scoutStats.weatherSeen)) scoutStats.weatherSeen = [];
      if(!Array.isArray(scoutStats.recitations)) scoutStats.recitations = [];
      if(!Array.isArray(scoutStats.birdsSeen)) scoutStats.birdsSeen = [];
    }
  }catch(e){}
}
loadScoutProgress();

// A badge announcement, queued so earning two at once doesn't overwrite the first one's toast.
const badgeToastQueue = [];
let badgeToastTimer = 0;
function showBadgeToast(badge, newRank){
  badgeToastQueue.push({ badge, newRank });
}
function pumpBadgeToast(dt){
  const el = document.getElementById('badgeToast');
  if(!el) return;
  if(badgeToastTimer > 0){
    badgeToastTimer -= dt;
    if(badgeToastTimer <= 0) el.hidden = true;
    return;
  }
  const next = badgeToastQueue.shift();
  if(!next) return;
  el.innerHTML = `<span class="bt-emoji">${next.badge.emoji}</span>` +
    `<span class="bt-text"><b>Merit badge earned — ${next.badge.name}</b>` +
    (next.newRank ? `<span class="bt-rank">You are now a ${next.newRank}!</span>` : `<span class="bt-rank">${next.badge.hint}</span>`) +
    `</span>`;
  el.hidden = false;
  badgeToastTimer = 4.5;
}

function checkBadges(){
  const before = earnedBadges.size;
  let awarded = null;
  for(const b of BADGES){
    if(earnedBadges.has(b.id)) continue;
    let pass = false;
    try{ pass = !!b.test(); }catch(e){ pass = false; }
    if(pass){
      earnedBadges.add(b.id);
      awarded = b;
      const rankBefore = rankFor(earnedBadges.size - 1);
      const rankAfter = rankFor(earnedBadges.size);
      showBadgeToast(b, rankAfter !== rankBefore ? rankAfter : null);
    }
  }
  if(earnedBadges.size !== before){
    if(typeof SFX !== 'undefined' && SFX.badge) SFX.badge();
    saveScoutProgress();
    updateScoutHUD();
    if(sashOpen) renderSash();
  }
  return awarded;
}

// One place for "a stat changed" so every call site is a one-liner.
const Scout = {
  bump(key, by){
    if(typeof scoutStats[key] !== 'number') return;
    scoutStats[key] += (by==null ? 1 : by);
    checkBadges();
  },
  // Called from invAdd, so it catches wood chopped out of a tree and rope twisted at the table alike.
  gained(id, n){
    if(id===WOOD) scoutStats.wood += n;
    else if(id===ROPE) scoutStats.rope += n;
    else return;
    checkBadges();
  },
  // Called after a block is actually placed in the world.
  placed(id, x, z){
    if(id===CAMPFIRE){
      scoutStats.campfires++;
      // Your first campfire *is* your camp — the compass homes on it from then on.
      if(scoutStats.campX==null){ scoutStats.campX = x; scoutStats.campZ = z; }
    }
    else if(id===TENT) scoutStats.tents++;
    else if(id===FLAG) scoutStats.flags++;
    else return;
    saveScoutProgress();
    checkBadges();
  },
  sawSpecies(name){
    if(!name || scoutStats.species.includes(name)) return;
    scoutStats.species.push(name);
    checkBadges();
  },
  cookedOn(wareKey){
    if(scoutStats.cookwareUsed.includes(wareKey)) return;
    scoutStats.cookwareUsed.push(wareKey);
    saveScoutProgress();
    checkBadges();
  },
  sawWeather(label){
    if(!label || scoutStats.weatherSeen.includes(label)) return;
    scoutStats.weatherSeen.push(label);
    saveScoutProgress();
    checkBadges();
  },
  foundDipper(){
    if(scoutStats.dipperFound) return;
    scoutStats.dipperFound = true;
    saveScoutProgress();
    checkBadges();
  },
  recited(name){
    if(!name || scoutStats.recitations.includes(name)) return;
    scoutStats.recitations.push(name);
    saveScoutProgress();
    checkBadges();
  },
  sawBird(speciesId){
    if(!speciesId || scoutStats.birdsSeen.includes(speciesId)) return;
    scoutStats.birdsSeen.push(speciesId);
    saveScoutProgress();
    checkBadges();
  },
  meditated(){
    if(scoutStats.meditated) return;
    scoutStats.meditated = true;
    saveScoutProgress();
    checkBadges();
  },
};

// ---- Continuous tracking (distance, altitude, night time, wildlife) ----
let scoutLastX = null, scoutLastZ = null;
let scoutSpeciesScanTimer = 0;
let scoutSaveTimer = 0;
let dipperGazeTimer = 0, dipperGraceTimer = 0;
let meditateTimer = 0, meditateGraceTimer = 0, nearAltar = false;
// Night, for badge purposes, is the part of the cycle with no sun at all (see DAY_KEYFRAMES:
// sunI is 0 from 0.80 through sunrise at 0.25).
function isScoutNight(){
  const t = currentDayTime();
  return t < 0.24 || t > 0.79;
}
// How close you have to get to an animal for it to count as studied.
const SPOT_RANGE = 9;
// Bird Study: how far away, and how tightly centered in view, a bird has to be to count as "looked
// at" — birds are small and constantly moving, so this cone is deliberately more forgiving than a
// precise aim would need.
const BIRD_SIGHT_RANGE = 40;
const BIRD_SIGHT_COS = Math.cos(20 * Math.PI/180);
function updateScout(dt){
  pumpBadgeToast(dt);
  // Nothing counts while you're sitting on the start screen or a panel — badges are for playing.
  if(!locked || isDead){ scoutLastX = null; scoutLastZ = null; dipperGazeTimer = 0; dipperGraceTimer = 0; meditateTimer = 0; meditateGraceTimer = 0; nearAltar = false; return; }

  // Distance travelled, split between hiking and swimming.
  if(scoutLastX != null){
    const d = Math.hypot(player.pos.x - scoutLastX, player.pos.z - scoutLastZ);
    // Ignore teleport-sized jumps (a respawn, or a position restored from a save).
    if(d < 2){
      if(player.inWater) scoutStats.swam += d;
      else scoutStats.hiked += d;
    }
  }
  scoutLastX = player.pos.x; scoutLastZ = player.pos.z;

  const above = player.pos.y - SEA_LEVEL;
  if(above > scoutStats.highest) scoutStats.highest = above;

  if(isScoutNight()) scoutStats.nightSeconds += dt;
  if(player.inKayak) scoutStats.kayakSeconds += dt;
  if(isHeadUnderwater()) scoutStats.scubaSeconds += dt;

  // Astronomy: keep the Big Dipper roughly in view, at night, for 10 seconds of attention. A brief
  // glance away (mouse drift, checking your footing) doesn't wipe the streak — only DIPPER_GAZE_GRACE_S
  // of genuinely looking elsewhere does, so this rewards "mostly watching it" rather than a pixel-
  // perfect, unblinking hold.
  if(isScoutNight() && getLookDir(player.yaw, player.pitch).dot(BIG_DIPPER_DIR) > DIPPER_GAZE_COS){
    dipperGazeTimer += dt;
    dipperGraceTimer = DIPPER_GAZE_GRACE_S;
    if(dipperGazeTimer >= DIPPER_GAZE_SECONDS) Scout.foundDipper();
  } else {
    dipperGraceTimer -= dt;
    if(dipperGraceTimer <= 0) dipperGazeTimer = 0;
  }

  // Duty to God: sit at the hilltop reflection circle for a continuous 30 seconds. Same forgiving
  // "brief interruption doesn't wipe the streak" shape as the Astronomy gaze above — stepping half
  // off the platform for a moment doesn't reset it, only actually walking away for
  // MEDITATE_GRACE_S does.
  if(altarStandPos){
    const dx = altarStandPos.x-player.pos.x, dy = altarStandPos.y-(player.pos.y+player.eye), dz = altarStandPos.z-player.pos.z;
    nearAltar = Math.hypot(dx,dy,dz) <= MEDITATE_RADIUS;
  }
  if(nearAltar){
    meditateTimer += dt;
    meditateGraceTimer = MEDITATE_GRACE_S;
    if(meditateTimer >= MEDITATE_SECONDS) Scout.meditated();
  } else {
    meditateGraceTimer -= dt;
    if(meditateGraceTimer <= 0) meditateTimer = 0;
  }

  // Nature study: what's within sight right now. Twice a second is plenty and keeps this off the
  // per-frame budget.
  scoutSpeciesScanTimer -= dt;
  if(scoutSpeciesScanTimer <= 0){
    scoutSpeciesScanTimer = 0.5;
    const px = player.pos.x, py = player.pos.y, pz = player.pos.z;
    if(typeof animals !== 'undefined'){
      for(const a of animals){
        if(Math.hypot(a.x-px, a.y-py, a.z-pz) <= SPOT_RANGE) Scout.sawSpecies(a.type);
      }
    }
    // Bird Study: unlike Nature Study above, this needs the player actually looking toward the bird
    // (a generous ~40-degree cone, since they're small and constantly moving), not just anywhere
    // within earshot — unlike Astronomy's Big Dipper gaze, one glance is enough, no held timer.
    const lookDir = getLookDir(player.yaw, player.pitch);
    const scanFlock = (flock) => {
      for(const b of flock){
        const dx=b.mesh.position.x-px, dy=b.mesh.position.y-py, dz=b.mesh.position.z-pz;
        const dist = Math.hypot(dx,dy,dz);
        if(dist>0.5 && dist<=BIRD_SIGHT_RANGE && (dx*lookDir.x+dy*lookDir.y+dz*lookDir.z)/dist > BIRD_SIGHT_COS) Scout.sawBird(b.species.id);
      }
    };
    if(typeof birds !== 'undefined') scanFlock(birds);
    if(typeof bigEagles !== 'undefined') scanFlock(bigEagles);
    checkBadges();
  }

  // Distance/altitude/night badges are checked on the same cheap cadence rather than every frame.
  scoutSaveTimer -= dt;
  if(scoutSaveTimer <= 0){
    scoutSaveTimer = 1;
    checkBadges();
    updateScoutHUD();
    saveScoutProgress();
  }
}

function updateScoutHUD(){
  const c = document.getElementById('badgeCount');
  if(c) c.textContent = `${earnedBadges.size}/${BADGES.length}`;
  const r = document.getElementById('rankLabel');
  if(r) r.textContent = rankFor(earnedBadges.size);
  updateCharacterRankBadge();
}
// Re-draws the shirt's left-pocket rank badge only when the rank itself actually changed — called
// every time updateScoutHUD is (i.e. whenever the earned badge count changes), same trigger the sash
// and name tag refresh on.
function updateCharacterRankBadge(){
  const u = characterMesh && characterMesh.userData.uniform;
  if(!u) return;
  const idx = rankIndexFor(earnedBadges.size);
  if(u.lastRankIndex === idx) return;
  u.lastRankIndex = idx;
  u.shirtFrontMat.map = buildShirtFrontTexture(idx);
  u.shirtFrontMat.needsUpdate = true;
}

// ---- The compass: how far, and in which direction, camp is ----
const COMPASS_POINTS = ['N','NNE','NE','ENE','E','ESE','SE','SSE','S','SSW','SW','WSW','W','WNW','NW','NNW'];
function bearingName(dx, dz){
  // -z is north in this world (the minimap and the sun both assume it), so a bearing measured
  // clockwise from north is atan2(dx, -dz).
  let deg = Math.atan2(dx, -dz) * 180/Math.PI;
  if(deg < 0) deg += 360;
  return COMPASS_POINTS[Math.round(deg/22.5) % 16];
}
function useCompass(){
  const hasCamp = scoutStats.campX != null;
  const tx = hasCamp ? scoutStats.campX + 0.5 : WORLD_SIZE/2;
  const tz = hasCamp ? scoutStats.campZ + 0.5 : WORLD_SIZE/2;
  const dx = tx - player.pos.x, dz = tz - player.pos.z;
  const dist = Math.hypot(dx, dz);
  const where = hasCamp ? 'Camp' : 'World centre';
  const msg = dist < 4
    ? `🧭 ${where}: you're here.`
    : `🧭 ${where}: ${Math.round(dist)} blocks ${bearingName(dx,dz)}.`;
  addChatMessage('Camp', msg);
  Scout.bump('compassUses');
  saveScoutProgress();
}

// ---- Fishing: cast into water that has a fish nearby, then hold still for FISHING_HOLD_SECONDS ----
const FISHING_HOLD_SECONDS = 20;
const FISHING_FISH_RADIUS = 6;   // how close a live fish needs to be to the cast spot to bite at all
const FISHING_MAX_DRIFT = 1.5;   // wander further than this from where you cast and you lose the line
let fishingSpot = null; // {startX, startZ} of the player when the line went in, or null when not fishing
let fishingTimer = 0;
// A dedicated raycast rather than the shared raycastBlock(), which deliberately treats WATER as
// see-through (same as AIR) for break/place purposes — so it always reports whatever's under or past
// the water, never the water itself. This one stops at the first WATER voxel instead, and gives up if
// it hits solid ground first without ever passing through any.
function raycastWater(maxDist=8, step=0.05){
  const dir = getLookDir(player.yaw, player.pitch);
  const origin = camera.position;
  for(let t=0; t<maxDist; t+=step){
    const bx = Math.floor(origin.x+dir.x*t), by = Math.floor(origin.y+dir.y*t), bz = Math.floor(origin.z+dir.z*t);
    const b = getBlock(bx,by,bz);
    if(b===WATER) return {x:bx, y:by, z:bz};
    if(b!==AIR) return null;
  }
  return null;
}
function nearbyFish(x,y,z,radius){
  const r2 = radius*radius;
  for(const f of fish){
    if(!f.hasHome || !f.mesh.visible) continue;
    const dx=f.mesh.position.x-x, dy=f.mesh.position.y-y, dz=f.mesh.position.z-z;
    if(dx*dx+dy*dy+dz*dz <= r2) return true;
  }
  return false;
}
function tryFish(){
  if(fishingSpot){
    addChatMessage('Camp', '🎣 You reel your line back in.');
    fishingSpot = null; fishingTimer = 0;
    return;
  }
  const spot = raycastWater();
  if(!spot){
    addChatMessage('Camp', '🎣 Aim at some water to cast your line.');
    return;
  }
  if(!nearbyFish(spot.x+0.5, spot.y+0.5, spot.z+0.5, FISHING_FISH_RADIUS)){
    addChatMessage('Camp', "🎣 No fish are biting here — try a different spot.");
    return;
  }
  fishingSpot = { startX: player.pos.x, startZ: player.pos.z };
  fishingTimer = 0;
  SFX.placeBlock();
  addChatMessage('Camp', '🎣 You cast your line. Hold steady...');
}
function updateFishing(dt){
  if(!fishingSpot) return;
  // These two used to reset the line with no message at all — indistinguishable from a catch simply
  // never landing. Opening any panel (the Badges screen included, the obvious thing to check while
  // waiting out the 20-second hold) or swapping off the Fishing Pole both silently broke the line.
  if(!locked || isDead){
    if(!isDead) addChatMessage('Camp', '🎣 You lost your line.');
    fishingSpot = null; fishingTimer = 0;
    return;
  }
  if(HOTBAR[selectedSlot] !== FISHING_POLE){
    addChatMessage('Camp', '🎣 You lost your line.');
    fishingSpot = null; fishingTimer = 0;
    return;
  }
  if(keys['KeyW']||keys['KeyA']||keys['KeyS']||keys['KeyD']){
    addChatMessage('Camp', '🎣 You moved and lost your line.');
    fishingSpot = null; fishingTimer = 0;
    return;
  }
  const moved = Math.hypot(player.pos.x-fishingSpot.startX, player.pos.z-fishingSpot.startZ);
  if(moved > FISHING_MAX_DRIFT){
    addChatMessage('Camp', '🎣 You wandered off and lost your line.');
    fishingSpot = null; fishingTimer = 0;
    return;
  }
  fishingTimer += dt;
  if(fishingTimer >= FISHING_HOLD_SECONDS){
    invAdd(FISH, 1);
    saveInventory();
    updateHotbarUI();
    Scout.bump('fishCaught');
    saveScoutProgress();
    SFX.craft();
    addChatMessage('Camp', '🐟 You caught a fish!');
    fishingSpot = null; fishingTimer = 0;
  }
}

// ---- Archery: right-click a Bow to loose an arrow, but only from inside the Archery Range (see
// inArcheryRange/buildArcheryRange) — anywhere else it's just a chat reminder, no arrow fired. ----
const ARROW_SPEED = 26;
const ARROW_GRAVITY = -2.5; // gentle enough that a level shot at the range's real distances still lands on a 2-tall target
const ARROW_MAX_LIFE_S = 2.5; // fizzles out on its own if it somehow never hits anything
const ARCHERY_HITS_NEEDED = 5;
const arrows = []; // {mesh, x,y,z, vx,vy,vz, life}
// Box-composition build like the rest of this file's props: a thin shaft, a dark tip, and two
// crossed fletching vanes at the tail so it reads as an arrow from any angle, not just side-on.
function buildArrowMesh(){
  const g = new THREE.Group();
  const shaftMat = new THREE.MeshLambertMaterial({ color: 0x8a6a3a });
  const tipMat = new THREE.MeshLambertMaterial({ color: 0x5c5f66 });
  const fletchMat = new THREE.MeshLambertMaterial({ color: 0xe8e4d8 });
  g.add(animalBox(0.04, 0.04, 0.6, shaftMat));
  const tip = animalBox(0.06, 0.06, 0.12, tipMat);
  tip.position.z = -0.36;
  g.add(tip);
  for(const rot of [0, Math.PI/2]){
    const fletch = animalBox(0.14, 0.02, 0.12, fletchMat);
    fletch.position.z = 0.26;
    fletch.rotation.z = rot;
    g.add(fletch);
  }
  return g;
}
function tryShootBow(){
  if(!inArcheryRange(Math.floor(player.pos.x), Math.floor(player.pos.z))){
    addChatMessage('Camp', '🏹 You can only shoot at the Archery Range.');
    return;
  }
  const dir = getLookDir(player.yaw, player.pitch);
  const mesh = buildArrowMesh();
  mesh.position.copy(camera.position);
  scene.add(mesh);
  arrows.push({
    mesh, x:camera.position.x, y:camera.position.y, z:camera.position.z,
    vx: dir.x*ARROW_SPEED, vy: dir.y*ARROW_SPEED, vz: dir.z*ARROW_SPEED,
    life: 0,
  });
  SFX.bowShoot();
}
function updateArrows(dt){
  for(let i=arrows.length-1; i>=0; i--){
    const ar = arrows[i];
    ar.life += dt;
    ar.vy += ARROW_GRAVITY*dt;
    ar.x += ar.vx*dt; ar.y += ar.vy*dt; ar.z += ar.vz*dt;
    ar.mesh.position.set(ar.x, ar.y, ar.z);
    const speed = Math.hypot(ar.vx, ar.vy, ar.vz);
    if(speed>0.01){
      ar.mesh.rotation.y = Math.atan2(-ar.vx, -ar.vz);
      ar.mesh.rotation.x = Math.asin(Math.max(-1, Math.min(1, ar.vy/speed)));
    }
    const blockHit = getBlock(Math.floor(ar.x), Math.floor(ar.y), Math.floor(ar.z));
    if(blockHit===ARCHERY_TARGET){
      scene.remove(ar.mesh);
      arrows.splice(i,1);
      Scout.bump('archeryHits');
      saveScoutProgress();
      SFX.bowHit();
      addChatMessage('Camp', `🎯 Bullseye! (${Math.min(scoutStats.archeryHits,ARCHERY_HITS_NEEDED)}/${ARCHERY_HITS_NEEDED})`);
    } else if(blockHit!==AIR && blockHit!==WATER){
      scene.remove(ar.mesh);
      arrows.splice(i,1);
    } else if(ar.life > ARROW_MAX_LIFE_S){
      scene.remove(ar.mesh);
      arrows.splice(i,1);
    }
  }
}

// ---- The sash: every badge, earned and still to earn ----
let sashOpen = false;
function openSash(){
  sashOpen = true;
  const modal = document.getElementById('sashModal');
  if(modal) modal.hidden = false;
  if(document.pointerLockElement) document.exitPointerLock();
  if(isTouchDevice) locked = false;
  overlay.hidden = true;
  renderSash();
}
function closeSash(relock){
  sashOpen = false;
  const modal = document.getElementById('sashModal');
  if(modal) modal.hidden = true;
  if(relock){
    if(isTouchDevice) locked = true;
    else document.body.requestPointerLock();
  } else if(!isTouchDevice) overlay.hidden = false;
}
// How far along an unearned badge is, as a "3 / 25" style line — much more motivating than a
// flat "not yet".
function badgeProgress(b){
  const p = {
    woodcraft:  ()=> [Math.floor(scoutStats.wood), 25, 'wood'],
    pioneering: ()=> [Math.floor(scoutStats.rope), 6, 'rope'],
    firecraft:  ()=> [scoutStats.campfires, 1, 'campfires'],
    camping:    ()=> [scoutStats.tents, 1, 'tents'],
    cooking:    ()=> [scoutStats.cookwareUsed.length, 5, 'cookware'],
    navigation: ()=> [scoutStats.compassUses, 1, 'bearings'],
    hiking:     ()=> [Math.floor(scoutStats.hiked), 1000, 'blocks'],
    swimming:   ()=> [Math.floor(scoutStats.swam), 60, 'blocks'],
    climbing:   ()=> [Math.max(0,Math.floor(scoutStats.highest)), 18, 'blocks up'],
    nature:     ()=> [scoutStats.species.length, ANIMAL_TYPES.length, 'animals'],
    nightwatch: ()=> [Math.floor(scoutStats.nightSeconds), 300, 'seconds'],
    firstaid:   ()=> [scoutStats.firstAidUses, 1, 'uses'],
    troopflag:  ()=> [scoutStats.flags, 1, 'flags'],
    astronomy:  ()=> [scoutStats.dipperFound?1:0, 1, 'found'],
    fishing:    ()=> [scoutStats.fishCaught, 5, 'fish'],
    kayaking:   ()=> [Math.floor(scoutStats.kayakSeconds), 30, 'seconds'],
    horseback:  ()=> [Math.floor(scoutStats.horsebackBlocks), HORSEBACK_BADGE_BLOCKS, 'blocks'],
    weather:    ()=> [scoutStats.weatherSeen.length, 3, 'conditions'],
    scuba:      ()=> [Math.floor(scoutStats.scubaSeconds), 20, 'seconds'],
    camptraditions: ()=> [scoutStats.recitations.length, 3, 'recitations'],
    archery:    ()=> [scoutStats.archeryHits, ARCHERY_HITS_NEEDED, 'hits'],
    // Simplified to just the "3 other kinds" half of the requirement — the eagle sighting itself is
    // one-time/binary and already spelled out in the hint text above.
    birdstudy:  ()=> [scoutStats.birdsSeen.filter(id=>id!=='eagle'&&id!=='bigeagle').length, 3, 'other birds'],
    scoutspirit:()=> [scoutStats.lawsCollected.length, SCOUT_LAW_POINTS.length, 'boxes'],
  }[b.id];
  if(!p) return null;
  const [have, need, unit] = p();
  return { have: Math.min(have, need), need, unit };
}
function renderSash(){
  const grid = document.getElementById('sashGrid');
  if(!grid) return;
  const rankEl = document.getElementById('sashRank');
  if(rankEl){
    const next = RANKS.find(r => r.min > earnedBadges.size);
    // Eagle only needs EAGLE_BADGE_FRACTION of the badges now, not literally all of them, so reaching
    // it (the last rank with no "next") doesn't necessarily mean every badge is earned anymore —
    // check that separately rather than assuming the two are still the same thing.
    rankEl.textContent = next
      ? `${rankFor(earnedBadges.size)} — ${next.min - earnedBadges.size} more badge${next.min-earnedBadges.size===1?'':'s'} to ${next.name}`
      : (earnedBadges.size >= BADGES.length ? `${rankFor(earnedBadges.size)} — every badge earned!` : `${rankFor(earnedBadges.size)} — the highest rank!`);
  }
  const countEl = document.getElementById('sashCount');
  if(countEl) countEl.textContent = `${earnedBadges.size} of ${BADGES.length}`;
  grid.innerHTML = '';
  for(const b of BADGES){
    const got = earnedBadges.has(b.id);
    const tile = document.createElement('div');
    tile.className = 'badgeTile' + (got ? ' earned' : '');
    const prog = got ? null : badgeProgress(b);
    tile.innerHTML =
      `<div class="badgeEmoji">${b.emoji}</div>` +
      `<div class="badgeName">${b.name}</div>` +
      `<div class="badgeHint">${got ? 'Earned' : b.hint}</div>` +
      (prog ? `<div class="badgeBar"><span style="width:${Math.round(prog.have/prog.need*100)}%"></span></div>` +
              `<div class="badgeProg">${prog.have} / ${prog.need} ${prog.unit}</div>` : '');
    grid.appendChild(tile);
  }
}

