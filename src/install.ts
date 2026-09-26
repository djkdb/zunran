// 홈 화면에 설치하기.
//
// 매니페스트와 서비스워커는 이미 있는데 설치를 권하는 자리가 없었다. 그래서
// 브라우저 메뉴를 아는 사람만 앱으로 쓸 수 있었다 — 인스타에서 링크로 들어온
// 사람은 매번 주소창이 있는 브라우저에서 연다.
//
// 안드로이드/크롬은 beforeinstallprompt 를 잡아 두었다가 원할 때 띄울 수 있다.
// iOS 사파리에는 그런 API 가 없다. 방법을 알려주는 것 말고 할 수 있는 게 없다.
export type InstallKind = 'ready' | 'ios' | 'installed' | 'none';

type PromptEvent = Event & { prompt(): Promise<void>; userChoice: Promise<{ outcome: string }> };

let deferred: PromptEvent | null = null;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((f) => f());

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault(); // 브라우저 기본 배너 대신 우리가 원하는 자리에서 띄운다
    deferred = e as PromptEvent;
    notify();
  });
  window.addEventListener('appinstalled', () => {
    deferred = null;
    notify();
  });
}

export function onInstallChange(f: () => void): () => void {
  listeners.add(f);
  return () => listeners.delete(f);
}

/** 이미 홈 화면에서 실행 중인가 (주소창이 없는 상태). */
export function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  const iosStandalone = (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
  return iosStandalone || window.matchMedia?.('(display-mode: standalone)').matches === true;
}

function isIosSafari(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent;
  const ios = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  if (!ios) return false;
  // 인앱 브라우저(인스타·카톡 등)에서는 '홈 화면에 추가'가 아예 없다.
  // 안내해 봐야 그 메뉴가 없으니 말하지 않는다.
  return !/FBAN|FBAV|Instagram|KAKAOTALK|Line|NAVER|DaumApps/i.test(ua);
}

export function installKind(): InstallKind {
  if (isStandalone()) return 'installed';
  if (deferred) return 'ready';
  if (isIosSafari()) return 'ios';
  return 'none';
}

/** 안드로이드/크롬에서 설치 창을 띄운다. 받아들였으면 true. */
export async function promptInstall(): Promise<boolean> {
  const e = deferred;
  if (!e) return false;
  deferred = null;
  notify();
  try {
    await e.prompt();
    const { outcome } = await e.userChoice;
    return outcome === 'accepted';
  } catch {
    return false;
  }
}
