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

// ───────── 시나리오 2: 인앱 브라우저는 화면이 짧다 ─────────
{
  console.log('\n═══ 시나리오 2 · 인앱 브라우저 화면 크기 ═══\n');
  // 인스타가 위 헤더/아래 툴바를 먹는다. 기기별로 남는 높이가 다르다.
  const SIZES = [
    { w: 390, h: 748, name: 'iPhone 14 (844 중 748)' },
    { w: 390, h: 640, name: '주소창 펼쳐진 상태' },
    { w: 360, h: 600, name: '작은 안드로이드' },
    { w: 430, h: 800, name: 'iPhone Pro Max' },
  ];
  for (const sz of SIZES) {
    const ctx = await browser.newContext({ userAgent: IG_UA, viewport: { width: sz.w, height: sz.h }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'ko-KR' });
    const p = await ctx.newPage();
    const errs = [];
    p.on('pageerror', (e) => errs.push(e.message));
    await p.goto(URL, { waitUntil: 'networkidle' });
    await p.evaluate(async () => { for (const r of (await navigator.serviceWorker?.getRegistrations?.()) ?? []) await r.unregister(); for (const k of await caches.keys()) await caches.delete(k); localStorage.clear(); });
    await p.goto(URL, { waitUntil: 'networkidle' });
    await sleep(900);
    // 홈: 가로 스크롤 / 탭바가 보이는가
    const home = await p.evaluate(() => ({
      hScroll: document.documentElement.scrollWidth > window.innerWidth + 1,
      tabs: (() => { const t = document.querySelector('.tabs'); if (!t) return null; const r = t.getBoundingClientRect(); return { bottom: Math.round(r.bottom), visible: r.bottom <= window.innerHeight + 1 }; })(),
      startBtn: (() => { const b = [...document.querySelectorAll('button')].find((x) => /야간 근무 시작/.test(x.textContent)); if (!b) return null; const r = b.getBoundingClientRect(); return { y: Math.round(r.y), onScreen: r.bottom <= window.innerHeight }; })(),
    }));
    // 판에 들어가서 매장/조작 패널 비율
    const click = async (re) => { const bs = await p.$$('button'); for (const b of bs) { const t = ((await b.textContent()) ?? '').trim(); if (re.test(t) && (await b.isVisible())) { await b.click({ timeout: 2000 }).catch(() => {}); await sleep(650); return true; } } return false; };
    await click(/야간 근무 시작/); await click(/건너뛰기/); await click(/국도변 시골점/); await click(/야간 근무 시작|근무 시작|출근/);
    const bs2 = await p.$$('button'); if (bs2[0]) { await bs2[0].click().catch(() => {}); await sleep(1100); }
    const game = await p.evaluate(() => {
      const f = document.querySelector('.field');
      const panel = document.querySelector('.panel');
      if (!f || !panel) return null;
      const fr = f.getBoundingClientRect(), pr = panel.getBoundingClientRect();
      const draw = [...document.querySelectorAll('button')].find((b) => /유닛 뽑기/.test(b.textContent));
      const dr = draw?.getBoundingClientRect();
      return {
        field: `${Math.round(fr.width)}×${Math.round(fr.height)}`,
        fieldPct: Math.round((fr.height / window.innerHeight) * 100),
        panelH: Math.round(pr.height),
        panelCut: Math.round(panel.scrollHeight - pr.height),
        drawVisible: dr ? dr.bottom <= window.innerHeight : null,
        hScroll: document.documentElement.scrollWidth > window.innerWidth + 1,
      };
    });
    console.log(`${sz.name.padEnd(24)} ${sz.w}×${sz.h}`);
    console.log(`   홈  탭바 ${home.tabs?.visible ? '보임' : '잘림!'} · 시작버튼 ${home.startBtn?.onScreen ? '보임' : '잘림!'} · 가로스크롤 ${home.hScroll ? '있음!' : '없음'}`);
    if (game) console.log(`   판  매장 ${game.field} (화면의 ${game.fieldPct}%) · 조작패널 ${game.panelH}px (넘치는 내용 ${game.panelCut}px) · 뽑기버튼 ${game.drawVisible ? '보임' : '잘림!'} · 가로스크롤 ${game.hScroll ? '있음!' : '없음'}`);
    else console.log('   판  진입 실패');
    if (errs.length) console.log('   에러:', errs.slice(0, 2));
    await p.screenshot({ path: `/tmp/ig2_${sz.w}x${sz.h}.png` });
    await ctx.close();
  }
}

// ───────── 시나리오 3: 릴스만 보고 링크를 눌렀다 · 첫 10초 ─────────
{
  console.log('\n═══ 시나리오 3 · 릴스만 보고 들어온 사람의 첫 10초 ═══\n');
  const { ctx, p, errs } = await openIG(browser);
  const t0 = Date.now();
  // 첫 화면에서 읽히는 것
  const first = await p.evaluate(() => {
    const vh = window.innerHeight;
    const texts = [];
    for (const el of document.querySelectorAll('.app-body *')) {
      if (el.children.length) continue;
      const t = (el.textContent ?? '').trim();
      if (!t) continue;
      const r = el.getBoundingClientRect();
      if (r.bottom <= vh && r.width > 0) texts.push({ t: t.slice(0, 30), y: Math.round(r.y), size: Math.round(parseFloat(getComputedStyle(el).fontSize)) });
    }
    return texts.sort((a, b) => a.y - b.y).slice(0, 14);
  });
  console.log('스크롤 없이 읽히는 것 (위에서부터):');
  for (const x of first) console.log(`   ${String(x.y).padStart(3)}px ${String(x.size).padStart(2)}pt  ${x.t}`);

  // 소리: 인스타에서 온 사람은 무음으로 본다. 첫 탭 전에 오디오가 막히는가?
  const audio = await p.evaluate(() => ({ state: (window.__game?.audio?.ctx?.state) ?? 'n/a' }));
  console.log('\n오디오 컨텍스트 :', audio.state);

  // 바로 시작 버튼을 눌렀을 때 판까지 몇 초인가
  const tapN = async (re) => { const bs = await p.$$('button'); for (const b of bs) { const t = ((await b.textContent()) ?? '').trim(); if (re.test(t) && (await b.isVisible())) { await b.click({ timeout: 2000 }).catch(() => {}); return true; } } return false; };
  let taps = 0;
  const marks = [];
  while (!(await p.$('.field-canvas')) && Date.now() - t0 < 60000) {
    const before = Date.now();
    const ok = (await tapN(/야간 근무 시작/)) || (await tapN(/건너뛰기/)) || (await tapN(/국도변|골목점|술집가/)) || (await tapN(/야간수당|신상|재고|포스기|진상|본사/));
    if (!ok) break;
    taps++;
    await sleep(700);
    const title = await p.$eval('.app-nav-title, .reward-title, .intro-line', (e) => e.textContent.trim()).catch(() => null);
    marks.push(`${taps}탭(${((Date.now() - t0) / 1000).toFixed(1)}s)${title ? ' · ' + title.slice(0, 14) : ''}`);
    if (Date.now() - before > 10000) break;
  }
  console.log('진입 경로 :', marks.join(' → '));
  console.log(`→ 게임 화면까지 ${taps}탭 · ${((Date.now() - t0) / 1000).toFixed(1)}초`);
  await p.screenshot({ path: '/tmp/ig3.png' });
  console.log('→ 콘솔 에러 :', errs.length ? errs.slice(0, 2) : '없음');
  await ctx.close();
}

// ───────── 시나리오 4: 인스타에서 또 들어왔다 (재방문) ─────────
{
  console.log('\n═══ 시나리오 4 · 며칠 뒤 인스타에서 또 눌렀다 ═══\n');
  const ctx = await browser.newContext({ userAgent: IG_UA, viewport: IG_VIEWPORT, deviceScaleFactor: 3, isMobile: true, hasTouch: true, locale: 'ko-KR' });
  const p = await ctx.newPage();
  await p.goto(URL, { waitUntil: 'networkidle' });
  await p.evaluate(async () => { for (const r of (await navigator.serviceWorker?.getRegistrations?.()) ?? []) await r.unregister(); for (const k of await caches.keys()) await caches.delete(k); localStorage.clear(); });
  await p.goto(URL, { waitUntil: 'networkidle' });
  await sleep(800);
  // 첫 방문에서 쿠폰 하나 쓰고 판 기록을 남긴다
  await p.goto(URL + '?c=NIGHT', { waitUntil: 'networkidle' });
  await sleep(700);
  await p.click('.coupon-btn').catch(() => {});
  await sleep(500);
  const saved = await p.evaluate(() => { const k = Object.keys(localStorage).find((x) => x.includes('cvs')); return k ? { key: k, bytes: localStorage.getItem(k).length } : null; });
  console.log('첫 방문 후 저장 :', saved ? `${saved.key} (${saved.bytes}바이트)` : '없음!');
  // 탭을 닫았다 다시 열었다고 치고 새 페이지로 같은 컨텍스트 재방문
  const p2 = await ctx.newPage();
  await p2.goto(URL, { waitUntil: 'networkidle' });
  await sleep(900);
  const again = await p2.evaluate(() => {
    const k = Object.keys(localStorage).find((x) => x.includes('cvs'));
    const s = k ? JSON.parse(localStorage.getItem(k)) : null;
    return s ? { pts: s.metaPoints, used: s.usedCoupons, plays: s.totalPlays, intro: s.introSeen } : null;
  });
  console.log('재방문 시 남아 있는 것 :', JSON.stringify(again));
  const introShown = await p2.$('.intro-line, .intro-scene');
  console.log('오프닝을 또 보여주는가 :', introShown ? '예' : '아니오');
  const couponReopen = await p2.$('.coupon-panel');
  console.log('쿠폰함이 또 열리는가 :', couponReopen ? '예 (문제)' : '아니오 (정상)');
  await p2.screenshot({ path: '/tmp/ig4.png' });
  await ctx.close();
}

await browser.close();
