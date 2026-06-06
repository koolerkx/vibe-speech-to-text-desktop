import type { AppSettings, SettingsPatch } from './settings.js';

export const IpcChannel = {
  WindowHide: 'window:hide',
  WindowSetCollapsed: 'window:set-collapsed',
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
  ShowTranscriptMenu: 'transcript:show-menu',
  UsageGet: 'usage:get',
  UsageChanged: 'usage:changed',
} as const;

export type IpcChannel = (typeof IpcChannel)[keyof typeof IpcChannel];

export interface SttResult {
  transcript: string;
  isFinal: boolean;
}

export type SttStatus = 'idle' | 'live' | 'reconnecting' | 'error';

export interface UsageSummary {
  totalMinutes: number;
  thisMonthMinutes: number;
  lastMonthMinutes: number;
}

export type TranscriptMenuAction = 'copy-selected' | 'copy-all' | 'clear';

export interface TranscriptMenuPayload {
  selected: string;
  all: string;
}

export interface RendererApi {
  hideWindow: () => void;
  setCollapsed: (collapsed: boolean) => void;
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
  showTranscriptMenu: (payload: TranscriptMenuPayload) => Promise<TranscriptMenuAction | null>;
  getUsage: () => Promise<UsageSummary>;
  onUsageChanged: (listener: (usage: UsageSummary) => void) => () => void;
}
