/**
 * useGameController — React hook bridging GameController and UI.
 *
 * Creates a GameController with yieldAll mode, manages state snapshots,
 * handles AI decision delays for visualization, and exposes a clean
 * interface for the UI components.
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { GameController } from '@engine/game-controller.js';
import { createSnapshot } from '../utils/stateSnapshot.js';

/**
 * @param {object} options
 * @param {number} options.playerCount - Number of players
 * @param {string} options.aiDifficulty - 'easy' | 'medium' | 'hard'
 * @param {number} [options.seed] - Optional seed
 */
export function useGameController() {
  // Game phases: 'start' | 'playing' | 'gameover'
  const [phase, setPhase] = useState('start');
  const [gameState, setGameState] = useState(null);
  const [decision, setDecision] = useState(null);
  const [aiDelay, setAiDelay] = useState(800);
  const [fastForward, setFastForward] = useState(false);
  const [isAIThinking, setIsAIThinking] = useState(false);
  const [roundTransition, setRoundTransition] = useState(null);

  const ctrlRef = useRef(null);
  const aiDelayRef = useRef(aiDelay);
  const fastForwardRef = useRef(fastForward);
  const abortRef = useRef(null);

  // Keep refs in sync
  useEffect(() => { aiDelayRef.current = aiDelay; }, [aiDelay]);
  useEffect(() => { fastForwardRef.current = fastForward; }, [fastForward]);

  const difficultyToAssignment = useCallback((difficulty) => {
    switch (difficulty) {
      case 'easy': return 'all-random';
      case 'hard': return 'all-scoring';
      default: return 'diverse';
    }
  }, []);

  /**
   * Process a generator result — either show a human decision,
   * auto-resolve an AI decision with delay, or end the game.
   */
  const processResult = useCallback((result) => {
    if (result.done) {
      setGameState(createSnapshot(result.state));
      setDecision(null);
      setIsAIThinking(false);
      setPhase('gameover');
      return;
    }

    const ctrl = ctrlRef.current;
    const snap = createSnapshot(ctrl.getState());
    setGameState(snap);

    if (ctrl.isHumanDecision(result.decision)) {
      setDecision(result.decision);
      setIsAIThinking(false);
    } else {
      // AI decision — show thinking state, then resolve after delay
      setDecision(result.decision);
      setIsAIThinking(true);

      const delay = fastForwardRef.current ? 0 : aiDelayRef.current;

      if (delay === 0) {
        // Resolve immediately but yield to event loop for UI update
        const timeoutId = setTimeout(() => {
          try {
            const nextResult = ctrl.submitAIDecision(result.decision);
            processResult(nextResult);
          } catch (e) {
            console.error('AI decision error:', e);
            const state = ctrl.getState();
            if (state && state.log) {
              state.log.push(`[ERROR] AI decision crashed: ${e.message}`);
              state.log.push(`[ERROR] Decision type: ${result.decision?.type} Player: ${result.decision?.playerIndex}`);
              state.log.push(`[ERROR] Stack: ${e.stack?.split('\n').slice(0, 3).join(' | ')}`);
            }
            setGameState(createSnapshot(state));
            setDecision(null);
            setIsAIThinking(false);
            setPhase('gameover');
          }
        }, 0);
        abortRef.current = () => clearTimeout(timeoutId);
      } else {
        const timeoutId = setTimeout(() => {
          try {
            const nextResult = ctrl.submitAIDecision(result.decision);
            processResult(nextResult);
          } catch (e) {
            console.error('AI decision error:', e);
            const state = ctrl.getState();
            if (state && state.log) {
              state.log.push(`[ERROR] AI decision crashed: ${e.message}`);
              state.log.push(`[ERROR] Decision type: ${result.decision?.type} Player: ${result.decision?.playerIndex}`);
              state.log.push(`[ERROR] Stack: ${e.stack?.split('\n').slice(0, 3).join(' | ')}`);
            }
            setGameState(createSnapshot(state));
            setDecision(null);
            setIsAIThinking(false);
            setPhase('gameover');
          }
        }, delay);
        abortRef.current = () => clearTimeout(timeoutId);
      }
    }
  }, []);

  /**
   * Start a new game.
   */
  const startGame = useCallback(({ playerCount, aiDifficulty, seed }) => {
    // Clean up any pending AI timeout
    if (abortRef.current) {
      abortRef.current();
      abortRef.current = null;
    }

    const ctrl = new GameController({
      players: playerCount,
      humanPlayers: [0],
      aiAssignment: difficultyToAssignment(aiDifficulty),
      seed,
      yieldAll: true,
    });

    ctrlRef.current = ctrl;
    setPhase('playing');
    setFastForward(false);
    setDecision(null);
    setIsAIThinking(false);
    setRoundTransition(null);

    const result = ctrl.start();
    processResult(result);
  }, [difficultyToAssignment, processResult]);

  /**
   * Submit a human player's decision.
   */
  const submitDecision = useCallback((choice) => {
    const ctrl = ctrlRef.current;
    if (!ctrl || ctrl.isDone()) return;

    const prevRound = ctrl.getState().roundNumber;
    let result;
    try {
      result = ctrl.submitDecision(choice);
    } catch (e) {
      console.error('submitDecision error:', e);
      // Log the error into the game state so it appears in the game log
      const state = ctrl.getState();
      if (state && state.log) {
        state.log.push(`[ERROR] Engine crashed: ${e.message}`);
        state.log.push(`[ERROR] Stack: ${e.stack?.split('\n').slice(0, 3).join(' | ')}`);
      }
      setGameState(createSnapshot(state));
      setDecision(null);
      setIsAIThinking(false);
      setPhase('gameover');
      return;
    }

    // Check for round transition
    const newRound = ctrl.getState().roundNumber;
    if (newRound > prevRound && prevRound > 0 && !result.done) {
      setRoundTransition({ fromRound: prevRound, toRound: newRound });
    }

    processResult(result);
  }, [processResult]);

  /**
   * Toggle fast-forward mode.
   */
  const toggleFastForward = useCallback(() => {
    setFastForward(prev => !prev);
  }, []);

  /**
   * Reset to start screen.
   */
  const resetGame = useCallback(() => {
    if (abortRef.current) {
      abortRef.current();
      abortRef.current = null;
    }
    ctrlRef.current = null;
    setPhase('start');
    setGameState(null);
    setDecision(null);
    setIsAIThinking(false);
    setRoundTransition(null);
    setFastForward(false);
  }, []);

  /**
   * Dismiss round transition overlay.
   */
  const dismissRoundTransition = useCallback(() => {
    setRoundTransition(null);
  }, []);

  return {
    phase,
    gameState,
    decision,
    isAIThinking,
    aiDelay,
    setAiDelay,
    fastForward,
    toggleFastForward,
    roundTransition,
    dismissRoundTransition,
    startGame,
    submitDecision,
    resetGame,
  };
}
