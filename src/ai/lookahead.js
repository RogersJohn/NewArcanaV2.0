/**
 * 1-round lookahead for action evaluation.
 *
 * For each candidate action:
 * 1. Clone the state
 * 2. Apply the candidate action (simplified — no blocking)
 * 3. Simulate each subsequent opponent's turn (greedy via scoreAction)
 * 4. Evaluate the resulting board position
 *
 * Performance: ~2.5ms per candidate action (clone + 3 opponent turns + eval).
 * With 8 candidates: ~20ms per decision. Acceptable for simulation.
 */

import { cloneState } from '../state.js';
import { getLegalActions } from '../actions.js';
import { evaluateHand, compareHands } from '../poker.js';
import { isCelestial } from '../cards.js';
import { analyzeHandPotential, estimateRemainingRounds } from './awareness.js';
import { scoreAction, DEFAULT_WEIGHTS, _scoreAndChoose, registerLookahead } from './personality.js';
import { estimateCardValue } from './card-value.js';
import { getEffectiveHandLimit, getHandSize } from '../state.js';

/**
 * Evaluate how good a board position is for a player.
 * Returns a composite score 0-100.
 *
 * @param {object} state - Game state to evaluate
 * @param {number} playerIndex - Player to evaluate for
 * @returns {number} Position score (higher = better)
 */
export function evaluatePosition(state, playerIndex) {
  const player = state.players[playerIndex];
  const opts = { aceHigh: state.config?.gameRules?.aceHigh ?? false };

  // 1. Poker hand strength relative to opponents (0-100)
  const myRealm = player.realm;
  const myEval = evaluateHand(myRealm, opts);
  let pokerScore = 0;
  if (myRealm.length > 0) {
    pokerScore = myEval.rank * 10; // 0-90 base from hand rank
    // Bonus if currently winning
    let winning = true;
    for (let pi = 0; pi < state.players.length; pi++) {
      if (pi === playerIndex) continue;
      const opRealm = state.players[pi].realm;
      if (opRealm.length === 0) continue;
      const opEval = evaluateHand(opRealm, opts);
      if (compareHands(opEval, myEval) > 0) { winning = false; break; }
    }
    if (winning) pokerScore += 10;
  }

  // 2. Realm progress (0-100)
  const realmProgress = (myRealm.length / 5) * 100;

  // 3. Tome value (0-100)
  let tomeValue = 0;
  for (const card of player.tome) {
    tomeValue += estimateCardValue(state, playerIndex, card, 'tome') * 0.5;
  }
  tomeValue = Math.min(100, tomeValue);

  // 4. VP score relative to opponents (0-100)
  const myVp = player.vp;
  const maxOpVp = Math.max(0, ...state.players
    .filter((_, i) => i !== playerIndex).map(p => p.vp));
  const vpScore = Math.min(100, Math.max(0, 50 + (myVp - maxOpVp) * 5));

  // 5. Celestial progress (0-100)
  const celestialCount = [...player.tome, ...player.realm, ...player.vault]
    .filter(c => isCelestial(c)).length;
  const celestialScore = celestialCount >= 3 ? 100 : celestialCount * 30;

  // 6. Hand potential (0-100)
  const handPotential = Math.min(100, analyzeHandPotential(player.hand, player.realm).holdScore);

  return 0.35 * pokerScore + 0.25 * realmProgress + 0.15 * tomeValue
       + 0.15 * vpScore + 0.05 * celestialScore + 0.05 * handPotential;
}

/**
 * Apply an action to the state in a simplified way (no blocking, no generators).
 *
 * @param {object} state - Mutable cloned state
 * @param {number} playerIndex - Acting player
 * @param {object} action - Action to apply
 */
export function applyActionSimplified(state, playerIndex, action) {
  const player = state.players[playerIndex];

  switch (action.type) {
    case 'PLAY_SET': {
      // Move cards from hand to realm
      const cardIds = new Set((action.cards || []).map(c => c.id));
      player.hand = player.hand.filter(c => !cardIds.has(c.id));
      player.realm.push(...(action.cards || []));
      break;
    }

    case 'PLAY_WILD': {
      // Move major card + companions from hand to realm
      const cardIds = new Set();
      if (action.card) cardIds.add(action.card.id);
      for (const c of (action.withCards || [])) cardIds.add(c.id);
      player.hand = player.hand.filter(c => !cardIds.has(c.id));
      if (action.card) player.realm.push(action.card);
      player.realm.push(...(action.withCards || []));
      break;
    }

    case 'BUY': {
      // Remove payment, add card to hand (simplified: just remove payment)
      const paymentIds = new Set(action.payment.map(c => c.id));
      player.hand = player.hand.filter(c => !paymentIds.has(c.id));
      // Add bought card to hand if identifiable
      if (action.source?.startsWith('display')) {
        const slot = parseInt(action.source.slice(-1));
        const card = state.display[slot];
        if (card) {
          player.hand.push(card);
          state.display[slot] = null;
        }
      }
      break;
    }

    case 'PLAY_ROYAL': {
      // Remove attacker from hand, remove target from target realm (no blocking)
      if (action.card) {
        player.hand = player.hand.filter(c => c.id !== action.card.id);
      }
      const targetPi = action.target?.playerIndex;
      if (targetPi != null && state.players[targetPi]) {
        const targetRealm = state.players[targetPi].realm;
        const targetIdx = action.target.realmIndex;
        if (targetIdx != null && targetIdx < targetRealm.length) {
          const removed = targetRealm.splice(targetIdx, 1)[0];
          // Knight: card to hand. Queen: card to realm. Page: both to pit.
          if (action.card?.rank === 'KNIGHT' && removed) {
            player.hand.push(removed);
          } else if (action.card?.rank === 'QUEEN' && removed) {
            player.realm.push(removed);
          }
        }
      }
      break;
    }

    case 'PLAY_MAJOR_TOME': {
      if (action.card) {
        player.hand = player.hand.filter(c => c.id !== action.card.id);
        player.tome.push(action.card);
      }
      break;
    }

    case 'PLAY_MAJOR_ACTION': {
      // Just remove from hand (don't resolve complex effects)
      if (action.card) {
        player.hand = player.hand.filter(c => c.id !== action.card.id);
      }
      break;
    }

    case 'PASS':
    default:
      break;
  }
}

/**
 * Simulate one opponent's turn in the cloned state (simplified).
 *
 * @param {object} clonedState - Mutable cloned state
 * @param {number} opponentIndex - Opponent taking a turn
 */
export function simulateOpponentTurn(clonedState, opponentIndex) {
  const opponent = clonedState.players[opponentIndex];

  // Simplified draw phase: draw up to hand limit
  const limit = getEffectiveHandLimit(opponent, clonedState.config);
  const handSize = opponent.hand.length + opponent.realm.length;
  const toDraw = Math.max(1, limit - handSize);
  for (let i = 0; i < toDraw; i++) {
    if (clonedState.minorDeck.length > 0) {
      opponent.hand.push(clonedState.minorDeck.pop());
    }
  }

  // Get legal actions and pick best via heuristic
  try {
    const actions = getLegalActions(clonedState, opponentIndex);
    if (actions.length <= 1) return;

    const bestAction = _scoreAndChoose(clonedState, actions, opponentIndex, DEFAULT_WEIGHTS);
    applyActionSimplified(clonedState, opponentIndex, bestAction);
  } catch (_e) {
    // Ignore errors in lookahead simulation
  }

  // Simplified discard: remove excess cards
  const newLimit = getEffectiveHandLimit(opponent, clonedState.config);
  while (opponent.hand.length + opponent.realm.length > newLimit + 1 && opponent.hand.length > 0) {
    opponent.hand.pop();
  }
}

/**
 * Choose the best action using 1-round lookahead.
 *
 * @param {object} state - Current game state
 * @param {object[]} legalActions - All legal actions
 * @param {number} playerIndex - Active player
 * @param {object} weights - Personality weight profile
 * @param {number} [topK=8] - Number of top candidates to evaluate
 * @returns {object} Best action after lookahead
 */
export function chooseBestWithLookahead(state, legalActions, playerIndex, weights, topK = 5) {
  // Pre-score all actions with heuristic
  const scored = legalActions.map(action => ({
    action,
    score: scoreAction(state, playerIndex, action, weights),
  }));
  scored.sort((a, b) => b.score - a.score);
  const candidates = scored.slice(0, topK);

  let bestAction = candidates[0]?.action || legalActions[0];
  let bestEval = -Infinity;

  const numPlayers = state.players.length;

  for (const { action } of candidates) {
    // Skip PASS in lookahead — we already scored it via heuristic
    if (action.type === 'PASS') continue;

    try {
      const clone = cloneState(state);
      // Suppress logging
      clone.log = { push() {} };
      clone.events = { push() {} };

      // Apply my action
      applyActionSimplified(clone, playerIndex, action);

      // Simulate one opponent turn (the next player) for speed
      const nextOp = (playerIndex + 1) % numPlayers;
      simulateOpponentTurn(clone, nextOp);

      // Evaluate position
      const eval_ = evaluatePosition(clone, playerIndex);
      if (eval_ > bestEval) {
        bestEval = eval_;
        bestAction = action;
      }
    } catch (_e) {
      // Skip this candidate on error
    }
  }

  return bestAction;
}

// Register this module with the personality system (avoids circular import)
registerLookahead({ chooseBestWithLookahead });
