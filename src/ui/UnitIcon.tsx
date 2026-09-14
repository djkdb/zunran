import { useEffect, useRef } from 'react';
import { rasterize } from '../game/render/sprites';
import { UNIT_BY_ID } from '../game/data/units';
import { ENEMY_BY_ID } from '../game/data/enemies';
import { RARITY_COLOR } from '../game/config';

// 패널/도감용 작은 아이콘. 스프라이트를 캔버스에 확대해 그린다 (픽셀 유지).
export function UnitIcon({ defId, size = 36, enemy = false, dim = false }: { defId: string; size?: number; enemy?: boolean; dim?: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const def = enemy ? ENEMY_BY_ID[defId] : UNIT_BY_ID[defId];
  useEffect(() => {
    const c = ref.current;
    if (!c || !def) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    c.width = size * dpr;
    c.height = size * dpr;
    const ctx = c.getContext('2d')!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, size, size);
    ctx.imageSmoothingEnabled = false;
    const img = rasterize(def.sprite);
    if (img) {
      const s = size / Math.max(img.width, img.height);
      const w = img.width * s;
      const h = img.height * s;
      if (dim) ctx.filter = 'grayscale(1) brightness(0.4)';
      ctx.drawImage(img, (size - w) / 2, size - h, w, h);
    } else {
      ctx.fillStyle = def.color;
      ctx.beginPath();
      ctx.roundRect(4, 4, size - 8, size - 8, 6);
      ctx.fill();
      ctx.fillStyle = '#0f172a';
      ctx.font = `bold ${size * 0.4}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(def.name.slice(0, 1), size / 2, size / 2);
    }
  }, [def, size, dim]);
  if (!def) return null;
  const color = enemy ? def.color : RARITY_COLOR[(def as (typeof UNIT_BY_ID)[string]).rarity];
  return <canvas ref={ref} style={{ width: size, height: size, display: 'block', borderRadius: 6, background: dim ? '#0f172a' : `${color}22` }} aria-label={def.name} />;
}
