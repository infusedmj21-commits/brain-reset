import { ICONS } from './icons.js';
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
  TIKTOK_LEVELS,
  bestSprint,
  buildChecklist,
  dayStatus,
  formatMinutes,
  missedYesterday,
  sprintSummary,
  streak,
  formatMinutes as fmtMin
} from '../logic/routine.js';
import { getName } from '../theme.js';
import { esc, toast } from '../ui.js';
import { DAY_LOOK, HABIT_LINKS, HABIT_LOOK } from './look.js';
import { holdTiktok, loadTiktok, logTiktokDay, restartTiktok, stepTiktok } from '../data/tiktok.js';

const shortDay = (d) => prettyDate(d).replace(/^(\w{3})\w*/, '$1');

const DOW = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

function dayChips(selected, attr, small = false) {
  return `<div class="chips${small ? ' small' : ''}" role="group">
    ${Object.entries(DAY_TYPES)
      .map(([key, t]) => {
        const look = DAY_LOOK[key];
        return `<button type="button" class="chip" ${attr}="${key}" aria-pressed="${selected === key}">
          <span class="ico" style="--ico:${look.colour}" aria-hidden="true">${look.icon}</span>
          <span>${small ? esc(look.short) : esc(t.label)}<small>${esc(t.hint)}</small></span>
        </button>`;
      })
      .join('')}
  </div>`;
}

function missionHTML(item, done, suggestion, rotating) {
  const look = HABIT_LOOK[item.habit];
  const links = (HABIT_LINKS[item.habit] ?? [])
    .map((l) =>
      l.href.startsWith('#')
        ? `<a class="btn-mini" href="${l.href}">${esc(l.label)}</a>`
        : `<a class="btn-mini" href="${l.href}" target="_blank" rel="noopener">${esc(l.label)}</a>`
    )
    .join('');
  const other = rotating === 'unprompted' ? 'palace' : 'unprompted';
  const swap = item.rotating
    ? `<button type="button" class="btn-mini" data-swap="${other}" title="Swap to ${other === 'palace' ? 'memory palace' : 'unprompted'}">Swap ⇄</button>`
    : '';
  const why = item.rotating && suggestion ? `<span class="why">${esc(suggestion.reason)}</span>` : '';
  const actions = links || swap ? `<div class="actions">${links}${swap}</div>` : '';
  return `<li class="mission m-${look.colour}${done ? ' done' : ''}">
    <div class="shape ${look.shape}" aria-hidden="true">${look.icon}</div>
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
  const tk = await loadTiktok(date);
  const st = tk.state;
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
  const maxMin = TIKTOK_LEVELS[0];
  const steps = TIKTOK_LEVELS.map((m, i) => {
    const cls = i + 1 === st.level ? 'cur' : i + 1 < st.level ? 'past' : '';
    return `<i class="${cls}" style="height:${(m / maxMin) * 100}%" title="Week ${i + 1}: ${fmtMin(m)}"></i>`;
  }).join('');
  const yesterday = addDays(date, -1);

  const name = getName();

  el.innerHTML = `
    <section class="hero">
      <div>
        <div class="eyebrow">${esc(prettyDate(date))}</div>
        <h1 class="page-title">Hey${name ? ` ${esc(name)}` : ''}</h1>
        <p class="page-sub">${esc(subline(dayType, doneCount, items.length))}</p>
      </div>
      <div class="hero-stats">
        <div class="stat-card">
          <div class="donut" style="--p:${pct}"><span class="num">${items.length ? `${doneCount}/${items.length}` : '–'}</span></div>
          <div><div class="stat-label">Today</div><div class="stat-big num">${items.length ? `${pct}%` : '–'}</div></div>
        </div>
        <div class="stat-card flame" title="Days in a row with at least the sprint and Spanish">
          <span class="chipico" aria-hidden="true">${ICONS.flame}</span>
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
          <h3>${ICONS.calc} Sprint</h3>
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
          <a class="btn block" href="#/sprint" style="margin-top:14px">Play sprint</a>
          <details class="manual">
            <summary>Played on Zetamac? Log it</summary>
            <div class="inputs">
              <input class="field" type="number" name="r1" inputmode="numeric" min="0" max="200" placeholder="Round 1" aria-label="Round 1">
              <input class="field" type="number" name="r2" inputmode="numeric" min="0" max="200" placeholder="Round 2" aria-label="Round 2">
              <button class="btn" type="submit">Save</button>
            </div>
          </details>
        </form>

        <div class="card top-sky tiktok-card">
          <h3>${ICONS.phone} TikTok limit</h3>
          <div class="row"><div class="big num">${fmtMin(st.minutes)}</div><span class="delta">Week ${st.level} of ${st.total}</span></div>
          <div class="steps" aria-hidden="true">${steps}</div>
          <p class="muted small" style="margin:10px 0 0">${st.held ? `At this limit since ${esc(shortDay(st.from))} · ${st.held} day${st.held === 1 ? '' : 's'}` : 'Started today'}</p>

          <div class="tk-log">
            <span class="stat-label">How did yesterday go?</span>
            <div class="chips small two" role="group" aria-label="Yesterday">
              <button type="button" class="chip" data-tk="under" aria-pressed="${tk.logs[yesterday] === 'under'}">Stayed under</button>
              <button type="button" class="chip" data-tk="over" aria-pressed="${tk.logs[yesterday] === 'over'}">Went over</button>
            </div>
            <div class="tk-days" role="group" aria-label="Last 7 days, tap to change">
              ${st.last7
                .map(
                  (d) => `<button type="button" class="tk-day ${d.result ?? 'none'}" data-tkday="${d.date}" aria-label="${esc(shortDay(d.date))}: ${d.result === 'under' ? 'stayed under' : d.result === 'over' ? 'went over' : 'not logged'}"><i></i><small>${'MTWTFSS'[(new Date(`${d.date}T12:00:00Z`).getUTCDay() + 6) % 7]}</small></button>`
                )
                .join('')}
            </div>
            <span class="muted small">Forgot a day? Tap it to set it: under, over, or blank.</span>
          </div>

          ${
            st.offerStep
              ? `<div class="tk-offer">
                  <strong>Ready for week ${st.next.level}: ${fmtMin(st.next.minutes)} a day?</strong>
                  <p class="muted small">${st.under + st.over ? `You stayed under on ${st.under} of the ${st.under + st.over} day${st.under + st.over === 1 ? '' : 's'} you logged this week.` : `You’ve had a week at ${fmtMin(st.minutes)}.`}${st.advice === 'hold' ? ' You went over a few times, so another week here might stick better.' : ''}</p>
                  <p class="muted small">Change it in Screen Time first (Settings → Screen Time → App Limits → TikTok), then tap below.</p>
                  <div class="row-btns">
                    <button class="btn" type="button" data-tkstep="1">I’ve set it to ${fmtMin(st.next.minutes)}</button>
                    <button class="btn secondary" type="button" data-tkhold>Stay another week</button>
                  </div>
                </div>`
              : st.next
                ? `<p class="muted small" style="margin:8px 0 0">Next step, ${fmtMin(st.next.minutes)}, is offered after a week at this level.</p>`
                : '<p class="muted small" style="margin:8px 0 0">Final step. Hold it here.</p>'
          }

          <details class="manual">
            <summary>Change step</summary>
            <div class="row-btns" style="margin-top:10px">
              ${st.next ? `<button class="btn-mini" type="button" data-tkstep="1">Step down now (${fmtMin(st.next.minutes)})</button>` : ''}
              ${st.prev ? `<button class="btn-mini" type="button" data-tkstep="-1">Step back up (${fmtMin(st.prev.minutes)})</button>` : ''}
              <button class="btn-mini" type="button" data-tkrestart>Restart at week 1</button>
            </div>
          </details>
          <div class="note">At work: Spanish accounts only</div>
        </div>

        <div class="card top-gum">
          <h3>${ICONS.calendar} Tomorrow</h3>
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

  // ---- TikTok plan ----
  el.querySelectorAll('[data-tk]').forEach((b) =>
    b.addEventListener('click', async () => {
      await logTiktokDay(yesterday, b.dataset.tk, tk.logs);
      rerender();
    })
  );
  el.querySelectorAll('[data-tkday]').forEach((b) =>
    b.addEventListener('click', async () => {
      const d = b.dataset.tkday;
      const nextResult = { undefined: 'under', under: 'over', over: null }[String(tk.logs[d])];
      if (nextResult) await logTiktokDay(d, nextResult, { ...tk.logs, [d]: undefined });
      else await logTiktokDay(d, tk.logs[d], tk.logs);
      rerender();
    })
  );
  el.querySelectorAll('[data-tkstep]').forEach((b) =>
    b.addEventListener('click', async () => {
      const by = Number(b.dataset.tkstep);
      await stepTiktok(date, by);
      toast(by > 0 ? `Week ${st.level + 1}: ${fmtMin(TIKTOK_LEVELS[st.level])} a day from today` : `Back to ${fmtMin(TIKTOK_LEVELS[st.level - 2])} a day`);
      rerender();
    })
  );
  el.querySelector('[data-tkhold]')?.addEventListener('click', async () => {
    await holdTiktok(date, addDays(date, 7));
    toast(`Staying at ${fmtMin(st.minutes)} for another week`);
    rerender();
  });
  el.querySelector('[data-tkrestart]')?.addEventListener('click', async () => {
    await restartTiktok(date);
    toast('Back to week 1: 6h a day');
    rerender();
  });

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
      if (nowDone && doneCount + 1 === items.length) toast('All missions done. Great day.');
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
