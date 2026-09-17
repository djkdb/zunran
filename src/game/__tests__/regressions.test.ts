import { describe, it, expect } from 'vitest';
import { Engine } from '../engine/Engine';
import { spawnEnemy, damageEnemy, knockbackAll } from '../engine/enemySystem';
import { REWARD_CARDS } from '../data/rewards';
import { unitDamage, unitInterval, unitRange } from '../engine/helpers';
import { createUnit } from '../engine/unitFactory';

import { UNIT_BY_ID } from '../data/units';

function step(engine: Engine, n = 1) {
  for (let i = 0; i < n; i++) {
    engine.tick(1 / 60);
    engine.drainFx();
  }
}

// 초 단위로 진행. tick 은 한 번에 최대 8 고정스텝(≈0.13초)만 처리하므로 0.1초씩 잘라 부른다.
function run(engine: Engine, seconds: number) {
  for (let i = 0; i < Math.round(seconds * 10); i++) {
    engine.tick(0.1);
    engine.drainFx();
  }
}

// 보상 선택이 열리면 엔진이 멈추므로, 시간만 흐르게 하고 싶을 때는 첫 카드를 자동으로 고른다.
function runPastRewards(engine: Engine, seconds: number) {
  for (let i = 0; i < Math.round(seconds * 10); i++) {
    if (engine.state.phase === 'reward' && engine.state.rewardOffers.length > 0) {
      engine.dispatch({ type: 'CHOOSE_REWARD', defId: engine.state.rewardOffers[0].defId });
    }
    engine.tick(0.1);
    engine.drainFx();
  }
}

describe('리뷰 회귀 테스트', () => {
  it('손님이 계산대에 도달한 웨이브는 클리어 보너스를 주지 않는다', () => {
    const engine = new Engine({ seed: 1 });
    const s = engine.state;
    s.spawnQueue = [];
    const e = spawnEnemy(s, 'cig', { dist: s.geo.length - 1 })!;
    expect(s.waveEnemyIds.has(e.id)).toBe(true);
    const coins = s.coins;
    step(engine, 5);
    expect(s.hp).toBeLessThan(s.maxHp);
    expect(s.waveReached).toBe(true);
    expect(s.coins).toBe(coins);
  });
  it('보스 소환물과 이벤트 스폰도 웨이브 클리어 판정에 포함된다', () => {
    const engine = new Engine({ seed: 2 });
    const s = engine.state;
    s.spawnQueue = [];
    const piece = spawnEnemy(s, 'lunchPiece', { dist: 100, silent: true })!;
    expect(s.waveEnemyIds.has(piece.id)).toBe(true);
    step(engine, 3);
    expect(s.waveCleared).toBe(false);
  });
  it('지속 피해는 보호막을 먼저 깎는다', () => {
    const engine = new Engine({ seed: 3 });
    const s = engine.state;
    s.spawnQueue = [];
    const boss = spawnEnemy(s, 'boss_closing', { dist: 200 })!;
    boss.shield = 500;
    boss.dot = { dps: 100, until: s.time + 10 };
    const hp = boss.hp;
    step(engine, 6);
    expect(boss.shield).toBeLessThan(500);
    expect(boss.hp).toBe(hp);
  });
  it('기본 공격 넉백은 보스에게 적용되지 않고, 일반 손님은 타겟 가능 범위(dist>0)를 유지한다', () => {
    const engine = new Engine({ seed: 4 });
    const s = engine.state;
    const boss = spawnEnemy(s, 'boss_party', { dist: 300 })!;
    damageEnemy(s, boss, 1, null, UNIT_BY_ID.vacuum.onHit);
    expect(boss.dist).toBe(300);
    const basic = spawnEnemy(s, 'basic', { dist: 20 })!;
    damageEnemy(s, basic, 1, null, UNIT_BY_ID.vacuum.onHit);
    expect(basic.dist).toBeGreaterThan(0);
  });
  it('필드 상한에서 부분 스폰된 엔트리는 중복 스폰되지 않는다', () => {
    const engine = new Engine({ seed: 5 });
    const s = engine.state;
    for (let i = 0; i < 137; i++) spawnEnemy(s, 'basic', { dist: 500 + i, silent: true, trackWave: false });
    s.spawnQueue = [{ at: 0, defId: 'party', count: 6 }];
    s.waveTimer = 100;
    const before = s.enemies.length;
    step(engine, 1);
    expect(s.enemies.length).toBe(140);
    s.enemies.splice(0, 20);
    step(engine, 1);
    expect(s.enemies.filter((e) => e.defId === 'party').length).toBe(6);
    expect(s.enemies.length).toBe(before - 20 + 6);
  });
  it('단체 스폰은 간격을 유지한다 (한 점에 겹치지 않음)', () => {
    const engine = new Engine({ seed: 6 });
    const s = engine.state;
    s.spawnQueue = [{ at: 0, defId: 'party', count: 5 }];
    s.waveTimer = 100;
    step(engine, 1);
    const dists = s.enemies.filter((e) => e.defId === 'party').map((e) => Math.round(e.dist));
    expect(new Set(dists).size).toBe(5);
  });
  it('포스기 가격 확인은 스턴 면역 대상을 건너뛰고 다른 손님을 멈춘다', () => {
    const engine = new Engine({ seed: 7 });
    const s = engine.state;
    s.spawnQueue = [];
    const u = createUnit(s, 'pos', 1, 3);
    u.skillCd = 0;
    s.units.push(u);
    s.slots[3].unitId = u.id;
    const slot = s.slots[3];
    // 슬롯 근처 경로 지점(음료 코너 y=118)에 좀비(면역)와 기본 손님
    const zombie = spawnEnemy(s, 'zombie', { dist: 148 + (slot.x - 52) })!;
    zombie.hp = 1e9;
    const basic = spawnEnemy(s, 'basic', { dist: 148 + (slot.x - 52) - 30 })!;
    step(engine, 30);
    expect(basic.stun > 0 || basic.dead).toBe(true);
  });
});

describe('보상 · 긴급 스킬 · 콤보', () => {
  it('보상 웨이브에 3택이 열리고, 고르면 효과가 적용되며 게임이 재개된다', () => {
    const engine = new Engine({ seed: 21 });
    const s = engine.state;
    // 보상 웨이브(4)로 넘어갈 때까지 진행
    let guard = 0;
    while (s.phase === 'playing' && guard++ < 400) run(engine, 1);
    expect(s.phase).toBe('reward');
    expect(s.rewardOffers.length).toBe(3);
    expect(new Set(s.rewardOffers.map((o) => o.defId)).size).toBe(3);
    // 보상 중에는 시간이 멈춘다
    const t = s.time;
    run(engine, 5);
    expect(s.time).toBe(t);
    const r = engine.dispatch({ type: 'CHOOSE_REWARD', defId: s.rewardOffers[0].defId });
    expect(r.ok).toBe(true);
    expect(s.phase).toBe('playing');
    expect(s.rewardsTaken.length).toBe(1);
    step(engine, 5);
    expect(s.time).toBeGreaterThan(t);
  });

  it('보상 카드 19종이 모두 효과를 적용하고 상태를 깨뜨리지 않는다', () => {
    for (const card of REWARD_CARDS) {
      const engine = new Engine({ seed: 5 });
      const s = engine.state;
      s.wave = 12;
      for (let i = 0; i < 4; i++) {
        const u = createUnit(s, i % 2 ? 'onigiri' : 'coffee', 2, i);
        s.units.push(u);
        s.slots[i].unitId = u.id;
      }
      s.hp = 60;
      s.skills = { shutter: 10, dump: 20 };
      s.phase = 'reward';
      s.rewardOffers = [{ defId: card.id, name: card.name, desc: card.desc, icon: card.icon, tone: card.tone, kind: card.kind }];
      expect(engine.dispatch({ type: 'CHOOSE_REWARD', defId: card.id }).ok).toBe(true);
      expect(s.phase).toBe('playing');
      expect(Number.isFinite(s.hp)).toBe(true);
      expect(s.hp).toBeLessThanOrEqual(s.maxHp);
      expect(s.coins).toBeGreaterThanOrEqual(0);
      for (const u of s.units) expect(u.tier).toBeLessThanOrEqual(5);
      step(engine, 3); // 적용 후에도 정상 진행
    }
  });

  it('긴급 스킬은 손님이 있을 때만 쓰이고 쿨다운을 돈다', () => {
    const engine = new Engine({ seed: 31 });
    const s = engine.state;
    s.spawnQueue = [];
    expect(engine.dispatch({ type: 'USE_SKILL', skill: 'shutter' }).ok).toBe(false);
    const e = spawnEnemy(s, 'basic', { dist: 400 })!;
    const before = e.dist;
    expect(engine.dispatch({ type: 'USE_SKILL', skill: 'shutter' }).ok).toBe(true);
    expect(e.stun).toBeGreaterThan(0);
    expect(e.dist).toBeLessThan(before);
    expect(s.skills.shutter).toBeGreaterThan(0);
    expect(engine.dispatch({ type: 'USE_SKILL', skill: 'shutter' }).ok).toBe(false);
    // 폐기 처리는 전체 피해
    const hp = e.hp;
    expect(engine.dispatch({ type: 'USE_SKILL', skill: 'dump' }).ok).toBe(true);
    expect(e.hp < hp || e.dead).toBe(true);
    runPastRewards(engine, 50);
    expect(s.skills.shutter).toBe(0);
  });

  it('연속 처치가 콤보로 쌓이고 보너스 코인이 나온다', () => {
    const engine = new Engine({ seed: 41 });
    const s = engine.state;
    s.spawnQueue = [];
    const coinsBefore = s.coins;
    for (let i = 0; i < 6; i++) {
      const e = spawnEnemy(s, 'basic', { dist: 300, silent: true })!;
      damageEnemy(s, e, 99999, null, undefined);
    }
    expect(s.combo.count).toBe(6);
    expect(s.stats.bestCombo).toBe(6);
    expect(s.coins).toBeGreaterThan(coinsBefore);
    // 시간이 지나면 콤보가 끊긴다.
    // 5연쇄에서 히트스톱(70ms)이 걸리므로 그게 풀릴 만큼은 돌려야 게임 시간이 흐른다.
    s.time += 5;
    step(engine, 8);
    expect(s.combo.count).toBe(0);
  });

  it('코너마다 배치 보너스가 다르게 적용된다', () => {
    const engine = new Engine({ seed: 51 });
    const s = engine.state;
    const rows = [0, 7, 14]; // 각 줄의 첫 슬롯
    const units = rows.map((slot) => {
      const u = createUnit(s, 'pos', 1, slot);
      s.units.push(u);
      s.slots[slot].unitId = u.id;
      return u;
    });
    const dmg = units.map((u) => unitDamage(s, u));
    const range = units.map((u) => unitRange(s, u));
    expect(range[0]).toBeGreaterThan(range[1]); // 음료 코너는 사거리
    expect(dmg[2]).toBeGreaterThan(dmg[0]); // 라면 코너는 공격력
    expect(unitInterval(s, units[1])).toBeLessThan(unitInterval(s, units[0])); // 과자 코너는 공속
  });
});

describe('새 손님 행동', () => {
  it('ATM 손님은 멈춰 서서 코인을 훔친다', () => {
    const engine = new Engine({ seed: 61 });
    const s = engine.state;
    s.spawnQueue = [];
    s.coins = 500;
    const e = spawnEnemy(s, 'atm', { dist: 100 })!;
    let stopped = false;
    for (let i = 0; i < 600; i++) {
      const before = e.dist;
      step(engine, 1);
      if (e.dist === before && e.stun <= 0) stopped = true;
    }
    expect(s.coins).toBeLessThan(500);
    expect(s.coins).toBeGreaterThanOrEqual(0);
    expect(stopped).toBe(true);
  });

  it('커플 손님은 옆 손님을 회복시키되 자기 자신은 회복하지 않는다', () => {
    const engine = new Engine({ seed: 62 });
    const s = engine.state;
    s.spawnQueue = [];
    const healer = spawnEnemy(s, 'couple', { dist: 300 })!;
    const target = spawnEnemy(s, 'basic', { dist: 300 })!;
    target.hp = target.maxHp * 0.3;
    healer.hp = healer.maxHp * 0.3;
    const t0 = target.hp;
    const h0 = healer.hp;
    step(engine, 120);
    expect(target.hp).toBeGreaterThan(t0);
    expect(target.hp).toBeLessThanOrEqual(target.maxHp);
    expect(healer.hp).toBe(h0);
  });

  it('라이브 켠 손님은 주변 손님에게 보호막을 씌우고, 보호막이 피해를 먼저 흡수한다', () => {
    const engine = new Engine({ seed: 63 });
    const s = engine.state;
    s.spawnQueue = [];
    spawnEnemy(s, 'influencer', { dist: 400 });
    const t = spawnEnemy(s, 'basic', { dist: 420 })!;
    let shielded = 0;
    for (let i = 0; i < 600 && shielded === 0; i++) {
      step(engine, 1);
      shielded = t.shield;
    }
    expect(shielded).toBeGreaterThan(0);
    const hp = t.hp;
    damageEnemy(s, t, shielded * 0.5, null);
    expect(t.hp).toBe(hp); // 보호막이 전부 흡수
    expect(t.shield).toBeLessThan(shielded);
  });

  it('배달 오토바이는 넉백에 면역이다 (감속은 통한다 — 얼음 빌드가 답이 되어야 한다)', () => {
    const engine = new Engine({ seed: 64 });
    const s = engine.state;
    s.spawnQueue = [];
    const fast = spawnEnemy(s, 'bikeCourier', { dist: 200 })!;
    const slowed = spawnEnemy(s, 'bikeCourier', { dist: 200 })!;
    slowed.slow = { pct: 0.8, until: s.time + 999 };
    const f0 = fast.dist;
    const s0 = slowed.dist;
    step(engine, 60);
    // 감속은 통한다 — 얼음 빌드가 답이 되어야 한다
    expect(slowed.dist - s0).toBeLessThan((fast.dist - f0) * 0.4);
    // 넉백은 안 통한다
    const before = slowed.dist;
    knockbackAll(s, 100);
    expect(slowed.dist).toBe(before);
  });

  it('뛰는 손님은 초반에 실제로 계산대까지 닿을 수 있다', () => {
    const engine = new Engine({ seed: 65 });
    const s = engine.state;
    s.spawnQueue = [];
    const hp0 = s.hp;
    spawnEnemy(s, 'runner', { dist: 0 });
    // 경로 2473px / 속도 170 ≈ 14.5초. 웨이브 1 길이(14초)를 살짝 넘기므로
    // 웨이브가 하나 넘어간 뒤에 도착한다 — 그래도 계산대에는 닿는다.
    run(engine, 16);
    expect(s.hp).toBeLessThan(hp0); // 유닛이 없으면 반드시 통과한다
    expect(s.stats.reached).toBeGreaterThan(0);
  });
});
