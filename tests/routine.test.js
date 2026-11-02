import { describe, expect, it } from 'vitest';
import { addDays, weekStart, weekday, daysBetween } from '../src/logic/dates.js';
import {
  bestSprint,
  buildChecklist,
  formatMinutes,
  missedYesterday,
  streak,
  suggestUnprompted,
  tiktokLimit
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
  it('follows the weekly schedule', () => {
    expect(tiktokLimit(MON).minutes).toBe(360);
    expect(tiktokLimit('2026-11-15').minutes).toBe(285);
    expect(tiktokLimit('2027-02-01').minutes).toBe(30);
    expect(tiktokLimit('2026-10-01')).toBeNull();
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
