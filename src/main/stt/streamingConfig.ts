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
    alternativeLanguageCodes: ['zh-TW', 'en-US'],
    enableAutomaticPunctuation: true,
    model: 'latest_long',
  },
  interimResults: true,
};
