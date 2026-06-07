import { readFileSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { app } from 'electron';
import {
  type AppSettings,
  DEFAULT_SETTINGS,
  reconcileModel,
  type SettingsPatch,
} from '../../shared/settings.js';

const SETTINGS_FILENAME = 'settings.json';
const PERSIST_DEBOUNCE_MS = 300;

let cached: AppSettings | null = null;
let persistTimer: ReturnType<typeof setTimeout> | null = null;

function settingsPath(): string {
  return resolve(app.getPath('userData'), SETTINGS_FILENAME);
}

// Merge persisted values over defaults so a file written by an older version
// (missing newly added keys) still yields a complete, valid settings object.
function mergeWithDefaults(partial: Partial<AppSettings> | null): AppSettings {
  return {
    model: reconcileModel({ ...DEFAULT_SETTINGS.model, ...partial?.model }),
    appearance: { ...DEFAULT_SETTINGS.appearance, ...partial?.appearance },
    vad: { ...DEFAULT_SETTINGS.vad, ...partial?.vad },
    wordBoost: {
      ...DEFAULT_SETTINGS.wordBoost,
      ...partial?.wordBoost,
      phrasesByBoost: {
        ...DEFAULT_SETTINGS.wordBoost.phrasesByBoost,
        ...partial?.wordBoost?.phrasesByBoost,
      },
    },
  };
}

function load(): AppSettings {
  try {
    const raw = readFileSync(settingsPath(), 'utf-8');
    return mergeWithDefaults(JSON.parse(raw) as Partial<AppSettings>);
  } catch {
    return structuredClone(DEFAULT_SETTINGS);
  }
}

// The renderer can fire updateSettings continuously (e.g. dragging the opacity
// slider). The in-memory cache is the source of truth for reads, so coalesce the
// disk write into a single trailing async write instead of blocking the main
// thread on writeFileSync per event.
function persist(): void {
  if (persistTimer !== null) {
    clearTimeout(persistTimer);
  }
  persistTimer = setTimeout(() => {
    persistTimer = null;
    const snapshot = cached;
    if (snapshot === null) {
      return;
    }
    void writeFile(settingsPath(), JSON.stringify(snapshot, null, 2), 'utf-8').catch((error) => {
      console.error('[settings] failed to persist:', error);
    });
  }, PERSIST_DEBOUNCE_MS);
}

export function getSettings(): AppSettings {
  if (cached === null) {
    cached = load();
  }
  return cached;
}

export function updateSettings(patch: SettingsPatch): AppSettings {
  const current = getSettings();
  cached = {
    model: reconcileModel({ ...current.model, ...patch.model }),
    appearance: { ...current.appearance, ...patch.appearance },
    vad: { ...current.vad, ...patch.vad },
    wordBoost: {
      ...current.wordBoost,
      ...patch.wordBoost,
      phrasesByBoost: {
        ...current.wordBoost.phrasesByBoost,
        ...patch.wordBoost?.phrasesByBoost,
      },
    },
  };
  persist();
  return cached;
}

export function resetSettings(): AppSettings {
  cached = structuredClone(DEFAULT_SETTINGS);
  persist();
  return cached;
}
