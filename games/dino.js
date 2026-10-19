'use strict';

(() => {
  const W = 800, H = 300, GROUND = 250, PX = 3;
  const DINO_X = 60;
  const GRAV = 2700, JUMP = -880, SHORT_HOP = -380;

  // Пиксельные спрайты: '#' — цвет «чернил», 'e' — глаз (цвет фона)
  const parse = rows => ({ rows, w: Math.max(...rows.map(r => r.length)), h: rows.length });
  const BODY_TOP = [
    '..........########..',
    '.........##e#######.',
    '.........##########.',
    '.........##########.',
    '.........##########.',
    '.........#####......',
    '.........########...',
    '#.......#####.......',
    '#......#######......',
    '##....#########.....',
    '###..##########.....',
    '#############.##....',
    '#############.......',
    '.###########........',
    '..#########.........',
    '...########.........',
  ];
  const DINO = {
    stand: parse([...BODY_TOP, '....###..##.........', '....##....#.........', '....#.....#.........', '....##....##........']),
    runA: parse([...BODY_TOP, '....###..##.........', '....##....##........', '....#...............', '....##..............']),
    runB: parse([...BODY_TOP, '....###..##.........', '.....##...#.........', '..........#.........', '..........##........']),
    dead: parse([
      '..........########..',
      '.........##.#.#####.',
      '.........###.######.',
      '.........##.#.#####.',
      ...BODY_TOP.slice(4),
      '....###..##.........', '....##....#.........', '....#.....#.........', '....##....##........',
    ]),
    duckA: parse([
      '#..........................#######.',
      '##........................##e######',
      '###.....#########........#########',
      '###########################........',
      '.##########################........',
      '..#######################..........',
      '....######......###................',
      '.....##..........##................',
      '.....###.........###...............',
    ]),
    duckB: parse([
      '#..........................#######.',
      '##........................##e######',
      '###.....#########........#########',
      '###########################........',
      '.##########################........',
      '..#######################..........',
      '....######......###................',
      '......##.........##................',
      '......###.........##...............',
    ]),
  };
  const BIRD = [
    parse([
      '.....##.............',
      '....###.............',
      '...####.............',
      '..#####.............',
      '.##e###.....####....',
      '################....',
      '...##############...',
      '.....##############.',
      '......###########...',
      '.......######.......',
    ]),
    parse([
      '....................',
      '....................',
      '....................',
      '.....##.............',
      '....##e#....####....',
      '################....',
      '...##############...',
      '.....############...',
      '.......#######......',
      '........######......',
      '..........####......',
      '...........##.......',
    ]),
  ];

  function drawSprite(ctx, sp, x, y, ink, bg) {
    for (let r = 0; r < sp.h; r++) {
      const row = sp.rows[r];
      for (let c = 0; c < row.length; c++) {
        const ch = row[c];
        if (ch === '.') continue;
        ctx.fillStyle = ch === 'e' ? bg : ink;
        ctx.fillRect(x + c * PX, y + r * PX, PX + 0.6, PX + 0.6); // лёгкий нахлёст убирает швы при масштабировании
      }
    }
  }

  // Кактус: ствол и «руки», нарисованные блоками
  function drawCactus(ctx, o, ink) {
    const { x, w, h } = o;
    const stems = Math.max(1, Math.round(w / 22));
    const sw = w / stems;
    for (let i = 0; i < stems; i++) {
      const cx = x + i * sw + sw / 2;
      const tw = Math.max(6, sw * 0.32), th = h * (i % 2 ? 0.86 : 1);
      ctx.fillStyle = ink;
      ctx.fillRect(cx - tw / 2, GROUND - th, tw, th);
      const aw = tw * 0.6;
      ctx.fillRect(cx - tw / 2 - aw * 1.6, GROUND - th * 0.72, aw, th * 0.32);
      ctx.fillRect(cx - tw / 2 - aw * 1.6, GROUND - th * 0.45, aw * 1.6, aw);
      ctx.fillRect(cx + tw / 2 + aw * 0.6, GROUND - th * 0.82, aw, th * 0.36);
      ctx.fillRect(cx + tw / 2, GROUND - th * 0.5, aw * 1.6, aw);
    }
  }

  Arcade.register({
    width: W,
    height: H,
    pointerAction: true,

    start(api) {
      this.d = { y: GROUND, vy: 0, ground: true, duck: false, dead: false, leg: 0 };
      this.speed = 380;
      this.dist = 0;
      this.obs = [];
      this.nextGap = 600;
      this.clouds = [{ x: 300, y: 70 }, { x: 620, y: 110 }, { x: 900, y: 60 }];
      this.stars = Array.from({ length: 24 }, () => ({ x: Math.random() * W, y: 20 + Math.random() * 150 }));
      this.groundOff = 0;
      this.started = false;
      this.flash = 0;
      this.night = 0;
      this.deadT = 0;
      this.lastHundred = 0;
      api.score = 0;
    },

    spawn(api) {
      const score = api.score;
      const birdChance = score > 250 ? 0.3 : 0;
      if (Math.random() < birdChance) {
        const level = api.pick([GROUND - 12, GROUND - 38, GROUND - 80]);
        this.obs.push({ kind: 'bird', x: W + 40, y: level, w: 60, h: 30, flap: 0 });
      } else {
        const big = Math.random() < 0.45;
        const n = api.randInt(1, score > 150 ? 3 : 2);
        const w = (big ? 26 : 18) * n;
        this.obs.push({ kind: 'cactus', x: W + 20, w, h: big ? api.rand(56, 66) : api.rand(36, 44) });
      }
      // расстояние до следующего препятствия растёт со скоростью, чтобы прыжок успевал
      this.nextGap = this.speed * api.rand(0.75, 1.35) + 120;
    },

    update(dt, api) {
      const d = this.d;
      const jumpPressed = api.pressed('action') || api.pressed('up');
      const jumpHeld = api.held('action') || api.held('up');
      d.duck = api.held('down') && !d.dead;

      if (!this.started) {
        if (jumpPressed) { this.started = true; this.jump(api); }
        return;
      }

      if (d.dead) {
        this.deadT += dt;
        if (this.deadT > 0.5) api.gameOver(`Счёт: ${Math.floor(api.score)}`, { quiet: true });
        return;
      }

      // скорость, дистанция, очки
      this.speed = Math.min(1000, this.speed + dt * 9);
      const dx = this.speed * dt;
      this.dist += dx;
      api.score = Math.floor(this.dist / 40);
      const hundred = Math.floor(api.score / 100);
      if (hundred > this.lastHundred) {
        this.lastHundred = hundred;
        this.flash = 1;
        api.sound.tone({ freq: 1046, dur: 0.07, type: 'square', vol: 0.12 });
        api.sound.tone({ freq: 1568, dur: 0.12, type: 'square', vol: 0.12, when: 0.08 });
      }
      this.flash = Math.max(0, this.flash - dt * 1.4);
      // ночь наступает на каждой 700-й отметке и длится до следующей
      const wantNight = Math.floor(api.score / 700) % 2 === 1 ? 1 : 0;
      this.night += (wantNight - this.night) * Math.min(1, dt * 1.5);

      // прыжок
      if (jumpPressed && d.ground && !d.duck) this.jump(api);
      if (!d.ground) {
        if (!jumpHeld && d.vy < SHORT_HOP) d.vy = SHORT_HOP;   // короткий прыжок, если отпустить
        d.vy += GRAV * (d.duck ? 2.4 : 1) * dt;                  // вниз в воздухе — быстрое падение
        d.y += d.vy * dt;
        if (d.y >= GROUND) { d.y = GROUND; d.vy = 0; d.ground = true; }
      }
      d.leg += dt * this.speed / 40;

      // препятствия
      for (const o of this.obs) {
        o.x -= dx * (o.kind === 'bird' ? 1.08 : 1);
        if (o.kind === 'bird') o.flap += dt;
      }
      this.obs = this.obs.filter(o => o.x + o.w > -20);
      const last = this.obs[this.obs.length - 1];
      if (!last || W - (last.x + last.w) > this.nextGap) this.spawn(api);

      for (const c of this.clouds) { c.x -= dx * 0.2; if (c.x < -80) { c.x = W + Math.random() * 200; c.y = 40 + Math.random() * 90; } }
      for (const s of this.stars) { s.x -= dx * 0.05; if (s.x < 0) s.x += W; }
      this.groundOff = (this.groundOff + dx) % 40;

      // столкновения — по «урезанным» прямоугольникам, чтобы касание краешком не убивало
      const box = d.duck && d.ground
        ? { x: DINO_X + 6, y: d.y - 26, w: 92, h: 22 }
        : { x: DINO_X + 12, y: d.y - 58, w: 34, h: 54 };
      for (const o of this.obs) {
        const ob = o.kind === 'bird'
          ? { x: o.x + 8, y: o.y - o.h + 6, w: o.w - 16, h: o.h - 12 }
          : { x: o.x + 4, y: GROUND - o.h + 4, w: o.w - 8, h: o.h - 4 };
        if (box.x < ob.x + ob.w && box.x + box.w > ob.x && box.y < ob.y + ob.h && box.y + box.h > ob.y) {
          d.dead = true;
          api.sound.tone({ freq: 220, freqEnd: 90, dur: 0.35, type: 'square', vol: 0.18 });
          api.sfx.hit();
          break;
        }
      }
    },

    jump(api) {
      const d = this.d;
      d.vy = JUMP;
      d.ground = false;
      api.sound.tone({ freq: 640, freqEnd: 900, dur: 0.07, type: 'square', vol: 0.12 });
    },

    draw(ctx, api) {
      const n = this.night;
      const mix = (a, b) => `rgb(${a.map((v, i) => Math.round(v + (b[i] - v) * n)).join(',')})`;
      const bg = mix([247, 247, 247], [24, 25, 32]);
      const ink = mix([83, 83, 83], [228, 228, 228]);
      const soft = mix([200, 200, 200], [90, 92, 105]);
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, W, H);

      // ночное небо
      if (n > 0.02) {
        ctx.globalAlpha = n;
        ctx.fillStyle = '#f0f0f0';
        for (const s of this.stars) ctx.fillRect(s.x, s.y, 2, 2);
        ctx.beginPath(); ctx.arc(W - 110, 60, 16, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = bg;
        ctx.beginPath(); ctx.arc(W - 102, 55, 14, 0, Math.PI * 2); ctx.fill();
        ctx.globalAlpha = 1;
      }

      // облака
      ctx.fillStyle = soft;
      for (const c of this.clouds) {
        ctx.fillRect(c.x + 12, c.y, 40, 6);
        ctx.fillRect(c.x + 4, c.y + 6, 60, 6);
        ctx.fillRect(c.x, c.y + 12, 72, 4);
      }

      // земля
      ctx.fillStyle = ink;
      ctx.fillRect(0, GROUND - 2, W, 2);
      for (let x = -this.groundOff; x < W; x += 40) {
        ctx.fillRect(x + 6, GROUND + 6, 6, 2);
        ctx.fillRect(x + 22, GROUND + 12, 3, 2);
        ctx.fillRect(x + 31, GROUND + 4, 4, 2);
      }

      // препятствия
      for (const o of this.obs) {
        if (o.kind === 'cactus') drawCactus(ctx, o, ink);
        else drawSprite(ctx, BIRD[Math.floor(o.flap * 6) % 2], o.x, o.y - BIRD[0].h * PX, ink, bg);
      }

      // динозавр
      const d = this.d;
      let sp;
      if (d.dead) sp = DINO.dead;
      else if (!this.started || !d.ground) sp = DINO.stand;
      else if (d.duck) sp = Math.floor(d.leg) % 2 ? DINO.duckA : DINO.duckB;
      else sp = Math.floor(d.leg) % 2 ? DINO.runA : DINO.runB;
      drawSprite(ctx, sp, DINO_X, d.y - sp.h * PX, ink, bg);

      // счёт как в оригинале: мигает на каждой сотне
      const show = this.flash <= 0 || Math.floor(this.flash * 8) % 2 === 0;
      const sc = String(Math.floor(api.score)).padStart(5, '0');
      if (show) api.text(sc, W - 24, 30, { size: 16, align: 'right', color: ink });
      if (api.best) api.text('HI ' + String(Math.floor(api.best)).padStart(5, '0'), W - 140, 30, { size: 16, align: 'right', color: soft });

      if (!this.started && api.state === 'playing') api.text('ПРОБЕЛ / ТАП — СТАРТ', W / 2, 120, { size: 12, color: ink });
      if (d.dead) {
        api.text('G A M E   O V E R', W / 2, 110, { size: 18, color: ink });
      }
    },
  });
})();
