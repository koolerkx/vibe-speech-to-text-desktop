import { useState } from 'react';
import { audioCapture, CaptureError } from './audio/capture';

type CaptureStatus = 'idle' | 'listening' | 'error';

export function App() {
  const [status, setStatus] = useState<CaptureStatus>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const toggleCapture = async () => {
    if (busy) {
      return;
    }
    setBusy(true);
    try {
      if (status === 'listening') {
        await audioCapture.stop();
        setStatus('idle');
      } else {
        setErrorMessage(null);
        await audioCapture.start();
        setStatus('listening');
      }
    } catch (error) {
      setStatus('error');
      setErrorMessage(error instanceof CaptureError ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden rounded-2xl border border-white/10 bg-[rgba(24,26,32,0.92)] text-gray-200">
      <div className="flex items-center justify-between bg-white/[0.04] px-3 py-2 [-webkit-app-region:drag]">
        <span className="text-[13px] font-semibold">Speech to Text</span>
        <div className="flex gap-1.5 [-webkit-app-region:no-drag]">
          <button
            type="button"
            className="h-[22px] w-[22px] rounded-md bg-white/10 text-sm leading-none hover:bg-white/20"
            onClick={() => window.api.hideWindow()}
            aria-label="Hide"
          >
            –
          </button>
          <button
            type="button"
            className="h-[22px] w-[22px] rounded-md bg-white/10 text-sm leading-none hover:bg-white/20"
            onClick={() => window.api.quitApp()}
            aria-label="Quit"
          >
            ×
          </button>
        </div>
      </div>
      <main className="flex flex-1 flex-col items-center justify-center gap-3">
        <p className="text-xl font-semibold">
          {status === 'listening' ? 'Listening' : status === 'error' ? 'Error' : 'Idle'}
        </p>
        <button
          type="button"
          className="rounded-lg bg-blue-500 px-4 py-1.5 text-sm font-medium text-white hover:bg-blue-400 disabled:opacity-50"
          onClick={toggleCapture}
          disabled={busy}
        >
          {status === 'listening' ? 'Stop' : 'Listen'}
        </button>
        {errorMessage && <p className="px-4 text-center text-xs text-red-400">{errorMessage}</p>}
      </main>
    </div>
  );
}
