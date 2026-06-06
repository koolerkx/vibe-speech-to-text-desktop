import type { AppSettings, SettingsPatch } from './settings.js';

export const IpcChannel = {
  WindowHide: 'window:hide',
  AppQuit: 'app:quit',
  AudioChunk: 'audio:chunk',
  AudioCaptureState: 'audio:capture-state',
  SttResult: 'stt:result',
  SttStatus: 'stt:status',
  SettingsGet: 'settings:get',
  SettingsUpdate: 'settings:update',
  SettingsReset: 'settings:reset',
  SettingsChanged: 'settings:changed',
  SettingsOpen: 'settings:open',
} as const;

export type IpcChannel = (typeof IpcChannel)[keyof typeof IpcChannel];

export interface SttResult {
  transcript: string;
  isFinal: boolean;
}

export type SttStatus = 'idle' | 'live' | 'reconnecting' | 'error';

export interface RendererApi {
  hideWindow: () => void;
  quitApp: () => void;
  sendAudioChunk: (chunk: ArrayBuffer) => void;
  setCaptureState: (active: boolean) => void;
  onSttResult: (listener: (result: SttResult) => void) => () => void;
  onSttStatus: (listener: (status: SttStatus) => void) => () => void;
  getSettings: () => Promise<AppSettings>;
  updateSettings: (patch: SettingsPatch) => Promise<AppSettings>;
  resetSettings: () => Promise<AppSettings>;
  onSettingsChanged: (listener: (settings: AppSettings) => void) => () => void;
  openSettings: () => void;
}
