"use strict";

/* =========================================================================
   Tetropolis — Music & sound.
   An original, upbeat chiptune loop sequenced entirely with the Web Audio
   API. No audio files, no network: every note is a synthesised oscillator or
   noise burst. A world-tour-flavoured 8-bar loop (square/triangle leads over
   a bouncing triangle bass and kick/snare/hat percussion) that grows busier
   and a touch faster as the level climbs, plus short subtle cues for merges,
   continent clears and row clears.

   Browser autoplay: the AudioContext is only created/resumed after the first
   user gesture (Music.unlock()), so nothing sounds until the player acts.
   ========================================================================= */

window.Music = (function () {
  /* ----------------------------- Tunables ------------------------------ */
  const BASE_BPM = 120;            // loop tempo at level 1 (within 110–125)
  const STAGE_BPM_STEP = 2;        // +BPM added per intensity stage
  const MAX_STAGE = 4;             // intensity caps here (see STAGE table)
  const BARS = 8;
  const STEPS_PER_BAR = 16;        // 16th-note resolution
  const TOTAL_STEPS = BARS * STEPS_PER_BAR;

  const MASTER_VOL = 0.24;         // modest master level — music sits *under* play
  const LOOKAHEAD_MS = 25;         // scheduler tick
  const SCHEDULE_AHEAD = 0.12;     // seconds of audio scheduled past "now"
  const FADE = 0.025;              // pause/mute gain fade (s)

  const STORAGE_KEY = "tetropolis.music.muted";

  // Per-stage arrangement. Stage = min(4, floor((level - 1) / 2)) — the mix
  // thickens and the tempo nudges up every two levels, then holds.
  const STAGE = [
    { hats: false, hats16: false, arp: false, drive: false, ghost: false },
    { hats: true,  hats16: false, arp: false, drive: false, ghost: false },
    { hats: true,  hats16: false, arp: true,  drive: false, ghost: false },
    { hats: true,  hats16: true,  arp: true,  drive: true,  ghost: false },
    { hats: true,  hats16: true,  arp: true,  drive: true,  ghost: true  },
  ];

  /* --------------------------- Composition ----------------------------- */
  // One chord per bar (a bright vi–IV–I–V world-pop cycle, twice).
  const CHORDS = ["Am", "F", "C", "G", "Am", "F", "G", "G"];

  // Bass [root, fifth] in octave 2/3 for a bouncing octave line.
  const BASS = { Am: [45, 52], F: [41, 48], C: [36, 43], G: [43, 50] };

  // Arpeggio triad+octave per chord (mid register), cycled as 16th notes.
  const ARP = { Am: [57, 60, 64, 69], F: [53, 57, 60, 65], C: [60, 64, 67, 72], G: [55, 59, 62, 67] };

  // Lead melody, bar by bar, as [midi, durationIn16ths]; each bar sums to 16.
  const LEAD_BARS = [
    [[69, 2], [72, 2], [76, 4], [74, 2], [72, 2], [69, 4]],
    [[65, 2], [69, 2], [72, 4], [69, 2], [65, 2], [67, 4]],
    [[76, 2], [79, 2], [76, 2], [72, 2], [67, 4], [72, 4]],
    [[74, 2], [71, 2], [67, 4], [71, 2], [74, 2], [79, 4]],
    [[76, 4], [69, 4], [72, 2], [74, 2], [76, 4]],
    [[77, 4], [72, 4], [69, 2], [72, 2], [65, 4]],
    [[74, 2], [76, 2], [77, 2], [79, 2], [77, 4], [74, 4]],
    [[79, 4], [74, 4], [71, 4], [67, 4]],
  ];

  // Flatten the lead into a step -> {midi, dur} lookup once.
  const leadByStep = {};
  (function buildLead() {
    for (let bar = 0; bar < LEAD_BARS.length; bar++) {
      let step = bar * STEPS_PER_BAR;
      for (const [midi, dur] of LEAD_BARS[bar]) {
        leadByStep[step] = { midi, dur };
        step += dur;
      }
    }
  })();

  function midiToFreq(m) { return 440 * Math.pow(2, (m - 69) / 12); }

  /* ------------------------------ State -------------------------------- */
  let ctx = null;
  let master = null, musicBus = null, sfxBus = null;
  let noiseBuf = null;
  let unlocked = false;            // a user gesture has created/resumed ctx
  let muted = readMutedPref();     // persisted preference
  let wantPlay = true;             // game wants music (not paused / not over)
  let running = false;             // scheduler active
  let level = 1;
  let timer = null;
  let nextNoteTime = 0;
  let step = 0;
  let btn = null;

  function readMutedPref() {
    try { return localStorage.getItem(STORAGE_KEY) === "1"; } catch (e) { return false; }
  }
  function persistMuted() {
    try { localStorage.setItem(STORAGE_KEY, muted ? "1" : "0"); } catch (e) { /* file:// may block */ }
  }

  function currentStage() { return Math.min(MAX_STAGE, Math.floor((level - 1) / 2)); }
  function currentBpm() { return BASE_BPM + currentStage() * STAGE_BPM_STEP; }

  /* ------------------------------ Audio -------------------------------- */
  function init() {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();

    master = ctx.createGain();
    master.gain.value = muted ? 0 : MASTER_VOL;
    master.connect(ctx.destination);

    musicBus = ctx.createGain();
    musicBus.gain.value = 0;        // raised when the sequence starts
    musicBus.connect(master);

    sfxBus = ctx.createGain();
    sfxBus.gain.value = 1;
    sfxBus.connect(master);

    // One second of white noise, reused for every drum hit.
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const data = noiseBuf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  }

  // A single enveloped oscillator note.
  function tone(type, freq, time, dur, peak, bus) {
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    const atk = 0.006;
    const rel = Math.min(0.08, dur * 0.5);
    osc.type = type;
    osc.frequency.setValueAtTime(freq, time);
    g.gain.setValueAtTime(0.0001, time);
    g.gain.linearRampToValueAtTime(peak, time + atk);
    g.gain.setValueAtTime(peak, time + Math.max(atk, dur - rel));
    g.gain.linearRampToValueAtTime(0.0001, time + dur);
    osc.connect(g).connect(bus);
    osc.start(time);
    osc.stop(time + dur + 0.02);
  }

  function kick(time) {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = "sine";
    o.frequency.setValueAtTime(150, time);
    o.frequency.exponentialRampToValueAtTime(50, time + 0.11);
    g.gain.setValueAtTime(0.0001, time);
    g.gain.exponentialRampToValueAtTime(0.34, time + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, time + 0.16);
    o.connect(g).connect(musicBus);
    o.start(time); o.stop(time + 0.18);
  }

  function noiseHit(time, dur, peak, hp) {
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    const f = ctx.createBiquadFilter();
    f.type = "highpass";
    f.frequency.value = hp;
    const g = ctx.createGain();
    g.gain.setValueAtTime(peak, time);
    g.gain.exponentialRampToValueAtTime(0.0001, time + dur);
    src.connect(f).connect(g).connect(musicBus);
    src.start(time); src.stop(time + dur + 0.02);
  }
  function snare(time, peak) { noiseHit(time, 0.16, peak != null ? peak : 0.16, 1400); }
  function hat(time) { noiseHit(time, 0.03, 0.045, 7000); }

  /* ---------------------------- Sequencer ------------------------------ */
  function scheduleStep(stepIndex, time) {
    const bar = Math.floor(stepIndex / STEPS_PER_BAR);
    const inBar = stepIndex % STEPS_PER_BAR;
    const chord = CHORDS[bar];
    const cfg = STAGE[currentStage()];
    const s16 = (60 / currentBpm()) / 4;

    // Lead (square).
    const L = leadByStep[stepIndex];
    if (L) tone("square", midiToFreq(L.midi), time, L.dur * s16, 0.11, musicBus);

    // Bass (triangle) on eighths — bouncing root/octave/fifth.
    if (inBar % 2 === 0) {
      const ei = inBar / 2; // 0..7
      const [root, fifth] = BASS[chord];
      const seq = [root, root + 12, fifth, root + 12, root, root + 12, fifth, fifth];
      tone("triangle", midiToFreq(seq[ei]), time, s16 * 1.6, 0.16, musicBus);
    }

    // Arpeggio (square) — every 16th once the mix thickens.
    if (cfg.arp) {
      tone("square", midiToFreq(ARP[chord][inBar % 4]), time, s16 * 0.9, 0.05, musicBus);
    }

    // Percussion.
    if (inBar === 0 || inBar === 8) kick(time);
    if (cfg.drive && (inBar === 4 || inBar === 12)) kick(time);
    if (inBar === 4 || inBar === 12) snare(time);
    if (cfg.ghost && (inBar === 7 || inBar === 15)) snare(time, 0.06);
    if (cfg.hats16) hat(time);
    else if (cfg.hats && inBar % 2 === 0) hat(time);
  }

  function scheduler() {
    if (!ctx) return;
    while (nextNoteTime < ctx.currentTime + SCHEDULE_AHEAD) {
      scheduleStep(step, nextNoteTime);
      nextNoteTime += (60 / currentBpm()) / 4;
      step = (step + 1) % TOTAL_STEPS;
    }
  }

  function startSeq() {
    if (running || !ctx) return;
    running = true;
    nextNoteTime = ctx.currentTime + 0.06;
    musicBus.gain.cancelScheduledValues(ctx.currentTime);
    musicBus.gain.setTargetAtTime(1, ctx.currentTime, FADE);
    timer = setInterval(scheduler, LOOKAHEAD_MS);
    scheduler();
  }

  function stopSeq() {
    if (!running) return;
    running = false;
    clearInterval(timer);
    timer = null;
    if (ctx) {
      musicBus.gain.cancelScheduledValues(ctx.currentTime);
      musicBus.gain.setTargetAtTime(0, ctx.currentTime, FADE);
    }
  }

  function applyMute() {
    if (!ctx) return;
    master.gain.cancelScheduledValues(ctx.currentTime);
    master.gain.setTargetAtTime(muted ? 0 : MASTER_VOL, ctx.currentTime, FADE);
  }

  // Scheduler should run only when unlocked, unmuted, and the game wants music.
  function reflectState() {
    if (!ctx) return;
    const shouldRun = unlocked && !muted && wantPlay;
    if (shouldRun && !running) startSeq();
    else if (!shouldRun && running) stopSeq();
  }

  /* ------------------------------ Cues --------------------------------- */
  // Short, subtle gameplay feedback on the SFX bus (same synth, muted together).
  function cue(kind) {
    try {
      if (!ctx || muted || !unlocked) return;
      const t = ctx.currentTime;
      if (kind === "merge") {
        tone("square", midiToFreq(72), t, 0.08, 0.14, sfxBus);
        tone("square", midiToFreq(76), t + 0.07, 0.10, 0.14, sfxBus);
      } else if (kind === "continent") {
        tone("square", midiToFreq(72), t, 0.07, 0.15, sfxBus);
        tone("square", midiToFreq(76), t + 0.06, 0.07, 0.15, sfxBus);
        tone("square", midiToFreq(79), t + 0.12, 0.14, 0.16, sfxBus);
      } else if (kind === "row") {
        tone("triangle", midiToFreq(76), t, 0.08, 0.13, sfxBus);
        tone("triangle", midiToFreq(72), t + 0.07, 0.10, 0.12, sfxBus);
      }
    } catch (e) { /* never let audio break play */ }
  }

  /* --------------------------- Mute button ----------------------------- */
  function updateButton() {
    if (!btn) return;
    btn.textContent = muted ? "🔇" : "🔊";
    btn.setAttribute("aria-pressed", muted ? "true" : "false");
    btn.setAttribute("aria-label", muted ? "Unmute music" : "Mute music");
    btn.title = (muted ? "Unmute" : "Mute") + " music (M)";
  }

  function setupButton() {
    btn = document.getElementById("mute-btn");
    if (!btn) return;
    updateButton();
    btn.addEventListener("click", () => { unlock(); toggleMute(); });
  }

  /* ------------------------------ API ---------------------------------- */
  function unlock() {
    try {
      if (!ctx) init();
      if (!ctx) return;
      if (ctx.state === "suspended") ctx.resume();
      unlocked = true;
      reflectState();
    } catch (e) { /* audio unavailable — game continues silently */ }
  }

  function play() { wantPlay = true; reflectState(); }
  function pause() { wantPlay = false; reflectState(); }

  function setLevel(n) { level = n; }

  function toggleMute() {
    muted = !muted;
    persistMuted();
    applyMute();
    reflectState();
    updateButton();
    return muted;
  }

  function isMuted() { return muted; }

  setupButton();

  return { unlock, play, pause, setLevel, cue, toggleMute, isMuted };
})();
