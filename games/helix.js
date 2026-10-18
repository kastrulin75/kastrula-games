'use strict';

(() => {
  const W = 400, H = 640, CX = W / 2;
  const SECT = 12, STEP = Math.PI * 2 / SECT, SPACING = 130;
  const R_OUT = 150, R_IN = 44, SQ = 0.36, THICK = 16, PILLAR = 34, BALL_R = 11;
  const RB = (R_IN + R_OUT) / 2;
  const TAU = Math.PI * 2;
  const norm = a => ((a % TAU) + TAU) % TAU;

  Arcade.register({
    width: W,
    height: H,
    pointerAction: false,

    start(api) {
      this.level = 1;
      this.build(api);
      api.hud('УРОВЕНЬ', this.level);
    },

    build(api) {
      const n = 12 + this.level * 3;
      this.rings = [];
      for (let i = 0; i < n; i++) {
        const s = Array(SECT).fill('solid');
        if (i === n - 1) {
          this.rings.push({ y: 200 + i * SPACING, s: s.fill('finish'), splats: [] });
          continue;
        }
        const gStart = api.randInt(0, SECT - 1), gLen = api.randInt(2, 3);
        for (let k = 0; k < gLen; k++) s[(gStart + k) % SECT] = 'gap';
        if (i >= 2) {
          const reds = Math.min(5, Math.floor((i + this.level * 2) / 6));
          for (let k = 0; k < reds; k++) {
            const j = api.randInt(0, SECT - 1);
            if (s[j] === 'solid' && s.filter(v => v === 'solid').length > 3) s[j] = 'red';
          }
        }
        this.rings.push({ y: 200 + i * SPACING, s, splats: [] });
      }
      this.rot = -(Math.PI / 2) + STEP * 6;
      this.ball = { y: 120, vy: 0 };
      this.cam = this.ball.y - 220;
      this.streak = 0;
      this.parts = [];
      this.squash = 0;
      this.done = 0;
    },

    sectorAt(ring) {
      const a = norm(Math.PI / 2 - this.rot);
      return Math.floor(a / STEP) % SECT;
    },

    onPointer(type, x, y, b) {
      if (type === 'down') this.dragX = x;
      else if (type === 'move' && this.dragX != null && b) { this.rot += (x - this.dragX) * 0.013; this.dragX = x; }
      else if (type === 'up') this.dragX = null;
    },

    update(dt, api) {
      if (api.held('left')) this.rot -= 3.4 * dt;
      if (api.held('right')) this.rot += 3.4 * dt;
      if (!api.pointer.down) this.dragX = null;

      for (const p of this.parts) { p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 900 * dt; p.t -= dt; }
      this.parts = this.parts.filter(p => p.t > 0);
      this.squash = Math.max(0, this.squash - dt * 5);

      if (this.done) {
        this.done -= dt;
        if (this.done <= 0) {
          this.level++;
          api.hud('УРОВЕНЬ', this.level);
          this.build(api);
        }
        return;
      }

      const b = this.ball;
      const prev = b.y;
      b.vy = Math.min(900, b.vy + 1700 * dt);
      b.y += b.vy * dt;
      for (const ring of this.rings) {
        if (ring.broken || prev > ring.y || b.y < ring.y) continue;
        const k = this.sectorAt(ring);
        const type = ring.s[k];
        if (type === 'gap') {
          this.streak++;
          api.addScore(this.streak * this.level);
          api.sfx.pop(0.9 + Math.min(this.streak, 8) * 0.12);
          continue;
        }
        if (type === 'finish') {
          b.y = ring.y; b.vy = 0;
          this.done = 1.2;
          api.addScore(50 * this.level);
          api.sfx.levelUp();
          return;
        }
        if (this.streak >= 3) {
          ring.broken = true;
          api.addScore(10 * this.level);
          api.sfx.explode(0.4);
          this.shatter(ring);
          this.streak = 0;
          b.y = ring.y; b.vy = -620;
          return;
        }
        if (type === 'red') {
          api.sfx.hurt();
          this.shatter(ring, true);
          api.gameOver(`Уровень ${this.level}`);
          return;
        }
        b.y = ring.y;
        b.vy = -620;
        this.streak = 0;
        this.squash = 1;
        ring.splats.push(norm(Math.PI / 2 - this.rot) + (Math.random() - 0.5) * 0.15);
        if (ring.splats.length > 5) ring.splats.shift();
        api.sfx.bounce(0.7);
        break;
      }
      const target = b.y - 220;
      if (target > this.cam) this.cam += (target - this.cam) * Math.min(1, dt * 8);
    },

    shatter(ring, small) {
      for (let i = 0; i < (small ? 12 : 40); i++) {
        const a = Math.random() * TAU, r = R_IN + Math.random() * (R_OUT - R_IN);
        this.parts.push({
          x: CX + Math.cos(a) * r, y: ring.y + Math.sin(a) * r * SQ,
          vx: Math.cos(a) * 200, vy: -100 - Math.random() * 200, t: 0.8, color: this.hue(),
        });
      }
    },

    hue() { return `hsl(${(this.level * 47) % 360}, 75%, 58%)`; },

    drawSector(ctx, sy, a0, a1, color, side) {
      const n = 6;
      ctx.fillStyle = color;
      ctx.beginPath();
      for (let i = 0; i <= n; i++) { const a = a0 + (a1 - a0) * i / n; ctx.lineTo(CX + Math.cos(a) * R_OUT, sy + Math.sin(a) * R_OUT * SQ); }
      for (let i = n; i >= 0; i--) { const a = a0 + (a1 - a0) * i / n; ctx.lineTo(CX + Math.cos(a) * R_IN, sy + Math.sin(a) * R_IN * SQ); }
      ctx.closePath();
      ctx.fill();
      if (side) {
        ctx.fillStyle = side;
        ctx.beginPath();
        for (let i = 0; i <= n; i++) { const a = a0 + (a1 - a0) * i / n; ctx.lineTo(CX + Math.cos(a) * R_OUT, sy + Math.sin(a) * R_OUT * SQ); }
        for (let i = n; i >= 0; i--) { const a = a0 + (a1 - a0) * i / n; ctx.lineTo(CX + Math.cos(a) * R_OUT, sy + Math.sin(a) * R_OUT * SQ + THICK); }
        ctx.closePath();
        ctx.fill();
      }
    },

    drawRing(ctx, ring, sy) {
      const base = this.hue();
      const colors = { solid: [base, `hsl(${(this.level * 47) % 360}, 60%, 38%)`], red: ['#ff2d2d', '#a01010'], finish: ['#ffffff', '#b0b0c0'] };
      const items = [];
      for (let k = 0; k < SECT; k++) {
        const t = ring.s[k];
        if (t === 'gap') continue;
        const a0 = this.rot + k * STEP, a1 = a0 + STEP;
        items.push({ t, a0, a1, front: Math.sin((a0 + a1) / 2) > 0 });
      }
      for (const it of items) if (!it.front) this.drawSector(ctx, sy, it.a0, it.a1, colors[it.t][0], null);
      ctx.fillStyle = '#e8e8f0';
      ctx.fillRect(CX - PILLAR, sy - SPACING, PILLAR * 2, SPACING);
      for (const it of items) if (it.front) this.drawSector(ctx, sy, it.a0, it.a1, colors[it.t][0], colors[it.t][1]);
      ctx.fillStyle = 'rgba(255,240,80,0.85)';
      for (const s of ring.splats) {
        const a = s + this.rot;
        if (ring.s[Math.floor(norm(s) / STEP) % SECT] === 'gap') continue;
        ctx.beginPath();
        ctx.ellipse(CX + Math.cos(a) * RB, sy + Math.sin(a) * RB * SQ, 12, 5, 0, 0, TAU);
        ctx.fill();
      }
    },

    draw(ctx, api) {
      const g = ctx.createLinearGradient(0, 0, 0, H);
      const h = (this.level * 47 + 180) % 360;
      g.addColorStop(0, `hsl(${h}, 45%, 22%)`);
      g.addColorStop(1, `hsl(${h}, 45%, 10%)`);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);

      const b = this.ball;
      const visible = this.rings.filter(r => !r.broken && r.y - this.cam > -100 && r.y - this.cam < H + 200);
      const below = visible.filter(r => r.y >= b.y).sort((x, y) => y.y - x.y);
      const above = visible.filter(r => r.y < b.y).sort((x, y) => y.y - x.y);
      ctx.fillStyle = '#e8e8f0';
      const lowest = visible.length ? Math.max(...visible.map(r => r.y)) - this.cam : H;
      ctx.fillRect(CX - PILLAR, lowest, PILLAR * 2, H);
      for (const r of below) this.drawRing(ctx, r, r.y - this.cam);

      const by = b.y - this.cam + RB * SQ - BALL_R;
      const sq = this.squash * 0.3;
      ctx.fillStyle = '#ffe94a';
      ctx.beginPath();
      ctx.ellipse(CX, by + sq * BALL_R, BALL_R * (1 + sq), BALL_R * (1 - sq), 0, 0, TAU);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.6)';
      ctx.beginPath(); ctx.arc(CX - 4, by - 4, 3, 0, TAU); ctx.fill();

      for (const r of above) this.drawRing(ctx, r, r.y - this.cam);

      for (const p of this.parts) {
        ctx.globalAlpha = Math.min(1, p.t * 2);
        ctx.fillStyle = p.color;
        ctx.fillRect(p.x - 3, p.y - this.cam - 3, 6, 6);
      }
      ctx.globalAlpha = 1;

      // прогресс уровня
      const last = this.rings[this.rings.length - 1].y;
      const prog = Math.max(0, Math.min(1, (b.y - 120) / (last - 120)));
      ctx.fillStyle = 'rgba(255,255,255,0.2)';
      ctx.beginPath(); ctx.roundRect(80, 18, W - 160, 10, 5); ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.roundRect(80, 18, (W - 160) * prog, 10, 5); ctx.fill();
      api.text(String(this.level), 62, 24, { size: 11 });
      api.text(String(this.level + 1), W - 62, 24, { size: 11 });
      if (this.streak >= 3) {
        // огонёк над мячом при серии падений
        const fy = by - 18, flick = Math.sin(performance.now() / 60) * 2;
        ctx.fillStyle = '#ff7a1a';
        ctx.beginPath();
        ctx.moveTo(CX, fy - 16 - flick);
        ctx.quadraticCurveTo(CX + 11, fy - 4, CX + 6, fy + 4);
        ctx.quadraticCurveTo(CX, fy + 8, CX - 6, fy + 4);
        ctx.quadraticCurveTo(CX - 11, fy - 4, CX, fy - 16 - flick);
        ctx.fill();
        ctx.fillStyle = '#ffe94a';
        ctx.beginPath();
        ctx.moveTo(CX, fy - 7 - flick / 2);
        ctx.quadraticCurveTo(CX + 5, fy, CX + 3, fy + 4);
        ctx.quadraticCurveTo(CX, fy + 6, CX - 3, fy + 4);
        ctx.quadraticCurveTo(CX - 5, fy, CX, fy - 7 - flick / 2);
        ctx.fill();
      }
    },
  });
})();
