// Where the arithmetic sprint is slowest, across every saved round.
//
// Each answered problem is tagged with the skills it uses (a times table, carrying,
// borrowing, a divisor…). A skill is weak when its typical time is well above your
// typical time for that operation, so a hard level doesn't make everything look weak.
// Medians, not averages, so one distracted answer doesn't skew a skill.
//
// Kept deliberately simple and data-first: every answer (and the problem you were stuck
// on when time ran out) is stored, so an adaptive practice mode can be built on it later.

import { OPS } from './arithmetic.js';

const MIN_SEEN = 3; // a skill needs this many answers before it's judged
const FACT_MIN_SEEN = 2;

export function median(xs) {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** a and b for problems saved before they were stored separately ("7 × 8"). */
export function operands(p) {
  if (Number.isFinite(p.a) && Number.isFinite(p.b)) return [p.a, p.b];
  const m = String(p.text ?? '').match(/(\d+)\s*\S\s*(\d+)/);
  return m ? [Number(m[1]), Number(m[2])] : [null, null];
}

/** Skills a problem exercises, as [key, label]. */
export function skillsOf(p) {
  const [a, b] = operands(p);
  if (a == null) return [];
  const out = [];
  if (p.op === 'add') {
    const carry = (a % 10) + (b % 10) >= 10;
    out.push(carry ? ['add:carry', 'Addition with carrying'] : ['add:nocarry', 'Addition, no carrying']);
    if (a >= 100 || b >= 100) out.push(['add:3digit', 'Adding three-digit numbers']);
  } else if (p.op === 'sub') {
    const borrow = a % 10 < b % 10;
    out.push(borrow ? ['sub:borrow', 'Subtraction with borrowing'] : ['sub:noborrow', 'Subtraction, no borrowing']);
    if (a >= 100) out.push(['sub:3digit', 'Subtracting from three-digit numbers']);
  } else if (p.op === 'mul') {
    for (const t of new Set([a, b])) if (t >= 2 && t <= 12) out.push([`mul:${t}`, `${t}× table`]);
    if (a > 12 || b > 12) out.push(['mul:big', 'Multiplying past 12']);
  } else if (p.op === 'div') {
    if (b >= 2 && b <= 12) out.push([`div:${b}`, `Dividing by ${b}`]);
    if (b > 12) out.push(['div:big', 'Dividing by more than 12']);
  }
  return out;
}

/** The underlying fact, so 7 × 8 and 8 × 7 (and 56 ÷ 8) count together. */
export function factOf(p) {
  const [a, b] = operands(p);
  if (a == null) return null;
  if (p.op === 'mul') return `${Math.min(a, b)} × ${Math.max(a, b)}`;
  if (p.op === 'div') {
    const q = p.answer ?? a / b;
    return `${Math.min(b, q)} × ${Math.max(b, q)}`;
  }
  return `${a} ${OPS[p.op]?.symbol ?? '?'} ${b}`;
}

/**
 * Weak spots across rounds.
 * rounds: saved sprint rounds ({ problems: [{op, text, a?, b?, answer, ms, misses?}], stuck? }).
 * Returns per-operation times, skills ranked weakest first, slowest facts, and problems
 * you were stuck on when the clock ran out.
 */
export function weakSpots(rounds, { since = null } = {}) {
  const use = rounds.filter((r) => !r.deleted && (!since || (r.date ?? '') >= since));
  const answers = use.flatMap((r) => (r.problems ?? []).filter((p) => p && p.op && Number.isFinite(p.ms)));

  const opTimes = {};
  for (const p of answers) (opTimes[p.op] ??= []).push(p.ms);
  const opMedian = Object.fromEntries(Object.entries(opTimes).map(([op, ms]) => [op, median(ms)]));
  const ops = Object.entries(opTimes)
    .map(([op, ms]) => ({ op, label: OPS[op]?.label ?? op, count: ms.length, medianMs: median(ms) }))
    .sort((x, y) => y.medianMs - x.medianMs);

  const skills = new Map();
  const facts = new Map();
  for (const p of answers) {
    for (const [key, label] of skillsOf(p)) {
      const s = skills.get(key) ?? { key, label, op: p.op, ms: [], misses: 0 };
      s.ms.push(p.ms);
      s.misses += p.misses ?? 0;
      skills.set(key, s);
    }
    const f = factOf(p);
    if (f && (p.op === 'mul' || p.op === 'div')) {
      const x = facts.get(f) ?? { fact: f, ms: [], misses: 0 };
      x.ms.push(p.ms);
      x.misses += p.misses ?? 0;
      facts.set(f, x);
    }
  }

  const skillList = [...skills.values()]
    .filter((s) => s.ms.length >= MIN_SEEN)
    .map((s) => {
      const med = median(s.ms);
      return {
        key: s.key,
        label: s.label,
        op: s.op,
        count: s.ms.length,
        medianMs: med,
        // 1.0 = your usual speed for this operation; 1.5 = half as slow again.
        slowness: opMedian[s.op] ? med / opMedian[s.op] : 1,
        missRate: s.misses / s.ms.length
      };
    })
    .sort((x, y) => y.slowness - x.slowness);

  const factList = [...facts.values()]
    .filter((f) => f.ms.length >= FACT_MIN_SEEN)
    .map((f) => ({ fact: f.fact, count: f.ms.length, medianMs: median(f.ms), misses: f.misses }))
    .sort((x, y) => y.medianMs - x.medianMs);

  const stuck = use
    .filter((r) => r.stuck?.text)
    .map((r) => ({ text: r.stuck.text, date: r.date, ms: r.stuck.ms }))
    .slice(-10)
    .reverse();

  return {
    rounds: use.length,
    answers: answers.length,
    ops,
    skills: skillList,
    weakest: skillList.filter((s) => s.slowness >= 1.15).slice(0, 3),
    facts: factList.slice(0, 8),
    stuck
  };
}
