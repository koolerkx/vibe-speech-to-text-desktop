import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';
import {
  IpcChannel,
  type RendererApi,
  type SttResult,
  type SttStatus,
} from '../shared/ipc-types.js';
import type { AppSettings } from '../shared/settings.js';

const api: RendererApi = {
  hideWindow: () => ipcRenderer.send(IpcChannel.WindowHide),
  quitApp: () => ipcRenderer.send(IpcChannel.AppQuit),
  sendAudioChunk: (chunk) => ipcRenderer.send(IpcChannel.AudioChunk, chunk),
  setCaptureState: (active) => ipcRenderer.send(IpcChannel.AudioCaptureState, active),
  onSttResult: (listener) => {
    const handler = (_event: IpcRendererEvent, result: SttResult) => listener(result);
    ipcRenderer.on(IpcChannel.SttResult, handler);
    return () => ipcRenderer.removeListener(IpcChannel.SttResult, handler);
  },
  onSttStatus: (listener) => {
    const handler = (_event: IpcRendererEvent, status: SttStatus) => listener(status);
    ipcRenderer.on(IpcChannel.SttStatus, handler);
    return () => ipcRenderer.removeListener(IpcChannel.SttStatus, handler);
  },
  getSettings: () => ipcRenderer.invoke(IpcChannel.SettingsGet),
  updateSettings: (patch) => ipcRenderer.invoke(IpcChannel.SettingsUpdate, patch),
  resetSettings: () => ipcRenderer.invoke(IpcChannel.SettingsReset),
  onSettingsChanged: (listener) => {
    const handler = (_event: IpcRendererEvent, settings: AppSettings) => listener(settings);
    ipcRenderer.on(IpcChannel.SettingsChanged, handler);
    return () => ipcRenderer.removeListener(IpcChannel.SettingsChanged, handler);
  },
  openSettings: () => ipcRenderer.send(IpcChannel.SettingsOpen),
};

contextBridge.exposeInMainWorld('api', api);
