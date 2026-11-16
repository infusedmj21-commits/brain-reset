import { DECKS, deckById, importDeck, loadImportedDecks } from '../decks/index.js';
import { answerCard, getDayLog, listReviews, listStates, logCardsDay, placeNotes } from '../data/cards.js';
import { loadDay } from '../data/dayload.js';
import { pictogram, play } from '../data/media.js';
import {
  CARD_TYPES, Rating, adaptiveNew, introducible, cardsFromDeck, checkTyped, dueSummary, forecast, forgetRate, intervalLabel, deckSettled, parseCloze, preview, stageGate, toFsrs, SECONDS_PER_NEW, SECONDS_PER_REVIEW
} from '../logic/cards.js';
import { TIERS } from '../logic/dayload.js';
import { today } from '../logic/dates.js';
import { esc, toast } from '../ui.js';
import { ICONS } from './icons.js';

const RATINGS = [
  [Rating.Again, 'Again', '1'],
  [Rating.Hard, 'Hard', '2'],
  [Rating.Good, 'Good', '3'],
  [Rating.Easy, 'Easy', '4']
];
const LEARN_AHEAD_MS = 20 * 60000;

const muted = () => {
  try {
    return localStorage.getItem('artemis-cards-muted') === '1';
  } catch {
    return false;
  }
};

/** Today's plan for a deck: what's due, how many new, and why. */
async function planFor(deck, date, now, day) {
  const defs = cardsFromDeck(deck);
  const ids = new Set(defs.map((d) => d.id));
  // Only cards the deck still has: words that left a rebuilt deck stop counting.
  const [states, reviews] = await Promise.all([listStates(deck.id).then((s) => s.filter((r) => ids.has(r.id))), listReviews(deck.id)]);
  const due = dueSummary(defs, states, now);
  const gate = stageGate(defs, due.byId, deck.stages);
  const unlocked = due.fresh.filter((d) => gate.open.has(d.stage));
  due.fresh = introducible(unlocked, states, date);
  const doneToday = states.filter((s) => s.introduced === date).length;
  const rate = forgetRate(reviews, now);
  // A deck can wait for another (classics wait for the menu): no new cards until that one is 85% settled.
  let waitingFor = null;
  const before = deck.after && deckById(deck.after);
  if (before) {
    const bDefs = cardsFromDeck(before);
    const bStates = await listStates(before.id);
    const s = deckSettled(bDefs, new Map(bStates.map((r) => [r.id, r])));
    if (!s.open) {
      waitingFor = { name: before.name, ...s };
      due.fresh = [];
    }
  }
  // Fixed daily allowance (bar decks) or the adaptive one (Spanish).
  const fixed = (n) => {
    const count = Math.min(due.fresh.length, n === 'all' ? Infinity : Math.max(0, n - doneToday));
    const estMinutes = Math.ceil(((due.reviews.length + due.learning.length) * SECONDS_PER_REVIEW + count * SECONDS_PER_NEW) / 60);
    const reasons = waitingFor
      ? [`opens once ${waitingFor.need} of the ${waitingFor.total} ${waitingFor.name} cards are settled (next review a week or more away). ${waitingFor.settled} so far`]
      : [count ? (n === 'all' ? 'short deck, so everything at once' : `up to ${n} new a day`) : due.fresh.length ? `today’s ${n} done` : 'all cards met'];
    return { count, total: count + doneToday, estMinutes, reasons };
  };
  const plan =
    deck.newPerDay != null
      ? fixed(deck.newPerDay)
      : adaptiveNew({ tier: day.tier, reviewsDue: due.reviews.length, learningDue: due.learning.length, rate: rate.rate, available: due.fresh.length, doneToday });
  const w = gate.waiting;
  if (w && !unlocked.length && plan.count === 0 && w.total) {
    plan.reasons = [`stage ${w.stage} opens once ${w.need} of stage ${w.prev}’s ${w.total} cards are settled (next review a week or more away). ${w.settled} so far`];
  }
  const placeable = defs.some((d) => gate.open.has(d.stage) && !due.byId.has(d.id) && !states.some((s) => s.note === d.noteId));
  const stageOf = (n) => defs.filter((d) => d.stage === n);
  const stages = (deck.stages ?? [{ id: 1, name: 'Stage 1' }]).map((s) => {
    const all = stageOf(s.id);
    const seen = all.filter((d) => due.byId.has(d.id)).length;
    return { ...s, total: all.length, seen };
  });
  const current = stages.find((s) => s.seen < s.total) ?? stages.at(-1);
  return { defs, states, reviews, due, plan, rate, stages, current, doneToday, gate, placeable, forecast: forecast(states, now, 7) };
}

// ------------------------------------------------------------------ Overview

export async function renderCards(el, rerender, ctx) {
  const [section, deckId] = ctx?.params ?? [];
  await loadImportedDecks();
  if (section === 'study' && deckById(deckId)) return renderStudy(el, rerender, deckById(deckId));
  if (section === 'place' && deckById(deckId)) return renderPlace(el, rerender, deckById(deckId));

  const date = today();
  const now = new Date();
  const day = await loadDay(date);
  const plans = await Promise.all(DECKS.map((d) => planFor(d, date, now, day)));
  const dayLog = await getDayLog(date);
  const reviewsToday = plans.reduce((t, p) => t + p.reviews.filter((r) => r.date === date).length, 0);

  el.innerHTML = `
    <div class="eyebrow">${esc(TIERS[day.tier].label)} · ${esc(day.why)}</div>
    <h1 class="page-title">Cards</h1>
    ${
      !DECKS.length
        ? '<div class="empty-hint" style="margin-top:18px">No decks yet. They arrive as files in the app, so there’s nothing to set up.</div>'
        : `<div class="deck-grid">${DECKS.map((deck, i) => deckCard(deck, plans[i])).join('')}</div>`
    }
    ${
      DECKS.length
        ? `<div class="layout">
            <section>
              <div class="sec"><h2>Reviews coming up</h2><span class="aside">Next 7 days, all decks</span></div>
              <div class="card">${forecastChart(plans.reduce((acc, p) => acc.map((v, i) => v + p.forecast[i]), Array(7).fill(0)))}</div>
            </section>
            <aside class="side">
              <div class="sec"><h2>Today</h2></div>
              <div class="card stack">
                <div class="stat-row"><span class="muted">Reviews done</span><strong class="num">${reviewsToday}</strong></div>
                <div class="stat-row"><span class="muted">New cards seen</span><strong class="num">${plans.reduce((t, p) => t + p.doneToday, 0)}</strong></div>
                <div class="stat-row"><span class="muted">Time</span><strong class="num">${dayLog?.cards?.minutes_actual ?? 0} min</strong></div>
                <p class="muted small" style="margin:0">Desired retention 90%. New cards adapt to your day load, your review pile and how much you’ve been forgetting this week.</p>
              </div>
              <div class="credits" style="margin-top:10px">${DECKS.flatMap((d) => d.credits ?? []).map((c) => `<span>${esc(c)}</span>`).join('')}
              </div>
              <label class="import-deck card">
                <span><b>Import a deck</b><span class="muted small">A deck file Claude sent you. It’s saved to your account only, never the app’s code.</span></span>
                <span class="btn-mini">Choose file</span>
                <input type="file" accept=".json,application/json" id="deck-file" hidden>
              </label>
            </aside>
          </div>`
        : ''
    }`;

  el.querySelector('#deck-file')?.addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const deck = JSON.parse(await file.text());
      const had = deckById(deck?.id);
      await importDeck(deck);
      toast(`${had ? 'Updated' : 'Added'} “${deck.name}”`);
      rerender();
    } catch (err) {
      toast(err instanceof SyntaxError ? 'That file isn’t a deck.' : err.message);
    }
    e.target.value = '';
  });
}

function deckCard(deck, p) {
  const dueNow = p.due.learning.length + p.due.reviews.length;
  const todo = dueNow + p.plan.count;
  return `<div class="card deck-card stack">
    <div class="deck-top"><span class="chipico">${ICONS[deck.icon] ?? ICONS.chat}</span><span><h3>${esc(deck.name)}</h3><span class="muted small">${p.stages.length > 1 ? `Stage ${p.current?.id ?? 1}: ` : ''}${esc(p.current?.name ?? '')}</span></span></div>
    <div class="deck-nums">
      <div><b class="num">${dueNow}</b><span>due</span></div>
      <div><b class="num">${p.plan.count}</b><span>new today</span></div>
      <div><b class="num">~${p.plan.estMinutes}</b><span>min</span></div>
    </div>
    <p class="muted small" style="margin:0">${p.plan.count} new today: ${esc(p.plan.reasons.join(', '))}.</p>
    <div class="stage-bars" aria-label="Stages">${p.stages
      .map((s) => `<span title="${esc(s.name)}: ${s.seen} of ${s.total} seen"><i style="width:${s.total ? (s.seen / s.total) * 100 : 0}%"></i></span>`)
      .join('')}</div>
    ${todo ? `<a class="btn block" href="#/cards/study/${esc(deck.id)}">Study ${todo} card${todo === 1 ? '' : 's'}</a>` : '<div class="empty-hint">All done for today.</div>'}
    ${p.placeable ? `<a class="place-link small" href="#/cards/place/${esc(deck.id)}">Already know some of these? Mark them</a>` : ''}
  </div>`;
}

function forecastChart(counts) {
  const max = Math.max(1, ...counts);
  const days = ['Today', 'Tmrw', ...Array.from({ length: 5 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() + i + 2);
    return d.toLocaleDateString('en-GB', { weekday: 'short' });
  })];
  return `<div class="fc-chart">${counts
    .map((n, i) => `<div class="fc-col" title="${days[i]}: ${n} review${n === 1 ? '' : 's'}"><span class="num">${n}</span><i style="height:${(n / max) * 100}%"></i><small>${days[i]}</small></div>`)
    .join('')}</div>`;
}

// ------------------------------------------------------------------ Placement sweep

let picked = null;

async function renderPlace(el, rerender, deck) {
  const now = new Date();
  const defs = cardsFromDeck(deck);
  const ids = new Set(defs.map((d) => d.id));
  const states = (await listStates(deck.id)).filter((r) => ids.has(r.id));
  const byId = new Map(states.map((s) => [s.id, s]));
  const touched = new Set(states.map((s) => s.note));
  const gate = stageGate(defs, byId, deck.stages);
  // Words in unlocked stages you haven't met yet, one row per word, in list order.
  const notes = deck.notes.filter((n) => gate.open.has(n.stage ?? 1) && !touched.has(n.id));
  if (!picked || picked.deck !== deck.id) picked = { deck: deck.id, ids: new Set() };
  const count = picked.ids.size;
  const cardCount = defs.filter((d) => picked.ids.has(d.noteId)).length;

  el.innerHTML = `
    <a class="back" href="#/cards">← Cards</a>
    <h1 class="page-title">Words you already know</h1>
    <p class="muted" style="max-width:56ch">Tap the ones you’d understand instantly, even in fast speech. They skip learning and come back in 3–6 weeks as a check. Anything you then get wrong drops back into normal reviews. Leave anything you’d hesitate on.</p>
    ${
      !notes.length
        ? '<div class="empty-hint" style="margin-top:14px">Nothing left to mark in the unlocked stages.</div>'
        : `<div class="place-bar card">
            <span id="place-count"><b class="num">${count}</b> marked <span class="muted small">(${cardCount} card${cardCount === 1 ? '' : 's'})</span></span>
            <button type="button" class="btn" id="place-save" ${count ? '' : 'disabled'}>Mark as known</button>
          </div>
          <div class="place-list">${notes
            .map((n) => `<button type="button" class="place-row" data-note="${esc(n.id)}" aria-pressed="${picked.ids.has(n.id)}">
                <span class="tick">${picked.ids.has(n.id) ? '✓' : ''}</span><b lang="${esc(deck.lang ?? 'es')}">${esc(n.es ?? n.q ?? n.name)}</b><span class="muted small">${esc(n.en ?? n.a ?? n.section ?? n.spec?.map((l) => l.type).join(', ') ?? '')}</span></button>`)
            .join('')}</div>`
    }`;

  el.querySelectorAll('.place-row').forEach((b) =>
    b.addEventListener('click', () => {
      const id = b.dataset.note;
      picked.ids.has(id) ? picked.ids.delete(id) : picked.ids.add(id);
      const on = picked.ids.has(id);
      b.setAttribute('aria-pressed', String(on));
      b.querySelector('.tick').textContent = on ? '✓' : '';
      const cards = defs.filter((d) => picked.ids.has(d.noteId)).length;
      el.querySelector('#place-count').innerHTML = `<b class="num">${picked.ids.size}</b> marked <span class="muted small">(${cards} card${cards === 1 ? '' : 's'})</span>`;
      el.querySelector('#place-save').disabled = !picked.ids.size;
    })
  );
  el.querySelector('#place-save')?.addEventListener('click', async (e) => {
    e.target.disabled = true;
    const n = await placeNotes(defs, [...picked.ids], byId, now);
    toast(`${picked.ids.size} word${picked.ids.size === 1 ? '' : 's'} marked known (${n} cards)`);
    picked = null;
    location.hash = '#/cards';
  });
}

// ------------------------------------------------------------------ Study session

let session = null;

async function startSession(deck) {
  const date = today();
  const now = new Date();
  const day = await loadDay(date, undefined, { log: false });
  const p = await planFor(deck, date, now, day);
  const fresh = p.due.fresh.slice(0, p.plan.count);
  // Learning steps first, then reviews with a new card every few.
  const queue = [...p.due.learning];
  const reviews = [...p.due.reviews];
  while (reviews.length || fresh.length) {
    for (let i = 0; i < 3 && reviews.length; i++) queue.push(reviews.shift());
    if (fresh.length) queue.push(fresh.shift());
  }
  session = {
    deckId: deck.id,
    date,
    rows: p.due.byId,
    queue,
    learning: [], // { def, due } re-shown in this session
    done: 0,
    newDone: 0,
    again: 0,
    started: Date.now(),
    suggested: p.plan.count,
    estMinutes: p.plan.estMinutes,
    current: null
  };
  const log = await getDayLog(date);
  await logCardsDay(date, {
    new_suggested: p.plan.count,
    new_reasons: p.plan.reasons,
    reviews_due: p.due.reviews.length,
    minutes_est: p.plan.estMinutes,
    sessions: (log?.cards?.sessions ?? 0) + 1,
    retention: 0.9
  });
}

function nextCard() {
  const now = Date.now();
  session.learning.sort((a, b) => a.due - b.due);
  if (session.learning[0] && session.learning[0].due <= now) return session.learning.shift().def;
  if (session.queue.length) return session.queue.shift();
  if (session.learning[0] && session.learning[0].due - now <= LEARN_AHEAD_MS) return session.learning.shift().def;
  return null;
}

async function renderStudy(el, rerender, deck) {
  if (!session || session.deckId !== deck.id || session.date !== today()) await startSession(deck);
  if (!session.current) session.current = { def: nextCard(), shownAt: Date.now(), revealed: false, typed: null };
  const cur = session.current;
  if (!cur.def) return renderDone(el, deck);

  const def = cur.def;
  const n = def.note;
  const row = session.rows.get(def.id) ?? null;
  const left = session.queue.length + session.learning.length + 1;
  const now = new Date();
  const opts = preview(row, now);

  el.innerHTML = `
    <div class="study-top">
      <a class="back" href="#/cards">← Cards</a>
      <span class="muted small num">${session.done} done · ${left} left</span>
      ${deck.audio === false ? '<span></span>' : `<button type="button" class="btn-mini" id="mute" aria-pressed="${muted()}">${muted() ? 'Sound off' : 'Sound on'}</button>`}
    </div>
    <div class="study-card card ${cur.revealed ? 'revealed' : ''}">
      <div class="study-type">${esc(CARD_TYPES[def.type])}${!row ? ' · <b>new</b>' : ''}</div>
      <div class="study-front">${frontHTML(def, cur)}</div>
      ${cur.revealed ? `<div class="study-back">${backHTML(def, cur)}</div>` : ''}
    </div>
    <div class="study-actions">
      ${
        !cur.revealed
          ? def.type === 'typed'
            ? '<button class="btn block" type="button" id="check">Check</button>'
            : '<button class="btn block" type="button" id="reveal">Show answer <span class="kbd">space</span></button>'
          : `<div class="rate-row">${RATINGS.map(
              ([r, label, key]) => `<button type="button" class="rate r${r}${cur.typed && suggestRating(cur.typed) === r ? ' suggested' : ''}" data-rate="${r}">
                <b>${label}</b><small>${intervalLabel(now, opts[r].card.due)}</small><span class="kbd">${key}</span></button>`
            ).join('')}</div>`
      }
    </div>`;

  // Media
  if (def.type === 'image' || (n.image && cur.revealed)) {
    const img = el.querySelector('.pic');
    if (img) {
      pictogram(n.image === true ? n.es.replace(/^(el|la|los|las|un|una) /i, '') : n.image).then((p) => {
        if (!p) {
          img.outerHTML = def.type === 'image' && !cur.revealed ? `<div class="study-prompt">${esc(n.en)}</div>` : '';
          return;
        }
        img.src = p.url;
        img.alt = '';
        img.hidden = false;
        const credit = el.querySelector('.credit-img');
        if (credit) credit.textContent = `Pictogram: ${p.author}, ${p.license}`;
      });
    }
  }
  const say = n.say ?? n.es;
  const playIt = () =>
    play(def.type === 'cloze' ? (parseCloze(n.cloze?.es)?.before ?? '') + (parseCloze(n.cloze?.es)?.answer ?? '') + (parseCloze(n.cloze?.es)?.after ?? '') : say).then((r) => {
      const credit = el.querySelector('.credit-audio');
      if (credit) credit.textContent = r.source === 'lingualibre' ? `Audio: ${r.author}, Lingua Libre, ${r.license}` : 'Audio: this device’s Spanish voice';
    });
  el.querySelectorAll('[data-play]').forEach((b) => b.addEventListener('click', playIt));
  const autoplay = deck.audio !== false && !muted() && ((def.type === 'audio' && !cur.revealed) || (cur.revealed && def.type !== 'audio') || (def.type === 'recog' && !cur.revealed));
  if (autoplay && !cur.autoplayed?.[cur.revealed ? 'back' : 'front']) {
    cur.autoplayed = { ...(cur.autoplayed ?? {}), [cur.revealed ? 'back' : 'front']: true };
    playIt();
  }

  const reveal = () => {
    cur.revealed = true;
    rerender();
  };
  el.querySelector('#reveal')?.addEventListener('click', reveal);
  const input = el.querySelector('#typed');
  el.querySelector('#check')?.addEventListener('click', () => {
    cur.typed = { input: input?.value ?? '', ...checkTyped(input?.value ?? '', n.es) };
    reveal();
  });
  input?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') el.querySelector('#check').click();
  });
  if (input && !cur.revealed) setTimeout(() => input.focus(), 50);
  el.querySelector('#mute')?.addEventListener('click', () => {
    try {
      localStorage.setItem('artemis-cards-muted', muted() ? '0' : '1');
    } catch {}
    rerender();
  });
  el.querySelectorAll('[data-rate]').forEach((b) => b.addEventListener('click', () => rate(Number(b.dataset.rate), rerender)));

  // Keyboard: space shows, 1–4 rates.
  const onKey = (e) => {
    if (e.target.tagName === 'INPUT') return;
    if (e.code === 'Space' && !cur.revealed) {
      e.preventDefault();
      (el.querySelector('#reveal') ?? el.querySelector('#check'))?.click();
    } else if (cur.revealed && ['1', '2', '3', '4'].includes(e.key)) rate(Number(e.key), rerender);
  };
  document.addEventListener('keydown', onKey);
  const stop = () => document.removeEventListener('keydown', onKey);
  window.addEventListener('hashchange', stop, { once: true });
  el.addEventListener('rerender-stop', stop, { once: true });
  session._stopKeys?.();
  session._stopKeys = stop;
}

function suggestRating(t) {
  if (!t.correct) return Rating.Again;
  return t.accents ? Rating.Good : Rating.Hard;
}

let answering = false;
async function rate(rating, rerender) {
  if (answering || !session?.current?.revealed) return;
  answering = true;
  try {
    const cur = session.current;
    const row = session.rows.get(cur.def.id) ?? null;
    const ms = Date.now() - cur.shownAt;
    const next = await answerCard(cur.def, row, rating, ms);
    session.rows.set(cur.def.id, next);
    session.done += 1;
    if (!row) session.newDone += 1;
    if (rating === Rating.Again) session.again += 1;
    const due = toFsrs(next).due.getTime();
    // Still in learning steps today: show it again in this session.
    if (due - Date.now() < 12 * 3600000) session.learning.push({ def: cur.def, due });
    session.current = null;
    await logCardsDay(session.date, { minutes_actual: await minutesToday(), reviews_done: session.done, new_done: session.newDone });
  } finally {
    answering = false;
  }
  rerender();
}

async function minutesToday() {
  const log = await getDayLog(today());
  const before = log?.cards?.minutes_before_session ?? null;
  const thisSession = Math.round((Date.now() - session.started) / 60000);
  if (before == null) {
    session.minutesBefore = log?.cards?.minutes_actual ?? 0;
    await logCardsDay(today(), { minutes_before_session: session.minutesBefore });
  }
  return (session.minutesBefore ?? before ?? 0) + thisSession;
}

function renderDone(el, deck) {
  const mins = Math.max(1, Math.round((Date.now() - session.started) / 60000));
  logCardsDay(session.date, { minutes_before_session: null });
  el.innerHTML = `
    <a class="back" href="#/cards">← Cards</a>
    <div class="card stack done-card" style="margin-top:16px;text-align:center">
      <span class="chipico" style="margin:0 auto">${ICONS.trophy}</span>
      <h2 style="margin:0">Done for now</h2>
      <p class="muted">${session.done} card${session.done === 1 ? '' : 's'} in ${mins} min${session.newDone ? `, ${session.newDone} new` : ''}${session.again ? `. ${session.again} to see again soon.` : '.'}</p>
      <a class="btn block" href="#/cards">Back to Cards</a>
    </div>`;
  toast(`${deck.name}: ${session.done} cards`);
  session = null;
}

// ------------------------------------------------------------------ Card faces

const audioBtn = (label = 'Play') => `<button type="button" class="play-btn" data-play aria-label="${label}">${ICONS.speaker}</button>`;

function frontHTML(def, cur) {
  const n = def.note;
  switch (def.type) {
    case 'qa':
      return `<div class="study-prompt">${esc(n.q)}</div>`;
    case 'spec':
      return `<div class="study-prompt">${esc(n.name)}</div><div class="muted small">What goes in it, and how much?</div>`;
    case 'serve':
      return `<div class="study-prompt">${esc(n.name)}</div><div class="muted small">Glass, ice, garnish and method?</div>`;
    case 'recog':
      return `<div class="study-word">${esc(n.es)}</div>${audioBtn('Hear it')}`;
    case 'prod':
      return `<div class="study-prompt">${esc(n.en)}</div>${n.hint ? `<div class="muted small">${esc(n.hint)}</div>` : ''}<div class="muted small">Say it in Spanish</div>`;
    case 'audio':
      return `<button type="button" class="play-big" data-play aria-label="Play">${ICONS.speaker}<span>Tap to listen</span></button>`;
    case 'image':
      return `<img class="pic" hidden><div class="muted small">What’s this in Spanish?</div>`;
    case 'cloze': {
      const c = parseCloze(n.cloze?.es) ?? { before: '', answer: n.es, after: '' };
      return `<div class="study-sentence">${esc(c.before)}<span class="gap">${cur.revealed ? esc(c.answer) : '___'}</span>${esc(c.after)}</div><div class="muted small">${esc(n.cloze?.en ?? n.en)}</div>`;
    }
    case 'typed':
      return `<div class="study-prompt">${esc(n.en)}</div>${
        cur.revealed
          ? `<div class="typed-result ${cur.typed?.correct ? (cur.typed.accents ? 'ok' : 'accent') : 'bad'}">${esc(cur.typed?.input || '(blank)')}</div>`
          : '<input class="field" id="typed" autocomplete="off" autocapitalize="off" spellcheck="false" lang="es" placeholder="Type the Spanish">'
      }`;
    default:
      return esc(n.es);
  }
}

function backHTML(def, cur) {
  const n = def.note;
  const ex = n.example ? `<div class="study-example"><span lang="es">${esc(n.example.es)}</span><span class="muted">${esc(n.example.en)}</span></div>` : '';
  const typedNote =
    def.type === 'typed' && cur.typed
      ? `<div class="muted small">${cur.typed.correct ? (cur.typed.accents ? 'Spot on.' : 'Right, but watch the accents.') : 'Not quite.'}</div>`
      : '';
  if (def.type === 'spec') {
    const rows = n.spec
      .map((l) => `<li><span class="ml num">${esc(l.amount)}</span><span>${esc(l.type)}${l.brand ? ` <span class="brand">${esc(l.brand)}</span>` : ''}${l.extra ? `<span class="muted small"> · ${esc(l.extra)}</span>` : ''}</span></li>`)
      .join('');
    const allergens = n.allergens == null ? 'Allergens not on this sheet: check the allergen matrix' : n.allergens.length ? `Allergens: ${n.allergens.join(', ')}` : 'Allergens: none listed';
    return `<ul class="spec-list">${rows}</ul><div class="muted small spec-allergens">${esc(allergens)}</div>`;
  }
  if (def.type === 'serve') {
    const row = (k, v) => `<dt>${k}</dt><dd>${esc(v)}</dd>`;
    return `<dl class="serve-list">${row('Glass', n.glass)}${row('Ice', n.ice)}${row('Garnish', n.garnish)}${row('Method', n.method)}</dl>${n.tip ? `<div class="study-note">${esc(n.tip)}</div>` : ''}`;
  }
  if (def.type === 'qa') return `<div class="study-answer qa-answer">${esc(n.a)}</div>${n.note ? `<div class="study-note">${esc(n.note)}</div>` : ''}`;
  const main =
    def.type === 'recog'
      ? `<div class="study-answer">${esc(n.en)}</div>`
      : `<div class="study-answer" lang="es">${esc(n.es)} ${audioBtn('Hear it')}</div><div class="muted">${esc(n.en)}</div>`;
  const forms = n.forms?.length ? `<div class="study-forms muted small">You’ll hear: <span lang="es">${n.forms.map(esc).join(', ')}</span></div>` : '';
  return `${typedNote}${main}${forms}${n.image && def.type !== 'image' ? '<img class="pic pic-small" hidden>' : ''}${ex}${n.note ? `<div class="study-note">${esc(n.note)}</div>` : ''}
    <div class="credits"><span class="credit-audio"></span><span class="credit-img"></span></div>`;
}
