import type { MetaUpgradeId } from '../types';
import { DEFAULT_META_LEVELS } from './meta';

export const SAVE_KEY = 'cvs-night-shift:v1';

export interface LastRun {
  wave: number;
  time: number;
  kills: number;
  coins: number;
  mvp: string | null;
  at: number;
}

export interface SaveData {
  version: 1;
  bestWave: number;
  bestTime: number;
  bestKills: number;
  totalPlays: number;
  totalKills: number;
  unlockedUnits: string[];
  seenEnemies: string[];
  metaPoints: number;
  metaLevels: Record<MetaUpgradeId, number>;
  muted: boolean;
  autoMerge: boolean;
  hintsSeen: boolean;
  lastRun?: LastRun;
}

export function defaultSave(): SaveData {
  return {
    version: 1,
    bestWave: 0,
    bestTime: 0,
    bestKills: 0,
    totalPlays: 0,
    totalKills: 0,
    unlockedUnits: [],
    seenEnemies: [],
    metaPoints: 0,
    metaLevels: { ...DEFAULT_META_LEVELS },
    muted: false,
    autoMerge: false,
    hintsSeen: false,
  };
}

// localStorage 는 사파리 프라이빗 모드 등에서 예외를 던질 수 있어 항상 try/catch.
export function loadSave(): SaveData {
  const base = defaultSave();
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return base;
    const parsed = JSON.parse(raw) as Partial<SaveData>;
    // 누락 필드 보정 (마이그레이션)
    return {
      ...base,
      ...parsed,
      version: 1,
      metaLevels: { ...base.metaLevels, ...(parsed.metaLevels ?? {}) },
      unlockedUnits: Array.isArray(parsed.unlockedUnits) ? parsed.unlockedUnits : [],
      seenEnemies: Array.isArray(parsed.seenEnemies) ? parsed.seenEnemies : [],
    };
  } catch {
    return base;
  }
}

export function writeSave(data: SaveData): void {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(data));
  } catch {
    // 저장 불가 환경: 조용히 무시 (게임은 계속 동작)
  }
}

export function resetSave(): SaveData {
  const d = defaultSave();
  writeSave(d);
  return d;
}
