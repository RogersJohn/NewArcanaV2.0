import { runSimulation } from '@engine/simulation.js';
import { aggregateStats } from '@engine/stats.js';

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

    self.postMessage({
      type: 'complete',
      stats,
      errors: sim.errors,
      completedGames: sim.completedGames,
      seed,
    });
  } catch (err) {
    self.postMessage({ type: 'error', message: err.message });
  }
};
