import { describe, it, expect } from 'vitest';
import { Engine } from '../engine/Engine';
import { spawnEnemy } from '../engine/enemySystem';
import { migrate, defaultSave, type SaveData, SAVE_VERSION } from '../save/storage';
import { mergeRunStats, analyzeDefeat } from '../save/stats';
import { ACHIEVEMENTS, evaluateAchievements, type AchievementContext } from '../data/achievements';
import { MISSIONS, MISSION_EXTRAS } from '../data/missions';
import { DAILY_CHALLENGES, CHALLENGE_BY_ID } from '../data/dailyChallenges';
import { getDaily, dailySeed, dateKey } from '../daily';
import { pickRunTitle } from '../data/runTitles';
import { EVENT_DEFS, RARE_EVENT_IDS } from '../data/events';
import { UNIT_BY_ID } from '../data/units';


function run(engine: Engine, seconds: number) {
  for (let i = 0; i < Math.round(seconds * 10); i++) {
    if (engine.state.phase === 'reward' && engine.state.rewardOffers.length > 0) {
      engine.dispatch({ type: 'CHOOSE_REWARD', defId: engine.state.rewardOffers[0].defId });
    }
    engine.tick(0.1);
    engine.drainFx();
  }
}

describe('저장 마이그레이션', () => {
  it('v1 저장 데이터를 잃지 않고 v2 로 올린다', () => {
    // 확장 이전(v1) 저장 데이터 그대로
    const v1 = {
      version: 1,
      bestWave: 23,
      bestTime: 512,
      bestKills: 401,
      totalPlays: 17,
      totalKills: 3120,
      unlockedUnits: ['pos', 'manager'],
      seenEnemies: ['basic', 'drunk'],
      metaPoints: 940,
      metaLevels: { startCoins: 2, startHp: 1, drawCost: 0, rareChance: 3, epicChance: 0, coinGain: 1 },
      muted: true,
      autoMerge: true,
      hintsSeen: true,
      lastRun: { wave: 23, time: 512, kills: 401, coins: 8800, mvp: 'pos', at: 1 },
    };
    const out = migrate(v1 as unknown as Partial<SaveData>);
    // 기존 값은 그대로
    expect(out.bestWave).toBe(23);
    expect(out.metaPoints).toBe(940);
    expect(out.metaLevels.rareChance).toBe(3);
    expect(out.muted).toBe(true);
    expect(out.lastRun?.mvp).toBe('pos');
    // 새 필드는 기본값
    expect(out.version).toBe(SAVE_VERSION);
    expect(out.achievements).toEqual([]);
    expect(out.runHistory).toEqual([]);
    expect(out.catVisits).toBe(0);
    // 이미 도감에 있던 항목은 통계가 비어 있지 않게 살려 둔다
    expect(out.unitStats.pos).toBeTruthy();
    expect(out.enemyStats.basic).toBeTruthy();
  });

  it('깨진 필드가 있어도 기본값으로 복구한다', () => {
    const broken = { bestWave: 5, unlockedUnits: 'nope', achievements: 3, unitStats: [], daily: null };
    const out = migrate(broken as unknown as Partial<SaveData>);
    expect(out.bestWave).toBe(5);
    expect(out.unlockedUnits).toEqual([]);
    expect(out.achievements).toEqual([]);
    expect(out.unitStats).toEqual({});
    expect(out.daily).toEqual({});
  });
});

describe('데일리', () => {
  it('같은 날짜면 항상 같은 미션과 규칙이 나온다', () => {
    const a = getDaily(new Date('2026-03-05T00:30:00'));
    const b = getDaily(new Date('2026-03-05T23:30:00'));
    expect(a.challenge.id).toBe(b.challenge.id);
    expect(a.mission.id).toBe(b.mission.id);
    expect(a.date).toBe('2026-03-05');
  });

  it('날짜가 다르면 대체로 다른 조합이 나온다', () => {
    const ids = new Set<string>();
    for (let d = 1; d <= 20; d++) {
      const set = getDaily(new Date(`2026-04-${String(d).padStart(2, '0')}T12:00:00`));
      ids.add(`${set.challenge.id}|${set.mission.id}`);
    }
    expect(ids.size).toBeGreaterThan(10);
  });

  it('dateKey 는 로컬 날짜를 YYYY-MM-DD 로 만든다', () => {
    expect(dateKey(new Date(2026, 0, 9, 12))).toBe('2026-01-09');
    expect(dailySeed('2026-01-09')).not.toBe(dailySeed('2026-01-10'));
  });

  it('모든 미션과 추가 조건이 호출 가능하다', () => {
    const engine = new Engine({ seed: 1 });
    const ctx = { wave: 20, time: 600, stats: engine.state.stats, mvpDefId: 'pos' };
    for (const m of [...MISSIONS, ...MISSION_EXTRAS]) expect(typeof m.check(ctx)).toBe('boolean');
  });
});

describe('ZUNRAN DAILY 규칙', () => {
  it('코너 배율 규칙이 실제 공격력에 반영된다', () => {
    const plain = new Engine({ seed: 7 });
    const daily = new Engine({ seed: 7, challenge: CHALLENGE_BY_ID.drinkNight });
    for (const e of [plain, daily]) {
      const u = e.state.units[0] ?? null;
      expect(u).toBeNull(); // 시작 시점에는 유닛이 없다
    }
    // 음료 코너(0번 줄) 유닛의 공격력이 2배가 된다
    const mk = (e: Engine, slot: number) => {
      const u = { id: 1, defId: 'onigiri', tier: 1 as const, slot, cooldown: 0, skillCd: 0, disabledUntil: 0, buffs: { atkSpeed: 0, dmg: 0 }, kills: 0, damage: 0, bornAt: 0, lastAttackAt: 0, facing: 1 as const };
      e.state.units.push(u);
      e.state.slots[slot].unitId = u.id;
      return u;
    };
    const a = mk(plain, 0);
    const b = mk(daily, 0);
    // helpers 를 직접 부르지 않고 스냅샷의 선택 정보로 비교하기 어려우니 내부 계산을 쓴다
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return import('../engine/helpers').then(({ unitDamage }) => {
      expect(unitDamage(daily.state, b)).toBeCloseTo(unitDamage(plain.state, a) * 2, 5);
    });
  });

  it('손님 체력·수 배율과 유닛 금지가 적용된다', () => {
    const e = new Engine({ seed: 8, challenge: CHALLENGE_BY_ID.crowdNight });
    e.state.spawnQueue = [];
    const plain = new Engine({ seed: 8 });
    plain.state.spawnQueue = [];
    const a = spawnEnemy(e.state, 'basic', {})!;
    const b = spawnEnemy(plain.state, 'basic', {})!;
    expect(a.maxHp).toBeLessThan(b.maxHp);

    const noMgr = new Engine({ seed: 9, challenge: CHALLENGE_BY_ID.noManager });
    noMgr.state.coins = 999999;
    for (let i = 0; i < 60; i++) noMgr.dispatch({ type: 'DRAW' });
    expect(noMgr.state.units.some((u) => u.defId === 'manager')).toBe(false);
  });

  it('모든 데일리 규칙으로 한 판을 돌려도 깨지지 않는다', () => {
    for (const c of DAILY_CHALLENGES) {
      const e = new Engine({ seed: 21, challenge: c });
      run(e, 45);
      expect(e.state.hp).toBeGreaterThanOrEqual(0);
      expect(Number.isFinite(e.state.coins)).toBe(true);
      expect(e.state.wave).toBeGreaterThan(1);
    }
  });
});

describe('업적', () => {
  const baseCtx = (over: Partial<AchievementContext> = {}): AchievementContext => {
    const engine = new Engine({ seed: 3 });
    return {
      wave: 1,
      time: 0,
      stats: engine.state.stats,
      mvpDefId: null,
      save: defaultSave(),
      totalPlays: 1,
      eventCount: () => 0,
      totalEventCount: () => 0,
      coinsLeft: 100,
      challengeId: null,
      missionCleared: false,
      ...over,
    };
  };

  it('id 가 중복되지 않는다', () => {
    expect(new Set(ACHIEVEMENTS.map((a) => a.id)).size).toBe(ACHIEVEMENTS.length);
  });

  it('첫 판을 끝내면 첫 출근을 준다', () => {
    const got = evaluateAchievements(baseCtx());
    expect(got).toContain('firstShift');
  });

  it('이미 가진 업적은 다시 주지 않는다', () => {
    const save = { ...defaultSave(), achievements: ['firstShift'] };
    const got = evaluateAchievements(baseCtx({ save }));
    expect(got).not.toContain('firstShift');
  });

  it('웨이브 조건이 실제로 동작한다', () => {
    expect(evaluateAchievements(baseCtx({ wave: 20 }))).toEqual(expect.arrayContaining(['wave5', 'wave10', 'wave20']));
    expect(evaluateAchievements(baseCtx({ wave: 4 }))).not.toContain('wave5');
  });

  it('모든 조건 함수가 빈 데이터에서도 예외를 내지 않는다', () => {
    expect(() => evaluateAchievements(baseCtx())).not.toThrow();
  });
});

describe('보고서', () => {
  it('계산대 도달을 손님별로 기록한다', () => {
    const engine = new Engine({ seed: 11 });
    const s = engine.state;
    s.spawnQueue = [];
    spawnEnemy(s, 'cig', { dist: s.geo.length - 1 });
    run(engine, 1);
    expect(s.stats.reached).toBe(1);
    expect(s.stats.reachedBy.cig).toBe(1);
    expect(s.stats.storeDamageBy.cig).toBeGreaterThan(0);
    expect(s.stats.lastDamageClock).toMatch(/\d\d:\d\d/);

    const d = analyzeDefeat(s.stats, 420);
    expect(d.topReacher?.id).toBe('cig');
    expect(d.topDamager?.id).toBe('cig');
    expect(d.coinsLeft).toBe(420);
  });

  it('런 제목은 기록을 반영하고 seed 로 재현된다', () => {
    const engine = new Engine({ seed: 12 });
    engine.state.stats.merges = 35; // 문턱(30) 위
    const ctx = { wave: 12, stats: engine.state.stats, mvpName: null, mvpDefId: null, eventCount: () => 0, topEnemy: null };
    const a = pickRunTitle(ctx, () => 0.3);
    const b = pickRunTitle(ctx, () => 0.3);
    expect(a).toBe(b);
    expect(a).toBe('합성 중독');
    // 문턱 아래면 그 제목이 나오지 않는다 (흔한 판이 전부 같은 제목이 되는 걸 막는다)
    engine.state.stats.merges = 12;
    expect(pickRunTitle(ctx, () => 0.3)).not.toBe('합성 중독');
  });

  it('발생한 사건 id 가 순서대로 쌓인다', () => {
    const engine = new Engine({ seed: 13 });
    run(engine, 180);
    expect(engine.state.stats.eventIds.length).toBe(engine.state.stats.eventsSeen);
    for (const id of engine.state.stats.eventIds) expect(EVENT_DEFS.some((e) => e.id === id)).toBe(true);
  });
});

describe('자동 정리', () => {
  it('짝이 없는 1티어 유닛만 대상이 되고, 합성 재료는 건드리지 않는다', () => {
    const engine = new Engine({ seed: 71 });
    const s = engine.state;
    s.coins = 999999;
    for (let i = 0; i < 40 && engine.snapshot().emptySlots > 0; i++) engine.dispatch({ type: 'DRAW' });
    const sn = engine.snapshot();
    expect(sn.emptySlots).toBe(0);
    const rank: Record<string, number> = { common: 0, rare: 1 };
    const targets = sn.groups.filter((g) => g.tier === 1 && g.count === 1 && rank[UNIT_BY_ID[g.defId]?.rarity] !== undefined);
    // 대상은 전부 짝이 없다 = 어떤 합성도 깨지 않는다
    for (const t of targets) expect(t.count).toBe(1);
    if (targets.length > 0) {
      const mergeableBefore = sn.groups.filter((g) => g.mergeable).length;
      engine.dispatch({ type: 'SELL', unitId: targets[0].unitIds[0] });
      const after = engine.snapshot();
      expect(after.emptySlots).toBe(1);
      expect(after.groups.filter((g) => g.mergeable).length).toBe(mergeableBefore);
    }
  });
});

describe('누적 통계', () => {
  it('한 판 결과가 도감 통계로 합쳐진다', () => {
    const save = defaultSave();
    const engine = new Engine({ seed: 14 });
    const s = engine.state.stats;
    s.unitDraws.pos = 2;
    s.unitDamage.pos = 1500.4;
    s.unitMaxTier.pos = 3;
    s.unitMerges.pos = 1;
    s.enemySeen.basic = 10;
    s.enemyKills.basic = 8;
    s.reachedBy.basic = 2;
    s.storeDamageBy.basic = 6;
    s.eventIds.push('ownerCall', 'ownerCall');
    s.catVisits = 1;
    s.merges = 4;
    s.bossKills = 1;

    const merged = mergeRunStats(save, s, 'pos', 1000);
    expect(merged.unitStats.pos).toEqual({ draws: 2, mvp: 1, damage: 1500, maxTier: 3, merges: 1 });
    expect(merged.enemyStats.basic.kills).toBe(8);
    expect(merged.enemyStats.basic.reached).toBe(2);
    expect(merged.enemyStats.basic.bestKillsInRun).toBe(8);
    expect(merged.eventCounts.ownerCall).toBe(2);
    expect(merged.catVisits).toBe(1);
    expect(merged.totalMerges).toBe(4);
    expect(merged.totalBossKills).toBe(1);

    // 두 번째 판은 누적된다
    const merged2 = mergeRunStats({ ...save, ...merged }, s, null, 2000);
    expect(merged2.unitStats.pos.draws).toBe(4);
    expect(merged2.unitStats.pos.mvp).toBe(1); // MVP 가 아니었으므로 그대로
    expect(merged2.eventCounts.ownerCall).toBe(4);
  });
});

describe('희귀 사건', () => {
  it('희귀 사건은 가중치가 낮고 전부 정의돼 있다', () => {
    for (const id of RARE_EVENT_IDS) {
      const def = EVENT_DEFS.find((e) => e.id === id);
      expect(def, id).toBeTruthy();
      expect(def!.weight).toBeLessThanOrEqual(0.3);
    }
  });

  it('희귀 사건 효과가 상태를 망가뜨리지 않는다', () => {
    for (const id of RARE_EVENT_IDS) {
      const def = EVENT_DEFS.find((e) => e.id === id)!;
      const engine = new Engine({ seed: 17 });
      const s = engine.state;
      if (def.apply) {
        for (let i = 0; i < 12; i++) {
          def.apply({
            state: s,
            rng: s.rng,
            spawn: () => {},
            addCoins: (n) => {
              s.coins += n;
            },
            disableRandomUnit: () => null,
            knockbackAll: () => {},
            freeDraw: () => {
              s.freeDraws++;
            },
            banner: () => {},
          });
        }
      }
      expect(s.coins).toBeGreaterThanOrEqual(0);
      expect(Number.isFinite(s.perma.dmg)).toBe(true);
      expect(s.perma.critChance).toBeLessThan(2);
    }
  });
});
