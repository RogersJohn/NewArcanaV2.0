/**
 * CollectorAI: Major Arcana hoarder.
 * Wheel of Fortune is top priority action card.
 * Bonus-aware Tome evaluation — buys cards that synergize with existing Tome.
 * Aggressively buys from display, prefers cheap purchases.
 */

import { evaluateHand } from '../poker.js';
import { isCelestial, MAJOR_ARCANA_DEFS } from '../cards.js';
import { RandomAI } from './base.js';
import { checkCelestialThreat, findCelestialDisruption } from './awareness.js';

const BONUS_CARDS = new Set([0, 1, 2, 3, 4, 6, 9, 11, 14, 22, 23, 25]);

export class CollectorAI extends RandomAI {
  constructor() {
    super();
    this.name = 'Collector';
  }

  chooseAction(state, legalActions, playerIndex) {
    const player = state.players[playerIndex];

    // Priority 0: Celestial threat disruption
    const threat = checkCelestialThreat(state, playerIndex);
    if (threat.threatening) {
      const disruption = findCelestialDisruption(state, playerIndex, legalActions, threat.threatPlayer);
      if (disruption) return disruption;
    }

    // Priority 1: Wheel of Fortune — top action priority
    const wheelActions = legalActions.filter(a =>
      a.type === 'PLAY_MAJOR_ACTION' && a.card?.number === 10
    );
    if (wheelActions.length > 0) return wheelActions[0];

    // Priority 2: Play Celestials and bonus cards to Tome
    const tomeActions = legalActions.filter(a => a.type === 'PLAY_MAJOR_TOME');
    if (tomeActions.length > 0) {
      const celestialTome = tomeActions.filter(a => a.card && isCelestial(a.card));
      if (celestialTome.length > 0) return celestialTome[0];

      // Prefer bonus cards that synergize with our realm
      const bonusTome = tomeActions.filter(a => a.card && BONUS_CARDS.has(a.card.number));
      if (bonusTome.length > 0) {
        const best = this.pickBestBonusTome(bonusTome, state, playerIndex);
        if (best) return best;
      }

      return tomeActions[0];
    }

    // Priority 3: Buy Major Arcana aggressively
    const buyActions = legalActions.filter(a => a.type === 'BUY');
    if (buyActions.length > 0) {
      const bestBuy = this.pickCollectorBuy(buyActions, state, playerIndex);
      if (bestBuy) return bestBuy;
    }

    // Priority 4: Other action cards
    const actionCards = legalActions.filter(a =>
      a.type === 'PLAY_MAJOR_ACTION' && a.card &&
      [7, 8, 12, 16, 20, 26].includes(a.card.number)
    );
    if (actionCards.length > 0) {
      // Prefer Judgement when we'd win pot, then Chariot for celestials
      const judgement = actionCards.filter(a => a.card.number === 20);
      if (judgement.length > 0 && this.wouldWinPot(state, playerIndex)) {
        return judgement[0];
      }
      const chariot = actionCards.filter(a => a.card.number === 7);
      if (chariot.length > 0) return chariot[0];
      return actionCards[0];
    }

    // Priority 5: Build realm
    const setActions = legalActions.filter(a => a.type === 'PLAY_SET');
    if (setActions.length > 0) {
      const multiSets = setActions.filter(a => a.cards.length >= 2);
      if (multiSets.length > 0) {
        let best = null;
        let bestRank = -1;
        for (const action of multiSets) {
          const newRealm = [...player.realm, ...action.cards];
          const eval_ = evaluateHand(newRealm);
          if (eval_.rank > bestRank) { bestRank = eval_.rank; best = action; }
        }
        if (best) return best;
      }
      if (player.realm.length < 4) return setActions[0];
    }

    // Priority 6: Play wild
    const wildActions = legalActions.filter(a => a.type === 'PLAY_WILD');
    if (wildActions.length > 0 && player.realm.length >= 2) {
      return wildActions[0];
    }

    return legalActions.find(a => a.type === 'PASS') || legalActions[0];
  }

  wouldWinPot(state, playerIndex) {
    const myRealm = state.players[playerIndex].realm;
    if (myRealm.length === 0) return false;
    const myEval = evaluateHand(myRealm);
    for (let pi = 0; pi < state.players.length; pi++) {
      if (pi === playerIndex) continue;
      const opRealm = state.players[pi].realm;
      if (opRealm.length === 0) continue;
      const opEval = evaluateHand(opRealm);
      if (opEval.rank >= myEval.rank) return false;
    }
    return true;
  }

  pickBestBonusTome(bonusTomeActions, state, playerIndex) {
    const realm = state.players[playerIndex].realm;
    const suitCounts = {};
    for (const c of realm) {
      if (c.type === 'minor') suitCounts[c.suit] = (suitCounts[c.suit] || 0) + 1;
    }

    let bestAction = null;
    let bestScore = -1;

    for (const action of bonusTomeActions) {
      const card = action.card;
      let score = 5; // base value

      // Suit-specific bonuses score higher if we have those suits
      if (card.number === 2 && suitCounts['WANDS'] >= 2) score += 10; // High Priestess
      if (card.number === 3 && suitCounts['CUPS'] >= 2) score += 10; // Empress
      if (card.number === 4 && suitCounts['COINS'] >= 2) score += 10; // Emperor
      if (card.number === 11 && suitCounts['SWORDS'] >= 2) score += 10; // Justice
      if (card.number === 14) score += 8; // Temperance (protection + bonus)
      if (card.number === 6) score += 7; // Lovers (pair bonus)
      if (card.number === 9) score += 6; // Hermit (always scores)
      if (card.number === 1) score += 5; // Magician

      if (score > bestScore) { bestScore = score; bestAction = action; }
    }

    return bestAction;
  }

  pickCollectorBuy(buyActions, state, playerIndex) {
    // Score each buy option
    let bestAction = null;
    let bestScore = -Infinity;

    for (const action of buyActions) {
      const paymentTotal = action.payment.reduce((s, c) => s + c.purchaseValue, 0);
      const hasAce = action.payment.some(c => c.rank === 'ACE');
      if (hasAce) continue; // Never spend aces

      let cardValue = 15; // base value for any Major Arcana (collector loves them all)

      if (action.source.startsWith('display')) {
        const slot = parseInt(action.source.slice(-1));
        const card = state.display[slot];
        if (card) {
          if (isCelestial(card)) cardValue = 40;
          else if (card.number === 10) cardValue = 35; // Wheel
          else if (card.category === 'tome') cardValue = 30;
          else if (BONUS_CARDS.has(card.number)) cardValue = 28;
          else if (card.category === 'action') cardValue = 25;
        }
      }

      const score = cardValue - paymentTotal * 0.3;
      if (score > bestScore) { bestScore = score; bestAction = action; }
    }

    return bestScore > 0 ? bestAction : null;
  }

  chooseDiscard(state, playerIndex, numToDiscard) {
    const hand = state.players[playerIndex].hand;
    const realm = state.players[playerIndex].realm;

    const scores = hand.map((card, i) => {
      if (card.type === 'major' && isCelestial(card)) return { index: i, score: 200 };
      if (card.type === 'major') return { index: i, score: 130 }; // Collector values all majors highly
      if (card.rank === 'ACE') return { index: i, score: 140 };
      if (card.rank === 'KING') return { index: i, score: 90 };

      const matchRealm = realm.some(r => r.type === 'minor' && r.numericRank === card.numericRank);
      if (matchRealm) return { index: i, score: 80 };

      // Keep high-value cards for purchasing
      return { index: i, score: card.purchaseValue || card.numericRank || 0 };
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
    // Block Wheel and Judgement sometimes
    if (action.type === 'PLAY_MAJOR_ACTION') {
      if (action.card?.number === 10) return state.rng.next() < 0.25;
      if (action.card?.number === 20) return state.rng.next() < 0.35;
    }
    // Protect our realm
    if (action.type === 'PLAY_ROYAL' && action.target?.playerIndex === playerIndex) {
      return state.players[playerIndex].realm.length >= 3;
    }
    return false;
  }

  shouldBlockWithKing(state, playerIndex) {
    return state.players[playerIndex].realm.length >= 3 &&
      state.players[playerIndex].hand.some(c => c.type === 'minor' && c.rank === 'KING');
  }

  chooseMajorKeep(majorCards) {
    // Prefer Wheel of Fortune
    for (let i = 0; i < majorCards.length; i++) {
      if (majorCards[i].number === 10) return i;
    }
    // Prefer celestials
    for (let i = 0; i < majorCards.length; i++) {
      if (isCelestial(majorCards[i])) return i;
    }
    // Prefer bonus/tome
    for (let i = 0; i < majorCards.length; i++) {
      if (majorCards[i].category === 'bonus-round' || majorCards[i].category === 'tome') return i;
    }
    return 0;
  }

  chooseMagicianSuit(state, playerIndex) {
    const realm = state.players[playerIndex].realm;
    const counts = {};
    for (const c of realm) {
      if (c.type === 'minor') counts[c.suit] = (counts[c.suit] || 0) + 1;
    }
    let best = 'COINS';
    let bestCount = 0;
    for (const [suit, count] of Object.entries(counts)) {
      if (count > bestCount) { bestCount = count; best = suit; }
    }
    return best;
  }
}