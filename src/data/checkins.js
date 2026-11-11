import { db, live, save } from '../db.js';

// Skipped-day reasons and weekly reviews, stored in the synced checkins table.

export async function listGaps(database = db) {
  return (await live('checkins', database)).filter((c) => c.kind === 'gap');
}

export async function getCheckin(id, database = db) {
  const row = await database.checkins.get(id);
  return row && !row.deleted ? row : null;
}

export const saveGap = (gap, reason, database = db) =>
  save('checkins', { id: gap.id, kind: 'gap', date: gap.from, from: gap.from, to: gap.to, days: gap.days, reason }, database);

export const saveReview = (week, fields, database = db) =>
  save('checkins', { id: week.id, kind: 'review', date: week.start, start: week.start, end: week.end, ...fields }, database);
