import { describe, expect, it } from 'vitest';
import { checklistDayType, dayLoad, effectiveTier, loadReason, tierFor } from '../src/logic/dayload.js';

const shift = (date, hours, start = '12:00') => ({ date, hours, start, status: 'booked' });

describe('day load', () => {
  it('a free day between two blocks of 3 shifts is Light or Normal, not Full', () => {
    const shifts = ['2026-11-10', '2026-11-11', '2026-11-12', '2026-11-14', '2026-11-15', '2026-11-16'].map((d) => shift(d, 8));
    const load = dayLoad(shifts, '2026-11-13');
    expect(load.hours).toMatchObject({ today: 0, yesterday: 8, dayBefore: 8, tomorrow: 8 });
    expect(['light', 'normal']).toContain(load.tier);
    expect(loadReason(load, shifts)).toMatch(/Rest day after 3 shifts/);
  });
  it('carries fatigue: back-to-back long shifts reach Minimum', () => {
    const shifts = [shift('2026-11-10', 8), shift('2026-11-11', 8), shift('2026-11-12', 8)];
    expect(dayLoad(shifts, '2026-11-12').tier).toBe('minimum');
    expect(dayLoad(shifts, '2026-11-10').tier).toBe('light'); // first shift after rest
  });
  it('a quiet stretch is Full, and an early start tomorrow counts for more', () => {
    expect(dayLoad([], '2026-11-13').tier).toBe('full');
    const late = dayLoad([shift('2026-11-14', 8, '17:00')], '2026-11-13');
    const early = dayLoad([shift('2026-11-14', 8, '07:30')], '2026-11-13');
    expect(early.score).toBeGreaterThan(late.score);
    expect(early.tomorrowEarly).toBe(true);
  });
  it('ignores cancelled shifts and takes timing from the start time', () => {
    expect(dayLoad([{ ...shift('2026-11-13', 8), status: 'cancelled' }], '2026-11-13').hours.today).toBe(0);
    expect(dayLoad([shift('2026-11-13', 6, '17:30')], '2026-11-13').timing).toBe('late');
    expect(dayLoad([shift('2026-11-13', 6, '08:00')], '2026-11-13').timing).toBe('early');
  });
  it('respects edited thresholds and overrides', () => {
    expect(tierFor(3, { normal: 4, light: 8, minimum: 12 })).toBe('full');
    const load = dayLoad([], '2026-11-13');
    expect(effectiveTier(load, { tier_override: 'minimum', override_reason: 'ill' })).toEqual({ tier: 'minimum', overridden: true, reason: 'ill' });
    expect(checklistDayType('minimum', 'late')).toBe('minimum');
    expect(checklistDayType('light', 'late')).toBe('late');
  });
});
