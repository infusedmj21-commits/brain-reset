import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, cleanSettings, describeSettings, isStandard, makeProblem, roundStats } from '../src/logic/arithmetic.js';

// Small seeded generator so runs are repeatable.
function seeded(seed = 1) {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

describe('settings', () => {
  it('defaults match Zetamac and count as standard', () => {
    const { settings, errors } = cleanSettings({});
    expect(errors).toEqual([]);
    expect(settings.addA).toEqual([2, 100]);
    expect(settings.mulA).toEqual([2, 12]);
    expect(settings.duration).toBe(120);
    expect(isStandard(settings)).toBe(true);
  });
  it('anything changed is non-standard', () => {
    expect(isStandard({ ...DEFAULT_SETTINGS, duration: 60 })).toBe(false);
    expect(isStandard({ ...DEFAULT_SETTINGS, div: false })).toBe(false);
    expect(isStandard({ ...DEFAULT_SETTINGS, mulB: [2, 50] })).toBe(false);
  });
  it('fixes swapped ranges, junk values and bad durations', () => {
    const { settings } = cleanSettings({ addA: [50, 10], mulB: ['x', 20], duration: 45 });
    expect(settings.addA).toEqual([10, 50]);
    expect(settings.mulB).toEqual([2, 20]);
    expect(settings.duration).toBe(120);
  });
  it('never allows dividing by zero', () => {
    expect(cleanSettings({ mulA: [0, 5] }).settings.mulA).toEqual([1, 5]);
  });
  it('needs at least one operation', () => {
    expect(cleanSettings({ add: false, sub: false, mul: false, div: false }).errors).toHaveLength(1);
  });
  it('describes settings briefly', () => {
    expect(describeSettings(DEFAULT_SETTINGS)).toBe('+ (2–100) & (2–100) · − · × (2–12) & (2–100) · ÷ · 2 min');
  });
});

describe('makeProblem', () => {
  const rng = seeded(42);
  const s = cleanSettings({}).settings;
  const problems = Array.from({ length: 4000 }, () => makeProblem(s, rng));

  it('covers all four operations', () => {
    expect(new Set(problems.map((p) => p.op))).toEqual(new Set(['add', 'sub', 'mul', 'div']));
  });
  it('keeps operands inside the ranges and answers correct', () => {
    for (const p of problems) {
      if (p.op === 'add') {
        expect(p.a).toBeGreaterThanOrEqual(2); expect(p.a).toBeLessThanOrEqual(100);
        expect(p.answer).toBe(p.a + p.b);
      }
      if (p.op === 'sub') {
        expect(p.answer).toBe(p.a - p.b);
        expect(p.answer).toBeGreaterThanOrEqual(2); // reverse of addition
      }
      if (p.op === 'mul') {
        expect(p.a).toBeLessThanOrEqual(12);
        expect(p.answer).toBe(p.a * p.b);
      }
      if (p.op === 'div') {
        expect(p.a % p.b).toBe(0);
        expect(p.answer).toBe(p.a / p.b);
        expect(p.b).toBeLessThanOrEqual(12); // divisor comes from the 2–12 range
      }
    }
  });
  it('only uses enabled operations', () => {
    const only = cleanSettings({ add: false, sub: false, div: false }).settings;
    expect(new Set(Array.from({ length: 200 }, () => makeProblem(only, rng).op))).toEqual(new Set(['mul']));
  });
  it('avoids repeating the previous problem', () => {
    const tiny = cleanSettings({ sub: false, mul: false, div: false, addA: [2, 3], addB: [2, 2] }).settings;
    let prev = null;
    for (let i = 0; i < 50; i++) {
      const p = makeProblem(tiny, rng, prev);
      if (prev) expect(p.text).not.toBe(prev.text);
      prev = p;
    }
  });
});

describe('roundStats', () => {
  it('summarises speed overall, per operation and slowest problems', () => {
    const r = roundStats([
      { op: 'add', text: '2 + 2', ms: 1000 },
      { op: 'add', text: '50 + 70', ms: 3000 },
      { op: 'mul', text: '12 × 97', ms: 8000 }
    ]);
    expect(r.score).toBe(3);
    expect(r.avgMs).toBe(4000);
    expect(r.byOp.add).toEqual({ count: 2, avgMs: 2000 });
    expect(r.slowest[0].text).toBe('12 × 97');
  });
  it('handles an empty round', () => {
    expect(roundStats([])).toMatchObject({ score: 0, avgMs: null, slowest: [] });
  });
});
