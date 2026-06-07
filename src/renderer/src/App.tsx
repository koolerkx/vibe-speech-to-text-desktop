import { type MouseEvent, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ChevronDown, ChevronUp, Circle, Mic, Minus, Settings, Square, X } from 'lucide-react';
import type { SttStatus, UsageSummary, WordConfidence } from '../../shared/ipc-types';
import {
  DEFAULT_SETTINGS,
  MODEL_PRESETS,
  modelPatchFromPreset,
  presetById,
  presetIdForModel,
  type VolumeMeterUnit,
} from '../../shared/settings';
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
// Stores the anchor geometry; final placement is clamped to the window after the
// tooltip's own size is measured, so it never spills past an edge.
interface WordTooltip {
  text: string;
  anchorCenterX: number;
  anchorTop: number;
  anchorBottom: number;
}

const TOOLTIP_MARGIN = 4;
const TOOLTIP_GAP = 6;

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

// App-wide status colour convention: red = active/in progress, amber = paused,
// gray = idle / not started.
function timerColor(status: CaptureStatus, sttStatus: SttStatus): string {
  if (status !== 'listening') {
    return 'text-gray-400';
  }
  return sttStatus === 'live' ? 'text-red-400' : 'text-amber-400';
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
  if (sttStatus === 'dormant') {
    return 'text-slate-400';
  }
  return 'text-blue-400';
}

// Volume meter display scale. INT16 RMS is 0–32767; speech rarely exceeds ~8000,
// so the linear meter saturates there to keep the useful range readable. The dB
// meter maps the same RMS to dBFS over a -60..0 window.
const METER_LINEAR_MAX = 8000;
const METER_DB_FLOOR = -60;
const INT16_FULL_SCALE = 32767;

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function toMeterFraction(rms: number, unit: VolumeMeterUnit): number {
  if (unit === 'db') {
    if (rms <= 0) {
      return 0;
    }
    const db = 20 * Math.log10(rms / INT16_FULL_SCALE);
    return clamp01((db - METER_DB_FLOOR) / -METER_DB_FLOOR);
  }
  return clamp01(rms / METER_LINEAR_MAX);
}

// The fill is the live RMS; the amber tick is the silence threshold. Both use the
// same scale as the VAD gate, so sliding the threshold in Settings lands the tick
// exactly where the gate cuts — tune by watching the fill cross the tick.
function VolumeMeter({
  rms,
  threshold,
  unit,
}: {
  rms: number;
  threshold: number;
  unit: VolumeMeterUnit;
}) {
  const fill = toMeterFraction(rms, unit);
  const mark = toMeterFraction(threshold, unit);
  const voiced = rms >= threshold;
  return (
    <div className="relative h-2 w-full overflow-hidden rounded-full bg-white/10">
      <div
        className={`h-full rounded-full transition-[width] duration-75 ${
          voiced ? 'bg-green-400' : 'bg-gray-500'
        }`}
        style={{ width: `${fill * 100}%` }}
      />
      <div
        className="absolute top-0 h-full w-0.5 bg-amber-300"
        style={{ left: `${mark * 100}%` }}
      />
    </div>
  );
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
  const [modelPresetId, setModelPresetId] = useState(presetIdForModel(DEFAULT_SETTINGS.model));
  const [volumeRms, setVolumeRms] = useState(0);
  const [volumeMeterUnit, setVolumeMeterUnit] = useState<VolumeMeterUnit>(
    DEFAULT_SETTINGS.appearance.volumeMeterUnit,
  );
  const [vadThreshold, setVadThreshold] = useState(DEFAULT_SETTINGS.vad.silenceThreshold);
  const [collapsed, setCollapsed] = useState(false);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [usage, setUsage] = useState<UsageSummary | null>(null);
  const [tooltip, setTooltip] = useState<WordTooltip | null>(null);
  const historyEndRef = useRef<HTMLDivElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  // Live time accumulated across stream segments; idle (dormant / reconnecting)
  // gaps are excluded so the timer reflects billed duration only.
  const liveAccumulatedRef = useRef(0);

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
    const unsubscribeLevel = window.api.onAudioLevel(setVolumeRms);
    const applySettings = (settings: Awaited<ReturnType<typeof window.api.getSettings>>) => {
      setBackgroundOpacity(settings.appearance.backgroundOpacity);
      setModelPresetId(presetIdForModel(settings.model));
      setVolumeMeterUnit(settings.appearance.volumeMeterUnit);
      setVadThreshold(settings.vad.silenceThreshold);
    };
    void window.api.getSettings().then(applySettings);
    const unsubscribeSettings = window.api.onSettingsChanged(applySettings);
    return () => {
      unsubscribeResult();
      unsubscribeStatus();
      unsubscribeLevel();
      unsubscribeSettings();
    };
  }, []);

  useEffect(() => {
    void window.api.getUsage().then(setUsage);
    return window.api.onUsageChanged(setUsage);
  }, []);

  // The floating window is a single-purpose overlay; Tab focus traversal between
  // its controls is not expected, so swallow Tab entirely.
  useEffect(() => {
    const swallowTab = (event: KeyboardEvent) => {
      if (event.key === 'Tab') {
        event.preventDefault();
      }
    };
    window.addEventListener('keydown', swallowTab);
    return () => window.removeEventListener('keydown', swallowTab);
  }, []);

  useEffect(() => {
    historyEndRef.current?.scrollIntoView({ block: 'end' });
  }, [history]);

  // Session timer: accumulate only while the stream is live, so dormant /
  // reconnecting / error gaps are excluded and the value tracks billed time.
  useEffect(() => {
    if (status !== 'listening' || sttStatus !== 'live') {
      return;
    }
    const segmentStart = Date.now();
    const intervalId = setInterval(
      () => setElapsedMs(liveAccumulatedRef.current + (Date.now() - segmentStart)),
      250,
    );
    return () => {
      clearInterval(intervalId);
      liveAccumulatedRef.current += Date.now() - segmentStart;
      setElapsedMs(liveAccumulatedRef.current);
    };
  }, [status, sttStatus]);

  // A new confirmed line reuses span DOM nodes by index key, so a tooltip shown
  // for the previous line's word never receives mouseleave; dismiss it on change.
  useEffect(() => {
    setTooltip(null);
  }, [current]);

  // Clamp the tooltip into the window once its size is known: keep it within the
  // horizontal edges, and flip it below the anchor when there is no room above.
  // useLayoutEffect positions it before paint so there is no visible jump.
  useLayoutEffect(() => {
    const element = tooltipRef.current;
    if (!element || !tooltip) {
      return;
    }
    const { width, height } = element.getBoundingClientRect();
    const left = Math.max(
      TOOLTIP_MARGIN,
      Math.min(tooltip.anchorCenterX - width / 2, window.innerWidth - width - TOOLTIP_MARGIN),
    );
    const above = tooltip.anchorTop - TOOLTIP_GAP - height;
    const top = above >= TOOLTIP_MARGIN ? above : tooltip.anchorBottom + TOOLTIP_GAP;
    element.style.left = `${left}px`;
    element.style.top = `${top}px`;
  }, [tooltip]);

  const toggleCapture = async () => {
    if (busy) {
      return;
    }
    setBusy(true);
    try {
      if (status === 'listening') {
        await audioCapture.stop();
        setStatus('idle');
        setVolumeRms(0);
      } else {
        setErrorMessage(null);
        setCurrent({ text: '', isFinal: false });
        setSttStatus('idle');
        setVolumeRms(0);
        liveAccumulatedRef.current = 0;
        setElapsedMs(0);
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

  const changeModelPreset = (id: string) => {
    const preset = presetById(id);
    if (!preset) {
      return;
    }
    setModelPresetId(id);
    void window.api.updateSettings({ model: modelPatchFromPreset(preset) });
  };

  const showTooltipAt = (event: MouseEvent<HTMLElement>, text: string) => {
    const rect = event.currentTarget.getBoundingClientRect();
    setTooltip({
      text,
      anchorCenterX: rect.left + rect.width / 2,
      anchorTop: rect.top,
      anchorBottom: rect.bottom,
    });
  };

  const showWordTooltip = (event: MouseEvent<HTMLSpanElement>, entry: WordConfidence) => {
    showTooltipAt(event, `${cleanWord(entry.word)}:${entry.confidence.toFixed(3)}`);
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
          className="flex min-h-0 flex-1 flex-col gap-3 p-3"
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
            <Select value={modelPresetId} onChange={changeModelPreset} options={MODEL_PRESETS} />
            <span
              onMouseEnter={(event) =>
                showTooltipAt(event, `This month: ${usage?.thisMonthMinutes ?? 0} min`)
              }
              onMouseLeave={() => setTooltip(null)}
              className={`ml-auto font-mono text-sm tabular-nums ${timerColor(status, sttStatus)}`}
            >
              {formatElapsed(elapsedMs)}
            </span>
          </div>
          {listening && <VolumeMeter rms={volumeRms} threshold={vadThreshold} unit={volumeMeterUnit} />}
          {errorMessage && <p className="text-xs text-red-400">{errorMessage}</p>}
          <div
            className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg bg-black/20 text-sm selection:bg-blue-500/40"
            onContextMenu={(event) => {
              event.preventDefault();
              void showTranscriptMenu();
            }}
          >
            <div className="min-h-0 flex-1 cursor-text select-text overflow-y-auto p-2">
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
          ref={tooltipRef}
          className="pointer-events-none fixed z-50 rounded bg-black/90 px-1.5 py-0.5 font-mono text-xs whitespace-nowrap text-gray-100 shadow-lg"
        >
          {tooltip.text}
        </div>
      )}
    </div>
  );
}
