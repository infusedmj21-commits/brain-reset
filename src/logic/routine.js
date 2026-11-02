import { addDays, daysBetween, weekDates, weekday } from './dates.js';

export const DAY_TYPES = {
  early: { label: 'Early shift', hint: '8am–5pm' },
  late: { label: 'Late shift', hint: '6pm–11pm' },
  off: { label: 'Day off', hint: 'No work' },
  minimum: { label: 'Minimum day', hint: 'Double shift or wrecked' }
};

export const HABITS = {
  sprint: { label: 'Arithmetic sprint', minutes: 5 },
  spanish: { label: 'Spanish', minutes: 20 },
  reading: { label: 'Deep reading, phone in another room', minutes: 20 },
  unprompted: { label: 'Unprompted session', minutes: 30, link: 'https://unprompted.cool/' },
  palace: { label: 'Memory palace', minutes: 15 },
  recall: { label: 'Recall yesterday’s topic out loud', minutes: 1 }
};

// The two habits that make a day "count" for the streak.
export const MINIMUM_HABITS = ['sprint', 'spanish'];

export const UNPROMPTED_PER_WEEK = 3;

// When each habit fits, per day type. Slots match the Day templates in the routine doc.
const SLOTS = {
  early: {
    sprint: 'After waking',
    spanish: 'After waking · 10 min flashcards, audio on the commute',
    reading: 'Evening or in bed',
    unprompted: 'After your shift',
    palace: 'After your shift',
    recall: 'Any time'
  },
  late: {
    sprint: 'After waking',
    spanish: 'After waking',
    reading: 'Before you leave for work',
    unprompted: 'Late morning, when you’re sharpest',
    palace: 'Daytime, before your shift',
    recall: 'Any time'
  },
  off: {
    sprint: 'After waking',
    spanish: 'After waking · longer listening or speaking if you can',
    reading: 'Afternoon',
    unprompted: 'Daytime',
    palace: 'Daytime',
    recall: 'Any time'
  },
  minimum: {
    sprint: 'Whenever you can',
    spanish: 'Whenever you can · 10 min is enough',
    recall: 'Any time'
  }
};

/**
 * Should today be an unprompted.cool day?
 * done: dates this week with a completed unprompted session.
 */
export function suggestUnprompted({ date, dayType, unpromptedDates }) {
  if (dayType === 'minimum') return { suggested: false, reason: 'Minimum day: skip the long sessions.' };
  const week = weekDates(date);
  const doneThisWeek = unpromptedDates.filter((d) => week.includes(d) && d !== date).length;
  if (unpromptedDates.includes(date)) return { suggested: true, reason: 'Done today.' };
  if (doneThisWeek >= UNPROMPTED_PER_WEEK) {
    return { suggested: false, reason: `All ${UNPROMPTED_PER_WEEK} done this week.` };
  }
  if (unpromptedDates.includes(addDays(date, -1))) {
    return { suggested: false, reason: 'You did one yesterday; never two days running.' };
  }
  const needed = UNPROMPTED_PER_WEEK - doneThisWeek;
  const daysLeft = 7 - weekday(date); // including today
  // n non-consecutive sessions need at least 2n − 1 days.
  const mustDoToday = daysLeft <= 2 * needed - 1;
  if (dayType === 'early' && !mustDoToday) {
    return { suggested: false, reason: 'Early shift: save it for a late shift or day off.' };
  }
  return {
    suggested: true,
    reason: mustDoToday
      ? `Needed today to fit ${needed} more this week.`
      : `${doneThisWeek} of ${UNPROMPTED_PER_WEEK} done this week.`
  };
}

/** Build today's checklist. rotation: 'unprompted' | 'palace' | null (auto). */
export function buildChecklist({ date, dayType, unpromptedDates, rotation = null }) {
  const slots = SLOTS[dayType] ?? SLOTS.off;
  const items = [];
  const add = (habit, extra = {}) =>
    items.push({ habit, ...HABITS[habit], slot: slots[habit], ...extra });

  add('sprint');
  add('spanish', dayType === 'minimum' || dayType === 'early' ? { minutes: 10 } : {});

  if (unpromptedDates.includes(addDays(date, -1))) add('recall');

  if (dayType === 'minimum') return { items, suggestion: null, rotating: null };

  add('reading');
  const suggestion = suggestUnprompted({ date, dayType, unpromptedDates });
  const rotating = rotation ?? (suggestion.suggested ? 'unprompted' : 'palace');
  add(rotating, { rotating: true });
  return { items, suggestion, rotating };
}

/** A day counts when its minimum habits are done. doneByDate: { 'YYYY-MM-DD': Set<habit> } */
export function dayCounts(done) {
  return MINIMUM_HABITS.every((h) => done?.has(h));
}

/** Consecutive counting days ending today (or yesterday, if today isn't done yet). */
export function streak(date, doneByDate) {
  let cursor = dayCounts(doneByDate[date]) ? date : addDays(date, -1);
  let count = 0;
  while (dayCounts(doneByDate[cursor])) {
    count += 1;
    cursor = addDays(cursor, -1);
  }
  return count;
}

/** True when yesterday was missed and the user had already started before yesterday. */
export function missedYesterday(date, doneByDate, firstActiveDate) {
  if (!firstActiveDate) return false;
  const yesterday = addDays(date, -1);
  if (daysBetween(firstActiveDate, yesterday) < 0) return false;
  return !dayCounts(doneByDate[yesterday]);
}

// TikTok daily limit, from the staggered reduction plan (minutes).
export const TIKTOK_SCHEDULE = [
  { week: 1, start: '2026-11-02', minutes: 360 },
  { week: 2, start: '2026-11-09', minutes: 285 },
  { week: 3, start: '2026-11-16', minutes: 225 },
  { week: 4, start: '2026-11-23', minutes: 180 },
  { week: 5, start: '2026-11-30', minutes: 135 },
  { week: 6, start: '2026-12-07', minutes: 105 },
  { week: 7, start: '2026-12-14', minutes: 75 },
  { week: 8, start: '2026-12-21', minutes: 45 },
  { week: 9, start: '2026-12-28', minutes: 30 }
];

export function tiktokLimit(date, schedule = TIKTOK_SCHEDULE) {
  let current = null;
  for (const step of schedule) if (step.start <= date) current = step;
  return current;
}

export function formatMinutes(min) {
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (!h) return `${m}m`;
  return m ? `${h}h ${m}m` : `${h}h`;
}

export function bestSprint(r1, r2) {
  const vals = [r1, r2]
    .filter((v) => v !== '' && v != null)
    .map(Number)
    .filter((n) => Number.isFinite(n) && n >= 0);
  return vals.length ? Math.max(...vals) : null;
}

const DAILY_CORE = ['sprint', 'spanish', 'reading'];

/** 'full' (sprint, Spanish and reading), 'min' (just the minimum) or 'none'. */
export function dayStatus(done) {
  if (!dayCounts(done)) return 'none';
  return DAILY_CORE.every((h) => done.has(h)) ? 'full' : 'min';
}

/**
 * Sprint scoreboard numbers: the last 7 logged days (oldest first),
 * this week's and last week's best, and the change between them.
 */
export function sprintSummary(sprints, date, weekStartOf) {
  const sorted = [...sprints].filter((s) => s.date <= date).sort((a, b) => a.date.localeCompare(b.date));
  const recent = sorted.slice(-7);
  const thisWeek = weekStartOf(date);
  const lastWeek = weekStartOf(addDays(thisWeek, -1));
  const bestIn = (start) => {
    const vals = sorted.filter((s) => weekStartOf(s.date) === start).map((s) => s.best);
    return vals.length ? Math.max(...vals) : null;
  };
  const weekBest = bestIn(thisWeek);
  const lastWeekBest = bestIn(lastWeek);
  return {
    recent,
    latest: sorted.at(-1) ?? null,
    allTimeBest: sorted.length ? Math.max(...sorted.map((s) => s.best)) : null,
    weekBest,
    lastWeekBest,
    delta: weekBest != null && lastWeekBest != null ? weekBest - lastWeekBest : null
  };
}
