'use strict';

// Общий движок: игровой цикл, ввод (клавиатура, мышь, касания, экранные кнопки),
// HUD, оверлей старта / паузы / конца игры, рекорды.
//
// Игра регистрируется так:
//   Arcade.register({ width, height, start(api), update(dt, api), draw(ctx, api), ... })
// Необязательные поля: init(api), onPointer(type, x, y, button, api), onKey(code, repeat, api),
//   swipe (свайпы считаются направлениями), pointerAction (false — клик не считается «действием»),
//   scoreLabel, formatScore(v), lowerIsBetter, quietStart, noRestartKey.
const Arcade = (() => {
  const FONT = '"Press Start 2P", monospace';
  const meta = GAMES.find(g => g.id === new URLSearchParams(location.search).get('game'));
  let def = null;

  const KEYMAP = {
    ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down',
    ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right',
    Space: 'action', ShiftLeft: 'action2', ShiftRight: 'action2', KeyC: 'action2',
  };
  const keys = new Set();
  const virt = new Set();
  const pressedNames = new Set();
  const pressedCodes = new Set();
  const pointer = { x: 0, y: 0, down: false, type: 'mouse' };
  let swipe = null;

  let canvas, ctx, W = 0, H = 0;
  let state = 'boot'; // title | playing | paused | over
  let score = 0, best = 0, storedBest = 0, bestKey = '';
  let overAt = 0, last = 0;
  const extra = new Map();
  const shown = {};
  const el = id => document.getElementById(id);

  function loadBest() {
    try { return Number(localStorage.getItem(bestKey)) || 0; } catch { return 0; }
  }
  function saveBest() {
    try { localStorage.setItem(bestKey, String(best)); } catch { /* недоступно */ }
  }
  function setBestKey(suffix) {
    bestKey = 'arcade-best-' + meta.id + (suffix ? '-' + suffix : '');
    best = storedBest = loadBest();
  }

  const api = {
    FONT,
    sound: Sound,
    sfx: Sound.sfx,
    pointer,
    get W() { return W; },
    get H() { return H; },
    get ctx() { return ctx; },
    get state() { return state; },
    held(name) {
      if (virt.has(name)) return true;
      if (name === 'action' && pointer.down && def.pointerAction !== false && !def.swipe) return true;
      for (const c of keys) if (KEYMAP[c] === name) return true;
      return false;
    },
    pressed: name => pressedNames.has(name),
    key: code => keys.has(code),
    keyPressed: code => pressedCodes.has(code),
    get score() { return score; },
    set score(v) { score = v; },
    addScore(n) { score += n; },
    get best() { return best; },
    bestKey: setBestKey,
    hud(label, value) { extra.set(label, value); },
    clearHud() { extra.clear(); },
    gameOver(text, opts) { end(false, text, opts); },
    win(text, opts) { end(true, text, opts); },
    text(str, x, y, o = {}) {
      ctx.font = `${o.weight ? o.weight + ' ' : ''}${o.size || 16}px ${o.font || FONT}`;
      ctx.fillStyle = o.color || '#fff';
      ctx.textAlign = o.align || 'center';
      ctx.textBaseline = o.baseline || 'middle';
      ctx.fillText(str, x, y);
    },
    rand: (a, b) => a + Math.random() * (b - a),
    randInt: (a, b) => Math.floor(a + Math.random() * (b - a + 1)),
    pick: arr => arr[Math.floor(Math.random() * arr.length)],
    clamp: (v, a, b) => Math.max(a, Math.min(b, v)),
    shuffle(arr) {
      for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
      }
      return arr;
    },
    fmtTime(sec) {
      const s = Math.floor(sec);
      return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
    },
  };

  // ---------- Состояния ----------

  function showOverlay(title, text, hint) {
    el('ov-title').textContent = title;
    el('ov-text').textContent = text || '';
    el('ov-hint').textContent = hint || '';
    el('overlay').classList.remove('hidden');
  }
  function hideOverlay() { el('overlay').classList.add('hidden'); }

  function startGame() {
    Sound.init();
    Sound.silence();
    score = 0;
    extra.clear();
    def.start(api);
    state = 'playing';
    hideOverlay();
    if (!def.quietStart) Sound.sfx.start();
    pressedNames.clear();
    pressedCodes.clear();
    last = performance.now();
  }

  function end(win, text = '', opts = {}) {
    if (state !== 'playing') return;
    state = 'over';
    overAt = performance.now();
    Sound.silence();
    let record = false;
    if (def.lowerIsBetter) {
      if (win && (!best || score < best)) { best = score; record = true; }
    } else if (score > storedBest) {
      best = score;
      record = true;
    }
    if (record) { storedBest = best; saveBest(); }
    if (!opts.quiet) (win ? Sound.sfx.win : Sound.sfx.lose)();
    const lines = [text, record && score > 0 ? 'НОВЫЙ РЕКОРД!' : ''].filter(Boolean).join('\n');
    showOverlay(opts.title || (win ? 'ПОБЕДА!' : 'ИГРА ОКОНЧЕНА'), lines, 'Пробел / Enter / тап — ещё раз');
  }

  function pause() {
    if (state !== 'playing') return;
    state = 'paused';
    Sound.silence();
    keys.clear();
    virt.clear();
    pointer.down = false;
    showOverlay('ПАУЗА', '', 'P / Enter / тап — продолжить');
    setPauseBtn(true);
  }
  function resume() {
    if (state !== 'paused') return;
    state = 'playing';
    hideOverlay();
    Sound.init();
    last = performance.now();
    setPauseBtn(false);
  }

  function activate() {
    if (state === 'title') startGame();
    else if (state === 'over' && performance.now() - overAt > 600) startGame();
    else if (state === 'paused') resume();
  }

  // ---------- Ввод ----------

  function toLogical(e) {
    const r = canvas.getBoundingClientRect();
    return { x: (e.clientX - r.left) / r.width * W, y: (e.clientY - r.top) / r.height * H };
  }

  function bindInput() {
    addEventListener('keydown', e => {
      if (e.target && e.target.tagName === 'INPUT') return;
      Sound.init();
      const name = KEYMAP[e.code];
      if (name || e.code === 'Space' || e.code === 'Backspace') e.preventDefault();
      if (e.code === 'KeyM') { toggleMute(); return; }
      if (state === 'title' || state === 'over' || state === 'paused') {
        if (e.code === 'Enter' || e.code === 'Space' || (state === 'paused' && e.code === 'KeyP')) {
          activate();
          if (state === 'playing') keys.add(e.code);
        } else if (e.code === 'Escape' && state !== 'paused') {
          location.href = 'index.html';
        } else if (e.code === 'Escape') {
          resume();
        }
        return;
      }
      if (e.code === 'KeyP' || e.code === 'Escape') { pause(); return; }
      if (e.code === 'KeyR' && !def.noRestartKey) { startGame(); return; }
      if (!e.repeat) {
        keys.add(e.code);
        pressedCodes.add(e.code);
        if (name) pressedNames.add(name);
      }
      if (def.onKey) def.onKey(e.code, e.repeat, api);
    });
    addEventListener('keyup', e => keys.delete(e.code));
    addEventListener('blur', () => { keys.clear(); virt.clear(); pause(); });
    document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); });

    canvas.addEventListener('contextmenu', e => e.preventDefault());
    canvas.addEventListener('pointerdown', e => {
      Sound.init();
      const p = toLogical(e);
      Object.assign(pointer, p, { down: true, type: e.pointerType });
      if (state !== 'playing') return;
      e.preventDefault();
      try { canvas.setPointerCapture(e.pointerId); } catch { /* не важно */ }
      if (def.swipe && e.pointerType !== 'mouse') swipe = { x: e.clientX, y: e.clientY };
      else if (def.pointerAction !== false && e.button === 0) pressedNames.add('action');
      if (def.onPointer) def.onPointer('down', p.x, p.y, e.button, api);
    });
    canvas.addEventListener('pointermove', e => {
      const p = toLogical(e);
      pointer.x = p.x;
      pointer.y = p.y;
      if (state === 'playing' && def.onPointer) def.onPointer('move', p.x, p.y, e.buttons, api);
    });
    const up = e => {
      const p = toLogical(e);
      pointer.down = false;
      if (state !== 'playing') { swipe = null; return; }
      if (swipe) {
        const dx = e.clientX - swipe.x, dy = e.clientY - swipe.y;
        swipe = null;
        if (Math.max(Math.abs(dx), Math.abs(dy)) > 24) {
          pressedNames.add(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up'));
        } else if (def.pointerAction !== false) {
          pressedNames.add('action');
        }
      }
      if (def.onPointer) def.onPointer('up', p.x, p.y, e.button, api);
    };
    canvas.addEventListener('pointerup', up);
    canvas.addEventListener('pointercancel', up);

    el('overlay').addEventListener('pointerdown', e => {
      e.preventDefault();
      Sound.init();
      activate();
    });
    el('mute').addEventListener('click', e => { toggleMute(); e.currentTarget.blur(); });
    el('restart').addEventListener('click', e => {
      e.currentTarget.blur();
      Sound.init();
      startGame();
      setPauseBtn(false);
    });
    el('pause').addEventListener('click', e => {
      e.currentTarget.blur();
      if (state === 'playing') pause(); else if (state === 'paused') resume();
    });
  }

  function buildTouch() {
    const box = el('touch');
    const coarse = window.matchMedia && matchMedia('(pointer: coarse)').matches;
    if (!meta.touch || !coarse) { box.remove(); return; }
    const dirs = document.createElement('div');
    dirs.className = 'tgroup';
    const acts = document.createElement('div');
    acts.className = 'tgroup';
    for (const name of meta.touch) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'tbtn';
      b.innerHTML = Icons[(meta.touchIcons && meta.touchIcons[name]) || name];
      b.setAttribute('aria-label', name);
      const on = e => {
        e.preventDefault();
        Sound.init();
        if (state !== 'playing') { activate(); return; }
        virt.add(name);
        pressedNames.add(name);
        b.classList.add('on');
      };
      const off = e => {
        e.preventDefault();
        virt.delete(name);
        b.classList.remove('on');
      };
      b.addEventListener('pointerdown', on);
      b.addEventListener('pointerup', off);
      b.addEventListener('pointercancel', off);
      b.addEventListener('pointerleave', off);
      (name.startsWith('action') ? acts : dirs).appendChild(b);
    }
    box.append(dirs, acts);
  }

  function toggleMute() {
    Sound.init();
    Sound.toggleMute();
    updateMute();
  }
  function updateMute() {
    const b = el('mute');
    b.querySelector('.ico').innerHTML = Sound.muted ? Icons.soundOff : Icons.soundOn;
    b.querySelector('.tool-label').textContent = Sound.muted ? 'Без звука' : 'Звук';
    b.classList.toggle('off', Sound.muted);
    b.title = Sound.muted ? 'Включить звук (M)' : 'Выключить звук (M)';
  }
  function setPauseBtn(paused) {
    const b = el('pause');
    b.querySelector('.ico').innerHTML = paused ? Icons.play : Icons.pause;
    b.querySelector('.tool-label').textContent = paused ? 'Дальше' : 'Пауза';
  }

  // ---------- Окно «Управление» (отрисовка — js/controls.js) ----------
  function buildControls() {
    el('controls').innerHTML = Controls.html(meta.keys || []);
    const common = [[['P'], 'Пауза'], [['R'], 'Начать заново'], [['M'], 'Звук'], [['esc'], 'Пауза, на заставке — в меню']];
    if (def.noRestartKey) common.splice(1, 1);
    el('controls-common').innerHTML = Controls.html(common);
  }

  // ---------- Размер и цикл ----------

  function fit() {
    const stage = el('stage');
    const s = Math.min(stage.clientWidth / W, stage.clientHeight / H);
    const cw = Math.max(1, Math.floor(W * s));
    const ch = Math.max(1, Math.floor(H * s));
    canvas.style.width = cw + 'px';
    canvas.style.height = ch + 'px';
    const pr = Math.min(3, (window.devicePixelRatio || 1) * s);
    canvas.width = Math.round(W * pr);
    canvas.height = Math.round(H * pr);
  }

  function setText(id, v) {
    if (shown[id] === v) return;
    const bump = id === 'score' && shown[id] !== undefined;
    shown[id] = v;
    const e = el(id);
    e.textContent = v;
    if (bump) { e.classList.remove('bump'); void e.offsetWidth; e.classList.add('bump'); }
  }

  function updateHud() {
    const fmt = v => (def.formatScore ? def.formatScore(v) : String(v));
    const b = def.lowerIsBetter ? best : Math.max(best, score);
    setText('score', fmt(score));
    setText('best', b ? fmt(b) : '—');
    let html = '';
    for (const [k, v] of extra) {
      html += `<div class="stat"><span class="win-label">${k}</span><span class="value">${v}</span></div>`;
    }
    if (html !== shown.extra) {
      shown.extra = html;
      el('hud-extra').innerHTML = html;
      el('stats-win').hidden = !html;
    }
  }

  function frame(now) {
    // метка кадра бывает раньше момента старта — время назад не идёт
    const dt = Math.max(0, Math.min((now - last) / 1000, 0.05));
    last = now;
    try {
      if (state === 'playing') def.update(dt, api);
      pressedNames.clear();
      pressedCodes.clear();
      const pr = canvas.width / W;
      ctx.setTransform(pr, 0, 0, pr, 0, 0);
      def.draw(ctx, api);
      updateHud();
    } catch (err) {
      console.error(err);
    }
    requestAnimationFrame(frame);
  }

  function setup() {
    if (!def) return;
    document.title = `${meta.title} — Kastrula Games`;
    el('game-title').textContent = meta.title;
    el('game-desc').textContent = meta.desc;
    el('score-label').textContent = def.scoreLabel || 'СЧЁТ';
    el('back-ico').innerHTML = Icons.back;
    el('restart').querySelector('.ico').innerHTML = Icons.restart;
    document.body.style.setProperty('--c', meta.color);
    buildControls();
    canvas = el('game');
    ctx = canvas.getContext('2d');
    W = def.width;
    H = def.height;
    setBestKey('');
    buildTouch();
    fit();
    addEventListener('resize', fit);
    bindInput();
    updateMute();
    setPauseBtn(false);
    if (def.init) def.init(api);
    def.start(api);
    state = 'title';
    showOverlay(meta.title, meta.desc, 'Пробел / Enter / тап — начать');
    last = performance.now();
    requestAnimationFrame(frame);
  }

  function boot() {
    if (!meta) { location.href = 'index.html'; return; }
    const s = document.createElement('script');
    s.src = `games/${meta.id}.js`;
    s.onload = setup;
    document.body.appendChild(s);
  }

  return { register(d) { def = d; }, boot, FONT };
})();
