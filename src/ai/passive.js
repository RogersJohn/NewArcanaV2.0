/**
 * PassiveAI: Never attacks, focuses purely on realm building and tome collection.
 * Used for isolating card power without combat interference.
 */

import { evaluateHand } from '../poker.js';
import { RandomAI } from './base.js';
import { aceBlockValue, analyzeHandPotential } from './awareness.js';
import { estimateCardValue } from './card-value.js';

export class PassiveAI extends RandomAI {
  constructor() {
    super();
    this.name = 'Passive';
  }

  chooseAction(state, legalActions, playerIndex) {
    const player = state.players[playerIndex];

    // Filter out all attack/disruption actions
    const peaceful = legalActions.filter(a =>
      a.type !== 'PLAY_ROYAL' &&
      a.type !== 'PLAY_MAJOR_ACTION'
    );

    // Priority 1: Play best multi-card set or completion to realm
    const setActions = peaceful.filter(a => a.type === 'PLAY_SET');
    if (setActions.length > 0) {
      const multiCardSets = setActions.filter(a => a.cards.length >= 2);
      const completions = setActions.filter(a => a.cards.length === 1 && a.isCompletion);

      // Always prefer multi-card sets
      if (multiCardSets.length > 0) {
        const best = this.pickBestSet(multiCardSets, player, state);
        if (best) return best;
      }
      // Completions are OK (they repair existing sets)
      if (completions.length > 0) return completions[0];
    }

    // Priority 2: Play wild if realm has cards to combine with
    const wildActions = peaceful.filter(a => a.type === 'PLAY_WILD');
    if (wildActions.length > 0 && player.realm.length >= 2) {
      // Pick wild that creates the strongest hand
      let bestWild = null;
      let bestRank = -1;
      for (const action of wildActions) {
        const newRealm = [...player.realm, action.card, ...action.withCards];
        const eval_ = evaluateHand(newRealm, { aceHigh: state.config?.gameRules?.aceHigh ?? false });
        if (eval_.rank > bestRank) {
          bestRank = eval_.rank;
          bestWild = action;
        }
      }
      if (bestWild) return bestWild;
    }

    // Priority 3: Play tome cards (config-aware)
    const tomeActions = peaceful.filter(a => a.type === 'PLAY_MAJOR_TOME');
    if (tomeActions.length > 0) {
      const scored = tomeActions.map(a => ({
        action: a,
        score: a.card ? estimateCardValue(state, playerIndex, a.card, 'tome') : 0,
      }));
      scored.sort((a, b) => b.score - a.score);
      return scored[0].action;
    }

    // Priority 4: Buy Major Arcana
    const buyActions = peaceful.filter(a => a.type === 'BUY');
    if (buyActions.length > 0) {
      const goodBuy = this.pickBestBuy(buyActions, state, playerIndex);
      if (goodBuy) return goodBuy;
    }

    // Priority 5: Play singles ONLY as last resort
    if (setActions.length > 0) {
      if (player.realm.length === 4) return setActions[0]; // One more completes realm
      const potential2 = analyzeHandPotential(player.hand, player.realm);
      if (player.realm.length === 0 && !potential2.hasPairForming) return setActions[0];
    }

    return peaceful.find(a => a.type === 'PASS') || legalActions.find(a => a.type === 'PASS') || legalActions[0];
  }

  pickBestSet(setActions, player, state) {
    let bestAction = null;
    let bestRank = -1;

    for (const action of setActions) {
      const newRealm = [...player.realm, ...action.cards];
      const eval_ = evaluateHand(newRealm, { aceHigh: state.config?.gameRules?.aceHigh ?? false });
      if (eval_.rank > bestRank) {
        bestRank = eval_.rank;
        bestAction = action;
      }
    }

    const currentEval = evaluateHand(player.realm, { aceHigh: state.config?.gameRules?.aceHigh ?? false });
    if (bestRank > currentEval.rank) return bestAction;

    // Play multi-card sets even if rank doesn't improve
    const multiCardSets = setActions.filter(a => a.cards.length >= 2);
    if (multiCardSets.length > 0) return multiCardSets[0];

    // Never play singles from pickBestSet — handled at Priority 5
    return null;
  }

  pickBestBuy(buyActions, state, playerIndex) {
    // Prefer cheapest payment without losing aces/kings
    const sorted = [...buyActions].sort((a, b) =>
      a.payment.reduce((s, c) => s + (c.purchaseValue || 0), 0) -
      b.payment.reduce((s, c) => s + (c.purchaseValue || 0), 0)
    );

    for (const action of sorted) {
      const paymentHasAce = action.payment.some(c => c.rank === 'ACE');
      const paymentHasKing = action.payment.some(c => c.rank === 'KING');
      if (!paymentHasAce && !paymentHasKing) return action;
    }

    return sorted.length > 0 ? sorted[0] : null;
  }

  chooseDiscard(state, playerIndex, numToDiscard) {
    const hand = state.players[playerIndex].hand;
    const realm = state.players[playerIndex].realm;

    const scores = hand.map((card, i) => {
      if (card.type === 'major') return { index: i, score: 120 };
      if (card.rank === 'ACE') return { index: i, score: 50 }; // Less value on aces (no attacks to block)
      if (card.rank === 'KING') return { index: i, score: 40 };

      // Value cards matching realm ranks
      const matchesRealm = realm.some(r => r.type === 'minor' && r.numericRank === card.numericRank);
      if (matchesRealm) return { index: i, score: 80 };

      // Value pairs in hand
      const pairCount = hand.filter(c => c.type === 'minor' && c.numericRank === card.numericRank).length;
      if (pairCount >= 2) return { index: i, score: 60 };

      return { index: i, score: card.numericRank || 0 };
    });

    scores.sort((a, b) => a.score - b.score);
    return scores.slice(0, numToDiscard).map(s => s.index).sort((a, b) => b - a);
  }

  shouldBlockWithAce(state, playerIndex, action) {
    // Only block actions directly targeting our realm or tome
    const threat = aceBlockValue(state, playerIndex, action);
    return threat >= 55; // High threshold — only block serious direct threats
  }

  shouldBlockWithKing(state, playerIndex) {
    // Block if we have significant realm
    return state.players[playerIndex].realm.length >= 4 &&
      state.players[playerIndex].hand.some(c => c.type === 'minor' && c.rank === 'KING');
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
    let bestSuit = 'WANDS';
    let bestCount = 0;
    for (const [suit, count] of Object.entries(counts)) {
      if (count > bestCount) { bestCount = count; bestSuit = suit; }
    }
    return bestSuit;
  }
}
