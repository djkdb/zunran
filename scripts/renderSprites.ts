// 스프라이트 시트를 PNG 로 렌더링해서 눈으로 확인한다.
// 사용: npx tsx scripts/renderSprites.ts out.png src/game/render/sprites/base.ts [...more files]
import path from 'node:path';
import fs from 'node:fs';
import { chromium } from 'playwright';
import type { SpriteSheet } from '../src/game/render/spriteTypes';

async function main() {
  const [out, ...files] = process.argv.slice(2);
  if (!out || files.length === 0) {
    console.error('usage: tsx scripts/renderSprites.ts out.png <sprites.ts...>');
    process.exit(2);
  }
  const sprites: Record<string, unknown> = {};
  for (const f of files) {
    const mod = await import(path.resolve(f));
    for (const sheet of Object.values(mod)) {
      if (sheet && typeof sheet === 'object') Object.assign(sprites, sheet as SpriteSheet);
    }
  }
  const scale = 5;
  const cell = 24 * scale + 30;
  const cols = 6;
  const keys = Object.keys(sprites);
  const rows = Math.ceil(keys.length / cols);
  const html = `<!doctype html><body style="margin:0;background:#1e293b">
  <canvas id="c" width="${cols * cell}" height="${rows * cell + 10}"></canvas>
  <script>
  const sprites = ${JSON.stringify(sprites)};
  const c = document.getElementById('c'); const ctx = c.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  const keys = Object.keys(sprites);
  keys.forEach((k, i) => {
    const s = sprites[k];
    const cx = (i % ${cols}) * ${cell} + 10, cy = Math.floor(i / ${cols}) * ${cell} + 10;
    ctx.fillStyle = '#334155'; ctx.fillRect(cx, cy, 24 * ${scale}, 24 * ${scale});
    const ox = cx + Math.floor((24 - s.w) / 2) * ${scale}, oy = cy + (24 - s.h) * ${scale};
    s.rows.forEach((row, y) => { [...row].forEach((ch, x) => { if (ch === '.') return; ctx.fillStyle = s.palette[ch] || '#ff00ff'; ctx.fillRect(ox + x * ${scale}, oy + y * ${scale}, ${scale}, ${scale}); }); });
    ctx.fillStyle = '#fff'; ctx.font = '14px sans-serif'; ctx.fillText(k, cx, cy + 24 * ${scale} + 16);
  });
  </script></body>`;
  const tmp = path.resolve(out + '.html');
  fs.writeFileSync(tmp, html);
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined });
  const page = await browser.newPage({ viewport: { width: cols * cell, height: rows * cell + 10 } });
  await page.goto('file://' + tmp);
  await page.screenshot({ path: out });
  await browser.close();
  fs.unlinkSync(tmp);
  console.log(`rendered ${keys.length} sprites → ${out}`);
}
main();
