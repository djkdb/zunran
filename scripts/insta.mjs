// 인스타그램에서 들어온 사람.
//
// 베타 10명(9차)은 "앱을 켠 사람"이었다. 인스타 유입은 조건이 다르다.
//   - 인앱 브라우저다. 위아래를 인스타 UI 가 먹어서 화면이 더 짧다.
//   - 링크를 눌러 바로 떨어진다. 홈 화면 아이콘도, 기대도 없다.
//   - 릴스에서 본 쿠폰 코드를 손에 들고 오는 경우가 있다.
//
// 실행: CHROME_PATH=... node scripts/insta.mjs [시나리오]
import { chromium } from 'playwright';

const URL = process.env.GAME_URL ?? 'http://127.0.0.1:4190/';
// 인스타 인앱 브라우저: 위 헤더 ~52px + 아래 툴바 ~44px 를 인스타가 먹는다.
const IG_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 334.0.0.0.0 (iPhone14,3; iOS 17_5; ko_KR; ko; scale=3.00; 1179x2556; 610000000)';
const IG_VIEWPORT = { width: 390, height: 748 };

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function openIG(browser, { fresh = true, query = '' } = {}) {
  const ctx = await browser.newContext({
    userAgent: IG_UA,
    viewport: IG_VIEWPORT,
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
    locale: 'ko-KR',
  });
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', (e) => errs.push('예외: ' + e.message));
  p.on('console', (m) => { if (m.type() === 'error' && !/favicon|404/.test(m.text())) errs.push(m.text()); });
  await p.goto(URL + query, { waitUntil: 'networkidle' });
  if (fresh) {
    await p.evaluate(async () => {
      for (const r of (await navigator.serviceWorker?.getRegistrations?.()) ?? []) await r.unregister();
      for (const k of await caches.keys()) await caches.delete(k);
      localStorage.clear();
    });
    await p.goto(URL + query, { waitUntil: 'networkidle' });
  }
  await sleep(900);
  return { ctx, p, errs };
}

// 화면에 지금 보이는 버튼들 (스크롤 없이 손이 닿는 것만 따로 표시)
const visibleButtons = (p) =>
  p.evaluate(() => {
    const vh = window.innerHeight;
    return [...document.querySelectorAll('button')]
      .filter((b) => b.offsetParent !== null)
      .map((b) => {
        const r = b.getBoundingClientRect();
        return {
          t: (b.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 24),
          y: Math.round(r.y),
          h: Math.round(r.height),
          onScreen: r.y >= 0 && r.bottom <= vh,
        };
      });
  });

const tapText = async (p, re) => {
  const bs = await p.$$('button');
  for (const b of bs) {
    const t = ((await b.textContent()) ?? '').replace(/\s+/g, ' ').trim();
    if (re.test(t) && (await b.isVisible())) {
      await b.click({ timeout: 2000 }).catch(() => {});
      return t.slice(0, 20);
    }
  }
  return null;
};

const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH });

// ───────── 시나리오 1: 릴스에서 쿠폰 코드를 보고 들어왔다 ─────────
{
  console.log('═══ 시나리오 1 · 릴스에서 「NIGHT」 코드를 보고 들어온 사람 ═══\n');
  const { ctx, p, errs } = await openIG(browser);
  const t0 = Date.now();
  let taps = 0;
  const trail = [];

  // 코드를 넣을 곳을 찾는다. 첫 화면에서 '쿠폰' 이 보이는가?
  const first = await visibleButtons(p);
  const couponOnHome = first.find((b) => /쿠폰/.test(b.t));
  console.log('첫 화면에서 「쿠폰」이 보이는가 :', couponOnHome ? `예 (y=${couponOnHome.y})` : '아니오');
  console.log('첫 화면 버튼 :', first.filter((b) => b.onScreen).map((b) => b.t).filter(Boolean).slice(0, 12).join(' | '));

  // 사람은 탭바를 하나씩 눌러 본다
  const TABS = ['시작', '강화', '랭킹', '도감', '업적', '기록'];
  let found = null;
  for (let i = 1; i <= 6 && !found; i++) {
    await p.click(`.tabs button:nth-child(${i})`, { timeout: 2000 }).catch(() => {});
    taps++;
    await sleep(600);
    const bs = await visibleButtons(p);
    const c = bs.find((b) => /쿠폰/.test(b.t));
    trail.push(`${TABS[i - 1]}${c ? ' ← 여기 있다' : ''}`);
    if (c) found = { tab: TABS[i - 1], y: c.y, onScreen: c.onScreen };
  }
  console.log('탭을 돌아본 순서 :', trail.join(' → '));
  if (found) {
    await tapText(p, /쿠폰/); taps++;
    await sleep(500);
    await p.fill('.coupon-input', 'NIGHT').catch(() => {});
    taps++;
    await p.click('.coupon-btn').catch(() => {});
    taps++;
    await sleep(600);
    const res = await p.$eval('.coupon-panel', (e) => e.textContent.replace(/\s+/g, ' ')).catch(() => '?');
    console.log(`쿠폰 입구 위치 : 「${found.tab}」 탭 · 화면 안 ${found.onScreen ? '예' : '아니오(스크롤 필요)'}`);
    console.log('결과 :', res.slice(0, 70));
  }
  console.log(`\n→ 코드 입력까지 ${taps}탭 · ${((Date.now() - t0) / 1000).toFixed(1)}초`);
  console.log('→ 콘솔 에러 :', errs.length ? errs.slice(0, 2) : '없음');
  await p.screenshot({ path: '/tmp/ig1.png' });
  await ctx.close();
}

// ───────── 시나리오 1-b: 링크가 코드를 싣고 온다 (?c=NIGHT) ─────────
{
  console.log('\n═══ 시나리오 1-b · 릴스 링크에 코드가 실려 있다 (?c=NIGHT) ═══\n');
  const { ctx, p, errs } = await openIG(browser, { query: '?utm_source=instagram&c=night' });
  const t0 = Date.now();
  const open = await p.$('.coupon-panel');
  console.log('들어오자마자 쿠폰함이 열려 있는가 :', open ? '예' : '아니오');
  const filled = await p.$eval('.coupon-input', (e) => e.value).catch(() => null);
  console.log('코드가 채워져 있는가 :', filled ? `예 ("${filled}")` : '아니오');
  console.log('주소가 정리됐는가 :', await p.evaluate(() => window.location.search === '' ? '예' : '아니오 (' + window.location.search + ')'));
  await p.screenshot({ path: '/tmp/ig1b.png' });
  await p.click('.coupon-btn').catch(() => {});
  await sleep(600);
  const res = await p.$eval('.coupon-panel', (e) => e.textContent.replace(/\s+/g, ' ')).catch(() => '?');
  console.log('한 번 누른 결과 :', res.slice(0, 70));
  console.log(`\n→ 코드 입력까지 1탭 · ${((Date.now() - t0) / 1000).toFixed(1)}초`);
  // 새로고침해도 다시 안 뜨는가
  await p.reload({ waitUntil: 'networkidle' });
  await sleep(800);
  console.log('새로고침 후 다시 뜨는가 :', (await p.$('.coupon-panel')) ? '예 (문제)' : '아니오 (정상)');
  console.log('→ 콘솔 에러 :', errs.length ? errs.slice(0, 2) : '없음');
  await ctx.close();
}

await browser.close();
