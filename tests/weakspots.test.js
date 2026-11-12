import { describe, expect, it } from 'vitest';
import { factOf, median, operands, skillsOf, weakSpots } from '../src/logic/weakspots.js';

const p = (op, text, ms, extra = {}) => {
  const [a, b] = text.split(/ \S /).map(Number);
  const answer = { add: a + b, sub: a - b, mul: a * b, div: a / b }[op];
  return { op, text, answer, ms, ...extra };
};

describe('weak spots', () => {
  it('reads operands from older saved problems', () => {
    expect(operands({ text: '56 ÷ 8' })).toEqual([56, 8]);
    expect(operands({ a: 3, b: 4, text: 'x' })).toEqual([3, 4]);
  });
  it('tags skills', () => {
    expect(skillsOf(p('add', '27 + 45', 1)).map(([k]) => k)).toEqual(['add:carry']);
    expect(skillsOf(p('sub', '52 − 27', 1)).map(([k]) => k)).toEqual(['sub:borrow']);
    expect(skillsOf(p('mul', '7 × 8', 1)).map(([k]) => k)).toEqual(['mul:7', 'mul:8']);
    expect(skillsOf(p('div', '56 ÷ 8', 1)).map(([k]) => k)).toEqual(['div:8']);
  });
  it('treats 7 × 8, 8 × 7 and 56 ÷ 8 as one fact', () => {
    expect(factOf(p('mul', '8 × 7', 1))).toBe('7 × 8');
    expect(factOf(p('div', '56 ÷ 8', 1))).toBe('7 × 8');
    expect(median([5, 1, 3])).toBe(3);
  });
  it('finds the slow table relative to your usual multiplication speed', () => {
    const problems = [];
    for (let i = 0; i < 6; i++) {
      problems.push(p('mul', '7 × 8', 4000, { misses: 1 }), p('mul', '3 × 4', 1200), p('mul', '2 × 5', 1000), p('mul', '4 × 5', 1100));
    }
    const w = weakSpots([{ date: '2026-11-12', problems, stuck: { text: '7 × 9' } }]);
    expect(w.answers).toBe(24);
    expect(w.weakest[0].key).toMatch(/^mul:(7|8)$/);
    expect(w.weakest[0].slowness).toBeGreaterThan(2);
    expect(w.facts[0]).toMatchObject({ fact: '7 × 8', count: 6, misses: 6 });
    expect(w.stuck[0].text).toBe('7 × 9');
  });
  it('can look at recent rounds only', () => {
    const old = { date: '2026-09-01', problems: [p('add', '1 + 2', 900)] };
    const recent = { date: '2026-11-10', problems: [p('add', '3 + 4', 800)] };
    expect(weakSpots([old, recent], { since: '2026-10-13' }).answers).toBe(1);
  });
});
