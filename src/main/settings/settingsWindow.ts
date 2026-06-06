import { resolve } from 'node:path';
import { BrowserWindow, shell } from 'electron';

const SETTINGS_WINDOW_WIDTH = 440;
const SETTINGS_WINDOW_HEIGHT = 580;

let settingsWindow: BrowserWindow | null = null;

export function openSettingsWindow(): void {
  if (settingsWindow !== null && !settingsWindow.isDestroyed()) {
    settingsWindow.show();
    settingsWindow.focus();
    return;
  }

  settingsWindow = new BrowserWindow({
    width: SETTINGS_WINDOW_WIDTH,
    height: SETTINGS_WINDOW_HEIGHT,
    title: 'Settings',
    resizable: true,
    maximizable: false,
    show: false,
    webPreferences: {
      preload: resolve(import.meta.dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
    },
  });

  settingsWindow.setMenuBarVisibility(false);

  settingsWindow.on('ready-to-show', () => settingsWindow?.show());
  settingsWindow.on('closed', () => {
    settingsWindow = null;
  });

  settingsWindow.webContents.on('before-input-event', (_event, input) => {
    if (input.type === 'keyDown' && input.key === 'Escape') {
      settingsWindow?.close();
    }
  });

  settingsWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  loadSettingsRenderer(settingsWindow);
}

function loadSettingsRenderer(window: BrowserWindow): void {
  const devServerUrl = process.env['ELECTRON_RENDERER_URL'];
  if (devServerUrl) {
    window.loadURL(`${devServerUrl}#settings`);
  } else {
    window.loadFile(resolve(import.meta.dirname, '../renderer/index.html'), { hash: 'settings' });
  }
}
