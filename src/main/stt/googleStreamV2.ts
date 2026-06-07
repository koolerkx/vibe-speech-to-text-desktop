import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { app } from 'electron';
import { protos, v2 } from '@google-cloud/speech';
import type { Location } from '../../shared/settings.js';
import { toBuffer } from '../audio/pcm.js';
import { getSettings } from '../settings/store.js';
import { buildV2ConfigRequest } from './streamingConfig.js';
import { forwardTranscript, type SttTransport, type StreamHandlers } from './transport.js';

const KEY_FILENAME = 'key.json';
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

function keyFilePath(): string {
  return resolve(app.getAppPath(), KEY_FILENAME);
}

// Service-account keys carry the project id, so it resolves synchronously from
// the same file used as keyFilename. This keeps start() synchronous, matching
// the v1 transport and the synchronous open/isActive flow reconnect.ts expects.
function getProjectId(): string {
  if (projectId === null) {
    const raw = readFileSync(keyFilePath(), 'utf-8');
    projectId = (JSON.parse(raw) as { project_id?: string }).project_id ?? '';
  }
  return projectId;
}

// global uses the default endpoint; multi-region locations (us/eu, required by
// chirp_3) must target their own endpoint or the request is rejected.
function getClient(location: Location): v2.SpeechClient {
  if (client !== null && clientLocation === location) {
    return client;
  }
  const apiEndpoint = location === 'global' ? undefined : `${location}-speech.googleapis.com`;
  client = new v2.SpeechClient({ keyFilename: keyFilePath(), apiEndpoint });
  clientLocation = location;
  return client;
}

function start(handlers: StreamHandlers): void {
  if (stream !== null) {
    return;
  }
  try {
    const { model } = getSettings();
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
    opened.write(buildV2ConfigRequest(model, recognizerPath));
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
