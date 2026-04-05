/**
 * CelestialAI: Pursues the 3-Celestial win condition.
 * Buys any available Celestial aggressively.
 * Uses Chariot to steal Celestials.
 * Very protective of Tome.
 */

import { isCelestial } from '../cards.js';
import { RandomAI } from './base.js';
import { chooseActionByScore, CELESTIAL_WEIGHTS, createLearnableWeights } from './personality.js';
import { estimateCardValue } from './card-value.js';

export class CelestialAI extends RandomAI {
  constructor({ learning = false } = {}) {
    super();
    this.name = 'Celestial';

    if (learning) {
      const { weights, learn } = createLearnableWeights(CELESTIAL_WEIGHTS);
      this._weights = weights;
      this._learn = learn;
    } else {
      this._weights = CELESTIAL_WEIGHTS;
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
      if (card.type === 'major' && isCelestial(card)) return { index: i, score: 200 };
      if (card.type === 'major') return { index: i, score: 150 };
      if (card.rank === 'ACE') return { index: i, score: 100 };
      if (card.type === 'major' && card.keywords?.includes('jester')) return { index: i, score: 100 };
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
      for (let pi = 0; pi < state.players.length; pi++) {
        if (pi === playerIndex) continue;
        const cc = [...state.players[pi].tome, ...state.players[pi].realm].filter(c => isCelestial(c)).length;
        if (cc >= 2) return true;
      }
    }
    // Very protective - block any action targeting our tome
    if (action.type === 'PLAY_MAJOR_ACTION') {
      const targets = action.targets;
      if (targets && targets.playerIndex === playerIndex) return true;
      if (targets && targets.source === 'tome' && targets.playerIndex === playerIndex) return true;
    }
    // Block attacks on our realm
    if (action.type === 'PLAY_ROYAL' && action.target?.playerIndex === playerIndex) {
      return state.rng.next() < 0.7;
    }
    return false;
  }

  shouldBlockWithKing(state, playerIndex) {
    return state.players[playerIndex].hand.some(c => c.type === 'minor' && c.rank === 'KING');
  }

  chooseMajorKeep(majorCards, state) {
    if (!state) return 0;
    const values = majorCards.map((card, i) => {
      let val = estimateCardValue(state, 0, card, 'keep');
      if (isCelestial(card)) val *= 3; // Celestial personality: massive celestial preference
      return { i, score: val };
    });
    values.sort((a, b) => b.score - a.score);
    return values[0].i;
  }

  chooseTomeDiscard(state, playerIndex) {
    const tome = state.players[playerIndex].tome;
    // Never discard Celestials
    for (let i = 0; i < tome.length; i++) {
      if (!isCelestial(tome[i])) return i;
    }
    return tome.length - 1;
  }

  chooseMagicianSuit(state, playerIndex) {
    return 'CUPS';
  }
}
