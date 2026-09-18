import type { Enemy, GameState, Unit, UnitDef, Tier, Rarity, Floater } from '../types';
import { UNIT_BY_ID } from '../data/units';
import { ENEMY_BY_ID } from '../data/enemies';
import { tierDmgMult, tierIntervalMult, tierRangeBonus } from '../config';

export function unitDef(u: Unit): UnitDef {
  return UNIT_BY_ID[u.defId];
}

// 유닛을 놓을 수 있는 칸. 잠긴 칸(아직 증축 안 함)과 봉쇄된 칸(「혼자 근무」)은 뺀다.
//
// 이 판정이 여러 군데로 흩어져 있었다가 「본사 지원」 보상이 잠긴 칸에 에픽을
// 밀어 넣는 버그가 났다. 칸을 고르는 곳은 전부 이 두 함수만 쓴다.
export function openSlots(state: GameState) {
  return state.slots.filter((sl) => !sl.locked && !sl.blocked);
}

export function freeSlots(state: GameState) {
  return openSlots(state).filter((sl) => sl.unitId === null);
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
// ───────── 옆자리 시너지 ─────────
//
// 30판을 돌려 최종 보드를 봤더니 전부 잡탕 ★1 이었다 (냉장고1 삼각김밥1 냉장고1 …).
// 보드가 '내가 만든 것' 이 아니라 '뽑기가 준 것' 이었다. 배치에 이유가 없었기 때문이다.
// 코너 보너스는 줄 단위라 어느 줄에 놓을지만 정했지, 누구 옆에 놓을지는 아무 의미가 없었다.
//
// 규칙은 딱 둘이고, 서로 배타적이다 — 그래서 매번 고르게 된다.
//   A. 같은 역할끼리 붙이면 화력이 는다 (옆 한 명당 +12%, 최대 두 명)
//   B. 지원 유닛 옆에 서면 손이 빨라진다 (+14%, 중복 없음)
// 몰아넣을 것인가, 섞어 넣을 것인가. 한 칸은 한 번만 쓸 수 있다.
//
// 지원 유닛(냉장고·CCTV)은 등장 63%·27% 인데 피해 지분도 MVP 도 0% 였다.
// 이제 옆자리 값을 한다.
export const ADJ_SAME_ROLE = 0.12;
export const ADJ_NEAR_SUPPORT = 0.14;
export const ADJ_MAX_SAME = 2;

export interface Adjacency {
  sameRole: number; // 옆에 붙은 같은 역할 수 (0~2)
  nearSupport: boolean;
  dmg: number; // 곱할 배율
  atkSpeed: number;
}

const NO_ADJ: Adjacency = { sameRole: 0, nearSupport: false, dmg: 1, atkSpeed: 1 };

// 같은 줄에서 좌우로 맞닿은 칸. 칸은 줄 단위로 이어 붙여 만들므로 index ±1 이 곧 옆칸이다.
function neighbors(state: GameState, u: Unit): Unit[] {
  const here = state.slots[u.slot];
  if (!here) return [];
  const out: Unit[] = [];
  for (const idx of [u.slot - 1, u.slot + 1]) {
    const sl = state.slots[idx];
    if (!sl || sl.row !== here.row || sl.unitId === null) continue;
    const n = state.units.find((x) => x.id === sl.unitId);
    if (n) out.push(n);
  }
  return out;
}

export function computeAdjacency(state: GameState, u: Unit): Adjacency {
  const def = unitDef(u);
  const ns = neighbors(state, u);
  if (ns.length === 0) return NO_ADJ;
  let sameRole = 0;
  let nearSupport = false;
  for (const n of ns) {
    const nd = unitDef(n);
    if (nd.role === def.role) sameRole++;
    if (nd.role === 'support' && n.id !== u.id) nearSupport = true;
  }
  sameRole = Math.min(ADJ_MAX_SAME, sameRole);
  // 「합을 맞춘다」 는 이 값을 2배로, 「코너 장사」 는 0 으로 만든다.
  const k = state.perma.adjMult;
  return {
    sameRole,
    nearSupport,
    dmg: 1 + sameRole * ADJ_SAME_ROLE * k,
    atkSpeed: nearSupport ? 1 + ADJ_NEAR_SUPPORT * k : 1,
  };
}

// 매 틱 유닛 갱신 직전에 한 번만 계산한다 (유닛 21개 × 이웃 2칸 = 무시할 비용).
// 배치가 바뀌는 곳이 뽑기·이동·판매·합성·조합·보상으로 흩어져 있어서,
// 각 지점에서 갱신하면 언젠가 하나를 빠뜨리고 낡은 값이 남는다.
export function recomputeAdjacency(state: GameState): void {
  for (const u of state.units) u.adj = computeAdjacency(state, u);
}

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
    (u.adj?.dmg ?? 1) *
    (1 + u.buffs.dmg)
  );
}

export function unitInterval(state: GameState, u: Unit): number {
  const def = unitDef(u);
  const base = def.interval * tierIntervalMult(u.tier);
  return base / (state.modifiers.unitAtkSpeed * state.perma.atkSpeed * aisleBonus(state, u).atkSpeed * (u.adj?.atkSpeed ?? 1) * (1 + u.buffs.atkSpeed));
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
