import { deletePayslip, getTaxSettings, loadTaxPicture, savePayslip, setTaxSettings } from '../data/tax.js';
import { prettyDate, today } from '../logic/dates.js';
import { fmtHours, gbp, gbp0 } from '../logic/money.js';
import { parsePayslipText, pdfText } from '../logic/payslip.js';
import { PERSONAL_ALLOWANCE, allowanceFromCode, taxYearEnd, taxYearLabel } from '../logic/tax.js';
import { confirmAction, esc, toast } from '../ui.js';

const shortDate = (d) => prettyDate(d).replace(/^(\w{3})\w*/, '$1');

function meter(value, max, label) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  return `<div class="meter" role="img" aria-label="${esc(label)}"><i style="width:${pct.toFixed(1)}%"></i></div>`;
}

function payslipRow(p) {
  return `<li class="vrow card">
    <span class="vmain"><strong>${esc(shortDate(p.payDate))} · week ${p.taxWeek ?? '?'}</strong>
      <span class="muted small">${gbp(p.gross)} gross${p.holiday ? ` (incl. ${gbp(p.holiday)} holiday)` : ''} · ${fmtHours(p.basicHours || 0)} basic</span>
      <span class="muted small">Tax ${gbp(p.tax)} · NI ${gbp(p.ni)} · code ${esc(p.taxCode ?? '–')}</span></span>
    <span class="vside"><span class="vscore num">${gbp(p.net)}</span><button class="btn-mini" type="button" data-remove="${esc(p.id)}">Remove</button></span>
  </li>`;
}

export async function renderTax(el, rerender) {
  const date = today();
  const t = await loadTaxPicture(date);
  const settings = await getTaxSettings();
  const yearLabel = taxYearLabel(date);
  const slips = [...t.payslips].sort((a, b) => b.payDate.localeCompare(a.payDate));
  const upcoming = t.year.weeks.filter((w) => w.payday > date && w.source !== 'none').slice(0, 6);
  const r = t.refund;

  el.innerHTML = `
    <div class="eyebrow">Tax year ${esc(yearLabel)} · to ${esc(prettyDate(taxYearEnd(date)))}</div>
    <h1 class="page-title">Tax</h1>

    ${
      r
        ? `<div class="tiles four">
            <div class="tile t-mint tile-wide hot"><div class="stat-label">Estimated refund after April</div>
              <div class="stat-big num">${r.refund >= 0 ? gbp0(r.refund) : `−${gbp0(-r.refund)}`}</div>
              <div class="tile-note">${r.refund >= 0 ? 'Income tax you’ll likely get back' : 'You may owe this'} · moves as you work</div></div>
            <div class="tile t-sky"><div class="stat-label">Tax paid so far</div><div class="stat-big num">${gbp0(t.latest.taxToDate + (Number(settings.otherTax) || 0))}</div><div class="tile-note">To ${esc(shortDate(t.latest.payDate))}, all jobs</div></div>
            <div class="tile t-sun"><div class="stat-label">NI paid so far</div><div class="stat-big num">${gbp0(t.latest.niToDate ?? 0)}</div><div class="tile-note">Not refundable</div></div>
          </div>`
        : `<div class="card top-grape" style="margin-top:18px"><h3>Add a payslip to start</h3>
            <p class="muted small">Your latest Compass payslip PDF gives Artemis your pay and tax so far this year. Everything after that is worked out from your shifts.</p></div>`
    }

    <div class="layout">
      <section>
        ${
          r
            ? `<div class="sec" style="--dot:var(--mint)"><span class="dot"></span><h2>How it adds up</h2></div>
              <div class="card stack">
                <div><div class="cat-top"><span>Your income this year, all jobs (projected)</span><strong class="num">${gbp0(r.income)}</strong></div>
                  ${meter(r.income, Math.max(PERSONAL_ALLOWANCE * 1.25, r.income), 'Projected income against the tax-free allowance')}
                  <div class="muted small" style="margin-top:6px">${r.income <= PERSONAL_ALLOWANCE ? `Under the ${gbp0(PERSONAL_ALLOWANCE)} tax-free allowance, so no income tax is due for the year.` : `${gbp0(r.income - PERSONAL_ALLOWANCE)} over the ${gbp0(PERSONAL_ALLOWANCE)} tax-free allowance.`}</div></div>
                <table class="num tax-table"><tbody>
                  <tr><td>Tax due on that income</td><td><strong>${gbp(r.owed)}</strong></td></tr>
                  <tr><td>Tax you’ll have paid by April</td><td><strong>${gbp(r.paid)}</strong></td></tr>
                  <tr class="total"><td>Difference</td><td><strong>${r.refund >= 0 ? gbp(r.refund) + ' back' : gbp(-r.refund) + ' to pay'}</strong></td></tr>
                </tbody></table>
                <p class="muted small">Compass uses code <strong>${esc(t.code)}</strong>, so it only lets ${gbp0(t.allowance / 52)} a week through tax-free. Your other two agency jobs hold the rest of the allowance, and you rarely work them, so most of it goes unused and comes back after the year ends.</p>
              </div>

              ${
                t.gain
                  ? `<div class="sec" style="--dot:var(--grape)"><span class="dot"></span><h2>Or get it back sooner</h2></div>
                    <div class="card top-grape stack">
                      <p>If HMRC moved your whole allowance to Compass (code ${esc(settings.fixedCode)}), your next payslip would hand back about <strong class="num">${gbp0(t.gain.lump)}</strong>, then take about <strong class="num">${gbp(t.gain.weekly)}</strong> less tax in a ${gbp0(t.weeklyAssumption)} week.</p>
                      <p class="muted small">In the HMRC app: PAYE → your other jobs → update estimated income to what you really expect (near £0). HMRC then reissues codes. It’s the same money either way: sooner, or as a refund after April.</p>
                    </div>`
                  : ''
              }

              <div class="sec" style="--dot:var(--sky)"><span class="dot"></span><h2>Coming paydays</h2><span class="aside">Estimated take-home</span></div>
              ${
                upcoming.length
                  ? `<ul class="vlist">${upcoming
                      .map(
                        (w) => `<li class="vrow card"><span class="vmain"><strong>${esc(shortDate(w.payday))} · week ${w.week}</strong>
                          <span class="muted small">${gbp(w.gross)} gross${w.source === 'assumed' ? ' (usual week)' : ''} · ${w.tax < 0 ? `${gbp(-w.tax)} tax back` : `tax ${gbp(w.tax)}`}${w.ni > 0 ? ` · NI ${gbp(w.ni)}` : ''}</span></span>
                          <span class="vside"><span class="vscore num">${gbp(w.net)}</span></span></li>`
                      )
                      .join('')}</ul>`
                  : '<div class="empty-hint">No pay expected in the next few weeks.</div>'
              }`
            : ''
        }

        <div class="sec" style="--dot:var(--sun)"><span class="dot"></span><h2>Payslips</h2><span class="aside">${slips.length} this year</span></div>
        ${
          slips.length
            ? `<ul class="vlist">${slips.slice(0, 4).map(payslipRow).join('')}</ul>
              ${slips.length > 4 ? `<details class="fold"><summary class="btn secondary block">Show ${slips.length - 4} older payslips</summary><ul class="vlist" style="margin-top:10px">${slips.slice(4).map(payslipRow).join('')}</ul></details>` : ''}`
            : '<div class="empty-hint">None yet.</div>'
        }
      </section>

      <aside class="side">
        <div class="sec" style="--dot:var(--sun);margin-bottom:0"><span class="dot"></span><h2>Upload payslips</h2></div>
        <div class="card top-sun stack">
          <p class="muted small">Compass payslip PDFs. Only pay and tax figures are kept, not your name, address or NI number. Uploading the same week twice just replaces it.</p>
          <label class="btn block">Choose PDFs<input type="file" id="slip-file" accept="application/pdf,.pdf" multiple hidden></label>
          ${t.year.ratio ? `<p class="muted small">Holiday pay from your payslips: about ${(t.year.ratio * 100).toFixed(1)}% on top of basic, added to estimates.</p>` : '<p class="muted small">Holiday pay is only added to estimates once a payslip shows it.</p>'}
        </div>

        <form class="card stack" id="tax-settings">
          <h3>Assumptions</h3>
          <label class="stack" style="gap:6px"><span class="stat-label">A usual week after the next 4 (gross)</span>
            <input type="range" name="weekly" min="0" max="600" step="10" value="${t.weeklyAssumption}">
            <span class="muted small"><strong class="num" id="weekly-out">${gbp0(t.weeklyAssumption)}</strong> a week${t.usual ? ` · your average so far is ${gbp0(t.usual)}` : ''}</span>
          </label>
          <label class="stack" style="gap:4px"><span class="stat-label">Compass tax code</span>
            <input class="field" name="code" value="${esc(settings.taxCode)}" placeholder="${esc(t.latest?.taxCode ?? '1257L')} (from payslip)" maxlength="8"></label>
          <div class="grid2">
            <label class="stack" style="gap:4px"><span class="stat-label">Other jobs: pay</span><input class="field" name="otherIncome" type="number" step="0.01" min="0" value="${esc(settings.otherIncome)}"></label>
            <label class="stack" style="gap:4px"><span class="stat-label">Other jobs: tax</span><input class="field" name="otherTax" type="number" step="0.01" min="0" value="${esc(settings.otherTax)}"></label>
          </div>
          <p class="muted small">Other jobs’ totals come from the HMRC app. They’re counted as they are, not projected forward.</p>
          <button class="btn secondary block" type="submit">Save</button>
        </form>
        <p class="muted small">Estimates using 2026/27 rates for England, checked against your payslips. Not tax advice.</p>
      </aside>
    </div>`;

  const range = el.querySelector('[name=weekly]');
  range.addEventListener('input', () => {
    el.querySelector('#weekly-out').textContent = gbp0(Number(range.value));
  });
  range.addEventListener('change', async () => {
    await setTaxSettings({ weeklyAssumption: Number(range.value) });
    rerender();
  });

  el.querySelector('#tax-settings').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.currentTarget;
    const code = f.code.value.trim().toUpperCase();
    if (code && allowanceFromCode(code) == null) {
      toast('Artemis can’t use that code yet (L, T, M, N or BR codes work)');
      return;
    }
    await setTaxSettings({ taxCode: code, otherIncome: Number(f.otherIncome.value) || 0, otherTax: Number(f.otherTax.value) || 0, weeklyAssumption: Number(range.value) });
    toast('Saved');
    rerender();
  });

  el.querySelector('#slip-file').addEventListener('change', async (e) => {
    const files = [...(e.target.files ?? [])];
    if (!files.length) return;
    toast('Reading…');
    let ok = 0;
    const failed = [];
    for (const file of files) {
      try {
        await savePayslip(parsePayslipText(await pdfText(await file.arrayBuffer())));
        ok += 1;
      } catch (err) {
        failed.push(file.name);
        console.warn(err);
      }
    }
    toast(failed.length ? `Added ${ok}. Couldn’t read: ${failed.join(', ')}` : `Added ${ok} payslip${ok === 1 ? '' : 's'}`);
    rerender();
  });

  el.querySelectorAll('[data-remove]').forEach((b) =>
    b.addEventListener('click', async () => {
      const slip = t.payslips.find((p) => p.id === b.dataset.remove);
      if (!slip || !(await confirmAction(`Remove the ${shortDate(slip.payDate)} payslip?`))) return;
      await deletePayslip(slip);
      rerender();
    })
  );
}
