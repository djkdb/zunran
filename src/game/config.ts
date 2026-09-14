// 게임 전역 상수. 밸런스 수치는 여기와 data/*.ts 에서만 조정한다.
import type { Rarity, Tier } from './types';

export const FIELD_W = 640;
export const FIELD_H = 640;

// 손님 이동 경로 (S자). 입구(좌상) → 음료 코너 → 과자 코너 → 라면 코너 → 계산대.
// 픽셀 좌표는 640x640 논리 좌표계.
export const PATH: { x: number; y: number }[] = [
  { x: 52, y: -30 }, // 화면 밖 입구
  { x: 52, y: 118 }, // 음료 코너 진입
  { x: 588, y: 118 }, // 음료 코너 끝
  { x: 588, y: 276 }, // 과자 코너로 내려감
  { x: 52, y: 276 }, // 과자 코너 끝
  { x: 52, y: 434 }, // 라면 코너로
  { x: 588, y: 434 }, // 라면 코너 끝
  { x: 588, y: 582 }, // 계산대 줄
  { x: 335, y: 582 }, // 계산대
];

export const AISLE_NAMES = ['음료 코너', '과자 코너', '라면 코너'];

// 경로 누적 길이 (dist → 좌표 변환용)
export const PATH_SEGMENTS = (() => {
  const segs: { x0: number; y0: number; x1: number; y1: number; len: number; start: number }[] = [];
  let acc = 0;
  for (let i = 0; i < PATH.length - 1; i++) {
    const a = PATH[i];
    const b = PATH[i + 1];
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    segs.push({ x0: a.x, y0: a.y, x1: b.x, y1: b.y, len, start: acc });
    acc += len;
  }
  return segs;
})();
export const PATH_LENGTH = PATH_SEGMENTS.reduce((s, seg) => s + seg.len, 0);

// 라면 코너 시작 지점 (라면 손님이 머무는 곳)
export const RAMEN_CORNER_DIST = (() => {
  // 라면 코너(세 번째 가로 통로)의 중간 지점
  const seg = PATH_SEGMENTS[5];
  return seg.start + seg.len * 0.5;
})();

export function pathPos(dist: number): { x: number; y: number; facing: 1 | -1 } {
  if (dist <= 0) {
    return { x: PATH[0].x, y: PATH[0].y + dist, facing: 1 };
  }
  for (const seg of PATH_SEGMENTS) {
    if (dist <= seg.start + seg.len) {
      const t = (dist - seg.start) / seg.len;
      const facing: 1 | -1 = seg.x1 >= seg.x0 ? 1 : -1;
      return { x: seg.x0 + (seg.x1 - seg.x0) * t, y: seg.y0 + (seg.y1 - seg.y0) * t, facing };
    }
  }
  const last = PATH[PATH.length - 1];
  return { x: last.x, y: last.y, facing: -1 };
}

// 유닛 슬롯: 진열대 3줄 × 7칸 = 21칸. 통로 사이에 위치.
export const SLOT_ROWS = [197, 355, 510];
export const SLOT_COLS = [118, 186, 254, 322, 390, 458, 526];
export const SLOT_POSITIONS = SLOT_ROWS.flatMap((y, row) => SLOT_COLS.map((x) => ({ x, y, row })));
export const TOTAL_SLOTS = SLOT_POSITIONS.length;
export const SLOT_HIT_RADIUS = 34;

// ───────────── 경제 ─────────────
export const START_COINS = 300;
export const START_HP = 100;
export const DRAW_BASE_COST = 100;
export const DRAW_COST_STEP = 10; // 뽑기마다 +10
export const DRAW_COST_CAP = 400;
export const SELL_REFUND: Record<Rarity, number> = {
  common: 40,
  rare: 90,
  epic: 220,
  legendary: 600,
  special: 400,
};

export function drawCost(drawCount: number, reduce: number): number {
  return Math.max(30, Math.min(DRAW_COST_CAP, DRAW_BASE_COST + DRAW_COST_STEP * drawCount) - reduce);
}

// ───────────── 뽑기 확률 ─────────────
export const BASE_RARITY_ODDS: Record<Exclude<Rarity, 'special'>, number> = {
  common: 0.6,
  rare: 0.28,
  epic: 0.1,
  legendary: 0.02,
};

export const RARITY_MULT: Record<Rarity, number> = {
  common: 1,
  rare: 2.2,
  epic: 5,
  legendary: 14,
  special: 9,
};

export const RARITY_LABEL: Record<Rarity, string> = {
  common: '일반',
  rare: '희귀',
  epic: '에픽',
  legendary: '전설',
  special: '특수',
};

export const RARITY_COLOR: Record<Rarity, string> = {
  common: '#b8c4d6',
  rare: '#4fc3f7',
  epic: '#c77dff',
  legendary: '#ffd166',
  special: '#ff7eb6',
};

// ───────────── 티어 스케일 ─────────────
export const TIER_DMG_MULT = 3.2;
export const MAX_TIER: Tier = 5;
export function tierDmgMult(tier: Tier): number {
  return Math.pow(TIER_DMG_MULT, tier - 1);
}
export function tierRangeBonus(tier: Tier): number {
  return (tier - 1) * 8;
}
export function tierIntervalMult(tier: Tier): number {
  return Math.pow(0.96, tier - 1);
}

// ───────────── 합성 확률 ─────────────
export const MERGE_ODDS = { upgrade: 0.7, promote: 0.25, special: 0.05 };

// ───────────── 웨이브 ─────────────
export const WAVE_DURATION = 22;
export const BOSS_WAVE_DURATION = 36;
export const BOSS_WAVES = [10, 20, 30, 40];
export const THREE_AM_WAVE = 13; // 00:00 시작, 웨이브당 15분 → 웨이브 13 시작 시각 = 03:00
export const MINUTES_PER_WAVE = 15;
export const EASY_WAVES = 3;

export function isBossWave(w: number): boolean {
  return w >= 10 && w % 10 === 0;
}

// 체력 스케일: 웨이브 10 ≈ 3.7x, 20 ≈ 8.6x, 30 ≈ 15.7x, 40 ≈ 25x, 이후 x1.08/웨이브
export function enemyHpScale(wave: number): number {
  const w = Math.max(1, wave);
  let s = 1 + 0.16 * w + 0.011 * w * w;
  if (w > 40) s *= Math.pow(1.08, w - 40);
  return s;
}
export function enemyBountyScale(wave: number): number {
  return 1 + wave * 0.035;
}
export function waveClearBonus(wave: number): number {
  return 40 + wave * 8;
}

// ───────────── 이벤트 ─────────────
export const EVENT_START_WAVE = 3;
export const EVENT_INTERVAL: [number, number] = [32, 48];

// ───────────── 기타 ─────────────
export const PROJECTILE_SPEED = 420;
export const CHECKOUT_POS = { x: 335, y: 600 };
export const LOW_HP_THRESHOLD = 0.25;
export const MAX_ENEMIES_ON_FIELD = 140; // 성능 보호: 초과분은 스폰 지연

export function formatClock(wave: number, waveElapsed: number, waveDuration: number): string {
  const totalMin = (wave - 1) * MINUTES_PER_WAVE + Math.floor((waveElapsed / waveDuration) * MINUTES_PER_WAVE);
  const h = Math.floor(totalMin / 60) % 24;
  const m = totalMin % 60;
  const ampm = h < 12 ? 'AM' : 'PM';
  const hh = h % 12 === 0 ? 12 : h % 12;
  return `${String(hh).padStart(2, '0')}:${String(m).padStart(2, '0')} ${ampm}`;
}

export function formatTime(sec: number): string {
  const s = Math.floor(sec);
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, '0')}`;
}
