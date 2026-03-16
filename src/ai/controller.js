/**
 * ControllerAI: Defensive and methodical.
 * Buys protection cards (Temperance family).
 * Always holds at least one Ace.
 * Builds consistent hands (pairs -> three-of-a-kind).
 * Avoids wild cards (too vulnerable).
 * Buys Devil for hand size advantage.
 */

import { isCelestial } from '../cards.js';
import { RandomAI } from './base.js';
import { chooseActionByScore, CONTROLLER_WEIGHTS, createLearnableWeights } from './personality.js';
import { aceBlockValue, checkCelestialThreat, countBlockingCards } from './awareness.js';
import { estimateCardValue } from './card-value.js';
import { getMajorDef } from '../effect-resolver.js';

export class ControllerAI extends RandomAI {
  constructor({ learning = false } = {}) {
    super();
    this.name = 'Controller';

    if (learning) {
      const { weights, learn } = createLearnableWeights(CONTROLLER_WEIGHTS);
      this._weights = weights;
      this._learn = learn;
    } else {
      this._weights = CONTROLLER_WEIGHTS;
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
      if (card.rank === 'ACE') return { index: i, score: 200 }; // Never discard aces
      if (card.type === 'major' && card.keywords?.includes('jester')) return { index: i, score: 200 };
      if (card.rank === 'KING') return { index: i, score: 150 };
      if (card.type === 'major') return { index: i, score: 120 };

      // Value cards matching realm
      const matchRealm = realm.some(r => r.type === 'minor' && r.numericRank === card.numericRank);
      if (matchRealm) return { index: i, score: 100 };

      // Value pairs in hand
      const pairInHand = hand.filter(c => c.type === 'minor' && c.numericRank === card.numericRank).length;
      if (pairInHand >= 2) return { index: i, score: 80 };

      return { index: i, score: card.numericRank || 0 };
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
    // Count all blocking cards (Aces + Jesters)
    const blockerCount = countBlockingCards(state, playerIndex);
    // Controller is conservative: only block high threats, keep reserve
    if (blockerCount >= 2) return threat >= 30;
    return threat >= 60; // With 1 blocker, only block critical threats
  }

  shouldBlockWithKing(state, playerIndex) {
    return state.players[playerIndex].hand.some(c => c.type === 'minor' && c.rank === 'KING');
  }

  chooseMajorKeep(majorCards, state) {
    if (!state) return 0;
    const values = majorCards.map((card, i) => {
      let val = estimateCardValue(state, 0, card, 'keep');
      // Controller personality: boost protection/Devil
      const eff = getMajorDef(state, card.number);
      if (eff?.effect?.onPlay?.action === 'PROTECT_SUIT') val *= 2;
      if (eff?.effect?.onPlay?.action === 'DRAW_TO_LIMIT') val *= 1.5;
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
    let best = 'COINS';
    let bestCount = 0;
    for (const [suit, count] of Object.entries(counts)) {
      if (count > bestCount) { bestCount = count; best = suit; }
    }
    return best;
  }
}
