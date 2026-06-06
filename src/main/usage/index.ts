import { BrowserWindow, ipcMain } from 'electron';
import { IpcChannel } from '../../shared/ipc-types.js';
import { addUsageSeconds, getUsageSummary } from './store.js';

let sessionStartMs: number | null = null;

export function startUsageSession(): void {
  sessionStartMs = Date.now();
}

export function endUsageSession(): void {
  if (sessionStartMs === null) {
    return;
  }
  const seconds = (Date.now() - sessionStartMs) / 1000;
  sessionStartMs = null;
  addUsageSeconds(seconds);
  broadcastUsage();
}

export function registerUsageHandlers(): void {
  ipcMain.handle(IpcChannel.UsageGet, () => getUsageSummary());
}

function broadcastUsage(): void {
  const summary = getUsageSummary();
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed()) {
      window.webContents.send(IpcChannel.UsageChanged, summary);
    }
  }
}
