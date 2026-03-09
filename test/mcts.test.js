import { describe, it, expect } from 'vitest';
import { MctsAI } from '../src/ai/mcts.js';
import { ScoringAI } from '../src/ai/scoring.js';
import { createInitialState } from '../src/state.js';
import { setupGen, playGameGen } from '../src/engine.js';
import { createAIs } from '../src/ai/index.js';
import { driveWithAIs } from '../src/scoring.js';
import { getLegalActions } from '../src/actions.js';

describe('MctsAI', () => {
  it('can play a complete game without errors', () => {
    const state = createInitialState(4, false, 42);
    // Player 0 is MCTS, rest are ScoringAI
    const ais = [
      new MctsAI({ rolloutsPerAction: 3 }), // Low rollouts for test speed
      new ScoringAI(),
      new ScoringAI(),
      new ScoringAI(),
    ];
    state.players.forEach((p, i) => p.name = `${ais[i].name}-${i}`);

    function* fullGame() {
      yield* setupGen(state);
      if (!state.gameEnded) yield* playGameGen(state);
    }

    driveWithAIs(fullGame(), ais);

    expect(state.gameEnded).toBe(true);
    expect(state.gameEndReason).toBeTruthy();
    // MCTS player should have some VP (not necessarily winning, just functioning)
    expect(state.players[0].vp).toBeGreaterThanOrEqual(0);
  }, 120000); // 120 second timeout (MCTS rollouts are slow)

  it('returns valid actions from legal action set', () => {
    const state = createInitialState(4, false, 99);
    const ais = createAIs(4, 'all-random', state.rng);
    state.players.forEach((p, i) => p.name = `P${i}`);
    driveWithAIs(setupGen(state), ais);

    // Get legal actions for player 0
    const legalActions = getLegalActions(state, 0);

    const mcts = new MctsAI({ rolloutsPerAction: 3 });
    const chosen = mcts.chooseAction(state, legalActions, 0);

    expect(legalActions).toContain(chosen);
  }, 15000);

  it('handles single legal action gracefully', () => {
    const state = createInitialState(4, false, 55);
    const ais = createAIs(4, 'all-random', state.rng);
    state.players.forEach((p, i) => p.name = `P${i}`);
    driveWithAIs(setupGen(state), ais);

    const mcts = new MctsAI({ rolloutsPerAction: 3 });
    // PASS-only action list
    const passOnly = [{ type: 'PASS', description: 'Pass (do nothing)' }];
    const chosen = mcts.chooseAction(state, passOnly, 0);
    expect(chosen.type).toBe('PASS');
  });
});
