import { db, live, save } from '../db.js';
import { tiktokState, tiktokStep } from '../logic/routine.js';

// The TikTok plan (which step you're on and since when) and a daily under/over log. Both sync.
const PLAN_ID = 'setting:tiktok';

export async function getTiktokPlan(date, database = db) {
  const row = await database.checkins.get(PLAN_ID);
  if (row && !row.deleted && row.values?.history?.length) return row.values;
  // First run of the new plan: start at week 1 from today.
  const plan = { history: [{ level: 1, from: date }], snoozedUntil: null };
  await save('checkins', { id: PLAN_ID, kind: 'setting', date: '', values: plan }, database);
  return plan;
}

const savePlan = (plan, database) => save('checkins', { id: PLAN_ID, kind: 'setting', date: '', values: plan }, database);

export async function tiktokLogs(database = db) {
  const rows = (await live('checkins', database)).filter((r) => r.kind === 'tiktok');
  return Object.fromEntries(rows.map((r) => [r.date, r.result]));
}

export async function loadTiktok(date, database = db) {
  const [plan, logs] = await Promise.all([getTiktokPlan(date, database), tiktokLogs(database)]);
  return { plan, logs, state: tiktokState(plan, logs, date) };
}

/** How a day went: 'under' or 'over' the limit. Tapping the same answer again clears it. */
export async function logTiktokDay(date, result, logs, database = db) {
  const clear = logs[date] === result;
  return save('checkins', { id: `tiktok:${date}`, kind: 'tiktok', date, result: clear ? null : result, deleted: clear }, database);
}

export async function stepTiktok(date, by, database = db) {
  return savePlan(tiktokStep(await getTiktokPlan(date, database), date, by), database);
}

/** Stay at this level for another week before being offered the next step. */
export async function holdTiktok(date, until, database = db) {
  return savePlan({ ...(await getTiktokPlan(date, database)), snoozedUntil: until }, database);
}

export async function restartTiktok(date, database = db) {
  return savePlan({ history: [{ level: 1, from: date }], snoozedUntil: null }, database);
}
