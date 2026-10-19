'use strict';

// Меню: карточки с живыми превью игр, окно «Подробнее», навигация с клавиатуры, звуки интерфейса.
(() => {
  const grid = document.getElementById('grid');
  const TIME_BEST = { minesweeper: 'minesweeper-easy' };
  const cards = new Map(); // id: { el, link, canvas, preview, game, index }
  let active = null;

  function bestOf(id) {
    const key = 'arcade-best-' + (TIME_BEST[id] || id);
    try { return Number(localStorage.getItem(key)) || 0; } catch { return 0; }
  }
  function fmtBest(id, v) {
    if (!TIME_BEST[id]) return String(v);
    return `${Math.floor(v / 60)}:${String(Math.floor(v % 60)).padStart(2, '0')}`;
  }

  function launch(href, el) {
    Sound.init();
    Sound.sfx.select();
    if (typeof MenuMusic !== 'undefined') MenuMusic.fadeOut(200);
    if (el) el.classList.add('launch');
    setTimeout(() => { location.href = href; }, 220);
  }

  function build() {
    GAMES.forEach((g, i) => {
      const card = document.createElement('article');
      card.className = 'card';
      card.style.setProperty('--c', g.color);
      card.style.setProperty('--i', i);
      const best = bestOf(g.id);
      card.innerHTML = `
        <a class="card-link" href="play.html?game=${g.id}" tabindex="-1">
          <div class="thumb">
            <canvas></canvas>
            <span class="play-chip">${Icons.play}ИГРАТЬ</span>
          </div>
        </a>
        <div class="info">
          <span class="num">${String(i + 1).padStart(2, '0')}</span>
          <div class="names">
            <h2><a class="title-link" href="play.html?game=${g.id}">${g.title}</a></h2>
            <button class="more" type="button">${Icons.info}Подробнее</button>
          </div>
          ${best ? `<span class="best" title="Рекорд">${Icons.trophy}${fmtBest(g.id, best)}</span>` : ''}
        </div>`;
      const link = card.querySelector('.title-link');
      const thumbLink = card.querySelector('.card-link');
      const enter = () => { if (!detail.open) { setActive(g.id); Sound.sfx.hover(); } };
      card.addEventListener('mouseenter', enter);
      card.addEventListener('focusin', enter);
      card.addEventListener('mouseleave', () => { if (active === g.id && !card.contains(document.activeElement) && !detail.open) setActive(null); });
      card.addEventListener('focusout', e => { if (active === g.id && !card.contains(e.relatedTarget) && !detail.open) setActive(null); });
      for (const a of [link, thumbLink]) {
        a.addEventListener('click', e => {
          if (e.ctrlKey || e.metaKey || e.shiftKey) return;
          e.preventDefault();
          launch(a.href, card);
        });
      }
      card.querySelector('.more').addEventListener('click', () => openDetail(g.id));
      grid.appendChild(card);
      cards.set(g.id, { el: card, link, canvas: card.querySelector('canvas'), preview: null, game: g, index: i });
    });
  }

  // Переносим кадр игры на холст: cover — заполнить с обрезкой, contain — показать целиком
  function blitTo(c, p, mode = 'cover') {
    if (!p) return;
    const w = c.clientWidth, h = c.clientHeight;
    if (!w || !h) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    if (c.width !== Math.round(w * dpr) || c.height !== Math.round(h * dpr)) { c.width = Math.round(w * dpr); c.height = Math.round(h * dpr); }
    const ctx = c.getContext('2d');
    const s = mode === 'cover' ? Math.max(c.width / p.W, c.height / p.H) : Math.min(c.width / p.W, c.height / p.H);
    const dw = p.W * s, dh = p.H * s;
    ctx.imageSmoothingQuality = 'high';
    if (mode === 'contain') {
      ctx.clearRect(0, 0, c.width, c.height);
      ctx.drawImage(p.canvas, (c.width - dw) / 2, (c.height - dh) / 2, dw, dh);
      return;
    }
    const dy = Math.min(0, Math.max(c.height - dh, c.height / 2 - dh * p.focus));
    const dx = Math.min(0, Math.max(c.width - dw, c.width / 2 - dw * p.focusX));
    ctx.drawImage(p.canvas, dx, dy, dw, dh);
  }
  const blit = card => blitTo(card.canvas, card.preview);

  function setActive(id) {
    if (active === id) return;
    if (active && cards.get(active)) cards.get(active).el.classList.remove('live');
    active = id;
    if (id && cards.get(id)) cards.get(id).el.classList.add('live');
  }

  // ---------- Окно «Подробнее» ----------
  const detail = (() => {
    const root = document.createElement('div');
    root.className = 'detail';
    root.hidden = true;
    root.innerHTML = `
      <div class="detail-shade"></div>
      <section class="detail-win" role="dialog" aria-modal="true" aria-labelledby="detail-title">
        <button class="detail-close" type="button" aria-label="Закрыть">${Icons.close}</button>
        <div class="detail-media"><canvas></canvas></div>
        <div class="detail-body">
          <div class="detail-head">
            <span class="detail-num"></span>
            <div>
              <h2 id="detail-title" class="detail-title"></h2>
              <span class="detail-en"></span>
            </div>
          </div>
          <p class="detail-desc"></p>
          <h3>Как играть</h3>
          <p class="detail-how"></p>
          <div class="detail-best"></div>
          <h3>Управление</h3>
          <ul class="controls detail-controls"></ul>
          <div class="detail-actions">
            <a class="detail-play" href="#">${Icons.play}ИГРАТЬ</a>
            <button class="detail-back" type="button">Назад</button>
          </div>
        </div>
      </section>`;
    document.body.appendChild(root);
    return {
      root,
      win: root.querySelector('.detail-win'),
      canvas: root.querySelector('.detail-media canvas'),
      open: null,
      busy: false,
    };
  })();
  const q = sel => detail.root.querySelector(sel);

  function cardRect(id) { return cards.get(id).el.getBoundingClientRect(); }

  // Анимация «из карточки в окно» и обратно: считаем сдвиг и масштаб между прямоугольниками
  function flipFrom(r) {
    const w = detail.win.getBoundingClientRect();
    detail.win.style.transition = 'none';
    detail.win.style.transformOrigin = '0 0';
    detail.win.style.transform = `translate(${r.left - w.left}px, ${r.top - w.top}px) scale(${r.width / w.width}, ${r.height / w.height})`;
    void detail.win.offsetWidth;
    detail.win.style.transition = 'transform 0.5s cubic-bezier(0.2, 0.85, 0.25, 1)';
    detail.win.style.transform = '';
  }
  function flipTo(r) {
    const w = detail.win.getBoundingClientRect();
    detail.win.style.transition = 'transform 0.38s cubic-bezier(0.5, 0, 0.75, 0)';
    detail.win.style.transformOrigin = '0 0';
    detail.win.style.transform = `translate(${r.left - w.left}px, ${r.top - w.top}px) scale(${r.width / w.width}, ${r.height / w.height})`;
  }

  function openDetail(id) {
    if (detail.open || detail.busy) return;
    const c = cards.get(id), g = c.game;
    detail.open = id;
    detail.busy = true;
    setActive(id);
    Sound.init();
    Sound.sfx.whoosh();
    if (typeof MenuMusic !== 'undefined') MenuMusic.setUnderwater(true);

    detail.root.style.setProperty('--c', g.color);
    q('.detail-num').textContent = String(c.index + 1).padStart(2, '0');
    q('.detail-title').textContent = g.title;
    q('.detail-en').textContent = g.en !== g.title ? g.en : '';
    q('.detail-desc').textContent = g.desc;
    q('.detail-how').textContent = g.how || '';
    const best = bestOf(id);
    q('.detail-best').innerHTML = `${Icons.trophy}<div><span>РЕКОРД</span><b>${best ? fmtBest(id, best) : 'ещё нет'}</b></div>`;
    q('.detail-controls').innerHTML = Controls.html(g.keys || []);
    q('.detail-play').href = `play.html?game=${id}`;
    q('.detail-body').scrollTop = 0;

    detail.root.hidden = false;
    document.documentElement.classList.add('detail-open');
    void detail.root.offsetWidth;
    detail.root.classList.add('open');
    flipFrom(cardRect(id));
    blitTo(detail.canvas, c.preview, 'contain');
    setTimeout(() => {
      detail.busy = false;
      q('.detail-play').focus({ preventScroll: true });
    }, 500);
  }

  function closeDetail() {
    if (!detail.open || detail.busy) return;
    const id = detail.open;
    detail.busy = true;
    Sound.sfx.blip(0.8);
    if (typeof MenuMusic !== 'undefined') MenuMusic.setUnderwater(false);
    detail.root.classList.remove('open');
    flipTo(cardRect(id));
    setTimeout(() => {
      detail.root.hidden = true;
      detail.win.style.transition = 'none';
      detail.win.style.transform = '';
      document.documentElement.classList.remove('detail-open');
      detail.open = null;
      detail.busy = false;
      const c = cards.get(id);
      c.link.focus({ preventScroll: true });
    }, 380);
  }

  q('.detail-shade').addEventListener('click', closeDetail);
  q('.detail-close').addEventListener('click', closeDetail);
  q('.detail-back').addEventListener('click', closeDetail);
  q('.detail-play').addEventListener('click', e => {
    if (e.ctrlKey || e.metaKey || e.shiftKey) return;
    e.preventDefault();
    launch(q('.detail-play').href, null);
  });

  // ---------- Живое превью ----------
  let last = performance.now();
  function loop(now) {
    const dt = Math.max(0, Math.min(0.05, (now - last) / 1000));
    last = now;
    const card = active && cards.get(active);
    if (card && card.preview && !card.preview.broken) {
      card.preview.step(dt);
      card.preview.render();
      blit(card);
      if (detail.open === active) blitTo(detail.canvas, card.preview, 'contain');
    }
    requestAnimationFrame(loop);
  }

  // Готовим стартовые кадры: каждую игру прогоняем несколько секунд с автопилотом
  async function prepare() {
    await Preview.load(GAMES.map(g => g.id));
    try { await document.fonts.ready; } catch { /* не важно */ }
    for (const g of GAMES) {
      const card = cards.get(g.id);
      const p = Preview.create(g.id);
      if (!p) continue;
      card.preview = p;
      p.warmup();
      p.render();
      blit(card);
      card.el.classList.add('ready');
      await new Promise(r => requestAnimationFrame(r));
    }
  }

  // Стрелки двигают фокус по сетке карточек
  function moveFocus(code) {
    const list = [...cards.values()];
    const i = list.findIndex(c => c.el.contains(document.activeElement));
    if (i < 0) { list[0].link.focus(); return; }
    let j = i;
    if (code === 'ArrowLeft') j = Math.max(0, i - 1);
    else if (code === 'ArrowRight') j = Math.min(list.length - 1, i + 1);
    else {
      const cur = list[i].el, down = code === 'ArrowDown';
      let bestD = Infinity;
      list.forEach((c, k) => {
        const dy = c.el.offsetTop - cur.offsetTop;
        if (down ? dy <= 0 : dy >= 0) return;
        const d = Math.abs(dy) * 10 + Math.abs(c.el.offsetLeft - cur.offsetLeft);
        if (d < bestD) { bestD = d; j = k; }
      });
    }
    list[j].link.focus();
    list[j].el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }

  const introRunning = () => document.documentElement.classList.contains('intro');

  addEventListener('keydown', e => {
    Sound.init();
    if (introRunning()) return;
    if (detail.open) {
      if (e.code === 'Escape') { e.preventDefault(); closeDetail(); }
      return;
    }
    if (e.code.startsWith('Arrow')) { e.preventDefault(); moveFocus(e.code); }
    // I — «Подробнее» для карточки в фокусе
    if (e.code === 'KeyI') {
      const c = [...cards.values()].find(x => x.el.contains(document.activeElement));
      if (c) openDetail(c.game.id);
    }
  });
  addEventListener('pointerdown', () => Sound.init());
  addEventListener('resize', () => {
    for (const c of cards.values()) blit(c);
    if (detail.open) blitTo(detail.canvas, cards.get(detail.open).preview, 'contain');
  });

  build();
  requestAnimationFrame(loop);
  // Пока идёт интро, тяжёлую подготовку превью не запускаем, чтобы анимация не дёргалась
  if (introRunning()) addEventListener('kg:intro-done', prepare, { once: true });
  else prepare();
})();
