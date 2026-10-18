'use strict';

(() => {
  const W = 640, H = 480, GROUND = 440;
  const BASES = [40, 320, 600];
  const CITIES = [115, 170, 225, 415, 470, 525];

  Arcade.register({
    width: W,
    height: H,
    pointerAction: false,

    start(api) {
      this.wave = 0;
      this.cities = CITIES.map(x => ({ x, alive: true }));
      this.cursor = { x: W / 2, y: 200 };
      this.nextBonus = 10000;
      this.nextWave(api);
    },

    nextWave(api) {
      this.wave++;
      api.hud('ВОЛНА', this.wave);
      this.bases = BASES.map(x => ({ x, ammo: 10, alive: true }));
      this.enemy = [];
      this.mine = [];
      this.booms = [];
      this.toSpawn = 8 + this.wave * 3;
      this.spawnT = 1.5;
      this.tally = 0;
      this.banner = 2;
      api.sound.melody([440, 0, 440, 0, 440], 0.12, { type: 'sawtooth', vol: 0.08 });
    },

    targets() {
      return [...this.cities.filter(c => c.alive).map(c => c.x), ...this.bases.filter(b => b.alive).map(b => b.x)];
    },

    spawnEnemy(api, x0, y0) {
      const ts = this.targets();
      if (!ts.length) return;
      const tx = api.pick(ts) + api.rand(-6, 6);
      const sx = x0 ?? api.rand(20, W - 20), sy = y0 ?? 0;
      const d = Math.hypot(tx - sx, GROUND - sy);
      const sp = 28 + this.wave * 7;
      this.enemy.push({ sx, sy, x: sx, y: sy, vx: (tx - sx) / d * sp, vy: (GROUND - sy) / d * sp, split: x0 == null && this.wave >= 2 && Math.random() < 0.22 ? api.rand(110, 260) : 0 });
    },

    fire(api, tx, ty) {
      ty = Math.min(ty, GROUND - 30);
      let best = null, bestD = Infinity;
      for (const b of this.bases) {
        if (!b.alive || b.ammo <= 0) continue;
        const d = Math.abs(b.x - tx);
        if (d < bestD) { bestD = d; best = b; }
      }
      if (!best) { api.sfx.error(); return; }
      best.ammo--;
      const sp = best.x === 320 ? 720 : 520;
      const d = Math.hypot(tx - best.x, ty - (GROUND - 22));
      this.mine.push({ sx: best.x, sy: GROUND - 22, x: best.x, y: GROUND - 22, tx, ty, vx: (tx - best.x) / d * sp, vy: (ty - GROUND + 22) / d * sp });
      api.sfx.whoosh();
    },

    boom(x, y, max = 38) { this.booms.push({ x, y, t: 0, max }); },
    boomR(b) { return b.t < 0.45 ? b.max * b.t / 0.45 : b.t < 0.65 ? b.max : Math.max(0, b.max * (1 - (b.t - 0.65) / 0.35)); },

    onPointer(type, x, y, b, api) {
      this.cursor.x = x; this.cursor.y = y;
      if (type === 'down') this.fire(api, x, y);
    },

    update(dt, api) {
      this.banner = Math.max(0, this.banner - dt);
      const cu = this.cursor;
      if (api.held('left')) cu.x -= 380 * dt;
      if (api.held('right')) cu.x += 380 * dt;
      if (api.held('up')) cu.y -= 380 * dt;
      if (api.held('down')) cu.y += 380 * dt;
      cu.x = api.clamp(cu.x, 0, W); cu.y = api.clamp(cu.y, 0, GROUND - 30);
      if (api.pressed('action')) this.fire(api, cu.x, cu.y);

      if (this.tally > 0) {
        this.tally -= dt;
        if (this.tally <= 0) {
          if (!this.cities.some(c => c.alive)) { api.gameOver(`Волна ${this.wave}`); return; }
          this.nextWave(api);
        }
        return;
      }

      this.spawnT -= dt;
      if (this.toSpawn > 0 && this.spawnT <= 0) {
        const n = Math.min(this.toSpawn, api.randInt(1, 1 + Math.floor(this.wave / 2)));
        for (let i = 0; i < n; i++) this.spawnEnemy(api);
        this.toSpawn -= n;
        this.spawnT = Math.max(0.7, 2.6 - this.wave * 0.15) * api.rand(0.7, 1.3);
      }

      for (const m of this.mine) {
        m.x += m.vx * dt; m.y += m.vy * dt;
        if ((m.vy < 0 && m.y <= m.ty) || Math.hypot(m.x - m.tx, m.y - m.ty) < 6) { m.done = true; this.boom(m.tx, m.ty); api.sfx.explode(0.4); }
      }
      this.mine = this.mine.filter(m => !m.done);
      for (const b of this.booms) b.t += dt;
      this.booms = this.booms.filter(b => b.t < 1);

      for (const e of this.enemy) {
        e.x += e.vx * dt; e.y += e.vy * dt;
        if (e.split && e.y > e.split) {
          e.split = 0;
          for (let i = 0; i < 2; i++) this.spawnEnemy(api, e.x, e.y);
        }
        for (const b of this.booms) {
          if (Math.hypot(e.x - b.x, e.y - b.y) < this.boomR(b) + 2) { e.dead = true; api.addScore(25); this.boom(e.x, e.y, 30); api.sfx.explode(0.3); break; }
        }
        if (!e.dead && e.y >= GROUND) {
          e.dead = true;
          this.boom(e.x, GROUND - 6, 30);
          const city = this.cities.find(c => c.alive && Math.abs(c.x - e.x) < 20);
          const base = this.bases.find(b => b.alive && Math.abs(b.x - e.x) < 22);
          if (city) { city.alive = false; api.sfx.explode(1.2); api.sfx.hurt(); }
          else if (base) { base.alive = false; base.ammo = 0; api.sfx.explode(1); }
          else api.sfx.explode(0.5);
        }
      }
      this.enemy = this.enemy.filter(e => !e.dead);

      if (api.score >= this.nextBonus) {
        this.nextBonus += 10000;
        const dead = this.cities.find(c => !c.alive);
        if (dead) { dead.alive = true; api.sfx.powerup(); }
      }

      if (!this.toSpawn && !this.enemy.length && !this.mine.length && !this.booms.length) {
        const ammo = this.bases.reduce((s, b) => s + b.ammo, 0);
        const cities = this.cities.filter(c => c.alive).length;
        this.bonus = { ammo, cities };
        api.addScore(ammo * 5 + cities * 100);
        for (let i = 0; i < Math.min(16, ammo + cities); i++) api.sound.tone({ freq: 880 + i * 30, dur: 0.05, vol: 0.08, when: i * 0.08 });
        this.tally = 2.5;
      }
    },

    draw(ctx, api) {
      const g = ctx.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, '#04041a');
      g.addColorStop(1, '#1a0a2e');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);

      ctx.fillStyle = '#c9a227';
      ctx.beginPath();
      ctx.moveTo(0, H);
      ctx.lineTo(0, GROUND);
      for (const bx of BASES) { ctx.lineTo(bx - 34, GROUND); ctx.lineTo(bx - 18, GROUND - 22); ctx.lineTo(bx + 18, GROUND - 22); ctx.lineTo(bx + 34, GROUND); }
      ctx.lineTo(W, GROUND); ctx.lineTo(W, H); ctx.closePath(); ctx.fill();

      for (const c of this.cities) {
        if (c.alive) {
          ctx.fillStyle = '#3ec5ff';
          ctx.fillRect(c.x - 16, GROUND - 10, 32, 10);
          ctx.fillRect(c.x - 12, GROUND - 18, 7, 8);
          ctx.fillRect(c.x - 2, GROUND - 22, 6, 12);
          ctx.fillRect(c.x + 7, GROUND - 15, 6, 5);
        } else {
          ctx.fillStyle = '#5a3a1a';
          ctx.fillRect(c.x - 16, GROUND - 4, 32, 4);
        }
      }
      for (const b of this.bases) {
        ctx.fillStyle = '#3e5bff';
        for (let i = 0; i < b.ammo; i++) {
          const row = i < 1 ? 0 : i < 3 ? 1 : i < 6 ? 2 : 3;
          const idx = i < 1 ? 0 : i < 3 ? i - 1 : i < 6 ? i - 3 : i - 6;
          const x = b.x - row * 5 + idx * 10, y = GROUND - 26 + row * 6;
          ctx.fillRect(x - 2, y - 5 + 6, 4, 5);
        }
        if (!b.alive) api.text('X', b.x, GROUND - 32, { size: 10, color: '#ff4d6d' });
      }

      ctx.lineWidth = 1.5;
      for (const e of this.enemy) {
        ctx.strokeStyle = '#ff4d6d';
        ctx.beginPath(); ctx.moveTo(e.sx, e.sy); ctx.lineTo(e.x, e.y); ctx.stroke();
        ctx.fillStyle = '#fff';
        ctx.fillRect(e.x - 1.5, e.y - 1.5, 3, 3);
      }
      for (const m of this.mine) {
        ctx.strokeStyle = '#3ec5ff';
        ctx.beginPath(); ctx.moveTo(m.sx, m.sy); ctx.lineTo(m.x, m.y); ctx.stroke();
        ctx.strokeStyle = '#fff';
        ctx.beginPath(); ctx.moveTo(m.tx - 4, m.ty - 4); ctx.lineTo(m.tx + 4, m.ty + 4); ctx.moveTo(m.tx + 4, m.ty - 4); ctx.lineTo(m.tx - 4, m.ty + 4); ctx.stroke();
      }
      for (const b of this.booms) {
        const hue = Math.floor(b.t * 30) % 4;
        ctx.fillStyle = ['#ffffff', '#ffd23f', '#ff5dd1', '#3ec5ff'][hue];
        ctx.beginPath(); ctx.arc(b.x, b.y, this.boomR(b), 0, Math.PI * 2); ctx.fill();
      }

      const cu = this.cursor;
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(cu.x - 10, cu.y); ctx.lineTo(cu.x - 4, cu.y); ctx.moveTo(cu.x + 4, cu.y); ctx.lineTo(cu.x + 10, cu.y);
      ctx.moveTo(cu.x, cu.y - 10); ctx.lineTo(cu.x, cu.y - 4); ctx.moveTo(cu.x, cu.y + 4); ctx.lineTo(cu.x, cu.y + 10);
      ctx.stroke();

      if (this.banner > 0) api.text(`ВОЛНА ${this.wave}`, W / 2, H / 2 - 40, { size: 18, color: '#ffd23f' });
      if (this.tally > 0 && this.bonus) {
        api.text('БОНУС', W / 2, 150, { size: 16, color: '#ffd23f' });
        api.text(`СНАРЯДЫ ${this.bonus.ammo} × 5`, W / 2, 190, { size: 11 });
        api.text(`ГОРОДА ${this.bonus.cities} × 100`, W / 2, 215, { size: 11 });
      }
    },
  });
})();
