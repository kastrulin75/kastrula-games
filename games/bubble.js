'use strict';

(() => {
  const W = 400, H = 640, R = 16, D = 32, ROWH = 28, TOP = 36, COLS = 12;
  const DEAD_ROW = 17, SX = W / 2, SY = 592;
  const COLORS = ['#ff4d6d', '#ffd23f', '#3ddc84', '#3ec5ff', '#b04dff', '#ff8c42'];
  const key = (r, c) => r * 100 + c;

  Arcade.register({
    width: W,
    height: H,
    pointerAction: false,

    start(api) {
      this.level = 1;
      this.newBoard(api);
      api.hud('УРОВЕНЬ', this.level);
    },

    newBoard(api) {
      this.grid = new Map();
      this.shift = 0;
      this.nColors = Math.min(6, 3 + this.level);
      for (let r = 0; r < 6 + Math.min(3, this.level - 1); r++) {
        for (let c = 0; c < COLS; c++) this.grid.set(key(r, c), api.randInt(0, this.nColors - 1));
      }
      this.angle = -Math.PI / 2;
      this.shot = null;
      this.pops = [];
      this.falls = [];
      this.misses = 0;
      this.cur = this.pickColor(api);
      this.next = this.pickColor(api);
    },

    offset(r) { return (r + this.shift) % 2 === 1; },
    pos(r, c) { return { x: R + c * D + (this.offset(r) ? R : 0), y: TOP + R + r * ROWH }; },
    neighbors(r, c) {
      const o = this.offset(r) ? 1 : 0;
      return [[r, c - 1], [r, c + 1], [r - 1, c - 1 + o], [r - 1, c + o], [r + 1, c - 1 + o], [r + 1, c + o]]
        .filter(([rr, cc]) => rr >= 0 && cc >= 0 && cc < COLS);
    },

    pickColor(api) {
      const present = [...new Set(this.grid.values())];
      return present.length ? api.pick(present) : api.randInt(0, this.nColors - 1);
    },

    onPointer(type, x, y, b, api) {
      const a = Math.atan2(y - SY, x - SX);
      if (y < SY - 10) this.angle = Math.max(-Math.PI + 0.12, Math.min(-0.12, a));
      if (type === 'up') this.fire(api);
    },

    fire(api) {
      if (this.shot) return;
      this.shot = { x: SX, y: SY, vx: Math.cos(this.angle) * 950, vy: Math.sin(this.angle) * 950, color: this.cur };
      this.cur = this.next;
      this.next = this.pickColor(api);
      api.sfx.shoot();
    },

    snap(api) {
      const s = this.shot;
      this.shot = null;
      let best = null, bestD = Infinity;
      const r0 = Math.round((s.y - TOP - R) / ROWH);
      for (let r = Math.max(0, r0 - 1); r <= r0 + 1; r++) {
        for (let c = 0; c < COLS; c++) {
          if (this.grid.has(key(r, c))) continue;
          if (r > 0 && !this.neighbors(r, c).some(([a, b]) => this.grid.has(key(a, b)))) continue;
          const p = this.pos(r, c);
          const d = (p.x - s.x) ** 2 + (p.y - s.y) ** 2;
          if (d < bestD) { bestD = d; best = [r, c]; }
        }
      }
      if (!best) return;
      const [r, c] = best;
      this.grid.set(key(r, c), s.color);
      api.sfx.tick();

      // группа одного цвета
      const group = [], seen = new Set([key(r, c)]), stack = [[r, c]];
      while (stack.length) {
        const [a, b] = stack.pop();
        group.push([a, b]);
        for (const [na, nb] of this.neighbors(a, b)) {
          const k = key(na, nb);
          if (!seen.has(k) && this.grid.get(k) === s.color) { seen.add(k); stack.push([na, nb]); }
        }
      }
      if (group.length >= 3) {
        group.forEach(([a, b], i) => {
          this.pops.push({ ...this.pos(a, b), color: this.grid.get(key(a, b)), t: -i * 0.04 });
          this.grid.delete(key(a, b));
          api.sound.tone({ freq: 600 + i * 70, freqEnd: 1200 + i * 70, dur: 0.07, type: 'sine', vol: 0.25, when: i * 0.04 });
        });
        api.addScore(group.length * 10);
        this.dropFloating(api);
        this.misses = 0;
      } else if (++this.misses >= Math.max(3, 6 - Math.floor(this.level / 2))) {
        this.misses = 0;
        this.lowerCeiling(api);
      }
      if (!this.grid.size) {
        api.addScore(1000);
        this.level++;
        api.hud('УРОВЕНЬ', this.level);
        api.sfx.levelUp();
        this.newBoard(api);
        return;
      }
      if ([...this.grid.keys()].some(k => Math.floor(k / 100) >= DEAD_ROW)) api.gameOver(`Уровень ${this.level}`);
    },

    dropFloating(api) {
      const keep = new Set(), stack = [];
      for (let c = 0; c < COLS; c++) if (this.grid.has(key(0, c))) { keep.add(key(0, c)); stack.push([0, c]); }
      while (stack.length) {
        const [a, b] = stack.pop();
        for (const [na, nb] of this.neighbors(a, b)) {
          const k = key(na, nb);
          if (this.grid.has(k) && !keep.has(k)) { keep.add(k); stack.push([na, nb]); }
        }
      }
      let n = 0;
      for (const [k, color] of [...this.grid]) {
        if (keep.has(k)) continue;
        const p = this.pos(Math.floor(k / 100), k % 100);
        this.falls.push({ ...p, vy: -60 - Math.random() * 80, vx: (Math.random() - 0.5) * 80, color });
        this.grid.delete(k);
        n++;
      }
      if (n) { api.addScore(n * 20); api.sfx.whoosh(); }
    },

    lowerCeiling(api) {
      const g = new Map();
      for (const [k, v] of this.grid) g.set(k + 100, v);
      this.grid = g;
      this.shift ^= 1;
      for (let c = 0; c < COLS; c++) this.grid.set(key(0, c), api.randInt(0, this.nColors - 1));
      api.sfx.thud();
    },

    update(dt, api) {
      if (api.held('left')) this.angle = Math.max(-Math.PI + 0.12, this.angle - 1.8 * dt);
      if (api.held('right')) this.angle = Math.min(-0.12, this.angle + 1.8 * dt);
      if (api.pressed('action') || api.pressed('up')) this.fire(api);
      if (api.pressed('action2')) { [this.cur, this.next] = [this.next, this.cur]; api.sfx.blip(0.9); }

      const s = this.shot;
      if (s) {
        const n = 8;
        for (let i = 0; i < n && this.shot; i++) {
          s.x += s.vx * dt / n;
          s.y += s.vy * dt / n;
          if (s.x < R) { s.x = R; s.vx = Math.abs(s.vx); api.sfx.bounce(1.4); }
          if (s.x > W - R) { s.x = W - R; s.vx = -Math.abs(s.vx); api.sfx.bounce(1.4); }
          if (s.y <= TOP + R) { this.snap(api); break; }
          for (const [k] of this.grid) {
            const p = this.pos(Math.floor(k / 100), k % 100);
            if ((p.x - s.x) ** 2 + (p.y - s.y) ** 2 < (D * 0.86) ** 2) { this.snap(api); break; }
          }
        }
      }
      for (const p of this.pops) p.t += dt;
      this.pops = this.pops.filter(p => p.t < 0.25);
      for (const f of this.falls) { f.vy += 1400 * dt; f.y += f.vy * dt; f.x += f.vx * dt; }
      this.falls = this.falls.filter(f => f.y < H + 40);
    },

    drawBubble(ctx, x, y, color, r = R - 1) {
      const g = ctx.createRadialGradient(x - r * 0.35, y - r * 0.35, r * 0.1, x, y, r);
      g.addColorStop(0, '#ffffff');
      g.addColorStop(0.25, color);
      g.addColorStop(1, shade(color));
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    },

    draw(ctx, api) {
      const bg = ctx.createLinearGradient(0, 0, 0, H);
      bg.addColorStop(0, '#1b2a4e');
      bg.addColorStop(1, '#0d1326');
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = '#2a3a66';
      ctx.fillRect(0, 0, W, TOP);
      const deadY = TOP + R + DEAD_ROW * ROWH - R;
      ctx.strokeStyle = 'rgba(255,77,109,0.5)';
      ctx.setLineDash([6, 6]);
      ctx.beginPath(); ctx.moveTo(0, deadY); ctx.lineTo(W, deadY); ctx.stroke();
      ctx.setLineDash([]);

      for (const [k, v] of this.grid) {
        const p = this.pos(Math.floor(k / 100), k % 100);
        this.drawBubble(ctx, p.x, p.y, COLORS[v]);
      }
      for (const p of this.pops) {
        if (p.t < 0) { this.drawBubble(ctx, p.x, p.y, COLORS[p.color]); continue; }
        ctx.strokeStyle = COLORS[p.color];
        ctx.globalAlpha = 1 - p.t / 0.25;
        ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(p.x, p.y, R * (1 + p.t * 4), 0, Math.PI * 2); ctx.stroke();
        ctx.globalAlpha = 1;
      }
      for (const f of this.falls) this.drawBubble(ctx, f.x, f.y, COLORS[f.color]);

      // линия прицела с одним отскоком
      if (!this.shot) {
        ctx.fillStyle = 'rgba(255,255,255,0.5)';
        let x = SX, y = SY, vx = Math.cos(this.angle), vy = Math.sin(this.angle);
        for (let i = 0; i < 40; i++) {
          x += vx * 14; y += vy * 14;
          if (x < R || x > W - R) vx = -vx;
          if (y < TOP + R) break;
          ctx.beginPath(); ctx.arc(x, y, 2, 0, Math.PI * 2); ctx.fill();
        }
      }
      if (this.shot) this.drawBubble(ctx, this.shot.x, this.shot.y, COLORS[this.shot.color]);
      else this.drawBubble(ctx, SX, SY, COLORS[this.cur]);
      this.drawBubble(ctx, SX + 60, SY + 18, COLORS[this.next], 11);
      api.text('SHIFT', SX + 60, SY + 40, { size: 7, color: '#8b8bb8' });

      ctx.fillStyle = '#2a3a66';
      ctx.beginPath(); ctx.arc(SX, SY + 4, 24, Math.PI * 0.1, Math.PI * 0.9); ctx.fill();
      api.text(`ДО СПУСКА: ${Math.max(3, 6 - Math.floor(this.level / 2)) - this.misses}`, 12, H - 14, { size: 8, align: 'left', color: '#8b8bb8' });
    },
  });

  function shade(hex) {
    const n = parseInt(hex.slice(1), 16);
    const f = v => Math.floor(v * 0.55);
    return `rgb(${f(n >> 16)},${f((n >> 8) & 255)},${f(n & 255)})`;
  }
})();
