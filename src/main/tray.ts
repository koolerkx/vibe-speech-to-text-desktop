import { resolve } from 'node:path';
import { app, BrowserWindow, Menu, Tray, nativeImage } from 'electron';

const TRAY_TOOLTIP = 'Speech to Text';

export function createTray(window: BrowserWindow): Tray {
  const icon = nativeImage
    .createFromPath(resolveIconPath())
    .resize({ width: 16, height: 16 });
  const tray = new Tray(icon);
  tray.setToolTip(TRAY_TOOLTIP);

  const menu = Menu.buildFromTemplate([
    {
      label: 'Show',
      click: () => showWindow(window),
    },
    {
      label: 'Hide',
      click: () => window.hide(),
    },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => app.quit(),
    },
  ]);

  tray.setContextMenu(menu);
  tray.on('click', () => toggleWindow(window));

  return tray;
}

function showWindow(window: BrowserWindow): void {
  window.show();
  window.focus();
}

function toggleWindow(window: BrowserWindow): void {
  if (window.isVisible()) {
    window.hide();
  } else {
    showWindow(window);
  }
}

function resolveIconPath(): string {
  if (app.isPackaged) {
    return resolve(process.resourcesPath, 'resources/icon.png');
  }
  return resolve(import.meta.dirname, '../../resources/icon.png');
}
