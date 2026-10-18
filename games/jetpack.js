'use strict';

(() => {
  const W = 640, H = 400, FLOOR = 352, CEIL = 36, PX = 130;

  const segDist = (px, py, ax, ay, bx, by) => {
    const dx = bx - ax, dy = by - ay;
    const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy || 1)));
    return Math.hypot(px - ax - dx * t, py - ay - dy * t);
  };

  Arcade.register({
    width: W,
    height: H,

    start(api) {
      this.p = { y: FLOOR - 20, vy: 0, dead: 0, run: 0 };
      this.speed = 260;
      this.dist = 0;
      this.coins = 0;
      this.obs = [];
      this.coinList = [];
      this.missiles = [];
      this.parts = [];
      this.nextObs = 500;
      this.scroll = 0;
      api.hud('МОНЕТЫ', 0);
    },

    spawn(api) {
      const roll = Math.random();
      const x = W + 60;
      if (roll < 0.45) {
        const len = api.rand(90, 170);
        const kind = api.pick(['h', 'v', 'd', 'd', 'rot']);
        const a = { h: 0, v: Math.PI / 2, d: api.pick([Math.PI / 4, -Math.PI / 4]), rot: 0 }[kind];
        const cy = api.rand(CEIL + len / 2 * Math.abs(Math.sin(a)) + 14, FLOOR - len / 2 * Math.abs(Math.sin(a)) - 14);
        this.obs.push({ x, y: kind === 'rot' ? api.rand(CEIL + 90, FLOOR - 90) : cy, len, a, va: kind === 'rot' ? api.rand(1.2, 2) * (Math.random() < 0.5 ? 1 : -1) : 0 });
        this.nextObs = this.dist + api.rand(260, 420);
      } else if (roll < 0.7 && this.dist > 800) {
        this.missiles.push({ warn: 1.4, y: this.p.y, x: W + 40, launched: false });
        this.nextObs = this.dist + api.rand(200, 320);
      } else {
        const y0 = api.rand(CEIL + 40, FLOOR - 60);
        const shape = api.pick(['line', 'wave', 'block']);
        for (let i = 0; i < 10; i++) {
          if (shape === 'line') this.coinList.push({ x: x + i * 26, y: y0 });
          if (shape === 'wave') this.coinList.push({ x: x + i * 26, y: y0 + Math.sin(i * 0.7) * 34 });
          if (shape === 'block') this.coinList.push({ x: x + (i % 5) * 26, y: y0 + Math.floor(i / 5) * 26 });
        }
        this.nextObs = this.dist + api.rand(200, 320);
      }
    },

    update(dt, api) {
      const p = this.p;
      for (const q of this.parts) { q.x += q.vx * dt; q.y += q.vy * dt; q.t -= dt; }
      this.parts = this.parts.filter(q => q.t > 0);

      if (p.dead) {
        api.sound.loop('jet', null);
        p.vy += 1500 * dt;
        p.y = Math.min(FLOOR - 20, p.y + p.vy * dt);
        this.speed = Math.max(0, this.speed - 500 * dt);
        this.scroll += this.speed * dt;
        p.dead -= dt;
        if (p.dead <= 0) api.gameOver(`${Math.floor(this.dist / 10)} м · монет: ${this.coins}`, { quiet: true });
        return;
      }

      const thrust = api.held('action') || api.held('up');
      if (thrust) {
        p.vy -= 2000 * dt;
        if (Math.random() < 0.8) this.parts.push({ x: PX - 14, y: p.y + 14, vx: -60 - Math.random() * 60, vy: 220 + Math.random() * 80, t: 0.25, c: Math.random() < 0.5 ? '#ffb347' : '#ffe94a' });
      } else p.vy += 1500 * dt;
      p.vy = api.clamp(p.vy, -430, 620);
      p.y += p.vy * dt;
      if (p.y > FLOOR - 20) { p.y = FLOOR - 20; p.vy = 0; }
      if (p.y < CEIL + 20) { p.y = CEIL + 20; p.vy = Math.max(0, p.vy); }
      api.sound.loop('jet', thrust ? { noise: true, freq: 1100, vol: 0.13 } : null);
      const onFloor = p.y >= FLOOR - 20;
      if (onFloor) {
        const prev = Math.floor(p.run * 8);
        p.run += dt;
        if (Math.floor(p.run * 8) !== prev && prev % 2 === 0) api.sfx.step();
      }

      this.speed = Math.min(620, this.speed + 6 * dt);
      const dx = this.speed * dt;
      this.dist += dx;
      this.scroll += dx;
      api.score = Math.floor(this.dist / 10) + this.coins * 5;
      if (this.dist >= this.nextObs) this.spawn(api);

      for (const o of this.obs) { o.x -= dx; o.a += o.va * dt; }
      this.obs = this.obs.filter(o => o.x > -200);
      for (const c of this.coinList) {
        c.x -= dx;
        if (!c.taken && Math.hypot(c.x - PX, c.y - p.y) < 22) {
          c.taken = true;
          this.coins++;
          api.hud('МОНЕТЫ', this.coins);
          api.sound.tone({ freq: 1320 + (this.coins % 5) * 80, dur: 0.06, type: 'square', vol: 0.08 });
        }
      }
      this.coinList = this.coinList.filter(c => c.x > -20 && !c.taken);

      for (const m of this.missiles) {
        if (!m.launched) {
          m.warn -= dt;
          if (m.warn > 0.5) m.y += api.clamp(p.y - m.y, -200 * dt, 200 * dt);
          if (Math.floor(m.warn * 6) !== Math.floor((m.warn + dt) * 6)) api.sfx.blip(1.5);
          if (m.warn <= 0) { m.launched = true; api.sfx.whoosh(); }
        } else {
          m.x -= (this.speed + 520) * dt;
        }
      }
      this.missiles = this.missiles.filter(m => m.x > -80);

      // столкновения
      for (const o of this.obs) {
        const ax = o.x - Math.cos(o.a) * o.len / 2, ay = o.y - Math.sin(o.a) * o.len / 2;
        const bx = o.x + Math.cos(o.a) * o.len / 2, by = o.y + Math.sin(o.a) * o.len / 2;
        if (segDist(PX, p.y, ax, ay, bx, by) < 20) { this.die(api, true); return; }
      }
      for (const m of this.missiles) {
        if (m.launched && Math.abs(m.x - PX) < 26 && Math.abs(m.y - p.y) < 18) { this.die(api, false); return; }
      }
    },

    die(api, zap) {
      this.p.dead = 1.3;
      this.p.vy = -200;
      if (zap) api.sfx.zap(); else api.sfx.explode(0.8);
      api.sfx.hurt();
      for (let i = 0; i < 24; i++) {
        const a = Math.random() * Math.PI * 2;
        this.parts.push({ x: PX, y: this.p.y, vx: Math.cos(a) * 200, vy: Math.sin(a) * 200, t: 0.6, c: zap ? '#9ad0ff' : '#ff8c42' });
      }
    },

    draw(ctx, api) {
      ctx.fillStyle = '#20263a';
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = '#2a3150';
      const off = -(this.scroll * 0.4) % 160;
      for (let x = off; x < W; x += 160) {
        ctx.fillRect(x + 10, CEIL + 20, 140, FLOOR - CEIL - 60);
        ctx.fillStyle = '#323a5e';
        ctx.fillRect(x + 20, CEIL + 34, 120, 8);
        ctx.fillStyle = '#2a3150';
      }
      ctx.fillStyle = '#3a3f55';
      ctx.fillRect(0, FLOOR, W, H - FLOOR);
      ctx.fillRect(0, 0, W, CEIL);
      ctx.fillStyle = '#ffd23f';
      for (let x = -(this.scroll % 60); x < W; x += 60) { ctx.fillRect(x, FLOOR, 30, 5); ctx.fillRect(x + 30, CEIL - 5, 30, 5); }

      for (const c of this.coinList) {
        ctx.fillStyle = '#ffd23f';
        ctx.beginPath(); ctx.ellipse(c.x, c.y, 9 * Math.abs(Math.cos(this.scroll / 40 + c.x / 50)) + 2, 9, 0, 0, Math.PI * 2); ctx.fill();
      }

      for (const o of this.obs) {
        const ax = o.x - Math.cos(o.a) * o.len / 2, ay = o.y - Math.sin(o.a) * o.len / 2;
        const bx = o.x + Math.cos(o.a) * o.len / 2, by = o.y + Math.sin(o.a) * o.len / 2;
        ctx.strokeStyle = 'rgba(150,210,255,0.35)';
        ctx.lineWidth = 12;
        ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke();
        ctx.strokeStyle = '#e6f6ff';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(ax, ay);
        for (let i = 1; i < 10; i++) {
          const t = i / 10, j = (Math.random() - 0.5) * 8;
          ctx.lineTo(ax + (bx - ax) * t - Math.sin(o.a) * j, ay + (by - ay) * t + Math.cos(o.a) * j);
        }
        ctx.lineTo(bx, by);
        ctx.stroke();
        for (const [x, y] of [[ax, ay], [bx, by]]) {
          ctx.fillStyle = '#ffd23f';
          ctx.beginPath(); ctx.arc(x, y, 9, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = '#7a5a10';
          ctx.beginPath(); ctx.arc(x, y, 4, 0, Math.PI * 2); ctx.fill();
        }
      }

      for (const m of this.missiles) {
        if (!m.launched) {
          if (Math.floor(m.warn * 8) % 2) {
            ctx.fillStyle = '#ff3b3b';
            ctx.beginPath(); ctx.moveTo(W - 14, m.y - 14); ctx.lineTo(W - 2, m.y + 10); ctx.lineTo(W - 26, m.y + 10); ctx.closePath(); ctx.fill();
            api.text('!', W - 14, m.y + 3, { size: 12, color: '#fff' });
          }
        } else {
          ctx.fillStyle = '#d0d4dc';
          ctx.beginPath(); ctx.moveTo(m.x - 22, m.y); ctx.lineTo(m.x - 10, m.y - 7); ctx.lineTo(m.x + 16, m.y - 7); ctx.lineTo(m.x + 16, m.y + 7); ctx.lineTo(m.x - 10, m.y + 7); ctx.closePath(); ctx.fill();
          ctx.fillStyle = '#ff3b3b';
          ctx.fillRect(m.x + 8, m.y - 10, 8, 20);
          ctx.fillStyle = Math.random() < 0.5 ? '#ffb347' : '#ffe94a';
          ctx.beginPath(); ctx.moveTo(m.x + 16, m.y - 5); ctx.lineTo(m.x + 34 + Math.random() * 10, m.y); ctx.lineTo(m.x + 16, m.y + 5); ctx.fill();
        }
      }

      for (const q of this.parts) {
        ctx.globalAlpha = Math.min(1, q.t * 4);
        ctx.fillStyle = q.c;
        ctx.fillRect(q.x - 2, q.y - 2, 4, 4);
      }
      ctx.globalAlpha = 1;

      const p = this.p;
      ctx.save();
      ctx.translate(PX, p.y);
      if (p.dead) ctx.rotate((1.3 - p.dead) * 6);
      ctx.fillStyle = '#7f8794';
      ctx.fillRect(-18, -12, 9, 24);
      ctx.fillStyle = '#f6ad55';
      ctx.beginPath(); ctx.roundRect(-10, -14, 20, 26, 6); ctx.fill();
      ctx.fillStyle = '#ffd1a8';
      ctx.beginPath(); ctx.arc(0, -20, 9, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#4a2a10';
      ctx.beginPath(); ctx.arc(0, -23, 9, Math.PI, 0); ctx.fill();
      ctx.fillStyle = '#111';
      ctx.fillRect(3, -21, 2, 3);
      ctx.fillStyle = '#3e5bff';
      const leg = p.y >= FLOOR - 20 && !p.dead ? Math.sin(p.run * 20) * 5 : 0;
      ctx.fillRect(-7 + leg, 12, 6, 9); ctx.fillRect(1 - leg, 12, 6, 9);
      ctx.restore();

      api.text(`${Math.floor(this.dist / 10)} м`, 16, 22, { size: 12, align: 'left' });
    },
  });
})();
