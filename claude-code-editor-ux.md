# Claude Code Prompt: Make the Card Editor User-Friendly

## Context

The card editor (`editor/`) is functional but built for developers, not for Danny (the game designer). Key usability gaps:

1. **No persistence** — refreshing the page loses all work. No auto-save, no session recovery.
2. **No named save slots** — Danny can't save "v3 — nerfed Celestials" and switch between versions inside the editor. He has to manage JSON files manually.
3. **No undo** — if Danny changes 5 cards and the third change was wrong, he has to remember the original value or re-import.
4. **Export always names the file `cards.json`** — multiple exports overwrite each other in Downloads.
5. **No way to run simulations from the editor** — Danny has to switch to a terminal and type CLI commands.

This prompt fixes all of these. The editor is a pure client-side app (no backend), so all persistence uses `localStorage`.

There are 4 phases. Run `cd editor && npm run dev` and manually verify each phase works before proceeding.

---

## Phase 1: Auto-Save and Session Recovery

### 1.1 Create `editor/src/utils/storage.js`

This module wraps localStorage with a consistent key prefix and JSON serialization:

```javascript
const PREFIX = 'newarcana_';

export function save(key, value) {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value));
  } catch (e) {
    console.warn('Failed to save to localStorage:', e);
  }
}

export function load(key, fallback = null) {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    if (raw === null) return fallback;
    return JSON.parse(raw);
  } catch (e) {
    console.warn('Failed to load from localStorage:', e);
    return fallback;
  }
}

export function remove(key) {
  localStorage.removeItem(PREFIX + key);
}

export function listKeys(prefix = '') {
  const results = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key.startsWith(PREFIX + prefix)) {
      results.push(key.slice(PREFIX.length));
    }
  }
  return results;
}
```

### 1.2 Auto-save the current config

In `App.jsx`, whenever `config` changes, auto-save it to localStorage under the key `current_config`. On initial load, check localStorage before falling back to defaults.

```javascript
// Initialize from localStorage or defaults
const [config, setConfig] = useState(() => {
  const saved = load('current_config');
  return saved || getDefaults();
});

// Auto-save on every change
useEffect(() => {
  save('current_config', config);
}, [config]);
```

### 1.3 Add an "unsaved changes" indicator

In the header bar, show a small dot or text like "• Unsaved" next to the title when the current config differs from the last export. Track the last-exported config hash (or timestamp) in localStorage.

Also add a `beforeunload` handler that warns if there are unsaved changes:

```javascript
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
```

"Unsaved" here means "changed since last export to file or save to a named slot" — NOT "changed since page load" (because auto-save handles that).

### 1.4 Commit

`feat: add auto-save and session recovery to card editor`

---

## Phase 2: Named Save Slots

Danny needs to maintain multiple config versions and switch between them without managing files on disk.

### 2.1 Create a `SaveManager` component

Create `editor/src/components/SaveManager.jsx`. This replaces the current Import/Export tab with a more comprehensive save/load system. The old Import/Export functionality (file download, file upload, reset) should be preserved within this new component.

**Layout:**

```
┌──────────────────────────────────────────┐
│  Saved Configurations                     │
│                                          │
│  [Save Current As...] name input + Save  │
│                                          │
│  ┌─ v1 — Original defaults ──────────┐  │
│  │ Saved 2 hours ago · 27 cards       │  │
│  │ [Load] [Export] [Delete]           │  │
│  └────────────────────────────────────┘  │
│  ┌─ v2 — Nerfed Celestials ──────────┐  │
│  │ Saved 30 min ago · 27 cards        │  │
│  │ [Load] [Export] [Delete]           │  │
│  └────────────────────────────────────┘  │
│  ┌─ v3 — New Plague Card ────────────┐  │
│  │ Saved just now · 28 cards          │  │
│  │ [Load] [Export] [Delete]           │  │
│  └────────────────────────────────────┘  │
│                                          │
│  ─── File Import/Export ───              │
│  [Import from File]  [Reset to Defaults] │
└──────────────────────────────────────────┘
```

**Functionality:**

- **Save Current As**: Text input for a name (e.g., "v3 — nerfed celestials"). Saves the current config to localStorage under `slot_{timestamp}` with metadata: `{ name, savedAt, cardCount, config }`.
- **List saved configs**: Show all saved slots sorted by date (newest first). Each shows name, relative time ("2 hours ago"), card count.
- **Load**: Loads the slot's config into the editor (replaces current state). Confirm if current has unsaved changes.
- **Export**: Downloads that slot's config as a JSON file. The filename should be the slot name sanitized for filenames (spaces→hyphens, lowercase) + `.json`. For example, "v3 — nerfed celestials" exports as `v3-nerfed-celestials.json`.
- **Rename**: Allow inline renaming of saved slots.
- **Delete**: With confirmation. 
- **Overwrite**: If a slot is currently loaded, show an "Update" button that overwrites it with the current config.

### 2.2 Track which slot is active

In App state, track `activeSlotId` — the ID of the currently-loaded slot (or `null` if working from defaults/import). Show the active slot name in the header: "New Arcana — Card Editor · v3 — nerfed celestials". If no slot is active, show "New Arcana — Card Editor · Unsaved".

### 2.3 Update the tab structure

Replace the "Import / Export" tab label with "Save / Load". The tab should contain the SaveManager component. Keep all existing import/export/reset functionality accessible within it — don't remove anything, just reorganize.

### 2.4 Export filename uses slot name

When exporting from the SaveManager, the download filename uses the slot name. When exporting from the header "quick export" (if you add one), use the active slot name or `cards-unsaved.json`.

### 2.5 Commit

`feat: add named save slots for config versioning`

---

## Phase 3: Undo/Redo

### 3.1 Create `editor/src/utils/history.js`

Implement a simple undo/redo stack for the config state:

```javascript
export function createHistory(initial, maxSize = 50) {
  return {
    past: [],
    present: initial,
    future: [],
    maxSize,
  };
}

export function pushState(history, newState) {
  // Don't push if identical to present
  if (JSON.stringify(newState) === JSON.stringify(history.present)) {
    return history;
  }
  const past = [...history.past, history.present];
  if (past.length > history.maxSize) past.shift();
  return {
    ...history,
    past,
    present: newState,
    future: [], // Clear redo stack on new action
  };
}

export function undo(history) {
  if (history.past.length === 0) return history;
  const prev = history.past[history.past.length - 1];
  return {
    ...history,
    past: history.past.slice(0, -1),
    present: prev,
    future: [history.present, ...history.future],
  };
}

export function redo(history) {
  if (history.future.length === 0) return history;
  const next = history.future[0];
  return {
    ...history,
    past: [...history.past, history.present],
    present: next,
    future: history.future.slice(1),
  };
}

export function canUndo(history) { return history.past.length > 0; }
export function canRedo(history) { return history.future.length > 0; }
```

### 3.2 Wire into App.jsx

Replace the simple `useState(config)` with the history-managed state:

```javascript
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
```

The `setConfig` wrapper must still work with both direct values (from import/load) and updater functions (from existing callbacks). Test that all existing `setConfig` calls work unchanged.

### 3.3 Add undo/redo buttons and keyboard shortcuts

In the header bar, add undo/redo buttons:

```
[← Undo]  [Redo →]    |    Cards   Game Rules   Save / Load
```

Dim them when `canUndo`/`canRedo` is false.

Add keyboard shortcuts: `Ctrl+Z` for undo, `Ctrl+Shift+Z` (or `Ctrl+Y`) for redo. Use a `keydown` listener on `document`.

### 3.4 Show undo count

Optional but nice: show a small badge on the Undo button indicating how many steps back are available, e.g., "Undo (7)".

### 3.5 Auto-save interop

Auto-save should save `history.present` (the current config), not the entire history stack. The undo stack is ephemeral — it doesn't survive page reload. This is fine; the purpose of undo is for within-session mistakes, while save slots handle cross-session work.

### 3.6 Commit

`feat: add undo/redo with keyboard shortcuts`

---

## Phase 4: Run Simulations from the Editor

This is the biggest usability win. Danny should be able to click a button and see balance results without touching a terminal.

### 4.1 Architecture

The simulation engine is pure JS with no Node dependencies at runtime (file I/O is only in `config.js` which is the Node-only loader). The core modules — `simulation.js`, `engine.js`, `state.js`, `cards.js`, `ai/`, `poker.js`, `scoring.js`, `stats.js`, `effects.js`, `actions.js`, `rng.js`, `config-core.js`, `effect-resolver.js`, `history.js` — are all ESM and browser-safe.

**The editor should run simulations directly in the browser using a Web Worker** to avoid freezing the UI.

### 4.2 Create a simulation worker

Create `editor/src/worker/simWorker.js`:

```javascript
import { runSimulation } from '../../../src/simulation.js';
import { aggregateStats, computeCardAnalytics } from '../../../src/stats.js';

self.onmessage = function(e) {
  const { config, games, players, seed } = e.data;

  try {
    const sim = runSimulation({
      games,
      players,
      seed,
      aiAssignment: 'diverse',
      cardConfig: config,
    });

    const stats = aggregateStats(sim);
    
    self.postMessage({
      type: 'complete',
      stats,
      errors: sim.errors,
      completedGames: sim.completedGames,
    });
  } catch (err) {
    self.postMessage({ type: 'error', message: err.message });
  }
};
```

**Note on Vite workers:** In Vite, workers can be imported with `?worker` suffix:
```javascript
import SimWorker from './worker/simWorker.js?worker';
const worker = new SimWorker();
```

Alternatively, use `new Worker(new URL('./worker/simWorker.js', import.meta.url), { type: 'module' })`. Use whichever approach works with the Vite config. If the import paths to `../../../src/` don't resolve in the worker, you may need to adjust the Vite config to add a resolve alias:

```javascript
// vite.config.js
resolve: {
  alias: {
    '@engine': path.resolve(__dirname, '../src'),
  }
}
```

### 4.3 Create a `SimRunner` component

Create `editor/src/components/SimRunner.jsx`. This is a panel/modal that lets Danny run quick simulations:

**Layout:**

```
┌─────────────────────────────────────────────────┐
│  Quick Simulation                                │
│                                                  │
│  Games: [100 ▾]   Players: [4 ▾]   Seed: [auto] │
│                                                  │
│  [▶ Run Simulation]           [Running... 43%]   │
│                                                  │
│  ─── Results ───                                 │
│                                                  │
│  AI Win Rates:                                   │
│    Opportunist  48.2%  ████████████░░  (24/50)   │
│    Scoring      35.1%  █████████░░░░░  (18/51)   │
│    Builder      22.0%  ██████░░░░░░░░  (11/50)   │
│    ...                                           │
│                                                  │
│  Game Length: avg 4.2 rounds                     │
│  Death ends: 83% | Celestial wins: 3%            │
│                                                  │
│  Card Highlights:                                │
│    Most purchased: The Devil (65%)               │
│    Best bonus: The Hermit (100% hit rate)        │
│    Most used as wild: The Devil (32x)            │
│    Least purchased: Judgement (33%)              │
│                                                  │
│  [Export Full Report as JSON]                    │
└─────────────────────────────────────────────────┘
```

**Functionality:**

- **Games dropdown**: Options: 50, 100, 500, 1000. Default 100 (fast feedback).
- **Players dropdown**: 3, 4, 5. Default 4.
- **Seed**: "auto" generates a random seed, or Danny can type a number for reproducibility. Show the seed that was used in the results.
- **Run button**: Starts the Web Worker. While running, show a "Running..." indicator (can't easily get progress from the worker, so just show a spinner/pulse animation). Disable the button while running.
- **Results**: Display the key stats from `aggregateStats()` in a visual, scannable format. Use simple bar charts (CSS-only, no charting library needed) for win rates. Highlight anomalies.
- **Card Highlights**: Pull out the most interesting data points from the card stats — most/least purchased, highest/lowest bonus hit rate, most used as wild.
- **Export**: Download the full stats object as JSON for deeper analysis.

### 4.4 Add a "Simulate" tab (or button)

Add "Simulate" as a new tab in the header, after "Save / Load". When Danny switches to it, show the SimRunner component. The simulation uses the current in-memory config (not a saved file), so Danny can tweak a value and immediately test it.

### 4.5 A/B Compare mode

Add a "Compare with..." button in the SimRunner that lets Danny select a saved slot to compare against. This runs two simulations (current config vs. the saved slot's config) with the same seed and shows a side-by-side diff of key metrics:

```
                    Current         v1 — Original     Δ
Opportunist WR      48.2%           51.7%           -3.5%
Avg game length     4.2 rounds      4.4 rounds      -0.2
Celestial wins      3%              2.2%            +0.8%
```

This is simpler than the full CLI `--compare` mode — just show the headline numbers side by side. Don't try to compute statistical significance in the browser; just show the raw deltas.

### 4.6 Handle import path issues

The simulation imports from `../../../src/`. This may cause issues with Vite's module resolution, especially in a Web Worker. If needed:

1. Add a Vite alias in `editor/vite.config.js`:
   ```javascript
   import path from 'path';
   export default defineConfig({
     plugins: [react()],
     resolve: {
       alias: {
         '@engine': path.resolve(__dirname, '../src'),
       }
     },
     server: { port: 5175 },
   });
   ```
2. Use `@engine/simulation.js` in the worker instead of relative paths.

Test that the worker can actually import and run the simulation. If Vite tree-shaking breaks any imports, fix them. The simulation modules don't use Node APIs (no `fs`, no `path`), so they should be browser-compatible — but verify this by actually running a simulation in the browser.

### 4.7 Commit

`feat: add in-browser simulation runner to card editor`

---

## Important Constraints

- **Do NOT add any npm dependencies.** The editor uses React + Vite + Tailwind CDN. The simulation runner should use a Web Worker and CSS-only visualizations. No chart libraries.
- **localStorage keys must be namespaced** with `newarcana_` to avoid conflicts if Danny has other apps on localhost.
- **Keep the existing import/export file functionality.** Danny should still be able to download JSON files and import them. The save slots are an additional layer on top, not a replacement.
- **The undo history is session-only.** Don't persist it to localStorage — it would be huge and slow. Auto-save persists only the current config.
- **The simulation must run in a Web Worker** so it doesn't freeze the UI. Even 100 games takes ~1-2 seconds, and Danny will try 1000.
- **All existing editor features must keep working.** Card editing, game rules editing, tooltips, validation — don't break any of it.

## Final Verification

After all phases:

1. Open the editor, make changes, close the tab, reopen — changes should be preserved
2. Save two named configs, switch between them, verify they load correctly
3. Make 5 changes, undo 3 times, redo once — verify correct state at each step
4. Ctrl+Z / Ctrl+Shift+Z keyboard shortcuts work
5. Run a 100-game simulation, verify results display correctly
6. Export a config from a named slot, verify filename matches slot name
7. Import a file, verify it loads into the editor
8. Reset to defaults, verify it clears to base config
9. Run `npx vitest run` from the repo root — all existing engine tests still pass (the editor changes shouldn't affect them, but verify)
