// ---------- ui-menus.js ----------
// Crafting modal, items panel, quit/thank-you screen, achievement share image + share links.
'use strict';

// ---------- Crafting UI ----------
let craftingOpen = false;
const craftingModal = document.getElementById('craftingModal');
const craftHint = document.getElementById('craftHint');
const fishingHint = document.getElementById('fishingHint');
const meditateHint = document.getElementById('meditateHint');
document.getElementById('craftingClose').addEventListener('click', ()=> closeCrafting(true));
craftingModal.addEventListener('click', e=>{ if(e.target===craftingModal) closeCrafting(true); });

function openCrafting(){
  craftingOpen = true;
  craftingModal.hidden = false;
  if(document.pointerLockElement) document.exitPointerLock();
  if(isTouchDevice) locked = false;
  overlay.hidden = true;
  renderCrafting();
}
function closeCrafting(relock){
  craftingOpen = false;
  craftingModal.hidden = true;
  if(relock){
    if(isTouchDevice) locked = true;
    else document.body.requestPointerLock();
  } else if(!isTouchDevice) overlay.hidden = false;
}
function renderCrafting(){
  const invEl = document.getElementById('craftingInventory');
  invEl.innerHTML = '';
  const held = Object.keys(inventory).map(Number).filter(id => invCount(id)>0);
  if(held.length===0){
    invEl.innerHTML = '<span style="opacity:0.6">Nothing yet — break some blocks to gather materials.</span>';
  } else {
    held.forEach(id=>{
      const row = document.createElement('div');
      row.className = 'invItem';
      const countText = invCount(id)===Infinity ? '∞' : invCount(id);
      row.innerHTML = `<span class="sw" style="background:${swatchColor(id)}"></span>${BLOCK_NAME[id]} × ${countText}`;
      invEl.appendChild(row);
    });
  }

  const recEl = document.getElementById('craftingRecipes');
  recEl.innerHTML = '';
  RECIPES.forEach((r,i)=>{
    const ok = canCraft(r);
    const row = document.createElement('div');
    row.className = 'recipe';
    const needText = r.in.map(ing => `${ing.qty} ${BLOCK_NAME[ing.id]} (have ${invCount(ing.id)})`).join(', ');
    row.innerHTML = `
      <span class="sw" style="background:${swatchColor(r.out.id)}"></span>
      <div class="info"><b>${r.name} × ${r.out.qty}</b><span class="need${ok?'':' short'}">Needs: ${needText}</span></div>
    `;
    const btn = document.createElement('button');
    btn.textContent = 'Craft';
    btn.disabled = !ok;
    btn.addEventListener('click', ()=>{ craft(r); renderCrafting(); });
    row.appendChild(btn);
    recEl.appendChild(row);
  });
}

// ---------- Items panel (pick what goes in the currently-selected hotbar slot) ----------
let itemsOpen = false;
const itemsModal = document.getElementById('itemsModal');
document.getElementById('itemsClose').addEventListener('click', ()=> closeItems(true));
itemsModal.addEventListener('click', e=>{ if(e.target===itemsModal) closeItems(true); });
document.getElementById('btnItems').addEventListener('click', ()=>{ if(locked && !isDead) openItems(); });
const sashModalEl = document.getElementById('sashModal');
if(sashModalEl){
  document.getElementById('sashClose').addEventListener('click', ()=> closeSash(true));
  sashModalEl.addEventListener('click', e=>{ if(e.target===sashModalEl) closeSash(true); });
  document.getElementById('btnSash').addEventListener('click', ()=>{ if(locked && !isDead) openSash(); });
}

// ---------- Quit / thank-you screen ----------
// Clicking "Share My Achievements" unlocks the mouse and swaps in a full-screen thank-you screen with
// Andre's popcorn fundraiser link. Also reused (see the back-button trap and beforeunload handler
// below) so pressing back or canceling a close prompt lands on this same screen instead of a page
// that just silently vanishes or snaps back to raw gameplay. World/inventory/badge progress is
// already saved continuously during play, so there's nothing extra to do on the way out; "Keep
// playing instead" just puts the overlay away again.
const thankYouScreen = document.getElementById('thankYouScreen');
// ---- Sharing: the game's own URL plus a one-line brag about badges earned so far ----
// location.origin+pathname (not the full href) so a stray query string or #hash from however the
// page was opened never rides along into a shared link.
function shareGameUrl(){ return location.origin + location.pathname; }
function shareBadgeSummary(){
  const count = earnedBadges.size, total = BADGES.length;
  if(count===0) return "🏕️ I'm playing ScoutCraft, a scouting-themed voxel building game!";
  const emojis = BADGES.filter(b=>earnedBadges.has(b.id)).map(b=>b.emoji).join('');
  return `🏕️ I'm a ${rankFor(count)} in ScoutCraft with ${count}/${total} merit badges: ${emojis}`;
}
// Draws a small rounded-rect path (canvas has no cross-browser roundRect yet) reused by every tile
// in the achievement card below.
function roundRectPath(ctx,x,y,w,h,r){
  ctx.beginPath();
  ctx.moveTo(x+r,y);
  ctx.arcTo(x+w,y,x+w,y+h,r);
  ctx.arcTo(x+w,y+h,x,y+h,r);
  ctx.arcTo(x,y+h,x,y,r);
  ctx.arcTo(x,y,x+w,y,r);
  ctx.closePath();
}
// Draws text centered on (cx,y), wrapping onto up to maxLines lines of lineH each if it doesn't fit
// maxWidth — used below so a long badge name (Horseback Riding, Scuba Diving) never overflows its
// tile now that tiles are narrower than the original 4-column layout.
function fillWrappedText(ctx, text, cx, y, maxWidth, lineH, maxLines){
  const words = text.split(' ');
  const lines = [];
  let line = '';
  for(const w of words){
    const test = line ? line+' '+w : w;
    if(ctx.measureText(test).width > maxWidth && line){ lines.push(line); line = w; }
    else line = test;
  }
  if(line) lines.push(line);
  if(lines.length > maxLines) lines.length = maxLines;
  const startY = y - (lines.length-1)*lineH/2;
  lines.forEach((l,i)=> ctx.fillText(l, cx, startY+i*lineH));
}
// A shareable "trading card" of the player's name, rank, and every merit badge, earned ones lit up
// and the rest dimmed — same visual language as the in-game sash (see renderSash) so it feels like a
// snapshot of that screen rather than a separate design. A wide, short grid (6 columns) rather than
// the original narrow, tall one so the card pairs sensibly with a share-button column beside it
// instead of towering over the page on its own.
function buildAchievementCanvas(){
  const cols = 6, rows = Math.ceil(BADGES.length/cols);
  const margin = 26, tileW = 148, tileH = 104, gap = 10;
  const headerH = 222, footerH = 40;
  const width = margin*2 + cols*tileW + (cols-1)*gap;
  const height = headerH + rows*tileH + (rows-1)*gap + footerH;
  const canvas = document.createElement('canvas');
  canvas.width = width; canvas.height = height;
  const ctx = canvas.getContext('2d');

  const bg = ctx.createLinearGradient(0,0,0,height);
  bg.addColorStop(0,'#24402a'); bg.addColorStop(1,'#0e1a0e');
  ctx.fillStyle = bg; ctx.fillRect(0,0,width,height);
  ctx.strokeStyle = '#c8a44d'; ctx.lineWidth = 5;
  ctx.strokeRect(3,3,width-6,height-6);

  // A front-on render of the player's own character, left of the header text — see
  // drawAvatarPortrait for why this needs its own throwaway THREE scene rather than reusing the
  // live characterMesh.
  drawAvatarPortrait(ctx, margin, (headerH-200)/2, 100, 200);

  // Header text stack — generously spaced (each line's gap sized to the fonts on either side of it)
  // rather than packed tight, so title/name/rank/count read as separate lines at a glance.
  ctx.textAlign = 'center';
  ctx.fillStyle = '#f2e9d8';
  ctx.font = 'bold 26px sans-serif';
  ctx.fillText('🏕️ ScoutCraft', width/2, 32);

  ctx.fillStyle = '#c8e0a8';
  ctx.font = 'bold 20px sans-serif';
  ctx.fillText(myName, width/2, 68);

  const count = earnedBadges.size, total = BADGES.length;
  drawRankBadge(ctx, width/2, 110, 22, rankIndexFor(count));
  ctx.fillStyle = '#e8c46a';
  ctx.font = 'bold 34px sans-serif';
  ctx.fillText(rankFor(count), width/2, 164);

  ctx.fillStyle = '#c8e0a8';
  ctx.font = '17px sans-serif';
  ctx.fillText(`${count} of ${total} Merit Badges Earned`, width/2, 196);

  BADGES.forEach((b,i)=>{
    const col = i%cols, row = Math.floor(i/cols);
    const x = margin + col*(tileW+gap), y = headerH + row*(tileH+gap);
    const got = earnedBadges.has(b.id);
    roundRectPath(ctx, x, y, tileW, tileH, 10);
    ctx.fillStyle = got ? 'rgba(200,164,77,0.18)' : 'rgba(255,255,255,0.05)';
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = got ? '#c8a44d' : 'rgba(255,255,255,0.12)';
    ctx.stroke();
    ctx.globalAlpha = got ? 1 : 0.35;
    ctx.font = '30px sans-serif';
    ctx.fillStyle = '#fff';
    ctx.fillText(b.emoji, x+tileW/2, y+34);
    ctx.globalAlpha = 1;
    ctx.font = 'bold 12px sans-serif';
    ctx.fillStyle = got ? '#f0dfa8' : 'rgba(240,223,168,0.55)';
    fillWrappedText(ctx, b.name, x+tileW/2, y+78, tileW-16, 15, 2);
  });

  ctx.fillStyle = 'rgba(242,233,216,0.75)';
  ctx.font = '14px sans-serif';
  ctx.fillText(shareGameUrl(), width/2, height-14);

  return canvas;
}
const shareNativeBtn = document.getElementById('shareNative');
const shareFacebookLink = document.getElementById('shareFacebook');
const shareXLink = document.getElementById('shareX');
const shareInstagramBtn = document.getElementById('shareInstagram');
const shareMessageLink = document.getElementById('shareMessage');
const shareEmailLink = document.getElementById('shareEmail');
const shareCopiedNote = document.getElementById('shareCopiedNote');
const achievementImg = document.getElementById('achievementImg');
const downloadAchievementLink = document.getElementById('downloadAchievement');
let achievementBlob = null, achievementObjectUrl = null;
// Regenerated fresh each time the quit screen opens (see refreshShareLinks) so the picture always
// reflects whatever badges are actually earned by the moment the player quits, not a stale snapshot.
function refreshAchievementImage(){
  buildAchievementCanvas().toBlob(blob=>{
    if(!blob) return;
    if(achievementObjectUrl) URL.revokeObjectURL(achievementObjectUrl);
    achievementBlob = blob;
    achievementObjectUrl = URL.createObjectURL(blob);
    achievementImg.src = achievementObjectUrl;
    downloadAchievementLink.href = achievementObjectUrl;
  }, 'image/png');
}
function achievementFile(){
  return achievementBlob ? new File([achievementBlob], 'scoutcraft-badges.png', { type:'image/png' }) : null;
}
// Refreshed every time the quit screen opens, not just once at load, so the badge count in every
// link is always whatever's actually been earned by the moment the player quits.
function refreshShareLinks(){
  const text = shareBadgeSummary(), url = shareGameUrl();
  shareFacebookLink.href = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`;
  shareXLink.href = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`;
  shareMessageLink.href = `sms:?&body=${encodeURIComponent(text+' '+url)}`;
  shareEmailLink.href = `mailto:?subject=${encodeURIComponent('Check out ScoutCraft!')}&body=${encodeURIComponent(text+'\n\n'+url)}`;
  // Web Share API isn't available on every browser (mainly a mobile/HTTPS thing) — the button only
  // shows up where it'll actually work, since the explicit per-platform links above always work.
  shareNativeBtn.hidden = !navigator.share;
  refreshAchievementImage();
}
shareNativeBtn.addEventListener('click', ()=>{
  const text = shareBadgeSummary(), url = shareGameUrl(), file = achievementFile();
  if(file && navigator.canShare && navigator.canShare({ files:[file] })){
    navigator.share({ title:'ScoutCraft', text:text+' '+url, files:[file] }).catch(()=>{});
  } else {
    navigator.share({ title:'ScoutCraft', text, url }).catch(()=>{});
  }
});
// Instagram has no web "share to Instagram" link the way Facebook/X do — on a phone with Instagram
// installed, the native share sheet (which lists Instagram as one of its targets, and can carry the
// badge picture as an attached file) is the real way in, so this defers to that when it's available;
// otherwise it just copies the caption text, and the player attaches the already-downloadable image
// by hand.
shareInstagramBtn.addEventListener('click', async ()=>{
  const text = shareBadgeSummary(), url = shareGameUrl(), file = achievementFile();
  if(file && navigator.canShare && navigator.canShare({ files:[file] })){
    navigator.share({ title:'ScoutCraft', text:text+' '+url, files:[file] }).catch(()=>{});
    return;
  }
  if(navigator.share){ navigator.share({ title:'ScoutCraft', text, url }).catch(()=>{}); return; }
  try{
    await navigator.clipboard.writeText(text+' '+url);
    shareCopiedNote.hidden = false;
    setTimeout(()=> shareCopiedNote.hidden = true, 4000);
  }catch(e){
    try{ window.prompt('Copy this to share on Instagram:', text+' '+url); }catch(e2){}
  }
});
function quitGame(){
  if(document.pointerLockElement) document.exitPointerLock();
  locked = false;
  refreshShareLinks();
  thankYouScreen.hidden = false;
}
function keepPlaying(){
  thankYouScreen.hidden = true;
  if(isTouchDevice) locked = true;
  else document.body.requestPointerLock();
}
document.getElementById('btnQuit').addEventListener('click', ()=>{ if(locked && !isDead) quitGame(); });
document.getElementById('btnKeepPlaying').addEventListener('click', keepPlaying);

// ---------- "Start over" confirmation ----------
// Erasing a camp is the only thing in the game that can't be undone and can't be re-earned by
// playing on, so it always asks first, spells out item by item what's about to go (a bare "are you
// sure?" leaves people finding out afterwards what "reset" actually covered), and makes backing out
// the easy path: Esc, the backdrop and the Cancel button all mean no, and only the one explicitly
// labelled button goes through with it.
let resetConfirmOpen = false;
const resetModal = document.getElementById('resetModal');
// Whether the front page was up when this was opened, so canceling returns them exactly where they
// came from: the overlay on desktop (its only entry point there), or straight back into play on
// touch, where the in-game ☰ menu is the other way in.
let resetCameFromOverlay = false;
function openResetConfirm(){
  if(!resetModal) return;
  resetCameFromOverlay = !overlay.hidden;
  resetConfirmOpen = true;
  resetModal.hidden = false;
  if(document.pointerLockElement) document.exitPointerLock();
  if(isTouchDevice) locked = false;
  overlay.hidden = true;
}
function closeResetConfirm(){
  if(!resetModal) return;
  resetConfirmOpen = false;
  resetModal.hidden = true;
  if(resetCameFromOverlay) overlay.hidden = false;
  else if(isTouchDevice) locked = true;
}
if(resetModal){
  document.getElementById('resetCancel').addEventListener('click', closeResetConfirm);
  document.getElementById('resetConfirmBtn').addEventListener('click', resetAllProgress);
  resetModal.addEventListener('click', e=>{ if(e.target===resetModal) closeResetConfirm(); });
}
function openItems(){
  itemsOpen = true;
  itemsModal.hidden = false;
  if(document.pointerLockElement) document.exitPointerLock();
  if(isTouchDevice) locked = false;
  overlay.hidden = true;
  renderItemsGrid();
}
function closeItems(relock){
  itemsOpen = false;
  itemsModal.hidden = true;
  if(relock){
    if(isTouchDevice) locked = true;
    else document.body.requestPointerLock();
  } else if(!isTouchDevice) overlay.hidden = false;
}
function makeItemTile(id){
  const count = invCount(id);
  const tile = document.createElement('div');
  tile.className = 'itemTile' + (HOTBAR[selectedSlot]===id ? ' active' : '') + (count<=0 ? ' empty' : '');
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
  countEl.textContent = count===Infinity ? '∞' : (count>0 ? count : '');
  tile.appendChild(countEl);
  const label = document.createElement('div');
  label.className = 'itemLabel';
  label.textContent = BLOCK_NAME[id];
  tile.appendChild(label);
  const countText = count===Infinity ? ' — unlimited' : (count>0 ? ` — you have ${count}` : ' — you have none yet');
  // Meat is food, not a block/tool you'd ever want to select into a hotbar slot — clicking it here
  // eats it on the spot (same tryEatMeat used when you right-click it from the hotbar), so resolving
  // hunger doesn't require first freeing up a slot and switching to it.
  const isFood = id===MEAT || id===COOKED_MEAT;
  tile.title = isFood ? BLOCK_NAME[id] + countText + ' — click to eat' : BLOCK_NAME[id] + countText;
  tile.addEventListener('click', ()=>{
    if(isFood){
      tryEatFood(id);
      renderItemsGrid();
      return;
    }
    HOTBAR[selectedSlot] = id;
    saveHotbar();
    updateHotbarUI();
    updateHeldItemColor();
    renderItemsGrid();
  });
  return tile;
}
function renderItemsGrid(){
  document.getElementById('itemsSlotNum').textContent = HOTBAR_KEYS[selectedSlot] ? HOTBAR_KEYS[selectedSlot].slice(3) : selectedSlot+1;
  const grid = document.getElementById('itemsGrid');
  grid.innerHTML = '';
  const held = ALL_ITEMS.filter(id => invCount(id)>0);
  const rest = ALL_ITEMS.filter(id => invCount(id)<=0);
  if(held.length>0){
    const lbl = document.createElement('div');
    lbl.className = 'sectionLabel';
    lbl.textContent = 'Items in your hands';
    grid.appendChild(lbl);
    held.forEach(id => grid.appendChild(makeItemTile(id)));
  }
  if(rest.length>0){
    const lbl = document.createElement('div');
    lbl.className = 'sectionLabel';
    lbl.textContent = 'Not yet obtained';
    grid.appendChild(lbl);
    rest.forEach(id => grid.appendChild(makeItemTile(id)));
  }
}

