import type { Tier, UnitGroup } from '../types';
import { UNIT_BY_ID } from './units';

// 조합 레시피.
//
// 합성(같은 유닛 3개)은 눈앞의 상황에 반응하는 행동이다. 레시피는 그 반대로,
// 판이 시작될 때 "이번엔 이걸 노린다"는 목표를 만든다. 결과 유닛은 레시피로만
// 얻을 수 있어서, 재료를 모으는 동안 모든 뽑기·합성에 방향이 생긴다.
//
// 재료는 소모된다. 결과는 첫 재료가 있던 칸에 놓인다.
export interface RecipeMaterial {
  defId: string;
  minTier: Tier; // 이 티어 이상이면 재료가 된다
}

export interface RecipeDef {
  id: string;
  name: string;
  result: string; // 결과 유닛 id
  resultTier: Tier;
  materials: RecipeMaterial[];
  hint: string; // 재료를 설명하는 한 줄
}

export const RECIPES: RecipeDef[] = [
  // 규칙: 재료 구성이 덱 슬롯 안에 들어가야 한다 (일반 2 · 희귀 2 · 에픽 1 · 전설 1).
  // 일반 3종을 요구하면 덱에 담을 수 없어 영영 완성되지 않는다 — 실제로 그렇게 만들었다가
  // 30판 중 0판 완성이 나와 잡았다. recipes.test.ts 가 이 규칙을 지킨다.
  {
    id: 'nightSnack',
    name: '야식 세트',
    result: 'nightSnackSet',
    resultTier: 2,
    materials: [
      { defId: 'onigiri', minTier: 2 },
      { defId: 'ramenShelf', minTier: 2 },
    ],
    hint: '삼각김밥 + 라면 진열대 (둘 다 2티어)',
  },
  {
    id: 'caffeine',
    name: '카페인 과다',
    result: 'energyDrink',
    resultTier: 2,
    materials: [
      { defId: 'coffee', minTier: 2 },
      { defId: 'pos', minTier: 2 },
    ],
    hint: '커피머신 + 포스기 (둘 다 2티어)',
  },
  {
    id: 'unmanned',
    name: '무인 점포',
    result: 'selfCheckout',
    resultTier: 2,
    materials: [
      { defId: 'cctv', minTier: 2 },
      { defId: 'scanner', minTier: 2 },
      { defId: 'parcel', minTier: 1 },
    ],
    hint: 'CCTV + 바코드 스캐너 (2티어) + 택배 접수기',
  },
  {
    id: 'coldZone',
    name: '빙결 구역',
    result: 'freezeZone',
    resultTier: 2,
    materials: [
      { defId: 'fridge', minTier: 2 },
      { defId: 'freezer', minTier: 2 },
      { defId: 'slush', minTier: 1 },
    ],
    hint: '냉장고 + 아이스크림 냉동고 (2티어) + 슬러시 기계',
  },
];


export const RECIPE_BY_ID: Record<string, RecipeDef> = Object.fromEntries(RECIPES.map((r) => [r.id, r]));

// 레시피로만 나오는 유닛인가 (도감·덱에서 따로 표시한다)
export const RECIPE_RESULTS = new Set(RECIPES.map((r) => r.result));

export interface RecipeStatus {
  def: RecipeDef;
  ready: boolean;
  have: number; // 갖춘 재료 수
}

// 지금 보드로 만들 수 있는 레시피 상태. 갖춘 수가 많은 순으로 돌려준다.
export function recipeStatus(groups: UnitGroup[]): RecipeStatus[] {
  const out = RECIPES.map((def) => {
    const have = def.materials.filter((m) => groups.some((g) => g.defId === m.defId && g.tier >= m.minTier && g.count > 0)).length;
    return { def, ready: have === def.materials.length, have };
  });
  return out.sort((a, b) => Number(b.ready) - Number(a.ready) || b.have - a.have);
}

// 재료로 쓸 유닛 id 를 고른다. 조건을 만족하는 것 중 가장 낮은 티어를 쓴다
// (아껴 둔 고티어를 레시피가 함부로 먹어치우면 안 된다).
export function pickMaterials(def: RecipeDef, groups: UnitGroup[]): number[] | null {
  const used: number[] = [];
  for (const m of def.materials) {
    const candidates = groups
      .filter((g) => g.defId === m.defId && g.tier >= m.minTier)
      .sort((a, b) => a.tier - b.tier);
    const pick = candidates.flatMap((g) => g.unitIds).find((id) => !used.includes(id));
    if (pick === undefined) return null;
    used.push(pick);
  }
  return used;
}

export function recipeResultName(def: RecipeDef): string {
  return UNIT_BY_ID[def.result]?.name ?? def.name;
}
