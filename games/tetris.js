'use strict';

(() => {
  const COLS = 10, ROWS = 20, C = 28, BX = 12, BY = 12;
  const PX = BX + COLS * C + 18;
  const SHAPES = {
    I: [[0, 0, 0, 0], [1, 1, 1, 1], [0, 0, 0, 0], [0, 0, 0, 0]],
    O: [[1, 1], [1, 1]],
    T: [[0, 1, 0], [1, 1, 1], [0, 0, 0]],
    S: [[0, 1, 1], [1, 1, 0], [0, 0, 0]],
    Z: [[1, 1, 0], [0, 1, 1], [0, 0, 0]],
    J: [[1, 0, 0], [1, 1, 1], [0, 0, 0]],
    L: [[0, 0, 1], [1, 1, 1], [0, 0, 0]],
  };
  const COLORS = { I: '#00e5ff', O: '#ffe600', T: '#b04dff', S: '#3ddc84', Z: '#ff4d4d', J: '#3d7bff', L: '#ff9f1a' };
  const KICKS = [[0, 0], [-1, 0], [1, 0], [0, -1], [-2, 0], [2, 0], [-1, -1], [1, -1]];
  const POINTS = [0, 100, 300, 500, 800];

  // Коробейники — народная мелодия
  const bass = [];
  for (const [r, n] of [['E', 4], ['A', 4], ['G#', 2], ['E', 2], ['A', 4], ['D', 4], ['C', 4], ['G#', 2], ['E', 2], ['A', 4]]) {
    for (let i = 0; i < n; i++) bass.push([r + '2', 0.5], [r + '3', 0.5]);
  }
  const MUSIC = {
    bpm: 144,
    voices: [
      { type: 'square', vol: 0.045, notes: [
        ['E5', 1], ['B4', 0.5], ['C5', 0.5], ['D5', 1], ['C5', 0.5], ['B4', 0.5],
        ['A4', 1], ['A4', 0.5], ['C5', 0.5], ['E5', 1], ['D5', 0.5], ['C5', 0.5],
        ['B4', 1.5], ['C5', 0.5], ['D5', 1], ['E5', 1],
        ['C5', 1], ['A4', 1], ['A4', 2],
        [0, 0.5], ['D5', 1], ['F5', 0.5], ['A5', 1], ['G5', 0.5], ['F5', 0.5],
        ['E5', 1.5], ['C5', 0.5], ['E5', 1], ['D5', 0.5], ['C5', 0.5],
        ['B4', 1], ['B4', 0.5], ['C5', 0.5], ['D5', 1], ['E5', 1],
        ['C5', 1], ['A4', 1], ['A4', 1], [0, 1],
      ] },
      { type: 'triangle', vol: 0.12, notes: bass },
    ],
  };

  const rotate = (m, dir) => m.map((row, y) => row.map((_, x) => (dir > 0 ? m[m.length - 1 - x][y] : m[x][m.length - 1 - y])));

  Arcade.register({
    width: PX + 140,
    height: BY * 2 + ROWS * C,
    pointerAction: false,

    start(api) {
      this.board = Array.from({ length: ROWS }, () => Array(COLS).fill(null));
      this.bag = [];
      this.queue = [];
      for (let i = 0; i < 3; i++) this.queue.push(this.nextFromBag(api));
      this.hold = null;
      this.holdUsed = false;
      this.lines = 0;
      this.level = 1;
      this.fall = 0;
      this.clearing = null;
      this.das = { dir: 0, t: 0 };
      this.spawn(api);
      api.hud('УРОВЕНЬ', 1);
      api.hud('ЛИНИИ', 0);
    },

    nextFromBag(api) {
      if (!this.bag.length) this.bag = api.shuffle(Object.keys(SHAPES));
      return this.bag.pop();
    },

    spawn(api, type) {
      const t = type || this.queue.shift();
      if (!type) this.queue.push(this.nextFromBag(api));
      const m = SHAPES[t].map(r => r.slice());
      this.piece = { t, m, x: Math.floor((COLS - m.length) / 2), y: t === 'I' ? -1 : 0 };
      this.lock = 0;
      this.resets = 0;
      if (!this.fits(this.piece.m, this.piece.x, this.piece.y)) {
        this.piece = null;
        api.gameOver(`Линии: ${this.lines} · Уровень: ${this.level}`);
      }
    },

    fits(m, px, py) {
      for (let y = 0; y < m.length; y++) {
        for (let x = 0; x < m.length; x++) {
          if (!m[y][x]) continue;
          const bx = px + x, by = py + y;
          if (bx < 0 || bx >= COLS || by >= ROWS) return false;
          if (by >= 0 && this.board[by][bx]) return false;
        }
      }
      return true;
    },

    move(dx, api) {
      const p = this.piece;
      if (this.fits(p.m, p.x + dx, p.y)) {
        p.x += dx;
        api.sfx.tick();
        this.touchLock();
        return true;
      }
      return false;
    },

    rot(dir, api) {
      const p = this.piece;
      const m = rotate(p.m, dir);
      for (const [kx, ky] of KICKS) {
        if (this.fits(m, p.x + kx, p.y + ky)) {
          p.m = m; p.x += kx; p.y += ky;
          api.sfx.blip(1.4);
          this.touchLock();
          return;
        }
      }
    },

    touchLock() {
      if (this.resets < 15) { this.lock = 0; this.resets++; }
    },

    lockPiece(api) {
      const p = this.piece;
      let above = false;
      p.m.forEach((row, y) => row.forEach((v, x) => {
        if (!v) return;
        if (p.y + y < 0) above = true;
        else this.board[p.y + y][p.x + x] = p.t;
      }));
      api.sfx.place();
      this.piece = null;
      this.holdUsed = false;
      if (above) { api.gameOver(`Линии: ${this.lines} · Уровень: ${this.level}`); return; }
      const full = [];
      this.board.forEach((row, y) => { if (row.every(Boolean)) full.push(y); });
      if (full.length) {
        this.clearing = { rows: full, t: 0.3 };
        if (full.length === 4) api.sound.melody([523, 659, 784, 1047, 784, 1047, 1319], 0.06, { vol: 0.14 });
        else api.sfx.clear(full.length);
      } else {
        this.spawn(api);
      }
    },

    finishClear(api) {
      const rows = this.clearing.rows;
      this.board = this.board.filter((_, y) => !rows.includes(y));
      while (this.board.length < ROWS) this.board.unshift(Array(COLS).fill(null));
      this.lines += rows.length;
      api.addScore(POINTS[rows.length] * this.level);
      const lvl = 1 + Math.floor(this.lines / 10);
      if (lvl > this.level) { this.level = lvl; api.sfx.levelUp(); }
      api.hud('УРОВЕНЬ', this.level);
      api.hud('ЛИНИИ', this.lines);
      this.clearing = null;
      this.spawn(api);
    },

    update(dt, api) {
      api.sound.playMusic(MUSIC);
      if (this.clearing) {
        this.clearing.t -= dt;
        if (this.clearing.t <= 0) this.finishClear(api);
        return;
      }
      if (!this.piece) return;
      const p = this.piece;

      if (api.pressed('action2') && !this.holdUsed) {
        const cur = p.t;
        if (this.hold) this.spawn(api, this.hold); else this.spawn(api);
        this.hold = cur;
        this.holdUsed = true;
        api.sfx.blip(0.8);
        return;
      }
      if (api.pressed('up') || api.keyPressed('KeyX')) this.rot(1, api);
      if (api.keyPressed('KeyZ')) this.rot(-1, api);

      // сдвиг с автоповтором
      const dir = api.held('left') ? -1 : api.held('right') ? 1 : 0;
      if (api.pressed('left') || api.pressed('right')) {
        const d = api.pressed('left') ? -1 : 1;
        this.move(d, api);
        this.das = { dir: d, t: 0.16 };
      } else if (dir && dir === this.das.dir) {
        this.das.t -= dt;
        while (this.das.t <= 0) { this.move(dir, api); this.das.t += 0.045; }
      } else {
        this.das.dir = 0;
      }

      if (api.pressed('action')) {
        let n = 0;
        while (this.fits(p.m, p.x, p.y + 1)) { p.y++; n++; }
        api.addScore(n * 2);
        this.lockPiece(api);
        return;
      }

      const gravity = Math.pow(Math.max(0.05, 0.8 - (this.level - 1) * 0.007), this.level - 1);
      const soft = api.held('down');
      const interval = soft ? Math.min(gravity, 0.035) : gravity;
      if (this.fits(p.m, p.x, p.y + 1)) {
        this.fall += dt;
        while (this.fall >= interval && this.fits(p.m, p.x, p.y + 1)) {
          this.fall -= interval;
          p.y++;
          if (soft) api.addScore(1);
        }
        this.lock = 0;
      } else {
        this.fall = 0;
        this.lock += dt;
        if (this.lock >= 0.5) this.lockPiece(api);
      }
    },

    draw(ctx, api) {
      ctx.fillStyle = '#0b0b22';
      ctx.fillRect(0, 0, api.W, api.H);
      ctx.fillStyle = '#05050f';
      ctx.fillRect(BX, BY, COLS * C, ROWS * C);
      ctx.strokeStyle = 'rgba(255,255,255,0.05)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let x = 1; x < COLS; x++) { ctx.moveTo(BX + x * C + 0.5, BY); ctx.lineTo(BX + x * C + 0.5, BY + ROWS * C); }
      for (let y = 1; y < ROWS; y++) { ctx.moveTo(BX, BY + y * C + 0.5); ctx.lineTo(BX + COLS * C, BY + y * C + 0.5); }
      ctx.stroke();

      const flash = this.clearing && Math.floor(this.clearing.t * 20) % 2 === 0;
      this.board.forEach((row, y) => row.forEach((t, x) => {
        if (!t) return;
        const white = this.clearing && this.clearing.rows.includes(y) && flash;
        cell(ctx, BX + x * C, BY + y * C, C, white ? '#ffffff' : COLORS[t]);
      }));

      const p = this.piece;
      if (p) {
        let gy = p.y;
        while (this.fits(p.m, p.x, gy + 1)) gy++;
        ctx.strokeStyle = COLORS[p.t];
        ctx.globalAlpha = 0.45;
        ctx.lineWidth = 2;
        p.m.forEach((row, y) => row.forEach((v, x) => {
          if (v && gy + y >= 0) ctx.strokeRect(BX + (p.x + x) * C + 3, BY + (gy + y) * C + 3, C - 6, C - 6);
        }));
        ctx.globalAlpha = 1;
        p.m.forEach((row, y) => row.forEach((v, x) => {
          if (v && p.y + y >= 0) cell(ctx, BX + (p.x + x) * C, BY + (p.y + y) * C, C, COLORS[p.t]);
        }));
      }

      ctx.strokeStyle = '#2a2a62';
      ctx.lineWidth = 2;
      ctx.strokeRect(BX - 1, BY - 1, COLS * C + 2, ROWS * C + 2);

      api.text('ДАЛЕЕ', PX, BY + 10, { size: 10, align: 'left', color: '#8b8bb8' });
      this.queue.forEach((t, i) => mini(ctx, t, PX, BY + 28 + i * 70, i === 0 ? 22 : 16));
      api.text('ЗАПАС', PX, BY + 250, { size: 10, align: 'left', color: '#8b8bb8' });
      if (this.hold) {
        ctx.globalAlpha = this.holdUsed ? 0.35 : 1;
        mini(ctx, this.hold, PX, BY + 268, 20);
        ctx.globalAlpha = 1;
      }
      api.text('УРОВЕНЬ', PX, BY + 360, { size: 9, align: 'left', color: '#8b8bb8' });
      api.text(String(this.level), PX, BY + 382, { size: 16, align: 'left' });
      api.text('ЛИНИИ', PX, BY + 420, { size: 9, align: 'left', color: '#8b8bb8' });
      api.text(String(this.lines), PX, BY + 442, { size: 16, align: 'left' });
    },
  });

  function cell(ctx, x, y, s, color) {
    ctx.fillStyle = color;
    ctx.fillRect(x + 1, y + 1, s - 2, s - 2);
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.fillRect(x + 1, y + 1, s - 2, 4);
    ctx.fillRect(x + 1, y + 1, 4, s - 2);
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.fillRect(x + 1, y + s - 5, s - 2, 4);
    ctx.fillRect(x + s - 5, y + 1, 4, s - 2);
  }

  function mini(ctx, t, x, y, s) {
    const m = SHAPES[t];
    m.forEach((row, yy) => row.forEach((v, xx) => { if (v) cell(ctx, x + xx * s, y + yy * s, s, COLORS[t]); }));
  }
})();
