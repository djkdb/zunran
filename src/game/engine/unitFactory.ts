import type { GameState, Tier, Unit } from '../types';
import { UNIT_BY_ID } from '../data/units';

export function createUnit(state: GameState, defId: string, tier: Tier, slot: number): Unit {
  const def = UNIT_BY_ID[defId];
  return {
    id: state.nextId++,
    defId,
    tier,
    slot,
    cooldown: 0.3,
    skillCd: def.skill ? def.skill.cooldown * 0.5 : 0,
    disabledUntil: 0,
    buffs: { atkSpeed: 0, dmg: 0 },
    kills: 0,
    damage: 0,
    bornAt: state.time,
    lastAttackAt: -10,
    facing: 1,
  };
}
