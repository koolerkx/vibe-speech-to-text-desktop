import { useEffect, useState, type ReactNode } from 'react';
import {
  API_VERSION_OPTIONS,
  type ApiVersion,
  type AppSettings,
  BACKGROUND_OPACITY_MAX,
  BACKGROUND_OPACITY_MIN,
  BACKGROUND_OPACITY_STEP,
  LANGUAGE_OPTIONS,
  modelsForApiVersion,
} from '../../shared/settings';
import { Select } from './components/Select';

export function SettingsPage(): ReactNode {
  const [settings, setSettings] = useState<AppSettings | null>(null);

  useEffect(() => {
    void window.api.getSettings().then(setSettings);
    return window.api.onSettingsChanged(setSettings);
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
