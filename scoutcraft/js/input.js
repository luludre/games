// ---------- input.js ----------
// Keyboard/mouse input, hotbar keys, touch controls (virtual joystick etc.), debug panel (Alt+Shift+D), hotbar UI rendering.
'use strict';

// ---------- Input ----------
const hotkeyPanel = document.getElementById('hotkeyPanel');
function toggleHotkeyPanel(){ hotkeyPanel.hidden = !hotkeyPanel.hidden; }
const keys = {};
let selectedSlot = 0;
// Direct letter shortcuts for the hotbar, one per slot — no numbers, no scroll-wheel cycling.
// Picked to avoid every letter already bound to something else (WASD move, E craft, I inventory,
// V third-person, B backpack, M badges, K sleep, N day/night, Z crawl toggle, H hotkey panel), and
// clustered as tightly as possible around WASD so they're reachable without moving your hand.
// L took Z's old slot once crawl toggle moved onto Z, and J takes H's old slot now that H opens the
// hotkey panel instead (see the keydown handler below).
const HOTBAR_KEYS = ['KeyQ','KeyR','KeyF','KeyT','KeyG','KeyC','KeyX','KeyL','KeyJ'];
window.addEventListener('keydown', e=>{
  keys[e.code]=true;
  if(e.code==='KeyD' && e.altKey && e.shiftKey && !e.ctrlKey && !e.metaKey){
    // Alt+Shift+D (Option+Shift+D on macOS) rather than Ctrl/Cmd+Shift+D — that one's "bookmark all
    // tabs" in Chrome on both Windows/Linux (Ctrl+Shift+D) and macOS (Cmd+Shift+D), and neither Chrome
    // nor macOS binds anything to Alt+Shift+D by default.
    e.preventDefault();
    toggleDebugPanel();
    return;
  }
  if(e.code==='Escape'){
    // First in the chain: it's the only modal that can open on top of the front page, so it has to
    // be the one Esc dismisses even when nothing else is showing.
    if(resetConfirmOpen){ closeResetConfirm(); return; }
    if(craftingOpen){ closeCrafting(false); return; }
    if(itemsOpen){ closeItems(false); return; }
    if(bearBoxOpen){ closeBearBox(false); return; }
    if(backpackOpen){ closeBackpackStorage(false); return; }
    if(cookwareOpen){ closeCookware(false); return; }
    if(sashOpen){ closeSash(false); return; }
  }
  if(e.code==='KeyM'){
    if(sashOpen){ closeSash(true); return; }
    if(craftingOpen || itemsOpen || bearBoxOpen || backpackOpen || cookwareOpen) return;
    if(locked && !isDead) openSash();
    return;
  }
  if(e.code==='KeyE'){
    if(craftingOpen){ closeCrafting(false); return; }
    if(locked && !isDead && nearestCraftingTable(4)) openCrafting();
    return;
  }
  if(e.code==='KeyI'){
    if(itemsOpen){ closeItems(true); return; }
    if(craftingOpen) return;
    if(locked && !isDead) openItems();
    return;
  }
  if(e.code==='KeyB'){
    if(backpackOpen){ closeBackpackStorage(true); return; }
    if(craftingOpen || itemsOpen || bearBoxOpen || sashOpen || cookwareOpen) return;
    if(locked && !isDead) openBackpackStorage();
    return;
  }
  if(e.code==='KeyV' && locked){ thirdPerson = !thirdPerson; return; }
  if(e.code==='KeyN' && locked){ cycleTimeMode(); return; }
  if(e.code==='KeyK' && locked && !isDead){ trySleep(); return; }
  if(e.code==='KeyZ' && locked){ player.crawlMode = !player.crawlMode; return; }
  if(e.code==='KeyH' && locked){ toggleHotkeyPanel(); return; }
  if(e.code==='KeyP'){ useFirstAid(); return; }
  if(e.code==='KeyO'){ useStopBear(); return; }
  if(e.code==='KeyU'){ useHand(); return; }
  const slotIdx = HOTBAR_KEYS.indexOf(e.code);
  if(slotIdx>=0 && slotIdx<HOTBAR.length){
    selectedSlot = slotIdx; updateHotbarUI(); updateHeldItemColor();
    if(itemsOpen) renderItemsGrid();
  }
});
window.addEventListener('keyup', e=>{ keys[e.code]=false; });

const isTouchDevice = ('ontouchstart' in window) || navigator.maxTouchPoints > 0;
function doAttackOrBreak(){
  if(raycastUSFlag()){ playPledge(); return; }
  if(!tryAttack()) breakBlock();
}
// Cooking meat over a campfire doubles what it's worth — the practical payoff for Firecraft.
const FOOD_RESTORE = { [MEAT]: MEAT_HUNGER_RESTORE, [COOKED_MEAT]: MEAT_HUNGER_RESTORE*2 };
function tryEatFood(id){
  const restore = FOOD_RESTORE[id];
  if(!restore || invCount(id)<=0 || myHunger>=PLAYER_MAX_HUNGER) return;
  invSub(id,1);
  saveInventory();
  updateHotbarUI();
  myHunger = Math.min(PLAYER_MAX_HUNGER, myHunger + restore);
  updateHungerUI();
  SFX.eat();
}
// Any cookware — Pot/Pan/Dutch Oven/Griddle at the fixed camp stations, or any Campfire anywhere,
// fixed or player-placed — opens its recipe window regardless of what's in hand, same priority a
// Crafting Table or the Bear Box already gets below. Split out of doInteract so useHand() (see
// below) can run this exact same fixture check without also running doInteract's held-item branches.
function interactWithUnconditionalFixture(hit, hitBlock){
  if(hitBlock in BLOCK_TO_WARE_KEY){ openCookware(BLOCK_TO_WARE_KEY[hitBlock]); return true; }
  if(hit && ALL_TOTEM_BLOCKS.includes(hitBlock)){
    const totem = totemAt(hit.x, hit.z);
    if(totem){ totem.play(); return true; }
  }
  return false;
}
// The fixtures doInteract only reaches once none of the held-item-specific branches below have
// claimed the click — also reusable on its own by useHand(), see below.
function interactWithHeldIndependentFixture(hit, hitBlock){
  if(hitBlock===CRAFTING_TABLE){ openCrafting(); return true; }
  if(hitBlock===BACKPACK){ openBackpackStorage(); return true; }
  if(hitBlock===BEAR_BOX){ openBearBox(); return true; }
  if(hitBlock===SCOUT_LAW_BOX){ collectScoutLawBox(hit.x, hit.y, hit.z); return true; }
  if(hitBlock in TOGGLE_MAP){ toggleOpenable(hit.x, hit.y, hit.z, hitBlock); return true; }
  return false;
}
function doInteract(){
  const hit = raycastBlock();
  const hitBlock = hit ? getBlock(hit.x,hit.y,hit.z) : null;
  const held = HOTBAR[selectedSlot];
  if(interactWithUnconditionalFixture(hit, hitBlock)) return;
  if(held===FLINT){ tryIgniteFire(hit); return; }
  if(held===FIREWORK){ launchFirework(); return; }
  if(FOOD_RESTORE[held]!=null){ tryEatFood(held); return; }
  if(held===COMPASS){ useCompass(); return; }
  if(held===FISHING_POLE){ tryFish(); return; }
  if(held===BOW){ tryShootBow(); return; }
  // Carried items with no block form at all — without this they'd place as an untextured cube,
  // since none of them has a BLOCK_TILES entry.
  if(CARRY_ONLY_ITEMS.has(held)) return;
  if(interactWithHeldIndependentFixture(hit, hitBlock)) return;
  placeBlock();
}
// Quick-access "empty hand" interact — the same fixture checks doInteract runs, but skipping every
// held-item branch (Flint, Firework, Compass, Fishing Pole, Bow, food) entirely, so whatever's
// currently selected in the hotbar never gets in the way of just opening/using what you're looking
// at. Handy since several of those held items (the Compass especially, likely to be equipped most of
// the time) would otherwise take over a plain right-click aimed at a nearby fixture instead.
function useHand(){
  if(!locked || isDead) return;
  const hit = raycastBlock();
  const hitBlock = hit ? getBlock(hit.x,hit.y,hit.z) : null;
  if(interactWithUnconditionalFixture(hit, hitBlock)) return;
  if(interactWithHeldIndependentFixture(hit, hitBlock)) return;
  addChatMessage('Camp', "🖐️ Nothing to open or interact with here.");
}

const overlay = document.getElementById('overlay');
const touchControls = document.getElementById('touchControls');
let locked = false;
// One-way flag: true the moment the player actually clicks in to play, unlike `overlay.hidden`
// (which flips back and forth for every modal). Gates the back-button trap and the close-tab
// thank-you screen below so neither fires for someone who never got past the front page.
let everStartedPlaying = false;
const nameInput = document.getElementById('nameInput');
nameInput.value = myName==='Player' ? '' : myName;
nameInput.addEventListener('click', e=> e.stopPropagation());
nameInput.addEventListener('touchstart', e=> e.stopPropagation());
nameInput.addEventListener('keydown', e=> e.stopPropagation());
// Troop number and neckerchief color, same stopPropagation reasoning as the name field above —
// otherwise a click here would bubble up into overlay's click-to-play handler.
const troopInput = document.getElementById('troopInput');
troopInput.value = myTroop;
troopInput.addEventListener('click', e=> e.stopPropagation());
troopInput.addEventListener('touchstart', e=> e.stopPropagation());
troopInput.addEventListener('keydown', e=> e.stopPropagation());
const neckerchiefColorInput = document.getElementById('neckerchiefColorInput');
neckerchiefColorInput.value = myNeckerchiefColor;
neckerchiefColorInput.addEventListener('click', e=> e.stopPropagation());
neckerchiefColorInput.addEventListener('input', e=> e.stopPropagation());
// Same reasoning as the name field above: without this, clicking the popcorn link would also bubble
// up into overlay's own click-to-play handler and start the game right underneath the new tab.
const overlayCreditsLink = document.querySelector('#overlay .credits a');
if(overlayCreditsLink) overlayCreditsLink.addEventListener('click', e=> e.stopPropagation());
// The long how-to-play paragraph starts collapsed so the front page reads clean at a glance —
// this just reveals/re-hides it in place, same stopPropagation reasoning as the name field above.
const btnHelp = document.getElementById('btnHelp');
const playHint = document.getElementById('playHint');
if(btnHelp && playHint){
  btnHelp.addEventListener('click', e=>{
    e.stopPropagation();
    playHint.hidden = !playHint.hidden;
    // The same combined hotkey list `H` shows in-game (see toggleHotkeyPanel) doubles as the front
    // page's own hotkey reference — shown/hidden in lockstep with the walkthrough text above.
    hotkeyPanel.hidden = playHint.hidden;
    btnHelp.textContent = playHint.hidden ? '❓ How to play' : '✕ Hide help';
  });
}
// Starting a fresh camp lives on the front page rather than in the middle of play, since that's
// where you'd be deciding how to begin — and it's still reachable mid-game, because Esc brings the
// front page straight back up over the world. Same stopPropagation reasoning as the name field
// above: without it, clicking this would ALSO start the game underneath the confirmation.
const btnReset = document.getElementById('btnReset');
if(btnReset){
  btnReset.addEventListener('click', e=>{ e.stopPropagation(); openResetConfirm(); });
}
if(isTouchDevice){
  document.body.classList.add('touch-device');
  const controlsP = document.getElementById('controlsText');
  if(controlsP) controlsP.innerHTML = 'A tiny Minecraft-inspired voxel sandbox that runs entirely in your browser.<br><br>Left stick: move &nbsp; Drag right side: look<br>⛏ break/attack &nbsp; ▦ place/interact &nbsp; JUMP jump &nbsp; CRAWL hold to crawl &nbsp; 3rd camera &nbsp; 🕐 cycle day/night';
  const tapP = document.getElementById('tapToPlay');
  if(tapP) tapP.innerHTML = '<strong>Tap anywhere to play</strong>';
  const hintP = document.getElementById('playHint');
  if(hintP) hintP.textContent = 'Tap Backpack (B) for your tent, compass and other starting gear, then break blocks to gather materials and place your Crafting Table to craft a campfire, lantern and troop flag. Rabbits and deer are harmless — the moose will fight back if you attack it, and the black bear will attack on sight if you get too close. Progress is saved automatically in this browser.';
  // Portrait doesn't leave enough width for the touch controls — the joystick and action buttons
  // on either side would end up fighting the special-icons row in the middle for the same cramped
  // space — so rather than trying to squeeze a real layout into it, block the whole page (front
  // page included) and ask for landscape outright, same as most mobile games do. innerWidth/
  // innerHeight (not screen.orientation, which iOS Safari doesn't support) so this also reacts
  // correctly to a tablet's split-screen or a resized window.
  const rotateOverlay = document.getElementById('rotateOverlay');
  if(rotateOverlay){
    const checkOrientation = () => { rotateOverlay.hidden = window.innerWidth >= window.innerHeight; };
    window.addEventListener('resize', checkOrientation);
    window.addEventListener('orientationchange', checkOrientation);
    checkOrientation();
  }
}
overlay.addEventListener('click', ()=>{
  ensureAudio();
  if(craftingOpen) return;
  if(!everStartedPlaying){
    everStartedPlaying = true;
    // Traps the browser's back button once play actually begins: a page can't refuse to navigate
    // back outright, but pushing one extra same-page history entry — then re-pushing it every time
    // `popstate` fires — means back/forward never actually leaves; it just lands here again, so this
    // shows the same thank-you/exit screen Quit does instead of silently vanishing.
    try{ history.pushState({scoutcraft:true}, '', location.href); }catch(e){}
    window.addEventListener('popstate', ()=>{
      try{ history.pushState({scoutcraft:true}, '', location.href); }catch(e){}
      if(thankYouScreen.hidden) quitGame();
    });
  }
  const typedName = nameInput.value.trim().slice(0,16);
  if(typedName) myName = typedName;
  try{ localStorage.setItem('scoutcraft_player_name', myName); }catch(e){}
  myTroop = troopInput.value.trim().slice(0,4);
  myNeckerchiefColor = neckerchiefColorInput.value;
  try{
    localStorage.setItem('scoutcraft_player_troop', myTroop);
    localStorage.setItem('scoutcraft_player_neckerchief', myNeckerchiefColor);
  }catch(e){}
  applyUniformCustomization(characterMesh, myTroop, myNeckerchiefColor);
  if(isTouchDevice){
    locked = true;
    overlay.hidden = true;
    touchControls.hidden = false;
  } else {
    // requestPointerLock() can silently fail (browser rate-limiting a rapid re-request, a focus
    // quirk, etc.) without ever firing 'pointerlockchange' — and since that event is the only place
    // `locked`/overlay.hidden normally get set, a failed request used to leave the game stuck at this
    // menu forever: WASD does nothing (updatePlayer is gated on `locked`), while animals, birds and
    // day/night keep animating behind the overlay, which reads just like the game hanging. Catch a
    // rejection and fall back to unblocking movement/attack directly — mouse-look may need one more
    // click to actually engage, but the game is never stuck unresponsive because of it.
    const req = document.body.requestPointerLock();
    if(req && typeof req.catch==='function'){
      req.catch(()=>{
        locked = true;
        overlay.hidden = true;
      });
    }
  }
});
document.addEventListener('pointerlockchange', ()=>{
  if(isTouchDevice) return;
  locked = document.pointerLockElement === document.body;
  overlay.hidden = locked || craftingOpen || itemsOpen || bearBoxOpen || backpackOpen || cookwareOpen;
});
document.addEventListener('mousemove', e=>{
  if(!locked || isTouchDevice) return;
  player.yaw -= e.movementX * 0.0022;
  player.pitch -= e.movementY * 0.0022;
  player.pitch = Math.max(-Math.PI/2+0.01, Math.min(Math.PI/2-0.01, player.pitch));
  // Exactly cancels the player.yaw change above for camera purposes (see peekYaw's own comment) —
  // the camera holds still while the character keeps turning with the mouse.
  if(thirdPerson){
    peekYaw += e.movementX * 0.0022;
    peekTimer = PEEK_HOLD_S;
  }
});
document.addEventListener('contextmenu', e=> e.preventDefault());
document.addEventListener('mousedown', e=>{
  if(!locked || isDead) return;
  if(e.button===0) doAttackOrBreak();
  if(e.button===2) doInteract();
});

// ---------- Touch controls (phones/tablets: virtual joystick, drag-look, action buttons) ----------
if(isTouchDevice){
  const joyBase = document.getElementById('joystickBase');
  const joyKnob = document.getElementById('joystickKnob');
  const maxR = 38;
  let joyTouchId = null, joyCenter = {x:0,y:0};
  function setMoveKeys(forward, strafe, mag){
    keys['KeyW'] = forward > 0.25;
    keys['KeyS'] = forward < -0.25;
    keys['KeyD'] = strafe > 0.25;
    keys['KeyA'] = strafe < -0.25;
    keys['ShiftLeft'] = mag > 0.85;
  }
  function updateJoystick(cx,cy){
    const dx = cx-joyCenter.x, dy = cy-joyCenter.y;
    const dist = Math.hypot(dx,dy);
    const clamped = Math.min(dist, maxR);
    const ang = Math.atan2(dy,dx);
    const kx = Math.cos(ang)*clamped, ky = Math.sin(ang)*clamped;
    joyKnob.style.transform = `translate(${kx}px, ${ky}px)`;
    setMoveKeys(-(ky/maxR), kx/maxR, clamped/maxR);
  }
  function resetJoystick(){
    joyTouchId = null;
    joyKnob.style.transform = 'translate(0px,0px)';
    setMoveKeys(0,0,0);
  }
  joyBase.addEventListener('touchstart', e=>{
    const t = e.changedTouches[0];
    joyTouchId = t.identifier;
    const rect = joyBase.getBoundingClientRect();
    joyCenter = { x: rect.left+rect.width/2, y: rect.top+rect.height/2 };
    updateJoystick(t.clientX, t.clientY);
    e.preventDefault();
  }, {passive:false});
  joyBase.addEventListener('touchmove', e=>{
    for(const t of e.changedTouches) if(t.identifier===joyTouchId) updateJoystick(t.clientX, t.clientY);
    e.preventDefault();
  }, {passive:false});
  joyBase.addEventListener('touchend', e=>{
    for(const t of e.changedTouches) if(t.identifier===joyTouchId) resetJoystick();
  });
  joyBase.addEventListener('touchcancel', resetJoystick);

  const lookZone = document.getElementById('touchLookZone');
  let lookTouchId = null, lastLook = {x:0,y:0};
  lookZone.addEventListener('touchstart', e=>{
    if(craftingOpen) return;
    const t = e.changedTouches[0];
    lookTouchId = t.identifier;
    lastLook = {x:t.clientX, y:t.clientY};
    e.preventDefault();
  }, {passive:false});
  lookZone.addEventListener('touchmove', e=>{
    for(const t of e.changedTouches){
      if(t.identifier===lookTouchId){
        const dx = t.clientX-lastLook.x, dy = t.clientY-lastLook.y;
        lastLook = {x:t.clientX, y:t.clientY};
        player.yaw -= dx*0.0045;
        player.pitch -= dy*0.0045;
        player.pitch = Math.max(-Math.PI/2+0.01, Math.min(Math.PI/2-0.01, player.pitch));
      }
    }
    e.preventDefault();
  }, {passive:false});
  lookZone.addEventListener('touchend', e=>{
    for(const t of e.changedTouches) if(t.identifier===lookTouchId) lookTouchId = null;
  });

  function bindTouchButton(id, onDown, onUp){
    const el = document.getElementById(id);
    el.addEventListener('touchstart', e=>{ e.preventDefault(); e.stopPropagation(); onDown(); }, {passive:false});
    if(onUp) el.addEventListener('touchend', e=>{ e.preventDefault(); e.stopPropagation(); onUp(); }, {passive:false});
  }
  bindTouchButton('btnAttack', ()=>{ if(locked && !craftingOpen && !isDead) doAttackOrBreak(); });
  bindTouchButton('btnPlace', ()=>{ if(locked && !craftingOpen && !isDead) doInteract(); });
  bindTouchButton('btnJump', ()=>{ keys['Space']=true; }, ()=>{ keys['Space']=false; });
  const crawlBtn = document.getElementById('btnCrawl');
  bindTouchButton('btnCrawl', ()=>{ keys['ControlLeft']=true; crawlBtn.classList.add('active'); }, ()=>{ keys['ControlLeft']=false; crawlBtn.classList.remove('active'); });
  bindTouchButton('btn3p', ()=>{ if(locked) thirdPerson = !thirdPerson; });
  bindTouchButton('btnTime', ()=>{ if(locked) cycleTimeMode(); });

  // The Inventory/Backpack/Badges/Share buttons that sit fixed on screen for desktop (#panelButtons,
  // #btnQuit — hidden on touch, see CSS) fold into this one on-demand menu on phones instead, so
  // nothing's left permanently covering the joystick or action buttons. Each row closes the menu
  // itself right after acting, same as tapping anywhere else while a modal is open would.
  const touchMenu = document.getElementById('touchMenu');
  bindTouchButton('btnMenu', ()=>{ touchMenu.hidden = !touchMenu.hidden; });
  bindTouchButton('tmItems', ()=>{ touchMenu.hidden = true; if(locked && !isDead) openItems(); });
  bindTouchButton('tmBackpack', ()=>{ touchMenu.hidden = true; if(locked && !isDead) openBackpackStorage(); });
  bindTouchButton('tmSash', ()=>{ touchMenu.hidden = true; if(locked && !isDead) openSash(); });
  bindTouchButton('tmQuit', ()=>{ touchMenu.hidden = true; if(locked && !isDead) quitGame(); });
  // Ungated, unlike the four above: on touch the front page doesn't come back mid-game, so this
  // menu is the only way in, and wanting a clean start is if anything *more* likely right after
  // dying than before it.
  bindTouchButton('tmReset', ()=>{ touchMenu.hidden = true; openResetConfirm(); });
}

// ---------- Debug panel (Alt+Shift+D) ----------
// A read-only developer overlay: a full census of every block currently in the world (trees, wood,
// leaves, water called out up top, everything else below) plus a grab-bag of other live counts that
// are handy to eyeball while testing. It doesn't pause the game or grab the pointer — it's just an
// overlay, like Minecraft's own F3 screen — and refreshes on a slow timer while open rather than every
// frame, since walking the whole world array is cheap but pointless to redo 60 times a second for
// numbers that only change when someone breaks a block or a worm eats a leaf.
// "Trees" specifically counts live trunk bases — a WOOD block sitting directly on the natural terrain
// surface (heightAt(x,z)+1) — rather than trying to flood-fill distinct trees out of the census, which
// runs into the exact same neighboring-trees-blur problem already noted on checkTreeSupport. This
// undercounts a giant tree as just one tree (correct) and only counts ones with an intact base (also
// what "how many trees are still standing" should mean), at the cost of occasionally miscounting a
// single player-placed wood block that happens to sit exactly at natural ground level as a "tree" —
// an acceptable rough edge for a debug readout, not a scored feature.
let debugPanelOpen = false;
let debugPanelTimer = 0;
function debugBlockName(id){
  if(id===AIR) return 'Air';
  if(id===BEDROCK) return 'Bedrock';
  return BLOCK_NAME[id] || ('Block #'+id);
}
function computeWorldCensus(){
  const counts = new Uint32Array(256);
  for(let i=0;i<world.length;i++) counts[world[i]]++;
  let treeCount = 0;
  for(let x=0;x<WORLD_SIZE;x++){
    for(let z=0;z<WORLD_SIZE;z++){
      const h = heightAt(x,z);
      if(h+1<WORLD_HEIGHT && getBlock(x,h+1,z)===WOOD) treeCount++;
    }
  }
  return { counts, treeCount };
}
function renderDebugPanel(){
  const panel = document.getElementById('debugPanel');
  if(!panel || !debugPanelOpen) return;
  const { counts, treeCount } = computeWorldCensus();
  const rows = [];
  for(let id=1; id<256; id++) if(counts[id]>0) rows.push({ id, name: debugBlockName(id), count: counts[id] });
  rows.sort((a,b)=>b.count-a.count);
  const chunkX = Math.floor(player.pos.x/CHUNK_SIZE), chunkZ = Math.floor(player.pos.z/CHUNK_SIZE);
  const fps = document.getElementById('fps');
  panel.innerHTML = `
    <h3>World census</h3>
    <table>
      <tr><td>🌳 Trees (standing)</td><td>${treeCount.toLocaleString()}</td></tr>
      <tr><td>🪵 Wood if all cut</td><td>${(counts[WOOD]||0).toLocaleString()}</td></tr>
      <tr><td>🍃 Leaves blocks</td><td>${(counts[LEAVES]||0).toLocaleString()}</td></tr>
      <tr><td>💧 Water blocks</td><td>${(counts[WATER]||0).toLocaleString()}</td></tr>
    </table>
    <h3>All block types</h3>
    <table>${rows.map(r=>`<tr><td>${r.name}</td><td>${r.count.toLocaleString()}</td></tr>`).join('')}</table>
    <h3>Live stats</h3>
    <table>
      <tr><td>FPS</td><td>${fps?fps.textContent:'?'}</td></tr>
      <tr><td>Block edits</td><td>${edits.size.toLocaleString()}</td></tr>
      <tr><td>Chunk meshes built</td><td>${chunkMeshes.size} / ${CHUNKS_PER_SIDE*CHUNKS_PER_SIDE}</td></tr>
      <tr><td>Animals</td><td>${animals.length}</td></tr>
      <tr><td>Worms</td><td>${worms.length}</td></tr>
      <tr><td>Butterflies</td><td>${butterflies.length}</td></tr>
      <tr><td>Birds</td><td>${birds.length}</td></tr>
      <tr><td>Fish</td><td>${fish.length}</td></tr>
      <tr><td>Active fires</td><td>${fires.size}</td></tr>
      <tr><td>Falling clusters</td><td>${fallingClusters.length}</td></tr>
      <tr><td>Your position</td><td>${player.pos.x.toFixed(1)}, ${player.pos.y.toFixed(1)}, ${player.pos.z.toFixed(1)}</td></tr>
      <tr><td>Your chunk</td><td>${chunkX}, ${chunkZ}</td></tr>
      <tr><td>World size</td><td>${WORLD_SIZE}×${WORLD_SIZE}×${WORLD_HEIGHT}</td></tr>
    </table>
  `;
}
function toggleDebugPanel(){
  debugPanelOpen = !debugPanelOpen;
  const panel = document.getElementById('debugPanel');
  if(panel) panel.hidden = !debugPanelOpen;
  if(debugPanelOpen){ debugPanelTimer = 0; renderDebugPanel(); }
}

function swatchColor(id){ return '#' + BLOCK_COLOR[id].toString(16).padStart(6,'0'); }

function updateHotbarUI(){
  const el = document.getElementById('hotbar');
  el.innerHTML = '';
  HOTBAR.forEach((b,i)=>{
    const count = invCount(b);
    const slot = document.createElement('div');
    slot.className = 'slot' + (i===selectedSlot ? ' active' : '') + (count<=0 ? ' empty' : '');
    const sw = document.createElement('div');
    sw.className = 'swatch';
    sw.style.background = swatchColor(b);
    slot.appendChild(sw);
    if(HOTBAR_ICON[b]){
      const icon = document.createElement('div');
      icon.className = 'icon';
      icon.textContent = HOTBAR_ICON[b];
      slot.appendChild(icon);
    }
    const key = document.createElement('div');
    key.className='key'; key.textContent = HOTBAR_KEYS[i] ? HOTBAR_KEYS[i].slice(3) : '';
    slot.appendChild(key);
    const count_el = document.createElement('div');
    count_el.className='count'; count_el.textContent = count===Infinity ? '∞' : count;
    slot.appendChild(count_el);
    slot.title = BLOCK_NAME[b] + ' (click again to change)';
    slot.addEventListener('click', ()=>{
      if(selectedSlot===i) openItems();
      else { selectedSlot = i; updateHotbarUI(); updateHeldItemColor(); }
    });
    el.appendChild(slot);
  });
  if(craftingOpen) renderCrafting();
}

