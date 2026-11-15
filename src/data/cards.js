import { db, live, save } from '../db.js';
import { createEmptyCard } from 'ts-fsrs';
import { fromFsrs, placedState, scheduler, toFsrs } from '../logic/cards.js';

// Card memory states and review logs (both synced), plus the per-day flashcard log.

export const listStates = async (deckId, database = db) => (await live('fc_cards', database)).filter((r) => r.deck === deckId);
export const listReviews = async (deckId, database = db) => (await live('fc_reviews', database)).filter((r) => !deckId || r.deck === deckId);

const uid = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`);
const localDate = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** Record an answer: new FSRS state for the card, and a review log row for tuning. */
export async function answerCard(def, row, rating, ms, now = new Date(), database = db) {
  const prev = toFsrs(row) ?? createEmptyCard(now);
  const isNew = !row;
  const { card } = scheduler.next(prev, now, rating);
  const date = localDate(now);
  const next = {
    ...(row ?? {}),
    id: def.id,
    deck: def.deck,
    stage: def.stage,
    type: def.type,
    note: def.noteId,
    introduced: row?.introduced ?? date,
    fsrs: fromFsrs(card)
  };
  await save('fc_cards', next, database);
  await save(
    'fc_reviews',
    {
      id: uid(),
      card_id: def.id,
      deck: def.deck,
      stage: def.stage,
      type: def.type,
      rating,
      ms: Math.round(ms),
      at: now.toISOString(),
      date,
      is_new: isNew,
      prev_state: prev.state
    },
    database
  );
  return next;
}

/** Merge flashcard numbers into the day's tuning row (created by day load). */
export async function logCardsDay(date, fields, database = db) {
  const id = `day:${date}`;
  const existing = (await database.day_logs.get(id)) ?? { id, date };
  return save('day_logs', { ...existing, cards: { ...(existing.cards ?? {}), ...fields } }, database);
}

export const getDayLog = (date, database = db) => database.day_logs.get(`day:${date}`);

/**
 * Placement sweep: mark notes as already known. Every card of each note gets a review state
 * 3–6 weeks out (spread so they don't pile up on one day). No review log rows are written,
 * so stats and forgetting rates only ever reflect real answers. A known word you then get
 * wrong comes back through normal reviews.
 */
export async function placeNotes(defs, noteIds, existing, now = new Date(), database = db) {
  const ids = new Set(noteIds);
  const date = localDate(now);
  let n = 0;
  for (const def of defs) {
    if (!ids.has(def.noteId) || existing.has(def.id)) continue;
    const days = 21 + Math.floor(Math.random() * 25);
    await save('fc_cards', { id: def.id, deck: def.deck, stage: def.stage, type: def.type, note: def.noteId, placed: date, fsrs: fromFsrs(placedState(now, days)) }, database);
    n++;
  }
  const log = await getDayLog(date, database);
  await logCardsDay(date, { placed: (log?.cards?.placed ?? 0) + ids.size }, database);
  return n;
}
