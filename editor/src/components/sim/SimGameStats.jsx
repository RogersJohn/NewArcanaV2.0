import React from 'react';

function formatPct(n) { return (n * 100).toFixed(1) + '%'; }

function Bar({ value, max, color = 'bg-amber-500' }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div className="h-3 w-32 bg-gray-700 rounded overflow-hidden inline-block align-middle ml-2">
      <div className={`h-full ${color} rounded`} style={{ width: `${pct}%` }} />
    </div>
  );
}

export default function SimGameStats({ results, compareResults }) {
  const s = results.stats;
  const totalGames = results.completedGames || s.totalGames || 0;

  const aiWinRates = s.aiWinRates ? Object.entries(s.aiWinRates)
    .map(([name, data]) => ({ name, wins: data.wins, games: data.games, rate: data.winRate }))
    .sort((a, b) => b.rate - a.rate) : [];
  const maxRate = aiWinRates.length > 0 ? Math.max(...aiWinRates.map(a => a.rate)) : 1;

  const s2 = compareResults?.stats;
  const getCompareWR = () => {
    if (!s2?.aiWinRates) return {};
    const rates = {};
    for (const [name, data] of Object.entries(s2.aiWinRates)) rates[name] = data.winRate;
    return rates;
  };
  const cwr = getCompareWR();

  return (
    <div className="space-y-4">
      {aiWinRates.length > 0 && (
        <div>
          <h4 className="text-sm font-medium text-gray-300 mb-2">AI Win Rates</h4>
          <div className="space-y-1">
            {aiWinRates.map(ai => {
              const delta = cwr[ai.name] != null ? ai.rate - cwr[ai.name] : null;
              return (
                <div key={ai.name} className="flex items-center text-sm">
                  <span className="w-28 text-gray-300 truncate">{ai.name}</span>
                  <span className="w-14 text-right text-gray-400">{formatPct(ai.rate)}</span>
                  <Bar value={ai.rate} max={maxRate} />
                  <span className="ml-2 text-xs text-gray-500">({ai.wins}/{ai.games})</span>
                  {delta != null && (
                    <span className={`ml-2 text-xs ${delta > 0 ? 'text-green-400' : delta < 0 ? 'text-red-400' : 'text-gray-400'}`}>
                      {delta > 0 ? '+' : ''}{(delta * 100).toFixed(1)}%
                    </span>
                  )}
                </div>
              );
            })}
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
          {s.celestialWinRate?.rate != null && (
            <>
              <span className="text-gray-400 ml-3">Celestial wins:</span>{' '}
              <span className="text-gray-200">{formatPct(s.celestialWinRate.rate)}</span>
            </>
          )}
        </div>
      </div>

      <div className="text-xs text-gray-500">
        Seed: {results.seed} &middot; {totalGames} games &middot; {results.errors} errors
      </div>
    </div>
  );
}
