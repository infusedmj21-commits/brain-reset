// Michael's agency pays weekly on Wednesday, for hours worked Thursday to Wednesday,
// with each period ending one week before its payday (e.g. 5–11 Nov is paid on 18 Nov).
import { addDays, weekday } from './dates.js';
import { byWhen, pennies, shiftPay } from './money.js';

const THURSDAY = 3; // Monday = 0
export const PAY_LAG_DAYS = 7;

/** The pay period a date falls in: { start (Thu), end (Wed), payday (Wed a week later) }. */
export function periodFor(date) {
  const start = addDays(date, -((weekday(date) - THURSDAY + 7) % 7));
  const end = addDays(start, 6);
  return { start, end, payday: addDays(end, PAY_LAG_DAYS), id: `period:${start}` };
}

/** The period paid on a given payday (any date in the payday's week works). */
export const periodPaidOn = (payday) => periodFor(addDays(payday, -PAY_LAG_DAYS));

// A Monzo payment counts for a payday if it lands within a couple of days either side.
const nearPayday = (paymentDate, payday) => paymentDate >= addDays(payday, -2) && paymentDate <= addDays(payday, 3);

/**
 * Pay periods around a date: `back` paid periods before it and `ahead` upcoming paydays.
 * Each has the shifts in it, expected pay (worked + still booked), what's confirmed, and what arrived.
 */
export function paydays(shifts, payments, date, back = 6, ahead = 3) {
  const live = shifts.filter((s) => !s.deleted && s.status !== 'cancelled');
  const thisPayday = nextPayday(date);
  const out = [];
  for (let i = -back; i < ahead; i += 1) {
    const payday = addDays(thisPayday, i * 7);
    const p = periodPaidOn(payday);
    const inPeriod = live.filter((s) => s.date >= p.start && s.date <= p.end).sort(byWhen);
    const paid = payments.filter((x) => nearPayday(x.date, payday));
    out.push({
      ...p,
      shifts: inPeriod,
      expected: pennies(inPeriod.reduce((t, s) => t + shiftPay(s), 0)),
      hours: inPeriod.reduce((t, s) => t + Number(s.hours || 0), 0),
      unconfirmed: inPeriod.filter((s) => !s.confirmed).length,
      received: paid.length ? pennies(paid.reduce((t, x) => t + x.amount, 0)) : null,
      past: payday <= date,
      isToday: payday === date
    });
  }
  return out;
}

/** The next Wednesday payday on or after a date. */
export const nextPayday = (date) => addDays(date, (2 - weekday(date) + 7) % 7);

/** Worked shifts whose payday hasn't come yet: the money that's on its way. */
export function owed(shifts, date) {
  return pennies(
    shifts
      .filter((s) => !s.deleted && s.status === 'worked' && periodFor(s.date).payday > date)
      .reduce((t, s) => t + shiftPay(s), 0)
  );
}

// Weekly take-home can be lower than gross once a week passes the tax/NI thresholds
// (about £242 a week gross). Above that, a gap may be deductions rather than a mistake.
export const DEDUCTION_THRESHOLD = 242;
