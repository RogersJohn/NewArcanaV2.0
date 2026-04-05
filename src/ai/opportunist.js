/**
 * OpportunistAI: Evaluates expected value of every legal action.
 * Uses heuristic scoring for realm strength, VP potential, disruption, card advantage.
 * Adapts strategy based on game state.
 */

import { isCelestial } from '../cards.js';
import { RandomAI } from './base.js';
import { chooseActionByScore, OPPORTUNIST_WEIGHTS, createLearnableWeights } from './personality.js';
import { aceBlockValue, checkCelestialThreat } from './awareness.js';
import { estimateCardValue } from './card-value.js';

export class OpportunistAI extends RandomAI {
  constructor({ learning = false } = {}) {
    super();
    this.name = 'Opportunist';

    if (learning) {
      const { weights, learn } = createLearnableWeights(OPPORTUNIST_WEIGHTS);
      this._weights = weights;
      this._learn = learn;
    } else {
      this._weights = OPPORTUNIST_WEIGHTS;
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

    const scores = hand.map((card, i) => {
      if (card.type === 'major' && isCelestial(card)) return { index: i, score: 200 };
      if (card.type === 'major' && card.keywords?.includes('jester')) return { index: i, score: 150 };
      if (card.type === 'major') return { index: i, score: 100 };
      if (card.rank === 'ACE') return { index: i, score: 150 };
      if (card.rank === 'KING') return { index: i, score: 90 };

      // Cards matching realm are valuable
      const matchRealm = realm.some(r => r.type === 'minor' && r.numericRank === card.numericRank);
      if (matchRealm) return { index: i, score: 80 };

      // Cards that form pairs/triples with other hand cards are valuable
      const handMatches = hand.filter(h =>
        h.type === 'minor' && h.numericRank === card.numericRank && h.id !== card.id
      ).length;
      if (handMatches >= 2) return { index: i, score: 95 }; // Part of a triple
      if (handMatches >= 1) return { index: i, score: 75 }; // Part of a pair

      // High value cards are worth more for buying
      return { index: i, score: card.numericRank * 2 || 0 };
    });

    scores.sort((a, b) => a.score - b.score);
    return scores.slice(0, numToDiscard).map(s => s.index).sort((a, b) => b - a);
  }

  shouldBlockWithAce(state, playerIndex, action) {
    if (action.type === 'PLAY_MAJOR_TOME' && action.card && isCelestial(action.card)) {
      const threat = checkCelestialThreat(state, playerIndex);
      if (threat.threatening) return true;
    }
    const threat = aceBlockValue(state, playerIndex, action);
    return threat >= 35;
  }

  shouldBlockWithKing(state, playerIndex) {
    const realmSize = state.players[playerIndex].realm.length;
    return realmSize >= 3 && state.players[playerIndex].hand.some(c => c.type === 'minor' && c.rank === 'KING');
  }

  chooseMajorKeep(majorCards, state) {
    if (!state) return 0;
    const values = majorCards.map((card, i) => ({
      i, score: estimateCardValue(state, 0, card, 'keep'),
    }));
    values.sort((a, b) => b.score - a.score);
    return values[0].i;
  }

  chooseDrawSource(state, playerIndex, topDiscardCard) {
    if (!topDiscardCard || topDiscardCard.type !== 'minor') return 'deck';
    const hand = state.players[playerIndex].hand;
    const realm = state.players[playerIndex].realm;
    // Take from discard if it matches a rank in hand (pair) or fills a suit gap in realm
    const matchesHand = hand.some(c => c.type === 'minor' && c.numericRank === topDiscardCard.numericRank);
    const matchesRealm = realm.some(c => c.type === 'minor' && c.numericRank === topDiscardCard.numericRank);
    if (matchesHand || matchesRealm) return 'discard';
    return 'deck';
  }

  chooseMagicianSuit(state, playerIndex) {
    const realm = state.players[playerIndex].realm;
    const counts = {};
    for (const c of realm) {
      if (c.type === 'minor') counts[c.suit] = (counts[c.suit] || 0) + 1;
    }
    let best = 'WANDS';
    let bestCount = 0;
    for (const [suit, count] of Object.entries(counts)) {
      if (count > bestCount) { bestCount = count; best = suit; }
    }
    return best;
  }
}
