import { useEffect, useState, type ReactNode } from 'react';
import {
  type CredentialsStatus,
  type GoogleCredentials,
  parseServiceAccountJson,
  validateCredentials,
} from '../../shared/credentials';
import type { UsageSummary } from '../../shared/ipc-types';
import {
  type AppSettings,
  BACKGROUND_OPACITY_MAX,
  BACKGROUND_OPACITY_MIN,
  BACKGROUND_OPACITY_STEP,
  MODEL_PRESETS,
  modelPatchFromPreset,
  presetById,
  presetIdForModel,
  VAD_CLOSE_HOLD_MS_MAX,
  VAD_CLOSE_HOLD_MS_MIN,
  VAD_CLOSE_HOLD_MS_STEP,
  VAD_PREROLL_MS_MAX,
  VAD_PREROLL_MS_MIN,
  VAD_PREROLL_MS_STEP,
  VAD_REOPEN_CHUNKS_MAX,
  VAD_REOPEN_CHUNKS_MIN,
  VAD_REOPEN_CHUNKS_STEP,
  VAD_THRESHOLD_MAX,
  VAD_THRESHOLD_MIN,
  VAD_THRESHOLD_STEP,
  type VolumeMeterUnit,
  VOLUME_METER_UNIT_OPTIONS,
  WORD_BOOST_LEVELS,
} from '../../shared/settings';
import { Select } from './components/Select';

type SettingsTab = 'general' | 'wordBoost' | 'auth';

export function SettingsPage(): ReactNode {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [usage, setUsage] = useState<UsageSummary | null>(null);
  const [tab, setTab] = useState<SettingsTab>('general');

  useEffect(() => {
    void window.api.getSettings().then(setSettings);
    return window.api.onSettingsChanged(setSettings);
  }, []);

  useEffect(() => {
    void window.api.getUsage().then(setUsage);
    return window.api.onUsageChanged(setUsage);
  }, []);

  if (!settings) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-gray-900 text-sm text-gray-400">
        Loading…
      </div>
    );
  }

  const apply = async (next: Promise<AppSettings>): Promise<void> => {
    setSettings(await next);
  };

  // A preset bundles apiVersion + model + language + location into one choice;
  // the fields are still stored separately in ModelSettings.
  const onPresetChange = (id: string): void => {
    const preset = presetById(id);
    if (!preset) {
      return;
    }
    void apply(window.api.updateSettings({ model: modelPatchFromPreset(preset) }));
  };

  return (
    <div className="h-screen w-screen overflow-y-auto bg-gray-900 text-gray-200">
      <div className="mx-auto flex max-w-md flex-col gap-6 px-5 py-6">
        <h1 className="text-base font-semibold">Settings</h1>

        <div className="flex gap-1 border-b border-white/10">
          <TabButton label="General" active={tab === 'general'} onClick={() => setTab('general')} />
          <TabButton
            label="Word boost"
            active={tab === 'wordBoost'}
            onClick={() => setTab('wordBoost')}
          />
          <TabButton label="Auth" active={tab === 'auth'} onClick={() => setTab('auth')} />
        </div>

        {tab === 'general' && (
          <>
        <Section title="Model">
          <Field label="Recognition (version_model_language)">
            <Select
              value={presetIdForModel(settings.model)}
              onChange={onPresetChange}
              options={MODEL_PRESETS}
            />
          </Field>

          <label className="flex items-center justify-between gap-3 text-sm">
            <span className="text-gray-300">Automatic punctuation</span>
            <input
              type="checkbox"
              className="h-4 w-4 accent-blue-500"
              checked={settings.model.enableAutomaticPunctuation}
              onChange={(event) =>
                void apply(
                  window.api.updateSettings({
                    model: { enableAutomaticPunctuation: event.target.checked },
                  }),
                )
              }
            />
          </label>
        </Section>

        <Section title="Appearance">
          <Field label={`Background opacity (${Math.round(settings.appearance.backgroundOpacity * 100)}%)`}>
            <input
              type="range"
              className="w-full accent-blue-500"
              min={BACKGROUND_OPACITY_MIN}
              max={BACKGROUND_OPACITY_MAX}
              step={BACKGROUND_OPACITY_STEP}
              value={settings.appearance.backgroundOpacity}
              onChange={(event) =>
                void apply(
                  window.api.updateSettings({
                    appearance: { backgroundOpacity: Number(event.target.value) },
                  }),
                )
              }
            />
          </Field>

          <Field label="Volume meter unit">
            <Select
              value={settings.appearance.volumeMeterUnit}
              onChange={(value) =>
                void apply(
                  window.api.updateSettings({
                    appearance: { volumeMeterUnit: value as VolumeMeterUnit },
                  }),
                )
              }
              options={VOLUME_METER_UNIT_OPTIONS}
            />
          </Field>
        </Section>

        <Section title="Voice activity detection (VAD)">
          <label className="flex items-center justify-between gap-3 text-sm">
            <span className="text-gray-300">Close stream on silence</span>
            <input
              type="checkbox"
              className="h-4 w-4 accent-blue-500"
              checked={settings.vad.enabled}
              onChange={(event) =>
                void apply(window.api.updateSettings({ vad: { enabled: event.target.checked } }))
              }
            />
          </label>

          <SliderField
            label="Silence threshold (RMS)"
            value={settings.vad.silenceThreshold}
            min={VAD_THRESHOLD_MIN}
            max={VAD_THRESHOLD_MAX}
            step={VAD_THRESHOLD_STEP}
            onChange={(value) =>
              void apply(window.api.updateSettings({ vad: { silenceThreshold: value } }))
            }
          />

          <SliderField
            label="Silence hold before closing (ms)"
            value={settings.vad.closeHoldMs}
            min={VAD_CLOSE_HOLD_MS_MIN}
            max={VAD_CLOSE_HOLD_MS_MAX}
            step={VAD_CLOSE_HOLD_MS_STEP}
            onChange={(value) =>
              void apply(window.api.updateSettings({ vad: { closeHoldMs: value } }))
            }
          />

          <SliderField
            label="Voiced chunks to reopen"
            value={settings.vad.reopenVoicedChunks}
            min={VAD_REOPEN_CHUNKS_MIN}
            max={VAD_REOPEN_CHUNKS_MAX}
            step={VAD_REOPEN_CHUNKS_STEP}
            onChange={(value) =>
              void apply(window.api.updateSettings({ vad: { reopenVoicedChunks: value } }))
            }
          />

          <SliderField
            label="Preroll replayed on reopen (ms)"
            value={settings.vad.prerollMs}
            min={VAD_PREROLL_MS_MIN}
            max={VAD_PREROLL_MS_MAX}
            step={VAD_PREROLL_MS_STEP}
            onChange={(value) =>
              void apply(window.api.updateSettings({ vad: { prerollMs: value } }))
            }
          />
        </Section>

        <Section title="Usage (minutes recorded)">
          <UsageRow label="Total" minutes={usage?.totalMinutes ?? 0} />
          <UsageRow label="This month" minutes={usage?.thisMonthMinutes ?? 0} />
          <UsageRow label="Last month" minutes={usage?.lastMonthMinutes ?? 0} />
        </Section>
          </>
        )}

        {tab === 'wordBoost' && <WordBoostTab settings={settings} apply={apply} />}

        {tab === 'auth' && <AuthTab />}

        <button
          type="button"
          className="self-start rounded-md bg-white/10 px-3 py-1.5 text-sm font-medium hover:bg-white/20"
          onClick={() => void apply(window.api.resetSettings())}
        >
          Reset to default
        </button>
      </div>
    </div>
  );
}

function TabButton({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}): ReactNode {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`-mb-px border-b-2 px-3 py-1.5 text-sm font-medium ${
        active
          ? 'border-blue-500 text-gray-100'
          : 'border-transparent text-gray-400 hover:text-gray-200'
      }`}
    >
      {label}
    </button>
  );
}

// Word boost groups engineering vocabulary by recognition boost strength. Each
// level's text field holds a comma-separated list; the backend splits and sends
// them as adaptation phrases so models bias toward these terms.
function WordBoostTab({
  settings,
  apply,
}: {
  settings: AppSettings;
  apply: (next: Promise<AppSettings>) => Promise<void>;
}): ReactNode {
  return (
    <Section title="Word boost">
      <p className="text-xs text-gray-500">
        Improve recognition of specific terms (e.g. exe, cd, 辨識, 測試). Separate words with
        commas. Higher boost biases more strongly toward the listed words.
      </p>

      <label className="flex items-center justify-between gap-3 text-sm">
        <span className="text-gray-300">Enable word boost</span>
        <input
          type="checkbox"
          className="h-4 w-4 accent-blue-500"
          checked={settings.wordBoost.enabled}
          onChange={(event) =>
            void apply(window.api.updateSettings({ wordBoost: { enabled: event.target.checked } }))
          }
        />
      </label>

      {WORD_BOOST_LEVELS.map((level) => (
        <Field key={level} label={`Boost ${level}`}>
          <input
            type="text"
            className="rounded-md border border-white/10 bg-gray-800 px-2 py-1.5 text-sm text-gray-100 outline-none focus:border-blue-500"
            value={settings.wordBoost.phrasesByBoost[`${level}`]}
            onChange={(event) =>
              void apply(
                window.api.updateSettings({
                  wordBoost: {
                    phrasesByBoost: {
                      ...settings.wordBoost.phrasesByBoost,
                      [`${level}`]: event.target.value,
                    },
                  },
                }),
              )
            }
          />
          <p className="text-xs text-gray-500">
            {level === 20
              ? 'Strongest bias; use for terms that are often misheard.'
              : level === 5
                ? 'Mild bias; a light nudge toward these words.'
                : 'Moderate bias.'}
          </p>
        </Field>
      ))}
    </Section>
  );
}

// Per-user Google service-account credentials. The private key is stored
// encrypted by the main process and never returned here; an already-configured
// key shows a placeholder and is kept when the field is left blank on save.
function AuthTab(): ReactNode {
  const emptyForm: GoogleCredentials = { projectId: '', clientEmail: '', privateKey: '' };
  const [status, setStatus] = useState<CredentialsStatus | null>(null);
  const [form, setForm] = useState<GoogleCredentials>(emptyForm);
  const [errors, setErrors] = useState<string[]>([]);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  const applyStatus = (next: CredentialsStatus): void => {
    setStatus(next);
    setForm({ projectId: next.projectId, clientEmail: next.clientEmail, privateKey: '' });
  };

  useEffect(() => {
    void window.api.getCredentials().then(applyStatus);
  }, []);

  const patch = (part: Partial<GoogleCredentials>): void => {
    setForm((prev) => ({ ...prev, ...part }));
    setSaved(false);
  };

  const onUploadKeyFile = async (file: File): Promise<void> => {
    setErrors([]);
    setSaved(false);
    try {
      const parsed = parseServiceAccountJson(await file.text());
      setForm(parsed);
    } catch {
      setErrors(['Could not parse the file. Select a valid service-account key.json.']);
    }
  };

  const onSave = async (): Promise<void> => {
    // Leaving the private key blank on an already-configured store keeps the
    // stored key, so the missing-key error is filtered out in that case.
    const keepingStoredKey = (status?.hasPrivateKey ?? false) && form.privateKey.trim().length === 0;
    const found = validateCredentials(form).filter(
      (message) => !(keepingStoredKey && message.toLowerCase().includes('private key')),
    );
    setErrors(found);
    if (found.length > 0) {
      return;
    }
    setBusy(true);
    try {
      applyStatus(await window.api.setCredentials(form));
      setSaved(true);
    } catch (error) {
      setErrors([error instanceof Error ? error.message : 'Failed to save credentials.']);
    } finally {
      setBusy(false);
    }
  };

  const onClear = async (): Promise<void> => {
    setBusy(true);
    setSaved(false);
    setErrors([]);
    try {
      applyStatus(await window.api.clearCredentials());
    } finally {
      setBusy(false);
    }
  };

  return (
    <Section title="Google credentials">
      <p className="text-xs text-gray-500">
        Speech-to-Text uses your own Google Cloud service account. Upload a key.json to fill the
        fields automatically, or enter them manually. Credentials are stored
        {status?.secure ? ' encrypted on this device' : ' on this device (encryption unavailable)'}.
      </p>

      <div className="flex items-center justify-between rounded-md bg-white/[0.04] px-3 py-2 text-sm">
        <span className="text-gray-300">Status</span>
        <span className={status?.configured ? 'text-green-400' : 'text-amber-400'}>
          {status?.configured ? 'Configured' : 'Not configured'}
        </span>
      </div>

      <label className="flex cursor-pointer flex-col gap-1.5 text-sm">
        <span className="text-gray-300">Upload key.json</span>
        <input
          type="file"
          accept=".json,application/json"
          className="text-xs text-gray-400 file:mr-3 file:rounded-md file:border-0 file:bg-white/10 file:px-3 file:py-1.5 file:text-sm file:text-gray-100 hover:file:bg-white/20"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) {
              void onUploadKeyFile(file);
            }
            event.target.value = '';
          }}
        />
      </label>

      <Field label="Project ID">
        <input
          type="text"
          className="rounded-md border border-white/10 bg-gray-800 px-2 py-1.5 text-sm text-gray-100 outline-none focus:border-blue-500"
          value={form.projectId}
          onChange={(event) => patch({ projectId: event.target.value })}
        />
      </Field>

      <Field label="Client email">
        <input
          type="text"
          className="rounded-md border border-white/10 bg-gray-800 px-2 py-1.5 text-sm text-gray-100 outline-none focus:border-blue-500"
          value={form.clientEmail}
          onChange={(event) => patch({ clientEmail: event.target.value })}
        />
      </Field>

      <Field label="Private key">
        <textarea
          rows={4}
          className="resize-y rounded-md border border-white/10 bg-gray-800 px-2 py-1.5 font-mono text-xs text-gray-100 outline-none focus:border-blue-500"
          placeholder={
            status?.hasPrivateKey
              ? 'Stored — leave blank to keep the current key'
              : '-----BEGIN PRIVATE KEY-----'
          }
          value={form.privateKey}
          onChange={(event) => patch({ privateKey: event.target.value })}
        />
      </Field>

      {errors.length > 0 && (
        <ul className="flex flex-col gap-1 rounded-md bg-red-500/10 px-3 py-2 text-xs text-red-300">
          {errors.map((message) => (
            <li key={message}>{message}</li>
          ))}
        </ul>
      )}

      {saved && <p className="text-xs text-green-400">Credentials saved.</p>}

      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={busy}
          className="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium hover:bg-blue-500 disabled:opacity-50"
          onClick={() => void onSave()}
        >
          Save
        </button>
        {status?.configured && (
          <button
            type="button"
            disabled={busy}
            className="rounded-md bg-white/10 px-3 py-1.5 text-sm font-medium hover:bg-white/20 disabled:opacity-50"
            onClick={() => void onClear()}
          >
            Remove
          </button>
        )}
      </div>
    </Section>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }): ReactNode {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-400">{title}</h2>
      <div className="flex flex-col gap-3 rounded-lg bg-white/[0.04] p-4">{children}</div>
    </section>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }): ReactNode {
  return (
    <label className="flex flex-col gap-1.5 text-sm">
      <span className="text-gray-300">{label}</span>
      {children}
    </label>
  );
}

// Slider paired with a number input over one value: drag to tune coarsely, or
// type for an exact figure. The number input is clamped so manual entry cannot
// push the value outside the slider's range.
function SliderField({
  label,
  value,
  min,
  max,
  step,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
}): ReactNode {
  const clamp = (next: number) => Math.max(min, Math.min(max, next));
  return (
    <Field label={label}>
      <div className="flex items-center gap-3">
        <input
          type="range"
          className="flex-1 accent-blue-500"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(event) => onChange(Number(event.target.value))}
        />
        <input
          type="number"
          className="w-20 rounded-md bg-white/10 px-2 py-1 text-right tabular-nums"
          min={min}
          max={max}
          step={step}
          value={value}
          // Clamp only the upper bound while typing so intermediate values below a
          // non-zero min (e.g. "5" on the way to "5000") are not snapped back to
          // min on every keystroke; enforce the full range on blur.
          onChange={(event) => onChange(Math.min(max, Number(event.target.value)))}
          onBlur={(event) => onChange(clamp(Number(event.target.value)))}
        />
      </div>
    </Field>
  );
}

function UsageRow({ label, minutes }: { label: string; minutes: number }): ReactNode {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-gray-300">{label}</span>
      <span className="tabular-nums text-gray-100">{minutes} min</span>
    </div>
  );
}
