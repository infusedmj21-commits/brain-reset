import '@fontsource/nunito/latin-700.css';
import '@fontsource/nunito/latin-800.css';
import '@fontsource/nunito/latin-900.css';
import '@fontsource/inter/latin-400.css';
import '@fontsource/inter/latin-500.css';
import '@fontsource/inter/latin-600.css';
import '@fontsource/inter/latin-700.css';
import './styles.css';
import { applyTheme } from './theme.js';
import { registerSW } from 'virtual:pwa-register';
import { renderToday } from './views/today.js';
import { renderHome } from './views/home.js';
import { renderVentures } from './views/ventures.js';
import { seedVentures } from './data/ventures.js';
import { seedRoles } from './data/money.js';
import { renderMoney } from './views/money.js';
import { renderHealth } from './views/health.js';
import { renderReview } from './views/review.js';
import { renderTasks } from './views/tasks.js';
import { openTaskCount } from './data/tasks.js';
import { seedHealth } from './data/health.js';
import { renderSettings } from './views/settings.js';
import { renderProgress } from './views/progress.js';
import { renderPalace } from './views/palace.js';
import { renderUnprompted } from './views/unprompted.js';
import { renderSprint } from './views/sprint.js';
import { setOnRemoteChange, startSync } from './sync.js';

const routes = {
  home: renderHome,
  ventures: renderVentures,
  money: renderMoney,
  health: renderHealth,
  review: renderReview,
  tasks: renderTasks,
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
  const [name = 'home', ...params] = location.hash.replace(/^#\/?/, '').split('/').filter(Boolean);
  const route = routes[name] ? name : 'home';
  const ctx = { params, onCleanup: (fn) => cleanups.push(fn) };
  // Brain Reset's screens live under the Reset tab; Settings sits beside To do under Tasks.
  const RESET = ['today', 'sprint', 'palace', 'unprompted', 'progress'];
  const tab = RESET.includes(route) ? 'today' : route === 'settings' ? 'tasks' : route === 'review' ? 'home' : route;
  document.querySelectorAll('.tabbar a').forEach((a) => {
    if (a.dataset.tab === tab) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  });
  const SUBNAVS = {
    today: [['today', 'Today'], ['palace', 'Palace'], ['unprompted', 'Unprompted'], ['progress', 'Progress']],
    tasks: [['tasks', 'To do'], ['settings', 'Settings']],
    money: [['money', 'Overview'], ['money/insights', 'Insights'], ['money/tax', 'Tax']]
  };
  const path = [name, ...params].join('/');
  const subnav = document.getElementById('subnav');
  const items = route === 'sprint' ? null : SUBNAVS[tab];
  subnav.hidden = !items;
  subnav.innerHTML = (items ?? [])
    .map(([r, label]) => `<a href="#/${r}"${r === path || (r === route && !items.some(([x]) => x === path)) ? ' aria-current="page"' : ''}>${label}</a>`)
    .join('');
  try {
    await routes[route](view, render, ctx);
  } catch (err) {
    console.error(err);
    view.innerHTML = `<div class="card"><p><strong>Something went wrong.</strong></p><p class="muted small">${String(err.message ?? err)}</p></div>`;
  }
  updateBadge();
}

// The red count on the Tasks tab.
function updateBadge() {
  openTaskCount()
    .then((n) => {
      const b = document.getElementById('task-badge');
      b.hidden = !n;
      b.textContent = n > 9 ? '9+' : String(n);
      document.querySelector('[data-tab="tasks"]').setAttribute('aria-label', n ? `Tasks, ${n} to do` : 'Tasks');
    })
    .catch(() => {});
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
Promise.allSettled([seedVentures(), seedRoles(), seedHealth()]).finally(render);

// Changes pulled from another device redraw the current screen, unless the
// person is typing in a field, where a redraw would wipe what they entered.
// Only list-style screens redraw; a sprint round or timed session is never interrupted.
setOnRemoteChange(() => {
  const route = location.hash.replace(/^#\/?/, '').split('/')[0] || 'home';
  if (!['home', 'ventures', 'money', 'tasks', 'today', 'progress', 'settings'].includes(route)) {
    updateBadge();
    return;
  }
  const active = document.activeElement;
  if (active && ['INPUT', 'TEXTAREA', 'SELECT'].includes(active.tagName)) return;
  render();
});
startSync();
