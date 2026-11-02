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
import { renderComingSoon } from './views/coming-soon.js';

const routes = {
  today: renderToday,
  palace: (el) =>
    renderComingSoon(el, {
      title: 'Memory palace',
      phase: 2,
      habit: 'palace',
      body: 'For now, tick “Memory palace” on Today after a session.',
      features: [
        'Build palaces from routes you know, spot by spot',
        'Practice with random 10 or 20 word lists and a study timer',
        'Weekly test: 20 words, 5 minutes, recall after 20 minutes',
        'Your own lists, like Spanish vocab or uni definitions'
      ]
    }),
  unprompted: (el) =>
    renderComingSoon(el, {
      title: 'Unprompted',
      phase: 3,
      habit: 'unprompted',
      body: 'For now, tick “Unprompted session” on Today when you finish one.',
      features: [
        'Paste the topic, then 15 + 5 minute timers',
        'Photo of your handwritten notes',
        'Record your 60-second take in the app',
        'Next-day recall and a library of every topic'
      ]
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
