import { Capacitor } from '@capacitor/core';
import { App } from '@capacitor/app';

// Both Safari/PWA and native app transitions enter the same lifecycle path.
export function observeAppState(listener: (active: boolean) => void): () => void {
  const visibility = () => listener(!document.hidden);
  const pagehide = () => listener(false);
  document.addEventListener('visibilitychange', visibility);
  window.addEventListener('pagehide', pagehide);
  let disposed = false;
  let removeNative: (() => void) | undefined;
  if (Capacitor.isNativePlatform()) {
    void App.addListener('appStateChange', ({ isActive }) => listener(isActive)).then((handle) => {
      if (disposed) void handle.remove();
      else removeNative = () => { void handle.remove(); };
    });
  }
  return () => {
    disposed = true;
    removeNative?.();
    document.removeEventListener('visibilitychange', visibility);
    window.removeEventListener('pagehide', pagehide);
  };
}
