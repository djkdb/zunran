// 신규 유저 첫 판을 장면별로 끊어 촬영한다 (문서·소개용 스크린샷 생성).
// 저장 데이터를 지우고 시작하므로 항상 "처음 하는 사람" 화면이 나온다.
//
//   npm run preview                       # 다른 터미널에서
//   CHROME_PATH=/path/to/chromium SHOT_DIR=/tmp/tut node scripts/walkthrough.mjs
//
// 찍는 장면: 시작 화면 → 첫 뽑기 → 배치 → 전투 → 합성 → 보상 3택 → 긴급 스킬
//            → 보스 → 새벽 3시 → 칸 포화 → 근무 보고서 → 인증서 → 업적/도감/기록
import { chromium } from 'playwright';
import fs from 'node:fs';

const URL = process.env.GAME_URL ?? 'http://127.0.0.1:4173/';
const SP = (process.env.SHOT_DIR ?? '/tmp/tut').replace(/\/$/, '') + '/';
const KEY = 'cvs-night-shift:v1';
fs.mkdirSync(SP, { recursive: true });

const log = [];
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
const p = await ctx.newPage();
const errs = [];
p.on('pageerror', (e) => errs.push('예외: ' + e.message));

const shot = async (name, note) => {
  await p.screenshot({ path: `${SP}${name}.png` });
  log.push(`[${name}] ${note}`);
};
const state = () =>
  p.evaluate(() => {
    const s = window.__game?.engine?.state;
    if (!s) return null;
    return {
      wave: s.wave, hp: s.hp, coins: s.coins, units: s.units.length, phase: s.phase,
      enemies: s.enemies.length, boss: s.bossAlive, empty: s.slots.filter((x) => x.unitId === null).length,
    };
  });

// ───────── 완전 신규 유저로 시작 ─────────
await p.goto(URL, { waitUntil: 'domcontentloaded' });
await p.evaluate((k) => localStorage.removeItem(k), KEY);
await p.goto(URL, { waitUntil: 'networkidle' });
await shot('01-start', '첫 방문 시작 화면 (ZUNRAN DAILY + 오늘의 미션)');
log.push(
  'DAILY: ' +
    JSON.stringify(
      await p.evaluate(() => ({
        name: document.querySelector('.daily-name')?.textContent,
        rules: [...document.querySelectorAll('.daily-rules li')].map((e) => e.textContent),
        goal: document.querySelector('.daily-goal')?.textContent,
      })),
    ),
);

await p.getByText('야간 근무 시작').click();
await p.waitForTimeout(900);
await shot('02-wave1', '웨이브 1 — 코너별 보너스가 붙은 빈 칸 21개');

// ───────── 첫 뽑기와 배치 ─────────
await p.locator('.draw-btn').click({ force: true });
await p.waitForTimeout(700);
await shot('03-draw', '첫 뽑기 — 뽑은 유닛이 자동 선택되고 빈 칸이 강조된다');

const field = await p.locator('.field-canvas').boundingBox();
const rows = [0.32, 0.56, 0.8]; // 음료 / 과자 / 라면 코너
await p.mouse.click(field.x + field.width * 0.22, field.y + field.height * rows[0]);
await p.waitForTimeout(600);
await shot('04-place', '빈 칸을 탭해 음료 코너에 배치 (사거리 +18)');

await p.waitForTimeout(4000);
await shot('05-fight', '손님 등장 — 유닛이 자동으로 공격한다');

// ───────── 배속을 올리고 끝까지 ─────────
await p.locator('.ctrl').nth(1).click();
const done = { merge: false, reward: false, skill: false, boss: false, threeAm: false, full: false };
for (let i = 0; i < 900; i++) {
  await p.waitForTimeout(280);
  if (await p.locator('.gameover').count()) break;
  const s = await state();
  if (!s) break;

  if (s.phase === 'reward') {
    if (!done.reward) {
      await shot('09-reward', '웨이브 보상 3택 — 이번 근무 동안 유지된다');
      log.push(
        '보상 후보: ' +
          JSON.stringify(
            await p.evaluate(() =>
              [...document.querySelectorAll('.reward-card')].map((c) => ({
                tone: c.querySelector('.reward-tone')?.textContent,
                name: c.querySelector('.reward-name')?.textContent,
              })),
            ),
          ),
      );
      done.reward = true;
    }
    await p.locator('.reward-card').first().click();
    continue;
  }

  if (!done.merge && (await p.locator('.merge-btn').count())) {
    await shot('06-merge-ready', '같은 유닛 3개 — 합성 버튼이 나타난다');
    await p.locator('.merge-btn').first().click({ force: true });
    await p.waitForTimeout(900);
    await shot('07-merged', '합성 직후 — 70% 강화 / 25% 상위 등급 / 5% 특수');
    done.merge = true;
    continue;
  }
  if (!done.skill && s.enemies >= 12) {
    const sh = p.locator('.skill-btn.shutter');
    if ((await sh.count()) && !(await sh.isDisabled())) {
      await sh.click({ force: true });
      await p.waitForTimeout(500);
      await shot('10-skill', '셔터 내려 — 전원 2.5초 정지 + 뒤로 밀기');
      done.skill = true;
      continue;
    }
  }
  if (!done.boss && s.boss) {
    await p.waitForTimeout(900);
    await shot('11-boss', '웨이브 10 보스 — HUD 에 보스 체력 막대가 붙는다');
    done.boss = true;
  }
  if (!done.threeAm && s.wave >= 13) {
    await p.waitForTimeout(600);
    await shot('12-3am', '웨이브 13 = 03:00 새벽 3시 (이후 형광등이 깜빡인다)');
    done.threeAm = true;
  }
  if (!done.full && s.empty === 0) {
    await shot('13-slotfull', '칸 21개 포화 — 자동 정리가 짝 없는 유닛을 하나씩 판다');
    done.full = true;
  }

  const draw = p.locator('.draw-btn');
  if ((await draw.count()) && !(await draw.getAttribute('class')).includes('disabled')) {
    await draw.click({ force: true });
    await p.waitForTimeout(200);
    await p.mouse.click(field.x + field.width * (0.2 + (i % 5) * 0.14), field.y + field.height * rows[i % 3]);
    continue;
  }
  // 필요한 장면을 다 찍었으면 정리하고 끝낸다
  if (s.wave >= 16 && Object.values(done).every(Boolean)) {
    await p.evaluate(() => window.__game.engine.dispatch({ type: 'GIVE_UP' }));
  }
}

// ───────── 영업 종료 이후 ─────────
await p.waitForTimeout(2200);
await shot('14-gameover', '영업 종료 — 근무 보고서');
await p.screenshot({ path: SP + '14b-report-full.png', fullPage: true });

await p.getByText('근무 인증서 보기').click();
await p.waitForTimeout(900);
await shot('15-cert', '근무 인증서 (Web Share / 클립보드 / PNG 저장)');
await p.locator('.cert-actions .menu-btn').last().click();
await p.waitForTimeout(400);

await p.getByText('메인으로').click();
await p.waitForTimeout(600);
await p.getByRole('button', { name: '업적' }).click();
await p.waitForTimeout(400);
await shot('16-ach', '업적 — 숨겨진 업적은 ??? 로 가려진다');

await p.getByRole('button', { name: '도감' }).click();
await p.waitForTimeout(400);
await p.locator('.ach-tabs button').nth(1).click();
await p.waitForTimeout(300);
await p.locator('.codex-item:not(.locked)').first().click();
await p.waitForTimeout(400);
await shot('17-codex', '손님 도감 — 발견/처치 누적과 특징이 펼쳐진다');

await p.locator('nav.tabs button').nth(4).click();
await p.waitForTimeout(400);
await shot('18-history', '최근 근무 기록 (런 제목과 함께 30판까지)');

console.log(log.join('\n'));
console.log('\n→ ' + SP);
console.log('에러:', errs.length ? errs : '없음');
await browser.close();
