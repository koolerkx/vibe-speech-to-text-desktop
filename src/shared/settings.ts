export type ApiVersion = 'v1' | 'v2';

export interface SelectOption {
  id: string;
  label: string;
}

export interface ApiVersionOption {
  id: ApiVersion;
  label: string;
  models: SelectOption[];
}

export const LANGUAGE_OPTIONS: SelectOption[] = [
  { id: 'yue-Hant-HK', label: '粵語 (yue-Hant-HK)' },
  { id: 'zh-TW', label: '國語 (zh-TW)' },
  { id: 'en-US', label: 'English (en-US)' },
  { id: 'ja-JP', label: '日本語 (ja-JP)' },
];

// Quick switcher subset surfaced on the main page; binds to the same
// model.languageCode as the full LANGUAGE_OPTIONS in Settings. Derived from
// LANGUAGE_OPTIONS (order follows the id list) so labels live in one place.
const MAIN_LANGUAGE_IDS = ['en-US', 'yue-Hant-HK', 'ja-JP'];
export const MAIN_LANGUAGE_OPTIONS: SelectOption[] = MAIN_LANGUAGE_IDS.flatMap((id) =>
  LANGUAGE_OPTIONS.filter((option) => option.id === id),
);

// v2 is a UI/persistence mock until the real v2 transport lands; its models are
// listed so the selection can be saved, but recognition still runs on v1.
export const API_VERSION_OPTIONS: ApiVersionOption[] = [
  {
    id: 'v1',
    label: 'Speech-to-Text v1',
    models: [
      { id: 'latest_long', label: 'latest_long' },
      { id: 'latest_short', label: 'latest_short' },
      { id: 'default', label: 'default' },
      { id: 'command_and_search', label: 'command_and_search' },
    ],
  },
  {
    id: 'v2',
    label: 'Speech-to-Text v2 (mock)',
    models: [
      { id: 'long', label: 'long' },
      { id: 'short', label: 'short' },
      { id: 'chirp', label: 'chirp' },
      { id: 'chirp_2', label: 'chirp_2' },
    ],
  },
];

export interface ModelSettings {
  apiVersion: ApiVersion;
  model: string;
  languageCode: string;
  enableAutomaticPunctuation: boolean;
}

// Main-page volume meter scale. 'linear' shows raw RMS amplitude; 'db' shows the
// same value mapped to decibels relative to full scale.
export type VolumeMeterUnit = 'linear' | 'db';

export interface AppearanceSettings {
  backgroundOpacity: number;
  volumeMeterUnit: VolumeMeterUnit;
}

export interface VadSettings {
  // When enabled, the cloud stream is closed after sustained silence and reopened
  // on speech, so idle time is not billed.
  enabled: boolean;
  // RMS of a LINEAR16 chunk (0–32767 scale) below this counts as silence.
  silenceThreshold: number;
  // Continuous silence required before the live stream is closed to stop billing.
  closeHoldMs: number;
  // Consecutive voiced chunks required to reopen from dormant; debounces a single
  // noise spike from reviving (and re-billing) the stream.
  reopenVoicedChunks: number;
  // Recent audio retained while dormant and replayed on reopen so the speech
  // onset is not clipped during the stream open latency.
  prerollMs: number;
}

export interface AppSettings {
  model: ModelSettings;
  appearance: AppearanceSettings;
  vad: VadSettings;
}

export interface SettingsPatch {
  model?: Partial<ModelSettings>;
  appearance?: Partial<AppearanceSettings>;
  vad?: Partial<VadSettings>;
}

export const BACKGROUND_OPACITY_MIN = 0.3;
export const BACKGROUND_OPACITY_MAX = 1;
export const BACKGROUND_OPACITY_STEP = 0.01;

export const VOLUME_METER_UNIT_OPTIONS: SelectOption[] = [
  { id: 'linear', label: 'Linear (RMS)' },
  { id: 'db', label: 'Decibel (dB)' },
];

export const VAD_THRESHOLD_MIN = 0;
export const VAD_THRESHOLD_MAX = 4000;
export const VAD_THRESHOLD_STEP = 10;

export const VAD_CLOSE_HOLD_MS_MIN = 500;
export const VAD_CLOSE_HOLD_MS_MAX = 10_000;
export const VAD_CLOSE_HOLD_MS_STEP = 100;

export const VAD_REOPEN_CHUNKS_MIN = 1;
export const VAD_REOPEN_CHUNKS_MAX = 10;
export const VAD_REOPEN_CHUNKS_STEP = 1;

export const VAD_PREROLL_MS_MIN = 0;
export const VAD_PREROLL_MS_MAX = 2000;
export const VAD_PREROLL_MS_STEP = 100;

export const DEFAULT_SETTINGS: AppSettings = {
  model: {
    apiVersion: 'v1',
    model: 'latest_long',
    languageCode: 'yue-Hant-HK',
    enableAutomaticPunctuation: true,
  },
  appearance: {
    backgroundOpacity: 0.92,
    volumeMeterUnit: 'linear',
  },
  vad: {
    enabled: true,
    silenceThreshold: 500,
    closeHoldMs: 3000,
    reopenVoicedChunks: 2,
    prerollMs: 400,
  },
};

export function modelsForApiVersion(apiVersion: ApiVersion): SelectOption[] {
  return API_VERSION_OPTIONS.find((option) => option.id === apiVersion)?.models ?? [];
}
