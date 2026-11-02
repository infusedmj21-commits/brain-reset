import {
  doneByDate,
  firstActiveDate,
  getDayPlan,
  live,
  logSprint,
  setDayPlan,
  setHabit,
  unpromptedDates
} from '../db.js';
import { addDays, prettyDate, today, weekDates, weekStart } from '../logic/dates.js';
import {
  DAY_TYPES,
  TIKTOK_SCHEDULE,
  bestSprint,
  buildChecklist,
  dayStatus,
  formatMinutes,
  missedYesterday,
  sprintSummary,
  streak,
  tiktokLimit
} from '../logic/routine.js';
import { getName } from '../theme.js';
import { esc, toast } from '../ui.js';
import { DAY_LOOK, HABIT_LINKS, HABIT_LOOK } from './look.js';

const DOW = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

function dayChips(selected, attr, small = false) {
  return `<div class="chips${small ? ' small' : ''}" role="group">
    ${Object.entries(DAY_TYPES)
      .map(([key, t]) => {
        const look = DAY_LOOK[key];
        return `<button type="button" class="chip" ${attr}="${key}" aria-pressed="${selected === key}">
          <span class="ico" style="--ico:${look.colour}" aria-hidden="true">${look.emoji}</span>
          <span>${small ? `${look.emoji} ${esc(look.short)}` : esc(t.label)}<small>${esc(t.hint)}</small></span>
        </button>`;
      })
      .join('')}
  </div>`;
}

function missionHTML(item, done, suggestion, rotating) {
  const look = HABIT_LOOK[item.habit];
  const links = (HABIT_LINKS[item.habit] ?? [])
    .map((l) => `<a class="btn-mini" href="${l.href}" target="_blank" rel="noopener">${esc(l.label)}</a>`)
    .join('');
  const other = rotating === 'unprompted' ? 'palace' : 'unprompted';
  const swap = item.rotating
    ? `<button type="button" class="btn-mini" data-swap="${other}" title="Swap to ${other === 'palace' ? 'memory palace' : 'unprompted'}">Swap ⇄</button>`
    : '';
  const why = item.rotating && suggestion ? `<span class="why">${esc(suggestion.reason)}</span>` : '';
  const actions = links || swap ? `<div class="actions">${links}${swap}</div>` : '';
  return `<li class="mission m-${look.colour}${done ? ' done' : ''}">
    <div class="shape ${look.shape}" aria-hidden="true">${look.emoji}</div>
    <div>
      <h3>${esc(item.label)}</h3>
      <div class="meta">${item.minutes} min · ${esc(item.slot ?? '')}</div>
      ${why}${actions}
    </div>
    <button type="button" class="tick" data-toggle="${item.habit}" aria-pressed="${done}"
      aria-label="${done ? 'Untick' : 'Tick'} ${esc(item.label)}">${done ? '✓' : ''}</button>
  </li>`;
}

function subline(dayType, doneCount, total) {
  if (!dayType) return 'What kind of day is it? Pick one to get your missions.';
  const label = DAY_TYPES[dayType].label;
  if (doneCount === total) return `${label}. All ${total} done. Brilliant.`;
  if (doneCount === 0) return `${label}. ${total} missions lined up.`;
  return `${label}. ${doneCount} of ${total} done, keep going.`;
}

export async function renderToday(el, rerender) {
  const date = today();
  const tomorrow = addDays(date, 1);
  const [plan, tomorrowPlan, doneMap, uDates, first, sprints] = await Promise.all([
    getDayPlan(date),
    getDayPlan(tomorrow),
    doneByDate(),
    unpromptedDates(),
    firstActiveDate(),
    live('sprint_scores')
  ]);

  const done = doneMap[date] ?? new Set();
  const currentStreak = streak(date, doneMap);
  const missed = missedYesterday(date, doneMap, first);
  const limit = tiktokLimit(date);
  const dayType = plan?.day_type ?? null;
  const sprint = sprintSummary(sprints, date, weekStart);
  const todaySprint = sprints.find((s) => s.date === date);

  let items = [];
  let suggestion = null;
  let rotating = null;
  if (dayType) {
    ({ items, suggestion, rotating } = buildChecklist({
      date,
      dayType,
      unpromptedDates: uDates,
      rotation: plan.rotation ?? null
    }));
  }
  const doneCount = items.filter((i) => done.has(i.habit)).length;
  const pct = items.length ? Math.round((doneCount / items.length) * 100) : 0;

  const week = weekDates(date)
    .map((d, i) => {
      const cls = [d > date ? 'future' : dayStatus(doneMap[d]), d === date ? 'today' : ''].join(' ');
      return `<b class="${cls}" title="${d}">${DOW[i]}</b>`;
    })
    .join('');

  // Scale bars between the lowest and highest recent score so small gains are visible.
  const vals = sprint.recent.map((s) => s.best);
  const lo = Math.min(...vals);
  const hi = Math.max(...vals);
  const barHeight = (v) => (hi === lo ? 70 : 25 + ((v - lo) / (hi - lo)) * 75);
  const bars = sprint.recent.length
    ? `<div class="bars" aria-hidden="true">${sprint.recent
        .map((s) => `<i class="${s.date === date ? 'now' : ''}" style="height:${barHeight(s.best)}%" title="${s.date}: ${s.best}"></i>`)
        .join('')}</div>`
    : '';
  const maxMin = TIKTOK_SCHEDULE[0].minutes;
  const steps = TIKTOK_SCHEDULE.map((s) => {
    const cls = limit && s.week === limit.week ? 'cur' : limit && s.week < limit.week ? 'past' : '';
    return `<i class="${cls}" style="height:${(s.minutes / maxMin) * 100}%" title="Week ${s.week}: ${formatMinutes(s.minutes)}"></i>`;
  }).join('');

  const name = getName();

  el.innerHTML = `
    <section class="hero">
      <div>
        <div class="eyebrow">${esc(prettyDate(date))}</div>
        <h1 class="page-title">Hey${name ? ` ${esc(name)}` : ''}! 👋</h1>
        <p class="page-sub">${esc(subline(dayType, doneCount, items.length))}</p>
      </div>
      <div class="hero-stats">
        <div class="stat-card">
          <div class="donut" style="--p:${pct}"><span class="num">${items.length ? `${doneCount}/${items.length}` : '–'}</span></div>
          <div><div class="stat-label">Today</div><div class="stat-big num">${items.length ? `${pct}%` : '–'}</div></div>
        </div>
        <div class="stat-card flame" title="Days in a row with at least the sprint and Spanish">
          <span class="emoji" aria-hidden="true">🔥</span>
          <div><div class="stat-label">Streak</div><div class="stat-big num">${currentStreak} day${currentStreak === 1 ? '' : 's'}</div></div>
        </div>
        <div class="stat-card week-card"><div class="stat-label">This week</div><div class="week">${week}</div></div>
      </div>
    </section>

    ${
      missed
        ? `<div class="banner"><strong>Missed yesterday.</strong> Never miss twice: do at least the sprint and 10 minutes of Spanish today.</div>`
        : ''
    }

    <div class="sec" style="--dot:var(--tomato)"><span class="dot"></span><h2>What kind of day?</h2></div>
    ${dayChips(dayType, 'data-daytype')}

    <div class="layout">
      <section>
        <div class="sec" style="--dot:var(--mint)"><span class="dot"></span><h2>Today’s missions</h2>
          ${dayType === 'minimum' ? '<span class="aside">Sprint + Spanish keeps the streak alive</span>' : ''}</div>
        ${
          items.length
            ? `<ul class="missions">${items.map((i) => missionHTML(i, done.has(i.habit), suggestion, rotating)).join('')}</ul>`
            : `<div class="empty-hint">Pick a day type above and your missions appear here.</div>`
        }
      </section>

      <aside class="side">
        <div class="sec" style="--dot:var(--sky);margin-bottom:0"><span class="dot"></span><h2>Scoreboard</h2></div>

        <form class="card top-sun" id="sprint-form" autocomplete="off">
          <h3><span aria-hidden="true">🧮</span> Sprint</h3>
          <div class="row">
            <div>
              <div class="big num">${todaySprint ? todaySprint.best : sprint.latest ? sprint.latest.best : '–'}</div>
              <div class="stat-label">${todaySprint ? 'Today’s best' : sprint.latest ? `Last: ${esc(prettyDate(sprint.latest.date))}` : 'Two 2-minute rounds'}</div>
            </div>
            ${
              sprint.delta != null
                ? `<span class="delta">${sprint.delta >= 0 ? '+' : ''}${sprint.delta} vs last week</span>`
                : sprint.allTimeBest != null
                  ? `<span class="delta">Best ever ${sprint.allTimeBest}</span>`
                  : ''
            }
          </div>
          ${bars}
          <div class="inputs">
            <input class="field" type="number" name="r1" inputmode="numeric" min="0" max="200" placeholder="Round 1" aria-label="Round 1">
            <input class="field" type="number" name="r2" inputmode="numeric" min="0" max="200" placeholder="Round 2" aria-label="Round 2">
            <button class="btn" type="submit">Save</button>
          </div>
        </form>

        <div class="card top-sky">
          <h3><span aria-hidden="true">📱</span> TikTok limit</h3>
          ${
            limit
              ? `<div class="row"><div class="big num">${formatMinutes(limit.minutes)}</div><span class="delta">Week ${limit.week} of ${TIKTOK_SCHEDULE.length}</span></div>
                 <div class="steps" aria-hidden="true">${steps}</div>
                 <div class="note">At work: Spanish accounts only 🇪🇸</div>`
              : `<p class="muted" style="margin-top:8px">The reduction plan starts on 2 November.</p>`
          }
        </div>

        <div class="card top-gum">
          <h3><span aria-hidden="true">🗓️</span> Tomorrow</h3>
          <p class="muted small" style="margin:4px 0 12px">${
            tomorrowPlan ? `Set: ${esc(DAY_TYPES[tomorrowPlan.day_type]?.label ?? '')}` : 'Set it tonight so tomorrow starts ready.'
          }</p>
          ${dayChips(tomorrowPlan?.day_type ?? null, 'data-tomorrow', true)}
        </div>
      </aside>
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
      toast(`Tomorrow: ${DAY_TYPES[b.dataset.tomorrow].label}`);
      rerender();
    })
  );

  el.querySelectorAll('[data-toggle]').forEach((b) =>
    b.addEventListener('click', async () => {
      const habit = b.dataset.toggle;
      const nowDone = !done.has(habit);
      await setHabit(date, habit, nowDone);
      if (nowDone && doneCount + 1 === items.length) toast('All missions done 🎉');
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
