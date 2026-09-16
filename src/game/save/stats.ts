import type { RunStats } from '../types';
import type { EnemyStat, SaveData, UnitStat } from './storage';

// 한 판의 RunStats 를 누적 Save 통계에 합친다. 여기 한 곳에서만 병합한다.
export function mergeRunStats(save: SaveData, stats: RunStats, mvpDefId: string | null, at: number): Pick<SaveData, 'unitStats' | 'enemyStats' | 'eventCounts' | 'catVisits' | 'totalMerges' | 'totalBossKills'> {
  const unitStats: Record<string, UnitStat> = { ...save.unitStats };
  const enemyStats: Record<string, EnemyStat> = { ...save.enemyStats };

  const touchedUnits = new Set([
    ...Object.keys(stats.unitDraws),
    ...Object.keys(stats.unitMerges),
    ...Object.keys(stats.unitDamage),
    ...Object.keys(stats.unitMaxTier),
    ...stats.seenUnits,
  ]);
  for (const id of touchedUnits) {
    const prev = unitStats[id] ?? { draws: 0, mvp: 0, damage: 0, maxTier: 0, merges: 0 };
    unitStats[id] = {
      draws: prev.draws + (stats.unitDraws[id] ?? 0),
      mvp: prev.mvp + (mvpDefId === id ? 1 : 0),
      damage: Math.round(prev.damage + (stats.unitDamage[id] ?? 0)),
      maxTier: Math.max(prev.maxTier, stats.unitMaxTier[id] ?? 1),
      merges: prev.merges + (stats.unitMerges[id] ?? 0),
    };
  }

  const touchedEnemies = new Set([
    ...Object.keys(stats.enemySeen),
    ...Object.keys(stats.enemyKills),
    ...Object.keys(stats.reachedBy),
    ...stats.seenEnemies,
  ]);
  for (const id of touchedEnemies) {
    const prev = enemyStats[id] ?? { seen: 0, kills: 0, reached: 0, damage: 0, firstAt: at, lastAt: at, bestKillsInRun: 0 };
    const killsThisRun = stats.enemyKills[id] ?? 0;
    enemyStats[id] = {
      seen: prev.seen + (stats.enemySeen[id] ?? 0),
      kills: prev.kills + killsThisRun,
      reached: prev.reached + (stats.reachedBy[id] ?? 0),
      damage: prev.damage + (stats.storeDamageBy[id] ?? 0),
      firstAt: prev.firstAt || at,
      lastAt: at,
      bestKillsInRun: Math.max(prev.bestKillsInRun, killsThisRun),
    };
  }

  const eventCounts = { ...save.eventCounts };
  for (const id of stats.eventIds) eventCounts[id] = (eventCounts[id] ?? 0) + 1;

  return {
    unitStats,
    enemyStats,
    eventCounts,
    catVisits: save.catVisits + stats.catVisits,
    totalMerges: save.totalMerges + stats.merges,
    totalBossKills: save.totalBossKills + stats.bossKills,
  };
}

// 패배 원인 분석: 실제로 추적된 값만 쓴다 (없으면 null 을 반환해 화면에서 감춘다)
export interface DefeatAnalysis {
  reached: number;
  topReacher: { id: string; count: number } | null; // 가장 많이 들어온 손님
  topDamager: { id: string; damage: number } | null; // 가장 큰 피해를 준 손님
  lastClock: string | null;
  coinsLeft: number;
}

export function analyzeDefeat(stats: RunStats, coinsLeft: number): DefeatAnalysis {
  const pickTop = (r: Record<string, number>) => {
    let id: string | null = null;
    let n = 0;
    for (const [k, v] of Object.entries(r)) if (v > n) [id, n] = [k, v];
    return id ? { id, n } : null;
  };
  const reacher = pickTop(stats.reachedBy);
  const damager = pickTop(stats.storeDamageBy);
  return {
    reached: stats.reached,
    topReacher: reacher ? { id: reacher.id, count: reacher.n } : null,
    topDamager: damager ? { id: damager.id, damage: damager.n } : null,
    lastClock: stats.lastDamageClock || null,
    coinsLeft,
  };
}
