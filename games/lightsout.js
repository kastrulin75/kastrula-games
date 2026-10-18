'use strict';

(() => {
  const N = 5, S = 80, G = 8, W = N * S + (N + 1) * G, H = W;
  const pos = i => G + i * (S + G);

  Arcade.register({
    width: W,
    height: H,
    pointerAction: false,

    start(api) {
      this.level = 1;
      this.cursor = { r: 2, c: 2 };
      this.newPuzzle(api);
    },

    newPuzzle(api) {
      this.grid = Array.from({ length: N }, () => Array(N).fill(false));
      const presses = Math.min(15, 2 + this.level * 2);
      const cells = api.shuffle([...Array(N * N).keys()]).slice(0, presses);
      for (const k of cells) this.toggle(Math.floor(k / N), k % N);
      if (this.grid.every(r => r.every(v => !v))) this.toggle(2, 2);
      this.par = presses;
      this.moves = 0;
      this.solved = 0;
      this.glow = Array.from({ length: N }, () => Array(N).fill(0));
      api.hud('УРОВЕНЬ', this.level);
      api.hud('ХОДЫ', 0);
    },

    toggle(r, c) {
      for (const [dr, dc] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const rr = r + dr, cc = c + dc;
        if (rr >= 0 && rr < N && cc >= 0 && cc < N) {
          this.grid[rr][cc] = !this.grid[rr][cc];
          if (this.glow) this.glow[rr][cc] = 1;
        }
      }
    },

    press(r, c, api) {
      if (this.solved) return;
      this.toggle(r, c);
      this.moves++;
      api.hud('ХОДЫ', this.moves);
      const on = this.grid.flat().filter(Boolean).length;
      api.sound.tone({ freq: 300 + on * 30, dur: 0.08, type: 'triangle', vol: 0.3 });
      if (on === 0) {
        this.solved = 1.2;
        api.addScore(Math.max(10, 100 - Math.max(0, this.moves - this.par) * 10));
        api.sfx.levelUp();
      }
    },

    onPointer(type, x, y, b, api) {
      if (type !== 'down') return;
      const c = Math.floor((x - G / 2) / (S + G)), r = Math.floor((y - G / 2) / (S + G));
      if (r >= 0 && r < N && c >= 0 && c < N) { this.cursor = { r, c }; this.press(r, c, api); }
    },

    update(dt, api) {
      for (const row of this.glow) for (let i = 0; i < N; i++) row[i] = Math.max(0, row[i] - dt * 4);
      if (this.solved) {
        this.solved -= dt;
        if (this.solved <= 0) { this.level++; this.newPuzzle(api); }
        return;
      }
      const cur = this.cursor;
      if (api.pressed('up')) cur.r = Math.max(0, cur.r - 1);
      if (api.pressed('down')) cur.r = Math.min(N - 1, cur.r + 1);
      if (api.pressed('left')) cur.c = Math.max(0, cur.c - 1);
      if (api.pressed('right')) cur.c = Math.min(N - 1, cur.c + 1);
      if (api.pressed('action')) this.press(cur.r, cur.c, api);
    },

    draw(ctx, api) {
      ctx.fillStyle = '#14142a';
      ctx.fillRect(0, 0, W, H);
      for (let r = 0; r < N; r++) {
        for (let c = 0; c < N; c++) {
          const on = this.grid[r][c], x = pos(c), y = pos(r);
          if (on) { ctx.shadowColor = '#faf089'; ctx.shadowBlur = 24; }
          ctx.fillStyle = on ? '#faf089' : '#2a2a4a';
          ctx.beginPath(); ctx.roundRect(x, y, S, S, 14); ctx.fill();
          ctx.shadowBlur = 0;
          if (this.glow[r][c] > 0) {
            ctx.fillStyle = `rgba(255,255,255,${this.glow[r][c] * 0.35})`;
            ctx.beginPath(); ctx.roundRect(x, y, S, S, 14); ctx.fill();
          }
          if (on) {
            ctx.fillStyle = 'rgba(255,255,255,0.6)';
            ctx.beginPath(); ctx.roundRect(x + 10, y + 10, S - 20, 12, 6); ctx.fill();
          }
        }
      }
      if (api.state === 'playing') {
        ctx.strokeStyle = '#3ec5ff';
        ctx.lineWidth = 3;
        ctx.beginPath(); ctx.roundRect(pos(this.cursor.c) - 3, pos(this.cursor.r) - 3, S + 6, S + 6, 16); ctx.stroke();
      }
      if (this.solved) api.text('ГОТОВО!', W / 2, H / 2, { size: 26, color: '#3ddc84' });
    },
  });
})();
