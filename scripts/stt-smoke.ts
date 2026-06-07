import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import speech, { protos, v2 } from '@google-cloud/speech';
import type { ModelSettings } from '../src/shared/settings.js';
import {
  buildV2ConfigRequest,
  SAMPLE_RATE,
  streamingConfig,
} from '../src/main/stt/streamingConfig.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const keyFilename = resolve(__dirname, '..', 'key.json');

const SILENCE_SECONDS = 1;
const V2_MAX_AUDIO_CHUNK_BYTES = 25600;

type V1StreamingConfig = protos.google.cloud.speech.v1.IStreamingRecognitionConfig;

function makeSilencePcm(seconds: number): Buffer {
  return Buffer.alloc(SAMPLE_RATE * seconds * 2, 0);
}

interface ProbeResult {
  label: string;
  accepted: boolean;
  errorMessage: string | null;
}

function probeV1(label: string, config: V1StreamingConfig): Promise<ProbeResult> {
  return new Promise((resolvePromise) => {
    const client = new speech.SpeechClient({ keyFilename });
    let accepted = true;
    let errorMessage: string | null = null;

    const stream = client
      .streamingRecognize(config)
      .on('error', (err: { code?: number; message?: string }) => {
        accepted = false;
        errorMessage = `${err.code ?? ''} ${err.message ?? err}`.trim();
        resolvePromise({ label, accepted, errorMessage });
      })
      .on('data', () => {});

    stream.write(makeSilencePcm(SILENCE_SECONDS));
    stream.end();

    stream.on('end', () => {
      resolvePromise({ label, accepted, errorMessage });
    });
  });
}

function probeV2(label: string, model: ModelSettings): Promise<ProbeResult> {
  return new Promise((resolvePromise) => {
    const apiEndpoint =
      model.location === 'global' ? undefined : `${model.location}-speech.googleapis.com`;
    const client = new v2.SpeechClient({ keyFilename, apiEndpoint });
    const projectId = (JSON.parse(readFileSync(keyFilename, 'utf-8')) as { project_id?: string })
      .project_id ?? '';
    const recognizerPath = client.recognizerPath(projectId, model.location, '_');
    let accepted = true;
    let errorMessage: string | null = null;

    // v2 caps a single streaming audio chunk at 25600 bytes (0.8s @ 16kHz/16-bit),
    // so the 1s silence is split into endpoint-sized chunks.
    const stream = client
      ._streamingRecognize()
      .on('error', (err: { code?: number; message?: string }) => {
        accepted = false;
        errorMessage = `${err.code ?? ''} ${err.message ?? err}`.trim();
        resolvePromise({ label, accepted, errorMessage });
      })
      .on('data', () => {});

    stream.write(buildV2ConfigRequest(model, recognizerPath, []));
    const silence = makeSilencePcm(SILENCE_SECONDS);
    for (let offset = 0; offset < silence.length; offset += V2_MAX_AUDIO_CHUNK_BYTES) {
      stream.write({ audio: silence.subarray(offset, offset + V2_MAX_AUDIO_CHUNK_BYTES) });
    }
    stream.end();

    stream.on('end', () => {
      resolvePromise({ label, accepted, errorMessage });
    });
  });
}

function report(r: ProbeResult): void {
  if (r.accepted) {
    console.log(`[OK]    ${r.label} — config accepted by streaming endpoint`);
  } else {
    console.log(`[ERROR] ${r.label} — ${r.errorMessage}`);
  }
}

async function main(): Promise<void> {
  console.log('keyFilename:', keyFilename);

  const v1Primary = await probeV1('v1: yue-Hant-HK + latest_long', streamingConfig);
  report(v1Primary);

  if (!v1Primary.accepted) {
    const fallback = await probeV1('v1: yue-Hant-HK + default model', {
      ...streamingConfig,
      config: { ...streamingConfig.config, model: undefined },
    });
    report(fallback);
  }

  // v2 covers en-US / ja-JP only (Cantonese stays on v1). long runs on global;
  // chirp_3 is multi-region (us/eu).
  const v2Long: ModelSettings = {
    apiVersion: 'v2',
    model: 'long',
    location: 'global',
    languageCode: 'en-US',
    enableAutomaticPunctuation: true,
  };
  report(await probeV2('v2: en-US + long + global', v2Long));

  const v2Chirp3: ModelSettings = {
    apiVersion: 'v2',
    model: 'chirp_3',
    location: 'us',
    languageCode: 'ja-JP',
    enableAutomaticPunctuation: true,
  };
  report(await probeV2('v2: ja-JP + chirp_3 + us', v2Chirp3));

  console.log('\nDone.');
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
