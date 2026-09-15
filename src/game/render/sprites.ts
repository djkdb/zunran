import type { PixelSprite, SpriteSheet } from './spriteTypes';
import { BASE_SPRITES } from './sprites/base';
import { UNITS1_SPRITES } from './sprites/units1';
import { UNITS2_SPRITES } from './sprites/units2';
import { ENEMY_SPRITES } from './sprites/enemies';

// 모든 스프라이트 시트를 하나로 합친다.
const SHEETS: SpriteSheet[] = [BASE_SPRITES, UNITS1_SPRITES, UNITS2_SPRITES, ENEMY_SPRITES];

const REGISTRY: SpriteSheet = Object.assign({}, ...SHEETS);

export function registerSheet(sheet: SpriteSheet): void {
  Object.assign(REGISTRY, sheet);
  rasterCache.clear();
}

export function getSprite(key: string): PixelSprite | undefined {
  return REGISTRY[key];
}

export function hasSprite(key: string): boolean {
  return key in REGISTRY;
}

// 스프라이트를 1:1 픽셀 캔버스로 래스터화해 캐시한다. drawImage 로 확대하면 (smoothing off) 픽셀이 또렷하다.
const rasterCache = new Map<string, HTMLCanvasElement>();

export function rasterize(key: string, tint?: string): HTMLCanvasElement | null {
  const cacheKey = tint ? `${key}#${tint}` : key;
  const cached = rasterCache.get(cacheKey);
  if (cached) return cached;
  const s = REGISTRY[key];
  if (!s) return null;
  const c = document.createElement('canvas');
  c.width = s.w;
  c.height = s.h;
  const ctx = c.getContext('2d')!;
  for (let y = 0; y < s.h; y++) {
    const row = s.rows[y];
    for (let x = 0; x < s.w; x++) {
      const ch = row[x];
      if (ch === '.' || ch === undefined) continue;
      ctx.fillStyle = tint ?? s.palette[ch] ?? '#ff00ff';
      ctx.fillRect(x, y, 1, 1);
    }
  }
  rasterCache.set(cacheKey, c);
  return c;
}

// 스프라이트가 없을 때의 대체 그리기 (색 블록 + 글자). 스프라이트 누락이 게임을 멈추지 않게 한다.
export function drawFallback(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, color: string, label: string): void {
  ctx.save();
  ctx.fillStyle = color;
  ctx.strokeStyle = '#111827';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.rect(x - size / 2, y - size, size, size);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#111827';
  ctx.font = `bold ${Math.floor(size * 0.45)}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label.slice(0, 2), x, y - size / 2);
  ctx.restore();
}
