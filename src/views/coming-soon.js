import { esc } from '../ui.js';
import { HABIT_LOOK } from './look.js';

export function renderComingSoon(el, { title, phase, body, habit, features = [] }) {
  const look = HABIT_LOOK[habit] ?? HABIT_LOOK.palace;
  el.innerHTML = `
    <div class="eyebrow">Coming in phase ${phase}</div>
    <h1 class="page-title">${esc(title)}</h1>
    <div class="soon">
      <div class="card m-${look.colour}" style="background:var(--soft)">
        <div class="stack">
          <div class="shape ${look.shape}" style="width:72px;height:72px;font-size:34px" aria-hidden="true">${look.emoji}</div>
          <p style="font-size:17px">${esc(body)}</p>
        </div>
      </div>
      ${
        features.length
          ? `<div class="card top-${look.colour}"><h3>What’s planned</h3><ul class="muted" style="margin:10px 0 0;padding-left:20px">${features
              .map((f) => `<li style="margin-bottom:4px">${esc(f)}</li>`)
              .join('')}</ul></div>`
          : ''
      }
    </div>`;
}
