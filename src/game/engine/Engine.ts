import type { ChallengeSpec, FxEvent, GameAction, GameState, MetaEffects, Rarity, Tier, UISnapshot, UnitGroup, Unit } from '../types';
import { BASE_RARITY_ODDS, SELL_REFUND, SLOT_POSITIONS, MAX_TIER, drawCost, formatClock, EVENT_INTERVAL, isBossWave, AISLE_NAMES, AISLE_BONUS } from '../config';
import { UNIT_BY_ID, unitsOfRarity } from '../data/units';
import { dupeWeight, PIN_GUARANTEE_DRAWS, PIN_TARGET_COPIES, EMPTY_ORDER, orderPrice, EPIC_PITY, type Order } from '../data/deck';
import type { ShiftCondition } from '../data/shiftConditions';
import { basePerma, chooseReward } from './rewardSystem';
import { useSkill, tickSkills } from './skillSystem';
import { ENEMY_BY_ID } from '../data/enemies';
import { DRAW_LINES } from '../data/dialogue';
import { createRng, randomSeed } from './rng';
import { updateEnemies } from './enemySystem';
import { updateUnits } from './unitSystem';
import { buildThemeSchedule } from '../data/waves';
import { updateWave, startWave } from './waveSystem';
import { updateEvents, baseModifiers, recomputeModifiers } from './eventSystem';
import { mergeUnits, choosePromote, canMerge, announceLegendary } from './mergeSystem';
import { createUnit } from './unitFactory';
import { RECIPE_BY_ID, pickMaterials } from '../data/recipes';
import { spendCoins, addCoins } from './economy';
import { sfx, addFloater, unitDef } from './helpers';
import { metaEffects } from '../save/meta';
import { DEFAULT_META_LEVELS } from '../save/meta';

export interface EngineOptions {
  seed?: number;
  meta?: MetaEffects;
  bestWave?: number;
  challenge?: ChallengeSpec | null; // ZUNRAN DAILY 규칙
  order?: Order; // 오늘 발주 (지명·제외). 없으면 순수 랜덤
  condition?: ShiftCondition | null; // 오늘의 근무 조건 (3택 1)
}

const FIXED_DT = 1 / 60;
const MAX_STEPS = 8;

// 게임 엔진. React/DOM 을 모른다. tick(dt) 로 진행하고 dispatch 로 조작한다.
export class Engine {
  state: GameState;
  private accumulator = 0;
  private snapshotVersion = 0;
  private cachedSnapshot: UISnapshot | null = null;
  private snapshotDirty = true;

  constructor(opts: EngineOptions = {}) {
    const seed = opts.seed ?? randomSeed();
    const meta = opts.meta ?? metaEffects(DEFAULT_META_LEVELS);
    this.state = createInitialState(seed, meta, opts.bestWave ?? 0);
    this.state.order = opts.order ?? EMPTY_ORDER;
    // 오늘의 근무 조건: spec 은 challenge 로 합쳐 들어오고, 여기서는 나머지를 적용한다.
    const cond = opts.condition ?? null;
    this.state.condition = cond;
    if (cond) {
      if (cond.startCoins) this.state.coins = Math.max(0, this.state.coins + cond.startCoins);
      if (cond.startHpMult) {
        this.state.maxHp = Math.max(1, Math.round(this.state.maxHp * cond.startHpMult));
        this.state.hp = this.state.maxHp;
      }
      if (cond.freeDraws) this.state.freeDraws += cond.freeDraws;
      // 뒤쪽 칸부터 봉쇄한다 (입구 쪽을 남겨야 판이 성립한다)
      for (let i = 0; i < (cond.blockSlots ?? 0) && i < this.state.slots.length - 6; i++) {
        this.state.slots[this.state.slots.length - 1 - i].blocked = true;
      }
    }
    this.state.challenge = opts.challenge ?? null;
    if (this.state.challenge) recomputeModifiers(this.state);
    this.state.themeSchedule = buildThemeSchedule(this.state.rng);
    startWave(this.state, 1);
    this.state.fx.length = 0; // 첫 웨이브 배너는 UI 가 별도로 처리
  }

  // dtReal: 실제 경과 초. 고정 스텝으로 잘라서 진행 (프레임 드랍 시에도 결정론 유지).
  tick(dtReal: number): void {
    const s = this.state;
    if (s.phase !== 'playing' || s.paused) return;
    let dt = Math.min(dtReal, 0.25);
    s.realTime += dt;
    // 히트스톱: 처치 순간 게임 시간만 아주 잠깐 멈춘다. 실시간은 계속 흐른다.
    // 정지분만 덜어내고 남은 dt 는 그대로 진행시킨다 — 프레임이 길게 들어와도
    // (프레임 드랍, 테스트의 큰 스텝) 그 프레임을 통째로 삼키지 않는다.
    if (s.hitstop > 0) {
      const used = Math.min(s.hitstop, dt * s.speed);
      s.hitstop -= used;
      dt -= used / s.speed;
      if (dt <= 0) {
        this.snapshotDirty = true;
        return;
      }
    }
    this.accumulator += dt * s.speed;
    let steps = 0;
    while (this.accumulator >= FIXED_DT && steps < MAX_STEPS) {
      this.step(FIXED_DT);
      this.accumulator -= FIXED_DT;
      steps++;
    }
    if (steps >= MAX_STEPS) this.accumulator = 0;
    this.snapshotDirty = true;
  }

  private step(dt: number): void {
    const s = this.state;
    s.time += dt;
    tickSkills(s, dt);
    updateWave(s, dt);
    if (s.phase !== 'playing') return; // 보상 선택 중이면 이번 틱은 여기서 멈춘다
    updateEvents(s);
    updateEnemies(s, dt);
    updateUnits(s, dt);
    // 정리: 죽거나 도달한 손님 제거 (연출은 fx 로 이미 발행됨)
    if (s.enemies.some((e) => e.dead || e.reached)) {
      s.enemies = s.enemies.filter((e) => !e.dead && !e.reached);
    }
    // 플로터 수명
    for (const f of s.floaters) f.life -= dt;
    if (s.floaters.some((f) => f.life <= 0)) s.floaters = s.floaters.filter((f) => f.life > 0);
    s.shake = Math.max(0, s.shake - dt * 30);
    if (s.hp <= 0) this.gameOver('편의점 체력이 0이 되었습니다');

  }

  private gameOver(reason: string): void {
    const s = this.state;
    if (s.phase === 'gameover') return;
    s.phase = 'gameover';
    s.gameOverReason = reason;
    s.fx.push({ type: 'shake', amount: 20 });
    sfx(s, 'gameover');
    this.snapshotDirty = true;
  }

  drainFx(): FxEvent[] {
    const fx = this.state.fx;
    if (fx.length === 0) return fx;
    this.state.fx = [];
    return fx;
  }

  // ───────────── 액션 ─────────────

  dispatch(action: GameAction): { ok: boolean; reason?: string } {
    const s = this.state;
    this.snapshotDirty = true;
    switch (action.type) {
      case 'DRAW':
        return this.draw();
      case 'ORDER':
        return this.draw(action.rarity);
      case 'MERGE': {
        if (s.phase !== 'playing') return { ok: false };
        const r = mergeUnits(s, action.defId, action.tier);
        return { ok: r.ok, reason: r.reason };
      }
      case 'COMBINE':
        return this.combine(action.recipeId);
      case 'SELL':
        return this.sell(action.unitId);
      case 'SELECT':
        s.selectedUnitId = action.unitId;
        return { ok: true };
      case 'MOVE':
        return this.move(action.unitId, action.slot);
      case 'TAP_SLOT':
        return this.tapSlot(action.slot);
      case 'SELL_JUNK':
        return this.sellJunk();
      case 'CHOOSE_PROMOTE':
        return { ok: choosePromote(s, action.defId) };
      case 'CHOOSE_REWARD': {
        const ok = chooseReward(s, action.defId);
        return { ok, reason: ok ? undefined : '이미 고른 보상이에요.' };
      }
      case 'USE_SKILL':
        return useSkill(s, action.skill);
      case 'TOGGLE_PAUSE':
        if (s.phase !== 'playing') return { ok: false };
        s.paused = !s.paused;
        return { ok: true };
      case 'SET_SPEED':
        s.speed = action.speed;
        return { ok: true };
      case 'GIVE_UP':
        this.gameOver('자진 퇴근');
        return { ok: true };
    }
  }

  rarityOdds(): Record<Exclude<Rarity, 'special'>, number> {
    const m = this.state.meta;
    const b = this.state.challenge?.boostRarity;
    const rare = Math.max(0, BASE_RARITY_ODDS.rare + m.rareBonus + (b?.rare ?? 0));
    const epic = Math.max(0, BASE_RARITY_ODDS.epic + m.epicBonus + (b?.epic ?? 0));
    const legendary = Math.max(0, BASE_RARITY_ODDS.legendary + m.legendaryBonus + this.state.perma.legendaryOdds + (b?.legendary ?? 0));
    return { common: Math.max(0, 1 - rare - epic - legendary), rare, epic, legendary };
  }

  currentDrawCost(): number {
    const base = drawCost(this.state.drawCount, this.state.meta.drawCostReduce + this.state.perma.drawDiscount);
    return Math.round(base * (this.state.condition?.drawCostMult ?? 1));
  }

  // 「본사 발주」: 등급을 지정해서 뽑는다. 일반 뽑기의 배수 가격.
  // 전설이 판의 45%에서만 등장하는데 점장 혼자 피해의 46%였다 (docs/AUDIT.md 문제 4).
  // 천장을 두는 대신 '벌어서 사게' 한다 — 기다리면 오는 것보다 돈을 모아 사는 쪽이 결정이다.
  // 동시에 후반에 남아도는 코인(웨이브 27 잔고 44,361원)의 배출구가 된다.
  orderCost(rarity: 'rare' | 'epic' | 'legendary'): number {
    return orderPrice(rarity, this.state.wave, this.state.perma.orderDiscount);
  }

  private draw(forced?: 'rare' | 'epic' | 'legendary'): { ok: boolean; reason?: string } {
    const s = this.state;
    if (s.phase !== 'playing') return { ok: false };
    const emptySlots = s.slots.filter((sl) => sl.unitId === null && !sl.blocked);
    if (emptySlots.length === 0) return { ok: false, reason: '빈 칸이 없어요. 합성하거나 판매하세요.' };
    const cost = forced ? this.orderCost(forced) : this.currentDrawCost();
    if (!forced && s.freeDraws > 0) {
      s.freeDraws--;
    } else if (!spendCoins(s, cost)) {
      return { ok: false, reason: '코인이 부족해요.' };
    }
    s.drawCount++;
    s.stats.draws++;
    if (forced) s.stats.orders++;

    let rarity: Rarity;
    if (forced) {
      rarity = forced;
    } else {
      const odds = this.rarityOdds();
      const r = s.rng.next();
      rarity = 'common';
      let acc = odds.legendary;
      if (r < acc) rarity = 'legendary';
      else if (r < (acc += odds.epic)) rarity = 'epic';
      else if (r < (acc += odds.rare)) rarity = 'rare';
      // 에픽 소프트 천장: 15연속 에픽 이상이 없으면 이번엔 확정으로 준다.
      // 전설 천장은 두지 않는다 — 전설은 발주로 '사는' 것이다.
      if (rarity !== 'epic' && rarity !== 'legendary') {
        if (s.sinceEpic >= EPIC_PITY - 1) rarity = 'epic';
      }
      // 「박스 입고」 보상: 남은 횟수만큼 희귀 이상 확정
      if (s.guaranteedRareDraws > 0) {
        s.guaranteedRareDraws--;
        if (rarity === 'common') rarity = 'rare';
      }
    }
    if (rarity === 'epic' || rarity === 'legendary') s.sinceEpic = 0;
    else s.sinceEpic++;
    let candidates = unitsOfRarity(rarity);

    // 발주 · 제외: 오늘 안 받기로 한 물건은 안 온다. 전부 막히면 규칙을 무시한다.
    const excluded = [...s.order.bans, ...(s.challenge?.banUnits ?? [])];
    if (excluded.length) {
      const filtered = candidates.filter((d) => !excluded.includes(d.id));
      if (filtered.length > 0) candidates = filtered;
    }

    // 발주 · 지명: 초반 N회 안에 지명한 물건이 안 왔으면 이번에 준다.
    // 확률을 올리는 게 아니라 '순서'를 보장한다 — 그래야 계획이 선다.
    let def = null as (typeof candidates)[number] | null;
    if (s.drawCount <= PIN_GUARANTEE_DRAWS) {
      const due = s.order.pins.find(
        (id) =>
          (s.stats.unitDraws[id] ?? 0) < PIN_TARGET_COPIES && UNIT_BY_ID[id]?.rarity === rarity && !excluded.includes(id),
      );
      // 남은 뽑기가 빠듯해질수록 지명을 밀어준다
      const pressure = s.drawCount / PIN_GUARANTEE_DRAWS;
      if (due && s.rng.next() < 0.4 + pressure * 0.6) def = UNIT_BY_ID[due];
    }

    // 중복 가중: 이미 갖고 있는 유닛이 더 잘 온다.
    // 21종 풀에서 3장 모으기가 어려운 마찰을 푼다. 풀은 그대로 전체다.
    if (!def) {
      const owned = new Map<string, number>();
      for (const u of s.units) owned.set(u.defId, (owned.get(u.defId) ?? 0) + 1);
      const weights = candidates.map((d) => dupeWeight(owned.get(d.id) ?? 0));
      const total = weights.reduce((a, b) => a + b, 0);
      let roll = s.rng.next() * total;
      def = candidates[candidates.length - 1];
      for (let i = 0; i < candidates.length; i++) {
        roll -= weights[i];
        if (roll <= 0) {
          def = candidates[i];
          break;
        }
      }
    }
    // 놓을 칸은 주사위로 정하지 않는다.
    // 코너 보너스(사거리 +18 / 공속 +12% / 공격력 +22%)가 "어디에 둘까"를 위해 있는데
    // 배치가 랜덤이면 그 보너스는 운이 된다 (docs/AUDIT.md 문제: 시스템 6번).
    // 유닛이 가장 적은 코너의 가장 왼쪽 빈 칸에 놓아 골고루 퍼지게 하고,
    // 플레이어는 방금 뽑힌 유닛이 선택된 상태이므로 원하는 칸을 탭해 바로 옮길 수 있다.
    const perRow = [0, 0, 0];
    for (const u of s.units) perRow[s.slots[u.slot].row]++;
    const slot = [...emptySlots].sort(
      (a, b) => perRow[a.row] - perRow[b.row] || a.index - b.index,
    )[0];
    const unit = createUnit(s, def.id, 1, slot.index);
    s.units.push(unit);
    slot.unitId = unit.id;
    s.stats.drawsByRarity[rarity]++;
    s.stats.unitDraws[def.id] = (s.stats.unitDraws[def.id] ?? 0) + 1;
    s.stats.unitMaxTier[def.id] = Math.max(s.stats.unitMaxTier[def.id] ?? 1, 1);
    if (!s.stats.seenUnits.includes(def.id)) s.stats.seenUnits.push(def.id);
    s.lastDrawResult = { defId: def.id, rarity, at: s.time, ordered: !!forced };
    // 방금 뽑은 유닛을 선택 상태로 둔다 — 빈 칸이 강조되어 한 번 탭으로 원하는 코너에 놓을 수 있다.
    s.selectedUnitId = unit.id;

    s.fx.push({ type: 'unitSpawn', unitId: unit.id, rarity });
    const line = s.rng.pick(DRAW_LINES[rarity]);
    if (rarity === 'legendary') {
      s.stats.legendaryDraws++;
      announceLegendary(s);
      sfx(s, 'legendary');
    } else if (rarity === 'epic') {
      s.fx.push({ type: 'banner', text: '에픽 등장', sub: `${def.name} · ${line}`, style: 'good', dur: 1.6 });
      s.fx.push({ type: 'flash', color: '#c77dff' });
      sfx(s, 'epic');
    } else if (rarity === 'rare') {
      addFloater(s, { x: slot.x, y: slot.y - 36, text: `${def.name}! ${line}`, color: '#4fc3f7', size: 13, life: 1.3 });
      sfx(s, 'rare');
    } else {
      addFloater(s, { x: slot.x, y: slot.y - 36, text: def.name, color: '#cbd5e1', size: 12, life: 1 });
      sfx(s, 'draw');
    }
    return { ok: true };
  }

  // 조합: 레시피 재료를 소모하고 레시피 전용 유닛을 만든다.
  private combine(recipeId: string): { ok: boolean; reason?: string } {
    const s = this.state;
    if (s.phase !== 'playing') return { ok: false };
    const def = RECIPE_BY_ID[recipeId];
    if (!def) return { ok: false };
    const ids = pickMaterials(def, this.snapshot().groups);
    if (!ids) return { ok: false, reason: '재료가 모자라요.' };

    const materials = ids.map((id) => s.units.find((u) => u.id === id)).filter((u): u is NonNullable<typeof u> => !!u);
    if (materials.length !== def.materials.length) return { ok: false, reason: '재료가 모자라요.' };

    // 결과는 첫 재료가 있던 칸에 놓는다
    const slotIndex = materials[0].slot;
    for (const u of materials) {
      s.slots[u.slot].unitId = null;
      if (s.selectedUnitId === u.id) s.selectedUnitId = null;
    }
    const usedIds = new Set(materials.map((u) => u.id));
    s.units = s.units.filter((u) => !usedIds.has(u.id));

    const made = createUnit(s, def.result, def.resultTier, slotIndex);
    s.units.push(made);
    s.slots[slotIndex].unitId = made.id;
    s.selectedUnitId = made.id;

    const resultDef = UNIT_BY_ID[def.result];
    s.stats.recipesMade++;
    if (!s.stats.seenUnits.includes(def.result)) s.stats.seenUnits.push(def.result);
    s.stats.unitMaxTier[def.result] = Math.max(s.stats.unitMaxTier[def.result] ?? 1, def.resultTier);
    const sl = s.slots[slotIndex];
    s.fx.push({ type: 'banner', text: resultDef?.name ?? def.name, sub: `조합 성공 · ${def.name}`, style: 'legendary', dur: 2 });
    s.fx.push({ type: 'shake', amount: 12 });
    s.fx.push({ type: 'unitSpawn', unitId: made.id, rarity: 'special' });
    addFloater(s, { x: sl.x, y: sl.y - 40, text: '조합!', color: '#ff4d8d', size: 15, life: 1.2 });
    sfx(s, 'legendary');
    this.snapshotDirty = true;
    return { ok: true };
  }

  private sell(unitId: number): { ok: boolean; reason?: string } {
    const s = this.state;
    const u = s.units.find((x) => x.id === unitId);
    if (!u) return { ok: false };
    const def = unitDef(u);
    const price = sellPrice(u);
    s.slots[u.slot].unitId = null;
    s.units = s.units.filter((x) => x !== u);
    if (s.selectedUnitId === unitId) s.selectedUnitId = null;
    const sl = s.slots[u.slot];
    addCoins(s, price, sl.x, sl.y - 20, '판매');
    addFloater(s, { x: sl.x, y: sl.y - 40, text: `${def.name} 판매`, color: '#94a3b8', size: 11, life: 1 });
    sfx(s, 'sell');
    return { ok: true };
  }

  // 정리: 같은 종류가 하나뿐인 티어1 일반 유닛 (합성 가망 없음) 을 한 번에 판매
  junkUnits(): Unit[] {
    const s = this.state;
    const count = new Map<string, number>();
    for (const u of s.units) if (u.tier === 1) count.set(u.defId, (count.get(u.defId) ?? 0) + 1);
    return s.units.filter((u) => u.tier === 1 && UNIT_BY_ID[u.defId].rarity === 'common' && (count.get(u.defId) ?? 0) === 1);
  }

  private sellJunk(): { ok: boolean; reason?: string } {
    const junk = this.junkUnits();
    if (junk.length === 0) return { ok: false, reason: '정리할 유닛이 없어요.' };
    let total = 0;
    for (const u of junk) {
      total += sellPrice(u);
      this.sell(u.id);
    }
    addFloater(this.state, { x: 320, y: 300, text: `정리 완료 +${total}원`, color: '#fde047', size: 16, life: 1.4 });
    return { ok: true };
  }

  private move(unitId: number, slotIdx: number): { ok: boolean } {
    const s = this.state;
    const u = s.units.find((x) => x.id === unitId);
    const target = s.slots[slotIdx];
    if (!u || !target) return { ok: false };
    if (target.blocked) return { ok: false };
    if (target.unitId === null) {
      s.slots[u.slot].unitId = null;
      u.slot = slotIdx;
      target.unitId = u.id;
    } else if (target.unitId !== u.id) {
      const other = s.units.find((x) => x.id === target.unitId)!;
      const from = u.slot;
      u.slot = slotIdx;
      other.slot = from;
      s.slots[from].unitId = other.id;
      target.unitId = u.id;
    }
    s.selectedUnitId = null;
    sfx(s, 'click');
    return { ok: true };
  }

  // 탭 규칙 (화면 안내와 동일하게):
  //  - 유닛이 있는 칸을 탭하면 그 유닛을 본다. 같은 유닛을 다시 탭하면 선택 해제.
  //  - 빈 칸을 탭하면 선택한 유닛이 그 자리로 간다.
  //  - 자리 교환은 드래그로만. (탭으로 교환하면 다른 유닛을 보려다 실수로 바뀐다)
  private tapSlot(slotIdx: number): { ok: boolean } {
    const s = this.state;
    const slot = s.slots[slotIdx];
    if (!slot) return { ok: false };
    if (slot.unitId !== null) {
      s.selectedUnitId = slot.unitId === s.selectedUnitId ? null : slot.unitId;
      sfx(s, 'click');
      return { ok: true };
    }
    if (s.selectedUnitId !== null) {
      const sel = s.units.find((x) => x.id === s.selectedUnitId);
      if (!sel) {
        s.selectedUnitId = null;
        return { ok: true };
      }
      return this.move(sel.id, slotIdx);
    }
    return { ok: true };
  }

  // ───────────── UI 스냅샷 ─────────────

  snapshot(): UISnapshot {
    if (!this.snapshotDirty && this.cachedSnapshot) return this.cachedSnapshot;
    const s = this.state;
    this.snapshotVersion++;
    this.snapshotDirty = false;
    const groups = groupUnits(s);
    const boss = s.enemies.find((e) => e.isBoss && !e.dead && !e.reached);
    const sel = s.selectedUnitId !== null ? s.units.find((u) => u.id === s.selectedUnitId) : undefined;
    const emptySlots = s.slots.filter((sl) => sl.unitId === null && !sl.blocked).length;
    const cost = this.currentDrawCost();
    const junk = this.junkUnits();
    this.cachedSnapshot = {
      version: this.snapshotVersion,
      phase: s.phase,
      clock: formatClock(s.wave, s.waveElapsed, s.waveDuration),
      wave: s.wave,
      waveTimer: s.waveTimer,
      waveDuration: s.waveDuration,
      waveTheme: s.waveTheme,
      survivedSec: s.realTime,
      hp: s.hp,
      maxHp: s.maxHp,
      coins: s.coins,
      drawCost: cost,
      freeDraws: s.freeDraws,
      canDraw: s.phase === 'playing' && emptySlots > 0 && (s.freeDraws > 0 || s.coins >= cost),
      orderCost: { rare: this.orderCost('rare'), epic: this.orderCost('epic'), legendary: this.orderCost('legendary') },
      emptySlots,
      totalSlots: s.slots.length,
      speed: s.speed,
      paused: s.paused,
      enemyCount: s.enemies.length,
      bossAlive: !!boss,
      bossHp: boss?.hp ?? 0,
      bossMaxHp: boss?.maxHp ?? 0,
      bossName: boss ? ENEMY_BY_ID[boss.defId].name : '',
      groups,
      selected: sel
        ? {
            unitId: sel.id,
            defId: sel.defId,
            tier: sel.tier,
            kills: sel.kills,
            damage: Math.round(sel.damage),
            sellPrice: sellPrice(sel),
            aisle: AISLE_NAMES[s.slots[sel.slot].row],
            aisleBonus: AISLE_BONUS[s.slots[sel.slot].row].label,
            groupCount: s.units.filter((u) => u.defId === sel.defId && u.tier === sel.tier).length,
          }
        : null,
      activeEvents: s.activeEvents.map((ae) => ({ title: ae.title, remain: Math.max(0, ae.until - s.time), mood: ae.mood })),
      stats: s.stats,
      unitCount: s.units.length,
      rarityOdds: this.rarityOdds(),
      disabledUnits: s.units.filter((u) => u.disabledUntil > s.time).length,
      rewardOffers: s.rewardOffers,
      promoteChoice: s.promoteChoice,
      rewardsTaken: s.rewardsTaken.length,
      perma: s.perma,
      shutterCd: s.skills.shutter,
      dumpCd: s.skills.dump,
      skillReady: { shutter: s.skills.shutter <= 0, dump: s.skills.dump <= 0 },
      combo: s.time <= s.combo.until ? s.combo.count : 0,
      bestCombo: s.combo.best,
      riskWave: s.riskWave === s.wave,
      nextIsBoss: isBossWave(s.wave + 1),
      junkCount: junk.length,
      junkValue: junk.reduce((a, u) => a + sellPrice(u), 0),
    };
    return this.cachedSnapshot;
  }

  mvpUnit(): { defId: string; damage: number; tier: number } | null {
    const entries = Object.entries(this.state.stats.unitDamage);
    if (entries.length === 0) return null;
    entries.sort((a, b) => b[1] - a[1]);
    const defId = entries[0][0];
    // 이번 판에 그 유닛이 도달한 최고 티어 (합성으로 사라졌어도 기록에 남는다)
    const tier = Math.max(this.state.stats.unitMaxTier[defId] ?? 1, ...this.state.units.filter((u) => u.defId === defId).map((u) => u.tier), 1);
    return { defId, damage: Math.round(entries[0][1]), tier };
  }
}

export function sellPrice(u: Unit): number {
  const def = UNIT_BY_ID[u.defId];
  return Math.round(SELL_REFUND[def.rarity] * Math.pow(2.2, u.tier - 1));
}

function groupUnits(s: GameState): UnitGroup[] {
  const map = new Map<string, UnitGroup>();
  for (const u of s.units) {
    const key = `${u.defId}|${u.tier}`;
    let g = map.get(key);
    if (!g) {
      g = { defId: u.defId, tier: u.tier, count: 0, unitIds: [], mergeable: false };
      map.set(key, g);
    }
    g.count++;
    g.unitIds.push(u.id);
  }
  const rank: Record<Rarity, number> = { common: 0, rare: 1, epic: 2, special: 3, legendary: 4 };
  const groups = [...map.values()];
  for (const g of groups) g.mergeable = canMerge(s, g.defId, g.tier as Tier) && g.tier < MAX_TIER;
  groups.sort((a, b) => {
    if (a.mergeable !== b.mergeable) return a.mergeable ? -1 : 1;
    const ra = rank[UNIT_BY_ID[a.defId].rarity];
    const rb = rank[UNIT_BY_ID[b.defId].rarity];
    if (ra !== rb) return rb - ra;
    if (a.tier !== b.tier) return b.tier - a.tier;
    return a.defId.localeCompare(b.defId);
  });
  return groups;
}

function createInitialState(seed: number, meta: MetaEffects, bestWave: number): GameState {
  const rng = createRng(seed);
  return {
    phase: 'playing',
    seed,
    rng,
    coinDrain: 0,
    time: 0,
    realTime: 0,
    speed: 1,
    paused: false,
    hp: meta.startHp,
    maxHp: meta.startHp,
    coins: meta.startCoins,
    drawCount: 0,
    sinceEpic: 0,
    guaranteedRareDraws: 0,
    freeDraws: meta.freeDraws,
    wave: 0,
    waveTimer: 0,
    waveDuration: 1,
    waveTheme: 'mixed',
    themeSchedule: [],
    waveElapsed: 0,
    spawnQueue: [],
    waveEnemyIds: new Set(),
    waveCleared: false,
    waveReached: false,
    bossAlive: false,
    lastEventId: null,
    bestWaveRecord: bestWave,
    recordAnnounced: false,
    units: [],
    slots: SLOT_POSITIONS.map((p, i) => ({ index: i, x: p.x, y: p.y, row: p.row, unitId: null })),
    perma: basePerma(),
    rewardOffers: [],
    promoteChoice: null,
    rewardsTaken: [],
    riskWave: -1,
    skills: { shutter: 0, dump: 0 },
    combo: { count: 0, until: 0, best: 0 },
    enemies: [],
    projectiles: [],
    activeEvents: [],
    nextEventAt: 40 + rng.range(EVENT_INTERVAL[0], EVENT_INTERVAL[1]),
    modifiers: baseModifiers(meta.coinGainMult),
    selectedUnitId: null,
    stats: {
      kills: 0,
      coinsEarned: 0,
      coinsSpent: 0,
      draws: 0,
      merges: 0,
    recipesMade: 0,
    orders: 0,
      bossKills: 0,
      legendaryDraws: 0,
      unitDamage: {},
      unitKills: {},
      maxTierReached: 1,
      eventsSeen: 0,
      bestCombo: 0,
      skillsUsed: 0,
      bestWave: 0,
      drawsByRarity: { common: 0, rare: 0, epic: 0, legendary: 0, special: 0 },
      seenUnits: [],
      seenEnemies: [],
      eventIds: [],
      reached: 0,
      reachedBy: {},
      storeDamageBy: {},
      enemyKills: {},
      enemySeen: {},
      unitDraws: {},
      unitMerges: {},
      unitMaxTier: {},
      catVisits: 0,
      lastDamageClock: '',
    },
    fx: [],
    floaters: [],
    shake: 0,
    nextId: 1,
    meta,
    hitstop: 0,
    order: { pins: [], bans: [] },
    condition: null,
    challenge: null,
    threeAmTriggered: false,
    lowHpWarned: false,
    disabledUnitNotice: 0,
  };
}

export { recomputeModifiers };
