import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { createDB } from '../src/db.js';
import { getPayPayees, listPayments, listRoles, saveImport, seedRoles, setPayPayees } from '../src/data/money.js';
import {
  classify,
  defaultHours,
  incomingPayees,
  orderRoles,
  parseCSV,
  parseMonzo,
  shiftPay,
  spendingByCategory,
  unpaidBalance,
  weeklyPay
} from '../src/logic/money.js';

const MONZO = `Transaction ID,Date,Time,Type,Name,Emoji,Category,Amount,Currency,Local amount,Local currency,Notes and #tags,Address,Receipt,Description,Category split,Money Out,Money In
tx_1,03/11/2026,09:12:01,Faster payment,ACME STAFFING LTD,,Income,214.50,GBP,214.50,GBP,,,,ACME PAYROLL,,,214.50
tx_2,04/11/2026,12:30:00,Card payment,Tesco,,Groceries,-12.40,GBP,-12.40,GBP,,,,TESCO STORES,,-12.40,
tx_3,05/11/2026,18:00:00,Pot transfer,Big Man Cash,,Transfers,-50.00,GBP,-50.00,GBP,,,,POT TRANSFER,,-50.00,
tx_4,06/11/2026,20:15:00,Card payment,"Nando's, Birmingham",,Eating out,-18.95,GBP,-18.95,GBP,,,,"NANDOS ""BULLRING""",,-18.95,
tx_5,07/11/2026,10:00:00,Faster payment,Mum,,Transfers,30.00,GBP,30.00,GBP,,,,GIFT,,,30.00
tx_6,08/11/2026,10:00:00,Faster payment,Jean McLeod,,Bills,-400.00,GBP,-400.00,GBP,,,,RENT,,-400.00,
`;

describe('roles and shifts', () => {
  const roles = [
    { id: 'role:set-up-staff', order: 0 },
    { id: 'role:till-operator', order: 1 },
    { id: 'role:pourer', order: 4 }
  ];

  it('keeps Michael’s order until usage says otherwise', () => {
    expect(orderRoles(roles, [], '2026-11-11').map((r) => r.id)[0]).toBe('role:set-up-staff');
    const shifts = [1, 2].map((i) => ({ role_id: 'role:pourer', date: `2026-11-0${i}`, status: 'worked' }));
    expect(orderRoles(roles, shifts, '2026-11-11').map((r) => r.id)[0]).toBe('role:pourer');
  });

  it('prices a shift', () => {
    expect(shiftPay({ hours: 8.5, rate: 13.45 })).toBe(114.33);
    expect(shiftPay({ hours: 14.5, rate: 13.94 })).toBe(202.13);
  });

  it('prefills hours from the last shift at that venue', () => {
    const shifts = [
      { venue: 'Molineux', hours: 8, date: '2026-11-01', status: 'worked' },
      { venue: 'Molineux', hours: 7.5, date: '2026-11-08', status: 'worked' }
    ];
    expect(defaultHours(shifts, 'Molineux')).toBe(7.5);
    expect(defaultHours(shifts, 'NEC')).toBe(8);
  });

  it('builds weekly expected and received pay', () => {
    const shifts = [
      { date: '2026-11-10', hours: 8, rate: 13.45, status: 'worked' },
      { date: '2026-11-14', hours: 8.5, rate: 13.45, status: 'booked' },
      { date: '2026-11-12', hours: 8, rate: 13.45, status: 'cancelled' }
    ];
    const weeks = weeklyPay(shifts, [{ date: '2026-11-11', amount: 100 }], '2026-11-11', 2);
    expect(weeks).toHaveLength(2);
    expect(weeks[1]).toMatchObject({ start: '2026-11-09', worked: 107.6, booked: 114.33, hours: 16.5, received: 100 });
  });

  it('works out pay still owed since the first payment', () => {
    const shifts = [
      { date: '2026-11-01', hours: 10, rate: 10, status: 'worked' },
      { date: '2026-11-08', hours: 10, rate: 10, status: 'worked' }
    ];
    expect(unpaidBalance(shifts, [])).toBe(null);
    expect(unpaidBalance(shifts, [{ date: '2026-11-06', amount: 100 }])).toBe(100);
  });
});

describe('Monzo import', () => {
  it('parses quoted fields with commas and escaped quotes', () => {
    expect(parseCSV('a,"b, c","d ""e"""\n1,2,3')).toEqual([
      ['a', 'b, c', 'd "e"'],
      ['1', '2', '3']
    ]);
  });

  it('reads a Monzo export', () => {
    const rows = parseMonzo(MONZO, 'main');
    expect(rows).toHaveLength(6);
    expect(rows[0]).toMatchObject({ id: 'monzo:tx_1', date: '2026-11-03', amount: 214.5, name: 'ACME STAFFING LTD' });
    expect(rows[3].name).toBe("Nando's, Birmingham");
  });

  it('rejects a file that is not a Monzo export', () => {
    expect(() => parseMonzo('foo,bar\n1,2', 'main')).toThrow(/Monzo/);
  });

  it('splits pay, spending, other income and transfers', () => {
    const rows = parseMonzo(MONZO, 'main');
    expect(incomingPayees(rows).map((p) => p.name)).toEqual(['ACME STAFFING LTD']);
    const c = classify(rows, ['acme staffing ltd']);
    expect(c.pay.map((t) => t.id)).toEqual(['monzo:tx_1']);
    expect(c.spending.map((t) => t.id)).toEqual(['monzo:tx_2', 'monzo:tx_4', 'monzo:tx_6']);
    expect(c.transfers.map((t) => t.id)).toEqual(['monzo:tx_3', 'monzo:tx_5']);
  });

  it('sums spending by category for a month', () => {
    const rows = classify(parseMonzo(MONZO, 'main'), []).spending.map((t) => ({ ...t, kind: 'spending' }));
    expect(spendingByCategory(rows, '2026-11')).toEqual([
      { category: 'Bills', total: 400 },
      { category: 'Eating out', total: 18.95 },
      { category: 'Groceries', total: 12.4 }
    ]);
  });
});

let n = 0;
let db;
beforeEach(async () => {
  db = createDB(`money-${n++}`);
  await db.open();
});

describe('money data', () => {
  it('seeds 17 roles once, Set up staff first, team leader at £13.94', async () => {
    await seedRoles(db);
    await seedRoles(db);
    const roles = await listRoles(db);
    expect(roles).toHaveLength(17);
    expect(roles.find((r) => r.order === 0).name).toBe('Set up staff');
    expect(roles.find((r) => r.id === 'role:team-leader').rate).toBe(13.94);
    expect(roles.some((r) => /supervisor/i.test(r.name))).toBe(false);
  });

  it('imports pay and spending, and skips rows already imported', async () => {
    const c = classify(parseMonzo(MONZO, 'main'), ['acme staffing ltd']);
    expect(await saveImport(c, db)).toMatchObject({ pay: 1, spending: 3, skipped: 0 });
    expect(await saveImport(c, db)).toMatchObject({ pay: 0, spending: 0, skipped: 4 });
    expect((await listPayments(db)).map((p) => p.amount)).toEqual([214.5]);
  });

  it('remembers which payees are pay', async () => {
    await setPayPayees(['ACME STAFFING LTD'], db);
    expect(await getPayPayees(db)).toEqual(['acme staffing ltd']);
  });
});

import { breakMinutes, isPremiumDay, shiftTimes } from '../src/logic/money.js';

describe('breaks and bank holidays', () => {
  it('takes 30 min off from 6 hours and an hour over 12', () => {
    expect(breakMinutes(5 * 60 + 59)).toBe(0);
    expect(breakMinutes(6 * 60)).toBe(30);
    expect(breakMinutes(12 * 60)).toBe(30);
    expect(breakMinutes(12 * 60 + 1)).toBe(60);
  });

  it('works out paid hours from start and end, including past midnight', () => {
    expect(shiftTimes('09:00', '18:30')).toEqual({ scheduled: 570, unpaid: 30, paidHours: 9 });
    expect(shiftTimes('12:30', '16:30').paidHours).toBe(4);
    expect(shiftTimes('17:00', '23:30').paidHours).toBe(6);
    expect(shiftTimes('22:00', '02:00').paidHours).toBe(4);
    expect(shiftTimes('06:00', '20:30').paidHours).toBe(13.5);
  });

  it('pays 1.5x on bank holidays and on Christmas and Boxing Day themselves', () => {
    expect(isPremiumDay('2026-12-26')).toBe(true); // Boxing Day (a Saturday)
    expect(isPremiumDay('2026-12-28')).toBe(true); // substitute bank holiday
    expect(isPremiumDay('2027-08-30')).toBe(true);
    expect(isPremiumDay('2026-12-24')).toBe(false);
  });
});

describe('shift order', () => {
  it('puts the earlier of two same-day shifts first', async () => {
    const { byWhen } = await import('../src/logic/money.js');
    const shifts = [
      { date: '2026-11-21', start: '17:00' },
      { date: '2026-11-20', start: '18:00' },
      { date: '2026-11-21', start: '09:00' }
    ].sort(byWhen);
    expect(shifts.map((s) => `${s.date} ${s.start}`)).toEqual(['2026-11-20 18:00', '2026-11-21 09:00', '2026-11-21 17:00']);
  });
});
