'use strict';

// Звуковой движок аркады: всё синтезируется через Web Audio API, файлов нет.
const Sound = (() => {
  const VOL = 0.35;
  let ac = null;
  let master = null;
  let noiseBuf = null;
  let muted = (() => {
    try { return localStorage.getItem('arcade-muted') === '1'; } catch { return false; }
  })();

  // Браузеры разрешают звук только после жеста пользователя — вызывать из обработчиков ввода
  function init() {
    if (!ac) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      ac = new AC();
      master = ac.createGain();
      master.gain.value = muted ? 0 : VOL;
      master.connect(ac.destination);
      noiseBuf = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    if (ac.state === 'suspended') ac.resume();
  }

  function tone({ freq = 440, freqEnd, dur = 0.1, type = 'square', vol = 0.3, when = 0, attack = 0.004, dest } = {}) {
    if (!ac) return;
    const t = ac.currentTime + when;
    const o = ac.createOscillator();
    const g = ac.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (freqEnd) o.frequency.exponentialRampToValueAtTime(Math.max(freqEnd, 1), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g);
    g.connect(dest || master);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  function noise({ dur = 0.2, vol = 0.3, when = 0, type = 'lowpass', freq = 1200, freqEnd, q = 1, dest } = {}) {
    if (!ac) return;
    const t = ac.currentTime + when;
    const src = ac.createBufferSource();
    src.buffer = noiseBuf;
    src.loop = true;
    const f = ac.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(freq, t);
    f.Q.value = q;
    if (freqEnd) f.frequency.exponentialRampToValueAtTime(Math.max(freqEnd, 1), t + dur);
    const g = ac.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f);
    f.connect(g);
    g.connect(dest || master);
    src.start(t);
    src.stop(t + dur + 0.05);
  }

  // notes: частота или [частота, длительность в шагах]; 0 — пауза
  function melody(notes, step = 0.1, opts = {}) {
    let when = opts.when || 0;
    for (const n of notes) {
      const [f, len] = Array.isArray(n) ? n : [n, 1];
      if (f) tone({ type: 'square', vol: 0.15, ...opts, freq: f, dur: step * len * 0.95, when });
      when += step * len;
    }
  }

  // Нота по имени: 'C4', 'F#5', 'Bb3'
  const SEMI = { C: -9, D: -7, E: -5, F: -4, G: -2, A: 0, B: 2 };
  function freqOf(name) {
    if (typeof name === 'number') return name;
    const m = /^([A-G])([#b]?)(-?\d)$/.exec(name);
    if (!m) return 0;
    let n = SEMI[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0) + (Number(m[3]) - 4) * 12;
    return 440 * Math.pow(2, n / 12);
  }

  // ---------- Непрерывные звуки (двигатель, сирена) ----------

  const loops = {};
  function makeLoop(cfg) {
    const g = ac.createGain();
    g.gain.value = 0;
    g.connect(master);
    const L = { g, key: '' };
    if (cfg.noise) {
      const src = ac.createBufferSource();
      src.buffer = noiseBuf;
      src.loop = true;
      const f = ac.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = cfg.freq || 800;
      src.connect(f);
      f.connect(g);
      src.start();
      L.f = f;
    } else {
      const o = ac.createOscillator();
      o.type = cfg.type || 'sine';
      o.frequency.value = cfg.freq || 220;
      const lfo = ac.createOscillator();
      lfo.frequency.value = cfg.lfoRate || 0;
      const lg = ac.createGain();
      lg.gain.value = cfg.lfoDepth || 0;
      lfo.connect(lg);
      lg.connect(o.frequency);
      o.connect(g);
      o.start();
      lfo.start();
      L.o = o; L.lfo = lfo; L.lg = lg;
    }
    return L;
  }

  // cfg: { type, freq, vol, lfoRate, lfoDepth } или { noise: true, freq, vol }; null — выключить
  function loop(name, cfg) {
    if (!ac) return;
    let L = loops[name];
    const t = ac.currentTime;
    if (!cfg) {
      if (L && L.key !== 'off') { L.g.gain.setTargetAtTime(0, t, 0.03); L.key = 'off'; }
      return;
    }
    const key = [cfg.type, Math.round(cfg.freq || 0), cfg.vol, cfg.lfoRate, cfg.lfoDepth].join('|');
    if (L && L.key === key) return;
    if (!L) L = loops[name] = makeLoop(cfg);
    L.key = key;
    if (L.o) {
      if (cfg.type) L.o.type = cfg.type;
      L.o.frequency.setTargetAtTime(cfg.freq || 220, t, 0.03);
      L.lfo.frequency.setTargetAtTime(cfg.lfoRate || 0, t, 0.03);
      L.lg.gain.setTargetAtTime(cfg.lfoDepth || 0, t, 0.03);
    } else {
      L.f.frequency.setTargetAtTime(cfg.freq || 800, t, 0.03);
    }
    L.g.gain.setTargetAtTime(cfg.vol ?? 0.1, t, 0.03);
  }

  // ---------- Музыка ----------
  // track: { bpm, voices: [{ type, vol, notes: [['E5', 1], [0, 0.5], ['kick', 1] ...] }] }

  let music = null;
  function playMusic(track) {
    if (!ac) return;
    if (music && music.track === track) return;
    stopMusic();
    const gain = ac.createGain();
    gain.gain.value = 1;
    gain.connect(master);
    const m = { track, gain, voices: track.voices.map(v => ({ v, i: 0, t: ac.currentTime + 0.08 })) };
    m.timer = setInterval(() => schedule(m), 40);
    schedule(m);
    music = m;
  }
  function schedule(m) {
    const ahead = ac.currentTime + 0.25;
    const beat = 60 / m.track.bpm;
    for (const vs of m.voices) {
      while (vs.t < ahead) {
        const [n, len] = vs.v.notes[vs.i];
        const when = Math.max(0, vs.t - ac.currentTime);
        const dur = len * beat;
        if (n === 'kick') tone({ freq: 150, freqEnd: 40, dur: 0.18, type: 'sine', vol: vs.v.vol, when, dest: m.gain });
        else if (n === 'snare') noise({ dur: 0.15, vol: vs.v.vol, type: 'highpass', freq: 1500, when, dest: m.gain });
        else if (n === 'hat') noise({ dur: 0.04, vol: vs.v.vol, type: 'highpass', freq: 7000, when, dest: m.gain });
        else if (n) tone({ freq: freqOf(n), dur: dur * 0.9, type: vs.v.type || 'square', vol: vs.v.vol, when, dest: m.gain });
        vs.t += dur;
        vs.i = (vs.i + 1) % vs.v.notes.length;
      }
    }
  }
  function stopMusic() {
    if (!music) return;
    clearInterval(music.timer);
    try { music.gain.disconnect(); } catch { /* уже отключён */ }
    music = null;
  }

  function silence() {
    stopMusic();
    if (!ac) return;
    for (const k in loops) loop(k, null);
  }

  // ---------- Готовые эффекты ----------

  const sfx = {
    blip: (p = 1) => tone({ freq: 660 * p, dur: 0.05, vol: 0.12 }),
    hover: () => tone({ freq: 880, dur: 0.03, type: 'triangle', vol: 0.08 }),
    select: () => { tone({ freq: 523, dur: 0.07, vol: 0.14 }); tone({ freq: 784, dur: 0.12, vol: 0.14, when: 0.06 }); },
    coin: () => { tone({ freq: 988, dur: 0.07, vol: 0.14 }); tone({ freq: 1319, dur: 0.2, vol: 0.14, when: 0.07 }); },
    jump: (p = 1) => tone({ freq: 250 * p, freqEnd: 620 * p, dur: 0.15, vol: 0.16 }),
    bigJump: () => tone({ freq: 200, freqEnd: 1300, dur: 0.32, vol: 0.16 }),
    flap: () => tone({ freq: 380, freqEnd: 720, dur: 0.08, type: 'triangle', vol: 0.3 }),
    shoot: () => tone({ freq: 900, freqEnd: 220, dur: 0.11, vol: 0.1 }),
    laser: () => tone({ freq: 1600, freqEnd: 300, dur: 0.15, type: 'sawtooth', vol: 0.09 }),
    explode: (size = 1) => {
      noise({ dur: 0.25 + 0.4 * size, vol: 0.32, freq: 2200, freqEnd: 100 });
      tone({ freq: 120, freqEnd: 40, dur: 0.2 + 0.2 * size, type: 'sine', vol: 0.3 });
    },
    hit: () => { noise({ dur: 0.08, vol: 0.3, freq: 3000, type: 'bandpass' }); tone({ freq: 220, freqEnd: 110, dur: 0.1, vol: 0.14 }); },
    bounce: (p = 1) => tone({ freq: 440 * p, dur: 0.06, vol: 0.14 }),
    powerup: () => melody([523, 659, 784, 1047, 1319], 0.05, { vol: 0.11 }),
    hurt: () => tone({ freq: 420, freqEnd: 70, dur: 0.4, type: 'sawtooth', vol: 0.18 }),
    lose: () => melody([392, 370, 349, [330, 3]], 0.16, { type: 'triangle', vol: 0.32 }),
    win: () => melody([523, 659, 784, [1047, 2], 784, [1047, 3]], 0.1, { vol: 0.14 }),
    tick: () => tone({ freq: 1200, dur: 0.02, vol: 0.07 }),
    place: () => { tone({ freq: 170, freqEnd: 90, dur: 0.09, type: 'triangle', vol: 0.4 }); noise({ dur: 0.05, vol: 0.1, freq: 2000 }); },
    clear: (n = 1) => melody([659, 784, 988, 1175, 1319, 1568].slice(0, 2 + n), 0.06, { vol: 0.13 }),
    pop: (p = 1) => tone({ freq: 500 * p, freqEnd: 1100 * p, dur: 0.07, type: 'sine', vol: 0.3 }),
    splash: () => noise({ dur: 0.5, vol: 0.32, freq: 3000, freqEnd: 300, type: 'bandpass', q: 0.7 }),
    step: () => tone({ freq: 190, dur: 0.03, type: 'triangle', vol: 0.18 }),
    error: () => tone({ freq: 140, dur: 0.18, type: 'sawtooth', vol: 0.14 }),
    levelUp: () => melody([523, 784, 1047, 1568], 0.08, { vol: 0.13 }),
    thud: () => tone({ freq: 130, freqEnd: 50, dur: 0.15, type: 'sine', vol: 0.5 }),
    start: () => melody([392, 523, 659, [784, 2]], 0.08, { vol: 0.12 }),
    crack: () => noise({ dur: 0.12, vol: 0.3, freq: 2500, type: 'bandpass', q: 2 }),
    zap: () => { noise({ dur: 0.2, vol: 0.25, freq: 4000, type: 'bandpass', q: 4 }); tone({ freq: 90, dur: 0.2, type: 'square', vol: 0.12 }); },
    whoosh: () => noise({ dur: 0.35, vol: 0.18, freq: 400, freqEnd: 3000, type: 'bandpass', q: 1.5 }),
  };

  return {
    init,
    tone,
    noise,
    melody,
    loop,
    freqOf,
    playMusic,
    stopMusic,
    silence,
    sfx,
    get ready() { return !!ac; },
    get muted() { return muted; },
    toggleMute() {
      muted = !muted;
      try { localStorage.setItem('arcade-muted', muted ? '1' : '0'); } catch { /* недоступно */ }
      if (master) master.gain.setTargetAtTime(muted ? 0 : VOL, ac.currentTime, 0.02);
      return muted;
    },
  };
})();
