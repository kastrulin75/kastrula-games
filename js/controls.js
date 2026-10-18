'use strict';

// Отрисовка управления клавишами-«кнопками» и SVG-иконками — для страницы игры и окна «Подробнее».
// Обозначения в keys: arrows, lr, ud, up/down/left/right, wasd, space, shift, esc, 1-3,
// одна буква — клавиша; mouse, click, rclick, touch, swipe, drag — иконки мыши и касаний.
const Controls = (() => {
  const CAPS = { space: 'Пробел', shift: 'Shift', enter: 'Enter', esc: 'Esc' };
  const DEVICES = { mouse: 'Мышь', click: 'Клик', rclick: 'Правый клик', touch: 'Касание', swipe: 'Свайп', drag: 'Перетаскивание' };
  const cap = (inner, cls = '') => `<kbd class="key ${cls}">${inner}</kbd>`;

  function keyHtml(token) {
    if (token === 'arrows') return `<span class="keys-t">${cap(Icons.up, 'k-ico')}<span>${cap(Icons.left, 'k-ico')}${cap(Icons.down, 'k-ico')}${cap(Icons.right, 'k-ico')}</span></span>`;
    if (token === 'lr') return cap(Icons.left, 'k-ico') + cap(Icons.right, 'k-ico');
    if (token === 'ud') return cap(Icons.up, 'k-ico') + cap(Icons.down, 'k-ico');
    if (['up', 'down', 'left', 'right'].includes(token)) return cap(Icons[token], 'k-ico');
    if (token === 'wasd') return ['W', 'A', 'S', 'D'].map(k => cap(k)).join('');
    if (token === '1-3') return ['1', '2', '3'].map(k => cap(k)).join('');
    if (DEVICES[token]) return `<span class="dev" title="${DEVICES[token]}">${Icons[token]}</span>`;
    return cap(CAPS[token] || token, CAPS[token] ? 'k-wide' : '');
  }

  function html(list) {
    return list.map(([tokens, action]) =>
      `<li><span class="keys">${tokens.map(keyHtml).join('<span class="or">/</span>')}</span><span class="act">${action}</span></li>`).join('');
  }

  return { html };
})();
