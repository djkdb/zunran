import type { GameState, Tier, Unit, Rarity } from '../types';
import { MERGE_ODDS, MAX_TIER, RARITY_LABEL } from '../config';
import { UNIT_BY_ID, unitsOfRarity, NEXT_RARITY } from '../data/units';
import { sfx, addFloater } from './helpers';
import { createUnit } from './unitFactory';

export interface MergeResult {
  ok: boolean;
  reason?: string;
  unit?: Unit;
  kind?: 'upgrade' | 'promote' | 'special';
}

export function canMerge(state: GameState, defId: string, tier: Tier): boolean {
  if (tier >= MAX_TIER) return false;
  return state.units.filter((u) => u.defId === defId && u.tier === tier).length >= 3;
}

// 같은 유닛·같은 티어 3개 → 70% 강화 / 25% 상위 희귀도 랜덤 / 5% 특수
export function mergeUnits(state: GameState, defId: string, tier: Tier): MergeResult {
  if (tier >= MAX_TIER) return { ok: false, reason: '최대 티어입니다' };
  const group = state.units.filter((u) => u.defId === defId && u.tier === tier);
  if (group.length < 3) return { ok: false, reason: '같은 유닛 3개가 필요합니다' };
  const def = UNIT_BY_ID[defId];
  const materials = group.slice(0, 3);
  // 선택된 유닛이 재료에 포함되면 그 슬롯을 결과 위치로 사용
  const selected = materials.find((u) => u.id === state.selectedUnitId);
  const keepSlot = (selected ?? materials[0]).slot;

  const roll = state.rng.next();
  let kind: MergeResult['kind'] = 'upgrade';
  let resultDef = def.id;
  let resultTier: Tier = (tier + 1) as Tier;
  const nextRarity = NEXT_RARITY[def.rarity];
  if (def.rarity === 'legendary' || def.rarity === 'special') {
    kind = 'upgrade';
  } else if (roll < MERGE_ODDS.upgrade) {
    kind = 'upgrade';
  } else if (roll < MERGE_ODDS.upgrade + MERGE_ODDS.promote && nextRarity) {
    kind = 'promote';
    const pool = unitsOfRarity(nextRarity).filter((u) => u.id !== def.id);
    resultDef = state.rng.pick(pool).id;
    resultTier = tier;
  } else {
    kind = 'special';
    // 특수: 점장 또는 합성 전용 특수 유닛, 같은 티어
    const specials = [...unitsOfRarity('special', true), UNIT_BY_ID.manager];
    resultDef = state.rng.pick(specials).id;
    resultTier = tier;
  }

  for (const m of materials) {
    state.slots[m.slot].unitId = null;
  }
  state.units = state.units.filter((u) => !materials.includes(u));
  const unit = createUnit(state, resultDef, resultTier, keepSlot);
  state.units.push(unit);
  state.slots[keepSlot].unitId = unit.id;
  state.selectedUnitId = null;
  state.stats.merges++;
  if (!state.stats.seenUnits.includes(resultDef)) state.stats.seenUnits.push(resultDef);
  state.stats.maxTierReached = Math.max(state.stats.maxTierReached, resultTier);

  const rdef = UNIT_BY_ID[resultDef];
  const upgraded = kind !== 'upgrade';
  state.fx.push({ type: 'merge', slot: keepSlot, rarity: rdef.rarity, upgraded });
  state.lastMergeResult = { defId: resultDef, tier: resultTier, rarity: rdef.rarity, kind: kind!, at: state.time };
  const s = state.slots[keepSlot];
  if (kind === 'upgrade') {
    addFloater(state, { x: s.x, y: s.y - 34, text: `${rdef.name} ★${resultTier}`, color: '#fde68a', size: 14, life: 1.4 });
    sfx(state, 'merge');
  } else if (kind === 'promote') {
    state.fx.push({ type: 'banner', text: `${RARITY_LABEL[rdef.rarity]} 등장!`, sub: `합성 결과: ${rdef.name}`, style: rdef.rarity === 'legendary' ? 'legendary' : 'good', dur: 2 });
    state.fx.push({ type: 'shake', amount: 5 });
    sfx(state, 'mergeUp');
    if (rdef.rarity === 'legendary') announceLegendary(state);
  } else {
    state.fx.push({ type: 'banner', text: '?????', sub: `합성 결과: ${rdef.name}`, style: 'legendary', dur: 2.4 });
    state.fx.push({ type: 'shake', amount: 10 });
    state.fx.push({ type: 'flash', color: rdef.rarity === 'legendary' ? '#ffd166' : '#ff7eb6' });
    sfx(state, 'legendary');
    if (rdef.rarity === 'legendary') announceLegendary(state);
  }
  return { ok: true, unit, kind };
}

export function announceLegendary(state: GameState): void {
  state.fx.push({ type: 'banner', text: 'LEGENDARY', sub: '점장이 출근했습니다.', style: 'legendary', dur: 3 });
  state.fx.push({ type: 'shake', amount: 18 });
  state.fx.push({ type: 'flash', color: '#ffd166' });
}

export function rarityOf(defId: string): Rarity {
  return UNIT_BY_ID[defId].rarity;
}
