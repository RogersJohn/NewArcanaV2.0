/**
 * Monte Carlo simulation runner for New Arcana.
 */

import { createInitialState } from './state.js';
import { setup, playGame } from './engine.js';
import { createAIs } from './ai/index.js';

/**
 * Run a batch simulation.
 * @param {object} config
 * @param {number} config.games - Number of games to run
 * @param {number} config.players - Number of players per game
 * @param {boolean} config.extended - Use extended Major Arcana
 * @param {string} config.aiAssignment - AI assignment strategy
 * @param {boolean} config.verbose - Log individual games
 * @returns {object} Simulation results
 */
export function runSimulation(config) {
  const {
    games = 1000,
    players = 4,
    extended = false,
    aiAssignment = 'diverse',
    verbose = false,
  } = config;

  const results = [];
  let errors = 0;

  for (let i = 0; i < games; i++) {
    try {
      const state = createInitialState(players, extended);
      const ais = createAIs(players, aiAssignment);

      // Name players with their AI type
      for (let pi = 0; pi < players; pi++) {
        state.players[pi].name = `${ais[pi].name}-${pi + 1}`;
      }

      setup(state, ais);
      playGame(state, ais);

      const gameResult = extractGameResult(state, ais);
      results.push(gameResult);

      if (verbose) {
        logGameResult(i + 1, gameResult);
      }
    } catch (e) {
      errors++;
      if (verbose) {
        console.error(`Game ${i + 1} failed: ${e.message}`);
      }
    }
  }

  return {
    config: { games, players, extended, aiAssignment },
    results,
    errors,
    completedGames: results.length,
  };
}

/**
 * Extract structured results from a completed game state.
 */
function extractGameResult(state, ais) {
  // Find winner (highest VP, tiebreak by highest tome card number)
  let winnerPi = 0;
  let highestVp = state.players[0].vp;

  for (let pi = 1; pi < state.players.length; pi++) {
    if (state.players[pi].vp > highestVp) {
      highestVp = state.players[pi].vp;
      winnerPi = pi;
    } else if (state.players[pi].vp === highestVp) {
      // Tiebreak: highest tome card number
      const myMax = Math.max(0, ...state.players[pi].tome.filter(c => c.type === 'major').map(c => c.number));
      const otherMax = Math.max(0, ...state.players[winnerPi].tome.filter(c => c.type === 'major').map(c => c.number));
      if (myMax > otherMax) winnerPi = pi;
    }
  }

  // Check for celestial win
  const isCelestialWin = state.gameEndReason === 'celestial_win';
  if (isCelestialWin && state.celestialWinner !== undefined) {
    winnerPi = state.celestialWinner;
  }

  const playerResults = state.players.map((p, i) => ({
    name: p.name,
    aiType: ais[i].name,
    vp: p.vp,
    position: i,
    tomeCards: p.tome.map(c => c.type === 'major' ? c.name : 'minor'),
    realmSize: p.realm.length,
  }));

  return {
    winner: {
      playerIndex: winnerPi,
      aiType: ais[winnerPi].name,
      vp: state.players[winnerPi].vp,
    },
    gameEndReason: state.gameEndReason,
    roundsPlayed: state.roundNumber,
    isCelestialWin,
    players: playerResults,
    vpDistribution: state.players.map(p => p.vp),
  };
}

/**
 * Log a single game result.
 */
function logGameResult(gameNum, result) {
  const winner = result.winner;
  console.log(
    `Game ${gameNum}: ${winner.aiType} wins (${winner.vp}vp) after ${result.roundsPlayed} rounds ` +
    `[${result.gameEndReason}]`
  );
}

/**
 * Run a single verbose game.
 */
export function runSingleGame(config) {
  const { players = 4, extended = false, aiAssignment = 'diverse' } = config;
  const state = createInitialState(players, extended);
  const ais = createAIs(players, aiAssignment);

  for (let pi = 0; pi < players; pi++) {
    state.players[pi].name = `${ais[pi].name}-${pi + 1}`;
  }

  setup(state, ais);
  playGame(state, ais);

  // Print log
  for (const msg of state.log) {
    console.log(msg);
  }

  console.log('\n=== Final Results ===');
  for (const p of state.players) {
    console.log(`${p.name}: ${p.vp}vp`);
  }
  console.log(`Game ended: ${state.gameEndReason}`);
  console.log(`Rounds played: ${state.roundNumber}`);

  return state;
}
