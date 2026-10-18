'use strict';

(() => {
  const N = 8, S = 56, TOPBAR = 40, W = N * S, H = N * S + TOPBAR;
  const TYPES = 6, TIME = 90;
  const COLORS = ['#ff4d6d', '#ffd23f', '#3ddc84', '#3ec5ff', '#b04dff', '#ff8c42'];

  Arcade.register({
    width: W,
    height: H,
    pointerAction: false,

    start(api) {
      this.grid = [];
      for (let r = 0; r < N; r++) {
        this.grid.push([]);
        for (let c = 0; c < N; c++) {
          let t;
          do { t = api.randInt(0, TYPES - 1); } while (
            (c >= 2 && this.grid[r][c - 1].t === t && this.grid[r][c - 2].t === t) ||
            (r >= 2 && this.grid[r - 1][c].t === t && this.grid[r - 2][c].t === t));
          this.grid[r].push({ t, y: r - N - 2 + Math.random(), vy: 0, scale: 1 });
        }
      }
      this.state = 'fall';
      this.sel = null;
      this.cursor = { r: 3, c: 3 };
      this.time = TIME;
      this.combo = 0;
      this.anim = null;
      this.drag = null;
      this.lastTick = TIME;
      api.hud('ВРЕМЯ', TIME);
    },

    cellAt(x, y) {
      const c = Math.floor(x / S), r = Math.floor((y - TOPBAR) / S);
      return r >= 0 && r < N && c >= 0 && c < N ? { r, c } : null;
    },

    onPointer(type, x, y, b, api) {
      this.api = api;
      if (type === 'down') {
        const cell = this.cellAt(x, y);
        this.drag = cell ? { ...cell, x, y, used: false } : null;
      } else if (type === 'move' && this.drag && !this.drag.used) {
        const dx = x - this.drag.x, dy = y - this.drag.y;
        if (Math.max(Math.abs(dx), Math.abs(dy)) > 22) {
          const t = Math.abs(dx) > Math.abs(dy) ? { r: this.drag.r, c: this.drag.c + Math.sign(dx) } : { r: this.drag.r + Math.sign(dy), c: this.drag.c };
          this.drag.used = true;
          this.trySwap(this.drag, t);
        }
      } else if (type === 'up' && this.drag) {
        if (!this.drag.used) this.click(this.drag);
        this.drag = null;
      }
    },

    click(cell) {
      if (this.state !== 'idle') return;
      this.cursor = { ...cell };
      if (this.sel && Math.abs(this.sel.r - cell.r) + Math.abs(this.sel.c - cell.c) === 1) {
        this.trySwap(this.sel, cell);
      } else if (this.sel && this.sel.r === cell.r && this.sel.c === cell.c) {
        this.sel = null;
      } else {
        this.sel = { ...cell };
        this.api.sfx.blip(1.2);
      }
    },

    trySwap(a, b) {
      if (this.state !== 'idle' || b.r < 0 || b.r >= N || b.c < 0 || b.c >= N) return;
      this.sel = null;
      this.state = 'swap';
      this.anim = { a, b, t: 0 };
      this.api.sfx.tick();
    },

    swapCells(a, b) {
      const g = this.grid;
      [g[a.r][a.c], g[b.r][b.c]] = [g[b.r][b.c], g[a.r][a.c]];
    },

    findMatches() {
      const m = new Set(), g = this.grid;
      for (let r = 0; r < N; r++) {
        for (let c = 0; c < N; c++) {
          const t = g[r][c].t;
          if (c <= N - 3 && g[r][c + 1].t === t && g[r][c + 2].t === t) { let k = c; while (k < N && g[r][k].t === t) m.add(r * N + k++); }
          if (r <= N - 3 && g[r + 1][c].t === t && g[r + 2][c].t === t) { let k = r; while (k < N && g[k][c].t === t) m.add(k++ * N + c); }
        }
      }
      return m;
    },

    hasMoves() {
      for (let r = 0; r < N; r++) {
        for (let c = 0; c < N; c++) {
          for (const [dr, dc] of [[0, 1], [1, 0]]) {
            if (r + dr >= N || c + dc >= N) continue;
            const a = { r, c }, b = { r: r + dr, c: c + dc };
            this.swapCells(a, b);
            const ok = this.findMatches().size > 0;
            this.swapCells(a, b);
            if (ok) return true;
          }
        }
      }
      return false;
    },

    update(dt, api) {
      this.api = api;
      if (this.time > 0) {
        this.time = Math.max(0, this.time - dt);
        api.hud('ВРЕМЯ', Math.ceil(this.time));
        if (this.time < 10 && Math.ceil(this.time) !== this.lastTick) { this.lastTick = Math.ceil(this.time); api.sfx.tick(); }
      }

      // клавиатура
      const dirs = { up: [-1, 0], down: [1, 0], left: [0, -1], right: [0, 1] };
      for (const d in dirs) {
        if (!api.pressed(d)) continue;
        const [dr, dc] = dirs[d];
        const t = { r: this.cursor.r + dr, c: this.cursor.c + dc };
        if (this.sel) { this.trySwap(this.sel, t); this.cursor = { r: Math.max(0, Math.min(N - 1, t.r)), c: Math.max(0, Math.min(N - 1, t.c)) }; }
        else this.cursor = { r: Math.max(0, Math.min(N - 1, t.r)), c: Math.max(0, Math.min(N - 1, t.c)) };
      }
      if (api.pressed('action')) {
        if (this.sel) this.sel = null;
        else if (this.state === 'idle') { this.sel = { ...this.cursor }; api.sfx.blip(1.2); }
      }

      if (this.state === 'swap' || this.state === 'unswap') {
        this.anim.t += dt / 0.16;
        if (this.anim.t >= 1) {
          this.swapCells(this.anim.a, this.anim.b);
          if (this.state === 'unswap') { this.state = 'idle'; this.anim = null; }
          else if (this.findMatches().size) { this.anim = null; this.combo = 0; this.startClear(api); }
          else { this.state = 'unswap'; this.anim.t = 0; api.sfx.error(); }
        }
      } else if (this.state === 'clear') {
        this.clearT -= dt;
        for (const i of this.matched) this.grid[Math.floor(i / N)][i % N].scale = Math.max(0, this.clearT / 0.22);
        if (this.clearT <= 0) this.collapse(api);
      } else if (this.state === 'fall') {
        let moving = false;
        for (let r = 0; r < N; r++) {
          for (let c = 0; c < N; c++) {
            const g = this.grid[r][c];
            if (g.y < r) {
              g.vy += 40 * dt;
              g.y = Math.min(r, g.y + g.vy * dt);
              if (g.y >= r) { g.vy = 0; }
              moving = true;
            }
          }
        }
        if (!moving) {
          if (this.findMatches().size) this.startClear(api);
          else {
            this.state = 'idle';
            this.combo = 0;
            if (!this.hasMoves()) this.shuffle(api);
          }
        }
      }
      if (this.time <= 0 && this.state === 'idle') api.gameOver(`Очки: ${api.score}`, { title: 'ВРЕМЯ ВЫШЛО', quiet: false });
    },

    startClear(api) {
      this.matched = this.findMatches();
      this.combo++;
      api.addScore(this.matched.size * 10 * this.combo);
      api.sound.tone({ freq: 500 * Math.pow(1.12, this.combo), freqEnd: 1000 * Math.pow(1.12, this.combo), dur: 0.12, type: 'sine', vol: 0.3 });
      if (this.combo > 1) api.sfx.coin();
      this.state = 'clear';
      this.clearT = 0.22;
    },

    collapse(api) {
      for (let c = 0; c < N; c++) {
        const col = [];
        for (let r = N - 1; r >= 0; r--) if (!this.matched.has(r * N + c)) col.push(this.grid[r][c]);
        let spawn = 0;
        for (let r = N - 1; r >= 0; r--) {
          const g = col.shift();
          if (g) this.grid[r][c] = g;
          else this.grid[r][c] = { t: api.randInt(0, TYPES - 1), y: -1 - spawn++, vy: 0, scale: 1 };
        }
      }
      this.state = 'fall';
    },

    shuffle(api) {
      const all = this.grid.flat().map(g => g.t);
      do {
        api.shuffle(all);
        for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) this.grid[r][c].t = all[r * N + c];
      } while (this.findMatches().size || !this.hasMoves());
      api.sfx.whoosh();
    },

    draw(ctx, api) {
      ctx.fillStyle = '#1a1033';
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = '#2a1d52';
      ctx.fillRect(0, 0, W, TOPBAR);
      ctx.fillStyle = this.time < 10 ? '#ff4d6d' : '#b794f4';
      ctx.fillRect(10, 14, (W - 20) * (this.time / TIME), 12);

      for (let r = 0; r < N; r++) {
        for (let c = 0; c < N; c++) {
          ctx.fillStyle = (r + c) % 2 ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.08)';
          ctx.fillRect(c * S, TOPBAR + r * S, S, S);
        }
      }
      ctx.save();
      ctx.beginPath(); ctx.rect(0, TOPBAR, W, N * S); ctx.clip();
      for (let r = 0; r < N; r++) {
        for (let c = 0; c < N; c++) {
          const g = this.grid[r][c];
          let x = c, y = g.y;
          if (this.anim) {
            const { a, b, t } = this.anim;
            const k = this.state === 'unswap' ? 1 - t : t;
            if (a.r === r && a.c === c) { x = c + (b.c - a.c) * k; y = r + (b.r - a.r) * k; }
            if (b.r === r && b.c === c) { x = c + (a.c - b.c) * k; y = r + (a.r - b.r) * k; }
          }
          gem(ctx, g.t, x * S + S / 2, TOPBAR + y * S + S / 2, S * 0.38 * g.scale);
        }
      }
      ctx.restore();

      const mark = (cell, color) => {
        ctx.strokeStyle = color;
        ctx.lineWidth = 3;
        ctx.strokeRect(cell.c * S + 2, TOPBAR + cell.r * S + 2, S - 4, S - 4);
      };
      if (this.sel) mark(this.sel, '#fff');
      if (api.state === 'playing') mark(this.cursor, 'rgba(255,255,255,0.3)');
      if (this.combo > 1 && this.state !== 'idle') api.text(`КОМБО ×${this.combo}`, W / 2, TOPBAR + N * S / 2, { size: 18, color: '#ffd23f' });
    },
  });

  function gem(ctx, t, x, y, r) {
    if (r <= 0.5) return;
    ctx.fillStyle = COLORS[t];
    ctx.beginPath();
    if (t === 0) { ctx.moveTo(x, y - r); ctx.lineTo(x + r, y); ctx.lineTo(x, y + r); ctx.lineTo(x - r, y); }
    else if (t === 1) ctx.arc(x, y, r, 0, Math.PI * 2);
    else if (t === 2) ctx.rect(x - r * 0.85, y - r * 0.85, r * 1.7, r * 1.7);
    else if (t === 3) { ctx.moveTo(x, y - r); ctx.lineTo(x + r, y + r * 0.8); ctx.lineTo(x - r, y + r * 0.8); }
    else if (t === 4) for (let i = 0; i < 6; i++) ctx.lineTo(x + Math.cos(i * Math.PI / 3) * r, y + Math.sin(i * Math.PI / 3) * r);
    else for (let i = 0; i < 10; i++) { const rr = i % 2 ? r * 0.45 : r, a = -Math.PI / 2 + i * Math.PI / 5; ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); }
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.45)';
    ctx.beginPath(); ctx.arc(x - r * 0.3, y - r * 0.35, r * 0.22, 0, Math.PI * 2); ctx.fill();
  }
})();
