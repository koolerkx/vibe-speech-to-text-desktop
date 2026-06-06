import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { app } from 'electron';
import { type AppSettings, DEFAULT_SETTINGS, type SettingsPatch } from '../../shared/settings.js';

const SETTINGS_FILENAME = 'settings.json';

let cached: AppSettings | null = null;

function settingsPath(): string {
  return resolve(app.getPath('userData'), SETTINGS_FILENAME);
}

// Merge persisted values over defaults so a file written by an older version
// (missing newly added keys) still yields a complete, valid settings object.
function mergeWithDefaults(partial: Partial<AppSettings> | null): AppSettings {
  return {
    model: { ...DEFAULT_SETTINGS.model, ...partial?.model },
    appearance: { ...DEFAULT_SETTINGS.appearance, ...partial?.appearance },
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

function persist(): void {
  try {
    writeFileSync(settingsPath(), JSON.stringify(cached, null, 2), 'utf-8');
  } catch (error) {
    console.error('[settings] failed to persist:', error);
  }
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
    model: { ...current.model, ...patch.model },
    appearance: { ...current.appearance, ...patch.appearance },
  };
  persist();
  return cached;
}

export function resetSettings(): AppSettings {
  cached = structuredClone(DEFAULT_SETTINGS);
  persist();
  return cached;
}
