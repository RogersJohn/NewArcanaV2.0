/**
 * AggressorAI: Targets players with the most VP or strongest Realm.
 * Uses Royals aggressively, buys attack cards (Tower, Hanged Man).
 * Plays Plague into opponents' Tomes.
 * Builds realm as secondary priority.
 */

import { isCelestial } from '../cards.js';
import { RandomAI } from './base.js';
import { chooseActionByScore, AGGRESSOR_WEIGHTS } from './personality.js';
import { aceBlockValue, checkCelestialThreat } from './awareness.js';
import { estimateCardValue } from './card-value.js';

export class AggressorAI extends RandomAI {
  constructor() {
    super();
    this.name = 'Aggressor';
  }

  chooseAction(state, legalActions, playerIndex) {
    return chooseActionByScore(state, legalActions, playerIndex, AGGRESSOR_WEIGHTS);
  }

  chooseDiscard(state, playerIndex, numToDiscard) {
    const hand = state.players[playerIndex].hand;
    const scores = hand.map((card, i) => {
      // Keep attack cards (Royals)
      if (card.isRoyal) return { index: i, score: 100 };
      if (card.rank === 'ACE') return { index: i, score: 95 };
      if (card.type === 'major') return { index: i, score: 90 };
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
