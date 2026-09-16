import type { MetaEffects, MetaUpgradeId } from '../types';
import type { IconName } from '../../ui/Icon';
import { START_COINS, START_HP } from '../config';

export interface MetaUpgradeDef {
  id: MetaUpgradeId;
  name: string;
  desc: (lvl: number) => string;
  maxLevel: number;
  cost: (lvl: number) => number; // 다음 레벨 비용 (lvl = 현재 레벨)
  icon: IconName;
}

export const META_UPGRADES: MetaUpgradeDef[] = [
  { id: 'startCoins', name: '시작 코인', icon: 'coin', maxLevel: 5, desc: (l) => `시작 코인 +${l * 100}원`, cost: (l) => 80 + l * 70 },
  { id: 'startHp', name: '초기 체력', icon: 'heart', maxLevel: 5, desc: (l) => `편의점 체력 +${l * 15}`, cost: (l) => 80 + l * 70 },
  { id: 'drawCost', name: '뽑기 할인', icon: 'tag', maxLevel: 5, desc: (l) => `뽑기 비용 -${l * 6}원`, cost: (l) => 100 + l * 90 },
  { id: 'rareChance', name: '희귀 확률', icon: 'gem', maxLevel: 5, desc: (l) => `희귀 확률 +${(l * 1.5).toFixed(1)}%p`, cost: (l) => 120 + l * 100 },
  { id: 'epicChance', name: '에픽·전설 확률', icon: 'star', maxLevel: 5, desc: (l) => `에픽 +${(l * 0.7).toFixed(1)}%p · 전설 +${(l * 0.2).toFixed(1)}%p`, cost: (l) => 160 + l * 140 },
  { id: 'coinGain', name: '코인 획득량', icon: 'chart', maxLevel: 5, desc: (l) => `코인 획득 +${l * 6}%`, cost: (l) => 100 + l * 90 },
];

export const DEFAULT_META_LEVELS: Record<MetaUpgradeId, number> = {
  startCoins: 0,
  startHp: 0,
  drawCost: 0,
  rareChance: 0,
  epicChance: 0,
  coinGain: 0,
};

export function metaEffects(levels: Record<MetaUpgradeId, number>): MetaEffects {
  return {
    startCoins: START_COINS + levels.startCoins * 100,
    startHp: START_HP + levels.startHp * 15,
    drawCostReduce: levels.drawCost * 6,
    rareBonus: levels.rareChance * 0.015,
    epicBonus: levels.epicChance * 0.007,
    legendaryBonus: levels.epicChance * 0.002,
    coinGainMult: 1 + levels.coinGain * 0.06,
    freeDraws: 0,
  };
}

// 한 판 결과 → 야간 수당(메타 화폐).
// 코인 비중을 크게 낮췄다. 예전엔 수당의 95%가 획득 코인에서 나와 두 판이면 상점을
// 다 사버렸고(전체 8800), 코인은 후반에 어차피 남아돌아서 "더 멀리 갔다"를 보상하지 못했다.
// 지금은 웨이브와 처치 수가 주도한다: 좋은 판 한 번 ≈ 800점 → 상점 전부 약 11판.
export function metaPointsForRun(coinsEarned: number, wave: number, kills: number): number {
  return Math.round(wave * 14 + kills * 0.25 + coinsEarned * 0.004);
}
