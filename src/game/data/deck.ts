import type { Rarity } from '../types';
import { UNIT_BY_ID, unitsOfRarity } from './units';

// 런 시작 전에 짜는 덱.
//
// 왜 등급별 슬롯인가: 덱을 자유롭게 5장 고르게 하면 전부 에픽으로 채우는 게
// 언제나 정답이 된다(일반 뽑기 60%가 갈 곳이 없어 상위 등급으로 새어버린다).
// 등급마다 칸을 못박으면 "어떤 일반을 쓸까"가 매번 진짜 선택이 된다.
//
// 전설은 2% 로만 나오지만, 나왔을 때 무엇이 나오느냐는 판을 가른다.
// 3종이 되어 슬롯을 열었다. 특수 유닛(고양이·10년차)은 합성 전용이라 덱 밖이다.
export const DECK_SLOTS: { rarity: Rarity; count: number }[] = [
  { rarity: 'common', count: 2 },
  { rarity: 'rare', count: 2 },
  { rarity: 'epic', count: 1 },
  { rarity: 'legendary', count: 1 },
];

export const DECK_SIZE = DECK_SLOTS.reduce((n, s) => n + s.count, 0);

export function slotsFor(rarity: Rarity): number {
  return DECK_SLOTS.find((s) => s.rarity === rarity)?.count ?? 0;
}

// 덱이 관여하는 등급인가 (전설·특수는 덱 밖)
export function isDeckRarity(rarity: Rarity): boolean {
  return slotsFor(rarity) > 0;
}

// 덱에 든 해당 등급 유닛 id 들
export function deckOfRarity(deck: string[], rarity: Rarity): string[] {
  return deck.filter((id) => UNIT_BY_ID[id]?.rarity === rarity);
}

// 저장된 덱을 신뢰하지 않는다. 없어진 유닛, 잠긴 유닛, 칸 수 초과를 전부 정리하고
// 모자란 칸은 해금된 유닛으로 채운다. 항상 유효한 덱이 나온다.
export function normalizeDeck(deck: string[], unlocked: string[]): string[] {
  const ok = new Set(unlocked);
  const out: string[] = [];
  for (const { rarity, count } of DECK_SLOTS) {
    const picked = deck.filter((id) => ok.has(id) && UNIT_BY_ID[id]?.rarity === rarity && !out.includes(id)).slice(0, count);
    // 모자라면 해금된 것 중 앞에서부터 채운다
    for (const def of unitsOfRarity(rarity)) {
      if (picked.length >= count) break;
      if (ok.has(def.id) && !picked.includes(def.id)) picked.push(def.id);
    }
    out.push(...picked);
  }
  return out;
}

// 덱이 꽉 찼는가 (칸마다 정확히 채워졌는가)
export function isDeckComplete(deck: string[]): boolean {
  return DECK_SLOTS.every(({ rarity, count }) => deckOfRarity(deck, rarity).length === count);
}
