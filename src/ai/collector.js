/**
 * CollectorAI: Major Arcana hoarder.
 * Wheel of Fortune is top priority action card.
 * Bonus-aware Tome evaluation — buys cards that synergize with existing Tome.
 * Aggressively buys from display, prefers cheap purchases.
 */

import { isCelestial } from '../cards.js';
import { RandomAI } from './base.js';
import { chooseActionByScore, COLLECTOR_WEIGHTS, createLearnableWeights } from './personality.js';
import { checkCelestialThreat } from './awareness.js';
import { estimateCardValue } from './card-value.js';
import { getMajorDef } from '../effect-resolver.js';

export class CollectorAI extends RandomAI {
  constructor({ learning = false } = {}) {
    super();
    this.name = 'Collector';

    if (learning) {
      const { weights, learn } = createLearnableWeights(COLLECTOR_WEIGHTS);
      this._weights = weights;
      this._learn = learn;
    } else {
      this._weights = COLLECTOR_WEIGHTS;
      this._learn = null;
    }
  }

  chooseAction(state, legalActions, playerIndex) {
    return chooseActionByScore(state, legalActions, playerIndex, this._weights);
  }

  learn(gameResult, myIndex, state) {
    if (this._learn) this._learn(gameResult, myIndex, state);
  }

  chooseDiscard(state, playerIndex, numToDiscard) {
    const hand = state.players[playerIndex].hand;
    const realm = state.players[playerIndex].realm;

    const scores = hand.map((card, i) => {
      if (card.type === 'major' && isCelestial(card)) return { index: i, score: 200 };
      if (card.type === 'major' && card.keywords?.includes('jester')) return { index: i, score: 140 };
      if (card.type === 'major') return { index: i, score: 130 }; // Collector values all majors highly
      if (card.rank === 'ACE') return { index: i, score: 140 };
      if (card.rank === 'KING') return { index: i, score: 90 };

      const matchRealm = realm.some(r => r.type === 'minor' && r.numericRank === card.numericRank);
      if (matchRealm) return { index: i, score: 80 };

      // Cards that form pairs/triples with other hand cards are valuable
      const handMatches = hand.filter(h =>
        h.type === 'minor' && h.numericRank === card.numericRank && h.id !== card.id
      ).length;
      if (handMatches >= 2) return { index: i, score: 95 }; // Part of a triple
      if (handMatches >= 1) return { index: i, score: 75 }; // Part of a pair

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
