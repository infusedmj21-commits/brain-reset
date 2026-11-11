import { describe, expect, it } from 'vitest';
import { categories, categoryName, daily, earningsBy, hourlyRate, lastMonths, monthly, segments, shiftMonth, topMerchants, weekdayAverages } from '../src/logic/insights.js';
import { weekday } from '../src/logic/dates.js';

const tx = [
  { date: '2026-09-05', amount: -20, kind: 'spending', category: 'eating_out', name: 'Nandos' },
  { date: '2026-11-07', amount: -12.4, kind: 'spending', category: 'Groceries', name: 'Tesco' },
  { date: '2026-11-07', amount: -5, kind: 'spending', category: 'Groceries', name: 'Tesco' },
  { date: '2026-11-08', amount: -400, kind: 'spending', category: 'Bills', name: 'Rent' },
  { date: '2026-11-09', amount: -9.99, kind: 'spending', category: 'Charity', name: 'Shelter' },
  { date: '2026-11-03', amount: 214.5, kind: 'pay', category: 'Income', name: 'Agency' }
];
const shifts = [
  { date: '2026-11-03', status: 'worked', hours: 8, rate: 13.45, venue: 'Molineux', role_id: 'till' },
  { date: '2026-11-05', status: 'worked', hours: 10, rate: 13.94, venue: "St Andrew's", role_id: 'tl' },
  { date: '2026-11-20', status: 'booked', hours: 8, rate: 13.45, venue: 'Molineux', role_id: 'till' }
];

describe('insights', () => {
  it('walks months back across a year end', () => {
    expect(lastMonths('2027-02-10', 4)).toEqual(['2026-11', '2026-12', '2027-01', '2027-02']);
    expect(shiftMonth('2026-12', 1)).toBe('2027-01');
    expect(shiftMonth('2026-01', -1)).toBe('2025-12');
  });

  it('files each transaction in its own month (backdated imports land correctly)', () => {
    const rows = monthly(shifts, [{ date: '2026-11-03', amount: 214.5 }], tx, ['2026-09', '2026-10', '2026-11']);
    expect(rows.map((r) => r.spent)).toEqual([20, 0, 427.39]);
    expect(rows[2]).toMatchObject({ earned: 247, paidIn: 214.5, hours: 18 });
  });

  it('groups categories with fixed colours and folds the rest into Other', () => {
    expect(categoryName('eating_out')).toBe('Eating out');
    const cats = categories(tx, '2026-11');
    expect(cats.map((c) => [c.category, c.total, c.slot])).toEqual([['Bills', 400, 1], ['Groceries', 17.4, 3], ['Charity', 9.99, 0]]);
    expect(segments(cats).map((s) => s.category)).toEqual(['Bills', 'Groceries', 'Other']);
  });

  it('builds the calendar, weekdays, top shops and earnings', () => {
    expect(daily(tx, '2026-11')['2026-11-07'].total).toBe(17.4);
    expect(topMerchants(tx, '2026-11', 2).map((m) => [m.name, m.count])).toEqual([['Rent', 1], ['Tesco', 2]]);
    const avgs = weekdayAverages(tx, ['2026-11'], weekday);
    expect(avgs.indexOf(Math.max(...avgs))).toBe(6); // Sunday 8 Nov: rent
    expect(earningsBy(shifts, (s) => s.venue, '2026-10-01').map((r) => r.key)).toEqual(["St Andrew's", 'Molineux']);
    expect(hourlyRate(shifts, '2026-10-01')).toBeCloseTo(247 / 18, 5);
  });
});
