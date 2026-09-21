// ---------- ui-storage.js ----------
// Bear box, cookware, backpack storage, quick-action icons (backpack/workbench/first-aid/stop-bear), camp log/chat.
'use strict';

// ---------- Bear box (fixed camp food storage, up to 100 items total) ----------
// A single shared stash, independent of your own pack, sitting at the cooking area — click an item
// on either side to move one across. Capacity is a combined total across every item type, not
// per-type, same as "1,000 items" reads literally — raised well past its original 100 once the box
// became the camp's whole cooking pantry too (see the pre-stock below: 10 of every raw ingredient per
// recipe that calls for it, ~950 items total before a single player deposit).
const BEAR_BOX_CAPACITY = 1000;
const BEAR_BOX_KEY = 'scoutcraft_bearbox_v1';
const bearBoxStorage = {}; // id -> qty
let bearBoxOpen = false;
function bearBoxTotal(){ return Object.values(bearBoxStorage).reduce((a,b)=>a+b,0); }
function saveBearBox(){
  try{ localStorage.setItem(BEAR_BOX_KEY, JSON.stringify(bearBoxStorage)); }catch(e){}
}
function loadBearBox(){
  try{
    const raw = localStorage.getItem(BEAR_BOX_KEY);
    if(raw){
      const obj = JSON.parse(raw);
      for(const k in obj) bearBoxStorage[k] = obj[k];
      return;
    }
  }catch(e){}
  // First time ever: stock the pantry with every raw ingredient every camp recipe needs — 10 per
  // recipe that calls for it, so something used in 3 different dishes starts with 30 (see
  // COOKWARE_RECIPES). Doesn't touch a bear box that's already been saved once, same "first run only"
  // gate as the Backpack's own starter gear below.
  const counts = {};
  for(const wareKey in COOKWARE_RECIPES){
    for(const recipe of COOKWARE_RECIPES[wareKey]){
      for(const ing of recipe.ingredients) counts[ing] = (counts[ing]||0)+1;
    }
  }
  for(const id in counts) bearBoxStorage[id] = counts[id]*10;
  saveBearBox();
}
function depositToBearBox(id){
  if(invCount(id)<=0 || bearBoxTotal()>=BEAR_BOX_CAPACITY) return;
  invSub(id,1);
  bearBoxStorage[id] = (bearBoxStorage[id]||0)+1;
  saveInventory();
  saveBearBox();
  updateHotbarUI();
  renderBearBox();
}
function withdrawFromBearBox(id){
  if(!bearBoxStorage[id]) return;
  bearBoxStorage[id]--;
  if(bearBoxStorage[id]<=0) delete bearBoxStorage[id];
  invAdd(id,1);
  saveInventory();
  saveBearBox();
  updateHotbarUI();
  renderBearBox();
}
function makeBearBoxTile(id, count, onClick){
  const tile = document.createElement('div');
  tile.className = 'itemTile';
  const sw = document.createElement('div');
  sw.className = 'swatch';
  sw.style.background = swatchColor(id);
  tile.appendChild(sw);
  if(HOTBAR_ICON[id]){
    const icon = document.createElement('div');
    icon.className = 'icon';
    icon.textContent = HOTBAR_ICON[id];
    tile.appendChild(icon);
  }
  const countEl = document.createElement('div');
  countEl.className = 'itemCount';
  countEl.textContent = count===Infinity ? '∞' : count; // an unlimited item (see UNLIMITED_ITEMS)
  tile.appendChild(countEl);
  const label = document.createElement('div');
  label.className = 'itemLabel';
  label.textContent = BLOCK_NAME[id];
  tile.appendChild(label);
  tile.title = `${BLOCK_NAME[id]} — ${count===Infinity ? 'unlimited' : count}`;
  tile.addEventListener('click', onClick);
  return tile;
}
function renderBearBox(){
  document.getElementById('bearBoxCount').textContent = bearBoxTotal();
  const yourGrid = document.getElementById('bearBoxYourGrid');
  const boxGrid = document.getElementById('bearBoxStorageGrid');
  yourGrid.innerHTML = '';
  boxGrid.innerHTML = '';
  // UNLIMITED_ITEMS (Firework, Flint) are never-consumed — storing one away would just eat the
  // box's real capacity for nothing, so they're left out of the deposit side entirely.
  const held = ALL_ITEMS.filter(id => !UNLIMITED_ITEMS.has(id) && invCount(id)>0);
  if(held.length===0){
    const note = document.createElement('div'); note.className = 'bearBoxEmptyNote'; note.textContent = "You aren't carrying anything.";
    yourGrid.appendChild(note);
  } else {
    held.forEach(id => yourGrid.appendChild(makeBearBoxTile(id, invCount(id), ()=> depositToBearBox(id))));
  }
  const stored = Object.keys(bearBoxStorage).map(Number).filter(id => bearBoxStorage[id]>0);
  if(stored.length===0){
    const note = document.createElement('div'); note.className = 'bearBoxEmptyNote'; note.textContent = 'Nothing stored yet.';
    boxGrid.appendChild(note);
  } else {
    stored.forEach(id => boxGrid.appendChild(makeBearBoxTile(id, bearBoxStorage[id], ()=> withdrawFromBearBox(id))));
  }
}
const bearBoxModal = document.getElementById('bearBoxModal');
document.getElementById('bearBoxClose').addEventListener('click', ()=> closeBearBox(true));
bearBoxModal.addEventListener('click', e=>{ if(e.target===bearBoxModal) closeBearBox(true); });
function openBearBox(){
  bearBoxOpen = true;
  bearBoxModal.hidden = false;
  if(document.pointerLockElement) document.exitPointerLock();
  if(isTouchDevice) locked = false;
  overlay.hidden = true;
  renderBearBox();
}
function closeBearBox(relock){
  bearBoxOpen = false;
  bearBoxModal.hidden = true;
  if(relock){
    if(isTouchDevice) locked = true;
    else document.body.requestPointerLock();
  } else if(!isTouchDevice) overlay.hidden = false;
}

// ---------- Cookware: click any Pot/Pan/Dutch Oven/Griddle/Campfire (see BLOCK_TO_WARE_KEY) to try
// cooking one of its secret recipes. Up to 4 ingredients you're already holding go into fixed slots
// (a small array, not a free-form dict like the Bear Box/Backpack above — there's nowhere to browse a
// stash from here, just your own pack on one side and the 4 slots on the other), then Cook! checks
// them against COOKWARE_RECIPES for that cookware as an unordered exact set — extra or missing
// ingredients both miss. Deliberately no ingredient list shown anywhere; opening the window drops one
// hint in the camp chat instead (see openCookware) and the rest is trial and error.
let cookwareOpen = false;
let cookwareWareKey = null;
const cookwareSlots = [null, null, null, null]; // each an item id or null
const DISH_HUNGER_RESTORE = 6; // every dish restores the same amount — a real meal, better than a snack
for(const id of ALL_DISH_IDS) FOOD_RESTORE[id] = DISH_HUNGER_RESTORE;
function addToCookware(id){
  const slot = cookwareSlots.indexOf(null);
  if(slot<0 || invCount(id)<=0) return;
  invSub(id,1);
  cookwareSlots[slot] = id;
  saveInventory();
  updateHotbarUI();
  renderCookware();
}
function removeFromCookware(slotIdx){
  const id = cookwareSlots[slotIdx];
  if(id==null) return;
  invAdd(id,1);
  cookwareSlots[slotIdx] = null;
  saveInventory();
  updateHotbarUI();
  renderCookware();
}
// Escalating help for a Scout who keeps missing. The recipes stay hidden on purpose (see
// COOKWARE_DISH_DEFS), but hidden shouldn't mean stuck forever, so consecutive misses at one
// cookware walk up a ladder: which dish they're closest to, then an ingredient it's still short,
// then the whole recipe spelled out. Cooking anything on that cookware clears the streak, so the
// ladder only ever shows up when someone is genuinely stuck rather than just experimenting.
const COOK_HINT_WARMER = 3, COOK_HINT_INGREDIENT = 5, COOK_HINT_FULL = 7;
const cookFailStreak = {};  // wareKey -> consecutive misses
const cookHintTarget = {};  // wareKey -> the dish id the ladder is walking toward
const cookHintText = {};    // wareKey -> the standing hint, kept on the panel so it's re-readable
// Locks onto one dish for the whole ladder, so hint 2 builds on hint 1 instead of pointing at a
// different dish every time. Picks whatever the attempt was closest to; fewest ingredients breaks
// ties, which doubles as picking the easiest dish on the board when nothing loaded matches anything.
function cookHintDish(wareKey, used){
  const recipes = COOKWARE_RECIPES[wareKey];
  const locked = recipes.find(r => r.id===cookHintTarget[wareKey]);
  if(locked) return locked;
  let best = null, bestOverlap = -1;
  for(const r of recipes){
    const overlap = r.ingredients.filter(i => used.includes(i)).length;
    if(overlap > bestOverlap || (overlap===bestOverlap && r.ingredients.length < best.ingredients.length)){
      best = r; bestOverlap = overlap;
    }
  }
  cookHintTarget[wareKey] = best.id;
  return best;
}
function cookHint(wareKey, used){
  const dish = cookHintDish(wareKey, used);
  const icon = HOTBAR_ICON[dish.id] || '';
  const streak = cookFailStreak[wareKey];
  const have = dish.ingredients.filter(i => used.includes(i));
  const missing = dish.ingredients.filter(i => !used.includes(i));
  if(streak >= COOK_HINT_FULL){
    return `${icon} Here's the whole thing: ${dish.name} is ${dish.ingredients.map(i=>BLOCK_NAME[i]).join(' + ')}.`;
  }
  if(streak >= COOK_HINT_INGREDIENT && missing.length){
    return `${icon} ${dish.name} still needs ${BLOCK_NAME[missing[0]]}.`;
  }
  if(!have.length) return `${icon} Try for ${dish.name} — it takes ${dish.ingredients.length} ingredients.`;
  return `${icon} Closest to ${dish.name} — ${have.length} of its ${dish.ingredients.length} ingredients are in there.`;
}
function tryCookRecipe(){
  const used = cookwareSlots.filter(x=>x!=null);
  if(used.length===0) return;
  const sortedUsed = [...used].sort((a,b)=>a-b);
  const match = COOKWARE_RECIPES[cookwareWareKey].find(r=>{
    const sortedRecipe = [...r.ingredients].sort((a,b)=>a-b);
    return sortedRecipe.length===sortedUsed.length && sortedRecipe.every((v,i)=>v===sortedUsed[i]);
  });
  if(!match){
    cookFailStreak[cookwareWareKey] = (cookFailStreak[cookwareWareKey]||0) + 1;
    addChatMessage('Camp', "🍳 That doesn't look like any recipe anyone's ever heard of.");
    if(cookFailStreak[cookwareWareKey] >= COOK_HINT_WARMER){
      cookHintText[cookwareWareKey] = cookHint(cookwareWareKey, used);
      addChatMessage('Camp', cookHintText[cookwareWareKey]);
      renderCookware();
    }
    return;
  }
  cookFailStreak[cookwareWareKey] = 0;
  delete cookHintTarget[cookwareWareKey];
  delete cookHintText[cookwareWareKey];
  for(let i=0;i<cookwareSlots.length;i++) cookwareSlots[i] = null; // spent, not returned — unlike closing the window
  invAdd(match.id, 1);
  saveInventory();
  updateHotbarUI();
  SFX.craft();
  addChatMessage('Camp', `${HOTBAR_ICON[match.id]} You cooked up ${match.name}!`);
  Scout.cookedOn(cookwareWareKey);
  renderCookware();
}
function renderCookware(){
  const info = COOKWARE_INFO[cookwareWareKey];
  const title = document.getElementById('cookwareTitle');
  if(title) title.textContent = `${info.emoji} ${info.name}`;
  // Names only, never ingredients — see COOKWARE_DISH_DEFS's own note on why the recipe itself
  // stays hidden. Knowing what's possible on this cookware is a fair signpost; how to make it is
  // still the whole point of poking around the Bear Box and checking back for chat hints.
  const hintEl = document.getElementById('cookwareHint');
  if(hintEl){
    const standing = cookHintText[cookwareWareKey];
    hintEl.textContent = standing || '';
    hintEl.hidden = !standing;
  }
  const dishList = document.getElementById('cookwareDishList');
  if(dishList){
    dishList.innerHTML = '';
    for(const dish of COOKWARE_RECIPES[cookwareWareKey]){
      const chip = document.createElement('span');
      chip.className = 'dishChip';
      chip.textContent = `${HOTBAR_ICON[dish.id]||''} ${dish.name}`;
      dishList.appendChild(chip);
    }
  }
  const yourGrid = document.getElementById('cookwareYourGrid');
  const slotsGrid = document.getElementById('cookwareSlotsGrid');
  yourGrid.innerHTML = '';
  slotsGrid.innerHTML = '';
  const held = ALL_ITEMS.filter(id => !UNLIMITED_ITEMS.has(id) && invCount(id)>0);
  if(held.length===0){
    const note = document.createElement('div'); note.className = 'bearBoxEmptyNote'; note.textContent = "You aren't holding any ingredients.";
    yourGrid.appendChild(note);
  } else {
    held.forEach(id => yourGrid.appendChild(makeBearBoxTile(id, invCount(id), ()=> addToCookware(id))));
  }
  for(let i=0;i<cookwareSlots.length;i++){
    const id = cookwareSlots[i];
    if(id==null){
      const empty = document.createElement('div'); empty.className = 'cookwareSlotEmpty'; empty.textContent = '+';
      slotsGrid.appendChild(empty);
    } else {
      slotsGrid.appendChild(makeBearBoxTile(id, 1, ()=> removeFromCookware(i)));
    }
  }
}
const cookwareModal = document.getElementById('cookwareModal');
document.getElementById('cookwareClose').addEventListener('click', ()=> closeCookware(true));
document.getElementById('cookwareCookBtn').addEventListener('click', tryCookRecipe);
cookwareModal.addEventListener('click', e=>{ if(e.target===cookwareModal) closeCookware(true); });
function openCookware(wareKey){
  cookwareOpen = true;
  cookwareWareKey = wareKey;
  cookwareModal.hidden = false;
  if(document.pointerLockElement) document.exitPointerLock();
  if(isTouchDevice) locked = false;
  overlay.hidden = true;
  // One hint per visit, not the recipe itself — a single random ingredient off a random recipe for
  // this cookware, so checking back in keeps being (a little) useful without spelling anything out.
  const recipes = COOKWARE_RECIPES[wareKey];
  const pick = recipes[Math.floor(Math.random()*recipes.length)];
  const ing = pick.ingredients[Math.floor(Math.random()*pick.ingredients.length)];
  addChatMessage('Camp', `${COOKWARE_INFO[wareKey].emoji} Hint: one of the ${COOKWARE_INFO[wareKey].name} recipes uses ${BLOCK_NAME[ing]}.`);
  renderCookware();
}
function closeCookware(relock){
  // The 4 slots are just a staging area, not real storage — anything still sitting in one when you
  // close goes straight back to your pack instead of being lost.
  for(let i=0;i<cookwareSlots.length;i++){
    if(cookwareSlots[i]!=null){ invAdd(cookwareSlots[i],1); cookwareSlots[i]=null; }
  }
  saveInventory();
  updateHotbarUI();
  cookwareOpen = false;
  cookwareModal.hidden = true;
  if(relock){
    if(isTouchDevice) locked = true;
    else document.body.requestPointerLock();
  } else if(!isTouchDevice) overlay.hidden = false;
}

// ---------- Backpack storage (your own pack, 20 slots — one per distinct item type) ----------
// Unlike the Bear Box's single combined count, this caps the number of different item TYPES it can
// hold at once, not the total quantity — one slot per type, unlimited within that slot, same as your
// own hotbar/inventory already work. It's a personal stash rather than a camp-wide one, so it starts
// pre-packed with the Scout's 10 Essentials (the real BSA list) plus a Scoutbook, instead of empty.
const BACKPACK_SLOTS = 20;
const BACKPACK_KEY = 'scoutcraft_backpack_v1';
// Fire starter and map-and-compass are the two of the ten that are already real, functional items
// elsewhere in the game (Flint ignites fires, Compass takes a bearing) — reused here rather than
// invented twice.
const SCOUT_ESSENTIALS = [POCKETKNIFE, FIRST_AID_KIT, EXTRA_CLOTHING, RAIN_GEAR, WATER_BOTTLE,
  FLASHLIGHT, TRAIL_FOOD, FLINT, SUN_PROTECTION, COMPASS];
// Beyond the 10 Essentials proper: the rest of a scout's basic camp kit, pre-packed the same way.
// Tent no longer has a recipe (see RECIPES) — this is its only source now. Rope keeps its own
// recipe too (see RECIPES), so this is just a starting supply on top of what you can still twist
// from leaves yourself.
const STARTER_CAMP_GEAR = [TENT, SLEEPING_BAG, SLEEPING_PAD, ROPE];
const backpackStorage = {}; // id -> qty
let backpackOpen = false;
function backpackSlotCount(){ return Object.keys(backpackStorage).filter(id=>backpackStorage[id]>0).length; }
function saveBackpackStorage(){
  try{ localStorage.setItem(BACKPACK_KEY, JSON.stringify(backpackStorage)); }catch(e){}
}
function loadBackpackStorage(){
  try{
    const raw = localStorage.getItem(BACKPACK_KEY);
    if(raw){
      const obj = JSON.parse(raw);
      for(const k in obj) backpackStorage[k] = obj[k];
      return;
    }
  }catch(e){}
  // First time ever: pack it before the player even opens it.
  for(const id of SCOUT_ESSENTIALS) backpackStorage[id] = 1;
  for(const id of STARTER_CAMP_GEAR) backpackStorage[id] = 1;
  backpackStorage[SCOUTBOOK] = 1;
  saveBackpackStorage();
}
function depositToBackpackStorage(id){
  if(invCount(id)<=0) return;
  if(!backpackStorage[id] && backpackSlotCount()>=BACKPACK_SLOTS) return; // no free slot for a new type
  invSub(id,1);
  backpackStorage[id] = (backpackStorage[id]||0)+1;
  saveInventory();
  saveBackpackStorage();
  updateHotbarUI();
  renderBackpackStorage();
}
function withdrawFromBackpackStorage(id){
  if(!backpackStorage[id]) return;
  backpackStorage[id]--;
  if(backpackStorage[id]<=0) delete backpackStorage[id];
  invAdd(id,1);
  saveInventory();
  saveBackpackStorage();
  updateHotbarUI();
  renderBackpackStorage();
}
function renderBackpackStorage(){
  document.getElementById('backpackCount').textContent = `${backpackSlotCount()}/${BACKPACK_SLOTS}`;
  const yourGrid = document.getElementById('backpackYourGrid');
  const packGrid = document.getElementById('backpackStorageGrid');
  yourGrid.innerHTML = '';
  packGrid.innerHTML = '';
  const held = ALL_ITEMS.filter(id => !UNLIMITED_ITEMS.has(id) && invCount(id)>0);
  if(held.length===0){
    const note = document.createElement('div'); note.className = 'bearBoxEmptyNote'; note.textContent = "You aren't carrying anything.";
    yourGrid.appendChild(note);
  } else {
    held.forEach(id => yourGrid.appendChild(makeBearBoxTile(id, invCount(id), ()=> depositToBackpackStorage(id))));
  }
  const stored = Object.keys(backpackStorage).map(Number).filter(id => backpackStorage[id]>0);
  if(stored.length===0){
    const note = document.createElement('div'); note.className = 'bearBoxEmptyNote'; note.textContent = 'Empty slots.';
    packGrid.appendChild(note);
  } else {
    stored.forEach(id => packGrid.appendChild(makeBearBoxTile(id, backpackStorage[id], ()=> withdrawFromBackpackStorage(id))));
  }
}
const backpackModal = document.getElementById('backpackModal');
document.getElementById('backpackClose').addEventListener('click', ()=> closeBackpackStorage(true));
backpackModal.addEventListener('click', e=>{ if(e.target===backpackModal) closeBackpackStorage(true); });
function openBackpackStorage(){
  backpackOpen = true;
  backpackModal.hidden = false;
  if(document.pointerLockElement) document.exitPointerLock();
  if(isTouchDevice) locked = false;
  overlay.hidden = true;
  renderBackpackStorage();
}
function closeBackpackStorage(relock){
  backpackOpen = false;
  backpackModal.hidden = true;
  if(relock){
    if(isTouchDevice) locked = true;
    else document.body.requestPointerLock();
  } else if(!isTouchDevice) overlay.hidden = false;
}
document.getElementById('btnBackpack').addEventListener('click', ()=>{ if(locked && !isDead) openBackpackStorage(); });

// ---------- Special function icons (Backpack, Camp Workbench, First Aid, Stop Bear) ----------
// A small fixed cluster to the left of the hotbar — always the same four actions, never swapped out
// for an item the way an ordinary hotbar slot can be.
const FIRST_AID_HEAL_HP = 2 * HP_PER_HEART; // 2 hearts
const FIRST_AID_COOLDOWN_S = 10;
const STOP_BEAR_COOLDOWN_S = 3;
let firstAidCooldown = 0, stopBearCooldown = 0;
// Named so the keydown handler below and the on-screen icon's click both call the exact same logic
// rather than duplicating it — Backpack and Camp Workbench already had B/E, these are the two new ones.
function useQuickBackpack(){
  if(locked && !isDead) openBackpackStorage();
}
function useQuickWorkbench(){
  if(!locked || isDead) return;
  if(nearestCraftingTable(4)) openCrafting();
  else addChatMessage('Camp', '🛠️ You need to be near your Camp Workbench to craft.');
}
function useFirstAid(){
  if(!locked || isDead) return;
  if(firstAidCooldown>0){
    addChatMessage('Camp', `➕ First Aid is still resting — ${Math.ceil(firstAidCooldown)}s.`);
    return;
  }
  if(myHP >= PLAYER_MAX_HP){
    addChatMessage('Camp', "➕ You're already at full health.");
    return;
  }
  myHP = Math.min(PLAYER_MAX_HP, myHP + FIRST_AID_HEAL_HP);
  updateHeartsUI();
  firstAidCooldown = FIRST_AID_COOLDOWN_S;
  Scout.bump('firstAidUses');
  saveScoutProgress();
  SFX.craft();
  addChatMessage('Camp', '➕ First Aid: patched up a couple hearts.');
}
const stopBearBanner = document.getElementById('stopBearBanner');
let stopBearBannerTimer = null;
function useStopBear(){
  if(!locked || isDead) return;
  if(stopBearCooldown>0){
    addChatMessage('Camp', `🐻🚫 Give it a moment — ${Math.ceil(stopBearCooldown)}s.`);
    return;
  }
  stopBearCooldown = STOP_BEAR_COOLDOWN_S;
  SFX.scareShout();
  stopBearBanner.hidden = false;
  if(stopBearBannerTimer) clearTimeout(stopBearBannerTimer);
  stopBearBannerTimer = setTimeout(()=>{ stopBearBanner.hidden = true; }, 1600);
  const scared = scareHostileAnimalsNear(player.pos.x, player.pos.z, STOP_BEAR_RADIUS);
  addChatMessage('Camp', scared>0
    ? `🐻🚫 GO AWAY! ${scared>1?'They run':'It runs'} off.`
    : "🐻🚫 GO AWAY! ...nothing dangerous was close enough to hear you.");
}
document.getElementById('btnQuickBackpack').addEventListener('click', useQuickBackpack);
document.getElementById('btnQuickWorkbench').addEventListener('click', useQuickWorkbench);
document.getElementById('btnQuickFirstAid').addEventListener('click', useFirstAid);
document.getElementById('btnStopBear').addEventListener('click', useStopBear);
document.getElementById('btnQuickHand').addEventListener('click', useHand);

// ---------- Camp log ----------
// A small on-screen message log for local feedback (cooking hints, sleep, badge-adjacent tips) —
// there's no chat to send here, single-player has no one else to send it to.
const CHAT_DISPLAY_LIMIT = 8; // how many recent lines actually stay on screen
const chatMessages = [];
const chatLogEl = document.getElementById('chatLog');
function escapeHtml(s){
  return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);
}
function renderChatLog(){
  chatLogEl.innerHTML = chatMessages.slice(-CHAT_DISPLAY_LIMIT)
    .map(m => `<div class="chatLine"><b>${escapeHtml(m.name)}:</b> ${escapeHtml(m.text)}</div>`).join('');
  chatLogEl.scrollTop = chatLogEl.scrollHeight;
}
function addChatMessage(name, text){
  chatMessages.push({ name, text });
  if(chatMessages.length > CHAT_DISPLAY_LIMIT*4) chatMessages.shift();
  renderChatLog();
}

