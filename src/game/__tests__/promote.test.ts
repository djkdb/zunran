import { describe, it, expect } from 'vitest';
import { Engine } from '../engine/Engine';
import { UNIT_BY_ID, unitsOfRarity, NEXT_RARITY } from '../data/units';
import { createUnit } from '../engine/unitFactory';
import { MERGE_ODDS, MAX_TIER } from '../config';
import { canTierMerge } from '../engine/mergeSystem';
import type { Tier } from '../types';

// 같은 유닛 3개를 원하는 슬롯에 강제로 놓는다
function seed3(engine: Engine, defId: string) {
  const s = engine.state;
  s.units = [];
  for (const sl of s.slots) sl.unitId = null;
  for (let i = 0; i < 3; i++) {
    const u = createUnit(s, defId, 1, i);
    s.units.push(u);
    s.slots[i].unitId = u.id;
  }
}

// rng.next() 를 정해진 값으로 바꿔 합성 결과 종류를 고정한다
function forceRoll(engine: Engine, value: number) {
  const rng = engine.state.rng;
  const realNext = rng.next.bind(rng);
  let first = true;
  rng.next = () => {
    if (first) {
      first = false;
      return value;
    }
    return realNext();
  };
}

describe('합성 승급 2택', () => {
  it('승급이 뜨면 게임이 멈추고 후보 2장이 제시된다', () => {
    const engine = new Engine({ seed: 11 });
    seed3(engine, 'onigiri');
    forceRoll(engine, MERGE_ODDS.upgrade + 0.01); // 승급 구간
    const r = engine.dispatch({ type: 'MERGE', defId: 'onigiri', tier: 1 });
    expect(r.ok).toBe(true);
    expect(engine.state.phase).toBe('promote');
    expect(engine.state.promoteChoice?.options).toHaveLength(2);
    // 아직 유닛은 생기지 않았다 (재료 3개는 사라졌다)
    expect(engine.state.units).toHaveLength(0);
  });

  it('후보는 모두 한 단계 위 등급이고 재료와 다른 유닛이다', () => {
    const engine = new Engine({ seed: 12 });
    seed3(engine, 'onigiri');
    forceRoll(engine, MERGE_ODDS.upgrade + 0.01);
    engine.dispatch({ type: 'MERGE', defId: 'onigiri', tier: 1 });
    const opts = engine.state.promoteChoice!.options;
    const want = NEXT_RARITY[UNIT_BY_ID.onigiri.rarity];
    for (const id of opts) {
      expect(UNIT_BY_ID[id].rarity).toBe(want);
      expect(id).not.toBe('onigiri');
    }
    expect(new Set(opts).size).toBe(opts.length); // 같은 후보가 두 번 뜨지 않는다
  });

  it('고른 쪽이 재료가 있던 칸에, 같은 티어로 들어간다', () => {
    const engine = new Engine({ seed: 13 });
    seed3(engine, 'onigiri');
    const slot0 = engine.state.units[0].slot;
    forceRoll(engine, MERGE_ODDS.upgrade + 0.01);
    engine.dispatch({ type: 'MERGE', defId: 'onigiri', tier: 1 });
    const pick = engine.state.promoteChoice!.options[1];
    const ok = engine.dispatch({ type: 'CHOOSE_PROMOTE', defId: pick });
    expect(ok.ok).toBe(true);
    expect(engine.state.phase).toBe('playing');
    expect(engine.state.promoteChoice).toBeNull();
    expect(engine.state.units).toHaveLength(1);
    expect(engine.state.units[0].defId).toBe(pick);
    expect(engine.state.units[0].tier).toBe(1);
    expect(engine.state.units[0].slot).toBe(slot0);
    expect(engine.state.slots[slot0].unitId).toBe(engine.state.units[0].id);
  });

  it('제시되지 않은 유닛은 고를 수 없다', () => {
    const engine = new Engine({ seed: 14 });
    seed3(engine, 'onigiri');
    forceRoll(engine, MERGE_ODDS.upgrade + 0.01);
    engine.dispatch({ type: 'MERGE', defId: 'onigiri', tier: 1 });
    const opts = engine.state.promoteChoice!.options;
    const outsider = unitsOfRarity('rare').find((d) => !opts.includes(d.id))!;
    expect(engine.dispatch({ type: 'CHOOSE_PROMOTE', defId: outsider.id }).ok).toBe(false);
    expect(engine.state.phase).toBe('promote');
  });

  it('승급 선택 중에는 게임 시간이 흐르지 않는다', () => {
    const engine = new Engine({ seed: 15 });
    seed3(engine, 'onigiri');
    forceRoll(engine, MERGE_ODDS.upgrade + 0.01);
    engine.dispatch({ type: 'MERGE', defId: 'onigiri', tier: 1 });
    const t0 = engine.state.time;
    for (let i = 0; i < 30; i++) engine.tick(0.1);
    expect(engine.state.time).toBe(t0);
  });

  it('일반 강화(70%)는 멈추지 않고 그대로 티어가 오른다', () => {
    const engine = new Engine({ seed: 16 });
    seed3(engine, 'onigiri');
    forceRoll(engine, 0.01); // 강화 구간
    engine.dispatch({ type: 'MERGE', defId: 'onigiri', tier: 1 });
    expect(engine.state.phase).toBe('playing');
    expect(engine.state.units).toHaveLength(1);
    expect(engine.state.units[0].defId).toBe('onigiri');
    expect(engine.state.units[0].tier).toBe(2);
  });
});

describe('고티어 통합 합성 (3티어부터 종류가 달라도)', () => {
  const put = (engine: Engine, defId: string, tier: Tier, slot: number) => {
    const s = engine.state;
    const u = createUnit(s, defId, tier, slot);
    s.units.push(u);
    s.slots[slot].unitId = u.id;
    return u;
  };

  it('3티어 미만에서는 종류가 다르면 안 합쳐진다', () => {
    const engine = new Engine({ seed: 31 });
    put(engine, 'onigiri', 2, 0);
    put(engine, 'alba', 2, 1);
    expect(canTierMerge(engine.state, 2)).toBe(false);
    expect(engine.snapshot().tierMerge).toBeNull();
  });

  it('3티어 두 개는 종류가 달라도 합쳐진다', () => {
    const engine = new Engine({ seed: 32 });
    put(engine, 'onigiri', 3, 0);
    put(engine, 'alba', 3, 1);
    expect(canTierMerge(engine.state, 3)).toBe(true);
    expect(engine.snapshot().tierMerge).toEqual({ tier: 3, count: 2 });
  });

  it('종류가 다르면 어느 쪽으로 남길지 고른다', () => {
    const engine = new Engine({ seed: 33 });
    put(engine, 'onigiri', 3, 0);
    put(engine, 'alba', 3, 1);
    expect(engine.dispatch({ type: 'MERGE_TIER', tier: 3 }).ok).toBe(true);
    expect(engine.state.phase).toBe('promote');
    const c = engine.state.promoteChoice!;
    expect(new Set(c.options)).toEqual(new Set(['onigiri', 'alba']));
    expect(c.tier).toBe(4); // 티어가 오른다
    engine.dispatch({ type: 'CHOOSE_PROMOTE', defId: 'alba' });
    expect(engine.state.units).toHaveLength(1);
    expect(engine.state.units[0].defId).toBe('alba');
    expect(engine.state.units[0].tier).toBe(4);
  });

  it('종류가 같으면 고를 게 없으므로 바로 올라간다', () => {
    const engine = new Engine({ seed: 34 });
    put(engine, 'onigiri', 3, 0);
    put(engine, 'onigiri', 3, 1);
    expect(engine.dispatch({ type: 'MERGE_TIER', tier: 3 }).ok).toBe(true);
    expect(engine.state.phase).toBe('playing');
    expect(engine.state.units).toHaveLength(1);
    expect(engine.state.units[0].tier).toBe(4);
  });

  it('최대 티어에서는 더 합쳐지지 않는다', () => {
    const engine = new Engine({ seed: 35 });
    put(engine, 'onigiri', MAX_TIER, 0);
    put(engine, 'alba', MAX_TIER, 1);
    expect(canTierMerge(engine.state, MAX_TIER)).toBe(false);
    expect(engine.snapshot().tierMerge).toBeNull();
  });

  it('선택한 유닛은 반드시 재료에 들어간다 (아껴 둔 게 멋대로 안 남는다)', () => {
    const engine = new Engine({ seed: 36 });
    const a = put(engine, 'onigiri', 3, 0);
    put(engine, 'alba', 3, 1);
    put(engine, 'hotbar', 3, 2);
    a.damage = 99999; // 활약이 커서 기본 정렬로는 재료에서 빠질 유닛
    engine.state.selectedUnitId = a.id;
    engine.dispatch({ type: 'MERGE_TIER', tier: 3 });
    expect(engine.state.promoteChoice!.options).toContain('onigiri');
  });
});
