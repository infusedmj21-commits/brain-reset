import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { createDB } from '../src/db.js';
import { focusFor, listVentures, saveTask, seedVentures, setFocus, toggleFocus } from '../src/data/ventures.js';
import { daysBetween } from '../src/logic/dates.js';
import { needsRescore, rankTasks, score, scoreHistory, verdict } from '../src/logic/scoring.js';

describe('scoring', () => {
  it('adds impact and urgency, divides by effort', () => {
    expect(score({ impact: 4, urgency: 3, effort: 2 })).toBe(3.5);
    expect(score({ impact: 3, urgency: 1, effort: 4 })).toBe(1);
  });

  it('clamps ratings to 1–5', () => {
    expect(score({ impact: 9, urgency: 0, effort: -2 })).toBe(6);
  });

  it('bands into now, schedule and park', () => {
    expect(verdict(2.5)).toBe('now');
    expect(verdict(2.4)).toBe('schedule');
    expect(verdict(1.5)).toBe('schedule');
    expect(verdict(1.4)).toBe('park');
    expect(verdict(null)).toBe(null);
  });

  it('keeps latest and previous score per venture', () => {
    const h = scoreHistory([
      { venture_id: 'a', date: '2026-11-02', impact: 3, urgency: 2, effort: 2, updated_at: '1' },
      { venture_id: 'a', date: '2026-11-09', impact: 4, urgency: 3, effort: 2, updated_at: '2' }
    ]);
    expect(h.a.latest.date).toBe('2026-11-09');
    expect(h.a.previous.date).toBe('2026-11-02');
  });

  it('asks for a rescore after 7 days or when never scored', () => {
    expect(needsRescore(null, '2026-11-11', daysBetween)).toBe(true);
    expect(needsRescore({ date: '2026-11-05' }, '2026-11-11', daysBetween)).toBe(false);
    expect(needsRescore({ date: '2026-11-04' }, '2026-11-11', daysBetween)).toBe(true);
  });

  it('ranks open tasks best first and drops done ones', () => {
    const ranked = rankTasks([
      { id: 'low', impact: 1, urgency: 1, effort: 5 },
      { id: 'high', impact: 5, urgency: 5, effort: 1 },
      { id: 'done', impact: 5, urgency: 5, effort: 1, done_date: '2026-11-10' }
    ]);
    expect(ranked.map((t) => t.id)).toEqual(['high', 'low']);
  });
});

let n = 0;
let db;
beforeEach(async () => {
  db = createDB(`ventures-${n++}`);
  await db.open();
});

describe('ventures data', () => {
  it('seeds Halden Labs, Etsy prints and Amazon FBA once', async () => {
    await seedVentures(db);
    await seedVentures(db);
    expect((await listVentures(db)).map((v) => v.name)).toEqual(['Amazon FBA', 'Etsy prints', 'Halden Labs']);
  });

  it('seeds with an old timestamp so real edits always win in sync', async () => {
    await seedVentures(db);
    expect((await db.ventures.get('venture:halden-labs')).updated_at < '2026-11-12').toBe(true);
  });

  it('sets today’s 3 and replaces the set when changed', async () => {
    const a = await saveTask({ title: 'A', venture_id: 'v', impact: 3, urgency: 3, effort: 2 }, db);
    const b = await saveTask({ title: 'B', venture_id: 'v', impact: 3, urgency: 3, effort: 2 }, db);
    await setFocus('2026-11-11', [{ task_id: a.id, plan: 'After breakfast', energy: 'high' }], db);
    await setFocus('2026-11-11', [{ task_id: b.id, plan: 'On the bus', energy: 'low' }], db);
    const focus = await focusFor('2026-11-11', db);
    expect(focus.map((f) => f.task_id)).toEqual([b.id]);
    expect(focus[0]).toMatchObject({ plan: 'On the bus', energy: 'low', done: false });
  });

  it('ticking a focus task marks the task done, unticking reopens it', async () => {
    const t = await saveTask({ title: 'A', venture_id: 'v', impact: 3, urgency: 3, effort: 2 }, db);
    await setFocus('2026-11-11', [{ task_id: t.id, plan: '', energy: 'high' }], db);
    let [row] = await focusFor('2026-11-11', db);
    await toggleFocus(row, '2026-11-11', db);
    expect((await db.tasks.get(t.id)).done_date).toBe('2026-11-11');
    [row] = await focusFor('2026-11-11', db);
    await toggleFocus(row, '2026-11-11', db);
    expect((await db.tasks.get(t.id)).done_date).toBe(null);
  });
});
