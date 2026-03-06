import React, { useRef, useState } from 'react';
import { getDefaults } from '../utils/defaults.js';
import { validateConfig } from '../utils/schema.js';

export default function ImportExport({ config, onImport }) {
  const fileRef = useRef(null);
  const [status, setStatus] = useState(null);

  const handleExport = () => {
    const json = JSON.stringify(config, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'cards.json';
    a.click();
    URL.revokeObjectURL(url);
    setStatus({ type: 'success', msg: 'Config exported as cards.json' });
  };

  const handleImport = async (e) => {
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
      setStatus({ type: 'success', msg: `Imported ${parsed.majorArcana.length} cards from ${file.name}` });
    } catch (err) {
      setStatus({ type: 'error', msg: `Failed to parse: ${err.message}` });
    }
    // Reset file input so the same file can be re-imported
    if (fileRef.current) fileRef.current.value = '';
  };

  const handleReset = () => {
    onImport(getDefaults());
    setStatus({ type: 'success', msg: 'Reset to default configuration' });
  };

  const handleCopyJson = () => {
    navigator.clipboard.writeText(JSON.stringify(config, null, 2));
    setStatus({ type: 'success', msg: 'JSON copied to clipboard' });
  };

  return (
    <div className="max-w-2xl space-y-6">
      <h2 className="text-lg font-semibold text-amber-400">Import / Export</h2>

      <div className="space-y-3">
        <div className="flex gap-3">
          <button onClick={handleExport} className="btn-primary">
            Export Config (download)
          </button>
          <button onClick={handleCopyJson} className="btn-secondary">
            Copy JSON to Clipboard
          </button>
        </div>

        <div>
          <p className="text-sm text-gray-400 mb-1">Import a config file:</p>
          <input
            ref={fileRef}
            type="file"
            accept=".json"
            onChange={handleImport}
            className="block text-sm text-gray-400 file:mr-3 file:py-1.5 file:px-3 file:rounded file:border-0 file:bg-gray-700 file:text-gray-200 file:cursor-pointer hover:file:bg-gray-600"
          />
        </div>

        <div className="border-t border-gray-700 pt-3">
          <button onClick={handleReset} className="btn-danger">
            Reset to Defaults
          </button>
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

      <div className="border-t border-gray-700 pt-4">
        <h3 className="text-sm font-medium text-gray-300 mb-2">Current Config Preview</h3>
        <pre className="bg-gray-800 rounded p-3 text-xs text-gray-400 overflow-auto max-h-96">
          {JSON.stringify(config, null, 2)}
        </pre>
      </div>
    </div>
  );
}
