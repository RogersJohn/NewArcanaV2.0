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
    cardStats: computeCardStats(results),
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
 * Compute per-card statistics across all games.
 */
function computeCardStats(results) {
  const cards = {};

  for (const game of results) {
    if (!game.cardEvents) continue;
    for (const [numStr, events] of Object.entries(game.cardEvents)) {
      const num = Number(numStr);
      if (!cards[num]) {
        cards[num] = {
          name: events.name,
          purchased: 0, purchasedByWinner: 0,
          toTome: 0, toTomeByWinner: 0,
          actionPlayed: 0, wildPlayed: 0,
          bonusScored: 0, bonusFailed: 0, bonusVpTotal: 0,
          bonusScoredByWinner: 0,
          gamesAppearing: 0,
        };
      }
      const c = cards[num];
      c.purchased += events.purchased;
      c.purchasedByWinner += events.purchasedByWinner;
      c.toTome += events.toTome;
      c.toTomeByWinner += events.toTomeByWinner;
      c.actionPlayed += events.actionPlayed;
      c.wildPlayed += events.wildPlayed;
      c.bonusScored += events.bonusScored;
      c.bonusFailed += events.bonusFailed;
      c.bonusVpTotal += events.bonusVpTotal;
      c.bonusScoredByWinner += events.bonusScoredByWinner;
      if (events.purchased || events.toTome || events.actionPlayed || events.wildPlayed) {
        c.gamesAppearing++;
      }
    }
  }

  // Calculate derived stats
  for (const c of Object.values(cards)) {
    c.bonusSuccessRate = c.bonusScored + c.bonusFailed > 0
      ? c.bonusScored / (c.bonusScored + c.bonusFailed)
      : null;
    c.winnerAffinity = c.purchased > 0
      ? c.purchasedByWinner / c.purchased
      : null;
    c.avgBonusVp = c.bonusScored > 0
      ? c.bonusVpTotal / c.bonusScored
      : 0;
  }

  return cards;
}

/**
 * Compute card analytics from per-game cardEvents data.
 * @param {object[]} results - Game results with cardEvents
 * @returns {object} Card analytics
 */
export function computeCardAnalytics(results) {
  const totalGames = results.length;
  const cards = {};

  function ensure(num, name) {
    if (!cards[num]) {
      cards[num] = {
        name: name || `Card ${num}`, number: num,
        purchased: 0, purchasedByWinner: 0,
        toTome: 0, toTomeByWinner: 0,
        actionPlayed: 0, wildPlayed: 0,
        bonusScored: 0, bonusFailed: 0, bonusVpTotal: 0,
        bonusScoredByWinner: 0,
        inWinnerTome: 0,
      };
    }
  }

  // Aggregate per-game card events
  for (const game of results) {
    if (!game.cardEvents) continue;
    for (const [numStr, data] of Object.entries(game.cardEvents)) {
      const num = parseInt(numStr);
      ensure(num, data.name);
      const c = cards[num];
      c.purchased += data.purchased;
      c.purchasedByWinner += data.purchasedByWinner;
      c.toTome += data.toTome;
      c.toTomeByWinner += data.toTomeByWinner;
      c.actionPlayed += data.actionPlayed;
      c.wildPlayed += data.wildPlayed;
      c.bonusScored += data.bonusScored;
      c.bonusFailed += data.bonusFailed;
      c.bonusVpTotal += data.bonusVpTotal;
      c.bonusScoredByWinner += data.bonusScoredByWinner;
    }

    // Count cards in winner's tome
    const winnerPi = game.winner.playerIndex;
    const winnerTome = game.players[winnerPi]?.tomeCards || [];
    for (const name of winnerTome) {
      if (name === 'minor') continue;
      // Find matching card number
      const entry = Object.values(cards).find(c => c.name === name);
      if (entry) entry.inWinnerTome++;
    }
  }

  const cardList = Object.values(cards).sort((a, b) => a.number - b.number);

  return {
    totalGames,
    purchaseFrequency: computePurchaseFrequency(cardList, totalGames),
    winnerTomePresence: computeWinnerTomePresence(cardList, totalGames),
    bonusSuccessRates: computeBonusSuccessRates(cardList),
    winCorrelation: computeWinCorrelation(cardList, totalGames),
    actionUsage: computeActionUsage(cardList, totalGames),
    wildUsage: computeWildUsage(cardList, totalGames),
    powerRankings: computePowerRankings(cardList, totalGames),
    rawCards: cards,
  };
}

function computePurchaseFrequency(cardList, totalGames) {
  return cardList
    .filter(c => c.purchased > 0)
    .sort((a, b) => b.purchased - a.purchased)
    .map(c => ({
      number: c.number, name: c.name,
      total: c.purchased,
      perGame: Math.round((c.purchased / totalGames) * 1000) / 1000,
      byWinner: c.purchasedByWinner,
      winnerShare: c.purchased > 0 ? Math.round((c.purchasedByWinner / c.purchased) * 1000) / 1000 : 0,
    }));
}

function computeWinnerTomePresence(cardList, totalGames) {
  return cardList
    .filter(c => c.inWinnerTome > 0)
    .sort((a, b) => b.inWinnerTome - a.inWinnerTome)
    .map(c => ({
      number: c.number, name: c.name,
      count: c.inWinnerTome,
      rate: Math.round((c.inWinnerTome / totalGames) * 1000) / 1000,
    }));
}

function computeBonusSuccessRates(cardList) {
  return cardList
    .filter(c => c.bonusScored > 0 || c.bonusFailed > 0)
    .sort((a, b) => (b.bonusScored + b.bonusFailed) - (a.bonusScored + a.bonusFailed))
    .map(c => {
      const total = c.bonusScored + c.bonusFailed;
      return {
        number: c.number, name: c.name,
        scored: c.bonusScored, failed: c.bonusFailed,
        successRate: total > 0 ? Math.round((c.bonusScored / total) * 1000) / 1000 : 0,
        avgVp: c.bonusScored > 0 ? Math.round((c.bonusVpTotal / c.bonusScored) * 100) / 100 : 0,
        totalVp: c.bonusVpTotal,
      };
    });
}

function computeWinCorrelation(cardList, totalGames) {
  return cardList
    .filter(c => c.toTome > 0)
    .sort((a, b) => {
      const rateA = a.toTome > 0 ? a.toTomeByWinner / a.toTome : 0;
      const rateB = b.toTome > 0 ? b.toTomeByWinner / b.toTome : 0;
      return rateB - rateA;
    })
    .map(c => ({
      number: c.number, name: c.name,
      timesInTome: c.toTome, timesInWinnerTome: c.toTomeByWinner,
      winRate: c.toTome > 0 ? Math.round((c.toTomeByWinner / c.toTome) * 1000) / 1000 : 0,
    }));
}

function computeActionUsage(cardList, totalGames) {
  return cardList
    .filter(c => c.actionPlayed > 0)
    .sort((a, b) => b.actionPlayed - a.actionPlayed)
    .map(c => ({
      number: c.number, name: c.name,
      total: c.actionPlayed,
      perGame: Math.round((c.actionPlayed / totalGames) * 1000) / 1000,
    }));
}

function computeWildUsage(cardList, totalGames) {
  return cardList
    .filter(c => c.wildPlayed > 0)
    .sort((a, b) => b.wildPlayed - a.wildPlayed)
    .map(c => ({
      number: c.number, name: c.name,
      total: c.wildPlayed,
      perGame: Math.round((c.wildPlayed / totalGames) * 1000) / 1000,
    }));
}

/**
 * Composite power ranking: 50% winner-tome presence, 30% purchase demand, 20% VP generation.
 */
function computePowerRankings(cardList, totalGames) {
  // Normalize each dimension to 0-1
  const maxTomePresence = Math.max(1, ...cardList.map(c => c.inWinnerTome));
  const maxPurchased = Math.max(1, ...cardList.map(c => c.purchased));
  const maxVp = Math.max(1, ...cardList.map(c => c.bonusVpTotal));

  return cardList
    .filter(c => c.purchased > 0 || c.toTome > 0 || c.inWinnerTome > 0)
    .map(c => {
      const tomeScore = c.inWinnerTome / maxTomePresence;
      const purchaseScore = c.purchased / maxPurchased;
      const vpScore = c.bonusVpTotal / maxVp;
      const composite = tomeScore * 0.5 + purchaseScore * 0.3 + vpScore * 0.2;
      return {
        number: c.number, name: c.name,
        composite: Math.round(composite * 1000) / 1000,
        tomeScore: Math.round(tomeScore * 1000) / 1000,
        purchaseScore: Math.round(purchaseScore * 1000) / 1000,
        vpScore: Math.round(vpScore * 1000) / 1000,
      };
    })
    .sort((a, b) => b.composite - a.composite);
}

/**
 * Format card analytics as a console report.
 * @param {object} analytics - From computeCardAnalytics()
 * @returns {string}
 */
export function formatCardReport(analytics) {
  const lines = [];
  lines.push('');
  lines.push('='.repeat(60));
  lines.push('  CARD ANALYTICS REPORT');
  lines.push('='.repeat(60));
  lines.push(`Based on ${analytics.totalGames} games`);
  lines.push('');

  // Power Rankings
  lines.push('--- POWER RANKINGS (composite score) ---');
  lines.push('  Rank  Card                     Score  Tome  Buy   VP');
  const pr = analytics.powerRankings.slice(0, 15);
  for (let i = 0; i < pr.length; i++) {
    const c = pr[i];
    const rank = String(i + 1).padStart(2);
    const name = `[${c.number}] ${c.name}`.padEnd(24);
    lines.push(`  ${rank}.  ${name} ${c.composite.toFixed(3)}  ${c.tomeScore.toFixed(2)}  ${c.purchaseScore.toFixed(2)}  ${c.vpScore.toFixed(2)}`);
  }
  lines.push('');

  // Purchase Frequency
  lines.push('--- PURCHASE FREQUENCY ---');
  lines.push('  Card                     Total  Per Game  Winner%');
  for (const c of analytics.purchaseFrequency.slice(0, 15)) {
    const name = `[${c.number}] ${c.name}`.padEnd(24);
    lines.push(`  ${name} ${String(c.total).padStart(5)}  ${c.perGame.toFixed(3).padStart(8)}  ${(c.winnerShare * 100).toFixed(1).padStart(6)}%`);
  }
  lines.push('');

  // Winner Tome Presence
  lines.push('--- CARDS IN WINNING TOMES ---');
  lines.push('  Card                     Count  Rate');
  for (const c of analytics.winnerTomePresence.slice(0, 15)) {
    const name = `[${c.number}] ${c.name}`.padEnd(24);
    lines.push(`  ${name} ${String(c.count).padStart(5)}  ${(c.rate * 100).toFixed(1).padStart(5)}%`);
  }
  lines.push('');

  // Bonus Success Rates
  if (analytics.bonusSuccessRates.length > 0) {
    lines.push('--- BONUS SUCCESS RATES ---');
    lines.push('  Card                     OK   Fail  Rate    AvgVP  TotalVP');
    for (const c of analytics.bonusSuccessRates) {
      const name = `[${c.number}] ${c.name}`.padEnd(24);
      lines.push(`  ${name} ${String(c.scored).padStart(4)}  ${String(c.failed).padStart(4)}  ${(c.successRate * 100).toFixed(1).padStart(5)}%  ${c.avgVp.toFixed(2).padStart(5)}  ${String(c.totalVp).padStart(7)}`);
    }
    lines.push('');
  }

  // Win Correlation
  lines.push('--- CARD-IN-TOME WIN CORRELATION ---');
  lines.push('  Card                     In Tome  In Winner  Win%');
  for (const c of analytics.winCorrelation.slice(0, 15)) {
    const name = `[${c.number}] ${c.name}`.padEnd(24);
    lines.push(`  ${name} ${String(c.timesInTome).padStart(7)}  ${String(c.timesInWinnerTome).padStart(9)}  ${(c.winRate * 100).toFixed(1).padStart(5)}%`);
  }
  lines.push('');

  // Action Usage
  if (analytics.actionUsage.length > 0) {
    lines.push('--- ACTION CARD USAGE ---');
    lines.push('  Card                     Total  Per Game');
    for (const c of analytics.actionUsage) {
      const name = `[${c.number}] ${c.name}`.padEnd(24);
      lines.push(`  ${name} ${String(c.total).padStart(5)}  ${c.perGame.toFixed(3).padStart(8)}`);
    }
    lines.push('');
  }

  // Wild Usage
  if (analytics.wildUsage.length > 0) {
    lines.push('--- WILD CARD USAGE ---');
    lines.push('  Card                     Total  Per Game');
    for (const c of analytics.wildUsage) {
      const name = `[${c.number}] ${c.name}`.padEnd(24);
      lines.push(`  ${name} ${String(c.total).padStart(5)}  ${c.perGame.toFixed(3).padStart(8)}`);
    }
    lines.push('');
  }

  lines.push('='.repeat(60));
  return lines.join('\n');
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

  // Major Arcana Card Stats
  if (stats.cardStats && Object.keys(stats.cardStats).length > 0) {
    lines.push('--- MAJOR ARCANA CARD STATS ---');
    const header = '  ' +
      'Card Name'.padEnd(24) + '| ' +
      'Purchased'.padEnd(11) + '| ' +
      'In Winner Tome'.padEnd(16) + '| ' +
      'Bonus Rate'.padEnd(12) + '| ' +
      'Avg Bonus VP'.padEnd(14) + '| ' +
      'Used as Wild';
    lines.push(header);
    lines.push('  ' + '-'.repeat(header.length - 2));

    // Sort by purchasedByWinner descending
    const sortedCards = Object.entries(stats.cardStats)
      .sort((a, b) => b[1].purchasedByWinner - a[1].purchasedByWinner);

    for (const [num, c] of sortedCards) {
      const name = c.name;
      const bonusRate = c.bonusSuccessRate !== null
        ? `${(c.bonusSuccessRate * 100).toFixed(0)}%`
        : '-';
      const avgBonusVp = c.bonusScored > 0
        ? c.avgBonusVp.toFixed(1)
        : '-';
      const row = '  ' +
        name.padEnd(24) + '| ' +
        String(c.purchased).padStart(5).padEnd(11) + '| ' +
        String(c.toTomeByWinner).padStart(8).padEnd(16) + '| ' +
        bonusRate.padStart(6).padEnd(12) + '| ' +
        avgBonusVp.padStart(8).padEnd(14) + '| ' +
        String(c.wildPlayed).padStart(5);
      lines.push(row);
    }
    lines.push('');
  }

  lines.push('='.repeat(60));

  return lines.join('\n');
}
