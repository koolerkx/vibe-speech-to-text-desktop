import { app, BrowserWindow, Tray } from 'electron';
import { createFloatingWindow } from './window.js';
import { createTray } from './tray.js';
import { registerIpcHandlers } from './ipc.js';

let floatingWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let isQuitting = false;

function bootstrap(): void {
  floatingWindow = createFloatingWindow();
  tray = createTray(floatingWindow);
  registerIpcHandlers(floatingWindow);

  floatingWindow.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault();
      floatingWindow?.hide();
    }
  });
}

const hasSingleInstanceLock = app.requestSingleInstanceLock();

if (!hasSingleInstanceLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (floatingWindow) {
      floatingWindow.show();
      floatingWindow.focus();
    }
  });

  app.whenReady().then(() => {
    bootstrap();

    app.on('activate', () => {
      if (floatingWindow) {
        floatingWindow.show();
        floatingWindow.focus();
      } else {
        bootstrap();
      }
    });
  });

  app.on('window-all-closed', () => {
    // Tray keeps the app resident; closing the window hides it instead of quitting.
  });

  app.on('before-quit', () => {
    isQuitting = true;
    tray?.destroy();
  });
}
