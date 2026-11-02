import '@fontsource/fredoka/latin-500.css';
import '@fontsource/fredoka/latin-600.css';
import '@fontsource/nunito/latin-600.css';
import '@fontsource/nunito/latin-700.css';
import '@fontsource/nunito/latin-800.css';
import './styles.css';
import { applyTheme } from './theme.js';
import { registerSW } from 'virtual:pwa-register';
import { renderToday } from './views/today.js';
import { renderSettings } from './views/settings.js';
import { renderProgress } from './views/progress.js';
import { renderPalace } from './views/palace.js';
import { renderUnprompted } from './views/unprompted.js';
import { renderSprint } from './views/sprint.js';

const routes = {
  today: renderToday,
  palace: renderPalace,
  unprompted: renderUnprompted,
  sprint: renderSprint,
  progress: renderProgress,
  settings: renderSettings
};

const view = document.getElementById('view');

// Views can register cleanups (timers, object URLs) that run before the next render.
let cleanups = [];
function runCleanups() {
  for (const fn of cleanups) {
    try {
      fn();
    } catch (err) {
      console.error(err);
    }
  }
  cleanups = [];
}

async function render() {
  runCleanups();
  // Routes look like #/palace or #/unprompted/session/<id>.
  const [name = 'today', ...params] = location.hash.replace(/^#\/?/, '').split('/').filter(Boolean);
  const route = routes[name] ? name : 'today';
  const ctx = { params, onCleanup: (fn) => cleanups.push(fn) };
  const tab = route === 'sprint' ? 'today' : route;
  document.querySelectorAll('.tabbar a').forEach((a) => {
    if (a.dataset.tab === tab) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  });
  try {
    await routes[route](view, render, ctx);
  } catch (err) {
    console.error(err);
    view.innerHTML = `<div class="card"><p><strong>Something went wrong.</strong></p><p class="muted small">${String(err.message ?? err)}</p></div>`;
  }
}

window.addEventListener('hashchange', () => {
  render();
  window.scrollTo(0, 0);
});

// Re-render Today when the app comes back to the foreground on a new day.
let lastDay = new Date().toDateString();
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && new Date().toDateString() !== lastDay) {
    lastDay = new Date().toDateString();
    render();
  }
});

applyTheme();
registerSW({ immediate: true });
render();
