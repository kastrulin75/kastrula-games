'use strict';

// Хранилище «???»: пароль (рекорд в Тетрисе) и три логических замка.
// Чем ближе к финишу, тем громче гул, чаще сердцебиение, сильнее пепел, глитчи и тряска.
// После третьего замка — крещендо, вспышка и переход по ссылке.
(() => {
  const TARGET = 'https://kastrulin75.github.io/DUST-BLADES/main-menu/index.html';
  const $ = id => document.getElementById(id);
  const root = document.documentElement;
  const panel = $('panel'), titleEl = $('v-title'), subEl = $('v-sub'), body = $('v-body'), msg = $('v-msg');
  const steps = [...document.querySelectorAll('.vault-steps i')];
  const TENSION = [0.08, 0.36, 0.64, 0.92];
  const rnd = (a, b) => a + Math.random() * (b - a);
  const pick = arr => arr[Math.floor(Math.random() * arr.length)];

  $('exit-ico').innerHTML = Icons.back;

  let stage = 0;
  let tension = 0.04, target = TENSION[0];
  let finishing = 0;      // 0 — нет, иначе время с начала финала
  let audioOn = false;

  // Звук включается с первым действием пользователя (правило браузеров)
  const wake = () => { Sound.init(); audioOn = true; };
  addEventListener('pointerdown', wake);
  addEventListener('keydown', wake);

  function bestTetris() {
    try { return Number(localStorage.getItem('arcade-best-tetris')) || 0; } catch { return 0; }
  }

  // ---------- Этапы ----------
  function setStage(n) {
    stage = n;
    target = TENSION[n];
    steps.forEach((s, i) => { s.className = i < n ? 'done' : i === n ? 'now' : ''; });
    msg.textContent = '';
    msg.className = 'vault-msg';
    panel.classList.remove('swap');
    void panel.offsetWidth;
    panel.classList.add('swap');
    [password, lock1, lock2, lock3][n]();
  }

  function setHead(title, sub) {
    titleEl.textContent = title;
    subEl.textContent = sub;
  }

  function fail(input, text) {
    msg.className = 'vault-msg';
    msg.textContent = text;
    if (input) { input.classList.remove('bad'); void input.offsetWidth; input.classList.add('bad'); input.select && input.select(); }
    Sound.sfx.error();
    Sound.noise({ dur: 0.25, vol: 0.18, freq: 900, type: 'bandpass', q: 2 });
    redFlash = 1;
    target = Math.min(1, target + 0.04);
    glitchTitle();
  }

  function pass(next) {
    msg.className = 'vault-msg ok';
    msg.textContent = 'ОТКРЫТО';
    Sound.tone({ freq: 98, dur: 0.9, type: 'sawtooth', vol: 0.18 });
    Sound.tone({ freq: 147, dur: 0.9, type: 'sawtooth', vol: 0.12, when: 0.05 });
    Sound.noise({ dur: 0.6, vol: 0.2, freq: 300, freqEnd: 80 });
    shakeKick = 1;
    setTimeout(next, 900);
  }

  function form(placeholder, onSubmit, opts = {}) {
    const f = document.createElement('form');
    f.className = 'v-form';
    f.innerHTML = `<input class="v-input" autocomplete="off" spellcheck="false" placeholder="${placeholder}"
      ${opts.numeric ? 'inputmode="numeric"' : ''} ${opts.max ? `maxlength="${opts.max}"` : ''}>
      <button class="v-btn" type="submit">${opts.button || 'ВВОД'}</button>`;
    const input = f.querySelector('input');
    input.addEventListener('input', () => { Sound.tone({ freq: 1400 + Math.random() * 300, dur: 0.02, vol: 0.05 }); });
    f.addEventListener('submit', e => { e.preventDefault(); onSubmit(input.value.trim(), input); });
    body.appendChild(f);
    setTimeout(() => input.focus(), 60);
    return input;
  }

  // Пароль — рекорд в Тетрисе
  function password() {
    setHead('ДОСТУП', 'Введи пароль.');
    body.innerHTML = '';
    let tries = 0;
    form('пароль', (v, input) => {
      const best = bestTetris();
      if (best > 0 && v === String(best)) { pass(() => setStage(1)); return; }
      tries++;
      fail(input, 'НЕВЕРНО');
      if (tries >= 3) {
        msg.className = 'vault-msg hint';
        msg.textContent = tries >= 5
          ? 'Подсказка: это твой лучший результат там, где сверху падают фигуры.'
          : 'Подсказка: это число ты уже где-то заработал.';
      }
    }, { numeric: true, button: 'ВОЙТИ' });
  }

  // Замок I: продолжить последовательность
  const SEQUENCES = [
    { s: [2, 6, 12, 20, 30], a: 42 },
    { s: [1, 1, 2, 3, 5, 8], a: 13 },
    { s: [3, 5, 9, 17, 33], a: 65 },
    { s: [1, 4, 9, 16, 25], a: 36 },
    { s: [2, 3, 5, 7, 11, 13], a: 17 },
    { s: [1, 3, 6, 10, 15], a: 21 },
    { s: [5, 10, 8, 16, 14], a: 28 },
    { s: [81, 27, 9, 3], a: 1 },
    { s: [1, 2, 6, 24, 120], a: 720 },
    { s: [7, 10, 16, 25, 37], a: 52 },
  ];
  function lock1() {
    setHead('ЗАМОК I', 'Продолжи последовательность.');
    const q = pick(SEQUENCES);
    body.innerHTML = `<div class="seq">${q.s.map(n => `<b>${n}</b>`).join('')}<b class="q">?</b></div>`;
    form('число', (v, input) => {
      if (Number(v) === q.a && v !== '') pass(() => setStage(2));
      else fail(input, 'НЕВЕРНО');
    }, { numeric: true });
  }

  // Замок II: зажечь все лампы; что переключает каждый тумблер — неизвестно
  function lock2() {
    setHead('ЗАМОК II', 'Зажги все лампы. Каждый тумблер переключает несколько из них.');
    const N = 6, K = 4, ALL = (1 << N) - 1;
    let masks, state;
    do {
      masks = Array.from({ length: K }, () => {
        let m = 0;
        while (popcount(m) < 2 || popcount(m) > 3) m = Math.floor(Math.random() * ALL) + 1;
        return m;
      });
      const pressed = masks.filter(() => Math.random() < 0.5);
      state = pressed.reduce((s, m) => s ^ m, ALL);
    } while (state === ALL);
    body.innerHTML = `<div class="lamps">${Array.from({ length: N }, (_, i) => `<span class="lamp" data-i="${i}"></span>`).join('')}</div>
      <div class="switches">${masks.map((_, i) => `<button class="switch" type="button">${'ABCD'[i]}</button>`).join('')}</div>`;
    const lamps = [...body.querySelectorAll('.lamp')];
    const paint = () => lamps.forEach((l, i) => l.classList.toggle('on', !!(state & (1 << i))));
    paint();
    body.querySelectorAll('.switch').forEach((b, i) => b.addEventListener('click', () => {
      if (state === ALL) return;
      state ^= masks[i];
      b.classList.toggle('flip');
      Sound.tone({ freq: 160, freqEnd: 90, dur: 0.07, type: 'square', vol: 0.18 });
      paint();
      if (state === ALL) pass(() => setStage(3));
    }));
    setTimeout(() => body.querySelector('.switch').focus(), 60);
  }
  function popcount(m) { let c = 0; while (m) { c += m & 1; m >>= 1; } return c; }

  // Замок III: код сейфа по подсказкам «верна / на своём месте»
  function score(code, guess) {
    let a = 0, b = 0;
    for (let i = 0; i < 3; i++) {
      if (guess[i] === code[i]) a++;
      else if (code.includes(guess[i])) b++;
    }
    return [a, b];
  }
  const FEEDBACK = {
    '1,0': 'одна цифра верна и стоит на своём месте',
    '0,1': 'одна цифра верна, но стоит не на своём месте',
    '0,2': 'две цифры верны, но обе не на своих местах',
    '1,1': 'две цифры верны: одна на своём месте, другая нет',
    '2,0': 'две цифры верны и стоят на своих местах',
    '0,0': 'ни одна цифра не подходит',
    '0,3': 'все цифры верны, но все не на своих местах',
    '1,2': 'все цифры верны, но на своём месте только одна',
  };
  function makeSafe() {
    const all = [];
    for (let x = 0; x < 10; x++) for (let y = 0; y < 10; y++) for (let z = 0; z < 10; z++) {
      if (x !== y && y !== z && x !== z) all.push(`${x}${y}${z}`);
    }
    for (;;) {
      const code = pick(all);
      let cands = all;
      const clues = [];
      for (let guard = 0; guard < 400 && clues.length < 6 && cands.length > 1; guard++) {
        const g = pick(all);
        if (g === code) continue;
        const fb = score(code, g);
        const key = fb.join(',');
        if (!FEEDBACK[key]) continue;
        const next = cands.filter(c => score(c, g).join(',') === key);
        if (next.length === cands.length) continue;
        cands = next;
        clues.push({ g, key });
      }
      if (cands.length === 1 && clues.length >= 3) return { code, clues };
    }
  }
  function lock3() {
    setHead('ЗАМОК III', 'Найди трёхзначный код сейфа. Цифры в коде не повторяются.');
    const { code, clues } = makeSafe();
    body.innerHTML = `<div class="clues">${clues.map(c =>
      `<div class="clue"><div class="digits">${[...c.g].map(d => `<b>${d}</b>`).join('')}</div><span>${FEEDBACK[c.key]}</span></div>`).join('')}</div>`;
    form('код', (v, input) => {
      if (v === code) pass(finale);
      else fail(input, 'НЕВЕРНО');
    }, { numeric: true, max: 3, button: 'ОТКРЫТЬ' });
  }

  // ---------- Финал ----------
  function finale() {
    steps.forEach(s => { s.className = 'done'; });
    setHead('. . .', '');
    body.innerHTML = '';
    msg.textContent = '';
    finishing = 0.0001;
    target = 1.35;
    Sound.noise({ dur: 2.6, vol: 0.3, freq: 120, freqEnd: 3000, type: 'bandpass', q: 1.2 });
    Sound.tone({ freq: 40, freqEnd: 160, dur: 2.6, type: 'sawtooth', vol: 0.22 });
    setTimeout(() => {
      const flash = $('flash');
      flash.style.transition = 'none';
      flash.style.opacity = '1';
      Sound.silence();
      Sound.sfx.explode(1.6);
      void flash.offsetWidth;
      flash.style.transition = 'opacity 1.2s ease';
      setTimeout(() => { flash.style.opacity = '0'; $('end').classList.add('show'); }, 120);
      setTimeout(() => { location.href = TARGET; }, 2200);
    }, 2600);
  }

  // ---------- Атмосфера ----------
  const canvas = $('atmo');
  const ctx = canvas.getContext('2d');
  let W = 0, H = 0;
  function resize() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    W = innerWidth; H = innerHeight;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  resize();
  addEventListener('resize', resize);

  const ash = Array.from({ length: 140 }, () => ({ x: Math.random(), y: Math.random(), s: rnd(0.6, 2.4), v: rnd(0.3, 1), w: rnd(0, 6.28) }));
  let beatT = 1, pulse = 0, redFlash = 0, shakeKick = 0, glitchT = 0, flicker = 0, last = performance.now();

  function glitchTitle() {
    titleEl.classList.remove('glitch');
    void titleEl.offsetWidth;
    titleEl.classList.add('glitch');
  }

  function drone() {
    if (!audioOn) return;
    const t = Math.min(1.35, tension);
    Sound.loop('drone', { type: 'sawtooth', freq: 46 + t * 16, vol: 0.02 + t * 0.12, lfoRate: 0.2 + t * 3, lfoDepth: 2 + t * 7 });
    Sound.loop('drone2', { type: 'sine', freq: 31 + t * 7, vol: 0.06 + t * 0.2, lfoRate: 0.15, lfoDepth: 1.5 });
    Sound.loop('whine', { type: 'triangle', freq: 820 + t * 520, vol: Math.max(0, t - 0.45) * 0.035, lfoRate: 5 + t * 4, lfoDepth: 25 });
  }

  function heartbeat() {
    pulse = 1;
    if (!audioOn) return;
    const v = 0.12 + tension * 0.32;
    Sound.tone({ freq: 62, freqEnd: 38, dur: 0.16, type: 'sine', vol: v });
    Sound.tone({ freq: 58, freqEnd: 36, dur: 0.14, type: 'sine', vol: v * 0.7, when: 0.22 });
    if (tension > 0.55 && Math.random() < tension * 0.35) {
      Sound.noise({ dur: 0.12, vol: 0.05 + tension * 0.06, freq: rnd(1800, 4000), type: 'bandpass', q: 6, when: rnd(0.3, 0.6) });
    }
  }

  function frame(now) {
    const dt = Math.max(0, Math.min(0.05, (now - last) / 1000));
    last = now;
    if (finishing) finishing += dt;
    tension += (target - tension) * Math.min(1, dt * (finishing ? 1.2 : 0.8));
    root.style.setProperty('--t', Math.min(1, tension).toFixed(3));

    // сердцебиение всё чаще
    beatT -= dt;
    if (beatT <= 0) { beatT = Math.max(0.42, 1.35 - tension * 0.85); heartbeat(); }
    pulse *= Math.pow(0.05, dt);
    redFlash *= Math.pow(0.02, dt);
    shakeKick *= Math.pow(0.03, dt);
    root.style.setProperty('--pulse', Math.max(pulse, redFlash).toFixed(3));
    drone();

    // глитчи заголовка и мерцание
    glitchT -= dt;
    if (glitchT <= 0) {
      glitchT = rnd(0.6, 3.5) / (0.3 + tension * 2);
      if (tension > 0.25) glitchTitle();
      if (tension > 0.6 && Math.random() < 0.5) flicker = 0.25;
    }
    flicker = Math.max(0, flicker - dt);

    // тряска панели
    const amp = Math.max(0, tension - 0.5) * 5 + shakeKick * 6 + (finishing ? finishing * 6 : 0);
    const sx = amp ? rnd(-amp, amp) : 0, sy = amp ? rnd(-amp, amp) : 0;
    panel.style.transform = `translate(calc(-50% + ${sx.toFixed(1)}px), calc(-50% + ${sy.toFixed(1)}px))`;

    draw(dt);
    requestAnimationFrame(frame);
  }

  function draw(dt) {
    const t = Math.min(1.35, tension);
    ctx.fillStyle = `rgba(5, 5, 5, ${0.55 - t * 0.2})`;
    ctx.fillRect(0, 0, W, H);

    // пепел поднимается вверх, быстрее с напряжением
    for (const a of ash) {
      a.w += dt * (0.6 + t);
      a.y -= dt * a.v * (0.015 + t * 0.06);
      a.x += Math.sin(a.w) * dt * 0.01 + dt * t * 0.01;
      if (a.y < -0.02) { a.y = 1.02; a.x = Math.random(); }
      if (a.x > 1.02) a.x = -0.02;
      const red = t > 0.5 && a.s > 1.8;
      ctx.fillStyle = red ? `rgba(255, 70, 60, ${0.25 + t * 0.4})` : `rgba(200, 200, 200, ${0.12 + t * 0.25})`;
      ctx.fillRect(a.x * W, a.y * H, a.s, a.s);
    }

    // зерно
    const grains = Math.floor(120 + t * 900);
    ctx.fillStyle = `rgba(255, 255, 255, ${0.04 + t * 0.05})`;
    for (let i = 0; i < grains; i++) ctx.fillRect(Math.random() * W, Math.random() * H, 1, 1);

    // полосы помех
    if (t > 0.4 && Math.random() < t * 0.12) {
      const n = 1 + Math.floor(Math.random() * 3);
      for (let i = 0; i < n; i++) {
        const y = Math.random() * H, h = rnd(2, 10 + t * 20);
        ctx.fillStyle = Math.random() < 0.5 ? `rgba(255, 46, 58, ${0.08 + t * 0.12})` : `rgba(255, 255, 255, ${0.05 + t * 0.08})`;
        ctx.fillRect(0, y, W, h);
      }
    }

    // красная пульсация от краёв
    const p = Math.max(pulse, redFlash) * t;
    if (p > 0.01) {
      const g = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.25, W / 2, H / 2, Math.max(W, H) * 0.75);
      g.addColorStop(0, 'rgba(120, 0, 10, 0)');
      g.addColorStop(1, `rgba(170, 0, 15, ${p * 0.45})`);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
    }
    if (flicker > 0) {
      ctx.fillStyle = `rgba(0, 0, 0, ${flicker * 1.6})`;
      ctx.fillRect(0, 0, W, H);
    }
  }

  setStage(0);
  requestAnimationFrame(frame);
})();
