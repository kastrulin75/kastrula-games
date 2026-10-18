'use strict';

(() => {
  const TILE = 20;
  // # — стена, . — точка, o — энергетик, - — дверь домика призраков
  const MAP_SRC = [
    '############################',
    '#............##............#',
    '#.####.#####.##.#####.####.#',
    '#o####.#####.##.#####.####o#',
    '#.####.#####.##.#####.####.#',
    '#..........................#',
    '#.####.##.########.##.####.#',
    '#.####.##.########.##.####.#',
    '#......##....##....##......#',
    '######.##### ## #####.######',
    '     #.##### ## #####.#     ',
    '     #.##          ##.#     ',
    '     #.## ###--### ##.#     ',
    '######.## #      # ##.######',
    '      .   #      #   .      ',
    '######.## #      # ##.######',
    '     #.## ######## ##.#     ',
    '     #.##          ##.#     ',
    '     #.## ######## ##.#     ',
    '######.## ######## ##.######',
    '#............##............#',
    '#.####.#####.##.#####.####.#',
    '#.####.#####.##.#####.####.#',
    '#o..##.......  .......##..o#',
    '###.##.##.########.##.##.###',
    '###.##.##.########.##.##.###',
    '#......##....##....##......#',
    '#.##########.##.##########.#',
    '#.##########.##.##########.#',
    '#..........................#',
    '############################',
  ];
  const COLS = 28;
  const ROWS = MAP_SRC.length;

  const UP = { x: 0, y: -1, a: -Math.PI / 2 };
  const DOWN = { x: 0, y: 1, a: Math.PI / 2 };
  const LEFT = { x: -1, y: 0, a: Math.PI };
  const RIGHT = { x: 1, y: 0, a: 0 };
  const NONE = { x: 0, y: 0, a: 0 };
  const DIRS = [UP, LEFT, DOWN, RIGHT];
  const BY_NAME = { up: UP, down: DOWN, left: LEFT, right: RIGHT };
  const opposite = d => (d === UP ? DOWN : d === DOWN ? UP : d === LEFT ? RIGHT : d === RIGHT ? LEFT : NONE);

  const SCATTER_CHASE = [7, 20, 7, 20, 5, 20, 5, Infinity];
  const DOOR_EXIT = { x: 13.5, y: 11 };
  const GHOST_DEFS = [
    { name: 'blinky', color: '#ff0000', home: { x: 13.5, y: 14 }, corner: { x: 25, y: -3 }, release: 0 },
    { name: 'pinky', color: '#ffb8ff', home: { x: 13.5, y: 14 }, corner: { x: 2, y: -3 }, release: 1 },
    { name: 'inky', color: '#00ffff', home: { x: 11.5, y: 14 }, corner: { x: 27, y: 31 }, release: 4 },
    { name: 'clyde', color: '#ffb852', home: { x: 15.5, y: 14 }, corner: { x: 0, y: 31 }, release: 8 },
  ];

  // ---------- Звуки ----------
  let S = Sound;
  let wakaFlip = false, lastWaka = -1;
  const snd = {
    waka(t) {
      if (t - lastWaka < 0.06) return;
      lastWaka = t;
      wakaFlip = !wakaFlip;
      S.tone(wakaFlip
        ? { freq: 260, freqEnd: 520, dur: 0.09, type: 'triangle', vol: 0.4 }
        : { freq: 520, freqEnd: 260, dur: 0.09, type: 'triangle', vol: 0.4 });
    },
    power: () => S.tone({ freq: 200, freqEnd: 900, dur: 0.25, vol: 0.15 }),
    eatGhost() {
      S.tone({ freq: 180, freqEnd: 1400, dur: 0.35, type: 'sawtooth', vol: 0.18 });
      S.tone({ freq: 1400, freqEnd: 2000, dur: 0.15, vol: 0.08, when: 0.3 });
    },
    death() {
      for (let i = 0; i < 10; i++) {
        const f = 800 - i * 60;
        S.tone({ freq: f, freqEnd: f * 0.6, dur: 0.12, vol: 0.18, when: 0.5 + i * 0.11 });
      }
      S.tone({ freq: 160, freqEnd: 80, dur: 0.08, vol: 0.25, when: 1.65 });
      S.tone({ freq: 160, freqEnd: 80, dur: 0.08, vol: 0.25, when: 1.8 });
    },
    start() {
      const m = [523, 659, 784, 1047, 0, 784, 1047, 1319, 1175, 1047, 880, 784, 0, 659, 784, 1047];
      S.melody(m, 0.12, { vol: 0.12 });
      S.melody([131, 0, 196, 0, 131, 0, 196, 0, 175, 0, 220, 0, 196, 0, 131, 0], 0.12, { type: 'triangle', vol: 0.3 });
    },
    levelClear: () => S.melody([784, 988, 1175, 1568, 1175, 1568], 0.09, { vol: 0.12 }),
    extraLife: () => S.melody([1047, 0, 1047, 0, 1047, 1319], 0.07, { vol: 0.12 }),
  };
  const LOOPS = {
    siren: { type: 'triangle', freq: 330, vol: 0.1, lfoRate: 2.6, lfoDepth: 70 },
    fright: { type: 'square', freq: 170, vol: 0.05, lfoRate: 9, lfoDepth: 50 },
    eyes: { type: 'sawtooth', freq: 650, vol: 0.04, lfoRate: 14, lfoDepth: 300 },
  };

  // ---------- Игра ----------
  let map, dotsLeft, totalDots, maze;
  let pac, ghosts, sub, subTimer, lives, level, extraLifeGiven;
  let frightTimer, ghostCombo, modeIndex, modeTimer, freezeTimer, popup, anim;
  let A; // api

  const wrapX = x => ((x % COLS) + COLS) % COLS;
  const tileAt = (x, y) => (y < 0 || y >= ROWS ? '#' : map[y][wrapX(x)]);
  const blocked = (x, y) => { const t = tileAt(x, y); return t === '#' || t === '-'; };

  function loadMap() {
    map = MAP_SRC.map(r => r.padEnd(COLS, ' ').split(''));
    dotsLeft = 0;
    for (const row of map) for (const c of row) if (c === '.' || c === 'o') dotsLeft++;
    totalDots = dotsLeft;
    if (!maze) maze = { blue: buildMaze('#2121de'), white: buildMaze('#ffffff') };
  }

  function buildMaze(color) {
    const c = document.createElement('canvas');
    c.width = COLS * TILE * 2;
    c.height = ROWS * TILE * 2;
    const g = c.getContext('2d');
    g.scale(2, 2);
    const ins = TILE * 0.3;
    const W = (x, y) => (x < 0 || x >= COLS || y < 0 || y >= ROWS) ? true : (map[y][x] === '#' || map[y][x] === '-');
    const end = (pWall, dWall, edge, out) => (!pWall ? edge - out * ins : (!dWall ? edge : edge + out * ins));
    g.strokeStyle = color;
    g.lineWidth = 2;
    g.lineCap = 'round';
    g.beginPath();
    for (let y = 0; y < ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
        if (map[y][x] !== '#') continue;
        const L = x * TILE, T = y * TILE, R = L + TILE, B = T + TILE;
        if (!W(x, y - 1)) { g.moveTo(end(W(x - 1, y), W(x - 1, y - 1), L, -1), T + ins); g.lineTo(end(W(x + 1, y), W(x + 1, y - 1), R, 1), T + ins); }
        if (!W(x, y + 1)) { g.moveTo(end(W(x - 1, y), W(x - 1, y + 1), L, -1), B - ins); g.lineTo(end(W(x + 1, y), W(x + 1, y + 1), R, 1), B - ins); }
        if (!W(x - 1, y)) { g.moveTo(L + ins, end(W(x, y - 1), W(x - 1, y - 1), T, -1)); g.lineTo(L + ins, end(W(x, y + 1), W(x - 1, y + 1), B, 1)); }
        if (!W(x + 1, y)) { g.moveTo(R - ins, end(W(x, y - 1), W(x + 1, y - 1), T, -1)); g.lineTo(R - ins, end(W(x, y + 1), W(x + 1, y + 1), B, 1)); }
      }
    }
    g.stroke();
    g.fillStyle = '#ffb8ff';
    for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) if (map[y][x] === '-') g.fillRect(x * TILE, y * TILE + TILE * 0.55, TILE, 3);
    return c;
  }

  const syncPos = e => { e.px = e.tx + e.dir.x * e.prog; e.py = e.ty + e.dir.y * e.prog; };
  function setTileMode(g, tx, ty, dir, prog) { g.tx = tx; g.ty = ty; g.dir = dir; g.prog = prog; syncPos(g); }

  function resetActors() {
    pac = { tx: 14, ty: 23, prog: 0.5, dir: LEFT, nextDir: LEFT, face: LEFT, mouth: 0, px: 13.5, py: 23 };
    const rs = Math.max(0.4, 1 - (level - 1) * 0.15);
    ghosts = GHOST_DEFS.map(def => {
      const g = { ...def, px: def.home.x, py: def.home.y, tx: 0, ty: 0, prog: 0, dir: UP, state: 'house', frightened: false, reverse: false, bob: Math.random() * 6, releaseTimer: def.release * rs };
      if (def.name === 'blinky') { g.state = 'active'; setTileMode(g, 14, 11, LEFT, 0.5); }
      return g;
    });
    frightTimer = 0; ghostCombo = 0; modeIndex = 0; modeTimer = SCATTER_CHASE[0]; freezeTimer = 0; popup = null;
  }

  const levelSpeed = () => 7.5 * Math.min(1 + (level - 1) * 0.05, 1.3);
  const frightDuration = () => Math.max(1.5, 7 - (level - 1) * 0.8);

  function addScore(n) {
    A.addScore(n);
    if (!extraLifeGiven && A.score >= 10000) { lives++; extraLifeGiven = true; snd.extraLife(); }
  }

  function updatePac(dt) {
    if (pac.dir === NONE) {
      const nd = pac.nextDir;
      if (nd !== NONE && !blocked(pac.tx + nd.x, pac.ty + nd.y)) { pac.dir = nd; pac.face = nd; }
      else { syncPos(pac); return; }
    } else if (pac.nextDir === opposite(pac.dir)) {
      pac.tx = wrapX(pac.tx + pac.dir.x); pac.ty += pac.dir.y; pac.prog = 1 - pac.prog; pac.dir = pac.nextDir; pac.face = pac.dir;
    }
    let dist = levelSpeed() * (frightTimer > 0 ? 1.05 : 1) * dt;
    pac.mouth += dt * 18;
    while (dist > 0) {
      const step = Math.min(dist, 1 - pac.prog);
      pac.prog += step; dist -= step;
      if (pac.prog >= 1 - 1e-9) {
        pac.tx = wrapX(pac.tx + pac.dir.x); pac.ty += pac.dir.y; pac.prog = 0;
        eat(pac.tx, pac.ty);
        if (sub !== 'play') break;
        const nd = pac.nextDir;
        if (nd !== NONE && !blocked(pac.tx + nd.x, pac.ty + nd.y)) pac.dir = nd;
        else if (blocked(pac.tx + pac.dir.x, pac.ty + pac.dir.y)) { pac.dir = NONE; break; }
        pac.face = pac.dir;
      }
    }
    syncPos(pac);
  }

  function eat(x, y) {
    const t = map[y][x];
    if (t === '.') { map[y][x] = ' '; dotsLeft--; addScore(10); snd.waka(anim); }
    else if (t === 'o') {
      map[y][x] = ' '; dotsLeft--; addScore(50); snd.power();
      frightTimer = frightDuration(); ghostCombo = 0;
      for (const g of ghosts) if (g.state !== 'eaten') { g.frightened = true; if (g.state === 'active') g.reverse = true; }
    } else return;
    if (dotsLeft === 0) { sub = 'levelclear'; subTimer = 0; S.silence(); snd.levelClear(); }
  }

  function ghostSpeed(g) {
    const base = levelSpeed();
    if (g.state === 'eaten') return 15;
    if (g.ty === 14 && (g.tx <= 5 || g.tx >= 22)) return base * 0.5;
    if (g.frightened) return base * 0.6;
    return base * 0.94;
  }

  function ghostTarget(g) {
    if (g.state === 'eaten') return { x: 13, y: 11 };
    if (modeIndex % 2 === 0) return g.corner;
    const p = { x: pac.tx, y: pac.ty }, f = pac.face;
    if (g.name === 'blinky') return p;
    if (g.name === 'pinky') return { x: p.x + f.x * 4, y: p.y + f.y * 4 };
    if (g.name === 'inky') { const b = ghosts[0]; return { x: 2 * (p.x + f.x * 2) - b.tx, y: 2 * (p.y + f.y * 2) - b.ty }; }
    return Math.hypot(g.tx - p.x, g.ty - p.y) > 8 ? p : g.corner;
  }

  function chooseDir(g) {
    const opts = DIRS.filter(d => d !== opposite(g.dir) && !blocked(g.tx + d.x, g.ty + d.y));
    if (!opts.length) return opposite(g.dir);
    if (g.frightened) return opts[Math.floor(Math.random() * opts.length)];
    const t = ghostTarget(g);
    let best = opts[0], bestD = Infinity;
    for (const d of opts) {
      const dd = (g.tx + d.x - t.x) ** 2 + (g.ty + d.y - t.y) ** 2;
      if (dd < bestD) { bestD = dd; best = d; }
    }
    return best;
  }

  function freeMove(g, tx, ty, dist) {
    const dx = tx - g.px;
    if (Math.abs(dx) > 1e-6) { const s = Math.min(Math.abs(dx), dist); g.px += Math.sign(dx) * s; dist -= s; g.dir = dx < 0 ? LEFT : RIGHT; }
    if (dist > 0) {
      const dy = ty - g.py;
      if (Math.abs(dy) > 1e-6) { const s = Math.min(Math.abs(dy), dist); g.py += Math.sign(dy) * s; g.dir = dy < 0 ? UP : DOWN; }
    }
    return Math.abs(g.px - tx) < 1e-6 && Math.abs(g.py - ty) < 1e-6;
  }

  function updateGhost(g, dt) {
    if (g.state === 'house') {
      g.bob += dt * 5; g.px = g.home.x; g.py = g.home.y + Math.sin(g.bob) * 0.3;
      g.dir = Math.cos(g.bob) >= 0 ? DOWN : UP;
      g.releaseTimer -= dt;
      if (g.releaseTimer <= 0) g.state = 'leaving';
      return;
    }
    if (g.state === 'leaving' || g.state === 'entering') {
      const entering = g.state === 'entering';
      const tgt = entering ? g.home : DOOR_EXIT;
      if (freeMove(g, tgt.x, tgt.y, (entering ? 10 : 4) * dt)) {
        if (entering) g.state = 'leaving';
        else { g.state = 'active'; setTileMode(g, 14, 11, LEFT, 0.5); }
      }
      return;
    }
    if (g.reverse) { g.reverse = false; g.tx = wrapX(g.tx + g.dir.x); g.ty += g.dir.y; g.prog = 1 - g.prog; g.dir = opposite(g.dir); }
    let dist = ghostSpeed(g) * dt;
    while (dist > 0) {
      const step = Math.min(dist, 1 - g.prog);
      g.prog += step; dist -= step;
      if (g.prog >= 1 - 1e-9) {
        g.tx = wrapX(g.tx + g.dir.x); g.ty += g.dir.y; g.prog = 0;
        if (g.state === 'eaten' && g.ty === 11 && (g.tx === 13 || g.tx === 14)) { g.state = 'entering'; g.px = g.tx; g.py = g.ty; return; }
        g.dir = chooseDir(g);
      }
    }
    syncPos(g);
  }

  function checkCollisions() {
    for (const g of ghosts) {
      if (g.state !== 'active') continue;
      if (Math.abs(g.px - pac.px) < 0.7 && Math.abs(g.py - pac.py) < 0.7) {
        if (g.frightened) {
          g.frightened = false; g.state = 'eaten';
          const pts = 200 * 2 ** ghostCombo;
          ghostCombo = Math.min(ghostCombo + 1, 3);
          addScore(pts);
          popup = { x: g.px, y: g.py, text: String(pts) };
          freezeTimer = 0.6;
          snd.eatGhost();
        } else {
          sub = 'dying'; subTimer = 0; S.silence(); snd.death();
          return;
        }
      }
    }
  }

  function step(h) {
    if (frightTimer > 0) {
      frightTimer -= h;
      if (frightTimer <= 0) for (const g of ghosts) g.frightened = false;
    } else {
      modeTimer -= h;
      if (modeTimer <= 0) {
        modeIndex++;
        modeTimer = SCATTER_CHASE[Math.min(modeIndex, SCATTER_CHASE.length - 1)];
        for (const g of ghosts) if (g.state === 'active') g.reverse = true;
      }
    }
    updatePac(h);
    if (sub !== 'play') return;
    checkCollisions();
    if (sub !== 'play' || freezeTimer > 0) return;
    for (const g of ghosts) updateGhost(g, h);
    checkCollisions();
  }

  function loopSound() {
    if (sub !== 'play' || freezeTimer > 0) S.loop('pac', null);
    else if (ghosts.some(g => g.state === 'eaten' || g.state === 'entering')) S.loop('pac', LOOPS.eyes);
    else if (frightTimer > 0) S.loop('pac', LOOPS.fright);
    else S.loop('pac', { ...LOOPS.siren, freq: 330 + 220 * (1 - dotsLeft / totalDots) });
  }

  // ---------- Отрисовка ----------
  function drawPacShape(ctx, x, y, r, angle, open) {
    ctx.fillStyle = '#ffff00';
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.arc(x, y, r, angle + open, angle + Math.PI * 2 - open);
    ctx.closePath();
    ctx.fill();
  }

  function drawGhost(ctx, g) {
    const x = g.px * TILE + TILE / 2, y = g.py * TILE + TILE / 2, r = TILE * 0.65;
    if (g.state !== 'eaten' && g.state !== 'entering') {
      const flashing = g.frightened && frightTimer < 2 && Math.floor(frightTimer * 6) % 2 === 0;
      ctx.fillStyle = g.frightened ? (flashing ? '#ffffff' : '#2121ff') : g.color;
      const top = y - r * 0.15, yb = y + r * 0.85;
      ctx.beginPath();
      ctx.arc(x, top, r, Math.PI, 0);
      ctx.lineTo(x + r, yb);
      const off = Math.floor(anim * 8) % 2;
      for (let i = 1; i <= 6; i++) ctx.lineTo(x + r - i * (r / 3), (i + off) % 2 === 0 ? yb : yb - r * 0.3);
      ctx.closePath();
      ctx.fill();
      if (g.frightened) {
        const face = flashing ? '#ff0000' : '#ffb8ae';
        ctx.fillStyle = face;
        ctx.fillRect(x - r * 0.4, y - r * 0.35, r * 0.25, r * 0.25);
        ctx.fillRect(x + r * 0.15, y - r * 0.35, r * 0.25, r * 0.25);
        ctx.strokeStyle = face;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        for (let i = 0; i <= 6; i++) {
          const xx = x - r * 0.6 + i * (r * 0.2), yy = y + r * 0.35 + (i % 2 ? -r * 0.18 : 0);
          if (i === 0) ctx.moveTo(xx, yy); else ctx.lineTo(xx, yy);
        }
        ctx.stroke();
        return;
      }
    }
    for (const s of [-1, 1]) {
      const ex = x + s * r * 0.36, ey = y - r * 0.2;
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.ellipse(ex, ey, r * 0.26, r * 0.33, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#2121ff';
      ctx.beginPath(); ctx.arc(ex + g.dir.x * r * 0.12, ey + g.dir.y * r * 0.15, r * 0.14, 0, Math.PI * 2); ctx.fill();
    }
  }

  Arcade.register({
    width: COLS * TILE,
    height: (ROWS + 2) * TILE,
    swipe: true,
    pointerAction: false,
    quietStart: true,

    start(api) {
      A = api;
      S = api.sound;
      level = 1; lives = 3; extraLifeGiven = false; anim = 0;
      loadMap();
      resetActors();
      sub = 'ready'; subTimer = 2.2;
      api.hud('УРОВЕНЬ', level);
      if (api.state !== 'boot') snd.start();
    },

    update(dt, api) {
      anim += dt;
      for (const n of ['up', 'down', 'left', 'right']) if (api.pressed(n)) pac.nextDir = BY_NAME[n];
      if (sub === 'ready') {
        subTimer -= dt;
        if (subTimer <= 0) sub = 'play';
      } else if (sub === 'play') {
        if (freezeTimer > 0) {
          freezeTimer -= dt;
          if (freezeTimer <= 0) popup = null;
        } else {
          let rem = dt;
          while (rem > 0 && sub === 'play' && freezeTimer <= 0) { const h = Math.min(rem, 1 / 120); rem -= h; step(h); }
        }
      } else if (sub === 'dying') {
        subTimer += dt;
        if (subTimer >= 2) {
          lives--;
          if (lives <= 0) { api.gameOver(`Уровень ${level}`, { quiet: true }); return; }
          resetActors(); sub = 'ready'; subTimer = 1.5;
        }
      } else if (sub === 'levelclear') {
        subTimer += dt;
        if (subTimer >= 2.2) {
          level++; loadMap(); resetActors(); sub = 'ready'; subTimer = 1.5;
          api.hud('УРОВЕНЬ', level);
        }
      }
      loopSound();
    },

    draw(ctx, api) {
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, api.W, api.H);
      const flash = sub === 'levelclear' && subTimer > 0.5 && Math.floor(subTimer * 4) % 2 === 1;
      ctx.drawImage(flash ? maze.white : maze.blue, 0, 0, COLS * TILE, ROWS * TILE);

      const showPower = sub !== 'play' || Math.floor(anim * 4) % 2 === 0;
      ctx.fillStyle = '#ffb8ae';
      for (let y = 0; y < ROWS; y++) {
        for (let x = 0; x < COLS; x++) {
          const t = map[y][x], cx = x * TILE + TILE / 2, cy = y * TILE + TILE / 2;
          if (t === '.') ctx.fillRect(cx - 2, cy - 2, 4, 4);
          else if (t === 'o' && showPower) { ctx.beginPath(); ctx.arc(cx, cy, TILE * 0.32, 0, Math.PI * 2); ctx.fill(); }
        }
      }

      const hideGhosts = sub === 'levelclear' || (sub === 'dying' && subTimer > 0.5);
      if (!hideGhosts) for (const g of ghosts) drawGhost(ctx, g);

      const x = pac.px * TILE + TILE / 2, y = pac.py * TILE + TILE / 2, r = TILE * 0.65;
      if (sub === 'dying') {
        const t = Math.min(Math.max(subTimer - 0.5, 0) / 1.2, 1);
        if (t < 1) drawPacShape(ctx, x, y, r, -Math.PI / 2, t * Math.PI);
      } else {
        drawPacShape(ctx, x, y, r, pac.face.a, Math.PI * 0.28 * Math.abs(Math.sin(pac.mouth)) + 0.02);
      }

      if (popup) api.text(popup.text, popup.x * TILE + TILE / 2, popup.y * TILE + TILE / 2, { size: 10, color: '#00ffff' });
      if (sub === 'ready') api.text('ГОТОВ!', COLS * TILE / 2, 17.5 * TILE, { size: 15, color: '#ffff00' });

      for (let i = 0; i < lives - 1; i++) drawPacShape(ctx, (2 + i * 1.6) * TILE, (ROWS + 1) * TILE, TILE * 0.55, Math.PI, Math.PI * 0.22);
    },
  });
})();
