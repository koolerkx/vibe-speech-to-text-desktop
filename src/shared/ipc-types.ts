export const IpcChannel = {
  WindowHide: 'window:hide',
  AppQuit: 'app:quit',
  AudioChunk: 'audio:chunk',
  AudioCaptureState: 'audio:capture-state',
  SttResult: 'stt:result',
} as const;

export type IpcChannel = (typeof IpcChannel)[keyof typeof IpcChannel];

export interface SttResult {
  transcript: string;
  isFinal: boolean;
}

export interface RendererApi {
  hideWindow: () => void;
  quitApp: () => void;
  sendAudioChunk: (chunk: ArrayBuffer) => void;
  setCaptureState: (active: boolean) => void;
  onSttResult: (listener: (result: SttResult) => void) => () => void;
}
