import { doneByDate, firstActiveDate, getDayPlan, live, unpromptedDates } from '../db.js';
import { focusFor, listScores, listTasks, listVentures, setFocus, toggleFocus } from '../data/ventures.js';
import { addDays, daysBetween, prettyDate, today, weekStart } from '../logic/dates.js';
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
import { nextShift } from './money.js';
import { gbp } from '../logic/money.js';

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
  const part = h < 12 ? 'Morning' : h < 18 ? 'Afternoon' : 'Evening';
  return `${part}${name ? `, ${esc(name)}` : ''}.`;
}

function sinceYesterday({ date, doneMap, sprints }) {
  const nowStreak = streak(date, doneMap);
  const prevStreak = streak(addDays(date, -1), doneMap);
  const best = bestStreak(doneMap);
  const streakNote = `${nowStreak > prevStreak ? `+${nowStreak - prevStreak} today` : nowStreak === 0 ? 'Start one today' : 'Do today’s two to grow it'}${best > nowStreak ? ` · best ${best}` : ''}`;

  const sorted = [...sprints].filter((s) => s.date <= date).sort((a, b) => a.date.localeCompare(b.date));
  const last = sorted.at(-1);
  const prev = sorted.at(-2);
  const sprintNote = !last ? 'No sprint yet' : prev ? `${last.best - prev.best >= 0 ? '+' : ''}${last.best - prev.best} vs the time before` : 'First score';

  const limit = tiktokLimit(date);
  const prevStep = limit ? TIKTOK_SCHEDULE.find((s) => s.week === limit.week - 1) : null;
  const tiktokNote = !limit ? 'Plan not started' : prevStep ? `−${formatMinutes(prevStep.minutes - limit.minutes)} this week` : 'Week 1';

  return `
    <div class="tiles three">
      <div class="tile t-tomato"><div class="stat-label">Streak</div><div class="stat-big num">${nowStreak} day${nowStreak === 1 ? '' : 's'}</div><div class="tile-note">${streakNote}</div></div>
      <div class="tile t-mint"><div class="stat-label">Sprint best</div><div class="stat-big num">${last ? last.best : '–'}</div><div class="tile-note">${esc(sprintNote)}</div></div>
      <div class="tile t-sky"><div class="stat-label">TikTok cap</div><div class="stat-big num">${limit ? formatMinutes(limit.minutes) : '–'}</div><div class="tile-note">${tiktokNote}</div></div>
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
  const [plan, doneMap, uDates, first, sprints, focus, tasks, ventures, scores, shift, habitLogs, allFocus, workouts, routines, mode] = await Promise.all([
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
    getMode()
  ]);

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

  el.innerHTML = `
    <section class="home-head">
      <div>
        <div class="eyebrow">${esc(prettyDate(date))}${dayType ? ` · ${esc(DAY_TYPES[dayType].label)}` : ''}</div>
        <h1 class="page-title">${greeting(getName())}</h1>
      </div>
      <div class="head-links">
        <a class="icon-btn" href="#/progress" aria-label="Progress">${ICONS.progress}</a>
        <a class="icon-btn" href="#/settings" aria-label="Settings">${ICONS.settings}</a>
      </div>
    </section>

    ${
      showWelcome
        ? `<section class="card top-grape stack welcome" style="margin-top:18px">
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

    <div class="sec" style="--dot:var(--tomato)"><span class="dot"></span><h2>Since yesterday</h2></div>
    ${sinceYesterday({ date, doneMap, sprints })}

    <div class="layout">
      <section>
        <div class="sec" style="--dot:var(--mint)"><span class="dot"></span><h2>Lock in today</h2>
          ${focus.length && !picking ? `<span class="aside num">${focusDone} of ${focus.length}</span>` : ''}</div>
        ${
          picking
            ? pickerHTML(ranked, ventures, dayType)
            : focus.length
              ? `${focusHTML(focus, tasks, ventures)}<button class="btn secondary block" type="button" id="pick-start" style="margin-top:12px">Change today’s 3</button>`
              : `<div class="card stack"><p>Pick 3 tasks for today, each with when and where you’ll do it.</p>
                  <button class="btn block" type="button" id="pick-start">Pick today’s 3</button></div>`
        }
      </section>

      <aside class="side">
        ${
          shift
            ? `<a class="card top-sky reset-card" href="#/money"><div class="ico-badge sky">${ICONS.shift}</div>
                <div><div class="stat-label">Next shift · ${shift.date === date ? 'today' : esc(prettyDate(shift.date))}</div><h3>${esc(shift.venue)}</h3>
                <p class="muted small" style="margin:2px 0 0">${esc(shift.roleName)} · ${shift.hours}h · ${gbp(shift.pay)}</p></div></a>`
            : `<a class="card top-sky reset-card" href="#/money"><div class="ico-badge sky">${ICONS.shift}</div>
                <div><h3>No shift booked</h3><p class="muted small" style="margin:2px 0 0">Log your next one in Money.</p></div></a>`
        }
        <a class="card top-mint reset-card" href="#/today">
          <div class="donut" style="--p:${pct}"><span class="num">${items.length ? `${doneCount}/${items.length}` : '–'}</span></div>
          <div><h3>Brain Reset</h3><p class="muted small" style="margin:2px 0 0">${
            !dayType ? 'Pick today’s day type to get your missions.' : nextItem ? `Next: ${esc(nextItem.label)}, ${nextItem.minutes} min` : 'All done today.'
          }</p></div>
        </a>
        ${
          reviewDue
            ? `<a class="card top-grape reset-card" href="#/review"><div class="ico-badge grape">${ICONS.review}</div>
                <div><h3>Your week in review</h3><p class="muted small" style="margin:2px 0 0">Last week at a glance, then one thing to change.</p></div></a>`
            : ''
        }
        ${
          dueRescore
            ? `<a class="card top-sun reset-card" href="#/ventures"><div class="ico-badge sun">${ICONS.ventures}</div>
                <div><h3>Rescore ventures</h3><p class="muted small" style="margin:2px 0 0">${dueRescore} not scored this week.</p></div></a>`
            : ''
        }
      </aside>
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
