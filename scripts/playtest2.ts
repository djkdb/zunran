// 게임오버/저장/재시작/전설 연출 흐름 테스트 + 릴스용 스크린샷
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

async function main() {
  const [url = 'http://localhost:4173', outdir = 'shots'] = process.argv.slice(2);
  fs.mkdirSync(outdir, { recursive: true });
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const page = await context.newPage();
  const errors: string[] = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.getByText('야간 근무 시작').click();
  await page.waitForTimeout(400);
  // 전설 강제: rng 를 0 으로 → 전설 확률 구간
  await page.evaluate(() => {
    const g = (window as any).__game;
    const orig = g.engine.state.rng.next;
    g.engine.state.rng.next = () => 0.0;
    g.engine.dispatch({ type: 'DRAW' });
    g.engine.state.rng.next = orig;
  });
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(outdir, 'reel-legendary.png') });
  await page.waitForTimeout(3000);
  // 유닛 선택 카드 + 합성 버튼: 삼각김밥 3개 강제 생성
  await page.evaluate(() => {
    const g = (window as any).__game;
    const s = g.engine.state;
    for (let i = 10; i < 13; i++) {
      const u = { id: s.nextId++, defId: 'onigiri', tier: 1, slot: i, cooldown: 0, skillCd: 0, disabledUntil: 0, buffs: { atkSpeed: 0, dmg: 0 }, kills: 0, damage: 0, bornAt: 0, lastAttackAt: -10, facing: 1 };
      s.units.push(u); s.slots[i].unitId = u.id;
    }
    g.engine.dispatch({ type: 'SELECT', unitId: s.units[0].id });
  });
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(outdir, 'ui-selected-merge.png') });
  await page.locator('.merge-btn').first().click();
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(outdir, 'ui-after-merge.png') });
  const afterMerge = await page.evaluate(() => (window as any).__game.engine.state.units.length);
  console.log('units after merge:', afterMerge);
  // 새벽 3시 강제 + 보스 강제
  await page.evaluate(() => {
    const g = (window as any).__game;
    g.engine.state.waveTimer = 0.01; g.engine.state.wave = 12; // 다음 웨이브 = 13 (새벽 3시)
  });
  await page.waitForTimeout(2500);
  await page.screenshot({ path: path.join(outdir, 'reel-3am.png') });
  await page.evaluate(() => {
    const g = (window as any).__game;
    g.engine.state.waveTimer = 0.01; g.engine.state.wave = 19; // 다음 = 20 보스
  });
  await page.waitForTimeout(4500);
  await page.screenshot({ path: path.join(outdir, 'reel-boss.png') });
  // 게임오버 강제
  await page.evaluate(() => {
    const g = (window as any).__game;
    g.engine.state.hp = 1;
    g.engine.state.units = []; g.engine.state.slots.forEach((s: any) => (s.unitId = null));
  });
  await page.waitForSelector('.gameover', { timeout: 90000 });
  await page.waitForTimeout(800);
  await page.screenshot({ path: path.join(outdir, 'gameover.png') });
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('cvs-night-shift:v1') ?? 'null'));
  console.log('save after gameover:', JSON.stringify({ bestWave: saved?.bestWave, totalPlays: saved?.totalPlays, metaPoints: saved?.metaPoints, unlocked: saved?.unlockedUnits?.length }));
  await page.getByText('다시 하기').click();
  await page.waitForTimeout(1000);
  const restarted = await page.evaluate(() => { const s = (window as any).__game.engine.state; return { wave: s.wave, hp: s.hp, phase: s.phase }; });
  console.log('restarted:', JSON.stringify(restarted));
  await page.reload({ waitUntil: 'networkidle' });
  await page.screenshot({ path: path.join(outdir, 'start-after-reload.png') });
  const recordText = await page.locator('.records').innerText();
  console.log('records after reload:', recordText.replace(/\n/g, ' | '));
  // 메타 상점 구매
  await page.getByText('강화').click();
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(outdir, 'shop.png') });
  const buy = page.locator('.shop-buy:not(.disabled)').first();
  if ((await buy.count()) > 0) { await buy.click(); await page.waitForTimeout(300); }
  const saved2 = await page.evaluate(() => JSON.parse(localStorage.getItem('cvs-night-shift:v1') ?? 'null'));
  console.log('meta after buy:', JSON.stringify(saved2?.metaLevels), 'points', saved2?.metaPoints);
  await page.getByText('도감').click();
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(outdir, 'codex.png') });
  console.log('console errors:', errors.length, errors.slice(0, 5));
  await browser.close();
}
main();
