import { app, BrowserWindow, ipcMain } from 'electron';
import { IpcChannel } from '../shared/ipc-types.js';

export function registerIpcHandlers(window: BrowserWindow): void {
  ipcMain.on(IpcChannel.WindowHide, () => window.hide());
  ipcMain.on(IpcChannel.AppQuit, () => app.quit());
}
