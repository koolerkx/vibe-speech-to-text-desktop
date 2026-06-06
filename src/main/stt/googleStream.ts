import { resolve } from 'node:path';
import { app } from 'electron';
import { protos, SpeechClient } from '@google-cloud/speech';
import type { SttResult } from '../../shared/ipc-types.js';
import { streamingConfig } from './streamingConfig.js';

const KEY_FILENAME = 'key.json';

type StreamingResponse = protos.google.cloud.speech.v1.IStreamingRecognizeResponse;
type RecognizeStream = ReturnType<SpeechClient['streamingRecognize']>;

let client: SpeechClient | null = null;
let stream: RecognizeStream | null = null;

export function start(onResult: (result: SttResult) => void): void {
  if (stream !== null) {
    return;
  }
  try {
    if (client === null) {
      client = new SpeechClient({ keyFilename: resolve(app.getAppPath(), KEY_FILENAME) });
    }
    stream = client
      .streamingRecognize(streamingConfig)
      .on('data', (response: StreamingResponse) => handleResponse(response, onResult))
      .on('error', (error: { code?: number; message?: string }) => {
        console.error(`[googleStream] stream error: ${error.code ?? ''} ${error.message ?? error}`.trim());
        stream = null;
      })
      .on('end', () => {
        stream = null;
      });
  } catch (error) {
    console.error('[googleStream] failed to start stream:', error);
    stream = null;
  }
}

export function write(chunk: ArrayBuffer | Uint8Array): void {
  if (stream === null) {
    return;
  }
  const buffer =
    chunk instanceof Uint8Array
      ? Buffer.from(chunk.buffer, chunk.byteOffset, chunk.byteLength)
      : Buffer.from(chunk);
  // A chunk can arrive between an async 'error'/'end' emit and its handler
  // nulling `stream` (or after the ~5min stream limit); writing then throws
  // 'write after end', which would crash the main process if unguarded.
  try {
    stream.write(buffer);
  } catch (error) {
    console.error('[googleStream] write failed:', error);
    stream = null;
  }
}

export function stop(): void {
  if (stream === null) {
    return;
  }
  stream.end();
  stream = null;
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
