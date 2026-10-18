'use strict';

(() => {
  const W = 480, H = 620;
  const BC = 10, BR = 7, BW = 44, BH = 18, GAPX = 2, TOP = 70, LEFT = 10;
  const PY = 585;
  const ROW_COLORS = ['#ff4d6d', '#ff8c42', '#ffd23f', '#3ddc84', '#3ec5ff', '#7b6cff', '#d65cff'];
  const POWERS = {
    W: { color: '#3ec5ff', label: 'W' },
    M: { color: '#d65cff', label: 'M' },
    S: { color: '#3ddc84', label: 'S' },
    L: { color: '#ff4d6d', label: '' },
  };

  Arcade.register({
    width: W,
    height: H,

    start(api) {
      this.level = 1;
      this.lives = 3;
      this.paddle = { x: W / 2, w: 84, wideT: 0 };
      this.buildLevel(api);
      this.resetBall();
      api.hud('ЖИЗНИ', this.lives);
      api.hud('УРОВЕНЬ', this.level);
    },

    buildLevel(api) {
      this.bricks = [];
      const lv = this.level;
      for (let r = 0; r < BR; r++) {
        for (let c = 0; c < BC; c++) {
          let on = true;
          if (lv % 4 === 2) on = Math.abs(c - 4.5) <= r * 0.75 + 0.5;
          else if (lv % 4 === 3) on = (r + c) % 2 === 0 || r === 0;
          else if (lv % 4 === 0) on = Math.random() < 0.75;
          if (!on) continue;
          const hard = lv >= 3 && (r === 0 || Math.random() < 0.12);
          this.bricks.push({
            x: LEFT + c * (BW + GAPX), y: TOP + r * (BH + GAPX), r,
            hp: hard ? 2 : 1, hard, color: hard ? '#c0c0d0' : ROW_COLORS[r],
          });
        }
      }
      this.drops = [];
      this.particles = [];
    },

    resetBall() {
      this.balls = [{ x: this.paddle.x, y: PY - 9, vx: 0, vy: 0, stuck: true }];
      this.baseSpeed = 330 + (this.level - 1) * 25;
    },

    launch(api) {
      for (const b of this.balls) {
        if (!b.stuck) continue;
        const a = -Math.PI / 2 + (Math.random() - 0.5) * 0.8;
        b.vx = Math.cos(a) * this.baseSpeed;
        b.vy = Math.sin(a) * this.baseSpeed;
        b.stuck = false;
        api.sfx.bounce(1.2);
      }
    },

    onPointer(type, x) {
      if (type === 'move' || type === 'down') this.paddle.x = x;
    },

    update(dt, api) {
      const pd = this.paddle;
      if (api.held('left')) pd.x -= 560 * dt;
      if (api.held('right')) pd.x += 560 * dt;
      if (pd.wideT > 0) { pd.wideT -= dt; if (pd.wideT <= 0) pd.w = 84; }
      pd.x = api.clamp(pd.x, pd.w / 2, W - pd.w / 2);
      if (api.pressed('action') || api.pressed('up')) this.launch(api);

      for (const b of this.balls) {
        if (b.stuck) { b.x = pd.x; b.y = PY - 9; continue; }
        const sp = Math.hypot(b.vx, b.vy);
        const n = Math.max(1, Math.ceil(sp * dt / 4));
        for (let i = 0; i < n; i++) this.stepBall(b, dt / n, api);
      }
      const before = this.balls.length;
      this.balls = this.balls.filter(b => b.y < H + 20);
      if (!this.balls.length && before) {
        this.lives--;
        api.hud('ЖИЗНИ', this.lives);
        api.sfx.hurt();
        if (this.lives <= 0) { api.gameOver(`Уровень ${this.level}`); return; }
        pd.w = 84; pd.wideT = 0;
        this.resetBall();
      }

      for (const d of this.drops) {
        d.y += 150 * dt;
        if (d.y + 7 > PY && d.y - 7 < PY + 12 && Math.abs(d.x - pd.x) < pd.w / 2 + 12) {
          d.dead = true;
          this.applyPower(d.type, api);
        }
      }
      this.drops = this.drops.filter(d => !d.dead && d.y < H + 20);

      for (const p of this.particles) { p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 600 * dt; p.t -= dt; }
      this.particles = this.particles.filter(p => p.t > 0);

      if (!this.bricks.length) {
        this.level++;
        api.sfx.levelUp();
        api.addScore(500);
        api.hud('УРОВЕНЬ', this.level);
        this.buildLevel(api);
        this.resetBall();
      }
    },

    stepBall(b, dt, api) {
      const R = 7;
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      if (b.x < R) { b.x = R; b.vx = Math.abs(b.vx); api.sfx.tick(); }
      if (b.x > W - R) { b.x = W - R; b.vx = -Math.abs(b.vx); api.sfx.tick(); }
      if (b.y < R) { b.y = R; b.vy = Math.abs(b.vy); api.sfx.tick(); }

      const pd = this.paddle;
      if (b.vy > 0 && b.y + R >= PY && b.y + R <= PY + 14 && Math.abs(b.x - pd.x) <= pd.w / 2 + R) {
        const off = api.clamp((b.x - pd.x) / (pd.w / 2), -1, 1);
        const sp = Math.min(640, Math.hypot(b.vx, b.vy) + 6);
        const a = -Math.PI / 2 + off * 1.05;
        b.vx = Math.cos(a) * sp;
        b.vy = Math.sin(a) * sp;
        b.y = PY - R;
        api.sfx.bounce(0.8);
      }

      for (const br of this.bricks) {
        const cx = api.clamp(b.x, br.x, br.x + BW), cy = api.clamp(b.y, br.y, br.y + BH);
        const dx = b.x - cx, dy = b.y - cy;
        if (dx * dx + dy * dy > R * R) continue;
        const penX = Math.min(b.x + R - br.x, br.x + BW - (b.x - R));
        const penY = Math.min(b.y + R - br.y, br.y + BH - (b.y - R));
        if (penX < penY) b.vx = b.x < br.x + BW / 2 ? -Math.abs(b.vx) : Math.abs(b.vx);
        else b.vy = b.y < br.y + BH / 2 ? -Math.abs(b.vy) : Math.abs(b.vy);
        this.hitBrick(br, api);
        break;
      }
    },

    hitBrick(br, api) {
      br.hp--;
      if (br.hp > 0) {
        br.color = '#8a8aa0';
        api.sfx.blip(0.6);
        return;
      }
      this.bricks.splice(this.bricks.indexOf(br), 1);
      api.addScore(br.hard ? 50 : (BR - br.r) * 10);
      api.sfx.pop(1.6 - br.r * 0.12);
      for (let i = 0; i < 8; i++) {
        this.particles.push({ x: br.x + BW / 2, y: br.y + BH / 2, vx: (Math.random() - 0.5) * 240, vy: -Math.random() * 200, t: 0.6, color: br.color });
      }
      if (Math.random() < 0.12) this.drops.push({ x: br.x + BW / 2, y: br.y + BH / 2, type: api.pick(Object.keys(POWERS)) });
    },

    applyPower(type, api) {
      api.sfx.powerup();
      api.addScore(50);
      if (type === 'W') { this.paddle.w = 130; this.paddle.wideT = 12; }
      if (type === 'L') { this.lives++; api.hud('ЖИЗНИ', this.lives); }
      if (type === 'S') for (const b of this.balls) { b.vx *= 0.7; b.vy *= 0.7; }
      if (type === 'M') {
        const extra = [];
        for (const b of this.balls) {
          if (b.stuck) continue;
          for (const a of [-0.4, 0.4]) {
            const c = Math.cos(a), s = Math.sin(a);
            extra.push({ x: b.x, y: b.y, vx: b.vx * c - b.vy * s, vy: b.vx * s + b.vy * c, stuck: false });
          }
        }
        this.balls.push(...extra.slice(0, 8));
      }
    },

    draw(ctx, api) {
      const g = ctx.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, '#120b2e');
      g.addColorStop(1, '#05030f');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);

      for (const br of this.bricks) {
        ctx.fillStyle = br.color;
        ctx.beginPath(); ctx.roundRect(br.x, br.y, BW, BH, 4); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.3)';
        ctx.fillRect(br.x + 3, br.y + 2, BW - 6, 4);
      }
      for (const p of this.particles) {
        ctx.globalAlpha = Math.max(0, p.t / 0.6);
        ctx.fillStyle = p.color;
        ctx.fillRect(p.x - 2, p.y - 2, 4, 4);
      }
      ctx.globalAlpha = 1;

      for (const d of this.drops) {
        const pw = POWERS[d.type];
        ctx.fillStyle = pw.color;
        ctx.beginPath(); ctx.roundRect(d.x - 14, d.y - 8, 28, 16, 8); ctx.fill();
        if (d.type === 'L') {
          ctx.fillStyle = '#111';
          ctx.beginPath();
          ctx.moveTo(d.x, d.y + 5);
          ctx.bezierCurveTo(d.x - 9, d.y - 1, d.x - 5, d.y - 8, d.x, d.y - 3);
          ctx.bezierCurveTo(d.x + 5, d.y - 8, d.x + 9, d.y - 1, d.x, d.y + 5);
          ctx.fill();
        } else {
          api.text(pw.label, d.x, d.y + 1, { size: 9, color: '#111' });
        }
      }

      const pd = this.paddle;
      const pg = ctx.createLinearGradient(0, PY, 0, PY + 12);
      pg.addColorStop(0, '#ffffff');
      pg.addColorStop(1, '#7fd8ff');
      ctx.fillStyle = pg;
      ctx.beginPath(); ctx.roundRect(pd.x - pd.w / 2, PY, pd.w, 12, 6); ctx.fill();

      for (const b of this.balls) {
        ctx.fillStyle = '#fff';
        ctx.shadowColor = '#7fd8ff';
        ctx.shadowBlur = 12;
        ctx.beginPath(); ctx.arc(b.x, b.y, 7, 0, Math.PI * 2); ctx.fill();
        ctx.shadowBlur = 0;
      }
      if (this.balls.some(b => b.stuck) && api.state === 'playing') {
        api.text('ПРОБЕЛ / КЛИК — ЗАПУСК', W / 2, 450, { size: 10, color: '#8b8bb8' });
      }
    },
  });
})();
