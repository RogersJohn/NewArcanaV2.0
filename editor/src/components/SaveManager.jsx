import React, { useState, useRef } from 'react';
import { save, load, remove, listKeys } from '../utils/storage.js';
import { getDefaults } from '../utils/defaults.js';
import { validateConfig } from '../utils/schema.js';

function timeAgo(ts) {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} hour${hours > 1 ? 's' : ''} ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days > 1 ? 's' : ''} ago`;
}

function sanitizeFilename(name) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'config';
}

export default function SaveManager({ config, onImport, activeSlotId, onSetActiveSlot, onMarkExported }) {
  const [newName, setNewName] = useState('');
  const [status, setStatus] = useState(null);
  const [editingSlot, setEditingSlot] = useState(null);
  const [editName, setEditName] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(null);
  const fileRef = useRef(null);

  const getSlots = () => {
    const keys = listKeys('slot_');
    return keys.map(k => {
      const data = load(k);
      return data ? { id: k, ...data } : null;
    }).filter(Boolean).sort((a, b) => b.savedAt - a.savedAt);
  };

  const [slots, setSlots] = useState(getSlots);
  const refreshSlots = () => setSlots(getSlots());

  const handleSave = () => {
    const name = newName.trim();
    if (!name) return;
    const id = 'slot_' + Date.now();
    save(id, {
      name,
      savedAt: Date.now(),
      cardCount: config.majorArcana?.length || 0,
      config,
    });
    onSetActiveSlot(id);
    onMarkExported();
    setNewName('');
    refreshSlots();
    setStatus({ type: 'success', msg: `Saved as "${name}"` });
  };

  const handleUpdate = () => {
    if (!activeSlotId) return;
    const existing = load(activeSlotId);
    if (!existing) return;
    save(activeSlotId, {
      ...existing,
      savedAt: Date.now(),
      cardCount: config.majorArcana?.length || 0,
      config,
    });
    onMarkExported();
    refreshSlots();
    setStatus({ type: 'success', msg: `Updated "${existing.name}"` });
  };

  const handleLoad = (slot) => {
    onImport(slot.config);
    onSetActiveSlot(slot.id);
    onMarkExported();
    setStatus({ type: 'success', msg: `Loaded "${slot.name}"` });
  };

  const handleExportSlot = (slot) => {
    const json = JSON.stringify(slot.config, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = sanitizeFilename(slot.name) + '.json';
    a.click();
    URL.revokeObjectURL(url);
    setStatus({ type: 'success', msg: `Exported "${slot.name}" as ${sanitizeFilename(slot.name)}.json` });
  };

  const handleDelete = (slot) => {
    remove(slot.id);
    if (activeSlotId === slot.id) onSetActiveSlot(null);
    setConfirmDelete(null);
    refreshSlots();
    setStatus({ type: 'success', msg: `Deleted "${slot.name}"` });
  };

  const handleRename = (slot) => {
    const name = editName.trim();
    if (!name) return;
    const data = load(slot.id);
    if (data) {
      save(slot.id, { ...data, name });
      refreshSlots();
    }
    setEditingSlot(null);
    setEditName('');
  };

  const handleExportCurrent = () => {
    const json = JSON.stringify(config, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const activeSlot = activeSlotId ? load(activeSlotId) : null;
    a.download = activeSlot ? sanitizeFilename(activeSlot.name) + '.json' : 'cards-unsaved.json';
    a.click();
    URL.revokeObjectURL(url);
    onMarkExported();
    setStatus({ type: 'success', msg: 'Config exported' });
  };

  const handleImportFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      const errors = validateConfig(parsed);
      if (errors.length > 0) {
        setStatus({ type: 'error', msg: `Validation errors:\n${errors.join('\n')}` });
        return;
      }
      onImport(parsed);
      onSetActiveSlot(null);
      setStatus({ type: 'success', msg: `Imported ${parsed.majorArcana.length} cards from ${file.name}` });
    } catch (err) {
      setStatus({ type: 'error', msg: `Failed to parse: ${err.message}` });
    }
    if (fileRef.current) fileRef.current.value = '';
  };

  const handleReset = () => {
    onImport(getDefaults());
    onSetActiveSlot(null);
    setStatus({ type: 'success', msg: 'Reset to default configuration' });
  };

  const handleCopyJson = () => {
    navigator.clipboard.writeText(JSON.stringify(config, null, 2));
    setStatus({ type: 'success', msg: 'JSON copied to clipboard' });
  };

  return (
    <div className="max-w-2xl space-y-6">
      <h2 className="text-lg font-semibold text-amber-400">Saved Configurations</h2>

      <div className="flex gap-2 items-end">
        <div className="flex-1">
          <label className="text-sm text-gray-400">Save Current As...</label>
          <input
            type="text"
            value={newName}
            onChange={e => setNewName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSave()}
            placeholder='e.g. "v3 — nerfed Celestials"'
            className="input"
          />
        </div>
        <button onClick={handleSave} disabled={!newName.trim()} className="btn-primary" style={{ opacity: newName.trim() ? 1 : 0.5 }}>
          Save
        </button>
        {activeSlotId && (
          <button onClick={handleUpdate} className="btn-secondary">
            Update Current Slot
          </button>
        )}
      </div>

      <div className="space-y-2">
        {slots.length === 0 && (
          <p className="text-sm text-gray-500">No saved configurations yet.</p>
        )}
        {slots.map(slot => (
          <div key={slot.id} className={`rounded border p-3 ${
            activeSlotId === slot.id ? 'border-amber-600 bg-amber-900/10' : 'border-gray-700 bg-gray-800/50'
          }`}>
            <div className="flex items-center justify-between">
              {editingSlot === slot.id ? (
                <div className="flex gap-2 flex-1 mr-2">
                  <input
                    type="text"
                    value={editName}
                    onChange={e => setEditName(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleRename(slot)}
                    className="input flex-1"
                    autoFocus
                  />
                  <button onClick={() => handleRename(slot)} className="btn-secondary text-xs">OK</button>
                  <button onClick={() => setEditingSlot(null)} className="btn-secondary text-xs">Cancel</button>
                </div>
              ) : (
                <div>
                  <span className="font-medium text-gray-200">{slot.name}</span>
                  {activeSlotId === slot.id && (
                    <span className="ml-2 text-xs text-amber-400">(active)</span>
                  )}
                  <div className="text-xs text-gray-500">
                    {timeAgo(slot.savedAt)} · {slot.cardCount} cards
                  </div>
                </div>
              )}
              {editingSlot !== slot.id && (
                <div className="flex gap-1">
                  <button onClick={() => handleLoad(slot)} className="btn-secondary text-xs py-1 px-2">Load</button>
                  <button onClick={() => handleExportSlot(slot)} className="btn-secondary text-xs py-1 px-2">Export</button>
                  <button onClick={() => { setEditingSlot(slot.id); setEditName(slot.name); }} className="btn-secondary text-xs py-1 px-2">Rename</button>
                  {confirmDelete === slot.id ? (
                    <>
                      <button onClick={() => handleDelete(slot)} className="btn-danger text-xs py-1 px-2">Confirm</button>
                      <button onClick={() => setConfirmDelete(null)} className="btn-secondary text-xs py-1 px-2">Cancel</button>
                    </>
                  ) : (
                    <button onClick={() => setConfirmDelete(slot.id)} className="btn-danger text-xs py-1 px-2">Delete</button>
                  )}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      <div className="border-t border-gray-700 pt-4 space-y-3">
        <h3 className="text-sm font-medium text-gray-300">File Import / Export</h3>
        <div className="flex gap-3">
          <button onClick={handleExportCurrent} className="btn-primary">Export Config (download)</button>
          <button onClick={handleCopyJson} className="btn-secondary">Copy JSON to Clipboard</button>
        </div>
        <div>
          <p className="text-sm text-gray-400 mb-1">Import a config file:</p>
          <input
            ref={fileRef}
            type="file"
            accept=".json"
            onChange={handleImportFile}
            className="block text-sm text-gray-400 file:mr-3 file:py-1.5 file:px-3 file:rounded file:border-0 file:bg-gray-700 file:text-gray-200 file:cursor-pointer hover:file:bg-gray-600"
          />
        </div>
        <div className="border-t border-gray-700 pt-3">
          <button onClick={handleReset} className="btn-danger">Reset to Defaults</button>
          <p className="text-xs text-gray-500 mt-1">
            Reverts all cards and settings to the built-in defaults from config-core.js
          </p>
        </div>
      </div>

      {status && (
        <div className={`rounded p-3 text-sm whitespace-pre-wrap ${
          status.type === 'error'
            ? 'bg-red-900/30 border border-red-800 text-red-300'
            : 'bg-green-900/30 border border-green-800 text-green-300'
        }`}>
          {status.msg}
        </div>
      )}
    </div>
  );
}
