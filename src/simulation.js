/**
 * Monte Carlo simulation runner for New Arcana.
 */

import { createInitialState } from './state.js';
import { setup, playGame } from './engine.js';
import { createAIs, getAllAINames, getAI } from './ai/index.js';
import { createRNG } from './rng.js';
import { shuffle } from './cards.js';

/**
 * Run a batch simulation.
 * @param {object} config
 * @param {number} config.games - Number of games to run
 * @param {number} config.players - Number of players per game
 * @param {boolean} config.extended - Use extended Major Arcana
 * @param {string} config.aiAssignment - AI assignment strategy
 * @param {boolean} config.verbose - Log individual games
 * @param {number|string} [config.seed] - Master seed for reproducibility
 * @param {object} [config.cardConfig] - Card/game config (merged over defaults)
 * @returns {object} Simulation results
 */
export function runSimulation(config) {
  const {
    games = 1000,
    players = 4,
    extended = false,
    aiAssignment = 'diverse',
    verbose = false,
    seed,
    cardConfig,
    learning = false,
  } = config;

  // Create master RNG for deriving per-game seeds
  const masterRng = seed !== undefined ? createRNG(seed) : null;

  // In learning mode: create a persistent pool of AI instances
  // Each AI TYPE gets one instance that persists across all games
  let persistentAIs = null;
  if (learning && aiAssignment === 'diverse') {
    const nonRandom = getAllAINames().filter(n => n !== 'random' && n !== 'mcts');
    persistentAIs = {};
    for (const name of nonRandom) {
      persistentAIs[name] = getAI(name, { learning: true });
    }
  }

  const results = [];
  let errors = 0;

  for (let i = 0; i < games; i++) {
    try {
      // Derive per-game seed: masterSeed + gameIndex for isolation
      const gameSeed = masterRng
        ? (typeof seed === 'number' ? seed + i : masterRng.nextInt(2147483647))
        : undefined;

      const state = createInitialState(players, extended, gameSeed, cardConfig);

      let ais;
      if (persistentAIs) {
        // Learning mode: pick from persistent pool, shuffle into seats
        const names = Object.keys(persistentAIs);
        const shuffled = shuffle([...names], state.rng);
        ais = [];
        for (let pi = 0; pi < players; pi++) {
          ais.push(persistentAIs[shuffled[pi % names.length]]);
        }
        shuffle(ais, state.rng);
      } else {
        ais = createAIs(players, aiAssignment, state.rng, { learning });
      }

      // Name players with their AI type
      for (let pi = 0; pi < players; pi++) {
        state.players[pi].name = `${ais[pi].name}-${pi + 1}`;
      }

      setup(state, ais);
      playGame(state, ais);

      const gameResult = extractGameResult(state, ais);
      results.push(gameResult);

      // Learning: let each AI learn from this game
      if (learning) {
        for (let pi = 0; pi < players; pi++) {
          if (ais[pi].learn) {
            ais[pi].learn(gameResult, pi, state);
          }
        }
      }

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

  // In learning mode, include final weights in output
  let learnedWeights = null;
  if (persistentAIs) {
    learnedWeights = {};
    for (const [name, ai] of Object.entries(persistentAIs)) {
      learnedWeights[name] = { ...ai._weights };
    }
  }

  return {
    config: { games, players, extended, aiAssignment, seed: masterRng ? seed : undefined, hasCustomConfig: !!cardConfig, learning },
    results,
    errors,
    completedGames: results.length,
    learnedWeights,
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
    tomeCards: p.tome.map(c => c.type === 'major' ? c.number : -1),
    realmSize: p.realm.length,
    majorHoldings: [...p.tome, ...p.realm, ...p.vault]
      .filter(c => c.type === 'major')
      .map(c => c.number),
  }));

  return {
    seed: state.seed,
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
    cardEvents: summarizeCardEvents(state.events, winnerPi),
    vpSources: summarizeVPSources(state.events, state.players, state.config),
  };
}

/**
 * Summarize VP sources from events and final state.
 * @param {object[]} events - Raw events from state.events
 * @param {object[]} players - Final player states
 * @returns {object} VP breakdown by source
 */
function summarizeVPSources(events, players, config) {
  let potVp = 0, bonusVp = 0, celestialVp = 0;
  const globalCelestialVp = config?.scoring?.celestialVp ?? 2;
  const majorMap = config?.majorArcanaMap;

  for (const e of events) {
    if (e.type === 'POT_AWARDED') potVp += e.amount || 0;
    if (e.type === 'BONUS_SCORED') bonusVp += e.vp || 0;
  }
  for (const p of players) {
    for (const c of [...p.tome, ...p.realm, ...p.vault]) {
      if (c.type === 'major' && c.keywords?.includes('celestial')) {
        const def = majorMap?.get(c.number);
        celestialVp += def?.effect?.vpAtGameEnd ?? globalCelestialVp;
      }
    }
  }
  return { potVp, bonusVp, celestialVp };
}

/**
 * Summarize card events from a single game into compact per-card data.
 * @param {object[]} events - Raw events from state.events
 * @param {number} winnerPi - Winner's player index
 * @returns {object} Per-card summary keyed by card number
 */
function summarizeCardEvents(events, winnerPi) {
  const cards = {};

  function ensure(num, name) {
    if (!cards[num]) {
      cards[num] = {
        name: name || `Card ${num}`,
        purchased: 0, purchasedByWinner: 0,
        toTome: 0, toTomeByWinner: 0,
        actionPlayed: 0, actionPlayedByWinner: 0,
        wildPlayed: 0,
        usedForEffect: 0, usedForEffectByWinner: 0,
        bonusScored: 0, bonusFailed: 0, bonusVpTotal: 0,
        bonusScoredByWinner: 0,
        bonusScoredReal: 0, bonusScoredHierophant: 0,
        aceBlocked: 0, kingBlocked: 0,
        displayAppearances: 0, agedOff: 0,
      };
    }
  }

  for (const e of events) {
    const num = e.cardNumber;
    if (num === undefined) continue;
    ensure(num, e.cardName);
    const c = cards[num];
    const isWinner = e.player === winnerPi;

    switch (e.type) {
      case 'CARD_PURCHASED':
        c.purchased++;
        if (isWinner) c.purchasedByWinner++;
        break;
      case 'CARD_TO_TOME':
        c.toTome++;
        c.usedForEffect++;
        if (isWinner) {
          c.toTomeByWinner++;
          c.usedForEffectByWinner++;
        }
        break;
      case 'CARD_ACTION_PLAYED':
        c.actionPlayed++;
        c.usedForEffect++;
        if (isWinner) {
          c.actionPlayedByWinner++;
          c.usedForEffectByWinner++;
        }
        break;
      case 'CARD_WILD_PLAYED':
        c.wildPlayed++;
        break;
      case 'BONUS_SCORED':
        c.bonusScored++;
        c.bonusVpTotal += e.vp;
        if (isWinner) c.bonusScoredByWinner++;
        if (e.hierophant) c.bonusScoredHierophant++;
        else c.bonusScoredReal++;
        break;
      case 'BONUS_FAILED':
        c.bonusFailed++;
        break;
      case 'ACE_BLOCKED':
        c.aceBlocked++;
        break;
      case 'KING_BLOCKED':
        c.kingBlocked++;
        break;
      case 'CARD_DISPLAYED':
        c.displayAppearances++;
        break;
      case 'CARD_AGED_OFF':
        c.agedOff++;
        break;
    }
  }

  return cards;
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
  const { players = 4, extended = false, aiAssignment = 'diverse', seed, cardConfig } = config;
  const state = createInitialState(players, extended, seed, cardConfig);
  const ais = createAIs(players, aiAssignment, state.rng);

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
  console.log(`Seed: ${state.seed}`);
  for (const p of state.players) {
    console.log(`${p.name}: ${p.vp}vp`);
  }
  console.log(`Game ended: ${state.gameEndReason}`);
  console.log(`Rounds played: ${state.roundNumber}`);

  return state;
}
