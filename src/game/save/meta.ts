import type { MetaEffects, MetaUpgradeId } from '../types';
import { START_COINS, START_HP } from '../config';

export interface MetaUpgradeDef {
  id: MetaUpgradeId;
  name: string;
  desc: (lvl: number) => string;
  maxLevel: number;
  cost: (lvl: number) => number; // 다음 레벨 비용 (lvl = 현재 레벨)
  icon: string;
}

export const META_UPGRADES: MetaUpgradeDef[] = [
  { id: 'startCoins', name: '시작 코인', icon: '💰', maxLevel: 5, desc: (l) => `시작 코인 +${l * 100}원`, cost: (l) => 80 + l * 70 },
  { id: 'startHp', name: '초기 체력', icon: '❤️', maxLevel: 5, desc: (l) => `편의점 체력 +${l * 15}`, cost: (l) => 80 + l * 70 },
  { id: 'drawCost', name: '뽑기 할인', icon: '🏷️', maxLevel: 5, desc: (l) => `뽑기 비용 -${l * 6}원`, cost: (l) => 100 + l * 90 },
  { id: 'rareChance', name: '희귀 확률', icon: '🔷', maxLevel: 5, desc: (l) => `희귀 확률 +${(l * 1.5).toFixed(1)}%p`, cost: (l) => 120 + l * 100 },
  { id: 'epicChance', name: '에픽·전설 확률', icon: '🌟', maxLevel: 5, desc: (l) => `에픽 +${(l * 0.7).toFixed(1)}%p · 전설 +${(l * 0.2).toFixed(1)}%p`, cost: (l) => 160 + l * 140 },
  { id: 'coinGain', name: '코인 획득량', icon: '📈', maxLevel: 5, desc: (l) => `코인 획득 +${l * 6}%`, cost: (l) => 100 + l * 90 },
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

// 한 판 결과 → 야간 수당(메타 화폐)
export function metaPointsForRun(coinsEarned: number, wave: number, kills: number): number {
  return Math.round(coinsEarned * 0.1 + wave * 5 + kills * 0.2);
}
