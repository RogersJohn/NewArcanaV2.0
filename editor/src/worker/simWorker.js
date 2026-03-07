import { runSimulation } from '@engine/simulation.js';
import { aggregateStats, computeCardAnalytics } from '@engine/stats.js';
import { analyzeCardBalance } from '@engine/card-balance.js';

self.onmessage = function(e) {
  const { config, games, players, seed } = e.data;

  try {
    const sim = runSimulation({
      games,
      players,
      seed,
      aiAssignment: 'diverse',
      cardConfig: config,
    });

    const stats = aggregateStats(sim);
    const cardAnalytics = computeCardAnalytics(sim.results);
    const cardBalance = analyzeCardBalance(sim.results);

    self.postMessage({
      type: 'complete',
      stats,
      cardAnalytics,
      cardBalance,
      errors: sim.errors,
      completedGames: sim.completedGames,
      seed,
    });
  } catch (err) {
    self.postMessage({ type: 'error', message: err.message });
  }
};
