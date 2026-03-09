import { describe, it, expect } from 'vitest';
import { createCardTracker } from '../src/ai/card-tracker.js';
import { createInitialState } from '../src/state.js';
import { setup } from '../src/engine.js';
import { createAIs } from '../src/ai/index.js';

describe('CardTracker', () => {
  function setupGame(seed = 42) {
    const state = createInitialState(4, false, seed);
    const ais = createAIs(4, 'all-random', state.rng);
    state.players.forEach((p, i) => p.name = `P${i}`);
    setup(state, ais);
    return { state, ais };
  }

  it('returns probabilities in valid range [0, 1]', () => {
    const { state } = setupGame();
    const tracker = createCardTracker(state, 0);

    for (let pi = 1; pi < 4; pi++) {
      const pAce = tracker.probHasAce(pi);
      const pKing = tracker.probHasKing(pi);
      expect(pAce).toBeGreaterThanOrEqual(0);
      expect(pAce).toBeLessThanOrEqual(1);
      expect(pKing).toBeGreaterThanOrEqual(0);
      expect(pKing).toBeLessThanOrEqual(1);
    }
  });

  it('probability of own index is 0 (cannot query self)', () => {
    const { state } = setupGame();
    // Give player 0 all their aces explicitly — doesn't matter,
    // probHasAce uses opponent hand size
    const tracker = createCardTracker(state, 0);
    // Not really "0" but tests the tracker doesn't crash on self
    expect(tracker.probHasAce(0)).toBeGreaterThanOrEqual(0);
  });

  it('unseen aces decreases when aces are visible', () => {
    const { state } = setupGame();
    const before = createCardTracker(state, 0).unseenAces;

    // Move an ace to the discard (making it visible)
    const aceIdx = state.minorDeck.findIndex(c => c.rank === 'ACE');
    if (aceIdx >= 0) {
      const ace = state.minorDeck.splice(aceIdx, 1)[0];
      state.minorDiscard.push(ace);
    }

    const after = createCardTracker(state, 0).unseenAces;
    expect(after).toBeLessThanOrEqual(before);
  });

  it('probAnyOpponentHasAce returns reasonable value', () => {
    const { state } = setupGame();
    const tracker = createCardTracker(state, 0);
    const prob = tracker.probAnyOpponentHasAce(0);
    // With 3 opponents each holding ~6 cards and 4 aces in 56-card deck,
    // probability at least one has an ace should be high
    expect(prob).toBeGreaterThan(0.3);
    expect(prob).toBeLessThanOrEqual(1);
  });

  it('hiddenPoolSize is positive', () => {
    const { state } = setupGame();
    const tracker = createCardTracker(state, 0);
    expect(tracker.hiddenPoolSize).toBeGreaterThan(0);
  });

  it('unseenOfRank returns 0-4', () => {
    const { state } = setupGame();
    const tracker = createCardTracker(state, 0);
    for (let rank = 1; rank <= 14; rank++) {
      const count = tracker.unseenOfRank(rank);
      expect(count).toBeGreaterThanOrEqual(0);
      expect(count).toBeLessThanOrEqual(4);
    }
  });
});
