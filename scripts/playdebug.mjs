import { chromium } from 'playwright';
const URL = 'http://127.0.0.1:4173/';
const SP = process.env.SHOT_DIR ?? '/tmp/';
const issues = [];
const log = [];

async function checkLayout(p, label) {
  const r = await p.evaluate(() => {
    const out = { overflowX: 0, clipped: [], tiny: [], offscreen: [] };
    const de = document.documentElement;
    out.overflowX = de.scrollWidth - de.clientWidth;
    // 잘리는 텍스트: scrollWidth > clientWidth 이면서 ellipsis 도 아닌 것
    document.querySelectorAll('button, .inv-name, .draw-title, .draw-cost, .hud-coin, .skill-text b, .merge-label, .selected-name, .reward-name, .gameover-stats b, .records b, .shop-name').forEach(el => {
      const cs = getComputedStyle(el);
      if (el.scrollWidth > el.clientWidth + 2 && cs.textOverflow !== 'ellipsis' && cs.overflow !== 'hidden') {
        out.clipped.push((el.className || el.tagName) + ' :: ' + (el.textContent || '').trim().slice(0, 24));
      }
      if (el.scrollHeight > el.clientHeight + 2 && cs.overflow === 'hidden' && !cs.webkitLineClamp) {
        out.clipped.push('H ' + (el.className || el.tagName) + ' :: ' + (el.textContent || '').trim().slice(0, 24));
      }
    });
    // 터치 타깃이 너무 작은 버튼
    document.querySelectorAll('button:not([disabled])').forEach(el => {
      const b = el.getBoundingClientRect();
      if (b.width > 0 && (b.height < 30 || b.width < 30)) out.tiny.push((el.className||'') + ' ' + Math.round(b.width) + 'x' + Math.round(b.height));
      if (b.top < -2 || b.bottom > window.innerHeight + 2 || b.left < -2 || b.right > window.innerWidth + 2) {
        out.offscreen.push((el.className||el.tagName) + ' ' + Math.round(b.top) + ',' + Math.round(b.bottom));
      }
    });
    return out;
  });
  if (r.overflowX > 0) issues.push(`[${label}] 가로 넘침 ${r.overflowX}px`);
  r.clipped.forEach(c => issues.push(`[${label}] 텍스트 잘림: ${c}`));
  [...new Set(r.tiny)].forEach(c => issues.push(`[${label}] 작은 터치 타깃: ${c}`));
  return r;
}

async function snap(p) {
  return p.evaluate(() => {
    const t = (s) => document.querySelector(s)?.textContent?.trim() ?? null;
    return {
      wave: t('.hud-wave-num'), hp: t('.hud-hp-num'), coin: t('.hud-coin'),
      cost: t('.draw-cost'), slots: t('.draw-slots'),
      units: document.querySelectorAll('.inv-chip').length,
      merge: document.querySelectorAll('.merge-btn').length,
      reward: !!document.querySelector('.reward-overlay'),
      over: !!document.querySelector('.gameover'),
      drawDisabled: document.querySelector('.draw-btn')?.className.includes('disabled'),
    };
  });
}

const b = await chromium.launch({ executablePath: process.env.CHROME_PATH });
const p = await b.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
p.on('console', m => { if (m.type()==='error' && !/CERT_AUTHORITY|fonts.googleapis/.test(m.text())) issues.push('콘솔 에러: ' + m.text()); });
p.on('pageerror', e => issues.push('페이지 예외: ' + e.message));

await p.goto(URL, { waitUntil: 'networkidle' });
await checkLayout(p, '시작화면');

// --- 첫 판: 초보자처럼 ---
await p.getByText('야간 근무 시작').click();
await p.waitForTimeout(500);
await checkLayout(p, '게임시작');

const field = await p.locator('.field-canvas').boundingBox();
const tapField = async (fx, fy) => { await p.mouse.click(field.x + field.width*fx, field.y + field.height*fy); };

let t0 = Date.now(), rewardsSeen = 0, lastWave = 0;
for (let i = 0; i < 400; i++) {
  await p.waitForTimeout(500);
  const s = await snap(p);
  if (s.reward) {
    rewardsSeen++;
    await checkLayout(p, '보상화면');
    await p.locator('.reward-card').nth(i % 3).click();
    await p.waitForTimeout(200);
    continue;
  }
  if (s.over) { log.push(`게임오버 @ ${((Date.now()-t0)/1000).toFixed(0)}s, wave ${lastWave}`); break; }
  if (s.wave && +s.wave !== lastWave) {
    lastWave = +s.wave;
    log.push(`w${s.wave} hp=${s.hp} coin=${s.coin} cost=${s.cost} units=${s.units} t=${((Date.now()-t0)/1000).toFixed(0)}s`);
    if (lastWave <= 3 || lastWave % 7 === 0) await checkLayout(p, 'w'+s.wave);
  }
  // 합성 먼저
  if (s.merge > 0) { await p.locator('.merge-btn').first().click({force:true}); await p.waitForTimeout(250); continue; }
  // 뽑고 배치
  if (!s.drawDisabled) {
    await p.locator('.draw-btn').click({force:true});
    await p.waitForTimeout(350);
    // 뽑은 유닛을 원하는 칸에 배치해 보기 (첫 줄 = 사거리 보너스)
    await tapField(0.2 + (i%5)*0.13, 0.32);
    await p.waitForTimeout(200);
    continue;
  }
  // 스킬은 손님이 많을 때만
  const ready = await p.evaluate(() => ({
    sh: !document.querySelector('.skill-btn.shutter')?.disabled,
    du: !document.querySelector('.skill-btn.dump')?.disabled,
  }));
  if (ready.du && Math.random() < 0.15) { await p.locator('.skill-btn.dump').click({force:true}); }
  else if (ready.sh && Math.random() < 0.15) { await p.locator('.skill-btn.shutter').click({force:true}); }
}

const over = await p.locator('.gameover').count();
if (over) {
  await checkLayout(p, '게임오버');
  await p.screenshot({ path: SP + 'dbg-gameover.png' });
} else {
  log.push('400틱(약 3.5분) 안에 안 죽음 — 현재 wave ' + lastWave);
  await p.screenshot({ path: SP + 'dbg-late.png' });
}
console.log('--- 타임라인 ---');
console.log(log.join('\n'));
console.log('--- 문제 (' + [...new Set(issues)].length + ') ---');
console.log([...new Set(issues)].join('\n'));
console.log('보상 선택 횟수:', rewardsSeen);
await b.close();
