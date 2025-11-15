const { app, BrowserWindow, screen, globalShortcut, ipcMain } = require('electron');

let mainWindow = null;

function createWindow () {
  const { width: screenWidth } = screen.getPrimaryDisplay().workAreaSize;
  const windowWidth = 420;
  const windowHeight = 50;  // Start with just widget height

  mainWindow = new BrowserWindow({
    width: windowWidth,
    height: windowHeight,
    x: Math.floor((screenWidth - windowWidth) / 2),
    y: 50,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    type: 'splash',
    skipTaskbar: false,
    resizable: false,
    show: false,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      enableRemoteModule: true
    }
  });

  require('@electron/remote/main').initialize();
  require('@electron/remote/main').enable(mainWindow.webContents);

  // Try different methods to stay on top
  mainWindow.setAlwaysOnTop(true, 'screen-saver', 1);
  mainWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });

  mainWindow.loadFile('index.html');

  // Completely disable context menu to avoid the contamination bug
  mainWindow.webContents.on('context-menu', (e) => {
    e.preventDefault();
  });

  // Show window after content loads
  mainWindow.webContents.on('did-finish-load', () => {
    mainWindow.show();
    mainWindow.focus();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  return mainWindow;
}

app.whenReady().then(() => {
  createWindow();

  // IPC handler to resize window
  ipcMain.on('resize-window', (_event, height) => {
    if (mainWindow) {
      const [width] = mainWindow.getContentSize();
      mainWindow.setContentSize(width, height, false);
    }
  });

  // Register global shortcut for toggling timer (Ctrl+Shift+T)
  globalShortcut.register('CommandOrControl+Shift+T', () => {
    if (mainWindow) {
      mainWindow.webContents.send('toggle-timer');
    }
  });

  // Register global shortcut for showing/hiding app (Ctrl+Shift+Space)
  globalShortcut.register('CommandOrControl+Shift+Space', () => {
    if (mainWindow) {
      if (mainWindow.isVisible()) {
        mainWindow.hide();
      } else {
        mainWindow.show();
      }
    } else {
      createWindow();
    }
  });
});

app.on('will-quit', () => {
  // Unregister all shortcuts
  globalShortcut.unregisterAll();
});
