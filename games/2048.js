'use strict';

(() => {
  const N = 4, T = 96, G = 12, S = N * T + (N + 1) * G;
  const ANIM = 0.11;
  const COLORS = {
    2: ['#eee4da', '#776e65'], 4: ['#ede0c8', '#776e65'], 8: ['#f2b179', '#fff'], 16: ['#f59563', '#fff'],
    32: ['#f67c5f', '#fff'], 64: ['#f65e3b', '#fff'], 128: ['#edcf72', '#fff'], 256: ['#edcc61', '#fff'],
    512: ['#edc850', '#fff'], 1024: ['#edc53f', '#fff'], 2048: ['#edc22e', '#fff'],
  };
  const pos = i => G + i * (T + G);
  let nextId = 1;

  Arcade.register({
    width: S,
    height: S,
    swipe: true,

    start(api) {
      this.tiles = [];
      this.anim = 0;
      this.won = false;
      this.toast = 0;
      this.spawn(api);
      this.spawn(api);
      for (const t of this.tiles) t.born = 1;
    },

    cellAt(r, c) { return this.tiles.find(t => !t.dying && t.r === r && t.c === c); },

    spawn() {
      const free = [];
      for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) if (!this.cellAt(r, c)) free.push([r, c]);
      if (!free.length) return;
      const [r, c] = free[Math.floor(Math.random() * free.length)];
      this.tiles.push({ id: nextId++, v: Math.random() < 0.9 ? 2 : 4, r, c, fr: r, fc: c, born: 0, pop: 0 });
    },

    finish() {
      this.tiles = this.tiles.filter(t => !t.dying);
      for (const t of this.tiles) {
        if (t.newV) { t.v = t.newV; t.newV = 0; t.pop = 1; }
        t.fr = t.r; t.fc = t.c;
      }
      this.anim = 0;
    },

    move(dir, api) {
      if (this.anim > 0) {
        this.finish();
        if (this.pendingSpawn) { this.pendingSpawn = false; this.spawn(api); }
      }
      let moved = false, gained = 0, maxMerge = 0;
      for (let i = 0; i < N; i++) {
        const cells = [];
        for (let j = 0; j < N; j++) {
          if (dir === 'left') cells.push([i, j]);
          if (dir === 'right') cells.push([i, N - 1 - j]);
          if (dir === 'up') cells.push([j, i]);
          if (dir === 'down') cells.push([N - 1 - j, i]);
        }
        const line = cells.map(([r, c]) => this.cellAt(r, c)).filter(Boolean);
        const placed = [];
        for (const t of line) {
          const last = placed[placed.length - 1];
          if (last && !last.merged && last.v === t.v) {
            last.merged = true;
            last.newV = t.v * 2;
            gained += t.v * 2;
            maxMerge = Math.max(maxMerge, t.v * 2);
            t.dying = true;
            t.fr = t.r; t.fc = t.c;
            t.r = last.r; t.c = last.c;
            moved = true;
          } else {
            const [r, c] = cells[placed.length];
            t.fr = t.r; t.fc = t.c;
            if (t.r !== r || t.c !== c) moved = true;
            t.r = r; t.c = c;
            placed.push(t);
          }
        }
      }
      for (const t of this.tiles) t.merged = false;
      if (!moved) return;
      this.anim = ANIM;
      api.addScore(gained);
      if (maxMerge) api.sfx.pop(0.6 + Math.log2(maxMerge) * 0.08);
      else api.sfx.tick();
      if (maxMerge >= 2048 && !this.won) {
        this.won = true;
        this.toast = 2.5;
        api.sfx.win();
      }
      this.pendingSpawn = true;
    },

    canMove() {
      if (this.tiles.filter(t => !t.dying).length < N * N) return true;
      for (let r = 0; r < N; r++) {
        for (let c = 0; c < N; c++) {
          const v = this.cellAt(r, c).v;
          if (c + 1 < N && this.cellAt(r, c + 1).v === v) return true;
          if (r + 1 < N && this.cellAt(r + 1, c).v === v) return true;
        }
      }
      return false;
    },

    update(dt, api) {
      for (const d of ['up', 'down', 'left', 'right']) if (api.pressed(d)) { this.move(d, api); break; }
      this.toast = Math.max(0, this.toast - dt);
      for (const t of this.tiles) {
        t.born = Math.min(1, t.born + dt * 7);
        t.pop = Math.max(0, t.pop - dt * 6);
      }
      if (this.anim > 0) {
        this.anim -= dt;
        if (this.anim <= 0) {
          this.finish();
          if (this.pendingSpawn) { this.pendingSpawn = false; this.spawn(api); }
          if (!this.canMove()) api.gameOver(`Лучшая плитка: ${Math.max(...this.tiles.map(t => t.v))}`);
        }
      }
    },

    draw(ctx, api) {
      ctx.fillStyle = '#bbada0';
      ctx.beginPath(); ctx.roundRect(0, 0, S, S, 10); ctx.fill();
      ctx.fillStyle = 'rgba(238,228,218,0.35)';
      for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) { ctx.beginPath(); ctx.roundRect(pos(c), pos(r), T, T, 6); ctx.fill(); }

      const k = this.anim > 0 ? 1 - this.anim / ANIM : 1;
      const order = [...this.tiles].sort((a, b) => (a.dying ? 0 : 1) - (b.dying ? 0 : 1));
      for (const t of order) {
        const x = pos(t.fc) + (pos(t.c) - pos(t.fc)) * k;
        const y = pos(t.fr) + (pos(t.r) - pos(t.fr)) * k;
        const scale = (t.born < 1 ? t.born : 1) * (1 + Math.sin(t.pop * Math.PI) * 0.12);
        const [bg, fg] = COLORS[t.v] || ['#3c3a32', '#fff'];
        ctx.save();
        ctx.translate(x + T / 2, y + T / 2);
        ctx.scale(scale, scale);
        ctx.fillStyle = bg;
        ctx.beginPath(); ctx.roundRect(-T / 2, -T / 2, T, T, 6); ctx.fill();
        const size = t.v < 100 ? 40 : t.v < 1000 ? 34 : 26;
        api.text(String(t.v), 0, 3, { size, color: fg, weight: 600, font: 'Rubik, system-ui, sans-serif' });
        ctx.restore();
      }
      if (this.toast > 0) {
        ctx.fillStyle = `rgba(237,194,46,${Math.min(0.85, this.toast)})`;
        ctx.fillRect(0, S / 2 - 40, S, 80);
        api.text('2048!', S / 2, S / 2, { size: 28, color: '#fff' });
      }
    },
  });
})();
