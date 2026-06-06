import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';
import {
  IpcChannel,
  type RendererApi,
  type SttResult,
  type SttStatus,
} from '../shared/ipc-types.js';

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
};

contextBridge.exposeInMainWorld('api', api);
