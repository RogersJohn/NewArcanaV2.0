import React from 'react';

function formatPct(n) { return (n * 100).toFixed(1) + '%'; }

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

function FlagCell({ flag }) {
  if (!flag) return <td className="py-1 px-2 text-gray-500">-</td>;
  return <td className={`py-1 px-2 font-medium ${flagClass(flag)}`}>&laquo;{flag}&raquo;</td>;
}

function Section({ title, description, children }) {
  return (
    <div className="space-y-2">
      <h4 className="text-sm font-semibold text-gray-300">{title}</h4>
      <p className="text-xs text-gray-500">{description}</p>
      {children}
    </div>
  );
}

export default function SimBalance({ cardBalance, compareBalance }) {
  const m = cardBalance?.metrics;
  if (!m) return <p className="text-gray-500">No data</p>;

  const cm = compareBalance?.metrics;

  return (
    <div className="space-y-6">
      {/* 1. Winner Affinity */}
      <Section title="1. Winner Affinity" description="Does buying this card correlate with winning? Flag: >40% HIGH, <15% LOW">
        <table className="w-full text-sm">
          <thead><tr className="text-gray-400 text-left border-b border-gray-700">
            <th className="py-1 px-2">Card</th><th className="py-1 px-2">Bought</th>
            <th className="py-1 px-2">By Winner</th><th className="py-1 px-2">Rate</th>
            {cm && <th className="py-1 px-2">&Delta;</th>}
            <th className="py-1 px-2">Flag</th>
          </tr></thead>
          <tbody>
            {m.winnerAffinity.map(c => {
              const cd = cm?.winnerAffinity?.find(x => x.number === c.number);
              return (
                <tr key={c.number} className="border-b border-gray-800">
                  <td className="py-1 px-2 text-gray-200">{c.name} ({c.number})</td>
                  <td className="py-1 px-2 text-gray-300">{c.purchased}</td>
                  <td className="py-1 px-2 text-gray-300">{c.purchasedByWinner}</td>
                  <td className="py-1 px-2 text-gray-300">{formatPct(c.rate)}</td>
                  {cm && <td className="py-1 px-2 text-gray-400">{cd ? ((c.rate - cd.rate) * 100).toFixed(1) + '%' : '-'}</td>}
                  <FlagCell flag={c.flag} />
                </tr>
              );
            })}
          </tbody>
        </table>
      </Section>

      {/* 2. VP Delta */}
      <Section title="2. VP Delta" description="Avg VP of holders minus non-holders. Flag: >+5 OP, <-2 WEAK">
        <table className="w-full text-sm">
          <thead><tr className="text-gray-400 text-left border-b border-gray-700">
            <th className="py-1 px-2">Card</th><th className="py-1 px-2">Held In</th>
            <th className="py-1 px-2">VP Delta</th>
            {cm && <th className="py-1 px-2">&Delta;</th>}
            <th className="py-1 px-2">Flag</th>
          </tr></thead>
          <tbody>
            {m.vpDelta.map(c => {
              const cd = cm?.vpDelta?.find(x => x.number === c.number);
              return (
                <tr key={c.number} className="border-b border-gray-800">
                  <td className="py-1 px-2 text-gray-200">{c.name} ({c.number})</td>
                  <td className="py-1 px-2 text-gray-300">{c.gamesHeld}</td>
                  <td className={`py-1 px-2 font-medium ${c.meanDelta >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                    {c.meanDelta >= 0 ? '+' : ''}{c.meanDelta.toFixed(2)}
                  </td>
                  {cm && <td className="py-1 px-2 text-gray-400">{cd ? (c.meanDelta - cd.meanDelta).toFixed(2) : '-'}</td>}
                  <FlagCell flag={c.flag} />
                </tr>
              );
            })}
          </tbody>
        </table>
      </Section>

      {/* 3. Action Effectiveness */}
      <Section title="3. Action Effectiveness" description="How often do action cards get ace-blocked? Flag: success <40% BLOCKED">
        <table className="w-full text-sm">
          <thead><tr className="text-gray-400 text-left border-b border-gray-700">
            <th className="py-1 px-2">Card</th><th className="py-1 px-2">Succeeded</th>
            <th className="py-1 px-2">Ace-Blocked</th><th className="py-1 px-2">Total</th>
            <th className="py-1 px-2">Success Rate</th><th className="py-1 px-2">Flag</th>
          </tr></thead>
          <tbody>
            {m.actionEffectiveness.map(c => (
              <tr key={c.number} className="border-b border-gray-800">
                <td className="py-1 px-2 text-gray-200">{c.name} ({c.number})</td>
                <td className="py-1 px-2 text-gray-300">{c.played}</td>
                <td className="py-1 px-2 text-gray-300">{c.aceBlocked}</td>
                <td className="py-1 px-2 text-gray-300">{c.played + c.aceBlocked}</td>
                <td className="py-1 px-2 text-gray-300">{formatPct(c.successRate)}</td>
                <FlagCell flag={c.flag} />
              </tr>
            ))}
          </tbody>
        </table>
      </Section>

      {/* 4. Tome Bonus Hit Rate */}
      <Section title="4. Tome Bonus Hit Rate" description="How often do bonuses actually fire? Flag: <20% LOW">
        <table className="w-full text-sm">
          <thead><tr className="text-gray-400 text-left border-b border-gray-700">
            <th className="py-1 px-2">Card</th><th className="py-1 px-2">Scored</th>
            <th className="py-1 px-2">Hierophant</th><th className="py-1 px-2">Failed</th>
            <th className="py-1 px-2">Hit Rate</th><th className="py-1 px-2">Flag</th>
          </tr></thead>
          <tbody>
            {m.bonusHitRate.map(c => (
              <tr key={c.number} className="border-b border-gray-800">
                <td className="py-1 px-2 text-gray-200">{c.name} ({c.number})</td>
                <td className="py-1 px-2 text-gray-300">{c.scored}</td>
                <td className="py-1 px-2 text-gray-300">{c.hierophant}</td>
                <td className="py-1 px-2 text-gray-300">{c.failed}</td>
                <td className="py-1 px-2 text-gray-300">{formatPct(c.rate)}</td>
                <FlagCell flag={c.flag} />
              </tr>
            ))}
          </tbody>
        </table>
      </Section>

      {/* 5. Purchase Rate */}
      <Section title="5. Purchase Rate" description="Are cards being bought or aging off? Flag: aged-off >70% IGNORED">
        <table className="w-full text-sm">
          <thead><tr className="text-gray-400 text-left border-b border-gray-700">
            <th className="py-1 px-2">Card</th><th className="py-1 px-2">Bought</th>
            <th className="py-1 px-2">Display</th><th className="py-1 px-2">Aged Off</th>
            <th className="py-1 px-2">Buy Rate</th><th className="py-1 px-2">Flag</th>
          </tr></thead>
          <tbody>
            {m.purchaseRate.map(c => (
              <tr key={c.number} className="border-b border-gray-800">
                <td className="py-1 px-2 text-gray-200">{c.name} ({c.number})</td>
                <td className="py-1 px-2 text-gray-300">{c.purchased}</td>
                <td className="py-1 px-2 text-gray-300">{c.displayed}</td>
                <td className="py-1 px-2 text-gray-300">{c.agedOff}</td>
                <td className="py-1 px-2 text-gray-300">{formatPct(c.purchaseRate)}</td>
                <FlagCell flag={c.flag} />
              </tr>
            ))}
          </tbody>
        </table>
      </Section>
    </div>
  );
}
