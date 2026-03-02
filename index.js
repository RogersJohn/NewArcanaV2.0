#!/usr/bin/env node
/**
 * New Arcana Stats Engine v2 — CLI Entry Point
 *
 * Usage: node index.js [options]
 *   --games N       Number of games (default: 1000)
 *   --players N     Number of players (default: 4)
 *   --extended      Use 6-player card set
 *   --ai TYPE       AI assignment: diverse|random|all-random|all-builder|etc
 *   --seed N        Seed for reproducible results
 *   --verbose       Log individual games
 *   --json FILE     Output stats as JSON
 *   --single        Run one game with verbose logging
 *   --compare A B   A/B comparison: run same games under two configs
 */

import { runSimulation, runSingleGame } from './src/simulation.js';
import { aggregateStats, formatReport, computeCardAnalytics, formatCardReport } from './src/stats.js';
import { analyzeCardBalance } from './src/card-balance.js';
import { loadConfig } from './src/config.js';
import { runComparison, formatComparisonReport, generateComparisonHTML } from './src/compare.js';
import { writeFileSync, mkdirSync } from 'fs';

function parseArgs(argv) {
  const args = {
    games: 1000,
    players: 4,
    extended: false,
    ai: 'diverse',
    seed: undefined,
    verbose: false,
    json: null,
    single: false,
    report: false,
    cardBalance: false,
    config: null,
    compare: null, // [configA, configB] paths
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
      case '--seed':
        args.seed = parseInt(argv[++i]);
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
      case '--report':
        args.report = true;
        break;
      case '--card-balance':
        args.cardBalance = true;
        break;
      case '--config':
        args.config = argv[++i];
        break;
      case '--compare':
        args.compare = [argv[++i], argv[++i]];
        break;
      case '--help':
        console.log(`New Arcana Stats Engine v2

Usage: node index.js [options]
  --games N       Number of games (default: 1000)
  --players N     Number of players (default: 4)
  --extended      Use 6-player card set
  --ai TYPE       AI assignment: diverse|random|all-random|all-builder|etc
  --seed N        Seed for reproducible results
  --verbose       Log individual games
  --json FILE     Output stats as JSON
  --single        Run one game with verbose logging
  --report        Generate card analytics report
  --card-balance  Run card balance analysis (5 metrics with anomaly flags)
  --config FILE   Path to card/game config JSON (overrides defaults)
  --compare A B   A/B comparison mode: run same games under two config files`);
        process.exit(0);
    }
  }

  return args;
}

const args = parseArgs(process.argv);

// Load card/game config if specified
const cardConfig = args.config ? loadConfig(args.config) : undefined;

if (args.compare) {
  // A/B Comparison mode
  const [pathA, pathB] = args.compare;
  if (!pathA || !pathB) {
    console.error('Error: --compare requires two config file paths');
    process.exit(1);
  }

  const configA = loadConfig(pathA);
  const configB = loadConfig(pathB);

  console.log(`Running A/B comparison: ${pathA} vs ${pathB}`);
  console.log(`${args.games} games | ${args.players} players | Seed: ${args.seed ?? 'random'}\n`);

  const startTime = Date.now();
  const comparison = runComparison(configA, configB, {
    games: args.games,
    players: args.players,
    extended: args.extended,
    aiAssignment: args.ai,
    seed: args.seed,
  });
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`Completed in ${elapsed}s\n`);

  const report = formatComparisonReport(comparison);
  console.log(report);

  if (args.json) {
    try {
      const dir = args.json.includes('/') ? args.json.substring(0, args.json.lastIndexOf('/')) : '.';
      if (dir !== '.') mkdirSync(dir, { recursive: true });

      // Write JSON data
      const jsonOutput = {
        configDiff: comparison.configDiff,
        simOpts: comparison.simOpts,
        statsA: comparison.statsA,
        statsB: comparison.statsB,
        diff: comparison.diff,
      };
      writeFileSync(args.json, JSON.stringify(jsonOutput, null, 2));
      console.log(`\nJSON comparison saved to ${args.json}`);

      // Write HTML report alongside JSON
      const htmlPath = args.json.replace(/\.json$/, '.html');
      const html = generateComparisonHTML(comparison);
      writeFileSync(htmlPath, html);
      console.log(`HTML comparison saved to ${htmlPath}`);
    } catch (e) {
      console.error(`Failed to write output: ${e.message}`);
    }
  }
} else if (args.single) {
  console.log(`Running single game with ${args.players} players (${args.ai})...\n`);
  runSingleGame({
    players: args.players,
    extended: args.extended,
    aiAssignment: args.ai,
    seed: args.seed,
    cardConfig,
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
    seed: args.seed,
    cardConfig,
  });

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`Completed in ${elapsed}s\n`);

  const stats = aggregateStats(simResults);
  const report = formatReport(stats);
  console.log(report);

  let cardAnalytics = null;
  if (args.report) {
    cardAnalytics = computeCardAnalytics(simResults.results);
    const cardReport = formatCardReport(cardAnalytics);
    console.log(cardReport);
  }

  if (args.cardBalance) {
    const balanceResult = analyzeCardBalance(simResults.results);
    console.log(balanceResult.text);
    if (args.json) {
      cardAnalytics = cardAnalytics || {};
      cardAnalytics.cardBalance = balanceResult.metrics;
    }
  }

  if (args.json) {
    try {
      // Ensure directory exists
      const dir = args.json.includes('/') ? args.json.substring(0, args.json.lastIndexOf('/')) : '.';
      if (dir !== '.') mkdirSync(dir, { recursive: true });
      const jsonOutput = cardAnalytics ? { ...stats, cardAnalytics } : stats;
      writeFileSync(args.json, JSON.stringify(jsonOutput, null, 2));
      console.log(`\nJSON stats saved to ${args.json}`);
    } catch (e) {
      console.error(`Failed to write JSON: ${e.message}`);
    }
  }
}
