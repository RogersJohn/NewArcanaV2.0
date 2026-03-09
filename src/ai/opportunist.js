/**
 * OpportunistAI: Evaluates expected value of every legal action.
 * Uses heuristic scoring for realm strength, VP potential, disruption, card advantage.
 * Adapts strategy based on game state.
 */

import { evaluateHand } from '../poker.js';
import { isCelestial } from '../cards.js';
import { getHandSize, getEffectiveHandLimit } from '../state.js';
import { RandomAI } from './base.js';
import { aceBlockValue, checkCelestialThreat, analyzeHandPotential } from './awareness.js';
import { estimateCardValue } from './card-value.js';
import { getMajorDef } from '../effect-resolver.js';

export class OpportunistAI extends RandomAI {
  constructor() {
    super();
    this.name = 'Opportunist';
  }

  chooseAction(state, legalActions, playerIndex) {
    const player = state.players[playerIndex];
    const myVp = player.vp;
    const maxOpponentVp = Math.max(...state.players.filter((_, i) => i !== playerIndex).map(p => p.vp));
    const behind = maxOpponentVp - myVp;

    const threat = checkCelestialThreat(state, playerIndex);

    let bestAction = null;
    let bestScore = -Infinity;

    for (const action of legalActions) {
      let score = this.scoreAction(state, playerIndex, action, behind);
      // Boost disruption actions when Celestial threat exists
      if (threat.threatening && this.targetsThreatCelestials(action, state, threat.threatPlayer)) {
        score += 5000;
      }
      if (score > bestScore) {
        bestScore = score;
        bestAction = action;
      }
    }

    return bestAction || legalActions[0];
  }

  scoreAction(state, playerIndex, action, behind) {
    const player = state.players[playerIndex];

    switch (action.type) {
      case 'PASS': {
        const potential = analyzeHandPotential(player.hand, player.realm);
        return potential.holdScore;
      }

      case 'PLAY_SET': {
        const currentEval = evaluateHand(player.realm, { aceHigh: state.config?.gameRules?.aceHigh ?? false });
        const newRealm = [...player.realm, ...action.cards];
        const newEval = evaluateHand(newRealm, { aceHigh: state.config?.gameRules?.aceHigh ?? false });
        const improvement = (newEval.rank - currentEval.rank) * 10;
        const sizeBonus = action.cards.length * 2;
        const closeTo5 = newRealm.length >= 4 ? 15 : 0;
        let score = improvement + sizeBonus + closeTo5 + 1;

        // PENALTY for single-card plays when hand has multi-card potential
        if (action.cards.length === 1) {
          const potential = analyzeHandPotential(player.hand, player.realm);
          if (potential.hasPairForming) {
            score -= potential.holdScore;
          }
        }

        return score;
      }

      case 'PLAY_ROYAL': {
        const targetPi = action.target.playerIndex;
        if (targetPi === playerIndex) return -5; // Don't attack self usually
        const targetVp = state.players[targetPi].vp;
        const disruptionValue = behind > 0 ? 20 : 8;
        const targetIsLeader = targetVp >= state.players.reduce((max, p, i) =>
          i !== playerIndex ? Math.max(max, p.vp) : max, 0);
        return disruptionValue + (targetIsLeader ? 10 : 0);
      }

      case 'PLAY_MAJOR_TOME': {
        return estimateCardValue(state, playerIndex, action.card, 'tome');
      }

      case 'PLAY_MAJOR_ACTION': {
        let val = estimateCardValue(state, playerIndex, action.card, 'tome');
        if (behind > 3) val *= 1.2; // More aggressive when behind
        return val;
      }

      case 'PLAY_WILD': {
        const newRealm = [...player.realm, action.card, ...action.withCards];
        const newEval = evaluateHand(newRealm, { aceHigh: state.config?.gameRules?.aceHigh ?? false });
        const currentEval = evaluateHand(player.realm, { aceHigh: state.config?.gameRules?.aceHigh ?? false });
        const improvement = (newEval.rank - currentEval.rank) * 8;
        return improvement + action.withCards.length * 2 + 5;
      }

      case 'BUY': {
        const paymentTotal = action.payment.reduce((s, c) => s + c.purchaseValue, 0);
        const paymentCost = paymentTotal * 0.7; // Opportunity cost
        const hasAcePayment = action.payment.some(c => c.rank === 'ACE');
        if (hasAcePayment) return -10; // Don't spend aces

        let cardValue = 10; // Base value of getting a Major Arcana
        if (action.source.startsWith('display')) {
          const slot = parseInt(action.source.slice(-1));
          const card = state.display[slot];
          if (card) cardValue = estimateCardValue(state, playerIndex, card, 'buy');
        }
        return cardValue - paymentCost;
      }

      default:
        return 0;
    }
  }

  chooseDiscard(state, playerIndex, numToDiscard) {
    const hand = state.players[playerIndex].hand;
    const realm = state.players[playerIndex].realm;

    const scores = hand.map((card, i) => {
      if (card.type === 'major' && isCelestial(card)) return { index: i, score: 200 };
      if (card.type === 'major') return { index: i, score: 100 };
      if (card.rank === 'ACE') return { index: i, score: 150 };
      if (card.rank === 'KING') return { index: i, score: 90 };

      // Cards matching realm are valuable
      const matchRealm = realm.some(r => r.type === 'minor' && r.numericRank === card.numericRank);
      if (matchRealm) return { index: i, score: 80 };

      // High value cards are worth more for buying
      return { index: i, score: card.numericRank * 2 || 0 };
    });

    scores.sort((a, b) => a.score - b.score);
    return scores.slice(0, numToDiscard).map(s => s.index).sort((a, b) => b - a);
  }

  targetsThreatCelestials(action, state, threatPlayer) {
    if (action.type === 'PLAY_MAJOR_ACTION' && action.card) {
      const eff = getMajorDef(state, action.card.number);
      const act = eff?.effect?.action;
      if (act === 'STEAL_FROM_TOME' && action.targets?.playerIndex === threatPlayer) return true;
      if (act === 'TOWER_DESTROY') return true;
      if (act === 'MOVE_MAJOR_TO_REALM' && action.targets?.playerIndex === threatPlayer) return true;
      if (act === 'MOVE_CELESTIAL_TO_TOME') return true;
    }
    if (action.type === 'PLAY_ROYAL' && action.target?.playerIndex === threatPlayer) {
      const targetCard = state.players[threatPlayer].realm[action.target.realmIndex];
      if (targetCard && targetCard.type === 'major') return true;
    }
    return false;
  }

  shouldBlockWithAce(state, playerIndex, action) {
    if (action.type === 'PLAY_MAJOR_TOME' && action.card && isCelestial(action.card)) {
      const threat = checkCelestialThreat(state, playerIndex);
      if (threat.threatening) return true;
    }
    const threat = aceBlockValue(state, playerIndex, action);
    return threat >= 35;
  }

  shouldBlockWithKing(state, playerIndex) {
    const realmSize = state.players[playerIndex].realm.length;
    return realmSize >= 3 && state.players[playerIndex].hand.some(c => c.type === 'minor' && c.rank === 'KING');
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
    let best = 'WANDS';
    let bestCount = 0;
    for (const [suit, count] of Object.entries(counts)) {
      if (count > bestCount) { bestCount = count; best = suit; }
    }
    return best;
  }
}
