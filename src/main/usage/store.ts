import { readFileSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { app } from 'electron';
import type { UsageSummary } from '../../shared/ipc-types.js';

const USAGE_FILENAME = 'usage.json';

// Recorded seconds keyed by calendar month (YYYY-MM); month granularity is all
// the summary needs and keeps the file small over time.
interface UsageData {
  months: Record<string, number>;
}

let cached: UsageData | null = null;

function usagePath(): string {
  return resolve(app.getPath('userData'), USAGE_FILENAME);
}

function load(): UsageData {
  try {
    const raw = readFileSync(usagePath(), 'utf-8');
    const parsed = JSON.parse(raw) as Partial<UsageData>;
    return { months: parsed.months ?? {} };
  } catch {
    return { months: {} };
  }
}

function getData(): UsageData {
  if (cached === null) {
    cached = load();
  }
  return cached;
}

function persist(): void {
  void writeFile(usagePath(), JSON.stringify(cached, null, 2), 'utf-8').catch((error) => {
    console.error('[usage] failed to persist:', error);
  });
}

function monthKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

export function addUsageSeconds(seconds: number): void {
  if (seconds <= 0) {
    return;
  }
  const data = getData();
  const key = monthKey(new Date());
  data.months[key] = (data.months[key] ?? 0) + seconds;
  persist();
}

export function getUsageSummary(): UsageSummary {
  const data = getData();
  const now = new Date();
  const thisKey = monthKey(now);
  // Day 1 of the previous month; the Date constructor normalizes month -1 across
  // the year boundary (January -> previous December).
  const lastKey = monthKey(new Date(now.getFullYear(), now.getMonth() - 1, 1));
  const totalSeconds = Object.values(data.months).reduce((sum, value) => sum + value, 0);
  return {
    totalMinutes: toMinutes(totalSeconds),
    thisMonthMinutes: toMinutes(data.months[thisKey] ?? 0),
    lastMonthMinutes: toMinutes(data.months[lastKey] ?? 0),
  };
}

// One-decimal minutes so short sessions stay visible instead of rounding to 0.
function toMinutes(seconds: number): number {
  return Math.round((seconds / 60) * 10) / 10;
}
