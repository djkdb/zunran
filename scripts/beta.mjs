// 베타 테스터 10명. 전부 이 게임을 처음 보는 사람이다.
//
// 봇 밸런스 계측(threats/builds)이 못 보는 것을 본다 — 처음 켠 사람이
// 어디서 멈추고, 무엇을 끝내 못 쓰고, 언제 할 일이 없어지는가.
// 그래서 10명이 서로 다른 성격이어야 한다. 같은 정책 10번은 1명이다.
//
//   npm run preview -- --port 4190
//   CHROME_PATH=/opt/pw-browsers/chromium node scripts/beta.mjs
import { chromium } from 'playwright';
import { writeFileSync } from 'fs';

const URL = process.env.GAME_URL ?? 'http://127.0.0.1:4190/';
const BUDGET = Number(process.env.BETA_BUDGET ?? 240) * 1000; // 1인당 벽시계 상한
const OUT = process.env.BETA_OUT ?? '/tmp/beta.json';

// ── 성격 ──────────────────────────────────────────────────────────
// reads   : 화면을 읽는가 (안 읽으면 힌트·코치·테마칩을 무시한다)
// tempo   : 행동 간격(ms)
// drags   : 유닛을 옮겨 보는가
// explores: 게임 전에 다른 탭을 눌러 보는가
// skill   : 긴급 스킬을 쓰는가
// order   : 본사 발주(유료 지정 뽑기)를 쓰는가
// bias    : 'draw' 뽑기 위주 / 'merge' 합성 위주 / 'balanced'
// afk     : 중간에 손을 놓는 초
// random  : 화면 아무 데나 누르는 비율
const PEOPLE = [
  { id: 1, name: '성급한 탭퍼', reads: false, tempo: 350, drags: false, explores: false, skill: false, order: false, bias: 'draw', afk: 0, random: 0.1 },
  { id: 2, name: '설명 다 읽는 사람', reads: true, tempo: 1800, drags: true, explores: true, skill: true, order: false, bias: 'balanced', afk: 0, random: 0 },
  { id: 3, name: '탐험가(메뉴부터)', reads: true, tempo: 900, drags: true, explores: true, skill: true, order: true, bias: 'balanced', afk: 0, random: 0.05 },
  { id: 4, name: '뽑기 중독', reads: false, tempo: 500, drags: false, explores: false, skill: false, order: true, bias: 'draw', afk: 0, random: 0 },
  { id: 5, name: '합성 신봉자', reads: true, tempo: 700, drags: false, explores: false, skill: false, order: false, bias: 'merge', afk: 0, random: 0 },
  { id: 6, name: '전화 받는 사람(AFK)', reads: true, tempo: 900, drags: true, explores: false, skill: false, order: false, bias: 'balanced', afk: 35, random: 0 },
  { id: 7, name: '무지성 클리커', reads: false, tempo: 260, drags: false, explores: false, skill: true, order: false, bias: 'draw', afk: 0, random: 0.55 },
  { id: 8, name: '배치 고민러', reads: true, tempo: 1100, drags: true, explores: false, skill: true, order: false, bias: 'balanced', afk: 0, random: 0 },
  { id: 9, name: '버튼 다 눌러보는 사람', reads: true, tempo: 600, drags: true, explores: true, skill: true, order: true, bias: 'balanced', afk: 0, random: 0.1 },
  { id: 10, name: '코치 바로 끄는 사람', reads: false, tempo: 700, drags: true, explores: false, skill: false, order: false, bias: 'balanced', afk: 0, random: 0.05 },
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function play(browser, person) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 780 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  const p = await ctx.newPage();
  const log = { ...person, errors: [], used: {}, notes: [], hp: [], screens: [], stuck: [], blocked: [], taps: 0, enterTaps: 0 };
  const note = (t) => { if (!log.notes.includes(t)) log.notes.push(t); };
  const mark = (k) => { log.used[k] = (log.used[k] ?? 0) + 1; };
  p.on('pageerror', (e) => log.errors.push('예외: ' + e.message));
  p.on('console', (m) => { if (m.type() === 'error' && !/404|favicon/.test(m.text())) log.errors.push(m.text()); });

  const t0 = Date.now();
  await p.goto(URL, { waitUntil: 'networkidle' });
  await p.evaluate(async () => {
    for (const r of (await navigator.serviceWorker?.getRegistrations?.()) ?? []) await r.unregister();
    for (const k of await caches.keys()) await caches.delete(k);
    localStorage.clear();
  });
  await p.reload({ waitUntil: 'networkidle' });
  await sleep(700);

  // 버튼 상태를 한 번에 읽는다. 버튼마다 왕복하면(20개 × CDP) 페이지 5개가
  // 서로를 굶겨서 어떤 테스터는 300초에 13번밖에 행동하지 못했다.
  const buttons = () =>
    p.evaluate(() =>
      [...document.querySelectorAll('button')]
        .filter((b) => b.offsetParent !== null)
        .map((b, i) => {
          b.dataset.beta = String(i);
          return { i, t: (b.textContent ?? '').replace(/\s+/g, ' ').trim(), dis: b.disabled };
        }),
    ).catch(() => []);
  const tap = async (b) => { log.taps++; await p.click(`button[data-beta="${b.i}"]`, { timeout: 2000 }).catch(() => {}); };
  const find = async (re) => (await buttons()).find((b) => re.test(b.t) && !b.dis);
  const inGame = () => p.$('.field-canvas');
  const snap = () => p.evaluate(() => { const g = window.__game?.engine; return g ? JSON.parse(JSON.stringify(g.snapshot())) : null; }).catch(() => null);

  // ── 1. 처음 화면 → 필드까지 ───────────────────────────────────
  if (person.explores) {
    for (const i of [2, 3, 4, 5]) {
      await p.click(`.tabs button:nth-child(${i})`, { timeout: 1500 }).catch(() => {});
      log.enterTaps++;
      await sleep(person.tempo);
      const scr = await p.$eval('.app-nav-title', (e) => e.textContent).catch(() => null);
      if (scr) log.screens.push(scr);
    }
    await p.click('.tabs button:nth-child(1)', { timeout: 1500 }).catch(() => {});
    await sleep(person.tempo);
  }
  const guard0 = Date.now();
  while (!(await inGame()) && Date.now() - guard0 < 60000) {
    const bs = await buttons();
    const pick =
      bs.find((b) => /야간 근무 시작/.test(b.t) && !b.dis) ??
      (person.reads ? bs.find((b) => /건너뛰기/.test(b.t) && !b.dis) : bs.find((b) => /건너뛰기/.test(b.t) && !b.dis)) ??
      bs.find((b) => /국도변|골목점|술집가/.test(b.t) && !b.dis) ??
      bs.find((b) => !b.dis && b.t.length > 2 && !/랭킹|도감|업적|기록|강화|설정|쿠폰/.test(b.t));
    if (!pick) { note('진입 중 누를 게 없어 멈춤'); break; }
    log.enterTaps++;
    await tap(pick);
    await sleep(Math.max(500, person.tempo * 0.6));
  }
  log.enterMs = Date.now() - t0;
  log.entered = !!(await inGame());
  if (!log.entered) { await ctx.close(); return log; }

  // ── 2. 한 판 ─────────────────────────────────────────────────
  let firstActionAt = null;
  let idleSince = null;
  let afkDone = person.afk === 0;
  let futile = 0;
  let calmUntil = 0;
  const seen = { coach: false };
  const box = await p.$eval('.field', (e) => { const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; }).catch(() => null);

  while (Date.now() - t0 < BUDGET) {
    const s = await snap();
    if (!s) break;
    if (s.phase === 'gameover') break;
    log.hp.push({ w: s.wave, hp: s.hp, t: Math.round((Date.now() - t0) / 1000) });

    // 막는 화면부터 치운다
    if (s.phase === 'reward') {
      const cards = await p.$$('.reward-cards button');
      if (cards.length) {
        // 안 읽는 사람은 맨 왼쪽, 읽는 사람은 '대박/좋은 보상' 을 고른다
        let i = 0;
        if (person.reads) {
          const texts = await Promise.all(cards.map((c) => c.textContent()));
          const j = texts.findIndex((t) => /대박/.test(t ?? ''));
          i = j >= 0 ? j : 0;
        }
        log.taps++; await cards[i].click({ timeout: 2000 }).catch(() => {});
        mark('보상선택');
      }
      await sleep(person.tempo); continue;
    }
    if (s.phase === 'promote' || s.phase === 'eventChoice') {
      // 승급 화면의 버튼은 .promote-cards 안에 있다. 여기를 .reward-cards 로만
      // 찾았더니 클릭이 안 먹어 10명 중 6명이 승급 화면에서 170~236초 멈췄고,
      // 「승급 0/10」이라는 가짜 결론이 나왔다.
      const cards = await p.$$('.promote-cards button, .reward-cards button, .event-choices button');
      if (cards.length) { log.taps++; await cards[0].click({ timeout: 2000 }).catch(() => {}); mark(s.phase === 'promote' ? '승급선택' : '사건선택'); }
      else log.blocked.push({ phase: s.phase, wave: s.wave });
      await sleep(person.tempo); continue;
    }

    // 실수로 일시정지. 조작 버튼(일시정지·배속·소리)이 매장 화면 안에 있어서
    // 필드를 잘못 누르면 게임이 멈춘다. 첫 시도에서 「성급한 탭퍼」가 이걸 모르고
    // 300초 내내 W1 에 머물렀다 (812번 눌렀는데 처치 0).
    if (s.paused) {
      log.pauses = (log.pauses ?? 0) + 1;
      note('필드를 잘못 눌러 게임이 멈췄다');
      await p.click('.pause-overlay', { timeout: 1500 }).catch(() => {});
      await sleep(300);
      calmUntil = Date.now() + 4000; // 사람은 푼 직후 같은 자리를 또 누르지 않는다
      continue;
    }

    // 코치
    const coach = await p.$('.coach');
    if (coach) {
      seen.coach = true;
      if (!person.reads) { await p.click('.coach-x', { timeout: 1000 }).catch(() => {}); mark('코치닫기'); }
    }

    // AFK 한 번
    if (!afkDone && s.wave >= 4) { afkDone = true; note(`${person.afk}초 자리 비움`); await sleep(person.afk * 1000); continue; }

    const bs = await buttons();
    let did = false;
    const rnd = Math.random();

    // 아무 데나 누르기 (무지성 클리커용)
    if (rnd < person.random && box && Date.now() > calmUntil) {
      log.taps++;
      await p.mouse.click(box.x + Math.random() * box.w, box.y + Math.random() * box.h).catch(() => {});
      mark('화면탭'); did = true;
    }

    // 무엇을 할 수 있는가 — 버튼 모양이 아니라 실제 게임 상태로 판단한다.
    //
    // 뽑기·발주·「한 개만 더」버튼은 돈이 모자라도 DOM 상 disabled 가 아니다
    // (보기에만 흐려진다). 그래서 첫 시도에서 봇이 뽑기를 184번 눌러 21번만
    // 먹혔고, 그 분기가 매번 이겨서 배치·정리·발주에 도달조차 못 했다.
    const afford = (re) => {
      const b = bs.find((x) => re.test(x.t) && !x.dis);
      if (!b) return null;
      const m = b.t.match(/-?(\d[\d,]*)\s*$/);
      const cost = m ? Number(m[1].replace(/,/g, '')) : 0;
      return cost <= s.coins ? b : null;
    };
    const can = {
      뽑기: s.canDraw,
      합성: s.groups.some((g) => g.mergeable) || !!s.tierMerge,
      조합: !!bs.find((b) => /조합|COMBINE/.test(b.t) && !b.dis),
      정리: s.junkCount > 0,
      발주: person.order && !!afford(/희귀|에픽|전설/),
      긴급스킬: person.skill && s.enemyCount >= 8 && (s.skillReady.shutter || s.skillReady.dump),
      배치: person.drags && s.unitCount > 0 && s.emptySlots > 0,
      한개더: s.mergeBuy.some((o) => o.cost <= s.coins),
    };

    // 손이 가는 빈도. 한 분기가 독점하지 않게 가중 추첨으로 고른다
    // (순서대로 고르게 했더니 배치가 70초에 51번 눌렸다 — 사람이 아니다).
    const W = {
      draw: { 뽑기: 7, 합성: 4, 한개더: 2, 조합: 2, 정리: 2, 발주: 1, 긴급스킬: 1, 배치: 1 },
      merge: { 합성: 8, 한개더: 5, 조합: 5, 뽑기: 3, 정리: 2, 배치: 1, 긴급스킬: 1, 발주: 1 },
      balanced: { 합성: 5, 한개더: 3, 조합: 3, 뽑기: 5, 배치: 2, 정리: 2, 긴급스킬: 1, 발주: 1 },
    };
    const w = { ...(W[person.bias] ?? W.balanced) };
    if (person.id === 8) w.배치 = 6; // 배치 고민러는 자리를 자주 바꾼다
    if (person.id === 2) w.조합 = 5; // 설명 읽는 사람은 레시피를 본다

    const pool = Object.keys(w).filter((k) => can[k]);
    const doMove = async () => {
      const c = await p.evaluate(() => {
        const g = window.__game.engine, st = g.state;
        const r = document.querySelector('.field-canvas').getBoundingClientRect();
        const k = r.width / 640;
        const mine = st.units.map((u) => st.slots[u.slot]);
        const free = st.slots.filter((x) => !x.locked && !x.blocked && x.unitId === null);
        if (!mine.length || !free.length) return null;
        const a = mine[Math.floor(Math.random() * mine.length)], b = free[Math.floor(Math.random() * free.length)];
        return { ax: r.x + a.x * k, ay: r.y + a.y * k, bx: r.x + b.x * k, by: r.y + b.y * k };
      }).catch(() => null);
      if (!c) return false;
      log.taps += 2;
      await p.mouse.click(c.ax, c.ay).catch(() => {});
      await sleep(150);
      await p.mouse.click(c.bx, c.by).catch(() => {});
      return true;
    };
    const tapText = async (re) => {
      const b = bs.find((x) => re.test(x.t) && !x.dis);
      if (!b) return false;
      await tap(b);
      return true;
    };
    const RE = { 뽑기: /유닛 뽑기/, 합성: /MERGE/, 한개더: /한 개만 더|하나 더|\+1/, 조합: /조합|COMBINE/, 정리: /정리/, 발주: /희귀|에픽|전설/, 긴급스킬: /셔터 내려|폐기 처리/ };

    if (!did && pool.length) {
      const total = pool.reduce((a, k) => a + w[k], 0);
      let r = Math.random() * total;
      let choice = pool[0];
      for (const k of pool) { r -= w[k]; if (r <= 0) { choice = k; break; } }
      const okDone = choice === '배치' ? await doMove() : await tapText(RE[choice]);
      if (okDone) { mark(choice); did = true; }
    }

    // 할 수 있는 게 없다 — 사람은 그래도 제일 큰 버튼을 눌러 본다. 몇 번 하다 만다.
    if (!did) {
      futile++;
      if (futile <= 3) {
        const d = bs.find((x) => /유닛 뽑기/.test(x.t) && !x.dis);
        if (d) { await tap(d); mark('헛탭(돈 부족)'); }
      }
    } else futile = 0;

    if (did) { firstActionAt ??= Date.now() - t0; idleSince = null; }
    else {
      idleSince ??= Date.now();
      const stuckFor = (Date.now() - idleSince) / 1000;
      if (stuckFor > 6) {
        log.stuck.push({ w: s.wave, sec: Math.round(stuckFor), coins: s.coins, empty: s.emptySlots, junk: s.junkCount, cost: s.drawCost });
        idleSince = Date.now();
      }
    }
    await sleep(person.tempo);
  }

  const end = await snap();
  log.wave = end?.wave ?? 0;
  log.timeSec = Math.round((Date.now() - t0) / 1000);
  log.firstActionMs = firstActionAt;
  log.sawCoach = seen.coach;
  log.gameover = end?.phase === 'gameover';
  const st = end?.stats;
  if (st) log.stats = { draws: st.draws, merges: st.merges, moves: st.moves, kills: st.kills, recipes: st.recipesMade, orders: st.orders, skills: st.skillsUsed };
  await p.screenshot({ path: `/tmp/beta_${person.id}.png` }).catch(() => {});
  await ctx.close();
  return log;
}

// 페이지를 여러 개 동시에 돌리면 크로미움이 비활성 탭의 rAF 를 조인다.
// 첫 시도에서 웨이브 속도가 17.6초 ~ 75.0초로 벌어져 모든 시간 수치가 못 쓰게 됐다.
const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH,
  args: ['--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows'],
});
const results = [];
for (let i = 0; i < PEOPLE.length; i += 5) {
  const batch = PEOPLE.slice(i, i + 5);
  process.stderr.write(`▶ ${batch.map((b) => b.name).join(', ')}\n`);
  results.push(...(await Promise.all(batch.map((b) => play(browser, b)))));
}
await browser.close();
writeFileSync(OUT, JSON.stringify(results, null, 2));

// ── 요약 ──
const pad = (t, n) => t + ' '.repeat(Math.max(1, n - [...String(t)].reduce((a, c) => a + (c.charCodeAt(0) > 0x2000 ? 2 : 1), 0)));
console.log('\n══════ 베타 테스터 10명 · 전원 첫 플레이 ══════\n');
console.log(pad('테스터', 22) + pad('진입', 7) + pad('첫행동', 8) + pad('웨이브', 8) + pad('플레이', 8) + pad('탭', 6) + '한 판에 쓴 기능');
for (const r of results) {
  const used = Object.entries(r.used).map(([k, v]) => `${k}${v}`).join(' ');
  console.log(
    pad(`${r.id}. ${r.name}`, 22) + pad(`${(r.enterMs / 1000).toFixed(1)}s`, 7) +
    pad(r.firstActionMs ? `${(r.firstActionMs / 1000).toFixed(1)}s` : '-', 8) +
    pad(`W${r.wave}${r.gameover ? '' : '*'}`, 8) + pad(`${r.timeSec}s`, 8) + pad(r.taps, 6) + used,
  );
}
console.log('\n* = 시간 상한에 걸려 중단 (죽은 게 아님)\n');

console.log('── 끝내 한 번도 못 쓴 기능 ──');
const FEATURES = ['뽑기', '합성', '배치', '정리', '조합', '발주', '긴급스킬', '보상선택', '승급선택', '사건선택'];
for (const f of FEATURES) {
  const miss = results.filter((r) => !r.used[f]);
  if (miss.length) console.log(`  ${pad(f, 10)} ${pad(`${miss.length}/10명`, 9)} ${miss.map((m) => m.id).join(',')}`);
}

console.log('\n── 할 일이 없어 멈춰 있던 구간 (6초 이상) ──');
const anyStuck = results.filter((r) => r.stuck.length);
if (!anyStuck.length) console.log('  없음');
for (const r of anyStuck) {
  console.log(`  ${pad(`${r.id}. ${r.name}`, 22)} ${r.stuck.length}회 · ${r.stuck.map((s) => `W${s.w} ${s.sec}s(코인${s.coins}/빈칸${s.empty}/뽑기값${s.cost})`).join(', ')}`);
}

console.log('\n── 체력이 처음 깎인 웨이브 ──');
for (const r of results) {
  const first = r.hp.find((h) => h.hp < (r.hp[0]?.hp ?? 100));
  console.log(`  ${pad(`${r.id}. ${r.name}`, 22)} ${first ? `W${first.w} (${first.t}초)` : '끝까지 안 깎임'}`);
}

// 같은 웨이브에 60초 넘게 머물렀다면 테스트가 막힌 것이다 — 결과를 믿으면 안 된다.
console.log('\n── 계측 건전성 (한 웨이브에 60초 이상 머문 사람) ──');
const frozen = results.filter((r) => {
  const h = r.hp; if (!h.length) return false;
  const lw = h[h.length - 1].w;
  return h[h.length - 1].t - h.find((x) => x.w === lw).t > 60;
});
console.log(frozen.length ? '  ⚠ ' + frozen.map((r) => `${r.id}.${r.name}`).join(', ') : '  없음 — 전원 정상 진행');
const blocked = results.filter((r) => r.blocked.length);
if (blocked.length) console.log('  ⚠ 누를 수 없는 화면: ' + blocked.map((r) => `${r.id}(${r.blocked[0].phase})`).join(', '));

console.log('\n── 필드를 잘못 눌러 게임이 멈춘 횟수 ──');
const paused = results.filter((r) => r.pauses);
console.log(paused.length ? paused.map((r) => `  ${r.id}. ${r.name}: ${r.pauses}회`).join('\n') : '  없음');

console.log('\n── 메모 ──');
for (const r of results) for (const n of r.notes) console.log(`  ${r.id}. ${r.name}: ${n}`);
const errs = results.flatMap((r) => r.errors.map((e) => `${r.id}: ${e}`));
console.log(`\n── 콘솔 에러 ── ${errs.length ? '\n  ' + [...new Set(errs)].slice(0, 8).join('\n  ') : '없음'}`);
