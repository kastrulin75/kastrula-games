'use strict';

// Спектроанализатор на горизонте меню: сегментные полосы растут вверх от линии горизонта
// (там, где неоновая сетка уходит под солнце), бас — в центре, верха — симметрично к краям.
// Данные берутся из заранее посчитанного спектра песни (assets/sound/mainmenu.spectrum.js)
// по текущему времени трека, поэтому полосы совпадают с музыкой даже при открытии файла с диска.
(() => {
  const canvas = document.getElementById('spectrum');
  if (!canvas || typeof MAINMENU_SPECTRUM === 'undefined') return;
  const ctx = canvas.getContext('2d');
  const audio = MenuMusic.audio;
  const S = MAINMENU_SPECTRUM;
  const BANDS = S.bands;
  const BARS = BANDS * 2;
  const REFLECT = 0.32;   // доля высоты под горизонтом для отражения
  const FALL = 1.6;       // скорость падения полос, высоты в секунду
  const PEAK_HOLD = 0.35; // сколько пик держится наверху
  const PEAK_FALL = 0.55;

  const target = new Float32Array(BANDS);
  const level = new Float32Array(BARS);
  const peak = new Float32Array(BARS);
  const peakT = new Float32Array(BARS);
  let W = 0, H = 0, horizon = 0, dpr = 1, last = performance.now(), t0 = performance.now();

  // Горизонт — нижний край шапки с надписью (в координатах страницы при прокрутке в самый верх)
  const root = document.documentElement;
  function placeHorizon() {
    const hero = document.querySelector('.hero');
    if (hero) root.style.setProperty('--horizon', Math.round(hero.offsetTop + hero.offsetHeight - 4) + 'px');
  }

  function resize() {
    placeHorizon();
    dpr = Math.min(2, window.devicePixelRatio || 1);
    const r = canvas.getBoundingClientRect();
    W = r.width; H = r.height;
    horizon = H / (1 + REFLECT);
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
  }
  resize();
  addEventListener('resize', resize);
  // высота шапки окончательная после загрузки шрифта и окончания интро
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(resize);
  addEventListener('kg:intro-done', resize);

  function frame(now) {
    const dt = Math.max(0, Math.min(0.1, (now - last) / 1000));
    last = now;

    if (!audio.paused) {
      S.at(audio.currentTime, target);
    } else {
      // без музыки — тихая «дышащая» волна, чтобы горизонт не был пустым
      const t = (now - t0) / 1000;
      for (let b = 0; b < BANDS; b++) target[b] = 0.06 + 0.05 * Math.sin(t * 1.6 + b * 0.45);
    }

    for (let i = 0; i < BARS; i++) {
      // бас в центре: от середины к краям идём от низких частот к высоким
      const b = i < BANDS ? BANDS - 1 - i : i - BANDS;
      const v = target[b];
      level[i] = v > level[i] ? v : Math.max(v, level[i] - FALL * dt);
      if (level[i] >= peak[i]) { peak[i] = level[i]; peakT[i] = PEAK_HOLD; }
      else if ((peakT[i] -= dt) <= 0) peak[i] = Math.max(level[i], peak[i] - PEAK_FALL * dt);
    }

    draw();
    requestAnimationFrame(frame);
  }

  function draw() {
    if (!W || !H) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);

    const span = Math.min(W * 0.94, 1180);
    const x0 = (W - span) / 2;
    const slot = span / BARS;
    const bw = Math.max(2, slot * 0.68);
    const seg = Math.max(3, Math.round(horizon / 26));
    const segGap = Math.max(1, Math.round(seg * 0.3));
    const maxH = horizon * 0.96;

    const up = ctx.createLinearGradient(0, horizon, 0, horizon - maxH);
    up.addColorStop(0, '#ff2e88');
    up.addColorStop(0.5, '#ff8c1a');
    up.addColorStop(1, '#ffe600');
    const down = ctx.createLinearGradient(0, horizon, 0, H);
    down.addColorStop(0, 'rgba(255, 46, 136, 0.45)');
    down.addColorStop(1, 'rgba(162, 89, 255, 0)');

    for (let i = 0; i < BARS; i++) {
      const x = x0 + i * slot + (slot - bw) / 2;
      // к краям полосы плавно гаснут, чтобы вписаться в сцену
      const d = Math.abs(i + 0.5 - BARS / 2) / (BARS / 2);
      const fade = 1 - d * d * 0.55;
      const h = level[i] * maxH;
      const n = Math.max(1, Math.round(h / seg));

      ctx.globalAlpha = fade;
      ctx.fillStyle = up;
      for (let k = 0; k < n; k++) {
        const y = horizon - (k + 1) * seg;
        ctx.fillRect(x, y + segGap, bw, seg - segGap);
      }
      // пик-«шапка»
      const py = horizon - peak[i] * maxH - 3;
      ctx.fillStyle = '#fff6c8';
      ctx.fillRect(x, py, bw, 2.5);

      // отражение на полу
      ctx.globalAlpha = fade * 0.6;
      ctx.fillStyle = down;
      ctx.fillRect(x, horizon + 2, bw, Math.min(H - horizon - 2, h * REFLECT * 1.6));
    }
    ctx.globalAlpha = 1;

    // светящаяся линия горизонта
    const line = ctx.createLinearGradient(x0, 0, x0 + span, 0);
    line.addColorStop(0, 'rgba(255, 46, 136, 0)');
    line.addColorStop(0.5, 'rgba(255, 220, 240, 0.9)');
    line.addColorStop(1, 'rgba(255, 46, 136, 0)');
    ctx.fillStyle = line;
    ctx.fillRect(x0, horizon, span, 1.5);
  }

  requestAnimationFrame(frame);
})();
