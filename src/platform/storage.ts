import { Capacitor } from '@capacitor/core';
import { Preferences } from '@capacitor/preferences';

// Native reads finish before React mounts. Writes are ordered so an older checkpoint
// cannot overwrite a newer one or resurrect a cleared run.
const native = Capacitor.isNativePlatform();
const cache = new Map<string, string>();
let pending = Promise.resolve(true);
const KEYS = ['cvs-night-shift:v1', 'zunran:run:v1', 'zunran:study:v1'];
export async function initializeStorage(): Promise<void> {
  if (!native) return;
  for (const key of KEYS) {
    const { value } = await Preferences.get({ key });
    if (value !== null) cache.set(key, value);
  }
}
function reportFailure() {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event('zunran-storage-error'));
}
export function readStored(key: string): string | null {
  return native ? cache.get(key) ?? null : localStorage.getItem(key);
}
export function writeStored(key: string, value: string | null): Promise<boolean> {
  if (native) {
    if (value === null) cache.delete(key); else cache.set(key, value);
    pending = pending.then(async () => {
      if (value === null) await Preferences.remove({ key });
      else await Preferences.set({ key, value });
      return true;
    }).catch(() => { reportFailure(); return false; });
    return pending;
  } else {
    try {
      if (value === null) localStorage.removeItem(key); else localStorage.setItem(key, value);
      return Promise.resolve(true);
    } catch { reportFailure(); return Promise.resolve(false); }
  }
}
export async function flushStorage(): Promise<boolean> { return pending; }
