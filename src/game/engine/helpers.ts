import type { Enemy, GameState, Unit, UnitDef, Tier, Rarity, Floater } from '../types';
import { UNIT_BY_ID } from '../data/units';
import { ENEMY_BY_ID } from '../data/enemies';
import { tierDmgMult, tierIntervalMult, tierRangeBonus } from '../config';

export function unitDef(u: Unit): UnitDef {
  return UNIT_BY_ID[u.defId];
}

export function unitPos(state: GameState, u: Unit): { x: number; y: number } {
  const s = state.slots[u.slot];
  return { x: s.x, y: s.y };
}

export function dist2(ax: number, ay: number, bx: number, by: number): number {
  const dx = ax - bx;
  const dy = ay - by;
  return dx * dx + dy * dy;
}

// 코너(줄) 배치 보너스. 슬롯의 row 로 결정된다.
// perma.aisleMult 는 「진열대 재배치」 보상이 올린다 — 보너스의 '초과분'만 배로 늘린다.
export function aisleBonus(state: GameState, u: Unit) {
  const list = state.geo.aisleBonus;
  const b = list[state.slots[u.slot].row] ?? list[0];
  const k = state.perma.aisleMult;
  if (k === 1) return b;
  return {
    label: b.label,
    dmg: 1 + (b.dmg - 1) * k,
    atkSpeed: 1 + (b.atkSpeed - 1) * k,
    range: b.range * k,
  };
}

// ZUNRAN DAILY 의 코너별 공격력 배율 (예: "음료의 밤" = 음료 코너 ×2)
export function aisleChallengeMult(state: GameState, u: Unit): number {
  const a = state.challenge?.aisleDmg;
  if (!a) return 1;
  return a[state.slots[u.slot].row] ?? 1;
}

// 오라 값의 티어 스케일: 티어당 +40% (냉장고 t3 = 0.3 × 1.8 = 0.54 감속)
export function auraValue(state: GameState, def: UnitDef, tier: Tier): number {
  if (!def.aura) return 0;
  const v = def.aura.value * (1 + 0.4 * (tier - 1)) * state.perma.auraMult;
  return def.aura.kind === 'enemySlow' ? Math.min(0.8, v * state.perma.slowMult) : v;
}
export function auraRadius(def: UnitDef, tier: Tier): number {
  if (!def.aura) return 0;
  return def.aura.radius + tierRangeBonus(tier);
}

// 최종 피해량 (티어 · 코너 보너스 · 보상 강화 · 이벤트 배율 · 오라 버프)
export function unitDamage(state: GameState, u: Unit): number {
  const def = unitDef(u);
  const m = state.modifiers;
  const p = state.perma;
  const byId = m.unitDmgById[def.id] ?? 1;
  return (
    def.dmg *
    tierDmgMult(u.tier) *
    aisleBonus(state, u).dmg *
    aisleChallengeMult(state, u) *
    p.dmg *
    (p.roleDmg[def.role] ?? 1) *
    m.unitDmg *
    byId *
    (1 + u.buffs.dmg)
  );
}

export function unitInterval(state: GameState, u: Unit): number {
  const def = unitDef(u);
  const base = def.interval * tierIntervalMult(u.tier);
  return base / (state.modifiers.unitAtkSpeed * state.perma.atkSpeed * aisleBonus(state, u).atkSpeed * (1 + u.buffs.atkSpeed));
}

export function unitRange(state: GameState, u: Unit): number {
  const def = unitDef(u);
  if (def.range === 0) return 0;
  return def.range + tierRangeBonus(u.tier) + aisleBonus(state, u).range + state.perma.range;
}

export function isTargetable(e: Enemy): boolean {
  return !e.dead && !e.reached && !e.hidden && e.dist > 0;
}

export function enemyName(e: Enemy): string {
  return ENEMY_BY_ID[e.defId].name;
}

export function rarityRank(r: Rarity): number {
  return { common: 0, rare: 1, epic: 2, special: 3, legendary: 4 }[r];
}

export function addFloater(state: GameState, f: Partial<Floater> & { x: number; y: number; text: string }): void {
  if (state.floaters.length > 60) state.floaters.shift();
  state.floaters.push({
    x: f.x,
    y: f.y,
    text: f.text,
    color: f.color ?? '#ffffff',
    life: f.life ?? 1,
    maxLife: f.life ?? 1,
    vy: f.vy ?? -28,
    size: f.size ?? 13,
  });
}

export function sfx(state: GameState, id: Parameters<typeof pushSfx>[1]): void {
  pushSfx(state, id);
}
function pushSfx(state: GameState, id: import('../types').SfxId): void {
  state.fx.push({ type: 'sfx', id });
}
