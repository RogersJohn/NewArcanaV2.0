/**
 * Decision history recording and replay for New Arcana.
 * Enables deterministic replay from seed + history.
 */

import { createInitialState } from './state.js';
import { setup, playGame } from './engine.js';
import { createAIs } from './ai/index.js';

/** Decision type constants matching the 10 active decision points. */
export const DECISION_TYPES = {
  MAJOR_KEEP: 'MAJOR_KEEP',
  ACTION: 'ACTION',
  DISCARD: 'DISCARD',
  REALM_DISCARD: 'REALM_DISCARD',
  ACE_BLOCK: 'ACE_BLOCK',
  KING_BLOCK: 'KING_BLOCK',
  TOME_DISCARD: 'TOME_DISCARD',
  WHEEL_SOURCES: 'WHEEL_SOURCES',
  WHEEL_KEEP: 'WHEEL_KEEP',
  MAGICIAN_SUIT: 'MAGICIAN_SUIT',
};

/**
 * Record a decision to the game state history.
 * @param {object} state - Game state
 * @param {string} type - One of DECISION_TYPES
 * @param {number} playerIndex - Player who made the decision
 * @param {*} choice - The value returned by the AI
 */
export function recordDecision(state, type, playerIndex, choice) {
  state.history.push({ type, playerIndex, round: state.roundNumber, choice });
}

/**
 * Create a ReplayAI that replays decisions from a recorded history.
 * All ReplayAI instances for a game share the same cursor object,
 * since decisions are interleaved across players.
 *
 * Use this for replacing specific player slots (e.g., a human player)
 * during replay. For full AI-vs-AI replay, use replayGame() which
 * re-creates the original AIs for identical RNG consumption.
 *
 * @param {object[]} history - Array of decision entries
 * @param {object} cursor - Shared cursor object { pos: 0 }
 * @returns {object} AI-like object
 */
export function createReplayAI(history, cursor) {
  function nextDecision(expectedType) {
    if (cursor.pos >= history.length) {
      throw new Error(`Replay exhausted: expected ${expectedType} at position ${cursor.pos}`);
    }
    const entry = history[cursor.pos];
    if (entry.type !== expectedType) {
      throw new Error(
        `Replay mismatch at position ${cursor.pos}: expected ${expectedType}, got ${entry.type}`
      );
    }
    cursor.pos++;
    return entry.choice;
  }

  return {
    name: 'Replay',

    chooseMajorKeep(majorCards, state) {
      return nextDecision(DECISION_TYPES.MAJOR_KEEP);
    },

    chooseAction(state, legalActions, playerIndex) {
      const actionIndex = nextDecision(DECISION_TYPES.ACTION);
      return legalActions[actionIndex];
    },

    chooseDiscard(state, playerIndex, numToDiscard) {
      return nextDecision(DECISION_TYPES.DISCARD);
    },

    chooseRealmDiscard(state, playerIndex, numToDiscard) {
      return nextDecision(DECISION_TYPES.REALM_DISCARD);
    },

    shouldBlockWithAce(state, playerIndex, action) {
      return nextDecision(DECISION_TYPES.ACE_BLOCK);
    },

    shouldBlockWithKing(state, playerIndex, attackCard) {
      return nextDecision(DECISION_TYPES.KING_BLOCK);
    },

    chooseTomeDiscard(state, playerIndex) {
      return nextDecision(DECISION_TYPES.TOME_DISCARD);
    },

    chooseWheelSources(state, playerIndex) {
      return nextDecision(DECISION_TYPES.WHEEL_SOURCES);
    },

    chooseWheelKeep(cards, state) {
      return nextDecision(DECISION_TYPES.WHEEL_KEEP);
    },

    chooseMagicianSuit(state, playerIndex) {
      return nextDecision(DECISION_TYPES.MAGICIAN_SUIT);
    },

    chooseFoolTarget(state, playerIndex, options) {
      // Not wired up in engine — should not be called during replay
      throw new Error('chooseFoolTarget not expected during replay');
    },
  };
}

/**
 * Replay a game from seed + AI assignment.
 * Since the game is fully deterministic given seed + AIs,
 * re-running with the same AIs and seed produces an identical game.
 * The recorded history on the resulting state can be compared
 * against the original for verification.
 *
 * @param {number|string} seed - The original game seed
 * @param {number} numPlayers - Number of players
 * @param {boolean} [extended=false] - Extended Major Arcana set
 * @param {string} [aiAssignment='diverse'] - AI assignment (must match original)
 * @returns {object} Final game state (with its own recorded history)
 */
export function replayGame(seed, numPlayers, extended = false, aiAssignment = 'diverse') {
  const state = createInitialState(numPlayers, extended, seed);
  const ais = createAIs(numPlayers, aiAssignment, state.rng);

  for (let pi = 0; pi < numPlayers; pi++) {
    state.players[pi].name = `${ais[pi].name}-${pi + 1}`;
  }

  setup(state, ais);
  playGame(state, ais);

  return state;
}

/**
 * Verify that two history arrays are equivalent.
 * @param {object[]} historyA - First history
 * @param {object[]} historyB - Second history
 * @returns {{ match: boolean, firstDiff: number|null, detail: string|null }}
 */
export function compareHistories(historyA, historyB) {
  if (historyA.length !== historyB.length) {
    return {
      match: false,
      firstDiff: Math.min(historyA.length, historyB.length),
      detail: `Length mismatch: ${historyA.length} vs ${historyB.length}`,
    };
  }
  for (let i = 0; i < historyA.length; i++) {
    const a = historyA[i];
    const b = historyB[i];
    if (a.type !== b.type || a.playerIndex !== b.playerIndex ||
        JSON.stringify(a.choice) !== JSON.stringify(b.choice)) {
      return {
        match: false,
        firstDiff: i,
        detail: `At ${i}: ${a.type}/${JSON.stringify(a.choice)} vs ${b.type}/${JSON.stringify(b.choice)}`,
      };
    }
  }
  return { match: true, firstDiff: null, detail: null };
}
