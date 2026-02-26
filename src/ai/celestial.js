/**
 * CelestialAI: Pursues the 3-Celestial win condition.
 * Buys any available Celestial aggressively.
 * Uses Chariot to steal Celestials.
 * Very protective of Tome.
 */

import { isCelestial } from '../cards.js';
import { RandomAI } from './base.js';

export class CelestialAI extends RandomAI {
  constructor() {
    super();
    this.name = 'Celestial';
  }

  chooseAction(state, legalActions, playerIndex) {
    const player = state.players[playerIndex];

    // Priority 1: Play Celestials to Tome
    const celestialTome = legalActions.filter(a =>
      a.type === 'PLAY_MAJOR_TOME' && a.card && isCelestial(a.card)
    );
    if (celestialTome.length > 0) return celestialTome[0];

    // Priority 2: Chariot to steal Celestials
    const chariotActions = legalActions.filter(a =>
      a.type === 'PLAY_MAJOR_ACTION' && a.card?.number === 7
    );
    if (chariotActions.length > 0) return chariotActions[0];

    // Priority 3: Buy Celestials from display
    const buyActions = legalActions.filter(a => a.type === 'BUY');
    const celestialBuys = buyActions.filter(a => {
      if (a.source.startsWith('display')) {
        const slot = parseInt(a.source.slice(-1));
        return state.display[slot] && isCelestial(state.display[slot]);
      }
      return false;
    });
    if (celestialBuys.length > 0) {
      // Pick cheapest payment
      celestialBuys.sort((a, b) =>
        a.payment.reduce((s, c) => s + c.purchaseValue, 0) -
        b.payment.reduce((s, c) => s + c.purchaseValue, 0)
      );
      return celestialBuys[0];
    }

    // Priority 4: Play other Tome cards
    const otherTome = legalActions.filter(a => a.type === 'PLAY_MAJOR_TOME');
    if (otherTome.length > 0) return otherTome[0];

    // Priority 5: Build realm as backup
    const setActions = legalActions.filter(a => a.type === 'PLAY_SET' && a.cards.length >= 2);
    if (setActions.length > 0) return setActions[setActions.length - 1];

    // Priority 6: Any buy (might reveal celestials)
    if (buyActions.length > 0) {
      return buyActions[Math.floor(Math.random() * buyActions.length)];
    }

    // Priority 7: Play singles
    const singles = legalActions.filter(a => a.type === 'PLAY_SET' && a.cards.length === 1);
    if (singles.length > 0 && player.realm.length < 5) {
      return singles[Math.floor(Math.random() * singles.length)];
    }

    return legalActions.find(a => a.type === 'PASS') || legalActions[0];
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
      return Math.random() < 0.7;
    }
    return false;
  }

  shouldBlockWithKing(state, playerIndex) {
    return state.players[playerIndex].hand.some(c => c.type === 'minor' && c.rank === 'KING');
  }

  chooseMajorKeep(majorCards) {
    // Always keep Celestials
    for (let i = 0; i < majorCards.length; i++) {
      if (isCelestial(majorCards[i])) return i;
    }
    // Prefer Chariot (7)
    for (let i = 0; i < majorCards.length; i++) {
      if (majorCards[i].number === 7) return i;
    }
    return 0;
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
