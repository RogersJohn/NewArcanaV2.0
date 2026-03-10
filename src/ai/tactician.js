/**
 * TacticianAI: Round-timing specialist.
 * Strategic Judgement usage — plays it when it would win the pot.
 * Targets round-end marker holders to delay round ends.
 * Times realm-building to peak at round end.
 */

import { isCelestial } from '../cards.js';
import { RandomAI } from './base.js';
import { chooseActionByScore, TACTICIAN_WEIGHTS } from './personality.js';
import { aceBlockValue, checkCelestialThreat } from './awareness.js';
import { estimateCardValue } from './card-value.js';
import { getMajorDef } from '../effect-resolver.js';

export class TacticianAI extends RandomAI {
  constructor() {
    super();
    this.name = 'Tactician';
  }

  chooseAction(state, legalActions, playerIndex) {
    return chooseActionByScore(state, legalActions, playerIndex, TACTICIAN_WEIGHTS);
  }

  chooseDiscard(state, playerIndex, numToDiscard) {
    const hand = state.players[playerIndex].hand;
    const realm = state.players[playerIndex].realm;

    const scores = hand.map((card, i) => {
      if (card.type === 'major' && isCelestial(card)) return { index: i, score: 200 };
      if (card.type === 'major') return { index: i, score: 120 };
      if (card.rank === 'ACE') return { index: i, score: 150 };
      if (card.rank === 'KING') return { index: i, score: 100 };

      const matchRealm = realm.some(r => r.type === 'minor' && r.numericRank === card.numericRank);
      if (matchRealm) return { index: i, score: 90 };

      return { index: i, score: card.numericRank * 2 || 0 };
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
    return threat >= 35;
  }

  shouldBlockWithKing(state, playerIndex) {
    const realmSize = state.players[playerIndex].realm.length;
    return realmSize >= 3 && state.players[playerIndex].hand.some(c => c.type === 'minor' && c.rank === 'KING');
  }

  chooseMajorKeep(majorCards, state) {
    if (!state) return 0;
    const values = majorCards.map((card, i) => {
      let val = estimateCardValue(state, 0, card, 'keep');
      // Tactician personality: boost Judgement-like and celestial cards
      const eff = getMajorDef(state, card.number);
      if (eff?.effect?.action === 'CLAIM_ROUND_END_MARKER') val *= 2;
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
    let best = 'WANDS';
    let bestCount = 0;
    for (const [suit, count] of Object.entries(counts)) {
      if (count > bestCount) { bestCount = count; best = suit; }
    }
    return best;
  }
}
