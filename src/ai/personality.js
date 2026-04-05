/**
 * Unified action scoring with personality weights.
 *
 * Every AI uses this function. Personality comes from the weights object.
 * Returns scores for all legal actions, with optional noise for human-like variance.
 */

import { evaluateHand, compareHands } from '../poker.js';
import { isCelestial } from '../cards.js';
import { analyzeHandPotential, vpUrgency, checkCelestialThreat, getHandRanking, estimateRemainingRounds, estimatePotWinProbability } from './awareness.js';
import { estimateCardValue, estimateBonusFloor } from './card-value.js';
import { createCardTracker } from './card-tracker.js';
import { getMajorDef, getCardEffect } from '../effect-resolver.js';

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
  tome: 0.7,           // Playing to Tome — raised to make tome plays compete with realm plays
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
  tome: 0.6,
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
  tome: 0.75,
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
  useLookahead: true,
};

export const OPPORTUNIST_WEIGHTS = {
  ...DEFAULT_WEIGHTS,
  setMulti: 1.1,
  attack: 0.35,
  tome: 0.65,
  action: 0.6,
  noise: 0.08,
  rushWhenAhead: true,
  useLookahead: true,
};

export const SCORING_WEIGHTS = {
  ...DEFAULT_WEIGHTS,
  setMulti: 1.2,
  setSingle: 0.15,
  buy: 0.5,
  tome: 0.65,
  noise: 0.05,
  rushWhenAhead: true,
  useLookahead: true,
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

      // Bonus income: if we have bonus cards in tome, passing still earns VP
      const bonusCards = player.tome.filter(c => c.keywords?.includes('bonus')).length;
      const bonusIncome = bonusCards * 2; // Approximate 2 VP per bonus card per round

      return (weights.pass + potential.holdScore * 0.3 + bonusIncome) * rush;
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

      let baseScore = 10 + improvement + companions * 3 + closingRealm;

      // Penalize wild if player has a playable pair in hand (pairs are better)
      const minors = player.hand.filter(c => c.type === 'minor');
      const rankGroups = {};
      for (const c of minors) rankGroups[c.numericRank] = (rankGroups[c.numericRank] || 0) + 1;
      const hasPair = Object.values(rankGroups).some(v => v >= 2);
      if (hasPair && newRealm.length < 5) {
        baseScore *= 0.3;
      }

      // Opportunity cost: card's alternative value as Tome play
      const alternativeValue = estimateCardValue(state, playerIndex, action.card, 'tome');
      const remaining = estimateRemainingRounds(state);
      // Late game: opportunity cost drops (fewer rounds to benefit from tome effect)
      const opportunityWeight = remaining <= 2 ? 0.2 : remaining <= 4 ? 0.5 : 0.8;
      const scaledAlt = alternativeValue * opportunityWeight;

      // If the card's cumulative tome value substantially exceeds this wild play's value,
      // heavily penalize — burning a 24VP bonus card as a wild for +5 realm improvement is wrong
      if (scaledAlt > baseScore * 1.5) {
        baseScore *= 0.1;
      } else if (scaledAlt > baseScore) {
        baseScore *= 0.3;
      } else {
        baseScore = Math.max(1, baseScore - scaledAlt * 0.4);
      }

      return baseScore * weights.wild * rush;
    }

    case 'PLAY_ROYAL': {
      const targetPi = action.target?.playerIndex;
      if (targetPi === playerIndex) return -5;
      const targetPlayer = state.players[targetPi];
      if (!targetPlayer) return -5;
      const targetRealmSize = targetPlayer.realm.length;
      if (targetRealmSize === 0) return -2;

      // Fix 5: Check if target has tome protection for this suit — attack will be blocked
      if (action.card && targetPlayer.tomeProtections?.has(action.card.suit)) {
        return -5; // Attack will be blocked, don't waste the royal
      }

      // 1. Compute impact: how much does removing target card hurt them?
      const targetRealm = targetPlayer.realm;
      const targetCard = targetRealm[action.target.realmIndex];
      const targetEval = evaluateHand(targetRealm, opts);
      const diminishedRealm = targetRealm.filter((_, i) => i !== action.target.realmIndex);
      const diminishedEval = evaluateHand(diminishedRealm, opts);
      const rankDelta = targetEval.rank - diminishedEval.rank;

      // 2. Pot denial: are they winning the pot? How much does this hurt them?
      const targetRanking = getHandRanking(state, targetPi);
      let potDenial = rankDelta * 3;
      if (targetRanking.winning) potDenial += (state.pot || 0) * 0.3;
      if (targetRealmSize >= 5) potDenial += 8; // Disrupting a complete realm

      // 2b. VP leadership targeting: attacking the overall game leader is more valuable
      const targetVp = targetPlayer.vp;
      const myVp = player.vp;
      const maxOpponentVp = Math.max(0, ...state.players
        .filter((_, i) => i !== playerIndex).map(p => p.vp));
      let leaderBonus = 0;
      if (targetVp >= maxOpponentVp && targetVp > myVp) {
        // Target is the game leader and ahead of us — priority target
        leaderBonus = Math.min(15, (targetVp - myVp) * 1.5);
      }

      // 3. Card type value: what does the attacker gain?
      let cardGainValue = 0;
      if (action.card?.rank === 'KNIGHT' && targetCard) {
        // Knight steals card to hand — valuable if card is useful
        cardGainValue = (targetCard.purchaseValue || 5) * 0.3;
      } else if (action.card?.rank === 'QUEEN' && targetCard) {
        // Queen moves card to our realm — very strong
        const newRealm = [...player.realm, targetCard];
        const newEval = evaluateHand(newRealm, opts);
        const currentEval = evaluateHand(player.realm, opts);
        cardGainValue = (newEval.rank - currentEval.rank) * 5 + 3;
      }
      // Page: both destroyed, no gain

      // 4. Ace block probability
      let blockProb = 0;
      try {
        const tracker = createCardTracker(state, playerIndex);
        blockProb = tracker.probHasAce(targetPi);
      } catch (_e) { /* ignore tracker errors */ }

      // 5. Final score
      const rawScore = potDenial + cardGainValue + leaderBonus + 2; // base of 2
      return rawScore * (1 - blockProb * 0.7) * weights.attack;
    }

    case 'PLAY_MAJOR_TOME': {
      const cardVal = estimateCardValue(state, playerIndex, action.card, 'tome');
      if (action.card && isCelestial(action.card)) {
        return cardVal * weights.tomecelestial;
      }

      // Compare tome play's cumulative VP against this round's pot opportunity.
      // A bonus card scoring 2VP × 6 rounds = 12VP should beat a pot worth 4-5VP.
      const remaining = estimateRemainingRounds(state);
      const potWinProb = estimatePotWinProbability(state, playerIndex);
      const potEV = (state.pot || 0) * potWinProb;

      // Tome plays are investments: compare cumulative expected VP to pot EV
      // Use weights.tome as a preference modifier, not a hard multiplier
      const hasBonus = action.card?.keywords?.includes('bonus');
      let score = cardVal * weights.tome;

      // Floor: bonus cards should never score below their expected per-round VP
      if (hasBonus && remaining > 1) {
        const effect = getCardEffect(state, action.card);
        const bonusFloor = estimateBonusFloor(effect, player, state, playerIndex, remaining);
        score = Math.max(score, bonusFloor);
      }

      return score;
    }

    case 'PLAY_MAJOR_ACTION': {
      let cardVal = estimateCardValue(state, playerIndex, action.card, 'tome');
      const realmPenalty = player.realm.length < 2 ? 0.3 : 1.0;

      // For targeted actions (Hanged Man, Tower, Chariot), evaluate the target quality
      if (action.targets && action.targets.playerIndex !== undefined && action.targets.cardIndex !== undefined) {
        const targetPlayer = state.players[action.targets.playerIndex];
        if (targetPlayer) {
          const targetCard = targetPlayer.tome?.[action.targets.cardIndex] ||
                             targetPlayer.realm?.[action.targets.cardIndex];
          if (targetCard && targetCard.type === 'major') {
            // Value the target card — stealing a celestial or high-VP bonus is much better
            const targetValue = estimateCardValue(state, playerIndex, targetCard, 'tome');
            cardVal += targetValue * 0.5; // Boost score based on target quality
          }
        }
      }

      return cardVal * weights.action * realmPenalty;
    }

    case 'BUY': {
      const paymentTotal = action.payment.reduce((s, c) => s + (c.purchaseValue || 0), 0);
      const hasAce = action.payment.some(c => c.rank === 'ACE');
      if (hasAce) return -10;

      let cardValue = 8;
      let card = null;
      if (action.source.startsWith('display')) {
        const slot = parseInt(action.source.slice(-1));
        card = state.display[slot];
        if (card) cardValue = estimateCardValue(state, playerIndex, card, 'buy');
      }

      // Synergy: does this card work with our existing tome/strategy?
      if (card?.type === 'major') {
        const effect = getCardEffect(state, card);
        if (effect) {
          // Bonus card for a suit we're already building in realm
          if (effect.bonus?.suit) {
            const suitCount = player.realm.filter(c =>
              c.type === 'minor' && c.suit === effect.bonus.suit
            ).length;
            if (suitCount >= 2) cardValue *= 1.5; // Strong synergy
          }
          // We have protections and this card's bonus matches
          if (player.tomeProtections.size > 0 && effect.bonus?.suit &&
              player.tomeProtections.has(effect.bonus.suit)) {
            cardValue *= 1.3; // Protected suit = bonus more likely to trigger
          }
        }
      }

      // Hand damage: are payment cards part of a developing set?
      const handWithPayment = player.hand.filter(c => c.type === 'minor');
      const handWithout = handWithPayment.filter(c =>
        !action.payment.some(p => p.id === c.id)
      );
      const potentialWith = analyzeHandPotential(handWithPayment, player.realm);
      const potentialWithout = analyzeHandPotential(handWithout, player.realm);
      const handDamage = (potentialWith.holdScore - potentialWithout.holdScore) * 0.03;

      // Display timing urgency: slot 2 ages off next round
      let urgency = 1.0;
      if (action.source === 'display2') {
        // Last chance to buy — ages off at end of round
        urgency = cardValue > 20 ? 2.0 : 1.5; // High-value cards get extra urgency
      } else if (action.source === 'display1') {
        urgency = 1.0; // One more round available
      } else if (action.source === 'display0') {
        urgency = 0.85; // Just arrived, plenty of time
      }

      const netValue = (cardValue * urgency - paymentTotal * 0.5 - handDamage);
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
  // Use lookahead for eligible AIs with enough actions to warrant it
  if (weights.useLookahead && legalActions.length > 2) {
    try {
      const mod = _getLookahead();
      if (mod?.chooseBestWithLookahead) {
        return mod.chooseBestWithLookahead(state, legalActions, playerIndex, weights);
      }
    } catch (_e) { /* fallback to heuristic scoring */ }
  }

  return _scoreAndChoose(state, legalActions, playerIndex, weights);
}

// Lazy-loaded lookahead module (resolved on first use, after all modules loaded)
var _lookaheadModule = null;
function _getLookahead() {
  if (!_lookaheadModule) {
    _lookaheadModule = _registeredLookahead || {};
  }
  return _lookaheadModule;
}

// Allow lookahead module to register itself (avoids circular import)
// Uses `var` to avoid TDZ issues when called during module initialization
var _registeredLookahead = null;
export function registerLookahead(mod) {
  _registeredLookahead = mod;
  _lookaheadModule = mod;
}

/**
 * Core scoring + selection logic (extracted for reuse by lookahead).
 */
export function _scoreAndChoose(state, legalActions, playerIndex, weights) {
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
