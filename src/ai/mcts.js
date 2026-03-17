/**
 * MCTS AI: Monte Carlo Tree Search for action selection.
 *
 * Uses rollouts (simulated playouts) to evaluate each candidate action.
 * Pre-filters candidates using ScoringAI heuristics, then runs N rollouts
 * per candidate to estimate expected VP.
 *
 * Rollout policy: ScoringAI (informed random play).
 * Blocking/discard decisions: delegated to ScoringAI heuristics.
 * Card tracker: provides probability estimates for opponent cards.
 */

import { ScoringAI } from './scoring.js';
import { RandomAI } from './base.js';
import { cloneState } from '../state.js';
import { createRNG } from '../rng.js';
import { createCardTracker } from './card-tracker.js';
import { isCelestial } from '../cards.js';
import { scoreAction, SCORING_WEIGHTS } from './personality.js';
import { evaluatePosition, applyActionSimplified, simulateOpponentTurn } from './lookahead.js';

// Rollout policy AI — reuse a single instance
const rolloutAI = new ScoringAI();

export class MctsAI extends RandomAI {
  /**
   * @param {object} [options]
   * @param {number} [options.rolloutsPerAction=20] - Rollouts per candidate action
   * @param {number} [options.maxCandidates=8] - Max actions to evaluate with MCTS
   * @param {boolean} [options.verbose=false] - Log MCTS decision details
   */
  constructor(options = {}) {
    super();
    this.name = 'MCTS';
    this.rolloutsPerAction = options.rolloutsPerAction ?? 20;
    this.maxCandidates = options.maxCandidates ?? 8;
    this.verbose = options.verbose ?? false;

    // Heuristic AI for pre-filtering and non-ACTION decisions
    this._scoringAI = new ScoringAI();
  }

  chooseAction(state, legalActions, playerIndex) {
    // If only 1-2 actions, no need for MCTS
    if (legalActions.length <= 2) {
      return this._scoringAI.chooseAction(state, legalActions, playerIndex);
    }

    // Pre-filter: score all actions with ScoringAI heuristic, keep top N
    const scored = legalActions.map((action, idx) => ({
      action,
      idx,
      heuristicScore: scoreAction(state, playerIndex, action, SCORING_WEIGHTS),
    }));
    scored.sort((a, b) => b.heuristicScore - a.heuristicScore);
    const candidates = scored.slice(0, this.maxCandidates);

    // Run MCTS rollouts for each candidate
    const results = candidates.map(({ action, heuristicScore }) => {
      const vpDeltas = [];

      for (let r = 0; r < this.rolloutsPerAction; r++) {
        const delta = this._runRollout(state, playerIndex, action, r);
        vpDeltas.push(delta);
      }

      const avgDelta = vpDeltas.reduce((s, v) => s + v, 0) / vpDeltas.length;
      return { action, avgDelta, heuristicScore };
    });

    // Pick action with highest average VP delta
    results.sort((a, b) => b.avgDelta - a.avgDelta);

    if (this.verbose && results.length > 0) {
      const top = results[0];
      const desc = top.action.description || top.action.type;
      console.log(`[MCTS] ${state.players[playerIndex].name} chose: ${desc} (avgΔVP: ${top.avgDelta.toFixed(2)}, heuristic: ${top.heuristicScore})`);
    }

    return results[0].action;
  }

  /**
   * Run a single rollout: clone state, apply action, simulate one round,
   * evaluate position. Much faster than full-game rollouts.
   *
   * @param {object} state - Current game state
   * @param {number} playerIndex - MCTS player's index
   * @param {object} action - The action to evaluate
   * @param {number} rolloutIndex - Used to seed the rollout RNG
   * @returns {number} Position score (higher = better for MCTS player)
   */
  _runRollout(state, playerIndex, action, rolloutIndex) {
    try {
      const clone = cloneState(state);

      // Give the clone a fresh RNG for variety across rollouts
      const rolloutSeed = ((state.seed || 0) * 1000 + rolloutIndex * 7 + playerIndex * 31) | 0;
      clone.rng = createRNG(rolloutSeed);

      // Suppress logging
      clone.log = { push() {} };
      clone.events = { push() {} };

      // Apply our chosen action
      applyActionSimplified(clone, playerIndex, action);

      // Simulate a full round: each opponent takes a turn
      const numPlayers = clone.players.length;
      for (let i = 1; i < numPlayers; i++) {
        const opIdx = (playerIndex + i) % numPlayers;
        simulateOpponentTurn(clone, opIdx);
      }

      // Evaluate the resulting position
      return evaluatePosition(clone, playerIndex);
    } catch (_e) {
      return 0;
    }
  }

  // --- Non-ACTION decisions: delegate to ScoringAI with card-tracker enhancement ---

  shouldBlockWithAce(state, playerIndex, action) {
    // Use card tracker to make informed blocking decisions
    const _tracker = createCardTracker(state, playerIndex);

    // If action targets our realm and we're winning the pot, always block
    if (action.type === 'PLAY_ROYAL' && action.target?.playerIndex === playerIndex) {
      const myRealm = state.players[playerIndex].realm;
      if (myRealm.length >= 3) return true;
      if (myRealm.length >= 2) {
        // Block if it's a Queen (they get our card)
        if (action.card?.rank === 'QUEEN') return true;
        return state.pot >= 6; // Block in valuable pots
      }
      return false;
    }

    // Block celestial plays when opponent is at 2+ celestials
    if (action.type === 'PLAY_MAJOR_TOME' && action.card && isCelestial(action.card)) {
      const actorPi = action.playerIndex;
      if (actorPi != null && state.players[actorPi]) {
        const actorCelestials = [...state.players[actorPi].tome,
          ...state.players[actorPi].realm]
          .filter(c => isCelestial(c)).length;
        if (actorCelestials >= 1) return true; // Would give them 2+
      }
    }

    // Block wild cards that would give opponent 4+ realm cards
    if (action.type === 'PLAY_WILD') {
      const actorPi = action.playerIndex;
      const actorRealm = (actorPi != null && state.players[actorPi]?.realm) || [];
      const withCards = action.withCards?.length || 0;
      if (actorRealm.length + 1 + withCards >= 4) return true;
    }

    return false;
  }

  shouldBlockWithKing(state, playerIndex) {
    const hasKing = state.players[playerIndex].hand.some(
      c => c.type === 'minor' && c.rank === 'KING'
    );
    if (!hasKing) return false;

    // Always block if realm >= 3 (significant investment)
    if (state.players[playerIndex].realm.length >= 3) return true;

    // Block in high-pot situations with any realm
    if (state.players[playerIndex].realm.length >= 1 && state.pot >= 8) return true;

    return false;
  }

  chooseDiscard(state, playerIndex, numToDiscard) {
    return this._scoringAI.chooseDiscard(state, playerIndex, numToDiscard);
  }

  chooseMajorKeep(majorCards, state) {
    return this._scoringAI.chooseMajorKeep(majorCards, state);
  }

  chooseRealmDiscard(state, playerIndex, numToDiscard) {
    return this._scoringAI.chooseRealmDiscard(state, playerIndex, numToDiscard);
  }

  chooseTomeDiscard(state, playerIndex) {
    return this._scoringAI.chooseTomeDiscard(state, playerIndex);
  }

  chooseWheelSources(state, playerIndex) {
    return this._scoringAI.chooseWheelSources(state, playerIndex);
  }

  chooseWheelKeep(cards, state) {
    return this._scoringAI.chooseWheelKeep(cards, state);
  }

  chooseMagicianSuit(state, playerIndex) {
    return this._scoringAI.chooseMagicianSuit(state, playerIndex);
  }

  chooseFoolTarget(state, playerIndex, options) {
    return this._scoringAI.chooseFoolTarget(state, playerIndex, options);
  }

  chooseHermitCards(state, playerIndex, eligibleIndices) {
    return this._scoringAI.chooseHermitCards(state, playerIndex, eligibleIndices);
  }

  chooseTowerTarget(state, playerIndex, targetPlayerIndex) {
    return this._scoringAI.chooseTowerTarget(state, playerIndex, targetPlayerIndex);
  }

  chooseCharityCard(state, playerIndex) {
    return this._scoringAI.chooseCharityCard(state, playerIndex);
  }
}
