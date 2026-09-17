// 오프라인 캐시. 앱으로 감쌌을 때 비행기 모드에서도 켜져야 한다.
// 캐시 이름은 빌드마다 달라져야 한다 (scripts/pwa-plugin.ts 가 채운다).
const CACHE = 'zunran-__BUILD__';

// 설치 시점에 껍데기를 통째로 담는다. 폰트까지 넣어야 글꼴이 안 깨진다.
self.addEventListener('install', (e) => {
  e.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      try {
        const list = await (await fetch('./precache.json', { cache: 'no-store' })).json();
        await cache.addAll(list);
      } catch {
        await cache.addAll(['./', './index.html']); // 목록을 못 받아도 최소한은 담는다
      }
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    (async () => {
      for (const k of await caches.keys()) if (k !== CACHE) await caches.delete(k);
      await self.clients.claim();
    })(),
  );
});

// URL 하나로만 찾는다. Vary: Origin 같은 헤더가 붙으면 기본 match 는 캐시에 있는데도
// 미스가 난다 (addAll 로 담을 때와 브라우저가 실제로 보낼 때 Origin 이 다르다).
async function fromCache(request) {
  const cache = await caches.open(CACHE);
  return cache.match(request, { ignoreVary: true, ignoreSearch: false });
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;

  // 랭킹 API 는 캐시하지 않는다. 오프라인이면 api.ts 가 알아서 '연결 안 됨'으로 처리한다.
  if (url.pathname.startsWith('/api/')) return;

  // 문서는 네트워크 먼저(새 버전을 놓치지 않게), 실패하면 캐시.
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req)
        .then((res) => {
          caches.open(CACHE).then((c) => c.put('./index.html', res.clone()));
          return res;
        })
        .catch(async () => (await fromCache(new Request(new URL('./index.html', self.registration.scope).href))) ?? Response.error()),
    );
    return;
  }

  // 나머지(해시 붙은 에셋·폰트)는 캐시 먼저.
  e.respondWith(
    fromCache(req).then(
      (hit) =>
        hit ??
        fetch(req).then((res) => {
          if (res.ok && res.type === 'basic') caches.open(CACHE).then((c) => c.put(req, res.clone()));
          return res;
        }),
    ),
  );
});
