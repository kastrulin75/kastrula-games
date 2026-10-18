'use strict';

(() => {
  const W = 480, H = 540, BAR = 52;
  const MODES = {
    easy: { cols: 9, rows: 9, mines: 10, label: 'ЛЕГКО' },
    medium: { cols: 16, rows: 16, mines: 40, label: 'СРЕДНЕ' },
    hard: { cols: 30, rows: 16, mines: 99, label: 'ЭКСПЕРТ' },
  };
  const ORDER = ['easy', 'medium', 'hard'];
  const NUM_COLORS = ['', '#3e7bff', '#2f9e44', '#e03131', '#5f3dc4', '#a61e4d', '#0c8599', '#222', '#777'];

  Arcade.register({
    width: W,
    height: H,
    pointerAction: false,
    lowerIsBetter: true,
    scoreLabel: 'ВРЕМЯ',
    formatScore: v => `${Math.floor(v / 60)}:${String(Math.floor(v % 60)).padStart(2, '0')}`,

    start(api) {
      if (!this.mode) {
        try { this.mode = localStorage.getItem('arcade-mines-mode') || 'easy'; } catch { this.mode = 'easy'; }
        if (!MODES[this.mode]) this.mode = 'easy';
      }
      this.reset(api);
    },

    reset(api) {
      const m = MODES[this.mode];
      api.bestKey(this.mode);
      api.score = 0;
      this.cols = m.cols; this.rows = m.rows; this.mines = m.mines;
      this.cells = Array.from({ length: m.rows * m.cols }, () => ({ mine: false, open: false, flag: false, n: 0 }));
      this.started = false;
      this.time = 0;
      this.over = false;
      this.cursor = { r: Math.floor(m.rows / 2), c: Math.floor(m.cols / 2) };
      this.size = Math.floor(Math.min((W - 20) / m.cols, (H - BAR - 16) / m.rows));
      this.ox = (W - this.size * m.cols) / 2;
      this.oy = BAR + (H - BAR - this.size * m.rows) / 2;
      api.hud('МИНЫ', m.mines);
    },

    setMode(mode, api) {
      if (this.mode === mode && !this.started) return;
      this.mode = mode;
      try { localStorage.setItem('arcade-mines-mode', mode); } catch { /* недоступно */ }
      api.sfx.select();
      this.reset(api);
    },

    idx(r, c) { return r * this.cols + c; },
    around(r, c) {
      const out = [];
      for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
        const rr = r + dr, cc = c + dc;
        if ((dr || dc) && rr >= 0 && rr < this.rows && cc >= 0 && cc < this.cols) out.push([rr, cc]);
      }
      return out;
    },

    plant(sr, sc, api) {
      const banned = new Set([this.idx(sr, sc), ...this.around(sr, sc).map(([r, c]) => this.idx(r, c))]);
      const free = [...this.cells.keys()].filter(i => !banned.has(i));
      for (const i of api.shuffle(free).slice(0, this.mines)) this.cells[i].mine = true;
      for (let r = 0; r < this.rows; r++) for (let c = 0; c < this.cols; c++) {
        this.cells[this.idx(r, c)].n = this.around(r, c).filter(([rr, cc]) => this.cells[this.idx(rr, cc)].mine).length;
      }
      this.started = true;
    },

    reveal(r, c, api) {
      if (this.over) return;
      if (!this.started) this.plant(r, c, api);
      const cell = this.cells[this.idx(r, c)];
      if (cell.flag) return;
      if (cell.open) { this.chord(r, c, api); return; }
      if (cell.mine) { this.lose(r, c, api); return; }
      let opened = 0;
      const stack = [[r, c]];
      while (stack.length) {
        const [rr, cc] = stack.pop();
        const k = this.cells[this.idx(rr, cc)];
        if (k.open || k.flag) continue;
        k.open = true;
        opened++;
        if (k.n === 0) for (const nb of this.around(rr, cc)) stack.push(nb);
      }
      if (opened > 1) api.sfx.pop(0.8); else api.sfx.tick();
      this.checkWin(api);
    },

    chord(r, c, api) {
      const cell = this.cells[this.idx(r, c)];
      const nb = this.around(r, c);
      const flags = nb.filter(([rr, cc]) => this.cells[this.idx(rr, cc)].flag).length;
      if (flags !== cell.n) return;
      for (const [rr, cc] of nb) {
        const k = this.cells[this.idx(rr, cc)];
        if (!k.open && !k.flag) { if (k.mine) { this.lose(rr, cc, api); return; } this.reveal(rr, cc, api); }
      }
    },

    flag(r, c, api) {
      if (this.over) return;
      const k = this.cells[this.idx(r, c)];
      if (k.open) return;
      k.flag = !k.flag;
      api.sfx.blip(k.flag ? 1.2 : 0.8);
      api.hud('МИНЫ', this.mines - this.cells.filter(x => x.flag).length);
    },

    lose(r, c, api) {
      this.over = true;
      this.boom = this.idx(r, c);
      for (const k of this.cells) if (k.mine) k.open = true;
      api.sfx.explode(1);
      this.endT = 1;
    },

    checkWin(api) {
      if (this.cells.every(k => k.mine || k.open)) {
        this.over = true;
        for (const k of this.cells) if (k.mine) k.flag = true;
        api.score = Math.max(1, Math.floor(this.time));
        api.win(`${MODES[this.mode].label} за ${api.fmtTime(this.time)}`);
      }
    },

    cellAt(x, y) {
      const c = Math.floor((x - this.ox) / this.size), r = Math.floor((y - this.oy) / this.size);
      return r >= 0 && r < this.rows && c >= 0 && c < this.cols ? { r, c } : null;
    },

    onPointer(type, x, y, button, api) {
      if (type === 'down') {
        if (y < BAR) {
          const i = Math.floor((x - 12) / ((W - 24) / 3));
          if (i >= 0 && i < 3) this.setMode(ORDER[i], api);
          return;
        }
        const cell = this.cellAt(x, y);
        if (!cell) return;
        this.cursor = cell;
        if (button === 2) { this.flag(cell.r, cell.c, api); return; }
        this.press = { ...cell, t: performance.now(), x, y, done: false };
      } else if (type === 'up' && this.press) {
        if (!this.press.done) this.reveal(this.press.r, this.press.c, api);
        this.press = null;
      } else if (type === 'move' && this.press && Math.hypot(x - this.press.x, y - this.press.y) > 12) {
        this.press = null;
      }
    },

    update(dt, api) {
      if (this.endT) {
        this.endT -= dt;
        if (this.endT <= 0) { this.endT = 0; api.gameOver('Подорвался на мине', { quiet: false }); }
        return;
      }
      if (this.started && !this.over) {
        this.time += dt;
        api.score = Math.floor(this.time);
      }
      // долгое касание — флажок
      if (this.press && !this.press.done && performance.now() - this.press.t > 380) {
        this.press.done = true;
        this.flag(this.press.r, this.press.c, api);
      }
      for (const [k, n] of [['Digit1', 0], ['Digit2', 1], ['Digit3', 2]]) if (api.keyPressed(k)) this.setMode(ORDER[n], api);
      const cur = this.cursor;
      if (api.pressed('up')) cur.r = Math.max(0, cur.r - 1);
      if (api.pressed('down')) cur.r = Math.min(this.rows - 1, cur.r + 1);
      if (api.pressed('left')) cur.c = Math.max(0, cur.c - 1);
      if (api.pressed('right')) cur.c = Math.min(this.cols - 1, cur.c + 1);
      if (api.pressed('action')) this.reveal(cur.r, cur.c, api);
      if (api.keyPressed('KeyF')) this.flag(cur.r, cur.c, api);
    },

    draw(ctx, api) {
      ctx.fillStyle = '#1b1f2a';
      ctx.fillRect(0, 0, W, H);
      const bw = (W - 24) / 3;
      ORDER.forEach((m, i) => {
        const x = 12 + i * bw;
        ctx.fillStyle = m === this.mode ? '#cbd5e0' : '#2d3445';
        ctx.beginPath(); ctx.roundRect(x + 3, 10, bw - 6, 32, 8); ctx.fill();
        api.text(`${i + 1} ${MODES[m].label}`, x + bw / 2, 27, { size: 9, color: m === this.mode ? '#111' : '#cbd5e0' });
      });

      const s = this.size;
      for (let r = 0; r < this.rows; r++) {
        for (let c = 0; c < this.cols; c++) {
          const k = this.cells[this.idx(r, c)];
          const x = this.ox + c * s, y = this.oy + r * s;
          if (k.open) {
            ctx.fillStyle = this.boom === this.idx(r, c) ? '#e03131' : '#d5dbe4';
            ctx.fillRect(x, y, s, s);
            ctx.strokeStyle = '#aab3c0';
            ctx.lineWidth = 1;
            ctx.strokeRect(x + 0.5, y + 0.5, s - 1, s - 1);
            if (k.mine) {
              ctx.fillStyle = '#111';
              ctx.beginPath(); ctx.arc(x + s / 2, y + s / 2, s * 0.26, 0, Math.PI * 2); ctx.fill();
              ctx.fillRect(x + s * 0.18, y + s / 2 - 1, s * 0.64, 2);
              ctx.fillRect(x + s / 2 - 1, y + s * 0.18, 2, s * 0.64);
            } else if (k.n) {
              api.text(String(k.n), x + s / 2, y + s / 2 + 1, { size: Math.floor(s * 0.55), color: NUM_COLORS[k.n], weight: 700, font: 'Rubik, sans-serif' });
            }
          } else {
            ctx.fillStyle = '#9aa5b8';
            ctx.fillRect(x, y, s, s);
            ctx.fillStyle = '#c3cbd8';
            ctx.fillRect(x, y, s, 3); ctx.fillRect(x, y, 3, s);
            ctx.fillStyle = '#6b7588';
            ctx.fillRect(x, y + s - 3, s, 3); ctx.fillRect(x + s - 3, y, 3, s);
            if (k.flag) {
              ctx.fillStyle = '#e03131';
              ctx.beginPath(); ctx.moveTo(x + s * 0.35, y + s * 0.2); ctx.lineTo(x + s * 0.75, y + s * 0.38); ctx.lineTo(x + s * 0.35, y + s * 0.55); ctx.fill();
              ctx.fillStyle = '#111';
              ctx.fillRect(x + s * 0.33, y + s * 0.2, 2, s * 0.6);
            }
          }
        }
      }
      if (api.state === 'playing' && !this.over) {
        ctx.strokeStyle = '#3ec5ff';
        ctx.lineWidth = 2;
        ctx.strokeRect(this.ox + this.cursor.c * s + 1, this.oy + this.cursor.r * s + 1, s - 2, s - 2);
      }
    },
  });
})();
