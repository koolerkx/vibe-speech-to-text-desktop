import { protos, v2 } from '@google-cloud/speech';
import { type Location, wordBoostPhrases } from '../../shared/settings.js';
import { toBuffer } from '../audio/pcm.js';
import { loadCredentials } from '../credentials/store.js';
import { getSettings } from '../settings/store.js';
import { buildV2ConfigRequest } from './streamingConfig.js';
import { forwardTranscript, type SttTransport, type StreamHandlers } from './transport.js';

const INLINE_RECOGNIZER = '_';
const LOG_LABEL = '[googleStreamV2]';

type StreamingResponse = protos.google.cloud.speech.v2.IStreamingRecognizeResponse;
// _streamingRecognize is the routed public entry (it runs initialize() + the
// inner api call); the bare streamingRecognize skips that setup, so the backend
// never sees a valid resource project and rejects with RESOURCE_PROJECT_INVALID.
type RecognizeStream = ReturnType<v2.SpeechClient['_streamingRecognize']>;

let client: v2.SpeechClient | null = null;
let clientLocation: Location | null = null;
let stream: RecognizeStream | null = null;
let projectId: string | null = null;

function requireCredentials(): { projectId: string; clientEmail: string; privateKey: string } {
  const credentials = loadCredentials();
  if (credentials === null) {
    throw new Error('Google credentials are not configured. Add them in Settings > Auth.');
  }
  return credentials;
}

// The service-account project id, needed to build the recognizer path. Resolves
// synchronously from the stored credentials, keeping start() synchronous (the
// synchronous open/isActive flow reconnect.ts expects).
function getProjectId(): string {
  if (projectId === null) {
    projectId = requireCredentials().projectId;
  }
  return projectId;
}

// global uses the default endpoint; multi-region locations (us/eu, required by
// chirp_3) must target their own endpoint or the request is rejected.
function getClient(location: Location): v2.SpeechClient {
  if (client !== null && clientLocation === location) {
    return client;
  }
  const credentials = requireCredentials();
  const apiEndpoint = location === 'global' ? undefined : `${location}-speech.googleapis.com`;
  client = new v2.SpeechClient({
    projectId: credentials.projectId,
    credentials: { client_email: credentials.clientEmail, private_key: credentials.privateKey },
    apiEndpoint,
  });
  clientLocation = location;
  return client;
}

// Drops the cached client and resolved project id so the next start() rebuilds
// them with the latest stored credentials (called when the user updates them).
export function resetClient(): void {
  client = null;
  clientLocation = null;
  projectId = null;
}

function start(handlers: StreamHandlers): void {
  if (stream !== null) {
    return;
  }
  try {
    const { model, wordBoost } = getSettings();
    const activeClient = getClient(model.location);
    const recognizerPath = activeClient.recognizerPath(
      getProjectId(),
      model.location,
      INLINE_RECOGNIZER,
    );
    const opened = activeClient._streamingRecognize();
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
    // v2 carries the config in the first request, then audio in every following
    // request; the v1 builder shape is inverted here.
    opened.write(buildV2ConfigRequest(model, recognizerPath, wordBoostPhrases(wordBoost)));
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
  // Same 'write after end' guard as the v1 transport: a chunk can arrive between
  // an async 'error'/'end' emit and its handler nulling `stream`. The
  // authoritative handler owns nulling and onClose; nulling here would race it.
  try {
    stream.write({ audio: buffer });
  } catch (error) {
    console.error(`${LOG_LABEL} write failed:`, error);
  }
}

function stop(): void {
  if (stream === null) {
    return;
  }
  // Detach but keep the 'data' listener (see v1 transport): the endpoint flushes
  // an in-progress utterance's final only after end(). The retained
  // 'end'/'error' handlers see `stream !== closing` and stay silent.
  const closing = stream;
  stream = null;
  closing.end();
}

export const googleStreamV2: SttTransport = { start, isActive, write, stop };
