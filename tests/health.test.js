import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { createDB } from '../src/db.js';
import { finishWorkout, importHevy, lastSetsFor, listRoutines, listSets, listWorkouts, saveSet, seedHealth, startWorkout } from '../src/data/health.js';
import { EXERCISE_SEED, ROUTINE_SEED, aimFor, bests, e1rm, parseHevy, parseReps, prsFor, weekPlan } from '../src/logic/health.js';

describe('gym logic', () => {
  it('every routine exercise exists in the exercise list', () => {
    const ids = new Set(EXERCISE_SEED.map((e) => e.id));
    for (const r of ROUTINE_SEED) for (const i of r.items) expect(ids.has(i.exercise_id), i.exercise_id).toBe(true);
    expect(ROUTINE_SEED).toHaveLength(8);
  });

  it('parses rep targets', () => {
    expect(parseReps('12-15')).toEqual({ low: 12, high: 15 });
    expect(parseReps('7')).toEqual({ low: 7, high: 7 });
  });

  it('says add weight once every set hits the top of the range', () => {
    const last = [{ weight: 12.5, reps: 12, done: true }, { weight: 12.5, reps: 12, done: true }];
    expect(aimFor(last, '8-12')).toMatchObject({ kind: 'up', weight: 15 });
  });

  it('otherwise asks for one more rep at the same weight, ignoring warm-ups', () => {
    const last = [{ weight: 5, reps: 15, type: 'warmup', done: true }, { weight: 12.5, reps: 10, done: true }, { weight: 12.5, reps: 8, done: true }];
    expect(aimFor(last, '8-12')).toMatchObject({ kind: 'reps', weight: 12.5 });
  });

  it('handles bodyweight moves and first sessions', () => {
    expect(aimFor([{ weight: 0, reps: 3, done: true }], '5', true).kind).toBe('reps');
    expect(aimFor(null, '8-12').kind).toBe('start');
  });

  it('estimates 1RM and finds bests', () => {
    expect(e1rm(100, 0)).toBe(0);
    expect(e1rm(30, 10)).toBe(40);
    const b = bests([
      { exercise_id: 'a', weight: 20, reps: 8, done: true },
      { exercise_id: 'a', weight: 22.5, reps: 5, done: true },
      { exercise_id: 'a', weight: 40, reps: 3, done: true, type: 'warmup' }
    ]);
    expect(b.a.weight).toBe(22.5);
  });

  it('flags PRs only against an existing record', () => {
    const before = { weight: 20, e1rm: 25, reps: 8 };
    expect(prsFor({ weight: 22.5, reps: 6 }, before)).toEqual(['Heaviest', 'Best 1RM']);
    expect(prsFor({ weight: 22.5, reps: 6 }, undefined)).toEqual([]);
    expect(prsFor({ weight: 0, reps: 9 }, { weight: 0, e1rm: 0, reps: 8 })).toEqual(['Most reps']);
  });

  it('offers a missed session instead of skipping it', () => {
    const routines = ROUTINE_SEED;
    // Thursday 12 Nov 2026: Tue push and Wed pull both missed, nothing today.
    const p = weekPlan(routines, [], '2026-11-12', 'home');
    expect(p.isRestDay).toBe(true);
    expect(p.suggest.key).toBe('push');
    const done = [{ date: '2026-11-10', routine_key: 'push', finished_at: 'x' }];
    expect(weekPlan(routines, done, '2026-11-12', 'home').suggest.key).toBe('pull');
  });

  it('reads a Hevy export', () => {
    const csv = `"title","start_time","end_time","description","exercise_title","superset_id","exercise_notes","set_index","set_type","weight_kg","reps","distance_km","duration_seconds","rpe"
"Pull","4 Nov 2026, 18:02","4 Nov 2026, 18:50","","Lat Pulldown (Cable)","","","0","warmup","30","12","","",""
"Pull","4 Nov 2026, 18:02","4 Nov 2026, 18:50","","Lat Pulldown (Cable)","","","1","normal","45","8","","",""
"Push","30 Oct 2026, 17:00","30 Oct 2026, 17:40","","Incline Bench Press (Dumbbell)","","","0","normal","14","7","","",""`;
    const w = parseHevy(csv);
    expect(w.map((x) => x.date)).toEqual(['2026-10-30', '2026-11-04']);
    expect(w[1].sets[0]).toMatchObject({ type: 'warmup', weight: 30, reps: 12, set_no: 1 });
  });
});

let n = 0;
let db;
beforeEach(async () => {
  db = createDB(`health-${n++}`);
  await db.open();
  await seedHealth(db);
});

describe('workouts', () => {
  it('starts from a routine, prefilled from last time, and finishing drops unticked sets', async () => {
    const pull = (await listRoutines(db)).find((r) => r.id === 'routine:home:pull');
    const w1 = await startWorkout(pull, '2026-11-04', db);
    const rows = (await listSets(db)).filter((s) => s.workout_id === w1.id);
    expect(rows).toHaveLength(pull.items.reduce((t, i) => t + i.sets, 0));
    const curl = rows.find((s) => s.exercise_id === 'ex:bicep-curl-db' && s.set_no === 1);
    await saveSet({ ...curl, weight: 9, reps: 12, done: true }, db);
    await finishWorkout(w1, db);
    expect((await listSets(db)).filter((s) => s.workout_id === w1.id)).toHaveLength(1);

    const w2 = await startWorkout(pull, '2026-11-11', db);
    const next = (await listSets(db)).find((s) => s.workout_id === w2.id && s.exercise_id === 'ex:bicep-curl-db' && s.set_no === 1);
    expect(next.weight).toBe(9);
    const last = lastSetsFor('ex:bicep-curl-db', await listWorkouts(db), await listSets(db), w2.id);
    expect(last.sets[0].reps).toBe(12);
  });

  it('imports Hevy once, matching Dumbbell to DB names', async () => {
    const parsed = parseHevy(`"title","start_time","exercise_title","set_index","set_type","weight_kg","reps"
"Push","30 Oct 2026, 17:00","Incline Bench Press (Dumbbell)","0","normal","14","7"
"Push","30 Oct 2026, 17:00","Some New Move","0","normal","10","10"`);
    expect(await importHevy(parsed, db)).toEqual({ workoutsAdded: 1, setsAdded: 2 });
    expect(await importHevy(parsed, db)).toEqual({ workoutsAdded: 0, setsAdded: 0 });
    const sets = await listSets(db);
    expect(sets.some((s) => s.exercise_id === 'ex:incline-bench-press-db')).toBe(true);
    expect(sets.some((s) => s.exercise_id === 'ex:some-new-move')).toBe(true);
  });
});
