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
import { checkCelestialThreat, findCelestialDisruption } from './awareness.js';

export class ControllerAI extends RandomAI {
  constructor() {
    super();
    this.name = 'Controller';
  }

  chooseAction(state, legalActions, playerIndex) {
    const player = state.players[playerIndex];

    // Celestial threat check
    const threat = checkCelestialThreat(state, playerIndex);
    if (threat.threatening) {
      const disruption = findCelestialDisruption(state, playerIndex, legalActions, threat.threatPlayer);
      if (disruption) return disruption;
    }

    // Priority 1: Play protection cards to Tome
    const protectionTome = legalActions.filter(a =>
      a.type === 'PLAY_MAJOR_TOME' && a.card &&
      [14, 22, 23, 25].includes(a.card.number)
    );
    if (protectionTome.length > 0) return protectionTome[0];

    // Priority 2: Play Devil to Tome for hand size
    const devilTome = legalActions.filter(a =>
      a.type === 'PLAY_MAJOR_TOME' && a.card?.number === 15
    );
    if (devilTome.length > 0) return devilTome[0];

    // Priority 3: Play other Tome cards
    const tomeActions = legalActions.filter(a => a.type === 'PLAY_MAJOR_TOME');
    if (tomeActions.length > 0) return tomeActions[0];

    // Priority 4: Build consistent sets (prefer pairs/trips)
    const setActions = legalActions.filter(a => a.type === 'PLAY_SET');
    if (setActions.length > 0) {
      const best = this.pickConsistentSet(setActions, player);
      if (best) return best;
    }

    // Priority 5: Buy protection/Devil cards
    const buyActions = legalActions.filter(a => a.type === 'BUY');
    if (buyActions.length > 0) {
      const protectionBuy = this.pickProtectionBuy(buyActions, state);
      if (protectionBuy) return protectionBuy;
    }

    // Priority 6: Buy anything affordable
    if (buyActions.length > 0) {
      const cheap = buyActions.filter(a =>
        a.payment.reduce((s, c) => s + c.purchaseValue, 0) <= 10 &&
        !a.payment.some(c => c.rank === 'ACE')
      );
      if (cheap.length > 0) return cheap[0];
    }

    return legalActions.find(a => a.type === 'PASS') || legalActions[0];
  }

  pickConsistentSet(setActions, player) {
    // Prefer multi-card sets
    const multiSets = setActions.filter(a => a.cards.length >= 2);
    if (multiSets.length > 0) {
      // Pick set that creates the best hand
      let best = null;
      let bestRank = -1;
      for (const action of multiSets) {
        const newRealm = [...player.realm, ...action.cards];
        const eval_ = evaluateHand(newRealm);
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

    // Play singles if realm < 4
    if (player.realm.length < 4) {
      return setActions[0];
    }

    return null;
  }

  pickProtectionBuy(buyActions, state) {
    for (const action of buyActions) {
      if (action.source.startsWith('display')) {
        const slot = parseInt(action.source.slice(-1));
        const card = state.display[slot];
        if (card && [14, 15, 22, 23, 25].includes(card.number)) {
          // Don't spend Aces on buying
          if (!action.payment.some(c => c.rank === 'ACE')) {
            return action;
          }
        }
      }
    }
    return null;
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
    // Block Celestials being played to Tome by threat players
    if (action.type === 'PLAY_MAJOR_TOME' && action.card && isCelestial(action.card)) {
      const threat = checkCelestialThreat(state, playerIndex);
      if (threat.threatening) return true;
    }
    // Block attacks targeting us
    if (action.type === 'PLAY_ROYAL' && action.target?.playerIndex === playerIndex) {
      // Only block if we have 2+ aces (keep one in reserve)
      const aceCount = state.players[playerIndex].hand.filter(
        c => c.type === 'minor' && c.rank === 'ACE'
      ).length;
      return aceCount >= 2;
    }
    // Block wild card plays (they're dangerous)
    if (action.type === 'PLAY_WILD') return state.rng.next() < 0.3;
    return false;
  }

  shouldBlockWithKing(state, playerIndex) {
    return state.players[playerIndex].hand.some(c => c.type === 'minor' && c.rank === 'KING');
  }

  chooseMajorKeep(majorCards) {
    // Prefer protection/Devil
    for (let i = 0; i < majorCards.length; i++) {
      if ([14, 15, 22, 23, 25].includes(majorCards[i].number)) return i;
    }
    // Prefer bonus cards
    for (let i = 0; i < majorCards.length; i++) {
      if (majorCards[i].category === 'bonus-round') return i;
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
