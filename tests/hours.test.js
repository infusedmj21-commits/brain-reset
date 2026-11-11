import { describe, expect, it } from 'vitest';
import { fmtHours } from '../src/logic/money.js';

describe('hours display', () => {
  it('shows hours and minutes', () => {
    expect(fmtHours(7 + 20 / 60)).toBe('7h 20m');
    expect(fmtHours(8)).toBe('8h');
    expect(fmtHours(10)).toBe('10h');
  });
});
