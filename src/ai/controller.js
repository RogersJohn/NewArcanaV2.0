/**
 * ControllerAI: Defensive and methodical.
 * Buys protection cards (Temperance family).
 * Always holds at least one Ace.
 * Builds consistent hands (pairs -> three-of-a-kind).
 * Avoids wild cards (too vulnerable).
 * Buys Devil for hand size advantage.
 */

import { evaluateHand } from '../poker.js';
import { isCelestial } from '../cards.js';
import { RandomAI } from './base.js';
import { potUrgency, getHandRanking, aceBlockValue, checkCelestialThreat, findCelestialDisruption, analyzeHandPotential, shouldSkipBuying } from './awareness.js';
import { estimateCardValue } from './card-value.js';
import { getMajorDef } from '../effect-resolver.js';

export class ControllerAI extends RandomAI {
  constructor() {
    super();
    this.name = 'Controller';
  }

  chooseAction(state, legalActions, playerIndex) {
    const player = state.players[playerIndex];
    const urgency = potUrgency(state);
    const ranking = getHandRanking(state, playerIndex);

    // Celestial threat check
    const threat = checkCelestialThreat(state, playerIndex);
    if (threat.threatening) {
      const disruption = findCelestialDisruption(state, playerIndex, legalActions, threat.threatPlayer);
      if (disruption) return disruption;
    }

    // Priority 1: Build realm with consistent sets (pairs/trips)
    const setActions = legalActions.filter(a => a.type === 'PLAY_SET');
    if (setActions.length > 0) {
      const best = this.pickConsistentSet(setActions, player, state);
      if (best) return best;
    }

    // Priority 2: Play Tome cards (only after realm has 3+ cards, except Celestials)
    const tomeActions = legalActions.filter(a => a.type === 'PLAY_MAJOR_TOME');
    if (tomeActions.length > 0) {
      // Always play Celestials to Tome
      const celestialTome = tomeActions.filter(a => a.card && isCelestial(a.card));
      if (celestialTome.length > 0) return celestialTome[0];
      // Other tome plays only if realm is progressing
      if (player.realm.length >= 3) {
        const scored = tomeActions.map(a => {
          let val = estimateCardValue(state, playerIndex, a.card, 'tome');
          const eff = getMajorDef(state, a.card?.number);
          // Only boost protection if we have matching suit cards in realm
          if (eff?.effect?.onPlay?.action === 'PROTECT_SUIT') {
            const suit = eff.effect.onPlay.suit;
            const suitCount = player.realm.filter(c => c.type === 'minor' && c.suit === suit).length;
            if (suitCount >= 2) val *= 2.0;
            else if (suitCount >= 1) val *= 1.3;
            else val *= 0.3; // Don't waste protection on empty suit
          }
          if (eff?.effect?.onPlay?.action === 'DRAW_TO_LIMIT') val *= 1.5;
          return { action: a, score: val };
        });
        scored.sort((a, b) => b.score - a.score);
        if (scored[0].score > 5) return scored[0].action;
      }
    }

    // Priority 3: Buy protection/Devil cards (only if not rushing realm)
    if (!shouldSkipBuying(state, playerIndex)) {
      const buyActions = legalActions.filter(a => a.type === 'BUY');
      if (buyActions.length > 0) {
        const protectionBuy = this.pickProtectionBuy(buyActions, state, playerIndex);
        if (protectionBuy) return protectionBuy;
      }
    }

    // Priority 4: Play singles ONLY as last resort
    if (setActions.length > 0) {
      if (player.realm.length === 4) return setActions[0];
      if (player.realm.length === 0) {
        const potential = analyzeHandPotential(player.hand, player.realm);
        if (!potential.hasPairForming) return setActions[0];
      }
    }

    // Priority 5: Buy anything affordable (only if not rushing realm and pot urgency low)
    if (!shouldSkipBuying(state, playerIndex) && urgency < 1.2) {
      const buyActions = legalActions.filter(a => a.type === 'BUY');
      const cheap = buyActions.filter(a =>
        a.payment.reduce((s, c) => s + c.purchaseValue, 0) <= 10 &&
        !a.payment.some(c => c.rank === 'ACE')
      );
      if (cheap.length > 0) return cheap[0];
    }

    return legalActions.find(a => a.type === 'PASS') || legalActions[0];
  }

  pickConsistentSet(setActions, player, state) {
    // Prefer multi-card sets
    const multiSets = setActions.filter(a => a.cards.length >= 2);
    if (multiSets.length > 0) {
      // Pick set that creates the best hand
      let best = null;
      let bestRank = -1;
      for (const action of multiSets) {
        const newRealm = [...player.realm, ...action.cards];
        const eval_ = evaluateHand(newRealm, { aceHigh: state.config?.gameRules?.aceHigh ?? false });
        if (eval_.rank > bestRank) {
          bestRank = eval_.rank;
          best = action;
        }
      }
      return best;
    }

    // Play singles that match realm cards
    const completions = setActions.filter(a => a.isCompletion);
    if (completions.length > 0) return completions[0];

    // Never play random singles from pickConsistentSet — handled at Priority 4

    return null;
  }

  pickProtectionBuy(buyActions, state, playerIndex) {
    let bestAction = null;
    let bestScore = 0;
    for (const action of buyActions) {
      if (action.payment.some(c => c.rank === 'ACE')) continue;
      if (action.source.startsWith('display')) {
        const slot = parseInt(action.source.slice(-1));
        const card = state.display[slot];
        if (card) {
          let val = estimateCardValue(state, playerIndex, card, 'buy');
          // Controller personality: boost protection/Devil
          const eff = getMajorDef(state, card.number);
          if (eff?.effect?.onPlay?.action === 'PROTECT_SUIT') val *= 2;
          if (eff?.effect?.onPlay?.action === 'DRAW_TO_LIMIT') val *= 1.5;
          if (val > bestScore) { bestScore = val; bestAction = action; }
        }
      }
    }
    return bestScore > 5 ? bestAction : null;
  }

  chooseDiscard(state, playerIndex, numToDiscard) {
    const hand = state.players[playerIndex].hand;
    const realm = state.players[playerIndex].realm;

    const scores = hand.map((card, i) => {
      if (card.rank === 'ACE') return { index: i, score: 200 }; // Never discard aces
      if (card.rank === 'KING') return { index: i, score: 150 };
      if (card.type === 'major') return { index: i, score: 120 };

      // Value cards matching realm
      const matchRealm = realm.some(r => r.type === 'minor' && r.numericRank === card.numericRank);
      if (matchRealm) return { index: i, score: 100 };

      // Value pairs in hand
      const pairInHand = hand.filter(c => c.type === 'minor' && c.numericRank === card.numericRank).length;
      if (pairInHand >= 2) return { index: i, score: 80 };

      return { index: i, score: card.numericRank || 0 };
    });

    scores.sort((a, b) => a.score - b.score);
    return scores.slice(0, numToDiscard).map(s => s.index).sort((a, b) => b - a);
  }

  shouldBlockWithAce(state, playerIndex, action) {
    if (action.type === 'PLAY_MAJOR_TOME' && action.card && isCelestial(action.card)) {
      const threat = checkCelestialThreat(state, playerIndex);
      if (threat.threatening) return true;
    }
    const threat = aceBlockValue(state, playerIndex, action);
    const aceCount = state.players[playerIndex].hand.filter(
      c => c.type === 'minor' && c.rank === 'ACE'
    ).length;
    // Controller is conservative: only block high threats, keep reserve
    if (aceCount >= 2) return threat >= 30;
    return threat >= 60; // With 1 ace, only block critical threats
  }

  shouldBlockWithKing(state, playerIndex) {
    return state.players[playerIndex].hand.some(c => c.type === 'minor' && c.rank === 'KING');
  }

  chooseMajorKeep(majorCards, state) {
    if (!state) return 0;
    const values = majorCards.map((card, i) => {
      let val = estimateCardValue(state, 0, card, 'keep');
      // Controller personality: boost protection/Devil
      const eff = getMajorDef(state, card.number);
      if (eff?.effect?.onPlay?.action === 'PROTECT_SUIT') val *= 2;
      if (eff?.effect?.onPlay?.action === 'DRAW_TO_LIMIT') val *= 1.5;
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
