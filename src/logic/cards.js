// Flashcard engine: FSRS scheduling (ts-fsrs, 90% desired retention), card types from deck
// files, staged new cards, and an adaptive daily new-card count.
//
// Decks are JSON files in src/decks, written by Claude and pushed to the repo. A deck is a
// list of notes; each note lists the card types it should produce. Only card *state* (FSRS
// memory) and review logs live in the database.
import { Rating, State, createEmptyCard, fsrs, generatorParameters } from 'ts-fsrs';

export const RETENTION = 0.9;
export const scheduler = fsrs(generatorParameters({ request_retention: RETENTION, enable_fuzz: true }));
export { Rating, State };

export const CARD_TYPES = {
  recog: 'Spanish → English',
  prod: 'English → Spanish',
  audio: 'Listen',
  image: 'Picture',
  cloze: 'Fill the gap',
  typed: 'Type it',
  qa: 'Question',
  spec: 'Recipe',
  serve: 'Glass & method'
};

/** Every card a deck defines, in introduction order (stage, then note order, then type order). */
export function cardsFromDeck(deck) {
  const out = [];
  const typeOrder = Object.keys(CARD_TYPES);
  deck.notes.forEach((note, i) => {
    const types = [...(note.cards ?? ['recog'])].sort((a, b) => typeOrder.indexOf(a) - typeOrder.indexOf(b));
    for (const type of types) {
      out.push({ id: `${note.id}:${type}`, noteId: note.id, deck: deck.id, stage: note.stage ?? 1, type, order: (note.stage ?? 1) * 1e6 + i * 10 + typeOrder.indexOf(type), note });
    }
  });
  return out.sort((a, b) => a.order - b.order);
}

// ---- Stored state <-> ts-fsrs card ----
export function toFsrs(row) {
  if (!row?.fsrs) return null;
  const c = row.fsrs;
  return { ...c, due: new Date(c.due), last_review: c.last_review ? new Date(c.last_review) : undefined };
}
export function fromFsrs(card) {
  return { ...card, due: card.due.toISOString(), last_review: card.last_review ? new Date(card.last_review).toISOString() : null };
}

/** Next state for each rating, for the button labels and the answer. */
export function preview(row, now) {
  const card = toFsrs(row) ?? createEmptyCard(now);
  return scheduler.repeat(card, now);
}

/** "1m", "10m", "2d", "3w", "4mo" */
export function intervalLabel(from, due) {
  const mins = Math.max(1, Math.round((due - from) / 60000));
  if (mins < 60) return `${mins}m`;
  const hours = mins / 60;
  if (hours < 24) return `${Math.round(hours)}h`;
  const days = hours / 24;
  if (days < 14) return `${Math.round(days)}d`;
  if (days < 60) return `${Math.round(days / 7)}w`;
  if (days < 365) return `${Math.round(days / 30)}mo`;
  return `${(days / 365).toFixed(1)}y`;
}

const endOfDay = (now) => {
  const d = new Date(now);
  d.setHours(23, 59, 59, 999);
  return d;
};

/**
 * New cards that may be introduced today. Recognition comes first: a note's later cards
 * (production, picture, listening) only arrive on a day after one of its cards was introduced,
 * and never two new cards from the same note on one day.
 */
export function introducible(fresh, states, date) {
  const introducedBefore = new Set();
  const introducedToday = new Set();
  for (const s of states) {
    if (!s.introduced) continue;
    const note = s.note ?? s.id.split(':').slice(0, -1).join(':');
    (s.introduced === date ? introducedToday : introducedBefore).add(note);
  }
  const firstOfNote = new Map();
  for (const d of fresh) if (!firstOfNote.has(d.noteId)) firstOfNote.set(d.noteId, d.id);
  const picked = new Set();
  return fresh.filter((d) => {
    if (introducedToday.has(d.noteId) || picked.has(d.noteId)) return false;
    const isFirst = !introducedBefore.has(d.noteId) && firstOfNote.get(d.noteId) === d.id;
    if (!isFirst && !introducedBefore.has(d.noteId)) return false;
    picked.add(d.noteId);
    return true;
  });
}

/** Cards that need doing: learning steps due now, reviews due today, and fresh cards available. */
export function dueSummary(defs, states, now) {
  const byId = new Map(states.map((s) => [s.id, s]));
  const learning = [];
  const reviews = [];
  const fresh = [];
  for (const d of defs) {
    const st = byId.get(d.id);
    const card = toFsrs(st);
    if (!card) fresh.push(d);
    else if (card.state === State.Review) {
      if (card.due <= endOfDay(now)) reviews.push(d);
    } else if (card.due <= now) learning.push(d);
  }
  return { learning, reviews, fresh, byId };
}

// ---- Adaptive new-card count ----
// new = 20 × day-load factor × performance factor, capped so the day's estimated time fits
// its budget, never below 5 (0 on Minimum days). Review load is the main driver.
export const NEW_BASE = 20;
export const TIER_FACTOR = { full: 1, normal: 0.8, light: 0.5, minimum: 0 };
export const TIME_BUDGET_MIN = { full: 30, normal: 25, light: 15, minimum: 10 };
export const SECONDS_PER_REVIEW = 9;
export const SECONDS_PER_NEW = 35; // first sight plus its learning steps
export const MIN_NEW = 5;
export const TARGET_FORGET = 1 - RETENTION;

/** Share of mature reviews (not new or learning cards) answered Again over the last 7 days. */
export function forgetRate(reviews, now) {
  const since = now.getTime() - 7 * 86400000;
  const mature = reviews.filter((r) => !r.deleted && r.prev_state === State.Review && new Date(r.at).getTime() >= since);
  if (mature.length < 20) return { rate: null, count: mature.length };
  return { rate: mature.filter((r) => r.rating === Rating.Again).length / mature.length, count: mature.length };
}

/** Forget rate near the 10% target leaves pace alone; well above it slows new cards, well below speeds up a little. */
export function performanceFactor(rate) {
  if (rate == null) return 1;
  return Math.min(1.2, Math.max(0.5, 1 - (rate - TARGET_FORGET) * 3));
}

export function adaptiveNew({ tier, reviewsDue, learningDue = 0, rate, available, doneToday = 0 }) {
  const reasons = [];
  if (tier === 'minimum') {
    return { count: 0, total: 0, reasons: ['Minimum day: reviews only'], estMinutes: Math.ceil(((reviewsDue + learningDue) * SECONDS_PER_REVIEW) / 60) };
  }
  const dayF = TIER_FACTOR[tier] ?? 1;
  const perfF = performanceFactor(rate);
  let total = Math.round(NEW_BASE * dayF * perfF);
  const reviewSecs = (reviewsDue + learningDue) * SECONDS_PER_REVIEW;
  const budget = (TIME_BUDGET_MIN[tier] ?? 25) * 60;
  const fits = Math.floor(Math.max(0, budget - reviewSecs) / SECONDS_PER_NEW);
  const capped = fits < total;
  if (capped) total = fits;
  total = Math.max(MIN_NEW, total);
  total = Math.min(total, available + doneToday);
  const count = Math.max(0, total - doneToday);

  const tierName = { full: 'Full day', normal: 'Normal day', light: 'Light day' }[tier] ?? tier;
  reasons.push(tierName);
  if (reviewsDue) reasons.push(`${reviewsDue} review${reviewsDue === 1 ? '' : 's'} due`);
  if (rate != null) reasons.push(`forgetting ${Math.round(rate * 100)}% this week${perfF < 0.95 ? ', so slower' : perfF > 1.05 ? ', so a bit faster' : ''}`);
  if (capped && total === MIN_NEW) reasons.push('reviews fill the time, so the minimum 5');
  else if (capped) reasons.push(`capped to fit ${TIME_BUDGET_MIN[tier]} min`);
  const estMinutes = Math.ceil((reviewSecs + count * SECONDS_PER_NEW) / 60);
  return { count, total, reasons, estMinutes, dayFactor: dayF, perfFactor: perfF };
}

/** Reviews falling due on each of the next n days (day 0 = today, including overdue). */
export function forecast(states, now, days = 7) {
  const out = Array.from({ length: days }, () => 0);
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  for (const s of states) {
    const card = toFsrs(s);
    if (!card || card.state === State.New) continue;
    const idx = Math.max(0, Math.floor((card.due - start) / 86400000));
    if (idx < days) out[idx] += 1;
  }
  return out;
}

// ---- Answer checking for typed cards ----
const fold = (s) =>
  String(s)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[¿?¡!.,;:"'()]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
const plain = (s) => String(s).toLowerCase().replace(/[¿?¡!.,;:"'()]/g, '').replace(/\s+/g, ' ').trim();

/** Right, right apart from accents, or wrong. Several answers can be given as "a / b". */
export function checkTyped(input, answer) {
  const options = String(answer).split('/').map((x) => x.trim());
  if (options.some((o) => plain(o) === plain(input))) return { correct: true, accents: true };
  if (options.some((o) => fold(o) === fold(input))) return { correct: true, accents: false };
  return { correct: false, accents: false };
}

/** "¿Dónde [está] el baño?" -> parts for a single-gap cloze. */
export function parseCloze(text) {
  const m = String(text).match(/^(.*)\[(.+?)\](.*)$/);
  return m ? { before: m[1], answer: m[2], after: m[3] } : null;
}

// ---- Stage gate ----
// A stage's new cards wait until most of the stage before it is settled: answered well enough
// that its next review is at least a week away. Words marked known in the placement sweep
// count as settled.
export const GATE_SHARE = 0.85;
export const SETTLED_DAYS = 7;

export function isSettled(row) {
  const c = toFsrs(row);
  if (!c || c.state !== State.Review || !c.last_review) return false;
  return (c.due - c.last_review) / 86400000 >= SETTLED_DAYS - 0.5;
}

/** Share of a whole deck that is settled: used to hold one deck back until another is learned. */
export function deckSettled(defs, byId) {
  const settled = defs.filter((d) => isSettled(byId.get(d.id))).length;
  return { settled, total: defs.length, need: Math.ceil(defs.length * GATE_SHARE), open: settled >= Math.ceil(defs.length * GATE_SHARE) };
}

/** Which stages may introduce new cards, and (if one is waiting) how close it is to opening. */
export function stageGate(defs, byId, stages) {
  const ids = (stages?.length ? stages : [{ id: 1 }]).map((s) => s.id);
  const open = new Set([ids[0]]);
  for (let i = 1; i < ids.length; i++) {
    const prev = defs.filter((d) => d.stage === ids[i - 1]);
    const settled = prev.filter((d) => isSettled(byId.get(d.id))).length;
    const need = Math.ceil(prev.length * GATE_SHARE);
    if (settled < need) return { open, waiting: { stage: ids[i], prev: ids[i - 1], settled, need, total: prev.length } };
    open.add(ids[i]);
  }
  return { open, waiting: null };
}

// ---- Placement ----
/**
 * FSRS state for a word marked "I know this": a review card whose next check is `days` away
 * (spread 21–45 days by the caller so they don't all land on one day). At 90% retention the
 * interval equals stability, so stability = days keeps the model consistent.
 */
export function placedState(now, days) {
  const base = scheduler.next(createEmptyCard(now), now, Rating.Easy).card;
  return { ...base, state: State.Review, stability: days, scheduled_days: days, last_review: now, due: new Date(now.getTime() + days * 86400000) };
}
