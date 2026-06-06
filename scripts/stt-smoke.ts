import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import speech, { protos } from '@google-cloud/speech';
import { SAMPLE_RATE, streamingConfig } from '../src/main/stt/streamingConfig.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const keyFilename = resolve(__dirname, '..', 'key.json');

const SILENCE_SECONDS = 1;

type StreamingConfig =
  protos.google.cloud.speech.v1.IStreamingRecognitionConfig;

function makeSilencePcm(seconds: number): Buffer {
  return Buffer.alloc(SAMPLE_RATE * seconds * 2, 0);
}

interface ProbeResult {
  label: string;
  accepted: boolean;
  errorMessage: string | null;
}

function probe(
  label: string,
  config: StreamingConfig,
): Promise<ProbeResult> {
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

function report(r: ProbeResult): void {
  if (r.accepted) {
    console.log(`[OK]    ${r.label} — config accepted by streaming endpoint`);
  } else {
    console.log(`[ERROR] ${r.label} — ${r.errorMessage}`);
  }
}

async function main(): Promise<void> {
  console.log('keyFilename:', keyFilename);

  const primary = await probe('yue-Hant-HK + latest_long', streamingConfig);
  report(primary);

  if (!primary.accepted) {
    const fallback = await probe('yue-Hant-HK + default model', {
      ...streamingConfig,
      config: { ...streamingConfig.config, model: undefined },
    });
    report(fallback);
  }

  console.log('\nDone.');
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
