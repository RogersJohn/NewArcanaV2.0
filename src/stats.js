/**
 * Statistics aggregation and reporting for New Arcana simulations.
 */

/**
 * Aggregate statistics from simulation results.
 * @param {object} simResults - From runSimulation()
 * @returns {object} Aggregated statistics
 */
export function aggregateStats(simResults) {
  const { results, config } = simResults;
  if (results.length === 0) {
    return { error: 'No completed games' };
  }

  return {
    config,
    totalGames: results.length,
    errors: simResults.errors,
    aiWinRates: computeAIWinRates(results),
    gameEndReasons: computeGameEndReasons(results),
    celestialWinRate: computeCelestialWinRate(results),
    averageGameLength: computeAverageGameLength(results),
    vpDistribution: computeVPDistribution(results),
    firstPlayerAdvantage: computeFirstPlayerAdvantage(results),
    strategyEffectiveness: computeStrategyEffectiveness(results),
  };
}

/**
 * Compute win rates by AI type with 95% confidence intervals.
 */
function computeAIWinRates(results) {
  const wins = {};
  const appearances = {};

  for (const game of results) {
    for (const player of game.players) {
      const ai = player.aiType;
      appearances[ai] = (appearances[ai] || 0) + 1;
    }
    wins[game.winner.aiType] = (wins[game.winner.aiType] || 0) + 1;
  }

  const rates = {};
  for (const ai of Object.keys(appearances)) {
    const w = wins[ai] || 0;
    const n = appearances[ai];
    const rate = w / n;
    // Wilson score interval for 95% CI
    const z = 1.96;
    const denom = 1 + z * z / n;
    const center = (rate + z * z / (2 * n)) / denom;
    const spread = z * Math.sqrt((rate * (1 - rate) + z * z / (4 * n)) / n) / denom;

    rates[ai] = {
      wins: w,
      games: n,
      winRate: rate,
      ci95: [Math.max(0, center - spread), Math.min(1, center + spread)],
    };
  }

  return rates;
}

/**
 * Compute game end reason frequencies.
 */
function computeGameEndReasons(results) {
  const reasons = {};
  for (const game of results) {
    reasons[game.gameEndReason] = (reasons[game.gameEndReason] || 0) + 1;
  }
  return reasons;
}

/**
 * Compute celestial win rate.
 */
function computeCelestialWinRate(results) {
  const celestialWins = results.filter(r => r.isCelestialWin).length;
  return {
    count: celestialWins,
    rate: celestialWins / results.length,
  };
}

/**
 * Compute average game length (rounds).
 */
function computeAverageGameLength(results) {
  const lengths = results.map(r => r.roundsPlayed);
  const mean = lengths.reduce((a, b) => a + b, 0) / lengths.length;
  const sorted = [...lengths].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  const min = sorted[0];
  const max = sorted[sorted.length - 1];
  const variance = lengths.reduce((s, v) => s + (v - mean) ** 2, 0) / lengths.length;

  return { mean, median, min, max, stddev: Math.sqrt(variance) };
}

/**
 * Compute VP distribution across all games.
 */
function computeVPDistribution(results) {
  const allVps = [];
  const winnerVps = [];

  for (const game of results) {
    for (const player of game.players) {
      allVps.push(player.vp);
    }
    winnerVps.push(game.winner.vp);
  }

  return {
    all: computeDistStats(allVps),
    winners: computeDistStats(winnerVps),
  };
}

function computeDistStats(values) {
  if (values.length === 0) return { mean: 0, median: 0, stddev: 0, min: 0, max: 0 };
  const sorted = [...values].sort((a, b) => a - b);
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const median = sorted[Math.floor(sorted.length / 2)];
  const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length;

  return {
    mean: Math.round(mean * 100) / 100,
    median,
    stddev: Math.round(Math.sqrt(variance) * 100) / 100,
    min: sorted[0],
    max: sorted[sorted.length - 1],
  };
}

/**
 * Compute first-player advantage.
 */
function computeFirstPlayerAdvantage(results) {
  const winsByPosition = {};
  const gamesByPosition = {};

  for (const game of results) {
    for (const player of game.players) {
      const pos = player.position;
      gamesByPosition[pos] = (gamesByPosition[pos] || 0) + 1;
    }
    winsByPosition[game.winner.playerIndex] =
      (winsByPosition[game.winner.playerIndex] || 0) + 1;
  }

  const rates = {};
  for (const pos of Object.keys(gamesByPosition)) {
    const wins = winsByPosition[pos] || 0;
    const games = gamesByPosition[pos];
    rates[`position_${pos}`] = {
      wins,
      games,
      winRate: Math.round((wins / games) * 1000) / 1000,
    };
  }

  return rates;
}

/**
 * Compute average VP for each AI type (even when losing).
 */
function computeStrategyEffectiveness(results) {
  const vpSums = {};
  const appearances = {};

  for (const game of results) {
    for (const player of game.players) {
      const ai = player.aiType;
      vpSums[ai] = (vpSums[ai] || 0) + player.vp;
      appearances[ai] = (appearances[ai] || 0) + 1;
    }
  }

  const effectiveness = {};
  for (const ai of Object.keys(appearances)) {
    effectiveness[ai] = {
      avgVp: Math.round((vpSums[ai] / appearances[ai]) * 100) / 100,
      totalGames: appearances[ai],
    };
  }

  return effectiveness;
}

/**
 * Format stats as a console report.
 * @param {object} stats - From aggregateStats()
 * @returns {string}
 */
export function formatReport(stats) {
  const lines = [];
  lines.push('='.repeat(60));
  lines.push('  NEW ARCANA STATS ENGINE v2 — SIMULATION REPORT');
  lines.push('='.repeat(60));
  lines.push(`Games: ${stats.totalGames} | Players: ${stats.config.players} | Errors: ${stats.errors}`);
  lines.push(`AI Assignment: ${stats.config.aiAssignment}`);
  lines.push('');

  // AI Win Rates
  lines.push('--- AI WIN RATES ---');
  const rates = Object.entries(stats.aiWinRates).sort((a, b) => b[1].winRate - a[1].winRate);
  for (const [ai, data] of rates) {
    const pct = (data.winRate * 100).toFixed(1);
    const ci = `[${(data.ci95[0] * 100).toFixed(1)}%, ${(data.ci95[1] * 100).toFixed(1)}%]`;
    lines.push(`  ${ai.padEnd(12)} ${pct}% (${data.wins}/${data.games}) CI95: ${ci}`);
  }
  lines.push('');

  // Strategy Effectiveness
  lines.push('--- STRATEGY EFFECTIVENESS (avg VP) ---');
  const strats = Object.entries(stats.strategyEffectiveness).sort((a, b) => b[1].avgVp - a[1].avgVp);
  for (const [ai, data] of strats) {
    lines.push(`  ${ai.padEnd(12)} ${data.avgVp.toFixed(2)} avg VP (${data.totalGames} games)`);
  }
  lines.push('');

  // Game End Reasons
  lines.push('--- GAME END REASONS ---');
  for (const [reason, count] of Object.entries(stats.gameEndReasons)) {
    const pct = ((count / stats.totalGames) * 100).toFixed(1);
    lines.push(`  ${reason.padEnd(20)} ${count} (${pct}%)`);
  }
  lines.push('');

  // Game Length
  const gl = stats.averageGameLength;
  lines.push('--- GAME LENGTH (rounds) ---');
  lines.push(`  Mean: ${gl.mean.toFixed(1)} | Median: ${gl.median} | StdDev: ${gl.stddev.toFixed(1)} | Range: [${gl.min}, ${gl.max}]`);
  lines.push('');

  // Celestial Win Rate
  const cw = stats.celestialWinRate;
  lines.push('--- CELESTIAL WIN RATE ---');
  lines.push(`  ${cw.count} / ${stats.totalGames} (${(cw.rate * 100).toFixed(1)}%)`);
  lines.push('');

  // VP Distribution
  const vpAll = stats.vpDistribution.all;
  const vpWin = stats.vpDistribution.winners;
  lines.push('--- VP DISTRIBUTION ---');
  lines.push(`  All players: mean=${vpAll.mean}, median=${vpAll.median}, stddev=${vpAll.stddev}, range=[${vpAll.min}, ${vpAll.max}]`);
  lines.push(`  Winners:     mean=${vpWin.mean}, median=${vpWin.median}, stddev=${vpWin.stddev}, range=[${vpWin.min}, ${vpWin.max}]`);
  lines.push('');

  // First Player Advantage
  lines.push('--- POSITION WIN RATES ---');
  for (const [pos, data] of Object.entries(stats.firstPlayerAdvantage)) {
    lines.push(`  ${pos.padEnd(12)} ${(data.winRate * 100).toFixed(1)}% (${data.wins}/${data.games})`);
  }

  lines.push('');
  lines.push('='.repeat(60));

  return lines.join('\n');
}
