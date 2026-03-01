/**
 * TacticianAI: Round-timing specialist.
 * Strategic Judgement usage — plays it when it would win the pot.
 * Targets round-end marker holders to delay round ends.
 * Times realm-building to peak at round end.
 */

import { evaluateHand } from '../poker.js';
import { isCelestial } from '../cards.js';
import { RandomAI } from './base.js';
import { checkCelestialThreat, findCelestialDisruption } from './awareness.js';

export class TacticianAI extends RandomAI {
  constructor() {
    super();
    this.name = 'Tactician';
  }

  chooseAction(state, legalActions, playerIndex) {
    const player = state.players[playerIndex];

    // Priority 0: Celestial threat disruption
    const threat = checkCelestialThreat(state, playerIndex);
    if (threat.threatening) {
      const disruption = findCelestialDisruption(state, playerIndex, legalActions, threat.threatPlayer);
      if (disruption) return disruption;
    }

    // Priority 1: Strategic Judgement — play only when we would win the pot
    const judgementActions = legalActions.filter(a =>
      a.type === 'PLAY_MAJOR_ACTION' && a.card?.number === 20
    );
    if (judgementActions.length > 0 && this.wouldWinPot(state, playerIndex)) {
      return judgementActions[0];
    }

    // Priority 2: Attack marker holders to delay round end
    const markerHolder = state.roundEndMarkerHolder;
    if (markerHolder >= 0 && markerHolder !== playerIndex) {
      const markerAttacks = legalActions.filter(a =>
        a.type === 'PLAY_ROYAL' && a.target?.playerIndex === markerHolder
      );
      if (markerAttacks.length > 0) return markerAttacks[0];

      // Use action cards against marker holder
      const markerActions = legalActions.filter(a =>
        a.type === 'PLAY_MAJOR_ACTION' && a.card &&
        [12, 16].includes(a.card.number)
      );
      if (markerActions.length > 0) return markerActions[0];
    }

    // Priority 3: Wheel of Fortune when ahead or even
    const wheelActions = legalActions.filter(a =>
      a.type === 'PLAY_MAJOR_ACTION' && a.card?.number === 10
    );
    if (wheelActions.length > 0) {
      const myVp = player.vp;
      const avgOpVp = state.players
        .filter((_, i) => i !== playerIndex)
        .reduce((s, p) => s + p.vp, 0) / (state.players.length - 1);
      if (myVp >= avgOpVp) return wheelActions[0];
    }

    // Priority 4: Play sets strategically — larger sets preferred near round end
    const setActions = legalActions.filter(a => a.type === 'PLAY_SET');
    if (setActions.length > 0) {
      const best = this.pickTimedSet(setActions, player, state);
      if (best) return best;
    }

    // Priority 5: Play tome cards
    const tomeActions = legalActions.filter(a => a.type === 'PLAY_MAJOR_TOME');
    if (tomeActions.length > 0) {
      // Prefer celestials, then bonus, then tome
      const celestialTome = tomeActions.filter(a => a.card && isCelestial(a.card));
      if (celestialTome.length > 0) return celestialTome[0];
      return tomeActions[0];
    }

    // Priority 6: Buy cards strategically
    const buyActions = legalActions.filter(a => a.type === 'BUY');
    if (buyActions.length > 0) {
      const goodBuy = this.pickTacticalBuy(buyActions, state, playerIndex);
      if (goodBuy) return goodBuy;
    }

    // Priority 7: Other action cards (Chariot, Strength, Hanged Man)
    const otherActions = legalActions.filter(a =>
      a.type === 'PLAY_MAJOR_ACTION' && a.card &&
      [7, 8, 12].includes(a.card.number)
    );
    if (otherActions.length > 0) return otherActions[0];

    // Priority 8: Play wild if it improves hand
    const wildActions = legalActions.filter(a => a.type === 'PLAY_WILD');
    if (wildActions.length > 0 && player.realm.length >= 2) {
      return wildActions[0];
    }

    return legalActions.find(a => a.type === 'PASS') || legalActions[0];
  }

  wouldWinPot(state, playerIndex) {
    const myRealm = state.players[playerIndex].realm;
    if (myRealm.length === 0) return false;
    const myEval = evaluateHand(myRealm);

    for (let pi = 0; pi < state.players.length; pi++) {
      if (pi === playerIndex) continue;
      const opRealm = state.players[pi].realm;
      if (opRealm.length === 0) continue;
      const opEval = evaluateHand(opRealm);
      if (opEval.rank >= myEval.rank) return false;
    }
    return true;
  }

  pickTimedSet(setActions, player, state) {
    // Near round end (someone has marker or close to 5 cards), play biggest sets
    const someoneClose = state.players.some(p => p.realm.length >= 4);
    const hasMarker = state.roundEndMarkerHolder >= 0;

    if (someoneClose || hasMarker) {
      // Play the best hand-improving set
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
      return bestAction;
    }

    // Early game: build incrementally
    const multiSets = setActions.filter(a => a.cards.length >= 2);
    if (multiSets.length > 0) return multiSets[multiSets.length - 1];

    if (player.realm.length < 3) {
      return setActions[0];
    }

    return null;
  }

  pickTacticalBuy(buyActions, state, playerIndex) {
    // Prefer Judgement if we don't have one
    for (const action of buyActions) {
      if (action.source.startsWith('display')) {
        const slot = parseInt(action.source.slice(-1));
        const card = state.display[slot];
        if (card && card.number === 20 && !action.payment.some(c => c.rank === 'ACE')) {
          return action;
        }
      }
    }

    // Prefer celestials and action cards
    const sorted = buyActions.filter(a => !a.payment.some(c => c.rank === 'ACE'));
    for (const action of sorted) {
      if (action.source.startsWith('display')) {
        const slot = parseInt(action.source.slice(-1));
        const card = state.display[slot];
        if (card && (isCelestial(card) || card.category === 'action' || card.category === 'tome')) {
          return action;
        }
      }
    }

    return sorted.length > 0 ? sorted[0] : null;
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
    // Block Celestials being played to Tome by threat players
    if (action.type === 'PLAY_MAJOR_TOME' && action.card && isCelestial(action.card)) {
      const threat = checkCelestialThreat(state, playerIndex);
      if (threat.threatening) return true;
    }
    // Block Judgement and Wheel that target us or change scoring
    if (action.type === 'PLAY_MAJOR_ACTION') {
      if (action.card?.number === 20) return Math.random() < 0.4; // Block Judgement sometimes
      if (action.card?.number === 10) return Math.random() < 0.3; // Block Wheel sometimes
    }
    // Block attacks on our realm when we have good hands
    if (action.type === 'PLAY_ROYAL' && action.target?.playerIndex === playerIndex) {
      const realmSize = state.players[playerIndex].realm.length;
      return realmSize >= 3;
    }
    return false;
  }

  shouldBlockWithKing(state, playerIndex) {
    const realmSize = state.players[playerIndex].realm.length;
    return realmSize >= 3 && state.players[playerIndex].hand.some(c => c.type === 'minor' && c.rank === 'KING');
  }

  chooseMajorKeep(majorCards) {
    // Prefer Judgement
    for (let i = 0; i < majorCards.length; i++) {
      if (majorCards[i].number === 20) return i;
    }
    // Prefer action/celestial
    for (let i = 0; i < majorCards.length; i++) {
      if (isCelestial(majorCards[i])) return i;
    }
    for (let i = 0; i < majorCards.length; i++) {
      if (majorCards[i].category === 'action') return i;
    }
    return 0;
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