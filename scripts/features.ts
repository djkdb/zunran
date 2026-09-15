// 신규 기능 검증: 첫 판 힌트, 자동 합성, 정리 판매, 다음 보스 표시, 결과 복사
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

async function main() {
  const [url = 'http://localhost:4173', outdir = 'shots'] = process.argv.slice(2);
  fs.mkdirSync(outdir, { recursive: true });
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, permissions: ['clipboard-read', 'clipboard-write'] });
  const page = await context.newPage();
  const errors: string[] = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.getByText('야간 근무 시작').click();
  await page.waitForTimeout(400);
  console.log('hint1:', await page.locator('.hint').textContent());
  await page.screenshot({ path: path.join(outdir, 'f1-hint.png') });
  // 삼각김밥 3개 강제 → 합성 힌트
  await page.evaluate(`(() => { const s = window.__game.engine.state; for (let i = 0; i < 3; i++) { const u = { id: s.nextId++, defId: 'onigiri', tier: 1, slot: i, cooldown: 0, skillCd: 0, disabledUntil: 0, buffs: { atkSpeed: 0, dmg: 0 }, kills: 0, damage: 0, bornAt: 0, lastAttackAt: -10, facing: 1 }; s.units.push(u); s.slots[i].unitId = u.id; } })()`);
  await page.waitForTimeout(300);
  console.log('hint2:', await page.locator('.hint').textContent());
  // 자동 합성 ON → 자동으로 합쳐짐
  await page.getByText('자동 합성 OFF').click();
  await page.waitForTimeout(900);
  const afterAuto = await page.evaluate(`window.__game.engine.state.units.map(u => u.defId + '*' + u.tier)`);
  console.log('after auto merge:', JSON.stringify(afterAuto));
  await page.screenshot({ path: path.join(outdir, 'f2-automerge.png') });
  // 정리: 짝 없는 일반 티어1 2개 + 희귀 1개 강제
  await page.evaluate(`(() => { const s = window.__game.engine.state; [['alba', 5], ['fridge', 6], ['pos', 7]].forEach(([d, sl]) => { const u = { id: s.nextId++, defId: d, tier: 1, slot: sl, cooldown: 0, skillCd: 0, disabledUntil: 0, buffs: { atkSpeed: 0, dmg: 0 }, kills: 0, damage: 0, bornAt: 0, lastAttackAt: -10, facing: 1 }; s.units.push(u); s.slots[sl].unitId = u.id; }); })()`);
  await page.waitForTimeout(300);
  const junkBtn = page.locator('.quick-btn', { hasText: '정리' });
  console.log('junk button:', (await junkBtn.textContent())?.trim());
  const coinsBefore = await page.evaluate(`window.__game.engine.state.coins`);
  await junkBtn.click();
  await page.waitForTimeout(300);
  const afterJunk = await page.evaluate(`({ units: window.__game.engine.state.units.map(u => u.defId), coins: window.__game.engine.state.coins })`);
  console.log('after junk:', JSON.stringify(afterJunk), 'coins before', coinsBefore);
  // 다음 보스 표시
  await page.evaluate(`(() => { const s = window.__game.engine.state; s.waveTimer = 0.01; s.wave = 8; })()`);
  await page.waitForTimeout(600);
  console.log('next boss label:', await page.locator('.hud-next-boss').count());
  await page.screenshot({ path: path.join(outdir, 'f3-nextboss.png') });
  // 게임오버 → 결과 복사
  await page.evaluate(`(() => { const s = window.__game.engine.state; s.hp = 1; s.units = []; s.slots.forEach(sl => (sl.unitId = null)); s.spawnQueue = []; })()`);
  await page.evaluate(`(() => { const g = window.__game; g.engine.state.enemies.forEach(e => { e.dist = 2400; }); })()`);
  await page.waitForSelector('.gameover', { timeout: 60000 });
  await page.waitForTimeout(700);
  await page.getByText('결과 복사').click();
  await page.waitForTimeout(300);
  const clip = await page.evaluate(`navigator.clipboard.readText()`);
  console.log('clipboard:', JSON.stringify(clip));
  await page.screenshot({ path: path.join(outdir, 'f4-gameover.png') });
  // 두 번째 판: 힌트가 안 보여야 함
  await page.getByText('다시 하기').click();
  await page.waitForTimeout(500);
  console.log('hint on 2nd run:', await page.locator('.hint').count());
  console.log('errors:', errors);
  await browser.close();
}
main();
