export type ApiVersion = 'v1' | 'v2';

export interface SelectOption {
  id: string;
  label: string;
  // When true the option renders but cannot be picked (used to show an invalid
  // combination, e.g. v2 while the language is Cantonese, rather than hiding it).
  disabled?: boolean;
}

// v2 binds a recognizer to a location. long runs on the global endpoint; chirp_3
// is a multi-region model served from the us / eu endpoints only.
export type Location = 'global' | 'us' | 'eu';

export const LOCATION_OPTIONS: SelectOption[] = [
  { id: 'global', label: 'global' },
  { id: 'us', label: 'us' },
  { id: 'eu', label: 'eu' },
];

// Locations each v2 model is served from (per the supported-languages docs).
const V2_MODEL_LOCATIONS: Record<string, Location[]> = {
  long: ['global'],
  chirp_3: ['us', 'eu'],
};

export function locationsForModel(model: string): Location[] {
  return V2_MODEL_LOCATIONS[model] ?? ['global'];
}

// v2 models that reject enableWordConfidence (chirp_3 returns placeholder, not
// real, confidence and errors if the flag is sent), so it must be omitted.
const MODELS_WITHOUT_WORD_CONFIDENCE = ['chirp_3'];

export function supportsWordConfidence(model: string): boolean {
  return !MODELS_WITHOUT_WORD_CONFIDENCE.includes(model);
}

// One recognition preset = a valid (apiVersion, model, language) combination
// surfaced as a single dropdown entry. Each language detects only one language at
// a time, so language is folded into the preset; location is derived from the
// model. Cantonese is v1-only; en-US / ja-JP also offer v2 long and chirp_3.
export interface ModelPreset extends SelectOption {
  apiVersion: ApiVersion;
  model: string;
  languageCode: string;
  location: Location;
}

// Single source of truth for the supported combinations. Mandarin / Simplified
// Chinese is intentionally out of scope.
const MODEL_PRESET_COMBOS: Array<Pick<ModelPreset, 'apiVersion' | 'model' | 'languageCode'>> = [
  { apiVersion: 'v1', model: 'latest_long', languageCode: 'yue-Hant-HK' },
  { apiVersion: 'v1', model: 'latest_long', languageCode: 'en-US' },
  { apiVersion: 'v2', model: 'long', languageCode: 'en-US' },
  { apiVersion: 'v2', model: 'chirp_3', languageCode: 'en-US' },
  { apiVersion: 'v1', model: 'latest_long', languageCode: 'ja-JP' },
  { apiVersion: 'v2', model: 'long', languageCode: 'ja-JP' },
  { apiVersion: 'v2', model: 'chirp_3', languageCode: 'ja-JP' },
];

// Stable preset id, derived from the combination's identity fields so the map
// below and presetIdForModel never drift on the format.
function presetId(parts: { apiVersion: ApiVersion; model: string; languageCode: string }): string {
  return `${parts.apiVersion}_${parts.model}_${parts.languageCode}`;
}

export const MODEL_PRESETS: ModelPreset[] = MODEL_PRESET_COMBOS.map((combo) => {
  const id = presetId(combo);
  return { ...combo, id, label: id, location: locationsForModel(combo.model)[0] };
});

export function presetIdForModel(model: ModelSettings): string {
  return presetId(model);
}

export function presetById(id: string): ModelPreset | undefined {
  return MODEL_PRESETS.find((preset) => preset.id === id);
}

// The model fields a preset sets; shared by the main page and Settings so both
// apply a preset selection identically.
export function modelPatchFromPreset(preset: ModelPreset): Partial<ModelSettings> {
  return {
    apiVersion: preset.apiVersion,
    model: preset.model,
    languageCode: preset.languageCode,
    location: preset.location,
  };
}

export interface ModelSettings {
  apiVersion: ApiVersion;
  model: string;
  // Only applies to v2; v1 always runs on the global endpoint and ignores this.
  location: Location;
  languageCode: string;
  enableAutomaticPunctuation: boolean;
}

// Snaps any stored model onto a valid preset (Settings offers only presets),
// keeping the language when a preset covers it and preserving the automatic
// punctuation choice. Applied centrally in the store so an upgraded settings.json
// — e.g. a now-removed language (zh-TW) or a v1 model no longer offered — never
// leaves the preset dropdown blank or the transport on an unsupported combo.
export function reconcileModel(model: ModelSettings): ModelSettings {
  const preset =
    presetById(presetIdForModel(model)) ??
    MODEL_PRESETS.find((option) => option.languageCode === model.languageCode) ??
    MODEL_PRESETS[0];
  return {
    ...model,
    apiVersion: preset.apiVersion,
    model: preset.model,
    languageCode: preset.languageCode,
    location: preset.location,
  };
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
    location: 'global',
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
