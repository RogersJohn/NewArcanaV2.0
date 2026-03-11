/**
 * Unified action scoring with personality weights.
 *
 * Every AI uses this function. Personality comes from the weights object.
 * Returns scores for all legal actions, with optional noise for human-like variance.
 */

import { evaluateHand } from '../poker.js';
import { isCelestial } from '../cards.js';
import { analyzeHandPotential, vpUrgency, checkCelestialThreat, getHandRanking } from './awareness.js';
import { estimateCardValue } from './card-value.js';
import { getMajorDef } from '../effect-resolver.js';

/**
 * Default weight profile. Each AI overrides specific weights.
 * Weights are multipliers applied to base scores.
 */
export const DEFAULT_WEIGHTS = {
  // Core action type multipliers
  setMulti: 1.0,       // Multi-card sets (pairs, triples, etc.)
  setSingle: 0.2,      // Single card plays
  setCompletion: 0.8,  // Completing/repairing an existing set
  wild: 0.5,           // Wild card plays — last resort, not primary strategy
  attack: 0.3,         // Royal attacks
  buy: 0.6,            // Buying Major Arcana — helps deplete Major deck
  tome: 0.4,           // Playing to Tome
  tomecelestial: 1.5,  // Playing Celestials to Tome (always high)
  action: 0.5,         // Major Arcana action plays
  pass: 0.0,           // Base PASS score (before hand potential)

  // Behavioral modifiers
  rushWhenAhead: true,    // Boost realm-building when VP leader
  celestialAware: true,   // React to celestial threats
  noise: 0.1,             // Random variance (0 = deterministic, 0.2 = moderate noise)

  // Thresholds
  aceBlockThreshold: 35,  // Minimum threat score to block with Ace
  kingBlockMinRealm: 3,   // Minimum realm size to block with King
};

// --- Personality Weight Profiles ---

export const PASSIVE_WEIGHTS = {
  ...DEFAULT_WEIGHTS,
  setMulti: 1.3,
  attack: 0.0,
  buy: 0.4,
  tome: 0.3,
  noise: 0.05,
  aceBlockThreshold: 55,
};

export const BUILDER_WEIGHTS = {
  ...DEFAULT_WEIGHTS,
  setMulti: 1.4,
  setSingle: 0.1,
  wild: 0.5,
  buy: 0.5,
  attack: 0.15,
  noise: 0.08,
};

export const AGGRESSOR_WEIGHTS = {
  ...DEFAULT_WEIGHTS,
  setMulti: 0.9,
  buy: 0.5,
  attack: 0.7,
  action: 0.8,
  noise: 0.15,
};

export const CELESTIAL_WEIGHTS = {
  ...DEFAULT_WEIGHTS,
  setMulti: 0.9,
  tomecelestial: 2.5,
  buy: 0.8,
  tome: 0.6,
  noise: 0.1,
};

export const CONTROLLER_WEIGHTS = {
  ...DEFAULT_WEIGHTS,
  setMulti: 1.1,
  buy: 0.5,
  attack: 0.2,
  tome: 0.5,
  noise: 0.08,
  aceBlockThreshold: 25,
  kingBlockMinRealm: 2,
};

export const COLLECTOR_WEIGHTS = {
  ...DEFAULT_WEIGHTS,
  setMulti: 1.0,
  buy: 0.9,
  tome: 0.6,
  action: 0.7,
  noise: 0.12,
};

export const TACTICIAN_WEIGHTS = {
  ...DEFAULT_WEIGHTS,
  setMulti: 1.1,
  buy: 0.5,
  action: 0.9,
  attack: 0.3,
  noise: 0.1,
};

export const OPPORTUNIST_WEIGHTS = {
  ...DEFAULT_WEIGHTS,
  setMulti: 1.1,
  attack: 0.35,
  tome: 0.45,
  action: 0.6,
  noise: 0.08,
  rushWhenAhead: true,
};

export const SCORING_WEIGHTS = {
  ...DEFAULT_WEIGHTS,
  setMulti: 1.2,
  setSingle: 0.15,
  buy: 0.5,
  tome: 0.35,
  noise: 0.05,
  rushWhenAhead: true,
};

/**
 * Score a single action using personality weights.
 *
 * @param {object} state - Game state
 * @param {number} playerIndex - Active player
 * @param {object} action - Legal action to evaluate
 * @param {object} weights - Personality weight profile
 * @returns {number} Score (higher = better)
 */
export function scoreAction(state, playerIndex, action, weights) {
  const player = state.players[playerIndex];
  const opts = { aceHigh: state.config?.gameRules?.aceHigh ?? false };
  const rush = weights.rushWhenAhead ? vpUrgency(state, playerIndex) : 1.0;

  switch (action.type) {
    case 'PASS': {
      const potential = analyzeHandPotential(player.hand, player.realm);
      // PASS is only good when hand has developing potential
      // Base of 2 means PASS almost never wins over a real action
      return (weights.pass + potential.holdScore * 0.3) * rush;
    }

    case 'PLAY_SET': {
      const currentEval = evaluateHand(player.realm, opts);
      const newRealm = [...player.realm, ...action.cards];
      const newEval = evaluateHand(newRealm, opts);
      const handImprovement = (newEval.rank - currentEval.rank) * 8;
      const closingRealm = newRealm.length >= 5 ? 25 : newRealm.length >= 4 ? 10 : 0;

      let baseScore;
      if (action.cards.length >= 3) {
        baseScore = 35 + handImprovement + closingRealm;
      } else if (action.cards.length === 2) {
        baseScore = 25 + handImprovement + closingRealm;
      } else if (action.isCompletion) {
        baseScore = 15 + handImprovement + closingRealm;
        return baseScore * weights.setCompletion * rush;
      } else {
        // Single card — low base but not impossible
        baseScore = 5 + closingRealm;
        return baseScore * weights.setSingle * rush;
      }

      return baseScore * weights.setMulti * rush;
    }

    case 'PLAY_WILD': {
      const currentEval = evaluateHand(player.realm, opts);
      const newRealm = [...player.realm, action.card, ...(action.withCards || [])];
      const newEval = evaluateHand(newRealm, opts);
      const improvement = (newEval.rank - currentEval.rank) * 8;
      const companions = (action.withCards || []).length;
      const closingRealm = newRealm.length >= 5 ? 25 : newRealm.length >= 4 ? 10 : 0;

      // Only attractive when it fills realm to 5 or hand has no minor pairs
      let baseScore = 10 + improvement + companions * 3 + closingRealm;

      // Penalize wild if player has a playable pair in hand (pairs are better)
      const minors = player.hand.filter(c => c.type === 'minor');
      const rankGroups = {};
      for (const c of minors) rankGroups[c.numericRank] = (rankGroups[c.numericRank] || 0) + 1;
      const hasPair = Object.values(rankGroups).some(v => v >= 2);
      if (hasPair && newRealm.length < 5) {
        baseScore *= 0.3; // Heavily penalize wild when a pair is available
      }

      return baseScore * weights.wild * rush;
    }

    case 'PLAY_ROYAL': {
      const targetPi = action.target?.playerIndex;
      if (targetPi === playerIndex) return -5;
      const targetVp = state.players[targetPi]?.vp || 0;
      const targetRealmSize = state.players[targetPi]?.realm.length || 0;
      const targetIsLeader = targetVp >= Math.max(...state.players.map(p => p.vp)) - 1;

      let baseScore = 5;
      if (targetIsLeader) baseScore += 5;
      if (targetRealmSize >= 4) baseScore += 8;
      if (action.card?.rank === 'QUEEN') baseScore += 5;
      else if (action.card?.rank === 'KNIGHT') baseScore += 3;

      return baseScore * weights.attack;
    }

    case 'PLAY_MAJOR_TOME': {
      const cardVal = estimateCardValue(state, playerIndex, action.card, 'tome');
      if (action.card && isCelestial(action.card)) {
        return cardVal * weights.tomecelestial;
      }
      // Scale down tome plays when realm is small
      const realmPenalty = player.realm.length < 3 ? 0.4 : 1.0;
      return cardVal * weights.tome * realmPenalty;
    }

    case 'PLAY_MAJOR_ACTION': {
      const cardVal = estimateCardValue(state, playerIndex, action.card, 'tome');
      const realmPenalty = player.realm.length < 2 ? 0.3 : 1.0;
      return cardVal * weights.action * realmPenalty;
    }

    case 'BUY': {
      const paymentTotal = action.payment.reduce((s, c) => s + (c.purchaseValue || 0), 0);
      const hasAce = action.payment.some(c => c.rank === 'ACE');
      if (hasAce) return -10;

      let cardValue = 8;
      if (action.source.startsWith('display')) {
        const slot = parseInt(action.source.slice(-1));
        const card = state.display[slot];
        if (card) cardValue = estimateCardValue(state, playerIndex, card, 'buy');
      }

      const netValue = cardValue - paymentTotal * 0.5;
      // REMOVED: realmPenalty — buying should happen whenever no pair is available,
      // regardless of realm size. It depletes the Major deck which brings Death closer.
      return netValue * weights.buy;
    }

    default:
      return 0;
  }
}

/**
 * Choose the best action using weighted scoring with optional noise.
 *
 * @param {object} state
 * @param {object[]} legalActions
 * @param {number} playerIndex
 * @param {object} weights - Personality weight profile
 * @returns {object} Chosen action
 */
export function chooseActionByScore(state, legalActions, playerIndex, weights) {
  const threat = weights.celestialAware ? checkCelestialThreat(state, playerIndex) : null;

  const scored = legalActions.map(action => {
    let score = scoreAction(state, playerIndex, action, weights);

    // Celestial threat boost
    if (threat && threat.threatening && targetsCelestialThreat(action, state, threat.threatPlayer)) {
      score += 200;
    }

    // Add noise for human-like variance
    if (weights.noise > 0) {
      const noiseAmount = Math.abs(score) * weights.noise;
      score += (state.rng.next() - 0.5) * 2 * noiseAmount;
    }

    return { action, score };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored[0]?.action || legalActions[0];
}

/**
 * Create a learnable weight profile. Returns a mutable copy of the initial weights
 * and a learn function that adjusts weights based on game outcomes.
 *
 * @param {object} initialWeights - Starting weight profile (e.g. OPPORTUNIST_WEIGHTS)
 * @param {object} [options]
 * @param {number} [options.learningRate=0.02] - How fast weights change (0.01=slow, 0.05=fast)
 * @param {number} [options.minWeight=0.05] - Floor for any weight (prevents zeroing out)
 * @param {number} [options.maxWeight=3.0] - Ceiling for any weight
 * @returns {{ weights: object, learn: function }}
 */
export function createLearnableWeights(initialWeights, options = {}) {
  const {
    learningRate = 0.02,
    minWeight = 0.05,
    maxWeight = 3.0,
  } = options;

  // Mutable copy of the weights
  const weights = { ...initialWeights };

  // Track action type frequencies across recent games for baseline comparison
  const recentGames = []; // sliding window of last N games
  const windowSize = 50;

  /**
   * Learn from a completed game.
   *
   * @param {object} gameResult - From extractGameResult()
   * @param {number} myIndex - This AI's player index
   * @param {object} state - Final game state
   */
  function learn(gameResult, myIndex, state) {
    const won = gameResult.winner.playerIndex === myIndex;
    const myVp = gameResult.players[myIndex].vp;
    const winnerVp = gameResult.winner.vp;

    // Count my action types from the game log
    const actionCounts = { SET: 0, WILD: 0, ROYAL: 0, BUY: 0, TOME: 0, ACTION: 0, PASS: 0 };
    const myName = state.players[myIndex].name;
    let totalActions = 0;

    for (const line of state.log) {
      if (!line.includes('[DEBUG] ' + myName + ' chose:')) continue;
      totalActions++;
      if (line.includes('chose: PLAY_SET')) actionCounts.SET++;
      else if (line.includes('chose: PLAY_WILD')) actionCounts.WILD++;
      else if (line.includes('chose: PLAY_ROYAL')) actionCounts.ROYAL++;
      else if (line.includes('chose: BUY')) actionCounts.BUY++;
      else if (line.includes('chose: PLAY_MAJOR_TOME')) actionCounts.TOME++;
      else if (line.includes('chose: PLAY_MAJOR_ACTION')) actionCounts.ACTION++;
      else if (line.includes('chose: PASS')) actionCounts.PASS++;
    }

    if (totalActions === 0) return;

    // Calculate action type percentages for this game
    const pcts = {};
    for (const [k, v] of Object.entries(actionCounts)) {
      pcts[k] = v / totalActions;
    }

    // Store in sliding window
    recentGames.push({ pcts, won, vpRatio: myVp / Math.max(winnerVp, 1) });
    if (recentGames.length > windowSize) recentGames.shift();

    // Don't start learning until we have enough data
    if (recentGames.length < 10) return;

    // Calculate win-correlated action frequencies
    const winGames = recentGames.filter(g => g.won);
    const lossGames = recentGames.filter(g => !g.won);

    if (winGames.length < 3 || lossGames.length < 3) return;

    const winAvg = { SET: 0, WILD: 0, ROYAL: 0, BUY: 0, TOME: 0, ACTION: 0, PASS: 0 };
    const lossAvg = { SET: 0, WILD: 0, ROYAL: 0, BUY: 0, TOME: 0, ACTION: 0, PASS: 0 };

    for (const g of winGames) {
      for (const k of Object.keys(winAvg)) winAvg[k] += g.pcts[k];
    }
    for (const g of lossGames) {
      for (const k of Object.keys(lossAvg)) lossAvg[k] += g.pcts[k];
    }
    for (const k of Object.keys(winAvg)) {
      winAvg[k] /= winGames.length;
      lossAvg[k] /= lossGames.length;
    }

    // Nudge weights: if an action type is more common in wins than losses,
    // increase its weight. If more common in losses, decrease it.
    const weightMap = {
      SET: 'setMulti',
      WILD: 'wild',
      ROYAL: 'attack',
      BUY: 'buy',
      TOME: 'tome',
      ACTION: 'action',
      PASS: 'pass',
    };

    for (const [actionType, weightKey] of Object.entries(weightMap)) {
      if (typeof weights[weightKey] !== 'number') continue;

      const delta = winAvg[actionType] - lossAvg[actionType];
      // delta > 0 means this action is more common in wins → increase weight
      // delta < 0 means this action is more common in losses → decrease weight

      const adjustment = delta * learningRate;
      weights[weightKey] = Math.max(minWeight, Math.min(maxWeight, weights[weightKey] + adjustment));
    }
  }

  return { weights, learn };
}

/** Check if an action disrupts a celestial threat. */
function targetsCelestialThreat(action, state, threatPlayer) {
  if (action.type === 'PLAY_MAJOR_ACTION' && action.card) {
    const eff = getMajorDef(state, action.card.number);
    const act = eff?.effect?.action;
    if (act === 'STEAL_FROM_TOME' && action.targets?.playerIndex === threatPlayer) return true;
    if (act === 'TOWER_DESTROY') return true;
    if (act === 'MOVE_MAJOR_TO_REALM' && action.targets?.playerIndex === threatPlayer) return true;
    if (act === 'MOVE_CELESTIAL_TO_TOME') return true;
  }
  if (action.type === 'PLAY_ROYAL' && action.target?.playerIndex === threatPlayer) {
    const targetCard = state.players[threatPlayer]?.realm[action.target.realmIndex];
    if (targetCard && targetCard.type === 'major') return true;
  }
  return false;
}
