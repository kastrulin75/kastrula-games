'use strict';

// Интро главного меню и музыка меню.
// При первом открытии сайта за сессию надпись Kastrula Games собирается по буквам в центре
// и уезжает на своё место в шапке. Музыка меню стартует сразу при открытии страницы.
const MenuMusic = (() => {
  // Музыка играет через Web Audio: так на неё можно наложить фильтр «под водой».
  // Обычный <audio> при открытии сайта с диска отдаёт в Web Audio тишину, поэтому песню
  // декодируем сами: на сайте — из mainmenu.mp3, с диска — из base64-копии mainmenu.data.js.
  const VOL = 0.45;
  const AC = window.AudioContext || window.webkitAudioContext;
  let ac = null, gain = null, filter = null, lfo = null, lfoGain = null;
  let buffer = null, src = null, loading = null;
  let playing = false, want = false, startAt = 0, offset = 0, underwater = false;

  // Фасад в духе <audio>: фон и спектроанализатор читают paused и currentTime
  const audio = {
    get paused() { return !playing; },
    get currentTime() {
      if (!playing || !buffer) return offset;
      return (ac.currentTime - startAt) % buffer.duration;
    },
  };

  function graph() {
    if (ac || !AC) return;
    ac = new AC();
    filter = ac.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 20000;
    filter.Q.value = 0.8;
    // лёгкое «плавание» фильтра под водой
    lfo = ac.createOscillator();
    lfo.frequency.value = 0.35;
    lfoGain = ac.createGain();
    lfoGain.gain.value = 0;
    lfo.connect(lfoGain).connect(filter.frequency);
    lfo.start();
    gain = ac.createGain();
    gain.gain.value = 0;
    filter.connect(gain).connect(ac.destination);
    ac.addEventListener('statechange', () => { if (ac.state === 'running') begin(); });
  }

  // На сайте (http/https, например GitHub Pages) берём mp3 напрямую. При открытии с диска (file://)
  // браузер не даёт прочитать файл из скрипта — тогда грузим ту же песню из base64-скрипта.
  function decode(bytes, resolve) {
    ac.decodeAudioData(bytes).then(b => { buffer = b; resolve(b); begin(); }, () => resolve(null));
  }
  function loadFromScript(resolve) {
    const done = () => {
      const b64 = window.MAINMENU_MP3_B64;
      if (!b64 || !ac) { resolve(null); return; }
      const bin = atob(b64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      window.MAINMENU_MP3_B64 = null;
      decode(bytes.buffer, resolve);
    };
    if (window.MAINMENU_MP3_B64) { done(); return; }
    const s = document.createElement('script');
    s.src = 'assets/sound/mainmenu.data.js';
    s.onload = done;
    s.onerror = () => resolve(null);
    document.head.appendChild(s);
  }
  function load() {
    if (loading) return loading;
    loading = new Promise(resolve => {
      if (location.protocol === 'file:') { loadFromScript(resolve); return; }
      fetch('assets/sound/mainmenu.mp3')
        .then(r => { if (!r.ok) throw new Error(r.status); return r.arrayBuffer(); })
        .then(bytes => decode(bytes, resolve))
        .catch(() => loadFromScript(resolve));
    });
    return loading;
  }

  function targetVol() { return Sound.muted ? 0 : (underwater ? VOL * 0.7 : VOL); }

  function begin() {
    if (!want || playing || !buffer || !ac || ac.state !== 'running' || document.hidden) return;
    src = ac.createBufferSource();
    src.buffer = buffer;
    src.loop = true;
    src.connect(filter);
    src.start(0, offset % buffer.duration);
    startAt = ac.currentTime - offset;
    playing = true;
    const t = ac.currentTime;
    gain.gain.cancelScheduledValues(t);
    gain.gain.setValueAtTime(gain.gain.value, t);
    gain.gain.linearRampToValueAtTime(targetVol(), t + 0.4);
  }

  function stop() {
    if (!playing) return;
    offset = audio.currentTime;
    try { src.stop(); } catch { /* уже остановлен */ }
    src.disconnect();
    src = null;
    playing = false;
  }

  function start() {
    if (want) return;
    want = true;
    graph();
    if (!ac) return;
    load();
    ac.resume().catch(() => {});
    // Браузеры не дают включить звук до первого действия на странице —
    // тогда музыка стартует от первого клика, касания или клавиши
    const kick = () => { if (want && ac.state !== 'running') ac.resume().catch(() => {}); };
    for (const type of ['pointerdown', 'keydown', 'touchstart']) addEventListener(type, kick, { passive: true });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) stop();
      else begin();
    });
  }

  function fadeOut(ms = 200) {
    want = false;
    if (!playing) return;
    const t = ac.currentTime;
    gain.gain.cancelScheduledValues(t);
    gain.gain.setValueAtTime(gain.gain.value, t);
    gain.gain.linearRampToValueAtTime(0, t + ms / 1000);
    setTimeout(stop, ms + 30);
  }

  // Эффект «как из-под воды»: срезаем верхние частоты, чуть тише, фильтр медленно «плавает»
  function setUnderwater(on) {
    underwater = on;
    if (!ac) return;
    const t = ac.currentTime;
    filter.frequency.cancelScheduledValues(t);
    filter.frequency.setValueAtTime(filter.frequency.value, t);
    filter.frequency.exponentialRampToValueAtTime(on ? 480 : 20000, t + (on ? 0.6 : 0.5));
    filter.Q.setTargetAtTime(on ? 4 : 0.8, t, 0.2);
    lfoGain.gain.setTargetAtTime(on ? 140 : 0, t, 0.3);
    if (playing) gain.gain.setTargetAtTime(targetVol(), t, 0.25);
  }

  return { start, fadeOut, setUnderwater, audio };
})();

MenuMusic.start();

(() => {
  const root = document.documentElement;
  if (!root.classList.contains('intro')) return;

  const screen = document.getElementById('intro');
  const logo = document.getElementById('intro-logo');
  const TEXT = 'Kastrula Games';
  const STEP = 75;      // мс между буквами (как в CSS)
  const BUILD = 550;    // длительность появления одной буквы
  const HOLD = 250;     // пауза перед отъездом

  function build() {
    logo.innerHTML = [...TEXT].map((ch, k) =>
      `<span class="ch" style="--k:${k};--r:${Math.round(Math.random() * 50 - 25)}">${ch === ' ' ? '&nbsp;' : ch}</span>`).join('');
    void logo.offsetWidth;
    logo.classList.add('show');
    Sound.init();
    setTimeout(fly, (TEXT.length - 1) * STEP + BUILD + HOLD);
  }

  function fly() {
    const target = document.querySelector('.hero .logo');
    root.classList.add('intro-landing');
    root.classList.remove('intro');
    screen.classList.add('leaving');
    scrollTo(0, 0);

    const t = target.getBoundingClientRect();
    const s0 = logo.getBoundingClientRect();
    const s = t.width / s0.width;
    const dx = (t.left + t.width / 2) - (s0.left + s0.width / 2);
    const dy = (t.top + t.height / 2) - (s0.top + s0.height / 2);
    logo.style.transition = 'transform 0.95s cubic-bezier(0.65, 0, 0.25, 1), filter 0.95s ease';
    logo.style.transform = `translate(${dx}px, ${dy}px) scale(${s})`;
    logo.style.filter = `drop-shadow(${4 / s}px ${4 / s}px 0 #3b0f6b) drop-shadow(0 0 ${22 / s}px rgba(255, 140, 26, 0.35))`;
    setTimeout(finish, 1000);
  }

  function finish() {
    root.classList.remove('intro-landing');
    screen.remove();
    try { sessionStorage.setItem('kg-intro-seen', '1'); } catch { /* не важно */ }
    dispatchEvent(new Event('kg:intro-done'));
  }

  // ждём пиксельный шрифт, чтобы буквы сразу были правильной формы
  const fontsReady = document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve();
  Promise.race([fontsReady, new Promise(r => setTimeout(r, 1200))]).then(() => requestAnimationFrame(build));
})();

// Фон меню в такт басу: по заранее измеренной громкости глубокого баса трека
// (assets/sound/mainmenu.bass.js) выставляем CSS-переменные:
// --beat — текущий бас (мгновенно вспыхивает, быстро гаснет), --kick — удар очень мощного баса,
// --level — медленная средняя громкость баса. Чем басовее звук — тем сильнее реакция.
(() => {
  if (typeof MAINMENU_BASS === 'undefined') return;
  const root = document.documentElement;
  const audio = MenuMusic.audio;
  const reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const KICK_AT = 0.72;
  let beat = 0, kick = 0, level = 0, prevBass = 0, last = performance.now();

  function frame(now) {
    const dt = Math.max(0, Math.min(0.1, (now - last) / 1000));
    last = now;
    const bass = audio.paused ? 0 : MAINMENU_BASS.at(audio.currentTime);
    beat = Math.max(bass, beat * Math.pow(0.02, dt));
    if (bass > KICK_AT && prevBass <= KICK_AT) {
      kick = Math.max(kick, bass);
      root.style.setProperty('--jx', String(Math.round((Math.random() - 0.5) * 10)));
    }
    kick *= Math.pow(0.003, dt);
    level += (bass - level) * Math.min(1, dt * 1.5);
    prevBass = bass;
    const k = reduce ? 0.35 : 1;
    root.style.setProperty('--beat', (beat * k).toFixed(3));
    root.style.setProperty('--kick', (kick * k).toFixed(3));
    root.style.setProperty('--level', (level * k).toFixed(3));
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();
