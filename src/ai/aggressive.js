/**
 * AggressorAI: Targets players with the most VP or strongest Realm.
 * Uses Royals aggressively, buys attack cards (Tower, Hanged Man).
 * Plays Plague into opponents' Tomes.
 * Builds realm as secondary priority.
 */

import { evaluateHand } from '../poker.js';
import { isCelestial } from '../cards.js';
import { RandomAI } from './base.js';
import { potUrgency, getHandRanking, aceBlockValue, checkCelestialThreat, findCelestialDisruption, analyzeHandPotential } from './awareness.js';
import { estimateCardValue } from './card-value.js';

export class AggressorAI extends RandomAI {
  constructor() {
    super();
    this.name = 'Aggressor';
  }

  chooseAction(state, legalActions, playerIndex) {
    const player = state.players[playerIndex];
    const urgency = potUrgency(state);
    const ranking = getHandRanking(state, playerIndex);

    // Priority 0: Celestial threat disruption
    const threat = checkCelestialThreat(state, playerIndex);
    if (threat.threatening) {
      const disruption = findCelestialDisruption(state, playerIndex, legalActions, threat.threatPlayer);
      if (disruption) return disruption;
    }

    // Priority 1: Build realm first (need cards to win pots)
    const setActions = legalActions.filter(a => a.type === 'PLAY_SET');
    if (player.realm.length < 3) {
      // Must build realm before attacking
      const multiSets = setActions.filter(a => a.cards.length >= 2);
      if (multiSets.length > 0) {
        multiSets.sort((a, b) => b.cards.length - a.cards.length);
        return multiSets[0];
      }
      // Singles only if realm empty and no pairs in hand
      if (setActions.length > 0 && player.realm.length === 0) {
        const potential = analyzeHandPotential(player.hand, player.realm);
        if (!potential.hasPairForming) return setActions[0];
      }
    }

    // Priority 2: Attack players who are beating us or close to triggering round-end
    const royalActions = legalActions.filter(a => a.type === 'PLAY_ROYAL');
    if (royalActions.length > 0 && !ranking.winning) {
      const target = this.pickSmartTarget(royalActions, state, playerIndex, ranking);
      if (target) return target;
    }

    // Priority 3: Continue building realm when we have good sets
    if (setActions.length > 0) {
      const multiSets = setActions.filter(a => a.cards.length >= 2);
      if (multiSets.length > 0) {
        multiSets.sort((a, b) => b.cards.length - a.cards.length);
        return multiSets[0];
      }
      // Completions are OK, but random singles only if realm needs 1 more
      const completions = setActions.filter(a => a.isCompletion);
      if (completions.length > 0) return completions[0];
      if (player.realm.length === 4) return setActions[0];
    }

    // Priority 4: Attack even when winning (if opponent has large realm)
    if (royalActions.length > 0) {
      const target = this.pickSmartTarget(royalActions, state, playerIndex, ranking);
      if (target) return target;
    }

    // Priority 5: Major Arcana attack actions
    const majorActions = legalActions.filter(a => a.type === 'PLAY_MAJOR_ACTION' && a.card);
    if (majorActions.length > 0) {
      const scored = majorActions.map(a => ({
        action: a,
        score: estimateCardValue(state, playerIndex, a.card, 'tome'),
      }));
      scored.sort((a, b) => b.score - a.score);
      if (scored[0].score > 8) return scored[0].action;
    }

    // Priority 6: Play tome cards
    const tomeActions = legalActions.filter(a => a.type === 'PLAY_MAJOR_TOME');
    if (tomeActions.length > 0) return tomeActions[0];

    // Priority 7: Buy attack cards (only if realm is reasonable)
    if (player.realm.length >= 2) {
      const buyActions = legalActions.filter(a => a.type === 'BUY');
      if (buyActions.length > 0) {
        // Prefer action cards
        for (const action of buyActions) {
          if (action.source.startsWith('display')) {
            const slot = parseInt(action.source.slice(-1));
            const card = state.display[slot];
            if (card && card.category === 'action') return action;
          }
        }
      }
    }

    return legalActions.find(a => a.type === 'PASS') || legalActions[0];
  }

  pickSmartTarget(royalActions, state, playerIndex, ranking) {
    // Score each attack by strategic value
    let bestAction = null;
    let bestScore = -Infinity;

    for (const action of royalActions) {
      if (action.target.playerIndex === playerIndex) continue; // Don't attack self
      const targetPi = action.target.playerIndex;
      const targetPlayer = state.players[targetPi];
      if (targetPlayer.realm.length === 0) continue;

      let score = 0;

      // Target players beating us
      if (ranking.beatenBy.includes(targetPi)) score += 30;

      // Target players close to round-end trigger (4+ realm cards)
      if (targetPlayer.realm.length >= 4) score += 25;

      // Target the pot leader
      const maxVp = Math.max(...state.players.map(p => p.vp));
      if (targetPlayer.vp >= maxVp && maxVp > 0) score += 15;

      // Queen is best (we GET the card), Knight second (to our hand), Page worst
      if (action.card.rank === 'QUEEN') score += 20;
      else if (action.card.rank === 'KNIGHT') {
        // Knight is better if the stolen card matches our realm
        const targetCard = targetPlayer.realm[action.target.realmIndex];
        if (targetCard) {
          const matchesRealm = state.players[playerIndex].realm.some(
            c => c.type === 'minor' && c.numericRank === targetCard.numericRank
          );
          score += matchesRealm ? 18 : 10;
        } else {
          score += 10;
        }
      } else {
        score += 5; // Page — destroy both
      }

      if (score > bestScore) {
        bestScore = score;
        bestAction = action;
      }
    }

    return bestScore > 10 ? bestAction : null; // Don't attack trivial targets
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
