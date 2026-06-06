import { useEffect, useState } from 'react';
import type { SttStatus } from '../../shared/ipc-types';
import { DEFAULT_SETTINGS } from '../../shared/settings';
import { audioCapture, CaptureError } from './audio/capture';

type CaptureStatus = 'idle' | 'listening' | 'error';

export function App() {
  const [status, setStatus] = useState<CaptureStatus>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [interim, setInterim] = useState('');
  const [finalText, setFinalText] = useState('');
  const [sttStatus, setSttStatus] = useState<SttStatus>('idle');
  const [backgroundOpacity, setBackgroundOpacity] = useState(
    DEFAULT_SETTINGS.appearance.backgroundOpacity,
  );

  useEffect(() => {
    const unsubscribeResult = window.api.onSttResult((result) => {
      if (result.isFinal) {
        setFinalText(result.transcript);
        setInterim('');
      } else {
        setInterim(result.transcript);
      }
    });
    const unsubscribeStatus = window.api.onSttStatus(setSttStatus);
    void window.api
      .getSettings()
      .then((settings) => setBackgroundOpacity(settings.appearance.backgroundOpacity));
    const unsubscribeSettings = window.api.onSettingsChanged((settings) =>
      setBackgroundOpacity(settings.appearance.backgroundOpacity),
    );
    return () => {
      unsubscribeResult();
      unsubscribeStatus();
      unsubscribeSettings();
    };
  }, []);

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
        setInterim('');
        setFinalText('');
        setSttStatus('idle');
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
    <div className="flex h-screen w-screen flex-col overflow-hidden rounded-2xl border border-white/10 text-gray-200">
      <div className="flex items-center justify-between bg-[rgb(31,33,40)] px-3 py-2 [-webkit-app-region:drag]">
        <span className="text-[13px] font-semibold">Speech to Text</span>
        <div className="flex gap-1.5 [-webkit-app-region:no-drag]">
          <button
            type="button"
            className="h-[22px] w-[22px] rounded-md bg-white/10 text-sm leading-none hover:bg-white/20"
            onClick={() => window.api.openSettings()}
            aria-label="Settings"
          >
            ⚙
          </button>
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
      <main
        className="flex flex-1 flex-col items-center justify-center gap-3"
        style={{ backgroundColor: `rgba(24, 26, 32, ${backgroundOpacity})` }}
      >
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
        {status === 'listening' && sttStatus === 'reconnecting' && (
          <p className="px-4 text-center text-xs text-amber-400">Reconnecting…</p>
        )}
        {status === 'listening' && sttStatus === 'error' && (
          <p className="px-4 text-center text-xs text-red-400">Connection lost</p>
        )}
        {errorMessage && <p className="px-4 text-center text-xs text-red-400">{errorMessage}</p>}
        <div className="w-full px-4 text-center text-sm">
          {finalText && <p className="text-gray-100">{finalText}</p>}
          {interim && <p className="text-gray-500 italic">{interim}</p>}
        </div>
      </main>
    </div>
  );
}
