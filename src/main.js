import './styles.css';
import { applyTheme } from './theme.js';
import { registerSW } from 'virtual:pwa-register';
import { renderToday } from './views/today.js';
import { renderSettings } from './views/settings.js';
import { renderProgress } from './views/progress.js';
import { renderComingSoon } from './views/coming-soon.js';

const routes = {
  today: renderToday,
  palace: (el) =>
    renderComingSoon(el, {
      title: 'Memory palace',
      phase: 2,
      body: 'Build palaces, practise with random word lists, run the weekly 20-word test, and track your score. For now, tick “Memory palace” on Today after a session.'
    }),
  unprompted: (el) =>
    renderComingSoon(el, {
      title: 'Unprompted sessions',
      phase: 3,
      body: 'Paste the topic, run the 15 + 5 minute timers, photograph your notes, record your 60-second take and keep a library of topics. For now, tick “Unprompted session” on Today when you finish one.'
    }),
  progress: renderProgress,
  settings: renderSettings
};

const view = document.getElementById('view');

async function render() {
  const name = location.hash.replace(/^#\/?/, '') || 'today';
  const route = routes[name] ? name : 'today';
  document.querySelectorAll('.tabbar a').forEach((a) => {
    if (a.dataset.tab === route) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  });
  try {
    await routes[route](view, render);
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
