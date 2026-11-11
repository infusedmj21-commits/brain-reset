// Reads the figures Artemis needs from a Compass Group pay advice (text extracted from the PDF).
// Deliberately ignores personal details (name, address, NI number, employee ref).

const num = (s) => (s == null ? null : Number(String(s).replace(/,/g, '')));
const money = String.raw`(-?[\d,]+\.\d{2})`;

function first(text, re) {
  const m = text.match(re);
  return m ? m.slice(1) : null;
}

/** Parse a payslip's text. Throws if the core figures aren't there. */
export function parsePayslipText(raw) {
  const text = raw.replace(/\s+/g, ' ');

  // Labels and values sit in separate columns, so values are found by their shape and neighbours.
  const date = first(text, /\b(\d{2})\.(\d{2})\.(\d{4})(?: (\d{1,2})\/(\d{4}))?/);
  if (!date) throw new Error('No pay date found: is this a Compass pay advice PDF?');
  const payDate = `${date[2]}-${date[1]}-${date[0]}`;
  const taxWeek = date[3] ? Number(date[3]) : null;

  const code = first(text, /Tax Code ([0-9]{1,5}[A-Z]{1,2}|[A-Z]{1,2}[0-9]{0,5}|BR|D0|D1|NT|0T)\b(?: (Cumulative|Week ?1|Month ?1|W1|M1|X))?/);

  const lines = [];
  for (const m of text.matchAll(new RegExp(String.raw`(Basic Hours|Holiday Hours Paid|Overtime[A-Za-z ]*|Bank Holiday[A-Za-z ]*|[A-Z][A-Za-z ]+? Hours(?: Paid)?) (\d+\.\d{2,4}) (-?\d+\.\d{1,2}) ${money}`, 'g'))) {
    lines.push({ item: m[1].trim(), rate: num(m[2]), units: num(m[3]), amount: num(m[4]) });
  }

  const pick = (re) => {
    const m = first(text, re);
    return m ? num(m[0]) : null;
  };

  const out = {
    payDate,
    taxWeek,
    taxCode: code ? code[0] : null,
    basis: code?.[1] ? (/cumul/i.test(code[1]) ? 'cumulative' : 'week1') : null,
    lines,
    basic: lines.filter((l) => /basic/i.test(l.item)).reduce((t, l) => t + l.amount, 0),
    holiday: lines.filter((l) => /holiday/i.test(l.item)).reduce((t, l) => t + l.amount, 0),
    basicHours: lines.filter((l) => /basic/i.test(l.item)).reduce((t, l) => t + l.units, 0),
    gross: null,
    tax: pick(new RegExp(String.raw`Tax paid ${money}`)),
    ni: pick(new RegExp(String.raw`National Insurance ${money}`)),
    pension: pick(new RegExp(String.raw`Pension (?:contribution|deduction)s? ${money}`, 'i')) ?? 0,
    net: pick(new RegExp(String.raw`BACS ${money}`)),
    grossToDate: pick(new RegExp(String.raw`Gross to date ${money}`)),
    taxableToDate: pick(new RegExp(String.raw`Taxable Pay to date ${money}`)),
    taxToDate: pick(new RegExp(String.raw`Tax Paid to date ${money}`)),
    niToDate: pick(new RegExp(String.raw`NI Paid to date ${money}`)),
    pensionToDate: pick(new RegExp(String.raw`Pension to date ${money}`)) ?? 0
  };
  // "Total Taxable Pay Total Non-Taxable Pay <taxable> <non-taxable> <total> <deductions> <net>"
  const totals = first(text, new RegExp(String.raw`Total Taxable Pay Total Non-Taxable Pay ${money} ${money} ${money} ${money} ${money}`));
  if (totals) {
    out.gross = num(totals[0]);
    out.nonTaxable = num(totals[1]);
    out.deductions = num(totals[3]);
    out.net ??= num(totals[4]);
  }
  out.gross ??= pick(new RegExp(String.raw`Total Pay ${money}`));
  out.basic = Math.round(out.basic * 100) / 100;
  out.holiday = Math.round(out.holiday * 100) / 100;
  out.basicHours = Math.round(out.basicHours * 100) / 100;
  if (out.gross == null || out.taxToDate == null) {
    throw new Error('Couldn’t read the pay figures from that payslip.');
  }
  // Compass leaves the Tax and NI lines off entirely in weeks where none was deducted.
  out.tax ??= 0;
  out.ni ??= 0;
  out.net ??= Math.round((out.gross - out.tax - out.ni - out.pension) * 100) / 100;
  return out;
}

/** Text of page 1 of a PDF, via pdf.js (loaded only when a payslip is imported). */
export async function pdfText(arrayBuffer) {
  const pdfjs = await import('pdfjs-dist');
  const worker = await import('pdfjs-dist/build/pdf.worker.min.mjs?url');
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
  const doc = await pdfjs.getDocument({ data: new Uint8Array(arrayBuffer) }).promise;
  const parts = [];
  for (let p = 1; p <= Math.min(doc.numPages, 2); p += 1) {
    const content = await (await doc.getPage(p)).getTextContent();
    parts.push(content.items.map((i) => i.str).join(' '));
  }
  return parts.join(' ');
}
