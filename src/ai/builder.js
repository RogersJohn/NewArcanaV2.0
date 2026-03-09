/**
 * BuilderAI: Focuses on building strong poker hands in Realm.
 * Evaluates which hand in current cards would score highest.
 * Buys Tome bonus cards matching suit distribution.
 * Holds aces for defense, uses Kings defensively.
 * Never attacks unless significantly behind.
 */

import { evaluateHand } from '../poker.js';
import { isCelestial } from '../cards.js';
import { RandomAI } from './base.js';
import { getHandRanking, checkCelestialThreat, findCelestialDisruption } from './awareness.js';
import { estimateCardValue } from './card-value.js';

export class BuilderAI extends RandomAI {
  constructor() {
    super();
    this.name = 'Builder';
  }

  chooseAction(state, legalActions, playerIndex) {
    const player = state.players[playerIndex];
    const ranking = getHandRanking(state, playerIndex);

    // Celestial threat check
    const threat = checkCelestialThreat(state, playerIndex);
    if (threat.threatening) {
      const disruption = findCelestialDisruption(state, playerIndex, legalActions, threat.threatPlayer);
      if (disruption) return disruption;
    }

    // Priority 1: Play best set to realm
    const setActions = legalActions.filter(a => a.type === 'PLAY_SET');
    if (setActions.length > 0) {
      const best = this.pickBestSet(setActions, player, state);
      if (best) return best;
    }

    // Priority 2: Attack when another player is beating our hand
    if (!ranking.winning && player.realm.length >= 3) {
      const royalActions = legalActions.filter(a => a.type === 'PLAY_ROYAL');
      // Target only players beating us
      const defensiveAttacks = royalActions.filter(a =>
        ranking.beatenBy.includes(a.target?.playerIndex)
      );
      if (defensiveAttacks.length > 0) {
        // Prefer Queens (get the card to our realm)
        const queens = defensiveAttacks.filter(a => a.card.rank === 'QUEEN');
        if (queens.length > 0) return queens[0];
        return defensiveAttacks[0];
      }
    }

    // Priority 3: Play wild if it significantly improves hand
    const wildActions = legalActions.filter(a => a.type === 'PLAY_WILD');
    if (wildActions.length > 0 && player.realm.length >= 2) {
      return wildActions[0];
    }

    // Priority 4: Buy bonus/tome cards
    const buyActions = legalActions.filter(a => a.type === 'BUY');
    if (buyActions.length > 0) {
      const goodBuy = this.pickBestBuy(buyActions, state, playerIndex);
      if (goodBuy) return goodBuy;
    }

    // Priority 5: Play tome cards
    const tomeActions = legalActions.filter(a => a.type === 'PLAY_MAJOR_TOME');
    if (tomeActions.length > 0) {
      return tomeActions[0];
    }

    return legalActions.find(a => a.type === 'PASS') || legalActions[0];
  }

  pickBestSet(setActions, player, state) {
    let bestAction = null;
    let bestRank = -1;

    for (const action of setActions) {
      // Evaluate what realm would look like after playing this set
      const newRealm = [...player.realm, ...action.cards];
      const eval_ = evaluateHand(newRealm, { aceHigh: state.config?.gameRules?.aceHigh ?? false });
      if (eval_.rank > bestRank) {
        bestRank = eval_.rank;
        bestAction = action;
      }
    }

    // Only play if it improves from current
    const currentEval = evaluateHand(player.realm, { aceHigh: state.config?.gameRules?.aceHigh ?? false });
    if (bestRank > currentEval.rank) return bestAction;

    // Play multi-card sets even if rank doesn't improve
    const multiCardSets = setActions.filter(a => a.cards.length >= 2);
    if (multiCardSets.length > 0) return multiCardSets[0];

    // Play singles if realm < 3
    if (player.realm.length < 3) return bestAction;

    return null;
  }

  pickBestBuy(buyActions, state, playerIndex) {
    let bestAction = null;
    let bestNetValue = -Infinity;

    for (const action of buyActions) {
      const paymentHasAce = action.payment.some(c => c.rank === 'ACE');
      const paymentHasKing = action.payment.some(c => c.rank === 'KING');
      if (paymentHasAce) continue; // Never spend Aces

      let cardValue = 5; // base value for blind draw
      if (action.source.startsWith('display')) {
        const slot = parseInt(action.source.slice(-1));
        const card = state.display[slot];
        if (card) {
          cardValue = estimateCardValue(state, playerIndex, card, 'buy');
          // Builder boost for bonus cards matching our realm
          if (card.category === 'bonus-round' || card.category === 'tome') cardValue *= 1.3;
        }
      }

      const paymentCost = action.payment.reduce((s, c) => s + c.purchaseValue, 0) * 0.4;
      const kingPenalty = paymentHasKing ? 3 : 0;
      const netValue = cardValue - paymentCost - kingPenalty;

      if (netValue > bestNetValue) {
        bestNetValue = netValue;
        bestAction = action;
      }
    }

    return bestNetValue > 2 ? bestAction : null; // Only buy if net-positive
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
    // Block Celestials being played to Tome by threat players
    if (action.type === 'PLAY_MAJOR_TOME' && action.card && isCelestial(action.card)) {
      const threat = checkCelestialThreat(state, playerIndex);
      if (threat.threatening) return true;
    }
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

  chooseMajorKeep(majorCards, state) {
    if (!state) return 0;
    // Use config-aware valuation, prefer bonus/tome (builder personality)
    const values = majorCards.map((card, i) => {
      let val = estimateCardValue(state, 0, card, 'keep');
      if (card.category === 'bonus-round' || card.category === 'tome') val *= 1.3;
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
    let bestSuit = 'WANDS';
    let bestCount = 0;
    for (const [suit, count] of Object.entries(counts)) {
      if (count > bestCount) { bestCount = count; bestSuit = suit; }
    }
    return bestSuit;
  }
}
