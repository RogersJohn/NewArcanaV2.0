/**
 * ScoringAI: Analytical AI that evaluates each legal action
 * using the shared personality scoring system.
 * Most consistent/analytical personality with low noise.
 */

import { isCelestial } from '../cards.js';
import { RandomAI } from './base.js';
import { chooseActionByScore, SCORING_WEIGHTS } from './personality.js';
import { aceBlockValue, checkCelestialThreat } from './awareness.js';
import { estimateCardValue } from './card-value.js';

export class ScoringAI extends RandomAI {
  constructor() {
    super();
    this.name = 'Scoring';
  }

  chooseAction(state, legalActions, playerIndex) {
    return chooseActionByScore(state, legalActions, playerIndex, SCORING_WEIGHTS);
  }

  chooseDiscard(state, playerIndex, numToDiscard) {
    const hand = state.players[playerIndex].hand;
    const realm = state.players[playerIndex].realm;

    const scores = hand.map((card, i) => {
      if (card.type === 'major' && isCelestial(card)) return { index: i, score: 200 };
      if (card.rank === 'ACE') return { index: i, score: 150 };
      if (card.type === 'major') return { index: i, score: 100 };
      if (card.rank === 'KING') return { index: i, score: 90 };

      // Cards matching realm ranks are valuable
      const matchesRealm = realm.some(r =>
        r.type === 'minor' && r.numericRank === card.numericRank
      );
      if (matchesRealm) return { index: i, score: 80 };

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
