/**
 * PassiveAI: Never attacks, focuses purely on realm building and tome collection.
 * Used for isolating card power without combat interference.
 */

import { RandomAI } from './base.js';
import { chooseActionByScore, PASSIVE_WEIGHTS } from './personality.js';
import { aceBlockValue } from './awareness.js';
import { estimateCardValue } from './card-value.js';

export class PassiveAI extends RandomAI {
  constructor() {
    super();
    this.name = 'Passive';
  }

  chooseAction(state, legalActions, playerIndex) {
    return chooseActionByScore(state, legalActions, playerIndex, PASSIVE_WEIGHTS);
  }

  chooseDiscard(state, playerIndex, numToDiscard) {
    const hand = state.players[playerIndex].hand;
    const realm = state.players[playerIndex].realm;

    const scores = hand.map((card, i) => {
      if (card.type === 'major') return { index: i, score: 120 };
      if (card.rank === 'ACE') return { index: i, score: 50 }; // Less value on aces (no attacks to block)
      if (card.rank === 'KING') return { index: i, score: 40 };

      // Value cards matching realm ranks
      const matchesRealm = realm.some(r => r.type === 'minor' && r.numericRank === card.numericRank);
      if (matchesRealm) return { index: i, score: 80 };

      // Value pairs in hand
      const pairCount = hand.filter(c => c.type === 'minor' && c.numericRank === card.numericRank).length;
      if (pairCount >= 2) return { index: i, score: 60 };

      return { index: i, score: card.numericRank || 0 };
    });

    scores.sort((a, b) => a.score - b.score);
    return scores.slice(0, numToDiscard).map(s => s.index).sort((a, b) => b - a);
  }

  shouldBlockWithAce(state, playerIndex, action) {
    // Only block actions directly targeting our realm or tome
    const threat = aceBlockValue(state, playerIndex, action);
    return threat >= 55; // High threshold — only block serious direct threats
  }

  shouldBlockWithKing(state, playerIndex) {
    // Block if we have significant realm
    return state.players[playerIndex].realm.length >= 4 &&
      state.players[playerIndex].hand.some(c => c.type === 'minor' && c.rank === 'KING');
  }

  chooseMajorKeep(majorCards, state) {
    if (!state) return 0;
    const values = majorCards.map((card, i) => ({
      i, score: estimateCardValue(state, 0, card, 'keep'),
    }));
    values.sort((a, b) => b.score - a.score);
    return values[0].i;
  }

  chooseMagicianSuit(state, playerIndex) {
    const realm = state.players[playerIndex].realm;
    const counts = {};
    for (const c of realm) {
      if (c.type === 'minor') counts[c.suit] = (counts[c.suit] || 0) + 1;
    }
    let bestSuit = 'WANDS';
    let bestCount = 0;
    for (const [suit, count] of Object.entries(counts)) {
      if (count > bestCount) { bestCount = count; bestSuit = suit; }
    }
    return bestSuit;
  }
}
