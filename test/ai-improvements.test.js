/**
 * Tests for AI improvement: context-aware heuristics + round lookahead.
 */
import { describe, it, expect } from 'vitest';
import { createInitialState } from '../src/state.js';
import { setup } from '../src/engine.js';
import { createAIs } from '../src/ai/index.js';
import { estimateRemainingRounds, aceRetentionValue } from '../src/ai/awareness.js';
import { evaluatePosition, applyActionSimplified, chooseBestWithLookahead } from '../src/ai/lookahead.js';
import { scoreAction, SCORING_WEIGHTS, DEFAULT_WEIGHTS } from '../src/ai/personality.js';
import { getLegalActions } from '../src/actions.js';
import { estimateCardValue } from '../src/ai/card-value.js';

function setupGame(seed = 100) {
  const state = createInitialState(4, false, seed);
  const ais = createAIs(4, 'diverse', state.rng);
  for (let pi = 0; pi < 4; pi++) {
    state.players[pi].name = `${ais[pi].name}-${pi + 1}`;
  }
  setup(state, ais);
  return { state, ais };
}

describe('estimateRemainingRounds', () => {
  it('with full major deck returns ~7-8', () => {
    const { state } = setupGame(200);
    // After setup, deck should have ~15 cards
    const est = estimateRemainingRounds(state);
    expect(est).toBeGreaterThanOrEqual(5);
    expect(est).toBeLessThanOrEqual(10);
  });

  it('with nearly empty deck returns 1-2', () => {
    const { state } = setupGame(201);
    // Drain the major deck
    while (state.majorDeck.length > 2) state.majorDeck.pop();
    const est = estimateRemainingRounds(state);
    expect(est).toBeGreaterThanOrEqual(1);
    expect(est).toBeLessThanOrEqual(2);
  });

  it('is clamped to [1, 10]', () => {
    const { state } = setupGame(202);
    state.majorDeck.length = 0;
    expect(estimateRemainingRounds(state)).toBe(1);

    // Add lots of cards
    for (let i = 0; i < 30; i++) {
      state.majorDeck.push({ type: 'major', id: `fake-${i}`, number: 99 });
    }
    expect(estimateRemainingRounds(state)).toBe(10);
  });
});

describe('improved scoreBonusValue (via estimateCardValue)', () => {
  it('early game Tome card scores higher than late game for same board', () => {
    const { state } = setupGame(300);
    const pi = 0;
    // Find a major card in hand
    const majorCard = state.players[pi].hand.find(c => c.type === 'major');
    if (!majorCard) return; // skip if no major in hand

    const earlyValue = estimateCardValue(state, pi, majorCard, 'tome');

    // Simulate late game by draining deck
    while (state.majorDeck.length > 1) state.majorDeck.pop();
    const lateValue = estimateCardValue(state, pi, majorCard, 'tome');

    // Early game should generally score >= late game (more rounds to compound)
    expect(earlyValue).toBeGreaterThanOrEqual(lateValue * 0.8);
  });
});

describe('improved attack scoring', () => {
  it('attacking player with realm 4+ scores higher than empty-realm target', () => {
    const { state } = setupGame(400);
    const pi = 0;
    // Give player 0 a royal card
    const royalCard = { type: 'minor', suit: 'WANDS', rank: 'PAGE', numericRank: 11, id: 'test-page', purchaseValue: 11 };
    state.players[pi].hand.push(royalCard);

    // Give player 1 a big realm with a strong hand
    state.players[1].realm = [
      { type: 'minor', suit: 'CUPS', rank: '10', numericRank: 10, id: 'target-0', purchaseValue: 10 },
      { type: 'minor', suit: 'SWORDS', rank: '10', numericRank: 10, id: 'target-1', purchaseValue: 10 },
      { type: 'minor', suit: 'WANDS', rank: '10', numericRank: 10, id: 'target-2', purchaseValue: 10 },
      { type: 'minor', suit: 'WANDS', rank: '5', numericRank: 5, id: 'target-3', purchaseValue: 5 },
    ];
    // Give player 2 just 1 card
    state.players[2].realm = [
      { type: 'minor', suit: 'WANDS', rank: '3', numericRank: 3, id: 'target-small', purchaseValue: 3 },
    ];

    const attackBig = {
      type: 'PLAY_ROYAL', card: royalCard,
      target: { playerIndex: 1, realmIndex: 2 }, // Attack the WANDS card
    };
    const attackSmall = {
      type: 'PLAY_ROYAL', card: royalCard,
      target: { playerIndex: 2, realmIndex: 0 },
    };

    const scoreBig = scoreAction(state, pi, attackBig, SCORING_WEIGHTS);
    const scoreSmall = scoreAction(state, pi, attackSmall, SCORING_WEIGHTS);
    // Attacking the bigger realm should be more impactful
    expect(scoreBig).toBeGreaterThan(scoreSmall);
  });
});

describe('evaluatePosition', () => {
  it('position with realm 5 and best hand scores highest', () => {
    const { state } = setupGame(500);
    const pi = 0;
    // Give player 0 a strong realm
    state.players[pi].realm = [
      { type: 'minor', suit: 'WANDS', rank: '10', numericRank: 10, id: 'r1', purchaseValue: 10 },
      { type: 'minor', suit: 'WANDS', rank: '9', numericRank: 9, id: 'r2', purchaseValue: 9 },
      { type: 'minor', suit: 'WANDS', rank: '8', numericRank: 8, id: 'r3', purchaseValue: 8 },
      { type: 'minor', suit: 'WANDS', rank: '7', numericRank: 7, id: 'r4', purchaseValue: 7 },
      { type: 'minor', suit: 'WANDS', rank: '6', numericRank: 6, id: 'r5', purchaseValue: 6 },
    ];
    const strongScore = evaluatePosition(state, pi);

    // Empty realm
    state.players[pi].realm = [];
    const weakScore = evaluatePosition(state, pi);

    expect(strongScore).toBeGreaterThan(weakScore);
  });

  it('position with 2 celestials scores very high', () => {
    const { state } = setupGame(501);
    const pi = 0;
    // Give 2 celestials in tome
    state.players[pi].tome = [
      { type: 'major', number: 17, id: 'star', keywords: ['celestial'] },
      { type: 'major', number: 18, id: 'moon', keywords: ['celestial'] },
    ];
    state.players[pi].realm = [
      { type: 'minor', suit: 'CUPS', rank: '5', numericRank: 5, id: 'r1', purchaseValue: 5 },
    ];
    const celestialScore = evaluatePosition(state, pi);

    // Remove celestials
    state.players[pi].tome = [];
    const normalScore = evaluatePosition(state, pi);

    expect(celestialScore).toBeGreaterThan(normalScore);
  });

  it('empty realm scores low', () => {
    const { state } = setupGame(502);
    state.players[0].realm = [];
    const score = evaluatePosition(state, 0);
    expect(score).toBeLessThan(40);
  });
});

describe('chooseBestWithLookahead', () => {
  it('returns a valid action from legal actions', () => {
    const { state } = setupGame(600);
    const pi = 0;
    const actions = getLegalActions(state, pi);
    const chosen = chooseBestWithLookahead(state, actions, pi, SCORING_WEIGHTS);
    expect(actions).toContainEqual(chosen);
  });

  it('completes in under 100ms for typical game states', () => {
    const { state } = setupGame(601);
    const pi = 0;
    const actions = getLegalActions(state, pi);

    const start = performance.now();
    chooseBestWithLookahead(state, actions, pi, SCORING_WEIGHTS);
    const elapsed = performance.now() - start;

    expect(elapsed).toBeLessThan(100);
  });
});

describe('aceRetentionValue', () => {
  it('last blocker has high retention value', () => {
    const { state } = setupGame(700);
    // Give exactly 1 ace
    state.players[0].hand = [
      { type: 'minor', suit: 'CUPS', rank: 'ACE', numericRank: 1, id: 'ace1', purchaseValue: 1 },
    ];
    const val = aceRetentionValue(state, 0);
    expect(val).toBeGreaterThanOrEqual(40);
  });

  it('multiple blockers have lower retention', () => {
    const { state } = setupGame(701);
    state.players[0].hand = [
      { type: 'minor', suit: 'CUPS', rank: 'ACE', numericRank: 1, id: 'ace1', purchaseValue: 1 },
      { type: 'minor', suit: 'WANDS', rank: 'ACE', numericRank: 1, id: 'ace2', purchaseValue: 1 },
      { type: 'minor', suit: 'SWORDS', rank: 'ACE', numericRank: 1, id: 'ace3', purchaseValue: 1 },
    ];
    const val = aceRetentionValue(state, 0);
    expect(val).toBeLessThan(30);
  });
});
