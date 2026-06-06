export const IpcChannel = {
  WindowHide: 'window:hide',
  AppQuit: 'app:quit',
  AudioChunk: 'audio:chunk',
  AudioCaptureState: 'audio:capture-state',
} as const;

export type IpcChannel = (typeof IpcChannel)[keyof typeof IpcChannel];

export interface RendererApi {
  hideWindow: () => void;
  quitApp: () => void;
  sendAudioChunk: (chunk: ArrayBuffer) => void;
  setCaptureState: (active: boolean) => void;
}
