// Visual vocabulary shared by the screens: colour, shape and emoji per habit and day type.

export const HABIT_LOOK = {
  sprint: { colour: 'tomato', shape: 's-circle', emoji: '🧮' },
  spanish: { colour: 'sun', shape: 's-blob', emoji: '🇪🇸' },
  reading: { colour: 'sky', shape: 's-squircle', emoji: '📚' },
  unprompted: { colour: 'grape', shape: 's-diamond', emoji: '🎙️' },
  palace: { colour: 'mint', shape: 's-squircle', emoji: '🏰' },
  recall: { colour: 'gum', shape: 's-circle', emoji: '💭' }
};

export const DAY_LOOK = {
  early: { emoji: '🌅', colour: 'var(--sun)', short: 'Early' },
  late: { emoji: '🌙', colour: 'var(--grape-soft)', short: 'Late' },
  off: { emoji: '🏖️', colour: 'var(--mint)', short: 'Off' },
  minimum: { emoji: '🪫', colour: 'var(--gum)', short: 'Minimum' }
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
