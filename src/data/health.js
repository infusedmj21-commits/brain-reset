import { db, live, save } from '../db.js';
import { EXERCISE_SEED, ROUTINE_SEED, exId, slug } from '../logic/health.js';

const SEED_TIME = '2026-11-11T00:00:00.000Z';

// Seeds use fixed ids and an old timestamp: a second device writes identical rows,
// and any real edit is newer, so seeding never undoes a change.
async function seedTable(table, rows, database) {
  await database.transaction('rw', database.table(table), database.outbox, async () => {
    for (const r of rows) {
      if (await database.table(table).get(r.id)) continue;
      await database.table(table).put({ ...r, deleted: false, user_id: null, updated_at: SEED_TIME });
      await database.outbox.add({ table, row_id: r.id, queued_at: SEED_TIME });
    }
  });
}

export async function seedHealth(database = db) {
  await seedTable('exercises', EXERCISE_SEED, database);
  await seedTable('routines', ROUTINE_SEED, database);
}

export const listExercises = (database = db) => live('exercises', database);
export const listRoutines = (database = db) => live('routines', database);
export const listWorkouts = (database = db) => live('workouts', database);
export const listSets = (database = db) => live('workout_sets', database);

// ---- Settings and daily ticks (synced via checkins) ----

const MODE_ID = 'setting:health_mode';
export async function getMode(database = db) {
  const row = await database.checkins.get(MODE_ID);
  return row && !row.deleted ? row.mode : 'home';
}
export const setMode = (mode, database = db) => save('checkins', { id: MODE_ID, kind: 'setting', date: '', mode }, database);

export const TICKS = { creatine: 'Creatine', protein: 'Protein goal' };
const tickId = (date, name) => `tick:${date}:${name}`;
export async function ticksFor(date, database = db) {
  const out = {};
  for (const name of Object.keys(TICKS)) {
    const row = await database.checkins.get(tickId(date, name));
    out[name] = Boolean(row && !row.deleted && row.done);
  }
  return out;
}
export const setTick = (date, name, done, database = db) =>
  save('checkins', { id: tickId(date, name), kind: 'tick', date, name, done }, database);

// ---- Workouts ----

/** Sets from the most recent finished workout that included this exercise (excluding one workout). */
export function lastSetsFor(exerciseId, workouts, sets, excludeId = null) {
  const finished = workouts.filter((w) => w.finished_at && w.id !== excludeId).sort((a, b) => b.date.localeCompare(a.date) || b.started_at.localeCompare(a.started_at));
  for (const w of finished) {
    const s = sets.filter((x) => x.workout_id === w.id && x.exercise_id === exerciseId && x.done).sort((a, b) => a.set_no - b.set_no);
    if (s.length) return { workout: w, sets: s };
  }
  return null;
}

/** Start a workout from a routine, with each set prefilled from last time. */
export async function startWorkout(routine, date, database = db) {
  const [workouts, sets] = await Promise.all([listWorkouts(database), listSets(database)]);
  const w = await save(
    'workouts',
    { date, routine_id: routine.id, routine_key: routine.key, mode: routine.mode, name: routine.name, started_at: new Date().toISOString(), finished_at: null },
    database
  );
  let order = 0;
  for (const item of routine.items) {
    const last = lastSetsFor(item.exercise_id, workouts, sets);
    for (let i = 0; i < item.sets; i += 1) {
      const prev = last?.sets.find((s) => s.set_no === i + 1) ?? last?.sets.at(-1);
      await save(
        'workout_sets',
        { workout_id: w.id, exercise_id: item.exercise_id, reps_target: item.reps, order: order++, set_no: i + 1, type: 'normal', weight: prev?.weight ?? 0, reps: null, done: false, date },
        database
      );
    }
  }
  return w;
}

export const saveSet = (set, database = db) => save('workout_sets', set, database);

export async function addSet(workout, exerciseId, repsTarget, database = db) {
  const sets = (await listSets(database)).filter((s) => s.workout_id === workout.id);
  const mine = sets.filter((s) => s.exercise_id === exerciseId).sort((a, b) => a.set_no - b.set_no);
  const prev = mine.at(-1);
  const order = prev ? prev.order + 0.01 * (mine.length + 1) : Math.max(0, ...sets.map((s) => s.order)) + 1;
  return save(
    'workout_sets',
    { workout_id: workout.id, exercise_id: exerciseId, reps_target: repsTarget ?? prev?.reps_target ?? '8-12', order, set_no: mine.length + 1, type: 'normal', weight: prev?.weight ?? 0, reps: null, done: false, date: workout.date },
    database
  );
}

export async function finishWorkout(workout, database = db) {
  const sets = (await listSets(database)).filter((s) => s.workout_id === workout.id);
  // Unticked sets are dropped so they never count as history.
  for (const s of sets) if (!s.done) await save('workout_sets', { ...s, deleted: true }, database);
  return save('workouts', { ...workout, finished_at: new Date().toISOString() }, database);
}

export async function discardWorkout(workout, database = db) {
  const sets = (await listSets(database)).filter((s) => s.workout_id === workout.id);
  for (const s of sets) await save('workout_sets', { ...s, deleted: true }, database);
  return save('workouts', { ...workout, deleted: true }, database);
}

export async function addExercise(name, muscle = 'Other', database = db) {
  const id = exId(name);
  const existing = await database.exercises.get(id);
  if (existing && !existing.deleted) return existing;
  return save('exercises', { id, name, equipment: 'other', muscle, bodyweight: false, custom: true }, database);
}

// ---- Hevy import ----

const norm = (s) =>
  s
    .toLowerCase()
    .replace(/dumbbell/g, 'db')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

/** Import parsed Hevy workouts. Ids are derived from the data, so importing twice changes nothing. */
export async function importHevy(parsed, database = db) {
  const exercises = await listExercises(database);
  const byName = new Map(exercises.map((e) => [norm(e.name), e]));
  let workoutsAdded = 0;
  let setsAdded = 0;
  for (const [i, w] of parsed.entries()) {
    const wid = `hevy:${w.date}:${slug(w.title)}:${slug(w.key).slice(-12)}:${i}`;
    if (await database.workouts.get(wid)) continue;
    await save('workouts', { id: wid, date: w.date, routine_id: null, routine_key: null, mode: 'gym', name: w.title, started_at: `${w.date}T12:00:00.000Z`, finished_at: `${w.date}T13:00:00.000Z`, source: 'hevy' }, database);
    workoutsAdded += 1;
    for (const [j, s] of w.sets.entries()) {
      let ex = byName.get(norm(s.exercise));
      if (!ex) {
        ex = await addExercise(s.exercise, 'Other', database);
        byName.set(norm(s.exercise), ex);
      }
      await save('workout_sets', { id: `${wid}:${j}`, workout_id: wid, exercise_id: ex.id, order: j, set_no: s.set_no, type: s.type, weight: s.weight, reps: s.reps, done: true, date: w.date }, database);
      setsAdded += 1;
    }
  }
  return { workoutsAdded, setsAdded };
}
