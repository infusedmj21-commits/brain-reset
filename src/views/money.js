import {
  getPayPayees,
  lastImport,
  listPayments,
  listRoles,
  listShifts,
  listTransactions,
  markImported,
  saveImport,
  saveShift,
  setPayPayees
} from '../data/money.js';
import { prettyDate, today } from '../logic/dates.js';
import {
  VENUE_SUGGESTIONS,
  classify,
  gbp,
  gbp0,
  incomingPayees,
  orderRoles,
  parseMonzo,
  fmtHours,
  isPremiumDay,
  pennies,
  lastTimes,
  PREMIUM,
  shiftPay,
  shiftTimes,
  byWhen,
  spendingByCategory,
  weeklyPay
} from '../logic/money.js';
import { esc, toast } from '../ui.js';
import { shiftsToConfirm } from '../data/tasks.js';
import { renderInsights } from './insights.js';
import { renderTax } from './tax.js';
import { loadTaxPicture } from '../data/tax.js';
import { DEDUCTION_THRESHOLD, owed, paydays } from '../logic/payroll.js';

const ACCOUNTS = { main: 'Main account', pot: 'Spending pot', flex: 'Flex' };

// An import in progress survives re-renders: parsed rows, the account, and the chosen payees.
let pending = null;

const monthKey = (date) => date.slice(0, 7);
const prevMonth = (date) => {
  const [y, m] = date.split('-').map(Number);
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`;
};
const shortDate = (d) => prettyDate(d).replace(/^(\w{3})\w*/, '$1');

function shiftRow(s, roles, actions) {
  const role = roles.find((r) => r.id === s.role_id);
  return `<li class="vrow card">
    <span class="vmain"><strong>${esc(s.venue)}</strong>
      <span class="muted small">${esc(shortDate(s.date))}${s.start ? ` · ${esc(s.start)}–${esc(s.end)}` : ''} · ${esc(role?.name ?? 'Role')}</span>
      <span class="muted small">${fmtHours(s.hours)} paid @ ${gbp(Number(s.rate))}${s.premium ? ' · 1.5× bank holiday' : ''}</span></span>
    <span class="vside"><span class="vscore num">${gbp(shiftPay(s))}</span>${actions}</span>
  </li>`;
}

function paydayChart(rows) {
  const max = Math.max(1, ...rows.map((w) => Math.max(w.expected, w.received ?? 0)));
  const h = (v) => `${Math.max(v > 0 ? 6 : 0, Math.round((v / max) * 100))}%`;
  return `<div class="paybars" role="img" aria-label="Expected and received pay for each payday">
    ${rows
      .map(
        (w) => `<div class="paycol" title="Payday ${w.payday}: expected ${gbp(w.expected)}${w.received != null ? `, received ${gbp(w.received)}` : ''}">
          <div class="paypair">
            <i class="exp${w.past ? '' : ' booked'}" style="height:${h(w.expected)}"></i>
            <i class="rec" style="height:${h(w.received ?? 0)}"></i>
          </div>
          <span class="muted small num">${esc(shortDate(w.payday).replace(/^\w+ /, ''))}</span>
        </div>`
      )
      .join('')}
  </div>
  <div class="legend"><span><i style="background:var(--sky)"></i>Expected from shifts</span><span><i style="background:var(--mint)"></i>Received (Monzo)</span></div>`;
}

function paydayRow(p, hasMonzo, est) {
  // Take-home: the payslip's net when there is one, else an estimate after tax and NI.
  const takeHome = est && est.net != null && est.source !== 'before-payslips' && est.source !== 'none' ? est : null;
  const target = takeHome ? takeHome.net : p.expected;
  let badge = '';
  if (p.past && p.received != null) {
    const diff = pennies(p.received - target);
    badge =
      Math.abs(diff) < 0.5
        ? '<span class="vchip v-mint">Paid in full</span>'
        : diff > 0
          ? `<span class="vchip v-mint">+${gbp(diff)}</span>`
          : `<span class="vchip v-sun">${gbp(-diff)} short${!takeHome && p.expected > DEDUCTION_THRESHOLD ? ' (tax/NI?)' : ''}</span>`;
  } else if (p.past && hasMonzo) badge = '<span class="vchip v-none">Not seen in Monzo</span>';
  else if (p.past) badge = '<span class="vchip v-none">Import Monzo to check</span>';
  else if (p.unconfirmed) badge = `<span class="vchip v-none">${p.unconfirmed} to confirm</span>`;
  return `<li class="vrow card${p.isToday ? ' today-row' : ''}">
    <span class="vmain"><strong>${p.isToday ? 'Today' : esc(shortDate(p.payday))}</strong>
      <span class="muted small">${esc(shortDate(p.start))} – ${esc(shortDate(p.end))} · ${p.shifts.length} shift${p.shifts.length === 1 ? '' : 's'} · ${fmtHours(p.hours)}</span>
      ${
        takeHome
          ? `<span class="muted small">${takeHome.source === 'payslip' ? 'Payslip' : 'Est.'}: ${gbp(takeHome.gross)} gross ${takeHome.tax < 0 ? `+ ${gbp(-takeHome.tax)} tax back` : `− ${gbp(takeHome.tax)} tax`}${takeHome.ni > 0 ? ` − ${gbp(takeHome.ni)} NI` : ''}</span>`
          : ''
      }</span>
    <span class="vside"><span class="vscore num">${p.received != null && p.past ? gbp(p.received) : gbp(target)}</span>${takeHome && !(p.received != null && p.past) ? '<span class="vchip v-none">take-home</span>' : ''}${badge}</span>
  </li>`;
}

function importPanel(payees) {
  if (!pending) {
    return `<form class="stack" id="import-form">
      <p class="muted small">In Monzo: tap the account (or the pot, or Flex) → ⋯ → Export statement → CSV. Import each one here; anything already imported is skipped.</p>
      <label class="stack" style="gap:6px"><span class="stat-label">Which account is this?</span>
        <select class="field" name="account">${Object.entries(ACCOUNTS).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select>
      </label>
      <label class="btn block">Choose CSV file<input type="file" name="file" accept=".csv,text/csv" hidden></label>
    </form>`;
  }
  const choosePay = pending.askPayees;
  const c = classify(pending.rows, pending.payees);
  const sum = (xs) => xs.reduce((t, x) => t + x.amount, 0);
  return `<div class="stack">
    <p><strong>${esc(ACCOUNTS[pending.account])}</strong> · ${pending.rows.length} transactions</p>
    ${
      choosePay
        ? `<fieldset class="stack payees"><legend class="stat-label">Which of these is your pay? Remembered for next time.</legend>
            ${pending.incoming
              .slice(0, 12)
              .map(
                (p) => `<label class="pick-top"><input type="checkbox" data-payee="${esc(p.name)}"${pending.payees.includes(p.name.toLowerCase()) ? ' checked' : ''}>
                  <span class="vmain"><strong>${esc(p.name)}</strong></span><span class="num">${gbp(p.total)}</span></label>`
              )
              .join('')}
          </fieldset>`
        : ''
    }
    <table class="num"><tbody>
      <tr><td>Pay</td><td>${c.pay.length}</td><td><strong>${gbp(sum(c.pay))}</strong></td></tr>
      <tr><td>Spending</td><td>${c.spending.length}</td><td><strong>${gbp(-sum(c.spending))}</strong></td></tr>
      <tr><td>Other money in</td><td>${c.income.length}</td><td>${gbp(sum(c.income))}</td></tr>
      <tr><td class="muted">Transfers (ignored)</td><td class="muted">${c.transfers.length}</td><td class="muted">${gbp(sum(c.transfers))}</td></tr>
    </tbody></table>
    <div class="row-btns">
      <button class="btn" type="button" id="import-save">Import</button>
      <button class="btn secondary" type="button" id="import-cancel">Cancel</button>
    </div>
    ${payees.length && !choosePay ? '<button class="btn-mini" type="button" id="import-payees" style="justify-self:start">Change which payments are pay</button>' : ''}
  </div>`;
}

export async function renderMoney(el, rerender, ctx) {
  if (ctx?.params?.[0] === 'insights') return renderInsights(el, rerender);
  if (ctx?.params?.[0] === 'tax') return renderTax(el, rerender);
  if (ctx?.params?.[0] === 'import') {
    // From the Monzo to-do: open Overview and bring the import card into view.
    await renderMoney(el, rerender, { ...ctx, params: [] });
    requestAnimationFrame(() => document.getElementById('import-card')?.scrollIntoView({ behavior: 'smooth', block: 'center' }));
    return;
  }
  const date = today();
  const [roles, shifts, payments, transactions, payees, imported, tax] = await Promise.all([
    listRoles(),
    listShifts(),
    listPayments(),
    listTransactions(),
    getPayPayees(),
    lastImport(),
    loadTaxPicture(today())
  ]);
  const est = (p) => tax.byPayday.get(p.payday);
  const ordered = orderRoles(roles, shifts, date);
  const weeks = weeklyPay(shifts, payments, date, 8);
  const thisWeek = weeks.at(-1);
  const month = monthKey(date);
  const receivedMonth = payments.filter((p) => p.date.startsWith(month)).reduce((t, p) => t + p.amount, 0);
  const spendCats = spendingByCategory(transactions, month);
  const spentMonth = spendCats.reduce((t, c) => t + c.total, 0);
  const spentLast = spendingByCategory(transactions, prevMonth(date)).reduce((t, c) => t + c.total, 0);
  const pays = paydays(shifts, payments, date, 6, 3);
  const upcoming3 = pays.filter((p) => !p.past || p.isToday);
  const next = upcoming3[0];
  const onItsWay = owed(shifts, date);
  const live = shifts.filter((s) => s.status !== 'cancelled');
  const toConfirm = shiftsToConfirm(shifts, date);
  const upcoming = live.filter((s) => s.status === 'booked' && s.date >= date).sort(byWhen);
  const recent = live.filter((s) => s.status === 'worked').sort((a, b) => byWhen(b, a)).slice(0, 10);
  const venues = [...new Set([...live.map((s) => s.venue), ...VENUE_SUGGESTIONS])];
  const maxCat = Math.max(1, ...spendCats.map((c) => c.total));

  el.innerHTML = `
    <div class="eyebrow">Shifts, pay and spending</div>
    <h1 class="page-title">Money</h1>

    <div class="tiles four">
      <div class="tile t-sky"><div class="stat-label">This week</div><div class="stat-big num">${gbp0(thisWeek.worked + thisWeek.booked)}</div><div class="tile-note">${fmtHours(thisWeek.hours)} · ${gbp0(thisWeek.worked)} worked</div></div>
      <div class="tile t-mint"><div class="stat-label">Paid this month</div><div class="stat-big num">${payments.length ? gbp0(receivedMonth) : '–'}</div><div class="tile-note">${payments.length ? 'From Monzo' : 'Import Monzo to see'}</div></div>
      <div class="tile t-sun"><div class="stat-label">Spent this month</div><div class="stat-big num">${transactions.length ? gbp0(spentMonth) : '–'}</div><div class="tile-note">${transactions.length ? `Last month ${gbp0(spentLast)}` : 'Import Monzo to see'}</div></div>
      <div class="tile t-grape hot"><div class="stat-label">${next.isToday ? 'Payday today' : `Next payday · ${esc(shortDate(next.payday))}`}</div><div class="stat-big num">${gbp0(est(next)?.net ?? next.expected)}</div><div class="tile-note">${est(next)?.net != null && est(next).source !== 'none' ? `Take-home · ${gbp0(est(next).gross)} before tax` : `${gbp0(onItsWay)} worked, not paid yet`}</div></div>
    </div>

    <div class="layout">
      <section>
        ${
          toConfirm.length
            ? `<a class="banner" href="#/tasks" style="margin-top:18px"><strong>${toConfirm.length} shift${toConfirm.length === 1 ? '' : 's'} to confirm.</strong> Check the actual hours in Tasks so pay stays accurate.</a>`
            : ''
        }

        <div class="sec" style="--dot:var(--sky)"><span class="dot"></span><h2>Log a shift</h2></div>
        <form class="card stack" id="shift-form" autocomplete="off">
          <label class="stack" style="gap:4px"><span class="stat-label">Venue</span>
            <input class="field" name="venue" list="venues" value="" placeholder="Pick or type a venue" required maxlength="40">
            <datalist id="venues">${venues.map((v) => `<option value="${esc(v)}"></option>`).join('')}</datalist>
          </label>
          <label class="stack" style="gap:4px"><span class="stat-label">Date</span><input class="field" type="date" name="date" value="${date}" required></label>
          <div class="grid2">
            <label class="stack" style="gap:4px"><span class="stat-label">Start</span><input class="field" type="time" name="start" value="" required></label>
            <label class="stack" style="gap:4px"><span class="stat-label">End</span><input class="field" type="time" name="end" value="" required></label>
          </div>
          <label class="stack" style="gap:4px"><span class="stat-label">Role</span>
            <select class="field" name="role" required><option value="" selected disabled>Choose a role</option>${ordered.map((r) => `<option value="${esc(r.id)}">${esc(r.name)} · ${gbp(r.rate)}/h</option>`).join('')}</select>
          </label>
          <div class="grid2">
            <label class="stack" style="gap:4px"><span class="stat-label">Paid hours</span><input class="field" type="number" name="hours" min="0.25" max="24" step="0.01" required></label>
            <div class="stack" style="gap:4px"><span class="stat-label">Breakdown</span><span class="muted small" id="shift-note" style="padding-top:8px"></span></div>
          </div>
          <div class="chips small two" role="group" aria-label="Status">
            <button type="button" class="chip" data-status="booked" aria-pressed="true">Booked</button>
            <button type="button" class="chip" data-status="worked" aria-pressed="false">Worked</button>
          </div>
          <button class="btn block" type="submit">Save shift <span class="num" id="shift-pay"></span></button>
        </form>

        <div class="sec" style="--dot:var(--mint)"><span class="dot"></span><h2>Coming up</h2><span class="aside num">${upcoming.length ? gbp(upcoming.reduce((t, s) => t + shiftPay(s), 0)) : ''}</span></div>
        ${
          upcoming.length
            ? `<ul class="vlist">${upcoming.slice(0, 5).map((s) => shiftRow(s, roles, `<button class="btn-mini" type="button" data-cancel="${esc(s.id)}">Cancel</button>`)).join('')}</ul>
               ${
                 upcoming.length > 5
                   ? `<details class="manual" style="margin-top:12px"><summary>${upcoming.length - 5} more booked</summary>
                       <ul class="vlist" style="margin-top:10px">${upcoming.slice(5).map((s) => shiftRow(s, roles, `<button class="btn-mini" type="button" data-cancel="${esc(s.id)}">Cancel</button>`)).join('')}</ul></details>`
                   : ''
               }`
            : '<div class="empty-hint">No booked shifts. Log one above as Booked.</div>'
        }

        <div class="sec" style="--dot:var(--grape)"><span class="dot"></span><h2>Paydays</h2><span class="aside">Wednesdays · Thu–Wed, a week behind</span></div>
        <ul class="vlist">${[...upcoming3].reverse().map((p) => paydayRow(p, transactions.length > 0, est(p))).join('')}</ul>
        <div class="card" style="margin-top:12px">${paydayChart(pays)}</div>
        <details class="manual" style="margin-top:12px"><summary>Past paydays</summary>
          <ul class="vlist" style="margin-top:10px">${pays.filter((p) => p.past && !p.isToday).reverse().map((p) => paydayRow(p, transactions.length > 0, est(p))).join('')}</ul></details>

        ${
          recent.length
            ? `<details class="manual" style="margin-top:14px"><summary>Recent shifts worked (${recent.length})</summary>
                <ul class="vlist" style="margin-top:10px">${recent.map((s) => shiftRow(s, roles, `<button class="btn-mini" type="button" data-cancel="${esc(s.id)}">Remove</button>`)).join('')}</ul></details>`
            : ''
        }
      </section>

      <aside class="side">
        <div class="sec" style="--dot:var(--sun);margin-bottom:0"><span class="dot"></span><h2>Import from Monzo</h2></div>
        <div class="card top-sun" id="import-card">
          ${importPanel(payees)}
          <p class="muted small" style="margin-top:10px">${imported ? `Last import ${esc(prettyDate(imported.slice(0, 10)))}` : 'Every 2 weeks is plenty.'}</p>
        </div>

        <div class="card top-mint">
          <h3>Spending · ${esc(new Date(`${month}-15`).toLocaleDateString('en-GB', { month: 'long' }))}</h3>
          ${
            spendCats.length
              ? `<div class="catlist">${spendCats
                  .slice(0, 8)
                  .map(
                    (c) => `<div class="cat"><span class="cat-top"><span>${esc(c.category)}</span><strong class="num">${gbp(c.total)}</strong></span>
                      <span class="cat-bar"><i style="width:${Math.round((c.total / maxCat) * 100)}%"></i></span></div>`
                  )
                  .join('')}</div>`
              : '<p class="muted small" style="margin-top:8px">Nothing yet this month. Import a Monzo CSV to see where it goes.</p>'
          }
        </div>
      </aside>
    </div>`;

  // ---- Shift form: paid hours follow the times (minus unpaid breaks) until edited by hand ----
  const form = el.querySelector('#shift-form');
  let status = 'booked';
  let hoursEdited = false;
  const payOut = el.querySelector('#shift-pay');
  const note = el.querySelector('#shift-note');
  const current = () => {
    const role = roles.find((r) => r.id === form.role.value);
    const premium = isPremiumDay(form.date.value);
    return { role, premium, rate: Math.round((role?.rate ?? 0) * (premium ? PREMIUM : 1) * 10000) / 10000 };
  };
  const update = () => {
    const t = shiftTimes(form.start.value, form.end.value);
    if (t && !hoursEdited) form.hours.value = Math.round(t.paidHours * 100) / 100;
    const { premium, rate } = current();
    note.textContent = t
      ? `${fmtHours(t.scheduled / 60)} shift${t.unpaid ? ` − ${t.unpaid}m break` : ', no break'}${premium ? ' · 1.5× bank holiday' : ''}`
      : '';
    const pay = shiftPay({ hours: form.hours.value, rate });
    payOut.textContent = pay ? `· ${gbp(pay)}` : '';
  };
  form.querySelectorAll('[data-status]').forEach((b) =>
    b.addEventListener('click', () => {
      status = b.dataset.status;
      form.querySelectorAll('[data-status]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    })
  );
  form.venue.addEventListener('change', () => {
    // Suggest that venue's usual times, but never overwrite times already typed.
    const venue = form.venue.value.trim();
    if (form.start.value || form.end.value || !shifts.some((s) => s.venue === venue && s.start)) return;
    const t = lastTimes(shifts, venue);
    form.start.value = t.start;
    form.end.value = t.end;
    hoursEdited = false;
    update();
  });
  ['start', 'end', 'date', 'role'].forEach((n) => form[n].addEventListener('input', update));
  form.role.addEventListener('change', update);
  form.hours.addEventListener('input', () => {
    hoursEdited = true;
    update();
  });
  update();
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const { role, premium, rate } = current();
    const shiftDate = form.date.value;
    const finalStatus = status === 'booked' && shiftDate < date ? 'worked' : status;
    const hours = Number(form.hours.value);
    await saveShift({ date: shiftDate, venue: form.venue.value.trim(), role_id: role.id, rate, premium, start: form.start.value, end: form.end.value, hours, status: finalStatus, confirmed: finalStatus === 'worked' });
    toast(`${finalStatus === 'worked' ? 'Logged' : 'Booked'} · ${gbp(shiftPay({ hours, rate }))}`);
    rerender();
  });

  const byId = (id) => shifts.find((s) => s.id === id);
  el.querySelectorAll('[data-worked]').forEach((b) =>
    b.addEventListener('click', async () => {
      await saveShift({ ...byId(b.dataset.worked), status: 'worked' });
      rerender();
    })
  );
  el.querySelectorAll('[data-cancel]').forEach((b) =>
    b.addEventListener('click', async () => {
      await saveShift({ ...byId(b.dataset.cancel), status: 'cancelled' });
      toast('Removed');
      rerender();
    })
  );

  // ---- Monzo import ----
  const card = el.querySelector('#import-card');
  card.querySelector('input[type=file]')?.addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const account = card.querySelector('[name=account]').value;
      const rows = parseMonzo(await file.text(), account);
      const incoming = incomingPayees(rows);
      pending = { account, rows, incoming, payees: [...payees], askPayees: !payees.length && incoming.length > 0 };
      rerender();
    } catch (err) {
      toast(err.message || 'Could not read that file');
    }
  });
  card.querySelectorAll('[data-payee]').forEach((box) =>
    box.addEventListener('change', () => {
      const name = box.dataset.payee.toLowerCase();
      pending.payees = box.checked ? [...new Set([...pending.payees, name])] : pending.payees.filter((p) => p !== name);
      rerender();
    })
  );
  card.querySelector('#import-payees')?.addEventListener('click', () => {
    pending.askPayees = true;
    rerender();
  });
  card.querySelector('#import-cancel')?.addEventListener('click', () => {
    pending = null;
    rerender();
  });
  card.querySelector('#import-save')?.addEventListener('click', async () => {
    if (pending.askPayees) await setPayPayees(pending.payees);
    const counts = await saveImport(classify(pending.rows, pending.payees));
    await markImported();
    pending = null;
    toast(`Imported ${counts.pay} pay, ${counts.spending} spending${counts.skipped ? ` · ${counts.skipped} already in` : ''}`);
    rerender();
  });
}

/** The next payday and what it should bring, for Home. */
export async function nextPay() {
  const date = today();
  const [shifts, payments] = await Promise.all([listShifts(), listPayments()]);
  return paydays(shifts, payments, date, 0, 1)[0];
}

/** The next booked shift, for Home. */
export async function nextShift() {
  const date = today();
  const [shifts, roles] = await Promise.all([listShifts(), listRoles()]);
  const next = shifts.filter((s) => s.status === 'booked' && s.date >= date).sort(byWhen)[0];
  if (!next) return null;
  return { ...next, roleName: roles.find((r) => r.id === next.role_id)?.name ?? '', pay: shiftPay(next) };
}

