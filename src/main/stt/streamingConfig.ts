import { protos } from '@google-cloud/speech';
import { DEFAULT_SETTINGS, type ModelSettings } from '../../shared/settings.js';

const { AudioEncoding } = protos.google.cloud.speech.v1.RecognitionConfig;

export const SAMPLE_RATE = 16000;

// v2 is a UI/persistence mock; the transport is always v1, so a v2 model
// selection falls back to this v1 model until the real v2 transport lands.
const V1_FALLBACK_MODEL = 'latest_long';

// Builds the streaming config from the user's model settings. Keeping it next to
// the constants it applies lets a future model / v2 with a different shape change
// only this single source, never the reconnect logic.
export function buildStreamingConfig(
  model: ModelSettings,
): protos.google.cloud.speech.v1.IStreamingRecognitionConfig {
  return {
    config: {
      encoding: AudioEncoding.LINEAR16,
      sampleRateHertz: SAMPLE_RATE,
      languageCode: model.languageCode,
      enableAutomaticPunctuation: model.enableAutomaticPunctuation,
      enableWordConfidence: true,
      model: model.apiVersion === 'v1' ? model.model : V1_FALLBACK_MODEL,
    },
    interimResults: true,
  };
}

// Default config used by scripts/stt-smoke.ts so the smoke test keeps validating
// the exact shape the app ships with out of the box.
export const streamingConfig = buildStreamingConfig(DEFAULT_SETTINGS.model);

// v1 streamingRecognize enforces a hard ~305s per-stream limit; the endpoint
// terminates the stream past it, dropping any in-flight utterance. The
// orchestrator rotates the stream before that. Derived here (next to the config
// it applies to) so a future model / v2 with a different limit changes only this
// single source, never the reconnect logic.
export const streamLimits = {
  // Soft limit: start cutting at the next silence boundary so rotation lands
  // between utterances instead of mid-word.
  softLimitMs: 240_000,
  // Hard limit: force a cut even mid-speech; must stay below the endpoint limit.
  hardLimitMs: 290_000,
};
