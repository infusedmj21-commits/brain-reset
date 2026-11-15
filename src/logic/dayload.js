// Automatic day load: how heavy a day is, from logged shifts, instead of picking a day type.
//
// score = today's hours × 1.0 + yesterday × 0.5 + the day before × 0.25
//       + tomorrow × 0.1 (× 0.3 when tomorrow starts early)
// Fatigue carries over, and an early start tomorrow eats tonight. Weights and tier
// thresholds are deliberately simple and editable in Settings; overrides are logged so
// they can be tuned against real days.
import { addDays } from './dates.js';

export const LOAD_DEFAULTS = {
  weights: { dayBefore: 0.25, yesterday: 0.5, today: 1, tomorrow: 0.1, tomorrowEarly: 0.3 },
  earlyStart: '10:00', // a shift starting before this tomorrow counts as an early start
  thresholds: { normal: 2.5, light: 6, minimum: 11 } // score at which each tier begins
};

export const TIERS = {
  full: { label: 'Full day', short: 'Full', hint: 'Everything on the list' },
  normal: { label: 'Normal day', short: 'Normal', hint: 'The usual list' },
  light: { label: 'Light day', short: 'Light', hint: 'Shorter Spanish, no long sessions' },
  minimum: { label: 'Minimum day', short: 'Minimum', hint: 'Sprint + Spanish keeps the streak' }
};
export const TIER_ORDER = ['full', 'normal', 'light', 'minimum'];

export const OVERRIDE_REASONS = { cancelled: 'Shift cancelled', sleep: 'Bad sleep', ill: 'Ill', extra: 'Extra work', other: 'Other' };

const live = (shifts) => shifts.filter((s) => !s.deleted && s.status !== 'cancelled');

export function hoursOn(shifts, date) {
  return live(shifts)
    .filter((s) => s.date === date)
    .reduce((t, s) => t + (Number(s.hours) || 0), 0);
}

const firstStart = (shifts, date) =>
  live(shifts)
    .filter((s) => s.date === date && s.start)
    .map((s) => s.start)
    .sort()[0] ?? null;

export function tierFor(score, thresholds = LOAD_DEFAULTS.thresholds) {
  if (score >= thresholds.minimum) return 'minimum';
  if (score >= thresholds.light) return 'light';
  if (score >= thresholds.normal) return 'normal';
  return 'full';
}

/** Load for a date. settings: { weights, thresholds, earlyStart } (missing parts use defaults). */
export function dayLoad(shifts, date, settings = {}) {
  const w = { ...LOAD_DEFAULTS.weights, ...settings.weights };
  const th = { ...LOAD_DEFAULTS.thresholds, ...settings.thresholds };
  const earlyStart = settings.earlyStart ?? LOAD_DEFAULTS.earlyStart;
  const hours = {
    dayBefore: hoursOn(shifts, addDays(date, -2)),
    yesterday: hoursOn(shifts, addDays(date, -1)),
    today: hoursOn(shifts, date),
    tomorrow: hoursOn(shifts, addDays(date, 1))
  };
  const tomorrowStart = firstStart(shifts, addDays(date, 1));
  const tomorrowEarly = Boolean(tomorrowStart && tomorrowStart < earlyStart);
  const score =
    Math.round(
      (hours.dayBefore * w.dayBefore +
        hours.yesterday * w.yesterday +
        hours.today * w.today +
        hours.tomorrow * (tomorrowEarly ? w.tomorrowEarly : w.tomorrow)) *
        10
    ) / 10;
  const start = firstStart(shifts, date);
  // When things fit around today's shift: an early one leaves the evening, a late one the day.
  const timing = hours.today ? ((start ?? '09:00') < '14:00' ? 'early' : 'late') : 'off';
  return { date, score, tier: tierFor(score, th), hours, timing, start, tomorrowEarly, tomorrowStart };
}

/** One line on why: "7h shift today · 6h yesterday", "Rest day after 3 shifts in a row". */
export function loadReason(load, shifts) {
  const h = (n) => `${Math.round(n * 10) / 10}h`;
  const parts = [];
  if (load.hours.today) parts.push(`${h(load.hours.today)} shift today${load.start ? ` from ${load.start}` : ''}`);
  if (load.hours.yesterday) parts.push(`${h(load.hours.yesterday)} yesterday`);
  if (!load.hours.today && !load.hours.yesterday && load.hours.dayBefore) parts.push(`${h(load.hours.dayBefore)} two days ago`);
  if (load.tomorrowEarly) parts.push(`early start tomorrow (${load.tomorrowStart})`);
  if (!load.hours.today) {
    let run = 0;
    for (let d = addDays(load.date, -1); hoursOn(shifts, d) > 0; d = addDays(d, -1)) run += 1;
    if (run >= 2) return `Rest day after ${run} shifts in a row${load.tomorrowEarly ? ' · early start tomorrow' : ''}`;
    if (!parts.length) return 'No shifts around today';
  }
  return parts.join(' · ');
}

/** The tier that applies: your override if you set one, otherwise the computed one. */
export function effectiveTier(load, plan) {
  const override = plan?.tier_override && TIERS[plan.tier_override] ? plan.tier_override : null;
  return { tier: override ?? load.tier, overridden: Boolean(override), reason: plan?.override_reason ?? null };
}

/** The checklist slot set for a tier: minimum days use the minimum list, others follow the shift timing. */
export const checklistDayType = (tier, timing) => (tier === 'minimum' ? 'minimum' : timing);
