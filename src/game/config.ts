// 게임 전역 상수. 밸런스 수치는 여기와 data/*.ts 에서만 조정한다.
import type { Rarity, Tier, UnitRole } from './types';

export const FIELD_W = 640;
export const FIELD_H = 640;

// 진열대 상한. 실제 배치(줄 수·칸 수·좌표)는 지점마다 다르다 (data/stages.ts).
// 여기 남은 값은 "가장 큰 매장이 몇 칸인가" — 증축 단계 수를 정하는 기준이다.
export const MAX_ROWS = 3;
export const MAX_COLS = 7;
export const TOTAL_SLOTS = MAX_ROWS * MAX_COLS;

// ───────────── 진열대 증축 ─────────────
// 처음부터 21칸을 다 주면 메타 강화가 체감되지 않는다.
// 실측: 강화 0레벨 중앙값 27웨이브 / 만렙 33웨이브 — 70단계를 다 사도 +22% 뿐이었다.
// 로그라이트의 계약은 "처음엔 벽에 부딪히고, 벌어서 강화하면 뚫린다"인데
// 그 벽이 없었다. 칸은 눈에 보이는 성장이라 이 역할에 가장 맞는다.
//
// 가운데 열부터 시작해서 바깥으로 넓힌다 (순서는 stages.ts 의 unlockOrderFor).
// 모든 줄(코너)은 처음부터 열려 있어야 "어디에 둘까"라는 결정이 첫 판부터 존재한다.
export const START_SLOTS = 9; // 가운데 3열 × 3줄
export const MAX_SHELF_LEVEL = TOTAL_SLOTS - START_SLOTS; // 9 → 21칸까지 12단계
export const SLOT_HIT_RADIUS = 34;

// ───────────── 경제 ─────────────
export const START_COINS = 200;
export const START_HP = 100;
export const DRAW_BASE_COST = 100;
export const DRAW_COST_STEP = 12; // 뽑기마다 +12 (선형 항)
export const DRAW_COST_ACCEL = 0.35; // 제곱 항. 뽑을수록 가속해서 비싸진다
export const SELL_REFUND: Record<Rarity, number> = {
  common: 40,
  rare: 90,
  epic: 220,
  legendary: 600,
  special: 400,
};

// 뽑기 비용에는 상한이 없다.
// 예전에는 420원에서 멈췄는데, 그 결과 웨이브 27에 잔고가 44,361원(109회분)이 쌓여
// "뽑을까 아낄까"라는 결정이 게임에서 사라졌다 (측정: docs/AUDIT.md 문제 1).
// 제곱 항을 넣어 후반에도 코인이 계속 자원으로 남게 한다.
// ── 전문점 ──
//
// 계측(scripts/threats.ts, 40판)에서 나온 문제: 12웨이브부터 칸 점유율이 89% 에
// 붙박이고, 그때부터 판당 판매가 23회 · 합성이 9회다. 후반 조작의 대부분이
// "뭘 팔아 자리를 만들까" 다. 특화 빌드로 가려면 여기서 더 팔아야 하는데,
// 뽑기는 25종 전체에서 나오므로 원하는 계열은 네 번에 한 번만 온다.
// 그래서 "아무거나 계속 뽑기" 가 제일 편한 전략이 된다.
//
// 보드가 한 계열로 모이면 그 계열 물건이 더 자주 들어오게 한다. 편의점이
// 주력 상품군을 정하면 그쪽 발주가 늘어나는 것과 같다.
//
// 공짜가 아니다 — 다른 계열이 그만큼 안 온다. 웨이브 테마(급한 손님/단체/
// 두꺼운 손님)가 내 계열의 약점을 찌르면 뽑기로는 못 빠져나온다.
// 그때는 본사 발주(등급 지정·유료)나 합성으로 풀어야 한다.
export const FOCUS_MIN_UNITS = 6; // 보드가 이만큼은 차야 판정한다 (초반 두세 개로 고정되지 않게)
// 0.5 로 뒀더니 '잡탕으로 놔둔 보드' 도 우연히 넘겨서, 고르지도 않은 계열로
// 뽑기가 쏠렸다 (대조군 생존이 22 → 20 으로 떨어졌다 — 플레이어가 한 결정이
// 없는데 벌을 받은 셈이다). 표류가 아니라 '작정하고 모은' 보드만 걸리게 올린다.
export const FOCUS_THRESHOLD = 0.6;
export const FOCUS_MAX_WEIGHT = 2.6; // 보드 전체가 한 계열일 때의 가중치

/** 주력 계열의 점유율(0~1) → 뽑기 가중치. 절반 이하면 1 (아무 일도 안 일어난다). */
export function focusWeight(share: number): number {
  if (share < FOCUS_THRESHOLD) return 1;
  const t = (share - FOCUS_THRESHOLD) / (1 - FOCUS_THRESHOLD);
  return 1 + t * (FOCUS_MAX_WEIGHT - 1);
}

// ── 재고 정리와 발주 단가 ──
//
// 뽑기는 뽑을수록 제곱으로 비싸진다(DRAW_COST_ACCEL). 40번째 뽑기는 1,000원이
// 넘는데, 그 유닛을 정리해도 일반 등급 환급은 40원이다 — 되돌리는 값이 산 값의
// 4% 다. 그래서 "안 맞는 유닛을 버리고 원하는 계열로 다시 짠다" 가 사실상
// 불가능하고, 처음부터 아무거나 뽑아 쌓는 쪽이 이긴다.
//
// 「정리」로 판 유닛 수의 절반만큼 발주 횟수를 되돌린다. 재고를 비웠으니 다음
// 발주 단가가 그만큼 내려간다 — 환급액을 올리는 게 아니라 다시 짤 여지를 준다.
// 절반만 되돌리는 이유: 전부 되돌리면 뽑고-버리고를 반복해 단가 상승이 통째로
// 사라진다. 절반이면 회전은 되고 상승은 남는다.
//
// 단, 정리한 뒤 보드가 「전문점」일 때만 되돌린다.
// 조건 없이 줬더니 정반대 결과가 나왔다 (scripts/builds.ts, 30판):
// 잡탕으로 두는 대조군이 21 → 24 로 제일 크게 올랐다. 잡탕 보드는 1티어
// 외톨이가 늘 많아서 정리 버튼이 계속 눌리고, 되돌림도 계속 받기 때문이다.
// 특화 빌드는 애초에 종류가 좁아 정리할 외톨이가 적다 — 빌드 간 격차가
// 1.11배에서 1.20배로 오히려 벌어졌다. 도우려던 쪽을 벌준 셈이다.
//
// 그래서 두 가지를 하나로 묶는다: 한 계열로 모으면 (1) 그 계열이 더 자주
// 들어오고 (2) 정리할 때 발주 단가가 되돌아온다. 좁히는 것이 투자가 된다.
export const JUNK_DRAW_ROLLBACK = 0.5;

export function drawCost(drawCount: number, reduce: number): number {
  const n = drawCount;
  return Math.max(30, Math.round(DRAW_BASE_COST + DRAW_COST_STEP * n + DRAW_COST_ACCEL * n * n) - reduce);
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

export const ROLE_LABEL: Record<UnitRole, string> = {
  dps: '단일',
  aoe: '광역',
  control: '제어',
  support: '지원',
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
// 5 로 두었지만 25판 측정에서 아무도 3을 넘지 못했다.
// T4 하나를 만들려면 같은 유닛 12개가 필요한데 풀이 25종이고 판당 뽑기가 65회다.
// 즉 ★★★★★ 는 UI 에만 있고 게임에는 없는 숫자였다.
// 도달 가능한 최대치를 실제 최대치로 맞춘다. T4 = 39배(3.4³)이고,
// T3 합성이나 「승진」 보상으로 닿을 수 있다.
export const MAX_TIER: Tier = 4;
export function tierDmgMult(tier: Tier): number {
  return Math.pow(TIER_DMG_MULT, tier - 1);
}
export function tierRangeBonus(tier: Tier): number {
  return (tier - 1) * 8;
}
export function tierIntervalMult(tier: Tier): number {
  return Math.pow(0.96, tier - 1);
}

// ───────────── 합성 재료 수 ─────────────
// 전부 3개로 두었더니 티어가 사실상 2에서 멈췄다 (25판 측정: 보드의 67%가 T1,
// 판당 최고 티어 평균 2.28, T4·T5 는 한 판도 없었다).
// T5 를 만들려면 같은 유닛 81개가 필요한데 풀이 25종이니 도달 불가능한 설계였다.
// 2티어부터 2개로 낮춘다 → T3 6개 · T4 12개 · T5 24개. T3~T4 가 손에 닿고
// T5 는 로망으로 남는다. MAX_TIER 와 티어 배율은 그대로 둔다.
export function mergeCost(tier: Tier): number {
  return tier === 1 ? 3 : 2;
}

// 이 티어부터는 '종류가 달라도' 합칠 수 있다.
// 3티어 하나를 만들려면 같은 유닛 6개가 드는데, 그걸 또 2개 모으려면 12개다.
// 풀이 25종이고 판당 뽑기가 65회라 실제로 25판 중 0판이 4티어에 닿았다.
// 사다리가 T3 에서 끊기면 후반 합성이 의미를 잃는다.
// 대신 어느 쪽으로 남길지는 플레이어가 고른다 — 재료 두 개의 정체성 중 하나를 고르는 것이다.
export const MIXED_MERGE_TIER: Tier = 3;

// ───────────── 합성 확률 ─────────────
export const MERGE_ODDS = { upgrade: 0.7, promote: 0.25, special: 0.05 };

// ───────────── 웨이브 ─────────────
export const WAVE_DURATION = 18;
export const BOSS_WAVE_DURATION = 30;
// 밤이 깊어질수록 손님이 몰아친다: 웨이브 간격이 22초에서 14초까지 줄어든다.
// 다만 초반 10웨이브는 아직 위협이 없어 기다리는 시간이 되므로 짧게 끊는다.
// (1웨이브 -6초에서 시작해 10웨이브에 0이 된다. 손님 수는 그대로라 밀도만 조금 올라간다)
// 한 판이 10.2분이었다. 모바일 세션으로는 길다 (docs/AUDIT.md 9절).
// 웨이브 수를 줄이면 랭킹 기록이 리셋되므로 웨이브 '길이'를 줄인다.
export function waveDuration(wave: number): number {
  const base = Math.max(11, WAVE_DURATION - (wave - 1) * 0.2);
  const earlyCut = Math.max(0, 4 - (wave - 1) * 0.5);
  return base - earlyCut;
}
export const BOSS_WAVES = [10, 20, 30, 40];
export const THREE_AM_WAVE = 13; // 00:00 시작, 웨이브당 15분 → 웨이브 13 시작 시각 = 03:00
export const MINUTES_PER_WAVE = 15;
export const EASY_WAVES = 3;

export function isBossWave(w: number): boolean {
  return w >= 10 && w % 10 === 0;
}

// 보스와 새벽 3시 앞의 준비 시간.
//
// 시골점을 24판 재 보니 1~12웨이브 체력 손실이 거의 0인데 13웨이브(새벽 3시)에
// 한 번에 32.5 가 빠졌다. 예고는 있었지만 대비할 시간이 없었다 — 웨이브가
// 끊김 없이 이어져서, 「다음 · 보스」를 읽어도 할 수 있는 게 없었다.
// 예고 → 대비 → 시험 의 순서를 만든다.
export const PREP_SECONDS = 8;

// ───── 계산대 앞 매출 손실 ─────
//
// 난이도가 곡선이 아니라 계단이었다. 실플레이 기록:
//   W1 100 … W20 100 … W25 100 → W26 57 → W27 24 사망
// 25웨이브 동안 무피해다가 2웨이브 만에 죽는다. 손님이 계산대에 *닿을 때만*
// 피해가 나니 "다 막거나 다 뚫리거나" 가 되고, 중간이 없었다.
//
// 닿기 전에도 대가가 있어야 한다. 계산대 앞에 손님이 밀려 있으면 줄이 막혀
// 매출이 샌다 — 체력이 아니라 돈이 먼저 줄고, 돈이 줄면 뽑기가 줄고,
// 그게 다시 화력을 줄인다. 부드럽게 내려가는 대신 죽기 전에 신호가 온다.
export const NEAR_CHECKOUT_FRAC = 0.78; // 이 지점을 넘으면 '계산대 앞'
export const NEAR_DRAIN_PER_ENEMY = 0.06; // 한 명당 시급의 6%
export const NEAR_DRAIN_MAX = 0.6; // 아무리 밀려도 시급의 60%까지만

/** 계산대 앞 인원 수 → 매출 손실 비율 (0~0.6) */
export function nearDrainPct(near: number): number {
  return Math.min(NEAR_DRAIN_MAX, near * NEAR_DRAIN_PER_ENEMY);
}
export function needsPrep(wave: number): boolean {
  return wave > 1 && (isBossWave(wave) || wave === THREE_AM_WAVE);
}

// 체력 스케일: 웨이브 10 ≈ 7.6x, 20 ≈ 24x, 30 ≈ 51x, 40 ≈ 87x, 이후 x1.07/웨이브
// (보상 카드로 유닛이 훨씬 강해지므로 그만큼 손님도 단단해야 한다)
// (시뮬레이션 결과 중반이 너무 쉬워 2차항을 0.011 → 0.019 로 올림)
// 손님 체력 배율.
// 20웨이브까지는 이차식 그대로 두고(초반 체감은 건드리지 않는다), 그 뒤부터 복리로 조인다.
// 예전 값(40 이후 1.07)은 "칸이 차면 성장이 멈춘다"는 결함에 맞춰져 있었다.
// 그 결함을 고치니 플레이어가 계속 강해져 한 판이 두 배로 길어졌다.
export function enemyHpScale(wave: number): number {
  const w = Math.max(1, wave);
  // 손님 수를 1.8w → 2.3w 로 올린 만큼 개체 체력의 2차항을 낮춘다.
  // 총 압력(수 × 체력)은 웨이브 20에서 비슷하게 두고, 후반에는 낮춘다.
  // 난이도는 체력 인플레가 아니라 테마 웨이브가 내는 문제로 만든다.
  let s = 1 + 0.22 * w + 0.046 * w * w;
  // 고티어 통합 합성으로 4티어가 실제로 나오기 시작하자 플레이어 화력이 적 성장을 앞질렀다.
  // 브라우저 실측에서 28웨이브 내내 체력이 한 번도 안 깎인 판이 나왔고, 44웨이브까지 간 판도 있었다.
  // 2차항 0.038 → 0.046, 복리 1.075 → 1.095 로 되돌린다.
  if (w > 20) s *= Math.pow(1.095, w - 20);
  // 꼬리 자르기. 중앙값은 7.2분인데 스무 판에 한 번은 44웨이브 · 11분까지 간다.
  // 모바일 한 세션으로는 길다. 35웨이브 이후를 가파르게 해서 꼬리만 짧게 만든다.
  if (w > 35) s *= Math.pow(1.18, w - 35);
  return s;
}
// 웨이브 시작 시 기본 수입("시급"). 처치를 못 해도 최소한의 뽑기가 가능하게 해 죽음의 소용돌이를 막는다.
// 웨이브 3~14 동안 뽑기 가능 횟수가 0.0~0.3회였다. 첫 4분간 할 수 있는 게 없었다.
// (docs/AUDIT.md 문제 1) 시급을 올려 초반부터 웨이브당 1회는 뽑게 만든다.
export function waveIncome(wave: number): number {
  return 70 + wave * 16;
}
// 계산대 도달 피해도 웨이브에 따라 커진다. 이게 없으면 후반에 손님이 뚫려도 체력이 안 깎여
// 사실상 죽지 않는 게임이 된다 (보상 카드로 회복까지 되므로).
// 초반에 뚫린 손님 한 명이 아무 느낌이 없으면 "뚫리면 아프다"를 배울 수 없다.
// 다만 직접 두 판을 해 보니 체력이 15웨이브 동안 100이다가 한 웨이브에 41~53이
// 날아갔다. 방어가 무너지는 임계점을 넘는 순간 0명 → 20명이 한꺼번에 뚫려서다.
// 그건 곡선이 아니라 절벽이고, 플레이어에게 경고가 가지 않는다.
// 한 명당 피해를 낮춰 "조금씩 새는 구간"이 생기게 한다 — 그게 경고다.
export function enemyDamageScale(wave: number): number {
  return 1.45 + 0.028 * Math.max(0, wave - 1);
}

export function enemyBountyScale(wave: number): number {
  return 1 + wave * 0.025; // 후반 코인 인플레 억제
}
export function waveClearBonus(wave: number): number {
  return 60 + wave * 12;
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

// 밤의 단계. 웨이브 = 15분이므로 시계로 환산해 4단계로 나눈다.
// 0 초저녁(22시대) / 1 자정 이후 / 2 새벽 2시 / 3 새벽 3시 이후
export type NightPhase = 0 | 1 | 2 | 3;

export function nightPhase(wave: number): NightPhase {
  if (wave >= THREE_AM_WAVE) return 3;
  if (wave >= THREE_AM_WAVE - 4) return 2; // 02:00 무렵
  if (wave >= 5) return 1; // 00:00 무렵
  return 0;
}

export const NIGHT_PHASE_TINT: Record<NightPhase, string | null> = {
  0: null,
  1: 'rgba(30,20,80,0.05)',
  2: 'rgba(80,20,90,0.08)',
  3: 'rgba(120,20,40,0.10)',
};

export function formatTime(sec: number): string {
  const s = Math.floor(sec);
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, '0')}`;
}

// ───────────── 카운터 속성 ─────────────
// 장갑은 웨이브에 따라 커지지만 체력만큼 빠르게 오르지는 않는다 (^0.75 스케일).
// √ 로 두고 재보니 후반 한 방(200 이상) 앞에서 장갑이 24%밖에 못 막아 아무 의미가 없었다.
// ^0.75 면 웨이브 20에서 장갑 10 = 109 — 다단히트(한 방 30)는 바닥까지 막히고
// 고화력 한 방(200)은 절반이 들어간다. 그게 "무엇으로 때리는가"를 묻는 수치다.
export const ARMOR_FLOOR = 0.15; // 장갑을 뚫지 못해도 항상 15%는 들어간다
export function armorAt(armor: number, wave: number): number {
  return armor * Math.pow(enemyHpScale(wave), 0.75);
}
