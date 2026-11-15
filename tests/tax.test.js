import { readFileSync, readdirSync } from 'node:fs';
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

describe('every payslip this year', () => {
  const dir = new URL('./fixtures/', import.meta.url);
  const files = readdirSync(dir).filter((f) => f.startsWith('payslip-'));
  const slips = files.map((f) => parsePayslipText(readFileSync(new URL(f, dir), 'utf8')));

  it('reads all of them, including weeks with no tax or NI lines', () => {
    expect(slips.length).toBeGreaterThanOrEqual(19);
    for (const p of slips) expect(Math.abs(p.gross - p.tax - p.ni - p.net)).toBeLessThan(0.01);
    expect(slips.find((p) => p.payDate === '2026-04-15')).toMatchObject({ tax: 0, ni: 0, net: 185.06 });
    expect(slips.find((p) => p.payDate === '2026-08-05').tax).toBe(-5.2);
  });
  it('reproduces tax to date on every one', () => {
    for (const p of slips) expect([p.payDate, taxToDate(p.taxableToDate, p.taxWeek, 5979)]).toEqual([p.payDate, p.taxToDate]);
  });
  it('gets NI within a penny on every one', () => {
    for (const p of slips) expect(Math.abs(niFor(p.gross) - p.ni)).toBeLessThan(0.011);
  });
});

describe('a payslip with a tax refund (new code 1163L)', () => {
  // The 11 Nov payslip, moved on a week with £300 pay and every penny of tax so far refunded.
  const refundSlip = (taxLine, deductions) =>
    fixture('1111')
      .replace('11.11.2026 32/2026', '18.11.2026 33/2026')
      .replace('Tax Code 597L', 'Tax Code 1163L')
      .replace('410.16 0.00 410.16 72.45 337.71 Payroll - BACS 337.71', `300.00 0.00 300.00 ${deductions} 849.56 Payroll - BACS 849.56`)
      .replace('Gross to date 6,451.31 Taxable Pay to date 6,451.31', 'Gross to date 6,751.31 Taxable Pay to date 6,751.31')
      .replace('Tax Paid to date 554.20 NI Paid to date 131.29', 'Tax Paid to date 0.00 NI Paid to date 135.93')
      .replace('Tax paid 59.00 National Insurance 13.45', `${taxLine} National Insurance 4.64`)
      .replace(/Constellation (Basic|Holiday) Hours[^C]*/g, '')
      .concat(' Constellation Basic Hours 13.45 22.30 300.00');

  it.each([
    ['minus in front', 'Tax paid -554.20', '-549.56'],
    ['minus behind', 'Tax paid 554.20-', '549.56-'],
    ['printed as positive', 'Tax paid 554.20', '-549.56'],
    ['its own line', 'Tax refund 554.20', '-549.56']
  ])('reads it as money back (%s)', (_, line, ded) => {
    const p = parsePayslipText(refundSlip(line, ded));
    expect(p).toMatchObject({ payDate: '2026-11-18', taxCode: '1163L', gross: 300, tax: -554.2, taxBack: 554.2, ni: 4.64, net: 849.56, taxToDate: 0 });
  });

  it('drops the April refund estimate once uploaded', () => {
    const slip = parsePayslipText(refundSlip('Tax paid -554.20', '-549.56'));
    const periods = [{ payday: '2026-11-25', expected: 250 }];
    const before = projectYear({ payslips: [sep, nov], periods, today: '2026-11-19', allowance: allowanceFromCode('597L') });
    const after = projectYear({ payslips: [sep, nov, slip], periods, today: '2026-11-19', allowance: allowanceFromCode('1163L') });
    const r0 = refundEstimate({ year: before, otherIncome: 665.84 }).refund;
    const r1 = refundEstimate({ year: after, otherIncome: 665.84 }).refund;
    expect(r0).toBeGreaterThan(500);
    expect(r1).toBeLessThan(5);
    expect(after.weeks.find((w) => w.payday === '2026-11-18')).toMatchObject({ source: 'payslip', tax: -554.2, net: 849.56 });
  });

  it('shows the refund on the next payday as soon as the new code is entered', () => {
    const periods = [{ payday: '2026-11-18', expected: 300 }];
    const year = projectYear({ payslips: [sep, nov], periods, today: '2026-11-15', allowance: allowanceFromCode('1163L') });
    const next = year.weeks.find((w) => w.payday === '2026-11-18');
    expect(next.tax).toBeLessThan(-500);
    expect(next.net).toBeGreaterThan(800);
  });
});

describe('which tax code is used', async () => {
  const { codeInUse } = await import('../src/data/tax.js');
  const slip = (payDate, taxCode) => ({ payDate, taxCode });
  it('uses a newly entered code while payslips still show the old one', () => {
    const s = { taxCode: '1163L', taxCodeSetOn: '2026-11-15', taxCodeWas: '597L' };
    expect(codeInUse(s, slip('2026-11-11', '597L')).code).toBe('1163L');
    expect(codeInUse(s, slip('2026-11-18', '597L')).code).toBe('1163L');
  });
  it('hands back to payslips once payroll switches code', () => {
    const s = { taxCode: '1163L', taxCodeSetOn: '2026-11-15', taxCodeWas: '597L' };
    expect(codeInUse(s, slip('2026-11-25', '1150L'))).toMatchObject({ code: '1150L', source: 'payslip' });
  });
});
