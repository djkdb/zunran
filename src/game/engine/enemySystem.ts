import type { Enemy, GameState, OnHitEffect, Unit } from '../types';
import { ENEMY_BY_ID } from '../data/enemies';
import { PATH_LENGTH, pathPos, enemyHpScale, enemyDamageScale, MAX_ENEMIES_ON_FIELD, LOW_HP_THRESHOLD, formatClock, armorAt, ARMOR_FLOOR } from '../config';
import { addFloater, sfx, unitDef, auraRadius, auraValue, dist2, isTargetable } from './helpers';
import { rewardKill } from './economy';
import { BOSS_INTRO } from '../data/dialogue';

// ───────────── 스폰 ─────────────

// trackWave(기본 true): 현재 웨이브 소속으로 등록해 클리어 판정에 포함한다 (이벤트 스폰, 보스 소환물 포함).
export function spawnEnemy(
  state: GameState,
  defId: string,
  opts: { hpMult?: number; dist?: number; groupId?: number; wave?: number; silent?: boolean; trackWave?: boolean } = {},
): Enemy | null {
  if (state.enemies.length >= MAX_ENEMIES_ON_FIELD) return null;
  const def = ENEMY_BY_ID[defId];
  if (!def) return null;
  const wave = opts.wave ?? state.wave;
  const hp = Math.round(def.hp * enemyHpScale(wave) * (opts.hpMult ?? 1) * (state.challenge?.enemyHpMult ?? 1));
  const pos = pathPos(opts.dist ?? 0);
  const e: Enemy = {
    id: state.nextId++,
    defId,
    hp,
    maxHp: hp,
    dist: opts.dist ?? -state.rng.next() * 20,
    baseSpeed: def.speed,
    speedMult: 1,
    slow: { pct: 0, until: 0 },
    stun: 0,
    dot: { dps: 0, until: 0 },
    hidden: false,
    stateTimer: def.behavior.kind === 'askPrice' ? def.behavior.every * (0.5 + state.rng.next() * 0.5) : def.behavior.kind === 'charger' ? def.behavior.every * 0.6 : 0,
    stateFlag: 0,
    groupId: opts.groupId,
    isBoss: def.tags.includes('boss'),
    bossPhase: 0,
    shield: 0,
    swarmBoost: 0,
    spawnedWave: wave,
    reached: false,
    dead: false,
    hitFlash: 0,
    x: pos.x,
    y: pos.y,
    facing: 1,
  };
  if (!opts.silent && state.rng.next() < 0.55) {
    e.bubble = { text: def.lines[Math.floor(state.rng.next() * def.lines.length)], until: state.time + 2.2 };
  }
  state.enemies.push(e);
  if (opts.trackWave !== false) state.waveEnemyIds.add(e.id);
  if (!state.stats.seenEnemies.includes(defId)) state.stats.seenEnemies.push(defId);
  state.stats.enemySeen[defId] = (state.stats.enemySeen[defId] ?? 0) + 1;
  if (e.isBoss) {
    state.bossAlive = true;
    const intro = BOSS_INTRO[defId];
    state.fx.push({ type: 'banner', text: intro?.title ?? def.name, sub: intro?.sub ?? 'BOSS', style: 'boss', dur: 3 });
    state.fx.push({ type: 'shake', amount: 14 });
    sfx(state, 'boss');
  } else if (defId === 'karen3am') {
    state.fx.push({ type: 'banner', text: '진상 등장', sub: '새벽 3시 진상 손님', style: 'warning', dur: 2.2 });
    state.fx.push({ type: 'shake', amount: 6 });
    sfx(state, 'warning');
  } else if (!opts.silent) {
    sfx(state, 'spawn');
  }
  return e;
}

// ───────────── 피해 ─────────────

export function damageEnemy(state: GameState, e: Enemy, rawAmount: number, source: Unit | null, onHit?: OnHitEffect): void {
  if (e.dead || e.reached) return;
  const def = ENEMY_BY_ID[e.defId];
  let amount = rawAmount;
  let crit = false;
  if (onHit?.randomMult) {
    amount *= onHit.randomMult[0] + state.rng.next() * (onHit.randomMult[1] - onHit.randomMult[0]);
  }
  // 보상 카드의 치명타는 유닛이 가한 모든 공격에 얹힌다
  const critChance = (onHit?.critChance ?? 0) + (source ? state.perma.critChance : 0);
  if (critChance > 0 && state.rng.next() < critChance) {
    amount *= onHit?.critMult ?? 2;
    crit = true;
  }
  if (e.shield > 0) {
    const absorbed = Math.min(e.shield, amount);
    e.shield -= absorbed;
    amount -= absorbed;
    if (absorbed > 0 && amount <= 0) {
      addFloater(state, { x: e.x, y: e.y - 20, text: '보호막', color: '#c4b5fd', size: 11, life: 0.5 });
      return;
    }
  }
  // 장갑: 한 방의 크기를 본다. 작게 여러 번 때리는 유닛은 거의 못 뚫고,
  // 한 방이 큰 유닛은 그대로 들어간다. 바닥(15%)이 있어 완전 무력화는 없다.
  if (def.armor) {
    const armor = armorAt(def.armor, e.spawnedWave) * Math.max(0, 1 - state.meta.armorPierce);
    const blocked = amount - armor;
    if (blocked < amount * ARMOR_FLOOR) {
      if (amount > 0 && source) {
        addFloater(state, { x: e.x, y: e.y - 18, text: '장갑', color: '#94a3b8', size: 10, life: 0.4 });
      }
      amount = amount * ARMOR_FLOOR;
    } else {
      amount = blocked;
    }
  }
  amount = Math.max(0, amount);
  e.hp -= amount;
  e.hitFlash = 0.12;
  if (source) {
    source.damage += amount;
    state.stats.unitDamage[source.defId] = (state.stats.unitDamage[source.defId] ?? 0) + amount;
  }
  if (crit) {
    const big = (onHit?.critMult ?? 2) >= 10;
    addFloater(state, {
      x: e.x,
      y: e.y - 24,
      text: big ? `로또 1등!! ${Math.round(amount)}` : `치명타 ${Math.round(amount)}`,
      color: big ? '#fbbf24' : '#f472b6',
      size: big ? 18 : 13,
      life: big ? 1.6 : 0.8,
    });
    if (big) {
      state.fx.push({ type: 'banner', text: '로또 1등!!!', sub: `${Math.round(amount)} 피해`, style: 'legendary', dur: 1.6 });
      state.fx.push({ type: 'shake', amount: 8 });
      sfx(state, 'legendary');
    }
  } else if (amount >= 200 || e.isBoss) {
    addFloater(state, { x: e.x + (state.rng.next() - 0.5) * 20, y: e.y - 18, text: `${Math.round(amount)}`, color: '#fff', size: e.isBoss ? 12 : 14, life: 0.6 });
  }
  // 명중 효과
  if (onHit) {
    const immune = def.immune ?? [];
    if (onHit.slow && !immune.includes('slow')) applySlow(state, e, onHit.slow.pct, onHit.slow.dur);
    if (onHit.stun && !immune.includes('stun') && state.rng.next() < onHit.stun.chance) {
      e.stun = Math.max(e.stun, onHit.stun.dur);
      addFloater(state, { x: e.x, y: e.y - 22, text: '미끌!', color: '#fdba74', size: 12, life: 0.6 });
    }
    if (onHit.dot) {
      e.dot = { dps: Math.max(e.dot.until > state.time ? e.dot.dps : 0, onHit.dot.dps), until: state.time + onHit.dot.dur };
    }
    // 보스는 스킬/이벤트 넉백과 동일하게 제외 (청소기 하나로 보스를 영구히 묶는 것 방지). 하한 1 = 타겟 가능 경계 유지.
    if (onHit.knockback && !immune.includes('knockback') && !e.isBoss) {
      e.dist = Math.max(1, e.dist - onHit.knockback);
    }
  }
  // 화장실 손님: 맞으면 패닉 가속
  if (def.behavior.kind === 'panic') e.stateTimer = def.behavior.dur;

  if (e.hp <= 0) killEnemy(state, e, source, onHit?.coinOnKill ?? 0);
}

export function applySlow(state: GameState, e: Enemy, pct: number, dur: number): void {
  const def = ENEMY_BY_ID[e.defId];
  if (def.immune?.includes('slow')) return;
  const until = state.time + dur;
  // 「얼음 매장」 보상이 모든 감속을 키운다. 상한 80%는 그대로 둔다.
  const p = Math.min(0.8, pct * state.perma.slowMult);
  if (p >= e.slow.pct || e.slow.until <= state.time) e.slow = { pct: p, until };
  else e.slow.until = Math.max(e.slow.until, until);
}

export function killEnemy(state: GameState, e: Enemy, killer: Unit | null, bonusCoin: number): void {
  if (e.dead) return;
  e.dead = true;
  // 히트스톱은 보스에만 건다. 일반 처치마다 걸면 한 판 700번이 쌓여
  // 실제로 판이 1분 가까이 길어졌다 (측정치 9.8분 → 10.7분).
  // 일반 처치의 손맛은 콤보 5연쇄에서 따로 준다 (economy.ts).
  if (e.isBoss) state.hitstop = Math.max(state.hitstop, 0.2);
  const def = ENEMY_BY_ID[e.defId];
  state.stats.enemyKills[e.defId] = (state.stats.enemyKills[e.defId] ?? 0) + 1;
  rewardKill(state, e, killer, bonusCoin);
  state.fx.push({ type: 'death', x: e.x, y: e.y, color: def.color, boss: e.isBoss });
  if (e.isBoss) {
    state.bossAlive = state.enemies.some((o) => o !== e && o.isBoss && !o.dead && !o.reached);
    state.fx.push({ type: 'banner', text: `${def.name} 처리 완료`, sub: def.deathLines?.[0] ?? '', style: 'clear', dur: 2.2 });
    state.fx.push({ type: 'shake', amount: 10 });
    sfx(state, 'waveClear');
  }
  const lines = def.deathLines;
  if (lines && state.rng.next() < 0.6) {
    addFloater(state, { x: e.x, y: e.y - 30, text: lines[Math.floor(state.rng.next() * lines.length)], color: '#e2e8f0', size: 11, life: 1.1 });
  }
}

// ───────────── 이동/행동 ─────────────

export function updateEnemies(state: GameState, dt: number): void {
  const m = state.modifiers;
  // 냉장고 감속 오라, 사장님불러 버프는 위치 기반이라 먼저 소스 목록을 모은다.
  const slowAuras: { x: number; y: number; r2: number; v: number }[] = [];
  for (const u of state.units) {
    const d = unitDef(u);
    if (d.aura?.kind === 'enemySlow' && u.disabledUntil <= state.time) {
      const s = state.slots[u.slot];
      const r = auraRadius(d, u.tier);
      slowAuras.push({ x: s.x, y: s.y, r2: r * r, v: auraValue(state, d, u.tier) });
    }
  }
  const buffers = state.enemies.filter((e) => !e.dead && !e.reached && ENEMY_BY_ID[e.defId].behavior.kind === 'buffer');
  // 커플 손님: 주변 손님을 초당 일정 비율 회복시킨다 (뭉치면 잘 안 죽는다)
  // (엔진은 결정론적이어야 하므로 연출에도 Math.random 을 쓰지 않는다)
  const healers = state.enemies.filter((e) => !e.dead && !e.reached && ENEMY_BY_ID[e.defId].behavior.kind === 'healer');
  for (const h of healers) {
    const hb = ENEMY_BY_ID[h.defId].behavior;
    if (hb.kind !== 'healer') continue;
    const r2 = hb.radius * hb.radius;
    let healed = false;
    for (const t of state.enemies) {
      if (t.dead || t.reached || t.isBoss || t === h) continue;
      if (t.hp >= t.maxHp) continue;
      if (dist2(h.x, h.y, t.x, t.y) > r2) continue;
      t.hp = Math.min(t.maxHp, t.hp + t.maxHp * hb.healPerSec * dt);
      healed = true;
    }
    if (healed && (!h.bubble || h.bubble.until < state.time)) {
      h.bubble = { text: '♥ 챙겨줄게', until: state.time + 1.2 };
      addFloater(state, { x: h.x, y: h.y - 30, text: '♥', color: '#fda4af', size: 12, life: 0.8 });
    }
  }
  const blockers = state.enemies.filter((e) => !e.dead && !e.reached && ENEMY_BY_ID[e.defId].behavior.kind === 'askPrice' && e.stateFlag === 1);
  // 술 취한 친구들: 그룹 선두 dist
  const groupLead = new Map<number, number>();
  for (const e of state.enemies) {
    if (e.groupId !== undefined && !e.dead && !e.reached) {
      groupLead.set(e.groupId, Math.max(groupLead.get(e.groupId) ?? -Infinity, e.dist));
    }
  }

  for (const e of state.enemies) {
    if (e.dead || e.reached) continue;
    const def = ENEMY_BY_ID[e.defId];
    const b = def.behavior;
    e.hitFlash = Math.max(0, e.hitFlash - dt);

    // 지속 피해 (보호막이 먼저 소모됨)
    if (e.dot.until > state.time && e.dot.dps > 0) {
      let amt = e.dot.dps * dt;
      if (e.shield > 0) {
        const absorbed = Math.min(e.shield, amt);
        e.shield -= absorbed;
        amt -= absorbed;
      }
      e.hp -= amt;
      if (e.hp <= 0) {
        killEnemy(state, e, null, 0);
        continue;
      }
    }

    // 상태이상: 정지
    if (e.stun > 0) {
      e.stun -= dt;
      updatePos(e);
      continue;
    }

    // 속도 계산
    let speed = e.baseSpeed * e.speedMult * m.enemySpeed * (m.enemySpeedById[e.defId] ?? 1);
    let slow = e.slow.until > state.time ? e.slow.pct : 0;
    for (const a of slowAuras) if (dist2(a.x, a.y, e.x, e.y) <= a.r2) slow = Math.max(slow, a.v);
    if (def.immune?.includes('slow')) slow = 0;
    slow = Math.min(0.8, slow);
    speed *= 1 - slow;
    for (const bf of buffers) {
      if (bf === e) continue;
      const bb = ENEMY_BY_ID[bf.defId].behavior;
      if (bb.kind === 'buffer' && dist2(bf.x, bf.y, e.x, e.y) <= bb.radius * bb.radius) {
        speed *= 1 + bb.speedBuff;
        break;
      }
    }
    // 무리: 뭉쳐 있을수록 빨라진다.
    // 범위 공격으로 솎아내면 느려지고, 방치하면 가속해서 감속 유닛 앞을 그냥 지나간다.
    // "무리에는 범위 공격"이라는 답을 만드는 장치다.
    if (def.swarm) {
      const sw = def.swarm;
      const r2 = sw.radius * sw.radius;
      let allies = 0;
      for (const o of state.enemies) {
        if (o === e || o.dead || o.reached) continue;
        if (ENEMY_BY_ID[o.defId].swarm && dist2(o.x, o.y, e.x, e.y) <= r2) allies++;
      }
      if (allies > 0) {
        e.swarmBoost = Math.min(sw.max, allies * sw.perAlly);
        speed *= 1 + e.swarmBoost;
      } else {
        e.swarmBoost = 0;
      }
    }
    // 가격 손님 뒤에 막힘
    for (const bl of blockers) {
      if (bl === e) continue;
      const bb = ENEMY_BY_ID[bl.defId].behavior;
      if (bb.kind === 'askPrice' && e.dist < bl.dist && bl.dist - e.dist < bb.blockRadius) {
        speed *= 0.4;
        break;
      }
    }

    let move = true;
    switch (b.kind) {
      case 'walk':
        break;
      case 'drunk': {
        e.stateTimer += dt;
        if (e.stateFlag === 0 && e.stateTimer >= b.wobbleEvery) {
          e.stateFlag = 1;
          e.stateTimer = 0;
          if (state.rng.next() < 0.5) e.bubble = { text: def.lines[Math.floor(state.rng.next() * def.lines.length)], until: state.time + 1.5 };
        } else if (e.stateFlag === 1) {
          speed = -speed * 0.6; // 뒤로 비틀거림
          if (e.stateTimer >= b.backDur) {
            e.stateFlag = 0;
            e.stateTimer = 0;
          }
        }
        break;
      }
      case 'linger': {
        if (e.stateFlag === 0 && e.dist >= b.atDist) {
          e.stateFlag = 1;
          e.stateTimer = 0;
          e.bubble = { text: '물 끓는 중…', until: state.time + b.duration };
        }
        if (e.stateFlag === 1) {
          move = false;
          e.stateTimer += dt;
          // 머무는 동안 체력 회복 + 강해짐
          const grow = b.growPerSec * dt;
          e.maxHp *= 1 + grow;
          e.hp = Math.min(e.maxHp, e.hp + e.maxHp * grow * 1.5);
          e.speedMult += grow * 0.6;
          if (e.stateTimer >= b.duration) {
            e.stateFlag = 2;
            e.bubble = { text: '후루룩!! (강해짐)', until: state.time + 1.5 };
          }
        }
        break;
      }
      case 'askPrice': {
        e.stateTimer -= dt;
        if (e.stateFlag === 0 && e.stateTimer <= 0) {
          e.stateFlag = 1;
          e.stateTimer = b.stopDur;
          e.bubble = { text: def.lines[Math.floor(state.rng.next() * def.lines.length)], until: state.time + b.stopDur };
        } else if (e.stateFlag === 1) {
          move = false;
          if (e.stateTimer <= 0) {
            e.stateFlag = 0;
            e.stateTimer = b.every;
          }
        }
        break;
      }
      case 'charger': {
        e.stateTimer -= dt;
        if (e.stateTimer <= 0) {
          e.stateTimer = b.every;
          // 가장 가까운 유닛을 잠깐 마비
          let best: Unit | null = null;
          let bestD = b.radius * b.radius;
          for (const u of state.units) {
            const s = state.slots[u.slot];
            const d = dist2(s.x, s.y, e.x, e.y);
            if (d < bestD) {
              bestD = d;
              best = u;
            }
          }
          if (best) {
            best.disabledUntil = Math.max(best.disabledUntil, state.time + b.disableDur);
            const s = state.slots[best.slot];
            addFloater(state, { x: s.x, y: s.y - 30, text: '충전 중…', color: '#a5f3fc', size: 11, life: 1 });
            e.bubble = { text: '충전기 있어요?', until: state.time + 1.5 };
          }
        }
        break;
      }
      case 'panic': {
        if (e.stateTimer > 0) {
          e.stateTimer -= dt;
          speed *= b.speedUp;
          if (!e.bubble || e.bubble.until < state.time) e.bubble = { text: '급해요!!', until: state.time + 0.8 };
        }
        break;
      }
      case 'buffer':
        break;
      case 'steal': {
        // 도중에 멈춰 현금을 뽑는다. 멈춰 있는 동안은 좋은 표적.
        e.stateTimer -= dt;
        if (e.stateFlag === 0 && e.stateTimer <= 0) {
          e.stateFlag = 1;
          e.stateTimer = b.stopDur;
          const take = Math.min(state.coins, Math.round(b.amount * (1 + state.wave * 0.12)));
          if (take > 0) {
            state.coins -= take;
            addFloater(state, { x: e.x, y: e.y - 30, text: `-${take}원`, color: '#f87171', size: 13, life: 1.2 });
          }
          e.bubble = { text: take > 0 ? `${take}원 인출` : '잔액 부족', until: state.time + b.stopDur };
        } else if (e.stateFlag === 1) {
          move = false;
          if (e.stateTimer <= 0) {
            e.stateFlag = 0;
            e.stateTimer = b.every;
          }
        }
        break;
      }
      case 'healer':
        // 회복은 위 루프에서 일괄 처리 (자기 자신은 회복하지 않는다)
        break;
      case 'shielder': {
        e.stateTimer -= dt;
        if (e.stateTimer <= 0) {
          e.stateTimer = b.every;
          const r2 = b.radius * b.radius;
          const targets = state.enemies
            .filter((t) => !t.dead && !t.reached && !t.isBoss && t !== e && t.shield <= 0 && dist2(e.x, e.y, t.x, t.y) <= r2)
            .sort((a, c) => c.dist - a.dist)
            .slice(0, b.targets);
          for (const t of targets) {
            t.shield = t.maxHp * b.shieldPct;
            addFloater(state, { x: t.x, y: t.y - 28, text: '방어', color: '#c084fc', size: 11, life: 0.9 });
          }
          if (targets.length > 0) e.bubble = { text: '여러분 힘내세요!', until: state.time + 1.5 };
        }
        break;
      }
      case 'blink': {
        e.stateTimer += dt;
        if (!e.hidden && e.stateTimer >= b.visibleFor) {
          e.hidden = true;
          e.stateTimer = 0;
        } else if (e.hidden && e.stateTimer >= b.hiddenFor) {
          e.hidden = false;
          e.stateTimer = 0;
        }
        break;
      }
      case 'boss':
        updateBoss(state, e, dt, b.pattern);
        if (b.pattern === 'party') speed *= 1 + 0.5 * Math.sin(state.time * 1.5);
        if (b.pattern === 'inspector' && e.hp < e.maxHp * 0.3) speed *= 1.6;
        break;
    }

    // 술 취한 친구들: 선두보다 너무 뒤처지면 따라붙고, 앞서면 기다림
    if (e.groupId !== undefined) {
      const lead = groupLead.get(e.groupId) ?? e.dist;
      if (lead - e.dist > 40) speed *= 1.4;
    }

    if (move) e.dist += speed * dt;
    if (speed < 0 && e.dist < -30) e.dist = -30; // 뒷걸음질만 클램프 (스폰 간격은 보존)
    updatePos(e);
    if (speed < 0) e.facing = e.facing === 1 ? -1 : 1;

    if (e.bubble && e.bubble.until < state.time) e.bubble = undefined;

    if (e.dist >= PATH_LENGTH) reachCheckout(state, e);
  }
}

function updatePos(e: Enemy): void {
  const p = pathPos(e.dist);
  e.x = p.x;
  e.y = p.y;
  e.facing = p.facing;
}

function reachCheckout(state: GameState, e: Enemy): void {
  const def = ENEMY_BY_ID[e.defId];
  e.reached = true;
  if (state.waveEnemyIds.has(e.id)) state.waveReached = true; // 이번 웨이브 클리어 보너스 무효
  const dmg = Math.max(1, Math.round(def.storeDamage * enemyDamageScale(e.spawnedWave)));
  state.hp = Math.max(0, state.hp - dmg);
  // 패배 원인 분석용: 누가 몇 번 들어와 얼마를 깎았는지
  const st = state.stats;
  st.reached++;
  st.reachedBy[e.defId] = (st.reachedBy[e.defId] ?? 0) + 1;
  st.storeDamageBy[e.defId] = (st.storeDamageBy[e.defId] ?? 0) + dmg;
  st.lastDamageClock = formatClock(state.wave, state.waveElapsed, state.waveDuration);
  state.fx.push({ type: 'shake', amount: e.isBoss ? 16 : 4 });
  state.fx.push({ type: 'hit', x: e.x, y: e.y, color: '#ef4444', big: e.isBoss });
  addFloater(state, { x: e.x, y: e.y - 20, text: `-${dmg}`, color: '#ef4444', size: 16, life: 1 });
  sfx(state, 'damage');
  if (e.isBoss) {
    state.bossAlive = state.enemies.some((o) => o !== e && o.isBoss && !o.dead && !o.reached);
    state.fx.push({ type: 'banner', text: `${def.name}이(가) 계산대를 점령했다`, sub: `-${dmg} 체력`, style: 'bad', dur: 2 });
  }
  if (!state.lowHpWarned && state.hp > 0 && state.hp / state.maxHp <= LOW_HP_THRESHOLD) {
    state.lowHpWarned = true;
    state.fx.push({ type: 'banner', text: '편의점 체력 위험!', sub: '계산대가 무너지고 있다', style: 'warning', dur: 2 });
    sfx(state, 'warning');
  }
}

// ───────────── 보스 패턴 ─────────────

function updateBoss(state: GameState, e: Enemy, dt: number, pattern: 'lunchbox' | 'party' | 'inspector' | 'closing'): void {
  const def = ENEMY_BY_ID[e.defId];
  switch (pattern) {
    case 'lunchbox': {
      // 체력 75/50/25% 마다 조각 3개 소환
      const thresholds = [0.75, 0.5, 0.25];
      const ratio = e.hp / e.maxHp;
      while (e.bossPhase < thresholds.length && ratio <= thresholds[e.bossPhase]) {
        e.bossPhase++;
        for (let i = 0; i < 3; i++) spawnEnemy(state, 'lunchPiece', { dist: Math.max(0, e.dist - 20 - i * 18), silent: true, wave: e.spawnedWave });
        e.bubble = { text: '(조각이 떨어졌다)', until: state.time + 1.5 };
        state.fx.push({ type: 'explode', x: e.x, y: e.y, radius: 40, color: '#bef264' });
      }
      break;
    }
    case 'party': {
      e.stateTimer += dt;
      if (e.stateTimer >= 6) {
        e.stateTimer = 0;
        for (let i = 0; i < 3; i++) spawnEnemy(state, 'partyMember', { dist: Math.max(0, e.dist - 24 - i * 18), silent: true, wave: e.spawnedWave });
        e.bubble = { text: def.lines[Math.floor(state.rng.next() * def.lines.length)], until: state.time + 1.5 };
      }
      break;
    }
    case 'inspector': {
      e.stateTimer += dt;
      if (e.stateTimer >= 5) {
        e.stateTimer = 0;
        let best: Unit | null = null;
        let bestD = Infinity;
        for (const u of state.units) {
          const s = state.slots[u.slot];
          const d = dist2(s.x, s.y, e.x, e.y);
          if (d < bestD) {
            bestD = d;
            best = u;
          }
        }
        if (best) {
          best.disabledUntil = Math.max(best.disabledUntil, state.time + 3);
          const s = state.slots[best.slot];
          addFloater(state, { x: s.x, y: s.y - 30, text: '점검 중…', color: '#60a5fa', size: 12, life: 1.2 });
          e.bubble = { text: '점검 좀 하겠습니다', until: state.time + 1.5 };
          sfx(state, 'event');
        }
      }
      break;
    }
    case 'closing': {
      e.stateTimer += dt;
      if (e.stateFlag === 0 && e.stateTimer >= 8) {
        e.stateFlag = 1;
        e.stateTimer = 0;
        e.shield = e.maxHp * 0.1;
        e.bubble = { text: '시재 확인 중', until: state.time + 3 };
      } else if (e.stateFlag === 1 && e.stateTimer >= 3) {
        e.stateFlag = 0;
        e.stateTimer = 0;
        e.shield = 0;
      }
      // 코인 흡수
      state.coinDrain += 2 * dt;
      if (state.coinDrain >= 1) {
        const n = Math.floor(state.coinDrain);
        state.coinDrain -= n;
        if (state.coins > 0) state.coins = Math.max(0, state.coins - n);
      }
      break;
    }
  }
}

export function knockbackAll(state: GameState, px: number): void {
  for (const e of state.enemies) {
    if (!isTargetable(e) && !e.hidden) continue;
    const def = ENEMY_BY_ID[e.defId];
    if (def.immune?.includes('knockback') || e.isBoss) continue;
    e.dist = Math.max(1, e.dist - px);
    e.bubble = { text: '깜짝이야', until: state.time + 1 };
  }
}
