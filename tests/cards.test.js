import { describe, expect, it } from 'vitest';
import {
  Rating, State, adaptiveNew, cardsFromDeck, checkTyped, dueSummary, forecast, forgetRate, fromFsrs,
  intervalLabel, parseCloze, performanceFactor, preview
} from '../src/logic/cards.js';

const deck = {
  id: 't',
  notes: [
    { id: 't:dos', stage: 2, es: 'dos', en: 'two', cards: ['recog'] },
    { id: 't:uno', stage: 1, es: 'uno', en: 'one', cards: ['prod', 'recog', 'audio'] }
  ]
};

describe('flashcards', () => {
  it('builds cards in stage order, recognition before production', () => {
    expect(cardsFromDeck(deck).map((c) => c.id)).toEqual(['t:uno:recog', 't:uno:prod', 't:uno:audio', 't:dos:recog']);
  });
  it('schedules with FSRS: Good on a new card comes back in minutes, then days', () => {
    const now = new Date('2026-11-15T10:00:00Z');
    const first = preview(null, now)[Rating.Good].card;
    expect(intervalLabel(now, first.due)).toBe('10m');
    const row = { id: 'x', fsrs: fromFsrs(first) };
    const later = new Date('2026-11-15T10:11:00Z');
    const second = preview(row, later)[Rating.Good].card;
    expect((second.due - later) / 86400000).toBeGreaterThan(1);
  });
  it('splits learning, reviews due today, and fresh cards', () => {
    const now = new Date('2026-11-15T10:00:00Z');
    const defs = cardsFromDeck(deck);
    const states = [
      { id: 't:uno:recog', fsrs: { state: State.Review, due: '2026-11-15T20:00:00Z' } },
      { id: 't:uno:prod', fsrs: { state: State.Learning, due: '2026-11-15T09:59:00Z' } },
      { id: 't:uno:audio', fsrs: { state: State.Review, due: '2026-11-20T09:00:00Z' } }
    ];
    const s = dueSummary(defs, states, now);
    expect(s.reviews.map((c) => c.id)).toEqual(['t:uno:recog']);
    expect(s.learning.map((c) => c.id)).toEqual(['t:uno:prod']);
    expect(s.fresh.map((c) => c.id)).toEqual(['t:dos:recog']);
    expect(forecast(states, now, 7)).toEqual([2, 0, 0, 0, 0, 1, 0]);
  });
  it('adapts new cards to the day, the review load and the forget rate', () => {
    expect(adaptiveNew({ tier: 'full', reviewsDue: 20, rate: null, available: 500 }).count).toBe(20);
    expect(adaptiveNew({ tier: 'light', reviewsDue: 20, rate: null, available: 500 }).count).toBe(10);
    expect(adaptiveNew({ tier: 'minimum', reviewsDue: 20, rate: null, available: 500 }).count).toBe(0);
    // Heavy review load: capped, but never below 5.
    const heavy = adaptiveNew({ tier: 'normal', reviewsDue: 160, rate: null, available: 500 });
    expect(heavy.count).toBe(5);
    expect(heavy.reasons.join(' · ')).toMatch(/160 reviews due/);
    // Forgetting a lot slows things down; already-done new cards count towards today.
    expect(performanceFactor(0.25)).toBeLessThan(0.6);
    expect(adaptiveNew({ tier: 'full', reviewsDue: 0, rate: 0.1, available: 500, doneToday: 12 }).count).toBe(8);
  });
  it('measures forgetting on mature reviews only, once there are enough', () => {
    const now = new Date('2026-11-15T10:00:00Z');
    const r = (rating, prev_state = State.Review) => ({ rating, prev_state, at: '2026-11-14T10:00:00Z' });
    expect(forgetRate([r(Rating.Again)], now).rate).toBeNull();
    const many = [...Array(18).fill(r(Rating.Good)), r(Rating.Again), r(Rating.Again), r(Rating.Again, State.Learning)];
    expect(forgetRate(many, now).rate).toBeCloseTo(0.1, 5);
  });
  it('checks typed answers, forgiving missing accents but flagging them', () => {
    expect(checkTyped('¿Dónde está?', 'dónde está')).toEqual({ correct: true, accents: true });
    expect(checkTyped('donde esta', 'dónde está')).toEqual({ correct: true, accents: false });
    expect(checkTyped('el móvil', 'el móvil / el teléfono').correct).toBe(true);
    expect(checkTyped('carro', 'coche').correct).toBe(false);
    expect(parseCloze('¿Dónde [está] el baño?')).toEqual({ before: '¿Dónde ', answer: 'está', after: ' el baño?' });
  });
});
