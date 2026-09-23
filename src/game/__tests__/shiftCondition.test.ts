import { describe, expect, it } from 'vitest';
import { Engine } from '../engine/Engine';
import { CONDITION_BY_ID } from '../data/shiftConditions';
import { DEFAULT_META_LEVELS, metaEffects } from '../save/meta';

describe('근무 조건 체력 제한', () => {
  it('점수 ×1.9 조건은 기본 체력 100을 최대 25로 낮추고 복원해도 유지한다', () => {
    const engine = new Engine({ seed: 42, condition: CONDITION_BY_ID.brokenPos });
    expect(engine.state.meta.startHp).toBe(100);
    expect(engine.snapshot()).toMatchObject({ hp: 25, maxHp: 25 });
    expect(Engine.restore(engine.checkpoint())?.snapshot()).toMatchObject({ hp: 25, maxHp: 25 });
  });

  it('체력 영구 강화가 있으면 강화된 기본 체력의 25%를 적용한다', () => {
    const meta = metaEffects({ ...DEFAULT_META_LEVELS, startHp: 4 });
    const engine = new Engine({ seed: 42, meta, condition: CONDITION_BY_ID.brokenPos });
    expect(engine.snapshot()).toMatchObject({ hp: Math.round(meta.startHp * 0.25), maxHp: Math.round(meta.startHp * 0.25) });
  });
});
