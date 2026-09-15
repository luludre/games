// ---------- textures.js ----------
// The entire procedural texture atlas: every draw* pixel-art function, tile layout, atlas assembly, rank badge/emblem art, US flag master canvas, BLOCK_TILES/UV_PATTERNS.
'use strict';

// ---------- Texture atlas (procedurally drawn pixel-art, no external image assets) ----------
// TILE=32 (was 16) gives 4x the pixel budget per block face — enough room for real structure
// (cracks, grain, brick-by-brick variation, ripples) rather than flat color + noise.
const TILE = 32, ATLAS_COLS = 4, ATLAS_ROWS = 13;
const T_GRASS_TOP=0, T_GRASS_SIDE=1, T_DIRT=2, T_STONE=3, T_SAND=4, T_LOG_SIDE=5, T_LOG_TOP=6,
      T_LEAVES=7, T_PLANKS=8, T_BEDROCK=9, T_CRAFT_TOP=10, T_CRAFT_SIDE=11, T_BRICKS=12, T_WATER=13,
      T_WINDOW=14, T_WINDOW_OPEN=15, T_DOOR=16, T_DOOR_OPEN=17, T_SAPLING=18, T_FLINT=19, T_FIRE=20,
      T_TORCH=21, T_LADDER=22, T_LEAVES_SPARSE=23, T_LEAVES_DENSE=24,
      T_TENT=25, T_CAMPFIRE=26, T_LANTERN=27, T_FLAG=28, T_BACKPACK=29,
      T_DUTCH_OVEN=30, T_POT=31, T_PAN=32, T_GRIDDLE=33, T_BEAR_BOX=34, T_FLAG_POLE=35,
      T_SCOUT_LAW_BOX=36,
      T_US_FLAG_TL=37, T_US_FLAG_TC=38, T_US_FLAG_TR=39, T_US_FLAG_BL=40, T_US_FLAG_BC=41, T_US_FLAG_BR=42,
      T_TOTEM_OATH_BASE=43, T_TOTEM_OATH_CREED=44, T_TOTEM_OATH_LAW=45, T_TOTEM_OATH_DUTY=46,
      T_TOTEM_CODE_CLEAN=47, T_TOTEM_CODE_FIRE=48, T_TOTEM_CODE_CONSIDERATE=49, T_TOTEM_CODE_CONSERVATION=50,
      T_ARCHERY_TARGET=51;

function hexRGB(hex){ return [(hex>>16)&255, (hex>>8)&255, hex&255]; }
function rgbStr(r,g,b){ return `rgb(${r|0},${g|0},${b|0})`; }
function shadeStr(hex, f, jitter){
  let [r,g,b] = hexRGB(hex);
  const j = jitter ? (Math.random()*2-1)*jitter : 0;
  r = Math.max(0,Math.min(255, r*f+j));
  g = Math.max(0,Math.min(255, g*f+j));
  b = Math.max(0,Math.min(255, b*f+j));
  return rgbStr(r,g,b);
}
function fillTile(ctx,x0,y0,baseHex){
  ctx.fillStyle = rgbStr(...hexRGB(baseHex));
  ctx.fillRect(x0,y0,TILE,TILE);
}
function speckle(ctx,x0,y0,baseHex,count,jitter){
  for(let i=0;i<count;i++){
    const px = x0 + Math.floor(Math.random()*TILE);
    const py = y0 + Math.floor(Math.random()*TILE);
    ctx.fillStyle = shadeStr(baseHex, 0.8+Math.random()*0.4, jitter||0);
    ctx.fillRect(px,py,1,1);
  }
}
// A soft, irregular clump of pixels around a point — used wherever flat speckle alone looked too
// uniform (grass tufts, dirt clumps, leaf clusters, rock chunks, flame licks).
function blob(ctx,cx,cy,r,baseHex,jitter){
  const n = Math.max(4, Math.round(r*r*0.9));
  for(let i=0;i<n;i++){
    const ang = Math.random()*Math.PI*2, rad = Math.random()*r;
    const px = Math.round(cx+Math.cos(ang)*rad), py = Math.round(cy+Math.sin(ang)*rad);
    ctx.fillStyle = shadeStr(baseHex, 0.75+Math.random()*0.5, jitter||0);
    ctx.fillRect(px,py,1,1);
  }
}
function drawGrassTop(ctx,x0,y0){
  fillTile(ctx,x0,y0,0x5b8a3a);
  for(let i=0;i<7;i++) blob(ctx, x0+Math.random()*TILE, y0+Math.random()*TILE, TILE*0.22, 0x5b8a3a, 20);
  speckle(ctx,x0,y0,0x5b8a3a,Math.round(TILE*TILE*0.3),18);
  for(let i=0;i<TILE*1.6;i++){
    const px=x0+Math.floor(Math.random()*TILE), py=y0+Math.floor(Math.random()*TILE);
    ctx.fillStyle = shadeStr(0x74b84a, 1, 10);
    ctx.fillRect(px,py,1,1+Math.floor(Math.random()*2));
  }
}
function drawGrassSide(ctx,x0,y0){
  fillTile(ctx,x0,y0,0x7a5230);
  speckle(ctx,x0,y0,0x7a5230,Math.round(TILE*TILE*0.2),14);
  for(let i=0;i<TILE*0.5;i++){
    const px=x0+Math.floor(Math.random()*TILE), py=y0+Math.floor(TILE*0.35)+Math.floor(Math.random()*Math.floor(TILE*0.6));
    ctx.fillStyle = shadeStr(0x4a2f18,1,6);
    ctx.fillRect(px,py,1,1);
  }
  const bandH = TILE*0.3;
  for(let x=0;x<TILE;x++){
    const h = bandH + Math.sin(x*0.9)*2 + Math.random()*3;
    for(let y=0;y<h;y++){
      ctx.fillStyle = shadeStr(0x5b8a3a, 0.8+Math.random()*0.35, 12);
      ctx.fillRect(x0+x, y0+TILE-1-y, 1, 1);
    }
  }
  ctx.fillStyle = shadeStr(0x3f2c18,1,4);
  ctx.fillRect(x0,y0+TILE-1-Math.floor(bandH),TILE,1);
}
function drawDirt(ctx,x0,y0){
  fillTile(ctx,x0,y0,0x7a5230);
  for(let i=0;i<5;i++) blob(ctx, x0+Math.random()*TILE, y0+Math.random()*TILE, TILE*0.16, 0x7a5230, 14);
  speckle(ctx,x0,y0,0x7a5230,Math.round(TILE*TILE*0.22),16);
  for(let i=0;i<TILE*0.5;i++){
    const px=x0+Math.floor(Math.random()*TILE), py=y0+Math.floor(Math.random()*TILE);
    ctx.fillStyle = shadeStr(0xc9b98f,1,6);
    ctx.fillRect(px,py,1,1);
  }
}
function drawStone(ctx,x0,y0){
  fillTile(ctx,x0,y0,0x8a8a8a);
  for(let i=0;i<5;i++) blob(ctx, x0+Math.random()*TILE, y0+Math.random()*TILE, TILE*0.2, 0x8a8a8a, 14);
  speckle(ctx,x0,y0,0x8a8a8a,Math.round(TILE*TILE*0.26),20);
  for(let c=0;c<3;c++){
    let px = x0+Math.random()*TILE, py = y0+Math.random()*TILE;
    const steps = 4+Math.floor(Math.random()*4);
    ctx.fillStyle = shadeStr(0x8a8a8a,0.55,6);
    for(let s=0;s<steps;s++){
      ctx.fillRect(Math.round(px),Math.round(py),1,1);
      px += (Math.random()*2-1)*2; py += (Math.random()*2-1)*2;
    }
  }
  for(let i=0;i<TILE*0.4;i++){
    const px=x0+Math.floor(Math.random()*TILE), py=y0+Math.floor(Math.random()*TILE);
    ctx.fillStyle = shadeStr(0xc4c4c4,1,8);
    ctx.fillRect(px,py,1,1);
  }
}
function drawSand(ctx,x0,y0){
  fillTile(ctx,x0,y0,0xe0d18f);
  speckle(ctx,x0,y0,0xe0d18f,Math.round(TILE*TILE*0.2),14);
  for(let i=0;i<4;i++){
    const y = y0+Math.floor(Math.random()*TILE);
    ctx.fillStyle = shadeStr(0xe0d18f, 1.08+Math.random()*0.1, 4);
    const len = TILE*0.4+Math.random()*TILE*0.5;
    ctx.fillRect(x0+Math.random()*(TILE-len),y,len,1);
  }
}
function drawLogSide(ctx,x0,y0){
  fillTile(ctx,x0,y0,0xa8825a);
  speckle(ctx,x0,y0,0xa8825a,Math.round(TILE*TILE*0.12),8);
  let x=0;
  while(x<TILE){
    const w = 2+Math.floor(Math.random()*3);
    const f = 0.65+Math.random()*0.3;
    for(let dx=0;dx<w && x+dx<TILE;dx++){
      for(let y=0;y<TILE;y++){
        if(Math.random()<0.85){
          ctx.fillStyle = shadeStr(0xa8825a,f+(Math.random()*0.1-0.05),6);
          ctx.fillRect(x0+x+dx,y0+y,1,1);
        }
      }
    }
    x += w;
  }
  if(Math.random()<0.7) blob(ctx, x0+TILE*0.3+Math.random()*TILE*0.4, y0+TILE*0.3+Math.random()*TILE*0.4, TILE*0.09, 0x3f2c18, 4);
}
function drawLogTop(ctx,x0,y0){
  fillTile(ctx,x0,y0,0xc9a06b);
  const cx=x0+TILE/2, cy=y0+TILE/2;
  const wobble = 0.4+Math.random()*0.3, wobbleSeed = Math.random()*10;
  for(let y=0;y<TILE;y++){
    for(let x=0;x<TILE;x++){
      const dx=x0+x+0.5-cx, dy=y0+y+0.5-cy;
      const d = Math.hypot(dx,dy) + Math.sin(Math.atan2(dy,dx)*5+wobbleSeed)*wobble;
      const ring = Math.floor(d/2.2)%2;
      ctx.fillStyle = shadeStr(0xc9a06b, ring===0 ? 1.0 : 0.8, 6);
      ctx.fillRect(x0+x,y0+y,1,1);
    }
  }
  ctx.fillStyle = shadeStr(0x6b4a2b,1,4);
  ctx.fillRect(x0,y0,TILE,2); ctx.fillRect(x0,y0+TILE-2,TILE,2);
  ctx.fillRect(x0,y0,2,TILE); ctx.fillRect(x0+TILE-2,y0,2,TILE);
}
// No base fill — the tile starts fully transparent, so the gaps between leaf clumps are genuine
// see-through holes (LEAVES is in TRANSPARENT_BLOCKS/the glass bucket) rather than a solid green
// cube with leaf-colored speckle painted on top of it. Shared by the three density tiers below
// (T_LEAVES/T_LEAVES_SPARSE/T_LEAVES_DENSE) — same clump technique, just more or fewer of them.
function drawLeavesDensity(ctx,x0,y0,clumps){
  for(let i=0;i<clumps;i++){
    const cx = x0+Math.random()*TILE, cy = y0+Math.random()*TILE;
    const r = TILE*(0.12+Math.random()*0.12);
    const n = Math.max(6, Math.round(r*r*1.1));
    for(let j=0;j<n;j++){
      const ang = Math.random()*Math.PI*2, rad = Math.random()*r;
      const px = Math.round(cx+Math.cos(ang)*rad), py = Math.round(cy+Math.sin(ang)*rad);
      if(px<x0||px>=x0+TILE||py<y0||py>=y0+TILE) continue;
      const dark = Math.random()<0.25;
      ctx.fillStyle = shadeStr(dark?0x24401f:0x3f7d34, 0.85+Math.random()*0.4, 20);
      ctx.fillRect(px,py,1,1);
    }
  }
}
function drawLeavesSparse(ctx,x0,y0){ drawLeavesDensity(ctx,x0,y0,34); } // ~58% coverage — willow, birch
function drawLeaves(ctx,x0,y0){ drawLeavesDensity(ctx,x0,y0,72); }       // ~80% (half the old gap) — oak, maple, apple
function drawLeavesDense(ctx,x0,y0){ drawLeavesDensity(ctx,x0,y0,90); }  // ~91% — pine, redwood
function drawPlanks(ctx,x0,y0){
  fillTile(ctx,x0,y0,0xb8894f);
  const boardH = TILE/4;
  for(let y=0;y<TILE;y+=boardH){
    const boardTone = 0.9+Math.random()*0.2;
    for(let dy=0;dy<boardH;dy++){
      for(let x=0;x<TILE;x++){
        ctx.fillStyle = shadeStr(0xb8894f, boardTone+(Math.random()*0.08-0.04), 6);
        ctx.fillRect(x0+x,y0+y+dy,1,1);
      }
    }
    for(let i=0;i<4;i++){
      const gy = y0+y+1+Math.floor(Math.random()*(boardH-2));
      ctx.fillStyle = shadeStr(0xb8894f,0.75,4);
      ctx.fillRect(x0+Math.floor(Math.random()*(TILE-6)),gy,4+Math.floor(Math.random()*4),1);
    }
    ctx.fillStyle = shadeStr(0xb8894f,0.6,4);
    ctx.fillRect(x0,y0+y,TILE,1);
    ctx.fillStyle = shadeStr(0xb8894f,0.7,4);
    ctx.fillRect(x0+Math.floor(Math.random()*TILE),y0+y,1,boardH);
  }
}
function drawBedrock(ctx,x0,y0){
  fillTile(ctx,x0,y0,0x2b2b2b);
  for(let i=0;i<6;i++) blob(ctx, x0+Math.random()*TILE, y0+Math.random()*TILE, TILE*0.22, 0x2b2b2b, 10);
  for(let i=0;i<TILE*TILE*0.16;i++){
    const x=x0+Math.floor(Math.random()*TILE), y=y0+Math.floor(Math.random()*TILE);
    ctx.fillStyle = shadeStr(0x2b2b2b,0.5+Math.random()*0.9,10);
    const s = 1+Math.floor(Math.random()*2);
    ctx.fillRect(x,y,s,s);
  }
}
function drawCraftTop(ctx,x0,y0){
  drawPlanks(ctx,x0,y0);
  ctx.fillStyle = shadeStr(0x3a2a1a,1,4);
  ctx.fillRect(x0+2,y0+2,TILE-4,2);
  ctx.fillRect(x0+2,y0+TILE-4,TILE-4,2);
  ctx.fillRect(x0+2,y0+2,2,TILE-4);
  ctx.fillRect(x0+TILE-4,y0+2,2,TILE-4);
  ctx.fillRect(x0+TILE/2-1,y0+5,2,TILE-10);
  ctx.fillRect(x0+5,y0+TILE/2-1,TILE-10,2);
  ctx.fillStyle = shadeStr(0x1c1410,1,2);
  [[3,3],[TILE-5,3],[3,TILE-5],[TILE-5,TILE-5]].forEach(([dx,dy])=> ctx.fillRect(x0+dx,y0+dy,2,2));
}
function drawCraftSide(ctx,x0,y0){
  drawPlanks(ctx,x0,y0);
  ctx.fillStyle = shadeStr(0x3a2a1a,1,4);
  ctx.fillRect(x0+4,y0+TILE*0.35,TILE-8,TILE*0.28);
  ctx.fillStyle = shadeStr(0xc9a06b,1,4);
  ctx.fillRect(x0+7,y0+TILE*0.42,4,4);
  ctx.fillRect(x0+TILE-11,y0+TILE*0.42,4,4);
  ctx.fillStyle = shadeStr(0x1c1410,1,2);
  ctx.fillRect(x0+3,y0+3,2,2);
  ctx.fillRect(x0+TILE-5,y0+3,2,2);
}
function drawBricks(ctx,x0,y0){
  fillTile(ctx,x0,y0,0x9a4a3a);
  const mortar = shadeStr(0x5a3a30,1,0);
  const brickH = TILE/4, brickW = TILE/2;
  let row=0;
  for(let y=0;y<TILE;y+=brickH){
    const offset = (row%2===0)?0:brickW/2;
    for(let bx=-brickW; bx<TILE+brickW; bx+=brickW){
      const tone = 0.85+Math.random()*0.3;
      for(let dy=1;dy<brickH-1;dy++){
        for(let dx=1;dx<brickW-1;dx++){
          const px = x0+bx+offset+dx, py = y0+y+dy;
          if(px<x0||px>=x0+TILE) continue;
          ctx.fillStyle = shadeStr(0x9a4a3a, tone+(Math.random()*0.06-0.03), 6);
          ctx.fillRect(px,py,1,1);
        }
      }
    }
    ctx.fillStyle = mortar;
    ctx.fillRect(x0,y0+y,TILE,1);
    for(let bx=offset; bx<TILE; bx+=brickW) ctx.fillRect(x0+bx,y0+y,1,brickH);
    row++;
  }
}
function drawWater(ctx,x0,y0){
  fillTile(ctx,x0,y0,0x3a6fd8);
  speckle(ctx,x0,y0,0x3a6fd8,Math.round(TILE*TILE*0.15),16);
  for(let i=0;i<5;i++){
    const y0r = Math.random()*TILE, amp = 1.5;
    ctx.fillStyle = shadeStr(0x3a6fd8,1.25,6);
    for(let x=0;x<TILE;x++){
      const yy = Math.round(y0r+Math.sin(x*0.5+i)*amp+TILE)%TILE;
      ctx.fillRect(x0+x,y0+yy,1,1);
    }
  }
}
function drawWindowFrame(ctx,x0,y0,glassHex){
  fillTile(ctx,x0,y0,glassHex);
  speckle(ctx,x0,y0,glassHex,Math.round(TILE*TILE*0.06),8);
  ctx.fillStyle = shadeStr(glassHex,1.3,4);
  for(let i=0;i<TILE*1.3;i++){
    const x = i, y = Math.round(i-TILE*0.3);
    if(y>=0 && y<TILE && x<TILE) ctx.fillRect(x0+x,y0+y,1,1);
  }
  const frame = shadeStr(0x6b4a2b,1,4);
  const fw = Math.max(2,Math.round(TILE/8));
  ctx.fillStyle = frame;
  ctx.fillRect(x0,y0,TILE,fw); ctx.fillRect(x0,y0+TILE-fw,TILE,fw);
  ctx.fillRect(x0,y0,fw,TILE); ctx.fillRect(x0+TILE-fw,y0,fw,TILE);
  ctx.fillRect(x0+TILE/2-fw/2,y0,fw,TILE); ctx.fillRect(x0,y0+TILE/2-fw/2,TILE,fw);
}
function drawWindow(ctx,x0,y0){ drawWindowFrame(ctx,x0,y0,0xbfe4f0); }
function drawWindowOpen(ctx,x0,y0){ drawWindowFrame(ctx,x0,y0,0xe8f6fb); }
function drawDoor(ctx,x0,y0){
  fillTile(ctx,x0,y0,0x8a5a34);
  speckle(ctx,x0,y0,0x8a5a34,Math.round(TILE*TILE*0.12),8);
  for(let i=0;i<6;i++){
    const gy = y0+2+Math.random()*(TILE-4);
    ctx.fillStyle = shadeStr(0x8a5a34,0.8,4);
    ctx.fillRect(x0+2+Math.random()*(TILE-8),gy,4+Math.random()*4,1);
  }
  const dark = shadeStr(0x5a3a20,1,4);
  ctx.fillStyle = dark;
  ctx.fillRect(x0+TILE/2-1,y0+2,2,TILE-4);
  ctx.fillRect(x0+2,y0+2,TILE-4,2);
  ctx.fillRect(x0+2,y0+TILE-4,TILE-4,2);
  ctx.fillRect(x0+5,y0+6,TILE/2-8,TILE*0.3);
  ctx.fillRect(x0+TILE/2+3,y0+6,TILE/2-8,TILE*0.3);
  ctx.fillRect(x0+5,y0+TILE*0.5,TILE/2-8,TILE*0.3);
  ctx.fillRect(x0+TILE/2+3,y0+TILE*0.5,TILE/2-8,TILE*0.3);
  ctx.fillStyle = shadeStr(0xd9c060,1,4);
  ctx.fillRect(x0+TILE/2+5,y0+TILE/2,3,3);
}
function drawDoorOpen(ctx,x0,y0){
  // faded/ghosted look signals "passable", matching how it renders semi-transparent in-world
  fillTile(ctx,x0,y0,0x8a5a34);
  speckle(ctx,x0,y0,0x8a5a34,Math.round(TILE*TILE*0.06),6);
  const dark = shadeStr(0x5a3a20,1,4);
  ctx.fillStyle = dark;
  ctx.fillRect(x0+2,y0+2,TILE-4,2);
  ctx.fillRect(x0+2,y0+TILE-4,TILE-4,2);
}
function drawSapling(ctx,x0,y0){
  fillTile(ctx,x0,y0,0x5b8a3a);
  ctx.fillStyle = shadeStr(0x3a5c22,1,4);
  ctx.fillRect(x0+TILE/2-1,y0+TILE*0.28,3,TILE*0.5);
  for(let i=0;i<4;i++) blob(ctx, x0+TILE*0.35+Math.random()*TILE*0.3, y0+TILE*0.2+Math.random()*TILE*0.3, TILE*0.14, 0x74b84a, 10);
  ctx.fillStyle = shadeStr(0x74b84a,1,10);
  for(let i=0;i<TILE*2.5;i++){
    const px = x0+TILE*0.15+Math.floor(Math.random()*TILE*0.7);
    const py = y0+TILE*0.15+Math.floor(Math.random()*TILE*0.6);
    ctx.fillRect(px,py,1,1);
  }
}
function drawFlint(ctx,x0,y0){
  fillTile(ctx,x0,y0,0x3a3d42);
  speckle(ctx,x0,y0,0x3a3d42,Math.round(TILE*TILE*0.18),14);
  const facet = shadeStr(0x8a90a0,1,10);
  ctx.fillStyle = facet;
  ctx.fillRect(x0+TILE*0.2,y0+TILE*0.18,TILE*0.3,3);
  ctx.fillRect(x0+TILE*0.5,y0+TILE*0.42,TILE*0.25,3);
  ctx.fillRect(x0+TILE*0.25,y0+TILE*0.68,TILE*0.35,3);
  ctx.fillStyle = shadeStr(0x1c1e22,1,6);
  ctx.fillRect(x0+TILE*0.55,y0+TILE*0.18,TILE*0.2,3);
  ctx.fillRect(x0+TILE*0.12,y0+TILE*0.48,TILE*0.2,3);
}
function drawFire(ctx,x0,y0){
  // drawn on a near-black base — combined with the glass bucket's transparency this reads as
  // flickering flame rather than a solid tile
  fillTile(ctx,x0,y0,0x120600);
  for(let i=0;i<3;i++) blob(ctx, x0+TILE*0.3+Math.random()*TILE*0.4, y0+TILE*0.55+Math.random()*TILE*0.3, TILE*0.24, 0xc62b0e, 20);
  for(let i=0;i<3;i++) blob(ctx, x0+TILE*0.32+Math.random()*TILE*0.36, y0+TILE*0.35+Math.random()*TILE*0.25, TILE*0.18, 0xff7a1a, 24);
  for(let i=0;i<2;i++) blob(ctx, x0+TILE*0.4+Math.random()*TILE*0.2, y0+TILE*0.18+Math.random()*TILE*0.18, TILE*0.12, 0xffce4d, 20);
  for(let i=0;i<TILE*0.6;i++){
    const px=x0+Math.floor(Math.random()*TILE), py=y0+Math.floor(Math.random()*TILE*0.5);
    ctx.fillStyle = shadeStr(0xffb066,1,10);
    ctx.fillRect(px,py,1,1);
  }
}
function drawTorch(ctx,x0,y0){
  // near-black base + the glass bucket's transparency reads as a thin stick rather than a solid cube
  fillTile(ctx,x0,y0,0x0a0a0a);
  ctx.fillStyle = shadeStr(0x6b4a2b,1,6);
  ctx.fillRect(x0+TILE/2-1,y0+TILE*0.48,3,TILE*0.45);
  for(let i=0;i<3;i++){
    ctx.fillStyle = shadeStr(0x4a3018,1,4);
    ctx.fillRect(x0+TILE/2-1,y0+TILE*0.5+i*TILE*0.12,3,1);
  }
  for(let i=0;i<2;i++) blob(ctx, x0+TILE*0.4+Math.random()*TILE*0.2, y0+TILE*0.28+Math.random()*TILE*0.15, TILE*0.13, 0xc62b0e, 14);
  for(let i=0;i<2;i++) blob(ctx, x0+TILE*0.42+Math.random()*TILE*0.16, y0+TILE*0.16+Math.random()*TILE*0.12, TILE*0.09, 0xff9a2e, 16);
  ctx.fillStyle = '#ffd75e';
  ctx.fillRect(x0+TILE/2-1,y0+TILE*0.04,2,TILE*0.1);
}
function drawLadder(ctx,x0,y0){
  // near-black base + the glass bucket's transparency (same trick as fire/torch) reads as an open
  // wooden ladder you can see through the gaps of, rather than a solid cube.
  fillTile(ctx,x0,y0,0x0a0a0a);
  ctx.fillStyle = shadeStr(0x8a6a3a,1,10);
  ctx.fillRect(x0+TILE*0.12, y0, TILE*0.14, TILE);
  ctx.fillRect(x0+TILE*0.74, y0, TILE*0.14, TILE);
  const rungs = 4;
  for(let i=0;i<rungs;i++){
    const ry = y0 + TILE*0.1 + i*(TILE*0.8/(rungs-1)) - TILE*0.045;
    ctx.fillStyle = shadeStr(0x9a7a48,1,10);
    ctx.fillRect(x0+TILE*0.12, ry, TILE*0.76, TILE*0.09);
  }
}
function drawTent(ctx,x0,y0){
  // A canvas A-frame seen side-on, pure red with no other markings — no ridge pole, door flap or
  // guy lines — just the sloped canvas panels, shaded so the ridge still reads as a fold.
  fillTile(ctx,x0,y0,0xff0000);
  speckle(ctx,x0,y0,0xff0000,Math.round(TILE*TILE*0.16),10);
  for(let py=0;py<TILE;py++){
    const spread = (py/TILE)*0.5; // how far the tent has opened out at this height
    const left = Math.round(TILE*(0.5-spread)), right = Math.round(TILE*(0.5+spread));
    for(let px=left;px<right;px++){
      const lit = px < TILE*0.5 ? 1.12 : 0.86;
      ctx.fillStyle = shadeStr(0xff0000, lit, 8);
      ctx.fillRect(x0+px,y0+py,1,1);
    }
  }
}
function drawCampfire(ctx,x0,y0){
  // A ring of stones, two crossed logs, and a flame — the scout's whole world revolves around this,
  // so unlike wildfire FIRE it's a solid, permanent block that lights up camp.
  fillTile(ctx,x0,y0,0x3a2a1c);
  speckle(ctx,x0,y0,0x3a2a1c,Math.round(TILE*TILE*0.2),12);
  // stone ring around the edge — a pale granite so it separates from the dark earth base
  const cx = TILE/2, cy = TILE/2;
  for(let a=0;a<16;a++){
    const ang = (a/16)*Math.PI*2;
    blob(ctx, x0+cx+Math.cos(ang)*TILE*0.41, y0+cy+Math.sin(ang)*TILE*0.41, TILE*0.13, 0xb4b0a6, 18);
  }
  // crossed logs
  ctx.save();
  ctx.translate(x0+cx,y0+cy);
  for(const rot of [0.6,-0.6]){
    ctx.rotate(rot);
    ctx.fillStyle = shadeStr(0x6b4a2b,1,10);
    ctx.fillRect(-TILE*0.3,-TILE*0.05,TILE*0.6,TILE*0.1);
    ctx.rotate(-rot);
  }
  ctx.restore();
  // embers, then flame licks on top — layered hot-to-hottest so the centre glows white-yellow
  for(let i=0;i<6;i++) blob(ctx, x0+cx+(Math.random()-0.5)*TILE*0.4,  y0+cy+(Math.random()-0.5)*TILE*0.3,  TILE*0.17, 0xe03a10, 22);
  for(let i=0;i<5;i++) blob(ctx, x0+cx+(Math.random()-0.5)*TILE*0.3,  y0+cy-TILE*0.03+(Math.random()-0.5)*TILE*0.22, TILE*0.14, 0xff8a1f, 24);
  for(let i=0;i<4;i++) blob(ctx, x0+cx+(Math.random()-0.5)*TILE*0.2,  y0+cy-TILE*0.08+(Math.random()-0.5)*TILE*0.14, TILE*0.1,  0xffce4d, 20);
  for(let i=0;i<2;i++) blob(ctx, x0+cx+(Math.random()-0.5)*TILE*0.1,  y0+cy-TILE*0.1, TILE*0.06, 0xfff2c0, 12);
}
function drawLantern(ctx,x0,y0){
  // near-black base + the glass bucket's transparency (same trick as fire/torch/ladder) so the
  // lantern reads as a hanging object rather than a solid cube.
  fillTile(ctx,x0,y0,0x0a0a0a);
  // hanging wire
  ctx.fillStyle = shadeStr(0x8a8a8a,1,8);
  ctx.fillRect(x0+TILE*0.48,y0,2,TILE*0.14);
  ctx.fillRect(x0+TILE*0.3,y0+TILE*0.12,TILE*0.4,2);
  // heavy dark metal frame — a tight silhouette rather than a wide pane
  ctx.fillStyle = shadeStr(0x2e2e34,1,8);
  ctx.fillRect(x0+TILE*0.3, y0+TILE*0.16, TILE*0.4,  TILE*0.1);   // cap
  ctx.fillRect(x0+TILE*0.3, y0+TILE*0.72, TILE*0.4,  TILE*0.12);  // base
  ctx.fillRect(x0+TILE*0.3, y0+TILE*0.24, TILE*0.08, TILE*0.5);   // left post
  ctx.fillRect(x0+TILE*0.62,y0+TILE*0.24, TILE*0.08, TILE*0.5);   // right post
  // amber glass, hottest at the wick
  for(let py=Math.round(TILE*0.26);py<TILE*0.72;py++){
    for(let px=Math.round(TILE*0.38);px<TILE*0.62;px++){
      const d = Math.hypot(px-TILE*0.5, py-TILE*0.52)/(TILE*0.3);
      ctx.fillStyle = shadeStr(0xff9c22, 1.25-d*0.55, 12);
      ctx.fillRect(x0+px,y0+py,1,1);
    }
  }
  // the flame itself
  blob(ctx, x0+TILE*0.5, y0+TILE*0.54, TILE*0.07, 0xfff0b0, 10);
}
// The pole's own position/width is shared by drawFlagPole below so the two segments line up exactly
// when three of these blocks are stacked into one tall flagpole (see placeFlag).
const FLAG_POLE_X = 0.2, FLAG_POLE_W = 0.09;
function drawFlagPole(ctx,x0,y0){
  // near-black base + transparency: just the bare pole, no pennant — the bottom two of the three
  // blocks a Troop Flag places (see placeFlag/drawFlag).
  fillTile(ctx,x0,y0,0x0a0a0a);
  ctx.fillStyle = shadeStr(0x8a6a3a,1,8);
  ctx.fillRect(x0+TILE*FLAG_POLE_X,y0,TILE*FLAG_POLE_W,TILE);
}
function drawFlag(ctx,x0,y0){
  // near-black base + transparency: the top of the pole, capped with a finial, flying a pennant —
  // the third (topmost) block of a Troop Flag, stacked above two plain drawFlagPole segments.
  fillTile(ctx,x0,y0,0x0a0a0a);
  ctx.fillStyle = shadeStr(0x8a6a3a,1,8);
  ctx.fillRect(x0+TILE*FLAG_POLE_X,y0+TILE*0.08,TILE*FLAG_POLE_W,TILE*0.92);
  // gold finial ball capping the very top of the pole
  ctx.fillStyle = shadeStr(0xd9b23a,1,6);
  ctx.beginPath();
  ctx.arc(x0+TILE*(FLAG_POLE_X+FLAG_POLE_W/2), y0+TILE*0.05, TILE*0.06, 0, Math.PI*2);
  ctx.fill();
  // triangular pennant flying to the right, right at the top where a real flag actually flies
  for(let py=Math.round(TILE*0.08);py<TILE*0.42;py++){
    const t = (py-TILE*0.08)/(TILE*0.34);
    const len = TILE*0.62*(1-Math.abs(t-0.5)*1.1);
    for(let px=0;px<len;px++){
      ctx.fillStyle = shadeStr(0x9c1f12, 1.15-px/TILE*0.45, 8);
      ctx.fillRect(x0+TILE*(FLAG_POLE_X+FLAG_POLE_W)+px,y0+py,1,1);
    }
  }
  // fleur-de-lis suggestion: a pale blaze in the middle of the pennant
  ctx.fillStyle = shadeStr(0xf0e4c0,1,8);
  ctx.fillRect(x0+TILE*0.45,y0+TILE*0.16,2,TILE*0.14);
  ctx.fillRect(x0+TILE*0.4,y0+TILE*0.23,TILE*0.16,2);
}
function drawBackpack(ctx,x0,y0){
  // A canvas rucksack seen from the front: rounded body, a flap, a front pocket, and two straps.
  fillTile(ctx,x0,y0,0x5a3a20);
  speckle(ctx,x0,y0,0x5a3a20,Math.round(TILE*TILE*0.1),8);
  ctx.fillStyle = shadeStr(0x6b4a2f,1,8);
  ctx.fillRect(x0+TILE*0.16,y0+TILE*0.22,TILE*0.68,TILE*0.68);
  ctx.fillStyle = shadeStr(0x4a3018,1,8);
  ctx.fillRect(x0+TILE*0.14,y0+TILE*0.14,TILE*0.72,TILE*0.22);
  ctx.fillStyle = shadeStr(0x7a5a38,1,8);
  ctx.fillRect(x0+TILE*0.28,y0+TILE*0.5,TILE*0.44,TILE*0.32);
  ctx.fillStyle = shadeStr(0xc8a366,1,6);
  ctx.fillRect(x0+TILE*0.44,y0+TILE*0.58,TILE*0.12,TILE*0.08);
  ctx.fillStyle = shadeStr(0x3a2412,1,6);
  ctx.fillRect(x0+TILE*0.2,y0,TILE*0.1,TILE*0.22);
  ctx.fillRect(x0+TILE*0.7,y0,TILE*0.1,TILE*0.22);
}
function drawDutchOven(ctx,x0,y0){
  // Near-black base, opaque: a squat cast-iron pot with legs and a bail handle.
  fillTile(ctx,x0,y0,0x0a0a0a);
  const cx = TILE*0.5;
  ctx.fillStyle = shadeStr(0x1c1c1c,1,6);
  ctx.fillRect(x0+TILE*0.22, y0+TILE*0.42, TILE*0.56, TILE*0.34);
  for(let py=0;py<TILE*0.16;py++){
    const t = py/(TILE*0.16);
    const half = TILE*0.3*Math.sqrt(Math.max(0,1-Math.pow(1-t,2)));
    ctx.fillStyle = shadeStr(0x2a2a2a, 1.1-t*0.15, 6);
    ctx.fillRect(x0+cx-half, y0+TILE*0.34-py, half*2, 1);
  }
  ctx.fillStyle = shadeStr(0x1c1c1c,1,4);
  ctx.fillRect(x0+cx-2, y0+TILE*0.30, 4, 5);
  ctx.fillRect(x0+TILE*0.24, y0+TILE*0.76, TILE*0.06, TILE*0.12);
  ctx.fillRect(x0+cx-TILE*0.03, y0+TILE*0.76, TILE*0.06, TILE*0.12);
  ctx.fillRect(x0+TILE*0.70, y0+TILE*0.76, TILE*0.06, TILE*0.12);
  ctx.strokeStyle = shadeStr(0x3a3a3a,1,4);
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(x0+TILE*0.26, y0+TILE*0.42);
  ctx.quadraticCurveTo(x0+cx, y0+TILE*0.12, x0+TILE*0.74, y0+TILE*0.42);
  ctx.stroke();
}
function drawPot(ctx,x0,y0){
  // Near-black base, opaque: a tall metal pot with side handles and a lid.
  fillTile(ctx,x0,y0,0x0a0a0a);
  const cx = TILE*0.5;
  ctx.fillStyle = shadeStr(0x9aa0a6,1,6);
  ctx.fillRect(x0+TILE*0.28, y0+TILE*0.30, TILE*0.44, TILE*0.5);
  ctx.fillStyle = shadeStr(0xc4c9ce,1,4);
  ctx.fillRect(x0+TILE*0.26, y0+TILE*0.28, TILE*0.48, TILE*0.05);
  ctx.fillStyle = shadeStr(0x7a8085,1,4);
  ctx.fillRect(x0+TILE*0.16, y0+TILE*0.36, TILE*0.1, TILE*0.06);
  ctx.fillRect(x0+TILE*0.74, y0+TILE*0.36, TILE*0.1, TILE*0.06);
  ctx.fillStyle = shadeStr(0xb0b6bb,1,4);
  ctx.fillRect(x0+TILE*0.30, y0+TILE*0.22, TILE*0.4, TILE*0.06);
  ctx.fillStyle = shadeStr(0x7a8085,1,4);
  ctx.fillRect(x0+cx-2, y0+TILE*0.16, 4, 6);
}
function drawPan(ctx,x0,y0){
  // Near-black base, opaque: a round pan seen from above with a long handle.
  fillTile(ctx,x0,y0,0x0a0a0a);
  const cx = TILE*0.42, cy = TILE*0.56, r = TILE*0.28;
  for(let py=-r;py<=r;py++){
    const half = Math.sqrt(Math.max(0,r*r-py*py));
    ctx.fillStyle = shadeStr(0x2c2420, 1.0+py/(r*3), 6);
    ctx.fillRect(x0+cx-half, y0+cy+py, half*2, 1);
  }
  const r2 = r*0.72;
  for(let py=-r2;py<=r2;py++){
    const half = Math.sqrt(Math.max(0,r2*r2-py*py));
    ctx.fillStyle = shadeStr(0x3a3028, 1.0, 8);
    ctx.fillRect(x0+cx-half, y0+cy+py, half*2, 1);
  }
  ctx.fillStyle = shadeStr(0x1c1c1c,1,4);
  ctx.fillRect(x0+cx+r*0.6, y0+cy-TILE*0.045, TILE*0.34, TILE*0.09);
}
function drawGriddle(ctx,x0,y0){
  // Near-black base, opaque: a flat plate with grill marks.
  fillTile(ctx,x0,y0,0x0a0a0a);
  ctx.fillStyle = shadeStr(0x3a3a3a,1,6);
  ctx.fillRect(x0+TILE*0.1, y0+TILE*0.32, TILE*0.8, TILE*0.5);
  ctx.fillStyle = shadeStr(0x555555,1,4);
  ctx.fillRect(x0+TILE*0.08, y0+TILE*0.30, TILE*0.84, TILE*0.05);
  ctx.fillRect(x0+TILE*0.08, y0+TILE*0.79, TILE*0.84, TILE*0.03);
  ctx.fillStyle = 'rgba(15,15,15,0.55)';
  for(let i=0;i<4;i++) ctx.fillRect(x0+TILE*0.16, y0+TILE*0.38+i*TILE*0.1, TILE*0.68, 2);
  ctx.fillStyle = shadeStr(0x1c1c1c,1,4);
  ctx.fillRect(x0+TILE*0.02, y0+TILE*0.5, TILE*0.08, TILE*0.1);
  ctx.fillRect(x0+TILE*0.9, y0+TILE*0.5, TILE*0.08, TILE*0.1);
}
function drawBearBox(ctx,x0,y0){
  // A solid, heavy-looking metal storage trunk: banded, hinged, padlocked shut.
  fillTile(ctx,x0,y0,0x3a5f3a);
  speckle(ctx,x0,y0,0x3a5f3a,Math.round(TILE*TILE*0.08),8);
  ctx.fillStyle = shadeStr(0x1c2a1c,1,6);
  ctx.fillRect(x0, y0, TILE, TILE*0.12);
  ctx.fillRect(x0, y0+TILE*0.44, TILE, TILE*0.12);
  ctx.fillRect(x0, y0+TILE*0.88, TILE, TILE*0.12);
  ctx.fillStyle = shadeStr(0x2a2a2a,1,6);
  ctx.fillRect(x0+TILE*0.04, y0+TILE*0.2, TILE*0.1, TILE*0.14);
  ctx.fillRect(x0+TILE*0.86, y0+TILE*0.2, TILE*0.1, TILE*0.14);
  const cx = TILE*0.5, cy = TILE*0.66;
  ctx.strokeStyle = shadeStr(0xd8d2c0,1,4);
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(x0+cx, y0+cy-TILE*0.08, TILE*0.07, Math.PI, 0);
  ctx.stroke();
  ctx.fillStyle = shadeStr(0xc9a020,1,6);
  ctx.fillRect(x0+cx-TILE*0.08, y0+cy-TILE*0.04, TILE*0.16, TILE*0.14);
}
function drawScoutLawBox(ctx,x0,y0){
  // A small golden keepsake box, not a working container — banded in dark wood trim with a five-
  // point star in the middle, since these are found and read once rather than opened and reused.
  fillTile(ctx,x0,y0,0xd4af37);
  speckle(ctx,x0,y0,0xd4af37,Math.round(TILE*TILE*0.06),10);
  ctx.fillStyle = shadeStr(0x6b4a1a,1,4);
  ctx.fillRect(x0, y0+TILE*0.04, TILE, TILE*0.08);
  ctx.fillRect(x0, y0+TILE*0.46, TILE, TILE*0.08);
  ctx.fillRect(x0, y0+TILE*0.88, TILE, TILE*0.08);
  ctx.fillRect(x0+TILE*0.04, y0, TILE*0.08, TILE);
  ctx.fillRect(x0+TILE*0.88, y0, TILE*0.08, TILE);
  ctx.fillStyle = shadeStr(0xfff3c8,1,4);
  const cx = x0+TILE*0.5, cy = y0+TILE*0.6, rOuter = TILE*0.15, rInner = TILE*0.06;
  ctx.beginPath();
  for(let i=0;i<5;i++){
    const a = -Math.PI/2 + i*(Math.PI*2/5), a2 = a + Math.PI/5;
    if(i===0) ctx.moveTo(cx+Math.cos(a)*rOuter, cy+Math.sin(a)*rOuter);
    else ctx.lineTo(cx+Math.cos(a)*rOuter, cy+Math.sin(a)*rOuter);
    ctx.lineTo(cx+Math.cos(a2)*rInner, cy+Math.sin(a2)*rInner);
  }
  ctx.closePath();
  ctx.fill();
}
// ---------- Scout totems (see buildScoutOathTotem/buildOutdoorCodeTotem) ----------
// Each camp totem is a stack of carved-wood rings, one per line of the real text it recites, so it
// reads as a real stack of distinct rings rather than one texture repeated — topped with a carved
// eagle (Scout Oath) or owl (Outdoor Code), the way a real hand-carved camp totem often is. The
// per-ring icons (a cross, a compass, a campfire, a pine tree, and so on below) are kept deliberately
// generic/geometric rather than any specific real-world totem pole tradition's actual iconography or
// painted formline style, since this is meant to read as camp craft (the same spirit as the wooden
// Scout-totem projects real troops carve for their own camps), not a reproduction of anyone's culture.
function drawTotemRing(ctx,x0,y0){
  fillTile(ctx,x0,y0,0x6b4226);
  speckle(ctx,x0,y0,0x6b4226,Math.round(TILE*TILE*0.14),10);
  // A few faint concentric grain rings, like a real cut log's growth rings, so it reads as an actual
  // carved wooden segment rather than a flat speckled fill.
  ctx.strokeStyle = 'rgba(46,28,14,0.35)';
  ctx.lineWidth = 1;
  for(let i=0;i<3;i++){
    ctx.beginPath();
    ctx.arc(x0+TILE*0.5, y0+TILE*0.5, TILE*(0.12+i*0.1), 0, Math.PI*2);
    ctx.stroke();
  }
  // Dark grooves top and bottom suggest each ring is its own carved segment, stacked rather than one
  // continuous pole.
  ctx.fillStyle = shadeStr(0x2e1c0e,1,4);
  ctx.fillRect(x0, y0, TILE, TILE*0.07);
  ctx.fillRect(x0, y0+TILE*0.93, TILE, TILE*0.07);
}
// ---------- The 4 purpose-built rings of the Scout Oath totem (see buildScoutOathTotem) — one
// carved icon per ring, same gold-on-wood technique as the generic totem symbols above.
function drawTotemOathBase(ctx,x0,y0){
  drawTotemRing(ctx,x0,y0);
  const cx=x0+TILE*0.5, cy=y0+TILE*0.5;
  // a small bronze plaque let into the wood — the real words ("On my honor...") are the floating sign
  // sprite mounted just in front of it, this is too small to actually read at tile resolution.
  ctx.fillStyle = shadeStr(0x8a6a3a,1,4);
  ctx.fillRect(cx-TILE*0.32, cy-TILE*0.18, TILE*0.64, TILE*0.36);
  ctx.strokeStyle = shadeStr(0xe8d9a0,1,4);
  ctx.lineWidth = 1;
  ctx.strokeRect(cx-TILE*0.32, cy-TILE*0.18, TILE*0.64, TILE*0.36);
  ctx.strokeStyle = 'rgba(232,217,160,0.5)';
  for(let i=0;i<3;i++){
    ctx.beginPath();
    ctx.moveTo(cx-TILE*0.24, cy-TILE*0.08+i*TILE*0.08);
    ctx.lineTo(cx+TILE*0.24, cy-TILE*0.08+i*TILE*0.08);
    ctx.stroke();
  }
}
// Physically Strong (a peak), Mentally Awake (an open book), Morally Straight (an upright pillar) —
// the Scout Oath's own three-part creed, left to right.
function drawTotemOathCreed(ctx,x0,y0){
  drawTotemRing(ctx,x0,y0);
  const cy = y0+TILE*0.5;
  ctx.fillStyle = shadeStr(0xe8d9a0,1,4);
  ctx.beginPath();
  ctx.moveTo(x0+TILE*0.16, cy+TILE*0.16);
  ctx.lineTo(x0+TILE*0.26, cy-TILE*0.14);
  ctx.lineTo(x0+TILE*0.36, cy+TILE*0.16);
  ctx.closePath();
  ctx.fill();
  ctx.fillRect(x0+TILE*0.44, cy-TILE*0.1, TILE*0.14, TILE*0.2);
  ctx.strokeStyle = shadeStr(0x2e1c0e,1,4);
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(x0+TILE*0.51, cy-TILE*0.1); ctx.lineTo(x0+TILE*0.51, cy+TILE*0.1); ctx.stroke();
  ctx.fillStyle = shadeStr(0xe8d9a0,1,4);
  ctx.fillRect(x0+TILE*0.68, cy-TILE*0.16, TILE*0.1, TILE*0.32);
}
// To obey the Scout Law — a diamond compass rose flanked by two tiny scout figures standing shoulder
// to shoulder.
function drawTotemOathLaw(ctx,x0,y0){
  drawTotemRing(ctx,x0,y0);
  const cx=x0+TILE*0.5, cy=y0+TILE*0.5, r=TILE*0.2;
  ctx.fillStyle = shadeStr(0xe8d9a0,1,4);
  ctx.beginPath();
  ctx.moveTo(cx, cy-r); ctx.lineTo(cx+r*0.28, cy-r*0.28); ctx.lineTo(cx+r, cy); ctx.lineTo(cx+r*0.28, cy+r*0.28);
  ctx.lineTo(cx, cy+r); ctx.lineTo(cx-r*0.28, cy+r*0.28); ctx.lineTo(cx-r, cy); ctx.lineTo(cx-r*0.28, cy-r*0.28);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = shadeStr(0x8a1f1f,1,4);
  ctx.beginPath(); ctx.arc(cx,cy,r*0.18,0,Math.PI*2); ctx.fill();
  ctx.fillStyle = shadeStr(0xe8d9a0,1,4);
  for(const side of [-1,1]){
    const fx = cx + side*TILE*0.32;
    ctx.beginPath(); ctx.arc(fx, cy-TILE*0.15, TILE*0.045, 0, Math.PI*2); ctx.fill();
    ctx.fillRect(fx-TILE*0.05, cy-TILE*0.09, TILE*0.1, TILE*0.2);
  }
}
// Duty to God (a simple cross) and Country (a small striped shield) — the topmost ring, right under
// the eagle.
function drawTotemOathDuty(ctx,x0,y0){
  drawTotemRing(ctx,x0,y0);
  const cy = y0+TILE*0.5;
  ctx.fillStyle = shadeStr(0xe8d9a0,1,4);
  ctx.fillRect(x0+TILE*0.26, cy-TILE*0.22, TILE*0.06, TILE*0.4);
  ctx.fillRect(x0+TILE*0.17, cy-TILE*0.08, TILE*0.24, TILE*0.06);
  const sx = x0+TILE*0.6, sw = TILE*0.24, sh = TILE*0.34, sy = cy-TILE*0.18;
  ctx.fillStyle = shadeStr(0xe8d9a0,1,6);
  ctx.fillRect(sx, sy, sw, sh*0.7);
  ctx.beginPath();
  ctx.moveTo(sx, sy+sh*0.7); ctx.lineTo(sx+sw, sy+sh*0.7); ctx.lineTo(sx+sw/2, sy+sh);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = shadeStr(0x8a1f1f,1,6);
  for(let i=0;i<3;i++) ctx.fillRect(sx, sy+i*sh*0.7/3, sw, sh*0.7/9);
}
// ---------- The 4 code-point rings of the Outdoor Code totem (see buildOutdoorCodeTotem), same
// gold-on-wood icon technique. Its base ring reuses T_TOTEM_OATH_BASE (see BLOCK_TILES) — the same
// blank engraved-plaque look — rather than a distinct tile of its own.
function drawTotemCodeClean(ctx,x0,y0){
  drawTotemRing(ctx,x0,y0);
  const cx=x0+TILE*0.5;
  ctx.fillStyle = shadeStr(0xe8d9a0,1,4);
  ctx.fillRect(cx-TILE*0.025, y0+TILE*0.2, TILE*0.05, TILE*0.42);
  ctx.beginPath();
  ctx.moveTo(cx-TILE*0.14, y0+TILE*0.78);
  ctx.lineTo(cx+TILE*0.14, y0+TILE*0.78);
  ctx.lineTo(cx+TILE*0.05, y0+TILE*0.58);
  ctx.lineTo(cx-TILE*0.05, y0+TILE*0.58);
  ctx.closePath();
  ctx.fill();
}
function drawTotemCodeFire(ctx,x0,y0){
  drawTotemRing(ctx,x0,y0);
  const cx = x0+TILE*0.5;
  ctx.fillStyle = shadeStr(0x8a8a8a,1,6);
  for(const a of [-0.6,-0.2,0.2,0.6]){
    ctx.beginPath();
    ctx.arc(cx+Math.sin(a)*TILE*0.26, y0+TILE*0.76+Math.cos(a)*TILE*0.05, TILE*0.05, 0, Math.PI*2);
    ctx.fill();
  }
  blob(ctx, cx, y0+TILE*0.62, TILE*0.18, 0xc62b0e, 14);
  blob(ctx, cx, y0+TILE*0.48, TILE*0.13, 0xff7a1a, 16);
  blob(ctx, cx, y0+TILE*0.37, TILE*0.08, 0xffce4d, 14);
}
function drawTotemCodeConsiderate(ctx,x0,y0){
  drawTotemRing(ctx,x0,y0);
  const cx=x0+TILE*0.5, cy=y0+TILE*0.5;
  ctx.fillStyle = shadeStr(0xe8d9a0,1,4);
  ctx.beginPath();
  ctx.moveTo(cx-TILE*0.3, cy+TILE*0.2);
  ctx.lineTo(cx-TILE*0.05, cy-TILE*0.22);
  ctx.lineTo(cx+TILE*0.18, cy+TILE*0.2);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath(); ctx.arc(cx-TILE*0.2, cy+TILE*0.08, TILE*0.05, 0, Math.PI*2); ctx.fill();
  ctx.fillRect(cx-TILE*0.25, cy+TILE*0.12, TILE*0.1, TILE*0.16);
}
function drawTotemCodeConservation(ctx,x0,y0){
  drawTotemRing(ctx,x0,y0);
  const cx=x0+TILE*0.5, cy=y0+TILE*0.5;
  ctx.fillStyle = shadeStr(0x2f6b2a,1,6);
  for(let i=0;i<3;i++){
    const w = TILE*(0.26-i*0.06), y = cy-TILE*0.06+i*TILE*0.13;
    ctx.beginPath();
    ctx.moveTo(cx, y-TILE*0.16);
    ctx.lineTo(cx-w/2, y+TILE*0.02);
    ctx.lineTo(cx+w/2, y+TILE*0.02);
    ctx.closePath();
    ctx.fill();
  }
  ctx.fillStyle = shadeStr(0x5a3d22,1,4);
  ctx.fillRect(cx-TILE*0.03, cy+TILE*0.16, TILE*0.06, TILE*0.1);
}
// A straw-bale archery target — concentric rings same on every face, same reasoning as the totems'
// icons: it reads fine from any angle at this scale, so one tile does for top/side/bottom alike.
function drawArcheryTarget(ctx,x0,y0){
  fillTile(ctx,x0,y0,0xd9c9a0);
  speckle(ctx,x0,y0,0xd9c9a0,Math.round(TILE*TILE*0.12),12);
  const cx=x0+TILE*0.5, cy=y0+TILE*0.5;
  const rings = [
    { r: TILE*0.46, color: 0xf5f2e8 },
    { r: TILE*0.36, color: 0x1a1a1a },
    { r: TILE*0.27, color: 0xf5f2e8 },
    { r: TILE*0.18, color: 0xc62b0e },
    { r: TILE*0.09, color: 0xf5c93a },
  ];
  for(const ring of rings){
    ctx.fillStyle = shadeStr(ring.color,1,4);
    ctx.beginPath();
    ctx.arc(cx,cy,ring.r,0,Math.PI*2);
    ctx.fill();
  }
}
// ---------- Giant US flag (see buildGiantFlag) ----------
// Drawn once at real detail on an offscreen canvas well above tile resolution, then each of the 6
// mural blocks just crops+downscales its own slice out of it into the atlas — that's what lets 50
// individual stars actually read as stars instead of a blurry smear once shrunk to a 32px tile.
const US_FLAG_COLS = 3, US_FLAG_ROWS = 2;
const US_FLAG_CELL_PX = 160; // resolution per cell before downscaling into a TILE-sized atlas slot
function drawStar(ctx,cx,cy,rOuter,rInner){
  ctx.beginPath();
  for(let i=0;i<5;i++){
    const a = -Math.PI/2 + i*(Math.PI*2/5), a2 = a + Math.PI/5;
    if(i===0) ctx.moveTo(cx+Math.cos(a)*rOuter, cy+Math.sin(a)*rOuter);
    else ctx.lineTo(cx+Math.cos(a)*rOuter, cy+Math.sin(a)*rOuter);
    ctx.lineTo(cx+Math.cos(a2)*rInner, cy+Math.sin(a2)*rInner);
  }
  ctx.closePath();
  ctx.fill();
}
// Rank badge art, loosely modeled on the real BSA cloth rank badges: Scout through Life share the
// same tan oval with a gold emblem building on a fleur-de-lis (the same three-pronged blaze already
// used for the Troop Flag pennant and the belt buckle stamp), and Eagle Scout breaks from that family
// entirely with its own red/white/blue circular medallion — same as the real badges do. Drawn straight
// onto whatever 2D context is handed in, so the exact same function puts the same-looking badge on the
// floating name tag, the shirt's left chest pocket, and the exit screen's achievement card. rankIndex
// is an index into RANKS (0 = None, 7 = Eagle Scout).
const RANK_BADGE_COLORS = ['#6b6b6b','#c9a877','#c9a877','#c9a877','#c9a877','#c9a877','#c9a877','#c23b28'];
// The fleur-de-lis blaze at the heart of Scout/Tenderfoot/First Class — a vertical stem, two swept
// side petals, and a base bar, all filled as one flat silhouette.
function drawFleurDeLis(ctx, cx, cy, scale, color){
  ctx.fillStyle = color;
  ctx.fillRect(cx-scale*0.09, cy-scale*0.75, scale*0.18, scale*0.95);
  ctx.beginPath();
  ctx.moveTo(cx-scale*0.09, cy-scale*0.75); ctx.lineTo(cx-scale*0.55, cy-scale*0.15); ctx.lineTo(cx-scale*0.09, cy-scale*0.15);
  ctx.closePath(); ctx.fill();
  ctx.beginPath();
  ctx.moveTo(cx+scale*0.09, cy-scale*0.75); ctx.lineTo(cx+scale*0.55, cy-scale*0.15); ctx.lineTo(cx+scale*0.09, cy-scale*0.15);
  ctx.closePath(); ctx.fill();
  ctx.fillRect(cx-scale*0.45, cy+scale*0.08, scale*0.9, scale*0.16);
}
// A small rounded shield — Tenderfoot/First Class's simplified stand-in for the real badges' little
// eagle-and-shield, too fine a detail to actually read at icon scale.
function drawSmallShield(ctx, cx, cy, scale, color){
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(cx-scale*0.32, cy-scale*0.3);
  ctx.lineTo(cx+scale*0.32, cy-scale*0.3);
  ctx.lineTo(cx+scale*0.32, cy+scale*0.05);
  ctx.quadraticCurveTo(cx+scale*0.3, cy+scale*0.38, cx, cy+scale*0.55);
  ctx.quadraticCurveTo(cx-scale*0.3, cy+scale*0.38, cx-scale*0.32, cy+scale*0.05);
  ctx.closePath();
  ctx.fill();
}
// A short hanging ribbon — Second Class/First Class's stand-in for the real "BE PREPARED" banner,
// which (like the shield above) is lettering too small to ever actually render legibly here.
function drawSmallBanner(ctx, cx, cy, scale, color){
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(cx, cy-scale*0.5);
  ctx.lineTo(cx+scale*0.24, cy-scale*0.12);
  ctx.lineTo(cx+scale*0.15, cy+scale*0.4);
  ctx.lineTo(cx, cy+scale*0.22);
  ctx.lineTo(cx-scale*0.15, cy+scale*0.4);
  ctx.lineTo(cx-scale*0.24, cy-scale*0.12);
  ctx.closePath();
  ctx.fill();
}
function drawHeartShape(ctx, cx, cy, scale, color){
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(cx, cy+scale*0.55);
  ctx.bezierCurveTo(cx-scale*0.8, cy+scale*0.05, cx-scale*0.6, cy-scale*0.55, cx, cy-scale*0.18);
  ctx.bezierCurveTo(cx+scale*0.6, cy-scale*0.55, cx+scale*0.8, cy+scale*0.05, cx, cy+scale*0.55);
  ctx.closePath();
  ctx.fill();
}
// A flat, top-down eagle silhouette for the Eagle Scout medallion — round body, small head, and a
// pair of swept wings, the same kind of simplified silhouette the totem eagle/Giant Eagles use, just
// drawn as one flat 2D shape instead of a 3D mesh.
function drawEagleSilhouette(ctx, cx, cy, scale, color){
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.ellipse(cx, cy+scale*0.08, scale*0.13, scale*0.24, 0, 0, Math.PI*2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(cx, cy-scale*0.28, scale*0.1, 0, Math.PI*2);
  ctx.fill();
  for(const side of [-1,1]){
    ctx.beginPath();
    ctx.moveTo(cx+side*scale*0.06, cy-scale*0.02);
    ctx.quadraticCurveTo(cx+side*scale*0.6, cy-scale*0.28, cx+side*scale*0.95, cy+scale*0.02);
    ctx.quadraticCurveTo(cx+side*scale*0.55, cy+scale*0.08, cx+side*scale*0.1, cy+scale*0.14);
    ctx.closePath();
    ctx.fill();
  }
}
// Real rank badge artwork for every earned rank (see assets/README.md) — used in place of the
// procedural drawings below since real insignia-style detail doesn't reduce well to canvas
// primitives. Each loads once up front; drawRankBadge falls back to that rank's plain procedural
// medallion until its own image is ready.
const RANK_EMBLEM_SRC = {
  1: 'assets/scout-emblem.png',
  2: 'assets/tenderfoot-scout-emblem.png',
  3: 'assets/second-class-emblem.png',
  4: 'assets/first-class-emblem.png',
  5: 'assets/star-scout-emblem.png',
  6: 'assets/life-scout-emblem.png',
  // ?v=2: bumped when this one's artwork was replaced, so a browser that already cached the old
  // file under this same path picks up the new one instead of serving a stale copy.
  7: 'assets/eagle-scout-emblem.png?v=2',
};
const rankEmblemImg = {}, rankEmblemLoaded = {};
for(const rankIndex in RANK_EMBLEM_SRC){
  const img = new Image();
  rankEmblemImg[rankIndex] = img;
  rankEmblemLoaded[rankIndex] = false;
  img.onload = () => {
    rankEmblemLoaded[rankIndex] = true;
    // The shirt patch and floating name tag may already have been baked (as canvas textures) with
    // the fallback art before this finished loading — force both to redraw now, same as any other
    // rank-change refresh. The achievement card needs no such fix: it's rebuilt from scratch every
    // time the share screen opens, never cached.
    if(rankIndexFor(earnedBadges.size) === Number(rankIndex)){
      if(characterMesh && characterMesh.userData.uniform) characterMesh.userData.uniform.lastRankIndex = -1;
      updateCharacterRankBadge();
      if(myNameTag) myNameTag.lastKey = null;
    }
  };
  img.src = RANK_EMBLEM_SRC[rankIndex];
}
// Cover-fits img into the same circular badge shape every rank uses, so real artwork drops into all
// three call sites (shirt patch, name tag, achievement card) without any of them needing to know
// it's an image instead of vector art.
function drawEmblemImage(ctx, cx, cy, radius, img){
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI*2);
  ctx.clip();
  const iw = img.naturalWidth, ih = img.naturalHeight;
  const s = Math.max((radius*2)/iw, (radius*2)/ih);
  const dw = iw*s, dh = ih*s;
  ctx.drawImage(img, cx-dw/2, cy-dh/2, dw, dh);
  ctx.restore();
  ctx.lineWidth = Math.max(1, radius*0.1);
  ctx.strokeStyle = '#1a1a1a';
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI*2);
  ctx.stroke();
}
function drawRankBadge(ctx, cx, cy, radius, rankIndex){
  if(rankIndex<=0){
    // No rank yet — a plain disc, nothing earned to put on it.
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI*2);
    ctx.fillStyle = RANK_BADGE_COLORS[0];
    ctx.fill();
    ctx.lineWidth = Math.max(1, radius*0.12);
    ctx.strokeStyle = 'rgba(0,0,0,0.4)';
    ctx.stroke();
    return;
  }
  if(rankEmblemLoaded[rankIndex]){
    drawEmblemImage(ctx, cx, cy, radius, rankEmblemImg[rankIndex]);
    return;
  }
  if(rankIndex===7){
    // Eagle Scout: a red/white/blue circular medallion instead of the tan cloth oval every rank
    // below it shares — the real Eagle badge breaks from that family the exact same way. Fallback
    // only, used until the real artwork above finishes loading.
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI*2);
    ctx.fillStyle = '#c23b28';
    ctx.fill();
    ctx.beginPath();
    ctx.arc(cx, cy, radius*0.78, 0, Math.PI*2);
    ctx.fillStyle = '#f2f2ec';
    ctx.fill();
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, radius*0.78, 0, Math.PI*2);
    ctx.clip();
    ctx.translate(cx, cy);
    ctx.rotate(-Math.PI/4);
    ctx.fillStyle = '#2a4a8a';
    ctx.fillRect(-radius, -radius*0.22, radius*2, radius*0.44);
    ctx.restore();
    ctx.lineWidth = Math.max(1, radius*0.1);
    ctx.strokeStyle = '#1a1a1a';
    ctx.stroke();
    drawEagleSilhouette(ctx, cx, cy-radius*0.1, radius*1.05, '#3a3a3a');
    return;
  }
  // Scout through Life: the shared tan cloth-oval background every one of these ranks builds on.
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI*2);
  ctx.fillStyle = RANK_BADGE_COLORS[rankIndex];
  ctx.fill();
  ctx.lineWidth = Math.max(1, radius*0.12);
  ctx.strokeStyle = 'rgba(0,0,0,0.4)';
  ctx.stroke();
  const gold = '#8a6a1a';
  switch(rankIndex){
    case 1: // Scout: the fleur-de-lis alone.
      drawFleurDeLis(ctx, cx, cy, radius*0.85, gold);
      break;
    case 2: // Tenderfoot: fleur-de-lis over a small shield.
      drawFleurDeLis(ctx, cx, cy-radius*0.1, radius*0.7, gold);
      drawSmallShield(ctx, cx, cy+radius*0.32, radius*0.4, gold);
      break;
    case 3: // Second Class: the hanging banner alone.
      drawSmallBanner(ctx, cx, cy, radius*0.9, gold);
      break;
    case 4: // First Class: fleur-de-lis, shield, and banner all together, the same combination the
      // real First Class badge itself builds from.
      drawFleurDeLis(ctx, cx, cy-radius*0.28, radius*0.55, gold);
      drawSmallShield(ctx, cx, cy+radius*0.02, radius*0.32, gold);
      drawSmallBanner(ctx, cx, cy+radius*0.42, radius*0.48, gold);
      break;
    case 5: // Star Scout: a 5-point star.
      ctx.fillStyle = gold;
      drawStar(ctx, cx, cy, radius*0.85, radius*0.85*0.42);
      break;
    case 6: // Life Scout: a heart with a small fleur-de-lis on it.
      drawHeartShape(ctx, cx, cy, radius*0.85, '#b8352a');
      drawFleurDeLis(ctx, cx, cy+radius*0.05, radius*0.32, gold);
      break;
  }
}
let usFlagMasterCanvas = null;
function buildUSFlagMaster(){
  const w = US_FLAG_COLS*US_FLAG_CELL_PX, h = US_FLAG_ROWS*US_FLAG_CELL_PX;
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d');
  // 13 stripes, but not all the same height: 7 sized to exactly fill the top mural row (where the
  // canton sits) and 6 sized to exactly fill the bottom row, so the canton's bottom edge lands
  // precisely on the row boundary instead of spilling a sliver of blue into the block below it (equal
  // stripe heights across all 13 would leave the canton's real-flag proportion — 7/13 of the total
  // height — taller than the top row it needs to fit inside).
  const cellH = h/US_FLAG_ROWS;
  const topStripeH = cellH/7, botStripeH = cellH/6;
  for(let i=0;i<7;i++){
    ctx.fillStyle = i%2===0 ? '#b22234' : '#ffffff';
    ctx.fillRect(0, i*topStripeH, w, topStripeH+1);
  }
  for(let i=0;i<6;i++){
    ctx.fillStyle = i%2===0 ? '#ffffff' : '#b22234'; // continues the alternation from stripe 7 onward
    ctx.fillRect(0, cellH + i*botStripeH, w, botStripeH+1);
  }
  // Canton (the blue star field) covers the whole top row and 2/5 of the width, real-flag proportions.
  const cantonW = w*0.4, cantonH = cellH;
  ctx.fillStyle = '#3c3b6e';
  ctx.fillRect(0, 0, cantonW, cantonH);
  // 50 stars, 9 rows alternating 6/5, each 5-star row offset half a column to interleave — the same
  // arrangement as the real flag.
  const rows = 9, rowSpacing = cantonH/rows, colSpacing = cantonW/6, starR = colSpacing*0.32;
  ctx.fillStyle = '#ffffff';
  for(let r=0;r<rows;r++){
    const count = r%2===0 ? 6 : 5;
    const y = rowSpacing*(r+0.5);
    for(let c=0;c<count;c++){
      const x = count===6 ? colSpacing*(c+0.5) : colSpacing*(c+1);
      drawStar(ctx, x, y, starR, starR*0.38);
    }
  }
  return canvas;
}
function getUSFlagMaster(){
  if(!usFlagMasterCanvas) usFlagMasterCanvas = buildUSFlagMaster();
  return usFlagMasterCanvas;
}
function drawUSFlagCell(ctx,x0,y0,col,row){
  const master = getUSFlagMaster();
  const cellW = master.width/US_FLAG_COLS, cellH = master.height/US_FLAG_ROWS;
  ctx.drawImage(master, col*cellW, row*cellH, cellW, cellH, x0, y0, TILE, TILE);
}
const drawUSFlagTL = (ctx,x0,y0)=> drawUSFlagCell(ctx,x0,y0,0,0);
const drawUSFlagTC = (ctx,x0,y0)=> drawUSFlagCell(ctx,x0,y0,1,0);
const drawUSFlagTR = (ctx,x0,y0)=> drawUSFlagCell(ctx,x0,y0,2,0);
const drawUSFlagBL = (ctx,x0,y0)=> drawUSFlagCell(ctx,x0,y0,0,1);
const drawUSFlagBC = (ctx,x0,y0)=> drawUSFlagCell(ctx,x0,y0,1,1);
const drawUSFlagBR = (ctx,x0,y0)=> drawUSFlagCell(ctx,x0,y0,2,1);
function buildAtlas(){
  const canvas = document.createElement('canvas');
  canvas.width = TILE*ATLAS_COLS;
  canvas.height = TILE*ATLAS_ROWS;
  const ctx = canvas.getContext('2d');
  const draw = [drawGrassTop, drawGrassSide, drawDirt, drawStone, drawSand, drawLogSide, drawLogTop,
                drawLeaves, drawPlanks, drawBedrock, drawCraftTop, drawCraftSide, drawBricks, drawWater,
                drawWindow, drawWindowOpen, drawDoor, drawDoorOpen, drawSapling, drawFlint, drawFire, drawTorch,
                drawLadder, drawLeavesSparse, drawLeavesDense,
                drawTent, drawCampfire, drawLantern, drawFlag, drawBackpack,
                drawDutchOven, drawPot, drawPan, drawGriddle, drawBearBox, drawFlagPole, drawScoutLawBox,
                drawUSFlagTL, drawUSFlagTC, drawUSFlagTR, drawUSFlagBL, drawUSFlagBC, drawUSFlagBR,
                drawTotemOathBase, drawTotemOathCreed, drawTotemOathLaw, drawTotemOathDuty,
                drawTotemCodeClean, drawTotemCodeFire, drawTotemCodeConsiderate, drawTotemCodeConservation,
                drawArcheryTarget];
  draw.forEach((fn, i)=> fn(ctx, (i%ATLAS_COLS)*TILE, Math.floor(i/ATLAS_COLS)*TILE));
  const tex = new THREE.CanvasTexture(canvas);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  return tex;
}
function tileUV(i){
  const col = i % ATLAS_COLS, row = Math.floor(i/ATLAS_COLS);
  return {
    u0: col/ATLAS_COLS, u1: (col+1)/ATLAS_COLS,
    vBottom: 1-(row+1)/ATLAS_ROWS, vTop: 1-row/ATLAS_ROWS,
  };
}
const BLOCK_TILES = {
  [GRASS]:  {top:T_GRASS_TOP, side:T_GRASS_SIDE, bottom:T_DIRT},
  [DIRT]:   {top:T_DIRT, side:T_DIRT, bottom:T_DIRT},
  [STONE]:  {top:T_STONE, side:T_STONE, bottom:T_STONE},
  [SAND]:   {top:T_SAND, side:T_SAND, bottom:T_SAND},
  [WOOD]:   {top:T_LOG_TOP, side:T_LOG_SIDE, bottom:T_LOG_TOP},
  [LEAVES]: {top:T_LEAVES, side:T_LEAVES, bottom:T_LEAVES},
  [PLANKS]: {top:T_PLANKS, side:T_PLANKS, bottom:T_PLANKS},
  [WATER]:  {top:T_WATER, side:T_WATER, bottom:T_WATER},
  [BEDROCK]:{top:T_BEDROCK, side:T_BEDROCK, bottom:T_BEDROCK},
  [CRAFTING_TABLE]: {top:T_CRAFT_TOP, side:T_CRAFT_SIDE, bottom:T_PLANKS},
  [BRICKS]: {top:T_BRICKS, side:T_BRICKS, bottom:T_BRICKS},
  [WINDOW]: {top:T_WINDOW, side:T_WINDOW, bottom:T_WINDOW},
  [WINDOW_OPEN]: {top:T_WINDOW_OPEN, side:T_WINDOW_OPEN, bottom:T_WINDOW_OPEN},
  [DOOR]: {top:T_DOOR, side:T_DOOR, bottom:T_DOOR},
  [DOOR_OPEN]: {top:T_DOOR_OPEN, side:T_DOOR_OPEN, bottom:T_DOOR_OPEN},
  [SAPLING]: {top:T_SAPLING, side:T_SAPLING, bottom:T_SAPLING},
  [FLINT]: {top:T_FLINT, side:T_FLINT, bottom:T_FLINT},
  [FIRE]: {top:T_FIRE, side:T_FIRE, bottom:T_FIRE},
  [TORCH]: {top:T_TORCH, side:T_TORCH, bottom:T_TORCH},
  [LADDER]: {top:T_LADDER, side:T_LADDER, bottom:T_LADDER},
  [TENT]: {top:T_TENT, side:T_TENT, bottom:T_PLANKS},
  [CAMPFIRE]: {top:T_CAMPFIRE, side:T_CAMPFIRE, bottom:T_DIRT},
  [LANTERN]: {top:T_LANTERN, side:T_LANTERN, bottom:T_LANTERN},
  [FLAG]: {top:T_FLAG, side:T_FLAG, bottom:T_FLAG},
  [FLAG_POLE]: {top:T_FLAG_POLE, side:T_FLAG_POLE, bottom:T_FLAG_POLE},
  [BACKPACK]: {top:T_BACKPACK, side:T_BACKPACK, bottom:T_PLANKS},
  [DUTCH_OVEN]: {top:T_DUTCH_OVEN, side:T_DUTCH_OVEN, bottom:T_DUTCH_OVEN},
  [POT]: {top:T_POT, side:T_POT, bottom:T_POT},
  [PAN]: {top:T_PAN, side:T_PAN, bottom:T_PAN},
  [GRIDDLE]: {top:T_GRIDDLE, side:T_GRIDDLE, bottom:T_GRIDDLE},
  [BEAR_BOX]: {top:T_BEAR_BOX, side:T_BEAR_BOX, bottom:T_STONE},
  [SCOUT_LAW_BOX]: {top:T_SCOUT_LAW_BOX, side:T_SCOUT_LAW_BOX, bottom:T_SCOUT_LAW_BOX},
  [US_FLAG_TL]: {top:T_US_FLAG_TL, side:T_US_FLAG_TL, bottom:T_US_FLAG_TL},
  [US_FLAG_TC]: {top:T_US_FLAG_TC, side:T_US_FLAG_TC, bottom:T_US_FLAG_TC},
  [US_FLAG_TR]: {top:T_US_FLAG_TR, side:T_US_FLAG_TR, bottom:T_US_FLAG_TR},
  [US_FLAG_BL]: {top:T_US_FLAG_BL, side:T_US_FLAG_BL, bottom:T_US_FLAG_BL},
  [US_FLAG_BC]: {top:T_US_FLAG_BC, side:T_US_FLAG_BC, bottom:T_US_FLAG_BC},
  [US_FLAG_BR]: {top:T_US_FLAG_BR, side:T_US_FLAG_BR, bottom:T_US_FLAG_BR},
  [TOTEM_OATH_BASE]: {top:T_TOTEM_OATH_BASE, side:T_TOTEM_OATH_BASE, bottom:T_TOTEM_OATH_BASE},
  [TOTEM_OATH_CREED]: {top:T_TOTEM_OATH_CREED, side:T_TOTEM_OATH_CREED, bottom:T_TOTEM_OATH_CREED},
  [TOTEM_OATH_LAW]: {top:T_TOTEM_OATH_LAW, side:T_TOTEM_OATH_LAW, bottom:T_TOTEM_OATH_LAW},
  [TOTEM_OATH_DUTY]: {top:T_TOTEM_OATH_DUTY, side:T_TOTEM_OATH_DUTY, bottom:T_TOTEM_OATH_DUTY},
  [TOTEM_CODE_BASE]: {top:T_TOTEM_OATH_BASE, side:T_TOTEM_OATH_BASE, bottom:T_TOTEM_OATH_BASE},
  [TOTEM_CODE_CLEAN]: {top:T_TOTEM_CODE_CLEAN, side:T_TOTEM_CODE_CLEAN, bottom:T_TOTEM_CODE_CLEAN},
  [TOTEM_CODE_FIRE]: {top:T_TOTEM_CODE_FIRE, side:T_TOTEM_CODE_FIRE, bottom:T_TOTEM_CODE_FIRE},
  [TOTEM_CODE_CONSIDERATE]: {top:T_TOTEM_CODE_CONSIDERATE, side:T_TOTEM_CODE_CONSIDERATE, bottom:T_TOTEM_CODE_CONSIDERATE},
  [TOTEM_CODE_CONSERVATION]: {top:T_TOTEM_CODE_CONSERVATION, side:T_TOTEM_CODE_CONSERVATION, bottom:T_TOTEM_CODE_CONSERVATION},
  [ARCHERY_TARGET]: {top:T_ARCHERY_TARGET, side:T_ARCHERY_TARGET, bottom:T_ARCHERY_TARGET},
};
// per-face-direction UV winding (0/1 flags select u0/u1 and vBottom/vTop), aligned to FACES order below
const UV_PATTERNS = [
  [[0,0],[0,1],[1,1],[1,0]], // +x
  [[1,0],[1,1],[0,1],[0,0]], // -x
  [[0,0],[0,1],[1,1],[1,0]], // +y
  [[0,1],[0,0],[1,0],[1,1]], // -y
  [[1,0],[1,1],[0,1],[0,0]], // +z
  [[0,0],[0,1],[1,1],[1,0]], // -z
];

