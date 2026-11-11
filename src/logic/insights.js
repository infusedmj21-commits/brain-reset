// Pure maths behind Money → Insights. Months are 'YYYY-MM'.
import { pennies, shiftPay } from './money.js';

/** The n months ending with the month of `date`, oldest first. */
export function lastMonths(date, n) {
  let [y, m] = date.split('-').map(Number);
  const out = [];
  for (let i = 0; i < n; i += 1) {
    out.unshift(`${y}-${String(m).padStart(2, '0')}`);
    m -= 1;
    if (m === 0) {
      m = 12;
      y -= 1;
    }
  }
  return out;
}

export const shiftMonth = (key, by) => {
  let [y, m] = key.split('-').map(Number);
  m += by;
  while (m > 12) {
    m -= 12;
    y += 1;
  }
  while (m < 1) {
    m += 12;
    y -= 1;
  }
  return `${y}-${String(m).padStart(2, '0')}`;
};

export const monthLabel = (key, style = 'long') =>
  new Date(`${key}-15T12:00:00Z`).toLocaleDateString('en-GB', { month: style, year: style === 'long' ? 'numeric' : undefined, timeZone: 'UTC' });

const spending = (transactions) => transactions.filter((t) => t.kind === 'spending' && !t.deleted);

/** Per month: earned from worked shifts (by shift date), paid in (Monzo pay), spent (Monzo card spending). */
export function monthly(shifts, payments, transactions, months) {
  return months.map((month) => ({
    month,
    earned: pennies(shifts.filter((s) => s.status === 'worked' && s.date.startsWith(month)).reduce((t, s) => t + shiftPay(s), 0)),
    paidIn: pennies(payments.filter((p) => p.date.startsWith(month)).reduce((t, p) => t + p.amount, 0)),
    spent: pennies(spending(transactions).filter((t) => t.date.startsWith(month)).reduce((t, x) => t - x.amount, 0)),
    hours: shifts.filter((s) => s.status === 'worked' && s.date.startsWith(month)).reduce((t, s) => t + Number(s.hours || 0), 0)
  }));
}

// Category colours follow the category, never its rank: a fixed slot per category,
// everything else folds into a neutral "Other".
export const CATEGORY_SLOT = { Bills: 1, 'Eating out': 2, Groceries: 3, Transport: 4, Shopping: 5, Entertainment: 6 };
const pretty = (c) => {
  const s = String(c || 'General').replace(/_/g, ' ');
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
};
export const categoryName = (c) => {
  const p = pretty(c);
  return Object.keys(CATEGORY_SLOT).find((k) => k.toLowerCase() === p.toLowerCase()) ?? p;
};

/** Spending by category for a month, biggest first, each with its colour slot (0 = Other). */
export function categories(transactions, month) {
  const totals = {};
  for (const t of spending(transactions)) {
    if (!t.date.startsWith(month)) continue;
    const c = categoryName(t.category);
    totals[c] = (totals[c] ?? 0) - t.amount;
  }
  return Object.entries(totals)
    .map(([category, total]) => ({ category, total: pennies(total), slot: CATEGORY_SLOT[category] ?? 0 }))
    .filter((c) => c.total > 0.005)
    .sort((a, b) => b.total - a.total);
}

/** Segments for the part-to-whole bar: the coloured categories in fixed slot order, then everything else as Other. */
export function segments(cats) {
  const named = cats.filter((c) => c.slot).sort((a, b) => a.slot - b.slot);
  const other = cats.filter((c) => !c.slot).reduce((t, c) => t + c.total, 0);
  return other > 0.005 ? [...named, { category: 'Other', total: pennies(other), slot: 0 }] : named;
}

/** Daily spend for a month: { 'YYYY-MM-DD': { total, items[] } }. */
export function daily(transactions, month) {
  const out = {};
  for (const t of spending(transactions)) {
    if (!t.date.startsWith(month)) continue;
    const d = (out[t.date] ??= { total: 0, items: [] });
    d.total = pennies(d.total - t.amount);
    d.items.push(t);
  }
  return out;
}

/** Average spend per weekday (Mon = 0) across the given months, counting days in range. */
export function weekdayAverages(transactions, months, weekdayOf) {
  const sums = Array(7).fill(0);
  const days = Array(7).fill(0);
  const seenDays = new Set();
  for (const month of months) {
    const [y, m] = month.split('-').map(Number);
    const n = new Date(Date.UTC(y, m, 0)).getUTCDate();
    for (let d = 1; d <= n; d += 1) {
      const key = `${month}-${String(d).padStart(2, '0')}`;
      seenDays.add(key);
      days[weekdayOf(key)] += 1;
    }
  }
  for (const t of spending(transactions)) if (seenDays.has(t.date)) sums[weekdayOf(t.date)] -= t.amount;
  return sums.map((s, i) => (days[i] ? pennies(s / days[i]) : 0));
}

export function topMerchants(transactions, month, n = 5) {
  const totals = {};
  for (const t of spending(transactions)) {
    if (!t.date.startsWith(month)) continue;
    const k = t.name;
    (totals[k] ??= { name: k, total: 0, count: 0 });
    totals[k].total = pennies(totals[k].total - t.amount);
    totals[k].count += 1;
  }
  return Object.values(totals)
    .sort((a, b) => b.total - a.total)
    .slice(0, n);
}

/** Earnings from worked shifts grouped by a key (venue or role), biggest first. */
export function earningsBy(shifts, keyOf, since) {
  const totals = {};
  for (const s of shifts) {
    if (s.status !== 'worked' || s.date < since) continue;
    const k = keyOf(s);
    (totals[k] ??= { key: k, total: 0, hours: 0, shifts: 0 });
    totals[k].total = pennies(totals[k].total + shiftPay(s));
    totals[k].hours += Number(s.hours || 0);
    totals[k].shifts += 1;
  }
  return Object.values(totals).sort((a, b) => b.total - a.total);
}

/** Average £ per paid hour over worked shifts since a date; falls back to the base rate. */
export function hourlyRate(shifts, since, fallback = 13.45) {
  const w = shifts.filter((s) => s.status === 'worked' && s.date >= since);
  const hours = w.reduce((t, s) => t + Number(s.hours || 0), 0);
  return hours ? w.reduce((t, s) => t + shiftPay(s), 0) / hours : fallback;
}
