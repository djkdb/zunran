import type { Enemy, GameState, Projectile, Unit, UnitDef } from '../types';
import { PROJECTILE_SPEED, COMBO_WINDOW } from '../config';
import { ENEMY_BY_ID } from '../data/enemies';
import { addFloater, sfx, unitDef, unitDamage, unitInterval, unitRange, auraRadius, auraValue, dist2, isTargetable } from './helpers';
import { damageEnemy, applySlow } from './enemySystem';

// 매 틱: 오라 버프 재계산 → 타겟팅/공격 → 스킬 → 투사체 이동
export function updateUnits(state: GameState, dt: number): void {
  // 콤보는 시간이 지나면 끊긴다
  if (state.combo.count > 0 && state.time > state.combo.until) state.combo.count = 0;
  void COMBO_WINDOW;
  computeBuffs(state);
  const targetable = state.enemies.filter(isTargetable);

  for (const u of state.units) {
    const def = unitDef(u);
    u.cooldown -= dt;
    if (def.skill) u.skillCd -= dt;
    if (u.disabledUntil > state.time) continue;
    if (def.attack === 'none') continue;

    if (u.cooldown <= 0) {
      const target = pickTarget(state, u, def, targetable);
      if (target) {
        attack(state, u, def, target);
        u.cooldown = unitInterval(state, u);
        u.lastAttackAt = state.time;
        u.facing = target.x >= state.slots[u.slot].x ? 1 : -1;
      }
    }
  }
  // 스킬 (공격 불가 유닛도 스킬은 쓸 수 있게 별도 루프)
  for (const u of state.units) {
    const def = unitDef(u);
    if (!def.skill || u.skillCd > 0 || u.disabledUntil > state.time) continue;
    castSkill(state, u, def, targetable);
  }
  updateProjectiles(state, dt);
}

function computeBuffs(state: GameState): void {
  const cctvBoost = state.modifiers.auraMult;
  const auras: { x: number; y: number; r2: number; kind: 'atkSpeed' | 'dmg'; v: number; id: number }[] = [];
  for (const u of state.units) {
    const d = unitDef(u);
    if (!d.aura || u.disabledUntil > state.time) continue;
    if (d.aura.kind !== 'atkSpeed' && d.aura.kind !== 'dmg') continue;
    const s = state.slots[u.slot];
    const r = auraRadius(d, u.tier);
    auras.push({ x: s.x, y: s.y, r2: r * r, kind: d.aura.kind, v: auraValue(state, d, u.tier) * (d.id === 'cctv' ? cctvBoost : 1), id: u.id });
  }
  for (const u of state.units) {
    let atk = 0;
    let dmg = 0;
    const s = state.slots[u.slot];
    for (const a of auras) {
      if (a.id === u.id) continue;
      if (dist2(a.x, a.y, s.x, s.y) > a.r2) continue;
      if (a.kind === 'atkSpeed') atk += a.v;
      else dmg += a.v;
    }
    u.buffs.atkSpeed = Math.min(1.5, atk);
    u.buffs.dmg = Math.min(1.5, dmg);
  }
}

function pickTarget(state: GameState, u: Unit, def: UnitDef, targetable: Enemy[]): Enemy | null {
  const s = state.slots[u.slot];
  const r = unitRange(state, u);
  const r2 = r * r;
  let best: Enemy | null = null;
  let bestScore = -Infinity;
  for (const e of targetable) {
    if (e.dead || e.hidden) continue; // 같은 틱에 이미 처리된 손님 제외
    const d = dist2(s.x, s.y, e.x, e.y);
    if (d > r2) continue;
    let score: number;
    switch (def.targeting) {
      case 'first':
        score = e.dist;
        break;
      case 'strongest':
        score = e.hp;
        break;
      case 'nearest':
        score = -d;
        break;
      case 'random':
        score = state.rng.next();
        break;
    }
    if (score > bestScore) {
      bestScore = score;
      best = e;
    }
  }
  return best;
}

function attack(state: GameState, u: Unit, def: UnitDef, target: Enemy): void {
  const s = state.slots[u.slot];
  const dmg = unitDamage(state, u);
  if (def.attack === 'projectile') {
    const p: Projectile = {
      id: state.nextId++,
      x: s.x,
      y: s.y - 10,
      targetId: target.id,
      speed: PROJECTILE_SPEED,
      dmg,
      fromUnitId: u.id,
      sprite: def.projectile ?? 'p_generic',
      color: def.color,
      aoeRadius: def.aoeRadius ?? 0,
      onHit: def.onHit,
      life: 2,
    };
    state.projectiles.push(p);
    sfx(state, 'attack');
  } else if (def.attack === 'instant') {
    damageEnemy(state, target, dmg, u, def.onHit);
    state.fx.push({ type: 'hit', x: target.x, y: target.y, color: def.color });
    sfx(state, 'hit');
  } else if (def.attack === 'aoe') {
    const r = def.aoeRadius ?? 60;
    const r2 = r * r;
    for (const e of state.enemies) {
      if (!isTargetable(e)) continue;
      if (dist2(target.x, target.y, e.x, e.y) <= r2) damageEnemy(state, e, dmg, u, def.onHit);
    }
    state.fx.push({ type: 'explode', x: target.x, y: target.y, radius: r, color: def.color });
    sfx(state, 'hit');
  }
}

function castSkill(state: GameState, u: Unit, def: UnitDef, targetable: Enemy[]): void {
  const sk = def.skill!;
  const s = state.slots[u.slot];
  const radius = (sk.radius ?? unitRange(state, u)) + (u.tier - 1) * 8;
  const r2 = radius * radius;
  const inRange = targetable.filter((e) => dist2(s.x, s.y, e.x, e.y) <= r2);
  if (inRange.length === 0) return;
  const dmg = unitDamage(state, u);
  const tierBoost = 1 + (u.tier - 1) * 0.25;
  let cast = true;
  switch (sk.kind) {
    case 'slowAll':
      for (const e of inRange) applySlow(state, e, Math.min(0.8, sk.value * tierBoost), sk.dur ?? 2);
      break;
    case 'stunOne': {
      const candidates = inRange.filter((e) => !ENEMY_BY_ID[e.defId].immune?.includes('stun'));
      if (candidates.length === 0) {
        cast = false;
        break;
      }
      const target = candidates.reduce((a, b) => (a.hp > b.hp ? a : b));
      target.stun = Math.max(target.stun, sk.value * tierBoost);
      target.bubble = { text: '…얼마라고요?', until: state.time + sk.value };
      break;
    }
    case 'burn':
      for (const e of inRange) e.dot = { dps: Math.max(e.dot.until > state.time ? e.dot.dps : 0, sk.value * tierBoost * (1 + (u.tier - 1))), until: state.time + (sk.dur ?? 4) };
      break;
    case 'pullAll':
      for (const e of inRange) {
        const d = ENEMY_BY_ID[e.defId];
        if (d.immune?.includes('knockback') || e.isBoss) continue;
        e.dist = Math.max(0, e.dist - sk.value * tierBoost);
      }
      break;
    case 'megaSlash':
      if (inRange.length < 2 && !inRange[0].isBoss) {
        cast = false;
        break;
      }
      for (const e of inRange) damageEnemy(state, e, dmg * sk.value, u, undefined);
      state.fx.push({ type: 'shake', amount: def.rarity === 'legendary' ? 8 : 4 });
      break;
    case 'freeze':
      for (const e of inRange) {
        if (ENEMY_BY_ID[e.defId].immune?.includes('stun')) continue;
        e.stun = Math.max(e.stun, sk.value * tierBoost);
      }
      break;
    case 'jackpot':
    case 'coinBurst':
      cast = false;
      break;
  }
  if (!cast) {
    u.skillCd = 1; // 조건 미충족 시 1초 후 재시도
    return;
  }
  u.skillCd = sk.cooldown;
  state.fx.push({ type: 'skill', x: s.x, y: s.y, radius, color: def.color, kind: sk.kind });
  if (sk.line) addFloater(state, { x: s.x, y: s.y - 34, text: sk.line, color: def.color, size: 12, life: 1.2 });
  sfx(state, 'skill');
}

function updateProjectiles(state: GameState, dt: number): void {
  const enemyById = new Map<number, Enemy>();
  for (const e of state.enemies) enemyById.set(e.id, e);
  const unitById = new Map<number, Unit>();
  for (const u of state.units) unitById.set(u.id, u);

  const alive: Projectile[] = [];
  for (const p of state.projectiles) {
    p.life -= dt;
    const t = enemyById.get(p.targetId);
    if (!t || t.dead || t.reached || p.life <= 0) continue;
    const dx = t.x - p.x;
    const dy = t.y - p.y;
    const d = Math.hypot(dx, dy);
    const step = p.speed * dt;
    if (d <= step + 6) {
      const from = unitById.get(p.fromUnitId) ?? null;
      if (p.aoeRadius > 0) {
        const r2 = p.aoeRadius * p.aoeRadius;
        for (const e of state.enemies) {
          if (!isTargetable(e) && e !== t) continue;
          if (dist2(t.x, t.y, e.x, e.y) <= r2) damageEnemy(state, e, p.dmg, from, p.onHit);
        }
        state.fx.push({ type: 'explode', x: t.x, y: t.y, radius: p.aoeRadius, color: p.color });
      } else {
        if (!t.hidden) damageEnemy(state, t, p.dmg, from, p.onHit);
        state.fx.push({ type: 'hit', x: t.x, y: t.y, color: p.color });
      }
      continue;
    }
    p.x += (dx / d) * step;
    p.y += (dy / d) * step;
    alive.push(p);
  }
  state.projectiles = alive;
}
