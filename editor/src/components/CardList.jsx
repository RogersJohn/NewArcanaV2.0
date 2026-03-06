import React, { useState } from 'react';
import { CATEGORIES } from '../utils/defaults.js';

const BADGE_COLORS = {
  'action': 'bg-red-700 text-red-100',
  'tome': 'bg-blue-700 text-blue-100',
  'celestial': 'bg-purple-700 text-purple-100',
  'bonus-round': 'bg-green-700 text-green-100',
};

export default function CardList({ cards, selectedIdx, onSelect, onAdd }) {
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');

  const filtered = cards
    .map((c, i) => ({ ...c, _idx: i }))
    .filter(c => {
      if (filter !== 'all' && c.category !== filter) return false;
      if (search && !c.name.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    })
    .sort((a, b) => a.number - b.number);

  return (
    <div className="w-72 flex-shrink-0 border-r border-gray-700 flex flex-col bg-gray-850">
      <div className="p-3 border-b border-gray-700 space-y-2">
        <button
          onClick={onAdd}
          className="w-full py-1.5 bg-amber-600 hover:bg-amber-500 text-white rounded text-sm font-medium"
        >
          + Add New Card
        </button>
        <input
          type="text"
          placeholder="Search by name..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full px-2 py-1 bg-gray-800 border border-gray-600 rounded text-sm text-gray-200 placeholder-gray-500"
        />
        <select
          value={filter}
          onChange={e => setFilter(e.target.value)}
          className="w-full px-2 py-1 bg-gray-800 border border-gray-600 rounded text-sm text-gray-200"
        >
          <option value="all">All categories</option>
          {CATEGORIES.map(c => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
      </div>
      <div className="flex-1 overflow-y-auto">
        {filtered.map(card => (
          <div
            key={card._idx}
            onClick={() => onSelect(card._idx)}
            className={`px-3 py-2 cursor-pointer border-b border-gray-800 flex items-center gap-2 ${
              card._idx === selectedIdx
                ? 'bg-gray-700'
                : 'hover:bg-gray-800'
            }`}
          >
            <span className="text-gray-500 text-xs w-6 text-right">{card.number}</span>
            <span className="flex-1 text-sm truncate">{card.name || '(unnamed)'}</span>
            <span className={`text-xs px-1.5 py-0.5 rounded ${BADGE_COLORS[card.category] || 'bg-gray-600'}`}>
              {card.category}
            </span>
          </div>
        ))}
        {filtered.length === 0 && (
          <div className="text-gray-500 text-sm text-center py-4">No cards match</div>
        )}
      </div>
    </div>
  );
}
