import { esc } from '../ui.js';

// Placeholder for tabs still being built today.
export function soon(title, what) {
  return async (el) => {
    el.innerHTML = `
      <h1 class="page-title">${esc(title)}</h1>
      <div class="card stack" style="margin-top:18px">
        <p><strong>Coming next.</strong></p>
        <p class="muted">${esc(what)}</p>
      </div>`;
  };
}
