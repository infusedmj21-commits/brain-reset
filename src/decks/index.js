// Decks are JSON files in this folder, written by Claude and pushed to the repo.
const files = import.meta.glob('./*.json', { eager: true });
export const DECKS = Object.values(files)
  .map((m) => m.default ?? m)
  .filter((d) => d && d.id && Array.isArray(d.notes))
  .sort((a, b) => (a.order ?? 99) - (b.order ?? 99));
export const deckById = (id) => DECKS.find((d) => d.id === id) ?? null;
