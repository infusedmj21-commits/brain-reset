// All dates in the app are local calendar dates as 'YYYY-MM-DD' strings.
// Arithmetic is done at UTC noon so daylight-saving changes never shift a day.

export function toISODate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function today(now = new Date()) {
  return toISODate(now);
}

function parse(date) {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12));
}

function format(utcNoon) {
  return utcNoon.toISOString().slice(0, 10);
}

export function addDays(date, n) {
  const d = parse(date);
  d.setUTCDate(d.getUTCDate() + n);
  return format(d);
}

export function daysBetween(a, b) {
  return Math.round((parse(b) - parse(a)) / 864e5);
}

// Monday is day 0.
export function weekday(date) {
  return (parse(date).getUTCDay() + 6) % 7;
}

export function weekStart(date) {
  return addDays(date, -weekday(date));
}

export function weekDates(date) {
  const start = weekStart(date);
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
}

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function prettyDate(date) {
  const d = parse(date);
  return `${DAYS[weekday(date)]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
}
