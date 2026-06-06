export const IpcChannel = {
  WindowHide: 'window:hide',
  AppQuit: 'app:quit',
  AudioChunk: 'audio:chunk',
  AudioCaptureState: 'audio:capture-state',
  SttResult: 'stt:result',
  SttStatus: 'stt:status',
} as const;

export type IpcChannel = (typeof IpcChannel)[keyof typeof IpcChannel];

export interface SttResult {
  transcript: string;
  isFinal: boolean;
}

export type SttStatus = 'idle' | 'live' | 'reconnecting' | 'error';

export interface RendererApi {
  hideWindow: () => void;
  quitApp: () => void;
  sendAudioChunk: (chunk: ArrayBuffer) => void;
  setCaptureState: (active: boolean) => void;
  onSttResult: (listener: (result: SttResult) => void) => () => void;
  onSttStatus: (listener: (status: SttStatus) => void) => () => void;
}
