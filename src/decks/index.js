import { db, live, save } from '../db.js';

// Decks are JSON files in this folder (shipped with the app), plus decks imported in the app.
// Imported decks are for material that mustn't be public (e.g. a venue's own recipe sheets):
// they're saved to the user's own synced data, never to the code.
const files = import.meta.glob('./*.json', { eager: true });
const BUNDLED = Object.values(files)
  .map((m) => m.default ?? m)
  .filter((d) => d && d.id && Array.isArray(d.notes));
const byOrder = (a, b) => (a.order ?? 99) - (b.order ?? 99);

export const DECKS = [...BUNDLED].sort(byOrder);
export const deckById = (id) => DECKS.find((d) => d.id === id) ?? null;

/** Throws a readable reason if this isn't a deck the app can use. */
export function checkDeck(d) {
  if (!d || typeof d !== 'object') throw new Error('That file isn’t a deck.');
  if (typeof d.id !== 'string' || !/^[a-z0-9-]{1,40}$/.test(d.id)) throw new Error('The deck needs a short id.');
  if (typeof d.name !== 'string' || !d.name.trim()) throw new Error('The deck needs a name.');
  if (!Array.isArray(d.notes) || !d.notes.length) throw new Error('The deck has no cards.');
  if (BUNDLED.some((b) => b.id === d.id)) throw new Error(`“${d.name}” would replace a built-in deck.`);
  const ids = new Set();
  for (const n of d.notes) {
    if (typeof n?.id !== 'string' || !/^[^:]+:.+/.test(n.id)) throw new Error('A card is missing its id.');
    if (ids.has(n.id)) throw new Error(`Two cards share the id ${n.id}.`);
    ids.add(n.id);
    if (!Array.isArray(n.cards) || !n.cards.length) throw new Error(`${n.id} has no card types.`);
  }
  return d;
}

/** Load imported decks (synced from the user's account) next to the built-in ones. */
export async function loadImportedDecks(database = db) {
  const rows = (await live('checkins', database)).filter((r) => r.kind === 'deck');
  const imported = [];
  for (const r of rows) {
    try {
      imported.push(checkDeck(r.values));
    } catch {
      /* skip a broken row rather than break the Cards screen */
    }
  }
  DECKS.splice(0, DECKS.length, ...BUNDLED, ...imported);
  DECKS.sort(byOrder);
  return DECKS;
}

/** Save a deck file into the user's own data. Importing again replaces it; progress is kept by card id. */
export async function importDeck(deck, database = db) {
  checkDeck(deck);
  await save('checkins', { id: `deck:${deck.id}`, kind: 'deck', date: '', values: deck }, database);
  return loadImportedDecks(database);
}
