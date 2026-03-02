/**
 * A/B comparison mode for New Arcana simulations.
 * Runs the same games under two configs, produces a diff report.
 */

import { runSimulation } from './simulation.js';
import { aggregateStats, computeCardAnalytics } from './stats.js';

/**
 * Run a full A/B comparison between two configs.
 * @param {object} configA - Merged card/game config A
 * @param {object} configB - Merged card/game config B
 * @param {object} simOpts - Simulation options (games, players, extended, aiAssignment, seed)
 * @returns {object} Comparison results with stats and diff
 */
export function runComparison(configA, configB, simOpts) {
  const baseOpts = {
    games: simOpts.games || 1000,
    players: simOpts.players || 4,
    extended: simOpts.extended || false,
    aiAssignment: simOpts.aiAssignment || 'diverse',
    seed: simOpts.seed,
    verbose: false,
  };

  const simA = runSimulation({ ...baseOpts, cardConfig: configA });
  const simB = runSimulation({ ...baseOpts, cardConfig: configB });

  const statsA = aggregateStats(simA);
  const statsB = aggregateStats(simB);

  const analyticsA = computeCardAnalytics(simA.results);
  const analyticsB = computeCardAnalytics(simB.results);

  const diff = computeDiff(statsA, statsB, analyticsA, analyticsB);
  const configDiff = diffConfigs(configA, configB);

  return {
    configA, configB, configDiff,
    statsA, statsB,
    analyticsA, analyticsB,
    diff,
    simOpts: baseOpts,
  };
}

/**
 * Compute all diffs between two stat sets.
 * @param {object} statsA
 * @param {object} statsB
 * @param {object} analyticsA
 * @param {object} analyticsB
 * @returns {object} Diff object
 */
export function computeDiff(statsA, statsB, analyticsA, analyticsB) {
  return {
    winRates: diffWinRates(statsA.aiWinRates, statsB.aiWinRates),
    vpDistribution: diffVP(statsA.vpDistribution, statsB.vpDistribution, statsA.totalGames, statsB.totalGames),
    gameLength: diffGameLength(statsA.averageGameLength, statsB.averageGameLength, statsA.totalGames, statsB.totalGames),
    gameEndReasons: diffGameEndReasons(statsA.gameEndReasons, statsB.gameEndReasons, statsA.totalGames, statsB.totalGames),
    celestialWinRate: diffCelestialWin(statsA.celestialWinRate, statsB.celestialWinRate),
    cardPower: diffCardPower(analyticsA.powerRankings, analyticsB.powerRankings),
    strategyEffectiveness: diffStrategy(statsA.strategyEffectiveness, statsB.strategyEffectiveness),
  };
}

/**
 * Flat diff of two config objects. Only shows keys where values differ.
 * @param {object} a
 * @param {object} b
 * @param {string} [prefix='']
 * @returns {object[]} Array of { key, valueA, valueB }
 */
export function diffConfigs(a, b, prefix = '') {
  const diffs = [];
  const allKeys = new Set([...Object.keys(a || {}), ...Object.keys(b || {})]);

  for (const key of allKeys) {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    const valA = a?.[key];
    const valB = b?.[key];

    if (valA !== null && typeof valA === 'object' && !Array.isArray(valA) &&
        valB !== null && typeof valB === 'object' && !Array.isArray(valB)) {
      diffs.push(...diffConfigs(valA, valB, fullKey));
    } else if (JSON.stringify(valA) !== JSON.stringify(valB)) {
      diffs.push({ key: fullKey, valueA: valA, valueB: valB });
    }
  }

  return diffs;
}

// --- Win rate diff with significance ---

function diffWinRates(ratesA, ratesB) {
  const allAIs = new Set([...Object.keys(ratesA), ...Object.keys(ratesB)]);
  const diffs = [];

  for (const ai of allAIs) {
    const a = ratesA[ai] || { winRate: 0, ci95: [0, 0], wins: 0, games: 0 };
    const b = ratesB[ai] || { winRate: 0, ci95: [0, 0], wins: 0, games: 0 };
    const delta = b.winRate - a.winRate;

    // Significance: CIs don't overlap
    const ciOverlap = a.ci95[1] >= b.ci95[0] && b.ci95[1] >= a.ci95[0];
    const significance = !ciOverlap ? 'significant' : Math.abs(delta) > 0.02 ? 'marginal' : 'not significant';

    diffs.push({
      ai,
      rateA: a.winRate, rateB: b.winRate, delta,
      ciA: a.ci95, ciB: b.ci95,
      significance,
    });
  }

  return diffs.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
}

// --- VP distribution diff ---

function diffVP(vpA, vpB, nA, nB) {
  const allDelta = vpB.all.mean - vpA.all.mean;
  const winnerDelta = vpB.winners.mean - vpA.winners.mean;

  // Welch's t-test on means
  const allSig = welchTTest(vpA.all.mean, vpA.all.stddev, nA * 4, vpB.all.mean, vpB.all.stddev, nB * 4);
  const winnerSig = welchTTest(vpA.winners.mean, vpA.winners.stddev, nA, vpB.winners.mean, vpB.winners.stddev, nB);

  return {
    all: { meanA: vpA.all.mean, meanB: vpB.all.mean, delta: round2(allDelta), ...allSig },
    winners: { meanA: vpA.winners.mean, meanB: vpB.winners.mean, delta: round2(winnerDelta), ...winnerSig },
  };
}

// --- Game length diff ---

function diffGameLength(glA, glB, nA, nB) {
  const delta = glB.mean - glA.mean;
  const sig = welchTTest(glA.mean, glA.stddev, nA, glB.mean, glB.stddev, nB);

  return {
    meanA: round2(glA.mean), meanB: round2(glB.mean), delta: round2(delta),
    medianA: glA.median, medianB: glB.median,
    ...sig,
  };
}

// --- Game end reasons diff ---

function diffGameEndReasons(reasonsA, reasonsB, totalA, totalB) {
  const allReasons = new Set([...Object.keys(reasonsA), ...Object.keys(reasonsB)]);
  const diffs = [];

  for (const reason of allReasons) {
    const countA = reasonsA[reason] || 0;
    const countB = reasonsB[reason] || 0;
    const rateA = countA / totalA;
    const rateB = countB / totalB;
    diffs.push({
      reason,
      countA, countB,
      rateA: round3(rateA), rateB: round3(rateB),
      delta: round3(rateB - rateA),
    });
  }

  return diffs.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
}

// --- Celestial win rate diff ---

function diffCelestialWin(cwA, cwB) {
  return {
    rateA: cwA.rate, rateB: cwB.rate,
    delta: round3(cwB.rate - cwA.rate),
    countA: cwA.count, countB: cwB.count,
  };
}

// --- Card power ranking diff ---

function diffCardPower(rankingsA, rankingsB) {
  const mapA = new Map(rankingsA.map((c, i) => [c.number, { ...c, rank: i + 1 }]));
  const mapB = new Map(rankingsB.map((c, i) => [c.number, { ...c, rank: i + 1 }]));
  const allCards = new Set([...mapA.keys(), ...mapB.keys()]);

  const diffs = [];
  for (const num of allCards) {
    const a = mapA.get(num);
    const b = mapB.get(num);
    const rankA = a ? a.rank : rankingsA.length + 1;
    const rankB = b ? b.rank : rankingsB.length + 1;
    const scoreA = a ? a.composite : 0;
    const scoreB = b ? b.composite : 0;

    diffs.push({
      number: num,
      name: (a || b).name,
      rankA, rankB,
      rankDelta: rankA - rankB, // positive = moved up in B
      scoreA, scoreB,
      scoreDelta: round3(scoreB - scoreA),
    });
  }

  return diffs.sort((a, b) => Math.abs(b.rankDelta) - Math.abs(a.rankDelta));
}

// --- Strategy effectiveness diff ---

function diffStrategy(stratA, stratB) {
  const allAIs = new Set([...Object.keys(stratA), ...Object.keys(stratB)]);
  const diffs = [];

  for (const ai of allAIs) {
    const a = stratA[ai] || { avgVp: 0, totalGames: 0 };
    const b = stratB[ai] || { avgVp: 0, totalGames: 0 };
    diffs.push({
      ai,
      avgVpA: a.avgVp, avgVpB: b.avgVp,
      delta: round2(b.avgVp - a.avgVp),
    });
  }

  return diffs.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
}

// --- Welch's t-test ---

/**
 * Two-sample Welch's t-test approximation.
 * @returns {object} { tStat, significance }
 */
export function welchTTest(meanA, stdA, nA, meanB, stdB, nB) {
  if (nA < 2 || nB < 2 || (stdA === 0 && stdB === 0)) {
    return { tStat: 0, significance: 'not significant' };
  }

  const varA = stdA * stdA;
  const varB = stdB * stdB;
  const seA = varA / nA;
  const seB = varB / nB;
  const seDiff = Math.sqrt(seA + seB);

  if (seDiff === 0) return { tStat: 0, significance: 'not significant' };

  const t = (meanB - meanA) / seDiff;

  // Welch-Satterthwaite degrees of freedom
  const num = (seA + seB) ** 2;
  const denom = (seA ** 2) / (nA - 1) + (seB ** 2) / (nB - 1);
  const df = denom > 0 ? num / denom : 1;

  // Approximate p-value from t-distribution using normal approximation for large df
  const absT = Math.abs(t);
  let significance;
  if (df > 30) {
    // Use z-approximation
    significance = absT > 2.576 ? 'significant' : absT > 1.96 ? 'marginal' : 'not significant';
  } else {
    // Conservative: use higher thresholds for small df
    significance = absT > 3.0 ? 'significant' : absT > 2.1 ? 'marginal' : 'not significant';
  }

  return { tStat: round3(t), significance };
}

// --- Console report formatter ---

/**
 * Format comparison results as a console text report.
 * @param {object} comparison - From runComparison()
 * @returns {string}
 */
export function formatComparisonReport(comparison) {
  const { configDiff, diff, simOpts, statsA, statsB } = comparison;
  const lines = [];

  lines.push('='.repeat(70));
  lines.push('  NEW ARCANA — A/B COMPARISON REPORT');
  lines.push('='.repeat(70));
  lines.push(`Games: ${simOpts.games} | Players: ${simOpts.players} | Seed: ${simOpts.seed ?? 'random'}`);
  lines.push('');

  // Config diff
  lines.push('--- CONFIG CHANGES ---');
  if (configDiff.length === 0) {
    lines.push('  (no differences — configs are identical)');
  } else {
    for (const d of configDiff) {
      lines.push(`  ${d.key}: ${JSON.stringify(d.valueA)} -> ${JSON.stringify(d.valueB)}`);
    }
  }
  lines.push('');

  // Win rate deltas
  lines.push('--- WIN RATE DELTAS ---');
  lines.push('  AI Type      Config A   Config B   Delta    Significance');
  for (const d of diff.winRates) {
    const ai = d.ai.padEnd(12);
    const rA = (d.rateA * 100).toFixed(1).padStart(6) + '%';
    const rB = (d.rateB * 100).toFixed(1).padStart(6) + '%';
    const delta = formatDelta(d.delta * 100, '%');
    const sig = sigMarker(d.significance);
    lines.push(`  ${ai} ${rA}    ${rB}    ${delta.padStart(8)}  ${sig}`);
  }
  lines.push('');

  // Strategy effectiveness (avg VP)
  lines.push('--- STRATEGY EFFECTIVENESS (avg VP) ---');
  lines.push('  AI Type      Config A   Config B   Delta    Significance');
  for (const d of diff.strategyEffectiveness) {
    const ai = d.ai.padEnd(12);
    const vpA = d.avgVpA.toFixed(2).padStart(7);
    const vpB = d.avgVpB.toFixed(2).padStart(7);
    const delta = formatDelta(d.delta, 'vp');
    lines.push(`  ${ai} ${vpA}    ${vpB}    ${delta.padStart(8)}`);
  }
  lines.push('');

  // VP distribution
  lines.push('--- VP DISTRIBUTION ---');
  const vpAll = diff.vpDistribution.all;
  const vpWin = diff.vpDistribution.winners;
  lines.push(`  All players:  ${vpAll.meanA.toFixed(2)} -> ${vpAll.meanB.toFixed(2)}  (${formatDelta(vpAll.delta)})  ${sigMarker(vpAll.significance)}`);
  lines.push(`  Winners:      ${vpWin.meanA.toFixed(2)} -> ${vpWin.meanB.toFixed(2)}  (${formatDelta(vpWin.delta)})  ${sigMarker(vpWin.significance)}`);
  lines.push('');

  // Game length
  lines.push('--- GAME LENGTH ---');
  const gl = diff.gameLength;
  lines.push(`  Mean rounds:  ${gl.meanA} -> ${gl.meanB}  (${formatDelta(gl.delta)})  ${sigMarker(gl.significance)}`);
  lines.push(`  Median:       ${gl.medianA} -> ${gl.medianB}`);
  lines.push('');

  // Game end reasons
  lines.push('--- GAME END REASONS ---');
  for (const d of diff.gameEndReasons) {
    const reason = d.reason.padEnd(20);
    const rA = (d.rateA * 100).toFixed(1).padStart(5) + '%';
    const rB = (d.rateB * 100).toFixed(1).padStart(5) + '%';
    const delta = formatDelta(d.delta * 100, '%');
    lines.push(`  ${reason} ${rA}  ->  ${rB}  (${delta})`);
  }
  lines.push('');

  // Celestial win rate
  const cw = diff.celestialWinRate;
  lines.push('--- CELESTIAL WIN RATE ---');
  lines.push(`  ${(cw.rateA * 100).toFixed(1)}% -> ${(cw.rateB * 100).toFixed(1)}%  (${formatDelta(cw.delta * 100, '%')})`);
  lines.push('');

  // Card power ranking shifts (top movers)
  lines.push('--- CARD POWER RANKING SHIFTS (top 15) ---');
  lines.push('  Card                     Rank A  Rank B  Move   Score Delta');
  for (const d of diff.cardPower.slice(0, 15)) {
    const name = `[${d.number}] ${d.name}`.padEnd(24);
    const rA = String(d.rankA).padStart(4);
    const rB = String(d.rankB).padStart(4);
    const move = d.rankDelta > 0 ? `+${d.rankDelta}`.padStart(5) : String(d.rankDelta).padStart(5);
    const sDelta = formatDelta(d.scoreDelta);
    lines.push(`  ${name} ${rA}    ${rB}    ${move}  ${sDelta.padStart(8)}`);
  }
  lines.push('');

  lines.push('='.repeat(70));
  return lines.join('\n');
}

// --- HTML report generator ---

/**
 * Generate a self-contained HTML comparison report.
 * @param {object} comparison - From runComparison()
 * @returns {string} HTML string
 */
export function generateComparisonHTML(comparison) {
  const { configDiff, diff, simOpts, statsA, statsB } = comparison;

  const configRows = configDiff.map(d =>
    `<tr><td>${esc(d.key)}</td><td class="val-a">${esc(JSON.stringify(d.valueA))}</td><td class="val-b">${esc(JSON.stringify(d.valueB))}</td></tr>`
  ).join('\n');

  const winRateRows = diff.winRates.map(d => {
    const deltaClass = d.delta > 0 ? 'up' : d.delta < 0 ? 'down' : '';
    return `<tr>
      <td>${esc(d.ai)}</td>
      <td>${(d.rateA * 100).toFixed(1)}%</td>
      <td>${(d.rateB * 100).toFixed(1)}%</td>
      <td class="${deltaClass}">${formatDelta(d.delta * 100, '%')}</td>
      <td class="sig-${d.significance.replace(' ', '-')}">${d.significance}</td>
    </tr>`;
  }).join('\n');

  const stratRows = diff.strategyEffectiveness.map(d => {
    const deltaClass = d.delta > 0 ? 'up' : d.delta < 0 ? 'down' : '';
    return `<tr>
      <td>${esc(d.ai)}</td>
      <td>${d.avgVpA.toFixed(2)}</td>
      <td>${d.avgVpB.toFixed(2)}</td>
      <td class="${deltaClass}">${formatDelta(d.delta, 'vp')}</td>
    </tr>`;
  }).join('\n');

  const endReasonRows = diff.gameEndReasons.map(d => {
    const deltaClass = d.delta > 0 ? 'up' : d.delta < 0 ? 'down' : '';
    return `<tr>
      <td>${esc(d.reason)}</td>
      <td>${(d.rateA * 100).toFixed(1)}%</td>
      <td>${(d.rateB * 100).toFixed(1)}%</td>
      <td class="${deltaClass}">${formatDelta(d.delta * 100, '%')}</td>
    </tr>`;
  }).join('\n');

  const cardPowerRows = diff.cardPower.slice(0, 20).map(d => {
    const moveClass = d.rankDelta > 0 ? 'up' : d.rankDelta < 0 ? 'down' : '';
    const moveStr = d.rankDelta > 0 ? `+${d.rankDelta}` : String(d.rankDelta);
    return `<tr>
      <td>[${d.number}] ${esc(d.name)}</td>
      <td>#${d.rankA}</td>
      <td>#${d.rankB}</td>
      <td class="${moveClass}">${moveStr}</td>
      <td>${d.scoreA.toFixed(3)}</td>
      <td>${d.scoreB.toFixed(3)}</td>
    </tr>`;
  }).join('\n');

  // Win rate bar chart data
  const winRateChartBars = diff.winRates.map(d => {
    const maxRate = Math.max(d.rateA, d.rateB, 0.01);
    const scale = 100 / Math.max(maxRate * 100, 1);
    return `
      <div class="bar-group">
        <div class="bar-label">${esc(d.ai)}</div>
        <div class="bar-pair">
          <div class="bar bar-a" style="width: ${(d.rateA * 100 * scale).toFixed(1)}%">
            <span>${(d.rateA * 100).toFixed(1)}%</span>
          </div>
          <div class="bar bar-b" style="width: ${(d.rateB * 100 * scale).toFixed(1)}%">
            <span>${(d.rateB * 100).toFixed(1)}%</span>
          </div>
        </div>
      </div>`;
  }).join('\n');

  const vpAll = diff.vpDistribution.all;
  const vpWin = diff.vpDistribution.winners;
  const gl = diff.gameLength;
  const cw = diff.celestialWinRate;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>New Arcana — A/B Comparison Report</title>
<style>
  :root {
    --bg: #0e1117;
    --surface: #161b22;
    --border: #30363d;
    --text: #e6edf3;
    --dim: #8b949e;
    --accent: #58a6ff;
    --gold: #f0c040;
    --green: #3fb950;
    --red: #f85149;
    --purple: #bc8cff;
    --orange: #d29922;
    --cyan: #39d2c0;
    --bar-a: #58a6ff;
    --bar-b: #f0c040;
  }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif;
    background: var(--bg); color: var(--text); line-height: 1.5;
  }
  .container { max-width: 1100px; margin: 0 auto; padding: 24px; }
  header { text-align: center; padding: 48px 0 16px; }
  header h1 { font-size: 2.2em; font-weight: 700; letter-spacing: -0.02em; }
  header h1 span { color: var(--gold); }
  header p { color: var(--dim); font-size: 1.05em; margin-top: 6px; }

  .summary {
    display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
    gap: 12px; margin: 24px 0 32px;
  }
  .stat-card {
    background: var(--surface); border: 1px solid var(--border);
    border-radius: 10px; padding: 14px 16px; text-align: center;
  }
  .stat-card .label { font-size: 0.75em; color: var(--dim); text-transform: uppercase; letter-spacing: 0.06em; }
  .stat-card .value { font-size: 1.5em; font-weight: 700; margin-top: 4px; }

  section { margin-bottom: 36px; }
  section h2 {
    font-size: 1.2em; font-weight: 600; margin-bottom: 14px;
    padding-bottom: 8px; border-bottom: 1px solid var(--border);
  }

  table { width: 100%; border-collapse: collapse; font-size: 0.9em; }
  th, td { padding: 8px 12px; text-align: left; border-bottom: 1px solid var(--border); }
  th { color: var(--dim); font-weight: 500; font-size: 0.85em; text-transform: uppercase; letter-spacing: 0.04em; }
  tr:hover { background: rgba(88,166,255,0.04); }

  .up { color: var(--green); }
  .down { color: var(--red); }
  .sig-significant { color: var(--green); font-weight: 600; }
  .sig-marginal { color: var(--orange); }
  .sig-not-significant { color: var(--dim); }

  .config-table td:first-child { font-family: monospace; color: var(--accent); }
  .val-a { color: var(--dim); }
  .val-b { color: var(--gold); font-weight: 500; }

  .bar-chart { margin: 16px 0; }
  .bar-group { margin-bottom: 12px; }
  .bar-label { font-size: 0.85em; color: var(--dim); margin-bottom: 4px; font-weight: 500; }
  .bar-pair { display: flex; flex-direction: column; gap: 3px; }
  .bar {
    height: 24px; border-radius: 4px; display: flex; align-items: center;
    padding: 0 8px; font-size: 0.8em; font-weight: 600; min-width: 50px;
    transition: width 0.3s;
  }
  .bar-a { background: var(--bar-a); color: #000; }
  .bar-b { background: var(--bar-b); color: #000; }

  .legend {
    display: flex; gap: 20px; margin: 12px 0 20px; font-size: 0.85em;
  }
  .legend-item { display: flex; align-items: center; gap: 6px; }
  .legend-swatch { width: 14px; height: 14px; border-radius: 3px; }

  .metric-row {
    display: grid; grid-template-columns: 140px 1fr; gap: 8px;
    padding: 8px 0; border-bottom: 1px solid var(--border);
    font-size: 0.9em;
  }
  .metric-label { color: var(--dim); font-weight: 500; }

  footer { text-align: center; padding: 32px 0; color: var(--dim); font-size: 0.8em; }
</style>
</head>
<body>
<div class="container">

<header>
  <h1>New Arcana — <span>A/B Comparison</span></h1>
  <p>${simOpts.games} games | ${simOpts.players} players | Seed: ${simOpts.seed ?? 'random'}</p>
</header>

<div class="summary">
  <div class="stat-card">
    <div class="label">Config Changes</div>
    <div class="value">${configDiff.length}</div>
  </div>
  <div class="stat-card">
    <div class="label">Games Each</div>
    <div class="value">${simOpts.games}</div>
  </div>
  <div class="stat-card">
    <div class="label">Celestial Win A</div>
    <div class="value">${(cw.rateA * 100).toFixed(1)}%</div>
  </div>
  <div class="stat-card">
    <div class="label">Celestial Win B</div>
    <div class="value">${(cw.rateB * 100).toFixed(1)}%</div>
  </div>
  <div class="stat-card">
    <div class="label">Avg VP Delta</div>
    <div class="value ${vpAll.delta > 0 ? 'up' : vpAll.delta < 0 ? 'down' : ''}">${formatDelta(vpAll.delta)}</div>
  </div>
  <div class="stat-card">
    <div class="label">Game Length Delta</div>
    <div class="value ${gl.delta > 0 ? 'up' : gl.delta < 0 ? 'down' : ''}">${formatDelta(gl.delta)}</div>
  </div>
</div>

<section>
  <h2>Config Changes</h2>
  ${configDiff.length === 0 ? '<p style="color:var(--dim)">No differences — configs are identical.</p>' : `
  <table class="config-table">
    <thead><tr><th>Key</th><th>Config A</th><th>Config B</th></tr></thead>
    <tbody>${configRows}</tbody>
  </table>`}
</section>

<section>
  <h2>Win Rate Comparison</h2>
  <div class="legend">
    <div class="legend-item"><div class="legend-swatch" style="background:var(--bar-a)"></div> Config A</div>
    <div class="legend-item"><div class="legend-swatch" style="background:var(--bar-b)"></div> Config B</div>
  </div>
  <div class="bar-chart">${winRateChartBars}</div>
  <table>
    <thead><tr><th>AI Type</th><th>Config A</th><th>Config B</th><th>Delta</th><th>Significance</th></tr></thead>
    <tbody>${winRateRows}</tbody>
  </table>
</section>

<section>
  <h2>Strategy Effectiveness (Avg VP)</h2>
  <table>
    <thead><tr><th>AI Type</th><th>Config A</th><th>Config B</th><th>Delta</th></tr></thead>
    <tbody>${stratRows}</tbody>
  </table>
</section>

<section>
  <h2>VP Distribution</h2>
  <div class="metric-row">
    <div class="metric-label">All Players</div>
    <div>${vpAll.meanA.toFixed(2)} -> ${vpAll.meanB.toFixed(2)} <span class="${vpAll.delta > 0 ? 'up' : vpAll.delta < 0 ? 'down' : ''}">(${formatDelta(vpAll.delta)})</span> <span class="sig-${vpAll.significance.replace(' ', '-')}">${vpAll.significance}</span></div>
  </div>
  <div class="metric-row">
    <div class="metric-label">Winners</div>
    <div>${vpWin.meanA.toFixed(2)} -> ${vpWin.meanB.toFixed(2)} <span class="${vpWin.delta > 0 ? 'up' : vpWin.delta < 0 ? 'down' : ''}">(${formatDelta(vpWin.delta)})</span> <span class="sig-${vpWin.significance.replace(' ', '-')}">${vpWin.significance}</span></div>
  </div>
</section>

<section>
  <h2>Game Length</h2>
  <div class="metric-row">
    <div class="metric-label">Mean Rounds</div>
    <div>${gl.meanA} -> ${gl.meanB} <span class="${gl.delta > 0 ? 'up' : gl.delta < 0 ? 'down' : ''}">(${formatDelta(gl.delta)})</span> <span class="sig-${gl.significance.replace(' ', '-')}">${gl.significance}</span></div>
  </div>
  <div class="metric-row">
    <div class="metric-label">Median</div>
    <div>${gl.medianA} -> ${gl.medianB}</div>
  </div>
</section>

<section>
  <h2>Game End Reasons</h2>
  <table>
    <thead><tr><th>Reason</th><th>Config A</th><th>Config B</th><th>Delta</th></tr></thead>
    <tbody>${endReasonRows}</tbody>
  </table>
</section>

<section>
  <h2>Card Power Ranking Shifts</h2>
  <table>
    <thead><tr><th>Card</th><th>Rank A</th><th>Rank B</th><th>Move</th><th>Score A</th><th>Score B</th></tr></thead>
    <tbody>${cardPowerRows}</tbody>
  </table>
</section>

<footer>
  Generated by New Arcana Stats Engine v2 — A/B Comparison Mode
</footer>

</div>
</body>
</html>`;
}

// --- Helpers ---

function round2(n) { return Math.round(n * 100) / 100; }
function round3(n) { return Math.round(n * 1000) / 1000; }

function formatDelta(n, suffix = '') {
  const sign = n > 0 ? '+' : '';
  return `${sign}${n.toFixed(2)}${suffix}`;
}

function sigMarker(sig) {
  if (sig === 'significant') return '*** significant';
  if (sig === 'marginal') return '*   marginal';
  return '    -';
}

function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
