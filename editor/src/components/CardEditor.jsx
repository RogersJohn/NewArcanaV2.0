import React, { useState, useEffect } from 'react';
import { CATEGORIES, SUITS } from '../utils/defaults.js';
import { validateCard } from '../utils/schema.js';
import { CARD_FIELDS } from '../utils/tooltips.js';
import { Label } from './Tooltip.jsx';
import EffectEditor from './EffectEditor.jsx';

function buildDefaultEffect(category) {
  if (category === 'action') return { type: 'action', action: 'MOVE_CELESTIAL_TO_TOME' };
  if (category === 'tome') return { type: 'tome', onPlay: null, bonus: null };
  if (category === 'celestial') return { type: 'celestial', vpAtGameEnd: 2, winConditionGroup: 'celestial' };
  if (category === 'bonus-round') return { type: 'bonus', bonus: { bonusType: 'suitHighest', suit: 'WANDS', vp: 1 } };
  return {};
}

export default function CardEditor({ card, allCards, onChange, onDelete }) {
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  useEffect(() => {
    setShowDeleteConfirm(false);
  }, [card]);

  const errors = validateCard(card, allCards);

  const update = (key, val) => {
    const next = { ...card, [key]: val };
    if (key === 'category' && val !== card.category) {
      next.effect = buildDefaultEffect(val);
    }
    onChange(next);
  };

  const handleKeywordsChange = (e) => {
    const kw = e.target.value.split(',').map(s => s.trim()).filter(Boolean);
    onChange({ ...card, keywords: kw });
  };

  return (
    <div className="max-w-2xl space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-amber-400">
          #{card.number} {card.name || '(unnamed)'}
        </h2>
        <div className="flex gap-2">
          {!showDeleteConfirm ? (
            <button
              onClick={() => setShowDeleteConfirm(true)}
              className="px-3 py-1 text-sm bg-red-900 hover:bg-red-800 text-red-200 rounded"
            >
              Delete
            </button>
          ) : (
            <div className="flex gap-1">
              <button
                onClick={onDelete}
                className="px-3 py-1 text-sm bg-red-600 hover:bg-red-500 text-white rounded"
              >
                Confirm Delete
              </button>
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="px-3 py-1 text-sm bg-gray-700 hover:bg-gray-600 rounded"
              >
                Cancel
              </button>
            </div>
          )}
        </div>
      </div>

      {errors.length > 0 && (
        <div className="bg-red-900/30 border border-red-800 rounded p-3">
          {errors.map((e, i) => (
            <p key={i} className="text-sm text-red-300">{e}</p>
          ))}
        </div>
      )}

      <div className="grid grid-cols-2 gap-4">
        <Label text="Number" tooltip={CARD_FIELDS.number}>
          <input
            type="number"
            value={card.number}
            onChange={e => update('number', Number(e.target.value))}
            className="input"
          />
        </Label>
        <Label text="Name" tooltip={CARD_FIELDS.name}>
          <input
            type="text"
            value={card.name}
            onChange={e => update('name', e.target.value)}
            className="input"
          />
        </Label>
        <Label text="Category" tooltip={CARD_FIELDS.category}>
          <select
            value={card.category}
            onChange={e => update('category', e.target.value)}
            className="input"
          >
            {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </Label>
        <Label text="Suit" tooltip={CARD_FIELDS.suit}>
          <select
            value={card.suit || ''}
            onChange={e => update('suit', e.target.value || null)}
            className="input"
          >
            <option value="">None</option>
            {SUITS.filter(Boolean).map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </Label>
        <Label text="Keywords (comma-separated)" tooltip={CARD_FIELDS.keywords}>
          <input
            type="text"
            value={(card.keywords || []).join(', ')}
            onChange={handleKeywordsChange}
            className="input"
          />
        </Label>
      </div>

      <div className="border-t border-gray-700 pt-4">
        <h3 className="text-sm font-medium text-gray-300 mb-3">Effect</h3>
        <EffectEditor
          category={card.category}
          effect={card.effect || buildDefaultEffect(card.category)}
          onChange={eff => onChange({ ...card, effect: eff })}
        />
      </div>
    </div>
  );
}
