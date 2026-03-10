/**
 * CelestialAI: Pursues the 3-Celestial win condition.
 * Buys any available Celestial aggressively.
 * Uses Chariot to steal Celestials.
 * Very protective of Tome.
 */

import { isCelestial } from '../cards.js';
import { RandomAI } from './base.js';
import { chooseActionByScore, CELESTIAL_WEIGHTS } from './personality.js';
import { estimateCardValue } from './card-value.js';

export class CelestialAI extends RandomAI {
  constructor() {
    super();
    this.name = 'Celestial';
  }

  chooseAction(state, legalActions, playerIndex) {
    return chooseActionByScore(state, legalActions, playerIndex, CELESTIAL_WEIGHTS);
  }

  chooseDiscard(state, playerIndex, numToDiscard) {
    const hand = state.players[playerIndex].hand;
    const scores = hand.map((card, i) => {
      if (card.type === 'major' && isCelestial(card)) return { index: i, score: 200 };
      if (card.type === 'major') return { index: i, score: 150 };
      if (card.rank === 'ACE') return { index: i, score: 100 };
      return { index: i, score: card.numericRank || 0 };
    });

    scores.sort((a, b) => a.score - b.score);
    return scores.slice(0, numToDiscard).map(s => s.index).sort((a, b) => b - a);
  }

  shouldBlockWithAce(state, playerIndex, action) {
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
