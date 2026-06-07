import { getSettings } from '../settings/store.js';
import { googleStreamV1 } from './googleStreamV1.js';
import { googleStreamV2 } from './googleStreamV2.js';
import type { SttTransport, StreamHandlers } from './transport.js';

// Version-agnostic facade over the v1/v2 transports. reconnect.ts drives this
// single surface; the transport is chosen per session at start() so a rotation
// or VAD reopen mid-session keeps the same backend.
let active: SttTransport | null = null;

export function start(handlers: StreamHandlers): void {
  active = getSettings().model.apiVersion === 'v2' ? googleStreamV2 : googleStreamV1;
  active.start(handlers);
}

export function isActive(): boolean {
  return active?.isActive() ?? false;
}

export function write(chunk: ArrayBuffer | Uint8Array): void {
  active?.write(chunk);
}

export function stop(): void {
  active?.stop();
}
