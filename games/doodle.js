'use strict';

(() => {
  const W = 400, H = 640, PW = 64, PH = 14;
  const GRAV = 1500, JUMP = -730, SPRING = -1180;

  Arcade.register({
    width: W,
    height: H,
    pointerAction: false,

    start(api) {
      this.p = { x: W / 2, y: H - 120, vx: 0, vy: JUMP, face: 1 };
      this.cam = 0;
      this.best = 0;
      this.plats = [{ x: W / 2 - PW / 2, y: H - 80, type: 'normal' }];
      this.topY = H - 80;
      this.parts = [];
      this.falling = false;
      while (this.topY > -H) this.addPlatform(api);
    },

    addPlatform(api) {
      const h = Math.max(0, -this.topY);
      const gap = Math.min(150, 45 + h / 120 + Math.random() * (30 + h / 150));
      const y = this.topY - gap;
      let type = 'normal';
      const r = Math.random();
      if (h > 800 && r < 0.18) type = 'move';
      else if (h > 3000 && r < 0.3) type = 'vanish';
      const pl = { x: Math.random() * (W - PW), y, type, vx: type === 'move' ? (Math.random() < 0.5 ? -1 : 1) * (60 + Math.min(120, h / 60)) : 0 };
      if (type === 'normal' && Math.random() < 0.08) pl.spring = true;
      this.plats.push(pl);
      // ломающиеся — дополнительные, на них нельзя рассчитывать
      if (h > 400 && Math.random() < 0.25) this.plats.push({ x: Math.random() * (W - PW), y: y + gap / 2, type: 'break' });
      this.topY = y;
    },

    update(dt, api) {
      const p = this.p;
      let ax = 0;
      if (api.held('left')) ax = -1;
      if (api.held('right')) ax = 1;
      if (api.pointer.down) ax = api.pointer.x < W / 2 ? -1 : 1;
      if (ax) { p.vx += ax * 2200 * dt; p.face = ax; }
      else p.vx *= Math.pow(0.02, dt);
      p.vx = api.clamp(p.vx, -340, 340);
      p.x += p.vx * dt;
      if (p.x < -20) p.x += W + 40;
      if (p.x > W + 20) p.x -= W + 40;

      const prevFeet = p.y + 18;
      p.vy += GRAV * dt;
      p.y += p.vy * dt;
      const feet = p.y + 18;

      for (const pl of this.plats) {
        if (pl.type === 'move') {
          pl.x += pl.vx * dt;
          if (pl.x < 0 || pl.x > W - PW) pl.vx *= -1;
        }
        if (pl.type === 'break' && pl.broken) { pl.y += 500 * dt; continue; }
        if (this.falling || p.vy <= 0 || pl.gone) continue;
        if (prevFeet <= pl.y && feet >= pl.y && p.x + 14 > pl.x && p.x - 14 < pl.x + PW) {
          if (pl.type === 'break') { pl.broken = true; api.sfx.crack(); continue; }
          p.y = pl.y - 18;
          if (pl.spring && Math.abs(p.x - (pl.x + PW / 2)) < 18) { p.vy = SPRING; api.sfx.bigJump(); pl.sprung = 0.3; }
          else { p.vy = JUMP; api.sfx.jump(1 + Math.random() * 0.1); }
          if (pl.type === 'vanish') { pl.gone = true; this.burst(pl.x + PW / 2, pl.y, '#fff'); }
        }
      }
      for (const pl of this.plats) if (pl.sprung) pl.sprung = Math.max(0, pl.sprung - dt);

      // камера только вверх
      if (p.y < this.cam + H * 0.4) this.cam = p.y - H * 0.4;
      const height = Math.max(0, Math.floor(-this.cam / 10));
      if (height > api.score) api.score = height;

      while (this.topY > this.cam - 100) this.addPlatform(api);
      this.plats = this.plats.filter(pl => pl.y < this.cam + H + 60 && !pl.gone);

      for (const q of this.parts) { q.x += q.vx * dt; q.y += q.vy * dt; q.vy += 800 * dt; q.t -= dt; }
      this.parts = this.parts.filter(q => q.t > 0);

      if (p.y > this.cam + H && !this.falling) {
        this.falling = true;
        api.sound.tone({ freq: 700, freqEnd: 120, dur: 0.8, type: 'triangle', vol: 0.25 });
      }
      if (this.falling) {
        this.cam += 900 * dt;
        if (p.y > this.cam + H + 200 || this.cam > p.y + 400) api.gameOver(`Высота: ${api.score}`);
      }
    },

    burst(x, y, color) {
      for (let i = 0; i < 10; i++) this.parts.push({ x, y, vx: (Math.random() - 0.5) * 200, vy: -Math.random() * 150, t: 0.5, color });
    },

    draw(ctx, api) {
      ctx.fillStyle = '#f8f3e3';
      ctx.fillRect(0, 0, W, H);
      ctx.strokeStyle = 'rgba(120,160,220,0.25)';
      ctx.lineWidth = 1;
      const off = ((-this.cam) % 20 + 20) % 20;
      ctx.beginPath();
      for (let y = off; y < H; y += 20) { ctx.moveTo(0, y); ctx.lineTo(W, y); }
      for (let x = 0; x < W; x += 20) { ctx.moveTo(x, 0); ctx.lineTo(x, H); }
      ctx.stroke();

      ctx.save();
      ctx.translate(0, -this.cam);
      for (const pl of this.plats) {
        const col = { normal: '#6cc04a', move: '#4aa3df', break: '#a0703c', vanish: '#ffffff' }[pl.type];
        ctx.fillStyle = col;
        ctx.strokeStyle = 'rgba(0,0,0,0.35)';
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.roundRect(pl.x, pl.y, PW, PH, 7); ctx.fill(); ctx.stroke();
        if (pl.type === 'break') {
          ctx.beginPath(); ctx.moveTo(pl.x + PW / 2, pl.y); ctx.lineTo(pl.x + PW / 2 - 4, pl.y + PH); ctx.stroke();
        }
        if (pl.spring) {
          const sx = pl.x + PW / 2 - 8, sh = pl.sprung ? 16 : 9;
          ctx.fillStyle = '#999';
          ctx.fillRect(sx, pl.y - sh, 16, sh);
          ctx.fillStyle = '#ccc';
          for (let i = 0; i < 3; i++) ctx.fillRect(sx, pl.y - sh + i * (sh / 3), 16, 2);
        }
      }
      for (const q of this.parts) { ctx.fillStyle = '#999'; ctx.fillRect(q.x, q.y, 4, 4); }

      const p = this.p;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.scale(p.face, 1);
      ctx.fillStyle = '#c8e05a';
      ctx.strokeStyle = '#4a5a10';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.roundRect(-14, -16, 28, 28, [14, 14, 4, 4]); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#8fae2a';
      ctx.fillRect(-14, 2, 28, 4);
      ctx.fillStyle = '#c8e05a';
      ctx.beginPath(); ctx.roundRect(10, -10, 14, 10, 3); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#111';
      ctx.beginPath(); ctx.arc(4, -8, 2.5, 0, Math.PI * 2); ctx.arc(10, -8, 2.5, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#4a5a10';
      for (const lx of [-9, -2, 5]) { ctx.beginPath(); ctx.moveTo(lx, 12); ctx.lineTo(lx, 18); ctx.lineTo(lx + 4, 18); ctx.stroke(); }
      ctx.restore();
      ctx.restore();

      api.text(String(api.score), 14, 24, { size: 16, align: 'left', color: '#333' });
    },
  });
})();
