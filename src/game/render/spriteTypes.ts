// 픽셀 스프라이트 포맷.
// rows: 각 문자열이 한 줄. '.' 은 투명. 나머지 문자는 palette 에서 색을 찾는다.
// 모든 행의 길이는 같아야 하며(w), 행 수는 h 와 같아야 한다.
export interface PixelSprite {
  w: number;
  h: number;
  rows: string[];
  palette: Record<string, string>;
  // 렌더 시 기준점 (0~1). 기본은 바닥 중앙 (0.5, 1)
  anchorX?: number;
  anchorY?: number;
}

export type SpriteSheet = Record<string, PixelSprite>;

export function validateSprite(key: string, s: PixelSprite): string[] {
  const errors: string[] = [];
  if (s.rows.length !== s.h) errors.push(`${key}: rows.length ${s.rows.length} != h ${s.h}`);
  s.rows.forEach((r, i) => {
    if (r.length !== s.w) errors.push(`${key}: row ${i} length ${r.length} != w ${s.w}`);
    for (const ch of r) {
      if (ch !== '.' && !(ch in s.palette)) errors.push(`${key}: row ${i} char '${ch}' not in palette`);
    }
  });
  return errors;
}
