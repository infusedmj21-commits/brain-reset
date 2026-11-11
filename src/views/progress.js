import { doneByDate, live } from '../db.js';
import { listGaps } from '../data/checkins.js';
import { GAP_REASONS } from '../logic/review.js';
import { addDays, prettyDate, today, weekStart } from '../logic/dates.js';
import { TIKTOK_SCHEDULE, dayStatus, formatMinutes, sprintSummary, tiktokLimit } from '../logic/routine.js';

export async function renderProgress(el) {
  const date = today();
  const [doneMap, sprints, gaps] = await Promise.all([doneByDate(), live('sprint_scores'), listGaps()]);
  const start = addDays(weekStart(date), -21);
  const days = Array.from({ length: 28 }, (_, i) => addDays(start, i));
  const counted = days.filter((d) => d <= date && dayStatus(doneMap[d]) !== 'none').length;
  const elapsed = days.filter((d) => d <= date).length;

  const cells = days
    .map((d) => {
      const cls = ['cell', d > date ? 'future' : dayStatus(doneMap[d]), d === date ? 'today' : ''].join(' ');
      const gap = gaps.find((g) => g.from <= d && d <= g.to);
      return `<div class="${cls}${gap ? ' away' : ''}" title="${d}${gap ? ` · away: ${GAP_REASONS[gap.reason] ?? ''}` : ''}"></div>`;
    })
    .join('');

  const sprint = sprintSummary(sprints, date, weekStart);
  const history = [...sprints].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 7);
  const current = tiktokLimit(date);

  el.innerHTML = `
    <h1 class="page-title">Progress</h1>
    <a class="btn secondary" href="#/review" style="margin-top:12px;display:inline-block">Weekly review</a>

    <div class="cols">
      <section>
        <div class="sec" style="--dot:var(--mint)"><span class="dot"></span><h2>Last 4 weeks</h2>
          <span class="aside num">${counted} of ${elapsed} days</span></div>
        <div class="card top-mint">
          <div class="grid28">
            ${['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d) => `<div class="dow">${d}</div>`).join('')}
            ${cells}
          </div>
          <div class="legend">
            <span><i style="background:var(--mint)"></i>Sprint, Spanish, reading</span>
            <span><i style="background:var(--sun)"></i>Minimum</span>
            <span><i class="away-key"></i>Away, reason given</span>
          </div>
        </div>

        <div class="sec" style="--dot:var(--tomato)"><span class="dot"></span><h2>Arithmetic sprint</h2></div>
        <div class="card top-sun">
          ${
            history.length
              ? `<div class="stat-row"><div><div class="stat-label">Best ever</div><div class="big num">${sprint.allTimeBest}</div></div>
                 ${sprint.delta != null ? `<span class="delta">${sprint.delta >= 0 ? '+' : ''}${sprint.delta} vs last week</span>` : ''}</div>
                 <table class="num" style="margin-top:12px"><thead><tr><th>Day</th><th>Best</th><th>Rounds</th></tr></thead><tbody>
                 ${history
                   .map((s) => `<tr><td>${prettyDate(s.date)}</td><td><strong>${s.best}</strong></td><td class="muted">${(s.rounds ?? []).join(', ')}</td></tr>`)
                   .join('')}
                 </tbody></table>`
              : '<p class="muted">No scores yet. Log your first sprint on Today.</p>'
          }
        </div>
      </section>

      <section>
        <div class="sec" style="--dot:var(--sky)"><span class="dot"></span><h2>TikTok limit plan</h2></div>
        <div class="card top-sky">
          <table class="num">
            <thead><tr><th>Week</th><th>From</th><th>Daily limit</th></tr></thead>
            <tbody>
              ${TIKTOK_SCHEDULE.map(
                (s) =>
                  `<tr class="${current?.week === s.week ? 'current' : ''}"><td>${s.week}</td><td>${prettyDate(s.start).replace(/^\w+ /, '')}</td><td>${formatMinutes(s.minutes)}</td></tr>`
              ).join('')}
            </tbody>
          </table>
          <p class="note">If X goes over 9 hours a week two weeks running, add it to the limit.</p>
        </div>
      </section>
    </div>`;
}
