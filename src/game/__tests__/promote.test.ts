import { describe, it, expect } from 'vitest';
import { Engine } from '../engine/Engine';
import { UNIT_BY_ID, unitsOfRarity, NEXT_RARITY } from '../data/units';
import { createUnit } from '../engine/unitFactory';
import { MERGE_ODDS } from '../config';

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
