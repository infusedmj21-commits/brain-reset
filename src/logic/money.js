// Pure money logic: roles, expected pay from shifts, Monzo CSV parsing and summaries.
import { addDays, weekStart } from './dates.js';

// Roles in the order Michael does them most; the rest alphabetical. Bar supervisor left out.
// The two till roles and the two team leader roles are merged.
export const ROLE_SEED = [
  ['set-up-staff', 'Set up staff', 13.45],
  ['till-operator', 'Till operator', 13.45],
  ['logistics-porter', 'Logistics porter', 13.94],
  ['team-leader', 'Team leader', 13.94],
  ['pourer', 'Pourer', 13.45],
  ['bartender', 'Bartender', 13.45],
  ['cellar-porter', 'Cellar porter', 13.45],
  ['clearer', 'Clearer', 13.45],
  ['kitchen-porter', 'Kitchen porter', 13.45],
  ['nec-fb-assistant-logistics', 'NEC F&B assistant logistics', 13.45],
  ['nec-food-service-assistant', 'NEC food service assistant', 13.45],
  ['nec-hospitality-bar', 'NEC hospitality bar', 13.45],
  ['nec-plate-wait', 'NEC plate wait', 13.45],
  ['runner', 'Runner', 13.45],
  ['wash-up', 'Wash up', 13.45],
  ['waiter', 'Waiter', 13.45],
  ['wine-waiter', 'Wine waiter', 13.45]
].map(([slug, name, rate], order) => ({ id: `role:${slug}`, name, rate, order }));

export const VENUE_SUGGESTIONS = ["St Andrew's", 'Molineux', 'Villa Park', 'Edgbaston', 'NEC'];

// Round half up to the penny, as payroll does: 8.5h × £13.45 = £114.325 → £114.33.
// toFixed(6) first strips floating-point noise (114.32499999…) before rounding.
export const pennies = (n) => Math.round(Number((n * 100).toFixed(6))) / 100;
export const shiftPay = (s) => pennies((Number(s.hours) || 0) * (Number(s.rate) || 0));

export const gbp = (n) => `${n < 0 ? '−' : ''}£${Math.abs(n).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
export const gbp0 = (n) => `${n < 0 ? '−' : ''}£${Math.round(Math.abs(n)).toLocaleString('en-GB')}`;

/** Roles sorted by how often they were used in the last 90 days, then by Michael's order. */
export function orderRoles(roles, shifts, date) {
  const since = addDays(date, -90);
  const uses = {};
  for (const s of shifts) if (s.status !== 'cancelled' && s.date >= since) uses[s.role_id] = (uses[s.role_id] ?? 0) + 1;
  return [...roles].sort((a, b) => (uses[b.id] ?? 0) - (uses[a.id] ?? 0) || (a.order ?? 99) - (b.order ?? 99));
}

/** Hours to prefill for a venue: the last shift logged there, else 8. */
export function defaultHours(shifts, venue) {
  const last = [...shifts].filter((s) => s.venue === venue && s.status !== 'cancelled').sort((a, b) => b.date.localeCompare(a.date))[0];
  return last?.hours ?? 8;
}

/**
 * Weekly rows for the last `weeks` weeks, oldest first:
 * expected = pay for shifts worked (or still booked) that week; received = pay that landed that week.
 */
export function weeklyPay(shifts, payments, date, weeks = 8) {
  const thisWeek = weekStart(date);
  const rows = [];
  for (let i = weeks - 1; i >= 0; i -= 1) {
    const start = addDays(thisWeek, -7 * i);
    const end = addDays(start, 6);
    const inWeek = (d) => d >= start && d <= end;
    const ws = shifts.filter((s) => s.status !== 'cancelled' && inWeek(s.date));
    rows.push({
      start,
      worked: pennies(ws.filter((s) => s.status === 'worked').reduce((t, s) => t + shiftPay(s), 0)),
      booked: pennies(ws.filter((s) => s.status === 'booked').reduce((t, s) => t + shiftPay(s), 0)),
      hours: ws.reduce((t, s) => t + (Number(s.hours) || 0), 0),
      received: pennies(payments.filter((p) => inWeek(p.date)).reduce((t, p) => t + p.amount, 0))
    });
  }
  return rows;
}

/**
 * Worked-but-not-yet-paid balance since the first payment on record:
 * everything worked from then on, minus everything received from then on.
 * About one week's pay is normal when pay lands a week behind.
 */
export function unpaidBalance(shifts, payments) {
  if (!payments.length) return null;
  const from = [...payments].map((p) => p.date).sort()[0];
  const lag = addDays(from, -7); // the first payment covers the week before it
  const worked = shifts.filter((s) => s.status === 'worked' && s.date >= lag).reduce((t, s) => t + shiftPay(s), 0);
  const received = payments.reduce((t, p) => t + p.amount, 0);
  return pennies(worked - received);
}

// ---- CSV ----

/** RFC 4180-ish CSV: quoted fields, escaped quotes, commas and newlines inside quotes. */
export function parseCSV(text) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  const src = text.replace(/^﻿/, '');
  for (let i = 0; i < src.length; i += 1) {
    const c = src[i];
    if (quoted) {
      if (c === '"' && src[i + 1] === '"') {
        field += '"';
        i += 1;
      } else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && src[i + 1] === '\n') i += 1;
      row.push(field);
      if (row.some((f) => f !== '')) rows.push(row);
      row = [];
      field = '';
    } else field += c;
  }
  row.push(field);
  if (row.some((f) => f !== '')) rows.push(row);
  return rows;
}

const ukDate = (s) => {
  const m = String(s).trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  const iso = String(s).trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
  return iso ? `${iso[1]}-${iso[2]}-${iso[3]}` : null;
};

const money = (s) => {
  const n = Number(String(s ?? '').replace(/[£,\s]/g, ''));
  return Number.isFinite(n) ? n : 0;
};

/** Turn a Monzo CSV export into plain transaction objects. Throws if it doesn't look like one. */
export function parseMonzo(text, account) {
  const [header, ...body] = parseCSV(text);
  if (!header) throw new Error('That file is empty.');
  const col = (name) => header.findIndex((h) => h.trim().toLowerCase() === name);
  const idx = {
    id: col('transaction id'),
    date: col('date'),
    type: col('type'),
    name: col('name'),
    category: col('category'),
    amount: col('amount'),
    description: col('description')
  };
  if (idx.date < 0 || idx.amount < 0) throw new Error('That doesn’t look like a Monzo export (no Date or Amount column).');
  return body
    .map((r) => {
      const date = ukDate(r[idx.date]);
      if (!date) return null;
      const amount = money(r[idx.amount]);
      const name = (r[idx.name] ?? '').trim();
      const description = (r[idx.description] ?? '').trim();
      const txId = (r[idx.id] ?? '').trim() || `${date}|${amount}|${name}|${description}`;
      return {
        id: `monzo:${txId}`,
        date,
        amount,
        name: name || description || 'Unknown',
        type: (r[idx.type] ?? '').trim(),
        category: (r[idx.category] ?? '').trim() || 'General',
        description,
        account
      };
    })
    .filter(Boolean);
}

/** Moves between Michael's own accounts, pots and Flex: never spending, never income. */
export function isTransfer(t) {
  const text = `${t.type} ${t.name} ${t.description} ${t.category}`.toLowerCase();
  return /pot transfer|savings pot|\bpot\b|monzo flex|flex repayment/.test(text) || t.category.toLowerCase() === 'transfers';
}

/**
 * Split parsed rows into pay, spending, other income and transfers.
 * payPayees: names (lower case) that are Michael's pay.
 */
export function classify(rows, payPayees) {
  const out = { pay: [], spending: [], income: [], transfers: [] };
  for (const t of rows) {
    if (isTransfer(t)) out.transfers.push(t);
    else if (t.amount > 0 && payPayees.includes(t.name.toLowerCase())) out.pay.push(t);
    else if (t.amount > 0) out.income.push(t);
    else if (t.amount < 0) out.spending.push(t);
  }
  return out;
}

/** Incoming payees with their totals, biggest first: used to ask "which of these is your pay?". */
export function incomingPayees(rows) {
  const totals = {};
  for (const t of rows) if (t.amount > 0 && !isTransfer(t)) totals[t.name] = (totals[t.name] ?? 0) + t.amount;
  return Object.entries(totals)
    .map(([name, total]) => ({ name, total }))
    .sort((a, b) => b.total - a.total);
}

/** Spending per category for a 'YYYY-MM' month, biggest first. */
export function spendingByCategory(transactions, month) {
  const totals = {};
  for (const t of transactions) {
    if (t.kind !== 'spending') continue;
    if (!t.date.startsWith(month)) continue;
    totals[t.category] = (totals[t.category] ?? 0) - t.amount;
  }
  return Object.entries(totals)
    .map(([category, total]) => ({ category, total: Math.round(total * 100) / 100 }))
    .filter((c) => c.total > 0.005)
    .sort((a, b) => b.total - a.total);
}
