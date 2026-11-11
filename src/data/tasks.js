import { db, firstActiveDate, getDayPlan, live } from '../db.js';
import { getCheckin } from './checkins.js';
import { lastImport, listPayments, listShifts } from './money.js';
import { listTasks } from './ventures.js';
import { byWhen, gbp0 } from '../logic/money.js';
import { paydays } from '../logic/payroll.js';
import { listScores, listVentures, focusFor } from './ventures.js';
import { listWorkouts, ticksFor } from './health.js';
import { addDays, daysBetween, prettyDate, today, weekStart } from '../logic/dates.js';
import { activeDates, gapBefore, reviewWeek } from '../logic/review.js';
import { needsRescore, rankTasks, scoreHistory } from '../logic/scoring.js';
import { DAY_TYPES } from '../logic/routine.js';

const short = (d) => prettyDate(d).replace(/^(\w{3})\w*/, '$1');

/** Day type that fits today's shifts: early before 2pm, late after, minimum for 10h+ days. */
export function suggestDayType(todays) {
  if (!todays.length) return 'off';
  const hours = todays.reduce((t, x) => t + (Number(x.hours) || 0), 0);
  if (hours >= 10 || todays.length > 1) return 'minimum';
  return (todays[0].start ?? '09:00') < '14:00' ? 'early' : 'late';
}

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
  const [shifts, ventures, scores, plan, focus, habitLogs, allFocus, workouts, first, imported, ticks, payments, ventureTasks] = await Promise.all([
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
    ticksFor(date, database),
    listPayments(database),
    listTasks(database)
  ]);
  const liveShifts = shifts.filter((x) => !x.deleted && x.status !== 'cancelled');

  const tasks = [];

  const gap = gapBefore(date, activeDates({ habitLogs, workouts, focus: allFocus }));
  if (gap && !(await getCheckin(gap.id, database))) tasks.push({ kind: 'gap', id: gap.id, gap });

  for (const s of shiftsToConfirm(shifts, date)) tasks.push({ kind: 'shift', id: s.id, shift: s });

  if (!plan?.day_type) {
    const todays = liveShifts.filter((x) => x.date === date).sort(byWhen);
    const pick = suggestDayType(todays);
    tasks.push({
      kind: 'link', id: 'daytype', href: '#/today',
      title: `Pick today’s day type: ${DAY_TYPES[pick].label.toLowerCase()} fits`,
      detail: todays.length
        ? `You’re at ${todays.map((x) => `${x.venue} ${x.start ?? ''}`.trim()).join(' and ')} today.`
        : 'No shift booked today.',
      why: 'It sets which Brain Reset missions you get and when to do them, so today counts towards your streak.'
    });
  }

  if (!focus.length) {
    const active = ventures.filter((v) => v.status !== 'archived');
    const top = rankTasks(ventureTasks.filter((t) => active.some((v) => v.id === t.venture_id)))[0];
    const vname = (id) => ventures.find((v) => v.id === id)?.name ?? '';
    tasks.push({
      kind: 'link', id: 'focus', href: '#/home',
      title: 'Pick today’s 3 tasks',
      detail: top ? `Top of your list: “${top.title}” (${vname(top.venture_id)}).` : 'No venture tasks yet: add a few under Ventures first.',
      why: 'Three tasks with a set time and place get done far more often than a loose to-do list.'
    });
  }

  const hist = scoreHistory(scores);
  const due = ventures.filter((v) => v.status !== 'archived' && needsRescore(hist[v.id]?.latest, date, daysBetween));
  if (due.length) {
    const age = (v) => {
      const last = hist[v.id]?.latest?.date;
      return last ? `${v.name} (${daysBetween(last, date)} days ago)` : `${v.name} (never scored)`;
    };
    tasks.push({
      kind: 'link', id: 'rescore', href: '#/ventures',
      title: `Rescore ${due.length} venture${due.length === 1 ? '' : 's'}`,
      detail: due.map(age).join(', '),
      why: 'Impact, urgency and effort drift week to week. Fresh scores keep today’s task ranking honest.'
    });
  }

  const week = reviewWeek(date, weekStart);
  if (first && first <= week.end && !(await getCheckin(week.id, database))) {
    const worked = liveShifts.filter((x) => x.date >= week.start && x.date <= week.end).length;
    tasks.push({
      kind: 'link', id: 'review', href: '#/review',
      title: `Review last week (${short(week.start)} – ${short(week.end)})`,
      detail: `${worked} shift${worked === 1 ? '' : 's'}, your gym sessions and resets, then one thing to change. About 2 minutes.`,
      why: 'One small change a week compounds; without the review the same week repeats.'
    });
  }

  const since = imported ? daysBetween(imported.slice(0, 10), date) : null;
  if (since == null || since >= MONZO_EVERY_DAYS) {
    // Paydays since the last import that Monzo hasn't confirmed yet.
    const unchecked = paydays(liveShifts, payments, date, 12, 0).filter(
      (p) => p.past && p.expected > 0 && p.received == null && (!imported || p.payday > imported.slice(0, 10))
    );
    const firstShift = liveShifts.map((x) => x.date).sort()[0];
    const from = imported ? addDays(imported.slice(0, 10), 1) : firstShift ?? addDays(date, -30);
    const owed = unchecked.reduce((t, p) => t + p.expected, 0);
    tasks.push({
      kind: 'link', id: 'monzo', href: '#/money/import',
      title: `Import your Monzo statement from ${short(from)}`,
      detail: `In Monzo: Main account → ⋯ → Export statement → CSV, ${short(from)} to today. Then upload it here.`,
      why: unchecked.length
        ? `${unchecked.length} payday${unchecked.length === 1 ? '' : 's'} (${gbp0(owed)} before tax) still aren’t checked against what Compass actually paid, and spending insights stay empty.`
        : 'It checks your paydays against what actually landed, and fills your spending insights.'
    });
  }

  if (!ticks.creatine || !ticks.protein) tasks.push({ kind: 'ticks', id: 'ticks', ticks });

  return tasks;
}

export async function openTaskCount(database = db) {
  return (await openTasks(database)).length;
}
