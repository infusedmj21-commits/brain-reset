// Entry motion from the glass style guide: cards rise in, and one timer counts every number up.
// Runs on first load and on each page change, never on a redraw of the same page.

const reduce = window.matchMedia('(prefers-reduced-motion: reduce)');
const easeOut = (p) => 1 - (1 - p) ** 3;
const GROUPS = '.layout, .cols, .tiles, .side, section, aside, .home-top, .home-stats, .home-bottom, .vlist, .stack-lg';

/** The cards of a page in reading order, opening up layout wrappers one or two levels. */
function blocks(root) {
  const out = [];
  const walk = (el, depth) => {
    for (const c of el.children) {
      if (c.hidden || c.matches('script, style, form .vlist')) continue;
      if (depth < 2 && c.matches(GROUPS) && c.children.length) walk(c, depth + 1);
      else out.push(c);
    }
  };
  walk(root, 0);
  return out;
}

function rise(root, start) {
  blocks(root).forEach((el, i) => {
    el.classList.add('rise');
    el.style.animationDelay = `${(start + Math.min(i, 14) * 0.07).toFixed(2)}s`;
    el.addEventListener(
      'animationend',
      () => {
        el.classList.remove('rise');
        el.style.animationDelay = '';
      },
      { once: true }
    );
  });
}

// "£1,240.50", "71%", "12 days", "−£40": one number with text around it.
const NUM = /^([^\d]*?)(\d[\d,]*(?:\.\d+)?)([^\d]*)$/;

function counters(root) {
  const list = [];
  root.querySelectorAll('.stat-big, .vscore, .count, .big').forEach((el) => {
    if (el.children.length) return;
    const m = el.textContent.trim().match(NUM);
    if (!m) return;
    const decimals = m[2].includes('.') ? m[2].split('.')[1].length : 0;
    const target = Number(m[2].replace(/,/g, ''));
    if (!target) return;
    const grouping = m[2].includes(',');
    const fmt = (v) =>
      `${m[1]}${v.toLocaleString('en-GB', { minimumFractionDigits: decimals, maximumFractionDigits: decimals, useGrouping: grouping })}${m[3]}`;
    list.push({ el, target, fmt, final: el.textContent });
  });
  return list;
}

let frame = 0;
let entering = 0;
function countUp(root, delay) {
  cancelAnimationFrame(frame);
  const list = counters(root);
  const set = (t) => {
    root.style.setProperty('--t', String(t));
    for (const c of list) c.el.textContent = t >= 1 ? c.final : c.fmt(c.target * t);
  };
  set(0);
  const begin = performance.now() + delay * 1000;
  const step = (now) => {
    const p = Math.min(1, Math.max(0, (now - begin) / 1400));
    set(p >= 1 ? 1 : easeOut(p));
    if (p < 1) frame = requestAnimationFrame(step);
  };
  frame = requestAnimationFrame(step);
}

/** Call after a page renders. `first` is the very first page after the splash. */
export function animatePage(root, { first = false } = {}) {
  if (reduce.matches) return;
  rise(root, first ? 1.2 : 0);
  countUp(root, first ? 1.35 : 0.3);
  // Sparklines draw left to right once the cards have landed.
  root.style.setProperty('--spark-delay', first ? '1.6s' : '0.45s');
  root.classList.add('entering');
  clearTimeout(entering);
  entering = setTimeout(() => root.classList.remove('entering'), (first ? 3.3 : 2.1) * 1000);
}

/** Splash and shell entrance on first load. */
export function startEntrance() {
  const splash = document.getElementById('splash');
  if (reduce.matches) {
    splash?.remove();
    return;
  }
  const shell = document.querySelector('.shell');
  shell?.classList.add('enter');
  setTimeout(() => shell?.classList.remove('enter'), 2100);
  setTimeout(() => splash?.remove(), 1950);
}
