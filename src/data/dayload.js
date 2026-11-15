import { db, getDayPlan, save, setDayPlan } from '../db.js';
import { LOAD_DEFAULTS, dayLoad, effectiveTier, loadReason } from '../logic/dayload.js';
import { listShifts } from './money.js';

// Day load from logged shifts, your overrides, and a daily log for tuning the weights.
const SETTINGS_ID = 'setting:dayload';

export async function getLoadSettings(database = db) {
  const row = await database.checkins.get(SETTINGS_ID);
  const v = row && !row.deleted ? row.values ?? {} : {};
  return {
    weights: { ...LOAD_DEFAULTS.weights, ...v.weights },
    thresholds: { ...LOAD_DEFAULTS.thresholds, ...v.thresholds },
    earlyStart: v.earlyStart ?? LOAD_DEFAULTS.earlyStart
  };
}
export const setLoadSettings = (values, database = db) =>
  save('checkins', { id: SETTINGS_ID, kind: 'setting', date: '', values }, database);

/** Everything a screen needs about a day's load. Logs the day when anything about it changed. */
export async function loadDay(date, database = db, { log = true } = {}) {
  const [shifts, plan, settings] = await Promise.all([listShifts(database), getDayPlan(date, database), getLoadSettings(database)]);
  const load = dayLoad(shifts, date, settings);
  const eff = effectiveTier(load, plan);
  const day = { ...load, ...eff, computed: load.tier, why: loadReason(load, shifts), plan };
  if (log) await logDay(day, settings, database);
  return day;
}

/** Upsert the tuning row for a day, only when something changed (keeps sync quiet). */
async function logDay(day, settings, database) {
  const id = `day:${day.date}`;
  const existing = await database.day_logs.get(id);
  const row = {
    ...(existing ?? {}),
    id,
    date: day.date,
    score: day.score,
    computed_tier: day.computed,
    tier: day.tier,
    override: day.overridden ? day.tier : null,
    override_reason: day.overridden ? day.reason : null,
    hours: day.hours,
    tomorrow_early: day.tomorrowEarly,
    weights: settings.weights,
    thresholds: settings.thresholds
  };
  const same = existing && JSON.stringify({ ...existing, updated_at: 0, deleted: 0 }) === JSON.stringify({ ...row, updated_at: 0, deleted: 0 });
  if (!same) await save('day_logs', row, database);
}

/** Correct a day's tier (cancelled shift, bad sleep, ill…). Pass tier null to go back to automatic. */
export function overrideDay(date, tier, reason = null, database = db) {
  return setDayPlan(date, { tier_override: tier, override_reason: tier ? reason : null }, database);
}
