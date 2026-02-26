#!/usr/bin/env node
/**
 * Card Balance Analysis — Per-Card Impact Metrics (standalone runner)
 *
 * Runs 1,000 diverse 4-player games and computes 5 metrics:
 *   1. Winner Affinity — how often buyers of a card go on to win
 *   2. VP Delta — avg VP difference between holders and non-holders
 *   3. Action Effectiveness — success rate (not blocked by Ace/King)
 *   4. Tome Bonus Hit Rate — real bonus scoring rate (excluding Hierophant fallback)
 *   5. Purchase Rate — purchased vs aged-off ratio
 *
 * Usage:
 *   node scripts/card-balance.js [--games N]
 */

import { runSimulation } from '../src/simulation.js';
import { analyzeCardBalance } from '../src/card-balance.js';
import { writeFileSync, mkdirSync } from 'fs';

const GAMES = parseInt(process.argv.find((_, i, a) => a[i - 1] === '--games') || '1000');

console.log(`Running ${GAMES} games (4 players, diverse AI)...`);
const startTime = Date.now();

const simResults = runSimulation({
  games: GAMES,
  players: 4,
  extended: false,
  aiAssignment: 'diverse',
  verbose: false,
});

const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
console.log(`Completed ${simResults.completedGames} games in ${elapsed}s (${simResults.errors} errors)\n`);

const { metrics, text } = analyzeCardBalance(simResults.results);
console.log(text);

// Save JSON
const jsonOutput = {
  config: { games: GAMES, players: 4, aiAssignment: 'diverse' },
  totalGames: simResults.completedGames,
  metrics,
};

try {
  mkdirSync('results', { recursive: true });
  writeFileSync('results/card-balance.json', JSON.stringify(jsonOutput, null, 2));
  console.log('Results saved to results/card-balance.json');
} catch (e) {
  console.error(`Failed to save JSON: ${e.message}`);
}
