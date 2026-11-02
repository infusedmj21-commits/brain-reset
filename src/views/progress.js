import { doneByDate, live } from '../db.js';
import { addDays, today, weekStart } from '../logic/dates.js';
import { TIKTOK_SCHEDULE, dayCounts, formatMinutes, tiktokLimit } from '../logic/routine.js';

const ALL_DAILY = ['sprint', 'spanish', 'reading'];

export async function renderProgress(el) {
  const date = today();
  const [doneMap, sprints] = await Promise.all([doneByDate(), live('sprint_scores')]);
  const start = addDays(weekStart(date), -21);
  const days = Array.from({ length: 28 }, (_, i) => addDays(start, i));

  const cells = days
    .map((d) => {
      const done = doneMap[d];
      let cls = 'cell';
      if (d > date) cls += ' future';
      else if (dayCounts(done) && ALL_DAILY.every((h) => done.has(h))) cls += ' full';
      else if (dayCounts(done)) cls += ' min';
      if (d === date) cls += ' today';
      return `<div class="${cls}" title="${d}"></div>`;
    })
    .join('');

  const recent = sprints.sort((a, b) => b.date.localeCompare(a.date)).slice(0, 7);
  const best = sprints.reduce((m, s) => Math.max(m, s.best), 0);
  const current = tiktokLimit(date);

  el.innerHTML = `
    <div class="eyebrow">Charts and weekly review arrive in phase 5</div>
    <h1>Progress</h1>

    <h2>Last 4 weeks</h2>
    <div class="card">
      <div class="grid28">
        ${['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d) => `<div class="dow">${d}</div>`).join('')}
        ${cells}
      </div>
      <div class="legend">
        <span><i style="background:var(--accent)"></i>Sprint, Spanish, reading</span>
        <span><i style="background:var(--min-cell)"></i>Minimum</span>
      </div>
    </div>

    <h2>Arithmetic sprint</h2>
    <div class="card">
      ${
        recent.length
          ? `<div class="stat"><span class="muted">All-time best</span><span class="stat-value num">${best}</span></div>
             <table class="num" style="margin-top:8px"><thead><tr><th>Date</th><th>Best</th></tr></thead><tbody>
             ${recent.map((s) => `<tr><td>${s.date}</td><td>${s.best}</td></tr>`).join('')}
             </tbody></table>`
          : '<p class="muted">No scores yet. Log your first sprint on Today.</p>'
      }
    </div>

    <h2>TikTok limit schedule</h2>
    <div class="card">
      <table class="num">
        <thead><tr><th>Week</th><th>From</th><th>Daily limit</th></tr></thead>
        <tbody>
          ${TIKTOK_SCHEDULE.map(
            (s) =>
              `<tr class="${current?.week === s.week ? 'current' : ''}"><td>${s.week}</td><td>${s.start}</td><td>${formatMinutes(s.minutes)}</td></tr>`
          ).join('')}
        </tbody>
      </table>
    </div>`;
}
