// 확장 기능 종단 테스트 8종.
// 실행: CHROME_PATH=... node scripts/playtest-expansion.mjs [url]
import { chromium } from 'playwright';

const URL = process.argv[2] ?? 'http://127.0.0.1:4173/';
const KEY = 'cvs-night-shift:v1';
const SHOTS = process.env.SHOT_DIR ?? '/tmp/';
const results = [];
const errs = [];
const ok = (name, pass, note = '') => results.push({ name, pass, note });

const b = await chromium.launch({ executablePath: process.env.CHROME_PATH });
const ctx = await b.newContext({ viewport: { width: 390, height: 844 } });
const p = await ctx.newPage();
p.on('pageerror', (e) => errs.push('예외: ' + e.message));
p.on('console', (m) => {
  if (m.type() === 'error' && !/CERT_AUTHORITY|fonts.googleapis/.test(m.text())) errs.push('콘솔: ' + m.text());
});

const S = () => p.evaluate((k) => { try { return JSON.parse(localStorage.getItem(k) ?? 'null'); } catch { return null; } }, KEY);
const layoutOk = () => p.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);

// ── 테스트 8: 기존 v1 저장 데이터 마이그레이션 (게임 로드 전에 심어 둔다) ──
await p.goto(URL, { waitUntil: 'domcontentloaded' });
await p.evaluate((k) => localStorage.setItem(k, JSON.stringify({
  version: 1, bestWave: 23, bestTime: 512, bestKills: 401, totalPlays: 17, totalKills: 3120,
  unlockedUnits: ['pos', 'manager'], seenEnemies: ['basic', 'drunk'], metaPoints: 940,
  metaLevels: { startCoins: 2, startHp: 1, drawCost: 0, rareChance: 3, epicChance: 0, coinGain: 1 },
  muted: false, autoMerge: false, hintsSeen: true,
})), KEY);
await p.goto(URL, { waitUntil: 'networkidle' });
const migrated = await S();
ok('8. 기존 저장 데이터 migration',
  migrated?.version === 2 && migrated.bestWave === 23 && migrated.metaPoints === 940 && Array.isArray(migrated.achievements) && !!migrated.unitStats?.pos,
  `v${migrated?.version} bestWave=${migrated?.bestWave} 수당=${migrated?.metaPoints} unitStats.pos=${!!migrated?.unitStats?.pos}`);

// ── 테스트 5: Daily Challenge 표시 ──
const dailyName = await p.locator('.daily-name').textContent();
const dailyRules = await p.locator('.daily-rules li').count();
ok('5. ZUNRAN DAILY 표시', !!dailyName && dailyRules > 0, `${dailyName} · 규칙 ${dailyRules}줄`);

// ── 테스트 4: Daily Mission 표시 ──
const goal = await p.locator('.daily-goal').textContent();
const reward = await p.locator('.daily-reward').textContent();
ok('4. TODAY\'S MISSION 표시', !!goal && /수당/.test(reward ?? ''), `${goal} / ${reward?.trim()}`);
ok('레이아웃 넘침 없음(시작화면)', await layoutOk());

// ── 업적 탭 ──
await p.getByRole('button', { name: '업적' }).click();
await p.waitForTimeout(300);
const achTotal = await p.locator('.ach-item').count();
const secretHidden = await p.locator('.ach-item.secret .ach-title').first().textContent();
ok('업적 화면', achTotal > 20 && secretHidden === '???', `${achTotal}개 · 숨김 표시 "${secretHidden}"`);
await p.screenshot({ path: SHOTS + 'x-ach.png' });

// ── 테스트 6: 도감 ──
await p.getByRole('button', { name: '도감' }).click();
await p.waitForTimeout(300);
const codexBefore = await p.locator('.codex-item:not(.locked)').count();
await p.locator('.codex-item:not(.locked)').first().click();
await p.waitForTimeout(250);
const detailOpen = await p.locator('.codex-detail').count();
ok('6-1. 도감 상세 펼침', detailOpen > 0, `해금 ${codexBefore}개`);
await p.screenshot({ path: SHOTS + 'x-codex.png' });

// ── 테스트 1: 게임 시작 → 플레이 → 게임오버 (데일리 규칙으로) ──
await p.getByRole('button', { name: '시작' }).click();
await p.waitForTimeout(200);
await p.getByText('오늘의 규칙으로 시작').click();
await p.waitForTimeout(600);
ok('레이아웃 넘침 없음(게임)', await layoutOk());
const hasChallenge = await p.evaluate(() => !!window.__game.engine.state.challenge);
ok('데일리 규칙이 엔진에 주입됨', hasChallenge);

// 미션 조건을 채우도록 잠깐 플레이한 뒤 종료
await p.locator('.ctrl').nth(1).click(); // 2배속
for (let i = 0; i < 40; i++) {
  await p.waitForTimeout(400);
  if (await p.locator('.reward-overlay').count()) { await p.locator('.reward-card').first().click(); continue; }
  const m = p.locator('.merge-btn');
  if (await m.count()) { await m.first().click({ force: true }); continue; }
  const d = p.locator('.draw-btn');
  if (await d.count() && !(await d.getAttribute('class')).includes('disabled')) await d.click({ force: true });
}
const waveReached = await p.evaluate(() => window.__game.engine.state.wave);
await p.evaluate(() => window.__game.engine.dispatch({ type: 'GIVE_UP' }));
await p.waitForTimeout(1800);
ok('1. 시작 → 플레이 → 게임오버', (await p.locator('.gameover').count()) > 0, `웨이브 ${waveReached} 까지`);

// ── 테스트 2: Run Report ──
const runTitle = await p.locator('.report-title').textContent();
const defeatRows = await p.locator('.defeat-rows > div').count();
const missionBlock = await p.locator('.mission-result').count();
ok('2. 근무 보고서', !!runTitle && defeatRows >= 2 && missionBlock === 1, `제목 ${runTitle} · 패배원인 ${defeatRows}줄`);
ok('레이아웃 넘침 없음(게임오버)', await layoutOk());
await p.screenshot({ path: SHOTS + 'x-report.png', fullPage: true });

// ── 테스트 3: 업적 해금 ──
const saveAfter = await S();
ok('3. 업적 해금 + 저장', (saveAfter?.achievements?.length ?? 0) > 0, `${saveAfter.achievements.length}개: ${saveAfter.achievements.slice(0, 4).join(', ')}`);
ok('근무 기록 저장', (saveAfter?.runHistory?.length ?? 0) === 1, `runHistory ${saveAfter?.runHistory?.length}`);
ok('데일리 기록 저장', Object.keys(saveAfter?.daily ?? {}).length === 1, JSON.stringify(Object.values(saveAfter?.daily ?? {})[0] ?? {}));
ok('도감 통계 누적', Object.keys(saveAfter?.enemyStats ?? {}).length > 2, `손님 ${Object.keys(saveAfter?.enemyStats ?? {}).length}종 기록`);

// ── 인증서 ──
await p.getByText('근무 인증서 보기').click();
await p.waitForTimeout(700);
const certPainted = await p.evaluate(() => {
  const c = document.querySelector('.cert-canvas');
  if (!c) return false;
  const ctx = c.getContext('2d');
  const d = ctx.getImageData(0, 0, c.width, c.height).data;
  let nonBg = 0;
  for (let i = 0; i < d.length; i += 4 * 97) if (d[i] > 60 || d[i + 1] > 60) nonBg++;
  return nonBg > 40; // 배경만 있는 게 아니라 실제로 뭔가 그려졌다
});
ok('근무 인증서 렌더', certPainted);
await p.screenshot({ path: SHOTS + 'x-cert.png' });
await p.locator('.cert-actions .menu-btn').last().click();
await p.waitForTimeout(300);

// ── 테스트 7: 저장 → 새로고침 → 유지 ──
await p.reload({ waitUntil: 'networkidle' });
await p.waitForTimeout(400);
const saveReload = await S();
const same = JSON.stringify(saveReload.achievements) === JSON.stringify(saveAfter.achievements)
  && saveReload.runHistory.length === saveAfter.runHistory.length
  && saveReload.metaPoints === saveAfter.metaPoints;
ok('7. 새로고침 후 데이터 유지', same, `업적 ${saveReload.achievements.length} · 기록 ${saveReload.runHistory.length} · 수당 ${saveReload.metaPoints}`);

// 최근 근무 기록 화면
await p.locator('nav.tabs button').nth(4).click();
await p.waitForTimeout(300);
ok('최근 근무 기록 화면', (await p.locator('.hist-item').count()) === 1);
await p.screenshot({ path: SHOTS + 'x-history.png' });

// 저장 용량
const bytes = await p.evaluate((k) => (localStorage.getItem(k) ?? '').length, KEY);
ok('저장 용량 여유', bytes < 60000, `${bytes} bytes`);

console.log('\n── 결과 ──');
for (const r of results) console.log(`${r.pass ? '✅' : '❌'} ${r.name}${r.note ? ' — ' + r.note : ''}`);
console.log(`\n통과 ${results.filter((r) => r.pass).length}/${results.length}`);
console.log('에러:', errs.length ? errs : '없음');
await b.close();
process.exit(results.every((r) => r.pass) && errs.length === 0 ? 0 : 1);
