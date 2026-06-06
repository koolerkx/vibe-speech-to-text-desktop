const WORKLET_NAME = 'pcm-downsampler';
const WORKLET_URL = 'pcm-worklet.js';
const TARGET_SAMPLE_RATE = 16000;

export enum CaptureErrorKind {
  PermissionDenied = 'permission-denied',
  NoDevice = 'no-device',
  Unsupported = 'unsupported',
  Unknown = 'unknown',
}

export class CaptureError extends Error {
  constructor(
    readonly kind: CaptureErrorKind,
    message: string,
  ) {
    super(message);
    this.name = 'CaptureError';
  }
}

export class AudioCapture {
  private audioContext: AudioContext | null = null;
  private mediaStream: MediaStream | null = null;
  private sourceNode: MediaStreamAudioSourceNode | null = null;
  private workletNode: AudioWorkletNode | null = null;
  private starting = false;

  get active(): boolean {
    return this.audioContext !== null;
  }

  async start(): Promise<void> {
    // `active` only flips true after the awaits below, so a synchronous guard is
    // needed to reject a second start() that overlaps the first (rapid toggle).
    if (this.active || this.starting) {
      return;
    }
    this.starting = true;
    let stream: MediaStream | null = null;
    let audioContext: AudioContext | null = null;
    try {
      stream = await this.requestMicrophone();
      audioContext = new AudioContext({ sampleRate: TARGET_SAMPLE_RATE });
      await audioContext.audioWorklet.addModule(WORKLET_URL);
      const sourceNode = audioContext.createMediaStreamSource(stream);
      const workletNode = new AudioWorkletNode(audioContext, WORKLET_NAME);
      workletNode.port.onmessage = (event: MessageEvent<ArrayBuffer>) => {
        window.api.sendAudioChunk(event.data);
      };
      sourceNode.connect(workletNode);
      // The worklet writes no output, so routing it to destination only drives
      // the render graph (otherwise process() is never pulled); it emits silence.
      workletNode.connect(audioContext.destination);
      // A context created without a user gesture can start suspended; resume so
      // process() is actually pulled.
      await audioContext.resume();

      this.audioContext = audioContext;
      this.mediaStream = stream;
      this.sourceNode = sourceNode;
      this.workletNode = workletNode;
      window.api.setCaptureState(true);
    } catch (error) {
      audioContext?.close();
      stream?.getTracks().forEach((track) => track.stop());
      throw error instanceof CaptureError
        ? error
        : new CaptureError(CaptureErrorKind.Unknown, toMessage(error));
    } finally {
      this.starting = false;
    }
  }

  async stop(): Promise<void> {
    if (!this.active) {
      return;
    }
    this.workletNode?.port.close();
    this.workletNode?.disconnect();
    this.sourceNode?.disconnect();
    this.mediaStream?.getTracks().forEach((track) => track.stop());
    await this.audioContext?.close();

    this.workletNode = null;
    this.sourceNode = null;
    this.mediaStream = null;
    this.audioContext = null;
    window.api.setCaptureState(false);
  }

  private async requestMicrophone(): Promise<MediaStream> {
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new CaptureError(CaptureErrorKind.Unsupported, 'getUserMedia is not available');
    }
    try {
      return await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
    } catch (error) {
      throw toCaptureError(error);
    }
  }
}

function toCaptureError(error: unknown): CaptureError {
  if (error instanceof DOMException) {
    switch (error.name) {
      case 'NotAllowedError':
      case 'SecurityError':
        return new CaptureError(CaptureErrorKind.PermissionDenied, 'Microphone permission denied');
      case 'NotFoundError':
      case 'DevicesNotFoundError':
        return new CaptureError(CaptureErrorKind.NoDevice, 'No microphone device found');
      default:
        return new CaptureError(CaptureErrorKind.Unknown, error.message || error.name);
    }
  }
  return new CaptureError(CaptureErrorKind.Unknown, toMessage(error));
}

function toMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export const audioCapture = new AudioCapture();
