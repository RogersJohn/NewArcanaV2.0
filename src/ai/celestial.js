/**
 * CelestialAI: Pursues the 3-Celestial win condition.
 * Buys any available Celestial aggressively.
 * Uses Chariot to steal Celestials.
 * Very protective of Tome.
 */

import { evaluateHand } from '../poker.js';
import { isCelestial } from '../cards.js';
import { RandomAI } from './base.js';
import { potUrgency, getHandRanking } from './awareness.js';
import { estimateCardValue } from './card-value.js';
import { getMajorDef } from '../effect-resolver.js';

export class CelestialAI extends RandomAI {
  constructor() {
    super();
    this.name = 'Celestial';
  }

  chooseAction(state, legalActions, playerIndex) {
    const player = state.players[playerIndex];
    const urgency = potUrgency(state);
    const ranking = getHandRanking(state, playerIndex);
    const myCelestials = [...player.tome, ...player.realm, ...player.vault]
      .filter(c => isCelestial(c)).length;

    // Priority 1: Play Celestials to Tome (always)
    const celestialTome = legalActions.filter(a =>
      a.type === 'PLAY_MAJOR_TOME' && a.card && isCelestial(a.card)
    );
    if (celestialTome.length > 0) return celestialTome[0];

    // Priority 2: Chariot to grab Celestial (especially if we have 2 already)
    const chariotActions = legalActions.filter(a => {
      if (a.type !== 'PLAY_MAJOR_ACTION' || !a.card) return false;
      const eff = getMajorDef(state, a.card.number);
      return eff?.effect?.action === 'MOVE_CELESTIAL_TO_TOME';
    });
    if (chariotActions.length > 0 && myCelestials >= 1) return chariotActions[0];

    // Priority 3: Build realm (VP insurance — must contest pots)
    const setActions = legalActions.filter(a => a.type === 'PLAY_SET');
    if (setActions.length > 0) {
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
      // Play singles to build up realm
      if (player.realm.length < 4) {
        const completions = setActions.filter(a => a.isCompletion);
        if (completions.length > 0) return completions[0];
        if (player.realm.length < 3) return setActions[0];
      }
    }

    // Priority 4: Buy Celestials from display
    const buyActions = legalActions.filter(a => a.type === 'BUY');
    const celestialBuys = buyActions.filter(a => {
      if (a.source.startsWith('display')) {
        const slot = parseInt(a.source.slice(-1));
        return state.display[slot] && isCelestial(state.display[slot]);
      }
      return false;
    });
    if (celestialBuys.length > 0) {
      celestialBuys.sort((a, b) =>
        a.payment.reduce((s, c) => s + c.purchaseValue, 0) -
        b.payment.reduce((s, c) => s + c.purchaseValue, 0)
      );
      return celestialBuys[0];
    }

    // Priority 5: Play other Tome cards (if we have realm cards)
    if (player.realm.length >= 2) {
      const otherTome = legalActions.filter(a => a.type === 'PLAY_MAJOR_TOME');
      if (otherTome.length > 0) return otherTome[0];
    }

    // Priority 6: Play wild if it strengthens our hand
    const wildActions = legalActions.filter(a => a.type === 'PLAY_WILD');
    if (wildActions.length > 0 && player.realm.length >= 2) {
      return wildActions[0];
    }

    // Priority 7: Buy non-Celestial Major Arcana only if realm is built and pot urgency is low
    if (buyActions.length > 0 && player.realm.length >= 3 && urgency < 1.0) {
      const noAceBuys = buyActions.filter(a => !a.payment.some(c => c.rank === 'ACE'));
      if (noAceBuys.length > 0) return noAceBuys[0];
    }

    // Priority 8: Play remaining singles
    if (setActions.length > 0 && player.realm.length < 5) {
      return setActions[0];
    }

    return legalActions.find(a => a.type === 'PASS') || legalActions[0];
  }

  chooseDiscard(state, playerIndex, numToDiscard) {
    const hand = state.players[playerIndex].hand;
    const scores = hand.map((card, i) => {
      if (card.type === 'major' && isCelestial(card)) return { index: i, score: 200 };
      if (card.type === 'major') return { index: i, score: 150 };
      if (card.rank === 'ACE') return { index: i, score: 100 };
      return { index: i, score: card.numericRank || 0 };
    });

    scores.sort((a, b) => a.score - b.score);
    return scores.slice(0, numToDiscard).map(s => s.index).sort((a, b) => b - a);
  }

  shouldBlockWithAce(state, playerIndex, action) {
    // Very protective - block any action targeting our tome
    if (action.type === 'PLAY_MAJOR_ACTION') {
      const targets = action.targets;
      if (targets && targets.playerIndex === playerIndex) return true;
      if (targets && targets.source === 'tome' && targets.playerIndex === playerIndex) return true;
    }
    // Block attacks on our realm
    if (action.type === 'PLAY_ROYAL' && action.target?.playerIndex === playerIndex) {
      return state.rng.next() < 0.7;
    }
    return false;
  }

  shouldBlockWithKing(state, playerIndex) {
    return state.players[playerIndex].hand.some(c => c.type === 'minor' && c.rank === 'KING');
  }

  chooseMajorKeep(majorCards, state) {
    if (!state) return 0;
    const values = majorCards.map((card, i) => {
      let val = estimateCardValue(state, 0, card, 'keep');
      if (isCelestial(card)) val *= 3; // Celestial personality: massive celestial preference
      return { i, score: val };
    });
    values.sort((a, b) => b.score - a.score);
    return values[0].i;
  }

  chooseTomeDiscard(state, playerIndex) {
    const tome = state.players[playerIndex].tome;
    // Never discard Celestials
    for (let i = 0; i < tome.length; i++) {
      if (!isCelestial(tome[i])) return i;
    }
    return tome.length - 1;
  }

  chooseMagicianSuit(state, playerIndex) {
    return 'CUPS';
  }
}
