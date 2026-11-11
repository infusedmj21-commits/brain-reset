import { db, getMeta, live, save, setMeta } from '../db.js';
import { ROLE_SEED } from '../logic/money.js';

// Roles, shifts, actual pay and Monzo transactions.

const SEED_TIME = '2026-11-11T00:00:00.000Z';

export async function seedRoles(database = db) {
  if (await getMeta('seeded_roles', database)) return;
  await database.transaction('rw', database.roles, database.outbox, async () => {
    for (const r of ROLE_SEED) {
      if (await database.roles.get(r.id)) continue;
      await database.roles.put({ ...r, deleted: false, user_id: null, updated_at: SEED_TIME });
      await database.outbox.add({ table: 'roles', row_id: r.id, queued_at: SEED_TIME });
    }
  });
  await setMeta('seeded_roles', true, database);
}

export const listRoles = (database = db) => live('roles', database);
export const listShifts = (database = db) => live('shifts', database);
export const listPayments = (database = db) => live('payments', database);
export const listTransactions = (database = db) => live('transactions', database);

export const saveShift = (shift, database = db) => save('shifts', { status: 'booked', notes: '', ...shift }, database);

// Which incoming payees count as pay. Stored as a synced row so both devices agree.
const PAYEES_ID = 'setting:pay_payees';
export async function getPayPayees(database = db) {
  const row = await database.checkins.get(PAYEES_ID);
  return row && !row.deleted ? row.names : [];
}
export async function setPayPayees(names, database = db) {
  return save('checkins', { id: PAYEES_ID, kind: 'setting', date: '', names: names.map((n) => n.toLowerCase()) }, database);
}

/**
 * Save a classified Monzo import. Rows already imported (same Monzo transaction ID)
 * are skipped, so importing overlapping exports never double counts.
 */
export async function saveImport(classified, database = db) {
  const counts = { pay: 0, spending: 0, income: 0, skipped: 0 };
  const put = async (t, kind) => {
    if (await database.transactions.get(t.id)) {
      counts.skipped += 1;
      return false;
    }
    await save('transactions', { ...t, kind }, database);
    counts[kind] += 1;
    return true;
  };
  for (const t of classified.pay) {
    if (await put(t, 'pay')) {
      await save('payments', { id: `pay:${t.id}`, date: t.date, amount: t.amount, source: 'monzo', payee: t.name }, database);
    }
  }
  for (const t of classified.spending) await put(t, 'spending');
  for (const t of classified.income) await put(t, 'income');
  return counts;
}

export async function lastImport(database = db) {
  return getMeta('last_monzo_import', database);
}
export async function markImported(database = db) {
  await setMeta('last_monzo_import', new Date().toISOString(), database);
}
