import React, { useState, useCallback } from 'react';
import { getDefaults, newCard } from './utils/defaults.js';
import CardList from './components/CardList.jsx';
import CardEditor from './components/CardEditor.jsx';
import GameRulesEditor from './components/GameRulesEditor.jsx';
import ImportExport from './components/ImportExport.jsx';

const TABS = ['Cards', 'Game Rules', 'Import / Export'];

export default function App() {
  const [config, setConfig] = useState(() => getDefaults());
  const [selectedIdx, setSelectedIdx] = useState(null);
  const [tab, setTab] = useState('Cards');

  const cards = config.majorArcana;

  const updateCard = useCallback((idx, updated) => {
    setConfig(prev => {
      const next = { ...prev, majorArcana: [...prev.majorArcana] };
      next.majorArcana[idx] = updated;
      return next;
    });
  }, []);

  const deleteCard = useCallback((idx) => {
    setConfig(prev => {
      const next = { ...prev, majorArcana: prev.majorArcana.filter((_, i) => i !== idx) };
      return next;
    });
    setSelectedIdx(null);
  }, []);

  const addCard = useCallback(() => {
    const maxNum = cards.reduce((m, c) => Math.max(m, c.number), -1);
    setConfig(prev => ({
      ...prev,
      majorArcana: [...prev.majorArcana, newCard(maxNum + 1)],
    }));
    setSelectedIdx(cards.length);
  }, [cards]);

  const updateRules = useCallback((section, key, value) => {
    setConfig(prev => ({
      ...prev,
      [section]: { ...prev[section], [key]: value },
    }));
  }, []);

  const updateScalarRule = useCallback((key, value) => {
    setConfig(prev => ({ ...prev, [key]: value }));
  }, []);

  return (
    <div className="min-h-screen flex flex-col">
      <header className="bg-gray-800 border-b border-gray-700 px-6 py-3 flex items-center justify-between">
        <h1 className="text-xl font-bold text-amber-400">New Arcana — Card Editor</h1>
        <nav className="flex gap-2">
          {TABS.map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-1.5 rounded text-sm font-medium ${
                tab === t ? 'bg-amber-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
              }`}
            >
              {t}
            </button>
          ))}
        </nav>
      </header>

      <main className="flex-1 flex overflow-hidden">
        {tab === 'Cards' && (
          <>
            <CardList
              cards={cards}
              selectedIdx={selectedIdx}
              onSelect={setSelectedIdx}
              onAdd={addCard}
            />
            <div className="flex-1 overflow-y-auto p-6">
              {selectedIdx != null && cards[selectedIdx] ? (
                <CardEditor
                  card={cards[selectedIdx]}
                  allCards={cards}
                  onChange={(updated) => updateCard(selectedIdx, updated)}
                  onDelete={() => deleteCard(selectedIdx)}
                />
              ) : (
                <div className="text-gray-500 text-center mt-20">
                  Select a card from the list or click "Add New Card"
                </div>
              )}
            </div>
          </>
        )}

        {tab === 'Game Rules' && (
          <div className="flex-1 overflow-y-auto p-6">
            <GameRulesEditor
              config={config}
              onUpdateSection={updateRules}
              onUpdateScalar={updateScalarRule}
            />
          </div>
        )}

        {tab === 'Import / Export' && (
          <div className="flex-1 overflow-y-auto p-6">
            <ImportExport
              config={config}
              onImport={setConfig}
            />
          </div>
        )}
      </main>
    </div>
  );
}
