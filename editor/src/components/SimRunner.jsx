import React, { useState, useRef, useCallback } from 'react';
import { load } from '../utils/storage.js';
import SimControls from './sim/SimControls.jsx';
import SimTabs from './sim/SimTabs.jsx';
import SimOverview from './sim/SimOverview.jsx';
import SimPowerRankings from './sim/SimPowerRankings.jsx';
import SimBalance from './sim/SimBalance.jsx';
import SimBonuses from './sim/SimBonuses.jsx';
import SimGameStats from './sim/SimGameStats.jsx';

export default function SimRunner({ config }) {
  const [games, setGames] = useState(100);
  const [players, setPlayers] = useState(4);
  const [seedInput, setSeedInput] = useState('');
  const [running, setRunning] = useState(false);
  const [results, setResults] = useState(null);
  const [error, setError] = useState(null);
  const [compareSlotId, setCompareSlotId] = useState('');
  const [compareResults, setCompareResults] = useState(null);
  const workerRef = useRef(null);

  const runSim = useCallback((cfg, onComplete) => {
    const worker = new Worker(
      new URL('../worker/simWorker.js', import.meta.url),
      { type: 'module' }
    );
    const seed = seedInput ? Number(seedInput) : Math.floor(Math.random() * 2147483647);
    worker.onmessage = (e) => {
      worker.terminate();
      if (e.data.type === 'error') {
        onComplete(null, e.data.message);
      } else {
        onComplete({ ...e.data, seed });
      }
    };
    worker.onerror = (e) => {
      worker.terminate();
      onComplete(null, e.message);
    };
    worker.postMessage({ config: cfg, games, players, seed });
    return worker;
  }, [games, players, seedInput]);

  const handleRun = () => {
    setRunning(true);
    setError(null);
    setResults(null);
    setCompareResults(null);

    workerRef.current = runSim(config, (res, err) => {
      if (err) {
        setError(err);
        setRunning(false);
        return;
      }
      setResults(res);

      if (compareSlotId) {
        const slot = load(compareSlotId);
        if (slot?.config) {
          workerRef.current = runSim(slot.config, (res2, err2) => {
            if (!err2) setCompareResults(res2);
            setRunning(false);
          });
          return;
        }
      }
      setRunning(false);
    });
  };

  const handleExport = () => {
    if (!results) return;
    const exportData = {
      stats: results.stats,
      cardAnalytics: results.cardAnalytics,
      cardBalance: results.cardBalance,
      seed: results.seed,
      games,
      players,
      errors: results.errors,
      completedGames: results.completedGames,
    };
    const json = JSON.stringify(exportData, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `sim-${results.seed}-${games}g.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="max-w-4xl space-y-6">
      <h2 className="text-lg font-semibold text-amber-400">Simulation</h2>

      <SimControls
        games={games} setGames={setGames}
        players={players} setPlayers={setPlayers}
        seedInput={seedInput} setSeedInput={setSeedInput}
        compareSlotId={compareSlotId} setCompareSlotId={setCompareSlotId}
        running={running} onRun={handleRun}
      />

      {error && (
        <div className="bg-red-900/30 border border-red-800 rounded p-3 text-sm text-red-300">
          Error: {error}
        </div>
      )}

      {results && (
        <div className="border border-gray-700 rounded p-4 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-300">Results</h3>
            <button onClick={handleExport} className="btn-secondary text-xs">
              Export Full Report as JSON
            </button>
          </div>

          <SimTabs>
            {(tab) => {
              switch (tab) {
                case 'Overview':
                  return <SimOverview results={results} cardBalance={results.cardBalance} />;
                case 'Power Rankings':
                  return <SimPowerRankings
                    cardAnalytics={results.cardAnalytics}
                    compareAnalytics={compareResults?.cardAnalytics}
                  />;
                case 'Balance':
                  return <SimBalance
                    cardBalance={results.cardBalance}
                    compareBalance={compareResults?.cardBalance}
                  />;
                case 'Bonuses':
                  return <SimBonuses
                    cardAnalytics={results.cardAnalytics}
                    results={results}
                    config={config}
                  />;
                case 'Game Stats':
                  return <SimGameStats results={results} compareResults={compareResults} />;
                default:
                  return null;
              }
            }}
          </SimTabs>
        </div>
      )}
    </div>
  );
}
