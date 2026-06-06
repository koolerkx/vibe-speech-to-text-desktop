import type { AppSettings, SettingsPatch } from './settings.js';

export const IpcChannel = {
  WindowHide: 'window:hide',
  WindowSetCollapsed: 'window:set-collapsed',
  AppQuit: 'app:quit',
  AudioChunk: 'audio:chunk',
  AudioCaptureState: 'audio:capture-state',
  AudioLevel: 'audio:level',
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

export interface WordConfidence {
  word: string;
  confidence: number;
}

export interface SttResult {
  transcript: string;
  isFinal: boolean;
  // Per-word confidence, populated only on a final result (interim results carry
  // no confidence). Absent when the model returns no word-level data.
  words?: WordConfidence[];
}

// 'dormant': capture is on but the cloud stream is intentionally closed during
// silence (VAD gate) to stop billing; it reopens automatically on speech.
export type SttStatus = 'idle' | 'live' | 'reconnecting' | 'error' | 'dormant';

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
  // RMS amplitude (LINEAR16, 0–32767 scale) of each ~100ms chunk, for the
  // main-page volume meter; emitted only while capturing.
  onAudioLevel: (listener: (rms: number) => void) => () => void;
  getSettings: () => Promise<AppSettings>;
  updateSettings: (patch: SettingsPatch) => Promise<AppSettings>;
  resetSettings: () => Promise<AppSettings>;
  onSettingsChanged: (listener: (settings: AppSettings) => void) => () => void;
  openSettings: () => void;
  showTranscriptMenu: (payload: TranscriptMenuPayload) => Promise<TranscriptMenuAction | null>;
  getUsage: () => Promise<UsageSummary>;
  onUsageChanged: (listener: (usage: UsageSummary) => void) => () => void;
}
