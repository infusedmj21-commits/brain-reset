import { getBlob, getRow, live, remove, save, saveBlob, setHabit } from '../db.js';
import { prettyDate, today, weekDates } from '../logic/dates.js';
import { UNPROMPTED_PER_WEEK } from '../logic/routine.js';
import { RECALL_SECONDS, STEPS, activeSession, clock, countdown, nextStep, pendingRecall, stepIndex } from '../logic/unprompted.js';
import { chime, compressImage, confirmAction, esc, ticker, timerRing, toast, unlockAudio, updateRing } from '../ui.js';

const go = (hash) => (location.hash = hash);
const scholar = (topic) => `https://scholar.google.com/scholar?q=${encodeURIComponent(topic)}`;

export async function renderUnprompted(el, rerender, ctx) {
  const [section, id] = ctx.params;
  if (section === 'session') return renderSession(el, rerender, ctx, id);
  if (section === 'view') return renderDetail(el, rerender, ctx, id);
  return renderHome(el, rerender, ctx);
}

// ---------------------------------------------------------------- Home

async function renderHome(el, rerender, ctx) {
  const date = today();
  const sessions = (await live('unprompted_sessions')).sort((a, b) => (b.created_at ?? '').localeCompare(a.created_at ?? ''));
  const completed = sessions.filter((s) => s.completed);
  const active = activeSession(sessions);
  const recall = pendingRecall(sessions, date);
  const week = weekDates(date);
  const thisWeek = completed.filter((s) => week.includes(s.date)).length;

  const recallCard = recall
    ? `<div class="card top-gum stack" id="recall-card">
        <h3>💭 Recall yesterday’s topic</h3>
        <p class="recall-topic">${esc(recall.topic)}</p>
        <p class="muted small">Explain it out loud from memory for 60 seconds. No notes, no recording, no peeking.</p>
        <div class="recall-timer">
          ${timerRing({ id: 'recall-ring', label: 'tap start', time: clock(RECALL_SECONDS), colour: 'var(--gum)', soft: 'var(--gum-soft)' })}
          <div class="stack">
            <button class="btn" type="button" id="recall-start">Start 60 seconds</button>
            <button class="btn secondary" type="button" id="recall-done">Done, I explained it</button>
          </div>
        </div>
      </div>`
    : '';

  const activeCard = active
    ? `<div class="card top-grape">
        <div class="stat-row">
          <div style="min-width:0"><h3>🎙️ Session in progress</h3>
          <p class="muted small ellipsis" style="margin:4px 0 0">${esc(active.topic)} · ${esc(STEPS[stepIndex(active.step)]?.label ?? '')}</p></div>
          <a class="btn" href="#/unprompted/session/${active.id}">Resume</a>
        </div>
      </div>`
    : '';

  const newCard = `
    <form class="card top-grape stack" id="new-form" autocomplete="off">
      <h3>✨ New session</h3>
      <ol class="steps-list">
        <li>Get a random topic from unprompted.cool and paste it below.</li>
        <li>15 minutes of research on Google Scholar, with handwritten notes.</li>
        <li>5 minutes to boil it down to 3–4 points.</li>
        <li>Notes away, record a 60-second take on your phone camera.</li>
      </ol>
      <a class="btn-mini" href="https://unprompted.cool/" target="_blank" rel="noopener" style="justify-self:start">Get a topic ↗</a>
      <label class="label">Topic
        <input class="field" name="topic" required maxlength="140" placeholder="e.g. The survivor’s dilemma">
      </label>
      <button class="btn block" type="submit" ${active ? 'disabled title="Finish or cancel the session in progress first"' : ''}>Start · 15-minute research timer</button>
    </form>`;

  const library = completed
    .map(
      (s) => `<li><a class="card list-card lib-item" href="#/unprompted/view/${s.id}">
        <div class="stat-row">
          <div style="min-width:0"><h3 class="ellipsis">${esc(s.topic)}</h3>
          <p class="muted small" style="margin:2px 0 0">${esc(prettyDate(s.date))}${s.key_points ? ` · ${s.key_points.split('\n').filter(Boolean).length} points` : ''}${s.notes_photo_id ? ' · 📷' : ''}</p></div>
          <span class="badge ${s.recall_done_at ? 'ok' : ''}">${s.recall_done_at ? '💭 Recalled' : 'Not recalled'}</span>
        </div>
      </a></li>`
    )
    .join('');

  el.innerHTML = `
    <section class="hero">
      <div>
        <div class="eyebrow">Research, then explain</div>
        <h1 class="page-title">Unprompted</h1>
        <p class="page-sub">A random topic, 15 minutes of real sources, 60 seconds to explain it.</p>
      </div>
      <div class="hero-stats">
        <div class="stat-card"><div class="donut" style="--p:${Math.min(100, (thisWeek / UNPROMPTED_PER_WEEK) * 100)}"><span class="num">${thisWeek}/${UNPROMPTED_PER_WEEK}</span></div><div><div class="stat-label">This week</div><div class="stat-big num">${thisWeek} done</div></div></div>
        <div class="stat-card flame"><span class="emoji" aria-hidden="true">📚</span><div><div class="stat-label">Topics you know</div><div class="stat-big num">${completed.length}</div></div></div>
      </div>
    </section>

    <div class="layout">
      <section>
        <div class="sec" style="--dot:var(--grape)"><span class="dot"></span><h2>${recall ? 'Today' : 'Start'}</h2></div>
        <div class="stack-lg">${recallCard}${activeCard}${newCard}</div>
      </section>
      <aside class="side">
        <div class="sec" style="--dot:var(--sun);margin-bottom:0"><span class="dot"></span><h2>Your library</h2></div>
        ${
          library
            ? `<ul class="plain-list">${library}</ul>`
            : '<div class="empty-hint">Every topic you finish lands here, with your key points and notes photo.</div>'
        }
      </aside>
    </div>`;

  // Recall card
  if (recall) {
    const ring = el.querySelector('#recall-ring');
    let started = null;
    let chimed = false;
    const tick = () => {
      if (!started) return;
      const c = countdown(started, RECALL_SECONDS);
      updateRing(ring, { time: c.finished ? 'Done!' : clock(c.remaining), label: c.finished ? 'nice' : 'talking', fraction: c.fraction });
      if (c.finished && !chimed) {
        chimed = true;
        chime();
      }
    };
    ticker(tick, ctx);
    el.querySelector('#recall-start').addEventListener('click', (e) => {
      unlockAudio();
      started = new Date().toISOString();
      chimed = false;
      e.currentTarget.textContent = 'Restart';
      tick();
    });
    el.querySelector('#recall-done').addEventListener('click', async () => {
      await save('unprompted_sessions', { ...recall, recall_done_at: new Date().toISOString() });
      await setHabit(date, 'recall', true);
      toast('Recall logged 💭');
      rerender();
    });
  }

  el.querySelector('#new-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    unlockAudio();
    const topic = e.currentTarget.topic.value.trim();
    if (!topic) return;
    const now = new Date().toISOString();
    const row = await save('unprompted_sessions', {
      date,
      topic,
      step: 'research',
      step_started_at: now,
      created_at: now,
      completed: false,
      key_points: '',
      notes_photo_id: null,
      talk_started_at: null,
      takes: 0,
      recall_done_at: null
    });
    go(`#/unprompted/session/${row.id}`);
  });
}

// ---------------------------------------------------------------- Guided session

const STEP_COPY = {
  research: {
    title: 'Research',
    body: 'Google Scholar only. Handwritten notes only. Read for understanding: what is it, why does it matter, what’s the evidence?',
    colour: ['var(--grape)', 'var(--grape-soft)']
  },
  summary: {
    title: 'Summarise',
    body: 'Turn your notes into three or four points in your own words. This is what you’ll say in your 60 seconds.',
    colour: ['var(--sky)', 'var(--sky-soft)']
  },
  points: {
    title: 'Key points',
    body: 'Type your points so they’re saved in your library, and snap a photo of your notes if you like.',
    colour: ['var(--sun)', 'var(--sun-soft)']
  },
  talk: {
    title: 'Talk',
    body: 'Put your notes away. Open your phone camera and record one 60-second take. Up to two retakes, then stop.',
    colour: ['var(--tomato)', 'var(--tomato-soft)']
  }
};

async function renderSession(el, rerender, ctx, id) {
  let s = await getRow('unprompted_sessions', id);
  if (!s) return go('#/unprompted');
  if (s.completed) return go(`#/unprompted/view/${s.id}`);
  const idx = stepIndex(s.step);
  const step = STEPS[idx];
  const copy = STEP_COPY[step.key];

  const pills = STEPS.map(
    (st, i) => `<li class="${i < idx ? 'done' : i === idx ? 'current' : ''}"><span class="num">${i < idx ? '✓' : i + 1}</span>${esc(st.label)}</li>`
  ).join('');

  let body = '';
  if (step.key === 'research' || step.key === 'summary') {
    body = `
      <div class="center-stack">
        ${timerRing({ id: 'ring', label: 'left', time: clock(step.seconds), colour: copy.colour[0], soft: copy.colour[1] })}
        ${step.key === 'research' ? `<a class="btn secondary" href="${scholar(s.topic)}" target="_blank" rel="noopener">Search Google Scholar ↗</a>` : ''}
        <button class="btn" id="next">${step.key === 'research' ? 'Next: summarise' : 'Next: key points'}</button>
      </div>`;
  } else if (step.key === 'points') {
    body = `
      <form class="stack" id="points-form" style="max-width:640px">
        <label class="label">Your points, one per line
          <textarea class="field" name="points" rows="6" placeholder="What it is…&#10;Why it matters…&#10;The key evidence…&#10;One surprising detail…">${esc(s.key_points ?? '')}</textarea>
        </label>
        <div class="photo-row">
          <label class="btn secondary">📷 ${s.notes_photo_id ? 'Replace notes photo' : 'Add a photo of your notes'}
            <input type="file" accept="image/*" capture="environment" id="photo" hidden>
          </label>
          <img id="photo-preview" alt="Your notes" ${s.notes_photo_id ? '' : 'hidden'}>
        </div>
        <button class="btn" type="submit">Next: talk</button>
      </form>`;
  } else {
    body = `
      <div class="center-stack">
        ${timerRing({ id: 'ring', label: 'tap start', time: clock(step.seconds), colour: copy.colour[0], soft: copy.colour[1] })}
        <p class="muted small" id="takes">${s.takes ? `Take ${s.takes}${s.takes >= 3 ? ' · that’s your last one' : ''}` : 'Camera ready? Notes away?'}</p>
        <button class="btn" id="talk-start">${s.talk_started_at ? 'Retake: start again' : 'Start 60 seconds'}</button>
        <button class="btn secondary" id="finish">Finish session</button>
      </div>`;
  }

  el.innerHTML = `
    <a class="back" href="#/unprompted">← Unprompted</a>
    <div class="eyebrow">Topic</div>
    <h1 class="page-title topic-title">${esc(s.topic)}</h1>
    <ol class="step-pills">${pills}</ol>
    <div class="card session-card top-${{ research: 'grape', summary: 'sky', points: 'sun', talk: 'tomato' }[step.key]}">
      <h2 class="session-title">${esc(copy.title)}</h2>
      <p class="session-body">${esc(copy.body)}</p>
      ${body}
    </div>
    <div style="margin-top:16px"><button class="btn-mini" id="abandon">Abandon session</button></div>`;

  const advance = async (patch = {}) => {
    const next = nextStep(s.step);
    s = await save('unprompted_sessions', { ...s, ...patch, step: next, step_started_at: new Date().toISOString() });
    window.scrollTo(0, 0);
    rerender();
  };

  // Countdown for research and summary.
  if (step.key === 'research' || step.key === 'summary') {
    const ring = el.querySelector('#ring');
    let chimed = countdown(s.step_started_at, step.seconds).finished;
    ticker(() => {
      const c = countdown(s.step_started_at, step.seconds);
      updateRing(ring, {
        time: c.finished ? `+${clock(c.overtime)}` : clock(c.remaining),
        label: c.finished ? 'time’s up' : 'left',
        fraction: c.fraction,
        over: c.finished
      });
      if (c.finished && !chimed) {
        chimed = true;
        chime();
      }
    }, ctx);
    el.querySelector('#next').addEventListener('click', () => {
      unlockAudio();
      advance();
    });
  }

  if (step.key === 'points') {
    const form = el.querySelector('#points-form');
    const preview = el.querySelector('#photo-preview');
    let url = null;
    const showPhoto = async (blobId) => {
      const blob = await getBlob(blobId);
      if (!blob) return;
      if (url) URL.revokeObjectURL(url);
      url = URL.createObjectURL(blob);
      preview.src = url;
      preview.hidden = false;
    };
    ctx.onCleanup(() => url && URL.revokeObjectURL(url));
    if (s.notes_photo_id) showPhoto(s.notes_photo_id);

    // Save points as you type, so nothing is lost if the app closes.
    let t;
    form.points.addEventListener('input', () => {
      clearTimeout(t);
      t = setTimeout(async () => {
        s = await save('unprompted_sessions', { ...s, key_points: form.points.value });
      }, 500);
    });
    ctx.onCleanup(() => clearTimeout(t));

    el.querySelector('#photo').addEventListener('change', async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const blob = await compressImage(file);
      const blobId = await saveBlob(blob);
      s = await save('unprompted_sessions', { ...s, notes_photo_id: blobId });
      await showPhoto(blobId);
      toast('Notes photo saved');
    });

    form.addEventListener('submit', (e) => {
      e.preventDefault();
      clearTimeout(t);
      advance({ key_points: form.points.value.trim() });
    });
  }

  if (step.key === 'talk') {
    const ring = el.querySelector('#ring');
    let chimed = s.talk_started_at ? countdown(s.talk_started_at, step.seconds).finished : false;
    const tick = () => {
      if (!s.talk_started_at) return;
      const c = countdown(s.talk_started_at, step.seconds);
      updateRing(ring, { time: c.finished ? 'Done!' : clock(c.remaining), label: c.finished ? 'stop recording' : 'talking', fraction: c.fraction, over: c.finished });
      if (c.finished && !chimed) {
        chimed = true;
        chime();
      }
    };
    ticker(tick, ctx);
    el.querySelector('#talk-start').addEventListener('click', async (e) => {
      const button = e.currentTarget; // currentTarget is cleared once the handler awaits
      unlockAudio();
      s = await save('unprompted_sessions', { ...s, talk_started_at: new Date().toISOString(), takes: (s.takes ?? 0) + 1 });
      chimed = false;
      tick();
      button.textContent = 'Retake: start again';
      el.querySelector('#takes').textContent = `Take ${s.takes}${s.takes >= 3 ? ' · that’s your last one' : ''}`;
    });
    el.querySelector('#finish').addEventListener('click', async () => {
      const date = today();
      s = await save('unprompted_sessions', { ...s, step: 'done', completed: true, completed_at: new Date().toISOString(), date });
      await setHabit(date, 'unprompted', true);
      toast('Session saved 🎉 Recall it tomorrow');
      go(`#/unprompted/view/${s.id}`);
    });
  }

  el.querySelector('#abandon').addEventListener('click', async () => {
    if (!confirmAction('Abandon this session? It won’t be saved to your library.')) return;
    await remove('unprompted_sessions', s.id);
    go('#/unprompted');
  });
}

// ---------------------------------------------------------------- Detail

async function renderDetail(el, rerender, ctx, id) {
  const s = await getRow('unprompted_sessions', id);
  if (!s) return go('#/unprompted');

  el.innerHTML = `
    <a class="back" href="#/unprompted">← Unprompted</a>
    <div class="eyebrow">${esc(prettyDate(s.date))}</div>
    <h1 class="page-title topic-title">${esc(s.topic)}</h1>
    <div class="badges">
      <span class="badge ok">✓ Completed</span>
      <span class="badge ${s.recall_done_at ? 'ok' : ''}">${s.recall_done_at ? `💭 Recalled ${esc(prettyDate(s.recall_done_at.slice(0, 10)).replace(/^\w+ /, ''))}` : '💭 Recall tomorrow'}</span>
      ${s.takes ? `<span class="badge">🎥 ${s.takes} take${s.takes === 1 ? '' : 's'}</span>` : ''}
    </div>
    <div class="cols" style="margin-top:18px">
      <form class="card top-sun stack" id="edit-form">
        <h3>📝 Key points</h3>
        <textarea class="field" name="points" rows="7" placeholder="No points saved">${esc(s.key_points ?? '')}</textarea>
        <button class="btn" type="submit">Save points</button>
      </form>
      <div class="stack" style="align-content:start">
        <div class="card top-sky">
          <h3>📷 Notes</h3>
          <div class="photo-row" style="margin-top:10px">
            <img id="photo" alt="Your handwritten notes" hidden>
            <label class="btn secondary">${s.notes_photo_id ? 'Replace photo' : 'Add a photo'}
              <input type="file" accept="image/*" capture="environment" id="photo-input" hidden>
            </label>
          </div>
        </div>
        <a class="btn secondary block" href="${scholar(s.topic)}" target="_blank" rel="noopener">Read more on Google Scholar ↗</a>
        <button class="btn-mini" id="delete" style="justify-self:start">Delete session</button>
      </div>
    </div>`;

  const img = el.querySelector('#photo');
  let url = null;
  const show = async (blobId) => {
    const blob = await getBlob(blobId);
    if (!blob) return;
    if (url) URL.revokeObjectURL(url);
    url = URL.createObjectURL(blob);
    img.src = url;
    img.hidden = false;
  };
  ctx.onCleanup(() => url && URL.revokeObjectURL(url));
  if (s.notes_photo_id) show(s.notes_photo_id);

  el.querySelector('#photo-input').addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const blobId = await saveBlob(await compressImage(file));
    await save('unprompted_sessions', { ...s, notes_photo_id: blobId });
    toast('Photo saved');
    rerender();
  });

  el.querySelector('#edit-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    await save('unprompted_sessions', { ...s, key_points: e.currentTarget.points.value.trim() });
    toast('Points saved');
  });

  el.querySelector('#delete').addEventListener('click', async () => {
    if (!confirmAction(`Delete “${s.topic}” from your library?`)) return;
    await remove('unprompted_sessions', s.id);
    toast('Deleted');
    go('#/unprompted');
  });
}
