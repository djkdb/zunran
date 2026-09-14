// 원하는 뷰포트로 게임 스크린샷 한 장: npx tsx scripts/shot.ts <url> <out.png> <width> <height>
import { chromium } from 'playwright';

async function main() {
  const [url, out, w, h] = process.argv.slice(2);
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined });
  const page = await browser.newPage({ viewport: { width: Number(w), height: Number(h) }, deviceScaleFactor: 2 });
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.getByText('야간 근무 시작').click();
  await page.waitForTimeout(300);
  for (let i = 0; i < 3; i++) {
    await page.locator('.draw-btn').click();
    await page.waitForTimeout(200);
  }
  await page.waitForTimeout(3000);
  await page.screenshot({ path: out });
  await browser.close();
}
main();
