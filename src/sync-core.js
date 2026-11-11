import { SYNCED_TABLES, getMeta, setMeta } from './db.js';

// Pure push/pull logic, independent of Supabase so it can be unit tested.
// `api` provides: push(rows) -> Promise, pull(afterSeq, limit) -> Promise<[{tbl, data, server_seq}]>.

const PUSH_BATCH = 200;
const PULL_PAGE = 500;
export const CURSOR_KEY = 'sync_cursor';
export const LAST_SYNC_KEY = 'sync_last';

const isSynced = (table) => SYNCED_TABLES.includes(table);

/** How many local changes are waiting to go up. */
export async function pendingCount(database) {
  const entries = await database.outbox.toArray();
  return new Set(entries.filter((e) => isSynced(e.table)).map((e) => `${e.table}:${e.row_id}`)).size;
}

/**
 * Send queued local changes. Each changed row is sent once, as it is now.
 * Outbox entries are cleared only after the server accepted them, and only the
 * ones read at the start, so edits made during the push go up next time.
 */
export async function pushOutbox(database, api) {
  const entries = (await database.outbox.toArray()).filter((e) => isSynced(e.table));
  if (!entries.length) return 0;

  const latest = new Map();
  for (const e of entries) latest.set(`${e.table}:${e.row_id}`, e);

  const rows = [];
  for (const e of latest.values()) {
    const row = await database.table(e.table).get(e.row_id);
    if (!row) continue;
    rows.push({ tbl: e.table, id: row.id, data: row, updated_at: row.updated_at, deleted: Boolean(row.deleted) });
  }

  for (let i = 0; i < rows.length; i += PUSH_BATCH) {
    await api.push(rows.slice(i, i + PUSH_BATCH));
  }
  await database.outbox.bulkDelete(entries.map((e) => e.seq));
  return rows.length;
}

/**
 * Apply rows from the server. A remote row only replaces the local one if it is
 * newer, and applying it does not queue it to be pushed back.
 * Returns how many local rows changed.
 */
export async function mergeRemote(database, remoteRows) {
  let changed = 0;
  const rows = remoteRows.filter((r) => isSynced(r.tbl) && r.data?.id);
  if (!rows.length) return 0;
  await database.transaction('rw', SYNCED_TABLES.map((t) => database.table(t)), async () => {
    for (const r of rows) {
      const local = await database.table(r.tbl).get(r.data.id);
      if (local && local.updated_at >= r.data.updated_at) continue;
      await database.table(r.tbl).put(r.data);
      changed += 1;
    }
  });
  return changed;
}

/** Fetch everything the server has after our cursor, page by page. */
export async function pullChanges(database, api) {
  let cursor = (await getMeta(CURSOR_KEY, database)) ?? 0;
  let changed = 0;
  for (;;) {
    const page = await api.pull(cursor, PULL_PAGE);
    if (!page.length) break;
    changed += await mergeRemote(database, page);
    cursor = Math.max(cursor, ...page.map((r) => Number(r.server_seq)));
    await setMeta(CURSOR_KEY, cursor, database);
    if (page.length < PULL_PAGE) break;
  }
  return changed;
}

/** Push first so the server holds our latest, then pull what other devices sent. */
export async function syncOnce(database, api) {
  const pushed = await pushOutbox(database, api);
  const pulled = await pullChanges(database, api);
  await setMeta(LAST_SYNC_KEY, new Date().toISOString(), database);
  return { pushed, pulled };
}
