'use strict';

(() => {
  const W = 400, H = 600, GROUND = 540;
  const GAP = 165, PIPE_W = 66, SPACING = 230;

  Arcade.register({
    width: W,
    height: H,

    start(api) {
      this.bird = { x: 110, y: 280, vy: 0, rot: 0, flap: 0 };
      this.pipes = [];
      this.started = false;
      this.dead = false;
      this.deadTimer = 0;
      this.speed = 150;
      this.scroll = 0;
      this.clouds = Array.from({ length: 5 }, (_, i) => ({ x: i * 100 + Math.random() * 60, y: 40 + Math.random() * 180, s: 0.6 + Math.random() * 0.8 }));
      this.t = 0;
    },

    addPipe(x) {
      const top = 70 + Math.random() * (GROUND - GAP - 140);
      this.pipes.push({ x, top, scored: false });
    },

    update(dt, api) {
      const b = this.bird;
      this.t += dt;
      b.flap += dt;
      if (!this.started) {
        b.y = 280 + Math.sin(this.t * 4) * 8;
        this.scroll += this.speed * dt;
        if (api.pressed('action') || api.pressed('up')) {
          this.started = true;
          this.addPipe(W + 60);
          this.flapNow(api);
        }
        return;
      }

      if (!this.dead && (api.pressed('action') || api.pressed('up'))) this.flapNow(api);

      b.vy += 1500 * dt;
      b.y += b.vy * dt;
      b.rot = Math.max(-0.5, Math.min(1.4, b.vy / 600));

      if (!this.dead) {
        this.scroll += this.speed * dt;
        this.speed = Math.min(230, this.speed + dt * 1.2);
        for (const p of this.pipes) {
          p.x -= this.speed * dt;
          if (!p.scored && p.x + PIPE_W < b.x) {
            p.scored = true;
            api.addScore(1);
            api.sfx.coin();
          }
          const r = 14;
          if (b.x + r > p.x && b.x - r < p.x + PIPE_W && (b.y - r < p.top || b.y + r > p.top + GAP)) this.die(api);
        }
        this.pipes = this.pipes.filter(p => p.x > -PIPE_W);
        const lastPipe = this.pipes[this.pipes.length - 1];
        if (!lastPipe || lastPipe.x < W - SPACING) this.addPipe(W + 20);
        if (b.y < -40) b.y = -40;
      }

      if (b.y + 14 >= GROUND) {
        b.y = GROUND - 14;
        if (!this.dead) this.die(api);
        this.deadTimer += dt;
        if (this.deadTimer > 0.6) api.gameOver(`Очки: ${api.score}`);
      }
    },

    flapNow(api) {
      this.bird.vy = -440;
      this.bird.flap = 0;
      api.sfx.flap();
    },

    die(api) {
      this.dead = true;
      api.sfx.hit();
      api.sfx.thud();
      if (this.bird.vy < 0) this.bird.vy = 0;
    },

    draw(ctx, api) {
      const sky = ctx.createLinearGradient(0, 0, 0, GROUND);
      sky.addColorStop(0, '#4ec0ff');
      sky.addColorStop(1, '#bdf0ff');
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, W, GROUND);

      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      for (const c of this.clouds) {
        const x = ((c.x - this.scroll * 0.15 * c.s) % (W + 120) + W + 120) % (W + 120) - 60;
        cloud(ctx, x, c.y, c.s);
      }
      // город вдали
      ctx.fillStyle = '#9bd6c8';
      for (let i = 0; i < 12; i++) {
        const x = ((i * 48 - this.scroll * 0.3) % (W + 48) + W + 48) % (W + 48) - 48;
        const h = 40 + ((i * 37) % 60);
        ctx.fillRect(x, GROUND - h, 42, h);
      }

      for (const p of this.pipes) pipe(ctx, p.x, p.top);

      // земля
      ctx.fillStyle = '#ded895';
      ctx.fillRect(0, GROUND, W, H - GROUND);
      ctx.fillStyle = '#5ee65e';
      ctx.fillRect(0, GROUND, W, 14);
      ctx.fillStyle = '#4ac24a';
      for (let x = -((this.scroll) % 24); x < W; x += 24) ctx.fillRect(x, GROUND + 4, 12, 6);

      // птица
      const b = this.bird;
      ctx.save();
      ctx.translate(b.x, b.y);
      ctx.rotate(b.rot);
      ctx.fillStyle = '#ffcc33';
      ctx.beginPath(); ctx.ellipse(0, 0, 18, 14, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#ffe680';
      ctx.beginPath(); ctx.ellipse(-2, 4, 10, 7, 0, 0, Math.PI * 2); ctx.fill();
      const wing = Math.sin(b.flap * 25) * (b.flap < 0.3 || !this.started ? 6 : 1);
      ctx.fillStyle = '#ffffff';
      ctx.beginPath(); ctx.ellipse(-7, 1 + wing, 8, 5, -0.3, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.arc(8, -5, 6, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#111';
      ctx.beginPath(); ctx.arc(10, -5, 2.5, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#ff7a1a';
      ctx.beginPath(); ctx.moveTo(12, 0); ctx.lineTo(25, 3); ctx.lineTo(12, 7); ctx.closePath(); ctx.fill();
      ctx.restore();

      api.text(String(api.score), W / 2 + 3, 63, { size: 34, color: 'rgba(0,0,0,0.35)' });
      api.text(String(api.score), W / 2, 60, { size: 34, color: '#fff' });
      if (!this.started && api.state === 'playing') api.text('ТАП!', W / 2, 360, { size: 16, color: '#fff' });
    },
  });

  function pipe(ctx, x, top) {
    const g = ctx.createLinearGradient(x, 0, x + PIPE_W, 0);
    g.addColorStop(0, '#5fbf2a');
    g.addColorStop(0.5, '#9be15d');
    g.addColorStop(1, '#4a9a20');
    ctx.fillStyle = g;
    ctx.fillRect(x, 0, PIPE_W, top);
    ctx.fillRect(x, top + GAP, PIPE_W, GROUND - top - GAP);
    ctx.fillRect(x - 5, top - 26, PIPE_W + 10, 26);
    ctx.fillRect(x - 5, top + GAP, PIPE_W + 10, 26);
    ctx.strokeStyle = '#2d6612';
    ctx.lineWidth = 2;
    ctx.strokeRect(x, -2, PIPE_W, top - 24);
    ctx.strokeRect(x - 5, top - 26, PIPE_W + 10, 26);
    ctx.strokeRect(x - 5, top + GAP, PIPE_W + 10, 26);
    ctx.strokeRect(x, top + GAP + 26, PIPE_W, GROUND - top - GAP - 26);
  }

  function cloud(ctx, x, y, s) {
    ctx.beginPath();
    ctx.arc(x, y, 18 * s, 0, Math.PI * 2);
    ctx.arc(x + 20 * s, y - 8 * s, 22 * s, 0, Math.PI * 2);
    ctx.arc(x + 42 * s, y, 18 * s, 0, Math.PI * 2);
    ctx.fill();
  }
})();
