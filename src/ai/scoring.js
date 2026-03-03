/**
 * ScoringAI: 1-step lookahead AI that evaluates each legal action
 * by simulating immediate card movements on a cloned state and
 * scoring the resulting position.
 */

import { isCelestial } from '../cards.js';
import { RandomAI } from './base.js';
import { checkCelestialThreat } from './awareness.js';

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
        if (isCelestial(action.card)) return 40;
        if (action.card.number === 15) return 35; // Devil
        if (action.card.number === 5) return 30; // Hierophant
        if (action.card.category === 'tome') return 25;
        if (action.card.category === 'bonus-round') return 20;
        return 15;
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
          if (card) {
            if (isCelestial(card)) cardValue = 35;
            else if (card.number === 15) cardValue = 30; // Devil
            else if (card.category === 'tome') cardValue = 22;
            else if (card.category === 'bonus-round') cardValue = 20;
            else if (card.category === 'action') cardValue = 18;
          }
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

    switch (card.number) {
      case 7: // Chariot - steal celestial
        return 35;
      case 8: { // Strength - move major to own realm
        const target = action.targets;
        if (target && target.source === 'realm') return 18;
        if (target && target.source === 'tome') return 22; // stealing from tome is more impactful
        return 15;
      }
      case 10: // Wheel of Fortune
        return 22;
      case 12: { // Hanged Man - steal from tome
        if (action.targets) {
          const targetCard = state.players[action.targets.playerIndex]?.tome?.[action.targets.cardIndex];
          if (targetCard && isCelestial(targetCard)) return 35;
        }
        return 20;
      }
      case 16: { // Tower
        const myTomeSize = state.players[playerIndex].tome.length;
        const affectedOpponents = state.players.filter((p, i) =>
          i !== playerIndex && p.tome.length > myTomeSize
        ).length;
        return 12 + affectedOpponents * 8;
      }
      case 20: // Judgement
        return state.players[playerIndex].realm.length >= 3 ? 28 : 15;
      case 26: // Plague
        return 18;
      default:
        return 10;
    }
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

  chooseMajorKeep(majorCards) {
    const values = majorCards.map((card, i) => {
      if (isCelestial(card)) return { i, score: 50 };
      if (card.number === 15) return { i, score: 45 }; // Devil
      if (card.category === 'tome') return { i, score: 35 };
      if (card.category === 'bonus-round') return { i, score: 30 };
      if (card.category === 'action') return { i, score: 25 };
      return { i, score: 10 };
    });
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
    // Keep celestials and protection cards, discard least valuable
    let worstIdx = 0;
    let worstScore = Infinity;
    for (let i = 0; i < tome.length; i++) {
      const card = tome[i];
      let score = 10; // base
      if (isCelestial(card)) score = 100;
      else if (card.number === 5) score = 40; // Hierophant
      else if (card.number === 15) score = 35; // Devil
      else if (card.number === 14 || card.number === 22 || card.number === 23 || card.number === 25) score = 30; // Protection
      else if (card.category === 'bonus-round') score = 20;
      if (score < worstScore) { worstScore = score; worstIdx = i; }
    }
    return worstIdx;
  }

  targetsThreat(action, state, threatPlayer) {
    if (action.type === 'PLAY_MAJOR_ACTION') {
      if (action.card?.number === 12 && action.targets?.playerIndex === threatPlayer) return true;
      if (action.card?.number === 16) return true;
      if (action.card?.number === 8 && action.targets?.playerIndex === threatPlayer) return true;
      if (action.card?.number === 7) return true;
    }
    if (action.type === 'PLAY_ROYAL' && action.target?.playerIndex === threatPlayer) {
      const targetCard = state.players[threatPlayer].realm?.[action.target.realmIndex];
      if (targetCard && targetCard.type === 'major') return true;
    }
    return false;
  }
}
