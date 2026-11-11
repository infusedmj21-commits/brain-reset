// UK PAYE estimates for Michael's main job, checked against his Compass payslips.
//
// Income tax is cumulative: each payday, tax to date = 20% × (pay to date − free pay to date),
// where free pay builds up every week, whether or not he works. So a quiet week or a week off
// isn't "lost" allowance: the next payday catches up. Weekly free pay is allowance ÷ 52.
// National Insurance is per pay week: 8% of gross above £242. It isn't cumulative and isn't refunded.
//
// Rates are for 2026/27 (England). These are estimates, not tax advice.
import { addDays, daysBetween } from './dates.js';
import { pennies } from './money.js';

export const PERSONAL_ALLOWANCE = 12570;
export const BASIC_BAND = 37700; // taxable income above the allowance taxed at 20%
export const BASIC_RATE = 0.2;
export const HIGHER_RATE = 0.4;
export const NI_PRIMARY_THRESHOLD = 242; // weekly
export const NI_UPPER_LIMIT = 967; // weekly
export const NI_MAIN = 0.08;
export const NI_UPPER = 0.02;
export const WEEKS = 52;

/** Tax-year start (6 April) for the year a date falls in. */
export function taxYearStart(date) {
  const y = Number(date.slice(0, 4));
  const start = `${y}-04-06`;
  return date >= start ? start : `${y - 1}-04-06`;
}
export const taxYearEnd = (date) => addDays(taxYearStart(date), 364); // 5 April
export const taxYearLabel = (date) => {
  const y = Number(taxYearStart(date).slice(0, 4));
  return `${y}/${String(y + 1).slice(2)}`;
};

/** PAYE tax week (1–53) a payday falls in. */
export const taxWeek = (payday) => Math.floor(daysBetween(taxYearStart(payday), payday) / 7) + 1;

/** Annual tax-free amount from a tax code (L, M, N, T codes add 9). Null when not a simple code. */
export function allowanceFromCode(code) {
  const c = String(code || '').trim().toUpperCase().replace(/\s/g, '');
  const m = c.match(/^S?C?(\d{1,5})(L|M|N|T)$/);
  if (m) return Number(m[1]) * 10 + 9;
  if (c === 'BR' || c === '0T') return 0;
  return null;
}

/**
 * Cumulative tax due to date (what HMRC's tables give for that week).
 * Taxable pay and free pay are rounded down to whole pounds before the rate is applied.
 */
export function taxToDate(taxable, week, allowance) {
  // HMRC's tables round the weekly tax-free amount up to the penny (code 597L: £114.99 a week).
  const free = week * (Math.ceil(Number(((allowance / WEEKS) * 100).toFixed(6))) / 100);
  const due = Math.max(0, Math.floor(taxable - free));
  const band = Math.floor((BASIC_BAND * week) / WEEKS);
  const tax = Math.min(due, band) * BASIC_RATE + Math.max(0, due - band) * HIGHER_RATE;
  return pennies(tax);
}

/** National Insurance on one week's pay. */
export function niFor(weeklyGross) {
  const main = Math.max(0, Math.min(weeklyGross, NI_UPPER_LIMIT) - NI_PRIMARY_THRESHOLD) * NI_MAIN;
  const upper = Math.max(0, weeklyGross - NI_UPPER_LIMIT) * NI_UPPER;
  return pennies(main + upper);
}

/** What a whole year's income should cost in income tax (with the full personal allowance). */
export function annualTax(income, allowance = PERSONAL_ALLOWANCE) {
  const taxable = Math.max(0, Math.floor(income - allowance));
  return pennies(Math.min(taxable, BASIC_BAND) * BASIC_RATE + Math.max(0, taxable - BASIC_BAND) * HIGHER_RATE);
}

/**
 * Share of basic pay added as rolled-up holiday pay, learnt only from uploaded payslips.
 * Zero until a payslip with both basic and holiday lines exists.
 */
export function holidayRatio(payslips) {
  const usable = payslips.filter((p) => !p.deleted && p.basic > 0);
  const basic = usable.reduce((t, p) => t + p.basic, 0);
  const holiday = usable.reduce((t, p) => t + (p.holiday || 0), 0);
  return basic > 0 ? holiday / basic : 0;
}

/** The latest payslip on or before a date, in the same tax year. */
export function latestPayslip(payslips, date) {
  const start = taxYearStart(date);
  return payslips
    .filter((p) => !p.deleted && p.payDate <= date && p.payDate >= start)
    .sort((a, b) => b.payDate.localeCompare(a.payDate))[0] ?? null;
}

const NEAR_TERM_WEEKS = 4;

/**
 * Walk the whole tax year payday by payday.
 *
 * - Paydays with a payslip use its real figures.
 * - Other paydays estimate gross = shift pay × (1 + holiday ratio from payslips).
 * - Within the next 4 weeks only booked shifts count. Further out, a week with less booked
 *   than the usual-week assumption uses the assumption instead.
 *
 * `periods` is a list of { payday, expected } (basic shift pay for that payday).
 * Returns each payday's figures plus year-end totals.
 */
export function projectYear({ payslips, periods, today, allowance, weeklyAssumption = 0 }) {
  const start = taxYearStart(today);
  const end = taxYearEnd(today);
  const ratio = holidayRatio(payslips);
  const slips = new Map(payslips.filter((p) => !p.deleted).map((p) => [p.payDate, p]));
  const expected = new Map(periods.map((p) => [p.payday, p.expected]));

  // First Wednesday payday on or after 6 April.
  let payday = start;
  while (new Date(`${payday}T12:00:00Z`).getUTCDay() !== 3) payday = addDays(payday, 1);

  const weeks = [];
  let taxable = 0;
  let tax = 0;
  let ni = 0;
  let anchored = false;
  for (; payday <= end; payday = addDays(payday, 7)) {
    const week = taxWeek(payday);
    const slip = slips.get(payday);
    if (slip) {
      // Payslip YTD totals reset the running sums, so earlier gaps don't matter.
      const thisTax = slip.tax;
      taxable = slip.taxableToDate ?? slip.grossToDate;
      tax = slip.taxToDate;
      ni = slip.niToDate ?? ni + slip.ni;
      anchored = true;
      weeks.push({ payday, week, gross: slip.gross, tax: thisTax, ni: slip.ni, net: slip.net, source: 'payslip', slip });
      continue;
    }
    const isPast = payday <= today;
    const shiftsBasic = expected.get(payday) ?? 0;
    let basic = shiftsBasic;
    let source = 'shifts';
    if (!isPast && daysBetween(today, payday) > NEAR_TERM_WEEKS * 7 && weeklyAssumption > shiftsBasic) {
      basic = weeklyAssumption;
      source = 'assumed';
    }
    if (isPast && !anchored) {
      // Before the first payslip we can't trust app records: leave history to the payslip YTD.
      weeks.push({ payday, week, gross: null, tax: null, ni: null, net: null, source: 'before-payslips' });
      continue;
    }
    const gross = pennies(source === 'assumed' ? basic : basic * (1 + ratio));
    if (gross <= 0) {
      // No pay, no payslip: nothing changes until the next paid week catches up the free pay.
      weeks.push({ payday, week, gross: 0, tax: 0, ni: 0, net: 0, source: 'none', past: isPast });
      continue;
    }
    const newTaxable = taxable + gross;
    const due = taxToDate(newTaxable, week, allowance);
    const weekTax = pennies(due - tax);
    const weekNi = niFor(gross);
    taxable = newTaxable;
    tax = due;
    ni = pennies(ni + weekNi);
    weeks.push({ payday, week, gross, tax: weekTax, ni: weekNi, net: pennies(gross - weekTax - weekNi), source, past: isPast });
  }
  return { weeks, ratio, taxable: pennies(taxable), tax: pennies(tax), ni: pennies(ni), start, end };
}

/**
 * Estimated refund (positive) or bill (negative) after the year ends:
 * all tax paid across jobs minus what the year's total income should cost.
 */
export function refundEstimate({ year, otherIncome = 0, otherTax = 0 }) {
  const income = pennies(year.taxable + otherIncome);
  const paid = pennies(year.tax + otherTax);
  const owed = annualTax(income);
  return { income, paid, owed, refund: pennies(paid - owed) };
}

/**
 * If the main job's code changed before the next payday, that payday would repay the
 * overpaid tax at once (cumulative codes do this), and each week after would take less.
 */
export function codeFixGain({ payslip, today, currentAllowance, fixedAllowance, weeklyGross }) {
  if (!payslip) return null;
  const nextWeek = Math.min(WEEKS, taxWeek(addDays(today, 7)));
  const taxable = payslip.taxableToDate ?? payslip.grossToDate;
  const lump = pennies(payslip.taxToDate - taxToDate(taxable, nextWeek, fixedAllowance));
  const weeklyTax = (allowance) => Math.max(0, weeklyGross - allowance / WEEKS) * BASIC_RATE;
  const weekly = pennies(weeklyTax(currentAllowance) - weeklyTax(fixedAllowance));
  return { lump: Math.max(0, lump), weekly: Math.max(0, weekly) };
}
