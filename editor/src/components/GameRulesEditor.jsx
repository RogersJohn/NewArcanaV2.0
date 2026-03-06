import React from 'react';
import { GAME_RULES, BUY_PRICES, SCORING } from '../utils/tooltips.js';
import Tooltip from './Tooltip.jsx';

const GAME_RULES_FIELDS = [
  { key: 'handSizeLimit', label: 'Hand Size Limit' },
  { key: 'devilHandSizeLimit', label: 'Devil Hand Size Limit' },
  { key: 'tomeCapacity', label: 'Tome Capacity' },
  { key: 'realmTrigger', label: 'Realm Trigger (cards to end round)' },
  { key: 'displaySlots', label: 'Display Slots' },
  { key: 'maxTurnsPerRound', label: 'Max Turns Per Round' },
  { key: 'maxRounds', label: 'Max Rounds' },
  { key: 'initialDealCount', label: 'Initial Deal Count' },
  { key: 'roundDealCount', label: 'Round Deal Count' },
];

const BUY_PRICES_FIELDS = [
  { key: 'draw', label: 'Draw Pile Top' },
  { key: 'display0', label: 'Display Slot 1' },
  { key: 'display1', label: 'Display Slot 2' },
  { key: 'display2', label: 'Display Slot 3' },
  { key: 'discard', label: 'Discard Top' },
];

const SCORING_FIELDS = [
  { key: 'celestialVp', label: 'Celestial VP' },
  { key: 'plagueVp', label: 'Plague VP' },
  { key: 'celestialWinCount', label: 'Celestial Win Count' },
  { key: 'potInitialPerPlayer', label: 'Pot Initial Per Player' },
  { key: 'potGrowth', label: 'Pot Growth Per Round' },
];

export default function GameRulesEditor({ config, onUpdateSection, onUpdateScalar }) {
  return (
    <div className="max-w-2xl space-y-8">
      <Section title="Game Rules">
        {GAME_RULES_FIELDS.map(f => (
          <NumberField
            key={f.key}
            label={f.label}
            tooltip={GAME_RULES[f.key]}
            value={config.gameRules?.[f.key]}
            onChange={v => onUpdateSection('gameRules', f.key, v)}
          />
        ))}
      </Section>

      <Section title="Buy Prices">
        {BUY_PRICES_FIELDS.map(f => (
          <NumberField
            key={f.key}
            label={f.label}
            tooltip={BUY_PRICES[f.key]}
            value={config.buyPrices?.[f.key]}
            onChange={v => onUpdateSection('buyPrices', f.key, v)}
          />
        ))}
      </Section>

      <Section title="Scoring">
        {SCORING_FIELDS.map(f => (
          <NumberField
            key={f.key}
            label={f.label}
            tooltip={SCORING[f.key]}
            value={config.scoring?.[f.key]}
            onChange={v => onUpdateSection('scoring', f.key, v)}
          />
        ))}
      </Section>

      <Section title="Other">
        <NumberField
          label="Max Payment Cards"
          tooltip={SCORING.maxPaymentCards}
          value={config.maxPaymentCards}
          onChange={v => onUpdateScalar('maxPaymentCards', v)}
        />
      </Section>
    </div>
  );
}

function Section({ title, children }) {
  return (
    <div>
      <h2 className="text-lg font-semibold text-amber-400 mb-3 border-b border-gray-700 pb-1">{title}</h2>
      <div className="grid grid-cols-2 gap-3">
        {children}
      </div>
    </div>
  );
}

function NumberField({ label, tooltip, value, onChange }) {
  return (
    <label className="block">
      <span className="text-sm text-gray-400 inline-flex items-center gap-1">
        {label}
        <Tooltip text={tooltip} />
      </span>
      <input
        type="number"
        value={value ?? ''}
        onChange={e => onChange(Number(e.target.value))}
        className="input"
      />
    </label>
  );
}
