import { app, BrowserWindow, ipcMain } from 'electron';
import { IpcChannel } from '../shared/ipc-types.js';
import { handleChunk, setCaptureState } from './audio/pcmSink.js';
import * as googleStream from './stt/googleStream.js';

export function registerIpcHandlers(window: BrowserWindow): void {
  ipcMain.on(IpcChannel.WindowHide, () => window.hide());
  ipcMain.on(IpcChannel.AppQuit, () => app.quit());
  ipcMain.on(IpcChannel.AudioChunk, (_event, chunk: ArrayBuffer | Uint8Array) => {
    handleChunk(chunk);
    googleStream.write(chunk);
  });
  ipcMain.on(IpcChannel.AudioCaptureState, (_event, active: boolean) => {
    setCaptureState(active);
    if (active) {
      googleStream.start((result) => {
        if (!window.isDestroyed()) {
          window.webContents.send(IpcChannel.SttResult, result);
        }
      });
    } else {
      googleStream.stop();
    }
  });
}
