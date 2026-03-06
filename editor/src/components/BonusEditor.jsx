import React from 'react';
import { BONUS_TYPES, SUITS } from '../utils/defaults.js';
import { BONUS } from '../utils/tooltips.js';
import Tooltip, { Label } from './Tooltip.jsx';

export default function BonusEditor({ bonus, onChange }) {
  if (!bonus) {
    return (
      <button
        onClick={() => onChange({ bonusType: 'suitHighest', suit: 'WANDS', vp: 1 })}
        className="text-sm text-amber-400 hover:text-amber-300"
      >
        + Add bonus
      </button>
    );
  }

  const update = (key, val) => onChange({ ...bonus, [key]: val });

  return (
    <div className="space-y-2 pl-2 border-l-2 border-gray-700">
      <div className="flex items-center justify-between">
        <Label text="Bonus Type" tooltip={BONUS[bonus.bonusType] || BONUS.bonusType}>
          <select
            value={bonus.bonusType || ''}
            onChange={e => onChange({ bonusType: e.target.value })}
            className="input"
          >
            {BONUS_TYPES.map(b => <option key={b} value={b}>{b}</option>)}
          </select>
        </Label>
        <button
          onClick={() => onChange(null)}
          className="text-xs text-red-400 hover:text-red-300 mt-4"
        >
          Remove
        </button>
      </div>

      {needsSuit(bonus.bonusType) && (
        <Label text="Suit" tooltip={BONUS.suit}>
          <select
            value={bonus.suit || ''}
            onChange={e => update('suit', e.target.value)}
            className="input"
          >
            {SUITS.filter(Boolean).map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </Label>
      )}

      {needsVp(bonus.bonusType) && (
        <Label text="VP" tooltip={BONUS.vp}>
          <input
            type="number"
            value={bonus.vp ?? 1}
            onChange={e => update('vp', Number(e.target.value))}
            className="input"
          />
        </Label>
      )}

      {bonus.bonusType === 'pairCounting' && (
        <Label text="VP per Pair" tooltip={BONUS.vpPerPair}>
          <input
            type="number"
            value={bonus.vpPerPair ?? 1}
            onChange={e => update('vpPerPair', Number(e.target.value))}
            className="input"
          />
        </Label>
      )}

      {bonus.bonusType === 'suitMajority' && (
        <>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={bonus.requiresStrictAdvantage ?? true}
              onChange={e => update('requiresStrictAdvantage', e.target.checked)}
            />
            Requires strict advantage
            <Tooltip text={BONUS.requiresStrictAdvantage} />
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={bonus.countWilds ?? true}
              onChange={e => update('countWilds', e.target.checked)}
            />
            Count wilds
            <Tooltip text={BONUS.countWilds} />
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={bonus.requiresChoice ?? false}
              onChange={e => update('requiresChoice', e.target.checked)}
            />
            Requires choice (player picks suit)
            <Tooltip text={BONUS.requiresChoice} />
          </label>
        </>
      )}

      {bonus.bonusType === 'suitHighest' && (
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={bonus.allowTie ?? true}
            onChange={e => update('allowTie', e.target.checked)}
          />
          Allow tie
          <Tooltip text={BONUS.allowTie} />
        </label>
      )}
    </div>
  );
}

function needsSuit(type) {
  return ['suitHighest', 'noSuitInRealm'].includes(type);
}

function needsVp(type) {
  return ['suitHighest', 'suitMajority', 'hermitExclusive', 'noSuitInRealm'].includes(type);
}
