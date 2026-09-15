// 사람처럼 한 판을 끝까지 플레이: 뽑기/합성/판매/배속을 UI 로 조작하고 웨이브마다 스크린샷+상태 로그.
// 사용: npx tsx scripts/playhuman.ts <url> <outdir> [maxRealSeconds]
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

async function main() {
  const [url = 'http://localhost:4173', outdir = 'shots', maxSecArg = '600'] = process.argv.slice(2);
  fs.mkdirSync(outdir, { recursive: true });
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const page = await context.newPage();
  const errors: string[] = [];
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.getByText('야간 근무 시작').click();
  await page.waitForTimeout(500);
  // 배속 x2
  await page.locator('.ctrl', { hasText: '×1' }).click();
  const log: Record<string, unknown>[] = [];
  let lastWave = 0;
  const t0 = Date.now();
  let frames: number[] = [];
  while ((Date.now() - t0) / 1000 < Number(maxSecArg)) {
    if ((await page.locator('.gameover').count()) > 0) break;
    const st = (await page.evaluate(`(() => { const s = window.__game.engine.state; const snap = window.__game.engine.snapshot();
      return { wave: s.wave, hp: s.hp, coins: s.coins, units: s.units.length, enemies: s.enemies.length, canDraw: snap.canDraw, empty: snap.emptySlots, cost: snap.drawCost, groups: snap.groups.map(g => [g.defId, g.tier, g.count, g.mergeable]), boss: snap.bossAlive, events: snap.activeEvents.map(e=>e.title) }; })()`)) as { wave: number; hp: number; coins: number; units: number; enemies: number; canDraw: boolean; empty: number; cost: number; groups: unknown[]; boss: boolean; events: string[] };
    if (st.wave !== lastWave) {
      lastWave = st.wave;
      log.push({ t: Math.round((Date.now() - t0) / 1000), ...st });
      if (st.wave % 5 === 0 || st.wave === 13 || st.wave === 3) await page.screenshot({ path: path.join(outdir, `w${String(st.wave).padStart(2, '0')}.png`) });
    }
    // 사람처럼: 합성 가능하면 합성 (버튼 클릭)
    const merge = page.locator('.merge-btn').first();
    if ((await merge.count()) > 0) { await merge.click({ timeout: 300 }).catch(() => {}); await page.waitForTimeout(150); continue; }
    // 슬롯이 꽉 찼고 코인이 충분하면: 합성 재료가 안 되는 티어1 일반 유닛 하나 판매
    if (st.empty === 0 && st.coins >= st.cost) {
      const victim = await page.evaluate(`(() => { const s = window.__game.engine.state; const rank = {common:0, rare:1, epic:2, special:3, legendary:4};
        const cnt = {}; for (const u of s.units) { const k = u.defId+'|'+u.tier; cnt[k] = (cnt[k]||0)+1; }
        const defs = ${JSON.stringify({})};
        const cands = s.units.filter(u => u.tier === 1 && cnt[u.defId+'|1'] < 2).sort((a,b) => a.damage - b.damage);
        return cands.length ? cands[0].id : null; })()`);
      if (victim !== null) {
        await page.evaluate(`window.__game.engine.dispatch({ type: 'SELECT', unitId: ${victim} })`);
        await page.waitForTimeout(150);
        const sell = page.locator('.sell-btn');
        if ((await sell.count()) > 0) await sell.click({ timeout: 300 }).catch(() => {});
        await page.waitForTimeout(150);
        continue;
      }
    }
    if (st.canDraw) { await page.locator('.draw-btn').click({ timeout: 300 }).catch(() => {}); await page.waitForTimeout(250); continue; }
    // 프레임 시간 측정
    const fps = await page.evaluate(`new Promise(r => { let n = 0; const s = performance.now(); const f = () => { n++; if (performance.now() - s > 500) r(n * 2); else requestAnimationFrame(f); }; requestAnimationFrame(f); })`);
    frames.push(fps as number);
    await page.waitForTimeout(400);
  }
  await page.screenshot({ path: path.join(outdir, 'final.png') });
  const final = await page.evaluate(`(() => { const s = window.__game.engine.state; return { wave: s.wave, hp: s.hp, kills: s.stats.kills, draws: s.stats.draws, merges: s.stats.merges, maxTier: s.stats.maxTierReached, coinsEarned: s.stats.coinsEarned, phase: s.phase, units: s.units.map(u => u.defId + '*' + u.tier) }; })()`);
  console.log('per-wave:', JSON.stringify(log.map((l) => ({ w: l.wave, t: l.t, hp: l.hp, coins: l.coins, units: l.units, enemies: l.enemies, ev: l.events, boss: l.boss }))));
  console.log('final:', JSON.stringify(final));
  console.log('fps min/avg:', Math.min(...frames), Math.round(frames.reduce((a, b) => a + b, 0) / Math.max(1, frames.length)));
  console.log('errors:', errors.length, errors.slice(0, 5));
  await browser.close();
}
main();
