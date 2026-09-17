import { describe, it, expect } from 'vitest';
import { Engine } from '../engine/Engine';
import { UNIT_BY_ID, UNIT_DEFS } from '../data/units';
import { ENEMY_DEFS } from '../data/enemies';
import { EVENT_DEFS } from '../data/events';
import { buildWave } from '../data/waves';
import { createRng } from '../engine/rng';
import { pathPos, PATH_LENGTH, TOTAL_SLOTS, formatClock, THREE_AM_WAVE } from '../config';
import { createUnit } from '../engine/unitFactory';
import { mergeUnits, choosePromote } from '../engine/mergeSystem';

function runFor(engine: Engine, seconds: number) {
  for (let t = 0; t < seconds; t += 0.05) {
    engine.tick(0.05);
    engine.drainFx();
    // 보상 선택이 뜨면 첫 카드를 골라 진행을 이어간다 (실제 플레이에서는 플레이어가 고른다)
    if (engine.state.phase === 'reward') engine.dispatch({ type: 'CHOOSE_REWARD', defId: engine.state.rewardOffers[0].defId });
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
    expect(pathPos(0).x).toBe(52);
    expect(pathPos(PATH_LENGTH).x).toBe(335);
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
    const engine = new Engine({ seed: 7 });
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
    const engine = new Engine({ seed: 5 });
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
