import { TICKS, setTick } from '../data/health.js';
import { listRoles, saveShift } from '../data/money.js';
import { openTasks } from '../data/tasks.js';
import { saveGap } from '../data/checkins.js';
import { prettyDate, today } from '../logic/dates.js';
import { GAP_REASONS } from '../logic/review.js';
import { fmtHours, gbp, shiftPay } from '../logic/money.js';
import { esc, toast } from '../ui.js';

const short = (d) => prettyDate(d).replace(/^(\w{3})\w*/, '$1');

function shiftTask(t, roles) {
  const s = t.shift;
  const role = roles.find((r) => r.id === s.role_id);
  return `<li class="card stack task" data-shift="${esc(s.id)}">
    <div class="task-top"><span class="ico-dot sky" aria-hidden="true"></span>
      <div class="vmain"><strong>Confirm hours · ${esc(s.venue)}</strong>
      <span class="muted small">${esc(short(s.date))}${s.start ? ` · ${esc(s.start)}–${esc(s.end)}` : ''} · ${esc(role?.name ?? '')}</span></div></div>
    <p class="muted small" style="margin:0">Check the total time in your agency app. Expected ${fmtHours(s.hours)} paid (${gbp(shiftPay(s))}).</p>
    <div class="confirm-row">
      <label class="stack" style="gap:4px"><span class="stat-label">Hours</span>
        <input class="field" type="number" name="h" min="0" max="24" step="1" value="${Math.floor(s.hours)}" aria-label="Hours worked"></label>
      <label class="stack" style="gap:4px"><span class="stat-label">Minutes</span>
        <input class="field" type="number" name="m" min="0" max="59" step="1" value="${Math.round((s.hours % 1) * 60)}" aria-label="Minutes worked"></label>
      <button class="btn" type="button" data-confirm>Confirm</button>
    </div>
    <button class="btn-mini" type="button" data-didnt style="justify-self:start">I didn’t work this one</button>
  </li>`;
}

function gapTask(t) {
  return `<li class="card stack task">
    <div class="task-top"><span class="ico-dot tomato" aria-hidden="true"></span>
      <div class="vmain"><strong>Welcome back: what got in the way?</strong>
      <span class="muted small">Away ${t.gap.days} days, ${esc(short(t.gap.from))} to ${esc(short(t.gap.to))}</span></div></div>
    <div class="chips small two">${Object.entries(GAP_REASONS).map(([k, label]) => `<button type="button" class="chip" data-reason="${k}">${label}</button>`).join('')}</div>
  </li>`;
}

function ticksTask(t) {
  return `<li class="card stack task">
    <div class="task-top"><span class="ico-dot mint" aria-hidden="true"></span>
      <div class="vmain"><strong>Today’s ticks</strong><span class="muted small">Health</span></div></div>
    <div class="chips small two">${Object.entries(TICKS)
      .map(([k, label]) => `<button type="button" class="chip" data-tick="${k}" aria-pressed="${t.ticks[k]}">${t.ticks[k] ? '✓ ' : ''}${label}</button>`)
      .join('')}</div>
  </li>`;
}

function linkTask(t) {
  return `<li><a class="card task task-link" href="${t.href}">
    <span class="ico-dot grape" aria-hidden="true"></span>
    <span class="vmain"><strong>${esc(t.title)}</strong><span class="muted small">${esc(t.detail)}</span>${t.why ? `<span class="task-why"><b>Why</b> ${esc(t.why)}</span>` : ''}</span>
    <span class="chev" aria-hidden="true">›</span></a></li>`;
}

export async function renderTasks(el, rerender) {
  const date = today();
  const [tasks, roles] = await Promise.all([openTasks(), listRoles()]);

  el.innerHTML = `
    <div class="eyebrow">${esc(prettyDate(date))}</div>
    <h1 class="page-title">To do</h1>
    <p class="page-sub">${tasks.length ? `${tasks.length} thing${tasks.length === 1 ? '' : 's'} that need${tasks.length === 1 ? 's' : ''} you.` : 'Nothing needs you right now.'}</p>
    ${
      tasks.length
        ? `<ul class="vlist tasklist" style="margin-top:18px">${tasks
            .map((t) => (t.kind === 'shift' ? shiftTask(t, roles) : t.kind === 'gap' ? gapTask(t) : t.kind === 'ticks' ? ticksTask(t) : linkTask(t)))
            .join('')}</ul>`
        : '<div class="empty-hint" style="margin-top:18px">All clear. Go and do the actual work.</div>'
    }`;

  el.querySelectorAll('[data-shift]').forEach((card) => {
    const t = tasks.find((x) => x.kind === 'shift' && x.id === card.dataset.shift);
    card.querySelector('[data-confirm]').addEventListener('click', async () => {
      const h = Number(card.querySelector('[name=h]').value) || 0;
      const m = Number(card.querySelector('[name=m]').value) || 0;
      const hours = Math.round((h + m / 60) * 1e6) / 1e6;
      await saveShift({ ...t.shift, hours, status: 'worked', confirmed: true });
      toast(`Confirmed · ${fmtHours(hours)} · ${gbp(shiftPay({ hours, rate: t.shift.rate }))}`);
      rerender();
    });
    card.querySelector('[data-didnt]').addEventListener('click', async () => {
      await saveShift({ ...t.shift, status: 'cancelled', confirmed: true });
      toast('Marked as not worked');
      rerender();
    });
  });

  const gap = tasks.find((t) => t.kind === 'gap');
  el.querySelectorAll('[data-reason]').forEach((b) =>
    b.addEventListener('click', async () => {
      await saveGap(gap.gap, b.dataset.reason);
      toast('Noted');
      rerender();
    })
  );

  const ticks = tasks.find((t) => t.kind === 'ticks');
  el.querySelectorAll('[data-tick]').forEach((b) =>
    b.addEventListener('click', async () => {
      await setTick(date, b.dataset.tick, !ticks.ticks[b.dataset.tick]);
      rerender();
    })
  );
}
