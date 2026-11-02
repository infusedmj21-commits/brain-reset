// Theme preference is per device (stored in localStorage), not synced.
// One look with a light and a dark version; 'auto' follows the device.

export const THEMES = {
  auto: 'Auto',
  light: 'Light',
  dark: 'Dark'
};

const KEY = 'brain-reset-theme';
const darkQuery = window.matchMedia('(prefers-color-scheme: dark)');

export function getThemePref() {
  try {
    const v = localStorage.getItem(KEY);
    return v in THEMES ? v : 'auto';
  } catch {
    return 'auto';
  }
}

export function resolveTheme(pref = getThemePref()) {
  if (pref === 'light' || pref === 'dark') return pref;
  return darkQuery.matches ? 'dark' : 'light';
}

export function applyTheme() {
  const theme = resolveTheme();
  document.documentElement.dataset.theme = theme;
  const bg = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim();
  document.querySelectorAll('meta[name="theme-color"]').forEach((m) => {
    m.removeAttribute('media');
    m.setAttribute('content', bg || (theme === 'dark' ? '#1b1726' : '#fbf8f2'));
  });
}

export function setThemePref(pref) {
  try {
    localStorage.setItem(KEY, pref);
  } catch {
    /* storage blocked: the theme still applies for this session */
  }
  applyTheme();
}

darkQuery.addEventListener('change', () => {
  if (getThemePref() === 'auto') applyTheme();
});

// Greeting name, also per device.
const NAME_KEY = 'brain-reset-name';
export function getName() {
  try {
    const v = localStorage.getItem(NAME_KEY);
    return v == null ? 'Michael' : v;
  } catch {
    return 'Michael';
  }
}
export function setName(name) {
  try {
    localStorage.setItem(NAME_KEY, name.trim());
  } catch {
    /* ignore */
  }
}
