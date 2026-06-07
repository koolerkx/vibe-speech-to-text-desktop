// Google service-account fields required to authenticate the @google-cloud/speech
// client. The full key.json carries more, but SpeechClient only needs these three
// (client_email + private_key via the `credentials` option, project_id for the v2
// recognizer path). Stored encrypted by the main process, never bundled in the app.
export interface GoogleCredentials {
  projectId: string;
  clientEmail: string;
  privateKey: string;
}

// Non-secret view sent to the renderer. privateKey is never returned to the
// renderer; hasPrivateKey only reports whether one is stored.
export interface CredentialsStatus {
  configured: boolean;
  // true when stored via the OS keystore (safeStorage / DPAPI); false when the
  // platform reports encryption unavailable and a plaintext fallback was used.
  secure: boolean;
  projectId: string;
  clientEmail: string;
  hasPrivateKey: boolean;
}

// Maps a parsed key.json (snake_case service-account file) onto GoogleCredentials.
// Missing fields come back as empty strings so the caller can surface them through
// validateCredentials rather than throwing on a partial file.
export function parseServiceAccountJson(raw: string): GoogleCredentials {
  const json = JSON.parse(raw) as Record<string, unknown>;
  const str = (value: unknown): string => (typeof value === 'string' ? value : '');
  return {
    projectId: str(json.project_id),
    clientEmail: str(json.client_email),
    privateKey: str(json.private_key),
  };
}

const EMAIL_PATTERN = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

// Boundary validation shared by the renderer (pre-submit feedback) and the main
// process (defense). Returns human-readable errors; empty array means valid.
export function validateCredentials(credentials: GoogleCredentials): string[] {
  const errors: string[] = [];
  if (credentials.projectId.trim().length === 0) {
    errors.push('Project ID is required.');
  }
  if (!EMAIL_PATTERN.test(credentials.clientEmail.trim())) {
    errors.push('Client email must be a valid service-account email.');
  }
  if (!credentials.privateKey.includes('BEGIN PRIVATE KEY')) {
    errors.push('Private key must be a PEM block containing BEGIN PRIVATE KEY.');
  }
  return errors;
}

// Service-account private keys copied out of a JSON string often arrive with
// literal "\n" escapes instead of real newlines; the PEM parser requires real
// newlines, so normalize before storing or using as a credential.
export function normalizePrivateKey(privateKey: string): string {
  return privateKey.replace(/\\n/g, '\n').trim();
}
