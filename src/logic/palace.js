import { WORD_LIST } from './words.js';

export const WEEKLY_TEST = { size: 20, studySeconds: 5 * 60, delayMinutes: 20 };

/** One spot per line; blank lines dropped. */
export function parseLines(text) {
  return String(text ?? '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
}

/** n distinct random words. rng is injectable for tests. */
export function pickWords(n, rng = Math.random, list = WORD_LIST) {
  const pool = [...list];
  const out = [];
  while (out.length < n && pool.length) {
    const i = Math.floor(rng() * pool.length);
    out.push(pool.splice(i, 1)[0]);
  }
  return out;
}

/** Lowercase, strip accents and punctuation, collapse spaces, drop a trailing plural "s". */
export function normalize(word) {
  let w = String(word ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9ñ\s-]/g, '')
    .replace(/[-\s]+/g, ' ')
    .trim();
  if (w.length > 3 && w.endsWith('es') && /(ch|sh|x|ss)es$/.test(w)) w = w.slice(0, -2);
  else if (w.length > 3 && w.endsWith('s') && !w.endsWith('ss')) w = w.slice(0, -1);
  return w;
}

/**
 * Score a recall attempt.
 * recalled: targets that appear anywhere in the answers (each answer counts once).
 * inOrder: answers that match the target at the same spot.
 */
export function scoreRecall(targets, answers) {
  const normTargets = targets.map(normalize);
  const normAnswers = answers.map(normalize);
  const unused = normAnswers.map((a, i) => ({ a, i })).filter((x) => x.a);
  const items = normTargets.map((t, i) => {
    const inOrder = normAnswers[i] === t && t !== '';
    return { target: targets[i], answer: answers[i] ?? '', inOrder, recalled: false };
  });
  // Same-spot matches first, so they claim their own answer.
  items.forEach((item, i) => {
    if (item.inOrder) {
      item.recalled = true;
      const k = unused.findIndex((x) => x.i === i);
      if (k >= 0) unused.splice(k, 1);
    }
  });
  items.forEach((item, i) => {
    if (item.recalled) return;
    const k = unused.findIndex((x) => x.a === normTargets[i]);
    if (k >= 0) {
      item.recalled = true;
      unused.splice(k, 1);
    }
  });
  return {
    total: targets.length,
    recalled: items.filter((x) => x.recalled).length,
    inOrder: items.filter((x) => x.inOrder).length,
    items
  };
}

/** Best weekly-test score per ISO week start, newest first. */
export function weeklyTestHistory(sessions, weekStartOf) {
  const byWeek = new Map();
  for (const s of sessions) {
    if (!s.is_weekly_test) continue;
    const wk = weekStartOf(s.date);
    const prev = byWeek.get(wk);
    if (!prev || s.recalled > prev.recalled) byWeek.set(wk, s);
  }
  return [...byWeek.entries()].sort((a, b) => b[0].localeCompare(a[0])).map(([week, s]) => ({ week, ...s }));
}
