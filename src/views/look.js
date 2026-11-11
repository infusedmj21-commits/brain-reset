// Visual vocabulary shared by the screens: colour, shape and line icon per habit and day type.
import { ICONS } from './icons.js';

export const HABIT_LOOK = {
  sprint: { colour: 'tomato', shape: 's-circle', icon: ICONS.calc },
  spanish: { colour: 'sun', shape: 's-blob', icon: ICONS.chat },
  reading: { colour: 'sky', shape: 's-squircle', icon: ICONS.book },
  unprompted: { colour: 'grape', shape: 's-diamond', icon: ICONS.mic },
  palace: { colour: 'mint', shape: 's-squircle', icon: ICONS.castle },
  recall: { colour: 'gum', shape: 's-circle', icon: ICONS.bulb }
};

export const DAY_LOOK = {
  early: { icon: ICONS.sunrise, colour: 'var(--sun)', short: 'Early' },
  late: { icon: ICONS.moon, colour: 'var(--grape-soft)', short: 'Late' },
  off: { icon: ICONS.sun, colour: 'var(--mint)', short: 'Off' },
  minimum: { icon: ICONS.battery, colour: 'var(--gum)', short: 'Minimum' }
};

// Extra quick links per habit, beyond the habit's own main link.
export const HABIT_LINKS = {
  sprint: [{ label: 'Play sprint →', href: '#/sprint' }],
  spanish: [
    { label: 'Anki ↗', href: 'https://ankiweb.net/' },
    { label: 'Language Transfer ↗', href: 'https://www.languagetransfer.org/' }
  ],
  unprompted: [{ label: 'Start session →', href: '#/unprompted' }],
  palace: [{ label: 'Practise →', href: '#/palace' }],
  recall: [{ label: 'Open →', href: '#/unprompted' }]
};
