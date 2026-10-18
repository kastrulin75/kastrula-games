'use strict';

// Превью для меню: настоящие игры крутятся без звука с автопилотом,
// а их кадры рисуются на карточках. Использует те же файлы games/*.js, что и страница игры.
const Preview = (() => {
  const FONT = '"Press Start 2P", monospace';
  const defs = {};
  let loadingId = null;

  // Игры регистрируются через Arcade.register — здесь собираем их по id
  window.Arcade = { register(d) { defs[loadingId] = d; } };

  // Беззвучная заглушка: любое свойство и любой вызов ничего не делают
  const SILENT = new Proxy(function () {}, { get: (t, k) => (k === 'muted' ? true : SILENT), apply: () => undefined });

  function load(ids) {
    return ids.reduce((p, id) => p.then(() => new Promise(res => {
      loadingId = id;
      const s = document.createElement('script');
      s.src = `games/${id}.js`;
      s.onload = res;
      s.onerror = res;
      document.head.appendChild(s);
    })), Promise.resolve());
  }

  // Автопилоты: подсказывают ввод, чтобы в превью что-то происходило
  const rnd = Math.random;
  const BOTS = {
    snake(d, io) {
      const h = d.snake && d.snake[0], f = d.food;
      if (!h || !f) return;
      const want = f.x > h.x ? 'right' : f.x < h.x ? 'left' : f.y > h.y ? 'down' : 'up';
      if (rnd() < 0.15) io.press(want);
    },
    flappy(d, io) {
      const b = d.bird, pipe = d.pipes && d.pipes.find(p => p.x + 66 > b.x - 20);
      const target = pipe ? pipe.top + 82 : 280;
      if (!d.started || (b.y > target + 8 && b.vy > -50)) io.press('action');
    },
    tetris(d, io) {
      if (rnd() < 0.06) io.press(io.pick(['left', 'right', 'up']));
      if (rnd() < 0.012) io.press('action');
    },
    pacman(d, io) { if (rnd() < 0.05) io.press(io.pick(['up', 'down', 'left', 'right'])); },
    breakout(d, io) {
      const b = d.balls && d.balls[0];
      if (b) io.move(b.x + Math.sin(io.t * 3) * 20, 580);
      if (rnd() < 0.05) io.press('action');
    },
    invaders(d, io) { io.hold('action', true); io.wander(['left', 'right'], 0.6); },
    galaga(d, io) { io.hold('action', rnd() < 0.7); io.wander(['left', 'right'], 0.7); },
    asteroids(d, io) { io.hold('action', true); io.wander(['left', 'right'], 0.5); io.hold('up', Math.sin(io.t * 0.7) > 0.6); },
    '2048'(d, io) { if (rnd() < 0.08) io.press(io.pick(['up', 'down', 'left', 'right'])); },
    doodle(d, io) {
      const p = d.p;
      const next = d.plats && d.plats.filter(pl => pl.type !== 'break' && pl.y < p.y - 10 && pl.y > p.y - 170).sort((a, b) => b.y - a.y)[0];
      const tx = next ? next.x + 32 : p.x;
      io.hold('left', tx < p.x - 8);
      io.hold('right', tx > p.x + 8);
    },
    helix(d, io) { io.hold('right', true); },
    bubble(d, io) {
      if (rnd() < 0.04) { const x = 40 + rnd() * 320, y = 120 + rnd() * 200; io.pointer('move', x, y); io.pointer('up', x, y); }
    },
    match3(d, io) {
      if (rnd() < 0.05) {
        const x = 28 + Math.floor(rnd() * 8) * 56, y = 68 + Math.floor(rnd() * 8) * 56;
        const [dx, dy] = io.pick([[30, 0], [-30, 0], [0, 30], [0, -30]]);
        io.pointer('down', x, y); io.pointer('move', x + dx, y + dy); io.pointer('up', x + dx, y + dy);
      }
    },
    missile(d, io) {
      const e = d.enemy && d.enemy[0];
      if (e && rnd() < 0.05) io.pointer('down', e.x + e.vx * 1.2, e.y + e.vy * 1.2);
    },
    lunar(d, io) {
      const l = d.l;
      if (!l) return;
      io.hold('up', l.vy > 18);
      io.hold('left', l.a > 0.08);
      io.hold('right', l.a < -0.08);
    },
    jetpack(d, io) { io.hold('action', Math.sin(io.t * 2.2) > 0); },
    geometry(d, io) {
      const ahead = d.objs && d.objs.find(o => o.x > d.x + 6 && o.x < d.x + 70 && !(o.type === 'block' && d.p.y <= o.y - 30));
      io.hold('action', !!ahead);
    },
    lightsout(d, io) { if (rnd() < 0.03) io.pointer('down', 20 + rnd() * 400, 20 + rnd() * 400); },
    minesweeper(d, io) {
      if (rnd() < 0.04) { const x = 30 + rnd() * 420, y = 80 + rnd() * 440; io.pointer('down', x, y); io.pointer('up', x, y); }
    },
  };

  // Сколько секунд прогнать игру перед снимком и где центр кадра по вертикали (0 — верх, 1 — низ)
  const WARMUP = { missile: 9, galaga: 6, asteroids: 3 };
  const FOCUS = { doodle: 0.45, flappy: 0.45, helix: 0.4, bubble: 0.3 };
  // Не снимать кадр, пока игра в «проигрышной» паузе
  const BUSY = { minesweeper: d => d.endT > 0 || d.over, geometry: d => d.p && d.p.dead > 0, flappy: d => d.dead };

  function create(id) {
    const def = defs[id];
    if (!def) return null;
    const W = def.width, H = def.height;
    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d');
    const held = new Set(), pressed = new Set(), keyPressed = new Set();
    const pointer = { x: W / 2, y: H / 2, down: false, type: 'mouse' };
    let score = 0, restart = false, t = 0, broken = false;
    const wanderState = {};

    const api = {
      FONT, sound: SILENT, sfx: SILENT, pointer,
      get W() { return W; }, get H() { return H; }, get ctx() { return ctx; },
      get state() { return 'playing'; },
      held: n => held.has(n),
      pressed: n => pressed.has(n),
      key: () => false,
      keyPressed: c => keyPressed.has(c),
      get score() { return score; }, set score(v) { score = v; },
      addScore(n) { score += n; },
      get best() { return 0; },
      bestKey() {}, hud() {}, clearHud() {},
      gameOver() { restart = true; },
      win() { restart = true; },
      text(str, x, y, o = {}) {
        ctx.font = `${o.weight ? o.weight + ' ' : ''}${o.size || 16}px ${o.font || FONT}`;
        ctx.fillStyle = o.color || '#fff';
        ctx.textAlign = o.align || 'center';
        ctx.textBaseline = o.baseline || 'middle';
        ctx.fillText(str, x, y);
      },
      rand: (a, b) => a + rnd() * (b - a),
      randInt: (a, b) => Math.floor(a + rnd() * (b - a + 1)),
      pick: arr => arr[Math.floor(rnd() * arr.length)],
      clamp: (v, a, b) => Math.max(a, Math.min(b, v)),
      shuffle(arr) {
        for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; }
        return arr;
      },
      fmtTime(sec) { const s = Math.floor(sec); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; },
    };

    const io = {
      get t() { return t; },
      pick: api.pick,
      press(n) { pressed.add(n); },
      hold(n, on) { if (on) held.add(n); else held.delete(n); },
      wander(names, rate) {
        wanderState.left = (wanderState.left || 0) - 1 / 60;
        if (wanderState.left <= 0) {
          wanderState.left = 0.3 + rnd() * rate;
          names.forEach(n => held.delete(n));
          if (rnd() < 0.8) held.add(api.pick(names));
        }
      },
      move(x, y) { pointer.x = x; pointer.y = y; if (def.onPointer) def.onPointer('move', x, y, 0, api); },
      pointer(type, x, y) {
        pointer.x = x; pointer.y = y; pointer.down = type === 'down';
        if (def.onPointer) def.onPointer(type, x, y, 0, api);
        if (type === 'up') pointer.down = false;
      },
    };

    function reset() {
      score = 0;
      restart = false;
      held.clear();
      try { def.start.call(def, api); } catch (e) { broken = true; console.error(id, e); }
    }

    function step(dt) {
      if (broken) return;
      t += dt;
      try {
        const bot = BOTS[id];
        if (bot) bot(def, io);
        def.update.call(def, dt, api);
      } catch (e) {
        broken = true;
        console.error(id, e);
      }
      pressed.clear();
      keyPressed.clear();
      if (restart) reset();
    }

    function render() {
      if (broken) return;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      try { def.draw.call(def, ctx, api); } catch (e) { broken = true; console.error(id, e); }
    }

    if (def.init) { try { def.init.call(def, api); } catch (e) { broken = true; } }
    reset();
    function warmup() {
      const secs = WARMUP[id] || 4;
      for (let i = 0; i < secs * 60; i++) step(1 / 60);
      for (let i = 0; i < 600 && BUSY[id] && BUSY[id](def); i++) step(1 / 60);
    }

    return { id, W, H, canvas, step, render, warmup, focus: FOCUS[id] ?? 0.5, get broken() { return broken; } };
  }

  return { load, create };
})();
