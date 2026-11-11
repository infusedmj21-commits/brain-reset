import { describe, expect, it } from 'vitest';
import { addDays, weekStart, weekday, daysBetween } from '../src/logic/dates.js';
import {
  bestSprint,
  buildChecklist,
  formatMinutes,
  missedYesterday,
  streak,
  suggestUnprompted,
  tiktokState,
  tiktokStep
} from '../src/logic/routine.js';

// 2026-11-02 is a Monday.
const MON = '2026-11-02';

describe('dates', () => {
  it('adds days across month and DST boundaries', () => {
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01');
    expect(addDays('2026-03-28', 2)).toBe('2026-03-30');
    expect(addDays(MON, -1)).toBe('2026-11-01');
  });
  it('treats Monday as the start of the week', () => {
    expect(weekday(MON)).toBe(0);
    expect(weekday('2026-11-08')).toBe(6);
    expect(weekStart('2026-11-08')).toBe(MON);
    expect(daysBetween(MON, '2026-11-09')).toBe(7);
  });
});

describe('suggestUnprompted', () => {
  it('suggests on a late shift with none done', () => {
    expect(suggestUnprompted({ date: MON, dayType: 'late', unpromptedDates: [] }).suggested).toBe(true);
  });
  it('holds back on an early shift early in the week', () => {
    expect(suggestUnprompted({ date: MON, dayType: 'early', unpromptedDates: [] }).suggested).toBe(false);
  });
  it('never suggests two days running', () => {
    const r = suggestUnprompted({ date: addDays(MON, 1), dayType: 'off', unpromptedDates: [MON] });
    expect(r.suggested).toBe(false);
  });
  it('stops after three in a week', () => {
    const done = [MON, addDays(MON, 2), addDays(MON, 4)];
    expect(suggestUnprompted({ date: addDays(MON, 6), dayType: 'off', unpromptedDates: done }).suggested).toBe(false);
  });
  it('forces an early-shift day when the week is running out', () => {
    // Friday with 1 done: 2 more need 3 days (Fri, Sun) → must do today.
    const fri = addDays(MON, 4);
    expect(suggestUnprompted({ date: fri, dayType: 'early', unpromptedDates: [MON] }).suggested).toBe(true);
  });
  it('ignores sessions from last week', () => {
    const r = suggestUnprompted({ date: MON, dayType: 'off', unpromptedDates: ['2026-10-28', '2026-10-30', '2026-11-01'] });
    expect(r.suggested).toBe(false); // yesterday (Sunday) was a session
    const r2 = suggestUnprompted({ date: addDays(MON, 1), dayType: 'off', unpromptedDates: ['2026-10-28', '2026-10-30', '2026-11-01'] });
    expect(r2.suggested).toBe(true);
  });
  it('skips on minimum days', () => {
    expect(suggestUnprompted({ date: MON, dayType: 'minimum', unpromptedDates: [] }).suggested).toBe(false);
  });
});

describe('buildChecklist', () => {
  it('minimum day is sprint + 10 min Spanish only', () => {
    const { items } = buildChecklist({ date: MON, dayType: 'minimum', unpromptedDates: [] });
    expect(items.map((i) => i.habit)).toEqual(['sprint', 'spanish']);
    expect(items[1].minutes).toBe(10);
  });
  it('late shift rotates in an unprompted session', () => {
    const { items, rotating } = buildChecklist({ date: MON, dayType: 'late', unpromptedDates: [] });
    expect(rotating).toBe('unprompted');
    expect(items.map((i) => i.habit)).toEqual(['sprint', 'spanish', 'reading', 'unprompted']);
  });
  it('early shift rotates in the memory palace', () => {
    expect(buildChecklist({ date: MON, dayType: 'early', unpromptedDates: [] }).rotating).toBe('palace');
  });
  it('a manual swap overrides the suggestion', () => {
    expect(buildChecklist({ date: MON, dayType: 'late', unpromptedDates: [], rotation: 'palace' }).rotating).toBe('palace');
  });
  it('adds the next-day recall after a session', () => {
    const { items } = buildChecklist({ date: addDays(MON, 1), dayType: 'early', unpromptedDates: [MON] });
    expect(items.map((i) => i.habit)).toContain('recall');
  });
});

describe('streaks', () => {
  const both = new Set(['sprint', 'spanish']);
  const days = {
    '2026-10-30': both,
    '2026-10-31': both,
    '2026-11-01': both
  };
  it('counts back from yesterday when today is not done yet', () => {
    expect(streak(MON, days)).toBe(3);
  });
  it('includes today once the minimum is done', () => {
    expect(streak(MON, { ...days, [MON]: both })).toBe(4);
  });
  it('needs both minimum habits', () => {
    expect(streak(MON, { [addDays(MON, -1)]: new Set(['sprint']) })).toBe(0);
  });
  it('warns after a missed day, but not on the first day of use', () => {
    expect(missedYesterday(MON, {}, MON)).toBe(false);
    expect(missedYesterday(MON, {}, null)).toBe(false);
    expect(missedYesterday(MON, {}, '2026-10-30')).toBe(true);
    expect(missedYesterday(MON, days, '2026-10-30')).toBe(false);
  });
});

describe('tiktok limit and formatting', () => {
  it('starts at week 1 and never moves on by the calendar', () => {
    const plan = { history: [{ level: 1, from: '2026-11-11' }] };
    expect(tiktokState(plan, {}, '2026-11-11')).toMatchObject({ level: 1, minutes: 360, held: 0, offerStep: false });
    // Weeks later, still week 1 until a step is confirmed.
    expect(tiktokState(plan, {}, '2026-12-20')).toMatchObject({ level: 1, minutes: 360, offerStep: true });
  });
  it('offers the next step after a week, and holds when mostly over', () => {
    const plan = { history: [{ level: 1, from: '2026-11-01' }] };
    const logs = { '2026-11-05': 'over', '2026-11-06': 'over', '2026-11-07': 'over', '2026-11-04': 'under' };
    const st = tiktokState(plan, logs, '2026-11-08');
    expect(st).toMatchObject({ offerStep: true, under: 1, over: 3, advice: 'hold', next: { level: 2, minutes: 285 } });
    expect(tiktokState({ ...plan, snoozedUntil: '2026-11-15' }, {}, '2026-11-08').offerStep).toBe(false);
  });
  it('steps down and back up from the day you confirm', () => {
    let plan = { history: [{ level: 1, from: '2026-11-01' }] };
    plan = tiktokStep(plan, '2026-11-09', 1);
    expect(tiktokState(plan, {}, '2026-11-10')).toMatchObject({ level: 2, minutes: 285, from: '2026-11-09', held: 1 });
    plan = tiktokStep(plan, '2026-11-12', -1);
    expect(tiktokState(plan, {}, '2026-11-12')).toMatchObject({ level: 1, minutes: 360 });
    expect(tiktokState(tiktokStep({ history: [{ level: 9, from: '2026-11-01' }] }, '2026-11-20', 1), {}, '2026-11-20')).toMatchObject({ level: 9, next: null, offerStep: false });
  });
  it('formats minutes', () => {
    expect(formatMinutes(360)).toBe('6h');
    expect(formatMinutes(285)).toBe('4h 45m');
    expect(formatMinutes(30)).toBe('30m');
  });
  it('takes the best sprint round and ignores blanks', () => {
    expect(bestSprint('41', '47')).toBe(47);
    expect(bestSprint('', '38')).toBe(38);
    expect(bestSprint('', '')).toBeNull();
  });
});

import { dayStatus, sprintSummary } from '../src/logic/routine.js';

describe('dayStatus', () => {
  it('grades a day', () => {
    expect(dayStatus(undefined)).toBe('none');
    expect(dayStatus(new Set(['sprint']))).toBe('none');
    expect(dayStatus(new Set(['sprint', 'spanish']))).toBe('min');
    expect(dayStatus(new Set(['sprint', 'spanish', 'reading', 'palace']))).toBe('full');
  });
});

describe('sprintSummary', () => {
  const s = (date, best) => ({ date, best });
  it('compares this week with last week and keeps the last 7 days', () => {
    const rows = [s('2026-10-27', 40), s('2026-10-29', 44), s('2026-11-02', 47), s('2026-11-03', 45)];
    const r = sprintSummary(rows, '2026-11-03', weekStart);
    expect(r.weekBest).toBe(47);
    expect(r.lastWeekBest).toBe(44);
    expect(r.delta).toBe(3);
    expect(r.latest.best).toBe(45);
    expect(r.allTimeBest).toBe(47);
    expect(r.recent.map((x) => x.best)).toEqual([40, 44, 47, 45]);
  });
  it('has no delta without last week, and ignores future rows', () => {
    const r = sprintSummary([s('2026-11-02', 47), s('2026-11-09', 60)], '2026-11-02', weekStart);
    expect(r.delta).toBeNull();
    expect(r.allTimeBest).toBe(47);
  });
});
