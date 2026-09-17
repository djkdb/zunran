import { describe, it, expect } from 'vitest';
import { Engine } from '../engine/Engine';
import { spawnEnemy, damageEnemy } from '../engine/enemySystem';
import { ENEMY_DEFS, ENEMY_BY_ID } from '../data/enemies';
import { UNIT_BY_ID } from '../data/units';
import { armorAt, ARMOR_FLOOR, enemyHpScale } from '../config';
import { buildThemeSchedule, buildWave, THEME_INFO, type WaveTheme } from '../data/waves';
import { createRng } from '../engine/rng';
import { rollOffers } from '../engine/rewardSystem';
import { REWARD_CARDS, REWARD_BY_ID } from '../data/rewards';

describe('장갑 — 한 방이 큰 공격을 요구한다', () => {
  it('같은 총 피해라도 잘게 나눠 때리면 장갑에 막힌다', () => {
    const engine = new Engine({ seed: 1 });
    const s = engine.state;
    s.wave = 20;
    const many = spawnEnemy(s, 'parcelGuy', { wave: 20 })!;
    const once = spawnEnemy(s, 'parcelGuy', { wave: 20 })!;
    const hp0 = many.maxHp;
    // 30 × 10회 = 300 vs 300 × 1회
    for (let i = 0; i < 10; i++) damageEnemy(s, many, 30, null);
    damageEnemy(s, once, 300, null);
    const dealtMany = hp0 - many.hp;
    const dealtOnce = hp0 - once.hp;
    expect(dealtOnce).toBeGreaterThan(dealtMany * 3);
  });

  it('장갑을 못 뚫어도 항상 최소 15%는 들어간다 (완전 무효는 없다)', () => {
    const engine = new Engine({ seed: 2 });
    const s = engine.state;
    const e = spawnEnemy(s, 'boss_closing', { wave: 40 })!;
    const before = e.hp;
    damageEnemy(s, e, 10, null);
    expect(before - e.hp).toBeCloseTo(10 * ARMOR_FLOOR, 5);
  });

  it('장갑이 없는 손님에게는 잘게 때려도 손해가 없다', () => {
    const engine = new Engine({ seed: 3 });
    const s = engine.state;
    const many = spawnEnemy(s, 'basic', { wave: 20 })!;
    const hp0 = many.maxHp;
    for (let i = 0; i < 10; i++) damageEnemy(s, many, 30, null);
    expect(hp0 - many.hp).toBeCloseTo(300, 5);
  });

  it('장갑은 체력보다 천천히 오른다 — 후반에 완전 무적이 되지 않는다', () => {
    const ratio = (w: number) => armorAt(10, w) / enemyHpScale(w);
    expect(ratio(40)).toBeLessThan(ratio(10));
  });

  it('고화력 단일 유닛이 다단히트 유닛보다 장갑에 강하다', () => {
    // 포스기(45/1.6s)와 바코드 스캐너(9/0.42s)는 초당 피해가 비슷하지만
    // 한 방의 크기가 5배 다르다. 장갑 앞에서 결과가 갈려야 한다.
    const pos = UNIT_BY_ID.pos;
    const scanner = UNIT_BY_ID.scanner;
    const armor = armorAt(10, 20);
    const posThrough = Math.max(pos.dmg * ARMOR_FLOOR, pos.dmg - armor) / pos.interval;
    const scanThrough = Math.max(scanner.dmg * ARMOR_FLOOR, scanner.dmg - armor) / scanner.interval;
    expect(posThrough).toBeGreaterThan(scanThrough);
  });
});

describe('무리 — 뭉치면 빨라진다', () => {
  it('혼자면 제 속도, 여럿이 뭉치면 빨라진다', () => {
    const solo = new Engine({ seed: 4 });
    solo.state.spawnQueue = [];
    const a = spawnEnemy(solo.state, 'party', { dist: 300 })!;
    const d0 = a.dist;
    for (let i = 0; i < 20; i++) solo.tick(0.1);
    const soloMoved = a.dist - d0;

    const pack = new Engine({ seed: 4 });
    pack.state.spawnQueue = [];
    const group = [];
    for (let i = 0; i < 8; i++) group.push(spawnEnemy(pack.state, 'party', { dist: 300 })!);
    const g0 = group[0].dist;
    for (let i = 0; i < 20; i++) pack.tick(0.1);
    const packMoved = group[0].dist - g0;

    expect(packMoved).toBeGreaterThan(soloMoved * 1.2);
    expect(group[0].swarmBoost).toBeGreaterThan(0);
  });

  it('가속에는 상한이 있다', () => {
    const engine = new Engine({ seed: 5 });
    engine.state.spawnQueue = [];
    const group = [];
    for (let i = 0; i < 40; i++) group.push(spawnEnemy(engine.state, 'party', { dist: 300 })!);
    engine.tick(0.1);
    const max = ENEMY_BY_ID.party.swarm!.max;
    for (const e of group) expect(e.swarmBoost).toBeLessThanOrEqual(max + 1e-9);
  });
});

describe('웨이브 테마', () => {
  it('판마다 테마 순서가 다르다 (같은 시드면 같다)', () => {
    const a = buildThemeSchedule(createRng(100));
    const b = buildThemeSchedule(createRng(100));
    const c = buildThemeSchedule(createRng(999));
    expect(a).toEqual(b);
    expect(a.slice(4, 40)).not.toEqual(c.slice(4, 40));
  });

  it('테마는 고르게 나온다 — 한 종류만 계속 나오지 않는다', () => {
    const sched = buildThemeSchedule(createRng(7));
    const counts: Record<string, number> = {};
    for (let w = 8; w <= 40; w++) counts[sched[w]] = (counts[sched[w]] ?? 0) + 1;
    for (const t of ['fast', 'armor', 'swarm'] as WaveTheme[]) expect(counts[t] ?? 0).toBeGreaterThanOrEqual(4);
  });

  it('테마 웨이브는 해당 속성 손님을 크게 늘린다', () => {
    const swarmIds = new Set(ENEMY_DEFS.filter((e) => e.swarm).map((e) => e.id));
    const share = (theme: WaveTheme) => {
      let hit = 0;
      let all = 0;
      for (let seed = 0; seed < 30; seed++) {
        const plan = buildWave(21, createRng(seed), 1, theme);
        for (const e of plan.entries) {
          all += e.count;
          if (swarmIds.has(e.defId)) hit += e.count;
        }
      }
      return hit / all;
    };
    expect(share('swarm')).toBeGreaterThan(share('mixed') * 1.8);
  });

  it('모든 테마에 이름과 힌트가 있다 (배너로 예고해야 한다)', () => {
    for (const t of ['mixed', 'fast', 'swarm', 'armor'] as WaveTheme[]) {
      expect(THEME_INFO[t].label.length).toBeGreaterThan(0);
      expect(THEME_INFO[t].hint.length).toBeGreaterThan(0);
    }
  });

  it('보스 웨이브는 테마를 덮어쓰지 않는다 (보스 자체가 그 웨이브의 문제다)', () => {
    const plan = buildWave(20, createRng(1), 1, 'swarm');
    expect(plan.theme).toBe('mixed');
    expect(plan.boss).toBeTruthy();
  });
});

describe('보상 카드 — 숫자 증가와 플레이 변화의 분리', () => {
  it('3택에는 항상 플레이 방식을 바꾸는 카드가 최소 1장 들어간다', () => {
    for (let seed = 0; seed < 40; seed++) {
      const engine = new Engine({ seed });
      engine.state.wave = 12;
      const offers = rollOffers(engine.state, 3);
      expect(offers.length).toBeGreaterThan(0);
      expect(offers.some((o) => o.kind === 'build')).toBe(true);
    }
  });

  it('같은 카드가 3택에 두 번 들어가지 않는다', () => {
    for (let seed = 0; seed < 40; seed++) {
      const engine = new Engine({ seed });
      engine.state.wave = 15;
      const offers = rollOffers(engine.state, 3);
      expect(new Set(offers.map((o) => o.defId)).size).toBe(offers.length);
    }
  });

  it('모든 보상 카드에 kind 가 있고, build 카드가 충분히 있다', () => {
    for (const c of REWARD_CARDS) expect(['stat', 'build']).toContain(c.kind);
    expect(REWARD_CARDS.filter((c) => c.kind === 'build').length).toBeGreaterThanOrEqual(8);
  });

  it('전환 카드는 얻는 것과 잃는 것이 함께 있다', () => {
    const engine = new Engine({ seed: 3 });
    const s = engine.state;
    s.wave = 12;
    REWARD_BY_ID.regulars.apply({
      state: s,
      rng: s.rng,
      addCoins: () => {},
      grantUnit: () => null,
      upgradeRandomUnit: () => null,
      banner: () => {},
    });
    expect(s.perma.roleDmg.dps).toBeGreaterThan(1);
    expect(s.perma.roleDmg.aoe).toBeLessThan(1);
  });

  it('「무인 운영」은 유닛이 있는 칸을 막지 않는다', () => {
    const engine = new Engine({ seed: 4 });
    const s = engine.state;
    s.wave = 12;
    for (let i = 0; i < 6; i++) engine.dispatch({ type: 'DRAW' });
    const occupied = s.slots.filter((sl) => sl.unitId !== null).map((sl) => sl.index);
    REWARD_BY_ID.unmanned.apply({
      state: s,
      rng: s.rng,
      addCoins: () => {},
      grantUnit: () => null,
      upgradeRandomUnit: () => null,
      banner: () => {},
    });
    for (const i of occupied) expect(s.slots[i].blocked).toBeFalsy();
    expect(s.slots.filter((sl) => sl.blocked).length).toBe(3);
  });
});
