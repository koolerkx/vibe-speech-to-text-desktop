import { protos } from '@google-cloud/speech';

const { AudioEncoding } = protos.google.cloud.speech.v1.RecognitionConfig;

export const SAMPLE_RATE = 16000;

// Single source of truth for the streaming config so scripts/stt-smoke.ts keeps
// validating the exact config the app ships; divergence would make the smoke
// test report OK for a config the real endpoint may reject.
export const streamingConfig: protos.google.cloud.speech.v1.IStreamingRecognitionConfig = {
  config: {
    encoding: AudioEncoding.LINEAR16,
    sampleRateHertz: SAMPLE_RATE,
    languageCode: 'yue-Hant-HK',
    enableAutomaticPunctuation: true,
    model: 'latest_long',
  },
  interimResults: true,
};

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
