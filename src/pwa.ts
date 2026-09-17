// 서비스워커 등록. 실패해도 게임은 그대로 돌아간다 (사파리 프라이빗 모드 등).
export function registerSW(): void {
  if (!('serviceWorker' in navigator)) return;
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(new URL('sw.js', document.baseURI).href, { scope: './' }).catch(() => {
      // 등록 실패 = 오프라인 지원만 없는 것. 조용히 넘어간다.
    });
  });
}
