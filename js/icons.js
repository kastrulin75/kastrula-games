'use strict';

// SVG-иконки интерфейса (viewBox 0 0 24 24, цвет — currentColor).
const Icons = (() => {
  const stroke = body => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
  const solid = body => `<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">${body}</svg>`;
  return {
    left: stroke('<path d="M15 5l-7 7 7 7"/>'),
    right: stroke('<path d="M9 5l7 7-7 7"/>'),
    up: stroke('<path d="M5 15l7-7 7 7"/>'),
    down: stroke('<path d="M5 9l7 7 7-7"/>'),
    action: solid('<circle cx="12" cy="12" r="6.5"/>'),
    action2: solid('<rect x="5.5" y="5.5" width="13" height="13" rx="2.5"/>'),
    rotate: stroke('<path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3"/><path d="M19.5 4v5h-5"/>'),
    drop: stroke('<path d="M12 3.5v11"/><path d="M6.5 9.5l5.5 5.5 5.5-5.5"/><path d="M5 20h14"/>'),
    swap: stroke('<path d="M4 8h15l-3.5-3.5"/><path d="M20 16H5l3.5 3.5"/>'),
    warp: solid('<path d="M12 2.5l2.4 6.6 7.1.3-5.6 4.4 1.9 6.8L12 16.7l-5.8 3.9 1.9-6.8-5.6-4.4 7.1-.3z"/>'),
    pause: solid('<rect x="6" y="5" width="4.2" height="14" rx="1.2"/><rect x="13.8" y="5" width="4.2" height="14" rx="1.2"/>'),
    play: solid('<path d="M8 5.2v13.6a1 1 0 0 0 1.5.9l10.6-6.8a1 1 0 0 0 0-1.7L9.5 4.3A1 1 0 0 0 8 5.2z"/>'),
    soundOn: stroke('<path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" fill="currentColor"/><path d="M15.5 9a4 4 0 0 1 0 6"/><path d="M18.2 6.3a8 8 0 0 1 0 11.4"/>'),
    soundOff: stroke('<path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" fill="currentColor"/><path d="M16 9.5l5 5"/><path d="M21 9.5l-5 5"/>'),
    back: stroke('<path d="M14.5 5l-7 7 7 7"/>'),
    restart: stroke('<path d="M4.5 12a7.5 7.5 0 1 0 2.2-5.3"/><path d="M4.5 4v5h5"/>'),
    mouse: stroke('<rect x="6.5" y="3" width="11" height="18" rx="5.5"/><path d="M12 3v6"/>'),
    click: stroke('<rect x="6.5" y="3" width="11" height="18" rx="5.5"/><path d="M12 3v6"/><path d="M12 3.4v5.6H6.9V8.5A5.1 5.1 0 0 1 12 3.4z" fill="currentColor"/>'),
    rclick: stroke('<rect x="6.5" y="3" width="11" height="18" rx="5.5"/><path d="M12 3v6"/><path d="M12 3.4v5.6h5.1V8.5A5.1 5.1 0 0 0 12 3.4z" fill="currentColor"/>'),
    touch: stroke('<circle cx="12" cy="12" r="3.2" fill="currentColor"/><circle cx="12" cy="12" r="7.5" stroke-dasharray="3 3"/>'),
    swipe: stroke('<circle cx="5.5" cy="12" r="2.6" fill="currentColor"/><path d="M10 12h10"/><path d="M16.5 8.5L20 12l-3.5 3.5"/>'),
    info: stroke('<circle cx="12" cy="12" r="9"/><path d="M12 11v6"/><circle cx="12" cy="7.6" r="0.6" fill="currentColor"/>'),
    close: stroke('<path d="M6 6l12 12M18 6L6 18"/>'),
    trophy: stroke('<path d="M8 4h8v5a4 4 0 0 1-8 0z"/><path d="M8 6H5a3 3 0 0 0 3 4M16 6h3a3 3 0 0 1-3 4"/><path d="M12 13v4M8.5 20h7"/>'),
    drag: stroke('<path d="M12 3.5v17M3.5 12h17"/><path d="M9 6.5l3-3 3 3M9 17.5l3 3 3-3M6.5 9l-3 3 3 3M17.5 9l3 3-3 3"/>'),
  };
})();
