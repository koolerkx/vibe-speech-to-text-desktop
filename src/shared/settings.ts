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
];

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

export interface AppearanceSettings {
  backgroundOpacity: number;
}

export interface AppSettings {
  model: ModelSettings;
  appearance: AppearanceSettings;
}

export interface SettingsPatch {
  model?: Partial<ModelSettings>;
  appearance?: Partial<AppearanceSettings>;
}

export const BACKGROUND_OPACITY_MIN = 0.3;
export const BACKGROUND_OPACITY_MAX = 1;
export const BACKGROUND_OPACITY_STEP = 0.01;

export const DEFAULT_SETTINGS: AppSettings = {
  model: {
    apiVersion: 'v1',
    model: 'latest_long',
    languageCode: 'yue-Hant-HK',
    enableAutomaticPunctuation: true,
  },
  appearance: {
    backgroundOpacity: 0.92,
  },
};

export function modelsForApiVersion(apiVersion: ApiVersion): SelectOption[] {
  return API_VERSION_OPTIONS.find((option) => option.id === apiVersion)?.models ?? [];
}
