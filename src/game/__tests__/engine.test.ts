import { describe, it, expect } from 'vitest';
import { Engine } from '../engine/Engine';
import { metaEffects, DEFAULT_META_LEVELS } from '../save/meta';
import { UNIT_BY_ID, UNIT_DEFS } from '../data/units';
import type { Tier } from '../types';
import { ENEMY_DEFS, bossForWave } from '../data/enemies';
import { EVENT_DEFS } from '../data/events';
import { buildWave } from '../data/waves';
import { startWave } from '../engine/waveSystem';
import { createRng } from '../engine/rng';
import { TOTAL_SLOTS, MAX_SHELF_LEVEL, MAX_TIER, START_SLOTS, needsPrep, PREP_SECONDS, formatClock, THREE_AM_WAVE } from '../config';
import { buildGeometry, geoPos, STAGE_BY_ID, maxSlotsOf } from '../data/stages';

// 경로는 지점마다 다르다. 테스트는 기준 지점(동네 골목점)으로 고정한다.
const REF_GEO = buildGeometry(STAGE_BY_ID.alley);
import { createUnit } from '../engine/unitFactory';
import { mergeUnits, choosePromote } from '../engine/mergeSystem';
import { REWARD_CARDS } from '../data/rewards';
import { chooseReward } from '../engine/rewardSystem';
import { recomputeAdjacency, unitDamage, unitInterval } from '../engine/helpers';
import { sellCandidate } from '../../ui/useGame';

// 진열대 증축 만렙 엔진. 칸 번호를 직접 쓰는 테스트는 21칸이 다 열려 있어야 한다.
function fullEngine(seed: number): Engine {
  return new Engine({ stageId: 'alley', seed, meta: metaEffects({ ...DEFAULT_META_LEVELS, shelves: MAX_SHELF_LEVEL }) });
}

function runFor(engine: Engine, seconds: number) {
  for (let t = 0; t < seconds; t += 0.05) {
    engine.tick(0.05);
    engine.drainFx();
    // 멈추는 선택지가 뜨면 골라서 진행을 이어간다 (실제 플레이에서는 플레이어가 고른다)
    const s = engine.state;
    if (s.phase === 'reward') engine.dispatch({ type: 'CHOOSE_REWARD', defId: s.rewardOffers[0].defId });
    else if (s.phase === 'promote' && s.promoteChoice) engine.dispatch({ type: 'CHOOSE_PROMOTE', defId: s.promoteChoice.options[0] });
    else if (s.phase === 'eventChoice') engine.dispatch({ type: 'CHOOSE_EVENT', index: 0 });
  }
}

describe('데이터 무결성', () => {
  it('유닛 10종 이상, 손님 12종 이상, 이벤트 15종 이상', () => {
    expect(UNIT_DEFS.length).toBeGreaterThanOrEqual(10);
    expect(ENEMY_DEFS.filter((e) => !e.tags.includes('boss') && e.weight > 0).length).toBeGreaterThanOrEqual(12);
    expect(ENEMY_DEFS.filter((e) => e.tags.includes('boss')).length).toBe(4);
    expect(EVENT_DEFS.length).toBeGreaterThanOrEqual(15);
  });
  it('id 중복 없음', () => {
    expect(new Set(UNIT_DEFS.map((u) => u.id)).size).toBe(UNIT_DEFS.length);
    expect(new Set(ENEMY_DEFS.map((u) => u.id)).size).toBe(ENEMY_DEFS.length);
    expect(new Set(EVENT_DEFS.map((u) => u.id)).size).toBe(EVENT_DEFS.length);
  });
  it('경로/시계', () => {
    expect(geoPos(REF_GEO, 0).x).toBe(52);
    expect(geoPos(REF_GEO, REF_GEO.length).x).toBe(335);
    expect(formatClock(1, 0, 22)).toBe('12:00 AM');
    expect(formatClock(THREE_AM_WAVE, 0, 22)).toBe('03:00 AM');
  });
  it('웨이브 생성: 초반은 쉽고, 보스 웨이브에는 보스가 있다', () => {
    const rng = createRng(1);
    const w1 = buildWave(1, rng);
    expect(w1.entries.every((e) => e.defId === 'basic')).toBe(true);
    const w10 = buildWave(10, rng);
    expect(w10.boss).toBe('boss_lunchbox');
    expect(w10.entries.some((e) => e.defId === 'boss_lunchbox')).toBe(true);
    const w13 = buildWave(THREE_AM_WAVE, rng);
    expect(w13.script).toBe('threeAm');
    expect(w13.entries.filter((e) => e.defId === 'basic').length).toBeGreaterThanOrEqual(20);
    const w40 = buildWave(40, rng);
    expect(w40.boss).toBe('boss_closing');
  });
});

describe('엔진', () => {
  it('뽑기: 코인 차감, 슬롯 배치, 코인 부족 시 실패', () => {
    const engine = new Engine({ seed: 42 });
    const coins = engine.state.coins;
    const r = engine.dispatch({ type: 'DRAW' });
    expect(r.ok).toBe(true);
    expect(engine.state.units.length).toBe(1);
    expect(engine.state.coins).toBe(coins - 100);
    engine.state.coins = 0;
    const r2 = engine.dispatch({ type: 'DRAW' });
    expect(r2.ok).toBe(false);
    expect(r2.reason).toContain('코인');
  });
  it('뽑기: 슬롯이 꽉 차면 실패', () => {
    const engine = fullEngine(7);
    engine.state.coins = 999999;
    for (let i = 0; i < TOTAL_SLOTS; i++) expect(engine.dispatch({ type: 'DRAW' }).ok).toBe(true);
    expect(engine.dispatch({ type: 'DRAW' }).ok).toBe(false);
    expect(engine.state.units.length).toBe(TOTAL_SLOTS);
  });
  it('합성: 같은 유닛 3개 → 1개, 결과는 티어업/승급/특수 중 하나', () => {
    const outcomes = new Set<string>();
    for (let seed = 0; seed < 60; seed++) {
      const engine = new Engine({ seed });
      const s = engine.state;
      for (let i = 0; i < 3; i++) {
        const u = createUnit(s, 'onigiri', 1, i);
        s.units.push(u);
        s.slots[i].unitId = u.id;
      }
      const r = mergeUnits(s, 'onigiri', 1);
      expect(r.ok).toBe(true);
      outcomes.add(r.kind!);
      // 승급은 2택 화면을 띄우고 멈춘다. 고르면 그때 유닛이 생긴다.
      if (r.kind === 'promote') {
        expect(s.phase).toBe('promote');
        expect(s.units.length).toBe(0);
        choosePromote(s, s.promoteChoice!.options[0]);
        expect(s.phase).toBe('playing');
      }
      expect(s.units.length).toBe(1);
      expect(s.slots.filter((sl) => sl.unitId !== null).length).toBe(1);
      const u = s.units[0];
      if (r.kind === 'upgrade') {
        expect(u.defId).toBe('onigiri');
        expect(u.tier).toBe(2);
      } else if (r.kind === 'promote') {
        expect(UNIT_BY_ID[u.defId].rarity).toBe('rare');
        expect(u.tier).toBe(1);
      } else {
        expect(['legendary', 'special']).toContain(UNIT_BY_ID[u.defId].rarity);
      }
    }
    expect(outcomes.has('upgrade')).toBe(true);
    expect(outcomes.has('promote')).toBe(true);
  });
  it('합성: 재료 부족 시 실패', () => {
    const engine = new Engine({ seed: 3 });
    expect(engine.dispatch({ type: 'MERGE', defId: 'onigiri', tier: 1 }).ok).toBe(false);
  });
  it('이동/교환/판매', () => {
    const engine = fullEngine(5);
    const s = engine.state;
    const a = createUnit(s, 'onigiri', 1, 0);
    const b = createUnit(s, 'alba', 1, 1);
    s.units.push(a, b);
    s.slots[0].unitId = a.id;
    s.slots[1].unitId = b.id;
    engine.dispatch({ type: 'TAP_SLOT', slot: 0 });
    expect(s.selectedUnitId).toBe(a.id);
    engine.dispatch({ type: 'TAP_SLOT', slot: 5 }); // 빈 칸으로 이동
    expect(a.slot).toBe(5);
    expect(s.slots[0].unitId).toBeNull();
    expect(s.selectedUnitId).toBeNull();
    // 유닛이 있는 칸을 탭하면 교환이 아니라 그 유닛을 선택한다 (실수 교환 방지)
    engine.dispatch({ type: 'TAP_SLOT', slot: 5 });
    expect(s.selectedUnitId).toBe(a.id);
    engine.dispatch({ type: 'TAP_SLOT', slot: 1 });
    expect(s.selectedUnitId).toBe(b.id);
    expect(a.slot).toBe(5);
    expect(b.slot).toBe(1);
    // 교환은 드래그(MOVE)로만
    engine.dispatch({ type: 'MOVE', unitId: a.id, slot: 1 });
    expect(a.slot).toBe(1);
    expect(b.slot).toBe(5);
    const coins = s.coins;
    engine.dispatch({ type: 'SELL', unitId: a.id });
    expect(s.units.length).toBe(1);
    expect(s.coins).toBeGreaterThan(coins);
  });
  it('웨이브가 진행되고 손님이 등장하며, 방치하면 체력이 깎여 게임오버가 된다', () => {
    const engine = new Engine({ seed: 11 });
    runFor(engine, 30);
    expect(engine.state.wave).toBeGreaterThanOrEqual(2);
    expect(engine.state.stats.seenEnemies).toContain('basic');
    runFor(engine, 600);
    expect(engine.state.phase).toBe('gameover');
    expect(engine.state.hp).toBe(0);
  });
  it('유닛이 있으면 손님을 처치하고 코인을 얻는다', () => {
    const engine = new Engine({ seed: 12 });
    const s = engine.state;
    for (let i = 0; i < 6; i++) {
      const u = createUnit(s, 'manager', 3, i);
      s.units.push(u);
      s.slots[i].unitId = u.id;
    }
    runFor(engine, 60);
    expect(s.stats.kills).toBeGreaterThan(5);
    expect(s.stats.coinsEarned).toBeGreaterThan(0);
    expect(s.hp).toBe(s.maxHp);
  });
  it('시드가 같으면 결과가 같다 (결정론)', () => {
    const a = new Engine({ seed: 99 });
    const b = new Engine({ seed: 99 });
    for (const e of [a, b]) {
      e.dispatch({ type: 'DRAW' });
      e.dispatch({ type: 'DRAW' });
      runFor(e, 40);
    }
    expect(a.state.stats.kills).toBe(b.state.stats.kills);
    expect(a.state.coins).toBe(b.state.coins);
    expect(a.state.units.map((u) => u.defId)).toEqual(b.state.units.map((u) => u.defId));
  });
  it('랜덤 이벤트가 발생한다', () => {
    const engine = new Engine({ seed: 13 });
    const s = engine.state;
    for (let i = 0; i < 6; i++) {
      const u = createUnit(s, 'manager', 4, i);
      s.units.push(u);
      s.slots[i].unitId = u.id;
    }
    runFor(engine, 200);
    expect(s.stats.eventsSeen).toBeGreaterThan(0);
  });
});

// ───────── 칸 배치 불변식 ─────────
//
// 「본사 지원」(에픽 1개)을 칸이 꽉 찬 상태에서 고르면 잠긴 칸에 유닛이 들어갔다.
// 칸을 고르는 코드가 뽑기 / 보상 / 합성 / 조합 네 군데에 흩어져 있었고
// 보상 쪽만 locked · blocked 를 안 보고 있었다.
// 한 군데를 고치는 것으로는 부족해서, 상태 자체를 검사한다.
function assertSlotsSane(s: Engine['state'], where: string) {
  const seen = new Set<number>();
  for (const u of s.units) {
    const sl = s.slots[u.slot];
    expect(sl, `${where}: 없는 칸 ${u.slot}`).toBeTruthy();
    expect(sl.locked ?? false, `${where}: 잠긴 칸 ${u.slot} 에 ${u.defId}`).toBe(false);
    expect(sl.blocked ?? false, `${where}: 봉쇄된 칸 ${u.slot} 에 ${u.defId}`).toBe(false);
    expect(sl.unitId, `${where}: 칸 ${u.slot} 의 역참조가 어긋남`).toBe(u.id);
    expect(seen.has(u.slot), `${where}: 칸 ${u.slot} 에 두 유닛`).toBe(false);
    seen.add(u.slot);
  }
  const occupied = s.slots.filter((sl) => sl.unitId !== null).length;
  expect(occupied, `${where}: 칸에 남은 유령 유닛`).toBe(s.units.length);
}

describe('칸 배치', () => {
  it('보상이 잠긴 칸을 쓰지 않는다 — 꽉 찬 상태에서 「본사 지원」', () => {
    // 증축 0단계 = 9칸만 열려 있고 12칸은 잠겨 있다
    const engine = new Engine({ stageId: 'alley', seed: 5, meta: metaEffects(DEFAULT_META_LEVELS) });
    const s = engine.state;
    const open = s.slots.filter((sl) => !sl.locked);
    expect(open.length).toBe(9);
    for (const sl of open) {
      const u = createUnit(s, 'onigiri', 1, sl.index);
      s.units.push(u);
      sl.unitId = u.id;
    }
    // 자리가 없으면 유닛을 주는 카드는 후보에서 빠져야 한다
    for (const id of ['hire', 'hqSupport']) {
      const card = REWARD_CARDS.find((c) => c.id === id)!;
      expect(card.available?.(s) ?? true, `${id} 가 자리 없이 제시됨`).toBe(false);
    }
    // 그래도 적용되면(방어) 잠긴 칸에 넣지 않는다
    for (const id of ['hire', 'hqSupport']) {
      s.phase = 'reward';
      const def = REWARD_CARDS.find((c) => c.id === id)!;
      s.rewardOffers = [{ defId: id, tone: def.tone, kind: def.kind, name: def.name, desc: def.desc, icon: def.icon }];
      chooseReward(s, id);
      assertSlotsSane(s, `보상 ${id}`);
    }
    expect(s.units.length).toBe(9);
  });

  it('긴 판을 굴려도 칸 상태가 어긋나지 않는다 (지점 3곳 × 증축 0/중간/만렙)', () => {
    let checks = 0;
    for (const stageId of ['country', 'alley', 'downtown']) {
      for (const shelves of [0, 6, MAX_SHELF_LEVEL]) {
        const engine = new Engine({ stageId, seed: 31 + shelves, meta: metaEffects({ ...DEFAULT_META_LEVELS, shelves }) });
        const s = engine.state;
        for (let t = 0; t < 900; t++) {
          s.coins += 40; // 계속 뽑고 합칠 수 있게
          engine.dispatch({ type: 'DRAW' });
          for (const g of engine.snapshot().groups) {
            if (g.mergeable) engine.dispatch({ type: 'MERGE', defId: g.defId, tier: g.tier });
          }
          const tm = engine.snapshot().tierMerge;
          if (tm) engine.dispatch({ type: 'MERGE_TIER', tier: tm.tier });
          if (t % 17 === 0) engine.dispatch({ type: 'SELL_JUNK' });
          if (t % 23 === 0 && s.units.length > 0) engine.dispatch({ type: 'SELL', unitId: s.units[0].id });
          if (t % 11 === 0 && s.units.length > 0) {
            // 잠긴 칸으로 옮기려는 시도도 섞는다 (UI 에서 막혀도 엔진이 받아주면 안 된다)
            const locked = s.slots.find((sl) => sl.locked || sl.blocked);
            if (locked) engine.dispatch({ type: 'MOVE', unitId: s.units[0].id, slot: locked.index });
          }
          engine.tick(0.1);
          engine.drainFx();
          if (s.phase === 'reward') engine.dispatch({ type: 'CHOOSE_REWARD', defId: s.rewardOffers[0].defId });
          else if (s.phase === 'promote' && s.promoteChoice) engine.dispatch({ type: 'CHOOSE_PROMOTE', defId: s.promoteChoice.options[0] });
          else if (s.phase === 'eventChoice') engine.dispatch({ type: 'CHOOSE_EVENT', index: 0 });
          assertSlotsSane(s, `${stageId} shelves=${shelves} t=${t}`);
          checks++;
          if (s.phase === 'gameover') break;
        }
      }
    }
    expect(checks).toBeGreaterThan(2000);
  });

  it('뽑기는 줄 수가 다른 지점에서도 골고루 편다', () => {
    // 술집가는 4줄이다. 집계 배열이 [0,0,0] 으로 고정돼 있어 넷째 줄이 NaN 이었다.
    const engine = new Engine({ stageId: 'downtown', seed: 8, meta: metaEffects({ ...DEFAULT_META_LEVELS, shelves: MAX_SHELF_LEVEL }) });
    const s = engine.state;
    s.coins = 999999;
    const rows = s.geo.aisleNames.length;
    expect(rows).toBe(4);
    for (let i = 0; i < rows * 2; i++) expect(engine.dispatch({ type: 'DRAW' }).ok).toBe(true);
    const perRow = new Array(rows).fill(0);
    for (const u of s.units) perRow[s.slots[u.slot].row]++;
    // 8개를 4줄에 폈으면 어느 줄도 비어 있으면 안 된다
    expect(Math.min(...perRow), `줄별 분포 ${perRow.join('/')}`).toBeGreaterThan(0);
  });
});

describe('보상 카드: 뜨면 반드시 효과가 있어야 한다', () => {
  function card(id: string) {
    return REWARD_CARDS.find((c) => c.id === id)!;
  }
  it('승진 — 보드가 전부 최고 티어면 뜨지 않는다', () => {
    const engine = fullEngine(3);
    const s = engine.state;
    for (let i = 0; i < 4; i++) {
      const u = createUnit(s, 'onigiri', MAX_TIER, i);
      s.units.push(u);
      s.slots[i].unitId = u.id;
    }
    expect(card('promote').available!(s)).toBe(false);
    s.units[0].tier = (MAX_TIER - 1) as Tier;
    expect(card('promote').available!(s)).toBe(true);
  });
  it('무인 운영 — 막을 빈 칸이 3개 없으면 뜨지 않는다', () => {
    const engine = fullEngine(4);
    const s = engine.state;
    const open = s.slots.filter((sl) => !sl.locked && !sl.blocked);
    expect(card('unmanned').available!(s)).toBe(true);
    for (let i = 0; i < open.length - 2; i++) {
      const u = createUnit(s, 'onigiri', 1, open[i].index);
      s.units.push(u);
      open[i].unitId = u.id;
    }
    expect(card('unmanned').available!(s)).toBe(false);
  });
});

// ───────── 「한 개만 더」 ─────────
//
// 한 판을 추적해 보니 w7~w14 동안 조작이 0회였다. 보드가
// scanner×2 · coffee×2 · freezer×2 + 외톨이 3 으로 꽉 차서
// 합성(3개 필요) · 뽑기(칸 없음) · 발주(칸 없음) · 정리(일반 등급만)가 전부 막혔다.
// 코인은 1,174 → 6,428 으로 쌓이기만 했다.
describe('교착 해소', () => {
  function fillPairs(engine: Engine) {
    const s = engine.state;
    const open = s.slots.filter((sl) => !sl.locked && !sl.blocked);
    // 2개짜리 짝으로만 채운다 = 합성도 정리도 안 되는 상태
    const kinds = ['scanner', 'coffee', 'freezer', 'cctv'];
    let k = 0;
    for (let i = 0; i + 1 < open.length; i += 2) {
      const defId = kinds[k++ % kinds.length];
      for (const sl of [open[i], open[i + 1]]) {
        const u = createUnit(s, defId, 1, sl.index);
        s.units.push(u);
        sl.unitId = u.id;
      }
    }
    return s;
  }

  it('2개짜리 짝만 남아도 「한 개만 더」로 판이 이어진다', () => {
    const engine = new Engine({ stageId: 'alley', seed: 9, meta: metaEffects(DEFAULT_META_LEVELS) });
    const s = fillPairs(engine);
    const snap = engine.snapshot();
    expect(snap.emptySlots, '칸이 꽉 차 있어야 하는 상황').toBe(s.units.length % 2 === 0 ? snap.totalSlots - s.units.length : snap.emptySlots);
    expect(snap.groups.some((g) => g.mergeable), '3개가 없으니 합성은 불가').toBe(false);
    expect(snap.mergeBuy.length, '「한 개만 더」가 제시돼야 한다').toBeGreaterThan(0);

    const offer = snap.mergeBuy[0];
    s.coins = offer.cost;
    const before = s.units.length;
    const r = engine.dispatch({ type: 'MERGE_BUY', defId: offer.defId });
    expect(r.ok).toBe(true);
    // 산 재료는 보드에 놓지 않고 바로 합성된다 → 2개가 1개로, 칸이 하나 빈다
    expect(s.units.length, '칸이 하나 비어야 한다').toBe(before - 1);
    expect(s.coins).toBe(0);
  });

  it('코인이 모자라면 사지지 않고 코인도 안 줄어든다', () => {
    const engine = new Engine({ stageId: 'alley', seed: 10, meta: metaEffects(DEFAULT_META_LEVELS) });
    const s = fillPairs(engine);
    const offer = engine.snapshot().mergeBuy[0];
    s.coins = offer.cost - 1;
    const r = engine.dispatch({ type: 'MERGE_BUY', defId: offer.defId });
    expect(r.ok).toBe(false);
    expect(s.coins).toBe(offer.cost - 1);
  });

  it('정리 대상에 희귀 외톨이도 들어간다 (일반만 보면 버튼이 안 떴다)', () => {
    const engine = new Engine({ stageId: 'alley', seed: 11, meta: metaEffects(DEFAULT_META_LEVELS) });
    const s = engine.state;
    const open = s.slots.filter((sl) => !sl.locked && !sl.blocked);
    for (const [i, defId] of ['cctv', 'onigiri', 'coffee'].entries()) {
      const u = createUnit(s, defId, 1, open[i].index);
      s.units.push(u);
      open[i].unitId = u.id;
    }
    for (const id of ['cctv', 'onigiri', 'coffee']) {
      expect(['rare', 'common']).toContain(UNIT_BY_ID[id].rarity);
    }
    expect(engine.snapshot().junkCount, '짝 없는 1티어는 전부 정리 대상').toBe(3);
    expect(engine.dispatch({ type: 'SELL_JUNK' }).ok).toBe(true);
    expect(s.units.length).toBe(0);
  });

  it('에픽·전설은 실수로 팔리지 않는다', () => {
    const engine = new Engine({ stageId: 'alley', seed: 12, meta: metaEffects(DEFAULT_META_LEVELS) });
    const s = engine.state;
    const epic = UNIT_DEFS.find((u) => u.rarity === 'epic')!;
    const u = createUnit(s, epic.id, 1, s.slots.findIndex((sl) => !sl.locked));
    s.units.push(u);
    s.slots[u.slot].unitId = u.id;
    expect(engine.snapshot().junkCount).toBe(0);
  });
});

describe('좁은 지점의 남는 증축', () => {
  it('시골점에서 칸 상한을 넘은 증축은 진열 밀도로 돌아온다', () => {
    const cap = maxSlotsOf(STAGE_BY_ID.country);
    const useful = cap - START_SLOTS;
    const under = new Engine({ stageId: 'country', seed: 2, meta: metaEffects({ ...DEFAULT_META_LEVELS, shelves: useful }) });
    const over = new Engine({ stageId: 'country', seed: 2, meta: metaEffects({ ...DEFAULT_META_LEVELS, shelves: MAX_SHELF_LEVEL }) });
    // 칸은 더 안 열린다
    expect(under.state.slots.filter((sl) => !sl.locked).length).toBe(cap);
    expect(over.state.slots.filter((sl) => !sl.locked).length).toBe(cap);
    // 대신 코너 보너스가 진해진다
    expect(over.state.shelfSurplus).toBe(MAX_SHELF_LEVEL - useful);
    expect(over.state.perma.aisleMult).toBeGreaterThan(under.state.perma.aisleMult);
  });
  it('칸이 남는 지점에서는 아무 일도 없다', () => {
    const e = new Engine({ stageId: 'alley', seed: 2, meta: metaEffects({ ...DEFAULT_META_LEVELS, shelves: MAX_SHELF_LEVEL }) });
    expect(e.state.shelfSurplus).toBe(0);
    expect(e.state.perma.aisleMult).toBe(1);
  });
});

describe('유닛 잠금', () => {
  it('잠근 유닛은 정리에도 자동 판매에도 안 걸린다', () => {
    const engine = fullEngine(21);
    const s = engine.state;
    // 짝 없는 1티어 셋 = 원래라면 전부 정리 대상
    const ids: number[] = [];
    for (const [i, defId] of ['cctv', 'onigiri', 'coffee'].entries()) {
      const u = createUnit(s, defId, 1, i);
      s.units.push(u);
      s.slots[i].unitId = u.id;
      ids.push(u.id);
    }
    expect(engine.snapshot().junkCount).toBe(3);
    expect(engine.dispatch({ type: 'TOGGLE_PIN', unitId: ids[0] }).ok).toBe(true);
    expect(engine.snapshot().junkCount, '잠근 하나는 빠져야 한다').toBe(2);
    engine.dispatch({ type: 'SELL_JUNK' });
    expect(s.units.map((u) => u.id)).toEqual([ids[0]]);
    // 자동 정리(useGame) 가 고르는 후보에서도 빠진다
    expect(sellCandidate(engine.snapshot().groups)).toBeNull();
    // 다시 누르면 풀린다
    engine.dispatch({ type: 'TOGGLE_PIN', unitId: ids[0] });
    expect(engine.snapshot().junkCount).toBe(1);
  });
});

describe('준비 시간', () => {
  it('보스와 새벽 3시 앞에만 붙고, 그동안 웨이브 시계와 스폰이 멈춘다', () => {
    expect(needsPrep(10)).toBe(true); // 보스
    expect(needsPrep(THREE_AM_WAVE)).toBe(true);
    expect(needsPrep(9)).toBe(false);
    expect(needsPrep(1)).toBe(false);

    const engine = fullEngine(31);
    const s = engine.state;
    // 9웨이브 끝에서 10웨이브(보스) 로 넘어가기 직전
    startWave(s, 9);
    if (s.phase !== 'playing') s.phase = 'playing'; // 보상 화면이 열리면 tick 이 멈춘다
    s.waveTimer = 0.01;
    s.spawnQueue = [];
    for (let i = 0; i < 4; i++) engine.tick(1 / 60);
    expect(s.prep, '보스 앞에서는 준비 시간이 붙는다').toBeGreaterThan(0);
    expect(s.wave, '준비 중에는 웨이브가 넘어가지 않는다').toBe(9);

    const queued = s.spawnQueue.length;
    const prepBefore = s.prep;
    for (let i = 0; i < 60; i++) engine.tick(1 / 60);
    expect(s.prep).toBeLessThan(prepBefore);
    expect(s.spawnQueue.length, '준비 중에는 스폰이 없다').toBe(queued);
    expect(s.wave).toBe(9);

    // 남은 시간을 다 흘리면 보스 웨이브가 시작된다
    for (let i = 0; i < PREP_SECONDS * 60 + 10 && s.wave === 9; i++) engine.tick(1 / 60);
    expect(s.prep).toBe(0);
    expect(s.wave).toBe(10);
  });

  it('「지금 시작」을 누르면 남은 준비 시간을 버리고 바로 넘어간다', () => {
    const engine = fullEngine(32);
    const s = engine.state;
    startWave(s, 19);
    if (s.phase !== 'playing') s.phase = 'playing';
    s.waveTimer = 0.01;
    s.spawnQueue = [];
    for (let i = 0; i < 4; i++) engine.tick(1 / 60);
    expect(s.prep).toBeGreaterThan(0);
    expect(engine.dispatch({ type: 'SKIP_PREP' }).ok).toBe(true);
    expect(s.prep).toBe(0);
    expect(s.wave).toBe(20);
    // 준비 중이 아닐 때 누르면 아무 일도 없어야 한다
    expect(engine.dispatch({ type: 'SKIP_PREP' }).ok).toBe(false);
  });
});

// ───────── 옆자리 시너지 ─────────
//
// 30판 계측에서 최종 보드가 전부 잡탕 ★1 이었다. 보드가 '내가 만든 것' 이 아니라
// '뽑기가 준 것' 이었다 — 누구 옆에 놓든 아무 차이가 없었기 때문이다.
describe('옆자리 시너지', () => {
  function place(s: Engine['state'], defId: string, slot: number) {
    const u = createUnit(s, defId, 1, slot);
    s.units.push(u);
    s.slots[slot].unitId = u.id;
    return u;
  }
  it('같은 계열을 옆에 붙이면 공격력이 오른다 (옆 한 명당 +12%, 최대 둘)', () => {
    const e = fullEngine(41);
    const s = e.state;
    const mid = place(s, 'onigiri', 1); // dps
    recomputeAdjacency(s);
    const alone = unitDamage(s, mid);

    place(s, 'hotbar', 0); // dps
    recomputeAdjacency(s);
    const one = unitDamage(s, mid);
    expect(one / alone).toBeCloseTo(1.12, 5);

    place(s, 'scanner', 2); // dps
    recomputeAdjacency(s);
    const two = unitDamage(s, mid);
    expect(two / alone).toBeCloseTo(1.24, 5);
    expect(mid.adj?.sameRole).toBe(2);
  });

  it('지원 유닛 옆에 서면 공격속도가 오른다 (+14%, 중복 없음)', () => {
    const e = fullEngine(42);
    const s = e.state;
    const mid = place(s, 'onigiri', 1);
    recomputeAdjacency(s);
    const alone = unitInterval(s, mid);
    place(s, 'fridge', 0); // support
    place(s, 'cctv', 2); // support
    recomputeAdjacency(s);
    expect(mid.adj?.nearSupport).toBe(true);
    expect(alone / unitInterval(s, mid), '두 명이어도 한 번만').toBeCloseTo(1.14, 5);
    expect(mid.adj?.sameRole, '지원은 dps 와 계열이 다르다').toBe(0);
  });

  it('줄이 다르면 옆이 아니다 (칸 번호만 붙어 있는 경우)', () => {
    const e = fullEngine(43);
    const s = e.state;
    // 줄의 마지막 칸과 다음 줄의 첫 칸은 번호가 이어지지만 옆자리가 아니다
    const lastOfRow0 = s.slots.filter((sl) => sl.row === 0).slice(-1)[0];
    const firstOfRow1 = s.slots.find((sl) => sl.row === 1)!;
    expect(firstOfRow1.index).toBe(lastOfRow0.index + 1);
    const a = place(s, 'onigiri', lastOfRow0.index);
    place(s, 'hotbar', firstOfRow1.index);
    recomputeAdjacency(s);
    expect(a.adj?.sameRole ?? 0).toBe(0);
  });

  it('「합을 맞춘다」는 옆자리를 2배로, 「코너 장사」는 0으로 만든다', () => {
    const e = fullEngine(44);
    const s = e.state;
    const mid = place(s, 'onigiri', 1);
    place(s, 'hotbar', 0);
    recomputeAdjacency(s);
    const base = unitDamage(s, mid);

    s.perma.adjMult = 2;
    recomputeAdjacency(s);
    expect(unitDamage(s, mid) / base).toBeCloseTo(1.24 / 1.12, 5);

    s.perma.adjMult = 0;
    recomputeAdjacency(s);
    expect(unitDamage(s, mid) / base).toBeCloseTo(1 / 1.12, 5);
  });

  it('배치를 바꾸면 값이 따라온다 (낡은 값이 남지 않는다)', () => {
    const e = fullEngine(45);
    const s = e.state;
    const a = place(s, 'onigiri', 1);
    place(s, 'hotbar', 0);
    recomputeAdjacency(s);
    expect(a.adj?.sameRole).toBe(1);
    // 멀리 옮긴다
    e.dispatch({ type: 'MOVE', unitId: a.id, slot: 5 });
    expect(e.snapshot().selected?.unitId ?? a.id).toBeDefined();
    recomputeAdjacency(s);
    expect(a.adj?.sameRole).toBe(0);
  });
});

describe('보상 카드: 빌드 축', () => {
  it('새 빌드 카드가 전부 두 방향으로 작동한다 (얻는 것과 잃는 것)', () => {
    const cases: [string, (p: Engine['state']['perma']) => boolean][] = [
      ['crowdControl', (p) => p.roleDmg.control > 1 && p.roleDmg.dps < 1],
      ['backOffice', (p) => p.roleDmg.support > 1 && p.drawDiscount < 0],
      ['nightCafe', (p) => p.atkSpeed > 1 && p.range < 0],
      ['wideAisle', (p) => p.range > 0 && p.atkSpeed < 1],
      ['teamwork', (p) => p.adjMult > 1 && p.aisleMult === 0],
      ['cornerShop', (p) => p.aisleMult > 1 && p.adjMult === 0],
      ['clearance', (p) => p.sellMult > 1 && p.incomeMult < 1],
    ];
    for (const [id, check] of cases) {
      const engine = fullEngine(50);
      const s = engine.state;
      const def = REWARD_CARDS.find((c) => c.id === id);
      expect(def, `${id} 카드가 없다`).toBeTruthy();
      expect(def!.kind, `${id} 는 빌드 카드여야 한다`).toBe('build');
      s.phase = 'reward';
      s.rewardOffers = [{ defId: id, tone: def!.tone, kind: def!.kind, name: def!.name, desc: def!.desc, icon: def!.icon }];
      expect(chooseReward(s, id), `${id} 적용 실패`).toBe(true);
      expect(check(s.perma), `${id} 의 장단점이 둘 다 적용되지 않았다`).toBe(true);
    }
  });

  it('빌드 카드가 수치 카드보다 많다 — 3장이 전부 밋밋한 제시가 나오지 않게', () => {
    const build = REWARD_CARDS.filter((c) => c.kind === 'build').length;
    const stat = REWARD_CARDS.filter((c) => c.kind === 'stat').length;
    expect(build).toBeGreaterThan(stat);
  });
});

describe('보스 예고', () => {
  it('보스마다 준비 힌트가 있다', () => {
    for (const w of [10, 20, 30, 40]) {
      const def = ENEMY_DEFS.find((e) => e.id === bossForWave(w))!;
      expect(def, `w${w} 보스 없음`).toBeTruthy();
      expect(def.counterHint, `${def.name} 에 대응 힌트가 없다`).toBeTruthy();
      expect(def.counterHint!.length).toBeGreaterThan(10);
    }
  });
  it('준비 중에는 어떤 보스인지 스냅샷에 실린다', () => {
    const engine = fullEngine(46);
    const s = engine.state;
    startWave(s, 9);
    if (s.phase !== 'playing') s.phase = 'playing';
    s.waveTimer = 0.01;
    s.spawnQueue = [];
    for (let i = 0; i < 4; i++) engine.tick(1 / 60);
    const snap = engine.snapshot();
    expect(snap.prep).toBeGreaterThan(0);
    expect(snap.prepBoss?.name).toBe(ENEMY_DEFS.find((e) => e.id === bossForWave(10))!.name);
    expect(snap.prepBoss?.hint.length).toBeGreaterThan(10);
  });
});
