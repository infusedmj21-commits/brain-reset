import { doneByDate, firstActiveDate, getDayPlan, live, unpromptedDates } from '../db.js';
import { focusFor, listScores, listTasks, listVentures, setFocus, toggleFocus } from '../data/ventures.js';
import { addDays, daysBetween, prettyDate, today, weekDates, weekStart } from '../logic/dates.js';
import { GAP_REASONS, activeDates, bestStreak, gapBefore, reviewWeek } from '../logic/review.js';
import { getCheckin, saveGap } from '../data/checkins.js';
import { listRoutines, listWorkouts, getMode } from '../data/health.js';
import { weekPlan } from '../logic/health.js';
import { DAY_TYPES, TIKTOK_SCHEDULE, buildChecklist, formatMinutes, missedYesterday, streak, tiktokLimit } from '../logic/routine.js';
import { formatScore, needsRescore, rankTasks, scoreHistory } from '../logic/scoring.js';
import { getName } from '../theme.js';
import { esc, toast } from '../ui.js';
import { verdictChip } from './scorer.js';
import { ICONS } from './icons.js';
import { nextPay, nextShift } from './money.js';
import { byWhen, fmtHours, gbp, gbp0, shiftPay } from '../logic/money.js';
import { listRoles, listShifts } from '../data/money.js';
import { loadTaxPicture } from '../data/tax.js';
import { openTaskCount } from '../data/tasks.js';

// Picker state survives re-renders while choosing today's 3.
let picking = false;
let picks = new Map(); // task_id -> { plan, energy }

const ENERGY = { high: 'High energy', low: 'Low energy' };
const ENERGY_HINT = {
  early: 'Early shift: do the low-energy one after work, the rest before you leave.',
  late: 'Late shift: high-energy tasks in the morning, before you head out.',
  off: 'Day off: put the hardest task first, while you’re fresh.',
  minimum: 'Minimum day: one small task is plenty.'
};

function greeting(name) {
  const h = new Date().getHours();
  const part = h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
  return `${part}${name ? `, ${esc(name)}` : ''}`;
}

const line = (d) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
const I = {
  gym: line('<path d="M6.5 6.5v11M17.5 6.5v11M3 9v6M21 9v6M6.5 12h11"/>'),
  spanish: line('<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>'),
  ventures: line('<path d="M5 20V11M12 20V5M19 20v-6"/>'),
  focus: line('<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>'),
  pay: line('<rect x="3" y="6" width="18" height="13" rx="2"/><path d="M3 10h18M7 15h3"/>'),
  check: line('<path d="M9 6h11M9 12h11M9 18h11"/><path d="M4 6l1 1 2-2M4 12l1 1 2-2M4 18l1 1 2-2"/>'),
  clock: line('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>'),
  plus: line('<path d="M12 5v14M5 12h14"/>'),
  cal: line('<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18"/>'),
  arrow: line('<path d="M7 17L17 7M8 7h9v9"/>')
};

/** ISO week number (Monday start). */
function isoWeek(date) {
  const d = new Date(`${date}T12:00:00Z`);
  const day = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - day + 3);
  const jan4 = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
  return 1 + Math.round(((d - jan4) / 86400000 - 3 + ((jan4.getUTCDay() + 6) % 7)) / 7);
}

/** 84×30 sparkline, no axes. */
function spark(values) {
  if (values.length < 2 || !values.some((v) => v > 0)) return '';
  const max = Math.max(...values);
  const pts = values.map((v, i) => `${((i / (values.length - 1)) * 80 + 2).toFixed(1)},${(28 - (max ? (v / max) * 24 : 0)).toFixed(1)}`).join(' ');
  return `<svg class="spark" viewBox="0 0 84 30" width="84" height="30" aria-hidden="true"><polyline points="${pts}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
}

function statCard({ hot = false, icon, pill, value, label, note, sparkline = '' }) {
  return `<div class="stat-glass${hot ? ' hot' : ''}">
    <div class="sg-top"><span class="chipico">${icon}</span>${pill ? `<span class="sg-pill">${pill}</span>` : ''}</div>
    <div class="stat-big num">${value}</div>
    <div class="sg-bottom"><div><div class="sg-label">${label}</div><div class="sg-note">${note}</div></div>${sparkline}</div>
  </div>`;
}

function focusHTML(focus, tasks, ventures) {
  const name = (id) => ventures.find((v) => v.id === id)?.name ?? '';
  return `<ul class="vlist">${focus
    .map((f) => {
      const t = tasks.find((x) => x.id === f.task_id);
      return `<li class="vrow card${f.done ? ' is-done' : ''}">
        <button type="button" class="tick" data-focus="${esc(f.id)}" aria-pressed="${f.done}" aria-label="${f.done ? 'Untick' : 'Tick'} ${esc(t?.title ?? '')}">${f.done ? '✓' : ''}</button>
        <span class="vmain"><strong>${esc(t?.title ?? 'Deleted task')}</strong>
          <span class="muted small">${f.plan ? `${esc(f.plan)} · ` : ''}${esc(name(t?.venture_id))}</span></span>
        <span class="echip e-${f.energy ?? 'high'}">${ENERGY[f.energy ?? 'high']}</span>
      </li>`;
    })
    .join('')}</ul>`;
}

function pickerHTML(ranked, ventures, dayType) {
  const name = (id) => ventures.find((v) => v.id === id)?.name ?? '';
  if (!ranked.length) {
    return `<div class="empty-hint">No open tasks yet. Add some under <a href="#/ventures">Ventures</a>, then pick 3 here.</div>`;
  }
  return `<form id="pick-form" class="stack">
    ${dayType ? `<p class="muted small">${esc(ENERGY_HINT[dayType])}</p>` : ''}
    <ul class="vlist">
      ${ranked
        .slice(0, 12)
        .map((t) => {
          const p = picks.get(t.id);
          return `<li class="card pick${p ? ' on' : ''}">
            <label class="pick-top"><input type="checkbox" data-pick="${esc(t.id)}"${p ? ' checked' : ''}>
              <span class="vmain"><strong>${esc(t.title)}</strong><span class="muted small">${esc(name(t.venture_id))}</span></span>
              <span class="vside"><span class="vscore num">${formatScore(t.value)}</span>${verdictChip(t.value)}</span>
            </label>
            ${
              p
                ? `<div class="pick-plan">
                    <input class="field" data-plan="${esc(t.id)}" value="${esc(p.plan)}" placeholder="When and where? e.g. After breakfast, at my desk" aria-label="When and where" maxlength="80">
                    <div class="chips small two" role="group" aria-label="Energy">
                      ${Object.entries(ENERGY).map(([k, label]) => `<button type="button" class="chip" data-energy="${esc(t.id)}" data-level="${k}" aria-pressed="${p.energy === k}">${label}</button>`).join('')}
                    </div>
                  </div>`
                : ''
            }
          </li>`;
        })
        .join('')}
    </ul>
    <div class="row-btns">
      <button class="btn" type="submit"${picks.size ? '' : ' disabled'}>Lock in ${picks.size || ''}</button>
      <button class="btn secondary" type="button" id="pick-cancel">Cancel</button>
    </div>
  </form>`;
}

export async function renderHome(el, rerender) {
  const date = today();
  const [plan, doneMap, uDates, first, sprints, focus, tasks, ventures, scores, shift, habitLogs, allFocus, workouts, routines, mode, pay] = await Promise.all([
    getDayPlan(date),
    doneByDate(),
    unpromptedDates(),
    firstActiveDate(),
    live('sprint_scores'),
    focusFor(date),
    listTasks(),
    listVentures(),
    listScores(),
    nextShift(),
    live('habit_logs'),
    live('day_focus'),
    listWorkouts(),
    listRoutines(),
    getMode(),
    nextPay()
  ]);
  const [shifts, roles, tax, todoCount] = await Promise.all([listShifts(), listRoles(), loadTaxPicture(date), openTaskCount()]);

  const dayType = plan?.day_type ?? null;
  const items = dayType ? buildChecklist({ date, dayType, unpromptedDates: uDates, rotation: plan.rotation ?? null }).items : [];
  const done = doneMap[date] ?? new Set();
  const doneCount = items.filter((i) => done.has(i.habit)).length;
  const nextItem = items.find((i) => !done.has(i.habit));
  const pct = items.length ? Math.round((doneCount / items.length) * 100) : 0;
  const missed = missedYesterday(date, doneMap, first);

  const activeVentures = ventures.filter((v) => v.status !== 'archived');
  const hist = scoreHistory(scores);
  const dueRescore = activeVentures.filter((v) => needsRescore(hist[v.id]?.latest, date, daysBetween)).length;
  const ranked = rankTasks(tasks.filter((t) => activeVentures.some((v) => v.id === t.venture_id)));

  if (picking && !picks.size && focus.length) {
    picks = new Map(focus.map((f) => [f.task_id, { plan: f.plan ?? '', energy: f.energy ?? 'high' }]));
  }
  const focusDone = focus.filter((f) => f.done).length;

  // Comebacks: 2+ whole days away gets a welcome back (once), 1 day a nudge.
  const gap = gapBefore(date, activeDates({ habitLogs, workouts, focus: allFocus }));
  const gapAnswered = gap ? await getCheckin(gap.id) : null;
  const showWelcome = gap && !gapAnswered;
  const gymPlan = weekPlan(routines, workouts, date, mode);
  const gymMissed = gymPlan.plan.filter((p) => p.status === 'missed').length;
  const week = reviewWeek(date, weekStart);
  const reviewDue = first && first <= week.end && !(await getCheckin(week.id));

  // ---- Hero: today's reset ----
  const nowStreak = streak(date, doneMap);
  const sorted = [...sprints].filter((x) => x.date <= date).sort((x, y) => x.date.localeCompare(y.date));
  const lastSprint = sorted.at(-1);
  const limit = tiktokLimit(date);
  const allDone = items.length && doneCount === items.length;
  const headline = !dayType
    ? 'Set up your <em>day</em>'
    : allDone
      ? 'Today’s reset is <em>done</em>'
      : doneCount
        ? 'Your day is on a <em>roll</em>'
        : 'Let’s get <em>going</em>';
  const heroLine = !dayType
    ? 'Pick today’s day type and Artemis lines up your missions.'
    : nextItem
      ? `Next up: ${esc(nextItem.label)}, ${nextItem.minutes} minutes. ${doneCount} of ${items.length} done so far.`
      : 'Everything’s ticked off. Rest counts too.';
  const C = 2 * Math.PI * 66;

  // ---- Calendar: this week's shifts and payday ----
  const days = weekDates(date);
  const roleName = (id) => roles.find((r) => r.id === id)?.name ?? '';
  const liveShifts = shifts.filter((x) => x.status !== 'cancelled');
  const weekShifts = liveShifts.filter((x) => days.includes(x.date)).sort(byWhen);
  const payEst = pay ? tax.byPayday.get(pay.payday) : null;
  const takeHome = payEst && payEst.net != null && payEst.source !== 'none' && payEst.source !== 'before-payslips' ? payEst.net : pay?.expected ?? 0;
  const events = [
    ...liveShifts
      .filter((x) => x.date >= date && x.date <= addDays(date, 7) && x.status === 'booked')
      .map((x) => ({ date: x.date, time: x.start ?? '', title: x.venue, meta: `${prettyDate(x.date).slice(0, 3)} · ${roleName(x.role_id)} · ${fmtHours(x.hours)}` })),
    ...(pay && pay.payday <= addDays(date, 7)
      ? [{ date: pay.payday, time: 'Pay', title: `Payday · ${gbp0(takeHome)}`, meta: `${prettyDate(pay.payday).slice(0, 3)} · ${pay.shifts.length} shift${pay.shifts.length === 1 ? '' : 's'}` }]
      : [])
  ]
    .sort((x, y) => x.date.localeCompare(y.date) || (x.time === 'Pay' ? '00:00' : x.time).localeCompare(y.time === 'Pay' ? '00:00' : y.time))
    .slice(0, 3);
  const [weekdayName, dayNum, monthName, yearNum] = new Date(`${date}T12:00:00`).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).replace(',', '').split(' ');

  // ---- Stats ----
  const weekHours = weekShifts.reduce((t, x) => t + (Number(x.hours) || 0), 0);
  const weekPay = weekShifts.reduce((t, x) => t + shiftPay(x), 0);
  const hoursByWeek = Array.from({ length: 8 }, (_, i) => {
    const wk = weekDates(addDays(date, -7 * (7 - i)));
    return liveShifts.filter((x) => wk.includes(x.date)).reduce((t, x) => t + (Number(x.hours) || 0), 0);
  });
  const paidNets = tax.year.weeks.filter((w) => w.payday <= (pay?.payday ?? date) && w.net > 0).slice(-8).map((w) => w.net);
  const gymDone = gymPlan.plan.filter((x) => x.status === 'done').length;
  const gymByWeek = Array.from({ length: 8 }, (_, i) => {
    const wk = weekDates(addDays(date, -7 * (7 - i)));
    return workouts.filter((w) => w.finished_at && wk.includes(w.date)).length;
  });
  const focusByDay = Array.from({ length: 7 }, (_, i) => allFocus.filter((f) => f.date === addDays(date, i - 6) && f.done).length);
  const nudges = [
    reviewDue ? `<a class="nudge" href="#/review"><span class="chipico">${ICONS.review}</span><span><strong>Your week in review</strong><span class="muted small">Last week at a glance, then one thing to change.</span></span></a>` : '',
    dueRescore ? `<a class="nudge" href="#/ventures"><span class="chipico">${ICONS.ventures}</span><span><strong>Rescore ventures</strong><span class="muted small">${dueRescore} not scored this week.</span></span></a>` : ''
  ].filter(Boolean);

  el.innerHTML = `
    <section class="home-head">
      <div>
        <h1 class="page-title">${greeting(getName())}</h1>
        <div class="page-sub">${esc(prettyDate(date))}${dayType ? ` · ${esc(DAY_TYPES[dayType].label)}` : ''}${todoCount ? ` · <a href="#/tasks">${todoCount} thing${todoCount === 1 ? '' : 's'} need${todoCount === 1 ? 's' : ''} you</a>` : ''}</div>
      </div>
      <div class="head-links">
        <a class="btn secondary" href="#/review">${I.clock}Weekly review</a>
        <a class="btn" href="#/money">${I.plus}Log a shift</a>
      </div>
    </section>

    ${
      showWelcome
        ? `<section class="card stack welcome">
            <h2>Welcome back.</h2>
            <p>You were away ${gap.days} days (${esc(prettyDate(gap.from))} to ${esc(prettyDate(gap.to))}). No drama: one missed stretch doesn’t undo the habit, the next one is what counts.</p>
            <div class="stat-label">What got in the way? (it shows in your weekly review)</div>
            <div class="chips small two">${Object.entries(GAP_REASONS).map(([k, label]) => `<button type="button" class="chip" data-reason="${k}">${label}</button>`).join('')}</div>
            <div class="stat-label" style="margin-top:6px">Catch up, smallest first</div>
            <ul class="plain-list catchup">
              <li><a href="#/today">Comeback day: the sprint and 10 minutes of Spanish</a></li>
              ${dueRescore ? `<li><a href="#/ventures">Rescore ${dueRescore} venture${dueRescore === 1 ? '' : 's'}</a></li>` : ''}
              ${gymMissed ? `<li><a href="#/health">${gymMissed} gym session${gymMissed === 1 ? '' : 's'} to catch up: start with the next one</a></li>` : ''}
              <li><a href="#/money">Log any shifts you worked while away</a></li>
            </ul>
          </section>`
        : missed
          ? `<a class="banner" href="#/today"><strong>Missed yesterday.</strong> Never miss twice: today is a comeback day, so the sprint and 10 minutes of Spanish keep the streak alive.</a>`
          : ''
    }

    <div class="home-top">
      <section class="hero-card">
        <div class="hero-left">
          <span class="hero-pill"><i class="pulse-dot"></i>Week ${isoWeek(date)} · ${nowStreak}-day streak</span>
          <h2 class="hero-title">${headline}</h2>
          <p class="hero-line">${heroLine}</p>
          <div class="hero-minis">
            <div><b class="count num">${nowStreak}</b><span>Day streak</span></div>
            <div><b class="count num">${lastSprint ? lastSprint.best : '–'}</b><span>Sprint best</span></div>
            <div><b class="num">${limit ? formatMinutes(limit.minutes) : '–'}</b><span>TikTok cap</span></div>
          </div>
          <div class="hero-btns">
            <a class="btn white" href="#/today">${allDone ? 'Open today’s reset' : 'Start today’s reset'} ${I.arrow}</a>
            <a class="btn ghost" href="#/progress">Progress</a>
          </div>
        </div>
        <div class="hero-right" aria-hidden="true">
          <div class="hero-orbit">
            <span style="--a:0deg">${I.gym}</span><span style="--a:90deg">${I.spanish}</span><span style="--a:180deg">${I.ventures}</span><span style="--a:270deg">${I.focus}</span>
          </div>
          <svg class="hero-ring" viewBox="0 0 150 150"><circle cx="75" cy="75" r="66" class="track"/><circle cx="75" cy="75" r="66" class="bar" style="--p:${items.length ? doneCount / items.length : 0};--c:${C.toFixed(2)}px"/></svg>
          <div class="hero-ring-label"><b class="count num">${pct}%</b><span>of today’s reset</span></div>
        </div>
      </section>

      <section class="card cal-card">
        <div class="cal-top">
          <span class="cal-day num">${dayNum}</span>
          <span class="cal-when"><strong>${weekdayName}</strong><span class="muted small">${monthName} ${yearNum} · ${weekShifts.length} shift${weekShifts.length === 1 ? '' : 's'} this week</span></span>
          <a class="icon-btn" href="#/money" aria-label="Shifts">${I.cal}</a>
        </div>
        <div class="cal-strip">
          ${days
            .map((d) => {
              const has = liveShifts.some((x) => x.date === d) || pay?.payday === d;
              return `<span class="cs${d === date ? ' today' : ''}"><small>${'MTWTFSS'[days.indexOf(d)]}</small><b class="num">${Number(d.slice(8))}</b><i${has ? '' : ' hidden'}></i></span>`;
            })
            .join('')}
        </div>
        <ul class="cal-events">
          ${
            events.length
              ? events
                  .map(
                    (e, i) => `<li><span class="ev-time num">${esc(e.time)}</span><i></i><span class="ev-main"><strong>${esc(e.title)}</strong><span class="muted small">${esc(e.meta)}</span></span>${i === 0 ? '<span class="next-pill">Next</span>' : ''}</li>`
                  )
                  .join('')
              : '<li class="ev-empty"><span class="muted small">Nothing booked in the next week.</span></li>'
          }
        </ul>
      </section>
    </div>

    <div class="home-stats">
      ${statCard({
        hot: true,
        icon: I.pay,
        pill: pay ? esc(prettyDate(pay.payday).replace(/^(\w{3})\w*/, '$1')) : '',
        value: pay ? gbp0(takeHome) : '–',
        label: pay?.isToday ? 'Payday today' : 'Next payday',
        note: pay ? `Take-home · ${gbp0(payEst?.gross ?? pay.expected)} before tax` : 'Log shifts to see it',
        sparkline: spark(paidNets)
      })}
      ${statCard({
        icon: I.check,
        pill: `of ${focus.length || 3}`,
        value: String(focusDone),
        label: 'Today’s 3',
        note: focus.length ? (focusDone === focus.length ? 'All done' : 'Tasks locked in') : 'Not picked yet',
        sparkline: spark(focusByDay)
      })}
      ${statCard({
        icon: I.gym,
        pill: `of ${gymPlan.plan.length}`,
        value: String(gymDone),
        label: 'Gym this week',
        note: gymMissed ? `${gymMissed} to catch up` : gymPlan.next ? `Next: ${esc(gymPlan.next.routine.name ?? '')}` : 'On track',
        sparkline: spark(gymByWeek)
      })}
      ${statCard({
        icon: I.cal,
        pill: `${weekShifts.length} shift${weekShifts.length === 1 ? '' : 's'}`,
        value: fmtHours(weekHours),
        label: 'Shifts this week',
        note: `${gbp0(weekPay)} before tax`,
        sparkline: spark(hoursByWeek)
      })}
    </div>

    <div class="home-bottom${nudges.length ? '' : ' solo'}">
      <section class="card today3">
        <div class="t3-head"><h3>Lock in today</h3>${focus.length && !picking ? `<span class="sg-pill num">${focusDone} of ${focus.length}</span>` : ''}</div>
        ${
          picking
            ? pickerHTML(ranked, ventures, dayType)
            : focus.length
              ? `${focusHTML(focus, tasks, ventures)}<button class="btn secondary block" type="button" id="pick-start" style="margin-top:12px">Change today’s 3</button>`
              : `<p class="muted small">Pick 3 tasks for today, each with when and where you’ll do it.</p>
                  <button class="btn block" type="button" id="pick-start">Pick today’s 3</button>`
        }
      </section>
      ${nudges.length ? `<aside class="nudges">${nudges.join('')}</aside>` : ''}
    </div>`;

  // ---- Wiring ----
  el.querySelectorAll('[data-reason]').forEach((b) =>
    b.addEventListener('click', async () => {
      await saveGap(gap, b.dataset.reason);
      toast('Noted. Let’s go.');
      rerender();
    })
  );

  el.querySelector('#pick-start')?.addEventListener('click', () => {
    picking = true;
    picks = new Map();
    rerender();
  });

  el.querySelectorAll('[data-focus]').forEach((b) =>
    b.addEventListener('click', async () => {
      const row = focus.find((f) => f.id === b.dataset.focus);
      await toggleFocus(row, date);
      if (!row.done && focusDone + 1 === focus.length) toast('All 3 done. Great day.');
      rerender();
    })
  );

  const form = el.querySelector('#pick-form');
  if (!form) return;

  form.querySelectorAll('[data-pick]').forEach((box) =>
    box.addEventListener('change', () => {
      const id = box.dataset.pick;
      if (box.checked) {
        if (picks.size >= 3) {
          box.checked = false;
          toast('Three is the limit. Untick one first.');
          return;
        }
        picks.set(id, { plan: '', energy: 'high' });
      } else picks.delete(id);
      rerender();
    })
  );
  form.querySelectorAll('[data-plan]').forEach((input) =>
    input.addEventListener('input', () => {
      picks.get(input.dataset.plan).plan = input.value;
    })
  );
  form.querySelectorAll('[data-energy]').forEach((b) =>
    b.addEventListener('click', () => {
      picks.get(b.dataset.energy).energy = b.dataset.level;
      form.querySelectorAll(`[data-energy="${CSS.escape(b.dataset.energy)}"]`).forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    })
  );
  el.querySelector('#pick-cancel').addEventListener('click', () => {
    picking = false;
    picks = new Map();
    rerender();
  });
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    await setFocus(
      date,
      [...picks.entries()].map(([task_id, p]) => ({ task_id, plan: p.plan.trim(), energy: p.energy }))
    );
    picking = false;
    picks = new Map();
    toast('Locked in');
    rerender();
  });
}
