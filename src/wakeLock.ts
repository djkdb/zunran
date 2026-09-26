// 판이 도는 동안 화면이 꺼지지 않게 한다.
//
// 한 판이 5~7분인데 그 대부분은 손님이 걸어오는 걸 보는 시간이다. 손을 안
// 대는 구간이 길어서 기기가 화면을 어둡게 하거나 잠근다. 게임은 탭이 숨으면
// 자동 일시정지되므로 지지는 않지만, 깨워서 다시 눌러야 한다 — 앱으로 쓰기엔
// 그게 제일 거슬린다.
//
// Screen Wake Lock 은 아직 없는 브라우저가 있다(사파리 16.4 미만, 일부 웹뷰).
// 없으면 조용히 아무 일도 안 한다 — 게임은 그대로 돌아간다.
type Sentinel = { released: boolean; release(): Promise<void>; addEventListener(t: string, f: () => void): void };
type WakeLockNav = Navigator & { wakeLock?: { request(type: 'screen'): Promise<Sentinel> } };

let sentinel: Sentinel | null = null;
let wanted = false;

async function acquire(): Promise<void> {
  const nav = navigator as WakeLockNav;
  if (!wanted || !nav.wakeLock || sentinel) return;
  try {
    const s = await nav.wakeLock.request('screen');
    // 요청이 오가는 사이에 마음이 바뀌었으면 바로 놓는다.
    if (!wanted) {
      void s.release().catch(() => {});
      return;
    }
    sentinel = s;
    // 탭이 숨으면 브라우저가 알아서 풀어 버린다. 그때 참조를 비워 둬야
    // 돌아왔을 때 다시 잡을 수 있다.
    s.addEventListener('release', () => {
      if (sentinel === s) sentinel = null;
    });
  } catch {
    // 배터리 절약 모드 등으로 거절될 수 있다. 다음 기회에 다시 시도한다.
  }
}

/** 화면을 계속 켜 둔다. 여러 번 불러도 안전하다. */
export function keepScreenAwake(): void {
  wanted = true;
  void acquire();
}

/** 놓아 준다. 판이 끝나거나 화면을 벗어날 때. */
export function releaseScreen(): void {
  wanted = false;
  const s = sentinel;
  sentinel = null;
  if (s && !s.released) void s.release().catch(() => {});
}

// 다른 앱에 갔다 돌아오면 잠금이 풀려 있다. 다시 잡는다.
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) void acquire();
  });
}
