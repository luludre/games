// ---------- bootstrap.js ----------
// init(), the animate() loop, and the update checker. Loads LAST, after every other file above.
'use strict';

// ---------- Init & loop ----------
function init(){
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x8fd0ee);
  scene.fog = new THREE.Fog(0x8fd0ee, FAR*0.35, FAR);

  camera = new THREE.PerspectiveCamera(75, window.innerWidth/window.innerHeight, 0.1, FAR);
  camera.rotation.order = 'YXZ';

  // Lights up around you while a Torch is your held item, same warm glow as a placed one — off
  // otherwise. A child of the camera so it always tracks wherever you're looking/standing for free.
  // See the placed-torch light (updateTorchLight) for why the intensity/decay are tuned this high.
  heldTorchLight = new THREE.PointLight(0xffb060, 6, 8, 1.6);
  heldTorchLight.visible = false;
  camera.add(heldTorchLight);
  scene.add(camera);

  renderer = new THREE.WebGLRenderer({ antialias:true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio,2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  document.body.appendChild(renderer.domElement);

  hemiLight = new THREE.HemisphereLight(0xffffff, 0x445533, 0.9);
  scene.add(hemiLight);
  sunLight = new THREE.DirectionalLight(0xffffff, 0.8);
  sunLight.position.set(80,120,40);
  sunLight.castShadow = true;
  sunLight.shadow.mapSize.set(1536,1536);
  // The shadow camera is a small box that follows the player (see updateDayNight) rather than
  // trying to cover the whole 128x128 world at once — keeps shadow resolution usable regardless of
  // how big the world is. SHADOW_RADIUS/far need to stay in sync with the light's own orbit radius.
  const sc = sunLight.shadow.camera;
  sc.left = -SHADOW_RADIUS; sc.right = SHADOW_RADIUS;
  sc.top = SHADOW_RADIUS; sc.bottom = -SHADOW_RADIUS;
  sc.near = 1; sc.far = SUN_ORBIT_R*2.2;
  sunLight.shadow.bias = -0.0015;
  scene.add(sunLight);
  scene.add(sunLight.target);
  buildCelestialBodies();
  buildStarField();

  characterMesh = createCharacterMesh();
  characterMesh.visible = false;
  myNameTag = createNameTagSprite();
  characterMesh.add(myNameTag.sprite);
  scene.add(characterMesh);
  buildHandModel();
  renderer.autoClear = false;

  generateWorld();
  loadEdits();
  // A returning player's own saved edits replay on top of world-gen above — if any of them happen to
  // land on the flag's footprint (mining or building nearby in an earlier session, before this existed),
  // they'd silently punch through it. Unlike a Scout Law box, there's no legitimate way for this to be
  // missing, so it just gets placed again rather than accepting the loss.
  buildGiantFlag();
  buildTotems();
  buildArcheryRange();
  buildCampSign();
  buildKayak();
  buildHorse();
  restoreTorchLights();
  restoreScoutLawBoxes();
  updateScoutHUD();
  buildMinimapTerrain();
  loadInventory();
  loadHotbar();
  rebuildAllChunks();
  spawnPlayerAtStart();
  spawnAnimals();
  updateHotbarUI();
  updateHeldItemColor();
  updateHeartsUI();
  updateHungerUI();
  loadSaplings();
  loadFires();
  loadWorms();
  loadButterflies();
  loadBearBox();
  loadBackpackStorage();

  window.addEventListener('resize', ()=>{
    camera.aspect = window.innerWidth/window.innerHeight;
    camera.updateProjectionMatrix();
    handCamera.aspect = window.innerWidth/window.innerHeight;
    handCamera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  requestAnimationFrame(animate);
}

let lastTime = performance.now();
let fpsCount=0, fpsTimer=0;
function animate(now){
  requestAnimationFrame(animate);
  const dt = Math.min(0.05, (now-lastTime)/1000);
  lastTime = now;

  if(locked && !isDead) updatePlayer(dt);
  updateDeathState(dt);
  updateScout(dt);
  updateFishing(dt);
  firstAidCooldown = Math.max(0, firstAidCooldown - dt);
  stopBearCooldown = Math.max(0, stopBearCooldown - dt);

  const moving = locked && !isDead && (keys['KeyW']||keys['KeyA']||keys['KeyS']||keys['KeyD']);
  const sprinting = !!(keys['ShiftLeft']||keys['ShiftRight']);
  updateCharacterAnim(dt, moving, sprinting);
  updateHandView(dt, moving, sprinting);
  updateAnimals(dt);
  updateRespawns(dt);
  updateFallingClusters(dt);
  updateSaplings(dt);
  updateTreeRegrowth(dt);
  updateFires(dt);
  updateCampfireFlames();
  updateWaterFlow(dt);
  updateFireworks(dt);
  updateArrows(dt);
  updateFireflies(dt);
  updateWorms(dt);
  updateButterflies(dt);
  updateBirds(dt);
  updateFish(dt);
  updateTurtles(dt);
  updateFrogs(dt);
  updateBeetles(dt);
  updateBigEagles(dt);
  updateGophers(dt);
  heldTorchLight.visible = HOTBAR[selectedSlot]===TORCH;
  if(heldTorchLight.visible) heldTorchLight.intensity = 1.0 + Math.random()*0.3;
  updateDayNight();
  updateWeather(dt);
  updateScubaView();
  updateTemperature(dt);
  updateHunger(dt);

  if(thirdPerson){
    characterMesh.visible = true;
    // Once the mouse has been still for PEEK_HOLD_S, ease the extra swing back out so the camera
    // settles behind the character again instead of staying wherever the last peek left it.
    if(peekTimer > 0) peekTimer -= dt;
    else peekYaw += (0 - peekYaw) * Math.min(1, dt*PEEK_EASE_RATE);
    const dir = getLookDir(player.yaw + peekYaw, player.pitch);
    const dist = 4.5;
    camera.position.set(
      player.pos.x - dir.x*dist,
      player.pos.y + player.eye - dir.y*dist,
      player.pos.z - dir.z*dist
    );
    camera.lookAt(player.pos.x, player.pos.y+player.eye, player.pos.z);
  } else {
    characterMesh.visible = false;
    camera.rotation.set(player.pitch, player.yaw, 0);
    camera.position.set(player.pos.x, player.pos.y+player.eye, player.pos.z);
  }

  renderer.clear();
  renderer.render(scene, camera);
  if(!thirdPerson){
    renderer.clearDepth();
    renderer.render(handScene, handCamera);
  }

  craftHint.classList.toggle('show', locked && !craftingOpen && nearestCraftingTable(4));
  if(fishingSpot){
    fishingHint.textContent = `🎣 Fishing... ${Math.max(0, Math.ceil(FISHING_HOLD_SECONDS - fishingTimer))}s`;
    fishingHint.classList.add('show');
  } else {
    fishingHint.classList.remove('show');
  }
  if(nearAltar){
    meditateHint.textContent = `🧘 Meditating... ${Math.max(0, Math.ceil(MEDITATE_SECONDS - meditateTimer))}s`;
    meditateHint.classList.add('show');
  } else {
    meditateHint.classList.remove('show');
  }

  const coordsEl = document.getElementById('coordsLabel');
  if(coordsEl) coordsEl.textContent = `${player.pos.x.toFixed(1)}, ${player.pos.y.toFixed(1)}, ${player.pos.z.toFixed(1)}`;
  updateMinimap();

  fpsTimer += dt; fpsCount++;
  if(fpsTimer>=0.5){
    document.getElementById('fps').textContent = Math.round(fpsCount/fpsTimer);
    fpsTimer=0; fpsCount=0;
    document.getElementById('wormCount').textContent = worms.length;
    document.getElementById('butterflyCount').textContent = butterflies.length;
  }

  if(debugPanelOpen){
    debugPanelTimer -= dt;
    if(debugPanelTimer<=0){ debugPanelTimer = 2; renderDebugPanel(); }
  }
}

// ---------- Update checker ----------
// Detects when a newer build has been deployed while this tab is still open, and shows a small
// persistent banner nudging the player to reload — the exact class of confusion a stale cached script
// has caused before in this project (fireworks that seemed not to sync, a hotkey that silently did
// nothing), just surfaced proactively instead of debugged after the fact. No version number to
// remember to bump by hand: it compares every file in window.SCOUTCRAFT_FILES's own ETag/Last-Modified
// HTTP header against whatever it was the last time this tab checked — a deploy that only touches one
// of the split files (say, animals.js) still needs to trip this, not just an index.html change. If any
// single file can't produce a usable header (some local dev servers, or a fetch that fails for any
// reason) the whole check quietly does nothing rather than false-alarm.
const UPDATE_CHECK_INTERVAL_MS = 5*60*1000; // every 5 real minutes
let currentBuildTag = null;
async function fetchBuildTag(){
  try{
    const tags = await Promise.all(window.SCOUTCRAFT_FILES.map(async f => {
      const res = await fetch(f, { method:'HEAD', cache:'no-store' });
      if(!res.ok) return null;
      return res.headers.get('etag') || res.headers.get('last-modified') || null;
    }));
    if(tags.some(t => !t)) return null;
    return tags.join('|');
  }catch(e){ return null; }
}
async function checkForUpdate(){
  const tag = await fetchBuildTag();
  if(!tag) return;
  if(currentBuildTag===null){ currentBuildTag = tag; return; } // first successful check just sets the baseline
  if(tag !== currentBuildTag){
    const banner = document.getElementById('updateBanner');
    if(banner) banner.hidden = false;
  }
}
const updateReloadBtn = document.getElementById('updateReloadBtn');
if(updateReloadBtn) updateReloadBtn.addEventListener('click', ()=> location.reload());
checkForUpdate();
setInterval(checkForUpdate, UPDATE_CHECK_INTERVAL_MS);

// Keeps "leave the game alive, come back at the same spot" fresh even if the tab is killed outright
// (mobile task-switching, a crash) rather than closed cleanly — the periodic timer is the real
// safety net; beforeunload/pagehide below just make the very last moment before a clean close exact.
setInterval(savePosition, POSITION_SAVE_INTERVAL_MS);
window.addEventListener('beforeunload', savePosition);
window.addEventListener('pagehide', savePosition);
// Browsers don't let a page show its own custom UI at the moment of leaving — the tab just tears
// down — so there's no way to actually pop the thank-you screen open on the close itself the way
// clicking Quit does. The closest real equivalent is the browser's own generic "Leave site?" prompt;
// swapping in the real thank-you screen here too means that if they cancel that prompt and stay, they
// land on the same graceful recap instead of snapping back to raw gameplay. Skipped once they've
// already seen it (clicked Quit themselves, or already canceled once) — no need to prompt twice on
// the way out, and skipped entirely for someone who closes the tab from the front page having never
// actually played.
window.addEventListener('beforeunload', e=>{
  if(!thankYouScreen.hidden) return;
  if(everStartedPlaying) quitGame();
  e.preventDefault();
  e.returnValue = '';
});

init();
