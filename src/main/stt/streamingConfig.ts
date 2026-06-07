import { protos } from '@google-cloud/speech';
import {
  type BoostPhrase,
  DEFAULT_SETTINGS,
  type ModelSettings,
  supportsWordConfidence,
  wordBoostPhrases,
} from '../../shared/settings.js';

const { AudioEncoding: V1AudioEncoding } = protos.google.cloud.speech.v1.RecognitionConfig;
const { AudioEncoding: V2AudioEncoding } = protos.google.cloud.speech.v2.ExplicitDecodingConfig;

export const SAMPLE_RATE = 16000;

const MONO_CHANNEL_COUNT = 1;

// Builds the v1 streaming config from the user's model settings. Keeping it next
// to the constants it applies lets a model change touch only this single source,
// never the reconnect logic.
export function buildV1StreamingConfig(
  model: ModelSettings,
  phrases: BoostPhrase[],
): protos.google.cloud.speech.v1.IStreamingRecognitionConfig {
  return {
    config: {
      encoding: V1AudioEncoding.LINEAR16,
      sampleRateHertz: SAMPLE_RATE,
      languageCode: model.languageCode,
      enableAutomaticPunctuation: model.enableAutomaticPunctuation,
      enableWordConfidence: true,
      model: model.model,
      // Omitted when empty so a disabled / blank Word boost sends no adaptation.
      ...(phrases.length > 0 ? { adaptation: { phraseSets: [{ phrases }] } } : {}),
    },
    interimResults: true,
  };
}

// Builds the first request of a v2 streaming session, which carries the config;
// subsequent requests carry audio. v2 differs from v1: language is an array,
// feature flags live under `features`, interimResults lives under
// `streamingFeatures`, and raw PCM requires an explicit decoding config because
// the byte stream has no header.
export function buildV2ConfigRequest(
  model: ModelSettings,
  recognizerPath: string,
  phrases: BoostPhrase[],
): protos.google.cloud.speech.v2.IStreamingRecognizeRequest {
  return {
    recognizer: recognizerPath,
    streamingConfig: {
      config: {
        explicitDecodingConfig: {
          encoding: V2AudioEncoding.LINEAR16,
          sampleRateHertz: SAMPLE_RATE,
          audioChannelCount: MONO_CHANNEL_COUNT,
        },
        model: model.model,
        languageCodes: [model.languageCode],
        features: {
          enableAutomaticPunctuation: model.enableAutomaticPunctuation,
          // Omitted for models that reject it (e.g. chirp_3); v2 hard-errors on
          // unsupported feature flags rather than ignoring them.
          ...(supportsWordConfidence(model.model) ? { enableWordConfidence: true } : {}),
        },
        // Omitted when empty so a disabled / blank Word boost sends no adaptation.
        ...(phrases.length > 0
          ? { adaptation: { phraseSets: [{ inlinePhraseSet: { phrases } }] } }
          : {}),
      },
      streamingFeatures: {
        interimResults: true,
      },
    },
  };
}

// Default config used by scripts/stt-smoke.ts so the smoke test keeps validating
// the exact shape the app ships with out of the box.
export const streamingConfig = buildV1StreamingConfig(
  DEFAULT_SETTINGS.model,
  wordBoostPhrases(DEFAULT_SETTINGS.wordBoost),
);

// Both v1 and v2 streamingRecognize enforce a hard ~305s per-stream limit; the
// endpoint terminates the stream past it, dropping any in-flight utterance. The
// orchestrator rotates the stream before that. Derived here (next to the config
// it applies to) so a future model with a different limit changes only this
// single source, never the reconnect logic.
export const streamLimits = {
  // Soft limit: start cutting at the next silence boundary so rotation lands
  // between utterances instead of mid-word.
  softLimitMs: 240_000,
  // Hard limit: force a cut even mid-speech; must stay below the endpoint limit.
  hardLimitMs: 290_000,
};
