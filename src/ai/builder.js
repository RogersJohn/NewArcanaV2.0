/**
 * BuilderAI: Focuses on building strong poker hands in Realm.
 * Evaluates which hand in current cards would score highest.
 * Buys Tome bonus cards matching suit distribution.
 * Holds aces for defense, uses Kings defensively.
 * Never attacks unless significantly behind.
 */

import { evaluateHand } from '../poker.js';
import { RandomAI } from './base.js';

export class BuilderAI extends RandomAI {
  constructor() {
    super();
    this.name = 'Builder';
  }

  chooseAction(state, legalActions, playerIndex) {
    const player = state.players[playerIndex];

    // Priority 1: Play best set to realm
    const setActions = legalActions.filter(a => a.type === 'PLAY_SET');
    if (setActions.length > 0) {
      const best = this.pickBestSet(setActions, player);
      if (best) return best;
    }

    // Priority 2: Play wild if it significantly improves hand
    const wildActions = legalActions.filter(a => a.type === 'PLAY_WILD');
    if (wildActions.length > 0 && player.realm.length >= 2) {
      return wildActions[0];
    }

    // Priority 3: Buy bonus/tome cards
    const buyActions = legalActions.filter(a => a.type === 'BUY');
    if (buyActions.length > 0) {
      const goodBuy = this.pickBestBuy(buyActions, state, playerIndex);
      if (goodBuy) return goodBuy;
    }

    // Priority 4: Play tome cards
    const tomeActions = legalActions.filter(a => a.type === 'PLAY_MAJOR_TOME');
    if (tomeActions.length > 0) {
      return tomeActions[0];
    }

    return legalActions.find(a => a.type === 'PASS') || legalActions[0];
  }

  pickBestSet(setActions, player) {
    let bestAction = null;
    let bestRank = -1;

    for (const action of setActions) {
      // Evaluate what realm would look like after playing this set
      const newRealm = [...player.realm, ...action.cards];
      const eval_ = evaluateHand(newRealm);
      if (eval_.rank > bestRank) {
        bestRank = eval_.rank;
        bestAction = action;
      }
    }

    // Only play if it improves from current
    const currentEval = evaluateHand(player.realm);
    if (bestRank > currentEval.rank) return bestAction;

    // Play multi-card sets even if rank doesn't improve
    const multiCardSets = setActions.filter(a => a.cards.length >= 2);
    if (multiCardSets.length > 0) return multiCardSets[0];

    // Play singles if realm < 3
    if (player.realm.length < 3) return bestAction;

    return null;
  }

  pickBestBuy(buyActions, state, playerIndex) {
    // Prefer cheapest payment options
    const sorted = buyActions.sort((a, b) =>
      a.payment.reduce((s, c) => s + c.purchaseValue, 0) -
      b.payment.reduce((s, c) => s + c.purchaseValue, 0)
    );

    // Only buy if we can afford it without losing key cards
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

    // Score each card by how much it contributes to potential hands
    const scores = hand.map((card, i) => {
      if (card.rank === 'ACE') return { index: i, score: 100 }; // Keep aces
      if (card.rank === 'KING') return { index: i, score: 90 }; // Keep kings

      // Check if card matches realm ranks
      const matchesRealm = realm.some(r => r.type === 'minor' && r.numericRank === card.numericRank);
      if (matchesRealm) return { index: i, score: 80 };

      return { index: i, score: card.numericRank || 0 };
    });

    scores.sort((a, b) => a.score - b.score);
    return scores.slice(0, numToDiscard).map(s => s.index).sort((a, b) => b - a);
  }

  shouldBlockWithAce(state, playerIndex, action) {
    // Only block if attack targets our realm
    if (action.type === 'PLAY_ROYAL' && action.target?.playerIndex === playerIndex) {
      return state.players[playerIndex].hand.some(c => c.type === 'minor' && c.rank === 'ACE');
    }
    return false;
  }

  shouldBlockWithKing(state, playerIndex, attackCard) {
    // Always block if we have a king
    return state.players[playerIndex].hand.some(c => c.type === 'minor' && c.rank === 'KING');
  }

  chooseMajorKeep(majorCards) {
    // Prefer bonus/tome cards over action cards
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
    let bestSuit = 'WANDS';
    let bestCount = 0;
    for (const [suit, count] of Object.entries(counts)) {
      if (count > bestCount) { bestCount = count; bestSuit = suit; }
    }
    return bestSuit;
  }
}
