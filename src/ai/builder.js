/**
 * BuilderAI: Focuses on building strong poker hands in Realm.
 * Evaluates which hand in current cards would score highest.
 * Buys Tome bonus cards matching suit distribution.
 * Holds aces for defense, uses Kings defensively.
 * Never attacks unless significantly behind.
 */

import { isCelestial } from '../cards.js';
import { RandomAI } from './base.js';
import { chooseActionByScore, BUILDER_WEIGHTS, createLearnableWeights } from './personality.js';
import { checkCelestialThreat, hasBlockingCard } from './awareness.js';
import { estimateCardValue } from './card-value.js';

export class BuilderAI extends RandomAI {
  constructor({ learning = false } = {}) {
    super();
    this.name = 'Builder';

    if (learning) {
      const { weights, learn } = createLearnableWeights(BUILDER_WEIGHTS);
      this._weights = weights;
      this._learn = learn;
    } else {
      this._weights = BUILDER_WEIGHTS;
      this._learn = null;
    }
  }

  chooseAction(state, legalActions, playerIndex) {
    return chooseActionByScore(state, legalActions, playerIndex, this._weights);
  }

  learn(gameResult, myIndex, state) {
    if (this._learn) this._learn(gameResult, myIndex, state);
  }

  chooseDiscard(state, playerIndex, numToDiscard) {
    const hand = state.players[playerIndex].hand;
    const realm = state.players[playerIndex].realm;

    // Score each card by how much it contributes to potential hands
    const scores = hand.map((card, i) => {
      if (card.rank === 'ACE') return { index: i, score: 100 }; // Keep aces
      if (card.type === 'major' && card.keywords?.includes('jester')) return { index: i, score: 100 };
      if (card.rank === 'KING') return { index: i, score: 90 }; // Keep kings

      // Check if card matches realm ranks
      const matchesRealm = realm.some(r => r.type === 'minor' && r.numericRank === card.numericRank);
      if (matchesRealm) return { index: i, score: 80 };

      // Cards that form pairs/triples with other hand cards are valuable
      const handMatches = hand.filter(h =>
        h.type === 'minor' && h.numericRank === card.numericRank && h.id !== card.id
      ).length;
      if (handMatches >= 2) return { index: i, score: 95 }; // Part of a triple
      if (handMatches >= 1) return { index: i, score: 75 }; // Part of a pair

      return { index: i, score: card.numericRank || 0 };
    });

    scores.sort((a, b) => a.score - b.score);
    return scores.slice(0, numToDiscard).map(s => s.index).sort((a, b) => b - a);
  }

  shouldBlockWithAce(state, playerIndex, action) {
    // Block Celestials being played to Tome by threat players
    if (action.type === 'PLAY_MAJOR_TOME' && action.card && isCelestial(action.card)) {
      const threat = checkCelestialThreat(state, playerIndex);
      if (threat.threatening) return true;
    }
    // Only block if attack targets our realm
    if (action.type === 'PLAY_ROYAL' && action.target?.playerIndex === playerIndex) {
      return hasBlockingCard(state, playerIndex);
    }
    return false;
  }

  shouldBlockWithKing(state, playerIndex, attackCard) {
    // Always block if we have a king
    return state.players[playerIndex].hand.some(c => c.type === 'minor' && c.rank === 'KING');
  }

  chooseMajorKeep(majorCards, state) {
    if (!state) return 0;
    // Use config-aware valuation, prefer bonus/tome (builder personality)
    const values = majorCards.map((card, i) => {
      let val = estimateCardValue(state, 0, card, 'keep');
      if (card.category === 'bonus-round' || card.category === 'tome') val *= 1.3;
      return { i, score: val };
    });
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
