import type { SttResult, SttStatus } from '../../shared/ipc-types.js';
import { toBuffer } from '../audio/pcm.js';
import * as googleStream from './googleStream.js';
import { streamLimits } from './streamingConfig.js';

// Energy gate used as the segment-cut trigger: RMS of a LINEAR16 chunk below this
// counts as silence. This is the pluggable VAD hook point — a real VAD would
// replace isSilent() without touching the rotation policy.
const SILENCE_RMS_THRESHOLD = 500;
// Continuous silence required before a soft-limit rotation is allowed, so a cut
// lands in a gap between utterances rather than on a brief intra-word pause.
const SILENCE_HOLD_MS = 400;

const RECONNECT_BASE_DELAY_MS = 500;
const RECONNECT_MAX_DELAY_MS = 8_000;
// Bounds backoff growth for hard failures (e.g. missing key.json) so the app
// reports an error instead of retrying forever; runtime stream drops reset the
// counter once data flows again, so a long outage still recovers.
const MAX_RECONNECT_ATTEMPTS = 10;
// ~30s of 16kHz mono 16-bit audio. Caps memory while a reconnect is pending;
// older audio past this is dropped (and logged) since it is unrecoverable anyway.
const MAX_BUFFER_BYTES = 16_000 * 2 * 30;

let onResult: ((result: SttResult) => void) | null = null;
let onStatus: ((status: SttStatus) => void) | null = null;
let status: SttStatus = 'idle';

let active = false;
let reconnecting = false;
let awaitingFirstData = false;

let segmentStartMs = 0;
let lastVoiceMs = 0;

let reconnectAttempts = 0;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

let pending: Buffer[] = [];
let pendingBytes = 0;
let bufferOverflowLogged = false;

export function start(
  resultListener: (result: SttResult) => void,
  statusListener: (status: SttStatus) => void,
): void {
  onResult = resultListener;
  onStatus = statusListener;
  active = true;
  reconnecting = false;
  reconnectAttempts = 0;
  clearPending();
  openStream();
  if (googleStream.isActive()) {
    setStatus('live');
  }
}

export function write(chunk: ArrayBuffer | Uint8Array): void {
  if (!active) {
    return;
  }
  const buffer = toBuffer(chunk);
  if (reconnecting) {
    bufferChunk(buffer);
    return;
  }
  googleStream.write(buffer);
  const now = Date.now();
  if (!isSilent(buffer)) {
    lastVoiceMs = now;
  }
  maybeRotate(now);
}

export function stop(): void {
  active = false;
  reconnecting = false;
  clearReconnectTimer();
  clearPending();
  googleStream.stop();
  setStatus('idle');
}

function openStream(): void {
  segmentStartMs = Date.now();
  lastVoiceMs = segmentStartMs;
  awaitingFirstData = true;
  googleStream.start({ onResult: forwardResult, onClose: handleClose });
}

function forwardResult(result: SttResult): void {
  if (awaitingFirstData) {
    awaitingFirstData = false;
    reconnectAttempts = 0;
  }
  onResult?.(result);
}

function handleClose(_reason: 'error' | 'end'): void {
  if (!active || reconnecting) {
    return;
  }
  reconnecting = true;
  setStatus('reconnecting');
  scheduleReconnect();
}

function scheduleReconnect(): void {
  if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
    console.error(`[reconnect] giving up after ${MAX_RECONNECT_ATTEMPTS} attempts`);
    reconnecting = false;
    setStatus('error');
    return;
  }
  const delay = Math.min(RECONNECT_BASE_DELAY_MS * 2 ** reconnectAttempts, RECONNECT_MAX_DELAY_MS);
  reconnectAttempts += 1;
  reconnectTimer = setTimeout(attemptReconnect, delay);
}

function attemptReconnect(): void {
  reconnectTimer = null;
  if (!active) {
    return;
  }
  openStream();
  if (googleStream.isActive()) {
    reconnecting = false;
    flushPending();
    setStatus('live');
    return;
  }
  // Synchronous open failure (e.g. bad credentials) re-entered handleClose, but
  // it was a no-op because `reconnecting` is still true from this cycle, so the
  // next backoff must be scheduled here or the machine would stall forever.
  scheduleReconnect();
}

// Rotation runs synchronously on the single JS thread, so no write() can
// interleave between stop() and openStream(); cutting at a silence boundary then
// loses no in-flight audio and needs no buffering.
function rotate(): void {
  googleStream.stop();
  openStream();
}

function maybeRotate(now: number): void {
  // No live stream to rotate (e.g. after giving up into the 'error' state, where
  // `active` stays true and chunks keep arriving); rotating here would revive a
  // stream outside the backoff/attempt accounting.
  if (!googleStream.isActive()) {
    return;
  }
  const elapsed = now - segmentStartMs;
  if (elapsed >= streamLimits.hardLimitMs) {
    rotate();
    return;
  }
  if (elapsed >= streamLimits.softLimitMs && now - lastVoiceMs >= SILENCE_HOLD_MS) {
    rotate();
  }
}

function bufferChunk(buffer: Buffer): void {
  pending.push(buffer);
  pendingBytes += buffer.length;
  while (pendingBytes > MAX_BUFFER_BYTES && pending.length > 1) {
    const dropped = pending.shift();
    if (dropped) {
      pendingBytes -= dropped.length;
    }
    if (!bufferOverflowLogged) {
      console.warn('[reconnect] reconnect buffer full, dropping oldest audio');
      bufferOverflowLogged = true;
    }
  }
}

function flushPending(): void {
  for (const buffer of pending) {
    googleStream.write(buffer);
  }
  clearPending();
}

function clearPending(): void {
  pending = [];
  pendingBytes = 0;
  bufferOverflowLogged = false;
}

function clearReconnectTimer(): void {
  if (reconnectTimer !== null) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
}

function setStatus(next: SttStatus): void {
  if (status === next) {
    return;
  }
  status = next;
  onStatus?.(next);
}

function isSilent(buffer: Buffer): boolean {
  const sampleCount = Math.floor(buffer.length / 2);
  if (sampleCount === 0) {
    return true;
  }
  let sumSquares = 0;
  for (let offset = 0; offset + 1 < buffer.length; offset += 2) {
    const sample = buffer.readInt16LE(offset);
    sumSquares += sample * sample;
  }
  return Math.sqrt(sumSquares / sampleCount) < SILENCE_RMS_THRESHOLD;
}
