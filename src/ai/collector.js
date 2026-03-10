/**
 * CollectorAI: Major Arcana hoarder.
 * Wheel of Fortune is top priority action card.
 * Bonus-aware Tome evaluation — buys cards that synergize with existing Tome.
 * Aggressively buys from display, prefers cheap purchases.
 */

import { evaluateHand } from '../poker.js';
import { isCelestial } from '../cards.js';
import { RandomAI } from './base.js';
import { potUrgency, getHandRanking, checkCelestialThreat, findCelestialDisruption, analyzeHandPotential } from './awareness.js';
import { estimateCardValue } from './card-value.js';
import { getMajorDef } from '../effect-resolver.js';

export class CollectorAI extends RandomAI {
  constructor() {
    super();
    this.name = 'Collector';
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

    // Priority 1: Play Celestials to Tome (always)
    const celestialTome = legalActions.filter(a =>
      a.type === 'PLAY_MAJOR_TOME' && a.card && isCelestial(a.card)
    );
    if (celestialTome.length > 0) return celestialTome[0];

    // Priority 2: Play best multi-card set to realm
    const setActions = legalActions.filter(a => a.type === 'PLAY_SET');
    const multiSets = setActions.filter(a => a.cards.length >= 2);
    if (multiSets.length > 0) {
      let best = null;
      let bestRank = -1;
      const opts = { aceHigh: state.config?.gameRules?.aceHigh ?? false };
      for (const action of multiSets) {
        const newRealm = [...player.realm, ...action.cards];
        const eval_ = evaluateHand(newRealm, opts);
        if (eval_.rank > bestRank) { bestRank = eval_.rank; best = action; }
      }
      if (best) return best;
    }

    // Priority 3: Completions only (no random singles)
    if (setActions.length > 0) {
      const completions = setActions.filter(a => a.cards.length === 1 && a.isCompletion);
      if (completions.length > 0) return completions[0];
      // Singles only if realm needs exactly 1 more
      if (player.realm.length === 4) return setActions[0];
    }

    // Priority 4: Wheel of Fortune (config-aware — card advantage)
    const wheelActions = legalActions.filter(a => {
      if (a.type !== 'PLAY_MAJOR_ACTION' || !a.card) return false;
      const eff = getMajorDef(state, a.card.number);
      return eff?.effect?.action === 'WHEEL_OF_FORTUNE';
    });
    if (wheelActions.length > 0) return wheelActions[0];

    // Priority 5: Play bonus/tome cards (only if realm has 2+ cards)
    if (player.realm.length >= 2) {
      const tomeActions = legalActions.filter(a => a.type === 'PLAY_MAJOR_TOME');
      if (tomeActions.length > 0) {
        // Prefer bonus cards matching our realm
        const scored = tomeActions.map(a => ({
          action: a,
          score: estimateCardValue(state, playerIndex, a.card, 'tome'),
        }));
        scored.sort((a, b) => b.score - a.score);
        return scored[0].action;
      }
    }

    // Priority 6: Buy Major Arcana (only if no good realm play and realm >= 2)
    if (player.realm.length >= 2) {
      const buyActions = legalActions.filter(a => a.type === 'BUY');
      if (buyActions.length > 0) {
        const bestBuy = this.pickCollectorBuy(buyActions, state, playerIndex);
        if (bestBuy) return bestBuy;
      }
    }

    // Priority 7: Judgement if winning the pot
    const judgementActions = legalActions.filter(a => {
      if (a.type !== 'PLAY_MAJOR_ACTION' || !a.card) return false;
      const eff = getMajorDef(state, a.card.number);
      return eff?.effect?.action === 'CLAIM_ROUND_END_MARKER';
    });
    if (judgementActions.length > 0 && ranking.winning && player.realm.length >= 3) {
      return judgementActions[0];
    }

    // Priority 8: Play wild to realm
    const wildActions = legalActions.filter(a => a.type === 'PLAY_WILD');
    if (wildActions.length > 0 && player.realm.length >= 2) {
      return wildActions[0];
    }

    return legalActions.find(a => a.type === 'PASS') || legalActions[0];
  }

  pickCollectorBuy(buyActions, state, playerIndex) {
    let bestAction = null;
    let bestScore = -Infinity;

    for (const action of buyActions) {
      const paymentTotal = action.payment.reduce((s, c) => s + c.purchaseValue, 0);
      const hasAce = action.payment.some(c => c.rank === 'ACE');
      if (hasAce) continue;

      let cardValue = 15; // collector base: loves all Major Arcana
      if (action.source.startsWith('display')) {
        const slot = parseInt(action.source.slice(-1));
        const card = state.display[slot];
        if (card) {
          cardValue = estimateCardValue(state, playerIndex, card, 'buy') * 1.3; // Collector bonus
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

  chooseMajorKeep(majorCards, state) {
    if (!state) return 0;
    const values = majorCards.map((card, i) => {
      let val = estimateCardValue(state, 0, card, 'keep');
      // Collector personality: boost Wheel-like and celestials
      const eff = getMajorDef(state, card.number);
      if (eff?.effect?.action === 'WHEEL_OF_FORTUNE') val *= 1.8;
      if (isCelestial(card)) val *= 1.3;
      return { i, score: val };
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
    let best = 'COINS';
    let bestCount = 0;
    for (const [suit, count] of Object.entries(counts)) {
      if (count > bestCount) { bestCount = count; best = suit; }
    }
    return best;
  }
}