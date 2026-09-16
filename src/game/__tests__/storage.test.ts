import { describe, it, expect, beforeEach } from 'vitest';
import { loadSave, writeSave, SAVE_KEY, defaultSave, type SaveData } from '../save/storage';
import { metaEffects, DEFAULT_META_LEVELS, META_UPGRADES } from '../save/meta';

// localStorage 폴리필 (node 환경)
const store = new Map<string, string>();
(globalThis as unknown as { localStorage: Storage }).localStorage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
  removeItem: (k: string) => void store.delete(k),
  clear: () => store.clear(),
  key: () => null,
  length: 0,
} as Storage;

// playerId 는 기기마다 새로 만들어지므로 비교에서 빼고 본다.
const withoutId = (s: SaveData) => ({ ...s, playerId: '' });

describe('저장', () => {
  beforeEach(() => store.clear());
  it('기본값 로드', () => {
    const loaded = loadSave();
    expect(withoutId(loaded)).toEqual(withoutId(defaultSave()));
    expect(loaded.playerId.length).toBeGreaterThanOrEqual(8);
  });
  it('저장 후 로드', () => {
    const d = defaultSave();
    d.bestWave = 17;
    d.metaLevels.startCoins = 2;
    writeSave(d);
    const loaded = loadSave();
    expect(loaded.bestWave).toBe(17);
    expect(loaded.metaLevels.startCoins).toBe(2);
  });
  it('구버전/손상 데이터 마이그레이션', () => {
    store.set(SAVE_KEY, JSON.stringify({ bestWave: 5 }));
    const loaded = loadSave();
    expect(loaded.bestWave).toBe(5);
    expect(loaded.metaLevels).toEqual(DEFAULT_META_LEVELS);
    expect(loaded.unlockedUnits).toEqual([]);
    store.set(SAVE_KEY, '{not json');
    expect(withoutId(loadSave())).toEqual(withoutId(defaultSave()));
  });
  it('메타 효과 계산', () => {
    const base = metaEffects(DEFAULT_META_LEVELS);
    const maxed = metaEffects(Object.fromEntries(META_UPGRADES.map((u) => [u.id, u.maxLevel])) as typeof DEFAULT_META_LEVELS);
    expect(maxed.startCoins).toBeGreaterThan(base.startCoins);
    expect(maxed.drawCostReduce).toBe(30);
    expect(maxed.rareBonus).toBeCloseTo(0.075);
  });
});
