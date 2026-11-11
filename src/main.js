import '@fontsource/inter/latin-400.css';
import '@fontsource/inter/latin-500.css';
import '@fontsource/inter/latin-600.css';
import '@fontsource/inter/latin-700.css';
import '@fontsource/instrument-serif/latin-400-italic.css';
import './styles.css';
import './glass.css';
import { animatePage, startEntrance } from './motion.js';
import { applyTheme, getName } from './theme.js';
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
import { onSyncStatus, setOnRemoteChange, startSync, syncStatus } from './sync.js';

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
    if (a.dataset.tab === tab || (a.dataset.tab === 'settings' && route === 'settings')) a.setAttribute('aria-current', 'page');
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
  // Motion plays on a new page, not when the same page redraws after a tick.
  if (path !== lastPath) {
    animatePage(view, { first: lastPath === null });
    lastPath = path;
  }
  updateBadge();
  updateFoot();
}
let lastPath = null;

// ---- Sidebar (desktop): a rail that opens and pushes the page across ----
const toggle = document.getElementById('side-toggle');
const wide = window.matchMedia('(min-width: 760px)');
const isOpen = () => document.documentElement.dataset.sidebar === 'open';
function setSidebar(open) {
  if (open) document.documentElement.dataset.sidebar = 'open';
  else delete document.documentElement.dataset.sidebar;
  toggle.setAttribute('aria-expanded', String(open));
  toggle.setAttribute('aria-label', open ? 'Close the sidebar' : 'Open the sidebar');
  try {
    localStorage.setItem('artemis-sidebar', open ? 'open' : 'closed');
  } catch {}
}
setSidebar(isOpen());
toggle.addEventListener('click', () => setSidebar(!isOpen()));
// In the rail, picking a page also opens the sidebar.
document.querySelectorAll('.sidebar a').forEach((a) =>
  a.addEventListener('click', () => {
    if (wide.matches && !isOpen()) setSidebar(true);
  })
);

// Profile row: name and when this device last synced.
function ago(iso) {
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const h = Math.round(mins / 60);
  return h < 24 ? `${h}h ago` : `${Math.round(h / 24)}d ago`;
}
async function updateFoot() {
  const name = getName() || 'You';
  document.getElementById('side-name').textContent = name;
  document.getElementById('side-avatar').textContent = name.slice(0, 1).toUpperCase();
  try {
    const s = await syncStatus();
    document.getElementById('side-sync').textContent = !s.user
      ? 'On this device'
      : s.syncing
        ? 'Syncing…'
        : s.error
          ? 'Sync paused'
          : s.lastSync
            ? `Synced ${ago(s.lastSync)}`
            : 'Signed in';
  } catch {}
}
onSyncStatus(() => updateFoot());

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
startEntrance();
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
