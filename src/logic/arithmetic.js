// In-app arithmetic sprint, matching Zetamac's rules and defaults:
// addition and multiplication draw each operand from a range; subtraction and
// division are addition and multiplication problems in reverse, so answers are
// always whole numbers of 0 or more.

export const DURATIONS = [30, 60, 120, 300, 600];

export const DEFAULT_SETTINGS = Object.freeze({
  add: true,
  addA: [2, 100],
  addB: [2, 100],
  sub: true,
  mul: true,
  mulA: [2, 12],
  mulB: [2, 100],
  div: true,
  duration: 120
});

export const OPS = {
  add: { symbol: '+', label: 'Addition' },
  sub: { symbol: '−', label: 'Subtraction' },
  mul: { symbol: '×', label: 'Multiplication' },
  div: { symbol: '÷', label: 'Division' }
};

const int = (v, fallback) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? n : fallback;
};

/** Fill gaps from defaults and fix swapped or silly ranges. Returns { settings, errors }. */
export function cleanSettings(input = {}) {
  const s = { ...DEFAULT_SETTINGS, ...input };
  const errors = [];
  const range = (key, lo = 0, hi = 9999) => {
    let [a, b] = Array.isArray(s[key]) ? s[key] : DEFAULT_SETTINGS[key];
    a = Math.min(hi, Math.max(lo, int(a, DEFAULT_SETTINGS[key][0])));
    b = Math.min(hi, Math.max(lo, int(b, DEFAULT_SETTINGS[key][1])));
    return a <= b ? [a, b] : [b, a];
  };
  s.addA = range('addA');
  s.addB = range('addB');
  s.mulA = range('mulA');
  s.mulB = range('mulB');
  // Division by zero is impossible, so the divisor range starts at 1.
  if (s.div && s.mulA[0] < 1) s.mulA = [1, Math.max(1, s.mulA[1])];
  for (const k of ['add', 'sub', 'mul', 'div']) s[k] = Boolean(s[k]);
  if (!DURATIONS.includes(Number(s.duration))) s.duration = DEFAULT_SETTINGS.duration;
  s.duration = Number(s.duration);
  if (!s.add && !s.sub && !s.mul && !s.div) errors.push('Turn on at least one operation.');
  return { settings: s, errors };
}

/** True when settings equal Zetamac's defaults, so scores are comparable. */
export function isStandard(settings) {
  const s = cleanSettings(settings).settings;
  const d = DEFAULT_SETTINGS;
  const same = (a, b) => a[0] === b[0] && a[1] === b[1];
  return (
    s.add === d.add && s.sub === d.sub && s.mul === d.mul && s.div === d.div &&
    same(s.addA, d.addA) && same(s.addB, d.addB) && same(s.mulA, d.mulA) && same(s.mulB, d.mulB) &&
    s.duration === d.duration
  );
}

const between = (rng, [lo, hi]) => lo + Math.floor(rng() * (hi - lo + 1));

/** A random problem. prev avoids showing the same problem twice in a row. */
export function makeProblem(settings, rng = Math.random, prev = null) {
  const ops = ['add', 'sub', 'mul', 'div'].filter((k) => settings[k]);
  for (let tries = 0; tries < 20; tries++) {
    const op = ops[Math.floor(rng() * ops.length)];
    let a, b, answer;
    if (op === 'add' || op === 'sub') {
      const x = between(rng, settings.addA);
      const y = between(rng, settings.addB);
      if (op === 'add') [a, b, answer] = [x, y, x + y];
      else [a, b, answer] = [x + y, x, y];
    } else {
      const x = between(rng, settings.mulA);
      const y = between(rng, settings.mulB);
      if (op === 'mul') [a, b, answer] = [x, y, x * y];
      else [a, b, answer] = [x * y, x, y];
    }
    const p = { op, a, b, answer, text: `${a} ${OPS[op].symbol} ${b}` };
    if (!prev || p.text !== prev.text) return p;
  }
  return null;
}

/** Stats for a finished round. problems: [{ op, text, ms }] answered correctly. */
export function roundStats(problems) {
  const byOp = {};
  for (const p of problems) {
    (byOp[p.op] ??= []).push(p.ms);
  }
  const avg = (arr) => (arr.length ? arr.reduce((s, x) => s + x, 0) / arr.length : null);
  return {
    score: problems.length,
    avgMs: avg(problems.map((p) => p.ms)),
    byOp: Object.fromEntries(Object.entries(byOp).map(([op, ms]) => [op, { count: ms.length, avgMs: avg(ms) }])),
    slowest: [...problems].sort((x, y) => y.ms - x.ms).slice(0, 3)
  };
}

export function describeSettings(s) {
  const parts = [];
  if (s.add) parts.push(`+ (${s.addA.join('–')}) & (${s.addB.join('–')})`);
  if (s.sub) parts.push('−');
  if (s.mul) parts.push(`× (${s.mulA.join('–')}) & (${s.mulB.join('–')})`);
  if (s.div) parts.push('÷');
  const d = s.duration >= 60 ? `${s.duration / 60} min` : `${s.duration} s`;
  return `${parts.join(' · ')} · ${d}`;
}

// Five difficulty presets. Level 3 is exactly Zetamac's defaults.
// A preset sets the operations and ranges; duration stays your choice.
export const DIFFICULTIES = [
  {
    level: 1, name: 'Warm-up', emoji: '🌱', hint: 'Small numbers, times tables to 5',
    settings: { add: true, addA: [2, 20], addB: [2, 20], sub: true, mul: true, mulA: [2, 5], mulB: [2, 10], div: true }
  },
  {
    level: 2, name: 'Easy', emoji: '🙂', hint: 'Sums to 100, times tables to 9 × 12',
    settings: { add: true, addA: [2, 50], addB: [2, 50], sub: true, mul: true, mulA: [2, 9], mulB: [2, 12], div: true }
  },
  {
    level: 3, name: 'Standard', emoji: '⭐', hint: 'Zetamac defaults: 2–100, and 2–12 × 2–100',
    settings: { add: true, addA: [2, 100], addB: [2, 100], sub: true, mul: true, mulA: [2, 12], mulB: [2, 100], div: true }
  },
  {
    level: 4, name: 'Hard', emoji: '🔥', hint: 'Three-digit sums, 3–20 × 10–100',
    settings: { add: true, addA: [20, 300], addB: [20, 300], sub: true, mul: true, mulA: [3, 20], mulB: [10, 100], div: true }
  },
  {
    level: 5, name: 'Expert', emoji: '🧠', hint: '100–999 sums, 6–30 × 20–200',
    settings: { add: true, addA: [100, 999], addB: [100, 999], sub: true, mul: true, mulA: [6, 30], mulB: [20, 200], div: true }
  }
];

/** The preset these settings match (ignoring duration), or null for custom. */
export function levelOf(settings) {
  const s = cleanSettings(settings).settings;
  const same = (a, b) => a[0] === b[0] && a[1] === b[1];
  const match = DIFFICULTIES.find(({ settings: p }) =>
    ['add', 'sub', 'mul', 'div'].every((k) => s[k] === p[k]) &&
    same(s.addA, p.addA) && same(s.addB, p.addB) && same(s.mulA, p.mulA) && same(s.mulB, p.mulB)
  );
  return match?.level ?? null;
}

/** Apply a preset, keeping the chosen duration. */
export function applyDifficulty(level, settings) {
  const preset = DIFFICULTIES.find((d) => d.level === level);
  return cleanSettings({ ...settings, ...preset.settings }).settings;
}

/** Rounds are comparable when level and duration match. Custom rounds have no key. */
export function compareKey(settings) {
  const level = levelOf(settings);
  return level ? `${level}:${cleanSettings(settings).settings.duration}` : null;
}
