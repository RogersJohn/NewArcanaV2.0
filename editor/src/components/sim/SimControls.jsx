import React from 'react';
import { listKeys } from '../../utils/storage.js';
import { load } from '../../utils/storage.js';

export default function SimControls({
  games, setGames, players, setPlayers, seedInput, setSeedInput,
  compareSlotId, setCompareSlotId, running, onRun,
}) {
  const slots = () => {
    const keys = listKeys('slot_');
    return keys.map(k => {
      const data = load(k);
      return data ? { id: k, name: data.name } : null;
    }).filter(Boolean);
  };

  return (
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
        onClick={onRun}
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
  );
}
