import { describe, it, expect } from 'vitest';
import { Engine } from '../engine/Engine';
import { metaEffects, DEFAULT_META_LEVELS } from '../save/meta';
import { UNIT_BY_ID, UNIT_DEFS } from '../data/units';
import type { Tier } from '../types';
import { ENEMY_DEFS, bossForWave } from '../data/enemies';
import { EVENT_DEFS } from '../data/events';
import { buildWave, THEME_WANTS, type WaveTheme } from '../data/waves';
import { startWave } from '../engine/waveSystem';
import { spawnEnemy } from '../engine/enemySystem';
import { createRng } from '../engine/rng';
import { TOTAL_SLOTS, MAX_SHELF_LEVEL, MAX_TIER, START_SLOTS, needsPrep, PREP_SECONDS, nearDrainPct, formatClock, THREE_AM_WAVE, FOCUS_THRESHOLD, FOCUS_MAX_WEIGHT, JUNK_DRAW_ROLLBACK } from '../config';
import { buildGeometry, geoPos, STAGE_BY_ID, maxSlotsOf } from '../data/stages';

// 경로는 지점마다 다르다. 테스트는 기준 지점(동네 골목점)으로 고정한다.
const REF_GEO = buildGeometry(STAGE_BY_ID.alley);
import { createUnit } from '../engine/unitFactory';
import { mergeUnits, choosePromote } from '../engine/mergeSystem';
import { REWARD_CARDS } from '../data/rewards';
import { chooseReward } from '../engine/rewardSystem';
import { recomputeAdjacency, unitDamage, unitInterval, boardFocus } from '../engine/helpers';
import { sellCandidate } from '../../ui/useGame';
import { tutorialSteps } from '../data/tutorial';
import { yardstickDps } from '../data/units';

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
  // 예전 계약은 '빈 칸이 3개 있을 때만 뜬다' 였다. 전수조사에서 이 카드만
  // 제시 0회였다 — 보상 화면이 뜨는 시점에 칸을 세 개나 비워 두는 사람은 없다.
  // 이제는 늘 뜨고, 빈 칸이 모자라면 싼 유닛을 내보내고 그 자리를 막는다.
  it('무인 운영 — 보드가 꽉 차 있어도 반드시 3칸을 막는다', () => {
    const engine = fullEngine(4);
    const s = engine.state;
    const open = s.slots.filter((sl) => !sl.locked && !sl.blocked);
    expect(card('unmanned').available!(s), '칸이 충분하면 늘 뜬다').toBe(true);
    // 한 칸도 남기지 않고 채운다
    for (const sl of open) {
      const u = createUnit(s, 'onigiri', 1, sl.index);
      s.units.push(u);
      sl.unitId = u.id;
    }
    expect(card('unmanned').available!(s), '꽉 차 있어도 뜬다').toBe(true);

    const beforeUnits = s.units.length;
    const beforeCoins = s.coins;
    s.phase = 'reward';
    const def = card('unmanned');
    s.rewardOffers = [{ defId: 'unmanned', tone: def.tone, kind: def.kind, name: def.name, desc: def.desc, icon: def.icon }];
    expect(chooseReward(s, 'unmanned')).toBe(true);

    expect(s.slots.filter((sl) => sl.blocked).length, '약속대로 3칸을 막는다').toBe(3);
    expect(s.units.length, '자리를 만들려고 유닛을 내보낸다').toBe(beforeUnits - 3);
    expect(s.coins, '내보낸 유닛의 판매 대금은 준다').toBeGreaterThan(beforeCoins);
    expect(s.perma.auraMult).toBe(2);
    // 막힌 칸에 유닛이 남아 있으면 안 된다
    for (const sl of s.slots) if (sl.blocked) expect(sl.unitId).toBeNull();
  });

  it('무인 운영 — 전설·특수는 말없이 뺏지 않는다', () => {
    const engine = fullEngine(9);
    const s = engine.state;
    const open = s.slots.filter((sl) => !sl.locked && !sl.blocked);
    const legend = UNIT_DEFS.find((u) => u.rarity === 'legendary')!;
    for (const [i, sl] of open.entries()) {
      const u = createUnit(s, i < 2 ? legend.id : 'onigiri', 1, sl.index);
      s.units.push(u);
      sl.unitId = u.id;
    }
    const def = card('unmanned');
    s.phase = 'reward';
    s.rewardOffers = [{ defId: 'unmanned', tone: def.tone, kind: def.kind, name: def.name, desc: def.desc, icon: def.icon }];
    chooseReward(s, 'unmanned');
    expect(s.units.filter((u) => u.defId === legend.id).length, '전설은 그대로').toBe(2);
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

    place(s, 'alba', 0); // dps
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
    place(s, 'alba', firstOfRow1.index);
    recomputeAdjacency(s);
    expect(a.adj?.sameRole ?? 0).toBe(0);
  });

  it('「합을 맞춘다」는 옆자리를 2배로, 「코너 장사」는 0으로 만든다', () => {
    const e = fullEngine(44);
    const s = e.state;
    const mid = place(s, 'onigiri', 1);
    place(s, 'alba', 0);
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
    place(s, 'alba', 0);
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

// ───────── 계산대 앞 매출 손실 ─────────
//
// 난이도가 곡선이 아니라 계단이었다 — 25웨이브 무피해 → 2웨이브 사망.
// 손님이 계산대에 '닿을 때만' 피해가 나니 다 막거나 다 뚫리거나였다.
// 닿기 전에도 대가가 있어야 죽기 전에 신호가 온다.
describe('계산대 앞 매출 손실', () => {
  it('비율은 인원수에 비례하고 60%에서 멈춘다', () => {
    expect(nearDrainPct(0)).toBe(0);
    expect(nearDrainPct(1)).toBeCloseTo(0.06, 5);
    expect(nearDrainPct(5)).toBeCloseTo(0.3, 5);
    expect(nearDrainPct(10)).toBeCloseTo(0.6, 5);
    expect(nearDrainPct(30), '아무리 밀려도 상한').toBeCloseTo(0.6, 5);
  });

  it('계산대 앞에 손님이 밀리면 코인이 샌다', () => {
    const engine = fullEngine(61);
    const s = engine.state;
    s.coins = 5000;
    startWave(s, 12);
    if (s.phase !== 'playing') s.phase = 'playing';
    s.spawnQueue = [];
    // 계산대 코앞에 여섯 명을 세운다
    for (let i = 0; i < 6; i++) {
      const e = spawnEnemy(s, 'basic', { silent: true });
      if (e) e.dist = s.geo.length * 0.9;
    }
    const before = s.coins;
    for (let i = 0; i < 120; i++) engine.tick(1 / 60); // 2초
    expect(s.nearCheckout, '여섯 명이 계산대 앞에 있다').toBeGreaterThanOrEqual(6);
    expect(s.nearDrain).toBeCloseTo(nearDrainPct(s.nearCheckout), 5);
    expect(s.coins, '매출이 샌다').toBeLessThan(before);
    expect(s.stats.revenueLost, '보고서에 남는다').toBeGreaterThan(0);
  });

  it('계산대가 비어 있으면 한 푼도 안 샌다', () => {
    const engine = fullEngine(62);
    const s = engine.state;
    s.coins = 5000;
    startWave(s, 12);
    if (s.phase !== 'playing') s.phase = 'playing';
    s.spawnQueue = [];
    s.enemies.length = 0;
    const before = s.coins;
    for (let i = 0; i < 120; i++) engine.tick(1 / 60);
    expect(s.nearCheckout).toBe(0);
    expect(s.nearDrain).toBe(0);
    expect(s.coins).toBe(before);
    expect(s.stats.revenueLost).toBe(0);
  });

  it('코인이 0이면 더 깎지 않는다 (음수로 가지 않는다)', () => {
    const engine = fullEngine(63);
    const s = engine.state;
    s.coins = 0;
    startWave(s, 20);
    if (s.phase !== 'playing') s.phase = 'playing';
    s.spawnQueue = [];
    for (let i = 0; i < 10; i++) {
      const e = spawnEnemy(s, 'basic', { silent: true });
      if (e) e.dist = s.geo.length * 0.9;
    }
    for (let i = 0; i < 180; i++) engine.tick(1 / 60);
    expect(s.coins).toBeGreaterThanOrEqual(0);
  });
});

describe('첫 판 안내', () => {
  it('아무것도 안 했으면 다섯 단계가 모두 미완료다', () => {
    const e = fullEngine(4242);
    const steps = tutorialSteps(e.snapshot());
    expect(steps).toHaveLength(5);
    expect(steps.every((s) => !s.done)).toBe(true);
  });

  it('실제로 뽑고 옮기고 합성하면 그 단계가 켜진다', () => {
    const e = fullEngine(4242);
    const s = e.state;
    s.coins = 99999;
    e.dispatch({ type: 'DRAW' });
    expect(tutorialSteps(e.snapshot()).find((t) => t.id === 'draw')!.done).toBe(true);
    expect(tutorialSteps(e.snapshot()).find((t) => t.id === 'move')!.done).toBe(false);

    // 옮기기: 첫 유닛을 빈 칸으로
    const u = s.units[0];
    const empty = s.slots.find((sl) => !sl.locked && !sl.blocked && sl.unitId === null)!;
    e.dispatch({ type: 'MOVE', unitId: u.id, slot: empty.index });
    expect(tutorialSteps(e.snapshot()).find((t) => t.id === 'move')!.done).toBe(true);

    // 합성: 같은 유닛 3개를 직접 만들어 붙인다
    const defId = s.units[0].defId;
    while (s.units.filter((x) => x.defId === defId && x.tier === 1).length < 3) {
      const sl = s.slots.find((x) => !x.locked && !x.blocked && x.unitId === null)!;
      const nu = createUnit(s, defId, 1, sl.index);
      s.units.push(nu);
      sl.unitId = nu.id;
    }
    expect(mergeUnits(s, defId, 1).ok).toBe(true);
    expect(tutorialSteps(e.snapshot()).find((t) => t.id === 'merge')!.done).toBe(true);

    // 보상은 아직 안 골랐다
    expect(tutorialSteps(e.snapshot()).find((t) => t.id === 'reward')!.done).toBe(false);
  });

  it('많이 옮겨보면 인접 단계도 통과한다 (아무것도 못 고른 채 갇히지 않는다)', () => {
    const e = fullEngine(77);
    e.state.stats.moves = 4;
    expect(tutorialSteps(e.snapshot()).find((t) => t.id === 'adj')!.done).toBe(true);
  });
});

describe('등급과 역할의 기본선', () => {
  it('일반 등급에도 범위 공격이 있다 (범위 빌드를 에픽까지 못 기다린다)', () => {
    const commonAoe = UNIT_DEFS.filter((d) => d.rarity === 'common' && d.role === 'aoe');
    expect(commonAoe.length, '일반 범위 유닛이 없으면 초반 범위 빌드가 성립하지 않는다').toBeGreaterThan(0);
    // 범위는 aoeRadius 로 표현된다 (attack 은 'aoe' 든 'projectile' 이든 된다)
    for (const d of commonAoe) expect(d.aoeRadius ?? 0, `${d.name}`).toBeGreaterThan(0);
  });

  it('같은 역할에서 희귀가 일반보다 못하지 않다', () => {
    // 피해/간격만 보면 범위·도트가 빠져 떡볶이 같은 유닛을 잘못 읽는다.
    const dps = yardstickDps;
    for (const role of ['dps', 'aoe', 'control'] as const) {
      const commons = UNIT_DEFS.filter((d) => d.rarity === 'common' && d.role === role);
      const rares = UNIT_DEFS.filter((d) => d.rarity === 'rare' && d.role === role);
      if (commons.length === 0 || rares.length === 0) continue;
      const bestCommon = Math.max(...commons.map(dps));
      for (const r of rares) {
        expect(dps(r), `${r.name}(희귀)이 일반 최고(${bestCommon.toFixed(1)})보다 못하다`).toBeGreaterThan(bestCommon);
      }
    }
  });
});

// 「전문점」 — 보드가 한 계열로 모이면 그 계열이 더 자주 뽑힌다.
//
// 계측(scripts/threats.ts)에서 나온 문제를 겨냥한다: 12웨이브부터 칸이 89% 로
// 차고 판당 판매가 24회다. 특화로 가려면 더 팔아야 하는데 뽑기는 전체 풀에서
// 나오니 원하는 계열은 네 번에 한 번만 온다 — 그래서 아무거나 뽑는 게 편하다.
describe('전문점', () => {
  function fill(s: Engine['state'], defIds: string[]) {
    for (const u of [...s.units]) s.slots[u.slot].unitId = null;
    s.units = [];
    defIds.forEach((defId, i) => {
      const sl = s.slots.filter((x) => !x.locked && !x.blocked)[i];
      const u = createUnit(s, defId, 1, sl.index);
      s.units.push(u);
      sl.unitId = u.id;
    });
  }

  it('유닛이 적으면 아무 일도 일어나지 않는다', () => {
    const e = fullEngine(101);
    fill(e.state, ['ramenShelf', 'ramenShelf']); // 전부 제어지만 5개 미만
    expect(boardFocus(e.state).weight).toBe(1);
  });

  it('잡탕 보드는 걸리지 않는다 (표류로는 안 켜진다)', () => {
    const e = fullEngine(102);
    // 제어 3 · 단일 3 · 지원 2 → 주력 점유율 0.375
    fill(e.state, ['ramenShelf', 'ramenShelf', 'ramenShelf', 'onigiri', 'alba', 'onigiri', 'fridge', 'fridge']);
    const f = boardFocus(e.state);
    expect(f.share).toBeLessThan(FOCUS_THRESHOLD);
    expect(f.weight).toBe(1);
  });

  it('한 계열로 모으면 그 계열이 밀린다', () => {
    const e = fullEngine(103);
    fill(e.state, ['ramenShelf', 'ramenShelf', 'ramenShelf', 'ramenShelf', 'ramenShelf', 'ramenShelf', 'onigiri', 'fridge']);
    const f = boardFocus(e.state);
    expect(f.role).toBe('control');
    expect(f.share).toBeGreaterThan(FOCUS_THRESHOLD);
    expect(f.weight).toBeGreaterThan(1);
    expect(f.weight).toBeLessThanOrEqual(FOCUS_MAX_WEIGHT);
  });

  it('티어가 높은 유닛이 더 크게 친다 (팔려고 둔 1티어 잡탕이 주력을 정하지 않게)', () => {
    const e = fullEngine(104);
    const s = e.state;
    fill(s, ['ramenShelf', 'onigiri', 'onigiri', 'onigiri', 'alba', 'alba']);
    expect(boardFocus(s).role).toBe('dps'); // 머릿수로는 단일이 5
    s.units.find((u) => u.defId === 'ramenShelf')!.tier = 4; // ★4 제어 하나
    // 제어 4 vs 단일 5 — 아직 단일. 하나 더 올리면 뒤집힌다.
    s.units.find((u) => u.defId === 'alba')!.tier = 1;
    const f = boardFocus(s);
    expect(f.share).toBeGreaterThan(0.3);
  });

  it('풀에서 빼는 게 아니라 가중치만 올린다 (다른 계열도 계속 나온다)', () => {
    const e = fullEngine(105);
    const s = e.state;
    s.coins = 999999;
    fill(s, ['ramenShelf', 'ramenShelf', 'ramenShelf', 'ramenShelf', 'ramenShelf', 'ramenShelf']);
    expect(boardFocus(s).weight).toBeGreaterThan(1);
    // 일반 등급만 200번 뽑아 계열 분포를 본다
    const roles = new Set<string>();
    for (let i = 0; i < 200; i++) {
      const before = s.units.length;
      s.coins = 999999;
      e.dispatch({ type: 'DRAW' });
      if (s.units.length === before) break; // 칸이 다 찼다
      const last = s.units[s.units.length - 1];
      roles.add(UNIT_BY_ID[last.defId].role);
      // 방금 뽑은 걸 치워 칸을 비운다 (분포만 보려는 것)
      s.slots[last.slot].unitId = null;
      s.units = s.units.filter((u) => u !== last);
    }
    expect(roles.size, '전문점이 켜져도 다른 계열이 나와야 한다').toBeGreaterThan(1);
  });
});

// 정리 → 발주 단가 되돌림. 전문점일 때만 준다.
//
// 조건 없이 줬더니 잡탕 보드가 제일 크게 이득을 봤다 (대조군 21 → 24,
// 빌드 격차 1.11 → 1.20). 정리할 1티어 외톨이가 늘 많은 쪽이 잡탕이기 때문이다.
describe('정리와 발주 단가', () => {
  function stock(s: Engine['state'], defIds: string[]) {
    for (const u of [...s.units]) s.slots[u.slot].unitId = null;
    s.units = [];
    const open = s.slots.filter((x) => !x.locked && !x.blocked);
    defIds.forEach((defId, i) => {
      const u = createUnit(s, defId, 1, open[i].index);
      s.units.push(u);
      open[i].unitId = u.id;
    });
  }

  it('전문점이면 정리한 수의 절반만큼 발주 단가가 내려간다', () => {
    const e = fullEngine(201);
    const s = e.state;
    s.drawCount = 30;
    // 제어 6 (짝이 있어 정리 대상 아님) + 정리될 외톨이 4
    stock(s, ['ramenShelf', 'ramenShelf', 'ramenShelf', 'vacuum', 'vacuum', 'vacuum', 'onigiri', 'alba', 'coffee', 'scanner']);
    const junk = e.junkUnits().length;
    expect(junk, '외톨이가 정리 대상이어야 한다').toBeGreaterThan(0);
    const before = e.currentDrawCost();
    expect(e.dispatch({ type: 'SELL_JUNK' }).ok).toBe(true);
    expect(boardFocus(s).weight, '정리 후에는 제어만 남아 전문점이다').toBeGreaterThan(1);
    expect(s.drawCount).toBe(30 - Math.floor(junk * JUNK_DRAW_ROLLBACK));
    expect(e.currentDrawCost()).toBeLessThan(before);
  });

  it('잡탕이면 정리해도 발주 단가가 그대로다', () => {
    const e = fullEngine(202);
    const s = e.state;
    s.drawCount = 30;
    // 어느 계열도 60% 를 못 넘게 섞는다
    stock(s, ['onigiri', 'onigiri', 'alba', 'ramenShelf', 'ramenShelf', 'fridge', 'fridge', 'hotbar', 'hotbar', 'coffee']);
    const before = e.currentDrawCost();
    e.dispatch({ type: 'SELL_JUNK' });
    expect(boardFocus(s).weight).toBe(1);
    expect(s.drawCount).toBe(30);
    expect(e.currentDrawCost()).toBe(before);
  });

  it('되돌림은 0 아래로 내려가지 않는다', () => {
    const e = fullEngine(203);
    const s = e.state;
    s.drawCount = 1;
    stock(s, ['ramenShelf', 'ramenShelf', 'ramenShelf', 'vacuum', 'vacuum', 'vacuum', 'onigiri', 'alba', 'coffee', 'scanner']);
    e.dispatch({ type: 'SELL_JUNK' });
    expect(s.drawCount).toBeGreaterThanOrEqual(0);
  });
});

// 웨이브 테마 ↔ 전문점 상성. 좁힌 대가가 눈에 보여야 대비가 판단이 된다.
describe('테마가 요구하는 계열', () => {
  it('네 테마 모두 정의돼 있고, mixed 만 요구가 없다', () => {
    const themes: WaveTheme[] = ['mixed', 'fast', 'swarm', 'armor'];
    for (const t of themes) expect(THEME_WANTS).toHaveProperty(t);
    expect(THEME_WANTS.mixed).toBeNull();
    expect(THEME_WANTS.fast).toBe('control');
    expect(THEME_WANTS.swarm).toBe('aoe');
    expect(THEME_WANTS.armor).toBe('dps');
  });

  it('요구하는 계열의 유닛이 실제로 존재한다 (답이 없는 문제를 내지 않는다)', () => {
    for (const t of ['fast', 'swarm', 'armor'] as const) {
      const want = THEME_WANTS[t]!;
      const pool = UNIT_DEFS.filter((d) => d.role === want && d.rarity !== 'special');
      expect(pool.length, `${t} 가 요구하는 ${want} 유닛이 없다`).toBeGreaterThan(1);
      // 일반 등급에도 하나는 있어야 초반 테마에 대응할 수 있다
      expect(pool.some((d) => d.rarity === 'common' || d.rarity === 'rare'), `${want} 저등급 유닛이 없다`).toBe(true);
    }
  });
});
