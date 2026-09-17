// 브라우저 플레이 봇. 실제 UI를 눌러서 한 판을 끝까지 한다.
// 헤드리스 시뮬레이터(scripts/audit.ts)가 못 보는 것 — UI 흐름, 버튼 가용성, 체감 —
// 을 잡기 위한 도구다. 실행: node scripts/playbot.mjs [판수] [라벨]
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'fs';

const RUNS = Number(process.argv[2] ?? 3);
const LABEL = process.argv[3] ?? 'run';
const OUT = process.env.PLAY_OUT ?? '/tmp/playbot/';
const URL = process.env.PLAY_URL ?? 'http://127.0.0.1:4173/';
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH });
const results = [];
const allErrs = [];

for (let run = 0; run < RUNS; run++) {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
  page.on('pageerror', (e) => allErrs.push('PAGEERROR ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/404/.test(m.text())) allErrs.push(m.text()); });

  await page.goto(URL, { waitUntil: 'networkidle' });
  await page.evaluate(async () => {
    for (const r of (await navigator.serviceWorker?.getRegistrations?.()) ?? []) await r.unregister();
    for (const k of await caches.keys()) await caches.delete(k);
    localStorage.clear();
  });
  await page.reload({ waitUntil: 'networkidle' });

  // 시작 → 오프닝 → 이름 → 근무 조건
  await page.getByRole('button', { name: /출근|시작/ }).first().click();
  await page.waitForTimeout(500);
  for (let i = 0; i < 24; i++) {
    const nick = page.locator('#nick-input');
    if ((await nick.count()) && (await nick.isVisible().catch(() => false))) {
      await nick.fill('점장봇');
      const save = page.locator('.nick-save');
      if ((await save.count()) && (await save.isEnabled().catch(() => false))) { await save.click(); await page.waitForTimeout(300); }
      const go = page.locator('.start-btn').last();
      if (await go.count()) await go.click();
      await page.waitForTimeout(700);
      break;
    }
    await page.locator('body').click({ position: { x: 195, y: 700 } }).catch(() => {});
    await page.waitForTimeout(380);
  }
  // 근무 조건: 판마다 다른 걸 고른다
  const conds = await page.locator('button').all();
  const usable = [];
  for (const c of conds) {
    const t = (await c.textContent()) ?? '';
    if (t.length > 8 && !/뒤로|메인|닫기|설정/.test(t)) usable.push({ c, t });
  }
  const pickIdx = run % Math.max(1, usable.length);
  const condName = (usable[pickIdx]?.t ?? '').split('×')[0].trim();
  await usable[pickIdx]?.c.click();
  await page.waitForSelector('.field-canvas', { timeout: 15000 });
  // 2배속으로 돌린다. 한 판이 7~8분이라 등속으로는 사이클 한 번에 25분이 걸린다.
  await page.evaluate(() => {
    const b = [...document.querySelectorAll('.field-controls button')].find((e) => /배속/.test(e.getAttribute('aria-label') ?? ''));
    b?.click();
  });
  await page.waitForTimeout(800);

  const read = () => page.evaluate(() => {
    const t = (s) => document.querySelector(s)?.textContent?.trim() ?? '';
    const n = (s) => +(t(s).replace(/[^0-9]/g, '') || 0);
    return {
      wave: n('.hud-wave-num'),
      hp: n('.hud-hp-num'),
      coins: n('.hud-coin'),
      drawCost: n('.draw-cost'),
      freeDraw: /무료/.test(t('.draw-cost')),
      emptySlots: +(t('.draw-slots').match(/SLOT (\d+)/)?.[1] ?? 0),
      theme: [...document.querySelectorAll('.theme-chip.now')].map((e) => e.textContent.trim())[0] ?? '',
      phase: document.querySelector('.reward-card') ? 'reward'
        : document.querySelector('.promote-card') ? 'promote'
        : document.querySelector('.event-choice') ? 'event' : 'playing',
      mergeables: document.querySelectorAll('.merge-btn').length,
      recipeReady: document.querySelectorAll('.recipe-btn.ready').length,
      canClean: !!document.querySelector('.clean-btn'),
      orderShort: [...document.querySelectorAll('.order-btn')].map((e) => {
        const c = e.querySelector('.order-cost')?.textContent?.trim() ?? '';
        return c.startsWith('−') ? -1 : 1;
      }),
      gameover: !!document.querySelector('.gameover-actions'),
    };
  });

  const hpByWave = [];
  const tierByWave = [];
  const events = [];
  let lastWave = 0;
  let drawsBlocked = 0;    // 칸이 없어서 못 뽑은 횟수
  let mergesDone = 0, sellsDone = 0, ordersDone = 0, recipesDone = 0, drawsDone = 0;
  let rewardPicks = [], promotePicks = 0, eventPicks = 0;
  let buildHeavy = 0, rewardCount = 0;

  for (let i = 0; i < 5000; i++) {
    const s = await read();
    if (s.gameover) break;

    if (s.phase === 'reward') {
      const cards = await page.evaluate(() => [...document.querySelectorAll('.reward-card')].map((e) => ({
        build: e.className.includes('kind-build'),
        name: e.querySelector('.reward-name')?.textContent?.trim() ?? '',
      })));
      rewardCount++;
      if (cards.every((c) => c.build)) buildHeavy++;
      // 사람 휴리스틱: 체력이 낮으면 회복, 아니면 build 우선, 없으면 첫 장
      const lowHp = s.hp < 45;
      let idx = lowHp ? cards.findIndex((c) => /복구|보험/.test(c.name)) : -1;
      if (idx < 0) idx = cards.findIndex((c) => c.build);
      if (idx < 0) idx = 0;
      rewardPicks.push(cards[idx].name);
      await page.locator('.reward-card').nth(idx).click();
      await page.waitForTimeout(160);
      continue;
    }
    if (s.phase === 'promote') {
      // 공격형을 우선한다 (사람이 흔히 하는 선택)
      const names = await page.evaluate(() => [...document.querySelectorAll('.promote-card')].map((e) => e.querySelector('.promote-name')?.textContent?.trim() ?? ''));
      const prefer = names.findIndex((nm) => /점장|사장님|전자레인지|포스기|로또|핫바|스캐너|커피/.test(nm));
      await page.locator('.promote-card').nth(prefer >= 0 ? prefer : 0).click();
      promotePicks++;
      await page.waitForTimeout(160);
      continue;
    }
    if (s.phase === 'event') {
      const opts = await page.evaluate(() => [...document.querySelectorAll('.event-choice')].map((e) => e.textContent.trim()));
      const lowHp = s.hp < 55;
      let idx = lowHp ? opts.findIndex((o) => /체력/.test(o)) : 0;
      if (idx < 0) idx = 0;
      eventPicks++;
      events.push(`w${s.wave}:${opts[idx].slice(0, 12)}`);
      await page.locator('.event-choice').nth(idx).click();
      await page.waitForTimeout(160);
      continue;
    }

    if (s.wave !== lastWave) {
      lastWave = s.wave;
      hpByWave.push(s.hp);
      const maxTier = await page.evaluate(() => Math.max(0, ...[...document.querySelectorAll('.tier-ticks')].map((e) => e.querySelectorAll('.tick.on, .tick-on, [data-on="1"]').length)));
      tierByWave.push(maxTier);
    }

    // 1) 합성이 최우선. 한 번에 다 한다 — 한 번에 하나씩 누르면 UI 왕복 때문에
    //    봇이 사람보다 훨씬 느리게 플레이하게 된다 (판당 합성 3.7회 vs 시뮬 16회).
    if (s.mergeables > 0) {
      const n = await page.evaluate(() => {
        const btns = [...document.querySelectorAll('.merge-btn')];
        btns.forEach((b) => b.click());
        return btns.length;
      });
      mergesDone += n;
      await page.waitForTimeout(60);
      continue;
    }
    // 2) 조합 완성
    if (s.recipeReady > 0) {
      const cta = page.locator('.recipe-btn.ready').first();
      if ((await cta.count()) && (await cta.isEnabled().catch(() => false))) { await cta.click().catch(() => {}); recipesDone++; await page.waitForTimeout(140); continue; }
    }
    // 3) 칸이 없으면 정리 (짝 없는 것 일괄 판매)
    if (s.emptySlots === 0) {
      const junk = page.locator('.clean-btn').first();
      if ((await junk.count()) && (await junk.isEnabled().catch(() => false))) { await junk.click().catch(() => {}); sellsDone++; await page.waitForTimeout(140); continue; }
      drawsBlocked++;
    }
    // 4) 살 수 있으면 발주 (에픽 > 희귀). 전설은 돈이 되면.
    if (s.emptySlots > 0) {
      const affordable = s.orderShort.map((v, k) => (v > 0 ? k : -1)).filter((k) => k >= 0);
      if (affordable.includes(2) && ordersDone < 2) {
        await page.locator('.order-btn.legendary').click().catch(() => {}); ordersDone++; await page.waitForTimeout(160); continue;
      }
      if (affordable.includes(1) && s.wave >= 8 && ordersDone < 4) {
        await page.locator('.order-btn.epic').click().catch(() => {}); ordersDone++; await page.waitForTimeout(160); continue;
      }
    }
    // 5) 뽑기 — 살 수 있는 만큼 연속으로
    const drew = await page.evaluate(() => {
      let n = 0;
      // 버튼의 disabled 는 10Hz 스냅샷으로만 갱신되므로 연타하면 실패한 클릭까지 세어진다.
      // 3회로 제한해서 과다 계수를 줄인다 (판당 뽑기 368회 같은 숫자가 나왔었다).
      for (let k = 0; k < 3; k++) {
        const b = document.querySelector('.draw-btn');
        if (!b || b.disabled || b.classList.contains('disabled')) break;
        b.click();
        n++;
      }
      return n;
    });
    drawsDone += drew;
    await page.waitForTimeout(drew > 0 ? 60 : 110);
  }

  await page.waitForTimeout(1200);
  const report = await page.evaluate(() => {
    const grab = (label) => {
      const lab = [...document.querySelectorAll('*')].find((e) => e.children.length === 0 && e.textContent.trim() === label);
      const sib = lab?.nextElementSibling ?? lab?.parentElement?.nextElementSibling;
      return (sib?.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, 40);
    };
    return {
      wave: grab('최고 웨이브'), time: grab('근무시간'), kills: grab('처리한 손님'),
      merges: grab('합성'), boss: grab('보스'), combo: grab('최고 콤보'),
      mvp: grab('오늘의 MVP'), cause: grab('패배 원인'), coins: grab('남은 코인'),
      topEnemy: grab('가장 많이 들어온 손님'), topDmg: grab('가장 큰 피해를 준 손님'),
    };
  });
  await page.screenshot({ path: `${OUT}${LABEL}-${run}-end.png` });
  results.push({ run, cond: condName, drawsDone, hpByWave, tierByWave, report, drawsBlocked, mergesDone, sellsDone, ordersDone, recipesDone, promotePicks, eventPicks, rewardCount, buildHeavy, rewardPicks, events });
  console.log(`[${LABEL} ${run}] ${condName} | ${report.wave}웨이브 ${report.time} | MVP ${report.mvp} | 패배 ${report.cause} | 뽑기 ${drawsDone} 합성 ${mergesDone} 발주 ${ordersDone} 조합 ${recipesDone} | 칸막힘 ${drawsBlocked}`);
  console.log(`      체력: ${hpByWave.join(' ')}`);
  console.log(`      최고티어: ${tierByWave.join(' ')}`);
  await page.close();
}

writeFileSync(`${OUT}${LABEL}.json`, JSON.stringify(results, null, 1));
// ── 집계 ──
const drops = [];
for (const r of results) for (let i = 1; i < r.hpByWave.length; i++) drops.push({ w: i + 1, d: r.hpByWave[i - 1] - r.hpByWave[i] });
const worst = drops.sort((a, b) => b.d - a.d).slice(0, 6);
console.log('\n── 집계 ──');
console.log('최대 한 웨이브 체력 손실 상위:', worst.map((x) => `w${x.w} -${x.d}`).join(' '));
console.log('3택이 전부 build 인 비율:', results.reduce((a, r) => a + r.buildHeavy, 0) + '/' + results.reduce((a, r) => a + r.rewardCount, 0));
console.log('판당 평균: 뽑기', (results.reduce((a, r) => a + r.drawsDone, 0) / results.length).toFixed(1), '· 합성', (results.reduce((a, r) => a + r.mergesDone, 0) / results.length).toFixed(1),
  '· 발주', (results.reduce((a, r) => a + r.ordersDone, 0) / results.length).toFixed(1),
  '· 조합', (results.reduce((a, r) => a + r.recipesDone, 0) / results.length).toFixed(1),
  '· 칸막힘', (results.reduce((a, r) => a + r.drawsBlocked, 0) / results.length).toFixed(0));
console.log('콘솔 에러:', allErrs.length ? [...new Set(allErrs)].slice(0, 3) : '없음');
await browser.close();
