/**
 * AggressorAI: Targets players with the most VP or strongest Realm.
 * Uses Royals aggressively, buys attack cards (Tower, Hanged Man).
 * Plays Plague into opponents' Tomes.
 * Builds realm as secondary priority.
 */

import { isCelestial } from '../cards.js';
import { RandomAI } from './base.js';
import { chooseActionByScore, AGGRESSOR_WEIGHTS, createLearnableWeights } from './personality.js';
import { aceBlockValue, checkCelestialThreat, hasBlockingCard } from './awareness.js';
import { estimateCardValue } from './card-value.js';

export class AggressorAI extends RandomAI {
  constructor({ learning = false } = {}) {
    super();
    this.name = 'Aggressor';

    if (learning) {
      const { weights, learn } = createLearnableWeights(AGGRESSOR_WEIGHTS);
      this._weights = weights;
      this._learn = learn;
    } else {
      this._weights = AGGRESSOR_WEIGHTS;
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
    const scores = hand.map((card, i) => {
      // Keep attack cards (Royals)
      if (card.isRoyal) return { index: i, score: 100 };
      if (card.rank === 'ACE') return { index: i, score: 95 };
      if (card.type === 'major' && card.keywords?.includes('jester')) return { index: i, score: 95 };
      if (card.type === 'major') return { index: i, score: 90 };

      // Cards that form pairs/triples with other hand cards are valuable
      const handMatches = hand.filter(h =>
        h.type === 'minor' && h.numericRank === card.numericRank && h.id !== card.id
      ).length;
      if (handMatches >= 2) return { index: i, score: 85 }; // Part of a triple
      if (handMatches >= 1) return { index: i, score: 70 }; // Part of a pair

      return { index: i, score: card.numericRank || 0 };
    });

    scores.sort((a, b) => a.score - b.score);
    return scores.slice(0, numToDiscard).map(s => s.index).sort((a, b) => b - a);
  }

  shouldBlockWithAce(state, playerIndex, action) {
    // Block celestial plays when actor already has 1+ celestials (would give them 2+)
    if (action.type === 'PLAY_MAJOR_TOME' && action.card && isCelestial(action.card)) {
      const actorPi = action.playerIndex ?? state.currentPlayerIndex;
      if (actorPi !== undefined && actorPi !== playerIndex && state.players[actorPi]) {
        const actorCelestials = [...state.players[actorPi].tome, ...state.players[actorPi].realm]
          .filter(c => isCelestial(c)).length;
        if (actorCelestials >= 1) return true;
      }
      // Fallback: block if any opponent has 2+ celestials (critical threat)
      for (let pi = 0; pi < state.players.length; pi++) {
        if (pi === playerIndex) continue;
        const cc = [...state.players[pi].tome, ...state.players[pi].realm].filter(c => isCelestial(c)).length;
        if (cc >= 2) return true;
      }
    }
    const threat = aceBlockValue(state, playerIndex, action);
    // Aggressor blocks at moderate threshold — save Aces for defense, not random blocking
    return threat >= 40;
  }

  shouldBlockWithKing(state, playerIndex, attackCard) {
    // Always defend our realm
    return state.players[playerIndex].hand.some(c => c.type === 'minor' && c.rank === 'KING');
  }

  chooseMajorKeep(majorCards, state) {
    if (!state) return 0;
    const values = majorCards.map((card, i) => {
      let val = estimateCardValue(state, 0, card, 'keep');
      if (card.category === 'action') val *= 1.5; // Aggressor personality
      return { i, score: val };
    });
    values.sort((a, b) => b.score - a.score);
    return values[0].i;
  }

  chooseMagicianSuit(state, playerIndex) {
    return 'SWORDS'; // Aggressive = swords
  }
}
