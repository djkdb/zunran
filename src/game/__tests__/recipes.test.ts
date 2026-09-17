import { describe, it, expect } from 'vitest';
import { RECIPES, recipeStatus, pickMaterials } from '../data/recipes';
import { slotsFor } from '../data/deck';
import { UNIT_BY_ID } from '../data/units';
import { UNIT_UNLOCK_WAVE } from '../data/unlocks';
import type { Rarity, UnitGroup } from '../types';

const group = (defId: string, tier: number, count = 1): UnitGroup => ({
  defId,
  tier: tier as UnitGroup['tier'],
  count,
  unitIds: Array.from({ length: count }, (_, i) => tier * 1000 + i + defId.length * 7),
  mergeable: count >= 3,
});

describe('조합 레시피', () => {
  it('모든 레시피가 덱 슬롯 안에 들어간다', () => {
    // 덱에 담을 수 없는 구성이면 영영 완성되지 않는다. 이걸 놓쳐서 30판 중 0판이 나왔었다.
    for (const r of RECIPES) {
      const need: Partial<Record<Rarity, number>> = {};
      for (const m of r.materials) {
        const rarity = UNIT_BY_ID[m.defId].rarity;
        need[rarity] = (need[rarity] ?? 0) + 1;
      }
      for (const [rarity, n] of Object.entries(need)) {
        expect({ recipe: r.id, rarity, need: n, slots: slotsFor(rarity as Rarity) }).toMatchObject({
          need: expect.any(Number),
        });
        expect(n).toBeLessThanOrEqual(slotsFor(rarity as Rarity));
      }
    }
  });

  it('재료와 결과가 실제로 존재하는 유닛이다', () => {
    for (const r of RECIPES) {
      expect(UNIT_BY_ID[r.result], `${r.id} 결과`).toBeTruthy();
      for (const m of r.materials) expect(UNIT_BY_ID[m.defId], `${r.id} 재료 ${m.defId}`).toBeTruthy();
    }
  });

  it('결과 유닛은 뽑기로 나오지 않는다 (레시피 전용)', () => {
    for (const r of RECIPES) expect(UNIT_BY_ID[r.result].mergeOnly, r.id).toBe(true);
  });

  it('재료가 다 모이면 ready, 하나라도 모자라면 아니다', () => {
    const r = RECIPES[0];
    const full = r.materials.map((m) => group(m.defId, m.minTier));
    expect(recipeStatus(full).find((x) => x.def.id === r.id)?.ready).toBe(true);
    expect(recipeStatus(full.slice(0, -1)).find((x) => x.def.id === r.id)?.ready).toBe(false);
  });

  it('티어가 모자라면 재료로 치지 않는다', () => {
    const r = RECIPES.find((x) => x.materials.some((m) => m.minTier > 1))!;
    const low = r.materials.map((m) => group(m.defId, 1));
    expect(recipeStatus(low).find((x) => x.def.id === r.id)?.ready).toBe(false);
  });

  it('재료는 조건을 만족하는 것 중 가장 낮은 티어를 쓴다', () => {
    const r = RECIPES[0];
    const m0 = r.materials[0];
    const groups = [group(m0.defId, m0.minTier), group(m0.defId, 4), ...r.materials.slice(1).map((m) => group(m.defId, m.minTier))];
    const picked = pickMaterials(r, groups)!;
    expect(picked).not.toBeNull();
    // 아껴 둔 4티어가 아니라 최소 티어 쪽이 쓰여야 한다
    expect(picked).toContain(group(m0.defId, m0.minTier).unitIds[0]);
  });

  it('재료 유닛이 서로 다른 개체로 잡힌다', () => {
    for (const r of RECIPES) {
      const picked = pickMaterials(r, r.materials.map((m) => group(m.defId, m.minTier)));
      expect(picked, r.id).not.toBeNull();
      expect(new Set(picked!).size, r.id).toBe(r.materials.length);
    }
  });

  it('레시피 재료는 전부 해금 가능한 유닛이다', () => {
    for (const r of RECIPES) {
      for (const m of r.materials) {
        expect(UNIT_UNLOCK_WAVE[m.defId] ?? 0, `${r.id} / ${m.defId}`).toBeLessThanOrEqual(60);
      }
    }
  });
});

describe('히트스톱', () => {
  it('정지분만 덜어내고 남은 시간은 그대로 진행한다', async () => {
    const { Engine } = await import('../engine/Engine');
    const e = new Engine({ seed: 3 });
    const before = e.state.time;
    e.state.hitstop = 0.05;
    // 0.2초 프레임: 0.05 는 정지에 쓰이고 0.15 는 진행해야 한다.
    // 프레임을 통째로 삼키면 큰 프레임(드랍)에서 게임이 멈춘다.
    e.tick(0.2);
    expect(e.state.hitstop).toBe(0);
    expect(e.state.time - before).toBeGreaterThan(0.1);
  });

  it('정지가 남아 있으면 게임 시간이 흐르지 않는다', async () => {
    const { Engine } = await import('../engine/Engine');
    const e = new Engine({ seed: 3 });
    const before = e.state.time;
    e.state.hitstop = 0.5;
    e.tick(1 / 60);
    expect(e.state.time).toBe(before);
    expect(e.state.hitstop).toBeLessThan(0.5);
  });

  it('배속을 켜면 정지도 그만큼 빨리 풀린다', async () => {
    const { Engine } = await import('../engine/Engine');
    const e = new Engine({ seed: 3 });
    e.state.hitstop = 0.1;
    e.state.speed = 2;
    e.tick(0.03); // 실시간 0.03 → 게임상 0.06 소모
    expect(e.state.hitstop).toBeCloseTo(0.04, 3);
  });
});
