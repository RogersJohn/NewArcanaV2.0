#!/usr/bin/env node
/**
 * New Arcana Stats Engine v2 — CLI Entry Point
 *
 * Usage: node index.js [options]
 *   --games N       Number of games (default: 1000)
 *   --players N     Number of players (default: 4)
 *   --extended      Use 6-player card set
 *   --ai TYPE       AI assignment: diverse|random|all-random|all-builder|etc
 *   --verbose       Log individual games
 *   --json FILE     Output stats as JSON
 *   --single        Run one game with verbose logging
 */

import { runSimulation, runSingleGame } from './src/simulation.js';
import { aggregateStats, formatReport } from './src/stats.js';
import { writeFileSync, mkdirSync } from 'fs';

function parseArgs(argv) {
  const args = {
    games: 1000,
    players: 4,
    extended: false,
    ai: 'diverse',
    verbose: false,
    json: null,
    single: false,
  };

  for (let i = 2; i < argv.length; i++) {
    switch (argv[i]) {
      case '--games':
        args.games = parseInt(argv[++i]) || 1000;
        break;
      case '--players':
        args.players = parseInt(argv[++i]) || 4;
        break;
      case '--extended':
        args.extended = true;
        break;
      case '--ai':
        args.ai = argv[++i] || 'diverse';
        break;
      case '--verbose':
        args.verbose = true;
        break;
      case '--json':
        args.json = argv[++i] || 'results.json';
        break;
      case '--single':
        args.single = true;
        break;
      case '--help':
        console.log(`New Arcana Stats Engine v2

Usage: node index.js [options]
  --games N       Number of games (default: 1000)
  --players N     Number of players (default: 4)
  --extended      Use 6-player card set
  --ai TYPE       AI assignment: diverse|random|all-random|all-builder|etc
  --verbose       Log individual games
  --json FILE     Output stats as JSON
  --single        Run one game with verbose logging`);
        process.exit(0);
    }
  }

  return args;
}

const args = parseArgs(process.argv);

if (args.single) {
  console.log(`Running single game with ${args.players} players (${args.ai})...\n`);
  runSingleGame({
    players: args.players,
    extended: args.extended,
    aiAssignment: args.ai,
  });
} else {
  console.log(`Running ${args.games} games with ${args.players} players (${args.ai})...`);
  const startTime = Date.now();

  const simResults = runSimulation({
    games: args.games,
    players: args.players,
    extended: args.extended,
    aiAssignment: args.ai,
    verbose: args.verbose,
  });

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`Completed in ${elapsed}s\n`);

  const stats = aggregateStats(simResults);
  const report = formatReport(stats);
  console.log(report);

  if (args.json) {
    try {
      // Ensure directory exists
      const dir = args.json.includes('/') ? args.json.substring(0, args.json.lastIndexOf('/')) : '.';
      if (dir !== '.') mkdirSync(dir, { recursive: true });
      writeFileSync(args.json, JSON.stringify(stats, null, 2));
      console.log(`\nJSON stats saved to ${args.json}`);
    } catch (e) {
      console.error(`Failed to write JSON: ${e.message}`);
    }
  }
}
