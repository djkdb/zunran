import type { GameState, Rarity } from '../types';
import { UNIT_BY_ID, unitsOfRarity } from './units';

// 「오늘 발주」 — 런 전 결정.
//
// 처음엔 Random Dice 식 덱(넣은 것만 나옴)으로 만들었다가 걷어냈다. 이유:
//
// 1. 덱빌딩은 '상대'를 전제한 장치다. 무엇을 이기는지가 덱의 가치인데
//    우리는 PvP 가 없다. 상대가 없으면 최적 덱 하나가 곧 정답이 되고 끝난다.
//    Random Dice 자신도 솔로 모드에서는 덱을 안 쓰고 드래프트를 쓴다.
// 2. 실측: 한 판에 만나는 유닛이 13.8종 → 8.2종. 매 뽑기마다 체감되는 손실이라
//    판끼리의 차이가 늘어난 것으로 못 갚는다. 뽑기가 '발견'에서 '배달'로 바뀐다.
// 3. 가중치(덱이 더 자주 나옴)로 완화해봤지만 그것도 접었다.
//    확률만 올리면 플레이어가 한 판 안에서 작동 여부를 알 수 없다 — 체감이 안 된다.
//
// 그래서 결정론적인 두 가지만 남겼다. 둘 다 즉시 체감된다.
//   지명(pin)  — 이 유닛은 초반에 반드시 온다. 순서를 통제하되 내용은 건드리지 않는다.
//   제외(ban)  — 이 유닛은 오늘 안 온다.
// 나머지 전부는 그대로 랜덤이다.

export const PIN_SLOTS = 2; // 지명할 수 있는 유닛 수
export const BAN_SLOTS = 2; // 제외할 수 있는 유닛 수

// 지명 보증. 한 장만 보내주면 부족하다 — 조합 레시피는 2티어(= 3장 합성)를
// 요구하므로, 지명한 물건은 초반에 '합성할 수 있을 만큼' 와야 계획이 선다.
// 1장만 보증했을 때 레시피 완성률이 8~38% 에 그쳤다.
export const PIN_TARGET_COPIES = 3;
export const PIN_GUARANTEE_DRAWS = 24;

// 같은 유닛을 이미 갖고 있으면 그 유닛이 더 잘 나온다.
// 21종 풀에서 3장 모으기가 어려운 구조적 마찰을 덱 없이 푸는 장치다.
// 플레이어에겐 "운이 따라주는 느낌"으로 체감되고, 풀은 25종 그대로 남는다.
export const DUPE_BIAS = [1, 2.2, 3.4] as const; // 보유 0개 / 1개 / 2개 이상일 때 가중치

export function dupeWeight(owned: number): number {
  return DUPE_BIAS[Math.min(owned, DUPE_BIAS.length - 1)];
}

export type Order = GameState['order'];

export const EMPTY_ORDER: Order = { pins: [], bans: [] };

// 저장된 발주를 신뢰하지 않는다. 해금 안 된 유닛, 중복, 칸 초과, 지명과 제외의
// 충돌을 전부 걷어낸다. 비어 있어도 유효하다 — 발주는 선택이지 의무가 아니다.
export function normalizeOrder(order: Partial<Order> | undefined, unlocked: string[]): Order {
  const ok = new Set(unlocked);
  const valid = (id: string) => ok.has(id) && !!UNIT_BY_ID[id] && !UNIT_BY_ID[id].mergeOnly;
  const pins = [...new Set((order?.pins ?? []).filter(valid))].slice(0, PIN_SLOTS);
  const bans = [...new Set((order?.bans ?? []).filter(valid))].filter((id) => !pins.includes(id)).slice(0, BAN_SLOTS);
  return { pins, bans };
}

// 전부 제외해서 뽑을 게 없어지는 일은 막는다.
export function bannableIn(rarity: Rarity, bans: string[]): boolean {
  const pool = unitsOfRarity(rarity);
  return pool.filter((u) => !bans.includes(u.id)).length > 1;
}

// ───────────── 본사 발주 (등급 지정 뽑기) ─────────────
// 실측: 전설은 판의 55%에서만 등장하는데 점장 혼자 전체 피해의 46%였다.
// 즉 45%의 판은 시작부터 구조적으로 약한 판이고 되돌릴 방법이 없었다.
// 확률 천장 대신 '벌어서 사는' 길을 낸다. 기다리면 오는 것보다 모아서 사는 쪽이 결정이다.
// 가격은 '일반 뽑기의 배수'가 아니라 웨이브에 따라 오르는 정찰가다.
// 뽑기 비용은 뽑을수록 가속하므로 거기에 배수를 곱하면 후반에 손이 닿지 않는다 (측정으로 확인).
// 웨이브 20 기준 희귀 1,050 / 에픽 2,800 / 전설 5,600원 (일반 뽑기 3~4회분).
// 전설 하나를 사려면 서너 웨이브 동안 일반 뽑기를 포기해야 한다 — 그 교환이 결정이다.
export const ORDER_BASE = { rare: 150, epic: 400, legendary: 800 } as const;
export function orderPrice(rarity: keyof typeof ORDER_BASE, wave: number, discount = 0): number {
  return Math.max(60, Math.round(ORDER_BASE[rarity] * (1 + wave * 0.3) * (1 - discount)));
}

// 에픽 소프트 천장. 이건 결정이 아니라 바닥이다 —
// 초반에 20뽑 내내 일반만 나오는 판을 없애기 위한 최소한의 보정.
export const EPIC_PITY = 15;
