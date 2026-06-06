import { resolve } from 'node:path';
import { BrowserWindow, screen, shell } from 'electron';

const FLOATING_WINDOW_WIDTH = 360;
const FLOATING_WINDOW_HEIGHT = 200;
const FLOATING_WINDOW_MARGIN = 24;

export function createFloatingWindow(): BrowserWindow {
  const window = new BrowserWindow({
    width: FLOATING_WINDOW_WIDTH,
    height: FLOATING_WINDOW_HEIGHT,
    frame: false,
    transparent: true,
    resizable: false,
    skipTaskbar: true,
    show: false,
    webPreferences: {
      preload: resolve(import.meta.dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
    },
  });

  window.setAlwaysOnTop(true, 'screen-saver');
  window.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });

  window.on('ready-to-show', () => {
    positionBottomRight(window);
    window.show();
  });

  window.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  loadRenderer(window);

  return window;
}

function positionBottomRight(window: BrowserWindow): void {
  const { workArea } = screen.getPrimaryDisplay();
  const x = workArea.x + workArea.width - FLOATING_WINDOW_WIDTH - FLOATING_WINDOW_MARGIN;
  const y = workArea.y + workArea.height - FLOATING_WINDOW_HEIGHT - FLOATING_WINDOW_MARGIN;
  window.setPosition(Math.round(x), Math.round(y));
}

function loadRenderer(window: BrowserWindow): void {
  const devServerUrl = process.env['ELECTRON_RENDERER_URL'];
  if (devServerUrl) {
    window.loadURL(devServerUrl);
  } else {
    window.loadFile(resolve(import.meta.dirname, '../renderer/index.html'));
  }
}
