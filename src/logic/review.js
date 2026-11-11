// Skipped days, comebacks and the weekly review. Pure functions over dates.
import { addDays, daysBetween } from './dates.js';
import { dayCounts } from './routine.js';

export const GAP_REASONS = {
  shifts: 'Shifts',
  ill: 'Ill',
  off: 'Day off',
  didnt: 'Just didn’t'
};

/**
 * Days with any sign of life: a habit ticked, a workout finished, one of today's 3 done.
 * Returns a sorted array of unique 'YYYY-MM-DD'.
 */
export function activeDates({ habitLogs = [], workouts = [], focus = [] }) {
  const set = new Set();
  for (const l of habitLogs) if (l.done) set.add(l.date);
  for (const w of workouts) if (w.finished_at) set.add(w.date);
  for (const f of focus) if (f.done) set.add(f.date);
  return [...set].sort();
}

/**
 * A comeback after 2 or more whole days away: the last active day before today,
 * the days missed, and the gap's id. Null when there's no gap worth a welcome back.
 */
export function gapBefore(date, dates) {
  const before = dates.filter((d) => d < date);
  if (!before.length) return null;
  const last = before.at(-1);
  const missed = daysBetween(last, date) - 1;
  if (missed < 2) return null;
  return { id: `gap:${addDays(last, 1)}`, from: addDays(last, 1), to: addDays(date, -1), days: missed, lastActive: last };
}

/** Longest run of counting days ever. doneByDate: { date: Set(habits) } */
export function bestStreak(doneByDate) {
  const dates = Object.keys(doneByDate).filter((d) => dayCounts(doneByDate[d])).sort();
  let best = 0;
  let run = 0;
  let prev = null;
  for (const d of dates) {
    run = prev && daysBetween(prev, d) === 1 ? run + 1 : 1;
    best = Math.max(best, run);
    prev = d;
  }
  return best;
}

/** Counting days between start and end inclusive. */
export function countingDays(doneByDate, start, end) {
  let n = 0;
  for (let d = start; d <= end; d = addDays(d, 1)) if (dayCounts(doneByDate[d])) n += 1;
  return n;
}

/** Days in [start, end] that didn't count, each with its gap reason if one was given. */
export function missedDays(doneByDate, start, end, gaps, firstActive) {
  const out = [];
  for (let d = start; d <= end; d = addDays(d, 1)) {
    if (!firstActive || d < firstActive || dayCounts(doneByDate[d])) continue;
    const gap = gaps.find((g) => g.from <= d && d <= g.to);
    out.push({ date: d, reason: gap?.reason ?? null });
  }
  return out;
}

/** The review covers last week (Monday to Sunday) and is offered from Monday until it's done. */
export function reviewWeek(date, weekStartOf) {
  const thisWeek = weekStartOf(date);
  const start = addDays(thisWeek, -7);
  return { id: `review:${start}`, start, end: addDays(start, 6), prevStart: addDays(start, -7) };
}
