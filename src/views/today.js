import {
  doneByDate,
  firstActiveDate,
  getDayPlan,
  getSprint,
  logSprint,
  setDayPlan,
  setHabit,
  unpromptedDates
} from '../db.js';
import { addDays, prettyDate, today } from '../logic/dates.js';
import {
  DAY_TYPES,
  bestSprint,
  buildChecklist,
  formatMinutes,
  missedYesterday,
  streak,
  tiktokLimit
} from '../logic/routine.js';
import { esc, toast } from '../ui.js';

function dayTypeButtons(selected, attr, compact = false) {
  return `<div class="segmented${compact ? ' compact' : ''}" role="group">
    ${Object.entries(DAY_TYPES)
      .map(
        ([key, t]) => `<button type="button" ${attr}="${key}" aria-pressed="${selected === key}">
          ${esc(t.label)}<span>${esc(t.hint)}</span></button>`
      )
      .join('')}
  </div>`;
}

function itemHTML(item, done, suggestion, rotating) {
  const other = rotating === 'unprompted' ? 'palace' : 'unprompted';
  const otherLabel = other === 'palace' ? 'memory palace' : 'unprompted';
  const actions = [];
  if (item.link) {
    actions.push(`<a class="link-btn" href="${item.link}" target="_blank" rel="noopener">Open ↗</a>`);
  }
  if (item.rotating) {
    actions.push(`<button type="button" class="link-btn" data-swap="${other}" aria-label="Swap to ${otherLabel}" title="Swap to ${otherLabel}">Swap ⇄</button>`);
  }
  const reason = item.rotating && suggestion ? `<div class="tag">${esc(suggestion.reason)}</div>` : '';
  return `<li class="item${done ? ' done' : ''}">
    <button type="button" class="check" data-toggle="${item.habit}" aria-pressed="${done}"
      aria-label="${done ? 'Untick' : 'Tick'} ${esc(item.label)}">${done ? '✓' : ''}</button>
    <div>
      <div class="item-title">${esc(item.label)}</div>
      <div class="item-meta">${item.minutes} min · ${esc(item.slot ?? '')}</div>
      ${reason}
    </div>
    <div class="item-actions">${actions.join('')}</div>
  </li>`;
}

export async function renderToday(el, rerender) {
  const date = today();
  const tomorrow = addDays(date, 1);
  const [plan, tomorrowPlan, doneMap, uDates, first, sprint] = await Promise.all([
    getDayPlan(date),
    getDayPlan(tomorrow),
    doneByDate(),
    unpromptedDates(),
    firstActiveDate(),
    getSprint(date)
  ]);

  const done = doneMap[date] ?? new Set();
  const currentStreak = streak(date, doneMap);
  const missed = missedYesterday(date, doneMap, first);
  const limit = tiktokLimit(date);
  const dayType = plan?.day_type ?? null;

  let checklistHTML = `<p class="muted">Pick today’s day type to see your checklist.</p>`;
  if (dayType) {
    const { items, suggestion, rotating } = buildChecklist({
      date,
      dayType,
      unpromptedDates: uDates,
      rotation: plan.rotation ?? null
    });
    const doneCount = items.filter((i) => done.has(i.habit)).length;
    checklistHTML = `
      <p class="muted small num">${doneCount} of ${items.length} done${
        dayType === 'minimum' ? ' · sprint + Spanish keeps the streak alive' : ''
      }</p>
      <ul class="checklist">${items.map((i) => itemHTML(i, done.has(i.habit), suggestion, rotating)).join('')}</ul>`;
  }

  el.innerHTML = `
    <div class="page-head">
      <div>
        <div class="eyebrow">${esc(prettyDate(date))}</div>
        <h1>Today</h1>
      </div>
      <span class="pill num" title="Days in a row with at least sprint + Spanish">🔥 ${currentStreak} day${currentStreak === 1 ? '' : 's'}</span>
    </div>

    ${
      missed
        ? `<div class="banner"><strong>Missed yesterday.</strong> Never miss twice: do at least the arithmetic sprint and 10 minutes of Spanish today.</div>`
        : ''
    }

    <div class="columns">
    <section class="col-main">
    <h2>Day type</h2>
    ${dayTypeButtons(dayType, 'data-daytype')}

    <h2>Checklist</h2>
    ${checklistHTML}
    </section>

    <section class="col-side">
    <h2>Arithmetic sprint</h2>
    <form class="card stack" id="sprint-form" autocomplete="off">
      ${
        sprint
          ? `<div class="stat"><span class="muted">Today’s best</span><span class="stat-value num">${sprint.best}</span></div>`
          : `<p class="muted small">Two 120-second rounds on Zetamac’s default settings, then log both scores.</p>`
      }
      <div class="field-row">
        <label class="field">Round 1<input type="number" name="r1" inputmode="numeric" min="0" max="200"></label>
        <label class="field">Round 2<input type="number" name="r2" inputmode="numeric" min="0" max="200"></label>
        <button class="btn" type="submit">Save</button>
      </div>
    </form>

    <h2>TikTok</h2>
    <div class="card">
      ${
        limit
          ? `<div class="stat"><span class="muted">Week ${limit.week} daily limit</span><span class="stat-value num">${formatMinutes(limit.minutes)}</span></div>
             <p class="muted small" style="margin-top:6px">At work, Spanish accounts only. No phone in bed, nothing in the first 30 minutes after waking.</p>`
          : `<p class="muted">The reduction plan starts on 2 November.</p>`
      }
    </div>

    <h2>Tomorrow</h2>
    <details class="card" ${tomorrowPlan ? '' : 'open'}>
      <summary>${
        tomorrowPlan ? `Tomorrow: ${esc(DAY_TYPES[tomorrowPlan.day_type]?.label ?? '')} · change` : 'Set tomorrow’s day type'
      }</summary>
      ${dayTypeButtons(tomorrowPlan?.day_type ?? null, 'data-tomorrow', true)}
    </details>
    </section>
    </div>
  `;

  el.querySelectorAll('[data-daytype]').forEach((b) =>
    b.addEventListener('click', async () => {
      await setDayPlan(date, { day_type: b.dataset.daytype });
      rerender();
    })
  );

  el.querySelectorAll('[data-tomorrow]').forEach((b) =>
    b.addEventListener('click', async () => {
      await setDayPlan(tomorrow, { day_type: b.dataset.tomorrow });
      toast(`Tomorrow set: ${DAY_TYPES[b.dataset.tomorrow].label}`);
      rerender();
    })
  );

  el.querySelectorAll('[data-toggle]').forEach((b) =>
    b.addEventListener('click', async () => {
      const habit = b.dataset.toggle;
      await setHabit(date, habit, !done.has(habit));
      rerender();
    })
  );

  el.querySelectorAll('[data-swap]').forEach((b) =>
    b.addEventListener('click', async () => {
      await setDayPlan(date, { rotation: b.dataset.swap });
      rerender();
    })
  );

  el.querySelector('#sprint-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const r1 = form.get('r1');
    const r2 = form.get('r2');
    const best = bestSprint(r1, r2);
    if (best == null) {
      toast('Enter at least one score');
      return;
    }
    const row = await logSprint(date, r1, r2, best);
    toast(row.best > best ? `Saved · today’s best is still ${row.best}` : `Saved · best ${row.best}`);
    rerender();
  });
}
