import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { createDB, doneByDate, save, setHabit } from '../src/db.js';
import { mergeRemote, pendingCount, pullChanges, pushOutbox, syncOnce } from '../src/sync-core.js';

// An in-memory stand-in for the Supabase table and push_rows function,
// with the same "only newer rows win" rule and an increasing server_seq.
function fakeServer() {
  const rows = new Map();
  let seq = 0;
  return {
    rows,
    async push(batch) {
      for (const r of batch) {
        const key = `${r.tbl}:${r.id}`;
        const existing = rows.get(key);
        if (existing && existing.data.updated_at >= r.updated_at) continue;
        rows.set(key, { tbl: r.tbl, data: JSON.parse(JSON.stringify(r.data)), server_seq: ++seq });
      }
    },
    async pull(after, limit) {
      return [...rows.values()]
        .filter((r) => r.server_seq > after)
        .sort((a, b) => a.server_seq - b.server_seq)
        .slice(0, limit);
    }
  };
}

let n = 0;
let phone;
let laptop;
let server;
beforeEach(async () => {
  phone = createDB(`sync-phone-${n}`);
  laptop = createDB(`sync-laptop-${n++}`);
  await phone.open();
  await laptop.open();
  server = fakeServer();
});

describe('sync between two devices', () => {
  it('a tick on the phone shows up on the laptop', async () => {
    await setHabit('2026-11-11', 'spanish', true, {}, phone);
    await syncOnce(phone, server);
    const { pulled } = await syncOnce(laptop, server);
    expect(pulled).toBe(1);
    expect([...(await doneByDate(laptop))['2026-11-11']]).toEqual(['spanish']);
  });

  it('clears the outbox once the server has the rows', async () => {
    await setHabit('2026-11-11', 'sprint', true, {}, phone);
    await setHabit('2026-11-11', 'sprint', false, {}, phone);
    expect(await pendingCount(phone)).toBe(1);
    expect(await pushOutbox(phone, server)).toBe(1);
    expect(await pendingCount(phone)).toBe(0);
  });

  it('keeps the newer edit when both devices changed the same row', async () => {
    await setHabit('2026-11-11', 'reading', true, {}, phone);
    await new Promise((r) => setTimeout(r, 5));
    await setHabit('2026-11-11', 'reading', false, {}, laptop);
    await syncOnce(laptop, server);
    await syncOnce(phone, server); // older phone edit must not win
    await syncOnce(laptop, server);
    expect((await phone.habit_logs.get('habit:2026-11-11:reading')).done).toBe(false);
    expect((await laptop.habit_logs.get('habit:2026-11-11:reading')).done).toBe(false);
  });

  it('pulled rows are not queued to be sent back', async () => {
    await save('palaces', { name: 'Flat', loci: ['door'] }, phone);
    await syncOnce(phone, server);
    await syncOnce(laptop, server);
    expect(await pendingCount(laptop)).toBe(0);
  });

  it('only fetches what is new since the last pull', async () => {
    await save('palaces', { name: 'Flat', loci: [] }, phone);
    await syncOnce(phone, server);
    expect(await pullChanges(laptop, server)).toBe(1);
    expect(await pullChanges(laptop, server)).toBe(0);
  });

  it('deletions travel too', async () => {
    const row = await save('palaces', { name: 'Flat', loci: [] }, phone);
    await syncOnce(phone, server);
    await syncOnce(laptop, server);
    await save('palaces', { ...row, deleted: true }, laptop);
    await syncOnce(laptop, server);
    await syncOnce(phone, server);
    expect((await phone.palaces.get(row.id)).deleted).toBe(true);
  });

  it('ignores rows for tables this app does not sync', async () => {
    expect(await mergeRemote(phone, [{ tbl: 'blobs', data: { id: 'x', updated_at: 'z' } }])).toBe(0);
  });

  it('leaves the outbox alone if the push fails', async () => {
    await setHabit('2026-11-11', 'sprint', true, {}, phone);
    const broken = { push: async () => { throw new Error('offline'); }, pull: async () => [] };
    await expect(pushOutbox(phone, broken)).rejects.toThrow('offline');
    expect(await pendingCount(phone)).toBe(1);
  });
});
