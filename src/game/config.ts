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

// 코너(진열대 줄)마다 배치 보너스를 준다 — "어디에 둘까"가 의미를 갖게.
// 0열 = 입구에 가까운 음료 코너, 2열 = 계산대 바로 앞 라면 코너.
export const AISLE_BONUS: { label: string; dmg: number; atkSpeed: number; range: number }[] = [
  { label: '사거리 +18', dmg: 1, atkSpeed: 1, range: 18 },
  { label: '공격속도 +12%', dmg: 1, atkSpeed: 1.12, range: 0 },
  { label: '공격력 +22%', dmg: 1.22, atkSpeed: 1, range: 0 },
];

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
export const DRAW_COST_CAP = 420;
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

// 간판 팔레트: 납작한 원색. 어두운 필드 위에서도 서로 확실히 구분된다.
export const RARITY_COLOR: Record<Rarity, string> = {
  common: '#8a7fb8',
  rare: '#4fe3d0',
  epic: '#c77dff',
  legendary: '#ffd84d',
  special: '#ff4d8d',
};

// ───────────── 티어 스케일 ─────────────
export const TIER_DMG_MULT = 3.4; // 합성 3개 → 1개가 확실한 이득이 되도록 (시뮬: 합성 유무 차이 확보)
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
// 밤이 깊어질수록 손님이 몰아친다: 웨이브 간격이 22초에서 14초까지 줄어든다.
// 다만 초반 10웨이브는 아직 위협이 없어 기다리는 시간이 되므로 짧게 끊는다.
// (1웨이브 -6초에서 시작해 10웨이브에 0이 된다. 손님 수는 그대로라 밀도만 조금 올라간다)
export function waveDuration(wave: number): number {
  const base = Math.max(14, WAVE_DURATION - (wave - 1) * 0.22);
  const earlyCut = Math.max(0, 6 - (wave - 1) * 0.7);
  return base - earlyCut;
}
export const BOSS_WAVES = [10, 20, 30, 40];
export const THREE_AM_WAVE = 13; // 00:00 시작, 웨이브당 15분 → 웨이브 13 시작 시각 = 03:00
export const MINUTES_PER_WAVE = 15;
export const EASY_WAVES = 3;

export function isBossWave(w: number): boolean {
  return w >= 10 && w % 10 === 0;
}

// 체력 스케일: 웨이브 10 ≈ 7.6x, 20 ≈ 24x, 30 ≈ 51x, 40 ≈ 87x, 이후 x1.07/웨이브
// (보상 카드로 유닛이 훨씬 강해지므로 그만큼 손님도 단단해야 한다)
// (시뮬레이션 결과 중반이 너무 쉬워 2차항을 0.011 → 0.019 로 올림)
export function enemyHpScale(wave: number): number {
  const w = Math.max(1, wave);
  let s = 1 + 0.16 * w + 0.05 * w * w;
  if (w > 40) s *= Math.pow(1.07, w - 40);
  return s;
}
// 웨이브 시작 시 기본 수입("시급"). 처치를 못 해도 최소한의 뽑기가 가능하게 해 죽음의 소용돌이를 막는다.
export function waveIncome(wave: number): number {
  return 40 + wave * 9; // 불운한 판(제어 유닛만 뽑힘)도 3웨이브에 1회는 뽑을 수 있게
}
// 계산대 도달 피해도 웨이브에 따라 커진다. 이게 없으면 후반에 손님이 뚫려도 체력이 안 깎여
// 사실상 죽지 않는 게임이 된다 (보상 카드로 회복까지 되므로).
export function enemyDamageScale(wave: number): number {
  return 1 + 0.06 * Math.max(0, wave - 1);
}

export function enemyBountyScale(wave: number): number {
  return 1 + wave * 0.025; // 후반 코인 인플레 억제
}
export function waveClearBonus(wave: number): number {
  return 40 + wave * 8;
}

// ───────────── 이벤트 ─────────────
// ───────────── 보상 / 액티브 스킬 ─────────────
// 3웨이브마다, 그리고 보스를 넘긴 직후에 보상 카드를 고른다.
export const REWARD_EVERY = 3;
export function isRewardWave(wave: number): boolean {
  return wave > 1 && (wave % REWARD_EVERY === 1 || wave % 10 === 1);
}
export const SHUTTER_COOLDOWN = 45;
export const SHUTTER_STUN = 2.5;
export const SHUTTER_PUSH = 60;
export const DUMP_COOLDOWN = 70;
export const DUMP_DAMAGE_BASE = 90; // 웨이브 스케일이 곱해진다
export const COMBO_WINDOW = 2.2; // 이 시간 안에 이어서 처치하면 콤보 유지
export const COMBO_STEP = 5; // 5연쇄마다 보너스

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
