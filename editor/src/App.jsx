import React, { useState, useCallback, useEffect } from 'react';
import { getDefaults, newCard } from './utils/defaults.js';
import { save, load } from './utils/storage.js';
import { createHistory, pushState, undo, redo, canUndo, canRedo } from './utils/history.js';
import CardList from './components/CardList.jsx';
import CardEditor from './components/CardEditor.jsx';
import GameRulesEditor from './components/GameRulesEditor.jsx';
import SaveManager from './components/SaveManager.jsx';
import SimRunner from './components/SimRunner.jsx';

const TABS = ['Cards', 'Game Rules', 'Save / Load', 'Simulate'];

export default function App() {
  // History-managed config state (undo/redo)
  const [history, setHistory] = useState(() => {
    const saved = load('current_config');
    return createHistory(saved || getDefaults());
  });
  const config = history.present;

  const setConfig = useCallback((updater) => {
    setHistory(prev => {
      const newConfig = typeof updater === 'function' ? updater(prev.present) : updater;
      return pushState(prev, newConfig);
    });
  }, []);

  const handleUndo = useCallback(() => setHistory(undo), []);
  const handleRedo = useCallback(() => setHistory(redo), []);

  // Auto-save current config to localStorage
  useEffect(() => {
    save('current_config', config);
  }, [config]);

  // Track active slot and export state
  const [activeSlotId, setActiveSlotId] = useState(() => load('active_slot_id', null));
  const [lastExportedJson, setLastExportedJson] = useState(() => JSON.stringify(config));
  const hasUnsavedChanges = JSON.stringify(config) !== lastExportedJson;

  useEffect(() => {
    save('active_slot_id', activeSlotId);
  }, [activeSlotId]);

  const markExported = useCallback(() => {
    setLastExportedJson(JSON.stringify(config));
  }, [config]);

  // beforeunload warning
  useEffect(() => {
    const handler = (e) => {
      if (hasUnsavedChanges) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [hasUnsavedChanges]);

  // Keyboard shortcuts: Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y
  useEffect(() => {
    const handler = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        handleUndo();
      } else if ((e.ctrlKey || e.metaKey) && (e.key === 'Z' || e.key === 'y')) {
        e.preventDefault();
        handleRedo();
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [handleUndo, handleRedo]);

  const [selectedIdx, setSelectedIdx] = useState(null);
  const [tab, setTab] = useState('Cards');

  const cards = config.majorArcana;

  const updateCard = useCallback((idx, updated) => {
    setConfig(prev => {
      const next = { ...prev, majorArcana: [...prev.majorArcana] };
      next.majorArcana[idx] = updated;
      return next;
    });
  }, [setConfig]);

  const deleteCard = useCallback((idx) => {
    setConfig(prev => ({
      ...prev,
      majorArcana: prev.majorArcana.filter((_, i) => i !== idx),
    }));
    setSelectedIdx(null);
  }, [setConfig]);

  const addCard = useCallback(() => {
    const maxNum = cards.reduce((m, c) => Math.max(m, c.number), -1);
    setConfig(prev => ({
      ...prev,
      majorArcana: [...prev.majorArcana, newCard(maxNum + 1)],
    }));
    setSelectedIdx(cards.length);
  }, [cards, setConfig]);

  const updateRules = useCallback((section, key, value) => {
    setConfig(prev => ({
      ...prev,
      [section]: { ...prev[section], [key]: value },
    }));
  }, [setConfig]);

  const updateScalarRule = useCallback((key, value) => {
    setConfig(prev => ({ ...prev, [key]: value }));
  }, [setConfig]);

  // Active slot name for header
  const activeSlot = activeSlotId ? load(activeSlotId) : null;
  const slotLabel = activeSlot ? activeSlot.name : 'Unsaved';

  return (
    <div className="min-h-screen flex flex-col">
      <header className="bg-gray-800 border-b border-gray-700 px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-bold text-amber-400">New Arcana — Card Editor</h1>
          <span className="text-sm text-gray-500">· {slotLabel}</span>
          {hasUnsavedChanges && (
            <span className="text-xs text-amber-400">• Unsaved</span>
          )}
          <div className="flex gap-1 ml-2">
            <button
              onClick={handleUndo}
              disabled={!canUndo(history)}
              className={`px-2 py-1 text-xs rounded ${canUndo(history) ? 'bg-gray-700 text-gray-300 hover:bg-gray-600' : 'bg-gray-800 text-gray-600 cursor-not-allowed'}`}
              title="Undo (Ctrl+Z)"
            >
              ← Undo{canUndo(history) ? ` (${history.past.length})` : ''}
            </button>
            <button
              onClick={handleRedo}
              disabled={!canRedo(history)}
              className={`px-2 py-1 text-xs rounded ${canRedo(history) ? 'bg-gray-700 text-gray-300 hover:bg-gray-600' : 'bg-gray-800 text-gray-600 cursor-not-allowed'}`}
              title="Redo (Ctrl+Shift+Z)"
            >
              Redo →{canRedo(history) ? ` (${history.future.length})` : ''}
            </button>
          </div>
        </div>
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

        {tab === 'Save / Load' && (
          <div className="flex-1 overflow-y-auto p-6">
            <SaveManager
              config={config}
              onImport={setConfig}
              activeSlotId={activeSlotId}
              onSetActiveSlot={setActiveSlotId}
              onMarkExported={markExported}
            />
          </div>
        )}

        {tab === 'Simulate' && (
          <div className="flex-1 overflow-y-auto p-6">
            <SimRunner config={config} />
          </div>
        )}
      </main>
    </div>
  );
}
