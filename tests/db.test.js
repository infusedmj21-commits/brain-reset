import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  createDB,
  doneByDate,
  exportAll,
  firstActiveDate,
  getSprint,
  importAll,
  logSprint,
  remove,
  save,
  setDayPlan,
  setHabit,
  unpromptedDates
} from '../src/db.js';

let db;
let n = 0;
beforeEach(async () => {
  db = createDB(`test-${n++}`);
  await db.open();
});

describe('save and sync bookkeeping', () => {
  it('stamps id, updated_at, deleted and queues an outbox entry', async () => {
    const row = await save('palaces', { name: 'Flat', loci: ['door'] }, db);
    expect(row.id).toMatch(/[0-9a-f-]{36}/);
    expect(row.deleted).toBe(false);
    expect(row.updated_at).toBeTruthy();
    const outbox = await db.outbox.toArray();
    expect(outbox).toHaveLength(1);
    expect(outbox[0]).toMatchObject({ table: 'palaces', row_id: row.id });
  });

  it('soft-deletes and queues the deletion', async () => {
    const row = await save('palaces', { name: 'Flat', loci: [] }, db);
    await remove('palaces', row.id, db);
    expect((await db.palaces.get(row.id)).deleted).toBe(true);
    expect(await db.outbox.count()).toBe(2);
  });
});

describe('habits and days', () => {
  it('uses one row per day+habit, so toggling never duplicates', async () => {
    await setHabit('2026-11-02', 'spanish', true, {}, db);
    await setHabit('2026-11-02', 'spanish', false, {}, db);
    await setHabit('2026-11-02', 'spanish', true, {}, db);
    expect(await db.habit_logs.count()).toBe(1);
    const map = await doneByDate(db);
    expect([...map['2026-11-02']]).toEqual(['spanish']);
  });

  it('keeps day plans keyed by date', async () => {
    await setDayPlan('2026-11-02', { day_type: 'late' }, db);
    await setDayPlan('2026-11-02', { rotation: 'palace' }, db);
    const plans = await db.day_plans.toArray();
    expect(plans).toHaveLength(1);
    expect(plans[0]).toMatchObject({ day_type: 'late', rotation: 'palace' });
  });

  it('finds unprompted dates and the first active day', async () => {
    await setHabit('2026-11-03', 'unprompted', true, {}, db);
    await setHabit('2026-11-02', 'sprint', true, {}, db);
    expect(await unpromptedDates(db)).toEqual(['2026-11-03']);
    expect(await firstActiveDate(db)).toBe('2026-11-02');
  });
});

describe('sprint log', () => {
  it('keeps the best score of the day and ticks the habit', async () => {
    await logSprint('2026-11-02', 41, 47, 47, db);
    await logSprint('2026-11-02', 39, null, 39, db);
    const row = await getSprint('2026-11-02', db);
    expect(row.best).toBe(47);
    expect(row.rounds).toEqual([41, 47, 39]);
    expect((await doneByDate(db))['2026-11-02'].has('sprint')).toBe(true);
  });
});

describe('export and import', () => {
  it('round-trips into a fresh device and skips older rows', async () => {
    await setHabit('2026-11-02', 'reading', true, {}, db);
    await logSprint('2026-11-02', 40, 44, 44, db);
    const data = await exportAll(db);

    const other = createDB(`test-${n++}`);
    await other.open();
    // reading habit + sprint habit + sprint score
    expect(await importAll(data, other)).toBe(3);
    expect((await getSprint('2026-11-02', other)).best).toBe(44);
    // Importing the same file again changes nothing.
    expect(await importAll(data, other)).toBe(0);
  });

  it('rejects files that are not exports', async () => {
    await expect(importAll({ foo: 1 }, db)).rejects.toThrow();
  });
});
