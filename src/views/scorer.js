import { ANCHORS, FACTORS, VERDICTS, formatScore, score, verdict } from '../logic/scoring.js';
import { esc } from '../ui.js';

// Three anchored sliders with a live verdict. Used for ventures, tasks and new ideas.

export function verdictChip(value) {
  const v = verdict(value);
  if (!v) return '<span class="vchip v-none">Needs a score</span>';
  return `<span class="vchip v-${VERDICTS[v].colour}">${VERDICTS[v].label}</span>`;
}

export function scorerHTML(prefix, ratings = {}, { compact = false } = {}) {
  const r = { impact: 3, urgency: 2, effort: 2, ...ratings };
  const value = score(r);
  const sliders = FACTORS.map(
    ({ key, label }) => `
    <div class="slider">
      <div class="slider-top"><label for="${prefix}-${key}">${label}</label><strong class="num" data-out="${key}">${r[key]}</strong></div>
      <input type="range" id="${prefix}-${key}" name="${key}" min="1" max="5" step="1" value="${r[key]}">
      ${compact ? '' : `<div class="muted small" data-hint="${key}">${esc(ANCHORS[key][r[key] - 1])}</div>`}
    </div>`
  ).join('');
  return `<div class="scorer" data-scorer="${prefix}">
    ${sliders}
    <div class="verdict-box v-${VERDICTS[verdict(value)].colour}" data-verdict>
      <span><span class="small" data-formula>(${r.impact} + ${r.urgency}) ÷ ${r.effort}</span><strong data-label>${VERDICTS[verdict(value)].label}</strong></span>
      <span class="big num" data-score>${formatScore(value)}</span>
    </div>
  </div>`;
}

/** Wire up a scorer; returns a getter for the current ratings. */
export function bindScorer(root, prefix) {
  const box = root.querySelector(`[data-scorer="${prefix}"]`);
  const read = () => Object.fromEntries(FACTORS.map(({ key }) => [key, Number(box.querySelector(`[name="${key}"]`).value)]));
  const update = () => {
    const r = read();
    const value = score(r);
    const v = VERDICTS[verdict(value)];
    for (const { key } of FACTORS) {
      box.querySelector(`[data-out="${key}"]`).textContent = r[key];
      const hint = box.querySelector(`[data-hint="${key}"]`);
      if (hint) hint.textContent = ANCHORS[key][r[key] - 1];
    }
    const vb = box.querySelector('[data-verdict]');
    vb.className = `verdict-box v-${v.colour}`;
    vb.querySelector('[data-formula]').textContent = `(${r.impact} + ${r.urgency}) ÷ ${r.effort}`;
    vb.querySelector('[data-label]').textContent = v.label;
    vb.querySelector('[data-score]').textContent = formatScore(value);
  };
  box.querySelectorAll('input[type=range]').forEach((i) => i.addEventListener('input', update));
  return read;
}
