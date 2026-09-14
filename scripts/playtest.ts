// 브라우저 자동 플레이테스트: 시작 → 뽑기 → 플레이 → 스크린샷 → 콘솔 에러 수집.
// 사용: (vite preview 실행 중) npx tsx scripts/playtest.ts http://localhost:4173 outdir [portrait|landscape] [seconds]
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

async function main() {
  const [url = 'http://localhost:4173', outdir = 'shots', mode = 'landscape', secondsArg = '60'] = process.argv.slice(2);
  const seconds = Number(secondsArg);
  fs.mkdirSync(outdir, { recursive: true });
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const viewport = mode === 'portrait' ? { width: 390, height: 844 } : { width: 1280, height: 800 };
  const context = await browser.newContext({ viewport, deviceScaleFactor: 2, isMobile: mode === 'portrait', hasTouch: mode === 'portrait' });
  const page = await context.newPage();
  const errors: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error' || m.type() === 'warning') errors.push(`[${m.type()}] ${m.text()}`);
  });
  page.on('pageerror', (e) => errors.push(`[pageerror] ${e.message}`));
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.screenshot({ path: path.join(outdir, `${mode}-0-start.png`) });
  await page.getByText('야간 근무 시작').click();
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(outdir, `${mode}-1-game.png`) });

  // 자동 플레이: 0.5초마다 뽑기/합성 시도 (실제 UI 버튼 클릭)
  const t0 = Date.now();
  let shots = 2;
  while ((Date.now() - t0) / 1000 < seconds) {
    const over = await page.locator('.gameover').count();
    if (over > 0) break;
    const merge = page.locator('.merge-btn').first();
    if ((await merge.count()) > 0) await merge.click({ timeout: 500 }).catch(() => {});
    const draw = page.locator('.draw-btn:not(.disabled)');
    if ((await draw.count()) > 0) await draw.click({ timeout: 500 }).catch(() => {});
    await page.waitForTimeout(600);
    const elapsed = (Date.now() - t0) / 1000;
    if (elapsed > (shots - 1) * 15) {
      await page.screenshot({ path: path.join(outdir, `${mode}-${shots}-t${Math.round(elapsed)}.png`) });
      shots++;
    }
  }
  const snap = await page.evaluate(() => {
    const g = (window as unknown as { __game?: { engine: { state: { wave: number; hp: number; coins: number; units: unknown[]; enemies: unknown[]; stats: unknown; phase: string } } } }).__game;
    if (!g) return null;
    const s = g.engine.state;
    return { wave: s.wave, hp: s.hp, coins: s.coins, units: s.units.length, enemies: s.enemies.length, phase: s.phase, stats: s.stats };
  });
  await page.screenshot({ path: path.join(outdir, `${mode}-final.png`) });
  console.log('state:', JSON.stringify(snap));
  console.log('console errors/warnings:', errors.length);
  for (const e of errors.slice(0, 20)) console.log('  ' + e);
  const saved = await page.evaluate(() => localStorage.getItem('cvs-night-shift:v1'));
  console.log('save:', saved);
  await browser.close();
}
main();
