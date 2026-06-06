import { closeSync, openSync, writeSync } from 'node:fs';
import { resolve } from 'node:path';
import { app } from 'electron';
import { toBuffer } from './pcm.js';

const SAMPLE_RATE = 16000;
const CHANNELS = 1;
const BITS_PER_SAMPLE = 16;
const BYTES_PER_SAMPLE = BITS_PER_SAMPLE / 8;
const LOG_EVERY_CHUNKS = 10;
const WAV_HEADER_BYTES = 44;
const WRITE_DEBUG_WAV = true;
const DEBUG_WAV_FILENAME = 'stt-capture.wav';

let chunkCount = 0;
let totalBytes = 0;
let wavFd: number | null = null;
let wavPath: string | null = null;
let wavDataBytes = 0;

export function handleChunk(chunk: ArrayBuffer | Uint8Array): void {
  const buffer = toBuffer(chunk);
  if (buffer.length === 0 || buffer.length % BYTES_PER_SAMPLE !== 0) {
    console.warn(`[pcmSink] dropped malformed chunk: ${buffer.length} bytes`);
    return;
  }

  chunkCount += 1;
  totalBytes += buffer.length;

  if (wavFd !== null) {
    writeSync(wavFd, buffer);
    wavDataBytes += buffer.length;
  }

  if (chunkCount % LOG_EVERY_CHUNKS === 0) {
    console.log(`[pcmSink] chunks=${chunkCount} bytes=${totalBytes} ~${impliedSeconds().toFixed(1)}s`);
  }
}

export function setCaptureState(active: boolean): void {
  if (active) {
    startSession();
  } else {
    endSession();
  }
}

function startSession(): void {
  chunkCount = 0;
  totalBytes = 0;
  if (!WRITE_DEBUG_WAV) {
    return;
  }
  if (wavFd !== null) {
    closeSync(wavFd);
  }
  wavPath = resolve(app.getPath('temp'), DEBUG_WAV_FILENAME);
  wavFd = openSync(wavPath, 'w');
  wavDataBytes = 0;
  writeWavHeader(wavFd, 0);
  console.log(`[pcmSink] capture started, debug wav: ${wavPath}`);
}

function endSession(): void {
  console.log(
    `[pcmSink] capture stopped: chunks=${chunkCount} bytes=${totalBytes} ~${impliedSeconds().toFixed(1)}s`,
  );
  if (wavFd === null) {
    return;
  }
  writeWavHeader(wavFd, wavDataBytes);
  closeSync(wavFd);
  console.log(`[pcmSink] wav written: ${wavPath}`);
  wavFd = null;
  wavPath = null;
  wavDataBytes = 0;
}

function impliedSeconds(): number {
  return totalBytes / BYTES_PER_SAMPLE / SAMPLE_RATE;
}

function writeWavHeader(fd: number, dataBytes: number): void {
  const byteRate = SAMPLE_RATE * CHANNELS * BYTES_PER_SAMPLE;
  const blockAlign = CHANNELS * BYTES_PER_SAMPLE;
  const header = Buffer.alloc(WAV_HEADER_BYTES);
  header.write('RIFF', 0, 'ascii');
  header.writeUInt32LE(36 + dataBytes, 4);
  header.write('WAVE', 8, 'ascii');
  header.write('fmt ', 12, 'ascii');
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(CHANNELS, 22);
  header.writeUInt32LE(SAMPLE_RATE, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(BITS_PER_SAMPLE, 34);
  header.write('data', 36, 'ascii');
  header.writeUInt32LE(dataBytes, 40);
  writeSync(fd, header, 0, header.length, 0);
}
