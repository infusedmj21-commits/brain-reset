import { listPayments, listRoles, listShifts, listTransactions } from '../data/money.js';
import { addDays, today, weekday } from '../logic/dates.js';
import { categories, daily, earningsBy, hourlyRate, lastMonths, monthLabel, monthly, segments, shiftMonth, topMerchants, weekdayAverages } from '../logic/insights.js';
import { fmtHours, gbp, gbp0 } from '../logic/money.js';
import { esc } from '../ui.js';

// Month being looked at and chosen breakdown survive re-renders.
let month = null;
let groupBy = 'venue';
let pickedDay = null;

const DOW = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const DOW_LONG = ['Mondays', 'Tuesdays', 'Wednesdays', 'Thursdays', 'Fridays', 'Saturdays', 'Sundays'];

/** Bar with 4px rounded data end anchored to the baseline. */
function barPath(x, y, w, base) {
  const h = base - y;
  if (h <= 0.5) return '';
  const r = Math.min(4, w / 2, h);
  return `M${x},${base}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${base}Z`;
}

const niceMax = (v) => {
  if (v <= 0) return 100;
  const step = 10 ** Math.floor(Math.log10(v));
  return Math.ceil(v / step) * step;
};

function earnedVsSpent(rows, selected) {
  const W = 360;
  const H = 200;
  const L = 42;
  const B = 172;
  const T = 12;
  const max = niceMax(Math.max(...rows.map((r) => Math.max(r.earned, r.spent))));
  const y = (v) => B - ((B - T) * v) / max;
  const slot = (W - L - 8) / rows.length;
  const bw = Math.max(4, Math.min(14, (slot - 8) / 2));
  const ticks = [0, max / 2, max];
  return `<svg class="viz" viewBox="0 0 ${W} ${H}" role="img" aria-label="Earned from shifts and spent, by month, for the last ${rows.length} months">
    ${ticks.map((t) => `<line class="grid" x1="${L}" x2="${W - 4}" y1="${y(t)}" y2="${y(t)}"></line><text class="vt" x="${L - 6}" y="${y(t) + 4}" text-anchor="end">${gbp0(t)}</text>`).join('')}
    ${rows
      .map((r, i) => {
        const cx = L + slot * i + slot / 2;
        const sel = r.month === selected;
        return `<g class="grp${sel ? ' sel' : ''}" tabindex="0" data-month="${r.month}"
            data-tip="${esc(`${monthLabel(r.month)}\nEarned ${gbp(r.earned)} (${fmtHours(r.hours)})\nSpent ${r.spent ? gbp(r.spent) : '–'}`)}">
          <rect class="hit" x="${cx - slot / 2}" y="${T}" width="${slot}" height="${B - T + 22}"></rect>
          <path class="m-s1" d="${barPath(cx - bw - 1, y(r.earned), bw, B)}"></path>
          <path class="m-s2" d="${barPath(cx + 1, y(r.spent), bw, B)}"></path>
          <text class="vt${sel ? ' strong' : ''}" x="${cx}" y="${B + 16}" text-anchor="middle">${monthLabel(r.month, 'short')}</text>
        </g>`;
      })
      .join('')}
    <line class="axis" x1="${L}" x2="${W - 4}" y1="${B}" y2="${B}"></line>
  </svg>
  <div class="legend"><span><i class="k-s1"></i>Earned from shifts</span><span><i class="k-s2"></i>Spent (Monzo)</span></div>`;
}

function whereItWent(cats, rate) {
  if (!cats.length) return '<p class="muted small">No spending imported for this month yet. Import a Monzo CSV in Overview.</p>';
  const total = cats.reduce((t, c) => t + c.total, 0);
  const segs = segments(cats);
  return `<div class="segbar" role="img" aria-label="Spending split by category">
      ${segs.map((s) => `<i class="k-s${s.slot}" style="flex:${s.total}" tabindex="0" data-tip="${esc(`${s.category}\n${gbp(s.total)} · ${Math.round((s.total / total) * 100)}%`)}"></i>`).join('')}
    </div>
    <ul class="catrank">
      ${cats
        .map(
          (c) => `<li><span class="dot k-s${c.slot}" aria-hidden="true"></span><span class="cat-name">${esc(c.category)}</span>
            <span class="cat-hours muted small">${fmtHours(c.total / rate)} of shifts</span><strong class="num">${gbp(c.total)}</strong></li>`
        )
        .join('')}
    </ul>`;
}

function calendar(month, days) {
  const first = `${month}-01`;
  const [y, m] = month.split('-').map(Number);
  const n = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const vals = Object.values(days).map((d) => d.total);
  const max = Math.max(1, ...vals);
  const level = (v) => (!v ? 0 : Math.min(5, Math.ceil((v / max) * 5)));
  const cells = [];
  for (let i = 0; i < weekday(first); i += 1) cells.push('<span class="cal-pad"></span>');
  for (let d = 1; d <= n; d += 1) {
    const key = addDays(first, d - 1);
    const v = days[key]?.total ?? 0;
    cells.push(
      `<button type="button" class="cal q${level(v)}${pickedDay === key ? ' picked' : ''}" data-day="${key}" aria-label="${d} ${monthLabel(month, 'short')}: ${v ? gbp(v) : 'nothing'}"><span>${d}</span></button>`
    );
  }
  const pick = pickedDay && pickedDay.startsWith(month) ? days[pickedDay] : null;
  return `<div class="cal-grid">${DOW.map((d) => `<span class="cal-dow">${d[0]}</span>`).join('')}${cells.join('')}</div>
    <div class="cal-scale" aria-hidden="true"><span class="muted small">£0</span>${[1, 2, 3, 4, 5].map((q) => `<i class="cal q${q}"></i>`).join('')}<span class="muted small">${gbp0(max)}</span></div>
    ${
      pickedDay && pickedDay.startsWith(month)
        ? `<div class="cal-detail"><strong>${esc(new Date(`${pickedDay}T12:00:00Z`).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'short', timeZone: 'UTC' }))} · ${pick ? gbp(pick.total) : '£0'}</strong>
            ${pick ? `<ul>${pick.items.map((t) => `<li><span>${esc(t.name)}</span><span class="num">${gbp(-t.amount)}</span></li>`).join('')}</ul>` : '<p class="muted small">Nothing spent. Nice.</p>'}</div>`
        : '<p class="muted small" style="margin-top:8px">Tap a day to see what went.</p>'
    }`;
}

function weekdays(avgs) {
  if (!avgs.some((v) => v > 0)) return '<p class="muted small">Needs a Monzo import.</p>';
  const max = Math.max(...avgs);
  const top = avgs.indexOf(max);
  return `<p class="viz-headline">${DOW_LONG[top]} are your spendiest day: about ${gbp0(max)} on average.</p>
    <div class="wkbars" role="img" aria-label="Average spend by day of the week">
      ${avgs
        .map(
          (v, i) => `<div class="wk" tabindex="0" data-tip="${esc(`${DOW_LONG[i]}\n${gbp(v)} on average`)}">
            <div class="wk-track"><i class="${i === top ? 'm-s1' : 'm-muted'}" style="height:${Math.max(3, Math.round((v / max) * 100))}%"></i></div>
            <span class="vt">${DOW[i]}</span></div>`
        )
        .join('')}
    </div>`;
}

function earnings(rows) {
  if (!rows.length) return '<p class="muted small">No worked shifts in the last 3 months.</p>';
  const max = Math.max(...rows.map((r) => r.total));
  return `<ul class="hbars">${rows
    .map(
      (r) => `<li tabindex="0" data-tip="${esc(`${r.key}\n${gbp(r.total)} · ${fmtHours(r.hours)} over ${r.shifts} shift${r.shifts === 1 ? '' : 's'}`)}">
        <div class="hb-top"><span>${esc(r.key)}</span><strong class="num">${gbp0(r.total)}</strong></div>
        <div class="hb-track"><i class="m-s1" style="width:${Math.max(2, (r.total / max) * 100)}%"></i></div>
        <span class="muted small">${fmtHours(r.hours)} · ${r.shifts} shift${r.shifts === 1 ? '' : 's'}</span></li>`
    )
    .join('')}</ul>`;
}

export async function renderInsights(el, rerender) {
  const date = today();
  const [shifts, payments, transactions, roles] = await Promise.all([listShifts(), listPayments(), listTransactions(), listRoles()]);
  const current = date.slice(0, 7);
  const dataMonths = [...shifts.filter((s) => s.status === 'worked').map((s) => s.date), ...transactions.map((t) => t.date)].map((d) => d.slice(0, 7)).sort();
  const earliest = dataMonths[0] ?? current;
  month ??= current;
  if (month > current) month = current;
  if (month < earliest) month = earliest;

  const months = lastMonths(current, 12).filter((m) => m >= earliest || m === current);
  const rows = monthly(shifts, payments, transactions, months);
  const sel = monthly(shifts, payments, transactions, [month])[0];
  const since90 = addDays(date, -90);
  const rate = hourlyRate(shifts, since90);
  const cats = categories(transactions, month);
  const roleName = (id) => roles.find((r) => r.id === id)?.name ?? 'Other';
  const byKey = earningsBy(shifts, groupBy === 'venue' ? (s) => s.venue : (s) => roleName(s.role_id), since90);
  const shops = topMerchants(transactions, month, 5);
  const hasMonzo = transactions.length > 0;

  el.innerHTML = `
    <div class="month-nav">
      <button type="button" class="icon-btn" data-step="-1" aria-label="Previous month"${month <= earliest ? ' disabled' : ''}>‹</button>
      <h1 class="page-title" style="font-size:30px">${esc(monthLabel(month))}</h1>
      <button type="button" class="icon-btn" data-step="1" aria-label="Next month"${month >= current ? ' disabled' : ''}>›</button>
    </div>

    <div class="tiles four" style="margin-top:14px">
      <div class="tile t-sky"><div class="stat-label">Earned</div><div class="stat-big num">${gbp0(sel.earned)}</div><div class="tile-note">${fmtHours(sel.hours)} worked</div></div>
      <div class="tile t-mint"><div class="stat-label">Paid in</div><div class="stat-big num">${hasMonzo ? gbp0(sel.paidIn) : '–'}</div><div class="tile-note">${hasMonzo ? 'From Monzo' : 'Import Monzo'}</div></div>
      <div class="tile t-sun"><div class="stat-label">Spent</div><div class="stat-big num">${hasMonzo ? gbp0(sel.spent) : '–'}</div><div class="tile-note">${hasMonzo ? `${sel.earned ? `${Math.round((sel.spent / sel.earned) * 100)}% of earnings` : 'Card spending'}` : 'Import Monzo'}</div></div>
      <div class="tile t-grape"><div class="stat-label">Spending in shifts</div><div class="stat-big num">${hasMonzo ? fmtHours(sel.spent / rate) : '–'}</div><div class="tile-note">at your ${gbp(rate)}/h average</div></div>
    </div>

    <div class="layout">
      <section>
        <div class="sec" style="--dot:var(--sky)"><span class="dot"></span><h2>Earned vs spent</h2><span class="aside">tap a month</span></div>
        <div class="card viz-card">${earnedVsSpent(rows, month)}</div>

        <div class="sec" style="--dot:var(--sun)"><span class="dot"></span><h2>Where it went</h2><span class="aside">${hasMonzo ? gbp(cats.reduce((t, c) => t + c.total, 0)) : ''}</span></div>
        <div class="card viz-card">${whereItWent(cats, rate)}</div>

        <div class="sec" style="--dot:var(--mint)"><span class="dot"></span><h2>Spending calendar</h2></div>
        <div class="card viz-card">${hasMonzo ? calendar(month, daily(transactions, month)) : '<p class="muted small">Import a Monzo CSV in Overview to light this up.</p>'}</div>
      </section>

      <aside class="side">
        <div class="card viz-card stack">
          <div class="stat-row"><h3>Earnings, last 3 months</h3></div>
          <div class="chips small two" role="group" aria-label="Group earnings by">
            <button type="button" class="chip" data-group="venue" aria-pressed="${groupBy === 'venue'}">By venue</button>
            <button type="button" class="chip" data-group="role" aria-pressed="${groupBy === 'role'}">By role</button>
          </div>
          ${earnings(byKey)}
        </div>

        <div class="card viz-card"><h3>Your week</h3>${weekdays(weekdayAverages(transactions, lastMonths(current, 3), weekday))}</div>

        <div class="card viz-card"><h3>Top shops · ${esc(monthLabel(month, 'short'))}</h3>
          ${
            shops.length
              ? `<ol class="shops">${shops.map((s) => `<li><span>${esc(s.name)}</span><span class="muted small">${s.count}×</span><strong class="num">${gbp(s.total)}</strong></li>`).join('')}</ol>`
              : '<p class="muted small">Needs a Monzo import.</p>'
          }
        </div>
      </aside>
    </div>
    <div class="viz-tip" id="viz-tip" role="tooltip" hidden></div>`;

  // ---- Interaction ----
  el.querySelectorAll('[data-step]').forEach((b) =>
    b.addEventListener('click', () => {
      month = shiftMonth(month, Number(b.dataset.step));
      pickedDay = null;
      rerender();
    })
  );
  el.querySelectorAll('[data-month]').forEach((g) => {
    const go = () => {
      month = g.dataset.month;
      pickedDay = null;
      rerender();
    };
    g.addEventListener('click', go);
    g.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') go();
    });
  });
  el.querySelectorAll('[data-group]').forEach((b) =>
    b.addEventListener('click', () => {
      groupBy = b.dataset.group;
      rerender();
    })
  );
  el.querySelectorAll('[data-day]').forEach((b) =>
    b.addEventListener('click', () => {
      pickedDay = pickedDay === b.dataset.day ? null : b.dataset.day;
      rerender();
    })
  );

  // One tooltip for every mark: follows the pointer, also shows on keyboard focus.
  const tip = el.querySelector('#viz-tip');
  const show = (target, x, y) => {
    tip.textContent = target.dataset.tip;
    tip.hidden = false;
    const r = tip.getBoundingClientRect();
    tip.style.left = `${Math.min(window.innerWidth - r.width - 8, Math.max(8, x - r.width / 2))}px`;
    tip.style.top = `${Math.max(8, y - r.height - 12)}px`;
  };
  el.querySelectorAll('[data-tip]').forEach((m) => {
    m.addEventListener('pointermove', (e) => show(m, e.clientX, e.clientY));
    m.addEventListener('pointerleave', () => (tip.hidden = true));
    m.addEventListener('focus', () => {
      const r = m.getBoundingClientRect();
      show(m, r.left + r.width / 2, r.top);
    });
    m.addEventListener('blur', () => (tip.hidden = true));
  });
}
