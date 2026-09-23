import { Engine } from '../engine/Engine';
import { readStored, writeStored } from '../../platform/storage';
export const RUN_KEY = 'zunran:run:v1';
function settled(id: string): boolean {
  try { return JSON.parse(readStored('cvs-night-shift:v1') ?? '{}').lastSettledRunId === id; }
  catch { return false; }
}
export function saveRun(engine: Engine): void {
  if (!settled(engine.runId)) void writeStored(RUN_KEY, engine.checkpoint());
}
export function clearRun(): void { writeStored(RUN_KEY, null); }
export function loadRun(): { raw: string; engine: Engine } | null {
  try {
    const raw = readStored(RUN_KEY);
    if (!raw) return null;
    const engine = Engine.restore(raw);
    if (engine && !settled(engine.runId)) return { raw, engine };
    clearRun();
  } catch { /* Unavailable storage does not prevent a new run. */ }
  return null;
}
