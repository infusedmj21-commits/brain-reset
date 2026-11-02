import { addDays } from './dates.js';

// The guided session, in order. seconds = target length of the step (null = untimed).
export const STEPS = [
  { key: 'research', label: 'Research', seconds: 15 * 60 },
  { key: 'summary', label: 'Summarise', seconds: 5 * 60 },
  { key: 'points', label: 'Key points', seconds: null },
  { key: 'talk', label: 'Talk', seconds: 60 }
];

export const RECALL_SECONDS = 60;

export function stepIndex(key) {
  const i = STEPS.findIndex((s) => s.key === key);
  return i === -1 ? STEPS.length : i;
}

export function nextStep(key) {
  return STEPS[stepIndex(key) + 1]?.key ?? 'done';
}

/** Countdown computed from a start timestamp, so it survives the app being closed. */
export function countdown(startedAt, seconds, now = Date.now()) {
  if (!startedAt || seconds == null) return { remaining: seconds, overtime: 0, fraction: 0, finished: false };
  const elapsed = Math.max(0, Math.floor((now - Date.parse(startedAt)) / 1000));
  const remaining = Math.max(0, seconds - elapsed);
  return {
    remaining,
    overtime: Math.max(0, elapsed - seconds),
    fraction: Math.min(1, elapsed / seconds),
    finished: elapsed >= seconds
  };
}

export function clock(totalSeconds) {
  const s = Math.max(0, Math.round(totalSeconds ?? 0));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** Yesterday's completed session still waiting for its next-day recall. */
export function pendingRecall(sessions, date) {
  const yesterday = addDays(date, -1);
  return sessions.find((s) => s.completed && s.date === yesterday && !s.recall_done_at) ?? null;
}

/** An unfinished session the user can resume. */
export function activeSession(sessions) {
  return [...sessions].filter((s) => !s.completed).sort((a, b) => b.created_at?.localeCompare(a.created_at ?? '') ?? 0)[0] ?? null;
}
