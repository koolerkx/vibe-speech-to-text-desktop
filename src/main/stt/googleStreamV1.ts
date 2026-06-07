import { protos, SpeechClient } from '@google-cloud/speech';
import { wordBoostPhrases } from '../../shared/settings.js';
import { toBuffer } from '../audio/pcm.js';
import { loadCredentials } from '../credentials/store.js';
import { getSettings } from '../settings/store.js';
import { buildV1StreamingConfig } from './streamingConfig.js';
import { forwardTranscript, type SttTransport, type StreamHandlers } from './transport.js';

const LOG_LABEL = '[googleStreamV1]';

type StreamingResponse = protos.google.cloud.speech.v1.IStreamingRecognizeResponse;
type RecognizeStream = ReturnType<SpeechClient['streamingRecognize']>;

let client: SpeechClient | null = null;
let stream: RecognizeStream | null = null;

function getClient(): SpeechClient {
  if (client !== null) {
    return client;
  }
  const credentials = loadCredentials();
  if (credentials === null) {
    throw new Error('Google credentials are not configured. Add them in Settings > Auth.');
  }
  client = new SpeechClient({
    projectId: credentials.projectId,
    credentials: { client_email: credentials.clientEmail, private_key: credentials.privateKey },
  });
  return client;
}

// Drops the cached client so the next start() rebuilds it with the latest stored
// credentials (called when the user updates them in Settings).
export function resetClient(): void {
  client = null;
}

function start(handlers: StreamHandlers): void {
  if (stream !== null) {
    return;
  }
  try {
    const activeClient = getClient();
    const settings = getSettings();
    const opened = activeClient.streamingRecognize(
      buildV1StreamingConfig(settings.model, wordBoostPhrases(settings.wordBoost)),
    );
    stream = opened;
    opened
      .on('data', (response: StreamingResponse) => forwardTranscript(response, handlers.onResult, LOG_LABEL))
      .on('error', (error: { code?: number; message?: string }) => {
        console.error(`${LOG_LABEL} stream error: ${error.code ?? ''} ${error.message ?? error}`.trim());
        if (stream === opened) {
          stream = null;
          handlers.onClose('error');
        }
      })
      .on('end', () => {
        if (stream === opened) {
          stream = null;
          handlers.onClose('end');
        }
      });
  } catch (error) {
    console.error(`${LOG_LABEL} failed to start stream:`, error);
    stream = null;
    handlers.onClose('error');
  }
}

function isActive(): boolean {
  return stream !== null;
}

function write(chunk: ArrayBuffer | Uint8Array): void {
  if (stream === null) {
    return;
  }
  const buffer = toBuffer(chunk);
  // A chunk can arrive between an async 'error'/'end' emit and its handler
  // nulling `stream` (or after the ~5min stream limit); writing then throws
  // 'write after end', which would crash the main process if unguarded. Do not
  // null `stream` here — the authoritative 'error'/'end' handler owns nulling and
  // onClose; nulling here would race it and suppress the reconnect.
  try {
    stream.write(buffer);
  } catch (error) {
    console.error(`${LOG_LABEL} write failed:`, error);
  }
}

function stop(): void {
  if (stream === null) {
    return;
  }
  // Detach from `stream` but keep the 'data' listener attached: the endpoint
  // flushes the final for an in-progress utterance only after end(), so dropping
  // 'data' here would leave that utterance stuck as interim and never injected.
  // The retained 'end'/'error' handlers see `stream !== closing` and stay silent,
  // so this teardown still does not trigger a reconnect.
  const closing = stream;
  stream = null;
  closing.end();
}

export const googleStreamV1: SttTransport = { start, isActive, write, stop };
