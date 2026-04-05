/**
 * PassiveAI: Never attacks, focuses purely on realm building and tome collection.
 * Used for isolating card power without combat interference.
 */

import { isCelestial } from '../cards.js';
import { RandomAI } from './base.js';
import { chooseActionByScore, PASSIVE_WEIGHTS, createLearnableWeights } from './personality.js';
import { aceBlockValue } from './awareness.js';
import { estimateCardValue } from './card-value.js';

export class PassiveAI extends RandomAI {
  constructor({ learning = false } = {}) {
    super();
    this.name = 'Passive';

    if (learning) {
      const { weights, learn } = createLearnableWeights(PASSIVE_WEIGHTS);
      this._weights = weights;
      this._learn = learn;
    } else {
      this._weights = PASSIVE_WEIGHTS;
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
      if (card.type === 'major' && card.keywords?.includes('jester')) return { index: i, score: 120 };
      if (card.type === 'major') return { index: i, score: 120 };
      if (card.rank === 'ACE') return { index: i, score: 50 }; // Less value on aces (no attacks to block)
      if (card.rank === 'KING') return { index: i, score: 40 };

      // Value cards matching realm ranks
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
    // Even passive players must respond to celestial threats
    if (action.type === 'PLAY_MAJOR_TOME' && action.card && isCelestial(action.card)) {
      const actorPi = action.playerIndex ?? state.currentPlayerIndex;
      if (actorPi !== undefined && actorPi !== playerIndex && state.players[actorPi]) {
        const actorCelestials = [...state.players[actorPi].tome, ...state.players[actorPi].realm]
          .filter(c => isCelestial(c)).length;
        if (actorCelestials >= 1) return true;
      }
      for (let pi = 0; pi < state.players.length; pi++) {
        if (pi === playerIndex) continue;
        const cc = [...state.players[pi].tome, ...state.players[pi].realm].filter(c => isCelestial(c)).length;
        if (cc >= 2) return true;
      }
    }

    // Otherwise, passive only blocks serious direct threats
    const threat = aceBlockValue(state, playerIndex, action);
    return threat >= 55;
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
