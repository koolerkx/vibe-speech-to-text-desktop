import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';
import {
  IpcChannel,
  type RendererApi,
  type SttResult,
  type SttStatus,
  type UsageSummary,
} from '../shared/ipc-types.js';
import type { AppSettings } from '../shared/settings.js';

const api: RendererApi = {
  hideWindow: () => ipcRenderer.send(IpcChannel.WindowHide),
  setCollapsed: (collapsed) => ipcRenderer.send(IpcChannel.WindowSetCollapsed, collapsed),
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
  onAudioLevel: (listener) => {
    const handler = (_event: IpcRendererEvent, rms: number) => listener(rms);
    ipcRenderer.on(IpcChannel.AudioLevel, handler);
    return () => ipcRenderer.removeListener(IpcChannel.AudioLevel, handler);
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
  showTranscriptMenu: (payload) => ipcRenderer.invoke(IpcChannel.ShowTranscriptMenu, payload),
  getUsage: () => ipcRenderer.invoke(IpcChannel.UsageGet),
  onUsageChanged: (listener) => {
    const handler = (_event: IpcRendererEvent, usage: UsageSummary) => listener(usage);
    ipcRenderer.on(IpcChannel.UsageChanged, handler);
    return () => ipcRenderer.removeListener(IpcChannel.UsageChanged, handler);
  },
};

contextBridge.exposeInMainWorld('api', api);
