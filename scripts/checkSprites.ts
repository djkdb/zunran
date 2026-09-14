// 스프라이트 파일 검증: npx tsx scripts/checkSprites.ts src/game/render/sprites/units1.ts
import { validateSprite } from '../src/game/render/spriteTypes';
import type { SpriteSheet } from '../src/game/render/spriteTypes';
import path from 'node:path';

async function main() {
  const files = process.argv.slice(2);
  if (files.length === 0) {
    console.error('usage: tsx scripts/checkSprites.ts <file.ts> [...]');
    process.exit(2);
  }
  let total = 0;
  let bad = 0;
  for (const f of files) {
    const mod = await import(path.resolve(f));
    for (const [exportName, sheet] of Object.entries(mod)) {
      if (!sheet || typeof sheet !== 'object') continue;
      for (const [key, sprite] of Object.entries(sheet as SpriteSheet)) {
        total++;
        const errs = validateSprite(key, sprite);
        if (errs.length) {
          bad++;
          console.log(`[${exportName}] ${errs.join('\n')}`);
        }
      }
    }
  }
  console.log(`${total} sprites checked, ${bad} invalid`);
  process.exit(bad ? 1 : 0);
}
main();
