import type { GameState, Tier, Unit, Rarity } from '../types';
import { MERGE_ODDS, MAX_TIER, RARITY_LABEL } from '../config';
import { PROMOTE_OPTIONS } from '../data/deck';

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
  // '합성 운' 강화는 승급(promote) 구간을 넓힌다. 강화 구간이 그만큼 줄어든다.
  const promoteBonus = Math.min(0.25, state.meta.mergePromoteBonus ?? 0);
  const upgradeCut = MERGE_ODDS.upgrade - promoteBonus;
  let kind: MergeResult['kind'] = 'upgrade';
  let resultDef = def.id;
  let resultTier: Tier = (tier + 1) as Tier;
  const nextRarity = NEXT_RARITY[def.rarity];
  if (def.rarity === 'legendary' || def.rarity === 'special') {
    kind = 'upgrade';
  } else if (roll < upgradeCut) {
    kind = 'upgrade';
  } else if (roll < upgradeCut + MERGE_ODDS.promote + promoteBonus && nextRarity) {
    kind = 'promote';
    // 승급 결과는 전체 풀에서 뽑되, 두 장을 보여주고 플레이어가 고르게 한다.
    // 예전에는 한 장이 통째로 랜덤이었다. 그러면 "같은 물건 3개를 모았다"는 성취가
    // 주사위 두 번(승급이냐 × 무엇이냐)에 희석된다 (docs/AUDIT.md 5절).
    // 후보가 무엇인지는 여전히 모른다 = 놀라움은 그대로, 통제만 돌려준다.
    let pool = unitsOfRarity(nextRarity).filter((u) => u.id !== def.id && !state.order.bans.includes(u.id));
    if (pool.length === 0) pool = unitsOfRarity(nextRarity).filter((u) => u.id !== def.id);
    const options: string[] = [];
    const rest = [...pool];
    while (options.length < PROMOTE_OPTIONS && rest.length > 0) {
      const idx = Math.floor(state.rng.next() * rest.length);
      options.push(rest.splice(idx, 1)[0].id);
    }
    if (options.length > 1) {
      // 재료를 먼저 치우고 선택 화면을 연다. 고르기 전까지 게임은 멈춘다.
      consumeMaterials(state, materials);
      state.stats.merges++;
      state.stats.unitMerges[defId] = (state.stats.unitMerges[defId] ?? 0) + 1;
      state.promoteChoice = { slot: keepSlot, tier, options, fromDefId: defId };
      state.phase = 'promote';
      state.fx.push({ type: 'banner', text: '승급!', sub: '둘 중 하나를 고르세요', style: 'good', dur: 1.4 });
      state.fx.push({ type: 'shake', amount: 6 });
      sfx(state, 'mergeUp');
      return { ok: true, kind: 'promote' };
    }
    resultDef = options[0] ?? def.id;
    resultTier = tier;
  } else {
    kind = 'special';
    // 특수: 점장 또는 합성 전용 특수 유닛, 같은 티어
    const specials = [...unitsOfRarity('special', true), UNIT_BY_ID.manager];
    resultDef = state.rng.pick(specials).id;
    resultTier = tier;
  }

  consumeMaterials(state, materials);
  const unit = createUnit(state, resultDef, resultTier, keepSlot);
  state.units.push(unit);
  state.slots[keepSlot].unitId = unit.id;
  state.selectedUnitId = null;
  state.stats.merges++;
  state.stats.unitMerges[defId] = (state.stats.unitMerges[defId] ?? 0) + 1;
  if (!state.stats.seenUnits.includes(resultDef)) state.stats.seenUnits.push(resultDef);
  state.stats.maxTierReached = Math.max(state.stats.maxTierReached, resultTier);
  state.stats.unitMaxTier[resultDef] = Math.max(state.stats.unitMaxTier[resultDef] ?? 1, resultTier);

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

function consumeMaterials(state: GameState, materials: Unit[]): void {
  for (const m of materials) state.slots[m.slot].unitId = null;
  state.units = state.units.filter((u) => !materials.includes(u));
  state.selectedUnitId = null;
}

// 승급 2택에서 하나를 고른 순간. 여기서 비로소 유닛이 생긴다.
export function choosePromote(state: GameState, defId: string): boolean {
  const c = state.promoteChoice;
  if (state.phase !== 'promote' || !c) return false;
  if (!c.options.includes(defId)) return false;
  const unit = createUnit(state, defId, c.tier, c.slot);
  state.units.push(unit);
  state.slots[c.slot].unitId = unit.id;
  state.promoteChoice = null;
  state.phase = 'playing';

  const rdef = UNIT_BY_ID[defId];
  if (!state.stats.seenUnits.includes(defId)) state.stats.seenUnits.push(defId);
  state.stats.maxTierReached = Math.max(state.stats.maxTierReached, c.tier);
  state.stats.unitMaxTier[defId] = Math.max(state.stats.unitMaxTier[defId] ?? 1, c.tier);
  state.lastMergeResult = { defId, tier: c.tier, rarity: rdef.rarity, kind: 'promote', at: state.time };
  state.fx.push({ type: 'merge', slot: c.slot, rarity: rdef.rarity, upgraded: true });
  state.fx.push({ type: 'banner', text: `${RARITY_LABEL[rdef.rarity]} 등장!`, sub: rdef.name, style: rdef.rarity === 'legendary' ? 'legendary' : 'good', dur: 1.8 });
  sfx(state, 'mergeUp');
  if (rdef.rarity === 'legendary') announceLegendary(state);
  return true;
}

export function announceLegendary(state: GameState): void {
  state.fx.push({ type: 'banner', text: '전설 등장', sub: '점장이 출근했습니다', style: 'legendary', dur: 3 });
  state.fx.push({ type: 'shake', amount: 18 });
  state.fx.push({ type: 'flash', color: '#ffd166' });
}

export function rarityOf(defId: string): Rarity {
  return UNIT_BY_ID[defId].rarity;
}
