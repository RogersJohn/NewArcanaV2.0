/**
 * ScoringAI: Analytical AI that evaluates each legal action
 * using the shared personality scoring system.
 * Most consistent/analytical personality with low noise.
 */

import { isCelestial } from '../cards.js';
import { RandomAI } from './base.js';
import { chooseActionByScore, SCORING_WEIGHTS, createLearnableWeights } from './personality.js';
import { aceBlockValue, checkCelestialThreat } from './awareness.js';
import { estimateCardValue } from './card-value.js';

export class ScoringAI extends RandomAI {
  constructor({ learning = false } = {}) {
    super();
    this.name = 'Scoring';

    if (learning) {
      const { weights, learn } = createLearnableWeights(SCORING_WEIGHTS);
      this._weights = weights;
      this._learn = learn;
    } else {
      this._weights = SCORING_WEIGHTS;
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
      if (card.rank === 'ACE') return { index: i, score: 150 };
      if (card.type === 'major' && card.keywords?.includes('jester')) return { index: i, score: 150 };
      if (card.type === 'major') return { index: i, score: 100 };
      if (card.rank === 'KING') return { index: i, score: 90 };

      // Cards matching realm ranks are valuable
      const matchesRealm = realm.some(r =>
        r.type === 'minor' && r.numericRank === card.numericRank
      );
      if (matchesRealm) return { index: i, score: 80 };

      // Cards that form pairs with other hand cards are valuable
      const handMatches = hand.filter(h =>
        h.type === 'minor' && h.numericRank === card.numericRank && h.id !== card.id
      ).length;
      if (handMatches >= 2) return { index: i, score: 95 }; // Part of a triple
      if (handMatches >= 1) return { index: i, score: 75 }; // Part of a pair

      // Higher purchase value is more useful for buying
      return { index: i, score: (card.numericRank || 0) * 2 };
    });

    scores.sort((a, b) => a.score - b.score); // lowest score = discard first
    return scores.slice(0, numToDiscard).map(s => s.index).sort((a, b) => b - a);
  }

  chooseMajorKeep(majorCards, state) {
    if (!state) return 0;
    const values = majorCards.map((card, i) => ({
      i, score: estimateCardValue(state, 0, card, 'keep'),
    }));
    values.sort((a, b) => b.score - a.score);
    return values[0].i;
  }

  shouldBlockWithAce(state, playerIndex, action) {
    if (action.type === 'PLAY_MAJOR_TOME' && action.card && isCelestial(action.card)) {
      const threat = checkCelestialThreat(state, playerIndex);
      if (threat.threatening) return true;
    }
    const threat = aceBlockValue(state, playerIndex, action);
    return threat >= 30;
  }

  shouldBlockWithKing(state, playerIndex) {
    return state.players[playerIndex].realm.length >= 3;
  }

  chooseDrawSource(state, playerIndex, topDiscardCard) {
    if (!topDiscardCard || topDiscardCard.type !== 'minor') return 'deck';
    const hand = state.players[playerIndex].hand;
    const realm = state.players[playerIndex].realm;
    const matchesHand = hand.some(c => c.type === 'minor' && c.numericRank === topDiscardCard.numericRank);
    const matchesRealm = realm.some(c => c.type === 'minor' && c.numericRank === topDiscardCard.numericRank);
    if (matchesHand || matchesRealm) return 'discard';
    // High-value card for buying
    if (topDiscardCard.purchaseValue >= 5) return 'discard';
    return 'deck';
  }

  chooseMagicianSuit(state, playerIndex) {
    const realm = state.players[playerIndex].realm;
    const counts = {};
    for (const c of realm) {
      if (c.type === 'minor') counts[c.suit] = (counts[c.suit] || 0) + 1;
    }
    // Wilds count for all suits
    const wildCount = realm.filter(c => c.type === 'major').length;
    let best = 'WANDS';
    let bestCount = 0;
    for (const [suit, count] of Object.entries(counts)) {
      const total = count + wildCount;
      if (total > bestCount) { bestCount = total; best = suit; }
    }
    return best;
  }

  chooseTomeDiscard(state, playerIndex) {
    const tome = state.players[playerIndex].tome;
    let worstIdx = 0;
    let worstScore = Infinity;
    for (let i = 0; i < tome.length; i++) {
      const score = estimateCardValue(state, playerIndex, tome[i], 'discard');
      if (score < worstScore) { worstScore = score; worstIdx = i; }
    }
    return worstIdx;
  }
}
