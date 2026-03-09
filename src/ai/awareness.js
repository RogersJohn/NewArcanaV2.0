/**
 * Shared awareness utilities for AI decision-making.
 */

import { isCelestial } from '../cards.js';
import { evaluateHand, compareHands } from '../poker.js';
import { getCardEffect } from '../effect-resolver.js';

/**
 * Check if any opponent is close to a Celestial win.
 * @param {object} state
 * @param {number} playerIndex - The AI making the decision
 * @returns {{threatening: boolean, threatPlayer: number, celestialCount: number}}
 */
export function checkCelestialThreat(state, playerIndex) {
  let maxCelestials = 0;
  let threatPlayer = -1;

  for (let pi = 0; pi < state.players.length; pi++) {
    if (pi === playerIndex) continue;
    const p = state.players[pi];
    const celestials = [...p.tome, ...p.realm, ...p.vault].filter(c => isCelestial(c));
    if (celestials.length > maxCelestials) {
      maxCelestials = celestials.length;
      threatPlayer = pi;
    }
  }

  return {
    threatening: maxCelestials >= 2,
    threatPlayer,
    celestialCount: maxCelestials,
  };
}

/**
 * Find actions that disrupt Celestial accumulation.
 * @param {object} state
 * @param {number} playerIndex
 * @param {object[]} legalActions
 * @param {number} threatPlayer
 * @returns {object|null} Best disruption action, or null
 */
export function findCelestialDisruption(state, playerIndex, legalActions, threatPlayer) {
  // Helper to get action effect type
  function getActionType(card) {
    const eff = getCardEffect(state, card);
    return eff?.action || null;
  }

  // Priority 1: Steal from Tome targeting a Celestial in threat player's Tome
  const stealActions = legalActions.filter(a => {
    if (a.type !== 'PLAY_MAJOR_ACTION' || !a.card) return false;
    if (getActionType(a.card) !== 'STEAL_FROM_TOME') return false;
    return a.targets?.playerIndex === threatPlayer &&
      state.players[threatPlayer].tome[a.targets.cardIndex] &&
      isCelestial(state.players[threatPlayer].tome[a.targets.cardIndex]);
  });
  if (stealActions.length > 0) return stealActions[0];

  // Priority 2: Tower (destroys cards in larger Tomes)
  const towerActions = legalActions.filter(a =>
    a.type === 'PLAY_MAJOR_ACTION' && a.card && getActionType(a.card) === 'TOWER_DESTROY'
  );
  if (towerActions.length > 0) return towerActions[0];

  // Priority 3: Move Major to Realm targeting threat player
  const strengthActions = legalActions.filter(a =>
    a.type === 'PLAY_MAJOR_ACTION' && a.card &&
    getActionType(a.card) === 'MOVE_MAJOR_TO_REALM' &&
    a.targets?.playerIndex === threatPlayer
  );
  if (strengthActions.length > 0) return strengthActions[0];

  // Priority 4: Royal attack on Celestial in threat player's Realm
  const royalAttacks = legalActions.filter(a =>
    a.type === 'PLAY_ROYAL' &&
    a.target?.playerIndex === threatPlayer
  );
  for (const attack of royalAttacks) {
    const targetCard = state.players[threatPlayer].realm[attack.target.realmIndex];
    if (targetCard && targetCard.type === 'major') return attack;
  }

  // Priority 5: Chariot to steal a Celestial for ourselves
  const chariotActions = legalActions.filter(a =>
    a.type === 'PLAY_MAJOR_ACTION' && a.card && getActionType(a.card) === 'MOVE_CELESTIAL_TO_TOME'
  );
  if (chariotActions.length > 0) return chariotActions[0];

  return null;
}

/**
 * How urgent is contesting the current pot?
 * Returns 0.0-2.0 (0 = trivial pot, 1.0 = normal, 2.0 = critical pot).
 */
export function potUrgency(state) {
  const numPlayers = state.players.length;
  // Expected first-round pot is numPlayers VP
  const basePot = numPlayers;
  const ratio = state.pot / Math.max(basePot, 1);
  // Clamp to 0.2 - 2.0
  return Math.max(0.2, Math.min(2.0, ratio));
}

/**
 * Evaluate player's realm hand relative to opponents.
 * @returns {{ rank: number, winning: boolean, margin: number, beatenBy: number[] }}
 *   rank: poker hand rank (-1 if empty)
 *   winning: true if currently best hand
 *   margin: rank difference over second-best (0 if losing)
 *   beatenBy: array of playerIndex values that beat this hand
 */
export function getHandRanking(state, playerIndex) {
  const opts = { aceHigh: state.config?.gameRules?.aceHigh ?? false };
  const myRealm = state.players[playerIndex].realm;
  const myEval = evaluateHand(myRealm, opts);

  let winning = true;
  let bestOpponentRank = -1;
  const beatenBy = [];

  for (let pi = 0; pi < state.players.length; pi++) {
    if (pi === playerIndex) continue;
    const opRealm = state.players[pi].realm;
    if (opRealm.length === 0) continue;
    const opEval = evaluateHand(opRealm, opts);
    if (compareHands(opEval, myEval) > 0) {
      winning = false;
      beatenBy.push(pi);
    }
    if (opEval.rank > bestOpponentRank) bestOpponentRank = opEval.rank;
  }

  const margin = winning ? (myEval.rank - bestOpponentRank) : 0;
  return { rank: myEval.rank, winning, margin, beatenBy };
}

/**
 * Score how threatening an action is (0-100). Higher = more worth blocking.
 * @param {object} state
 * @param {number} playerIndex - The player considering blocking
 * @param {object} action - The action being performed
 * @returns {number} Threat score 0-100
 */
export function aceBlockValue(state, playerIndex, action) {
  const player = state.players[playerIndex];
  const urgency = potUrgency(state);

  // Actions targeting our realm
  if (action.type === 'PLAY_ROYAL' && action.target?.playerIndex === playerIndex) {
    const realmSize = player.realm.length;
    const ranking = getHandRanking(state, playerIndex);
    // More cards in realm = more to lose. Winning hand = critical to protect.
    let score = realmSize * 12;
    if (ranking.winning) score += 25;
    // Queen attacks are worst (card goes to opponent's realm)
    if (action.card?.rank === 'QUEEN') score += 15;
    // Knight attacks steal to hand (moderate threat)
    else if (action.card?.rank === 'KNIGHT') score += 8;
    return Math.min(100, score * urgency);
  }

  // Wild card plays (opponent strengthens their realm significantly)
  if (action.type === 'PLAY_WILD') {
    const actorPi = action.playerIndex;
    const actorRealm = (actorPi != null && state.players[actorPi]?.realm) || [];
    const newSize = actorRealm.length + 1 + (action.withCards?.length || 0);
    // Threatening if it gives them 4-5 cards
    if (newSize >= 5) return 50 * urgency;
    if (newSize >= 4) return 30 * urgency;
    return 10;
  }

  // Major Arcana being played to Tome
  if (action.type === 'PLAY_MAJOR_TOME') {
    if (action.card && isCelestial(action.card)) {
      // Check if this gives them 2+ celestials
      const actorPi = action.playerIndex;
      if (actorPi != null && state.players[actorPi]) {
        const actorCelestials = [...state.players[actorPi].tome,
          ...state.players[actorPi].realm]
          .filter(c => isCelestial(c)).length;
        if (actorCelestials >= 2) return 95; // Could enable celestial win
        if (actorCelestials >= 1) return 55;
      }
      return 25;
    }
    return 10; // Non-celestial Tome plays are low threat
  }

  // Major Arcana action cards
  if (action.type === 'PLAY_MAJOR_ACTION') {
    // Judgement when we're winning the pot — very threatening
    if (action.description?.includes('Judgement') || action.description?.includes('Round-End')) {
      const ranking = getHandRanking(state, playerIndex);
      if (!ranking.winning && player.realm.length > 0) return 15; // We're losing, let it resolve
      return 40 * urgency; // We're winning, block it
    }
    // Wheel of Fortune — moderate (card advantage)
    if (action.description?.includes('Wheel')) return 20;
    // Tower/Hanged Man targeting us
    return 15;
  }

  // King block being blocked — if someone is blocking our attack
  if (action.type === 'KING_BLOCK') return 30;

  return 5; // Default low
}

/**
 * Analyze hand for developing multi-card set potential.
 * Returns a score indicating how much the hand would benefit from waiting.
 * Higher score = better to hold cards than play singles.
 *
 * @param {object[]} hand - Player's hand (minor cards only for analysis)
 * @param {object[]} realm - Player's current realm
 * @returns {{ holdScore: number, bestDevelopingSet: number, hasPairForming: boolean }}
 */
export function analyzeHandPotential(hand, realm) {
  const minors = hand.filter(c => c.type === 'minor');

  // Count rank groups
  const rankGroups = {};
  for (const c of minors) {
    rankGroups[c.numericRank] = (rankGroups[c.numericRank] || 0) + 1;
  }
  const maxRankGroup = Math.max(0, ...Object.values(rankGroups));
  const pairsForming = Object.values(rankGroups).filter(c => c >= 2).length;

  // Count suit groups (for flush potential)
  const suitGroups = {};
  for (const c of minors) {
    suitGroups[c.suit] = (suitGroups[c.suit] || 0) + 1;
  }
  const maxSuitGroup = Math.max(0, ...Object.values(suitGroups));

  // Count straight potential (3+ sequential cards)
  const ranks = [...new Set(minors.map(c => c.numericRank))].sort((a, b) => a - b);
  let maxRun = 1, currentRun = 1;
  for (let i = 1; i < ranks.length; i++) {
    if (ranks[i] === ranks[i-1] + 1) { currentRun++; maxRun = Math.max(maxRun, currentRun); }
    else currentRun = 1;
  }

  let holdScore = 0;

  // Pair/triple/quad potential
  if (maxRankGroup >= 3) holdScore += 40;      // Triple forming — very strong hold
  else if (maxRankGroup >= 2) holdScore += 25;  // Pair forming — solid hold

  // Multiple pairs developing (could become two-pair or full house across turns)
  if (pairsForming >= 2) holdScore += 15;

  // Flush potential (need 5 of same suit)
  if (maxSuitGroup >= 4) holdScore += 35;       // One card away from flush
  else if (maxSuitGroup >= 3) holdScore += 10;  // Building toward flush

  // Straight potential
  if (maxRun >= 4) holdScore += 30;             // One card away from straight
  else if (maxRun >= 3) holdScore += 10;        // Building toward straight

  // Reduce hold incentive if realm is already large (need to finish)
  if (realm.length >= 3) holdScore *= 0.5;      // Urgency to complete realm
  if (realm.length >= 4) holdScore *= 0.2;      // Very urgent — play anything

  return {
    holdScore,
    bestDevelopingSet: maxRankGroup,
    hasPairForming: maxRankGroup >= 2,
  };
}
