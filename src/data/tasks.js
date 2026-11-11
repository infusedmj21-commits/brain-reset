import { db, firstActiveDate, getDayPlan, live } from '../db.js';
import { getCheckin } from './checkins.js';
import { lastImport, listShifts } from './money.js';
import { byWhen } from '../logic/money.js';
import { listScores, listVentures, focusFor } from './ventures.js';
import { listWorkouts, ticksFor } from './health.js';
import { daysBetween, today, weekStart } from '../logic/dates.js';
import { activeDates, gapBefore, reviewWeek } from '../logic/review.js';
import { needsRescore, scoreHistory } from '../logic/scoring.js';

// Everything Artemis needs Michael to put in by hand, in one list.

/** Shifts that have happened but whose hours haven't been confirmed yet (asked from the day after). */
export function shiftsToConfirm(shifts, date) {
  return shifts
    .filter((s) => !s.deleted && s.status !== 'cancelled' && !s.confirmed && s.date < date)
    .sort(byWhen);
}

export const MONZO_EVERY_DAYS = 14;

export async function openTasks(database = db) {
  const date = today();
  const [shifts, ventures, scores, plan, focus, habitLogs, allFocus, workouts, first, imported, ticks] = await Promise.all([
    listShifts(database),
    listVentures(database),
    listScores(database),
    getDayPlan(date, database),
    focusFor(date, database),
    live('habit_logs', database),
    live('day_focus', database),
    listWorkouts(database),
    firstActiveDate(database),
    lastImport(database),
    ticksFor(date, database)
  ]);

  const tasks = [];

  const gap = gapBefore(date, activeDates({ habitLogs, workouts, focus: allFocus }));
  if (gap && !(await getCheckin(gap.id, database))) tasks.push({ kind: 'gap', id: gap.id, gap });

  for (const s of shiftsToConfirm(shifts, date)) tasks.push({ kind: 'shift', id: s.id, shift: s });

  if (!plan?.day_type) tasks.push({ kind: 'link', id: 'daytype', title: 'Pick today’s day type', detail: 'Early, late, day off or minimum: it sets your Brain Reset missions.', href: '#/today' });

  if (!focus.length) tasks.push({ kind: 'link', id: 'focus', title: 'Pick today’s 3', detail: 'Three tasks, each with when and where.', href: '#/home' });

  const hist = scoreHistory(scores);
  const due = ventures.filter((v) => v.status !== 'archived' && needsRescore(hist[v.id]?.latest, date, daysBetween));
  if (due.length) tasks.push({ kind: 'link', id: 'rescore', title: `Rescore ${due.length} venture${due.length === 1 ? '' : 's'}`, detail: due.map((v) => v.name).join(', '), href: '#/ventures' });

  const week = reviewWeek(date, weekStart);
  if (first && first <= week.end && !(await getCheckin(week.id, database))) {
    tasks.push({ kind: 'link', id: 'review', title: 'Do your weekly review', detail: 'Last week at a glance, then one thing to change.', href: '#/review' });
  }

  const since = imported ? daysBetween(imported.slice(0, 10), date) : null;
  if (since == null || since >= MONZO_EVERY_DAYS) {
    tasks.push({ kind: 'link', id: 'monzo', title: 'Import from Monzo', detail: since == null ? 'Not done yet: it fills in actual pay and spending.' : `Last import ${since} days ago.`, href: '#/money' });
  }

  if (!ticks.creatine || !ticks.protein) tasks.push({ kind: 'ticks', id: 'ticks', ticks });

  return tasks;
}

export async function openTaskCount(database = db) {
  return (await openTasks(database)).length;
}
