import { addScore, listScores, listTasks, listVentures, saveTask, saveVenture } from '../data/ventures.js';
import { daysBetween, prettyDate, today } from '../logic/dates.js';
import { VERDICTS, formatScore, needsRescore, rankTasks, score, scoreHistory, verdict } from '../logic/scoring.js';
import { esc, toast } from '../ui.js';
import { bindScorer, scorerHTML, verdictChip } from './scorer.js';

function trendText(entry) {
  if (!entry?.latest) return '<span class="muted small">Not scored yet</span>';
  if (!entry.previous) return `<span class="muted small">First score · ${esc(prettyDate(entry.latest.date))}</span>`;
  const d = score(entry.latest) - score(entry.previous);
  if (Math.abs(d) < 0.05) return '<span class="muted small">No change since last score</span>';
  return `<span class="trend ${d > 0 ? 'up' : 'down'} small">${d > 0 ? '↑' : '↓'} ${Math.abs(d).toFixed(1)} since last score</span>`;
}

const ratingsOf = (s) => (s ? { impact: s.impact, urgency: s.urgency, effort: s.effort } : {});

export async function renderVentures(el, rerender, ctx) {
  if (ctx.params[0]) return renderVenture(el, rerender, decodeURIComponent(ctx.params[0]));

  const date = today();
  const [ventures, scores, tasks] = await Promise.all([listVentures(), listScores(), listTasks()]);
  const hist = scoreHistory(scores);
  const active = ventures.filter((v) => v.status !== 'archived');
  const archived = ventures.filter((v) => v.status === 'archived');
  const valueOf = (v) => (hist[v.id]?.latest ? score(hist[v.id].latest) : null);
  const ranked = [...active].sort((a, b) => (valueOf(b) ?? -1) - (valueOf(a) ?? -1));
  const due = active.filter((v) => needsRescore(hist[v.id]?.latest, date, daysBetween));
  const counts = { now: 0, schedule: 0, park: 0, none: 0 };
  for (const v of active) counts[verdict(valueOf(v)) ?? 'none'] += 1;
  const openTasks = (id) => tasks.filter((t) => t.venture_id === id && !t.done_date).length;

  el.innerHTML = `
    <div class="eyebrow">(Impact + Urgency) ÷ Effort</div>
    <h1 class="page-title">Ventures</h1>

    ${
      due.length
        ? `<div class="banner"><strong>Rescore due.</strong> ${due.length === 1 ? `${esc(due[0].name)} hasn’t` : `${due.length} ventures haven’t`} been scored this week. Tap one to rescore.</div>`
        : ''
    }

    <div class="tiles four">
      <div class="tile t-mint"><div class="stat-big num">${counts.now}</div><div class="stat-label">Do it now</div></div>
      <div class="tile t-sun"><div class="stat-big num">${counts.schedule}</div><div class="stat-label">Schedule</div></div>
      <div class="tile t-grape"><div class="stat-big num">${counts.park}</div><div class="stat-label">Parked</div></div>
      <div class="tile t-sky"><div class="stat-big num">${counts.none}</div><div class="stat-label">Unscored</div></div>
    </div>

    <div class="layout">
      <section>
        <div class="sec" style="--dot:var(--mint)"><span class="dot"></span><h2>Ranked</h2></div>
        <ul class="vlist">
          ${ranked
            .map(
              (v) => `<li><a class="vrow card" href="#/ventures/${encodeURIComponent(v.id)}">
                <span class="vmain"><strong>${esc(v.name)}</strong>${trendText(hist[v.id])}
                  <span class="muted small">${openTasks(v.id)} open task${openTasks(v.id) === 1 ? '' : 's'}${due.includes(v) ? ' · rescore due' : ''}</span></span>
                <span class="vside"><span class="vscore num">${formatScore(valueOf(v))}</span>${verdictChip(valueOf(v))}</span>
              </a></li>`
            )
            .join('')}
        </ul>
        <form id="add-venture" class="inputs" style="grid-template-columns:1fr auto;margin-top:14px" autocomplete="off">
          <input class="field" name="name" placeholder="New venture" aria-label="New venture name" maxlength="60" required>
          <button class="btn" type="submit">Add</button>
        </form>
        ${
          archived.length
            ? `<details class="manual" style="margin-top:14px"><summary>Archived (${archived.length})</summary>
                <ul class="plain-list">${archived.map((v) => `<li><a href="#/ventures/${encodeURIComponent(v.id)}">${esc(v.name)}</a></li>`).join('')}</ul></details>`
            : ''
        }
      </section>

      <aside class="side">
        <div class="sec" style="--dot:var(--sun);margin-bottom:0"><span class="dot"></span><h2>Got a new idea?</h2></div>
        <form class="card top-sun stack" id="idea-form" autocomplete="off">
          <p class="muted small">Score it before you chase it.</p>
          <input class="field" name="title" placeholder="The idea or task" aria-label="Idea or task" maxlength="120" required>
          ${scorerHTML('idea')}
          <label class="stack" style="gap:6px"><span class="stat-label">Add it as a task under</span>
            <select class="field" name="venture" aria-label="Venture">
              ${active.map((v) => `<option value="${esc(v.id)}">${esc(v.name)}</option>`).join('')}
            </select>
          </label>
          <button class="btn block" type="submit"${active.length ? '' : ' disabled'}>Add task</button>
        </form>
      </aside>
    </div>`;

  const readIdea = bindScorer(el, 'idea');

  el.querySelector('#add-venture').addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = String(new FormData(e.currentTarget).get('name') ?? '').trim();
    if (!name) return;
    const row = await saveVenture({ name });
    location.hash = `#/ventures/${encodeURIComponent(row.id)}`;
  });

  el.querySelector('#idea-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const title = String(form.get('title') ?? '').trim();
    if (!title) return;
    const ratings = readIdea();
    await saveTask({ title, venture_id: form.get('venture'), ...ratings });
    toast(`Added · ${VERDICTS[verdict(score(ratings))].label}`);
    rerender();
  });
}

async function renderVenture(el, rerender, id) {
  const date = today();
  const [ventures, scores, tasks] = await Promise.all([listVentures(), listScores(), listTasks()]);
  const v = ventures.find((x) => x.id === id);
  if (!v) {
    el.innerHTML = `<a class="back" href="#/ventures">← Ventures</a><p class="muted" style="margin-top:16px">That venture isn’t here any more.</p>`;
    return;
  }
  const entry = scoreHistory(scores)[id];
  const latest = entry?.latest ?? null;
  const open = rankTasks(tasks.filter((t) => t.venture_id === id));
  const done = tasks.filter((t) => t.venture_id === id && t.done_date).sort((a, b) => b.done_date.localeCompare(a.done_date));
  const archived = v.status === 'archived';

  el.innerHTML = `
    <a class="back" href="#/ventures">← Ventures</a>
    <div class="vhead">
      <div>
        <h1 class="page-title">${esc(v.name)}</h1>
        <p class="page-sub">${latest ? `${formatScore(score(latest))} · ${trendText(entry)}` : 'Not scored yet'}</p>
      </div>
      ${verdictChip(latest ? score(latest) : null)}
    </div>

    <div class="layout">
      <section>
        <div class="sec" style="--dot:var(--mint)"><span class="dot"></span><h2>Tasks</h2><span class="aside">${open.length} open</span></div>
        ${
          open.length
            ? `<ul class="vlist">${open
                .map(
                  (t) => `<li class="vrow card">
                    <button type="button" class="tick" data-done="${esc(t.id)}" aria-label="Mark ${esc(t.title)} done"></button>
                    <span class="vmain"><strong>${esc(t.title)}</strong><span class="muted small">(${t.impact} + ${t.urgency}) ÷ ${t.effort}</span></span>
                    <span class="vside"><span class="vscore num">${formatScore(t.value)}</span>${verdictChip(t.value)}</span>
                  </li>`
                )
                .join('')}</ul>`
            : '<div class="empty-hint">No open tasks. Add the next concrete step below.</div>'
        }
        <form class="card stack" id="task-form" autocomplete="off" style="margin-top:14px">
          <h3>Add a task</h3>
          <input class="field" name="title" placeholder="Next concrete step" aria-label="Task" maxlength="120" required>
          ${scorerHTML('task', {}, { compact: true })}
          <button class="btn block" type="submit">Add task</button>
        </form>
        ${
          done.length
            ? `<details class="manual" style="margin-top:14px"><summary>Done (${done.length})</summary>
                <ul class="plain-list">${done.map((t) => `<li>${esc(t.title)} <span class="muted small">· ${esc(prettyDate(t.done_date))}</span></li>`).join('')}</ul></details>`
            : ''
        }
      </section>

      <aside class="side">
        <div class="sec" style="--dot:var(--sun);margin-bottom:0"><span class="dot"></span><h2>${latest ? 'Rescore' : 'Score it'}</h2></div>
        <form class="card top-sun stack" id="score-form">
          <p class="muted small">${latest && !needsRescore(latest, date, daysBetween) ? `Scored ${esc(prettyDate(latest.date))}. Rescore any time things change.` : 'Rate it as things stand this week.'}</p>
          ${scorerHTML('venture', ratingsOf(latest))}
          <button class="btn block" type="submit">Save score</button>
        </form>

        ${
          entry?.history.length
            ? `<div class="card"><h3>History</h3><table class="num" style="margin-top:8px"><thead><tr><th>Date</th><th>Score</th><th>I · U · E</th></tr></thead><tbody>
                ${entry.history.map((s) => `<tr><td>${esc(prettyDate(s.date))}</td><td><strong>${formatScore(score(s))}</strong></td><td class="muted">${s.impact} · ${s.urgency} · ${s.effort}</td></tr>`).join('')}
              </tbody></table></div>`
            : ''
        }

        <form class="card stack" id="edit-form" autocomplete="off">
          <h3>Details</h3>
          <input class="field" name="name" value="${esc(v.name)}" aria-label="Name" maxlength="60" required>
          <input class="field" name="notes" value="${esc(v.notes ?? '')}" placeholder="One-line note" aria-label="Note" maxlength="120">
          <button class="btn secondary block" type="submit">Save details</button>
          <button class="btn secondary block" type="button" id="archive">${archived ? 'Bring back' : 'Archive'}</button>
        </form>
      </aside>
    </div>`;

  const readVenture = bindScorer(el, 'venture');
  const readTask = bindScorer(el, 'task');

  el.querySelector('#score-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const r = readVenture();
    await addScore(id, r, date);
    toast(`Scored ${formatScore(score(r))} · ${VERDICTS[verdict(score(r))].label}`);
    rerender();
  });

  el.querySelector('#task-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const title = String(new FormData(e.currentTarget).get('title') ?? '').trim();
    if (!title) return;
    await saveTask({ title, venture_id: id, ...readTask() });
    rerender();
  });

  el.querySelectorAll('[data-done]').forEach((b) =>
    b.addEventListener('click', async () => {
      const t = tasks.find((x) => x.id === b.dataset.done);
      await saveTask({ ...t, done_date: date });
      toast('Done ✓');
      rerender();
    })
  );

  el.querySelector('#edit-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    await saveVenture({ ...v, name: String(form.get('name')).trim() || v.name, notes: String(form.get('notes') ?? '').trim() });
    toast('Saved');
    rerender();
  });

  el.querySelector('#archive').addEventListener('click', async () => {
    await saveVenture({ ...v, status: archived ? 'active' : 'archived' });
    toast(archived ? 'Back in the list' : 'Archived');
    location.hash = '#/ventures';
  });
}
