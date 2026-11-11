import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parsePayslipText } from '../src/logic/payslip.js';
import {
  allowanceFromCode, annualTax, codeFixGain, holidayRatio, niFor, projectYear,
  refundEstimate, taxToDate, taxWeek, taxYearLabel
} from '../src/logic/tax.js';

const fixture = (f) => readFileSync(new URL(`./fixtures/payslip-${f}.txt`, import.meta.url), 'utf8');
const sep = parsePayslipText(fixture('0916'));
const nov = parsePayslipText(fixture('1111'));

describe('payslip reader', () => {
  it('reads the September payslip', () => {
    expect(sep).toMatchObject({
      payDate: '2026-09-16', taxWeek: 24, taxCode: '597L', basis: 'cumulative',
      gross: 533.9, tax: 83.8, ni: 23.35, net: 426.75,
      basic: 476.1, holiday: 57.8, grossToDate: 3855.2, taxToDate: 219, niToDate: 59.69
    });
    expect(sep.lines).toHaveLength(4);
  });
  it('reads the November payslip', () => {
    expect(nov).toMatchObject({
      payDate: '2026-11-11', taxWeek: 32, gross: 410.16, tax: 59, ni: 13.45, net: 337.71,
      basic: 365.71, holiday: 44.45, basicHours: 26.83, taxableToDate: 6451.31, taxToDate: 554.2, niToDate: 131.29
    });
  });
  it('keeps no personal details', () => {
    const keys = Object.keys(nov).join(' ');
    expect(keys).not.toMatch(/name|address|ni_?number|ref/i);
  });
  it('rejects something that is not a payslip', () => {
    expect(() => parsePayslipText('hello world')).toThrow();
  });
});

describe('tax maths', () => {
  it('turns tax codes into allowances', () => {
    expect(allowanceFromCode('597L')).toBe(5979);
    expect(allowanceFromCode('1257L')).toBe(12579);
    expect(allowanceFromCode('158T')).toBe(1589);
    expect(allowanceFromCode('BR')).toBe(0);
    expect(allowanceFromCode('K100')).toBeNull();
  });
  it('works out tax weeks', () => {
    expect(taxWeek('2026-09-16')).toBe(24);
    expect(taxWeek('2026-11-11')).toBe(32);
    expect(taxWeek('2026-04-08')).toBe(1);
    expect(taxYearLabel('2027-01-10')).toBe('2026/27');
  });
  it('reproduces the tax on both payslips', () => {
    expect(taxToDate(3855.2, 24, 5979)).toBe(219);
    expect(taxToDate(6451.31, 32, 5979)).toBe(554.2);
  });
  it('reproduces National Insurance', () => {
    expect(niFor(533.9)).toBe(23.35);
    expect(niFor(410.16)).toBe(13.45);
    expect(niFor(200)).toBe(0);
  });
  it('charges nothing on income under the personal allowance', () => {
    expect(annualTax(12000)).toBe(0);
    expect(annualTax(13570)).toBe(200);
  });
  it('learns holiday pay only from payslips', () => {
    expect(holidayRatio([])).toBe(0);
    expect(holidayRatio([sep, nov])).toBeCloseTo(102.25 / 841.81, 6);
  });
});

describe('year projection', () => {
  const allowance = 5979;
  it('matches the payslip totals and adds later paydays', () => {
    const year = projectYear({
      payslips: [sep, nov],
      periods: [{ payday: '2026-11-18', expected: 300 }],
      today: '2026-11-12',
      allowance,
      weeklyAssumption: 0
    });
    const w = (d) => year.weeks.find((x) => x.payday === d);
    expect(w('2026-11-11').source).toBe('payslip');
    const next = w('2026-11-18');
    expect(next.gross).toBeCloseTo(300 * (1 + holidayRatio([sep, nov])), 2);
    expect(next.tax).toBeCloseTo(taxToDate(6451.31 + next.gross, 33, allowance) - 554.2, 2);
    expect(year.weeks.at(-1).payday).toBe('2027-03-31');
    // No more work: tax paid stays as it is, so nothing further accrues.
    expect(year.tax).toBe(taxToDate(6451.31 + next.gross, 33, allowance));
  });
  it('fills quiet future weeks with the usual-week assumption', () => {
    const year = projectYear({ payslips: [nov], periods: [], today: '2026-11-12', allowance, weeklyAssumption: 250 });
    const assumed = year.weeks.filter((w) => w.source === 'assumed');
    const near = year.weeks.filter((w) => w.payday > '2026-11-12' && w.source === 'none');
    expect(near.length).toBe(4);
    expect(assumed.length).toBe(20 - 4);
    expect(year.taxable).toBeCloseTo(6451.31 + 250 * 16, 2);
  });
  it('estimates the refund across all jobs', () => {
    const year = projectYear({ payslips: [nov], periods: [], today: '2026-11-12', allowance, weeklyAssumption: 0 });
    const r = refundEstimate({ year, otherIncome: 665.84, otherTax: 0 });
    expect(r.income).toBe(7117.15);
    expect(r.owed).toBe(0);
    expect(r.refund).toBe(554.2);
  });
  it('lets later paid weeks catch up the free pay', () => {
    const year = projectYear({ payslips: [nov], periods: [{ payday: '2027-03-31', expected: 100 }], today: '2026-11-12', allowance, weeklyAssumption: 0 });
    const last = year.weeks.at(-1);
    expect(last.tax).toBeLessThan(0); // tax handed back in that pay
    expect(year.tax).toBe(taxToDate(6451.31 + last.gross, 52, allowance));
  });
  it('shows what fixing the tax code would give back', () => {
    const gain = codeFixGain({ payslip: nov, today: '2026-11-12', currentAllowance: 5979, fixedAllowance: 12579, weeklyGross: 250 });
    expect(gain.lump).toBe(554.2);
    expect(gain.weekly).toBeCloseTo((250 - 5979 / 52) * 0.2 - (250 - 12579 / 52) * 0.2, 2);
  });
});
