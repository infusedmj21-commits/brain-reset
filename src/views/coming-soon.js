import { esc } from '../ui.js';

export function renderComingSoon(el, { title, phase, body }) {
  el.innerHTML = `
    <div class="eyebrow">Coming in phase ${phase}</div>
    <h1>${esc(title)}</h1>
    <div class="card" style="margin-top:20px">
      <p>${esc(body)}</p>
    </div>`;
}
