'use strict';

(() => {
  const W = 720, H = 400, GROUND = 320, B = 30, PX = 160;
  const SPEED = 330, GRAV = 3000, JUMP = 760;

  // Узоры препятствий в клетках: [dx, dy, тип]; dy — высота над землёй
  const PATTERNS = [
    { len: 1, objs: [[0, 0, 'spike']] },
    { len: 2, objs: [[0, 0, 'spike'], [1, 0, 'spike']] },
    { len: 3, min: 40, objs: [[0, 0, 'spike'], [1, 0, 'spike'], [2, 0, 'spike']] },
    { len: 6, objs: [[0, 0, 'block'], [1, 0, 'block'], [2, 0, 'block'], [3, 0, 'block'], [3, 1, 'block'], [4, 1, 'block'], [5, 1, 'block']] },
    { len: 5, objs: [[0, 0, 'block'], [1, 0, 'block'], [2, 0, 'block'], [3, 0, 'block'], [4, 0, 'block'], [2, 1, 'spike']] },
    { len: 8, objs: [[0, 0, 'block'], [4, 0, 'block'], [4, 1, 'block'], [8, 0, 'block']] },
    { len: 4, objs: [[0, 0, 'spike'], [1, 0, 'block'], [2, 0, 'block'], [3, 0, 'block'], [3, 1, 'spike']], min: 25 },
    { len: 7, objs: [[0, 0, 'block'], [1, 0, 'block'], [1, 1, 'block'], [2, 1, 'block'], [3, 0, 'spike'], [4, 0, 'spike'], [5, 0, 'block'], [6, 0, 'block']], min: 60 },
  ];

  const bassBar = (n, oct) => [[n + oct, 0.5], [n + oct, 0.5], [n + (oct + 1), 0.5], [n + oct, 0.5], [n + oct, 0.5], [n + (oct + 1), 0.5], [n + oct, 0.5], [n + (oct + 1), 0.5]];
  const MUSIC = {
    bpm: 128,
    voices: [
      { vol: 0.45, notes: [['kick', 1], ['kick', 1], ['kick', 1], ['kick', 1]] },
      { vol: 0.06, notes: [[0, 0.5], ['hat', 0.5], [0, 0.5], ['hat', 0.5], [0, 0.5], ['hat', 0.5], [0, 0.5], ['hat', 0.5]] },
      { vol: 0.12, notes: [[0, 1], ['snare', 1], [0, 1], ['snare', 1]] },
      { type: 'sawtooth', vol: 0.045, notes: [...bassBar('A', 2), ...bassBar('F', 2), ...bassBar('C', 3), ...bassBar('G', 2)] },
      { type: 'square', vol: 0.03, notes: [
        ['A4', 0.5], ['C5', 0.5], ['E5', 0.5], ['A5', 0.5], ['G5', 0.5], ['E5', 0.5], ['C5', 0.5], ['E5', 0.5],
        ['F4', 0.5], ['A4', 0.5], ['C5', 0.5], ['F5', 0.5], ['E5', 0.5], ['C5', 0.5], ['A4', 0.5], ['C5', 0.5],
        ['C5', 0.5], ['E5', 0.5], ['G5', 0.5], ['C6', 0.5], ['B5', 0.5], ['G5', 0.5], ['E5', 0.5], ['G5', 0.5],
        ['G4', 0.5], ['B4', 0.5], ['D5', 0.5], ['G5', 0.5], ['F#5', 0.5], ['D5', 0.5], ['B4', 0.5], ['D5', 0.5],
      ] },
    ],
  };

  Arcade.register({
    width: W,
    height: H,
    quietStart: true,

    start(api) {
      this.x = 0;
      this.p = { y: GROUND, vy: 0, ground: true, rot: 0, dead: 0 };
      this.objs = [];
      this.nextX = W + 200;
      this.parts = [];
      this.trail = [];
      this.t = 0;
      this.attempt = api.state === 'boot' ? 0 : (this.attempt || 0) + 1;
      while (this.nextX < this.x + W * 2) this.addPattern(api);
    },

    addPattern(api) {
      const dist = this.nextX / B;
      const opts = PATTERNS.filter(p => !p.min || dist > p.min);
      const pat = api.pick(opts);
      for (const [dx, dy, type] of pat.objs) this.objs.push({ x: this.nextX + dx * B, y: GROUND - dy * B, type });
      this.nextX += (pat.len + api.randInt(5, 9)) * B;
    },

    update(dt, api) {
      this.t += dt;
      const p = this.p;
      for (const q of this.parts) { q.x += q.vx * dt; q.y += q.vy * dt; q.vy += 600 * dt; q.t -= dt; }
      this.parts = this.parts.filter(q => q.t > 0);
      if (p.dead) {
        p.dead -= dt;
        if (p.dead <= 0) api.gameOver(`Пройдено: ${api.score} клеток · попытка ${this.attempt}`, { quiet: true });
        return;
      }
      api.sound.playMusic(MUSIC);

      this.x += SPEED * dt;
      api.score = Math.floor(this.x / B);
      while (this.nextX < this.x + W * 2) this.addPattern(api);
      this.objs = this.objs.filter(o => o.x - this.x + PX > -60);

      if (p.ground && (api.held('action') || api.held('up') || api.pressed('action') || api.pressed('up'))) {
        p.vy = -JUMP;
        p.ground = false;
      }
      const prevY = p.y;
      p.vy += GRAV * dt;
      p.y += p.vy * dt;
      if (!p.ground) p.rot += dt * Math.PI / (2 * JUMP / GRAV);

      // опора под игроком
      let floor = GROUND;
      const left = this.x, right = this.x + B;
      for (const o of this.objs) {
        if (o.type !== 'block') continue;
        if (right - 3 > o.x && left + 3 < o.x + B) {
          const top = o.y - B;
          if (prevY <= top + 2 && p.y >= top) floor = Math.min(floor, top);
        }
      }
      if (p.y >= floor) {
        p.y = floor; p.vy = 0;
        if (!p.ground) p.rot = Math.round(p.rot / (Math.PI / 2)) * (Math.PI / 2);
        p.ground = true;
      } else {
        // проверим, не сошли ли с блока
        const support = p.y === GROUND || this.objs.some(o => o.type === 'block' && right - 3 > o.x && left + 3 < o.x + B && Math.abs(o.y - B - p.y) < 1);
        if (!support) p.ground = false;
      }

      // смертельные столкновения
      const pl = { x1: left + 4, x2: right - 4, y1: p.y - B + 4, y2: p.y - 2 };
      for (const o of this.objs) {
        const hit = o.type === 'spike'
          ? { x1: o.x + 10, x2: o.x + B - 10, y1: o.y - B + 12, y2: o.y }
          : { x1: o.x, x2: o.x + B, y1: o.y - B + 6, y2: o.y };
        if (pl.x1 < hit.x2 && pl.x2 > hit.x1 && pl.y1 < hit.y2 && pl.y2 > hit.y1) { this.die(api); return; }
      }

      if (Math.random() < 0.6) this.trail.push({ x: this.x, y: p.y - 4, t: 0.3 });
      for (const tr of this.trail) tr.t -= dt;
      this.trail = this.trail.filter(tr => tr.t > 0);
    },

    die(api) {
      this.p.dead = 0.8;
      api.sound.stopMusic();
      api.sfx.explode(0.8);
      for (let i = 0; i < 30; i++) {
        const a = Math.random() * Math.PI * 2, s = 100 + Math.random() * 250;
        this.parts.push({ x: PX + B / 2, y: this.p.y - B / 2, vx: Math.cos(a) * s, vy: Math.sin(a) * s, t: 0.8 });
      }
    },

    draw(ctx, api) {
      const hue = (this.x / 20) % 360;
      const beat = Math.max(0, 1 - ((this.t * 128 / 60) % 1) * 3);
      const g = ctx.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, `hsl(${hue}, 70%, ${18 + beat * 6}%)`);
      g.addColorStop(1, `hsl(${hue + 40}, 70%, 8%)`);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = `hsla(${hue}, 70%, 40%, 0.25)`;
      for (let i = 0; i < 8; i++) {
        const x = ((i * 140 - this.x * 0.2) % (W + 140) + W + 140) % (W + 140) - 70;
        ctx.fillRect(x, 120 + (i % 3) * 30, 60, 60);
      }
      ctx.fillStyle = `hsl(${hue}, 60%, 14%)`;
      ctx.fillRect(0, GROUND, W, H - GROUND);
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, GROUND, W, 2);

      const ox = PX - this.x;
      for (const o of this.objs) {
        const x = o.x + ox;
        if (x > W + 40 || x < -40) continue;
        if (o.type === 'block') {
          ctx.fillStyle = '#0d0d1a';
          ctx.fillRect(x, o.y - B, B, B);
          ctx.strokeStyle = '#fff';
          ctx.lineWidth = 2;
          ctx.strokeRect(x + 1, o.y - B + 1, B - 2, B - 2);
          ctx.strokeStyle = `hsla(${hue}, 80%, 70%, 0.5)`;
          ctx.strokeRect(x + 7, o.y - B + 7, B - 14, B - 14);
        } else {
          ctx.fillStyle = '#0d0d1a';
          ctx.strokeStyle = '#fff';
          ctx.lineWidth = 2;
          ctx.beginPath(); ctx.moveTo(x + 1, o.y); ctx.lineTo(x + B / 2, o.y - B + 2); ctx.lineTo(x + B - 1, o.y); ctx.closePath();
          ctx.fill(); ctx.stroke();
        }
      }

      for (const tr of this.trail) {
        ctx.fillStyle = `hsla(${hue + 180}, 90%, 60%, ${tr.t * 2})`;
        ctx.fillRect(tr.x + ox - 6, tr.y - 3, 6, 6);
      }

      const p = this.p;
      if (!p.dead) {
        ctx.save();
        ctx.translate(PX + B / 2, p.y - B / 2);
        ctx.rotate(p.rot);
        ctx.fillStyle = '#ffe94a';
        ctx.fillRect(-B / 2, -B / 2, B, B);
        ctx.strokeStyle = '#111';
        ctx.lineWidth = 2;
        ctx.strokeRect(-B / 2 + 1, -B / 2 + 1, B - 2, B - 2);
        ctx.fillStyle = '#00e5ff';
        ctx.fillRect(-B / 2 + 6, -B / 2 + 6, B - 12, B - 12);
        ctx.fillStyle = '#111';
        ctx.fillRect(-6, -5, 4, 4); ctx.fillRect(3, -5, 4, 4); ctx.fillRect(-6, 3, 13, 3);
        ctx.restore();
      }
      for (const q of this.parts) {
        ctx.globalAlpha = Math.max(0, q.t);
        ctx.fillStyle = '#ffe94a';
        ctx.fillRect(q.x - 3, q.y - 3, 6, 6);
      }
      ctx.globalAlpha = 1;
      api.text(`ПОПЫТКА ${this.attempt}`, W / 2, 34, { size: 12, color: 'rgba(255,255,255,0.8)' });
    },
  });
})();
