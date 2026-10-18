'use strict';

(() => {
  const W = 480, H = 640, PY = 590;
  const SX = 36, SY = 34, OX = (W - 9 * SX) / 2, OY = 90;
  const TYPES = {
    boss: { hp: 2, pts: 150, dive: 400 },
    fly: { hp: 1, pts: 80, dive: 160 },
    bee: { hp: 1, pts: 50, dive: 100 },
  };

  const bez = (p, t) => {
    const u = 1 - t;
    return {
      x: u * u * u * p[0].x + 3 * u * u * t * p[1].x + 3 * u * t * t * p[2].x + t * t * t * p[3].x,
      y: u * u * u * p[0].y + 3 * u * u * t * p[1].y + 3 * u * t * t * p[2].y + t * t * t * p[3].y,
    };
  };

  Arcade.register({
    width: W,
    height: H,
    pointerAction: false,

    start(api) {
      this.stage = 0;
      this.lives = 3;
      this.player = { x: W / 2, dead: 0, cool: 0 };
      this.stars = Array.from({ length: 70 }, () => ({ x: Math.random() * W, y: Math.random() * H, s: 20 + Math.random() * 80, c: api.pick(['#fff', '#ff5d73', '#3ec5ff', '#ffd23f']) }));
      this.parts = [];
      this.nextStage(api);
      api.hud('ЖИЗНИ', this.lives);
    },

    nextStage(api) {
      this.stage++;
      api.hud('ВОЛНА', this.stage);
      this.enemies = [];
      this.shots = [];
      this.bombs = [];
      this.t = 0;
      this.diveT = 4;
      const slots = [];
      for (let c = 3; c <= 6; c++) slots.push({ type: 'boss', c, r: 0 });
      for (let r = 1; r <= 2; r++) for (let c = 1; c <= 8; c++) slots.push({ type: 'fly', c, r });
      for (let r = 3; r <= 4; r++) for (let c = 0; c <= 9; c++) slots.push({ type: 'bee', c, r });
      api.shuffle(slots);
      slots.forEach((s, i) => {
        const group = Math.floor(i / 8);
        const side = group % 2 ? 1 : -1;
        this.enemies.push({
          ...s, hp: TYPES[s.type].hp, state: 'wait', delay: group * 1.4 + (i % 8) * 0.13,
          x: side < 0 ? -30 : W + 30, y: 200 + (group % 3) * 60, side, t: 0, dur: 2.2,
        });
      });
      this.stageTitle = 2;
      if (this.stage > 1) api.sfx.levelUp();
    },

    slot(e) {
      return { x: OX + e.c * SX + Math.sin(this.t * 0.9) * 22, y: OY + e.r * SY };
    },

    update(dt, api) {
      this.t += dt;
      this.stageTitle = Math.max(0, this.stageTitle - dt);
      for (const s of this.stars) { s.y += s.s * dt; if (s.y > H) { s.y = 0; s.x = Math.random() * W; } }
      for (const p of this.parts) { p.x += p.vx * dt; p.y += p.vy * dt; p.t -= dt; }
      this.parts = this.parts.filter(p => p.t > 0);

      const pl = this.player;
      if (pl.dead > 0) {
        pl.dead -= dt;
        if (pl.dead <= 0) {
          if (this.lives <= 0) { api.gameOver(`Волна ${this.stage}`); return; }
          pl.x = W / 2;
          pl.inv = 2;
        }
      } else {
        pl.inv = Math.max(0, (pl.inv || 0) - dt);
        if (api.held('left')) pl.x -= 260 * dt;
        if (api.held('right')) pl.x += 260 * dt;
        pl.x = api.clamp(pl.x, 20, W - 20);
        pl.cool -= dt;
        if ((api.pressed('action') || (api.held('action') && pl.cool <= -0.25)) && this.shots.length < 2 && pl.cool <= 0) {
          this.shots.push({ x: pl.x, y: PY - 16 });
          pl.cool = 0.12;
          api.sound.tone({ freq: 1400, freqEnd: 500, dur: 0.08, vol: 0.09 });
        }
      }

      for (const s of this.shots) s.y -= 620 * dt;
      this.shots = this.shots.filter(s => s.y > -10);

      // враги
      const inFormation = [];
      for (const e of this.enemies) {
        if (e.state === 'wait') {
          e.delay -= dt;
          if (e.delay <= 0) {
            e.state = 'enter';
            e.t = 0;
            e.path = [{ x: e.x, y: e.y }, { x: W / 2 - e.side * 170, y: 470 }, { x: W / 2 + e.side * 160, y: 280 }, null];
          }
          continue;
        }
        if (e.state === 'enter' || e.state === 'dive') {
          e.t += dt / e.dur;
          const path = e.path.slice();
          if (!path[3]) path[3] = this.slot(e);
          const p = bez(path, Math.min(1, e.t));
          e.x = p.x; e.y = p.y;
          if (e.state === 'dive' && e.fireAt.length && e.t >= e.fireAt[0] && pl.dead <= 0) {
            e.fireAt.shift();
            const a = Math.atan2(PY - e.y, pl.x - e.x);
            this.bombs.push({ x: e.x, y: e.y, vx: Math.cos(a) * 250, vy: Math.max(150, Math.sin(a) * 250) });
          }
          if (e.t >= 1) {
            if (e.state === 'enter') e.state = 'form';
            else { e.state = 'return'; e.x = this.slot(e).x; e.y = -30; }
          }
        } else if (e.state === 'return') {
          const s = this.slot(e);
          const dx = s.x - e.x, dy = s.y - e.y, d = Math.hypot(dx, dy);
          if (d < 4) e.state = 'form';
          else { e.x += dx / d * 220 * dt; e.y += dy / d * 220 * dt; }
        }
        if (e.state === 'form') {
          const s = this.slot(e);
          e.x = s.x; e.y = s.y;
          inFormation.push(e);
        }
      }

      this.diveT -= dt;
      if (this.diveT <= 0 && inFormation.length && pl.dead <= 0) {
        this.diveT = Math.max(0.7, 2.6 - this.stage * 0.2) * (0.6 + Math.random() * 0.8);
        const e = api.pick(inFormation);
        const side = e.x < W / 2 ? -1 : 1;
        const tx = pl.x + (Math.random() - 0.5) * 160;
        e.state = 'dive';
        e.t = 0;
        e.dur = 2.6 - Math.min(1, this.stage * 0.1);
        e.path = [{ x: e.x, y: e.y }, { x: e.x + side * 140, y: e.y - 90 }, { x: tx + (Math.random() - 0.5) * 200, y: 420 }, { x: tx, y: H + 40 }];
        e.fireAt = [0.35, 0.5].slice(0, 1 + (this.stage > 2 ? 1 : 0));
        api.sound.tone({ freq: 1300, freqEnd: 300, dur: 0.7, type: 'triangle', vol: 0.08 });
      }

      // попадания
      for (const s of this.shots) {
        for (const e of this.enemies) {
          if (e.state === 'wait' || e.dead) continue;
          if (Math.abs(s.x - e.x) < 15 && Math.abs(s.y - e.y) < 14) {
            s.y = -100;
            e.hp--;
            if (e.hp > 0) { api.sfx.blip(0.7); break; }
            e.dead = true;
            const diving = e.state === 'dive';
            api.addScore(diving ? TYPES[e.type].dive : TYPES[e.type].pts);
            api.sfx.explode(e.type === 'boss' ? 0.6 : 0.3);
            this.burst(e.x, e.y, e.type === 'boss' ? '#3ddc84' : e.type === 'fly' ? '#ff5d73' : '#3ec5ff');
            break;
          }
        }
      }
      this.enemies = this.enemies.filter(e => !e.dead);

      for (const b of this.bombs) { b.x += b.vx * dt; b.y += b.vy * dt; }
      this.bombs = this.bombs.filter(b => b.y < H + 10);
      if (pl.dead <= 0 && !(pl.inv > 0)) {
        for (const b of this.bombs) if (Math.abs(b.x - pl.x) < 10 && Math.abs(b.y - PY) < 14) { b.y = H + 100; this.killPlayer(api); break; }
        for (const e of this.enemies) {
          if (pl.dead <= 0 && (e.state === 'dive' || e.state === 'enter') && Math.abs(e.x - pl.x) < 22 && Math.abs(e.y - PY) < 20) {
            e.dead = true;
            this.burst(e.x, e.y, '#fff');
            this.killPlayer(api);
          }
        }
        this.enemies = this.enemies.filter(e => !e.dead);
      }

      if (!this.enemies.length) this.nextStage(api);
    },

    burst(x, y, color, n = 14) {
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2, s = 40 + Math.random() * 160;
        this.parts.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, t: 0.5 + Math.random() * 0.4, color });
      }
    },

    killPlayer(api) {
      this.lives--;
      api.hud('ЖИЗНИ', Math.max(0, this.lives));
      this.player.dead = 2;
      this.burst(this.player.x, PY, '#ffffff', 30);
      this.burst(this.player.x, PY, '#ff5d73', 20);
      api.sfx.explode(1.2);
    },

    draw(ctx, api) {
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, W, H);
      for (const s of this.stars) {
        ctx.fillStyle = s.c;
        ctx.globalAlpha = 0.4 + 0.6 * Math.abs(Math.sin(s.x + this.t * 2));
        ctx.fillRect(s.x, s.y, 2, 2);
      }
      ctx.globalAlpha = 1;

      for (const e of this.enemies) if (e.state !== 'wait') drawEnemy(ctx, e, this.t);
      if (this.player.dead <= 0 && (!(this.player.inv > 0) || Math.floor(this.player.inv * 10) % 2)) drawShip(ctx, this.player.x, PY);

      ctx.fillStyle = '#fff';
      for (const s of this.shots) { ctx.fillRect(s.x - 1.5, s.y - 8, 3, 12); }
      ctx.fillStyle = '#ff5d73';
      for (const b of this.bombs) { ctx.fillRect(b.x - 2, b.y - 5, 4, 10); }
      for (const p of this.parts) {
        ctx.globalAlpha = Math.min(1, p.t * 2);
        ctx.fillStyle = p.color;
        ctx.fillRect(p.x - 1.5, p.y - 1.5, 3, 3);
      }
      ctx.globalAlpha = 1;
      for (let i = 0; i < this.lives - 1; i++) drawShip(ctx, 20 + i * 26, H - 18, 0.6);
      if (this.stageTitle > 0) api.text(`ВОЛНА ${this.stage}`, W / 2, H / 2, { size: 18, color: '#3ec5ff' });
    },
  });

  function drawShip(ctx, x, y, s = 1) {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(s, s);
    ctx.fillStyle = '#f2f2ff';
    ctx.beginPath();
    ctx.moveTo(0, -18); ctx.lineTo(5, -6); ctx.lineTo(14, 4); ctx.lineTo(14, 12); ctx.lineTo(5, 8); ctx.lineTo(0, 12);
    ctx.lineTo(-5, 8); ctx.lineTo(-14, 12); ctx.lineTo(-14, 4); ctx.lineTo(-5, -6); ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#ff3b3b';
    ctx.fillRect(-14, 0, 3, 8); ctx.fillRect(11, 0, 3, 8);
    ctx.fillStyle = '#3ec5ff';
    ctx.fillRect(-2, -8, 4, 6);
    ctx.restore();
  }

  function drawEnemy(ctx, e, t) {
    const flap = Math.sin(t * 8 + e.c) > 0 ? 1 : 0.6;
    ctx.save();
    ctx.translate(e.x, e.y);
    if (e.type === 'boss') {
      ctx.fillStyle = e.hp > 1 ? '#3ddc84' : '#b04dff';
      ctx.beginPath(); ctx.ellipse(-11, 2, 8 * flap, 10, -0.3, 0, Math.PI * 2); ctx.ellipse(11, 2, 8 * flap, 10, 0.3, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#ffd23f';
      ctx.beginPath(); ctx.ellipse(0, 0, 7, 12, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#ff3b3b';
      ctx.fillRect(-4, -8, 3, 3); ctx.fillRect(1, -8, 3, 3);
    } else if (e.type === 'fly') {
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.ellipse(-9, -2, 7 * flap, 8, -0.4, 0, Math.PI * 2); ctx.ellipse(9, -2, 7 * flap, 8, 0.4, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#ff3b3b';
      ctx.beginPath(); ctx.ellipse(0, 0, 5, 10, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#3ec5ff';
      ctx.fillRect(-2, -4, 4, 6);
    } else {
      ctx.fillStyle = '#9ad0ff';
      ctx.beginPath(); ctx.ellipse(-8, -3, 6 * flap, 6, -0.4, 0, Math.PI * 2); ctx.ellipse(8, -3, 6 * flap, 6, 0.4, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#ffd23f';
      ctx.beginPath(); ctx.ellipse(0, 1, 5, 9, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#3e5bff';
      ctx.fillRect(-5, -1, 10, 2); ctx.fillRect(-4, 4, 8, 2);
    }
    ctx.restore();
  }
})();
