import React, { useState } from 'react';

function formatPct(n) { return (n * 100).toFixed(1) + '%'; }

function SummaryCard({ value, label }) {
  return (
    <div className="bg-gray-800 border border-gray-700 rounded-lg p-4 text-center">
      <div className="text-2xl font-bold text-amber-400">{value}</div>
      <div className="text-xs text-gray-400 mt-1">{label}</div>
    </div>
  );
}

function flagClass(flag) {
  if (!flag) return '';
  const f = flag.toUpperCase();
  if (f === 'HIGH') return 'flag-high';
  if (f === 'LOW') return 'flag-low';
  if (f === 'WEAK') return 'flag-weak';
  if (f === 'OP') return 'flag-op';
  if (f === 'BLOCKED') return 'flag-blocked';
  if (f === 'IGNORED') return 'flag-ignored';
  return '';
}

export default function SimOverview({ results, cardBalance }) {
  const [sortCol, setSortCol] = useState('purchased');
  const [sortAsc, setSortAsc] = useState(false);

  const s = results.stats;
  const totalGames = results.completedGames || s.totalGames || 0;

  const deathEnds = s.gameEndReasons?.death != null
    ? formatPct(s.gameEndReasons.death / totalGames) : '?';
  const celestialRate = s.celestialWinRate?.rate != null
    ? formatPct(s.celestialWinRate.rate) : '?';

  // Build card table from cardStats
  const cardRows = [];
  if (s.cardStats) {
    for (const [num, data] of Object.entries(s.cardStats)) {
      const n = parseInt(num);
      const totalBonus = (data.bonusScored || 0) + (data.bonusFailed || 0);
      const isBonus = totalBonus > 0;
      const bonusRate = isBonus ? (data.bonusScored || 0) / totalBonus : null;
      const avgBonusVp = data.bonusScored > 0 ? (data.bonusVpTotal || 0) / data.bonusScored : null;

      // Winner affinity from cardBalance
      const wa = cardBalance?.metrics?.winnerAffinity?.find(c => c.number === n);

      cardRows.push({
        number: n,
        name: data.name || `Card ${n}`,
        purchased: data.purchased || 0,
        winnerTome: data.inWinnerTome || 0,
        winnerTomePct: totalGames > 0 ? (data.inWinnerTome || 0) / totalGames : 0,
        bonusRate,
        avgBonusVp,
        wildPlayed: data.wildPlayed || 0,
        winnerAffinity: wa?.rate || null,
        winnerFlag: wa?.flag || '',
        isDeath: n === 13,
      });
    }
  }

  const handleSort = (col) => {
    if (sortCol === col) setSortAsc(!sortAsc);
    else { setSortCol(col); setSortAsc(false); }
  };

  const sorted = [...cardRows].sort((a, b) => {
    let va = a[sortCol], vb = b[sortCol];
    if (va == null) va = -Infinity;
    if (vb == null) vb = -Infinity;
    return sortAsc ? va - vb : vb - va;
  });

  const arrow = (col) => sortCol === col ? (sortAsc ? ' \u25B2' : ' \u25BC') : '';

  const columns = [
    { key: 'name', label: 'Card', text: true },
    { key: 'purchased', label: 'Purchased' },
    { key: 'winnerTome', label: 'Winner Tome' },
    { key: 'bonusRate', label: 'Bonus Rate' },
    { key: 'avgBonusVp', label: 'Avg Bonus VP' },
    { key: 'wildPlayed', label: 'Wild Uses' },
    { key: 'winnerAffinity', label: 'Winner Affinity' },
  ];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-4 gap-3">
        <SummaryCard value={totalGames} label={`games \u00B7 ${results.errors || 0} errors`} />
        <SummaryCard value={s.averageGameLength?.mean?.toFixed(1) || '?'} label="avg rounds" />
        <SummaryCard value={deathEnds} label="Death ends game" />
        <SummaryCard value={celestialRate} label="Celestial wins" />
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-gray-400 text-left border-b border-gray-700">
              {columns.map(c => (
                <th
                  key={c.key}
                  onClick={() => handleSort(c.key)}
                  className="py-2 px-2 cursor-pointer hover:text-gray-200 select-none whitespace-nowrap"
                >
                  {c.label}{arrow(c.key)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map(row => (
              <tr
                key={row.number}
                className={`border-b border-gray-800 ${row.isDeath ? 'opacity-40 italic' : ''}`}
              >
                <td className="py-1.5 px-2 text-gray-200">
                  {row.name} ({row.number})
                </td>
                <td className="py-1.5 px-2 text-gray-300">{row.purchased}</td>
                <td className="py-1.5 px-2 text-gray-300">
                  {row.winnerTome} ({formatPct(row.winnerTomePct)})
                </td>
                <td className="py-1.5 px-2 text-gray-300">
                  {row.bonusRate != null ? formatPct(row.bonusRate) : '-'}
                </td>
                <td className="py-1.5 px-2 text-gray-300">
                  {row.avgBonusVp != null ? row.avgBonusVp.toFixed(1) : '-'}
                </td>
                <td className="py-1.5 px-2 text-gray-300">{row.wildPlayed}</td>
                <td className={`py-1.5 px-2 ${flagClass(row.winnerFlag)}`}>
                  {row.winnerAffinity != null ? formatPct(row.winnerAffinity) : '-'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
