/**
 * GameController — async interface layer for the New Arcana engine.
 *
 * Wraps the synchronous generator-based engine, auto-resolving AI decisions
 * and pausing at human decision points. This is the critical bridge between
 * the engine and any interactive client (browser game, CLI, etc.).
 *
 * Usage:
 *   const ctrl = new GameController({ players: 4, humanPlayers: [0], seed: 42 });
 *   let result = ctrl.start();
 *   while (!result.done) {
 *     // Present result.decision to the human, get their choice
 *     result = ctrl.submitDecision(choice);
 *   }
 *   // result.state is the final game state
 *
 * With yieldAll mode (for AI visualization):
 *   const ctrl = new GameController({ players: 4, humanPlayers: [0], seed: 42, yieldAll: true });
 *   let result = ctrl.start();
 *   while (!result.done) {
 *     if (ctrl.isHumanDecision(result.decision)) {
 *       result = ctrl.submitDecision(humanChoice);
 *     } else {
 *       result = ctrl.submitAIDecision(result.decision);
 *     }
 *   }
 */

import { createInitialState, log } from './state.js';
import { setupGen, playGameGen } from './engine.js';
import { resolveWithAI } from './scoring.js';
import { createAIs } from './ai/index.js';

/**
 * GameController drives the engine generator, pausing for human decisions.
 */
export class GameController {
  /**
   * @param {object} options
   * @param {number} options.players - Number of players (2-6)
   * @param {number[]} [options.humanPlayers=[]] - Player indices controlled by humans
   * @param {string} [options.aiAssignment='diverse'] - AI assignment for non-human seats
   * @param {number|string} [options.seed] - Seed for deterministic RNG
   * @param {boolean} [options.extended=false] - Use extended Major Arcana
   * @param {object} [options.cardConfig] - Custom card/game config
   * @param {boolean} [options.yieldAll=false] - Yield ALL decisions (AI + human) for visualization
   */
  constructor({ players, humanPlayers = [], aiAssignment = 'diverse', seed, extended = false, cardConfig, yieldAll = false } = {}) {
    this._numPlayers = players;
    this._humanSet = new Set(humanPlayers);
    this._aiAssignment = aiAssignment;
    this._seed = seed;
    this._extended = extended;
    this._cardConfig = cardConfig;
    this._yieldAll = yieldAll;

    this._state = null;
    this._ais = null;
    this._gen = null;
    this._started = false;
    this._done = false;
  }

  /**
   * Initialize and start the game.
   * Advances through AI decisions until the first human decision (or game over).
   * In yieldAll mode, stops at every decision (AI or human).
   * @returns {{ done: boolean, decision?: object, state?: object }}
   */
  start() {
    if (this._started) {
      throw new Error('GameController already started. Use submitDecision() to continue.');
    }
    this._started = true;

    // Create state and AIs
    this._state = createInitialState(this._numPlayers, this._extended, this._seed, this._cardConfig);
    this._ais = createAIs(this._numPlayers, this._aiAssignment, this._state.rng);

    // Name players
    for (let pi = 0; pi < this._numPlayers; pi++) {
      if (this._humanSet.has(pi)) {
        this._state.players[pi].name = `Human-${pi + 1}`;
      } else {
        this._state.players[pi].name = `${this._ais[pi].name}-${pi + 1}`;
      }
    }

    // Create the full game generator: setup then play
    this._gen = this._createGameGenerator();

    // Advance to first decision or completion
    return this._advance(this._gen.next());
  }

  /**
   * Submit a human player's decision and continue.
   * @param {*} value - The human's choice (same types as AI returns)
   * @returns {{ done: boolean, decision?: object, state?: object }}
   */
  submitDecision(value) {
    if (!this._started) {
      throw new Error('GameController not started. Call start() first.');
    }
    if (this._done) {
      throw new Error('Game is already complete.');
    }
    if (!this._gen) {
      throw new Error('No active generator.');
    }

    return this._advance(this._gen.next(value));
  }

  /**
   * Resolve an AI decision and submit the result.
   * Convenience method for yieldAll mode — resolves using the appropriate AI.
   * @param {object} decision - The decision object yielded by the generator
   * @returns {{ done: boolean, decision?: object, state?: object }}
   */
  submitAIDecision(decision) {
    const ai = this._ais[decision.playerIndex];
    const choice = resolveWithAI(ai, decision);

    // Log AI decision for debugging
    const playerName = this._state.players[decision.playerIndex]?.name || `Player-${decision.playerIndex}`;
    if (decision.type === 'ACTION' && choice) {
      const desc = choice.description || choice.type || 'unknown';
      log(this._state, `[AI] ${playerName} (${ai.name}) decided: ${desc}`);
    } else if (decision.type === 'ACE_BLOCK') {
      log(this._state, `[AI] ${playerName} (${ai.name}) ace block: ${choice ? 'YES' : 'no'}`);
    } else if (decision.type === 'KING_BLOCK') {
      log(this._state, `[AI] ${playerName} (${ai.name}) king block: ${choice ? 'YES' : 'no'}`);
    }

    return this.submitDecision(choice);
  }

  /**
   * Check if a decision is for a human player.
   * @param {object} decision - Decision object
   * @returns {boolean}
   */
  isHumanDecision(decision) {
    return this._humanSet.has(decision.playerIndex);
  }

  /**
   * Get the current game state.
   * @returns {object} Live game state reference
   */
  getState() {
    return this._state;
  }

  /**
   * Get the AI objects array.
   * @returns {object[]} AI instances for each player slot
   */
  getAIs() {
    return this._ais;
  }

  /**
   * Check if the game is complete.
   * @returns {boolean}
   */
  isDone() {
    return this._done;
  }

  /**
   * Internal: create the full game generator (setup + play).
   */
  *_createGameGenerator() {
    yield* setupGen(this._state);
    if (!this._state.gameEnded) {
      yield* playGameGen(this._state);
    }
  }

  /**
   * Internal: advance the generator, auto-resolving AI decisions.
   * In default mode: stops at human decisions or game end.
   * In yieldAll mode: stops at every decision or game end.
   * @param {{ done: boolean, value: * }} result - Generator result
   * @returns {{ done: boolean, decision?: object, state?: object }}
   */
  _advance(result) {
    while (!result.done) {
      const request = result.value;

      // In yieldAll mode, yield every decision to the caller
      if (this._yieldAll) {
        return { done: false, decision: request };
      }

      // If this decision is for a human player, pause and return it
      if (this._humanSet.has(request.playerIndex)) {
        return { done: false, decision: request };
      }

      // AI player — auto-resolve
      const ai = this._ais[request.playerIndex];
      const choice = resolveWithAI(ai, request);
      result = this._gen.next(choice);
    }

    // Generator completed — game is done
    this._done = true;
    return { done: true, state: this._state };
  }
}
