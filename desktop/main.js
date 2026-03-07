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

process.on('uncaughtException', (error) => {
  dialog.showErrorBox('New Arcana Error', error.message);
});
