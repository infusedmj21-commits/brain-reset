import { getMeta, getRow, live, remove, save, setHabit, setMeta } from '../db.js';
import { prettyDate, today, weekStart, weekDates } from '../logic/dates.js';
import { WEEKLY_TEST, parseLines, pickWords, scoreRecall, weeklyTestHistory } from '../logic/palace.js';
import { clock, countdown } from '../logic/unprompted.js';
import { chime, confirmAction, esc, ticker, timerRing, toast, unlockAudio, updateRing } from '../ui.js';

const ACTIVE_KEY = 'palace_active';
const go = (hash) => (location.hash = hash);

export async function renderPalace(el, rerender, ctx) {
  const [section, id] = ctx.params;
  if (section === 'edit') return renderEditor(el, id);
  if (section === 'session') return renderSession(el, rerender, ctx);
  if (section === 'result') return renderResult(el, id);
  return renderHome(el, rerender, ctx);
}

// ---------------------------------------------------------------- Home

async function renderHome(el, rerender, ctx) {
  const date = today();
  const [palaces, sessions, active] = await Promise.all([live('palaces'), live('palace_sessions'), getMeta(ACTIVE_KEY)]);
  palaces.sort((a, b) => (a.created_at ?? '').localeCompare(b.created_at ?? ''));
  sessions.sort((a, b) => b.finished_at?.localeCompare(a.finished_at ?? '') ?? 0);
  const week = weekDates(date);
  const thisWeek = sessions.filter((s) => week.includes(s.date)).length;
  const tests = weeklyTestHistory(sessions, weekStart);
  const lastTest = tests[0];
  const testThisWeek = tests.find((t) => t.week === weekStart(date));

  const prefs = (await getMeta('palace_prefs')) ?? { mode: 'practice', size: 10, source: 'random' };
  const selected = palaces.find((p) => p.id === prefs.palace_id) ?? palaces[0];

  const activeCard = active
    ? `<div class="card top-mint resume">
        <div class="stat-row">
          <div><h3>🏰 Session in progress</h3>
          <p class="muted small" id="active-status" style="margin:4px 0 0">${esc(active.palace_name)} · ${active.items.length} words${active.mode === 'test' ? ' · weekly test' : ''}</p></div>
          <a class="btn" href="#/palace/session">Resume</a>
        </div>
      </div>`
    : '';

  const startCard = palaces.length
    ? `<form class="card top-mint stack" id="start-form" autocomplete="off">
        <h3>🎯 Start a session</h3>
        <label class="label">Palace
          <select class="field" name="palace">${palaces
            .map((p) => `<option value="${p.id}" ${p.id === selected?.id ? 'selected' : ''}>${esc(p.name)} (${p.loci.length} spots)</option>`)
            .join('')}</select>
        </label>
        <div class="label">Type</div>
        <div class="chips small" role="group">
          <button type="button" class="chip" data-mode="practice" aria-pressed="${prefs.mode === 'practice'}">✏️ Practice</button>
          <button type="button" class="chip" data-mode="test" aria-pressed="${prefs.mode === 'test'}">🏆 Weekly test</button>
        </div>
        <p class="muted small" data-mode-hint>${
          prefs.mode === 'test'
            ? `${WEEKLY_TEST.size} words · 5 minutes to study · recall after ${WEEKLY_TEST.delayMinutes} minutes.${testThisWeek ? ` Done this week: ${testThisWeek.recalled}/${testThisWeek.total}.` : ''}`
            : 'Study at your own pace, then recall straight away.'
        }</p>
        <div data-practice-only ${prefs.mode === 'test' ? 'hidden' : ''}>
          <div class="label">Words</div>
          <div class="chips small three" role="group">
            ${[5, 10, 20].map((n) => `<button type="button" class="chip" data-size="${n}" aria-pressed="${prefs.size === n}">${n}</button>`).join('')}
          </div>
          <div class="label" style="margin-top:10px">List</div>
          <div class="chips small" role="group">
            <button type="button" class="chip" data-source="random" aria-pressed="${prefs.source === 'random'}">🎲 Random words</button>
            <button type="button" class="chip" data-source="custom" aria-pressed="${prefs.source === 'custom'}">📝 My own list</button>
          </div>
          <textarea class="field" name="custom" rows="5" placeholder="One item per line: Spanish vocab, definitions, a shopping list…" ${prefs.source === 'custom' ? '' : 'hidden'} style="margin-top:10px">${esc(prefs.custom ?? '')}</textarea>
        </div>
        <button class="btn block" type="submit" ${active ? 'disabled title="Finish or cancel the session in progress first"' : ''}>Start</button>
      </form>`
    : `<div class="card m-mint" style="background:var(--soft)">
        <div class="stack">
          <div class="shape s-squircle" style="width:64px;height:64px;font-size:30px" aria-hidden="true">🏰</div>
          <h3>Build your first palace</h3>
          <p>Pick a route you know really well, like your home or your walk to campus. List 10 to 20 spots along it, in the order you’d pass them.</p>
          <a class="btn" href="#/palace/edit/new">Build a palace</a>
        </div>
      </div>`;

  const palaceCards = palaces
    .map(
      (p) => `<li class="card list-card">
        <div class="stat-row">
          <div style="min-width:0"><h3>${esc(p.name)}</h3>
          <p class="muted small ellipsis" style="margin:2px 0 0">${p.loci.length} spots · ${esc(p.loci.slice(0, 4).join(' → '))}${p.loci.length > 4 ? ' → …' : ''}</p></div>
          <a class="btn-mini" href="#/palace/edit/${p.id}">Edit</a>
        </div>
      </li>`
    )
    .join('');

  const history = sessions.slice(0, 8);

  el.innerHTML = `
    <section class="hero">
      <div>
        <div class="eyebrow">Memory training</div>
        <h1 class="page-title">Memory palace</h1>
        <p class="page-sub">Place a weird, vivid image at each spot on a route you know, then walk it to recall.</p>
      </div>
      <div class="hero-stats">
        <div class="stat-card"><span class="emoji" aria-hidden="true" style="font-size:26px">🏰</span><div><div class="stat-label">This week</div><div class="stat-big num">${thisWeek} session${thisWeek === 1 ? '' : 's'}</div></div></div>
        <div class="stat-card flame"><span class="emoji" aria-hidden="true">🏆</span><div><div class="stat-label">Last weekly test</div><div class="stat-big num">${lastTest ? `${lastTest.recalled}/${lastTest.total}` : '–'}</div></div></div>
      </div>
    </section>

    <div class="layout">
      <section>
        <div class="sec" style="--dot:var(--mint)"><span class="dot"></span><h2>Practise</h2></div>
        ${activeCard}
        ${startCard}

        <div class="sec" style="--dot:var(--tomato)"><span class="dot"></span><h2>Recent sessions</h2></div>
        <div class="card top-tomato">
          ${
            history.length
              ? `<table class="num"><thead><tr><th>Day</th><th>Type</th><th>Recalled</th><th>In order</th></tr></thead><tbody>
                ${history
                  .map(
                    (s) => `<tr data-href="#/palace/result/${s.id}" class="clickable">
                      <td>${esc(prettyDate(s.date).replace(/^\w+ /, ''))}</td>
                      <td>${s.is_weekly_test ? '🏆 Test' : s.list_type === 'custom' ? '📝 Own list' : '✏️ Practice'}</td>
                      <td><strong>${s.recalled}/${s.total}</strong></td>
                      <td class="muted">${s.in_order}</td></tr>`
                  )
                  .join('')}</tbody></table>`
              : '<p class="muted">No sessions yet. Your scores will show up here.</p>'
          }
        </div>
      </section>

      <aside class="side">
        <div class="sec" style="--dot:var(--sun);margin-bottom:0"><span class="dot"></span><h2>Your palaces</h2></div>
        ${palaces.length ? `<ul class="plain-list">${palaceCards}</ul>` : ''}
        <a class="btn secondary block" href="#/palace/edit/new">＋ New palace</a>
        <div class="card top-grape">
          <h3>💡 How to make it stick</h3>
          <ul class="tips">
            <li>Make each image big, silly and moving: a giant banana kicking down your front door.</li>
            <li>Engage senses: smell, sound, mess.</li>
            <li>Weeks 5–8: switch to your own lists, like Spanish vocab or uni notes.</li>
          </ul>
        </div>
      </aside>
    </div>`;

  // Clickable history rows
  el.querySelectorAll('tr[data-href]').forEach((tr) => tr.addEventListener('click', () => go(tr.dataset.href)));

  const form = el.querySelector('#start-form');
  if (!form) return;

  const savePrefs = (patch) => {
    Object.assign(prefs, patch);
    return setMeta('palace_prefs', prefs);
  };
  const press = (attr, value) =>
    form.querySelectorAll(`[${attr}]`).forEach((b) => b.setAttribute('aria-pressed', String(b.getAttribute(attr) === String(value))));

  form.querySelectorAll('[data-mode]').forEach((b) =>
    b.addEventListener('click', async () => {
      await savePrefs({ mode: b.dataset.mode });
      rerender();
    })
  );
  form.querySelectorAll('[data-size]').forEach((b) =>
    b.addEventListener('click', () => {
      savePrefs({ size: Number(b.dataset.size) });
      press('data-size', b.dataset.size);
    })
  );
  form.querySelectorAll('[data-source]').forEach((b) =>
    b.addEventListener('click', () => {
      savePrefs({ source: b.dataset.source });
      press('data-source', b.dataset.source);
      form.querySelector('textarea[name="custom"]').hidden = b.dataset.source !== 'custom';
    })
  );

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    unlockAudio();
    const data = new FormData(form);
    const palace = palaces.find((p) => p.id === data.get('palace'));
    if (!palace) return;
    const test = prefs.mode === 'test';
    let size = test ? WEEKLY_TEST.size : prefs.size;
    let items;
    let listType = 'random';
    if (!test && prefs.source === 'custom') {
      const custom = data.get('custom') ?? '';
      await savePrefs({ custom });
      items = parseLines(custom);
      listType = 'custom';
      if (!items.length) return toast('Add some items to your list first');
      if (items.length > palace.loci.length) toast(`Only the first ${palace.loci.length} fit this palace`);
      items = items.slice(0, palace.loci.length);
    } else {
      if (palace.loci.length < size) toast(`${palace.name} has ${palace.loci.length} spots, so ${palace.loci.length} words`);
      size = Math.min(size, palace.loci.length);
      items = pickWords(size);
    }
    await savePrefs({ palace_id: palace.id });
    await setMeta(ACTIVE_KEY, {
      palace_id: palace.id,
      palace_name: palace.name,
      loci: palace.loci.slice(0, items.length),
      items,
      mode: test ? 'test' : 'practice',
      list_type: listType,
      phase: 'study',
      study_started_at: new Date().toISOString()
    });
    go('#/palace/session');
  });
}

// ---------------------------------------------------------------- Editor

async function renderEditor(el, id) {
  const palace = id && id !== 'new' ? await getRow('palaces', id) : null;
  el.innerHTML = `
    <a class="back" href="#/palace">← Memory palace</a>
    <h1 class="page-title">${palace ? 'Edit palace' : 'New palace'}</h1>
    <div class="cols" style="margin-top:20px">
      <form class="card top-mint stack" id="palace-form" autocomplete="off">
        <label class="label">Name
          <input class="field" name="name" required maxlength="40" placeholder="My flat" value="${esc(palace?.name ?? '')}">
        </label>
        <label class="label">Spots, one per line, in walking order
          <textarea class="field" name="loci" rows="12" required placeholder="Front door&#10;Doormat&#10;Hallway mirror&#10;Coat hooks&#10;Kitchen sink&#10;Fridge&#10;Kettle&#10;Sofa&#10;TV&#10;Window">${esc(palace?.loci.join('\n') ?? '')}</textarea>
        </label>
        <p class="muted small" data-count></p>
        <button class="btn block" type="submit">Save palace</button>
        ${palace ? '<button class="btn secondary block" type="button" id="delete">Delete palace</button>' : ''}
      </form>
      <div class="card top-sun">
        <h3>🗺️ Picking good spots</h3>
        <ul class="tips">
          <li>Use a place you can walk through in your head with your eyes shut.</li>
          <li>Pick distinct spots: a door, a radiator, a fridge. Avoid ten bits of the same wall.</li>
          <li>Keep the order fixed. Always walk the same direction.</li>
          <li>20 spots covers the weekly test. Make more palaces later for longer lists.</li>
        </ul>
      </div>
    </div>`;

  const form = el.querySelector('#palace-form');
  const count = el.querySelector('[data-count]');
  const updateCount = () => {
    const n = parseLines(form.loci.value).length;
    count.textContent = `${n} spot${n === 1 ? '' : 's'}${n < WEEKLY_TEST.size ? ` · ${WEEKLY_TEST.size} needed for the weekly test` : ''}`;
  };
  form.loci.addEventListener('input', updateCount);
  updateCount();

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const loci = parseLines(form.loci.value);
    if (loci.length < 3) return toast('Add at least 3 spots');
    await save('palaces', {
      ...(palace ?? { created_at: new Date().toISOString() }),
      name: form.name.value.trim(),
      loci
    });
    toast('Palace saved');
    go('#/palace');
  });

  el.querySelector('#delete')?.addEventListener('click', async () => {
    if (!confirmAction(`Delete “${palace.name}”? Your past scores stay.`)) return;
    await remove('palaces', palace.id);
    toast('Palace deleted');
    go('#/palace');
  });
}

// ---------------------------------------------------------------- Session

async function renderSession(el, rerender, ctx) {
  const active = await getMeta(ACTIVE_KEY);
  if (!active) return go('#/palace');

  const cancel = `<button type="button" class="btn-mini" id="cancel">Cancel session</button>`;
  const header = (title, sub) => `
    <a class="back" href="#/palace">← Memory palace</a>
    <div class="session-head">
      <div><div class="eyebrow">${esc(active.palace_name)} · ${active.items.length} ${active.list_type === 'custom' ? 'items' : 'words'}${active.mode === 'test' ? ' · 🏆 weekly test' : ''}</div>
      <h1 class="page-title">${title}</h1>
      <p class="page-sub">${sub}</p></div>
    </div>`;

  const bindCancel = () =>
    el.querySelector('#cancel')?.addEventListener('click', async () => {
      if (!confirmAction('Cancel this session? Nothing will be saved.')) return;
      await setMeta(ACTIVE_KEY, null);
      go('#/palace');
    });

  if (active.phase === 'study') {
    const test = active.mode === 'test';
    el.innerHTML = `
      ${header('Study', test ? 'You have 5 minutes. Walk the route and picture each word at its spot.' : 'Walk the route and picture each word at its spot. Take your time.')}
      <div class="study-layout">
        <ol class="pairs">${active.items
          .map(
            (w, i) => `<li><span class="pair-n num">${i + 1}</span><span class="pair-locus">${esc(active.loci[i])}</span><span class="pair-word">${esc(w)}</span></li>`
          )
          .join('')}</ol>
        <aside class="stack sticky">
          ${timerRing({ id: 'ring', label: test ? 'left to study' : 'studying', time: test ? clock(WEEKLY_TEST.studySeconds) : '0:00', colour: 'var(--mint)', soft: 'var(--mint-soft)' })}
          <button class="btn block" id="done-study">${test ? `Hide words · recall in ${WEEKLY_TEST.delayMinutes} min` : 'Hide words and recall'}</button>
          ${cancel}
        </aside>
      </div>`;
    const ring = el.querySelector('#ring');
    let chimed = false;
    ticker(() => {
      if (test) {
        const c = countdown(active.study_started_at, WEEKLY_TEST.studySeconds);
        updateRing(ring, { time: c.finished ? 'Time!' : clock(c.remaining), fraction: c.fraction, over: c.finished });
        if (c.finished && !chimed) {
          chimed = true;
          chime();
        }
      } else {
        const secs = Math.floor((Date.now() - Date.parse(active.study_started_at)) / 1000);
        updateRing(ring, { time: clock(secs), fraction: Math.min(1, secs / 300) });
      }
    }, ctx);
    el.querySelector('#done-study').addEventListener('click', async () => {
      unlockAudio();
      const studySeconds = Math.round((Date.now() - Date.parse(active.study_started_at)) / 1000);
      const next = test
        ? { phase: 'wait', ready_at: new Date(Date.now() + WEEKLY_TEST.delayMinutes * 60000).toISOString() }
        : { phase: 'recall' };
      await setMeta(ACTIVE_KEY, { ...active, ...next, study_seconds: studySeconds });
      window.scrollTo(0, 0);
      rerender();
    });
    bindCancel();
    return;
  }

  if (active.phase === 'wait') {
    const total = WEEKLY_TEST.delayMinutes * 60;
    const startedAt = new Date(Date.parse(active.ready_at) - total * 1000).toISOString();
    el.innerHTML = `
      ${header('Wait 20 minutes', 'Do something else: make a drink, do your reading. You can close the app; the timer keeps going.')}
      <div class="center-stack">
        ${timerRing({ id: 'ring', label: 'until recall', time: clock(total), colour: 'var(--sun)', soft: 'var(--sun-soft)' })}
        <button class="btn" id="recall" disabled>Start recall</button>
        ${cancel}
      </div>`;
    const ring = el.querySelector('#ring');
    const btn = el.querySelector('#recall');
    let chimed = false;
    ticker(() => {
      const c = countdown(startedAt, total);
      updateRing(ring, { time: c.finished ? 'Ready!' : clock(c.remaining), fraction: c.fraction });
      btn.disabled = !c.finished;
      if (c.finished && !chimed) {
        chimed = true;
        if (c.overtime < 5) chime();
      }
    }, ctx);
    btn.addEventListener('click', async () => {
      await setMeta(ACTIVE_KEY, { ...active, phase: 'recall' });
      rerender();
    });
    bindCancel();
    return;
  }

  // Recall
  el.innerHTML = `
    ${header('Recall', 'Walk the route again. What did you leave at each spot? Leave a blank if it’s gone.')}
    <form id="recall-form" class="recall-grid" autocomplete="off">
      ${active.loci
        .map(
          (l, i) => `<label class="recall-row"><span class="pair-n num">${i + 1}</span><span class="pair-locus">${esc(l)}</span>
            <input class="field" name="a${i}" autocapitalize="none" autocorrect="off" spellcheck="false" enterkeyhint="next"></label>`
        )
        .join('')}
      <div class="recall-actions"><button class="btn" type="submit">Check my answers</button>${cancel}</div>
    </form>`;
  bindCancel();
  const form = el.querySelector('#recall-form');
  form.querySelector('input')?.focus({ preventScroll: true });
  // Enter moves to the next box instead of submitting early.
  form.querySelectorAll('input').forEach((input, i, all) =>
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && i < all.length - 1) {
        e.preventDefault();
        all[i + 1].focus();
      }
    })
  );
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const answers = active.loci.map((_, i) => form[`a${i}`].value.trim());
    const score = scoreRecall(active.items, answers);
    const date = today();
    const row = await save('palace_sessions', {
      date,
      palace_id: active.palace_id,
      palace_name: active.palace_name,
      list_type: active.list_type,
      is_weekly_test: active.mode === 'test',
      items: active.items,
      loci: active.loci,
      answers,
      study_seconds: active.study_seconds ?? null,
      delay_minutes: active.mode === 'test' ? WEEKLY_TEST.delayMinutes : 0,
      recalled: score.recalled,
      in_order: score.inOrder,
      total: score.total,
      finished_at: new Date().toISOString()
    });
    await setHabit(date, 'palace', true);
    await setMeta(ACTIVE_KEY, null);
    go(`#/palace/result/${row.id}`);
  });
}

// ---------------------------------------------------------------- Result

async function renderResult(el, id) {
  const s = await getRow('palace_sessions', id);
  if (!s) return go('#/palace');
  const score = scoreRecall(s.items, s.answers);
  const pct = s.total ? s.recalled / s.total : 0;
  const message =
    pct === 1 ? 'Perfect recall. 🎉' : pct >= 0.8 ? 'Brilliant. Nearly all of them.' : pct >= 0.5 ? 'Solid. The weird images are working.' : 'Good start. Make the images bigger and sillier next time.';

  el.innerHTML = `
    <a class="back" href="#/palace">← Memory palace</a>
    <div class="eyebrow">${esc(prettyDate(s.date))} · ${esc(s.palace_name)}${s.is_weekly_test ? ' · 🏆 weekly test' : ''}</div>
    <h1 class="page-title">${s.recalled} / ${s.total}</h1>
    <p class="page-sub">${message} ${s.in_order} in the right spot${s.study_seconds ? ` · studied for ${clock(s.study_seconds)}` : ''}.</p>
    <div class="cols" style="margin-top:20px">
      <ol class="pairs results">${score.items
        .map(
          (it, i) => `<li class="${it.inOrder ? 'ok' : it.recalled ? 'half' : 'miss'}">
            <span class="pair-n num">${i + 1}</span>
            <span class="pair-locus">${esc(s.loci?.[i] ?? '')}</span>
            <span class="pair-word">${esc(it.target)}${!it.inOrder && it.answer ? `<small> you wrote “${esc(it.answer)}”</small>` : ''}</span>
            <span class="pair-mark" aria-label="${it.inOrder ? 'correct' : it.recalled ? 'recalled, wrong spot' : 'missed'}">${it.inOrder ? '✓' : it.recalled ? '≈' : '✗'}</span>
          </li>`
        )
        .join('')}</ol>
      <div class="stack" style="align-content:start">
        <div class="card top-sun">
          <h3>Key</h3>
          <p class="small" style="margin-top:8px">✓ right spot · ≈ remembered, wrong spot · ✗ missed</p>
        </div>
        <a class="btn block" href="#/palace">Practise again</a>
        <a class="btn secondary block" href="#/today">Back to Today</a>
      </div>
    </div>`;
}
