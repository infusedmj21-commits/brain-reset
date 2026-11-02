// Theme preference is per device (stored in localStorage), not synced.
// 'auto' follows the system: Sport in light mode, Night in dark mode.

export const THEMES = {
  auto: 'Auto (follow my device)',
  night: 'Night',
  sport: 'Sport'
};

const KEY = 'brain-reset-theme';
const dark = window.matchMedia('(prefers-color-scheme: dark)');

export function getThemePref() {
  try {
    return localStorage.getItem(KEY) || 'auto';
  } catch {
    return 'auto';
  }
}

export function resolveTheme(pref = getThemePref()) {
  if (pref === 'night' || pref === 'sport') return pref;
  return dark.matches ? 'night' : 'sport';
}

export function applyTheme() {
  const theme = resolveTheme();
  document.documentElement.dataset.theme = theme;
  const bg = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim();
  document.querySelectorAll('meta[name="theme-color"]').forEach((m) => {
    m.removeAttribute('media');
    m.setAttribute('content', bg || (theme === 'night' ? '#0e0f0d' : '#ffffff'));
  });
}

export function setThemePref(pref) {
  try {
    localStorage.setItem(KEY, pref);
  } catch {
    /* storage blocked: theme still applies for this session */
  }
  applyTheme();
}

dark.addEventListener('change', () => {
  if (getThemePref() === 'auto') applyTheme();
});
