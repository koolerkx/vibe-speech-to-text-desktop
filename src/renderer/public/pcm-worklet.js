// AudioWorklet processor. Authored as plain JS (not bundled/transpiled) so it
// can be served from origin and loaded via addModule; Vite's `?url` import of a
// `.ts` file inlines untranspiled TypeScript as a data URI, which fails to load.
// Runs in AudioWorkletGlobalScope; converts mono Float32 input to 16-bit PCM and
// posts ~100ms frames (1600 samples at 16kHz) to the main thread.

const FRAME_SAMPLES = 1600;
const INT16_MAX = 0x7fff;

class PcmDownsampler extends AudioWorkletProcessor {
  constructor() {
    super();
    this.frame = new Int16Array(FRAME_SAMPLES);
    this.filled = 0;
  }

  process(inputs) {
    const channel = inputs[0]?.[0];
    if (!channel) {
      return true;
    }
    for (let i = 0; i < channel.length; i += 1) {
      const clamped = Math.max(-1, Math.min(1, channel[i]));
      this.frame[this.filled] = Math.round(clamped * INT16_MAX);
      this.filled += 1;
      if (this.filled === FRAME_SAMPLES) {
        const chunk = this.frame.slice();
        this.port.postMessage(chunk.buffer, [chunk.buffer]);
        this.filled = 0;
      }
    }
    return true;
  }
}

registerProcessor('pcm-downsampler', PcmDownsampler);
