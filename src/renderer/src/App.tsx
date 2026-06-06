import { type MouseEvent, useEffect, useRef, useState } from 'react';
import { ChevronDown, ChevronUp, Circle, Mic, Minus, Settings, Square, X } from 'lucide-react';
import type { SttStatus, WordConfidence } from '../../shared/ipc-types';
import { DEFAULT_SETTINGS, MAIN_LANGUAGE_OPTIONS } from '../../shared/settings';
import { audioCapture, CaptureError } from './audio/capture';
import { Select } from './components/Select';

type CaptureStatus = 'idle' | 'listening' | 'error';

// Lower field content: an interim preview (gray) or, once confirmed, the final
// text (white) that lingers until the next input overwrites it.
interface CurrentText {
  text: string;
  isFinal: boolean;
  words?: WordConfidence[];
}

// Viewport-anchored tooltip: position: fixed escapes the overflow-hidden
// transcription block that would otherwise clip an absolutely-positioned child.
interface WordTooltip {
  text: string;
  x: number;
  y: number;
}

// Some models prefix each token with the SentencePiece word-boundary marker
// (U+2581) to signal a preceding space; it must be stripped before display.
const WORD_BOUNDARY_MARKER = '▁';

function cleanWord(raw: string): string {
  return raw.startsWith(WORD_BOUNDARY_MARKER) ? raw.slice(WORD_BOUNDARY_MARKER.length) : raw;
}

function isCjk(char: string): boolean {
  return /[぀-ヿ㐀-鿿豈-﫿]/.test(char);
}

// CJK / kana characters set tight; otherwise honour the model's boundary marker
// so Latin words split into sub-tokens (e.g. "st" + "ream") rejoin correctly.
function separatorBetween(previousRaw: string, nextRaw: string): string {
  const previous = cleanWord(previousRaw);
  const next = cleanWord(nextRaw);
  if (previous === '' || next === '') {
    return '';
  }
  if (isCjk(previous.slice(-1)) || isCjk(next.slice(0, 1))) {
    return '';
  }
  return nextRaw.startsWith(WORD_BOUNDARY_MARKER) ? ' ' : '';
}

// Lerp from red (low confidence) to white (high); high-confidence words read as
// plain white, lower ones fade toward red. Below LOW_CONFIDENCE stays full red.
const LOW_CONFIDENCE = 0.5;

function confidenceColor(confidence: number): string {
  const clamped = Math.max(0, Math.min(1, confidence));
  const t = clamped <= LOW_CONFIDENCE ? 0 : (clamped - LOW_CONFIDENCE) / (1 - LOW_CONFIDENCE);
  const channel = (low: number) => Math.round(low + (255 - low) * t);
  return `rgb(${channel(248)}, ${channel(113)}, ${channel(113)})`;
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
  const [tooltip, setTooltip] = useState<WordTooltip | null>(null);
  const historyEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const unsubscribeResult = window.api.onSttResult((result) => {
      if (result.isFinal) {
        setHistory((prev) => [...prev, result.transcript]);
        setCurrent({ text: result.transcript, isFinal: true, words: result.words });
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

  // A new confirmed line reuses span DOM nodes by index key, so a tooltip shown
  // for the previous line's word never receives mouseleave; dismiss it on change.
  useEffect(() => {
    setTooltip(null);
  }, [current]);

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

  const showWordTooltip = (event: MouseEvent<HTMLSpanElement>, entry: WordConfidence) => {
    const rect = event.currentTarget.getBoundingClientRect();
    setTooltip({
      text: `${cleanWord(entry.word)}:${entry.confidence.toFixed(3)}`,
      x: rect.left + rect.width / 2,
      y: rect.top - 6,
    });
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
              {current.isFinal && current.words && current.words.length > 0 ? (
                <p className="text-gray-100">
                  {current.words.map((entry, index) => (
                    <span
                      key={index}
                      style={{ color: confidenceColor(entry.confidence) }}
                      onMouseEnter={(event) => showWordTooltip(event, entry)}
                      onMouseLeave={() => setTooltip(null)}
                    >
                      {index > 0
                        ? separatorBetween(current.words![index - 1].word, entry.word)
                        : ''}
                      {cleanWord(entry.word)}
                    </span>
                  ))}
                </p>
              ) : (
                <p className={current.isFinal ? 'text-gray-100' : 'text-gray-500 italic'}>
                  {current.text}
                </p>
              )}
            </div>
          </div>
        </main>
      )}
      {tooltip && (
        <div
          className="pointer-events-none fixed z-50 -translate-x-1/2 -translate-y-full rounded bg-black/90 px-1.5 py-0.5 font-mono text-xs whitespace-nowrap text-gray-100 shadow-lg"
          style={{ left: tooltip.x, top: tooltip.y }}
        >
          {tooltip.text}
        </div>
      )}
    </div>
  );
}
