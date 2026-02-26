/**
 * PassiveAI: Never attacks, focuses purely on realm building and tome collection.
 * Used for isolating card power without combat interference.
 */

import { evaluateHand } from '../poker.js';
import { RandomAI } from './base.js';

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

    // Priority 1: Play best set to realm
    const setActions = peaceful.filter(a => a.type === 'PLAY_SET');
    if (setActions.length > 0) {
      const best = this.pickBestSet(setActions, player);
      if (best) return best;
    }

    // Priority 2: Play wild if realm has cards to combine with
    const wildActions = peaceful.filter(a => a.type === 'PLAY_WILD');
    if (wildActions.length > 0 && player.realm.length >= 2) {
      // Pick wild that creates the strongest hand
      let bestWild = null;
      let bestRank = -1;
      for (const action of wildActions) {
        const newRealm = [...player.realm, action.card, ...action.withCards];
        const eval_ = evaluateHand(newRealm);
        if (eval_.rank > bestRank) {
          bestRank = eval_.rank;
          bestWild = action;
        }
      }
      if (bestWild) return bestWild;
    }

    // Priority 3: Play tome cards (bonus/protection/celestial)
    const tomeActions = peaceful.filter(a => a.type === 'PLAY_MAJOR_TOME');
    if (tomeActions.length > 0) {
      // Prefer bonus cards, then protection, then celestials
      const scored = tomeActions.map(a => {
        let score = 0;
        if (!a.card) return { action: a, score: 0 };
        if (a.card.category === 'bonus-round') score = 10;
        else if ([14, 22, 23, 25].includes(a.card.number)) score = 8; // protection
        else if (a.card.category === 'celestial') score = 7;
        else if (a.card.number === 15) score = 9; // Devil
        else score = 5;
        return { action: a, score };
      });
      scored.sort((a, b) => b.score - a.score);
      return scored[0].action;
    }

    // Priority 4: Buy Major Arcana
    const buyActions = peaceful.filter(a => a.type === 'BUY');
    if (buyActions.length > 0) {
      const goodBuy = this.pickBestBuy(buyActions, state, playerIndex);
      if (goodBuy) return goodBuy;
    }

    // Priority 5: Play singles to realm if small
    if (setActions.length > 0 && player.realm.length < 3) {
      return setActions[0];
    }

    return peaceful.find(a => a.type === 'PASS') || legalActions.find(a => a.type === 'PASS') || legalActions[0];
  }

  pickBestSet(setActions, player) {
    let bestAction = null;
    let bestRank = -1;

    for (const action of setActions) {
      const newRealm = [...player.realm, ...action.cards];
      const eval_ = evaluateHand(newRealm);
      if (eval_.rank > bestRank) {
        bestRank = eval_.rank;
        bestAction = action;
      }
    }

    const currentEval = evaluateHand(player.realm);
    if (bestRank > currentEval.rank) return bestAction;

    // Play multi-card sets even if rank doesn't improve
    const multiCardSets = setActions.filter(a => a.cards.length >= 2);
    if (multiCardSets.length > 0) return multiCardSets[0];

    // Play singles if realm is small
    if (player.realm.length < 3) return bestAction;

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

  // Passive AI never blocks — no interference
  shouldBlockWithAce() { return false; }
  shouldBlockWithKing() { return false; }

  chooseMajorKeep(majorCards) {
    // Prefer bonus/tome cards, then celestials
    for (let i = 0; i < majorCards.length; i++) {
      if (majorCards[i].category === 'bonus-round') return i;
    }
    for (let i = 0; i < majorCards.length; i++) {
      if (majorCards[i].category === 'celestial') return i;
    }
    for (let i = 0; i < majorCards.length; i++) {
      if (majorCards[i].category === 'tome') return i;
    }
    return 0;
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
