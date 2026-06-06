import { resolve } from 'node:path';
import { app } from 'electron';
import { protos, SpeechClient } from '@google-cloud/speech';
import type { SttResult } from '../../shared/ipc-types.js';
import { toBuffer } from '../audio/pcm.js';
import { streamingConfig } from './streamingConfig.js';

const KEY_FILENAME = 'key.json';

type StreamingResponse = protos.google.cloud.speech.v1.IStreamingRecognizeResponse;
type RecognizeStream = ReturnType<SpeechClient['streamingRecognize']>;

export interface StreamHandlers {
  onResult: (result: SttResult) => void;
  // Called only on an unexpected close (endpoint error or 'end') of the current
  // stream. A stream detached by stop() is no longer the current stream, so its
  // later teardown stays silent and is never mistaken for a disconnect.
  onClose: (reason: 'error' | 'end') => void;
}

let client: SpeechClient | null = null;
let stream: RecognizeStream | null = null;

export function start(handlers: StreamHandlers): void {
  if (stream !== null) {
    return;
  }
  try {
    if (client === null) {
      client = new SpeechClient({ keyFilename: resolve(app.getAppPath(), KEY_FILENAME) });
    }
    const opened = client.streamingRecognize(streamingConfig);
    stream = opened;
    opened
      .on('data', (response: StreamingResponse) => handleResponse(response, handlers.onResult))
      .on('error', (error: { code?: number; message?: string }) => {
        console.error(`[googleStream] stream error: ${error.code ?? ''} ${error.message ?? error}`.trim());
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
    console.error('[googleStream] failed to start stream:', error);
    stream = null;
    handlers.onClose('error');
  }
}

export function isActive(): boolean {
  return stream !== null;
}

export function write(chunk: ArrayBuffer | Uint8Array): void {
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
    console.error('[googleStream] write failed:', error);
  }
}

export function stop(): void {
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

function handleResponse(response: StreamingResponse, onResult: (result: SttResult) => void): void {
  const result = response.results?.[0];
  const transcript = result?.alternatives?.[0]?.transcript;
  if (!transcript) {
    return;
  }
  const isFinal = result.isFinal === true;
  if (isFinal) {
    console.log(`[googleStream] final: ${transcript}`);
  }
  onResult({ transcript, isFinal });
}
