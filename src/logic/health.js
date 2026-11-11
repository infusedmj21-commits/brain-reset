// Pure gym logic: Michael's split, rep targets, progression aims, PRs, weekly sessions, Hevy import.
import { addDays, weekDates, weekday } from './dates.js';
import { parseCSV } from './money.js';

const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
export const exId = (name) => `ex:${slug(name)}`;

// [name, equipment, muscle, bodyweight?]
const EXERCISES = [
  ['Incline Bench Press (DB)', 'dumbbell', 'Chest'],
  ['Bench Press (Barbell)', 'barbell', 'Chest'],
  ['Cable Fly Crossovers', 'cable', 'Chest'],
  ['Incline Chest Press (Machine)', 'machine', 'Chest'],
  ['Lateral Raise (DB)', 'dumbbell', 'Shoulders'],
  ['Seated Shoulder Press (Machine)', 'machine', 'Shoulders'],
  ['Face Pull', 'cable', 'Shoulders'],
  ['Rear Delt Reverse Fly (DB)', 'dumbbell', 'Shoulders'],
  ['Overhead Triceps Extension (Cable)', 'cable', 'Triceps'],
  ['Triceps Rope Pushdown', 'cable', 'Triceps'],
  ['Triceps Pressdown', 'cable', 'Triceps'],
  ['Triceps Dip (Assisted)', 'machine', 'Triceps'],
  ['Lat Pulldown (Cable)', 'cable', 'Back'],
  ['Single Arm Lat Pulldown', 'cable', 'Back'],
  ['Chest Supported Incline Row (DB)', 'dumbbell', 'Back'],
  ['Seated Cable Row (Bar Grip)', 'cable', 'Back'],
  ['Seated Incline Curl (DB)', 'dumbbell', 'Biceps'],
  ['Bicep Curl (Cable)', 'cable', 'Biceps'],
  ['Preacher Curl (Barbell)', 'barbell', 'Biceps'],
  ['Hammer Curl (DB)', 'dumbbell', 'Biceps'],
  ['Rope Cable Curl', 'cable', 'Biceps'],
  ['Crunch (Machine)', 'machine', 'Abs'],
  ['Hanging Knee Raise', 'bodyweight', 'Abs', true],
  // Home kit: adjustable dumbbells (up to 14.5 kg each) and a pull-up bar.
  ['Push-up', 'bodyweight', 'Chest', true],
  ['Diamond Push-up', 'bodyweight', 'Triceps', true],
  ['Floor Press (DB)', 'dumbbell', 'Chest'],
  ['Floor Fly (DB)', 'dumbbell', 'Chest'],
  ['Shoulder Press (DB)', 'dumbbell', 'Shoulders'],
  ['Overhead Triceps Extension (DB)', 'dumbbell', 'Triceps'],
  ['Bench Dip', 'bodyweight', 'Triceps', true],
  ['Pull-up', 'bodyweight', 'Back', true],
  ['Chin-up', 'bodyweight', 'Back', true],
  ['Row (DB)', 'dumbbell', 'Back'],
  ['Bicep Curl (DB)', 'dumbbell', 'Biceps'],
  ['Lying Crunch', 'bodyweight', 'Abs', true]
];

export const EXERCISE_SEED = EXERCISES.map(([name, equipment, muscle, bodyweight = false]) => ({
  id: exId(name),
  name,
  equipment,
  muscle,
  bodyweight,
  custom: false
}));

const R = (name, sets, reps) => ({ exercise_id: exId(name), sets, reps });

// Weekday: 0 = Monday. Gym split is Michael's Hevy routine; home versions use his home kit.
export const ROUTINE_SEED = [
  {
    key: 'push', day: 1, name: 'Push + Abs',
    gym: [R('Incline Bench Press (DB)', 3, '7'), R('Bench Press (Barbell)', 3, '10'), R('Cable Fly Crossovers', 2, '8'), R('Lateral Raise (DB)', 3, '15'), R('Overhead Triceps Extension (Cable)', 2, '8'), R('Triceps Rope Pushdown', 2, '8'), R('Crunch (Machine)', 4, '12'), R('Hanging Knee Raise', 2, '12-15')],
    home: [R('Push-up', 3, '10'), R('Floor Press (DB)', 3, '8-12'), R('Floor Fly (DB)', 3, '8-10'), R('Lateral Raise (DB)', 3, '12-15'), R('Overhead Triceps Extension (DB)', 3, '8-12'), R('Diamond Push-up', 2, '8'), R('Hanging Knee Raise', 2, '12-15')]
  },
  {
    key: 'pull', day: 2, name: 'Pull + Abs',
    gym: [R('Lat Pulldown (Cable)', 3, '8'), R('Chest Supported Incline Row (DB)', 2, '15'), R('Single Arm Lat Pulldown', 2, '12'), R('Rear Delt Reverse Fly (DB)', 2, '15'), R('Seated Incline Curl (DB)', 2, '9'), R('Bicep Curl (Cable)', 2, '8-10'), R('Crunch (Machine)', 2, '12')],
    home: [R('Pull-up', 3, '5'), R('Chin-up', 2, '5'), R('Row (DB)', 2, '10-12'), R('Rear Delt Reverse Fly (DB)', 2, '12-15'), R('Bicep Curl (DB)', 2, '10-12'), R('Lying Crunch', 2, '15-20')]
  },
  {
    key: 'arms', day: 4, name: 'Delts, Arms + Abs',
    gym: [R('Seated Shoulder Press (Machine)', 2, '8'), R('Lateral Raise (DB)', 3, '15'), R('Face Pull', 2, '15'), R('Preacher Curl (Barbell)', 2, '10'), R('Hammer Curl (DB)', 1, '12'), R('Overhead Triceps Extension (Cable)', 2, '12'), R('Triceps Dip (Assisted)', 1, '12'), R('Crunch (Machine)', 3, '12')],
    home: [R('Shoulder Press (DB)', 2, '8-12'), R('Lateral Raise (DB)', 3, '12-15'), R('Rear Delt Reverse Fly (DB)', 2, '12-15'), R('Bicep Curl (DB)', 2, '10-12'), R('Hammer Curl (DB)', 1, '10-12'), R('Overhead Triceps Extension (DB)', 2, '10-12'), R('Bench Dip', 1, '12'), R('Lying Crunch', 3, '15-20')]
  },
  {
    key: 'pump', day: 6, name: 'Upper Pump + Abs',
    gym: [R('Incline Chest Press (Machine)', 3, '6'), R('Seated Cable Row (Bar Grip)', 3, '7-8'), R('Lat Pulldown (Cable)', 3, '8-9'), R('Cable Fly Crossovers', 3, '8'), R('Lateral Raise (DB)', 2, '19'), R('Rope Cable Curl', 1, '14'), R('Triceps Pressdown', 1, '12'), R('Hanging Knee Raise', 3, '12-15')],
    home: [R('Floor Press (DB)', 3, '8-12'), R('Row (DB)', 3, '8-12'), R('Pull-up', 3, '5'), R('Floor Fly (DB)', 3, '8-10'), R('Lateral Raise (DB)', 2, '15-20'), R('Bicep Curl (DB)', 1, '12-15'), R('Overhead Triceps Extension (DB)', 1, '12-15'), R('Hanging Knee Raise', 3, '12-15')]
  }
].flatMap((r) =>
  ['gym', 'home'].map((mode) => ({ id: `routine:${mode}:${r.key}`, key: r.key, mode, day: r.day, name: r.name, items: r[mode] }))
);

export const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/** '12-15' → { low: 12, high: 15 }; '7' → { low: 7, high: 7 }. */
export function parseReps(text) {
  const m = String(text ?? '').match(/(\d+)\s*(?:-|–|to)\s*(\d+)/);
  if (m) return { low: Number(m[1]), high: Number(m[2]) };
  const n = Number.parseInt(text, 10);
  return Number.isFinite(n) ? { low: n, high: n } : { low: 8, high: 12 };
}

/** Epley estimate of a one-rep max. Bodyweight sets (no weight) have none. */
export const e1rm = (weight, reps) => (weight > 0 && reps > 0 ? weight * (1 + reps / 30) : 0);

// Smallest sensible jump: home dumbbells go up 2.5 kg a side (two 1.25 kg plates); gym kit 2.5 kg.
export const STEP = 2.5;

/**
 * Double progression aim for an exercise from its last session's working sets:
 * every set at the top of the rep range → add weight; otherwise beat last time by a rep.
 */
export function aimFor(lastSets, repsText, bodyweight = false) {
  const { low, high } = parseReps(repsText);
  const work = (lastSets ?? []).filter((s) => s.type !== 'warmup' && s.done !== false && s.reps > 0);
  const range = low === high ? `${low}` : `${low}–${high}`;
  if (!work.length) {
    return { kind: 'start', text: bodyweight ? `First time logged: aim for ${range} reps a set` : `First time: pick a weight you can do ${range} reps with`, low, high };
  }
  const top = Math.max(...work.map((s) => s.weight || 0));
  const allTop = work.every((s) => s.reps >= high);
  if (bodyweight || top === 0) {
    return allTop
      ? { kind: 'up', text: `Hit ${high} on every set: aim for ${high + 1}+ or add a harder variation`, low, high }
      : { kind: 'reps', text: `Beat last time: one more rep on any set (last ${work.map((s) => s.reps).join(' / ')})`, low, high };
  }
  if (allTop) return { kind: 'up', text: `Add weight: try ${fmtKg(top + STEP)} for ${low}+ reps`, low, high, weight: top + STEP };
  return { kind: 'reps', text: `Same ${fmtKg(top)}, one more rep on any set (last ${work.map((s) => s.reps).join(' / ')})`, low, high, weight: top };
}

export const fmtKg = (w) => (w > 0 ? `${Number(w.toFixed(2))} kg` : 'BW');

/** Bests per exercise from a list of sets: heaviest weight, best e1RM, most reps in a set. */
export function bests(sets) {
  const out = {};
  for (const s of sets) {
    if (s.type === 'warmup' || !s.done || !(s.reps > 0)) continue;
    const b = (out[s.exercise_id] ??= { weight: 0, e1rm: 0, reps: 0 });
    b.weight = Math.max(b.weight, s.weight || 0);
    b.e1rm = Math.max(b.e1rm, e1rm(s.weight || 0, s.reps));
    b.reps = Math.max(b.reps, s.reps);
  }
  return out;
}

/** Which records a new set beats, compared with bests from before this workout. */
export function prsFor(set, before) {
  if (set.type === 'warmup' || !(set.reps > 0)) return [];
  const b = before ?? { weight: 0, e1rm: 0, reps: 0 };
  const out = [];
  if ((set.weight || 0) > b.weight && b.weight > 0) out.push('Heaviest');
  if (e1rm(set.weight || 0, set.reps) > b.e1rm && b.e1rm > 0) out.push('Best 1RM');
  if (!(set.weight > 0) && set.reps > b.reps && b.reps > 0) out.push('Most reps');
  return out;
}

/**
 * This week's planned sessions with status. A session missed earlier in the week is
 * offered again rather than skipped, so the split rolls on.
 */
export function weekPlan(routines, workouts, date, mode) {
  const days = weekDates(date);
  const done = workouts.filter((w) => w.finished_at && days.includes(w.date));
  const plan = routines
    .filter((r) => r.mode === mode)
    .sort((a, b) => a.day - b.day)
    .map((r) => {
      const w = done.find((x) => x.routine_key === r.key);
      const due = days[r.day];
      return { routine: r, date: due, status: w ? 'done' : due < date ? 'missed' : due === date ? 'today' : 'later', workout: w ?? null };
    });
  const missed = plan.find((p) => p.status === 'missed');
  const todays = plan.find((p) => p.status === 'today');
  const next = plan.find((p) => p.status === 'later');
  return { plan, suggest: todays?.routine ?? missed?.routine ?? null, missed: missed ?? null, next: next ?? null, isRestDay: !todays };
}

export const RESTART_DATE = '2026-10-30';

// ---- Hevy CSV export ----

const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
function hevyDate(s) {
  const t = String(s ?? '').trim();
  let m = t.match(/^(\d{1,2}) (\w{3}) (\d{4})/);
  if (m && MONTHS[m[2].toLowerCase()]) return `${m[3]}-${String(MONTHS[m[2].toLowerCase()]).padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  m = t.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
}

/**
 * Parse Hevy's workout CSV export into workouts and sets.
 * Columns used: title, start_time, exercise_title, set_index, set_type, weight_kg, reps.
 */
export function parseHevy(text) {
  const [header, ...body] = parseCSV(text);
  const col = (n) => (header ?? []).findIndex((h) => h.trim().toLowerCase() === n);
  const c = { title: col('title'), start: col('start_time'), ex: col('exercise_title'), idx: col('set_index'), type: col('set_type'), kg: col('weight_kg'), reps: col('reps') };
  if (c.start < 0 || c.ex < 0) throw new Error('That doesn’t look like a Hevy export (no start_time or exercise_title column).');
  const workouts = new Map();
  for (const r of body) {
    const date = hevyDate(r[c.start]);
    if (!date) continue;
    const key = `${r[c.start]}|${r[c.title] ?? ''}`;
    const w = workouts.get(key) ?? { key, date, title: (r[c.title] ?? 'Workout').trim(), sets: [] };
    const type = String(r[c.type] ?? 'normal').toLowerCase();
    w.sets.push({
      exercise: String(r[c.ex]).trim(),
      set_no: Number(r[c.idx] ?? w.sets.length) + 1,
      type: type.includes('warm') ? 'warmup' : type.includes('drop') ? 'drop' : type.includes('fail') ? 'failure' : 'normal',
      weight: Number(r[c.kg]) || 0,
      reps: Number(r[c.reps]) || 0
    });
    workouts.set(key, w);
  }
  return [...workouts.values()].sort((a, b) => a.date.localeCompare(b.date));
}

export { slug, weekday, addDays };
