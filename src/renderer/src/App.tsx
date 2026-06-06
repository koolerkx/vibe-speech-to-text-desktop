import { useEffect, useRef, useState } from 'react';
import { ChevronDown, ChevronUp, Circle, Mic, Minus, Settings, Square, X } from 'lucide-react';
import type { SttStatus } from '../../shared/ipc-types';
import { DEFAULT_SETTINGS, MAIN_LANGUAGE_OPTIONS } from '../../shared/settings';
import { audioCapture, CaptureError } from './audio/capture';
import { Select } from './components/Select';

type CaptureStatus = 'idle' | 'listening' | 'error';

// Lower field content: an interim preview (gray) or, once confirmed, the final
// text (white) that lingers until the next input overwrites it.
interface CurrentText {
  text: string;
  isFinal: boolean;
}

const TOP_BAR_BUTTON =
  'flex h-[22px] w-[22px] items-center justify-center rounded-md bg-white/10 hover:bg-white/20 disabled:opacity-50';

function formatElapsed(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

// The Listen button itself conveys the capture state, so its colour encodes the
// stt connection status while listening.
function listenIconColor(status: CaptureStatus, sttStatus: SttStatus): string {
  if (status !== 'listening') {
    return 'text-red-500';
  }
  if (sttStatus === 'reconnecting') {
    return 'text-amber-400';
  }
  if (sttStatus === 'error') {
    return 'text-red-500';
  }
  return 'text-blue-400';
}

export function App() {
  const [status, setStatus] = useState<CaptureStatus>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [current, setCurrent] = useState<CurrentText>({ text: '', isFinal: false });
  const [history, setHistory] = useState<string[]>([]);
  const [sttStatus, setSttStatus] = useState<SttStatus>('idle');
  const [backgroundOpacity, setBackgroundOpacity] = useState(
    DEFAULT_SETTINGS.appearance.backgroundOpacity,
  );
  const [languageCode, setLanguageCode] = useState(DEFAULT_SETTINGS.model.languageCode);
  const [collapsed, setCollapsed] = useState(false);
  const [elapsedMs, setElapsedMs] = useState(0);
  const historyEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const unsubscribeResult = window.api.onSttResult((result) => {
      if (result.isFinal) {
        setHistory((prev) => [...prev, result.transcript]);
        setCurrent({ text: result.transcript, isFinal: true });
      } else {
        setCurrent({ text: result.transcript, isFinal: false });
      }
    });
    const unsubscribeStatus = window.api.onSttStatus(setSttStatus);
    void window.api.getSettings().then((settings) => {
      setBackgroundOpacity(settings.appearance.backgroundOpacity);
      setLanguageCode(settings.model.languageCode);
    });
    const unsubscribeSettings = window.api.onSettingsChanged((settings) => {
      setBackgroundOpacity(settings.appearance.backgroundOpacity);
      setLanguageCode(settings.model.languageCode);
    });
    return () => {
      unsubscribeResult();
      unsubscribeStatus();
      unsubscribeSettings();
    };
  }, []);

  useEffect(() => {
    historyEndRef.current?.scrollIntoView({ block: 'end' });
  }, [history]);

  // Session timer: reset and tick while listening, freeze on stop.
  useEffect(() => {
    if (status !== 'listening') {
      return;
    }
    const startedAt = Date.now();
    setElapsedMs(0);
    const intervalId = setInterval(() => setElapsedMs(Date.now() - startedAt), 250);
    return () => clearInterval(intervalId);
  }, [status]);

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
        setCurrent({ text: '', isFinal: false });
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

  const toggleCollapsed = () => {
    const next = !collapsed;
    setCollapsed(next);
    window.api.setCollapsed(next);
  };

  const changeLanguage = (code: string) => {
    setLanguageCode(code);
    void window.api.updateSettings({ model: { languageCode: code } });
  };

  const showTranscriptMenu = async () => {
    const selected = (window.getSelection()?.toString() ?? '').trim();
    const action = await window.api.showTranscriptMenu({ selected, all: history.join('\n') });
    if (action === 'clear') {
      setHistory([]);
      setCurrent({ text: '', isFinal: false });
    }
  };

  const listening = status === 'listening';
  const iconColor = listenIconColor(status, sttStatus);
  const captureLabel = listening ? 'Stop' : 'Record';

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden rounded-2xl border border-white/10 text-gray-200">
      <div
        className={`flex items-center gap-2 bg-[rgb(31,33,40)] px-3 py-2 [-webkit-app-region:drag] ${
          collapsed ? 'flex-1' : ''
        }`}
      >
        <button
          type="button"
          className={`${TOP_BAR_BUTTON} [-webkit-app-region:no-drag]`}
          onClick={toggleCapture}
          disabled={busy}
          aria-label={captureLabel}
        >
          {listening ? (
            <Square size={13} className={iconColor} fill="currentColor" />
          ) : (
            <Mic size={14} className={iconColor} />
          )}
        </button>
        <span className="flex-1 text-[13px] font-semibold">Speech to Text</span>
        <div className="flex gap-1.5 [-webkit-app-region:no-drag]">
          <button
            type="button"
            className={TOP_BAR_BUTTON}
            onClick={() => window.api.openSettings()}
            aria-label="Settings"
          >
            <Settings size={13} />
          </button>
          <button
            type="button"
            className={TOP_BAR_BUTTON}
            onClick={toggleCollapsed}
            aria-label={collapsed ? 'Expand' : 'Collapse'}
          >
            {collapsed ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
          <button
            type="button"
            className={TOP_BAR_BUTTON}
            onClick={() => window.api.hideWindow()}
            aria-label="Hide"
          >
            <Minus size={14} />
          </button>
          <button
            type="button"
            className={TOP_BAR_BUTTON}
            onClick={() => window.api.quitApp()}
            aria-label="Quit"
          >
            <X size={14} />
          </button>
        </div>
      </div>
      {!collapsed && (
        <main
          className="flex flex-1 flex-col gap-3 p-3"
          style={{ backgroundColor: `rgba(24, 26, 32, ${backgroundOpacity})` }}
        >
          <div className="flex items-center gap-3">
            <button
              type="button"
              className="flex h-12 w-12 items-center justify-center rounded-full bg-white/10 hover:bg-white/20 disabled:opacity-50"
              onClick={toggleCapture}
              disabled={busy}
              aria-label={captureLabel}
            >
              {listening ? (
                <Square size={24} className={iconColor} fill="currentColor" />
              ) : (
                <Circle size={24} className={iconColor} fill="currentColor" />
              )}
            </button>
            <Select value={languageCode} onChange={changeLanguage} options={MAIN_LANGUAGE_OPTIONS} />
            <span
              className={`ml-auto font-mono text-sm tabular-nums ${
                listening ? 'text-red-400' : 'text-gray-400'
              }`}
            >
              {formatElapsed(elapsedMs)}
            </span>
          </div>
          {errorMessage && <p className="text-xs text-red-400">{errorMessage}</p>}
          <div
            className="flex flex-1 flex-col overflow-hidden rounded-lg bg-black/20 text-sm selection:bg-blue-500/40"
            onContextMenu={(event) => {
              event.preventDefault();
              void showTranscriptMenu();
            }}
          >
            <div className="flex-1 cursor-text select-text overflow-y-auto p-2">
              {history.length === 0 ? (
                <p className="text-gray-500 italic">No transcription yet</p>
              ) : (
                history.map((line, index) => (
                  <p key={index} className="text-gray-100">
                    {line}
                  </p>
                ))
              )}
              <div ref={historyEndRef} />
            </div>
            <div className="min-h-[3.25rem] shrink-0 cursor-text select-text border-t border-white/10 p-2">
              <p className={current.isFinal ? 'text-gray-100' : 'text-gray-500 italic'}>
                {current.text}
              </p>
            </div>
          </div>
        </main>
      )}
    </div>
  );
}
