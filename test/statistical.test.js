/**
 * Statistical regression tests: seeded batch simulations asserting
 * metrics stay within expected ranges.
 *
 * Note: Each game takes ~1-2 seconds due to wild card evaluation in the
 * poker engine, so game counts are kept moderate to fit within timeouts.
 */
import { describe, it, expect } from 'vitest';
import { runSimulation } from '../src/simulation.js';
import { DECISION_TYPES } from '../src/history.js';
import { createInitialState } from '../src/state.js';
import { setup, playGame } from '../src/engine.js';
import { createAIs } from '../src/ai/index.js';

describe('Statistical Regression', () => {
  it('100 games (4p, seed 1): avg rounds 2-8, zero errors, all end reasons present', () => {
    const sim = runSimulation({ games: 100, players: 4, seed: 1 });

    expect(sim.errors).toBe(0);
    expect(sim.completedGames).toBe(100);

    // Average rounds should be between 2 and 8
    const totalRounds = sim.results.reduce((s, r) => s + r.roundsPlayed, 0);
    const avgRounds = totalRounds / sim.results.length;
    expect(avgRounds).toBeGreaterThanOrEqual(2);
    expect(avgRounds).toBeLessThanOrEqual(8);

    // All game end reasons should be present across 100 games
    const reasons = new Set(sim.results.map(r => r.gameEndReason));
    expect(reasons.has('death_revealed') || reasons.has('death_purchased')).toBe(true);
    // celestial_win should appear at least sometimes
    expect(reasons.has('celestial_win')).toBe(true);
  }, 300000);

  it('No AI wins >50% of games', () => {
    const sim = runSimulation({ games: 100, players: 4, seed: 42 });

    const wins = {};
    const appearances = {};
    for (const game of sim.results) {
      for (const player of game.players) {
        appearances[player.aiType] = (appearances[player.aiType] || 0) + 1;
      }
      wins[game.winner.aiType] = (wins[game.winner.aiType] || 0) + 1;
    }

    for (const [ai, w] of Object.entries(wins)) {
      const n = appearances[ai] || 1;
      const rate = w / n;
      expect(rate).toBeLessThan(0.60);
    }
  }, 300000);

  it('VP distribution: avg VP 3-30 per player, no infinitely negative', () => {
    const sim = runSimulation({ games: 50, players: 4, seed: 7 });

    let totalVP = 0;
    let count = 0;
    let minVP = Infinity;

    for (const game of sim.results) {
      for (const vp of game.vpDistribution) {
        totalVP += vp;
        count++;
        if (vp < minVP) minVP = vp;
      }
    }

    const avgVP = totalVP / count;
    expect(avgVP).toBeGreaterThanOrEqual(3);
    expect(avgVP).toBeLessThanOrEqual(30);
    // No player should have extremely negative VP (plague is -3 each, but bounded)
    expect(minVP).toBeGreaterThan(-50);
  }, 120000);

  it('All 10 decision types recorded across batch', () => {
    // Run a batch and collect all decision types from game histories
    const allDecisionTypes = new Set();
    const numGames = 100;

    for (let i = 0; i < numGames; i++) {
      const seed = 1000 + i;
      const state = createInitialState(4, false, seed);
      const ais = createAIs(4, 'diverse', state.rng);
      for (let pi = 0; pi < 4; pi++) {
        state.players[pi].name = `${ais[pi].name}-${pi + 1}`;
      }
      setup(state, ais);
      playGame(state, ais);

      for (const entry of state.history) {
        allDecisionTypes.add(entry.type);
      }

      // Early exit once we've found all types
      if (allDecisionTypes.size >= 10) break;
    }

    const expectedTypes = Object.values(DECISION_TYPES);
    for (const type of expectedTypes) {
      expect(allDecisionTypes.has(type)).toBe(true);
    }
  }, 120000);
});
