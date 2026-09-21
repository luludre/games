// ---------- sky-weather.js ----------
// Day/night cycle, calendar, sun/moon/shadows, stars + Big Dipper, weather, seasons/temperature, wind, rain, lightning, scuba view.
'use strict';

// ---------- Day/night cycle ----------
// dayTime (0..1) is derived straight from the wall clock rather than accumulated frame-by-frame, so
// every client (and a fresh page reload) is automatically on the same clock with no syncing needed.
// 0 = midnight, 0.25 = sunrise, 0.5 = noon, 0.75 = sunset.
const DAY_LENGTH_S = 3600; // 1 real hour per full day/night cycle
// Animal reproduction cooldown (see ANIMAL_REPRODUCE_RANGE above): 30 in-game days.
const ANIMAL_REPRODUCE_INTERVAL_MS = 30 * DAY_LENGTH_S * 1000;
const DAY_KEYFRAMES = [
  { t:0.00, sky:0x05070f, hemi:0.22, sunI:0.00, sunC:0x223355 },
  { t:0.20, sky:0x0d1330, hemi:0.25, sunI:0.00, sunC:0x223355 },
  { t:0.25, sky:0xff9a56, hemi:0.55, sunI:0.55, sunC:0xffb066 },
  { t:0.32, sky:0x8fd0ee, hemi:0.90, sunI:0.80, sunC:0xffffff },
  { t:0.68, sky:0x8fd0ee, hemi:0.90, sunI:0.80, sunC:0xffffff },
  { t:0.75, sky:0xff7f50, hemi:0.55, sunI:0.50, sunC:0xff8c50 },
  { t:0.80, sky:0x0d1330, hemi:0.25, sunI:0.00, sunC:0x223355 },
  { t:1.00, sky:0x05070f, hemi:0.22, sunI:0.00, sunC:0x223355 },
];
function lerpColorHex(a,b,t){
  const ar=(a>>16)&255, ag=(a>>8)&255, ab=a&255;
  const br=(b>>16)&255, bg=(b>>8)&255, bb=b&255;
  return (Math.round(ar+(br-ar)*t)<<16) | (Math.round(ag+(bg-ag)*t)<<8) | Math.round(ab+(bb-ab)*t);
}
// 'regular' (the normal wall-clock cycle), 'day' (frozen at noon), 'night' (frozen at midnight) — all
// three toggled with N (see the keydown handler) — or a raw number in [0,1) forcing one exact moment
// (waking up from sleep lands on 7am, i.e. 7/24, rather than either of the N-cycle's two fixed spots).
// Every consumer of currentDayTime() — sky/lighting, the sun/moon, the temperature swing, firefly
// night visibility, and the HH:MM World Time HUD label — reads it through this one function, so
// forcing it here is enough to make all of them agree.
let timeMode = 'regular';
function currentDayTime(){
  if(typeof timeMode === 'number') return timeMode;
  if(timeMode==='day') return 0.5;
  if(timeMode==='night') return 0;
  return (Date.now()/1000 % DAY_LENGTH_S) / DAY_LENGTH_S;
}
function setTimeMode(mode){
  timeMode = mode;
  const el = document.getElementById('timeModeLabel');
  if(el) el.textContent = mode==='day' ? ' ☀️ forced day' : mode==='night' ? ' 🌙 forced night' : (typeof mode==='number' ? ' ☀️ forced morning' : '');
}
function cycleTimeMode(){
  setTimeMode(timeMode==='regular' ? 'day' : timeMode==='day' ? 'night' : 'regular');
}

// ---------- Calendar: Year/Month/Day, anchored to a specific real-world instant ----------
// A parallel, purely cosmetic calendar for the HUD date — it doesn't feed into season/temperature/
// weather at all (those keep their own independent wall-clock cycle). 2026-09-06 08:00 PDT is fixed
// as the start of Year 0, Jan 1; every real hour after that is one month (matching the existing
// season length of 3 hours = 3 months), and each month is a nominal 30 "days" so the date visibly
// ticks forward (one every 2 real minutes) instead of sitting on "Day 1" for the whole month.
const CALENDAR_EPOCH_MS = Date.UTC(2026, 8, 6, 15, 0, 0); // 2026-09-06 08:00 PDT (UTC-7) == 15:00 UTC
const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const MONTH_LENGTH_S = 3600;                // 1 real hour per month
const CALENDAR_DAY_S = MONTH_LENGTH_S / 30;  // a nominal 30-day month
function currentCalendarDate(){
  const elapsedS = (Date.now() - CALENDAR_EPOCH_MS) / 1000;
  const totalMonths = Math.floor(elapsedS / MONTH_LENGTH_S);
  const year = Math.floor(totalMonths / 12);
  let monthIdx = totalMonths % 12;
  if(monthIdx < 0) monthIdx += 12;
  const intoMonthS = elapsedS - totalMonths*MONTH_LENGTH_S;
  const day = 1 + Math.floor(intoMonthS / CALENDAR_DAY_S);
  return { year, month: MONTH_NAMES[monthIdx], day };
}

// ---------- Sun, moon & shadows ----------
// Both bodies are billboard sprites riding the same day-time angle the lighting already uses, at a
// large fixed radius so they read as distant sky objects. The DirectionalLight's actual position
// (used for both lighting direction and its shadow camera) is kept at that same angle/height but
// re-centered on the PLAYER every frame — shadows only need to be correct near you, and a shadow
// camera that follows you can use a small, sharp frustum instead of trying to cover the whole world.
const SUN_ORBIT_R = 150;
const SHADOW_RADIUS = 32;
const SYNODIC_MONTH_DAYS = 29.530588; // real lunar month length
let sunSprite, moonSprite, moonBaseCanvas, moonBaseImageData, moonPhaseCanvas;
let lastMoonPhaseKey = null;
function buildGlowSpriteTexture(stops){
  const S = 64;
  const canvas = document.createElement('canvas');
  canvas.width=S; canvas.height=S;
  const ctx = canvas.getContext('2d');
  const grad = ctx.createRadialGradient(S/2,S/2,0, S/2,S/2,S/2);
  stops.forEach(([off,color])=> grad.addColorStop(off,color));
  ctx.fillStyle = grad;
  ctx.fillRect(0,0,S,S);
  return new THREE.CanvasTexture(canvas);
}
function buildMoonBaseCanvas(){
  const S = 64;
  const canvas = document.createElement('canvas');
  canvas.width=S; canvas.height=S;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#d8d4c8';
  ctx.beginPath(); ctx.arc(S/2,S/2,S/2-1,0,Math.PI*2); ctx.fill();
  for(let i=0;i<8;i++){
    const cx=S*0.2+Math.random()*S*0.6, cy=S*0.2+Math.random()*S*0.6;
    const r=S*(0.04+Math.random()*0.07);
    if(Math.hypot(cx-S/2,cy-S/2)>S/2-r) continue;
    ctx.fillStyle='rgba(140,138,125,0.5)';
    ctx.beginPath(); ctx.arc(cx,cy,r,0,Math.PI*2); ctx.fill();
  }
  return canvas;
}
// Per-pixel sphere-lighting test (not canvas path arcs — much easier to get exactly right): a point
// on the visible hemisphere is lit if it faces the phase's implied light direction. theta=0 -> new
// moon (light from directly behind, as seen by us), theta=PI -> full (light from directly in front).
function buildMoonPhaseCanvas(phase01){
  const S = moonBaseCanvas.width;
  const canvas = document.createElement('canvas');
  canvas.width=S; canvas.height=S;
  const ctx = canvas.getContext('2d');
  const out = ctx.createImageData(S,S);
  const theta = phase01*Math.PI*2;
  const sinT = Math.sin(theta), cosT = Math.cos(theta);
  const cx=S/2, cy=S/2, r=S/2-1;
  const base = moonBaseImageData.data;
  for(let y=0;y<S;y++){
    for(let x=0;x<S;x++){
      const i=(y*S+x)*4;
      const nx=(x-cx)/r, ny=(y-cy)/r;
      const d2=nx*nx+ny*ny;
      if(d2>1){ out.data[i+3]=0; continue; }
      const nz = Math.sqrt(1-d2);
      const lit = (nx*sinT - nz*cosT) > 0;
      let br=base[i], bg=base[i+1], bb=base[i+2];
      if(!lit){ br*=0.12; bg*=0.12; bb*=0.18; }
      out.data[i]=br; out.data[i+1]=bg; out.data[i+2]=bb; out.data[i+3]=base[i+3];
    }
  }
  ctx.putImageData(out,0,0);
  return canvas;
}
function currentMoonPhase(){
  // 0 = new, 0.5 = full, cyclical. CALENDAR_EPOCH_MS is anchored to a full moon (see the calendar
  // section above), so phase = 0.5 exactly at that instant, moving in real elapsed days regardless
  // of the game's own compressed day/night or calendar speed.
  const elapsedDays = (Date.now() - CALENDAR_EPOCH_MS) / 86400000;
  let f = (0.5 + elapsedDays / SYNODIC_MONTH_DAYS) % 1;
  if(f < 0) f += 1;
  return f;
}
function buildCelestialBodies(){
  const sunTex = buildGlowSpriteTexture([[0,'rgba(255,255,230,1)'],[0.5,'rgba(255,235,150,0.95)'],[1,'rgba(255,200,80,0)']]);
  sunSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map:sunTex, transparent:true, depthWrite:false, depthTest:false }));
  sunSprite.scale.set(28,28,1);
  sunSprite.renderOrder = -1;
  scene.add(sunSprite);

  moonBaseCanvas = buildMoonBaseCanvas();
  moonBaseImageData = moonBaseCanvas.getContext('2d').getImageData(0,0,moonBaseCanvas.width,moonBaseCanvas.height);
  const moonMat = new THREE.SpriteMaterial({ transparent:true, depthWrite:false, depthTest:false });
  moonSprite = new THREE.Sprite(moonMat);
  moonSprite.scale.set(20,20,1);
  moonSprite.renderOrder = -1;
  scene.add(moonSprite);
}
// +X is East, -X is West (matching the usual Minecraft-style convention) — both bodies ride a single
// vertical east-west plane through the player rather than a full horizontal circle, so "rise due east,
// climb overhead, set due west" is actually true instead of the sun also drifting through a third,
// unlabeled compass point at solar noon.
function updateCelestialBodies(dayTime){
  const theta = dayTime*Math.PI*2;
  const sunHeight = -Math.cos(theta); // unclamped: true rise/set through the horizon
  const sunX = Math.sin(theta);       // +1 (east) at sunrise, 0 (overhead) at noon, -1 (west) at sunset
  sunSprite.position.set(player.pos.x+sunX*SUN_ORBIT_R, player.pos.y+sunHeight*SUN_ORBIT_R*0.6+20, player.pos.z);
  sunSprite.visible = sunHeight > -0.06;

  // The moon sits opposite the sun (rises as the sun sets) and its own arc uses the same sunHeight
  // shape mirrored, so it's up for the night half of the cycle and below the horizon during the day.
  // Negating sunX doesn't reverse its direction of travel — it's the same east-west sine curve, just
  // running exactly half a cycle out of phase — so the moon crosses east-to-west too, same as the sun.
  const moonHeight = -sunHeight;
  const moonX = -sunX;
  moonSprite.position.set(player.pos.x+moonX*SUN_ORBIT_R, player.pos.y+moonHeight*SUN_ORBIT_R*0.6+20, player.pos.z);
  moonSprite.visible = moonHeight > -0.06;

  const phase = currentMoonPhase();
  const phaseKey = Math.round(phase*100); // real lunar month is ~29.5 days — no need to redraw often
  if(phaseKey !== lastMoonPhaseKey){
    lastMoonPhaseKey = phaseKey;
    if(moonSprite.material.map) moonSprite.material.map.dispose();
    moonPhaseCanvas = buildMoonPhaseCanvas(phase);
    const tex = new THREE.CanvasTexture(moonPhaseCanvas);
    moonSprite.material.map = tex;
    moonSprite.material.needsUpdate = true;
  }

  // Keep the sun (and its shadow) at the same angle/height, but centered on the player instead of
  // the world origin, so the shadow camera's small frustum always covers the ground right around you.
  sunLight.position.set(player.pos.x+sunX*SUN_ORBIT_R, Math.max(5, sunHeight*SUN_ORBIT_R*0.6+40), player.pos.z);
  sunLight.target.position.set(player.pos.x, player.pos.y, player.pos.z);
}

// ---------- Night sky: stars + the Big Dipper ----------
// A field of distant points plus one real, recognizable constellation — the Big Dipper, since it's
// the one shape most people already know how to spot. Both live at a fixed distance in a fixed
// compass direction (no real sidereal rotation — simplicity over realism), recentered on the player
// every frame exactly like the sun/moon above, so they read as infinitely far away rather than
// panning as you walk. Fading is the same smooth night/day blend fireflies already use.
const STAR_COUNT = 260;
const STAR_DOME_RADIUS = 300;
// Fixed direction the Dipper sits in: due north (matches bearingName's -Z-is-north convention) and
// well up in the sky, so "look north and up" is a real, learnable instruction.
const BIG_DIPPER_DIR = new THREE.Vector3(0, Math.sin(55*Math.PI/180), -Math.cos(55*Math.PI/180)).normalize();
const DIPPER_GAZE_COS = Math.cos(18 * Math.PI/180); // ~18° cone — roughly the whole drawn shape, forgiving of ordinary mouse drift
const DIPPER_GAZE_SECONDS = 10;
const DIPPER_GAZE_GRACE_S = 1.5; // briefly glancing away doesn't wipe out the whole streak, only stopping this long does
const MEDITATE_SECONDS = 30;
const MEDITATE_GRACE_S = 2; // stepping half off the ring for a moment doesn't wipe the streak either
const MEDITATE_RADIUS = 3.2; // comfortably covers the whole stone ring's interior (see ALTAR_PLATEAU_RADIUS)
// The real ladle asterism in local (right, up) offsets around BIG_DIPPER_DIR — handle tip to bowl:
// Alkaid, Mizar, Alioth, Megrez, then the bowl itself Megrez-Phecda-Merak-Dubhe back to Megrez.
const DIPPER_STARS = [
  [-4.0, 2.6], [-2.6, 2.0], [-1.3, 1.6], [0.0, 1.0], [0.1,-0.3], [1.8,-0.5], [2.0, 1.0],
];
const DIPPER_SEGMENTS = [[0,1],[1,2],[2,3],[3,4],[4,5],[5,6],[6,3]];
let starPoints = null, dipperPoints = null, dipperLines = null;
function buildStarField(){
  const positions = new Float32Array(STAR_COUNT*3);
  for(let i=0;i<STAR_COUNT;i++){
    const u = Math.random(), v = Math.random();
    const az = u*Math.PI*2, elev = v*Math.PI*0.5; // upper hemisphere only — no stars underfoot
    positions[i*3+0] = Math.cos(elev)*Math.sin(az)*STAR_DOME_RADIUS;
    positions[i*3+1] = Math.sin(elev)*STAR_DOME_RADIUS;
    positions[i*3+2] = -Math.cos(elev)*Math.cos(az)*STAR_DOME_RADIUS;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions,3));
  const mat = new THREE.PointsMaterial({ color:0xffffff, size:1.6, sizeAttenuation:false, transparent:true, opacity:0, depthWrite:false, fog:false });
  starPoints = new THREE.Points(geo, mat);
  starPoints.renderOrder = -2;
  scene.add(starPoints);

  // Tangent-plane basis around the fixed Dipper direction, so its local (right,up) offsets above
  // land as a small, correctly-oriented cluster in the actual sky rather than a flat world-plane.
  const worldUp = new THREE.Vector3(0,1,0);
  const right = new THREE.Vector3().crossVectors(worldUp, BIG_DIPPER_DIR).normalize();
  const up = new THREE.Vector3().crossVectors(BIG_DIPPER_DIR, right).normalize();
  const scale = 0.018; // controls the Dipper's apparent size in the sky
  const dipperDir = (sx,sy) => BIG_DIPPER_DIR.clone()
    .addScaledVector(right, sx*scale).addScaledVector(up, sy*scale).normalize();

  const starPos = new Float32Array(DIPPER_STARS.length*3);
  DIPPER_STARS.forEach(([sx,sy], i)=>{
    const d = dipperDir(sx,sy).multiplyScalar(STAR_DOME_RADIUS*0.97); // just inside the star dome
    starPos[i*3]=d.x; starPos[i*3+1]=d.y; starPos[i*3+2]=d.z;
  });
  const dGeo = new THREE.BufferGeometry();
  dGeo.setAttribute('position', new THREE.BufferAttribute(starPos,3));
  const dMat = new THREE.PointsMaterial({ color:0xfff8e0, size:4.5, sizeAttenuation:false, transparent:true, opacity:0, depthWrite:false, fog:false });
  dipperPoints = new THREE.Points(dGeo, dMat);
  dipperPoints.renderOrder = -2;
  scene.add(dipperPoints);

  const linePos = new Float32Array(DIPPER_SEGMENTS.length*2*3);
  DIPPER_SEGMENTS.forEach(([a,b], i)=>{
    linePos[i*6]=starPos[a*3]; linePos[i*6+1]=starPos[a*3+1]; linePos[i*6+2]=starPos[a*3+2];
    linePos[i*6+3]=starPos[b*3]; linePos[i*6+4]=starPos[b*3+1]; linePos[i*6+5]=starPos[b*3+2];
  });
  const lGeo = new THREE.BufferGeometry();
  lGeo.setAttribute('position', new THREE.BufferAttribute(linePos,3));
  const lMat = new THREE.LineBasicMaterial({ color:0xfff8e0, transparent:true, opacity:0, depthWrite:false, fog:false });
  dipperLines = new THREE.LineSegments(lGeo, lMat);
  dipperLines.renderOrder = -2;
  scene.add(dipperLines);
}
function updateStarField(){
  const night = fireflyNightFactor();
  starPoints.position.copy(player.pos);
  dipperPoints.position.copy(player.pos);
  dipperLines.position.copy(player.pos);
  starPoints.material.opacity = night*0.9;
  dipperPoints.material.opacity = night;
  dipperLines.material.opacity = night*0.55;
}

let lastWorldTimeLabel = null, lastDateLabel = null;
function updateDayNight(){
  const dayTime = currentDayTime();
  const totalMinutes = Math.floor(dayTime*24*60) % (24*60);
  const timeText = String(Math.floor(totalMinutes/60)).padStart(2,'0')+':'+String(totalMinutes%60).padStart(2,'0');
  if(timeText !== lastWorldTimeLabel){
    lastWorldTimeLabel = timeText;
    const el = document.getElementById('worldTimeLabel');
    if(el) el.textContent = timeText;
  }
  const { year, month, day } = currentCalendarDate();
  const dateText = `${month} ${day}, Y${year}`;
  if(dateText !== lastDateLabel){
    lastDateLabel = dateText;
    const el = document.getElementById('dateLabel');
    if(el) el.textContent = dateText;
  }
  let k0 = DAY_KEYFRAMES[0], k1 = DAY_KEYFRAMES[DAY_KEYFRAMES.length-1];
  for(let i=0;i<DAY_KEYFRAMES.length-1;i++){
    if(dayTime>=DAY_KEYFRAMES[i].t && dayTime<=DAY_KEYFRAMES[i+1].t){ k0=DAY_KEYFRAMES[i]; k1=DAY_KEYFRAMES[i+1]; break; }
  }
  const span = k1.t-k0.t;
  const lt = span>0 ? (dayTime-k0.t)/span : 0;
  const skyColor = lerpColorHex(k0.sky, k1.sky, lt);
  scene.background.setHex(skyColor);
  scene.fog.color.setHex(skyColor);
  hemiLight.intensity = k0.hemi + (k1.hemi-k0.hemi)*lt;
  sunLight.intensity = k0.sunI + (k1.sunI-k0.sunI)*lt;
  sunLight.color.setHex(lerpColorHex(k0.sunC, k1.sunC, lt));
  updateCelestialBodies(dayTime);
  updateStarField();
}

// ---------- Weather ----------
// Like the day/night cycle, weather is derived straight from the wall clock, so it's automatically
// consistent across a reload with no state to save.
const WEATHER_PERIOD_S = 1200;     // how long one weather episode lasts (20 min)
const WEATHER_TRANSITION_S = 90;   // how long it takes to blend into a freshly-rolled episode (1.5 min)
const WEATHER_TYPES = [
  // cumulative selection order matters only in that it's applied consistently; percentages per the spec
  // chillF: how many degrees this weather knocks off the temperature (see currentTemperatureF) —
  // wetter/stormier weather runs colder, on top of whatever season/time-of-day already has it at.
  { id:'sunny',        p:0.50, fogMul:1.00, darken:0.00, rain:0.0,  thunder:false, chillF:0,  label:'Sunny' },
  { id:'cloudy',       p:0.15, fogMul:0.80, darken:0.28, rain:0.0,  thunder:false, chillF:2,  label:'Cloudy' },
  { id:'rainy',        p:0.20, fogMul:0.55, darken:0.42, rain:0.5,  thunder:false, chillF:6,  label:'Rainy' },
  { id:'rainstorm',    p:0.10, fogMul:0.40, darken:0.55, rain:1.0,  thunder:false, chillF:10, label:'Rainstorm' },
  { id:'thunderstorm', p:0.05, fogMul:0.30, darken:0.68, rain:1.5,  thunder:true,  chillF:14, label:'Heavy Thunderstorm' },
];
function weatherHash(n){
  const s = Math.sin(n*12.9898 + SEED*0.0007)*43758.5453123;
  return s - Math.floor(s);
}
function weatherForEpoch(epoch){
  const r = weatherHash(epoch);
  let cum = 0;
  for(const w of WEATHER_TYPES){ cum += w.p; if(r<cum) return w; }
  return WEATHER_TYPES[0];
}
function currentWeatherBlend(){
  const t = Date.now()/1000;
  const epoch = Math.floor(t/WEATHER_PERIOD_S);
  const into = t - epoch*WEATHER_PERIOD_S;
  const to = weatherForEpoch(epoch);
  if(into < WEATHER_TRANSITION_S){
    const from = weatherForEpoch(epoch-1);
    return { from, to, lt: into/WEATHER_TRANSITION_S };
  }
  return { from: to, to, lt: 1 };
}
function lerp(a,b,t){ return a+(b-a)*t; }

// ---------- Seasons & temperature ----------
// Same wall-clock philosophy as day/night and weather — no state to save, everyone's always in
// sync. A year is 4 seasons of 3 real hours each (12h/year); temperature is that season's average,
// swung warmer at noon / colder at midnight by a cosine curve, plus a small organic wobble so it's
// never exactly the same twice. Being outdoors (no roof, cave ceiling, or tree canopy overhead —
// reusing the same sky-exposure idea the indoor-lighting fix uses) in genuinely dangerous heat or
// cold drains HP faster than standing still can regenerate it.
const SEASON_LENGTH_S = 3*3600;
const YEAR_LENGTH_S = 4*SEASON_LENGTH_S;
const SEASON_TRANSITION_S = 900; // 15 min blend into a freshly-arrived season
const SEASONS = [
  { id:'spring', label:'Spring', avgF:50 },
  { id:'summer', label:'Summer', avgF:90 },
  { id:'fall',   label:'Fall',   avgF:50 },
  { id:'winter', label:'Winter', avgF:20 },
];
const DAILY_TEMP_SWING_F = 18; // +/- this many degrees between noon and midnight
// Two danger tiers per direction: past DANGER_F you lose HP slowly, past the more extreme SUPER_F
// you lose it rapidly — both a higher per-tick amount and a shorter tick interval.
const COLD_DANGER_F = 20, COLD_SUPER_F = 0;
const HOT_DANGER_F = 105, HOT_SUPER_F = 110;
const TEMP_DAMAGE_TICK_S = 4, TEMP_DAMAGE_TICK_SUPER_S = 2;
const TEMP_DAMAGE_MILD = 1, TEMP_DAMAGE_SUPER = 4;
function currentSeasonBlend(){
  const t = Date.now()/1000;
  const yearT = ((t % YEAR_LENGTH_S) + YEAR_LENGTH_S) % YEAR_LENGTH_S;
  const idx = Math.floor(yearT / SEASON_LENGTH_S);
  const into = yearT - idx*SEASON_LENGTH_S;
  const to = SEASONS[idx];
  if(into < SEASON_TRANSITION_S){
    const from = SEASONS[(idx-1+4)%4];
    return { from, to, lt: into/SEASON_TRANSITION_S };
  }
  return { from: to, to, lt: 1 };
}
function currentTemperatureF(){
  const t = Date.now()/1000;
  const { from, to, lt } = currentSeasonBlend();
  const avgF = lerp(from.avgF, to.avgF, lt);
  const dayTime = currentDayTime();
  const dailyOffset = DAILY_TEMP_SWING_F * Math.cos((dayTime-0.5)*Math.PI*2);
  const noise = (smoothNoise01(t*0.05, 91)*2-1) * 4;
  const wb = currentWeatherBlend();
  const chillF = lerp(wb.from.chillF, wb.to.chillF, wb.lt);
  // Season, time of day, and weather still all push it around within the range — winter still reads
  // cooler than summer, a storm still knocks a few degrees off — it just never leaves a comfortable
  // 40-90°F band, so the temperature-danger tiers below (calibrated for a wider swing) never trigger.
  return Math.max(40, Math.min(90, avgF + dailyOffset + noise - chillF));
}
// Straight-up sky check from an arbitrary live position (the player), as opposed to
// computeSkyExposure() which is baked per-column into chunk mesh vertex colors at build time.
function isPositionSkyExposed(x,y,z){
  const bx=Math.floor(x), bz=Math.floor(z);
  for(let cy=Math.floor(y)+1; cy<WORLD_HEIGHT; cy++){
    const b = getBlock(bx,cy,bz);
    if(b!==AIR && !SKY_PASS_BLOCKS.has(b)) return false;
  }
  return true;
}
let tempDamageTimer = TEMP_DAMAGE_TICK_S;
let lastSeasonLabel = null;
function updateTemperature(dt){
  const { to } = currentSeasonBlend();
  const tempF = currentTemperatureF();
  const outdoors = isPositionSkyExposed(player.pos.x, player.pos.y+player.eye, player.pos.z);
  let danger = null, severe = false;
  if(tempF < COLD_DANGER_F){ danger = 'cold'; severe = tempF < COLD_SUPER_F; }
  else if(tempF > HOT_DANGER_F){ danger = 'hot'; severe = tempF > HOT_SUPER_F; }
  const inPeril = danger && outdoors && locked && !isDead;

  if(to.label !== lastSeasonLabel){
    lastSeasonLabel = to.label;
    const el = document.getElementById('seasonLabel');
    if(el) el.textContent = to.label;
  }
  const tempEl = document.getElementById('tempLabel');
  if(tempEl){
    let text = `${Math.round(tempF)}°F`;
    if(inPeril){
      if(danger==='cold') text += severe ? ' ❄ Severe Frostbite!' : ' ❄ Freezing!';
      else text += severe ? ' 🔥 Heatstroke!' : ' 🔥 Overheating!';
    }
    tempEl.textContent = text;
    tempEl.classList.toggle('danger', !!inPeril);
  }

  tempDamageTimer -= dt;
  if(tempDamageTimer<=0){
    if(inPeril){
      tempDamageTimer = severe ? TEMP_DAMAGE_TICK_SUPER_S : TEMP_DAMAGE_TICK_S;
      damagePlayer(severe ? TEMP_DAMAGE_SUPER : TEMP_DAMAGE_MILD, 'temperature');
    } else {
      tempDamageTimer = TEMP_DAMAGE_TICK_S;
    }
  }
}

let hungerDecayTimer = HUNGER_DECAY_INTERVAL_S, starveDamageTimer = STARVE_DAMAGE_TICK_S;
function updateHunger(dt){
  if(!locked || isDead) return;
  hungerDecayTimer -= dt;
  if(hungerDecayTimer<=0){
    hungerDecayTimer = HUNGER_DECAY_INTERVAL_S;
    if(myHunger>0){ myHunger--; updateHungerUI(); }
  }
  starveDamageTimer -= dt;
  if(starveDamageTimer<=0){
    starveDamageTimer = STARVE_DAMAGE_TICK_S;
    if(myHunger<=0) damagePlayer(STARVE_DAMAGE, 'hunger');
  }
}

// ---------- Wind ----------
// Same philosophy as day/night and weather: derived purely from the wall clock, so it's random
// (nobody chose it) but perfectly in sync for every player with no networking at all. Strength is a
// smooth, organic-looking signal built from a few sine waves at unrelated frequencies (a cheap stand-
// in for real noise) — a slow-moving base plus a faster gust layer — biased by the current weather
// (storms are windier than a clear sky on average) and clamped to [0,1] (calm to a full gale).
const WIND_DIR_PERIOD_S = 900; // wind direction slowly drifts all the way around every 15 min
const WEATHER_WIND_BIAS = { sunny:0.7, cloudy:0.95, rainy:1.15, rainstorm:1.5, thunderstorm:1.8 };
const WIND_LEVELS = [
  { max:0.12, label:'Calm' },
  { max:0.32, label:'Light breeze' },
  { max:0.55, label:'Breezy' },
  { max:0.78, label:'Strong wind' },
  { max:Infinity, label:'Very strong wind' },
];
function smoothNoise01(t, seed){
  return 0.5 + 0.28*Math.sin(t*0.0173 + seed*1.7)
             + 0.15*Math.sin(t*0.0071 + seed*3.1)
             + 0.07*Math.sin(t*0.0311 + seed*5.9);
}
function windLabel(strength){
  for(const lvl of WIND_LEVELS) if(strength<=lvl.max) return lvl.label;
  return WIND_LEVELS[WIND_LEVELS.length-1].label;
}
function currentWind(){
  const t = Date.now()/1000;
  const { from, to, lt } = currentWeatherBlend();
  const biasFrom = WEATHER_WIND_BIAS[from.id]!=null ? WEATHER_WIND_BIAS[from.id] : 1;
  const biasTo = WEATHER_WIND_BIAS[to.id]!=null ? WEATHER_WIND_BIAS[to.id] : 1;
  const bias = lerp(biasFrom, biasTo, lt);
  const base = smoothNoise01(t, 11);
  const gust = smoothNoise01(t*7, 29);
  const strength = Math.max(0, Math.min(1, (base*0.7 + gust*0.3) * bias));
  const angle = (t/WIND_DIR_PERIOD_S)*Math.PI*2 + (smoothNoise01(t*0.4, 53)-0.5)*1.2;
  return { strength, angle };
}

let rainGeo, rainMat, rainPoints, rainVelocities;
const RAIN_COUNT = 700;
function ensureRain(){
  if(rainPoints) return;
  rainGeo = new THREE.BufferGeometry();
  const positions = new Float32Array(RAIN_COUNT*3);
  rainVelocities = new Float32Array(RAIN_COUNT);
  for(let i=0;i<RAIN_COUNT;i++){
    positions[i*3+1] = -9999;
    rainVelocities[i] = 20 + Math.random()*10;
  }
  rainGeo.setAttribute('position', new THREE.BufferAttribute(positions,3));
  rainMat = new THREE.PointsMaterial({ color:0xaad0f5, size:0.12, transparent:true, opacity:0.55, depthWrite:false });
  rainPoints = new THREE.Points(rainGeo, rainMat);
  rainPoints.frustumCulled = false;
  scene.add(rainPoints);
}
const MAX_RAIN_DRIFT = 7; // sideways speed (units/s) rain drifts at full wind strength
function updateRain(dt, intensity, wind){
  if(intensity<=0){ if(rainPoints) rainPoints.visible=false; return; }
  ensureRain();
  rainPoints.visible = true;
  const positions = rainGeo.attributes.position.array;
  const activeCount = Math.min(RAIN_COUNT, Math.round(RAIN_COUNT * Math.min(1, intensity)));
  const cx=player.pos.x, cy=player.pos.y, cz=player.pos.z;
  const windSpeed = (wind ? wind.strength : 0) * MAX_RAIN_DRIFT;
  const windDx = wind ? Math.cos(wind.angle)*windSpeed : 0;
  const windDz = wind ? Math.sin(wind.angle)*windSpeed : 0;
  for(let i=0;i<RAIN_COUNT;i++){
    if(i>=activeCount){ positions[i*3+1] = -9999; continue; }
    let y = positions[i*3+1];
    if(y < cy-2){
      positions[i*3] = cx + (Math.random()*2-1)*22;
      positions[i*3+1] = cy + 14 + Math.random()*8;
      positions[i*3+2] = cz + (Math.random()*2-1)*22;
    } else {
      positions[i*3+1] = y - rainVelocities[i]*dt;
      positions[i*3] += windDx*dt;
      positions[i*3+2] += windDz*dt;
    }
  }
  rainGeo.attributes.position.needsUpdate = true;
}
let rainSoundTimer = 0, lightningTimer = 8+Math.random()*8, windSoundTimer = 3+Math.random()*4;
let lastWeatherLabel = null, lastWindLabel = null;
function updateWeather(dt){
  const { from, to, lt } = currentWeatherBlend();
  const fogMul = lerp(from.fogMul, to.fogMul, lt);
  const darken = lerp(from.darken, to.darken, lt);
  const rain = lerp(from.rain, to.rain, lt);
  const thunderActive = lt>0.5 ? to.thunder : from.thunder;

  scene.fog.near = FAR*0.35*fogMul;
  scene.fog.far = FAR*fogMul;
  if(darken>0){
    const grayHex = lerpColorHex(scene.background.getHex(), 0x30363d, darken);
    scene.background.setHex(grayHex);
    scene.fog.color.setHex(grayHex);
  }
  hemiLight.intensity *= (1 - darken*0.6);
  sunLight.intensity *= (1 - darken*0.7);

  const wind = currentWind();
  updateRain(dt, rain, wind);

  if(rain>0 && locked){
    rainSoundTimer -= dt;
    if(rainSoundTimer<=0){
      rainSoundTimer = 0.07 + Math.random()*0.11;
      SFX.rainPatter(Math.min(0.08, 0.02 + rain*0.035));
    }
  }
  if(thunderActive && locked){
    lightningTimer -= dt;
    if(lightningTimer<=0){
      lightningTimer = 6 + Math.random()*14;
      triggerLightning();
    }
  }
  if(wind.strength>0.12 && locked){
    windSoundTimer -= dt;
    if(windSoundTimer<=0){
      windSoundTimer = 2.5 + Math.random()*2.5;
      SFX.windGust(Math.min(0.16, wind.strength*0.14), 900+wind.strength*1400);
    }
  }

  const label = to.label;
  if(label !== lastWeatherLabel){
    lastWeatherLabel = label;
    const el = document.getElementById('weatherLabel');
    if(el) el.textContent = label;
    Scout.sawWeather(label);
  }
  const windText = windLabel(wind.strength);
  if(windText !== lastWindLabel){
    lastWindLabel = windText;
    const el = document.getElementById('windLabel');
    if(el) el.textContent = windText;
  }
}
// Scuba diving: mask+snorkel on the character model, a blue vignette over the first-person view, and
// a murky close-in fog tint — called right after updateWeather every frame so the tint overrides
// whatever weather just set rather than fighting it (updateWeather reassigns scene.fog/background
// wholesale each frame, it doesn't blend incrementally, so overwriting again right after is safe).
let wasHeadUnderwater = false;
function updateScubaView(){
  const underwater = locked && !isDead && isHeadUnderwater();
  if(underwater !== wasHeadUnderwater){
    wasHeadUnderwater = underwater;
    if(characterMesh.userData.scubaGear) characterMesh.userData.scubaGear.visible = underwater;
    const el = document.getElementById('scubaOverlay');
    if(el) el.style.opacity = underwater ? '1' : '0';
  }
  if(underwater){
    scene.fog.near = 0.4;
    scene.fog.far = 10;
    scene.fog.color.setHex(0x123c46);
    scene.background.setHex(0x123c46);
    hemiLight.intensity *= 0.5;
    sunLight.intensity *= 0.35;
  }
}
function triggerLightning(){
  const el = document.getElementById('lightningFlash');
  if(el){
    el.style.transition = 'none';
    el.style.opacity = '0.85';
    requestAnimationFrame(()=>{
      el.style.transition = 'opacity 0.6s ease-out';
      el.style.opacity = '0';
    });
  }
  setTimeout(()=> SFX.thunder(), 300+Math.random()*1200);
}

