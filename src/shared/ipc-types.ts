export const IpcChannel = {
  WindowHide: 'window:hide',
  AppQuit: 'app:quit',
} as const;

export type IpcChannel = (typeof IpcChannel)[keyof typeof IpcChannel];

export interface RendererApi {
  hideWindow: () => void;
  quitApp: () => void;
}
