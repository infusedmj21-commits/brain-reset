import { describe, expect, it } from 'vitest';
import { normalize, parseLines, pickWords, scoreRecall, weeklyTestHistory } from '../src/logic/palace.js';
import { WORD_LIST } from '../src/logic/words.js';
import { weekStart } from '../src/logic/dates.js';
import { activeSession, clock, countdown, nextStep, pendingRecall } from '../src/logic/unprompted.js';

describe('word list', () => {
  it('has plenty of distinct words, multi-word items kept whole', () => {
    expect(WORD_LIST.length).toBeGreaterThan(350);
    expect(new Set(WORD_LIST).size).toBe(WORD_LIST.length);
    expect(WORD_LIST).toContain('teddy bear');
    expect(WORD_LIST).not.toContain('teddy');
  });
});

describe('pickWords', () => {
  it('returns n distinct words', () => {
    const w = pickWords(20);
    expect(w).toHaveLength(20);
    expect(new Set(w).size).toBe(20);
  });
  it('is deterministic with a seeded rng', () => {
    const rng = () => 0;
    expect(pickWords(3, rng, ['a', 'b', 'c', 'd'])).toEqual(['a', 'b', 'c']);
  });
});

describe('parseLines', () => {
  it('drops blank lines and trims', () => {
    expect(parseLines(' Front door \n\nHallway\r\n  ')).toEqual(['Front door', 'Hallway']);
  });
});

describe('normalize', () => {
  it('ignores case, accents, punctuation and plurals', () => {
    expect(normalize('Apples!')).toBe('apple');
    expect(normalize('  Teddy-Bear ')).toBe('teddy bear');
    expect(normalize('Café')).toBe('cafe');
    expect(normalize('watches')).toBe('watch');
    expect(normalize('glass')).toBe('glass');
    expect(normalize('bus')).toBe('bus');
  });
});

describe('scoreRecall', () => {
  const targets = ['apple', 'rocket', 'violin', 'teddy bear'];
  it('counts exact spots and out-of-place recalls', () => {
    const r = scoreRecall(targets, ['Apple', 'violin', 'rocket', '']);
    expect(r.total).toBe(4);
    expect(r.recalled).toBe(3);
    expect(r.inOrder).toBe(1);
    expect(r.items[3].recalled).toBe(false);
  });
  it('does not double count a repeated answer', () => {
    const r = scoreRecall(['apple', 'apple2'], ['apple', 'apple']);
    expect(r.recalled).toBe(1);
  });
  it('gives full marks for a perfect run', () => {
    const r = scoreRecall(targets, ['apples', 'Rocket', 'violin', 'teddy-bear']);
    expect(r.recalled).toBe(4);
    expect(r.inOrder).toBe(4);
  });
});

describe('weeklyTestHistory', () => {
  it('keeps the best test per week, newest first, ignoring practice', () => {
    const rows = [
      { date: '2026-11-02', recalled: 12, is_weekly_test: true },
      { date: '2026-11-04', recalled: 15, is_weekly_test: true },
      { date: '2026-11-05', recalled: 19, is_weekly_test: false },
      { date: '2026-11-10', recalled: 17, is_weekly_test: true }
    ];
    const h = weeklyTestHistory(rows, weekStart);
    expect(h.map((x) => [x.week, x.recalled])).toEqual([['2026-11-09', 17], ['2026-11-02', 15]]);
  });
});

describe('unprompted timing', () => {
  const start = '2026-11-02T10:00:00.000Z';
  const at = (sec) => Date.parse(start) + sec * 1000;
  it('counts down from the start timestamp', () => {
    expect(countdown(start, 900, at(60))).toMatchObject({ remaining: 840, finished: false });
    expect(countdown(start, 900, at(960))).toMatchObject({ remaining: 0, overtime: 60, finished: true });
  });
  it('handles untimed and unstarted steps', () => {
    expect(countdown(null, 60).finished).toBe(false);
    expect(countdown(start, null).remaining).toBeNull();
  });
  it('formats clocks and walks the steps', () => {
    expect(clock(900)).toBe('15:00');
    expect(clock(65)).toBe('1:05');
    expect(nextStep('research')).toBe('summary');
    expect(nextStep('talk')).toBe('done');
  });
  it('finds yesterday’s session waiting for recall and the active session', () => {
    const sessions = [
      { id: 'a', date: '2026-11-01', completed: true, recall_done_at: null, created_at: '1' },
      { id: 'b', date: '2026-10-30', completed: true, recall_done_at: null, created_at: '0' },
      { id: 'c', date: '2026-11-02', completed: false, created_at: '2' }
    ];
    expect(pendingRecall(sessions, '2026-11-02').id).toBe('a');
    expect(pendingRecall([{ ...sessions[0], recall_done_at: 'x' }], '2026-11-02')).toBeNull();
    expect(activeSession(sessions).id).toBe('c');
  });
});
