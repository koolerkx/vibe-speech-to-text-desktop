import { app, BrowserWindow, ipcMain } from 'electron';
import { IpcChannel } from '../shared/ipc-types.js';
import { handleChunk, setCaptureState } from './audio/pcmSink.js';
import * as stt from './stt/reconnect.js';
import { inject, setActive } from './inject/textInject.js';
import { setFloatingWindowCollapsed } from './window.js';
import { endUsageSession, startUsageSession } from './usage/index.js';

export function registerIpcHandlers(window: BrowserWindow): void {
  ipcMain.on(IpcChannel.WindowHide, () => window.hide());
  ipcMain.on(IpcChannel.WindowSetCollapsed, (_event, collapsed: boolean) =>
    setFloatingWindowCollapsed(window, collapsed),
  );
  ipcMain.on(IpcChannel.AppQuit, () => app.quit());
  ipcMain.on(IpcChannel.AudioChunk, (_event, chunk: ArrayBuffer | Uint8Array) => {
    handleChunk(chunk);
    stt.write(chunk);
  });
  ipcMain.on(IpcChannel.AudioCaptureState, (_event, active: boolean) => {
    setCaptureState(active);
    if (active) {
      setActive(true);
      startUsageSession();
      stt.start(
        (result) => {
          if (!window.isDestroyed()) {
            window.webContents.send(IpcChannel.SttResult, result);
          }
          if (result.isFinal) {
            inject(result.transcript);
          }
        },
        (status) => {
          if (!window.isDestroyed()) {
            window.webContents.send(IpcChannel.SttStatus, status);
          }
        },
        (rms) => {
          if (!window.isDestroyed()) {
            window.webContents.send(IpcChannel.AudioLevel, rms);
          }
        },
      );
    } else {
      setActive(false);
      endUsageSession();
      stt.stop();
    }
  });
}
