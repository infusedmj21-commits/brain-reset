import { describe, expect, it } from 'vitest';
import {
  Rating, State, adaptiveNew, cardsFromDeck, checkTyped, dueSummary, forecast, forgetRate, fromFsrs,
  intervalLabel, isSettled, parseCloze, performanceFactor, placedState, preview, stageGate
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

describe('sibling cards', () => {
  it('introduces recognition first, and the other cards of a word only on a later day', async () => {
    const { introducible, cardsFromDeck } = await import('../src/logic/cards.js');
    const defs = cardsFromDeck({ id: 't', notes: [{ id: 't:agua', es: 'el agua', en: 'water', cards: ['recog', 'image'] }, { id: 't:pan', es: 'el pan', en: 'bread', cards: ['recog', 'image'] }] });
    expect(introducible(defs, [], '2026-11-16').map((d) => d.id)).toEqual(['t:agua:recog', 't:pan:recog']);
    const today = [{ id: 't:agua:recog', note: 't:agua', introduced: '2026-11-16' }];
    expect(introducible(defs.filter((d) => d.id !== 't:agua:recog'), today, '2026-11-16').map((d) => d.id)).toEqual(['t:pan:recog']);
    expect(introducible(defs.filter((d) => d.id !== 't:agua:recog'), today, '2026-11-17').map((d) => d.id)).toEqual(['t:agua:image', 't:pan:recog']);
  });
});

describe('shipped decks', () => {
  it('every deck builds into cards with unique ids', async () => {
    const { DECKS } = await import('../src/decks/index.js');
    expect(DECKS.length).toBeGreaterThan(0);
    for (const deck of DECKS) {
      const ids = cardsFromDeck(deck).map((c) => c.id);
      expect(new Set(ids).size).toBe(ids.length);
    }
    const es = DECKS.find((d) => d.id === 'es');
    expect(es.notes.every((n) => n.stage === 1 && !n.cards.includes('cloze'))).toBe(true);
  });

  describe('stage gate and placement', () => {
    const now = new Date('2026-11-15T10:00:00Z');
    const big = { id: 'g', notes: [...Array.from({ length: 20 }, (_, i) => ({ id: `g:a${i}`, stage: 1, es: `a${i}`, en: 'x' })), { id: 'g:b0', stage: 2, es: 'b0', en: 'y' }] };
    const defs = cardsFromDeck(big);
    const stages = [{ id: 1 }, { id: 2 }];
    const row = (card) => ({ fsrs: fromFsrs(card) });

    it('a known word is a settled review card due weeks out', () => {
      const c = placedState(now, 30);
      expect(c.state).toBe(State.Review);
      expect(Math.round((c.due - now) / 86400000)).toBe(30);
      expect(isSettled(row(c))).toBe(true);
      const fresh = preview(null, now)[Rating.Good].card;
      expect(isSettled(row(fresh))).toBe(false);
    });
    it('keeps stage 2 shut until 85% of stage 1 is settled', () => {
      const byId = new Map(defs.filter((d) => d.stage === 1).slice(0, 16).map((d) => [d.id, row(placedState(now, 25))]));
      const shut = stageGate(defs, byId, stages);
      expect(shut.open.has(2)).toBe(false);
      expect(shut.waiting).toMatchObject({ stage: 2, settled: 16, need: 17, total: 20 });
      byId.set('g:a16:recog', row(placedState(now, 25)));
      expect(stageGate(defs, byId, stages).open.has(2)).toBe(true);
    });
  });
});
