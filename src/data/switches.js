import { db, save } from '../db.js';
import { makeRules, setRules } from '../logic/routine.js';

// Daily task switches: a dated log of on/off changes, synced across devices.
const ID = 'setting:switches';

export async function loadSwitches(database = db) {
  const row = await database.checkins.get(ID);
  const events = row && !row.deleted ? row.values?.events ?? [] : [];
  const rules = makeRules(events);
  setRules(rules);
  return rules;
}

/** Switch a task on or off from `date` onwards. Flipping twice on one day keeps only the last. */
export async function setSwitch(habit, enabled, date, database = db) {
  const row = await database.checkins.get(ID);
  const events = (row && !row.deleted ? row.values?.events ?? [] : []).filter((e) => !(e.habit === habit && e.from === date));
  events.push({ habit, enabled, from: date });
  await save('checkins', { id: ID, kind: 'setting', date: '', values: { events } }, database);
  return loadSwitches(database);
}
