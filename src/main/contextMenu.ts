import {
  BrowserWindow,
  clipboard,
  ipcMain,
  Menu,
  type MenuItemConstructorOptions,
} from 'electron';
import {
  IpcChannel,
  type TranscriptMenuAction,
  type TranscriptMenuPayload,
} from '../shared/ipc-types.js';

export function registerContextMenuHandlers(): void {
  ipcMain.handle(IpcChannel.ShowTranscriptMenu, (event, payload: TranscriptMenuPayload) => {
    return new Promise<TranscriptMenuAction | null>((resolve) => {
      const template: MenuItemConstructorOptions[] = [
        {
          label: 'Copy selected',
          enabled: payload.selected.length > 0,
          click: () => {
            clipboard.writeText(payload.selected);
            resolve('copy-selected');
          },
        },
        {
          label: 'Copy all',
          enabled: payload.all.length > 0,
          click: () => {
            clipboard.writeText(payload.all);
            resolve('copy-all');
          },
        },
        { type: 'separator' },
        {
          label: 'Clear',
          enabled: payload.all.length > 0,
          click: () => resolve('clear'),
        },
      ];
      const menu = Menu.buildFromTemplate(template);
      const window = BrowserWindow.fromWebContents(event.sender) ?? undefined;
      // Dismissing the menu without a selection resolves null; resolve is
      // idempotent, so an item click that already resolved wins over this.
      menu.popup({ window, callback: () => resolve(null) });
    });
  });
}
