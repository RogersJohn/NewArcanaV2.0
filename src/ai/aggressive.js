/**
 * AggressorAI: Targets players with the most VP or strongest Realm.
 * Uses Royals aggressively, buys attack cards (Tower, Hanged Man).
 * Plays Plague into opponents' Tomes.
 * Builds realm as secondary priority.
 */

import { evaluateHand } from '../poker.js';
import { isCelestial } from '../cards.js';
import { RandomAI } from './base.js';
import { checkCelestialThreat, findCelestialDisruption } from './awareness.js';

export class AggressorAI extends RandomAI {
  constructor() {
    super();
    this.name = 'Aggressor';
  }

  chooseAction(state, legalActions, playerIndex) {
    const player = state.players[playerIndex];

    // Priority 0: Celestial threat disruption (aggressor should be most reactive)
    const threat = checkCelestialThreat(state, playerIndex);
    if (threat.threatening) {
      const disruption = findCelestialDisruption(state, playerIndex, legalActions, threat.threatPlayer);
      if (disruption) return disruption;
    }

    // Priority 1: Attack! Royal attacks on the leader
    const royalActions = legalActions.filter(a => a.type === 'PLAY_ROYAL');
    if (royalActions.length > 0) {
      const target = this.pickBestTarget(royalActions, state, playerIndex);
      if (target) return target;
    }

    // Priority 2: Major Arcana attack actions
    const majorActions = legalActions.filter(a =>
      a.type === 'PLAY_MAJOR_ACTION' && a.card &&
      [7, 8, 12, 16, 26].includes(a.card.number)
    );
    if (majorActions.length > 0) {
      return majorActions[0];
    }

    // Priority 3: Play sets to realm
    const setActions = legalActions.filter(a => a.type === 'PLAY_SET' && a.cards.length >= 2);
    if (setActions.length > 0) {
      return setActions[setActions.length - 1]; // Largest set
    }

    // Priority 4: Buy attack cards
    const buyActions = legalActions.filter(a => a.type === 'BUY');
    if (buyActions.length > 0) {
      return buyActions[state.rng.nextInt(buyActions.length)];
    }

    // Priority 5: Play singles
    const singles = legalActions.filter(a => a.type === 'PLAY_SET' && a.cards.length === 1);
    if (singles.length > 0 && player.realm.length < 5) {
      return singles[state.rng.nextInt(singles.length)];
    }

    // Priority 6: Play tome cards
    const tomeActions = legalActions.filter(a => a.type === 'PLAY_MAJOR_TOME');
    if (tomeActions.length > 0) return tomeActions[0];

    return legalActions.find(a => a.type === 'PASS') || legalActions[0];
  }

  pickBestTarget(royalActions, state, playerIndex) {
    // Target the player with most VP
    let bestPi = -1;
    let bestVp = -1;
    for (let pi = 0; pi < state.players.length; pi++) {
      if (pi === playerIndex) continue;
      if (state.players[pi].vp > bestVp && state.players[pi].realm.length > 0) {
        bestVp = state.players[pi].vp;
        bestPi = pi;
      }
    }

    if (bestPi === -1) {
      // Target anyone with cards
      for (let pi = 0; pi < state.players.length; pi++) {
        if (pi === playerIndex && state.players[pi].realm.length > 0) {
          bestPi = pi;
          break;
        }
      }
    }

    // Find attacks targeting the leader
    const targetAttacks = royalActions.filter(a =>
      a.target && a.target.playerIndex === bestPi
    );
    if (targetAttacks.length > 0) return targetAttacks[0];

    // Any attack will do
    return royalActions[0];
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
    // Block opponent plays that improve their position
    if (action.type === 'PLAY_WILD') return true;
    if (action.type === 'PLAY_MAJOR_TOME') return state.rng.next() < 0.5;
    if (action.type === 'PLAY_MAJOR_ACTION') return state.rng.next() < 0.4;
    return false;
  }

  shouldBlockWithKing(state, playerIndex, attackCard) {
    // Always defend our realm
    return state.players[playerIndex].hand.some(c => c.type === 'minor' && c.rank === 'KING');
  }

  chooseMajorKeep(majorCards) {
    // Prefer action cards
    for (let i = 0; i < majorCards.length; i++) {
      if (majorCards[i].category === 'action') return i;
    }
    return 0;
  }

  chooseMagicianSuit(state, playerIndex) {
    return 'SWORDS'; // Aggressive = swords
  }
}
