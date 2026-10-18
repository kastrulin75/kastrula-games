'use strict';

(() => {
  const N = 20, C = 24;
  const DIR = { up: { x: 0, y: -1 }, down: { x: 0, y: 1 }, left: { x: -1, y: 0 }, right: { x: 1, y: 0 } };

  Arcade.register({
    width: N * C,
    height: N * C,
    swipe: true,

    start(api) {
      this.snake = [{ x: 9, y: 10 }, { x: 8, y: 10 }, { x: 7, y: 10 }];
      this.dir = DIR.right;
      this.queue = [];
      this.timer = 0;
      this.speed = 7;
      this.grow = 0;
      this.eaten = 0;
      this.bonus = null;
      this.flash = 0;
      this.food = this.freeCell(api);
      api.hud('ДЛИНА', this.snake.length);
    },

    freeCell(api) {
      for (;;) {
        const p = { x: api.randInt(0, N - 1), y: api.randInt(0, N - 1) };
        const busy = this.snake.some(s => s.x === p.x && s.y === p.y) ||
          (this.food && this.food.x === p.x && this.food.y === p.y);
        if (!busy) return p;
      }
    },

    update(dt, api) {
      for (const d of ['up', 'down', 'left', 'right']) {
        if (api.pressed(d) && this.queue.length < 3) this.queue.push(DIR[d]);
      }
      if (this.bonus) {
        this.bonus.t -= dt;
        if (this.bonus.t <= 0) this.bonus = null;
      }
      this.flash = Math.max(0, this.flash - dt);
      this.timer += dt;
      const step = 1 / this.speed;
      while (this.timer >= step) {
        this.timer -= step;
        this.tick(api);
        if (api.state !== 'playing') return;
      }
    },

    tick(api) {
      while (this.queue.length) {
        const d = this.queue.shift();
        if (d !== this.dir && (d.x !== -this.dir.x || d.y !== -this.dir.y)) {
          this.dir = d;
          api.sfx.tick();
          break;
        }
      }
      const h = this.snake[0];
      const nx = h.x + this.dir.x, ny = h.y + this.dir.y;
      const bodyLen = this.snake.length - (this.grow > 0 ? 0 : 1);
      const hitSelf = this.snake.some((s, i) => i < bodyLen && s.x === nx && s.y === ny);
      if (nx < 0 || ny < 0 || nx >= N || ny >= N || hitSelf) {
        api.sfx.hurt();
        api.gameOver(`Длина: ${this.snake.length}`);
        return;
      }
      this.snake.unshift({ x: nx, y: ny });
      if (nx === this.food.x && ny === this.food.y) {
        this.grow += 2;
        this.eaten++;
        api.addScore(10);
        api.sfx.coin();
        this.speed = Math.min(18, this.speed + 0.25);
        this.food = this.freeCell(api);
        if (this.eaten % 5 === 0 && !this.bonus) this.bonus = { ...this.freeCell(api), t: 6 };
      } else if (this.bonus && nx === this.bonus.x && ny === this.bonus.y) {
        this.grow += 4;
        api.addScore(50);
        api.sfx.powerup();
        this.bonus = null;
        this.flash = 0.3;
      }
      if (this.grow > 0) this.grow--;
      else this.snake.pop();
      api.hud('ДЛИНА', this.snake.length);
    },

    draw(ctx, api) {
      for (let y = 0; y < N; y++) {
        for (let x = 0; x < N; x++) {
          ctx.fillStyle = (x + y) % 2 ? '#14213d' : '#172648';
          ctx.fillRect(x * C, y * C, C, C);
        }
      }
      if (this.flash > 0) {
        ctx.fillStyle = `rgba(255,215,0,${this.flash})`;
        ctx.fillRect(0, 0, api.W, api.H);
      }

      // еда — яблоко
      const f = this.food;
      const fx = f.x * C + C / 2, fy = f.y * C + C / 2;
      ctx.fillStyle = '#ff4d4d';
      ctx.beginPath();
      ctx.arc(fx, fy + 1, C * 0.38, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#3ddc84';
      ctx.beginPath();
      ctx.ellipse(fx + 4, fy - 9, 5, 3, -0.5, 0, Math.PI * 2);
      ctx.fill();

      if (this.bonus && (this.bonus.t > 2 || Math.floor(this.bonus.t * 6) % 2)) {
        const bx = this.bonus.x * C + C / 2, by = this.bonus.y * C + C / 2;
        ctx.fillStyle = '#ffd700';
        ctx.beginPath();
        for (let i = 0; i < 10; i++) {
          const r = i % 2 ? C * 0.2 : C * 0.45;
          const a = -Math.PI / 2 + i * Math.PI / 5;
          ctx.lineTo(bx + Math.cos(a) * r, by + Math.sin(a) * r);
        }
        ctx.fill();
      }

      // змейка
      const n = this.snake.length;
      this.snake.forEach((s, i) => {
        const t = i / Math.max(1, n - 1);
        ctx.fillStyle = `hsl(${145 - t * 40}, 75%, ${55 - t * 18}%)`;
        const pad = i === 0 ? 1 : 2;
        roundRect(ctx, s.x * C + pad, s.y * C + pad, C - pad * 2, C - pad * 2, 7);
      });
      const h = this.snake[0];
      const cx = h.x * C + C / 2, cy = h.y * C + C / 2;
      const px = -this.dir.y, py = this.dir.x;
      for (const s of [-1, 1]) {
        const ex = cx + this.dir.x * 4 + px * 5 * s;
        const ey = cy + this.dir.y * 4 + py * 5 * s;
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.arc(ex, ey, 3.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#111';
        ctx.beginPath();
        ctx.arc(ex + this.dir.x * 1.5, ey + this.dir.y * 1.5, 1.8, 0, Math.PI * 2);
        ctx.fill();
      }
    },
  });

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, r);
    ctx.fill();
  }
})();
