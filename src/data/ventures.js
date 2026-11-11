import { db, getMeta, live, save, setMeta } from '../db.js';

// Ventures, their weekly scores, tasks under them, and each day's 3 lock-in tasks.

const SEED = [
  { id: 'venture:halden-labs', name: 'Halden Labs', notes: 'AI lead automation' },
  { id: 'venture:etsy-prints', name: 'Etsy prints', notes: 'Quote and art prints' },
  { id: 'venture:amazon-fba', name: 'Amazon FBA', notes: '' }
];
// Fixed, old timestamp: seeding on a second device writes identical rows, and any
// real edit on either device is newer, so a seed never undoes a change.
const SEED_TIME = '2026-11-11T00:00:00.000Z';

export async function seedVentures(database = db) {
  if (await getMeta('seeded_ventures', database)) return;
  await database.transaction('rw', database.ventures, database.outbox, async () => {
    for (const v of SEED) {
      if (await database.ventures.get(v.id)) continue;
      await database.ventures.put({ ...v, status: 'active', deleted: false, user_id: null, updated_at: SEED_TIME });
      await database.outbox.add({ table: 'ventures', row_id: v.id, queued_at: SEED_TIME });
    }
  });
  await setMeta('seeded_ventures', true, database);
}

export async function listVentures(database = db) {
  return (await live('ventures', database)).sort((a, b) => a.name.localeCompare(b.name));
}

export const saveVenture = (venture, database = db) => save('ventures', { status: 'active', notes: '', ...venture }, database);

export async function addScore(ventureId, ratings, date, database = db) {
  return save('venture_scores', { venture_id: ventureId, date, ...ratings }, database);
}

export const listScores = (database = db) => live('venture_scores', database);

export const listTasks = (database = db) => live('tasks', database);

export const saveTask = (task, database = db) => save('tasks', { done_date: null, ...task }, database);

// ---- Today's 3 ----

export const focusId = (date, taskId) => `focus:${date}:${taskId}`;

export async function focusFor(date, database = db) {
  return (await live('day_focus', database)).filter((f) => f.date === date).sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
}

export async function setFocus(date, picks, database = db) {
  const existing = await database.day_focus.where('date').equals(date).toArray();
  const keep = new Set(picks.map((p) => focusId(date, p.task_id)));
  for (const row of existing) {
    if (!row.deleted && !keep.has(row.id)) await save('day_focus', { ...row, deleted: true }, database);
  }
  for (const [order, p] of picks.entries()) {
    const id = focusId(date, p.task_id);
    const prev = await database.day_focus.get(id);
    await save('day_focus', { ...(prev ?? {}), id, date, order, done: prev?.done ?? false, ...p, deleted: false }, database);
  }
}

export async function toggleFocus(row, date, database = db) {
  const done = !row.done;
  await save('day_focus', { ...row, done }, database);
  const task = await database.tasks.get(row.task_id);
  if (task) await save('tasks', { ...task, done_date: done ? date : null }, database);
}
