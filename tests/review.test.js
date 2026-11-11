import { describe, expect, it } from 'vitest';
import { activeDates, bestStreak, countingDays, gapBefore, missedDays, reviewWeek } from '../src/logic/review.js';
import { weekStart } from '../src/logic/dates.js';

const both = new Set(['sprint', 'spanish']);

describe('skipped days', () => {
  it('collects active days from habits, workouts and today’s 3', () => {
    expect(
      activeDates({
        habitLogs: [{ date: '2026-11-02', done: true }, { date: '2026-11-03', done: false }],
        workouts: [{ date: '2026-11-04', finished_at: 'x' }, { date: '2026-11-05', finished_at: null }],
        focus: [{ date: '2026-11-02', done: true }]
      })
    ).toEqual(['2026-11-02', '2026-11-04']);
  });

  it('a single missed day is not a gap; two or more is', () => {
    expect(gapBefore('2026-11-11', ['2026-11-09'])).toBe(null);
    expect(gapBefore('2026-11-11', ['2026-11-08'])).toEqual({ id: 'gap:2026-11-09', from: '2026-11-09', to: '2026-11-10', days: 2, lastActive: '2026-11-08' });
    expect(gapBefore('2026-11-11', [])).toBe(null);
  });

  it('finds the best streak ever', () => {
    const done = { '2026-11-01': both, '2026-11-02': both, '2026-11-03': both, '2026-11-05': both, '2026-11-06': new Set(['sprint']) };
    expect(bestStreak(done)).toBe(3);
  });

  it('lists missed days with their reasons, from the first active day', () => {
    const done = { '2026-11-02': both, '2026-11-05': both };
    const gaps = [{ from: '2026-11-03', to: '2026-11-04', reason: 'shifts' }];
    expect(missedDays(done, '2026-11-01', '2026-11-06', gaps, '2026-11-02')).toEqual([
      { date: '2026-11-03', reason: 'shifts' },
      { date: '2026-11-04', reason: 'shifts' },
      { date: '2026-11-06', reason: null }
    ]);
    expect(countingDays(done, '2026-11-01', '2026-11-07')).toBe(2);
  });

  it('reviews last Monday to Sunday', () => {
    expect(reviewWeek('2026-11-11', weekStart)).toEqual({ id: 'review:2026-11-02', start: '2026-11-02', end: '2026-11-08', prevStart: '2026-10-26' });
  });
});
