import React from 'react';

function formatPct(n) { return (n * 100).toFixed(1) + '%'; }

const BONUS_LABELS = {
  foolDuplicate: "Duplicates opponent's best bonus",
  suitMajority: 'VP for most cards of a chosen suit (strict majority)',
  suitHighest: 'VP for most cards of {SUIT}',
  pairCounting: 'VP per pair of matching ranks',
  hermitExclusive: 'VP if only card in Tome',
  noSuitInRealm: 'VP if no {SUIT} in Realm',
  hierophant_blessing: 'Failed bonuses score 1 VP instead of 0',
};

function getBonusLabel(bonusType, suit) {
  const label = BONUS_LABELS[bonusType] || bonusType;
  return suit ? label.replace('{SUIT}', suit) : label;
}

function Bar({ value, max }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div className="h-3 bg-gray-700 rounded overflow-hidden mt-1">
      <div className="h-full bg-amber-500 rounded" style={{ width: `${pct}%` }} />
    </div>
  );
}

export default function SimBonuses({ cardAnalytics, results, config }) {
  const bonusRates = cardAnalytics?.bonusSuccessRates || [];
  if (bonusRates.length === 0) return <p className="text-gray-500">No bonus data</p>;

  const totalGames = results?.completedGames || results?.stats?.totalGames || 0;
  const cardStats = results?.stats?.cardStats || {};

  // Look up bonus type from config for each bonus card
  const bonusTypeMap = {};
  if (config?.majorArcana) {
    for (const def of config.majorArcana) {
      if (def.effect?.bonus) {
        bonusTypeMap[def.number] = {
          bonusType: def.effect.bonus.bonusType,
          suit: def.effect.bonus.suit,
        };
      }
    }
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {bonusRates.map(c => {
        const cs = cardStats[c.number];
        const winnerTome = cs?.inWinnerTome || 0;
        const bt = bonusTypeMap[c.number];
        const label = bt ? getBonusLabel(bt.bonusType, bt.suit) : 'Bonus card';
        const total = c.scored + c.failed;

        return (
          <div key={c.number} className="border border-gray-700 rounded-lg p-4 space-y-2">
            <div className="flex items-center justify-between">
              <h4 className="font-medium text-amber-400">{c.name} ({c.number})</h4>
            </div>
            <p className="text-xs text-gray-400">{label}</p>

            <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
              <div>
                <span className="text-gray-400">Scored:</span>{' '}
                <span className="text-gray-200">{c.scored} times</span>
              </div>
              <div>
                <span className="text-gray-400">Failed:</span>{' '}
                <span className="text-gray-200">{c.failed} times</span>
              </div>
              <div>
                <span className="text-gray-400">Hit Rate:</span>{' '}
                <span className="text-gray-200">{formatPct(c.successRate)}</span>
              </div>
              <div>
                <span className="text-gray-400">Avg VP:</span>{' '}
                <span className="text-gray-200">{c.avgVp.toFixed(1)}</span>
              </div>
              <div>
                <span className="text-gray-400">Total VP:</span>{' '}
                <span className="text-gray-200">{c.totalVp}</span>
              </div>
              <div>
                <span className="text-gray-400">In winner tomes:</span>{' '}
                <span className="text-gray-200">{winnerTome}{totalGames > 0 ? ` (${formatPct(winnerTome / totalGames)})` : ''}</span>
              </div>
            </div>

            <Bar value={c.successRate} max={1} />
            <div className="text-xs text-gray-500 text-right">{formatPct(c.successRate)} hit rate</div>
          </div>
        );
      })}
    </div>
  );
}
