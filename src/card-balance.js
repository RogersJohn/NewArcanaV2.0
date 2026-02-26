/**
 * Card balance analysis — computes 5 per-card impact metrics.
 *
 * Can be called from index.js (--card-balance) or scripts/card-balance.js.
 */

import { MAJOR_ARCANA_DEFS } from './cards.js';

const ACTION_CARDS = new Set([7, 8, 10, 12, 16, 20, 26]);
const BONUS_CARDS = new Set([0, 1, 2, 3, 4, 6, 9, 11, 14, 22, 23, 25]);

/**
 * Analyse game results and return 5 balance metrics plus formatted text.
 * @param {object[]} results - Array of game result objects from simulation
 * @returns {{ metrics: object, text: string }}
 */
export function analyzeCardBalance(results) {
  const totalGames = results.length;

  // Card name lookup
  const cardNameMap = {};
  for (const def of MAJOR_ARCANA_DEFS) {
    cardNameMap[def.number] = def.name;
  }

  // Aggregate per-card data
  const agg = {};

  function ensure(num) {
    if (!agg[num]) {
      agg[num] = {
        name: cardNameMap[num] || `Card ${num}`, number: num,
        purchased: 0, purchasedByWinner: 0,
        actionPlayed: 0, aceBlocked: 0, kingBlocked: 0,
        bonusScoredReal: 0, bonusScoredHierophant: 0, bonusFailed: 0,
        displayAppearances: 0, agedOff: 0,
        vpDeltaSum: 0, vpDeltaCount: 0,
      };
    }
  }

  for (const game of results) {
    // Card events
    if (game.cardEvents) {
      for (const [numStr, data] of Object.entries(game.cardEvents)) {
        const num = parseInt(numStr);
        ensure(num);
        const c = agg[num];
        c.purchased += data.purchased || 0;
        c.purchasedByWinner += data.purchasedByWinner || 0;
        c.actionPlayed += data.actionPlayed || 0;
        c.aceBlocked += data.aceBlocked || 0;
        c.kingBlocked += data.kingBlocked || 0;
        c.bonusScoredReal += data.bonusScoredReal || 0;
        c.bonusScoredHierophant += data.bonusScoredHierophant || 0;
        c.bonusFailed += data.bonusFailed || 0;
        c.displayAppearances += data.displayAppearances || 0;
        c.agedOff += data.agedOff || 0;
      }
    }

    // VP Delta per game
    const holdingsByCard = {};
    for (const player of game.players) {
      if (!player.majorHoldings) continue;
      for (const num of player.majorHoldings) {
        if (!holdingsByCard[num]) holdingsByCard[num] = [];
        holdingsByCard[num].push(player.vp);
      }
    }
    for (const [numStr, holderVps] of Object.entries(holdingsByCard)) {
      const num = parseInt(numStr);
      ensure(num);
      const nonHolderVps = game.players
        .filter(p => !p.majorHoldings || !p.majorHoldings.includes(num))
        .map(p => p.vp);
      if (holderVps.length > 0 && nonHolderVps.length > 0) {
        const avgH = holderVps.reduce((a, b) => a + b, 0) / holderVps.length;
        const avgN = nonHolderVps.reduce((a, b) => a + b, 0) / nonHolderVps.length;
        agg[num].vpDeltaSum += avgH - avgN;
        agg[num].vpDeltaCount++;
      }
    }
  }

  // --- Metric 1: Winner Affinity ---
  const winnerAffinity = [];
  for (const c of Object.values(agg)) {
    if (c.purchased < 5) continue;
    const rate = c.purchasedByWinner / c.purchased;
    winnerAffinity.push({
      number: c.number, name: c.name,
      purchased: c.purchased, purchasedByWinner: c.purchasedByWinner,
      rate, flag: rate > 0.40 ? 'HIGH' : rate < 0.15 ? 'LOW' : '',
    });
  }
  winnerAffinity.sort((a, b) => b.rate - a.rate);

  // --- Metric 2: VP Delta ---
  const vpDelta = [];
  for (const c of Object.values(agg)) {
    if (c.vpDeltaCount < 5) continue;
    const mean = c.vpDeltaSum / c.vpDeltaCount;
    vpDelta.push({
      number: c.number, name: c.name,
      gamesHeld: c.vpDeltaCount, meanDelta: mean,
      flag: mean > 5 ? 'OP' : mean < -2 ? 'WEAK' : '',
    });
  }
  vpDelta.sort((a, b) => b.meanDelta - a.meanDelta);

  // --- Metric 3: Action Effectiveness ---
  // actionPlayed = successful plays only (ace-blocked plays are NOT counted)
  // total attempts = actionPlayed + aceBlocked
  const actionEffectiveness = [];
  for (const c of Object.values(agg)) {
    if (!ACTION_CARDS.has(c.number)) continue;
    const totalAttempts = c.actionPlayed + c.aceBlocked;
    if (totalAttempts < 3) continue;
    const successRate = c.actionPlayed / totalAttempts;
    actionEffectiveness.push({
      number: c.number, name: c.name,
      played: c.actionPlayed, aceBlocked: c.aceBlocked, kingBlocked: c.kingBlocked,
      successRate, flag: successRate < 0.40 ? 'BLOCKED' : '',
    });
  }
  actionEffectiveness.sort((a, b) => a.successRate - b.successRate);

  // --- Metric 4: Tome Bonus Hit Rate ---
  const bonusHitRate = [];
  for (const c of Object.values(agg)) {
    if (!BONUS_CARDS.has(c.number)) continue;
    const total = c.bonusScoredReal + c.bonusFailed;
    if (total < 3) continue;
    const rate = c.bonusScoredReal / total;
    bonusHitRate.push({
      number: c.number, name: c.name,
      scored: c.bonusScoredReal, hierophant: c.bonusScoredHierophant,
      failed: c.bonusFailed, rate,
      flag: rate < 0.20 ? 'LOW' : '',
    });
  }
  bonusHitRate.sort((a, b) => b.rate - a.rate);

  // --- Metric 5: Purchase Rate ---
  const purchaseRate = [];
  for (const c of Object.values(agg)) {
    const seen = c.purchased + c.agedOff;
    if (seen < 3) continue;
    if (c.displayAppearances < 1 && c.purchased < 1) continue;
    const rate = c.purchased / Math.max(1, seen);
    const agedPct = c.agedOff / Math.max(1, seen);
    purchaseRate.push({
      number: c.number, name: c.name,
      purchased: c.purchased, displayed: c.displayAppearances,
      agedOff: c.agedOff, purchaseRate: rate,
      flag: agedPct > 0.70 ? 'IGNORED' : '',
    });
  }
  purchaseRate.sort((a, b) => b.purchaseRate - a.purchaseRate);

  const metrics = { winnerAffinity, vpDelta, actionEffectiveness, bonusHitRate, purchaseRate };
  const text = formatBalanceReport(totalGames, metrics);

  return { metrics, text };
}

/**
 * Format the 5-metric report as a console string.
 */
function formatBalanceReport(totalGames, m) {
  const SEP = '='.repeat(72);
  const THIN = '-'.repeat(72);
  const lines = [];

  lines.push('');
  lines.push(SEP);
  lines.push('  CARD BALANCE ANALYSIS');
  lines.push(SEP);
  lines.push(`  ${totalGames} games | 4 players | diverse AI\n`);

  // 1
  lines.push(THIN);
  lines.push('  1. WINNER AFFINITY  (purchasedByWinner / purchased)');
  lines.push('     Flag: >40% HIGH, <15% LOW');
  lines.push(THIN);
  lines.push('  Card                      Bought  ByWinner  Rate    Flag');
  for (const c of m.winnerAffinity) {
    const name = `[${c.number}] ${c.name}`.padEnd(26);
    const flag = c.flag ? ` <<${c.flag}>>` : '';
    lines.push(`  ${name} ${String(c.purchased).padStart(6)}  ${String(c.purchasedByWinner).padStart(8)}  ${(c.rate * 100).toFixed(1).padStart(5)}%${flag}`);
  }
  lines.push('');

  // 2
  lines.push(THIN);
  lines.push('  2. VP DELTA  (avg VP of holders minus non-holders)');
  lines.push('     Flag: >+5 OP, <-2 WEAK');
  lines.push(THIN);
  lines.push('  Card                      Held-In  Delta   Flag');
  for (const c of m.vpDelta) {
    const name = `[${c.number}] ${c.name}`.padEnd(26);
    const sign = c.meanDelta >= 0 ? '+' : '';
    const flag = c.flag ? ` <<${c.flag}>>` : '';
    lines.push(`  ${name} ${String(c.gamesHeld).padStart(7)}  ${sign}${c.meanDelta.toFixed(2).padStart(6)}${flag}`);
  }
  lines.push('');

  // 3
  lines.push(THIN);
  lines.push('  3. ACTION EFFECTIVENESS  (1 - blocked/played)');
  lines.push('     Flag: blocked >60% BLOCKED');
  lines.push(THIN);
  lines.push('  Card                      OK  Ace-Blk  Total  Success  Flag');
  for (const c of m.actionEffectiveness) {
    const name = `[${c.number}] ${c.name}`.padEnd(26);
    const total = c.played + c.aceBlocked;
    const flag = c.flag ? ` <<${c.flag}>>` : '';
    lines.push(`  ${name} ${String(c.played).padStart(4)}  ${String(c.aceBlocked).padStart(7)}  ${String(total).padStart(5)}  ${(c.successRate * 100).toFixed(1).padStart(6)}%${flag}`);
  }
  lines.push('');

  // 4
  lines.push(THIN);
  lines.push('  4. TOME BONUS HIT RATE  (real scores / (real + failed), excl. Hierophant)');
  lines.push('     Flag: <20% LOW');
  lines.push(THIN);
  lines.push('  Card                      Scored  Hieroph  Failed  Rate    Flag');
  for (const c of m.bonusHitRate) {
    const name = `[${c.number}] ${c.name}`.padEnd(26);
    const flag = c.flag ? ` <<${c.flag}>>` : '';
    lines.push(`  ${name} ${String(c.scored).padStart(6)}  ${String(c.hierophant).padStart(7)}  ${String(c.failed).padStart(6)}  ${(c.rate * 100).toFixed(1).padStart(5)}%${flag}`);
  }
  lines.push('');

  // 5
  lines.push(THIN);
  lines.push('  5. PURCHASE RATE  (purchased / (purchased + aged-off))');
  lines.push('     Flag: aged-off >70% IGNORED');
  lines.push(THIN);
  lines.push('  Card                      Bought  Display  AgedOff  Rate    Flag');
  for (const c of m.purchaseRate) {
    const name = `[${c.number}] ${c.name}`.padEnd(26);
    const flag = c.flag ? ` <<${c.flag}>>` : '';
    lines.push(`  ${name} ${String(c.purchased).padStart(6)}  ${String(c.displayed).padStart(7)}  ${String(c.agedOff).padStart(7)}  ${(c.purchaseRate * 100).toFixed(1).padStart(5)}%${flag}`);
  }
  lines.push('');
  lines.push(SEP);

  return lines.join('\n');
}
