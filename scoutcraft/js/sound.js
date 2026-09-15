// ---------- sound.js ----------
// Web Audio synth (tones/noise) + real audio clip players (roar, firework, pledge, oath, code, door, window creak) + the SFX dispatch table.
'use strict';

// ---------- Sound effects (synthesized with Web Audio, no audio files needed) ----------
let audioCtx = null;
function ensureAudio(){
  if(!audioCtx){
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if(!Ctx) return null;
    audioCtx = new Ctx();
  }
  if(audioCtx.state==='suspended') audioCtx.resume();
  return audioCtx;
}
function playTone(freq, duration, type, volume, freqEnd, attack){
  const ctx = ensureAudio();
  if(!ctx) return;
  const now = ctx.currentTime;
  const a = attack!=null ? attack : 0.008; // tiny attack ramp avoids a harsh click at note-on
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type || 'sine';
  osc.frequency.setValueAtTime(freq, now);
  if(freqEnd) osc.frequency.exponentialRampToValueAtTime(Math.max(freqEnd,1), now+duration);
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(volume||0.2, now+a);
  gain.gain.exponentialRampToValueAtTime(0.001, now+duration);
  osc.connect(gain).connect(ctx.destination);
  osc.start(now);
  osc.stop(now+duration);
}
function playNoise(duration, volume, filterFreq, attack){
  const ctx = ensureAudio();
  if(!ctx) return;
  const now = ctx.currentTime;
  const bufferSize = Math.max(1, Math.floor(ctx.sampleRate*duration));
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for(let i=0;i<bufferSize;i++) data[i] = (Math.random()*2-1) * (1 - i/bufferSize);
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = filterFreq || 1500;
  const gain = ctx.createGain();
  const a = attack!=null ? attack : 0.004;
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.linearRampToValueAtTime(volume||0.3, now+a);
  src.connect(filter).connect(gain).connect(ctx.destination);
  src.start(now);
}
// Real recording (public domain, see assets/README.md) for the lion roar — loaded once up front,
// falls back to a synthesized growl if the file can't be fetched/decoded.
// offset: where in the source file playback starts each time (seconds) — lets a clip player pull a
// short clean moment out of a much longer recording (see firework-burst below) without needing to
// re-encode a separate trimmed file.
function makeClipPlayer(url, defaultClipDuration, tailFade, offset){
  let buffer = null;
  const startOffset = offset || 0;
  function load(){
    fetch(url)
      .then(r => { if(!r.ok) throw new Error('http '+r.status); return r.arrayBuffer(); })
      .then(buf => {
        const ctx = ensureAudio();
        if(!ctx) throw new Error('no audio context');
        return new Promise((resolve,reject) => ctx.decodeAudioData(buf, resolve, reject));
      })
      .then(decoded => { buffer = decoded; })
      .catch(() => {});
  }
  function play(clipDuration, volume){
    const ctx = ensureAudio();
    if(!ctx || !buffer) return false;
    const now = ctx.currentTime;
    const dur = Math.min(clipDuration!=null ? clipDuration : defaultClipDuration, buffer.duration-startOffset);
    const fade = tailFade!=null ? tailFade : 0.3;
    const fadeIn = 0.04; // avoids a click when starting mid-file (offset>0)
    const vol = volume!=null ? volume : 0.8;
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(vol, now+fadeIn);
    gain.gain.setValueAtTime(vol, now + Math.max(fadeIn, dur-fade));
    gain.gain.linearRampToValueAtTime(0.0001, now + dur);
    src.connect(gain).connect(ctx.destination);
    src.start(now, startOffset, dur);
    return true;
  }
  return { load, play };
}
const lionRoarClip = makeClipPlayer('assets/lion-roar.ogg', 2.2, 0.35);
// Public-domain "Fireworks in distance - 3" field recording (see assets/README.md) — pulls just the
// one clean burst moment (found by scanning the recording for its loudest window) out of the full
// 46s file rather than needing a separately re-encoded clip.
const fireworkBurstClip = makeClipPlayer('assets/firework-burst.ogg', 1.5, 0.4, 22.75);
// A full recitation (see assets/README.md), played end to end rather than trimmed like the clips
// above — pledgePlaying just blocks a second click from overlapping a recitation already underway,
// clearing itself once the clip's own length has actually elapsed.
const PLEDGE_CLIP_DURATION_S = 12;
const pledgeClip = makeClipPlayer('assets/pledge-of-allegiance.m4a', PLEDGE_CLIP_DURATION_S, 0.3);
let pledgePlaying = false;
function playPledge(){
  if(pledgePlaying) return;
  const started = pledgeClip.play();
  if(!started) return;
  pledgePlaying = true;
  setTimeout(()=>{ pledgePlaying = false; }, PLEDGE_CLIP_DURATION_S*1000);
  Scout.recited('pledge');
}
// Same full-recitation-not-trimmed approach as the Pledge above, one clip per camp totem (see
// buildScoutOathTotem/buildOutdoorCodeTotem/doInteract) — a bit of buffer past each file's real
// length (14.03s/11.44s) so the "still playing" guard clears a beat after the audio itself finishes.
const SCOUT_OATH_CLIP_DURATION_S = 15;
const scoutOathClip = makeClipPlayer('assets/scout-oath.m4a', SCOUT_OATH_CLIP_DURATION_S, 0.3);
let scoutOathPlaying = false;
function playScoutOath(){
  if(scoutOathPlaying) return;
  const started = scoutOathClip.play();
  if(!started) return;
  scoutOathPlaying = true;
  setTimeout(()=>{ scoutOathPlaying = false; }, SCOUT_OATH_CLIP_DURATION_S*1000);
  Scout.recited('scoutoath');
}
const OUTDOOR_CODE_CLIP_DURATION_S = 12;
const outdoorCodeClip = makeClipPlayer('assets/outdoor-code.m4a', OUTDOOR_CODE_CLIP_DURATION_S, 0.3);
let outdoorCodePlaying = false;
function playOutdoorCode(){
  if(outdoorCodePlaying) return;
  const started = outdoorCodeClip.play();
  if(!started) return;
  outdoorCodePlaying = true;
  setTimeout(()=>{ outdoorCodePlaying = false; }, OUTDOOR_CODE_CLIP_DURATION_S*1000);
  Scout.recited('outdoorcode');
}
function playRoar(){
  if(lionRoarClip.play()) return;
  const ctx = ensureAudio();
  if(!ctx) return;
  const now = ctx.currentTime;
  const duration = 1.2;

  // low growling tone with a slow pitch wobble (vibrato) and a rise-then-fall contour
  const osc = ctx.createOscillator();
  osc.type = 'sawtooth';
  osc.frequency.setValueAtTime(85, now);
  osc.frequency.linearRampToValueAtTime(150, now+0.18);
  osc.frequency.linearRampToValueAtTime(60, now+duration);

  const lfo = ctx.createOscillator();
  lfo.frequency.value = 7.5;
  const lfoGain = ctx.createGain();
  lfoGain.gain.value = 14;
  lfo.connect(lfoGain).connect(osc.frequency);

  const lowpass = ctx.createBiquadFilter();
  lowpass.type = 'lowpass';
  lowpass.frequency.setValueAtTime(350, now);
  lowpass.frequency.linearRampToValueAtTime(1000, now+0.18);
  lowpass.frequency.linearRampToValueAtTime(250, now+duration);

  const oscGain = ctx.createGain();
  oscGain.gain.setValueAtTime(0.0001, now);
  oscGain.gain.exponentialRampToValueAtTime(0.32, now+0.14);
  oscGain.gain.exponentialRampToValueAtTime(0.18, now+0.55);
  oscGain.gain.exponentialRampToValueAtTime(0.0001, now+duration);

  osc.connect(lowpass).connect(oscGain).connect(ctx.destination);

  // filtered noise layer for a breathy, throaty growl texture
  const bufferSize = Math.floor(ctx.sampleRate*duration);
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for(let i=0;i<bufferSize;i++) data[i] = Math.random()*2-1;
  const noiseSrc = ctx.createBufferSource();
  noiseSrc.buffer = buffer;
  const noiseFilter = ctx.createBiquadFilter();
  noiseFilter.type = 'bandpass';
  noiseFilter.frequency.value = 500;
  noiseFilter.Q.value = 0.7;
  const noiseGain = ctx.createGain();
  noiseGain.gain.setValueAtTime(0.0001, now);
  noiseGain.gain.exponentialRampToValueAtTime(0.16, now+0.18);
  noiseGain.gain.exponentialRampToValueAtTime(0.0001, now+duration);
  noiseSrc.connect(noiseFilter).connect(noiseGain).connect(ctx.destination);

  osc.start(now); osc.stop(now+duration);
  lfo.start(now); lfo.stop(now+duration);
  noiseSrc.start(now);
}
function playDoorCreak(opening){
  const ctx = ensureAudio();
  if(!ctx) return;
  const now = ctx.currentTime;
  const duration = 0.35;
  const bufferSize = Math.floor(ctx.sampleRate*duration);
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for(let i=0;i<bufferSize;i++) data[i] = Math.random()*2-1;
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  const filter = ctx.createBiquadFilter();
  filter.type = 'bandpass';
  filter.Q.value = 8;
  filter.frequency.setValueAtTime(opening?250:500, now);
  filter.frequency.linearRampToValueAtTime(opening?500:200, now+duration);
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.linearRampToValueAtTime(0.22, now+0.03);
  gain.gain.exponentialRampToValueAtTime(0.0001, now+duration);
  src.connect(filter).connect(gain).connect(ctx.destination);
  src.start(now);
  if(!opening) setTimeout(()=>playTone(90, 0.1, 'sine', 0.15, 55), duration*1000*0.85); // soft thud on shut
}
function playWindowSlide(opening){
  playNoise(0.12, 0.12, opening?2200:1400);
  setTimeout(()=>playTone(opening?700:500, 0.08, 'sine', 0.1, opening?900:400), 60);
}
const SFX = {
  breakBlock(){ playNoise(0.15, 0.35, 1200); playTone(90, 0.12, 'sine', 0.15, 50); },
  placeBlock(){ playNoise(0.09, 0.22, 2400); playTone(180, 0.08, 'triangle', 0.1, 260); },
  swing(){ playTone(220, 0.08, 'triangle', 0.08, 180); },
  hitAnimal(){ playNoise(0.05, 0.16, 2600); playTone(320, 0.1, 'square', 0.15, 150); },
  animalDeath(){ playTone(220, 0.4, 'sawtooth', 0.18, 40); playNoise(0.3, 0.12, 500); },
  hurt(){ playTone(150, 0.25, 'sawtooth', 0.22, 80); playNoise(0.15, 0.1, 900); },
  jump(){ playTone(500, 0.1, 'sine', 0.1, 700); },
  land(){ playNoise(0.1, 0.2, 700); playTone(100, 0.1, 'sine', 0.12, 55); },
  craft(){
    playTone(660, 0.1, 'sine', 0.13, 880);
    setTimeout(()=>playTone(880, 0.12, 'sine', 0.13, 1100), 70);
    setTimeout(()=>playTone(1100, 0.18, 'sine', 0.11, 1320), 140);
  },
  death(){ playTone(300, 0.6, 'sawtooth', 0.2, 50); playNoise(0.5, 0.14, 400); },
  // Earning a merit badge: a bright four-note bugle call over the crafting chime's range.
  badge(){
    [0,110,220,380].forEach((delay,i)=>{
      const f = [523,659,784,1047][i];
      setTimeout(()=> playTone(f, i===3?0.45:0.16, 'sine', 0.14, f), delay);
    });
  },
  roar(){ playRoar(); },
  // Yelling and clapping to scare off a bear: a handful of quick, wavering shouts rather than any
  // one clean tone — deliberately silly-sounding, since it's the player making the noise, not the
  // game's own SFX library doing something musical.
  scareShout(){
    [0,140,270].forEach((delay,i)=>{
      setTimeout(()=>{
        playTone(180+i*30, 0.16, 'sawtooth', 0.16, 420+i*40);
        playNoise(0.08, 0.14, 1800);
      }, delay);
    });
  },
  // Waking up: two soft rising tones, the opposite shape of death's falling one.
  sleep(){
    playTone(320, 0.35, 'sine', 0.1, 420, 0.06);
    setTimeout(()=>playTone(440, 0.4, 'sine', 0.1, 560, 0.06), 220);
  },
  // A bow shooting: a quick string-release noise burst plus a low thump for the draw weight.
  bowShoot(){ playNoise(0.05, 0.16, 2000); playTone(140, 0.09, 'triangle', 0.11, 90); },
  // Thwocking into the target's straw backing: a short, dull knock, nothing musical about it.
  bowHit(){ playNoise(0.07, 0.2, 800); playTone(180, 0.07, 'square', 0.14, 110); },
  doorToggle(opening){ playDoorCreak(opening); },
  windowToggle(opening){ playWindowSlide(opening); },
  // A soft attack rounds the transient off into a light "patter" instead of a percussive tap, and
  // randomizing the tone/length each drop keeps rapid-fire hits from reading as one mechanical loop.
  rainPatter(vol){ playNoise(0.08+Math.random()*0.06, vol, 4200+Math.random()*3000, 0.025); },
  // A short bright crack up front (the "snap"), then the existing low rolling rumble follows it.
  thunder(){
    playNoise(0.18, 0.28, 6000, 0.002);
    playNoise(1.6, 0.32, 220, 0.02);
    playTone(55, 1.2, 'sawtooth', 0.15, 30);
  },
  igniteFire(){ playNoise(0.35, 0.3, 3000, 0.01); playTone(200, 0.3, 'sawtooth', 0.12, 500); },
  fireCrackle(){ playNoise(0.06, 0.06, 4000, 0.002); },
  windGust(vol, filterFreq){ playNoise(1.4, vol, filterFreq, 0.3); },
  // Rising whistle for the climb (freqEnd above freq sweeps the pitch upward), then a low thump
  // plus a handful of staggered bright crackle-pops for the colorful burst up top.
  fireworkLaunch(){ playTone(280, 0.9, 'sine', 0.1, 900, 0.05); playNoise(0.8, 0.05, 5500, 0.05); },
  fireworkBurst(){
    if(!fireworkBurstClip.play(null, 0.7)){
      playNoise(0.3, 0.32, 700, 0.004);
      playTone(75, 0.35, 'sawtooth', 0.2, 40);
    }
    for(let i=0;i<6;i++){
      setTimeout(()=>playNoise(0.05+Math.random()*0.05, 0.09, 2800+Math.random()*3400, 0.002), 50+i*65+Math.random()*40);
    }
  },
  // A short 2-3 note chirp; pitchMul shifts the whole thing up/down per species (small birds read
  // higher, large ones lower) and volume is computed by the caller from distance to the listener,
  // the closest thing this synth-only sound system has to positional audio.
  birdTweet(pitchMul, volume){
    const base = 2100*pitchMul;
    playTone(base+Math.random()*250, 0.045, 'sine', volume, base*1.25, 0.004);
    setTimeout(()=>playTone(base*0.82+Math.random()*250, 0.05, 'sine', volume*0.85, base*1.05, 0.004), 55+Math.random()*25);
    if(Math.random()<0.55) setTimeout(()=>playTone(base*1.05+Math.random()*200, 0.04, 'sine', volume*0.6, base*1.3, 0.004), 115+Math.random()*25);
  },
  splash(){ playNoise(0.22, 0.22, 2200, 0.004); playTone(180, 0.15, 'sine', 0.1, 70); },
  // Two quick low, dampened noise thuds — a "chomp, chomp" bite rather than anything sustained.
  eat(){
    playNoise(0.07, 0.18, 700, 0.004);
    setTimeout(()=>playNoise(0.08, 0.16, 650, 0.004), 90);
  },
};
lionRoarClip.load();
fireworkBurstClip.load();
pledgeClip.load();
scoutOathClip.load();
outdoorCodeClip.load();

