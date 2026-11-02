import { getMeta, getRow, live, logRound, setMeta } from '../db.js';
import { prettyDate, today } from '../logic/dates.js';
import { DEFAULT_SETTINGS, DURATIONS, OPS, cleanSettings, describeSettings, isStandard, makeProblem, roundStats } from '../logic/arithmetic.js';
import { chime, esc, toast, unlockAudio } from '../ui.js';

const SETTINGS_KEY = 'sprint_settings';
const durationLabel = (s) => (s >= 60 ? `${s / 60} min` : `${s} s`);
const secs = (ms) => (ms == null ? '–' : `${(ms / 1000).toFixed(1)} s`);

export async function renderSprint(el, rerender, ctx) {
  const [section, id] = ctx.params;
  if (section === 'result') {
    const round = await getRow('sprint_rounds', id);
    if (!round) return (location.hash = '#/sprint');
    return renderResults(el, rerender, ctx, round, await context(round.date), { saved: true });
  }
  return renderSetup(el, rerender, ctx);
}

/** Today's rounds and the best standard score before now, for comparisons. */
async function context(date) {
  const rounds = (await live('sprint_rounds')).sort((a, b) => (a.finished_at ?? '').localeCompare(b.finished_at ?? ''));
  const sprints = await live('sprint_scores');
  return { rounds, todayRounds: rounds.filter((r) => r.date === date), sprints };
}

// ---------------------------------------------------------------- Setup

async function renderSetup(el, rerender, ctx) {
  const date = today();
  const { settings } = cleanSettings((await getMeta(SETTINGS_KEY)) ?? {});
  const { todayRounds, sprints } = await context(date);
  const standardToday = todayRounds.filter((r) => r.standard);
  const bestToday = standardToday.length ? Math.max(...standardToday.map((r) => r.score)) : null;
  const allTimeBest = sprints.length ? Math.max(...sprints.map((s) => s.best)) : null;
  const nextRound = standardToday.length + 1;

  const range = (key, i) =>
    `<input class="field range" type="number" inputmode="numeric" min="0" max="9999" name="${key}${i}" value="${settings[key][i]}" aria-label="${key} ${i === 0 ? 'from' : 'to'}">`;

  el.innerHTML = `
    <section class="hero">
      <div>
        <div class="eyebrow">Arithmetic</div>
        <h1 class="page-title">Sprint</h1>
        <p class="page-sub">Type the answer and it moves on by itself, no Enter needed. Two rounds a day.</p>
      </div>
      <div class="hero-stats">
        <div class="stat-card flame"><span class="emoji" aria-hidden="true">🧮</span><div><div class="stat-label">Best today</div><div class="stat-big num">${bestToday ?? '–'}</div></div></div>
        <div class="stat-card"><span class="emoji" aria-hidden="true" style="font-size:26px">🏆</span><div><div class="stat-label">Best ever</div><div class="stat-big num">${allTimeBest ?? '–'}</div></div></div>
      </div>
    </section>

    <div class="layout">
      <section>
        <div class="sec" style="--dot:var(--tomato)"><span class="dot"></span><h2>Settings</h2></div>
        <form class="card top-tomato stack" id="settings-form" autocomplete="off" novalidate>
          <div class="op-row">
            <label class="op-check"><input type="checkbox" name="add" ${settings.add ? 'checked' : ''}><span>Addition</span></label>
            <div class="op-range" data-for="add">Range: <span class="grp">( ${range('addA', 0)} to ${range('addA', 1)} )</span> + <span class="grp">( ${range('addB', 0)} to ${range('addB', 1)} )</span></div>
          </div>
          <div class="op-row">
            <label class="op-check"><input type="checkbox" name="sub" ${settings.sub ? 'checked' : ''}><span>Subtraction</span></label>
            <div class="op-range muted">Addition problems in reverse.</div>
          </div>
          <div class="op-row">
            <label class="op-check"><input type="checkbox" name="mul" ${settings.mul ? 'checked' : ''}><span>Multiplication</span></label>
            <div class="op-range" data-for="mul">Range: <span class="grp">( ${range('mulA', 0)} to ${range('mulA', 1)} )</span> × <span class="grp">( ${range('mulB', 0)} to ${range('mulB', 1)} )</span></div>
          </div>
          <div class="op-row">
            <label class="op-check"><input type="checkbox" name="div" ${settings.div ? 'checked' : ''}><span>Division</span></label>
            <div class="op-range muted">Multiplication problems in reverse.</div>
          </div>
          <div class="label">Duration</div>
          <div class="chips small duration-chips" role="group" aria-label="Duration">
            ${DURATIONS.map((d) => `<button type="button" class="chip" data-duration="${d}" aria-pressed="${settings.duration === d}">${durationLabel(d)}</button>`).join('')}
          </div>
          <div class="standard-note" data-standard></div>
          <button class="btn block big-btn" type="submit" id="start">Start</button>
        </form>
      </section>

      <aside class="side">
        <div class="sec" style="--dot:var(--sun);margin-bottom:0"><span class="dot"></span><h2>Today’s rounds</h2></div>
        ${
          todayRounds.length
            ? `<ul class="plain-list">${[...todayRounds]
                .reverse()
                .map(
                  (r, i) => `<li><a class="card list-card" href="#/sprint/result/${r.id}"><div class="stat-row">
                    <div><h3>Round ${todayRounds.length - i}</h3><p class="muted small" style="margin:2px 0 0">${r.standard ? 'Standard settings' : 'Custom · practice only'} · ${secs(r.stats?.avgMs)} per answer</p></div>
                    <span class="big num" style="font-size:34px">${r.score}</span></div></a></li>`
                )
                .join('')}</ul>`
            : '<div class="empty-hint">No rounds yet today. Two rounds on the standard settings is the daily goal.</div>'
        }
        <div class="card top-grape">
          <h3>⌨️ Tips</h3>
          <ul class="tips">
            <li>On a computer, just type. On a phone the number pad opens by itself.</li>
            <li>Wrong answers don’t cost anything; fix the digits and keep going.</li>
            <li>Only standard-settings rounds count towards your sprint score, so scores stay comparable over time.</li>
          </ul>
        </div>
      </aside>
    </div>`;

  const form = el.querySelector('#settings-form');
  const note = el.querySelector('[data-standard]');
  const startBtn = el.querySelector('#start');
  let current = settings;

  const read = () => {
    const f = form.elements;
    const raw = {
      add: f.add.checked,
      sub: f.sub.checked,
      mul: f.mul.checked,
      div: f.div.checked,
      addA: [f.addA0.value, f.addA1.value],
      addB: [f.addB0.value, f.addB1.value],
      mulA: [f.mulA0.value, f.mulA1.value],
      mulB: [f.mulB0.value, f.mulB1.value],
      duration: current.duration
    };
    return cleanSettings(raw);
  };

  const refresh = () => {
    const { settings: s, errors } = read();
    current = s;
    form.querySelector('[data-for="add"]').classList.toggle('off', !s.add && !s.sub);
    form.querySelector('[data-for="mul"]').classList.toggle('off', !s.mul && !s.div);
    const std = isStandard(s);
    note.className = `standard-note ${std ? 'ok' : 'custom'}`;
    note.innerHTML = errors.length
      ? `⚠️ ${esc(errors[0])}`
      : std
        ? `✓ Zetamac defaults: this counts towards your sprint score.`
        : `✏️ Custom settings: practice only, won’t change your sprint score. <button type="button" class="link-inline" id="reset">Reset to defaults</button>`;
    note.querySelector('#reset')?.addEventListener('click', async () => {
      await setMeta(SETTINGS_KEY, { ...DEFAULT_SETTINGS });
      rerender();
    });
    startBtn.disabled = errors.length > 0;
    startBtn.textContent = std ? `Start round ${nextRound} · ${durationLabel(s.duration)}` : `Start practice · ${durationLabel(s.duration)}`;
    if (!errors.length) setMeta(SETTINGS_KEY, s);
  };

  form.addEventListener('input', refresh);
  form.addEventListener('change', refresh);
  form.querySelectorAll('[data-duration]').forEach((b) =>
    b.addEventListener('click', () => {
      current = { ...current, duration: Number(b.dataset.duration) };
      form.querySelectorAll('[data-duration]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
      refresh();
    })
  );
  refresh();

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const { settings: s, errors } = read();
    if (errors.length) return toast(errors[0]);
    // Start synchronously inside the tap so the phone keyboard is allowed to open.
    playRound(el, rerender, ctx, s);
  });
}

// ---------------------------------------------------------------- Game

function playRound(el, rerender, ctx, settings) {
  unlockAudio();
  const standard = isStandard(settings);
  const startedAt = Date.now();
  const endAt = startedAt + settings.duration * 1000;
  const solved = [];
  let problem = makeProblem(settings);
  let shownAt = Date.now();
  let finished = false;

  document.body.classList.add('focus-mode');
  ctx.onCleanup(() => document.body.classList.remove('focus-mode'));

  el.innerHTML = `
    <div class="game">
      <div class="game-bar">
        <span class="game-pill num" id="time">Seconds left: ${settings.duration}</span>
        <span class="game-pill num" id="score">Score: 0</span>
        <button type="button" class="btn-mini" id="quit">Quit</button>
      </div>
      <div class="game-board card top-tomato">
        <div class="problem num" id="problem" aria-live="polite">${esc(problem.text)} =</div>
        <input class="answer num" id="answer" type="text" inputmode="numeric" pattern="[0-9]*" autocomplete="off"
          autocorrect="off" spellcheck="false" enterkeyhint="done" aria-label="Answer">
        <div class="game-progress"><i id="bar"></i></div>
      </div>
      ${standard ? '' : '<p class="muted small" style="text-align:center">Custom settings · practice round</p>'}
    </div>`;

  const input = el.querySelector('#answer');
  const problemEl = el.querySelector('#problem');
  const timeEl = el.querySelector('#time');
  const scoreEl = el.querySelector('#score');
  const bar = el.querySelector('#bar');
  input.focus();

  input.addEventListener('input', () => {
    if (finished) return;
    const digits = input.value.replace(/[^0-9]/g, '');
    if (digits !== input.value) input.value = digits;
    if (digits === String(problem.answer)) {
      const now = Date.now();
      solved.push({ op: problem.op, text: problem.text, answer: problem.answer, ms: now - shownAt });
      problem = makeProblem(settings, Math.random, problem);
      shownAt = now;
      input.value = '';
      problemEl.textContent = `${problem.text} =`;
      scoreEl.textContent = `Score: ${solved.length}`;
      problemEl.classList.remove('pop');
      void problemEl.offsetWidth; // restart the little pop animation
      problemEl.classList.add('pop');
    }
  });
  // Keep focus in the answer box (tapping elsewhere shouldn't hide the keyboard mid-round).
  el.querySelector('.game-board').addEventListener('click', () => input.focus());

  const finish = async (quit = false) => {
    if (finished) return;
    finished = true;
    clearInterval(timer);
    document.body.classList.remove('focus-mode');
    input.blur();
    if (quit) return rerender();
    chime();
    const date = today();
    const before = await context(date);
    const round = await logRound(date, {
      score: solved.length,
      standard,
      settings,
      duration: settings.duration,
      problems: solved,
      stats: roundStats(solved),
      started_at: new Date(startedAt).toISOString(),
      finished_at: new Date().toISOString()
    });
    renderResults(el, rerender, ctx, round, before, { saved: false });
  };

  const tick = () => {
    const left = Math.max(0, Math.ceil((endAt - Date.now()) / 1000));
    timeEl.textContent = `Seconds left: ${left}`;
    timeEl.classList.toggle('hurry', left <= 10);
    bar.style.width = `${Math.min(100, ((Date.now() - startedAt) / (endAt - startedAt)) * 100)}%`;
    if (left <= 0) finish();
  };
  const timer = setInterval(tick, 200);
  ctx.onCleanup(() => clearInterval(timer));
  tick();

  el.querySelector('#quit').addEventListener('click', () => finish(true));
}

// ---------------------------------------------------------------- Results

function renderResults(el, rerender, ctx, round, before, { saved }) {
  const stats = round.stats ?? roundStats(round.problems ?? []);
  const date = round.date;
  const earlierStandard = before.rounds.filter((r) => r.standard && r.id !== round.id && (r.finished_at ?? '') < (round.finished_at ?? ''));
  const prevBest = Math.max(
    -Infinity,
    ...earlierStandard.map((r) => r.score),
    ...before.sprints.filter((s) => s.date < date).map((s) => s.best)
  );
  const isNewBest = round.standard && round.score > 0 && round.score > prevBest && prevBest !== -Infinity;
  const todayStandard = before.rounds.filter((r) => r.standard && r.date === date && r.id !== round.id).length + (round.standard ? 1 : 0);
  const roundNo = before.todayRounds.filter((r) => r.id !== round.id && (r.finished_at ?? '') < (round.finished_at ?? '')).length + 1;

  const opsRows = Object.entries(stats.byOp)
    .map(([op, v]) => `<tr><td>${OPS[op].symbol} ${OPS[op].label}</td><td class="num">${v.count}</td><td class="num">${secs(v.avgMs)}</td></tr>`)
    .join('');

  const primary =
    !saved && round.standard && todayStandard === 1
      ? 'Round 2'
      : 'Play again';

  el.innerHTML = `
    ${saved ? '<a class="back" href="#/sprint">← Sprint</a>' : ''}
    <div class="eyebrow">${esc(prettyDate(date))} · ${round.standard ? `Round ${roundNo}` : 'Practice round'} · ${esc(describeSettings(round.settings))}</div>
    <h1 class="page-title result-score num">${round.score}</h1>
    <p class="page-sub">${
      isNewBest
        ? 'New best ever! 🎉'
        : round.standard
          ? prevBest !== -Infinity
            ? `Your best is ${prevBest}.`
            : 'First score logged. This is your baseline.'
          : 'Custom settings, so this one is practice only.'
    } ${stats.avgMs != null ? `${secs(stats.avgMs)} per answer on average.` : ''}</p>

    <div class="result-actions">
      ${saved ? '' : `<button class="btn" id="again">${primary}</button>`}
      <a class="btn secondary" href="#/today">Back to Today</a>
      ${saved ? '' : '<button class="btn secondary" id="settings-link">Settings</button>'}
    </div>

    <div class="cols" style="margin-top:20px">
      <div class="card top-sun">
        <h3>⚡ Speed by operation</h3>
        ${
          opsRows
            ? `<table style="margin-top:10px"><thead><tr><th>Operation</th><th>Solved</th><th>Average</th></tr></thead><tbody>${opsRows}</tbody></table>`
            : '<p class="muted" style="margin-top:8px">No answers this round.</p>'
        }
      </div>
      <div class="card top-gum">
        <h3>🐢 Slowest answers</h3>
        ${
          stats.slowest.length
            ? `<ol class="slow-list">${stats.slowest
                .map((p) => `<li><span class="num">${esc(p.text)} = ${p.answer ?? ''}</span><strong class="num">${secs(p.ms)}</strong></li>`)
                .join('')}</ol>
               <p class="muted small" style="margin-top:8px">These are the ones worth drilling.</p>`
            : '<p class="muted" style="margin-top:8px">Nothing to show yet.</p>'
        }
      </div>
    </div>`;

  // Starting straight from this tap lets the phone keyboard open.
  el.querySelector('#again')?.addEventListener('click', () => playRound(el, rerender, ctx, round.settings));
  // Already on #/sprint, so a link wouldn't fire; re-render the setup screen instead.
  el.querySelector('#settings-link')?.addEventListener('click', () => rerender());
}
