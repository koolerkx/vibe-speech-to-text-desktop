import type { SttResult } from '../../shared/ipc-types.js';

export interface StreamHandlers {
  onResult: (result: SttResult) => void;
  // Called only on an unexpected close (endpoint error or 'end') of the current
  // stream. A stream detached by stop() is no longer the current stream, so its
  // later teardown stays silent and is never mistaken for a disconnect.
  onClose: (reason: 'error' | 'end') => void;
}

// One streaming transport to a recognition backend. googleStreamV1 and
// googleStreamV2 each implement this; the dispatcher in googleStream selects one
// per session by apiVersion so reconnect.ts stays version-agnostic.
export interface SttTransport {
  start: (handlers: StreamHandlers) => void;
  isActive: () => boolean;
  write: (chunk: ArrayBuffer | Uint8Array) => void;
  stop: () => void;
}

// Structural subset of a v1/v2 IStreamingRecognizeResponse; both proto namespaces
// expose the same result/alternative/word shape for the fields we read.
interface TranscriptResponse {
  results?:
    | ReadonlyArray<{
        isFinal?: boolean | null;
        alternatives?:
          | ReadonlyArray<{
              transcript?: string | null;
              words?: ReadonlyArray<{ word?: string | null; confidence?: number | null }> | null;
            } | null>
          | null;
      } | null>
    | null;
}

// Shared first-result extraction used by both transports: emits interim text as
// it arrives and, on a final, attaches per-word confidence. `label` distinguishes
// the v1/v2 log line.
export function forwardTranscript(
  response: TranscriptResponse,
  onResult: (result: SttResult) => void,
  label: string,
): void {
  const result = response.results?.[0];
  const alternative = result?.alternatives?.[0];
  const transcript = alternative?.transcript;
  if (!result || !alternative || !transcript) {
    return;
  }
  const isFinal = result.isFinal === true;
  if (!isFinal) {
    onResult({ transcript, isFinal });
    return;
  }
  console.log(`${label} final: ${transcript}`);
  const words = alternative.words?.map((word) => ({
    word: word.word ?? '',
    confidence: typeof word.confidence === 'number' ? word.confidence : 0,
  }));
  onResult({ transcript, isFinal, words });
}
