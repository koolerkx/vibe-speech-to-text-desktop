import { readFileSync, writeFileSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { app, safeStorage } from 'electron';
import {
  type CredentialsStatus,
  type GoogleCredentials,
  normalizePrivateKey,
  validateCredentials,
} from '../../shared/credentials.js';

// Kept out of settings.json (plaintext) so the secret never lands in a readable
// file. Payload is encrypted with the OS keystore when available (DPAPI on
// Windows), otherwise base64 plaintext as a last-resort fallback.
const CREDENTIALS_FILENAME = 'credentials.json';

interface StoredCredentials {
  secure: boolean;
  // base64 of safeStorage ciphertext (secure) or base64 of the utf-8 JSON
  // (plaintext fallback). The flag selects how to decode.
  data: string;
}

interface CredentialsCache {
  credentials: GoogleCredentials | null;
  secure: boolean;
}

// undefined = not yet read from disk; a value (with credentials possibly null)
// = the disk state is known and cached.
let cache: CredentialsCache | undefined;

function credentialsPath(): string {
  return resolve(app.getPath('userData'), CREDENTIALS_FILENAME);
}

function readFromDisk(): CredentialsCache {
  try {
    const stored = JSON.parse(readFileSync(credentialsPath(), 'utf-8')) as StoredCredentials;
    const buffer = Buffer.from(stored.data, 'base64');
    const json = stored.secure
      ? safeStorage.decryptString(buffer)
      : buffer.toString('utf-8');
    return { credentials: JSON.parse(json) as GoogleCredentials, secure: stored.secure };
  } catch {
    return { credentials: null, secure: safeStorage.isEncryptionAvailable() };
  }
}

function getCache(): CredentialsCache {
  if (cache === undefined) {
    cache = readFromDisk();
  }
  return cache;
}

function statusFrom(cached: CredentialsCache): CredentialsStatus {
  const { credentials, secure } = cached;
  return {
    configured: credentials !== null,
    secure,
    projectId: credentials?.projectId ?? '',
    clientEmail: credentials?.clientEmail ?? '',
    hasPrivateKey: (credentials?.privateKey.length ?? 0) > 0,
  };
}

// The actual secret, for the main-process STT transports only. Never expose this
// over IPC.
export function loadCredentials(): GoogleCredentials | null {
  return getCache().credentials;
}

export function getCredentialsStatus(): CredentialsStatus {
  return statusFrom(getCache());
}

// An empty privateKey on an already-configured store means "keep the stored key"
// so the renderer can edit project/email without re-pasting the secret. Throws on
// validation failure; the IPC layer surfaces it to the renderer.
export function setCredentials(input: GoogleCredentials): CredentialsStatus {
  const existing = loadCredentials();
  const privateKey =
    input.privateKey.trim().length > 0
      ? normalizePrivateKey(input.privateKey)
      : (existing?.privateKey ?? '');
  const credentials: GoogleCredentials = {
    projectId: input.projectId.trim(),
    clientEmail: input.clientEmail.trim(),
    privateKey,
  };

  const errors = validateCredentials(credentials);
  if (errors.length > 0) {
    throw new Error(errors.join(' '));
  }

  const secure = safeStorage.isEncryptionAvailable();
  const json = JSON.stringify(credentials);
  const data = secure
    ? safeStorage.encryptString(json).toString('base64')
    : Buffer.from(json, 'utf-8').toString('base64');
  const stored: StoredCredentials = { secure, data };
  writeFileSync(credentialsPath(), JSON.stringify(stored), 'utf-8');

  cache = { credentials, secure };
  return statusFrom(cache);
}

export function clearCredentials(): CredentialsStatus {
  void rm(credentialsPath(), { force: true }).catch((error) => {
    console.error('[credentials] failed to remove file:', error);
  });
  cache = { credentials: null, secure: safeStorage.isEncryptionAvailable() };
  return statusFrom(cache);
}
