import type { SttResult, SttStatus } from '../../shared/ipc-types.js';
import { toBuffer } from '../audio/pcm.js';
import { getSettings } from '../settings/store.js';
import * as googleStream from './googleStream.js';
import { SAMPLE_RATE, streamLimits } from './streamingConfig.js';

// Continuous silence required before a soft-limit rotation is allowed, so a cut
// lands in a gap between utterances rather than on a brief intra-word pause.
// Distinct from the VAD close-hold: rotation only re-opens immediately (no cost
// saving), so its hold is an internal mechanic, not a user-facing knob.
const SILENCE_HOLD_MS = 400;

const RECONNECT_BASE_DELAY_MS = 500;
const RECONNECT_MAX_DELAY_MS = 8_000;
// Bounds backoff growth for hard failures (e.g. missing key.json) so the app
// reports an error instead of retrying forever; runtime stream drops reset the
// counter once data flows again, so a long outage still recovers.
const MAX_RECONNECT_ATTEMPTS = 10;
// ~30s of 16kHz mono 16-bit audio. Caps memory while a reconnect is pending;
// older audio past this is dropped (and logged) since it is unrecoverable anyway.
const MAX_BUFFER_BYTES = SAMPLE_RATE * 2 * 30;

const BYTES_PER_SAMPLE = 2;

let onResult: ((result: SttResult) => void) | null = null;
let onStatus: ((status: SttStatus) => void) | null = null;
let onLevel: ((rms: number) => void) | null = null;
let status: SttStatus = 'idle';

let active = false;
let reconnecting = false;
let awaitingFirstData = false;
// VAD gate: stream intentionally closed during silence to stop billing. Distinct
// from `reconnecting`, which is an involuntary drop being recovered.
let dormant = false;
let voicedRunCount = 0;

let segmentStartMs = 0;
let lastVoiceMs = 0;

let reconnectAttempts = 0;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

let pending: Buffer[] = [];
let pendingBytes = 0;
let bufferOverflowLogged = false;

// Rolling buffer of the most recent audio while dormant; replayed on reopen so
// the speech onset (including the chunks consumed by the reopen debounce) is not
// lost during the stream open latency.
let preroll: Buffer[] = [];
let prerollBytes = 0;

export function start(
  resultListener: (result: SttResult) => void,
  statusListener: (status: SttStatus) => void,
  levelListener: (rms: number) => void,
): void {
  onResult = resultListener;
  onStatus = statusListener;
  onLevel = levelListener;
  active = true;
  reconnecting = false;
  dormant = false;
  voicedRunCount = 0;
  reconnectAttempts = 0;
  clearPending();
  clearPreroll();
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
  const rms = computeRms(buffer);
  onLevel?.(rms);

  const vad = getSettings().vad;
  const voiced = rms >= vad.silenceThreshold;
  const now = Date.now();

  if (reconnecting) {
    bufferChunk(buffer);
    return;
  }
  if (dormant) {
    handleDormantChunk(buffer, voiced, vad.enabled, vad.reopenVoicedChunks, vad.prerollMs);
    return;
  }

  googleStream.write(buffer);
  if (voiced) {
    lastVoiceMs = now;
  } else if (vad.enabled && now - lastVoiceMs >= vad.closeHoldMs) {
    enterDormant(now - lastVoiceMs);
    return;
  }
  maybeRotate(now);
}

export function stop(): void {
  active = false;
  reconnecting = false;
  dormant = false;
  voicedRunCount = 0;
  clearReconnectTimer();
  clearPending();
  clearPreroll();
  googleStream.stop();
  setStatus('idle');
}

// Closing the live stream stops billing during silence; reopening replays the
// preroll so no speech is lost. stop() detaches the stream without firing
// onClose (it checks `stream !== closing`), so this does not trigger a reconnect.
function enterDormant(silenceMs: number): void {
  googleStream.stop();
  dormant = true;
  voicedRunCount = 0;
  clearPreroll();
  console.log(`[vad] silence held ${silenceMs}ms -> closing stream to stop billing`);
  setStatus('dormant');
}

function handleDormantChunk(
  buffer: Buffer,
  voiced: boolean,
  vadEnabled: boolean,
  reopenVoicedChunks: number,
  prerollMs: number,
): void {
  pushPreroll(buffer, prerollMs);
  if (!vadEnabled) {
    reopenFromDormant();
    return;
  }
  if (!voiced) {
    voicedRunCount = 0;
    return;
  }
  voicedRunCount += 1;
  if (voicedRunCount >= reopenVoicedChunks) {
    reopenFromDormant();
  }
}

function reopenFromDormant(): void {
  dormant = false;
  voicedRunCount = 0;
  // Move the preroll into the pending buffer so the onset is replayed whether the
  // stream opens now or only after a reconnect (on a synchronous open failure).
  const prerollChunks = preroll.length;
  const prerollMs = Math.round((prerollBytes / BYTES_PER_SAMPLE / SAMPLE_RATE) * 1000);
  for (const buffer of preroll) {
    bufferChunk(buffer);
  }
  clearPreroll();
  openStream();
  if (googleStream.isActive()) {
    reconnecting = false;
    reconnectAttempts = 0;
    flushPending();
    lastVoiceMs = Date.now();
    console.log(`[vad] voice detected -> reopened stream, replayed ${prerollChunks} preroll chunks (~${prerollMs}ms)`);
    setStatus('live');
    return;
  }
  // Synchronous open failure already re-entered handleClose, which set
  // `reconnecting` and scheduled a retry; the queued preroll flushes on success.
  console.warn('[vad] reopen could not open stream; falling back to reconnect');
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

function pushPreroll(buffer: Buffer, prerollMs: number): void {
  preroll.push(buffer);
  prerollBytes += buffer.length;
  const maxBytes = Math.floor((prerollMs / 1000) * SAMPLE_RATE) * BYTES_PER_SAMPLE;
  while (prerollBytes > maxBytes && preroll.length > 0) {
    const dropped = preroll.shift();
    if (dropped) {
      prerollBytes -= dropped.length;
    }
  }
}

function clearPreroll(): void {
  preroll = [];
  prerollBytes = 0;
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

function computeRms(buffer: Buffer): number {
  const sampleCount = Math.floor(buffer.length / BYTES_PER_SAMPLE);
  if (sampleCount === 0) {
    return 0;
  }
  let sumSquares = 0;
  for (let offset = 0; offset + 1 < buffer.length; offset += BYTES_PER_SAMPLE) {
    const sample = buffer.readInt16LE(offset);
    sumSquares += sample * sample;
  }
  return Math.sqrt(sumSquares / sampleCount);
}
