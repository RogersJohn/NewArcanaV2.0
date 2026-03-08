# Claude Code Prompt: Package as Standalone Windows Desktop App

## Context

The New Arcana project has three working pieces:
1. **Card Editor** (`editor/`) — React app for editing cards, game rules, running simulations, save/load configs
2. **Game Client** (`client/`) — React app where a human plays New Arcana against AI opponents  
3. **Simulation Engine** (`src/`) — Pure JS, zero Node runtime dependencies (only `config.js` and `index.js` use `fs`)

The goal: package everything into a single `.exe` that Danny double-clicks to open a polished desktop app. No terminal, no Node install, no command line. Windows only.

The technology is **Electron** — it bundles Chromium + Node.js into a standalone app. Vite builds the React apps into static assets, Electron serves them.

There are 4 phases. Test after each.

---

## Phase 1: Create the Electron Shell

### 1.1 Create the desktop app directory

```
desktop/
├── main.js              # Electron main process
├── preload.js           # Secure bridge between main & renderer
├── package.json         # Electron app manifest
├── icons/
│   └── icon.ico         # App icon (can be a simple placeholder for now)
└── build/               # Vite builds go here (created by build script)
    ├── editor/          # Built editor app
    └── client/          # Built game client
```

### 1.2 `desktop/package.json`

```json
{
  "name": "new-arcana",
  "version": "2.0.0",
  "description": "New Arcana — Card Game Design Tool",
  "main": "main.js",
  "author": "Danny Rafferty",
  "license": "MIT",
  "scripts": {
    "start": "electron .",
    "build": "node build.js",
    "dist": "electron-builder"
  },
  "devDependencies": {
    "electron": "^33.0.0",
    "electron-builder": "^25.0.0"
  },
  "build": {
    "appId": "com.newarcana.designer",
    "productName": "New Arcana",
    "win": {
      "target": "portable",
      "icon": "icons/icon.ico"
    },
    "portable": {
      "artifactName": "NewArcana.exe"
    },
    "files": [
      "main.js",
      "preload.js",
      "build/**/*"
    ],
    "extraResources": []
  }
}
```

The `"portable"` target produces a single `.exe` file — no installer, no Start Menu, just a file Danny can put anywhere and double-click.

### 1.3 `desktop/main.js` — Electron main process

This is the app's entry point. It creates the window and serves the built React apps.

```javascript
const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    title: 'New Arcana',
    icon: path.join(__dirname, 'icons', 'icon.ico'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // Load the launcher page
  mainWindow.loadFile(path.join(__dirname, 'build', 'launcher', 'index.html'));

  // Remove default menu bar (no File/Edit/View menus)
  mainWindow.setMenuBarVisibility(false);
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  app.quit();
});

// IPC handlers for file operations (save/load configs to disk)
ipcMain.handle('save-file', async (event, { defaultName, content }) => {
  const result = await dialog.showSaveDialog(mainWindow, {
    defaultPath: defaultName,
    filters: [{ name: 'JSON', extensions: ['json'] }],
  });
  if (!result.canceled && result.filePath) {
    fs.writeFileSync(result.filePath, content, 'utf-8');
    return { success: true, filePath: result.filePath };
  }
  return { success: false };
});

ipcMain.handle('open-file', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    filters: [{ name: 'JSON', extensions: ['json'] }],
    properties: ['openFile'],
  });
  if (!result.canceled && result.filePaths.length > 0) {
    const content = fs.readFileSync(result.filePaths[0], 'utf-8');
    return { success: true, content, filePath: result.filePaths[0] };
  }
  return { success: false };
});
```

### 1.4 `desktop/preload.js` — Secure bridge

```javascript
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  saveFile: (options) => ipcRenderer.invoke('save-file', options),
  openFile: () => ipcRenderer.invoke('open-file'),
  isElectron: true,
});
```

### 1.5 Create a Launcher page

Danny needs a home screen with clear choices. Create `desktop/launcher/` with a simple HTML page:

```
desktop/launcher/
├── index.html
└── launcher.css
```

The launcher is a simple static page (no React needed) with three large cards/buttons:

```
┌─────────────────────────────────────────────────────┐
│                    NEW ARCANA                        │
│              Card Game Design Suite                  │
│                                                     │
│   ┌──────────┐  ┌──────────┐  ┌──────────┐        │
│   │  🎴      │  │  🃏      │  │  📊      │        │
│   │          │  │          │  │          │        │
│   │  PLAY    │  │  CARD    │  │  QUICK   │        │
│   │  GAME    │  │  EDITOR  │  │  SIM     │        │
│   │          │  │          │  │          │        │
│   │Play New  │  │Edit      │  │Run a     │        │
│   │Arcana vs │  │cards,    │  │quick     │        │
│   │AI        │  │rules,    │  │balance   │        │
│   │opponents │  │test      │  │test      │        │
│   │          │  │balance   │  │          │        │
│   └──────────┘  └──────────┘  └──────────┘        │
│                                                     │
│   Version 2.0.0                                     │
└─────────────────────────────────────────────────────┘
```

- **Play Game** → navigates to `../client/index.html`
- **Card Editor** → navigates to `../editor/index.html`
- **Quick Sim** → navigates to `../editor/index.html#simulate` (opens editor on the Simulate tab)

Style the launcher with the same dark theme as the game (`--bg-dark: #1a1a2e`, `--accent-gold: #f0c040`). Keep it static HTML + CSS — no build step needed. Include the game's name prominently, a tarot-themed aesthetic (dark background, gold accents), and a version number at the bottom.

Each card should have a subtle hover effect (lift + glow), and clicking navigates within the Electron window (just `window.location.href`).

### 1.6 Commit

`feat: add Electron shell with launcher, main process, and IPC file handlers`

---

## Phase 2: Build Pipeline

The editor and client are separate Vite apps that need to be built into static assets and placed in `desktop/build/`.

### 2.1 Create `desktop/build.js`

This script builds both React apps and copies them into the desktop build directory:

```javascript
const { execSync } = require('child_process');
const { cpSync, mkdirSync, rmSync } = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const buildDir = path.join(__dirname, 'build');

// Clean
rmSync(buildDir, { recursive: true, force: true });
mkdirSync(buildDir, { recursive: true });

// Build editor
console.log('Building editor...');
execSync('npm install && npm run build', {
  cwd: path.join(root, 'editor'),
  stdio: 'inherit',
});
cpSync(path.join(root, 'editor', 'dist'), path.join(buildDir, 'editor'), { recursive: true });

// Build client
console.log('Building client...');
execSync('npm install && npm run build', {
  cwd: path.join(root, 'client'),
  stdio: 'inherit',
});
cpSync(path.join(root, 'client', 'dist'), path.join(buildDir, 'client'), { recursive: true });

// Copy launcher
cpSync(path.join(__dirname, 'launcher'), path.join(buildDir, 'launcher'), { recursive: true });

console.log('Build complete! Output in desktop/build/');
```

### 2.2 Fix Vite base paths

Both Vite apps need their `base` config set so assets load correctly from Electron's `file://` protocol:

**`editor/vite.config.js`** — add `base: './'`:
```javascript
export default defineConfig({
  base: './',
  plugins: [react()],
  resolve: { alias: { '@engine': path.resolve(import.meta.dirname, '../src') } },
  server: { port: 5175 },
});
```

**`client/vite.config.js`** — add `base: './'`:
```javascript
export default defineConfig({
  base: './',
  plugins: [react()],
  resolve: { alias: { '@engine': path.resolve(__dirname, '../src') } },
  server: { fs: { allow: ['..'] } },
});
```

The `base: './'` is critical — without it, Vite generates absolute paths (`/assets/...`) that don't work under Electron's `file://` protocol.

### 2.3 Fix Web Worker path in built editor

The SimRunner creates a Web Worker with:
```javascript
new Worker(new URL('../worker/simWorker.js', import.meta.url), { type: 'module' })
```

Verify that Vite's build correctly bundles this worker. Vite should handle `new URL(..., import.meta.url)` workers natively. If it doesn't, add `worker: { format: 'es' }` to the editor's vite config.

Test by running `cd editor && npm run build && npx serve dist` and opening the Simulate tab in a browser — verify the worker runs.

### 2.4 Add a "Back to Menu" button to both apps

In the editor's `App.jsx` header, add a Home/Back button that navigates to `../launcher/index.html`.

In the client's StartScreen, add a "Back to Menu" link.

In the client's GameOverScreen, add "Back to Menu" alongside "Play Again".

```javascript
// In Electron, navigate within the window
// In browser, this is just a relative link
function goToLauncher() {
  window.location.href = '../launcher/index.html';
}
```

### 2.5 Wire Electron file dialogs into the editor

The editor currently uses browser download (`Blob` + `<a>` click) for export and `<input type="file">` for import. These work in Electron, but native file dialogs are better UX. Update `ImportExport.jsx` (or `SaveManager.jsx`) to detect Electron and use native dialogs:

```javascript
const isElectron = window.electronAPI?.isElectron;

async function handleExport() {
  const json = JSON.stringify(config, null, 2);
  if (isElectron) {
    const result = await window.electronAPI.saveFile({
      defaultName: `${slotName || 'cards'}.json`,
      content: json,
    });
    if (result.success) setStatus({ type: 'success', msg: `Saved to ${result.filePath}` });
  } else {
    // Fallback: browser download
    const blob = new Blob([json], { type: 'application/json' });
    // ... existing browser code
  }
}
```

Same for import — use `window.electronAPI.openFile()` in Electron, fall back to `<input type="file">` in browser. This keeps the editor working in both Electron and browser.

### 2.6 Test the build

```bash
cd desktop
npm install
node build.js           # Should build editor + client into build/
npm start               # Should open Electron window with launcher
```

Verify:
- Launcher shows with three options
- Card Editor loads and works (including tooltips, save slots, simulation)
- Game Client loads, you can start a game and play against AI
- Back to Menu buttons work from both apps

### 2.7 Commit

`feat: add build pipeline and wire Electron into editor/client`

---

## Phase 3: Polish the Experience

### 3.1 App icon

Create a simple placeholder icon. Use the `@engine` card theme — a tarot card silhouette on a dark background with gold accent. This can be a simple 256x256 PNG converted to ICO.

If generating an icon is complex, use a solid dark blue (#1a1a2e) square with "NA" in gold (#f0c040) as text. Convert to `.ico` using a canvas-to-ico approach in the build script, or just include a pre-made `.ico` file.

### 3.2 Window title updates

Update the window title to reflect what Danny is doing:
- Launcher: "New Arcana"
- Card Editor: "New Arcana — Card Editor"
- Game Client: "New Arcana — Playing"

Do this via `document.title` in each app's `App.jsx` or via Electron's `mainWindow.setTitle()` through IPC.

### 3.3 Loading states

The Vite-built apps load instantly from disk, but add a brief loading screen in case the builds are large. In each app's `index.html`, add a CSS-only loading spinner inside `<div id="root">` that gets replaced when React mounts.

### 3.4 Error handling

Add a global error handler in Electron's main process:

```javascript
process.on('uncaughtException', (error) => {
  dialog.showErrorBox('New Arcana Error', error.message);
});
```

### 3.5 Commit

`feat: polish desktop app — icon, titles, loading states`

---

## Phase 4: Build the Executable

### 4.1 Build the distributable

```bash
cd desktop
node build.js           # Build React apps
npx electron-builder    # Package into .exe
```

This produces `desktop/dist/NewArcana.exe` — a single portable executable.

### 4.2 Verify the executable

1. Run `NewArcana.exe` — launcher should appear
2. Click "Card Editor" — editor loads with all features (cards, rules, tooltips, save slots, undo/redo, simulate)
3. Click "Play Game" — game client loads, select players/difficulty, play a round
4. Click "Back to Menu" from both apps — returns to launcher
5. In Card Editor: change Lovers vpPerPair to 100, go to Simulate tab, run 100 games — Lovers should show massive VP
6. Export a config using Save/Load tab — native Windows save dialog should appear
7. Import a config — native Windows open dialog should appear

### 4.3 Size check

The portable exe should be ~150-200MB (Electron + Chromium + app assets). This is normal for Electron apps. If significantly larger, check that `node_modules` aren't being bundled (the `files` config in package.json should prevent this).

### 4.4 Commit

`feat: electron-builder config for portable Windows exe`

---

## Important Constraints

- **Do NOT modify the engine code** (`src/`). It's tested and working. The desktop app wraps it, not changes it.
- **Keep browser compatibility.** The editor and client should still work when run with `npm run dev` in a browser. Use feature detection (`window.electronAPI?.isElectron`) not hard Electron dependencies.
- **The portable exe should be self-contained.** No Node.js install required, no npm, no terminal. Danny double-clicks and it works.
- **All existing tests must still pass.** Run `npx vitest run` from the repo root after each phase.
- **localStorage works in Electron.** The auto-save, save slots, and undo history all use localStorage, which Electron's Chromium supports natively. No changes needed.
- **Web Workers work in Electron.** The simulation runner's Web Worker works in Electron's renderer process just like in a browser. No changes needed.

## File Structure After Completion

```
NewArcanaV2.0/
├── src/                 # Engine (unchanged)
├── test/                # Tests (unchanged)
├── editor/              # Card editor (minor changes: base path, back button)
├── client/              # Game client (minor changes: base path, back button)
├── desktop/
│   ├── main.js          # Electron main process
│   ├── preload.js       # IPC bridge
│   ├── package.json     # Electron + builder config
│   ├── build.js         # Build script
│   ├── launcher/        # Static launcher page
│   │   ├── index.html
│   │   └── launcher.css
│   ├── icons/
│   │   └── icon.ico
│   ├── build/           # Vite build output (gitignored)
│   └── dist/            # Electron-builder output (gitignored)
├── data/cards.json      # Card config
├── index.js             # CLI (still works for terminal users)
├── package.json
├── CLAUDE.md
└── README.md
```

## README Update

Add a section to `README.md`:

```markdown
## Desktop App (Windows)

Download `NewArcana.exe` from the Releases page. Double-click to run — no installation needed.

The app includes:
- **Card Editor** — edit cards, rules, run simulations, compare configs
- **Play Game** — play New Arcana against AI opponents
- **Quick Sim** — run balance tests with your current card config

### Building from Source

```bash
cd desktop
npm install
node build.js           # Build React apps
npx electron-builder    # Package into NewArcana.exe (in desktop/dist/)
```
```
