// Cards: Browse (look anything up, see where each card stands, flags) and Practice
// (run through cards without touching the review schedule, e.g. before a shift).
import { clearFlag, listFlags, listReviews, listStates } from '../data/cards.js';
import { play } from '../data/media.js';
import { CARD_TYPES, cardsFromDeck, noteStatus, strugglingIds, intervalLabel } from '../logic/cards.js';
import { esc, toast } from '../ui.js';
import { backHTML, frontHTML } from './cards.js';

const label = (n) => n.name ?? n.es ?? n.q ?? n.id;
const subline = (n) => (n.spec ? n.spec.map((l) => l.type).join(', ') : n.a ?? n.en ?? '');
const haystack = (n) =>
  [n.name, n.es, n.en, n.q, n.a, n.note, n.tip, n.glass, n.garnish, n.method, n.section, ...(n.forms ?? []), ...(n.spec ?? []).flatMap((l) => [l.type, l.brand])]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');

/** Everything Browse and Practice need about a deck's cards right now. */
async function deckPicture(deck) {
  const defs = cardsFromDeck(deck);
  const ids = new Set(defs.map((d) => d.id));
  const [states, reviews, flags] = await Promise.all([listStates(deck.id).then((s) => s.filter((r) => ids.has(r.id))), listReviews(deck.id), listFlags(deck.id)]);
  const byId = new Map(states.map((s) => [s.id, s]));
  const struggling = strugglingIds(states, reviews);
  const flagged = new Map(flags.map((f) => [f.values.note, f.values]));
  const defsByNote = new Map();
  for (const d of defs) defsByNote.set(d.noteId, [...(defsByNote.get(d.noteId) ?? []), d]);
  const status = new Map(deck.notes.map((n) => [n.id, noteStatus(defsByNote.get(n.id) ?? [], byId, struggling)]));
  return { defs, byId, struggling, flagged, defsByNote, status };
}

/** For deck cards on the Cards screen. */
export async function deckExtras(deck) {
  const p = await deckPicture(deck);
  return { struggling: [...p.status.values()].filter((s) => s.key === 'struggling').length, flagged: p.flagged.size, met: p.byId.size };
}

// ------------------------------------------------------------------ Browse

const browseState = { deck: null, filter: 'all', query: '' };

function noteBody(n) {
  if (n.spec) return backHTML({ type: 'spec', note: n }, {}) + backHTML({ type: 'serve', note: n }, {});
  if (n.q) return `<div class="browse-answer">${esc(n.a)}</div>${n.note ? `<div class="study-note">${esc(n.note)}</div>` : ''}`;
  const ex = n.example ? `<div class="study-example"><span lang="es">${esc(n.example.es)}</span><span class="muted">${esc(n.example.en)}</span></div>` : '';
  const forms = n.forms?.length ? `<div class="muted small">You’ll hear: <span lang="es">${n.forms.map(esc).join(', ')}</span></div>` : '';
  return `<div class="browse-answer"><b lang="es">${esc(n.es)}</b> · ${esc(n.en)}</div>${forms}${ex}${n.note ? `<div class="study-note">${esc(n.note)}</div>` : ''}`;
}

export async function renderBrowse(el, rerender, deck) {
  if (browseState.deck !== deck.id) Object.assign(browseState, { deck: deck.id, filter: 'all', query: '' });
  const p = await deckPicture(deck);
  const now = new Date();
  const counts = { all: deck.notes.length, struggling: 0, flagged: p.flagged.size, new: 0, learning: 0, known: 0 };
  for (const s of p.status.values()) counts[s.key] += 1;
  const FILTERS = [['all', 'All'], ['struggling', 'Struggling'], ['flagged', 'Flagged'], ['new', 'New'], ['learning', 'Learning'], ['known', 'Known']];
  const shown = deck.notes.filter((n) => {
    const f = browseState.filter;
    return f === 'all' || (f === 'flagged' ? p.flagged.has(n.id) : p.status.get(n.id).key === f);
  });
  // Group by menu section, else by stage.
  const stageName = (id) => deck.stages?.find((s) => s.id === id)?.name ?? `Stage ${id}`;
  const groups = new Map();
  for (const n of shown) {
    const g = n.section ?? (deck.stages?.length > 1 ? stageName(n.stage ?? 1) : '');
    groups.set(g, [...(groups.get(g) ?? []), n]);
  }

  const row = (n) => {
    const st = p.status.get(n.id);
    const flag = p.flagged.get(n.id);
    const due = st.nextDue ? (st.nextDue <= now ? 'due now' : `next ${intervalLabel(now, st.nextDue)}`) : '';
    return `<details class="browse-row" data-hay="${esc(haystack(n))}">
      <summary>
        <span class="b-main"><b ${n.es && !n.name ? 'lang="es"' : ''}>${esc(label(n))}</b><span class="muted small">${esc(subline(n))}</span></span>
        <span class="b-side">${flag ? '<span class="b-flag" title="Flagged">⚑</span>' : ''}<span class="pill pill-${st.key}">${st.label}</span></span>
      </summary>
      <div class="browse-body">
        ${noteBody(n)}
        <div class="b-meta muted small">${(p.defsByNote.get(n.id) ?? []).map((d) => esc(CARD_TYPES[d.type])).join(' · ')}${due ? ` · ${due}` : ''}</div>
        ${flag ? `<div class="b-flagnote"><span>⚑ ${esc(flag.text || 'Flagged (no note)')}</span><button type="button" class="btn-mini" data-unflag="${esc(n.id)}">Remove flag</button></div>` : ''}
      </div>
    </details>`;
  };

  el.innerHTML = `
    <a class="back" href="#/cards">← Cards</a>
    <h1 class="page-title">${esc(deck.name)}</h1>
    <div class="browse-tools">
      <input class="field" type="search" id="browse-q" placeholder="${deck.notes.some((n) => n.spec) ? 'Search drinks, spirits, glasses…' : 'Search'}" value="${esc(browseState.query)}" autocomplete="off">
      <div class="filter-row">${FILTERS.filter(([k]) => k === 'all' || counts[k])
        .map(([k, t]) => `<button type="button" class="filter${browseState.filter === k ? ' on' : ''}" data-filter="${k}">${t} <span class="num">${counts[k]}</span></button>`)
        .join('')}</div>
      ${
        counts.struggling || counts.flagged
          ? `<a class="btn secondary block" href="#/cards/practice/${esc(deck.id)}">Practise ${counts.struggling ? `the ${counts.struggling} you’re struggling with` : 'these'}</a>`
          : ''
      }
    </div>
    <div class="browse-list">${[...groups]
      .map(([g, notes]) => `<section class="browse-group">${g ? `<h3 class="browse-h">${esc(g)}</h3>` : ''}${notes.map(row).join('')}</section>`)
      .join('')}</div>
    <p class="muted small browse-empty" ${shown.length ? 'hidden' : ''}>Nothing here.</p>`;

  const q = el.querySelector('#browse-q');
  const apply = () => {
    const term = q.value.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    browseState.query = q.value;
    let any = 0;
    el.querySelectorAll('.browse-group').forEach((g) => {
      let visible = 0;
      g.querySelectorAll('.browse-row').forEach((r) => {
        const hit = !term || r.dataset.hay.includes(term);
        r.hidden = !hit;
        if (hit) visible++;
        if (term && hit && visible <= 3) r.open = r.open || g.querySelectorAll('.browse-row:not([hidden])').length <= 3;
      });
      g.hidden = !visible;
      any += visible;
    });
    el.querySelector('.browse-empty').hidden = any > 0;
  };
  q.addEventListener('input', apply);
  if (browseState.query) apply();
  el.querySelectorAll('[data-filter]').forEach((b) =>
    b.addEventListener('click', () => {
      browseState.filter = b.dataset.filter;
      rerender();
    })
  );
  el.querySelectorAll('[data-unflag]').forEach((b) =>
    b.addEventListener('click', async () => {
      await clearFlag(b.dataset.unflag);
      toast('Flag removed');
      rerender();
    })
  );
}

// ------------------------------------------------------------------ Practice

let preset = null; // { deck, ids, label } from the last study session
let practice = null;

export function setPracticePreset(deckId, ids, labelText) {
  preset = { deck: deckId, ids, label: labelText };
}

// Card types that work without the review machinery (audio/image need media; typed becomes "say it").
const PRACTICE_TYPES = new Set(['qa', 'spec', 'serve', 'recog', 'prod', 'cloze', 'typed']);
const shuffle = (a) => {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

function practiceModes(deck, p) {
  const usable = p.defs.filter((d) => PRACTICE_TYPES.has(d.type));
  const modes = [];
  if (preset?.deck === deck.id) {
    const ids = new Set(preset.ids);
    modes.push({ key: 'preset', title: preset.label, defs: usable.filter((d) => ids.has(d.id)) });
  }
  modes.push({ key: 'struggling', title: 'Struggling', hint: 'Cards you’ve forgotten or keep missing', defs: usable.filter((d) => p.struggling.has(d.id)) });
  modes.push({ key: 'flagged', title: 'Flagged', defs: usable.filter((d) => p.flagged.has(d.noteId)) });
  modes.push({ key: 'met', title: 'Everything you’ve met', defs: usable.filter((d) => p.byId.has(d.id)) });
  modes.push({ key: 'all', title: 'Whole deck', hint: 'Including cards you haven’t been introduced to', defs: usable });
  return modes.filter((m) => m.defs.length);
}

export async function renderPractice(el, rerender, deck) {
  if (practice && practice.deck === deck.id && practice.running) return renderPracticeCard(el, rerender, deck);
  const p = await deckPicture(deck);
  const modes = practiceModes(deck, p);
  const types = [...new Set(p.defs.filter((d) => PRACTICE_TYPES.has(d.type)).map((d) => d.type))];
  const typeFilter = practice?.deck === deck.id ? practice.type ?? 'all' : 'all';
  const sizes = [10, 20, 0];
  const size = practice?.deck === deck.id ? practice.size ?? 20 : 20;
  el.innerHTML = `
    <a class="back" href="#/cards">← Cards</a>
    <h1 class="page-title">Practise: ${esc(deck.name)}</h1>
    <p class="muted" style="max-width:56ch">A quick run-through that doesn’t touch your review schedule. Good before a shift.</p>
    ${
      types.length > 1
        ? `<div class="filter-row" style="margin:10px 0">${['all', ...types]
            .map((t) => `<button type="button" class="filter${typeFilter === t ? ' on' : ''}" data-type="${t}">${t === 'all' ? 'All card types' : esc(CARD_TYPES[t])}</button>`)
            .join('')}</div>`
        : ''
    }
    <div class="filter-row" style="margin:0 0 12px"><span class="muted small" style="align-self:center">How many</span>${sizes
      .map((s) => `<button type="button" class="filter${size === s ? ' on' : ''}" data-size="${s}">${s || 'All'}</button>`)
      .join('')}</div>
    <div class="practice-modes">${
      modes.length
        ? modes
            .map((m) => {
              const n = m.defs.filter((d) => typeFilter === 'all' || d.type === typeFilter).length;
              return `<button type="button" class="card practice-mode" data-mode="${m.key}" ${n ? '' : 'disabled'}>
                <span><b>${esc(m.title)}</b>${m.hint ? `<span class="muted small">${esc(m.hint)}</span>` : ''}</span><span class="num">${n}</span></button>`;
            })
            .join('')
        : '<div class="empty-hint">Nothing to practise yet.</div>'
    }</div>`;

  el.querySelectorAll('[data-type]').forEach((b) =>
    b.addEventListener('click', () => {
      practice = { ...(practice?.deck === deck.id ? practice : {}), deck: deck.id, type: b.dataset.type, running: false };
      rerender();
    })
  );
  el.querySelectorAll('[data-size]').forEach((b) =>
    b.addEventListener('click', () => {
      practice = { ...(practice?.deck === deck.id ? practice : {}), deck: deck.id, size: Number(b.dataset.size), running: false };
      rerender();
    })
  );
  el.querySelectorAll('[data-mode]').forEach((b) =>
    b.addEventListener('click', () => {
      const m = modes.find((x) => x.key === b.dataset.mode);
      let defs = shuffle(m.defs.filter((d) => typeFilter === 'all' || d.type === typeFilter));
      if (size) defs = defs.slice(0, size);
      startPractice(deck, defs, { type: typeFilter, size });
      rerender();
    })
  );
}

function startPractice(deck, defs, opts) {
  practice = { deck: deck.id, running: true, queue: [...defs], total: defs.length, first: new Map(), tries: new Map(), current: null, ...opts };
}

function renderPracticeCard(el, rerender, deck) {
  const pr = practice;
  if (!pr.current) {
    const def = pr.queue.shift();
    pr.current = def ? { def, revealed: false } : null;
  }
  if (!pr.current) return renderPracticeDone(el, rerender, deck);
  const cur = pr.current;
  const def = cur.def.type === 'typed' ? { ...cur.def, type: 'prod' } : cur.def;
  const right = [...pr.first.values()].filter(Boolean).length;
  el.innerHTML = `
    <div class="study-top">
      <button type="button" class="back link-btn" id="end">← End</button>
      <span class="muted small num">${pr.first.size} / ${pr.total} · ${right} right first time</span>
      <span class="pill pill-learning">Practice</span>
    </div>
    <div class="study-card card ${cur.revealed ? 'revealed' : ''}">
      <div class="study-type">${esc(CARD_TYPES[def.type])}</div>
      <div class="study-front">${frontHTML(def, cur)}</div>
      ${cur.revealed ? `<div class="study-back">${backHTML(def, cur)}</div>` : ''}
    </div>
    <div class="study-actions">
      ${
        cur.revealed
          ? `<div class="rate-row two"><button type="button" class="rate r1" data-got="0"><b>Missed it</b><span class="kbd">1</span></button><button type="button" class="rate r3" data-got="1"><b>Got it</b><span class="kbd">2</span></button></div>`
          : '<button class="btn block" type="button" id="reveal">Show answer <span class="kbd">space</span></button>'
      }
    </div>`;

  el.querySelectorAll('[data-play]').forEach((b) => b.addEventListener('click', () => play(def.note.say ?? def.note.es)));
  const reveal = () => {
    cur.revealed = true;
    rerender();
  };
  const answer = (got) => {
    const id = cur.def.id;
    if (!pr.first.has(id)) pr.first.set(id, got);
    const tries = (pr.tries.get(id) ?? 0) + 1;
    pr.tries.set(id, tries);
    if (!got && tries < 3) pr.queue.splice(Math.min(pr.queue.length, 3 + Math.floor(Math.random() * 3)), 0, cur.def); // back in a few cards
    pr.current = null;
    rerender();
  };
  el.querySelector('#reveal')?.addEventListener('click', reveal);
  el.querySelectorAll('[data-got]').forEach((b) => b.addEventListener('click', () => answer(b.dataset.got === '1')));
  el.querySelector('#end').addEventListener('click', () => {
    pr.running = false;
    pr.current = null;
    rerender();
  });
  const onKey = (e) => {
    if (e.target.tagName === 'INPUT') return;
    if (e.code === 'Space' && !cur.revealed) {
      e.preventDefault();
      reveal();
    } else if (cur.revealed && (e.key === '1' || e.key === '2')) answer(e.key === '2');
  };
  document.addEventListener('keydown', onKey);
  const stop = () => document.removeEventListener('keydown', onKey);
  window.addEventListener('hashchange', stop, { once: true });
  practice._stopKeys?.();
  practice._stopKeys = stop;
}

function renderPracticeDone(el, rerender, deck) {
  const pr = practice;
  const right = [...pr.first.values()].filter(Boolean).length;
  const missedIds = [...pr.first].filter(([, got]) => !got).map(([id]) => id);
  const defs = cardsFromDeck(deck);
  const missed = defs.filter((d) => missedIds.includes(d.id));
  const names = [...new Set(missed.map((d) => label(d.note)))];
  el.innerHTML = `
    <a class="back" href="#/cards">← Cards</a>
    <div class="card stack done-card" style="margin-top:16px;text-align:center">
      <h2 style="margin:0">${right} / ${pr.total} first time</h2>
      <p class="muted">${pr.total ? Math.round((right / pr.total) * 100) : 0}% right. Your review schedule wasn’t changed.</p>
      ${names.length ? `<div class="done-missed"><span class="muted small">To look at again</span><div class="miss-list">${names.map((x) => `<span class="miss">${esc(x)}</span>`).join('')}</div></div>` : ''}
      ${missed.length ? `<button type="button" class="btn block" id="again">Go again with these ${missed.length}</button>` : ''}
      <button type="button" class="btn secondary block" id="more">Practise something else</button>
    </div>`;
  el.querySelector('#again')?.addEventListener('click', () => {
    startPractice(deck, shuffle([...missed]), { type: pr.type, size: pr.size });
    rerender();
  });
  el.querySelector('#more').addEventListener('click', () => {
    pr.running = false;
    rerender();
  });
}
