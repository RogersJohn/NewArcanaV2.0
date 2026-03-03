import { describe, it, expect } from 'vitest';
import { createInitialState, cloneState } from '../src/state.js';
import { setup, playGame } from '../src/engine.js';
import { createAIs } from '../src/ai/index.js';
import { replayGame, compareHistories, DECISION_TYPES } from '../src/history.js';

/**
 * Run a seeded game and return the final state.
 */
function runSeededGame(seed, numPlayers = 4, aiAssignment = 'diverse') {
  const state = createInitialState(numPlayers, false, seed);
  const ais = createAIs(numPlayers, aiAssignment, state.rng);
  for (let pi = 0; pi < numPlayers; pi++) {
    state.players[pi].name = `${ais[pi].name}-${pi + 1}`;
  }
  setup(state, ais);
  playGame(state, ais);
  return state;
}

describe('Decision History Recording', () => {
  it('records decisions during a game', () => {
    const state = runSeededGame(42);
    expect(state.history.length).toBeGreaterThan(0);
  });

  it('records MAJOR_KEEP decisions during setup', () => {
    const state = runSeededGame(42);
    const majorKeeps = state.history.filter(d => d.type === DECISION_TYPES.MAJOR_KEEP);
    // Should have one MAJOR_KEEP per player (4 players)
    expect(majorKeeps.length).toBe(4);
    for (const d of majorKeeps) {
      expect(d.choice === 0 || d.choice === 1).toBe(true);
    }
  });

  it('records ACTION decisions during play', () => {
    const state = runSeededGame(42);
    const actions = state.history.filter(d => d.type === DECISION_TYPES.ACTION);
    expect(actions.length).toBeGreaterThan(0);
    for (const d of actions) {
      expect(typeof d.choice).toBe('number');
      expect(d.choice).toBeGreaterThanOrEqual(-1);
    }
  });

  it('decision entries have correct shape', () => {
    const state = runSeededGame(42);
    for (const d of state.history) {
      expect(d).toHaveProperty('type');
      expect(d).toHaveProperty('playerIndex');
      expect(d).toHaveProperty('round');
      expect(d).toHaveProperty('choice');
      expect(typeof d.playerIndex).toBe('number');
      expect(typeof d.round).toBe('number');
    }
  });

  it('records all decision types that occur', () => {
    // Run enough games that most decision types appear at least once
    const allTypes = new Set();
    for (const seed of [42, 100, 200]) {
      const state = runSeededGame(seed);
      for (const d of state.history) {
        allTypes.add(d.type);
      }
    }
    // At minimum, MAJOR_KEEP and ACTION should appear in every game
    expect(allTypes.has(DECISION_TYPES.MAJOR_KEEP)).toBe(true);
    expect(allTypes.has(DECISION_TYPES.ACTION)).toBe(true);
  }, 15000);
});

describe('Game Replay', () => {
  it('replays a seeded game to identical VP totals', { timeout: 15000 }, () => {
    const original = runSeededGame(42);
    const replayed = replayGame(42, 4);

    for (let pi = 0; pi < 4; pi++) {
      expect(replayed.players[pi].vp).toBe(original.players[pi].vp);
    }
  });

  it('replays to identical game end reason', { timeout: 15000 }, () => {
    const original = runSeededGame(42);
    const replayed = replayGame(42, 4);

    expect(replayed.gameEndReason).toBe(original.gameEndReason);
  });

  it('replays to identical round count', { timeout: 15000 }, () => {
    const original = runSeededGame(42);
    const replayed = replayGame(42, 4);

    expect(replayed.roundNumber).toBe(original.roundNumber);
  });

  it('replays produce identical history (decision-by-decision)', { timeout: 15000 }, () => {
    const original = runSeededGame(42);
    const replayed = replayGame(42, 4);

    const result = compareHistories(original.history, replayed.history);
    expect(result.match).toBe(true);
  });

  it('replays multiple different seeds correctly', () => {
    for (const seed of [1, 100, 999]) {
      const original = runSeededGame(seed);
      const replayed = replayGame(seed, 4);

      expect(replayed.gameEndReason).toBe(original.gameEndReason);
      expect(replayed.roundNumber).toBe(original.roundNumber);
      for (let pi = 0; pi < 4; pi++) {
        expect(replayed.players[pi].vp).toBe(original.players[pi].vp);
      }
      const histResult = compareHistories(original.history, replayed.history);
      expect(histResult.match).toBe(true);
    }
  }, 30000);

  it('replays with 3 players', () => {
    const original = runSeededGame(77, 3);
    const replayed = replayGame(77, 3);

    expect(replayed.gameEndReason).toBe(original.gameEndReason);
    for (let pi = 0; pi < 3; pi++) {
      expect(replayed.players[pi].vp).toBe(original.players[pi].vp);
    }
  });

  it('replays with 5 players', () => {
    const original = runSeededGame(88, 5);
    const replayed = replayGame(88, 5);

    expect(replayed.gameEndReason).toBe(original.gameEndReason);
    for (let pi = 0; pi < 5; pi++) {
      expect(replayed.players[pi].vp).toBe(original.players[pi].vp);
    }
  });

  it('replays with all-random AIs', () => {
    const original = runSeededGame(42, 4, 'all-random');
    const replayed = replayGame(42, 4, false, 'all-random');

    expect(replayed.gameEndReason).toBe(original.gameEndReason);
    for (let pi = 0; pi < 4; pi++) {
      expect(replayed.players[pi].vp).toBe(original.players[pi].vp);
    }
  });
});

describe('compareHistories', () => {
  it('returns match:true for identical histories', () => {
    const h = [
      { type: 'ACTION', playerIndex: 0, round: 1, choice: 3 },
      { type: 'DISCARD', playerIndex: 0, round: 1, choice: [2] },
    ];
    const result = compareHistories(h, [...h.map(e => ({ ...e }))]);
    expect(result.match).toBe(true);
  });

  it('detects length mismatch', () => {
    const h1 = [{ type: 'ACTION', playerIndex: 0, round: 1, choice: 3 }];
    const h2 = [];
    const result = compareHistories(h1, h2);
    expect(result.match).toBe(false);
    expect(result.detail).toContain('Length');
  });

  it('detects type mismatch', () => {
    const h1 = [{ type: 'ACTION', playerIndex: 0, round: 1, choice: 3 }];
    const h2 = [{ type: 'DISCARD', playerIndex: 0, round: 1, choice: 3 }];
    const result = compareHistories(h1, h2);
    expect(result.match).toBe(false);
    expect(result.firstDiff).toBe(0);
  });
});

describe('History is excluded from cloneState', () => {
  it('cloned state shares the same history reference', () => {
    const state = createInitialState(4, false, 42);
    state.history.push({ type: 'TEST', playerIndex: 0, round: 0, choice: 0 });
    const clone = cloneState(state);
    expect(clone.history).toBe(state.history); // same reference
  });
});
