import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { createDB } from '../src/db.js';
import { saveShift } from '../src/data/money.js';
import { openTasks, shiftsToConfirm } from '../src/data/tasks.js';

describe('tasks', () => {
  it('asks to confirm a shift from the day after, until confirmed or cancelled', () => {
    const shifts = [
      { id: 'a', date: '2026-11-10', status: 'booked' },
      { id: 'b', date: '2026-11-11', status: 'booked' },
      { id: 'c', date: '2026-11-09', status: 'worked', confirmed: true },
      { id: 'd', date: '2026-11-08', status: 'cancelled' },
      { id: 'e', date: '2026-11-07', status: 'worked' }
    ];
    expect(shiftsToConfirm(shifts, '2026-11-11').map((s) => s.id)).toEqual(['e', 'a']);
  });

  it('lists what needs input, including unconfirmed shifts and a first Monzo import', async () => {
    const db = createDB('tasks-1');
    await db.open();
    await saveShift({ date: '2020-01-01', venue: 'Molineux', role_id: 'role:till-operator', rate: 13.45, hours: 8, status: 'booked' }, db);
    const kinds = (await openTasks(db)).map((t) => t.id);
    expect(kinds).toContain('daytype');
    expect(kinds).toContain('monzo');
    expect((await openTasks(db)).filter((t) => t.kind === 'shift')).toHaveLength(1);
  });
});
