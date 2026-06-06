import { contextBridge, ipcRenderer } from 'electron';
import { IpcChannel, type RendererApi } from '../shared/ipc-types.js';

const api: RendererApi = {
  hideWindow: () => ipcRenderer.send(IpcChannel.WindowHide),
  quitApp: () => ipcRenderer.send(IpcChannel.AppQuit),
};

contextBridge.exposeInMainWorld('api', api);
