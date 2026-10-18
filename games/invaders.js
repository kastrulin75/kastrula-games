'use strict';

(() => {
  const W = 480, H = 560, PY = 515, GROUND = 545;
  const CW = 34, CH = 30, PX = 2.5;
  const sprite = rows => {
    const pts = [];
    rows.forEach((r, y) => [...r].forEach((c, x) => { if (c === '#') pts.push([x, y]); }));
    return { pts, w: rows[0].length, h: rows.length };
  };
  const SQUID = [
    sprite(['...##...', '..####..', '.######.', '##.##.##', '########', '..#..#..', '.#.##.#.', '#.#..#.#']),
    sprite(['...##...', '..####..', '.######.', '##.##.##', '########', '.#.##.#.', '#......#', '.#....#.']),
  ];
  const CRAB = [
    sprite(['..#.....#..', '...#...#...', '..#######..', '.##.###.##.', '###########', '#.#######.#', '#.#.....#.#', '...##.##...']),
    sprite(['..#.....#..', '#..#...#..#', '#.#######.#', '###.###.###', '###########', '.#########.', '..#.....#..', '.#.......#.']),
  ];
  const OCTO = [
    sprite(['....####....', '.##########.', '############', '###..##..###', '############', '...##..##...', '..##.##.##..', '##........##']),
    sprite(['....####....', '.##########.', '############', '###..##..###', '############', '..###..###..', '.##..##..##.', '..##....##..']),
  ];
  const PLAYER = sprite(['......#......', '.....###.....', '.....###.....', '.###########.', '#############', '#############', '#############', '#############']);
  const UFO = sprite(['.....######.....', '...##########...', '..############..', '.##.##.##.##.##.', '################', '..###..##..###..', '...#........#...']);
  const ROWS = [
    { s: SQUID, pts: 30, color: '#ff5dd1' },
    { s: CRAB, pts: 20, color: '#3ec5ff' },
    { s: CRAB, pts: 20, color: '#3ec5ff' },
    { s: OCTO, pts: 10, color: '#39ff14' },
    { s: OCTO, pts: 10, color: '#39ff14' },
  ];
  const MARCH = [98, 87, 78, 73];

  function drawSprite(ctx, sp, x, y, px, color) {
    ctx.fillStyle = color;
    for (const [sx, sy] of sp.pts) ctx.fillRect(x + sx * px, y + sy * px, px + 0.2, px + 0.2);
  }

  Arcade.register({
    width: W,
    height: H,

    start(api) {
      this.wave = 1;
      this.lives = 3;
      this.player = { x: W / 2, dead: 0 };
      this.makeShields();
      this.newWave(api);
      api.hud('ЖИЗНИ', this.lives);
      api.hud('ВОЛНА', this.wave);
    },

    makeShields() {
      this.shields = [];
      for (let i = 0; i < 4; i++) {
        const sx = 50 + i * 110, sy = 440;
        for (let y = 0; y < 16; y++) {
          for (let x = 0; x < 22; x++) {
            if (y < 4 && (x < 4 - y || x > 17 + y)) continue;
            if (y >= 11 && x >= 6 && x <= 15) continue;
            if (y === 10 && x >= 8 && x <= 13) continue;
            this.shields.push({ x: sx + x * 3, y: sy + y * 3 });
          }
        }
      }
    },

    newWave() {
      this.aliens = [];
      for (let r = 0; r < 5; r++) for (let c = 0; c < 11; c++) this.aliens.push({ r, c, alive: true });
      this.fx = 40;
      this.fy = 80 + Math.min(this.wave - 1, 5) * 16;
      this.dir = 1;
      this.frame = 0;
      this.marchT = 0;
      this.marchI = 0;
      this.bullet = null;
      this.bombs = [];
      this.bombT = 1;
      this.ufo = null;
      this.ufoT = 15 + Math.random() * 10;
      this.booms = [];
    },

    alienRect(a) {
      const sp = ROWS[a.r].s[0];
      const w = sp.w * PX;
      return { x: this.fx + a.c * CW + (CW - w) / 2, y: this.fy + a.r * CH, w, h: sp.h * PX };
    },

    update(dt, api) {
      const S = api.sound;
      for (const b of this.booms) b.t -= dt;
      this.booms = this.booms.filter(b => b.t > 0);

      if (this.player.dead > 0) {
        this.player.dead -= dt;
        if (this.player.dead <= 0) {
          if (this.lives <= 0) { api.gameOver(`Волна ${this.wave}`); return; }
          this.player.x = W / 2;
          this.bombs = [];
        }
        S.loop('ufo', null);
        return;
      }

      const p = this.player;
      if (api.held('left')) p.x -= 220 * dt;
      if (api.held('right')) p.x += 220 * dt;
      p.x = api.clamp(p.x, 20, W - 20);
      if ((api.pressed('action') || api.pressed('up')) && !this.bullet) {
        this.bullet = { x: p.x, y: PY - 6 };
        api.sfx.laser();
      }

      // марш пришельцев
      const alive = this.aliens.filter(a => a.alive);
      if (!alive.length) {
        this.wave++;
        api.hud('ВОЛНА', this.wave);
        api.sfx.levelUp();
        this.newWave(api);
        return;
      }
      this.marchT -= dt;
      if (this.marchT <= 0) {
        this.marchT = Math.max(0.03, (alive.length / 55) * 0.65 - (this.wave - 1) * 0.02);
        let minX = Infinity, maxX = -Infinity;
        for (const a of alive) { const r = this.alienRect(a); minX = Math.min(minX, r.x); maxX = Math.max(maxX, r.x + r.w); }
        if ((this.dir > 0 && maxX + 8 > W - 8) || (this.dir < 0 && minX - 8 < 8)) {
          this.fy += 14;
          this.dir *= -1;
        } else {
          this.fx += this.dir * 8;
        }
        this.frame ^= 1;
        S.tone({ freq: MARCH[this.marchI], dur: 0.09, type: 'square', vol: 0.18 });
        this.marchI = (this.marchI + 1) % 4;
        for (const a of alive) {
          const r = this.alienRect(a);
          if (r.y + r.h >= PY - 10) { this.lives = 0; api.hud('ЖИЗНИ', 0); this.killPlayer(api); return; }
          this.shields = this.shields.filter(s => !(s.x + 3 > r.x && s.x < r.x + r.w && s.y + 3 > r.y && s.y < r.y + r.h));
        }
      }

      // бомбы
      this.bombT -= dt;
      if (this.bombT <= 0 && this.bombs.length < 3 + Math.floor(this.wave / 2)) {
        this.bombT = Math.max(0.25, 1.1 - this.wave * 0.08) * (0.5 + Math.random());
        const cols = [...new Set(alive.map(a => a.c))];
        const c = api.pick(cols);
        const shooter = alive.filter(a => a.c === c).sort((a, b) => b.r - a.r)[0];
        const r = this.alienRect(shooter);
        this.bombs.push({ x: r.x + r.w / 2, y: r.y + r.h, t: 0 });
      }
      for (const b of this.bombs) {
        b.y += (180 + this.wave * 10) * dt;
        b.t += dt;
        if (this.hitShield(b.x, b.y)) b.dead = true;
        if (b.y > PY - 8 && b.y < PY + 14 && Math.abs(b.x - p.x) < 18) { b.dead = true; this.killPlayer(api); }
        if (b.y > GROUND) b.dead = true;
      }

      // пуля игрока
      const bl = this.bullet;
      if (bl) {
        bl.y -= 540 * dt;
        if (bl.y < 30) this.bullet = null;
        else if (this.hitShield(bl.x, bl.y)) this.bullet = null;
        else {
          for (const a of alive) {
            const r = this.alienRect(a);
            if (bl.x > r.x && bl.x < r.x + r.w && bl.y > r.y && bl.y < r.y + r.h) {
              a.alive = false;
              this.bullet = null;
              api.addScore(ROWS[a.r].pts);
              this.booms.push({ x: r.x + r.w / 2, y: r.y + r.h / 2, t: 0.25, color: ROWS[a.r].color });
              api.sfx.explode(0.2);
              break;
            }
          }
          if (this.bullet) {
            for (const b of this.bombs) {
              if (Math.abs(b.x - bl.x) < 5 && Math.abs(b.y - bl.y) < 10) { b.dead = true; this.bullet = null; api.sfx.tick(); break; }
            }
          }
          if (this.bullet && this.ufo && Math.abs(bl.x - this.ufo.x) < 22 && Math.abs(bl.y - 58) < 12) {
            const pts = api.pick([50, 100, 150, 300]);
            api.addScore(pts);
            this.booms.push({ x: this.ufo.x, y: 58, t: 0.8, text: String(pts) });
            this.ufo = null;
            this.bullet = null;
            api.sfx.explode(0.6);
          }
        }
      }
      this.bombs = this.bombs.filter(b => !b.dead);

      // НЛО
      this.ufoT -= dt;
      if (!this.ufo && this.ufoT <= 0) {
        const d = Math.random() < 0.5 ? 1 : -1;
        this.ufo = { x: d > 0 ? -30 : W + 30, d };
        this.ufoT = 18 + Math.random() * 12;
      }
      if (this.ufo) {
        this.ufo.x += this.ufo.d * 110 * dt;
        if (this.ufo.x < -40 || this.ufo.x > W + 40) this.ufo = null;
      }
      S.loop('ufo', this.ufo ? { type: 'square', freq: 520, vol: 0.035, lfoRate: 7, lfoDepth: 140 } : null);
    },

    hitShield(x, y) {
      const hit = this.shields.find(s => x >= s.x - 1 && x <= s.x + 4 && y >= s.y - 2 && y <= s.y + 5);
      if (!hit) return false;
      this.shields = this.shields.filter(s => Math.hypot(s.x - hit.x, s.y - hit.y) > 6 || Math.random() < 0.3);
      return true;
    },

    killPlayer(api) {
      this.lives = Math.max(0, this.lives - 1);
      api.hud('ЖИЗНИ', this.lives);
      this.player.dead = 1.6;
      this.bullet = null;
      api.sfx.explode(1);
      api.sfx.hurt();
    },

    draw(ctx, api) {
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = 'rgba(255,255,255,0.4)';
      for (let i = 0; i < 40; i++) ctx.fillRect((i * 97) % W, (i * 53) % 420 + 20, 1.5, 1.5);

      for (const a of this.aliens) {
        if (!a.alive) continue;
        const r = this.alienRect(a);
        drawSprite(ctx, ROWS[a.r].s[this.frame], r.x, r.y, PX, ROWS[a.r].color);
      }
      if (this.ufo) drawSprite(ctx, UFO, this.ufo.x - UFO.w * 1.4, 50, 2.8, '#ff3030');

      ctx.fillStyle = '#39ff14';
      for (const s of this.shields) ctx.fillRect(s.x, s.y, 3, 3);

      if (this.player.dead <= 0) drawSprite(ctx, PLAYER, this.player.x - PLAYER.w * 1.25, PY - 6, 2.5, '#39ff14');
      else if (Math.floor(this.player.dead * 10) % 2) {
        ctx.fillStyle = '#39ff14';
        for (let i = 0; i < 12; i++) ctx.fillRect(this.player.x - 16 + Math.random() * 32, PY - 4 + Math.random() * 16, 3, 3);
      }

      ctx.fillStyle = '#fff';
      if (this.bullet) ctx.fillRect(this.bullet.x - 1, this.bullet.y - 8, 2.5, 10);
      ctx.fillStyle = '#ffd23f';
      for (const b of this.bombs) {
        const zig = Math.floor(b.t * 12) % 2 ? 2 : -2;
        ctx.fillRect(b.x - 1 + zig, b.y - 10, 3, 4);
        ctx.fillRect(b.x - 1 - zig, b.y - 6, 3, 4);
        ctx.fillRect(b.x - 1 + zig, b.y - 2, 3, 4);
      }

      for (const b of this.booms) {
        if (b.text) { api.text(b.text, b.x, b.y, { size: 10, color: '#ff3030' }); continue; }
        ctx.strokeStyle = b.color;
        ctx.lineWidth = 2;
        ctx.beginPath();
        for (let i = 0; i < 8; i++) {
          const ang = i * Math.PI / 4, r1 = 4, r2 = 13;
          ctx.moveTo(b.x + Math.cos(ang) * r1, b.y + Math.sin(ang) * r1);
          ctx.lineTo(b.x + Math.cos(ang) * r2, b.y + Math.sin(ang) * r2);
        }
        ctx.stroke();
      }

      ctx.fillStyle = '#39ff14';
      ctx.fillRect(0, GROUND, W, 2);
      for (let i = 0; i < this.lives - 1; i++) drawSprite(ctx, PLAYER, 14 + i * 40, GROUND + 6, 1.8, '#39ff14');
    },
  });
})();
