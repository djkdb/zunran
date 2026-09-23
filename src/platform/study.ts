import { readStored, writeStored } from './storage';
const KEY = 'zunran:study:v1';
export type StudyEvent = { type: 'open' | 'start' | 'resume' | 'play' | 'finish'; at: number; runId?: string };
export interface Study { version: 1; id: string; enrolledAt: number; events: StudyEvent[]; }
export function readStudy(): Study | null {
  try {
    const s = JSON.parse(readStored(KEY) ?? 'null') as Study | null;
    return s?.version === 1 && typeof s.id === 'string' && Number.isFinite(s.enrolledAt) && Array.isArray(s.events) ? s : null;
  } catch { return null; }
}
export function setStudyEnabled(enabled: boolean): void {
  writeStored(KEY, enabled ? JSON.stringify({ version: 1, id: globalThis.crypto?.randomUUID?.() ?? `study-${Date.now()}-${Math.random().toString(36).slice(2)}`, enrolledAt: Date.now(), events: [] }) : null);
  if (enabled) recordStudy('open');
}
export function recordStudy(type: StudyEvent['type'], runId?: string, at = Date.now()): void {
  const s = readStudy();
  if (!s) return;
  // Foreground noise is not a new session. Retention uses actual play, not opens.
  const last = [...s.events].reverse().find((e) => e.type === type && (type === 'open' || e.runId === runId));
  if (last && (type === 'start' || type === 'finish' || at - last.at < 30 * 60_000)) return;
  s.events.push({ type, at, ...(runId ? { runId } : {}) });
  s.events = s.events.slice(-2000);
  writeStored(KEY, JSON.stringify(s));
}
export function studySummary(s: Study, now = Date.now()) {
  const first = s.events.find((e) => e.type === 'play')?.at;
  const retention = (day: number) => {
    if (first === undefined || now < first + (day + 1) * 86400000) return '관찰 중';
    return s.events.some((e) => e.type === 'play' && e.at >= first + day * 86400000 && e.at < first + (day + 1) * 86400000) ? '재플레이' : '기록 없음';
  };
  return { starts: s.events.filter((e) => e.type === 'start').length, finishes: s.events.filter((e) => e.type === 'finish').length, d1: retention(1), d7: retention(7) };
}
