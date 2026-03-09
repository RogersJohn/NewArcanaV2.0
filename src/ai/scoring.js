/**
 * ScoringAI: 1-step lookahead AI that evaluates each legal action
 * by simulating immediate card movements on a cloned state and
 * scoring the resulting position.
 */

import { isCelestial } from '../cards.js';
import { RandomAI } from './base.js';
import { checkCelestialThreat } from './awareness.js';
import { estimateCardValue } from './card-value.js';
import { getMajorDef } from '../effect-resolver.js';

export class ScoringAI extends RandomAI {
  constructor() {
    super();
    this.name = 'Scoring';
  }

  chooseAction(state, legalActions, playerIndex) {
    // Priority: disrupt celestial threats
    const threat = checkCelestialThreat(state, playerIndex);

    let bestAction = legalActions[0]; // PASS fallback
    let bestScore = -Infinity;

    for (const action of legalActions) {
      let score = this.simulateAction(state, playerIndex, action);

      // Boost anti-celestial actions
      if (threat.threatening && this.targetsThreat(action, state, threat.threatPlayer)) {
        score += 5000;
      }

      if (score > bestScore) {
        bestScore = score;
        bestAction = action;
      }
    }

    return bestAction;
  }

  /**
   * Simulate an action's immediate effect and return a position score.
   */
  simulateAction(state, playerIndex, action) {
    const player = state.players[playerIndex];

    switch (action.type) {
      case 'PASS':
        return 0;

      case 'PLAY_SET': {
        const newSize = player.realm.length + action.cards.length;
        // Estimate hand improvement from set size and card matching
        const setSize = action.cards.length;
        const setsBonus = setSize >= 3 ? 25 : setSize === 2 ? 15 : 5;
        const sizeBonus = newSize * 3;
        const realmTrigger = newSize >= 5 ? 20 : 0;
        return setsBonus + sizeBonus + realmTrigger + 5;
      }

      case 'PLAY_ROYAL': {
        if (action.target.playerIndex === playerIndex) return -10;
        const targetPlayer = state.players[action.target.playerIndex];
        const targetVp = targetPlayer.vp;
        const myVp = player.vp;
        const targetIsLeader = targetVp >= Math.max(...state.players.map(p => p.vp)) - 1;
        const targetRealmSize = targetPlayer.realm.length;
        // More valuable to attack large realms and leaders
        const disruptValue = targetRealmSize * 4 + (targetIsLeader ? 12 : 0);
        // Queen is best (move to our realm), Knight second (steal to hand), Page worst (destroy)
        const rankBonus = action.card.rank === 'QUEEN' ? 10 : action.card.rank === 'KNIGHT' ? 6 : 2;
        return disruptValue + rankBonus;
      }

      case 'PLAY_WILD': {
        const companionCount = action.withCards ? action.withCards.length : 0;
        const newSize = player.realm.length + 1 + companionCount;
        // Wild cards make strongest possible hand — always good
        const wildBonus = 30;
        const companionBonus = companionCount * 5;
        const sizeBonus = newSize * 3;
        const realmTrigger = newSize >= 5 ? 20 : 0;
        return wildBonus + companionBonus + sizeBonus + realmTrigger + 3;
      }

      case 'PLAY_MAJOR_TOME': {
        return estimateCardValue(state, playerIndex, action.card, 'tome');
      }

      case 'PLAY_MAJOR_ACTION': {
        return this.scoreMajorAction(state, playerIndex, action);
      }

      case 'BUY': {
        const paymentTotal = action.payment.reduce((s, c) => s + c.purchaseValue, 0);
        const hasAce = action.payment.some(c => c.rank === 'ACE');
        if (hasAce) return -15; // Never spend aces
        const hasKing = action.payment.some(c => c.rank === 'KING');
        if (hasKing) return -5; // Avoid spending kings

        let cardValue = 12; // base value for unknown draw
        if (action.source.startsWith('display')) {
          const slot = parseInt(action.source.slice(-1));
          const card = state.display[slot];
          if (card) cardValue = estimateCardValue(state, playerIndex, card, 'buy');
        }
        return cardValue - paymentTotal * 0.6;
      }

      default:
        return 0;
    }
  }

  scoreMajorAction(state, playerIndex, action) {
    const card = action.card;
    if (!card) return 10;
    return estimateCardValue(state, playerIndex, card, 'tome');
  }

  /**
   * Evaluate overall position quality for a player.
   */
  evaluatePosition(state, playerIndex) {
    const player = state.players[playerIndex];
    let score = 0;

    // Realm quality heuristic (avoid expensive evaluateHand calls)
    if (player.realm.length > 0) {
      const hasWild = player.realm.some(c => c.type === 'major');
      const rankCounts = {};
      for (const c of player.realm) {
        if (c.type === 'minor') rankCounts[c.numericRank] = (rankCounts[c.numericRank] || 0) + 1;
      }
      const maxGroup = Math.max(0, ...Object.values(rankCounts));
      const groupScore = maxGroup >= 4 ? 8 : maxGroup >= 3 ? 6 : maxGroup >= 2 ? 4 : 2;
      score += (groupScore + (hasWild ? 3 : 0)) * 15;
    }

    // Realm card count (proximity to 5 for round trigger)
    score += player.realm.length * 3;

    // Celestial count in tome
    const celestials = player.tome.filter(c => isCelestial(c)).length;
    score += celestials * 10;

    // Bonus cards in tome
    const bonusCards = player.tome.filter(c =>
      c.category === 'bonus-round' || (c.keywords && c.keywords.includes('bonus'))
    ).length;
    score += bonusCards * 3;

    // VP advantage
    const myVp = player.vp;
    const bestOpponentVp = Math.max(0, ...state.players
      .filter((_, i) => i !== playerIndex)
      .map(p => p.vp));
    score += (myVp - bestOpponentVp) * 2;

    // Hand quality
    for (const card of player.hand) {
      if (card.type === 'minor' && card.rank === 'ACE') score += 5;
      if (card.type === 'minor' && card.rank === 'KING') score += 3;
      if (card.type === 'major') score += 4;
    }

    return score;
  }

  chooseDiscard(state, playerIndex, numToDiscard) {
    const hand = state.players[playerIndex].hand;
    const realm = state.players[playerIndex].realm;

    const scores = hand.map((card, i) => {
      if (card.type === 'major' && isCelestial(card)) return { index: i, score: 200 };
      if (card.rank === 'ACE') return { index: i, score: 150 };
      if (card.type === 'major') return { index: i, score: 100 };
      if (card.rank === 'KING') return { index: i, score: 90 };

      // Cards matching realm ranks are valuable
      const matchesRealm = realm.some(r =>
        r.type === 'minor' && r.numericRank === card.numericRank
      );
      if (matchesRealm) return { index: i, score: 80 };

      // Higher purchase value is more useful for buying
      return { index: i, score: (card.numericRank || 0) * 2 };
    });

    scores.sort((a, b) => a.score - b.score); // lowest score = discard first
    return scores.slice(0, numToDiscard).map(s => s.index).sort((a, b) => b - a);
  }

  chooseMajorKeep(majorCards, state) {
    if (!state) return 0;
    const values = majorCards.map((card, i) => ({
      i, score: estimateCardValue(state, 0, card, 'keep'),
    }));
    values.sort((a, b) => b.score - a.score);
    return values[0].i;
  }

  shouldBlockWithAce(state, playerIndex, action) {
    // Always block Celestials to Tome
    if (action.type === 'PLAY_MAJOR_TOME' && action.card && isCelestial(action.card)) {
      return true;
    }
    // Block attacks on our realm if we have >= 3 cards
    if (action.type === 'PLAY_ROYAL' && action.target?.playerIndex === playerIndex) {
      return state.players[playerIndex].realm.length >= 3;
    }
    // Block wild plays 30% of the time
    if (action.type === 'PLAY_WILD') {
      return state.rng.next() < 0.3;
    }
    return false;
  }

  shouldBlockWithKing(state, playerIndex) {
    return state.players[playerIndex].realm.length >= 3;
  }

  chooseMagicianSuit(state, playerIndex) {
    const realm = state.players[playerIndex].realm;
    const counts = {};
    for (const c of realm) {
      if (c.type === 'minor') counts[c.suit] = (counts[c.suit] || 0) + 1;
    }
    // Wilds count for all suits
    const wildCount = realm.filter(c => c.type === 'major').length;
    let best = 'WANDS';
    let bestCount = 0;
    for (const [suit, count] of Object.entries(counts)) {
      const total = count + wildCount;
      if (total > bestCount) { bestCount = total; best = suit; }
    }
    return best;
  }

  chooseTomeDiscard(state, playerIndex) {
    const tome = state.players[playerIndex].tome;
    let worstIdx = 0;
    let worstScore = Infinity;
    for (let i = 0; i < tome.length; i++) {
      const score = estimateCardValue(state, playerIndex, tome[i], 'discard');
      if (score < worstScore) { worstScore = score; worstIdx = i; }
    }
    return worstIdx;
  }

  targetsThreat(action, state, threatPlayer) {
    if (action.type === 'PLAY_MAJOR_ACTION' && action.card) {
      const eff = getMajorDef(state, action.card.number);
      const act = eff?.effect?.action;
      if (act === 'STEAL_FROM_TOME' && action.targets?.playerIndex === threatPlayer) return true;
      if (act === 'TOWER_DESTROY') return true;
      if (act === 'MOVE_MAJOR_TO_REALM' && action.targets?.playerIndex === threatPlayer) return true;
      if (act === 'MOVE_CELESTIAL_TO_TOME') return true;
    }
    if (action.type === 'PLAY_ROYAL' && action.target?.playerIndex === threatPlayer) {
      const targetCard = state.players[threatPlayer].realm?.[action.target.realmIndex];
      if (targetCard && targetCard.type === 'major') return true;
    }
    return false;
  }
}
