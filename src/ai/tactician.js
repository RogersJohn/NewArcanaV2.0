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
import { estimateCardValue } from './card-value.js';
import { getMajorDef } from '../effect-resolver.js';

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

    // Priority 1: Strategic Judgement — play only when we would win the pot (config-aware)
    const judgementActions = legalActions.filter(a => {
      if (a.type !== 'PLAY_MAJOR_ACTION' || !a.card) return false;
      const eff = getMajorDef(state, a.card.number);
      return eff?.effect?.action === 'CLAIM_ROUND_END_MARKER';
    });
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

      // Use disruptive action cards against marker holder (config-aware)
      const markerActions = legalActions.filter(a => {
        if (a.type !== 'PLAY_MAJOR_ACTION' || !a.card) return false;
        const eff = getMajorDef(state, a.card.number);
        const act = eff?.effect?.action;
        return act === 'STEAL_FROM_TOME' || act === 'TOWER_DESTROY';
      });
      if (markerActions.length > 0) return markerActions[0];
    }

    // Priority 3: Wheel of Fortune when ahead or even (config-aware)
    const wheelActions = legalActions.filter(a => {
      if (a.type !== 'PLAY_MAJOR_ACTION' || !a.card) return false;
      const eff = getMajorDef(state, a.card.number);
      return eff?.effect?.action === 'WHEEL_OF_FORTUNE';
    });
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

    // Priority 7: Other action cards (config-aware scoring)
    const otherActions = legalActions.filter(a => a.type === 'PLAY_MAJOR_ACTION' && a.card);
    if (otherActions.length > 0) {
      const scored = otherActions.map(a => ({
        action: a,
        score: estimateCardValue(state, playerIndex, a.card, 'tome'),
      }));
      scored.sort((a, b) => b.score - a.score);
      if (scored[0].score > 8) return scored[0].action;
    }

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
    const myEval = evaluateHand(myRealm, { aceHigh: state.config?.gameRules?.aceHigh ?? false });

    for (let pi = 0; pi < state.players.length; pi++) {
      if (pi === playerIndex) continue;
      const opRealm = state.players[pi].realm;
      if (opRealm.length === 0) continue;
      const opEval = evaluateHand(opRealm, { aceHigh: state.config?.gameRules?.aceHigh ?? false });
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
        const eval_ = evaluateHand(newRealm, { aceHigh: state.config?.gameRules?.aceHigh ?? false });
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
    const noAce = buyActions.filter(a => !a.payment.some(c => c.rank === 'ACE'));
    let bestAction = null;
    let bestScore = 0;
    for (const action of noAce) {
      if (action.source.startsWith('display')) {
        const slot = parseInt(action.source.slice(-1));
        const card = state.display[slot];
        if (card) {
          let val = estimateCardValue(state, playerIndex, card, 'buy');
          // Tactician personality: boost Judgement-like cards
          const eff = getMajorDef(state, card.number);
          if (eff?.effect?.action === 'CLAIM_ROUND_END_MARKER') val *= 1.8;
          if (val > bestScore) { bestScore = val; bestAction = action; }
        }
      }
    }
    return bestAction || (noAce.length > 0 ? noAce[0] : null);
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
      if (action.card?.number === 20) return state.rng.next() < 0.4; // Block Judgement sometimes
      if (action.card?.number === 10) return state.rng.next() < 0.3; // Block Wheel sometimes
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