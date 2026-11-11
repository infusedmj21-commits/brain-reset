import { db, live, save } from '../db.js';
import { listPayments, listShifts } from './money.js';
import { daysBetween } from '../logic/dates.js';
import { paydays } from '../logic/payroll.js';
import {
  allowanceFromCode, codeFixGain, latestPayslip, projectYear, refundEstimate, taxWeek, taxYearEnd, taxYearStart
} from '../logic/tax.js';

// Payslips and tax settings. Only pay figures are stored, never names, addresses or NI numbers.

export const listPayslips = (database = db) => live('payslips', database);

const KEEP = [
  'payDate', 'taxWeek', 'taxCode', 'basis', 'lines', 'basic', 'holiday', 'basicHours', 'gross', 'nonTaxable',
  'tax', 'ni', 'pension', 'net', 'deductions', 'grossToDate', 'taxableToDate', 'taxToDate', 'niToDate', 'pensionToDate'
];

/** Save a parsed payslip. One per pay date: re-uploading replaces it. */
export function savePayslip(parsed, database = db) {
  const row = { id: `payslip:${parsed.payDate}`, employer: 'Compass' };
  for (const k of KEEP) if (parsed[k] !== undefined) row[k] = parsed[k];
  return save('payslips', row, database);
}

export const deletePayslip = (slip, database = db) => save('payslips', { ...slip, deleted: true }, database);

// Starting point from the HMRC app: income and tax from other jobs this tax year.
export const TAX_DEFAULTS = { taxCode: '', otherIncome: 665.84, otherTax: 0, weeklyAssumption: null, fixedCode: '1257L' };
const SETTINGS_ID = 'setting:tax';

export async function getTaxSettings(database = db) {
  const row = await database.checkins.get(SETTINGS_ID);
  return { ...TAX_DEFAULTS, ...(row && !row.deleted ? row.values : {}) };
}
export async function setTaxSettings(values, database = db) {
  const current = await getTaxSettings(database);
  return save('checkins', { id: SETTINGS_ID, kind: 'setting', date: '', values: { ...current, ...values } }, database);
}

/** Tax code to use: the one set by hand, else the latest payslip's, else 1257L. */
export function codeInUse(settings, latest) {
  const code = settings.taxCode || latest?.taxCode || '1257L';
  return { code, allowance: allowanceFromCode(code) ?? 12579 };
}

/**
 * Everything the Tax screen and the payday list need, for the tax year a date is in.
 * Null refund when there's no payslip yet (the year-to-date totals come from payslips).
 */
export async function loadTaxPicture(date, database = db) {
  const [shifts, payments, payslips, settings] = await Promise.all([
    listShifts(database),
    listPayments(database),
    listPayslips(database),
    getTaxSettings(database)
  ]);
  return taxPicture({ shifts, payments, payslips, settings, date });
}

export function taxPicture({ shifts, payments, payslips, settings, date }) {
  const latest = latestPayslip(payslips, date);
  const { code, allowance } = codeInUse(settings, latest);
  const usual = latest ? Math.round((latest.taxableToDate ?? latest.grossToDate) / (latest.taxWeek || taxWeek(latest.payDate)) / 10) * 10 : 0;
  const weeklyAssumption = settings.weeklyAssumption ?? usual;
  const back = Math.ceil(daysBetween(taxYearStart(date), date) / 7) + 1;
  const ahead = Math.ceil(daysBetween(date, taxYearEnd(date)) / 7) + 1;
  const periods = paydays(shifts, payments, date, back, ahead);
  const year = projectYear({ payslips, periods, today: date, allowance, weeklyAssumption });
  const refund = latest ? refundEstimate({ year, otherIncome: Number(settings.otherIncome) || 0, otherTax: Number(settings.otherTax) || 0 }) : null;
  const fixed = allowanceFromCode(settings.fixedCode) ?? 12579;
  const gain = latest && allowance < fixed ? codeFixGain({ payslip: latest, today: date, currentAllowance: allowance, fixedAllowance: fixed, weeklyGross: weeklyAssumption }) : null;
  const byPayday = new Map(year.weeks.map((w) => [w.payday, w]));
  return { latest, code, allowance, usual, weeklyAssumption, year, refund, gain, byPayday, settings, payslips, periods };
}
