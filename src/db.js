import Dexie from 'dexie';

// Local database: the source of truth on each device.
// Every synced row carries id, updated_at, deleted and user_id so phase 4 sync
// can push the outbox to Supabase without changing this schema's shape.

export const SYNCED_TABLES = [
  'day_plans',
  'habit_logs',
  'sprint_scores',
  'palaces',
  'palace_sessions',
  'unprompted_sessions',
  'weekly_reviews',
  'sprint_rounds'
];

export function createDB(name = 'brain-reset') {
  const db = new Dexie(name);
  db.version(1).stores({
    day_plans: 'id, date, updated_at',
    habit_logs: 'id, date, habit, [date+habit], updated_at',
    sprint_scores: 'id, date, updated_at',
    palaces: 'id, updated_at',
    palace_sessions: 'id, date, palace_id, updated_at',
    unprompted_sessions: 'id, date, updated_at',
    weekly_reviews: 'id, week_start, updated_at',
    outbox: '++seq, table, row_id',
    meta: 'key'
  });
  // v2: blobs holds files such as notes photos. Kept out of JSON export (too big);
  // phase 4 uploads them to Supabase Storage.
  db.version(2).stores({
    blobs: 'id, updated_at'
  });
  // v3: every in-app arithmetic round, with its settings and per-problem timings.
  db.version(3).stores({
    sprint_rounds: 'id, date, updated_at'
  });
  return db;
}

export const db = createDB();

const uuid = () => crypto.randomUUID();
const now = () => new Date().toISOString();

// One row per day, so the id is derived from the date. Two devices logging the
// same day then write the same row instead of creating duplicates.
export const dayPlanId = (date) => `day:${date}`;
export const habitLogId = (date, habit) => `habit:${date}:${habit}`;
export const sprintId = (date) => `sprint:${date}`;

/** Insert or update a row and queue it for sync, in one transaction. */
export async function save(table, row, database = db) {
  const record = {
    deleted: false,
    user_id: null,
    ...row,
    id: row.id ?? uuid(),
    updated_at: now()
  };
  await database.transaction('rw', database.table(table), database.outbox, async () => {
    await database.table(table).put(record);
    await database.outbox.add({ table, row_id: record.id, queued_at: record.updated_at });
  });
  return record;
}

/** Soft delete, so the deletion syncs to other devices. */
export async function remove(table, id, database = db) {
  const existing = await database.table(table).get(id);
  if (!existing) return null;
  return save(table, { ...existing, deleted: true }, database);
}

/** All non-deleted rows of a table, optionally filtered by an index range. */
export async function live(table, database = db) {
  return (await database.table(table).toArray()).filter((r) => !r.deleted);
}

// ---- Routine-specific helpers ----

export async function getDayPlan(date, database = db) {
  const row = await database.day_plans.get(dayPlanId(date));
  return row && !row.deleted ? row : null;
}

export async function setDayPlan(date, fields, database = db) {
  const existing = (await getDayPlan(date, database)) ?? { id: dayPlanId(date), date };
  return save('day_plans', { ...existing, ...fields }, database);
}

export async function setHabit(date, habit, done, extra = {}, database = db) {
  const id = habitLogId(date, habit);
  const existing = await database.habit_logs.get(id);
  return save('habit_logs', { ...(existing ?? {}), id, date, habit, done, ...extra }, database);
}

/** { date: Set(doneHabits) } for every logged day. */
export async function doneByDate(database = db) {
  const map = {};
  for (const log of await live('habit_logs', database)) {
    if (!log.done) continue;
    (map[log.date] ??= new Set()).add(log.habit);
  }
  return map;
}

/** Dates with a completed unprompted session (checked off or logged as a session). */
export async function unpromptedDates(database = db) {
  const dates = new Set();
  for (const log of await live('habit_logs', database)) if (log.done && log.habit === 'unprompted') dates.add(log.date);
  for (const s of await live('unprompted_sessions', database)) if (s.completed) dates.add(s.date);
  return [...dates].sort();
}

export async function firstActiveDate(database = db) {
  const dates = (await live('habit_logs', database)).filter((l) => l.done).map((l) => l.date).sort();
  return dates[0] ?? null;
}

/** Record a Zetamac result; keeps the best score of the day across entries. */
export async function logSprint(date, round1, round2, best, database = db) {
  const id = sprintId(date);
  const existing = await database.sprint_scores.get(id);
  const rounds = [...(existing?.rounds ?? []), ...[round1, round2].filter((r) => r != null && r !== '').map(Number)];
  const dayBest = Math.max(best, existing && !existing.deleted ? existing.best : -Infinity);
  const row = await save('sprint_scores', { ...(existing ?? {}), id, date, rounds, best: dayBest, deleted: false }, database);
  await setHabit(date, 'sprint', true, {}, database);
  return row;
}

export async function getSprint(date, database = db) {
  const row = await database.sprint_scores.get(sprintId(date));
  return row && !row.deleted ? row : null;
}

// ---- Export / import ----

export async function exportAll(database = db) {
  const data = { app: 'brain-reset', schema: 1, exported_at: now(), tables: {} };
  for (const t of SYNCED_TABLES) data.tables[t] = await database.table(t).toArray();
  return data;
}

/** Merge an export into this device: a row only replaces a local one if it is newer. */
export async function importAll(data, database = db) {
  if (data?.app !== 'brain-reset' || !data.tables) throw new Error('Not a Brain Reset export file.');
  let added = 0;
  await database.transaction('rw', [...SYNCED_TABLES.map((t) => database.table(t)), database.outbox], async () => {
    for (const t of SYNCED_TABLES) {
      for (const row of data.tables[t] ?? []) {
        if (!row?.id) continue;
        const local = await database.table(t).get(row.id);
        if (local && local.updated_at >= row.updated_at) continue;
        await database.table(t).put(row);
        await database.outbox.add({ table: t, row_id: row.id, queued_at: now() });
        added += 1;
      }
    }
  });
  return added;
}

export async function getMeta(key, database = db) {
  return (await database.meta.get(key))?.value;
}

export async function setMeta(key, value, database = db) {
  await database.meta.put({ key, value });
}

// ---- Generic helpers used by the palace and unprompted screens ----

export async function getRow(table, id, database = db) {
  const row = await database.table(table).get(id);
  return row && !row.deleted ? row : null;
}

/** Store an image or other file. Returns the blob row id. */
export async function saveBlob(blob, database = db) {
  const row = await save('blobs', { data: blob, type: blob.type, size: blob.size }, database);
  return row.id;
}

export async function getBlob(id, database = db) {
  const row = id ? await getRow('blobs', id, database) : null;
  return row?.data ?? null;
}

/**
 * Save an in-app sprint round. Rounds on standard (Zetamac default) settings also
 * update the day's sprint score; custom rounds are kept as practice only.
 */
export async function logRound(date, round, database = db) {
  const row = await save('sprint_rounds', { date, ...round }, database);
  if (round.standard) await logSprint(date, round.score, null, round.score, database);
  else await setHabit(date, 'sprint', true, {}, database);
  return row;
}
