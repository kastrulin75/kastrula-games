'use strict';

(() => {
  const W = 640, H = 480, STEP = 16;
  const GRAV = 26, THRUST = 72;

  Arcade.register({
    width: W,
    height: H,
    pointerAction: false,

    start(api) {
      this.lives = 3;
      this.fuel = 900;
      this.landings = 0;
      this.stars = Array.from({ length: 80 }, () => [Math.random() * W, Math.random() * 300, Math.random()]);
      this.newRound(api);
      api.hud('ЖИЗНИ', this.lives);
      api.hud('ТОПЛИВО', Math.ceil(this.fuel));
    },

    newRound(api) {
      const pts = [];
      let y = 380;
      for (let x = 0; x <= W; x += STEP) {
        y = api.clamp(y + api.rand(-28, 28), 250, 455);
        pts.push({ x, y });
      }
      this.pads = [];
      const specs = [{ w: 5, mult: 2 }, { w: 3, mult: 3 }, { w: 2, mult: 5 }];
      const used = new Set();
      for (const s of specs) {
        let i, tries = 0;
        do { i = api.randInt(2, pts.length - s.w - 3); tries++; } while (tries < 50 && [...Array(s.w + 4).keys()].some(k => used.has(i - 2 + k)));
        const py = pts[i].y;
        for (let k = 0; k <= s.w; k++) { pts[i + k].y = py; used.add(i + k); }
        this.pads.push({ x1: pts[i].x, x2: pts[i + s.w].x, y: py, mult: s.mult });
      }
      this.terrain = pts;
      this.l = { x: api.rand(60, W - 60), y: 50, vx: api.rand(-40, 40), vy: 0, a: 0, thrust: false };
      this.state = 'fly';
      this.t = 0;
      this.parts = [];
      this.lowBeep = 0;
    },

    groundY(x) {
      const pts = this.terrain;
      const i = Math.max(0, Math.min(pts.length - 2, Math.floor(x / STEP)));
      const a = pts[i], b = pts[i + 1];
      return a.y + (b.y - a.y) * ((x - a.x) / (b.x - a.x));
    },

    update(dt, api) {
      const l = this.l;
      for (const p of this.parts) { p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 60 * dt; p.t -= dt; }
      this.parts = this.parts.filter(p => p.t > 0);

      if (this.state !== 'fly') {
        api.sound.loop('thrust', null);
        this.t -= dt;
        if (this.t <= 0) {
          if (this.state === 'crash' && (this.lives <= 0 || this.fuel <= 0)) { api.gameOver(`Посадок: ${this.landings}`); return; }
          this.newRound(api);
        }
        return;
      }

      if (api.held('left')) l.a -= 2.2 * dt;
      if (api.held('right')) l.a += 2.2 * dt;
      l.a = api.clamp(l.a, -Math.PI / 2, Math.PI / 2);
      l.thrust = (api.held('up') || api.held('action')) && this.fuel > 0;
      if (l.thrust) {
        l.vx += Math.sin(l.a) * THRUST * dt;
        l.vy -= Math.cos(l.a) * THRUST * dt;
        this.fuel = Math.max(0, this.fuel - 45 * dt);
        if (Math.random() < 0.6) {
          this.parts.push({ x: l.x - Math.sin(l.a) * 14, y: l.y + Math.cos(l.a) * 14, vx: -Math.sin(l.a) * 120 + api.rand(-20, 20), vy: Math.cos(l.a) * 120, t: 0.4, c: '#ffb347' });
        }
      }
      api.sound.loop('thrust', l.thrust ? { noise: true, freq: 500, vol: 0.2 } : null);
      api.hud('ТОПЛИВО', Math.ceil(this.fuel));
      if (this.fuel < 150 && this.fuel > 0) {
        this.lowBeep -= dt;
        if (this.lowBeep <= 0) { this.lowBeep = 0.6; api.sound.tone({ freq: 1200, dur: 0.08, vol: 0.08 }); }
      }

      l.vy += GRAV * dt;
      l.x += l.vx * dt;
      l.y += l.vy * dt;
      if (l.x < 0) l.x += W;
      if (l.x > W) l.x -= W;
      if (l.y < 10) { l.y = 10; l.vy = Math.max(0, l.vy); }

      const feet = [l.x - 11, l.x + 11];
      const touch = feet.some(fx => l.y + 13 >= this.groundY(fx)) || l.y + 6 >= this.groundY(l.x);
      if (touch) {
        const pad = this.pads.find(p => feet[0] >= p.x1 && feet[1] <= p.x2);
        const soft = Math.abs(l.vy) < 34 && Math.abs(l.vx) < 22 && Math.abs(l.a) < 0.22;
        if (pad && soft) {
          this.state = 'land';
          this.t = 2.2;
          l.y = pad.y - 13; l.a = 0;
          const pts = 50 * pad.mult + Math.floor(this.fuel / 20);
          api.addScore(pts);
          this.landings++;
          this.fuel += 120;
          this.msg = `ПОСАДКА! +${pts}`;
          api.sound.melody([523, 659, 784, 1047], 0.1, { vol: 0.13 });
        } else {
          this.state = 'crash';
          this.t = 2.2;
          this.lives--;
          api.hud('ЖИЗНИ', this.lives);
          this.msg = pad ? 'СЛИШКОМ БЫСТРО' : 'КРУШЕНИЕ';
          api.sfx.explode(1.3);
          for (let i = 0; i < 40; i++) {
            const a = Math.random() * Math.PI * 2, s = Math.random() * 160;
            this.parts.push({ x: l.x, y: l.y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 60, t: 1.2, c: i % 2 ? '#fff' : '#ff8c42' });
          }
        }
      }
    },

    draw(ctx, api) {
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, W, H);
      for (const [x, y, b] of this.stars) { ctx.fillStyle = `rgba(255,255,255,${0.3 + b * 0.7})`; ctx.fillRect(x, y, 1.5, 1.5); }

      ctx.fillStyle = '#1c1c28';
      ctx.strokeStyle = '#e2e8f0';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(0, H);
      for (const p of this.terrain) ctx.lineTo(p.x, p.y);
      ctx.lineTo(W, H);
      ctx.closePath();
      ctx.fill();
      ctx.beginPath();
      this.terrain.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
      ctx.stroke();
      for (const p of this.pads) {
        ctx.strokeStyle = '#3ddc84';
        ctx.lineWidth = 4;
        ctx.beginPath(); ctx.moveTo(p.x1, p.y); ctx.lineTo(p.x2, p.y); ctx.stroke();
        api.text(`×${p.mult}`, (p.x1 + p.x2) / 2, p.y + 14, { size: 9, color: '#3ddc84' });
      }

      for (const p of this.parts) {
        ctx.globalAlpha = Math.min(1, p.t * 2);
        ctx.fillStyle = p.c;
        ctx.fillRect(p.x - 1.5, p.y - 1.5, 3, 3);
      }
      ctx.globalAlpha = 1;

      const l = this.l;
      if (this.state !== 'crash') {
        ctx.save();
        ctx.translate(l.x, l.y);
        ctx.rotate(l.a);
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 1.5;
        ctx.fillStyle = '#c0c6d0';
        ctx.beginPath(); ctx.arc(0, -4, 8, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#7f8794';
        ctx.fillRect(-9, 3, 18, 6); ctx.strokeRect(-9, 3, 18, 6);
        ctx.beginPath(); ctx.moveTo(-7, 9); ctx.lineTo(-12, 15); ctx.moveTo(7, 9); ctx.lineTo(12, 15);
        ctx.moveTo(-15, 15); ctx.lineTo(-9, 15); ctx.moveTo(9, 15); ctx.lineTo(15, 15); ctx.stroke();
        ctx.fillStyle = '#3ec5ff';
        ctx.beginPath(); ctx.arc(0, -5, 3.5, 0, Math.PI * 2); ctx.fill();
        if (l.thrust) {
          ctx.fillStyle = Math.random() < 0.5 ? '#ffb347' : '#ffe94a';
          ctx.beginPath(); ctx.moveTo(-4, 10); ctx.lineTo(0, 20 + Math.random() * 10); ctx.lineTo(4, 10); ctx.closePath(); ctx.fill();
        }
        ctx.restore();
      }

      const okV = Math.abs(l.vy) < 34, okH = Math.abs(l.vx) < 22, okA = Math.abs(l.a) < 0.22;
      const alt = Math.max(0, Math.round(this.groundY(l.x) - l.y - 13));
      api.text(`ВЕРТ ${Math.round(l.vy)}`, 14, 20, { size: 9, align: 'left', color: okV ? '#3ddc84' : '#ff4d6d' });
      api.text(`ГОР  ${Math.round(l.vx)}`, 14, 36, { size: 9, align: 'left', color: okH ? '#3ddc84' : '#ff4d6d' });
      api.text(`УГОЛ ${Math.round(l.a * 57)}°`, 14, 52, { size: 9, align: 'left', color: okA ? '#3ddc84' : '#ff4d6d' });
      api.text(`ВЫС  ${alt}`, 14, 68, { size: 9, align: 'left', color: '#e2e8f0' });
      ctx.fillStyle = '#333';
      ctx.fillRect(W - 130, 14, 110, 10);
      ctx.fillStyle = this.fuel < 150 ? '#ff4d6d' : '#ffd23f';
      ctx.fillRect(W - 130, 14, 110 * Math.min(1, this.fuel / 900), 10);
      api.text('ТОПЛИВО', W - 75, 34, { size: 7, color: '#8b8bb8' });
      if (this.state !== 'fly') api.text(this.msg, W / 2, 140, { size: 16, color: this.state === 'land' ? '#3ddc84' : '#ff4d6d' });
    },
  });
})();
