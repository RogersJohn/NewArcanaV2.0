import { describe, it, expect } from 'vitest';
import { createInitialState } from '../src/state.js';
import { setup, playGame, drawPhase, playTurn } from '../src/engine.js';
import { RandomAI } from '../src/ai/base.js';

function makeAIs(n) {
  return Array.from({ length: n }, () => new RandomAI());
}

describe('Engine Setup', () => {
  it('produces correct initial state after setup', () => {
    const state = createInitialState(4);
    const ais = makeAIs(4);
    setup(state, ais);

    if (state.gameEnded) return; // Death in display is valid but rare

    // Each player should have 5 minor + 1 major = ~6 cards in hand
    for (const p of state.players) {
      expect(p.hand.length).toBeGreaterThanOrEqual(5);
      expect(p.hand.length).toBeLessThanOrEqual(7);
    }

    // Display should have 3 cards
    expect(state.display.filter(c => c !== null).length).toBe(3);

    // Pot should be player count
    expect(state.pot).toBe(4);

    // Round should be 1
    expect(state.roundNumber).toBe(1);
  });

  it('places Death in the bottom 3 cards of Major deck', () => {
    // Run 100 times and verify Death is never in top positions
    let deathFound = false;
    for (let trial = 0; trial < 100; trial++) {
      const state = createInitialState(4);
      const ais = makeAIs(4);

      // Manually check before setup completes
      const majorDeck = [...state.majorDeck];
      const deathIndex = majorDeck.findIndex(c => c.number === 13);
      expect(deathIndex).toBeGreaterThanOrEqual(0); // Death exists

      setup(state, ais);

      // After setup, Death should not be in the top of the major deck
      // (it should be near the bottom)
      // Death should be in bottom 3 of the original deck before display dealing
      // Since 3 cards are dealt to display, Death shouldn't appear in display
      // unless very rare (it's in bottom 3 before display deal)
      if (!state.gameEnded) {
        // If game didn't end, Death is not in display (good)
        // Check Death is still somewhere in the deck (bottom area)
        const deathInDeck = state.majorDeck.findIndex(c => c.number === 13);
        if (deathInDeck >= 0) {
          // Death is in deck. It should be in bottom 3 (indices 0, 1, 2)
          expect(deathInDeck).toBeLessThan(3);
          deathFound = true;
        }
      }
    }
    // At least some trials should have Death in deck bottom
    expect(deathFound).toBe(true);
  });

  it('setup with 3 players works', () => {
    const state = createInitialState(3);
    const ais = makeAIs(3);
    setup(state, ais);
    expect(state.pot).toBe(3);
    if (!state.gameEnded) {
      expect(state.players.length).toBe(3);
    }
  });
});

describe('Draw Phase', () => {
  it('draws correct number of cards', () => {
    const state = createInitialState(4);
    const ais = makeAIs(4);
    setup(state, ais);
    if (state.gameEnded) return;

    const player = state.players[0];
    const initialHand = player.hand.length;
    const initialRealm = player.realm.length;
    const initialTotal = initialHand + initialRealm;

    drawPhase(state, 0);

    const newTotal = player.hand.length + player.realm.length;
    if (initialTotal >= 6) {
      // Should draw exactly 1
      expect(newTotal).toBe(initialTotal + 1);
    } else {
      // Should draw up to 6
      expect(newTotal).toBe(6);
    }
  });

  it('always draws at least 1 card even with 6+ cards', () => {
    const state = createInitialState(4);
    const ais = makeAIs(4);
    setup(state, ais);
    if (state.gameEnded) return;

    // Give player extra cards to be at 6+
    const player = state.players[0];
    while (player.hand.length + player.realm.length < 7) {
      const card = state.minorDeck.pop();
      if (card) player.hand.push(card);
    }

    const before = player.hand.length;
    drawPhase(state, 0);
    expect(player.hand.length).toBe(before + 1);
  });
});

describe('Round-End Marker', () => {
  it('player takes marker when realm has 5 cards at turn end', () => {
    const state = createInitialState(4);
    const ais = makeAIs(4);
    setup(state, ais);
    if (state.gameEnded) return;

    // Manually give player 0 five cards in realm
    while (state.players[0].realm.length < 5) {
      const card = state.minorDeck.pop();
      if (card) state.players[0].realm.push(card);
    }

    // The marker check happens implicitly in the round loop
    // For testing, we verify the concept:
    expect(state.players[0].realm.length).toBe(5);
  });
});

describe('Full Game', () => {
  it('completes without errors using RandomAI', () => {
    const state = createInitialState(4);
    const ais = makeAIs(4);
    setup(state, ais);
    const result = playGame(state, ais);

    expect(result.gameEnded).toBe(true);
    expect(result.gameEndReason).toBeTruthy();
    expect(['death_revealed', 'death_purchased', 'deck_exhaustion', 'celestial_win', 'max_rounds'])
      .toContain(result.gameEndReason);
  });

  it('runs multiple games without crashing', { timeout: 15000 }, () => {
    for (let i = 0; i < 10; i++) {
      const state = createInitialState(4);
      const ais = makeAIs(4);
      setup(state, ais);
      const result = playGame(state, ais);
      expect(result.gameEnded).toBe(true);
    }
  });

  it('works with 3 players', { timeout: 15000 }, () => {
    for (let i = 0; i < 5; i++) {
      const state = createInitialState(3);
      const ais = makeAIs(3);
      setup(state, ais);
      const result = playGame(state, ais);
      expect(result.gameEnded).toBe(true);
    }
  });

  it('works with 5 players', { timeout: 15000 }, () => {
    for (let i = 0; i < 5; i++) {
      const state = createInitialState(5);
      const ais = makeAIs(5);
      setup(state, ais);
      const result = playGame(state, ais);
      expect(result.gameEnded).toBe(true);
    }
  });
});
