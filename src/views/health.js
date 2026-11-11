import {
  TICKS,
  addExercise,
  addSet,
  discardWorkout,
  finishWorkout,
  getMode,
  importHevy,
  lastSetsFor,
  listExercises,
  listRoutines,
  listSets,
  listWorkouts,
  saveSet,
  setMode,
  setTick,
  startWorkout,
  ticksFor
} from '../data/health.js';
import { prettyDate, today } from '../logic/dates.js';
import { DAY_NAMES, RESTART_DATE, aimFor, bests, e1rm, fmtKg, parseHevy, prsFor, weekPlan } from '../logic/health.js';
import { chime, confirmAction, esc, ticker, toast, unlockAudio } from '../ui.js';

const TYPE_LABEL = { normal: '', warmup: 'W', drop: 'D', failure: 'F' };
const TYPE_ORDER = ['normal', 'warmup', 'drop', 'failure'];
const shortDate = (d) => prettyDate(d).replace(/^(\w{3})\w*/, '$1');

export async function renderHealth(el, rerender, ctx) {
  const [sub, id] = ctx.params;
  if (sub === 'workout' && id) return renderWorkout(el, rerender, ctx, decodeURIComponent(id));
  if (sub === 'exercise' && id) return renderExercise(el, decodeURIComponent(id));
  return renderOverview(el, rerender);
}

// ---------- Overview ----------

async function renderOverview(el, rerender) {
  const date = today();
  const [mode, routines, workouts, sets, exercises, ticks] = await Promise.all([getMode(), listRoutines(), listWorkouts(), listSets(), listExercises(), ticksFor(date)]);
  const open = workouts.find((w) => !w.finished_at);
  const { plan, suggest, missed, next, isRestDay } = weekPlan(routines, workouts, date, mode);
  const finished = workouts.filter((w) => w.finished_at).sort((a, b) => b.date.localeCompare(a.date) || b.started_at.localeCompare(a.started_at));
  const since = finished.filter((w) => w.date >= RESTART_DATE);
  const done = sets.filter((s) => s.done);
  const best = bests(done);
  const exName = (eid) => exercises.find((e) => e.id === eid)?.name ?? 'Exercise';
  const lastDone = {};
  for (const s of done) if (!lastDone[s.exercise_id] || s.date > lastDone[s.exercise_id]) lastDone[s.exercise_id] = s.date;
  const trained = Object.keys(lastDone).sort((a, b) => lastDone[b].localeCompare(lastDone[a]));
  const myRoutines = routines.filter((r) => r.mode === mode).sort((a, b) => a.day - b.day);

  let hero;
  if (open) {
    hero = `<div class="card top-tomato stack"><div class="stat-label">In progress · started ${new Date(open.started_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}</div>
      <h3>${esc(open.name)}</h3><a class="btn block" href="#/health/workout/${encodeURIComponent(open.id)}">Resume workout</a></div>`;
  } else if (suggest) {
    const isMissed = missed && suggest.id === missed.routine.id && plan.find((p) => p.routine.id === suggest.id)?.status === 'missed';
    hero = `<div class="card top-mint stack">
      <div class="stat-label">${isMissed ? `Missed ${DAY_NAMES[suggest.day]} · catch it up today` : 'Today'}</div>
      <h3>${esc(suggest.name)}</h3>
      <p class="muted small">${suggest.items.length} exercises · ${mode === 'home' ? 'home version' : 'gym'}</p>
      <button class="btn block" type="button" data-start="${esc(suggest.id)}">Start workout</button></div>`;
  } else {
    hero = `<div class="card top-sky stack"><div class="stat-label">${isRestDay ? 'Rest day' : 'All done this week'}</div>
      <h3>${next ? `Next: ${DAY_NAMES[next.routine.day]} · ${esc(next.routine.name)}` : 'Week complete'}</h3>
      <p class="muted small">Recovery is part of the plan.</p></div>`;
  }

  el.innerHTML = `
    <div class="vhead">
      <div><div class="eyebrow">Goal: aesthetics</div><h1 class="page-title">Health</h1></div>
      <div class="chips small two mode-switch" role="group" aria-label="Where you train">
        <button type="button" class="chip" data-mode="home" aria-pressed="${mode === 'home'}">Home</button>
        <button type="button" class="chip" data-mode="gym" aria-pressed="${mode === 'gym'}">Gym</button>
      </div>
    </div>

    <div class="layout" style="margin-top:18px">
      <section>
        ${hero}

        <div class="sec" style="--dot:var(--mint)"><span class="dot"></span><h2>This week</h2></div>
        <div class="tiles four">
          ${plan
            .map(
              (p) => `<div class="tile ${p.status === 'done' ? 't-mint' : p.status === 'today' ? 't-grape' : p.status === 'missed' ? 't-tomato' : ''}">
                <div class="stat-label">${DAY_NAMES[p.routine.day]}</div>
                <div class="stat-big" style="font-size:17px">${esc(p.routine.name.replace(' + Abs', ''))}</div>
                <div class="tile-note">${{ done: 'Done ✓', today: 'Today', missed: 'Missed', later: '' }[p.status]}</div></div>`
            )
            .join('')}
        </div>

        <div class="sec" style="--dot:var(--grape)"><span class="dot"></span><h2>Train something else</h2></div>
        <div class="chips small two">
          ${myRoutines.map((r) => `<button type="button" class="chip" data-start="${esc(r.id)}"${open ? ' disabled' : ''}>${esc(r.name)}</button>`).join('')}
        </div>

        <div class="sec" style="--dot:var(--sky)"><span class="dot"></span><h2>Exercises</h2><span class="aside">${trained.length} trained</span></div>
        ${
          trained.length
            ? `<ul class="vlist">${trained
                .slice(0, 20)
                .map((eid) => {
                  const b = best[eid];
                  return `<li><a class="vrow card" href="#/health/exercise/${encodeURIComponent(eid)}">
                    <span class="vmain"><strong>${esc(exName(eid))}</strong><span class="muted small">Last ${esc(shortDate(lastDone[eid]))}</span></span>
                    <span class="vside"><span class="vscore num">${b.weight ? fmtKg(b.weight) : `${b.reps} reps`}</span><span class="muted small">${b.e1rm ? `1RM ≈ ${fmtKg(Math.round(b.e1rm * 2) / 2)}` : 'best set'}</span></span>
                  </a></li>`;
                })
                .join('')}</ul>`
            : '<div class="empty-hint">Finish a workout or import from Hevy, and your exercises show up here with their bests.</div>'
        }
      </section>

      <aside class="side">
        <div class="card top-sun stack">
          <h3>Today</h3>
          <div class="chips small two">
            ${Object.entries(TICKS).map(([k, label]) => `<button type="button" class="chip" data-tick="${k}" aria-pressed="${ticks[k]}">${ticks[k] ? '✓ ' : ''}${label}</button>`).join('')}
          </div>
        </div>

        <div class="card top-grape">
          <div class="stat-label">Since you restarted · ${esc(shortDate(RESTART_DATE))}</div>
          <div class="stat-big num" style="margin-top:4px">${since.length} session${since.length === 1 ? '' : 's'}</div>
          <p class="muted small" style="margin:4px 0 0">${done.filter((s) => s.date >= RESTART_DATE && s.type !== 'warmup').length} working sets logged</p>
        </div>

        ${
          finished.length
            ? `<div class="card"><h3>Recent workouts</h3><table class="num" style="margin-top:6px"><tbody>
                ${finished
                  .slice(0, 6)
                  .map((w) => {
                    const ws = done.filter((s) => s.workout_id === w.id);
                    const vol = ws.reduce((t, s) => t + (s.weight || 0) * (s.reps || 0), 0);
                    return `<tr><td>${esc(shortDate(w.date))}</td><td>${esc(w.name)}</td><td class="muted">${ws.length} sets${vol ? ` · ${Math.round(vol).toLocaleString('en-GB')} kg` : ''}</td></tr>`;
                  })
                  .join('')}</tbody></table></div>`
            : ''
        }

        <form class="card stack" id="hevy-form">
          <h3>Import from Hevy</h3>
          <p class="muted small">In Hevy: Settings → Export &amp; import data → Export workouts (CSV). Importing twice is safe.</p>
          <label class="btn secondary block">Choose Hevy CSV<input type="file" accept=".csv,text/csv" hidden></label>
        </form>
      </aside>
    </div>`;

  el.querySelectorAll('[data-mode]').forEach((b) =>
    b.addEventListener('click', async () => {
      await setMode(b.dataset.mode);
      rerender();
    })
  );
  el.querySelectorAll('[data-tick]').forEach((b) =>
    b.addEventListener('click', async () => {
      await setTick(date, b.dataset.tick, !ticks[b.dataset.tick]);
      rerender();
    })
  );
  el.querySelectorAll('[data-start]').forEach((b) =>
    b.addEventListener('click', async () => {
      unlockAudio();
      const routine = routines.find((r) => r.id === b.dataset.start);
      const w = await startWorkout(routine, date);
      location.hash = `#/health/workout/${encodeURIComponent(w.id)}`;
    })
  );
  el.querySelector('#hevy-form input[type=file]').addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const { workoutsAdded, setsAdded } = await importHevy(parseHevy(await file.text()));
      toast(workoutsAdded ? `Imported ${workoutsAdded} workouts, ${setsAdded} sets` : 'Nothing new in that file');
      rerender();
    } catch (err) {
      toast(err.message || 'Could not read that file');
    }
  });
}

// ---------- Live workout ----------

const REST_KEY = 'artemis-rest-seconds';
const restDefault = () => {
  try {
    return Number(localStorage.getItem(REST_KEY)) || 90;
  } catch {
    return 90;
  }
};
let restEnd = null; // timestamp, survives re-renders within the workout

async function renderWorkout(el, rerender, ctx, id) {
  const [workouts, allSets, exercises] = await Promise.all([listWorkouts(), listSets(), listExercises()]);
  const w = workouts.find((x) => x.id === id);
  if (!w) {
    el.innerHTML = '<a class="back" href="#/health">← Health</a><p class="muted">That workout isn’t here any more.</p>';
    return;
  }
  const sets = allSets.filter((s) => s.workout_id === id).sort((a, b) => a.order - b.order || a.set_no - b.set_no);
  const before = bests(allSets.filter((s) => s.workout_id !== id && s.done));
  const ex = (eid) => exercises.find((e) => e.id === eid) ?? { name: 'Exercise', bodyweight: false };
  const groups = [];
  for (const s of sets) {
    let g = groups.find((x) => x.exercise_id === s.exercise_id);
    if (!g) groups.push((g = { exercise_id: s.exercise_id, sets: [] }));
    g.sets.push(s);
  }
  const readOnly = Boolean(w.finished_at);
  document.body.classList.add('focus-mode');
  ctx.onCleanup(() => document.body.classList.remove('focus-mode'));

  el.innerHTML = `
    <div class="workout-head">
      <a class="back" href="#/health" style="margin:0">← Health</a>
      <span class="num muted" id="elapsed"></span>
    </div>
    <h1 class="page-title">${esc(w.name)}</h1>
    <p class="page-sub">${esc(prettyDate(w.date))}${w.mode ? ` · ${w.mode}` : ''}</p>

    <div class="stack-lg" style="margin-top:18px">
      ${groups
        .map((g) => {
          const e = ex(g.exercise_id);
          const last = lastSetsFor(g.exercise_id, workouts, allSets, id);
          const aim = aimFor(last?.sets, g.sets[0].reps_target, e.bodyweight);
          return `<section class="card ex-card" data-ex="${esc(g.exercise_id)}">
            <div class="ex-top"><a href="#/health/exercise/${encodeURIComponent(g.exercise_id)}"><h3>${esc(e.name)}</h3></a>
              <span class="muted small">${esc(g.sets[0].reps_target ?? '')} reps</span></div>
            <p class="aim aim-${aim.kind}">${esc(aim.text)}</p>
            <div class="set-grid set-head"><span>Set</span><span>Last</span><span>kg</span><span>Reps</span><span></span></div>
            ${g.sets
              .map((s) => {
                const prev = last?.sets.find((x) => x.set_no === s.set_no);
                const n = g.sets.filter((x) => x.type !== 'warmup' && x.set_no <= s.set_no).length;
                return `<div class="set-grid set-row${s.done ? ' done' : ''}" data-set="${esc(s.id)}">
                  <button type="button" class="set-type t-${s.type}" data-type aria-label="Set type: ${s.type}">${TYPE_LABEL[s.type] || n}</button>
                  <button type="button" class="prev" data-prev ${prev ? '' : 'disabled'}>${prev ? `${prev.weight ? `${Number(prev.weight)}×` : 'BW×'}${prev.reps}` : '–'}</button>
                  <input class="field" type="number" inputmode="decimal" step="0.25" min="0" data-weight value="${s.weight || ''}" placeholder="${e.bodyweight ? 'BW' : 'kg'}" aria-label="Weight in kg"${readOnly ? ' disabled' : ''}>
                  <input class="field" type="number" inputmode="numeric" min="0" max="200" data-reps value="${s.reps ?? ''}" placeholder="${esc(String(aim.low))}" aria-label="Reps"${readOnly ? ' disabled' : ''}>
                  <button type="button" class="set-done" data-done aria-pressed="${s.done}" aria-label="${s.done ? 'Undo set' : 'Set done'}"${readOnly ? ' disabled' : ''}>✓</button>
                  <span class="pr-badge" data-pr></span>
                </div>`;
              })
              .join('')}
            ${readOnly ? '' : `<button type="button" class="btn-mini" data-addset="${esc(g.exercise_id)}" data-target="${esc(g.sets[0].reps_target ?? '')}">+ Add set</button>`}
          </section>`;
        })
        .join('')}

      ${
        readOnly
          ? ''
          : `<form class="card stack" id="add-ex" autocomplete="off">
              <h3>Add an exercise</h3>
              <input class="field" name="name" list="ex-list" placeholder="Search or type a new one" aria-label="Exercise" required>
              <datalist id="ex-list">${exercises.map((e) => `<option value="${esc(e.name)}"></option>`).join('')}</datalist>
              <button class="btn secondary block" type="submit">Add exercise</button>
            </form>
            <div class="row-btns"><button class="btn" type="button" id="finish">Finish workout</button><button class="btn secondary" type="button" id="discard">Discard</button></div>`
      }
    </div>

    <div class="rest-bar" id="rest" hidden>
      <button type="button" class="btn-mini" data-rest="-15">−15</button>
      <div class="rest-time"><span class="stat-label">Rest</span><strong class="num" id="rest-left">1:30</strong></div>
      <button type="button" class="btn-mini" data-rest="15">+15</button>
      <button type="button" class="btn-mini" data-rest="skip">Skip</button>
    </div>`;

  // ---- Timers ----
  const started = new Date(w.started_at).getTime();
  const restBar = el.querySelector('#rest');
  const restLeft = el.querySelector('#rest-left');
  const fmt = (sec) => `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
  ticker(() => {
    const end = w.finished_at ? new Date(w.finished_at).getTime() : Date.now();
    el.querySelector('#elapsed').textContent = fmt(Math.max(0, Math.round((end - started) / 1000)));
    if (restEnd) {
      const left = Math.round((restEnd - Date.now()) / 1000);
      if (left <= 0) {
        restEnd = null;
        restBar.hidden = true;
        chime();
      } else {
        restBar.hidden = false;
        restLeft.textContent = fmt(left);
      }
    } else restBar.hidden = true;
  }, ctx);
  el.querySelectorAll('[data-rest]').forEach((b) =>
    b.addEventListener('click', () => {
      const v = b.dataset.rest;
      if (v === 'skip') restEnd = null;
      else if (restEnd) {
        restEnd += Number(v) * 1000;
        try {
          localStorage.setItem(REST_KEY, String(Math.max(15, restDefault() + Number(v))));
        } catch {
          /* ignore */
        }
      }
    })
  );

  if (readOnly) return;

  // ---- Sets: saved in place, no re-render, so typing is never interrupted ----
  const byId = new Map(sets.map((s) => [s.id, s]));
  const read = (row) => {
    const s = byId.get(row.dataset.set);
    const weight = Number(row.querySelector('[data-weight]').value) || 0;
    const repsRaw = row.querySelector('[data-reps]').value;
    return { ...s, weight, reps: repsRaw === '' ? null : Number(repsRaw) };
  };
  const persist = async (row, extra = {}) => {
    const next = await saveSet({ ...read(row), ...extra });
    byId.set(next.id, next);
    return next;
  };

  el.querySelectorAll('.set-row').forEach((row) => {
    row.querySelectorAll('input').forEach((i) => i.addEventListener('change', () => persist(row)));
    row.querySelector('[data-prev]').addEventListener('click', () => {
      const [wt, reps] = row.querySelector('[data-prev]').textContent.split('×');
      row.querySelector('[data-weight]').value = wt === 'BW' ? '' : wt;
      row.querySelector('[data-reps]').value = reps;
      persist(row);
    });
    // Keep a reference to the button: event.currentTarget is null after an await.
    const typeBtn = row.querySelector('[data-type]');
    typeBtn.addEventListener('click', async () => {
      const s = byId.get(row.dataset.set);
      const type = TYPE_ORDER[(TYPE_ORDER.indexOf(s.type) + 1) % TYPE_ORDER.length];
      typeBtn.className = `set-type t-${type}`;
      typeBtn.textContent = TYPE_LABEL[type] || s.set_no;
      await persist(row, { type });
    });
    const doneBtn = row.querySelector('[data-done]');
    doneBtn.addEventListener('click', async () => {
      const s = byId.get(row.dataset.set);
      const now = !s.done;
      const repsInput = row.querySelector('[data-reps]');
      if (now && repsInput.value === '') repsInput.value = repsInput.placeholder;
      const saved = await persist(row, { done: now });
      row.classList.toggle('done', now);
      doneBtn.setAttribute('aria-pressed', String(now));
      doneBtn.setAttribute('aria-label', now ? 'Undo set' : 'Set done');
      const prs = now ? prsFor(saved, before[saved.exercise_id]) : [];
      row.querySelector('[data-pr]').textContent = prs.length ? `PR · ${prs.join(', ')}` : '';
      if (prs.length) toast(`New PR · ${prs.join(', ')}`);
      if (now && saved.type !== 'warmup') restEnd = Date.now() + restDefault() * 1000;
    });
  });

  el.querySelectorAll('[data-addset]').forEach((b) =>
    b.addEventListener('click', async () => {
      await addSet(w, b.dataset.addset, b.dataset.target);
      rerender();
    })
  );

  el.querySelector('#add-ex').addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = String(new FormData(e.currentTarget).get('name') ?? '').trim();
    if (!name) return;
    const exRow = exercises.find((x) => x.name.toLowerCase() === name.toLowerCase()) ?? (await addExercise(name));
    await addSet(w, exRow.id, '8-12');
    rerender();
  });

  el.querySelector('#finish').addEventListener('click', async () => {
    const doneSets = [...byId.values()].filter((s) => s.done);
    if (!doneSets.length && !confirmAction('No sets ticked. Finish anyway? Nothing will be saved.')) return;
    if (!doneSets.length) {
      await discardWorkout(w);
      location.hash = '#/health';
      return;
    }
    await finishWorkout(w);
    restEnd = null;
    const vol = doneSets.reduce((t, s) => t + (s.weight || 0) * (s.reps || 0), 0);
    toast(`Done · ${doneSets.length} sets${vol ? ` · ${Math.round(vol).toLocaleString('en-GB')} kg moved` : ''}`);
    location.hash = '#/health';
  });
  el.querySelector('#discard').addEventListener('click', async () => {
    if (!confirmAction('Discard this workout? Its sets will be deleted.')) return;
    await discardWorkout(w);
    restEnd = null;
    location.hash = '#/health';
  });
}

// ---------- Exercise history ----------

async function renderExercise(el, id) {
  const [workouts, sets, exercises] = await Promise.all([listWorkouts(), listSets(), listExercises()]);
  const e = exercises.find((x) => x.id === id) ?? { name: 'Exercise' };
  const mine = sets.filter((s) => s.exercise_id === id && s.done);
  const byWorkout = new Map();
  for (const s of mine) (byWorkout.get(s.workout_id) ?? byWorkout.set(s.workout_id, []).get(s.workout_id)).push(s);
  const sessions = [...byWorkout.entries()]
    .map(([wid, ss]) => ({ w: workouts.find((x) => x.id === wid), sets: ss.sort((a, b) => a.set_no - b.set_no) }))
    .filter((x) => x.w?.finished_at)
    .sort((a, b) => a.w.date.localeCompare(b.w.date));
  const b = bests(mine)[id];
  const metric = (ss) => (b?.e1rm ? Math.max(...ss.map((s) => e1rm(s.weight || 0, s.reps))) : Math.max(...ss.map((s) => s.reps)));
  const points = sessions.slice(-12).map((x) => ({ date: x.w.date, v: metric(x.sets.filter((s) => s.type !== 'warmup')) || 0 }));
  const max = Math.max(1, ...points.map((p) => p.v));

  el.innerHTML = `
    <a class="back" href="#/health">← Health</a>
    <h1 class="page-title">${esc(e.name)}</h1>
    <p class="page-sub">${sessions.length} session${sessions.length === 1 ? '' : 's'}${e.muscle ? ` · ${esc(e.muscle)}` : ''}</p>

    ${
      b
        ? `<div class="tiles three" style="margin-top:16px">
            <div class="tile t-mint"><div class="stat-label">Heaviest</div><div class="stat-big num">${fmtKg(b.weight)}</div></div>
            <div class="tile t-sky"><div class="stat-label">Best 1RM est.</div><div class="stat-big num">${b.e1rm ? fmtKg(Math.round(b.e1rm * 2) / 2) : '–'}</div></div>
            <div class="tile t-sun"><div class="stat-label">Most reps</div><div class="stat-big num">${b.reps}</div></div>
          </div>`
        : '<div class="empty-hint" style="margin-top:16px">No finished sets yet.</div>'
    }

    ${
      points.length > 1
        ? `<div class="sec" style="--dot:var(--grape)"><span class="dot"></span><h2>${b?.e1rm ? 'Estimated 1RM' : 'Best set (reps)'} per session</h2></div>
          <div class="card"><div class="bars tall" role="img" aria-label="Progress over the last ${points.length} sessions">
            ${points.map((p, i) => `<i class="${i === points.length - 1 ? 'now' : ''}" style="height:${Math.max(8, Math.round((p.v / max) * 100))}%" title="${p.date}: ${p.v.toFixed(1)}"></i>`).join('')}
          </div></div>`
        : ''
    }

    <div class="sec" style="--dot:var(--sky)"><span class="dot"></span><h2>History</h2></div>
    <div class="card"><table class="num"><tbody>
      ${[...sessions]
        .reverse()
        .map(
          (x) => `<tr><td>${esc(shortDate(x.w.date))}</td><td>${x.sets
            .map((s) => `${s.type === 'warmup' ? '<span class="muted">W </span>' : ''}${s.weight ? `${Number(s.weight)}×` : ''}${s.reps}`)
            .join(', ')}</td></tr>`
        )
        .join('') || '<tr><td class="muted">Nothing logged yet.</td></tr>'}
    </tbody></table></div>`;
}
