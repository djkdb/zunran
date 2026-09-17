import { describe, it, expect } from 'vitest';
import { Engine } from '../engine/Engine';
import { spawnEnemy, damageEnemy } from '../engine/enemySystem';
import { ENEMY_DEFS, ENEMY_BY_ID } from '../data/enemies';
import { UNIT_BY_ID } from '../data/units';
import { armorAt, ARMOR_FLOOR, enemyHpScale, drawCost, START_SLOTS, MAX_SHELF_LEVEL, TOTAL_SLOTS } from '../config';
import { metaEffects, DEFAULT_META_LEVELS } from '../save/meta';
import { orderPrice } from '../data/deck';
import { buildThemeSchedule, buildWave, THEME_INFO, type WaveTheme } from '../data/waves';
import { STAGES, STAGE_BY_ID, buildGeometry, geoPos, stageUnlocked, maxSlotsOf } from '../data/stages';
import { createRng } from '../engine/rng';
import { rollOffers } from '../engine/rewardSystem';
import { REWARD_CARDS, REWARD_BY_ID } from '../data/rewards';
import { EVENT_DEFS } from '../data/events';
import { updateEvents } from '../engine/eventSystem';

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

  it('테마 웨이브는 해당 속성 손님을 크게 늘린다 (머릿수 기준)', () => {
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
    // 가중치가 스폰 '건수' 기준이라 묶음 손님이 머릿수를 독식하던 버그가 있었다.
    // 평범한 밤에도 무리 손님이 47% 였다. 묶음 크기로 나눠 보정한 뒤의 값을 지킨다.
    expect(share('mixed')).toBeLessThan(0.35);
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

describe('사건 2택', () => {
  it('선택지가 있는 사건이 뜨면 게임이 멈추고, 고르면 다시 흐른다', () => {
    const engine = new Engine({ seed: 21 });
    const s = engine.state;
    s.wave = 8;
    s.phase = 'playing';
    // 선택지가 있는 사건이 나올 때까지 사건을 강제로 돌린다
    let guard = 0;
    while (s.phase === 'playing' && guard++ < 400) {
      s.nextEventAt = s.time;
      updateEvents(s);
      s.time += 1;
    }
    expect(s.phase).toBe('eventChoice');
    expect(s.eventChoice!.choices.length).toBeGreaterThanOrEqual(2);
    const t0 = s.time;
    for (let i = 0; i < 20; i++) engine.tick(0.1);
    expect(s.time).toBe(t0); // 멈춰 있다
    expect(engine.dispatch({ type: 'CHOOSE_EVENT', index: 0 }).ok).toBe(true);
    expect(s.phase).toBe('playing');
    expect(s.eventChoice).toBeNull();
  });

  it('두 선택지의 결과가 실제로 다르다', () => {
    const run = (index: number) => {
      const engine = new Engine({ seed: 22 });
      const s = engine.state;
      s.wave = 8;
      s.hp = 50;
      s.coins = 1000;
      const def = EVENT_DEFS.find((d) => d.id === 'expiredFood')!;
      s.eventChoice = { defId: def.id, title: def.title, desc: def.desc, choices: def.choices!.map((c) => ({ label: c.label, desc: c.desc })) };
      s.phase = 'eventChoice';
      engine.dispatch({ type: 'CHOOSE_EVENT', index });
      return { hp: s.hp, coins: s.coins };
    };
    const a = run(0);
    const b = run(1);
    expect(a.hp).toBeGreaterThan(b.hp);
    expect(b.coins).toBeGreaterThan(a.coins);
  });

  it('선택지가 있는 사건은 기본 apply 로 새지 않는다', () => {
    // 선택지가 있으면 고르기 전까지 어떤 효과도 일어나면 안 된다
    const engine = new Engine({ seed: 23 });
    const s = engine.state;
    s.wave = 8;
    const coins0 = s.coins;
    const hp0 = s.hp;
    let guard = 0;
    while (s.phase === 'playing' && guard++ < 400) {
      s.nextEventAt = s.time;
      updateEvents(s);
      s.time += 1;
    }
    expect(s.phase).toBe('eventChoice');
    expect(s.coins).toBe(coins0);
    expect(s.hp).toBe(hp0);
    expect(s.activeEvents).toHaveLength(0);
  });

  it('선택지를 붙인 사건이 충분히 있다', () => {
    expect(EVENT_DEFS.filter((e) => e.choices).length).toBeGreaterThanOrEqual(8);
    // 전부에 붙이지는 않는다 — 매번 멈추면 피로해진다
    expect(EVENT_DEFS.filter((e) => e.choices).length).toBeLessThan(EVENT_DEFS.length / 2);
  });

  it('모든 선택지에 이름과 설명이 있다', () => {
    for (const e of EVENT_DEFS.filter((d) => d.choices)) {
      for (const c of e.choices!) {
        expect(c.label.length).toBeGreaterThan(0);
        expect(c.desc.length).toBeGreaterThan(0);
      }
    }
  });
});

describe('보상 3택 구성 (직접 플레이에서 잡은 것)', () => {
  it('3택이 전부 build 로 채워지지 않는다', () => {
    // 한 판 직접 해 보니 보상 7회 중 7회가 전부 "판이 바뀐다"였다.
    // 대비가 없으면 그 라벨은 아무 의미가 없다.
    for (let seed = 0; seed < 60; seed++) {
      const engine = new Engine({ seed });
      engine.state.wave = 4 + (seed % 25);
      const offers = rollOffers(engine.state, 3);
      const builds = offers.filter((o) => o.kind === 'build').length;
      expect(builds).toBeGreaterThanOrEqual(1);
      expect(builds).toBeLessThanOrEqual(2);
    }
  });
});

describe('본사 발주 가격 (직접 플레이에서 잡은 것)', () => {
  it('등급 확정이 일반 뽑기보다 싸지는 구간이 없다', () => {
    // 실제 판에서 웨이브 20에 일반 뽑기 1,973원 / 희귀 발주 1,050원이 나왔다.
    // 확정이 랜덤보다 싸면 일반 뽑기를 누를 이유가 사라진다.
    for (let wave = 1; wave <= 40; wave++) {
      for (let draws = 0; draws <= 120; draws += 5) {
        const d = drawCost(draws, 0);
        for (const r of ['rare', 'epic', 'legendary'] as const) {
          expect(orderPrice(r, wave, d)).toBeGreaterThan(d);
        }
      }
    }
  });

  it('등급이 높을수록 비싸다', () => {
    for (let wave = 1; wave <= 40; wave += 3) {
      const d = drawCost(wave * 2, 0);
      expect(orderPrice('epic', wave, d)).toBeGreaterThan(orderPrice('rare', wave, d));
      expect(orderPrice('legendary', wave, d)).toBeGreaterThan(orderPrice('epic', wave, d));
    }
  });
});

describe('진열대 증축 (메타 강화)', () => {
  it('강화 0레벨이면 가운데 9칸만 열려 있다', () => {
    const engine = new Engine({ stageId: 'alley', seed: 40, meta: metaEffects({ ...DEFAULT_META_LEVELS, shelves: 0 }) });
    const open = engine.state.slots.filter((sl) => !sl.locked);
    expect(open).toHaveLength(START_SLOTS);
    expect(engine.snapshot().totalSlots).toBe(START_SLOTS);
  });

  it('세 줄(코너)이 처음부터 모두 열려 있다 — 첫 판부터 "어디에 둘까"가 있어야 한다', () => {
    const engine = new Engine({ stageId: 'alley', seed: 41, meta: metaEffects({ ...DEFAULT_META_LEVELS, shelves: 0 }) });
    const rows = new Set(engine.state.slots.filter((sl) => !sl.locked).map((sl) => sl.row));
    expect(rows).toEqual(new Set([0, 1, 2]));
  });

  it('레벨마다 한 칸씩 열리고, 만렙이면 전부 열린다', () => {
    for (const lv of [0, 1, 5, MAX_SHELF_LEVEL]) {
      const engine = new Engine({ stageId: 'alley', seed: 42, meta: metaEffects({ ...DEFAULT_META_LEVELS, shelves: lv }) });
      expect(engine.state.slots.filter((sl) => !sl.locked)).toHaveLength(Math.min(TOTAL_SLOTS, START_SLOTS + lv));
    }
    const full = new Engine({ stageId: 'alley', seed: 43, meta: metaEffects({ ...DEFAULT_META_LEVELS, shelves: MAX_SHELF_LEVEL }) });
    expect(full.state.slots.some((sl) => sl.locked)).toBe(false);
  });

  it('잠긴 칸에는 유닛이 들어가지 않는다', () => {
    const engine = new Engine({ stageId: 'alley', seed: 44, meta: metaEffects({ ...DEFAULT_META_LEVELS, shelves: 0 }) });
    engine.state.coins = 999999;
    for (let i = 0; i < START_SLOTS; i++) expect(engine.dispatch({ type: 'DRAW' }).ok).toBe(true);
    expect(engine.dispatch({ type: 'DRAW' }).ok).toBe(false); // 9칸이 다 찼다
    for (const u of engine.state.units) expect(engine.state.slots[u.slot].locked).toBeFalsy();
    const locked = engine.state.slots.find((sl) => sl.locked)!;
    expect(engine.dispatch({ type: 'MOVE', unitId: engine.state.units[0].id, slot: locked.index }).ok).toBe(false);
  });

  it('강화가 실제로 판을 바꾼다 — 칸이 많을수록 더 멀리 간다', () => {
    // 같은 시드로 0레벨과 만렙을 돌려 비교한다
    const run = (shelves: number) => {
      const engine = new Engine({ stageId: 'alley', seed: 77, meta: metaEffects({ ...DEFAULT_META_LEVELS, shelves }) });
      const s = engine.state;
      let t = 0;
      while (s.phase !== 'gameover' && s.wave <= 60 && t < 1800) {
        if (s.phase === 'promote' && s.promoteChoice) { engine.dispatch({ type: 'CHOOSE_PROMOTE', defId: s.promoteChoice.options[0] }); continue; }
        if (s.phase === 'eventChoice') { engine.dispatch({ type: 'CHOOSE_EVENT', index: 0 }); continue; }
        engine.tick(0.1);
        engine.drainFx();
        t += 0.1;
        if (s.phase === 'reward') { engine.dispatch({ type: 'CHOOSE_REWARD', defId: s.rewardOffers[0].defId }); continue; }
        if (Math.round(t * 10) % 5 === 0) {
          for (const g of engine.snapshot().groups) if (g.mergeable) engine.dispatch({ type: 'MERGE', defId: g.defId, tier: g.tier });
          let guard = 0;
          while (guard++ < 10 && engine.snapshot().canDraw) engine.dispatch({ type: 'DRAW' });
        }
      }
      return s.wave;
    };
    expect(run(MAX_SHELF_LEVEL)).toBeGreaterThan(run(0));
  });
});

describe('지점(스테이지)', () => {
  it('지점마다 매장 구조가 다르다', () => {
    const sizes = STAGES.map((st) => maxSlotsOf(st));
    expect(new Set(sizes).size).toBeGreaterThan(1);
    const lengths = STAGES.map((st) => Math.round(buildGeometry(st).length));
    expect(new Set(lengths).size).toBe(STAGES.length);
  });

  it('경로는 입구에서 시작해 계산대에서 끝난다', () => {
    for (const st of STAGES) {
      const geo = buildGeometry(st);
      expect(geo.length).toBeGreaterThan(1000);
      expect(geoPos(geo, 0).y).toBeLessThan(0); // 화면 밖 입구
      const end = geoPos(geo, geo.length);
      expect(Math.abs(end.x - 335)).toBeLessThan(2); // 계산대
    }
  });

  it('진열대 줄마다 배치 보너스가 있다', () => {
    for (const st of STAGES) {
      expect(st.aisleBonus).toHaveLength(st.rows.length);
      expect(st.aisleNames).toHaveLength(st.rows.length);
    }
  });

  it('첫 지점은 처음부터 열려 있고, 나머지는 앞 지점 기록으로 열린다', () => {
    expect(stageUnlocked(STAGES[0], {})).toBe(true);
    for (const st of STAGES.slice(1)) {
      expect(stageUnlocked(st, {})).toBe(false);
      expect(stageUnlocked(st, { [st.unlockAfter!]: st.unlockWave })).toBe(true);
      expect(stageUnlocked(st, { [st.unlockAfter!]: st.unlockWave - 1 })).toBe(false);
    }
  });

  it('유동인구가 많은 지점일수록 손님이 많이 나온다', () => {
    const headcount = (stageId: string) => {
      const st = STAGE_BY_ID[stageId];
      let n = 0;
      for (let seed = 0; seed < 20; seed++) {
        for (const e of buildWave(15, createRng(seed), 1, 'mixed', st.traffic).entries) n += e.count;
      }
      return n;
    };
    expect(headcount('downtown')).toBeGreaterThan(headcount('alley'));
    expect(headcount('alley')).toBeGreaterThan(headcount('country'));
  });

  it('술집가는 취한 손님과 단체 손님이 몰린다', () => {
    const share = (stageId: string) => {
      const st = STAGE_BY_ID[stageId];
      let hit = 0;
      let all = 0;
      for (let seed = 0; seed < 25; seed++) {
        for (const e of buildWave(15, createRng(seed), 1, 'mixed', st.traffic).entries) {
          all += e.count;
          if (/drunk|party|student/.test(e.defId)) hit += e.count;
        }
      }
      return hit / all;
    };
    expect(share('downtown')).toBeGreaterThan(share('country') * 1.5);
  });

  it('지점을 지정하면 그 매장 구조로 판이 열린다', () => {
    for (const st of STAGES) {
      const engine = new Engine({ seed: 5, stageId: st.id });
      expect(engine.state.slots).toHaveLength(maxSlotsOf(st));
      expect(engine.state.geo.stageId).toBe(st.id);
      expect(engine.snapshot().stageName).toBe(st.name);
    }
  });

  it('힘든 지점일수록 수당 배율이 크다', () => {
    const mults = STAGES.map((st) => st.scoreMult);
    for (let i = 1; i < mults.length; i++) expect(mults[i]).toBeGreaterThan(mults[i - 1]);
  });
});

describe('지점 렌더링 안전성', () => {
  it('모든 지점의 줄 수가 렌더러 팔레트 범위를 넘어도 안전해야 한다', () => {
    // 팔레트가 3줄까지만 있어서 4줄짜리 지점에서 캔버스가 통째로 안 그려졌다.
    // 데이터가 늘어나도 렌더가 죽지 않도록, 줄 수의 상한을 테스트로 고정한다.
    for (const st of STAGES) {
      expect(st.rows.length).toBeGreaterThanOrEqual(2);
      expect(st.rows.length).toBeLessThanOrEqual(4);
      // 줄마다 이름과 보너스가 반드시 있어야 한다 (없으면 렌더에서 undefined 접근)
      for (let row = 0; row < st.rows.length; row++) {
        expect(st.aisleNames[row]).toBeTruthy();
        expect(st.aisleBonus[row]).toBeTruthy();
      }
    }
  });

  it('모든 지점에서 한 판을 돌려도 깨지지 않는다', () => {
    for (const st of STAGES) {
      const engine = new Engine({ seed: 9, stageId: st.id });
      for (let i = 0; i < 400; i++) {
        const s = engine.state;
        if (s.phase === 'promote' && s.promoteChoice) { engine.dispatch({ type: 'CHOOSE_PROMOTE', defId: s.promoteChoice.options[0] }); continue; }
        if (s.phase === 'eventChoice') { engine.dispatch({ type: 'CHOOSE_EVENT', index: 0 }); continue; }
        if (s.phase === 'reward') { engine.dispatch({ type: 'CHOOSE_REWARD', defId: s.rewardOffers[0].defId }); continue; }
        engine.tick(0.1);
        engine.drainFx();
        if (i % 5 === 0) engine.dispatch({ type: 'DRAW' });
      }
      expect(Number.isFinite(engine.state.hp)).toBe(true);
      expect(engine.snapshot().stageName).toBe(st.name);
    }
  });
});
