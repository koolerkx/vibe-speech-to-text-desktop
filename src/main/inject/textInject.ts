import { spawn } from 'node:child_process';
import { clipboard } from 'electron';

// Time for the foreground app to consume the paste before the clipboard is
// restored; restoring too early makes the target read the old content instead.
const PASTE_SETTLE_MS = 120;

// Separator appended after each injected final so consecutive utterances do not
// run together; owned here so the injection output format lives in one place.
const FINAL_SEPARATOR = ' ';

// Gated by capture start/stop so finals that arrive (or are still queued) after
// the user stops do not paste into whatever window is now focused.
let active = false;

// Injections are serialized so concurrent finals never race on the shared
// system clipboard (backup of one would capture the in-flight text of another).
let queue: Promise<void> = Promise.resolve();

export function setActive(value: boolean): void {
  active = value;
}

export function inject(text: string): void {
  if (!active || !text) {
    return;
  }
  queue = queue
    .then(() => injectOnce(text + FINAL_SEPARATOR))
    .catch((error) => {
      console.error('[textInject] inject failed:', error);
    });
}

async function injectOnce(text: string): Promise<void> {
  if (!active) {
    return;
  }
  const backup = clipboard.readText();
  clipboard.writeText(text);
  try {
    await sendPaste();
  } finally {
    clipboard.writeText(backup);
  }
}

function sendPaste(): Promise<void> {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(
      'powershell.exe',
      [
        '-NoProfile',
        '-NonInteractive',
        '-Command',
        `Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.SendKeys]::SendWait('^v'); Start-Sleep -Milliseconds ${PASTE_SETTLE_MS}`,
      ],
      { windowsHide: true },
    );
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) {
        resolvePromise();
      } else {
        reject(new Error(`powershell exited with code ${code ?? 'null'}`));
      }
    });
  });
}
