import { useEffect, useState, type ReactNode } from 'react';
import type { UsageSummary } from '../../shared/ipc-types';
import {
  API_VERSION_OPTIONS,
  type ApiVersion,
  type AppSettings,
  BACKGROUND_OPACITY_MAX,
  BACKGROUND_OPACITY_MIN,
  BACKGROUND_OPACITY_STEP,
  LANGUAGE_OPTIONS,
  modelsForApiVersion,
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
} from '../../shared/settings';
import { Select } from './components/Select';

export function SettingsPage(): ReactNode {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [usage, setUsage] = useState<UsageSummary | null>(null);

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

  const onApiVersionChange = (apiVersion: ApiVersion): void => {
    const model = modelsForApiVersion(apiVersion)[0]?.id ?? settings.model.model;
    void apply(window.api.updateSettings({ model: { apiVersion, model } }));
  };

  const models = modelsForApiVersion(settings.model.apiVersion);

  return (
    <div className="h-screen w-screen overflow-y-auto bg-gray-900 text-gray-200">
      <div className="mx-auto flex max-w-md flex-col gap-6 px-5 py-6">
        <h1 className="text-base font-semibold">Settings</h1>

        <Section title="Model">
          <Field label="API version">
            <Select
              value={settings.model.apiVersion}
              onChange={(value) => onApiVersionChange(value as ApiVersion)}
              options={API_VERSION_OPTIONS.map((option) => ({
                id: option.id,
                label: option.label,
              }))}
            />
          </Field>

          <Field label="Model">
            <Select
              value={settings.model.model}
              onChange={(value) =>
                void apply(window.api.updateSettings({ model: { model: value } }))
              }
              options={models}
            />
          </Field>

          <Field label="Language">
            <Select
              value={settings.model.languageCode}
              onChange={(value) =>
                void apply(window.api.updateSettings({ model: { languageCode: value } }))
              }
              options={LANGUAGE_OPTIONS}
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
