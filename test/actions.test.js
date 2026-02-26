import { describe, it, expect } from 'vitest';
import { createMinorCard, createMajorCard, MAJOR_ARCANA_DEFS } from '../src/cards.js';
import { createInitialState } from '../src/state.js';
import { getLegalActions } from '../src/actions.js';

function mc(suit, rank) { return createMinorCard(suit, rank); }
function major(number) {
  const def = MAJOR_ARCANA_DEFS.find(d => d.number === number);
  return createMajorCard(number, def.name, def.category, def.keywords);
}

function makeTestState(numPlayers = 2) {
  const state = createInitialState(numPlayers);
  state.minorDeck = [];
  state.majorDeck = [];
  state.minorDiscard = [];
  state.display = [null, null, null];
  state.pot = 0;
  for (const p of state.players) {
    p.hand = [];
    p.realm = [];
    p.tome = [];
  }
  return state;
}

describe('Flush Actions', () => {
  it('Flush is a legal action when player has 5 cards of same suit', () => {
    const state = makeTestState();
    // 5 CUPS of non-consecutive ranks
    state.players[0].hand = [
      mc('CUPS', 2), mc('CUPS', 5), mc('CUPS', 7), mc('CUPS', 9), mc('CUPS', 'KING'),
    ];

    const actions = getLegalActions(state, 0);
    const flushActions = actions.filter(a =>
      a.type === 'PLAY_SET' && a.cards.length === 5 && a.description.toLowerCase().includes('flush')
    );
    expect(flushActions.length).toBeGreaterThanOrEqual(1);
    // Verify all cards are CUPS
    for (const action of flushActions) {
      expect(action.cards.every(c => c.suit === 'CUPS')).toBe(true);
    }
  });

  it('Straight flush is not duplicated as flush', () => {
    const state = makeTestState();
    // 5 consecutive WANDS = straight flush, should NOT also appear as flush
    state.players[0].hand = [
      mc('WANDS', 3), mc('WANDS', 4), mc('WANDS', 5), mc('WANDS', 6), mc('WANDS', 7),
    ];

    const actions = getLegalActions(state, 0);
    const straightFlush = actions.filter(a =>
      a.type === 'PLAY_SET' && a.description.toLowerCase().includes('straight flush')
    );
    const plainFlush = actions.filter(a =>
      a.type === 'PLAY_SET' && a.cards.length === 5 &&
      a.description.toLowerCase().includes('flush') &&
      !a.description.toLowerCase().includes('straight')
    );
    expect(straightFlush.length).toBeGreaterThanOrEqual(1);
    expect(plainFlush.length).toBe(0);
  });
});

describe('Set Completion Actions', () => {
  it('Player can add a matching card to extend a pair in Realm to three-of-a-kind', () => {
    const state = makeTestState();
    state.players[0].realm = [mc('WANDS', 7), mc('CUPS', 7)];
    state.players[0].hand = [mc('SWORDS', 7), mc('COINS', 3)];

    const actions = getLegalActions(state, 0);
    const completions = actions.filter(a =>
      a.type === 'PLAY_SET' && a.isCompletion &&
      a.cards.some(c => c.numericRank === 7)
    );
    expect(completions.length).toBeGreaterThanOrEqual(1);
  });

  it('Player can complete a straight by adding missing cards from hand', () => {
    const state = makeTestState();
    // Realm has 3,4,5
    state.players[0].realm = [mc('WANDS', 3), mc('CUPS', 4), mc('SWORDS', 5)];
    // Hand has 2 and 6 (completing straight 2-6) plus a filler
    state.players[0].hand = [mc('COINS', 2), mc('WANDS', 6), mc('CUPS', 'KING')];

    const actions = getLegalActions(state, 0);
    const straightCompletions = actions.filter(a =>
      a.type === 'PLAY_SET' && a.isCompletion &&
      a.description.toLowerCase().includes('straight')
    );
    expect(straightCompletions.length).toBeGreaterThanOrEqual(1);
    // The completion should contain the 2 and the 6
    const completion = straightCompletions[0];
    const ranks = completion.cards.map(c => c.numericRank).sort((a, b) => a - b);
    expect(ranks).toContain(2);
    expect(ranks).toContain(6);
  });
});
