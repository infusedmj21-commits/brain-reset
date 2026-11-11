import { doneByDate, firstActiveDate, live } from '../db.js';
import { getCheckin, listGaps, saveReview } from '../data/checkins.js';
import { listPayments, listShifts } from '../data/money.js';
import { listScores, listTasks, listVentures } from '../data/ventures.js';
import { listSets, listWorkouts } from '../data/health.js';
import { addDays, daysBetween, prettyDate, today, weekStart } from '../logic/dates.js';
import { GAP_REASONS, bestStreak, countingDays, missedDays, reviewWeek } from '../logic/review.js';
import { streak } from '../logic/routine.js';
import { formatScore, score } from '../logic/scoring.js';
import { fmtHours, gbp, pennies, shiftPay } from '../logic/money.js';
import { esc, toast } from '../ui.js';

const short = (d) => prettyDate(d).replace(/^(\w{3})\w*/, '$1');
const inRange = (d, a, b) => d >= a && d <= b;
const delta = (now, then, fmt = (x) => x) =>
  then == null || now == null ? '' : now === then ? 'same as the week before' : `${now > then ? '+' : '−'}${fmt(Math.abs(now - then))} on the week before`;

/** Latest score on or before a date, per venture. */
function scoreAsOf(scores, ventureId, date) {
  return scores.filter((s) => s.venture_id === ventureId && s.date <= date).sort((a, b) => b.date.localeCompare(a.date) || b.updated_at.localeCompare(a.updated_at))[0] ?? null;
}

/** Any Monday-to-Sunday week, from its Monday. */
const weekFrom = (start) => ({ id: `review:${start}`, start, end: addDays(start, 6), prevStart: addDays(start, -7) });

function weekLabel(start, current) {
  if (start === current) return 'This week';
  if (start === addDays(current, -7)) return 'Last week';
  return `${short(start).replace(/^\w+ /, '')} – ${short(addDays(start, 6)).replace(/^\w+ /, '')}`;
}

export async function renderReview(el, rerender, ctx) {
  const date = today();
  const current = weekStart(date);
  const due = reviewWeek(date, weekStart);
  // #/review/<monday> shows that week; plain #/review opens last week if it still needs reviewing, else this week.
  const asked = /^\d{4}-\d{2}-\d{2}$/.test(ctx?.params?.[0] ?? '') ? weekStart(ctx.params[0]) : null;
  const dueDone = await getCheckin(due.id);
  const shownStart = asked && asked <= current ? asked : dueDone ? current : due.start;
  const week = weekFrom(shownStart);
  const isCurrent = week.start === current;
  const prevEnd = addDays(week.start, -1);
  // Only days that have happened can count or be missed.
  const lastDay = isCurrent ? date : week.end;
  const lastMissable = isCurrent ? addDays(date, -1) : week.end;
  const [doneMap, first, gaps, saved, shifts, payments, ventures, scores, tasks, workouts, sets, sprints] = await Promise.all([
    doneByDate(),
    firstActiveDate(),
    listGaps(),
    isCurrent ? null : getCheckin(week.id),
    listShifts(),
    listPayments(),
    listVentures(),
    listScores(),
    listTasks(),
    listWorkouts(),
    listSets(),
    live('sprint_scores')
  ]);

  const active = countingDays(doneMap, week.start, lastDay);
  const activePrev = countingDays(doneMap, week.prevStart, prevEnd);
  const daysSoFar = isCurrent ? daysBetween(week.start, date) + 1 : 7;
  const missed = lastMissable >= week.start ? missedDays(doneMap, week.start, lastMissable, gaps, first) : [];
  const monthStart = `${date.slice(0, 7)}-01`;
  const firstShift = shifts.filter((x) => !x.deleted).map((x) => x.date).sort()[0];
  // Arrows go back to the first week with anything logged, and always at least to last week.
  const earliest = [weekStart([first, firstShift].filter(Boolean).sort()[0] ?? date), due.start].sort()[0];

  const worked = pennies(shifts.filter((s) => s.status === 'worked' && inRange(s.date, week.start, week.end)).reduce((t, s) => t + shiftPay(s), 0));
  const workedPrev = pennies(shifts.filter((s) => s.status === 'worked' && inRange(s.date, week.prevStart, prevEnd)).reduce((t, s) => t + shiftPay(s), 0));
  const hours = shifts.filter((s) => s.status === 'worked' && inRange(s.date, week.start, week.end)).reduce((t, s) => t + Number(s.hours || 0), 0);
  const received = pennies(payments.filter((p) => inRange(p.date, week.start, week.end)).reduce((t, p) => t + p.amount, 0));

  const sessions = workouts.filter((w) => w.finished_at && inRange(w.date, week.start, week.end));
  const sessionsPrev = workouts.filter((w) => w.finished_at && inRange(w.date, week.prevStart, prevEnd));
  const workSets = (ws) => sets.filter((s) => s.done && s.type !== 'warmup' && ws.some((w) => w.id === s.workout_id)).length;

  const best = (a, b) => {
    const v = sprints.filter((s) => inRange(s.date, a, b)).map((s) => s.best);
    return v.length ? Math.max(...v) : null;
  };
  const sprintBest = best(week.start, week.end);
  const sprintPrev = best(week.prevStart, prevEnd);

  const tasksDone = tasks.filter((t) => t.done_date && inRange(t.done_date, week.start, week.end));
  const ventureRows = ventures
    .filter((v) => v.status !== 'archived')
    .map((v) => {
      const now = scoreAsOf(scores, v.id, week.end);
      const then = scoreAsOf(scores, v.id, prevEnd);
      return { v, now: now ? score(now) : null, then: then ? score(then) : null, done: tasksDone.filter((t) => t.venture_id === v.id).length };
    });

  el.innerHTML = `
    <a class="back" href="#/home">← Home</a>
    <div class="month-nav week-nav">
      <a class="icon-btn" href="#/review/${addDays(week.start, -7)}" aria-label="Previous week"${week.start <= earliest ? ' aria-disabled="true" tabindex="-1"' : ''}>‹</a>
      <div class="week-head">
        <h1 class="page-title">${esc(weekLabel(week.start, current))}</h1>
        <div class="page-sub">${esc(short(week.start))} – ${esc(short(week.end))}${isCurrent ? ' · so far' : ''}</div>
      </div>
      <a class="icon-btn" href="#/review/${addDays(week.start, 7)}" aria-label="Next week"${isCurrent ? ' aria-disabled="true" tabindex="-1"' : ''}>›</a>
    </div>

    <div class="tiles four" style="margin-top:16px">
      <div class="tile t-mint"><div class="stat-label">Days that counted</div><div class="stat-big num">${active} / ${daysSoFar}</div><div class="tile-note">${esc(delta(active, first && first <= prevEnd ? activePrev : null))}</div></div>
      <div class="tile t-sky"><div class="stat-label">Worked</div><div class="stat-big num">${gbp(worked)}</div><div class="tile-note">${fmtHours(hours)}${received ? ` · ${gbp(received)} paid in` : ''}</div></div>
      <div class="tile t-grape"><div class="stat-label">Gym sessions</div><div class="stat-big num">${sessions.length} / 4</div><div class="tile-note">${[`${workSets(sessions)} working sets`, delta(workSets(sessions), sessionsPrev.length ? workSets(sessionsPrev) : null)].filter(Boolean).map(esc).join(' · ')}</div></div>
      <div class="tile t-sun"><div class="stat-label">Sprint best</div><div class="stat-big num">${sprintBest ?? '–'}</div><div class="tile-note">${esc(delta(sprintBest, sprintPrev))}</div></div>
    </div>

    <div class="layout">
      <section>
        <div class="sec" style="--dot:var(--tomato)"><span class="dot"></span><h2>Missed days</h2><span class="aside">${missed.length}</span></div>
        ${
          missed.length
            ? `<ul class="vlist">${missed
                .map((m) => `<li class="vrow card"><span class="vmain"><strong>${esc(prettyDate(m.date))}</strong></span><span class="vchip ${m.reason ? 'v-sun' : 'v-none'}">${m.reason ? esc(GAP_REASONS[m.reason]) : 'No reason given'}</span></li>`)
                .join('')}</ul>`
            : `<div class="empty-hint">${!first || first > lastDay ? 'Nothing tracked yet this week.' : active === daysSoFar ? 'Every day counted. That’s the whole game.' : 'No missed days yet.'}</div>`
        }

        <div class="sec" style="--dot:var(--mint)"><span class="dot"></span><h2>Ventures</h2><span class="aside">${tasksDone.length} task${tasksDone.length === 1 ? '' : 's'} done</span></div>
        <ul class="vlist">${ventureRows
          .map(
            (r) => `<li><a class="vrow card" href="#/ventures/${encodeURIComponent(r.v.id)}">
              <span class="vmain"><strong>${esc(r.v.name)}</strong><span class="muted small">${r.done} task${r.done === 1 ? '' : 's'} done${r.then != null && r.now != null && r.now !== r.then ? ` · ${r.now > r.then ? '↑' : '↓'} ${Math.abs(r.now - r.then).toFixed(1)}` : ''}</span></span>
              <span class="vscore num">${formatScore(r.now)}</span></a></li>`
          )
          .join('')}</ul>
        <a class="btn block" href="#/ventures" style="margin-top:12px">Rescore ventures</a>
      </section>

      <aside class="side">
        <div class="card top-tomato">
          <div class="stat-row"><span class="muted">Current streak</span><strong class="num">${streak(date, doneMap)} days</strong></div>
          <div class="stat-row"><span class="muted">Best streak</span><strong class="num">${bestStreak(doneMap)} days</strong></div>
          <div class="stat-row"><span class="muted">Days active this month</span><strong class="num">${countingDays(doneMap, monthStart, date)}</strong></div>
        </div>

        ${
          isCurrent
            ? `<div class="card stack"><h3>Review opens Monday</h3><p class="muted small">This week is still going. On Monday it becomes last week and you can pick one thing to change.</p>${
                dueDone ? '' : `<a class="btn secondary block" href="#/review/${due.start}">Review last week now</a>`
              }</div>`
            : `<form class="card top-sun stack" id="review-form">
          <h3>One thing to change ${week.start === due.start ? 'this week' : 'that week'}</h3>
          <textarea class="field" name="note" rows="3" maxlength="280" placeholder="e.g. Book the gym sessions around shifts on Sunday night">${esc(saved?.note ?? '')}</textarea>
          <button class="btn block" type="submit">${saved ? 'Update review' : 'Save review'}</button>
          ${saved ? `<p class="muted small">Reviewed ${esc(prettyDate(saved.updated_at.slice(0, 10)))}.</p>` : ''}
        </form>`
        }
      </aside>
    </div>`;

  el.querySelector('#review-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    await saveReview(week, { note: String(new FormData(e.currentTarget).get('note') ?? '').trim(), active, worked, sessions: sessions.length });
    toast('Week reviewed');
    rerender();
  });
}
