import { describe, it, expect } from 'vitest';
import { GameController } from '../src/game-controller.js';
import { DECISION_TYPES } from '../src/history.js';
import { RandomAI } from '../src/ai/base.js';

/**
 * Helper: resolve a human decision using RandomAI-style logic.
 * This lets us feed valid choices without implementing full AI strategy.
 */
function autoResolveDecision(decision) {
  const ai = new RandomAI();
  switch (decision.type) {
    case DECISION_TYPES.MAJOR_KEEP:
      return ai.chooseMajorKeep(decision.cards, decision.state);
    case DECISION_TYPES.ACTION:
      return ai.chooseAction(decision.state, decision.legalActions, decision.playerIndex);
    case DECISION_TYPES.ACE_BLOCK:
      return ai.shouldBlockWithAce(decision.state, decision.playerIndex, decision.action);
    case DECISION_TYPES.KING_BLOCK:
      return ai.shouldBlockWithKing(decision.state, decision.playerIndex, decision.attackCard);
    case DECISION_TYPES.DISCARD:
      return ai.chooseDiscard(decision.state, decision.playerIndex, decision.numToDiscard);
    case DECISION_TYPES.REALM_DISCARD:
      return ai.chooseRealmDiscard(decision.state, decision.playerIndex, decision.numToDiscard);
    case DECISION_TYPES.TOME_DISCARD:
      return ai.chooseTomeDiscard(decision.state, decision.playerIndex);
    case DECISION_TYPES.WHEEL_SOURCES:
      return ai.chooseWheelSources(decision.state, decision.playerIndex);
    case DECISION_TYPES.WHEEL_KEEP:
      return ai.chooseWheelKeep(decision.cards, decision.state);
    case DECISION_TYPES.MAGICIAN_SUIT:
      return ai.chooseMagicianSuit(decision.state, decision.playerIndex);
    default:
      throw new Error(`Unknown decision type: ${decision.type}`);
  }
}

describe('GameController', () => {

  describe('All-AI game', () => {
    it('completes a game with no human players', () => {
      const ctrl = new GameController({
        players: 4,
        humanPlayers: [],
        aiAssignment: 'diverse',
        seed: 42,
      });

      const result = ctrl.start();

      // With no humans, the game should run to completion immediately
      expect(result.done).toBe(true);
      expect(result.state).toBeDefined();
      expect(result.state.gameEnded).toBe(true);
      expect(result.state.gameEndReason).toBeTruthy();
    });

    it('completes with different player counts', () => {
      for (const n of [3, 4, 5]) {
        const ctrl = new GameController({
          players: n,
          humanPlayers: [],
          seed: 100 + n,
        });
        const result = ctrl.start();
        expect(result.done).toBe(true);
        expect(result.state.gameEnded).toBe(true);
      }
    });
  });

  describe('Human player game', () => {
    it('yields decisions for human player and completes', { timeout: 15000 }, () => {
      const ctrl = new GameController({
        players: 4,
        humanPlayers: [0],
        seed: 42,
      });

      let result = ctrl.start();
      let decisionCount = 0;
      const maxDecisions = 5000; // Safety limit

      while (!result.done && decisionCount < maxDecisions) {
        expect(result.decision).toBeDefined();
        expect(result.decision.type).toBeTruthy();
        expect(result.decision.playerIndex).toBe(0); // Only human is player 0
        expect(result.decision.state).toBeDefined();

        const choice = autoResolveDecision(result.decision);
        result = ctrl.submitDecision(choice);
        decisionCount++;
      }

      expect(result.done).toBe(true);
      expect(result.state.gameEnded).toBe(true);
      expect(decisionCount).toBeGreaterThan(0);
      expect(decisionCount).toBeLessThan(maxDecisions);
    });

    it('yields MAJOR_KEEP as the first decision for human player', () => {
      const ctrl = new GameController({
        players: 4,
        humanPlayers: [0],
        seed: 42,
      });

      const result = ctrl.start();

      // First decision should be MAJOR_KEEP for player 0
      expect(result.done).toBe(false);
      expect(result.decision.type).toBe(DECISION_TYPES.MAJOR_KEEP);
      expect(result.decision.playerIndex).toBe(0);
      expect(result.decision.cards).toHaveLength(2);
    });

    it('yields ACTION decisions during play', { timeout: 15000 }, () => {
      const ctrl = new GameController({
        players: 4,
        humanPlayers: [0],
        seed: 42,
      });

      let result = ctrl.start();
      const decisionTypes = new Set();

      while (!result.done) {
        decisionTypes.add(result.decision.type);
        const choice = autoResolveDecision(result.decision);
        result = ctrl.submitDecision(choice);
      }

      // Must see at least MAJOR_KEEP and ACTION
      expect(decisionTypes.has(DECISION_TYPES.MAJOR_KEEP)).toBe(true);
      expect(decisionTypes.has(DECISION_TYPES.ACTION)).toBe(true);
    });

    it('supports multiple human players', { timeout: 15000 }, () => {
      const ctrl = new GameController({
        players: 4,
        humanPlayers: [0, 2],
        seed: 42,
      });

      let result = ctrl.start();
      const humanDecisionPlayers = new Set();

      while (!result.done) {
        humanDecisionPlayers.add(result.decision.playerIndex);
        expect([0, 2]).toContain(result.decision.playerIndex);
        const choice = autoResolveDecision(result.decision);
        result = ctrl.submitDecision(choice);
      }

      // Both human players should have had decisions
      expect(humanDecisionPlayers.has(0)).toBe(true);
      expect(humanDecisionPlayers.has(2)).toBe(true);
      expect(result.state.gameEnded).toBe(true);
    });
  });

  describe('State access', () => {
    it('getState() returns valid state mid-game', () => {
      const ctrl = new GameController({
        players: 4,
        humanPlayers: [0],
        seed: 42,
      });

      const result = ctrl.start();
      expect(result.done).toBe(false);

      const state = ctrl.getState();
      expect(state).toBeDefined();
      expect(state.players).toHaveLength(4);
      expect(state.players[0].name).toBe('Human-1');
      expect(state.roundNumber).toBeGreaterThanOrEqual(0); // 0 during setup, 1+ during play
      expect(state.display).toHaveLength(3);
    });

    it('getState() and decision.state are the same reference', () => {
      const ctrl = new GameController({
        players: 4,
        humanPlayers: [0],
        seed: 42,
      });

      const result = ctrl.start();
      expect(result.decision.state).toBe(ctrl.getState());
    });
  });

  describe('Seeded determinism', () => {
    it('same seed + same decisions produce identical results', { timeout: 15000 }, () => {
      function playGame(seed) {
        const ctrl = new GameController({
          players: 4,
          humanPlayers: [0],
          seed,
        });

        let result = ctrl.start();
        while (!result.done) {
          const choice = autoResolveDecision(result.decision);
          result = ctrl.submitDecision(choice);
        }
        return result.state;
      }

      const state1 = playGame(777);
      const state2 = playGame(777);

      expect(state1.gameEndReason).toBe(state2.gameEndReason);
      expect(state1.roundNumber).toBe(state2.roundNumber);
      for (let i = 0; i < 4; i++) {
        expect(state1.players[i].vp).toBe(state2.players[i].vp);
      }
    });

    it('different seeds produce different results', { timeout: 15000 }, () => {
      function getVPs(seed) {
        const ctrl = new GameController({
          players: 4,
          humanPlayers: [],
          seed,
        });
        return ctrl.start().state.players.map(p => p.vp);
      }

      const vps1 = getVPs(111);
      const vps2 = getVPs(222);

      // Very unlikely to be identical with different seeds
      const same = vps1.every((v, i) => v === vps2[i]);
      expect(same).toBe(false);
    });
  });

  describe('History recording', () => {
    it('records decisions for both AI and human players', { timeout: 15000 }, () => {
      const ctrl = new GameController({
        players: 4,
        humanPlayers: [0],
        seed: 42,
      });

      let result = ctrl.start();
      while (!result.done) {
        const choice = autoResolveDecision(result.decision);
        result = ctrl.submitDecision(choice);
      }

      const state = result.state;
      expect(state.history.length).toBeGreaterThan(0);

      // History should contain decisions from all players
      const playersInHistory = new Set(state.history.map(h => h.playerIndex));
      expect(playersInHistory.size).toBeGreaterThan(1);

      // Human player (0) should appear in history
      expect(playersInHistory.has(0)).toBe(true);

      // All entries should have valid shape
      for (const entry of state.history) {
        expect(entry.type).toBeTruthy();
        expect(typeof entry.playerIndex).toBe('number');
        expect(typeof entry.round).toBe('number');
        expect(entry.choice !== undefined).toBe(true);
      }
    });

    it('produces same history as all-AI game with same seed', { timeout: 15000 }, () => {
      // All-AI game via GameController
      const ctrl1 = new GameController({
        players: 4,
        humanPlayers: [],
        seed: 42,
        aiAssignment: 'all-random',
      });
      const result1 = ctrl1.start();

      // Human game with auto-resolved random decisions (same AI type)
      const ctrl2 = new GameController({
        players: 4,
        humanPlayers: [0, 1, 2, 3], // All human, but resolved with RandomAI
        seed: 42,
        aiAssignment: 'all-random',
      });
      let result2 = ctrl2.start();
      while (!result2.done) {
        const choice = autoResolveDecision(result2.decision);
        result2 = ctrl2.submitDecision(choice);
      }

      // Both should complete the same way
      expect(result1.state.gameEndReason).toBe(result2.state.gameEndReason);
      expect(result1.state.roundNumber).toBe(result2.state.roundNumber);
      expect(result1.state.history.length).toBe(result2.state.history.length);

      // VP totals should match
      for (let i = 0; i < 4; i++) {
        expect(result1.state.players[i].vp).toBe(result2.state.players[i].vp);
      }
    });
  });

  describe('Error handling', () => {
    it('throws if start() called twice', () => {
      const ctrl = new GameController({
        players: 4,
        humanPlayers: [],
        seed: 42,
      });
      ctrl.start();
      expect(() => ctrl.start()).toThrow('already started');
    });

    it('throws if submitDecision() called before start()', () => {
      const ctrl = new GameController({
        players: 4,
        humanPlayers: [0],
        seed: 42,
      });
      expect(() => ctrl.submitDecision(0)).toThrow('not started');
    });

    it('throws if submitDecision() called after game over', () => {
      const ctrl = new GameController({
        players: 4,
        humanPlayers: [],
        seed: 42,
      });
      ctrl.start();
      expect(() => ctrl.submitDecision(0)).toThrow('already complete');
    });
  });
});
