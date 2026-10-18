'use strict';

(() => {
  const W = 640, H = 480;
  const SIZES = { 3: { r: 42, pts: 20 }, 2: { r: 22, pts: 50 }, 1: { r: 11, pts: 100 } };

  const wrap = o => {
    if (o.x < -50) o.x += W + 100; else if (o.x > W + 50) o.x -= W + 100;
    if (o.y < -50) o.y += H + 100; else if (o.y > H + 50) o.y -= H + 100;
  };
  const wrapTight = o => {
    if (o.x < 0) o.x += W; else if (o.x > W) o.x -= W;
    if (o.y < 0) o.y += H; else if (o.y > H) o.y -= H;
  };

  Arcade.register({
    width: W,
    height: H,
    pointerAction: false,

    start(api) {
      this.lives = 3;
      this.wave = 0;
      this.nextLife = 10000;
      this.ship = this.newShip();
      this.bullets = [];
      this.rocks = [];
      this.parts = [];
      this.saucer = null;
      this.saucerT = 20;
      this.sBullets = [];
      this.beatT = 1;
      this.beatI = 0;
      this.waveTime = 0;
      this.nextWave(api);
      api.hud('ЖИЗНИ', this.lives);
    },

    newShip() {
      return { x: W / 2, y: H / 2, vx: 0, vy: 0, a: -Math.PI / 2, inv: 2.5, alive: true, respawn: 0, cool: 0, thrust: false };
    },

    makeRock(x, y, size, speedMul = 1) {
      const ang = Math.random() * Math.PI * 2;
      const sp = (30 + Math.random() * 50) * (1 + (3 - size) * 0.45) * speedMul;
      const n = 10 + Math.floor(Math.random() * 4);
      return {
        x, y, size, r: SIZES[size].r,
        vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp,
        rot: 0, vr: (Math.random() - 0.5) * 1.5,
        shape: Array.from({ length: n }, () => 0.75 + Math.random() * 0.35),
      };
    },

    nextWave(api) {
      this.wave++;
      this.waveTime = 0;
      api.hud('ВОЛНА', this.wave);
      for (let i = 0; i < 3 + this.wave; i++) {
        let x, y;
        do { x = Math.random() * W; y = Math.random() * H; } while (Math.hypot(x - this.ship.x, y - this.ship.y) < 160);
        this.rocks.push(this.makeRock(x, y, 3, 1 + this.wave * 0.06));
      }
    },

    burst(x, y, n, color = '#fff', sp = 160) {
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2, s = Math.random() * sp;
        this.parts.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, t: 0.4 + Math.random() * 0.6, color });
      }
    },

    breakRock(rock, api) {
      this.rocks.splice(this.rocks.indexOf(rock), 1);
      api.addScore(SIZES[rock.size].pts);
      api.sfx.explode(rock.size / 3);
      this.burst(rock.x, rock.y, 6 + rock.size * 4);
      if (rock.size > 1) for (let i = 0; i < 2; i++) this.rocks.push(this.makeRock(rock.x, rock.y, rock.size - 1, 1 + this.wave * 0.06));
      if (api.score >= this.nextLife) { this.nextLife += 10000; this.lives++; api.hud('ЖИЗНИ', this.lives); api.sfx.powerup(); }
    },

    killShip(api) {
      const s = this.ship;
      s.alive = false;
      s.respawn = 2;
      s.thrust = false;
      this.lives--;
      api.hud('ЖИЗНИ', this.lives);
      api.sfx.explode(1.2);
      this.burst(s.x, s.y, 30, '#9ad0ff', 220);
    },

    update(dt, api) {
      const S = api.sound;
      const s = this.ship;
      this.waveTime += dt;

      if (s.alive) {
        if (api.held('left')) s.a -= 4.5 * dt;
        if (api.held('right')) s.a += 4.5 * dt;
        s.thrust = api.held('up');
        if (s.thrust) { s.vx += Math.cos(s.a) * 300 * dt; s.vy += Math.sin(s.a) * 300 * dt; }
        const drag = Math.pow(0.6, dt);
        s.vx *= drag; s.vy *= drag;
        const sp = Math.hypot(s.vx, s.vy);
        if (sp > 420) { s.vx *= 420 / sp; s.vy *= 420 / sp; }
        s.x += s.vx * dt; s.y += s.vy * dt;
        wrapTight(s);
        s.inv = Math.max(0, s.inv - dt);
        s.cool -= dt;
        if (api.held('action') && s.cool <= 0 && this.bullets.length < 6) {
          s.cool = 0.17;
          this.bullets.push({ x: s.x + Math.cos(s.a) * 14, y: s.y + Math.sin(s.a) * 14, vx: Math.cos(s.a) * 520 + s.vx, vy: Math.sin(s.a) * 520 + s.vy, t: 0.9 });
          api.sfx.shoot();
        }
        if (api.pressed('action2')) {
          s.x = Math.random() * W; s.y = Math.random() * H; s.vx = s.vy = 0; s.inv = 0.5;
          api.sfx.whoosh();
        }
      } else if (this.lives > 0) {
        s.respawn -= dt;
        const safe = this.rocks.every(r => Math.hypot(r.x - W / 2, r.y - H / 2) > r.r + 90);
        if (s.respawn <= 0 && safe) this.ship = this.newShip();
      } else {
        s.respawn -= dt;
        if (s.respawn <= 0) { api.gameOver(`Волна ${this.wave}`); return; }
      }
      S.loop('thrust', s.alive && s.thrust ? { noise: true, freq: 700, vol: 0.16 } : null);

      for (const b of this.bullets) { b.x += b.vx * dt; b.y += b.vy * dt; b.t -= dt; wrapTight(b); }
      for (const r of this.rocks) { r.x += r.vx * dt; r.y += r.vy * dt; r.rot += r.vr * dt; wrap(r); }
      for (const p of this.parts) { p.x += p.vx * dt; p.y += p.vy * dt; p.t -= dt; }
      this.parts = this.parts.filter(p => p.t > 0);

      for (const b of this.bullets) {
        if (b.t <= 0) continue;
        for (const r of this.rocks) {
          if (Math.hypot(b.x - r.x, b.y - r.y) < r.r) { b.t = 0; this.breakRock(r, api); break; }
        }
        if (b.t > 0 && this.saucer && Math.hypot(b.x - this.saucer.x, b.y - this.saucer.y) < 16) {
          b.t = 0;
          api.addScore(this.saucer.small ? 1000 : 200);
          api.sfx.explode(0.8);
          this.burst(this.saucer.x, this.saucer.y, 20, '#ff7b7b');
          this.saucer = null;
        }
      }
      this.bullets = this.bullets.filter(b => b.t > 0);

      if (s.alive && s.inv <= 0) {
        for (const r of this.rocks) {
          if (Math.hypot(s.x - r.x, s.y - r.y) < r.r + 8) { this.breakRock(r, api); this.killShip(api); break; }
        }
      }

      // летающая тарелка
      this.saucerT -= dt;
      if (!this.saucer && this.saucerT <= 0) {
        const d = Math.random() < 0.5 ? 1 : -1;
        this.saucer = { x: d > 0 ? -20 : W + 20, y: 60 + Math.random() * (H - 120), d, t: 0, fire: 1, small: this.wave >= 3 && Math.random() < 0.5 };
        this.saucerT = 18 + Math.random() * 10;
      }
      const sc = this.saucer;
      if (sc) {
        sc.t += dt;
        sc.x += sc.d * 90 * dt;
        sc.y += Math.sin(sc.t * 2) * 40 * dt;
        sc.fire -= dt;
        if (sc.fire <= 0) {
          sc.fire = sc.small ? 0.8 : 1.2;
          const a = sc.small && s.alive ? Math.atan2(s.y - sc.y, s.x - sc.x) + (Math.random() - 0.5) * 0.3 : Math.random() * Math.PI * 2;
          this.sBullets.push({ x: sc.x, y: sc.y, vx: Math.cos(a) * 260, vy: Math.sin(a) * 260, t: 1.4 });
          api.sfx.blip(0.7);
        }
        if (sc.x < -40 || sc.x > W + 40) this.saucer = null;
        else if (s.alive && s.inv <= 0 && Math.hypot(s.x - sc.x, s.y - sc.y) < 22) { this.saucer = null; this.killShip(api); }
      }
      S.loop('saucer', this.saucer ? { type: 'square', freq: this.saucer.small ? 900 : 520, vol: 0.03, lfoRate: 6, lfoDepth: 120 } : null);
      for (const b of this.sBullets) {
        b.x += b.vx * dt; b.y += b.vy * dt; b.t -= dt; wrapTight(b);
        if (s.alive && s.inv <= 0 && Math.hypot(b.x - s.x, b.y - s.y) < 10) { b.t = 0; this.killShip(api); }
      }
      this.sBullets = this.sBullets.filter(b => b.t > 0);

      // «сердцебиение»
      this.beatT -= dt;
      if (this.beatT <= 0) {
        this.beatT = Math.max(0.28, 1 - this.waveTime * 0.012);
        S.tone({ freq: this.beatI ? 98 : 110, dur: 0.12, type: 'triangle', vol: 0.4 });
        this.beatI ^= 1;
      }

      if (!this.rocks.length) {
        api.sfx.levelUp();
        this.nextWave(api);
      }
    },

    draw(ctx, api) {
      ctx.fillStyle = '#02020a';
      ctx.fillRect(0, 0, W, H);
      ctx.lineWidth = 1.6;
      ctx.lineJoin = 'round';
      ctx.shadowColor = '#9ad0ff';
      ctx.shadowBlur = 6;

      ctx.strokeStyle = '#dfe9ff';
      for (const r of this.rocks) {
        ctx.beginPath();
        r.shape.forEach((k, i) => {
          const a = r.rot + (i / r.shape.length) * Math.PI * 2;
          const x = r.x + Math.cos(a) * r.r * k, y = r.y + Math.sin(a) * r.r * k;
          if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        });
        ctx.closePath();
        ctx.stroke();
      }

      const s = this.ship;
      if (s.alive && (s.inv <= 0 || Math.floor(s.inv * 10) % 2 === 0)) {
        ctx.save();
        ctx.translate(s.x, s.y);
        ctx.rotate(s.a);
        ctx.strokeStyle = '#fff';
        ctx.beginPath();
        ctx.moveTo(16, 0); ctx.lineTo(-10, -10); ctx.lineTo(-6, 0); ctx.lineTo(-10, 10); ctx.closePath();
        ctx.stroke();
        if (s.thrust && Math.random() < 0.8) {
          ctx.strokeStyle = '#ffb347';
          ctx.beginPath();
          ctx.moveTo(-7, -5); ctx.lineTo(-16 - Math.random() * 8, 0); ctx.lineTo(-7, 5);
          ctx.stroke();
        }
        ctx.restore();
      }

      const sc = this.saucer;
      if (sc) {
        const k = sc.small ? 0.6 : 1;
        ctx.strokeStyle = '#ff7b7b';
        ctx.beginPath();
        ctx.moveTo(sc.x - 20 * k, sc.y); ctx.lineTo(sc.x + 20 * k, sc.y);
        ctx.lineTo(sc.x + 10 * k, sc.y + 7 * k); ctx.lineTo(sc.x - 10 * k, sc.y + 7 * k); ctx.closePath();
        ctx.moveTo(sc.x - 20 * k, sc.y); ctx.lineTo(sc.x - 9 * k, sc.y - 6 * k); ctx.lineTo(sc.x + 9 * k, sc.y - 6 * k); ctx.lineTo(sc.x + 20 * k, sc.y);
        ctx.moveTo(sc.x - 6 * k, sc.y - 6 * k); ctx.lineTo(sc.x - 3 * k, sc.y - 12 * k); ctx.lineTo(sc.x + 3 * k, sc.y - 12 * k); ctx.lineTo(sc.x + 6 * k, sc.y - 6 * k);
        ctx.stroke();
      }

      ctx.fillStyle = '#fff';
      for (const b of this.bullets) ctx.fillRect(b.x - 1.5, b.y - 1.5, 3, 3);
      ctx.fillStyle = '#ff7b7b';
      for (const b of this.sBullets) ctx.fillRect(b.x - 1.5, b.y - 1.5, 3, 3);
      for (const p of this.parts) {
        ctx.globalAlpha = Math.min(1, p.t * 2);
        ctx.fillStyle = p.color;
        ctx.fillRect(p.x - 1, p.y - 1, 2, 2);
      }
      ctx.globalAlpha = 1;
      ctx.shadowBlur = 0;

      for (let i = 0; i < this.lives; i++) {
        ctx.save();
        ctx.translate(20 + i * 20, 22);
        ctx.rotate(-Math.PI / 2);
        ctx.strokeStyle = '#fff';
        ctx.beginPath();
        ctx.moveTo(9, 0); ctx.lineTo(-6, -6); ctx.lineTo(-3, 0); ctx.lineTo(-6, 6); ctx.closePath();
        ctx.stroke();
        ctx.restore();
      }
    },
  });
})();
