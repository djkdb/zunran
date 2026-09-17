import type { MetaEffects, MetaUpgradeId } from '../types';
import type { IconName } from '../../ui/Icon';
import { START_COINS, START_HP, START_SLOTS, MAX_SHELF_LEVEL, TOTAL_SLOTS } from '../config';

export interface MetaUpgradeDef {
  id: MetaUpgradeId;
  name: string;
  desc: (lvl: number) => string;
  maxLevel: number; // Infinity 면 천장이 없다
  cost: (lvl: number) => number; // 다음 레벨 비용 (lvl = 현재 레벨)
  icon: IconName;
  note?: string; // 카드 아래 한 줄 설명
}

// 레벨당 효과를 절반으로 줄이고 단계를 두 배로 늘렸다.
// 만렙 성능은 예전과 같지만 살 것이 30단계 → 70단계가 되어 금방 끝나지 않는다.
// 마지막 '연차'는 천장이 없어서 다 산 뒤에도 쓸 곳이 남는다.
export const META_UPGRADES: MetaUpgradeDef[] = [
  {
    id: 'shelves',
    name: '진열대 증축',
    icon: 'store',
    maxLevel: MAX_SHELF_LEVEL,
    desc: (l) => `진열대 ${START_SLOTS + l}칸 (최대 ${TOTAL_SLOTS}칸)`,
    cost: (l) => 120 + l * 80,
    note: '칸이 곧 화력이다. 좁은 지점에서는 남는 단계가 진열 밀도로 간다',
  },
  { id: 'startCoins', name: '시작 코인', icon: 'coin', maxLevel: 10, desc: (l) => `시작 코인 +${l * 50}원`, cost: (l) => 60 + l * 34 },
  { id: 'startHp', name: '초기 체력', icon: 'heart', maxLevel: 10, desc: (l) => `편의점 체력 +${l * 7.5}`, cost: (l) => 60 + l * 34 },
  { id: 'drawCost', name: '뽑기 할인', icon: 'tag', maxLevel: 10, desc: (l) => `뽑기 비용 -${l * 3}원`, cost: (l) => 70 + l * 44 },
  { id: 'rareChance', name: '희귀 확률', icon: 'gem', maxLevel: 10, desc: (l) => `희귀 확률 +${(l * 0.75).toFixed(2)}%p`, cost: (l) => 80 + l * 50 },
  { id: 'epicChance', name: '에픽·전설 확률', icon: 'star', maxLevel: 10, desc: (l) => `에픽 +${(l * 0.35).toFixed(2)}%p · 전설 +${(l * 0.1).toFixed(2)}%p`, cost: (l) => 110 + l * 68 },
  { id: 'coinGain', name: '코인 획득량', icon: 'chart', maxLevel: 10, desc: (l) => `코인 획득 +${l * 3}%`, cost: (l) => 70 + l * 44 },
  {
    id: 'mergeLuck',
    name: '합성 운',
    icon: 'merge',
    maxLevel: 10,
    desc: (l) => `합성 시 상위 등급 승급 +${(l * 0.7).toFixed(1)}%p`,
    cost: (l) => 140 + l * 80,
    note: '3개를 합칠 때 더 좋은 등급이 나올 확률',
  },
  {
    id: 'orderDiscount',
    name: '본사 인맥',
    icon: 'cash',
    maxLevel: 10,
    desc: (l) => `본사 발주 비용 -${l * 4}%`,
    cost: (l) => 120 + l * 72,
    note: '등급 지정 뽑기를 싸게 만든다',
  },
  {
    id: 'armorPierce',
    name: '요령',
    icon: 'tag',
    maxLevel: 10,
    desc: (l) => `손님 장갑 -${l * 4}%`,
    cost: (l) => 130 + l * 78,
    note: '두꺼운 손님에게 잔매가 덜 막힌다',
  },
  {
    id: 'veteran',
    name: '연차',
    icon: 'cash',
    maxLevel: Infinity,
    desc: (l) => `야간 수당 +${l * 3}%`,
    // 천장이 없으므로 비용은 복리로 오른다. 20년차쯤에서 한 판 수당을 훌쩍 넘는다.
    cost: (l) => Math.round(240 * Math.pow(1.28, l)),
    note: '판 안의 능력은 그대로. 다음 강화를 더 빨리 산다',
  },
];

export const DEFAULT_META_LEVELS: Record<MetaUpgradeId, number> = {
  startCoins: 0,
  startHp: 0,
  drawCost: 0,
  rareChance: 0,
  epicChance: 0,
  coinGain: 0,
  mergeLuck: 0,
  shelves: 0,
  orderDiscount: 0,
  armorPierce: 0,
  veteran: 0,
};

export function metaEffects(levels: Record<MetaUpgradeId, number>): MetaEffects {
  return {
    startCoins: START_COINS + levels.startCoins * 50,
    startHp: START_HP + levels.startHp * 7.5,
    slots: Math.min(TOTAL_SLOTS, START_SLOTS + levels.shelves),
    shelfLevel: levels.shelves,
    drawCostReduce: levels.drawCost * 3,
    rareBonus: levels.rareChance * 0.0075,
    epicBonus: levels.epicChance * 0.0035,
    legendaryBonus: levels.epicChance * 0.001,
    coinGainMult: 1 + levels.coinGain * 0.03,
    freeDraws: 0,
    mergePromoteBonus: levels.mergeLuck * 0.007,
    orderDiscount: levels.orderDiscount * 0.04,
    armorPierce: levels.armorPierce * 0.04,
    payMult: 1 + levels.veteran * 0.03,
  };
}

// 한 판 결과 → 야간 수당(메타 화폐).
// 코인 비중을 크게 낮췄다. 예전엔 수당의 95%가 획득 코인에서 나와 두 판이면 상점을
// 다 사버렸고(전체 8800), 코인은 후반에 어차피 남아돌아서 "더 멀리 갔다"를 보상하지 못했다.
// 지금은 웨이브와 처치 수가 주도한다: 좋은 판 한 번 ≈ 800점 → 상점 전부 약 11판.
// 진열대 증축(12단계)이 들어오면서 상점 전체가 8,800점 → 37,800점이 됐다.
// 판당 700점이면 다 사는 데 54판이다. 수당을 올려 30판 아래로 맞춘다.
// 웨이브 비중을 키운 건 "더 멀리 갔다"를 보상하기 위해서다.
export function metaPointsForRun(coinsEarned: number, wave: number, kills: number, payMult = 1): number {
  return Math.round((wave * 28 + kills * 0.45 + coinsEarned * 0.004) * payMult);
}
