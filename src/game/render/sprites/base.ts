import type { SpriteSheet } from '../spriteTypes';

// 기준 예시 스프라이트. 다른 스프라이트 파일도 같은 스타일(16x16, 2px 두께 어두운 외곽선, 오른쪽을 바라봄)을 따른다.
export const BASE_SPRITES: SpriteSheet = {
  // 삼각김밥: 흰 삼각형 + 검은 김 띠
  onigiri: {
    w: 16,
    h: 16,
    palette: { k: '#1f2937', w: '#ffffff', g: '#e5e7eb', b: '#111827', s: '#f3f4f6' },
    rows: [
      '................',
      '.......kk.......',
      '......kwwk......',
      '.....kwwwwk.....',
      '.....kwswwk.....',
      '....kwwwwwwk....',
      '....kwwwwwwk....',
      '...kwwwwwwwwk...',
      '...kwwbbbbwwk...',
      '..kwwwbbbbwwwk..',
      '..kwwwbbbbwwwk..',
      '.kwwwwbbbbwwwwk.',
      '.kggwwbbbbwwggk.',
      'kggggggggggggggk',
      'kkkkkkkkkkkkkkkk',
      '................',
    ],
  },
  // 기본 손님: 검은 머리, 회색 후드, 오른쪽을 봄
  e_basic: {
    w: 16,
    h: 16,
    palette: { k: '#111827', h: '#1f2937', f: '#fcd9b6', e: '#111827', c: '#94a3b8', d: '#64748b', p: '#334155', s: '#e2e8f0' },
    rows: [
      '................',
      '.....kkkkkk.....',
      '....khhhhhhk....',
      '....khhhhhhk....',
      '....kffffffk....',
      '....kfeffefk....',
      '....kffffffk....',
      '.....kffffk.....',
      '....kccccccck...',
      '...kcccccccck...',
      '...kcsccccsck...',
      '...kcccccccck...',
      '....kddddddk....',
      '....kppkkppk....',
      '....kppk.kppk...',
      '....kkkk.kkkk...',
    ],
  },
  p_generic: {
    w: 6,
    h: 6,
    palette: { w: '#ffffff', y: '#fde68a' },
    rows: ['.wwww.', 'wyyyyw', 'wyyyyw', 'wyyyyw', 'wyyyyw', '.wwww.'],
    anchorX: 0.5,
    anchorY: 0.5,
  },
};
