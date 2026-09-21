// ---------- persistence.js ----------
// Core save/load (localStorage): world edits, inventory, last position. Subsystem-specific saves (worms/butterflies/saplings/fires/bear box/backpack/hotbar) stay local to their own files.
'use strict';

// ---------- Save / load edits ----------
const SAVE_KEY = 'scoutcraft_edits_v1';
const INV_KEY = 'scoutcraft_inventory_v1';
const edits = new Map();
let saveTimer = null;
function saveEdits(){
  clearTimeout(saveTimer);
  saveTimer = setTimeout(()=>{
    const obj = {};
    edits.forEach((v,k)=> obj[k]=v);
    try{ localStorage.setItem(SAVE_KEY, JSON.stringify(obj)); }catch(e){}
  }, 300);
  document.getElementById('blockCount').textContent = edits.size;
}
function loadEdits(){
  try{
    const raw = localStorage.getItem(SAVE_KEY);
    if(!raw) return;
    const obj = JSON.parse(raw);
    for(const k in obj){
      const [x,y,z] = k.split(',').map(Number);
      setBlock(x,y,z,obj[k]);
      edits.set(k, obj[k]);
      if(obj[k]===CRAFTING_TABLE) craftingTables.add(k);
      else craftingTables.delete(k);
      if(obj[k]===TENT) tentCells.add(k);
      else tentCells.delete(k);
    }
    document.getElementById('blockCount').textContent = edits.size;
  }catch(e){}
}
let invSaveTimer = null;
function saveInventory(){
  clearTimeout(invSaveTimer);
  invSaveTimer = setTimeout(()=>{
    try{ localStorage.setItem(INV_KEY, JSON.stringify(inventory)); }catch(e){}
  }, 300);
}
function loadInventory(){
  try{
    const raw = localStorage.getItem(INV_KEY);
    if(!raw){ inventory[CRAFTING_TABLE] = 1; return; }
    const obj = JSON.parse(raw);
    for(const k in obj) inventory[k] = obj[k];
  }catch(e){ inventory[CRAFTING_TABLE] = 1; }
}
// A player who leaves while alive comes back at the same spot next time, instead of a random spawn
// point — position changes every frame, so unlike the debounced saves above this is saved on a plain
// periodic timer (see the setInterval near the bottom of the file) plus once more right as the tab
// actually closes (beforeunload/pagehide), rather than debounced-on-change, which would just keep
// getting reset by continuous movement and might never actually fire. Skipped entirely while dead —
// see spawnPlayerAtStart — so the position restored next load is always one they were alive at.
const POS_KEY = 'scoutcraft_last_pos_v1';
const POSITION_SAVE_INTERVAL_MS = 5000; // how often the plain periodic timer below re-saves it
function savePosition(){
  if(isDead) return;
  try{
    localStorage.setItem(POS_KEY, JSON.stringify({ x: player.pos.x, y: player.pos.y, z: player.pos.z }));
  }catch(e){}
}
function loadPosition(){
  try{
    const raw = localStorage.getItem(POS_KEY);
    if(!raw) return null;
    const p = JSON.parse(raw);
    if(typeof p.x!=='number' || typeof p.y!=='number' || typeof p.z!=='number') return null;
    return p;
  }catch(e){ return null; }
}

