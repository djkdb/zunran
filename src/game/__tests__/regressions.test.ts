import { describe, it, expect } from 'vitest';
import { Engine } from '../engine/Engine';
import { spawnEnemy, damageEnemy } from '../engine/enemySystem';
import { createUnit } from '../engine/unitFactory';
import { PATH_LENGTH } from '../config';
import { UNIT_BY_ID } from '../data/units';

function step(engine: Engine, n = 1) {
  for (let i = 0; i < n; i++) {
    engine.tick(1 / 60);
    engine.drainFx();
  }
}

describe('리뷰 회귀 테스트', () => {
  it('손님이 계산대에 도달한 웨이브는 클리어 보너스를 주지 않는다', () => {
    const engine = new Engine({ seed: 1 });
    const s = engine.state;
    s.spawnQueue = [];
    const e = spawnEnemy(s, 'cig', { dist: PATH_LENGTH - 1 })!;
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
