import React from 'react';

function Bar({ value, max }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div className="h-4 w-48 bg-gray-700 rounded overflow-hidden inline-block align-middle">
      <div className="h-full bg-amber-500 rounded" style={{ width: `${pct}%` }} />
    </div>
  );
}

export default function SimPowerRankings({ cardAnalytics, compareAnalytics }) {
  const rankings = cardAnalytics?.powerRankings || [];
  if (rankings.length === 0) return <p className="text-gray-500">No data</p>;

  const maxComposite = rankings[0]?.composite || 1;

  // For compare: build rank lookup
  const compareRanks = {};
  if (compareAnalytics?.powerRankings) {
    compareAnalytics.powerRankings.forEach((c, i) => { compareRanks[c.number] = i + 1; });
  }

  return (
    <div className="space-y-3">
      {rankings.map((c, i) => {
        const rank = i + 1;
        const colorClass = rank <= 3 ? 'text-amber-400' : rank > rankings.length - 5 ? 'text-gray-500' : 'text-gray-300';
        const compareRank = compareRanks[c.number];
        let rankDelta = '';
        if (compareRank != null) {
          const diff = compareRank - rank;
          if (diff > 0) rankDelta = ` \u2191${diff}`;
          else if (diff < 0) rankDelta = ` \u2193${Math.abs(diff)}`;
        }

        return (
          <div key={c.number} className="flex items-start gap-3">
            <span className={`w-8 text-right font-mono font-bold ${colorClass}`}>#{rank}</span>
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <span className={`font-medium ${colorClass}`}>{c.name} ({c.number})</span>
                <Bar value={c.composite} max={maxComposite} />
                <span className="text-sm text-gray-400 font-mono">{c.composite.toFixed(3)}</span>
                {rankDelta && <span className={`text-xs ${rankDelta.includes('\u2191') ? 'text-green-400' : 'text-red-400'}`}>{rankDelta}</span>}
              </div>
              <div className="text-xs text-gray-500 mt-0.5">
                Tome: {c.tomeScore.toFixed(2)} &middot; Buy: {c.purchaseScore.toFixed(2)} &middot; VP: {c.vpScore.toFixed(2)}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
