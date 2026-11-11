// The lock-in formula: (Impact + Urgency) ÷ Effort, each rated 1–5 against written anchors.
// Added rather than multiplied: the ratings are rankings, and multiplying by urgency
// would amplify the pull towards urgent-but-unimportant work. See the build brief.

export const ANCHORS = {
  impact: ['Barely moves anything', 'Small win', 'Noticeable progress or income', 'Big step for a venture', 'Changes the month'],
  urgency: ['No deadline', 'Deadline over a month away', 'Deadline within a month', 'Deadline within 2 weeks', 'Real deadline within 7 days'],
  effort: ['Under 30 minutes', 'About an hour', 'Half a day', 'A full day', 'Several days']
};

export const FACTORS = [
  { key: 'impact', label: 'Impact' },
  { key: 'urgency', label: 'Urgency' },
  { key: 'effort', label: 'Effort' }
];

// Starting points; tune after a couple of weeks of real scores.
export const BANDS = { now: 2.5, schedule: 1.5 };

export const VERDICTS = {
  now: { label: 'Do it now', colour: 'mint' },
  schedule: { label: 'Schedule it', colour: 'sun' },
  park: { label: 'Park it', colour: 'grape' }
};

const clamp = (n) => Math.min(5, Math.max(1, Math.round(Number(n) || 1)));

export function score({ impact, urgency, effort }) {
  return (clamp(impact) + clamp(urgency)) / clamp(effort);
}

export function verdict(value) {
  if (value == null) return null;
  if (value >= BANDS.now) return 'now';
  if (value >= BANDS.schedule) return 'schedule';
  return 'park';
}

export const formatScore = (value) => (value == null ? '–' : value.toFixed(1));

/**
 * Latest and previous score per venture, from its score history.
 * Returns { [ventureId]: { latest, previous, history } } with history newest first.
 */
export function scoreHistory(scores) {
  const out = {};
  for (const s of [...scores].sort((a, b) => b.date.localeCompare(a.date) || b.updated_at.localeCompare(a.updated_at))) {
    (out[s.venture_id] ??= { history: [] }).history.push(s);
  }
  for (const v of Object.values(out)) {
    v.latest = v.history[0] ?? null;
    v.previous = v.history[1] ?? null;
  }
  return out;
}

/** A venture needs rescoring once its last score is 7 or more days old (or it has none). */
export function needsRescore(latest, date, daysBetween) {
  return !latest || daysBetween(latest.date, date) >= 7;
}

/** Rank open tasks: best score first; unscored last. */
export function rankTasks(tasks) {
  return [...tasks]
    .filter((t) => !t.done_date)
    .map((t) => ({ ...t, value: score(t) }))
    .sort((a, b) => b.value - a.value);
}
