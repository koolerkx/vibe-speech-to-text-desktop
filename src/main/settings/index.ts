import { BrowserWindow, ipcMain } from 'electron';
import { IpcChannel } from '../../shared/ipc-types.js';
import type { AppSettings, SettingsPatch } from '../../shared/settings.js';
import { getSettings, resetSettings, updateSettings } from './store.js';
import { openSettingsWindow } from './settingsWindow.js';

export function registerSettingsHandlers(): void {
  ipcMain.handle(IpcChannel.SettingsGet, () => getSettings());
  ipcMain.handle(IpcChannel.SettingsUpdate, (_event, patch: SettingsPatch) => {
    const next = updateSettings(patch);
    broadcastChanged(next);
    return next;
  });
  ipcMain.handle(IpcChannel.SettingsReset, () => {
    const next = resetSettings();
    broadcastChanged(next);
    return next;
  });
  ipcMain.on(IpcChannel.SettingsOpen, () => openSettingsWindow());
}

function broadcastChanged(settings: AppSettings): void {
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed()) {
      window.webContents.send(IpcChannel.SettingsChanged, settings);
    }
  }
}
