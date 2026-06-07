import { ipcMain } from 'electron';
import type { GoogleCredentials } from '../../shared/credentials.js';
import { IpcChannel } from '../../shared/ipc-types.js';
import { resetClients } from '../stt/googleStream.js';
import { clearCredentials, getCredentialsStatus, setCredentials } from './store.js';

export function registerCredentialsHandlers(): void {
  ipcMain.handle(IpcChannel.CredentialsGet, () => getCredentialsStatus());
  ipcMain.handle(IpcChannel.CredentialsSet, (_event, credentials: GoogleCredentials) => {
    const status = setCredentials(credentials);
    resetClients();
    return status;
  });
  ipcMain.handle(IpcChannel.CredentialsClear, () => {
    const status = clearCredentials();
    resetClients();
    return status;
  });
}
