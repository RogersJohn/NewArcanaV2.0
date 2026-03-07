import React, { useState, useRef, useCallback } from 'react';
import { load, listKeys } from '../utils/storage.js';

function Bar({ value, max, color = 'bg-amber-500' }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div className="h-3 w-32 bg-gray-700 rounded overflow-hidden inline-block align-middle ml-2">
      <div className={`h-full ${color} rounded`} style={{ width: `${pct}%` }} />
    </div>
  );
}

function formatPct(n) {
  return (n * 100).toFixed(1) + '%';
}

export default function SimRunner({ config, savedSlots }) {
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
    const json = JSON.stringify(results.stats, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `sim-${results.seed}-${games}g.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const slots = () => {
    const keys = listKeys('slot_');
    return keys.map(k => {
      const data = load(k);
      return data ? { id: k, name: data.name } : null;
    }).filter(Boolean);
  };

  const getCardHighlights = (stats) => {
    if (!stats?.cardStats) return null;
    const cards = Object.entries(stats.cardStats);
    if (cards.length === 0) return null;

    let mostPurchased = null, leastPurchased = null, bestBonus = null, mostWild = null;

    for (const [num, data] of cards) {
      const name = data.name || `Card ${num}`;
      if (name === 'Death') continue;
      if (data.purchased > 0) {
        if (!mostPurchased || data.purchased > mostPurchased.count) mostPurchased = { name, count: data.purchased };
        if (!leastPurchased || data.purchased < leastPurchased.count) leastPurchased = { name, count: data.purchased };
      }
      if (data.bonusScored + data.bonusFailed > 0) {
        const hitRate = data.bonusScored / (data.bonusScored + data.bonusFailed);
        if (!bestBonus || hitRate > bestBonus.rate) bestBonus = { name, rate: hitRate };
      }
      if (data.wildPlayed > 0) {
        if (!mostWild || data.wildPlayed > mostWild.count) mostWild = { name, count: data.wildPlayed };
      }
    }

    return { mostPurchased, leastPurchased, bestBonus, mostWild };
  };

  const renderStats = (stats, label) => {
    if (!stats) return null;
    const s = stats.stats;

    // aiWinRates: map of AI name → { wins, games, winRate }
    const aiWinRates = s.aiWinRates ? Object.entries(s.aiWinRates)
      .map(([name, data]) => ({ name, wins: data.wins, games: data.games, rate: data.winRate }))
      .sort((a, b) => b.rate - a.rate) : [];
    const maxRate = aiWinRates.length > 0 ? Math.max(...aiWinRates.map(a => a.rate)) : 1;

    const highlights = getCardHighlights(s);
    const totalGames = stats.completedGames || s.totalGames || games;

    return (
      <div className="space-y-4">
        {label && <h4 className="text-sm font-medium text-gray-400">{label}</h4>}
        <div className="text-xs text-gray-500">
          Seed: {stats.seed} · {totalGames} games · {stats.errors} errors
        </div>

        {aiWinRates.length > 0 && (
          <div>
            <h4 className="text-sm font-medium text-gray-300 mb-2">AI Win Rates</h4>
            <div className="space-y-1">
              {aiWinRates.map(ai => (
                <div key={ai.name} className="flex items-center text-sm">
                  <span className="w-28 text-gray-300 truncate">{ai.name}</span>
                  <span className="w-14 text-right text-gray-400">{formatPct(ai.rate)}</span>
                  <Bar value={ai.rate} max={maxRate} />
                  <span className="ml-2 text-xs text-gray-500">({ai.wins}/{ai.games})</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <span className="text-gray-400">Avg game length:</span>{' '}
            <span className="text-gray-200">{s.averageGameLength?.mean?.toFixed(1) || '?'} rounds</span>
          </div>
          <div>
            <span className="text-gray-400">Death ends:</span>{' '}
            <span className="text-gray-200">{s.gameEndReasons?.death != null ? formatPct(s.gameEndReasons.death / totalGames) : '?'}</span>
            {s.celestialWinRate != null && (
              <>
                <span className="text-gray-400 ml-3">Celestial wins:</span>{' '}
                <span className="text-gray-200">{formatPct(s.celestialWinRate.rate)}</span>
              </>
            )}
          </div>
        </div>

        {highlights && (
          <div>
            <h4 className="text-sm font-medium text-gray-300 mb-2">Card Highlights</h4>
            <div className="grid grid-cols-1 gap-1 text-sm">
              {highlights.mostPurchased && (
                <div><span className="text-gray-400">Most purchased:</span> <span className="text-gray-200">{highlights.mostPurchased.name} ({highlights.mostPurchased.count}x)</span></div>
              )}
              {highlights.bestBonus && (
                <div><span className="text-gray-400">Best bonus:</span> <span className="text-gray-200">{highlights.bestBonus.name} ({formatPct(highlights.bestBonus.rate)} hit rate)</span></div>
              )}
              {highlights.mostWild && (
                <div><span className="text-gray-400">Most used as wild:</span> <span className="text-gray-200">{highlights.mostWild.name} ({highlights.mostWild.count}x)</span></div>
              )}
              {highlights.leastPurchased && (
                <div><span className="text-gray-400">Least purchased:</span> <span className="text-gray-200">{highlights.leastPurchased.name} ({highlights.leastPurchased.count}x)</span></div>
              )}
            </div>
          </div>
        )}
      </div>
    );
  };

  const renderCompare = () => {
    if (!results || !compareResults) return null;
    const s1 = results.stats;
    const s2 = compareResults.stats;
    const slotData = load(compareSlotId);
    const slotName = slotData?.name || 'Saved';

    const getWinRates = (s) => {
      const rates = {};
      if (s.aiWinRates) {
        for (const [name, data] of Object.entries(s.aiWinRates)) {
          rates[name] = data.winRate;
        }
      }
      return rates;
    };

    const wr1 = getWinRates(s1);
    const wr2 = getWinRates(s2);
    const allAIs = [...new Set([...Object.keys(wr1), ...Object.keys(wr2)])];

    return (
      <div className="mt-6 border-t border-gray-700 pt-4">
        <h3 className="text-sm font-semibold text-amber-400 mb-3">Comparison</h3>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-gray-400 text-left">
              <th className="py-1">Metric</th>
              <th className="py-1">Current</th>
              <th className="py-1">{slotName}</th>
              <th className="py-1">Delta</th>
            </tr>
          </thead>
          <tbody>
            {allAIs.map(ai => {
              const v1 = wr1[ai] || 0, v2 = wr2[ai] || 0;
              const delta = v1 - v2;
              return (
                <tr key={ai} className="border-t border-gray-800">
                  <td className="py-1 text-gray-300">{ai} WR</td>
                  <td className="py-1 text-gray-200">{formatPct(v1)}</td>
                  <td className="py-1 text-gray-200">{formatPct(v2)}</td>
                  <td className={`py-1 ${delta > 0 ? 'text-green-400' : delta < 0 ? 'text-red-400' : 'text-gray-400'}`}>
                    {delta > 0 ? '+' : ''}{(delta * 100).toFixed(1)}%
                  </td>
                </tr>
              );
            })}
            <tr className="border-t border-gray-800">
              <td className="py-1 text-gray-300">Avg rounds</td>
              <td className="py-1 text-gray-200">{s1.averageGameLength?.mean?.toFixed(1)}</td>
              <td className="py-1 text-gray-200">{s2.averageGameLength?.mean?.toFixed(1)}</td>
              <td className="py-1 text-gray-400">{((s1.averageGameLength?.mean || 0) - (s2.averageGameLength?.mean || 0)).toFixed(1)}</td>
            </tr>
          </tbody>
        </table>
      </div>
    );
  };

  return (
    <div className="max-w-3xl space-y-6">
      <h2 className="text-lg font-semibold text-amber-400">Quick Simulation</h2>

      <div className="flex gap-4 items-end flex-wrap">
        <div>
          <label className="text-sm text-gray-400">Games</label>
          <select value={games} onChange={e => setGames(Number(e.target.value))} className="input">
            <option value={50}>50</option>
            <option value={100}>100</option>
            <option value={500}>500</option>
            <option value={1000}>1000</option>
          </select>
        </div>
        <div>
          <label className="text-sm text-gray-400">Players</label>
          <select value={players} onChange={e => setPlayers(Number(e.target.value))} className="input">
            <option value={3}>3</option>
            <option value={4}>4</option>
            <option value={5}>5</option>
          </select>
        </div>
        <div>
          <label className="text-sm text-gray-400">Seed</label>
          <input
            type="text"
            value={seedInput}
            onChange={e => setSeedInput(e.target.value)}
            placeholder="auto"
            className="input w-24"
          />
        </div>
        <div>
          <label className="text-sm text-gray-400">Compare with</label>
          <select value={compareSlotId} onChange={e => setCompareSlotId(e.target.value)} className="input">
            <option value="">None</option>
            {slots().map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
        <button
          onClick={handleRun}
          disabled={running}
          className={`btn-primary ${running ? 'opacity-50 cursor-not-allowed' : ''}`}
        >
          {running ? (
            <span className="inline-flex items-center gap-2">
              <span className="inline-block w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
              Running...
            </span>
          ) : 'Run Simulation'}
        </button>
      </div>

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
          {renderStats(results, compareResults ? 'Current Config' : null)}
          {compareResults && renderStats(compareResults, load(compareSlotId)?.name || 'Saved Config')}
          {renderCompare()}
        </div>
      )}
    </div>
  );
}
