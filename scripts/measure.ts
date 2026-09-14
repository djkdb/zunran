// 레이아웃 측정: 필드 정사각 여부, 캔버스 backing, 코인 큰 값일 때 HUD 넘침
import { chromium } from 'playwright';
async function main() {
  const [url] = process.argv.slice(2);
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined });
  for (const [w, h] of [[360, 740], [667, 375], [1280, 800], [390, 844]]) {
    const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 2 });
    await page.goto(url, { waitUntil: 'networkidle' });
    await page.getByText('야간 근무 시작').click();
    await page.waitForTimeout(300);
    await page.evaluate('window.__game.engine.state.coins = 123456');
    await page.waitForTimeout(300);
    const m = await page.evaluate(`(() => {
      const r = (sel) => { const b = document.querySelector(sel).getBoundingClientRect(); return Math.round(b.width) + 'x' + Math.round(b.height); };
      const c = document.querySelector('canvas');
      const ctrl = document.querySelector('.ctrl').getBoundingClientRect();
      return { game: r('.game'), field: r('.field'), canvas: c.width + 'x' + c.height, scrollW: document.querySelector('.game').scrollWidth, coins: document.querySelector('.hud-coins').textContent, ctrl: Math.round(ctrl.width) + 'x' + Math.round(ctrl.height) };
    })()`);
    console.log(`${w}x${h}`, JSON.stringify(m));
    await page.close();
  }
  await browser.close();
}
main();
