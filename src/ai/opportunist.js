/**
 * OpportunistAI: Evaluates expected value of every legal action.
 * Uses heuristic scoring for realm strength, VP potential, disruption, card advantage.
 * Adapts strategy based on game state.
 */

import { evaluateHand } from '../poker.js';
import { isCelestial } from '../cards.js';
import { getHandSize, getEffectiveHandLimit } from '../state.js';
import { RandomAI } from './base.js';
import { checkCelestialThreat } from './awareness.js';

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
      case 'PASS':
        return 0;

      case 'PLAY_SET': {
        const currentEval = evaluateHand(player.realm);
        const newRealm = [...player.realm, ...action.cards];
        const newEval = evaluateHand(newRealm);
        const improvement = (newEval.rank - currentEval.rank) * 10;
        const sizeBonus = action.cards.length * 3;
        const closeTo5 = newRealm.length >= 4 ? 15 : 0;
        return improvement + sizeBonus + closeTo5 + 5;
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
        if (isCelestial(action.card)) return 35;
        if (action.card.category === 'tome') return 20;
        if (action.card.category === 'bonus-round') return 15;
        return 10;
      }

      case 'PLAY_MAJOR_ACTION': {
        if (action.card?.number === 7) return 30; // Chariot for celestials
        if (action.card?.number === 20) return 25; // Judgement
        if (action.card?.number === 10) return 20; // Wheel of Fortune
        if (action.card?.number === 16) return behind > 3 ? 22 : 12; // Tower
        if (action.card?.number === 12) return 18; // Hanged Man
        if (action.card?.number === 8) return 15; // Strength
        return 10;
      }

      case 'PLAY_WILD': {
        const newRealm = [...player.realm, action.card, ...action.withCards];
        const newEval = evaluateHand(newRealm);
        const currentEval = evaluateHand(player.realm);
        const improvement = (newEval.rank - currentEval.rank) * 8;
        return improvement + action.withCards.length * 2 + 5;
      }

      case 'BUY': {
        const paymentTotal = action.payment.reduce((s, c) => s + c.purchaseValue, 0);
        const paymentCost = paymentTotal * 0.5; // Opportunity cost
        const hasAcePayment = action.payment.some(c => c.rank === 'ACE');
        if (hasAcePayment) return -10; // Don't spend aces

        let cardValue = 10; // Base value of getting a Major Arcana
        if (action.source.startsWith('display')) {
          const slot = parseInt(action.source.slice(-1));
          const card = state.display[slot];
          if (card) {
            if (isCelestial(card)) cardValue = 30;
            else if (card.category === 'tome') cardValue = 20;
            else if (card.category === 'bonus-round') cardValue = 18;
            else if (card.category === 'action') cardValue = 15;
          }
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
    if (action.type === 'PLAY_MAJOR_ACTION') {
      if (action.card?.number === 12 && action.targets?.playerIndex === threatPlayer) return true; // Hanged Man
      if (action.card?.number === 16) return true; // Tower
      if (action.card?.number === 8 && action.targets?.playerIndex === threatPlayer) return true; // Strength
      if (action.card?.number === 7) return true; // Chariot
    }
    if (action.type === 'PLAY_ROYAL' && action.target?.playerIndex === threatPlayer) {
      const targetCard = state.players[threatPlayer].realm[action.target.realmIndex];
      if (targetCard && targetCard.type === 'major') return true;
    }
    return false;
  }

  shouldBlockWithAce(state, playerIndex, action) {
    // Block Celestials being played to Tome by threat players
    if (action.type === 'PLAY_MAJOR_TOME' && action.card && isCelestial(action.card)) {
      const threat = checkCelestialThreat(state, playerIndex);
      if (threat.threatening) return true;
    }
    // Block based on threat level
    if (action.type === 'PLAY_ROYAL' && action.target?.playerIndex === playerIndex) {
      const realmSize = state.players[playerIndex].realm.length;
      return realmSize >= 3; // Only block if we have a significant realm
    }
    if (action.type === 'PLAY_WILD') return Math.random() < 0.3;
    return false;
  }

  shouldBlockWithKing(state, playerIndex) {
    const realmSize = state.players[playerIndex].realm.length;
    return realmSize >= 3 && state.players[playerIndex].hand.some(c => c.type === 'minor' && c.rank === 'KING');
  }

  chooseMajorKeep(majorCards) {
    // Evaluate each card's general value
    const values = majorCards.map((card, i) => {
      if (isCelestial(card)) return { i, score: 50 };
      if (card.number === 15) return { i, score: 40 }; // Devil
      if (card.category === 'tome') return { i, score: 35 };
      if (card.category === 'bonus-round') return { i, score: 30 };
      if (card.category === 'action') return { i, score: 25 };
      return { i, score: 10 };
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
    let best = 'WANDS';
    let bestCount = 0;
    for (const [suit, count] of Object.entries(counts)) {
      if (count > bestCount) { bestCount = count; best = suit; }
    }
    return best;
  }
}
