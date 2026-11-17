// Procedural sound for SOLAR BAY: every sound is synthesized with WebAudio,
// no audio files, no licensed material. All calls are safe before the user
// has interacted (the context is created lazily on first gesture).

export function createAudio() {
  let ctx = null;
  let master = null;
  let engineOsc = null;
  let engineGain = null;
  let sirenOsc = null;
  let sirenGain = null;
  let sirenTimer = null;
  let musicTimer = null;
  let musicOn = false;

  function ensure() {
    if (ctx) return true;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.35;
      master.connect(ctx.destination);
      return true;
    } catch (e) { return false; }
  }

  function resume() {
    if (ctx && ctx.state === 'suspended') ctx.resume().catch(() => {});
  }

  function blip(freq, dur, type, vol, slideTo) {
    if (!ensure()) return;
    try {
      const t = ctx.currentTime;
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = type || 'sine';
      o.frequency.setValueAtTime(freq, t);
      if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
      g.gain.setValueAtTime(vol || 0.2, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + dur);
      o.connect(g); g.connect(master);
      o.start(t); o.stop(t + dur + 0.02);
    } catch (e) { /* sound is best-effort */ }
  }

  function noiseBurst(dur, vol, lowpass) {
    if (!ensure()) return;
    try {
      const t = ctx.currentTime;
      const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
      const src = ctx.createBufferSource();
      src.buffer = buf;
      const filt = ctx.createBiquadFilter();
      filt.type = 'lowpass';
      filt.frequency.value = lowpass || 1200;
      const g = ctx.createGain();
      g.gain.setValueAtTime(vol || 0.3, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + dur);
      src.connect(filt); filt.connect(g); g.connect(master);
      src.start(t);
    } catch (e) { /* sound is best-effort */ }
  }

  function startEngine() {
    if (!ensure() || engineOsc) return;
    try {
      engineOsc = ctx.createOscillator();
      engineOsc.type = 'sawtooth';
      engineOsc.frequency.value = 55;
      engineGain = ctx.createGain();
      engineGain.gain.value = 0.0;
      const filt = ctx.createBiquadFilter();
      filt.type = 'lowpass'; filt.frequency.value = 420;
      engineOsc.connect(filt); filt.connect(engineGain); engineGain.connect(master);
      engineOsc.start();
    } catch (e) { /* sound is best-effort */ }
  }

  function setEngine(speed01) {
    if (!engineOsc || !engineGain) return;
    try {
      engineOsc.frequency.setTargetAtTime(50 + speed01 * 130, ctx.currentTime, 0.08);
      engineGain.gain.setTargetAtTime(0.02 + speed01 * 0.06, ctx.currentTime, 0.1);
    } catch (e) { /* ignore */ }
  }

  function stopEngine() {
    if (!engineOsc) return;
    try { engineOsc.stop(); } catch (e) {}
    engineOsc = null; engineGain = null;
  }

  function startSiren() {
    if (!ensure() || sirenOsc) return;
    try {
      sirenOsc = ctx.createOscillator();
      sirenOsc.type = 'triangle';
      sirenOsc.frequency.value = 700;
      sirenGain = ctx.createGain();
      sirenGain.gain.value = 0.05;
      sirenOsc.connect(sirenGain); sirenGain.connect(master);
      sirenOsc.start();
      let high = true;
      sirenTimer = setInterval(() => {
        if (!sirenOsc) return;
        try { sirenOsc.frequency.setTargetAtTime(high ? 950 : 650, ctx.currentTime, 0.05); } catch (e) {}
        high = !high;
      }, 380);
    } catch (e) { /* ignore */ }
  }

  function stopSiren() {
    if (sirenTimer) { clearInterval(sirenTimer); sirenTimer = null; }
    if (!sirenOsc) return;
    try { sirenOsc.stop(); } catch (e) {}
    sirenOsc = null; sirenGain = null;
  }

  // A slow, warm pad loop: two detuned triangles drifting through a major
  // chord, one note change every bar. Pure synthesis, original motif.
  const CHORDS = [[220, 277, 330], [196, 247, 294], [175, 220, 262], [247, 294, 370]];
  function startMusic() {
    if (!ensure() || musicOn) return;
    musicOn = true;
    let step = 0;
    const playBar = () => {
      if (!musicOn || !ctx) return;
      const chord = CHORDS[step % CHORDS.length];
      step++;
      for (const f of chord) {
        try {
          const o = ctx.createOscillator();
          const g = ctx.createGain();
          o.type = 'triangle';
          o.frequency.value = f;
          o.detune.value = (Math.random() * 8 - 4);
          const t = ctx.currentTime;
          g.gain.setValueAtTime(0.0001, t);
          g.gain.linearRampToValueAtTime(0.035, t + 0.8);
          g.gain.linearRampToValueAtTime(0.0001, t + 3.4);
          o.connect(g); g.connect(master);
          o.start(t); o.stop(t + 3.5);
        } catch (e) { /* ignore */ }
      }
    };
    playBar();
    musicTimer = setInterval(playBar, 3200);
  }

  function stopMusic() {
    musicOn = false;
    if (musicTimer) { clearInterval(musicTimer); musicTimer = null; }
  }

  return {
    unlock() { if (ensure()) resume(); },
    setEngine, startEngine, stopEngine, startSiren, stopSiren, startMusic, stopMusic,
    shoot() { noiseBurst(0.14, 0.5, 2600); blip(190, 0.09, 'square', 0.18, 60); },
    punch() { noiseBurst(0.1, 0.35, 500); },
    pickup() { blip(660, 0.12, 'sine', 0.22, 990); },
    cash() { blip(880, 0.1, 'sine', 0.2); setTimeout(() => blip(1320, 0.16, 'sine', 0.2), 90); },
    missionDone() {
      [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => blip(f, 0.22, 'triangle', 0.22), i * 110));
    },
    busted() { [330, 262, 196].forEach((f, i) => setTimeout(() => blip(f, 0.3, 'sawtooth', 0.16), i * 160)); },
    horn() { blip(370, 0.25, 'square', 0.12, 370); },
    click() { blip(440, 0.06, 'sine', 0.15); },
  };
}
