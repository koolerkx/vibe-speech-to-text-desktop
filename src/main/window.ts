import { resolve } from 'node:path';
import { BrowserWindow, screen, shell } from 'electron';

const FLOATING_WINDOW_WIDTH = 360;
const FLOATING_WINDOW_EXPANDED_HEIGHT = 360;
const FLOATING_WINDOW_COLLAPSED_HEIGHT = 44;
const FLOATING_WINDOW_MARGIN = 24;

// Shared by every app window so a security change (contextIsolation, sandbox,
// preload path) applies uniformly instead of drifting per window.
export const SHARED_WEB_PREFERENCES = {
  preload: resolve(import.meta.dirname, '../preload/index.js'),
  sandbox: false,
  contextIsolation: true,
};

export function createFloatingWindow(): BrowserWindow {
  const window = new BrowserWindow({
    width: FLOATING_WINDOW_WIDTH,
    height: FLOATING_WINDOW_EXPANDED_HEIGHT,
    frame: false,
    transparent: true,
    resizable: false,
    skipTaskbar: true,
    show: false,
    webPreferences: SHARED_WEB_PREFERENCES,
  });

  window.setAlwaysOnTop(true, 'screen-saver');
  window.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });

  window.on('ready-to-show', () => {
    positionBottomRight(window, FLOATING_WINDOW_EXPANDED_HEIGHT);
    window.show();
  });

  attachExternalLinkHandler(window);
  loadRenderer(window);

  return window;
}

// Collapse to just the top bar so the window stays out of the way while the top
// bar record button and auto-paste keep working; re-anchored bottom-right so the
// visible bar does not jump.
export function setFloatingWindowCollapsed(window: BrowserWindow, collapsed: boolean): void {
  const height = collapsed ? FLOATING_WINDOW_COLLAPSED_HEIGHT : FLOATING_WINDOW_EXPANDED_HEIGHT;
  // The window is fixed-size (resizable: false); on Windows setSize is ignored in
  // that state, so briefly re-enable resizing to apply the programmatic size.
  window.setResizable(true);
  window.setSize(FLOATING_WINDOW_WIDTH, height);
  window.setResizable(false);
  positionBottomRight(window, height);
}

function positionBottomRight(window: BrowserWindow, height: number): void {
  const { workArea } = screen.getPrimaryDisplay();
  const x = workArea.x + workArea.width - FLOATING_WINDOW_WIDTH - FLOATING_WINDOW_MARGIN;
  const y = workArea.y + workArea.height - height - FLOATING_WINDOW_MARGIN;
  window.setPosition(Math.round(x), Math.round(y));
}

export function attachExternalLinkHandler(window: BrowserWindow): void {
  window.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
}

export function loadRenderer(window: BrowserWindow, hash?: string): void {
  const devServerUrl = process.env['ELECTRON_RENDERER_URL'];
  if (devServerUrl) {
    window.loadURL(hash ? `${devServerUrl}#${hash}` : devServerUrl);
  } else {
    window.loadFile(resolve(import.meta.dirname, '../renderer/index.html'), hash ? { hash } : {});
  }
}
