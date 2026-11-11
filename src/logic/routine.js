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

// TikTok daily limit: a staggered plan you step down through yourself.
// The app never moves you on by the calendar. You step down when you've actually
// changed the limit in Screen Time, so forgotten or skipped weeks don't count.
export const TIKTOK_LEVELS = [360, 285, 225, 180, 135, 105, 75, 45, 30];
export const TIKTOK_HOLD_DAYS = 7;

/**
 * Where the plan stands. `plan` is { history: [{ level, from }], snoozedUntil? }, levels 1-based.
 * `logs` maps date -> 'under' | 'over' (how a day went).
 */
export function tiktokState(plan, logs, date) {
  const history = plan?.history?.length ? plan.history : [{ level: 1, from: date }];
  const cur = history.at(-1);
  const level = Math.min(Math.max(1, cur.level), TIKTOK_LEVELS.length);
  const held = Math.max(0, daysBetween(cur.from, date));
  const last7 = Array.from({ length: 7 }, (_, i) => addDays(date, i - 7));
  const logged = last7.filter((d) => logs[d] && d >= cur.from);
  const under = logged.filter((d) => logs[d] === 'under').length;
  const over = logged.length - under;
  const next = level < TIKTOK_LEVELS.length ? { level: level + 1, minutes: TIKTOK_LEVELS[level] } : null;
  const snoozed = plan?.snoozedUntil && plan.snoozedUntil > date;
  return {
    level,
    minutes: TIKTOK_LEVELS[level - 1],
    total: TIKTOK_LEVELS.length,
    from: cur.from,
    held,
    next,
    prev: level > 1 ? { level: level - 1, minutes: TIKTOK_LEVELS[level - 2] } : null,
    last7: last7.map((d) => ({ date: d, result: logs[d] ?? null })),
    under,
    over,
    // Offer the next step after a week at this level, unless held back on purpose.
    offerStep: Boolean(next) && held >= TIKTOK_HOLD_DAYS && !snoozed,
    // Mostly over the limit? Suggest holding rather than cutting further.
    advice: over >= 3 ? 'hold' : 'step'
  };
}

/** Plan after a step: down (+1), back up (-1). Steps start today. */
export function tiktokStep(plan, date, by) {
  const st = tiktokState(plan, {}, date);
  const level = Math.min(Math.max(1, st.level + by), TIKTOK_LEVELS.length);
  const history = [...(plan?.history ?? [{ level: st.level, from: st.from }])];
  if (history.at(-1)?.from === date) history.pop();
  history.push({ level, from: date });
  return { history, snoozedUntil: null };
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
