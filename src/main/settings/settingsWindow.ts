import { BrowserWindow } from 'electron';
import { attachExternalLinkHandler, loadRenderer, SHARED_WEB_PREFERENCES } from '../window.js';

const SETTINGS_WINDOW_WIDTH = 440;
const SETTINGS_WINDOW_HEIGHT = 580;

let settingsWindow: BrowserWindow | null = null;

export function openSettingsWindow(): void {
  if (settingsWindow !== null && !settingsWindow.isDestroyed()) {
    if (settingsWindow.isMinimized()) {
      settingsWindow.restore();
    }
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
    webPreferences: SHARED_WEB_PREFERENCES,
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

  attachExternalLinkHandler(settingsWindow);
  loadRenderer(settingsWindow, 'settings');
}
