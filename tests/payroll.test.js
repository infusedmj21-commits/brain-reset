import { describe, expect, it } from 'vitest';
import { nextPayday, owed, paydays, periodFor, periodPaidOn } from '../src/logic/payroll.js';

describe('pay schedule (weekly, Wednesday, Thu–Wed a week behind)', () => {
  it('matches the agency’s pay dates', () => {
    expect(periodPaidOn('2026-11-18')).toMatchObject({ start: '2026-11-05', end: '2026-11-11' });
    expect(periodPaidOn('2026-10-07')).toMatchObject({ start: '2026-09-24', end: '2026-09-30' });
    expect(periodFor('2026-11-11').payday).toBe('2026-11-18'); // a Wednesday shift: last day of its period
    expect(periodFor('2026-11-12').payday).toBe('2026-11-25'); // Thursday starts the next one
    expect(nextPayday('2026-11-11')).toBe('2026-11-11');
    expect(nextPayday('2026-11-12')).toBe('2026-11-18');
  });

  const shifts = [
    { date: '2026-11-03', status: 'worked', confirmed: true, hours: 9 + 52 / 60, rate: 13.94 },
    { date: '2026-11-07', status: 'worked', confirmed: true, hours: 10, rate: 13.45 },
    { date: '2026-11-13', status: 'booked', hours: 4, rate: 13.45 },
    { date: '2026-11-09', status: 'cancelled', hours: 8, rate: 13.45 }
  ];

  it('builds paydays with expected, received and what still needs confirming', () => {
    const p = paydays(shifts, [{ date: '2026-11-11', amount: 137.54 }], '2026-11-11', 1, 3);
    expect(p.map((x) => x.payday)).toEqual(['2026-11-04', '2026-11-11', '2026-11-18', '2026-11-25']);
    expect(p[1]).toMatchObject({ expected: 137.54, received: 137.54, isToday: true });
    expect(p[2]).toMatchObject({ expected: 134.5, received: null, past: false });
    expect(p[3]).toMatchObject({ expected: 53.8, unconfirmed: 1 });
  });

  it('counts worked shifts whose payday is still to come', () => {
    expect(owed(shifts, '2026-11-11')).toBe(134.5);
    expect(owed(shifts, '2026-11-18')).toBe(0);
  });
});
