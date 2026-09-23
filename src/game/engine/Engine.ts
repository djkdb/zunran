import type { ChallengeSpec, FxEvent, GameAction, GameState, MetaEffects, Rarity, Tier, UISnapshot, UnitGroup, Unit } from '../types';
import { BASE_RARITY_ODDS, SELL_REFUND, MAX_TIER, MIXED_MERGE_TIER, START_SLOTS, mergeCost, drawCost, formatClock, EVENT_INTERVAL, isBossWave, JUNK_DRAW_ROLLBACK } from '../config';
import { STAGE_BY_ID, DEFAULT_STAGE, buildGeometry, unlockOrderFor, type StageDef } from '../data/stages';
import { UNIT_BY_ID, unitsOfRarity } from '../data/units';
import { dupeWeight, PIN_GUARANTEE_DRAWS, PIN_TARGET_COPIES, EMPTY_ORDER, orderPrice, EPIC_PITY, type Order } from '../data/deck';
import type { ShiftCondition } from '../data/shiftConditions';
import { basePerma, chooseReward } from './rewardSystem';
import { useSkill, tickSkills } from './skillSystem';
import { ENEMY_BY_ID, bossForWave } from '../data/enemies';
import { DRAW_LINES } from '../data/dialogue';
import { createRng, randomSeed } from './rng';
import { updateEnemies } from './enemySystem';
import { updateUnits } from './unitSystem';
import { buildThemeSchedule } from '../data/waves';
import { updateWave, startWave, skipPrep } from './waveSystem';
import { updateEvents, baseModifiers, recomputeModifiers, chooseEvent } from './eventSystem';
import { mergeUnits, choosePromote, canMerge, canTierMerge, mergeByTier, tierMergeCandidates, announceLegendary } from './mergeSystem';
import { createUnit } from './unitFactory';
import { RECIPE_BY_ID, pickMaterials } from '../data/recipes';
import { spendCoins, addCoins } from './economy';
import { sfx, addFloater, unitDef, freeSlots, openSlots, recomputeAdjacency, boardFocus, ADJ_SAME_ROLE, ADJ_NEAR_SUPPORT } from './helpers';
import { metaEffects } from '../save/meta';
import { DEFAULT_META_LEVELS } from '../save/meta';

export interface EngineOptions {
  seed?: number;
  meta?: MetaEffects;
  bestWave?: number;
  challenge?: ChallengeSpec | null; // ZUNRAN DAILY 규칙
  order?: Order; // 오늘 발주 (지명·제외). 없으면 순수 랜덤
  condition?: ShiftCondition | null; // 오늘의 근무 조건 (3택 1)
  stageId?: string; // 어느 지점에서 일하는가 (매장 구조·유동인구가 달라진다)
}

const FIXED_DT = 1 / 60;
const MAX_STEPS = 8;

// 게임 엔진. React/DOM 을 모른다. tick(dt) 로 진행하고 dispatch 로 조작한다.
export class Engine {
  state: GameState;
  runId = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
  startedAt = Date.now();
  private accumulator = 0;
  private snapshotVersion = 0;
  private cachedSnapshot: UISnapshot | null = null;
  private snapshotDirty = true;

  constructor(opts: EngineOptions = {}) {
    const seed = opts.seed ?? randomSeed();
    const meta = opts.meta ?? metaEffects(DEFAULT_META_LEVELS);
    const stage = STAGE_BY_ID[opts.stageId ?? DEFAULT_STAGE] ?? STAGE_BY_ID[DEFAULT_STAGE];
    this.state = createInitialState(seed, meta, opts.bestWave ?? 0, stage);
    this.state.order = opts.order ?? EMPTY_ORDER;
    // 오늘의 근무 조건: spec 은 challenge 로 합쳐 들어오고, 여기서는 나머지를 적용한다.
    // 아직 증축하지 않은 칸을 잠근다. 가운데 열부터 시작해 바깥으로 열린다.
    // 지점마다 매장 크기가 다르므로 그 지점의 칸 수를 넘지 않는다.
    const all = this.state.slots.length;
    const openSlots = Math.min(all, this.state.meta.slots ?? all);
    const order = unlockOrderFor(this.state.geo);
    for (let i = 0; i < all - openSlots; i++) {
      const idx = order[order.length - 1 - i];
      if (idx !== undefined) this.state.slots[idx].locked = true;
    }

    // 좁은 지점에서 남는 증축은 '진열 밀도' 로 돌려준다.
    //
    // 국도변 시골점은 14칸이 끝이라 증축 12단계 중 5단계만 먹혔다. 나머지 7단계는
    // 첫 지점에서 상점의 대표 강화를 사는 신규 플레이어에게 그대로 죽은 돈이었다
    // (실측: 시골점 증축 8단계와 12단계의 결과가 소수점까지 같았다).
    // 칸을 더 못 놓는 대신 놓은 칸이 진해진다 — 좁고 진한 가게라는 정체성과도 맞는다.
    const surplus = Math.max(0, START_SLOTS + (this.state.meta.shelfLevel ?? 0) - all);
    // 단계당 +9% 로는 시골점 증축 8단계와 12단계가 26 ↔ 25 로 평평했다.
    // 칸 하나가 주는 화력에 견주려면 이 정도는 되어야 한다.
    if (surplus > 0) this.state.perma.aisleMult += surplus * 0.16;
    this.state.shelfSurplus = surplus;

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
      const open = this.state.slots.filter((sl) => !sl.locked);
      for (let i = 0; i < (cond.blockSlots ?? 0) && i < open.length - 6; i++) {
        open[open.length - 1 - i].blocked = true;
      }
    }
    this.state.challenge = opts.challenge ?? null;
    if (this.state.challenge) recomputeModifiers(this.state);
    this.state.themeSchedule = buildThemeSchedule(this.state.rng);
    startWave(this.state, 1);
    this.state.fx.length = 0; // 첫 웨이브 배너는 UI 가 별도로 처리
  }

  // Bump the format when gameplay state becomes incompatible. RNG and accumulator
  // must survive reloads; reseeding here changes the next draw and combat outcome.
  checkpoint(): string {
    const { rng, waveEnemyIds, fx: _fx, floaters: _floaters, ...state } = this.state;
    const payload = JSON.stringify({
      version: 1, runId: this.runId, startedAt: this.startedAt,
      accumulator: this.accumulator, rng: rng.getState(),
      state: { ...state, waveEnemyIds: [...waveEnemyIds], fx: [], floaters: [] },
    });
    return JSON.stringify({ payload, checksum: checkpointHash(payload) });
  }

  static restore(raw: string): Engine | null {
    try {
      if (raw.length > 4_000_000) return null;
      const envelope = JSON.parse(raw);
      if (typeof envelope.payload !== 'string' || checkpointHash(envelope.payload) !== envelope.checksum) return null;
      const data = JSON.parse(envelope.payload);
      const s = data.state as GameState & { waveEnemyIds: number[] };
      if (data.version !== 1 || typeof data.runId !== 'string' || !Number.isFinite(data.startedAt) ||
          !Number.isInteger(data.rng) || data.rng < 0 || data.rng > 0xffffffff ||
          !Number.isFinite(data.accumulator) || data.accumulator < 0 || data.accumulator > 1 ||
          !s || !STAGE_BY_ID[s.stage?.id] || !['playing', 'reward', 'promote', 'eventChoice', 'gameover'].includes(s.phase) ||
          !Number.isFinite(s.time) || !Number.isFinite(s.hp) || !Number.isFinite(s.coins) ||
          !Array.isArray(s.units) || !Array.isArray(s.enemies) || !Array.isArray(s.waveEnemyIds)) return null;
      const stage = STAGE_BY_ID[s.stage.id];
      const geo = buildGeometry(stage);
      if (s.slots.length !== geo.totalSlots || s.units.some((u) => !UNIT_BY_ID[u.defId] || !s.slots[u.slot] || s.slots[u.slot].unitId !== u.id) ||
          s.enemies.some((e) => !ENEMY_BY_ID[e.defId])) return null;
      const engine = new Engine({ seed: s.seed, stageId: stage.id });
      engine.state = { ...s, stage, geo, rng: createRng(data.rng), waveEnemyIds: new Set(s.waveEnemyIds), fx: [], floaters: [] };
      engine.accumulator = data.accumulator;
      engine.runId = data.runId;
      engine.startedAt = data.startedAt;
      // Snapshot exercises the data needed to render before offering Resume.
      engine.snapshot();
      engine.snapshotDirty = true;
      return engine;
    } catch { return null; }
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
      case 'MERGE_TIER': {
        const r = mergeByTier(s, action.tier);
        return { ok: r.ok, reason: r.reason };
      }
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
      case 'MERGE_BUY':
        return this.mergeBuy(action.defId);
      case 'SKIP_PREP':
        return { ok: skipPrep(s) };
      case 'TOGGLE_PIN': {
        const u = s.units.find((x) => x.id === action.unitId);
        if (!u) return { ok: false };
        u.pinned = !u.pinned;
        this.snapshotDirty = true;
        return { ok: true };
      }
      case 'CHOOSE_PROMOTE':
        return { ok: choosePromote(s, action.defId) };
      case 'CHOOSE_EVENT':
        return { ok: chooseEvent(s, action.index) };
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
    const off = Math.min(0.8, this.state.perma.orderDiscount + this.state.meta.orderDiscount);
    return orderPrice(rarity, this.state.wave, this.currentDrawCost(), off);
  }

  private draw(forced?: 'rare' | 'epic' | 'legendary'): { ok: boolean; reason?: string } {
    const s = this.state;
    if (s.phase !== 'playing') return { ok: false };
    const emptySlots = freeSlots(s);
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
    //
    // 여기에 「전문점」이 하나 더 곱해진다 — 보드가 한 계열로 모여 있으면
    // 그 계열이 더 자주 온다. 풀에서 빼는 게 아니라 가중치만 올리므로
    // 다른 계열도 계속 나온다 (웨이브 테마가 약점을 찌를 때 빠져나갈 구멍).
    if (!def) {
      const owned = new Map<string, number>();
      for (const u of s.units) owned.set(u.defId, (owned.get(u.defId) ?? 0) + 1);
      const focus = boardFocus(s);
      const weights = candidates.map(
        (d) => dupeWeight(owned.get(d.id) ?? 0) * (focus.role && d.role === focus.role ? focus.weight : 1),
      );
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
    // 줄 수는 지점마다 다르다 (시골 2줄 · 골목 3줄 · 술집가 4줄).
    // [0,0,0] 으로 고정돼 있어서 4줄짜리 지점에서는 넷째 줄 집계가 NaN 이 되고
    // 정렬이 칸 번호 순으로 주저앉았다.
    const perRow = new Array(s.geo.aisleNames.length).fill(0);
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
    const price = sellPrice(u, s.perma.sellMult);
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
  // 「정리」 대상 = 합성으로 이어질 가망이 없는 1티어 외톨이.
  //
  // 예전에는 일반 등급만 봤다. 그래서 보드가 희귀 이상으로 차면 정리 버튼이
  // 아예 안 떴고, 칸이 꽉 찬 채로 뽑기·발주·합성이 전부 막히는 판이 나왔다
  // (한 판 추적: w7~w14 동안 조작 0회, 코인 1,174 → 6,428 쌓이다 사망).
  // 에픽·전설·특수는 한 장이 판을 바꾸므로 실수로 팔리지 않게 그대로 제외한다.
  junkUnits(): Unit[] {
    const s = this.state;
    const count = new Map<string, number>();
    for (const u of s.units) if (u.tier === 1) count.set(u.defId, (count.get(u.defId) ?? 0) + 1);
    return s.units.filter((u) => {
      if (u.pinned) return false; // 잠근 유닛은 건드리지 않는다
      if (u.tier !== 1 || (count.get(u.defId) ?? 0) !== 1) return false;
      const r = UNIT_BY_ID[u.defId].rarity;
      return r === 'common' || r === 'rare';
    });
  }

  // 「한 개만 더」 — 합성까지 하나 남은 1티어 짝을 돈으로 채워서 바로 합친다.
  //
  // 칸이 꽉 차면 뽑기도 발주도 막히는데, 그때 보드에 2개짜리 짝이 남아 있어도
  // 3개가 필요해서 아무것도 못 했다. 이 발주는 사자마자 합쳐지므로 칸이
  // 오히려 하나 빈다 — 꽉 찬 상태에서도 누를 수 있는 유일한 수다.
  // 운이 나쁜 판을 돈으로 되돌리는 수단이자, 쌓이기만 하던 코인의 출구다.
  mergeBuyOffers(): { defId: string; tier: Tier; cost: number; need: number }[] {
    const s = this.state;
    if (s.phase !== 'playing') return [];
    const count = new Map<string, number>();
    for (const u of s.units) if (u.tier === 1) count.set(u.defId, (count.get(u.defId) ?? 0) + 1);
    const out: { defId: string; tier: Tier; cost: number; need: number }[] = [];
    for (const [defId, have] of count) {
      const need = mergeCost(1) - have;
      if (need !== 1) continue; // 딱 하나 남았을 때만
      const def = UNIT_BY_ID[defId];
      if (def.rarity === 'legendary' || def.rarity === 'special') continue;
      out.push({ defId, tier: 1, cost: this.mergeBuyCost(def.rarity), need });
    }
    return out.sort((a, b) => a.cost - b.cost).slice(0, 2);
  }

  private mergeBuyCost(rarity: Rarity): number {
    // 같은 등급 발주의 일부. 등급이 아니라 '이 유닛'을 콕 집어 주지만
    // 사자마자 합성으로 사라지므로 한 장짜리 발주보다 싸야 한다.
    const tier: 'rare' | 'epic' = rarity === 'epic' ? 'epic' : 'rare';
    const base = orderPrice(tier, this.state.wave, this.currentDrawCost(), this.state.meta.orderDiscount ?? 0);
    return Math.max(40, Math.round(base * (rarity === 'common' ? 0.3 : rarity === 'rare' ? 0.55 : 0.5)));
  }

  private mergeBuy(defId: string): { ok: boolean; reason?: string } {
    const s = this.state;
    const offer = this.mergeBuyOffers().find((o) => o.defId === defId);
    if (!offer) return { ok: false, reason: '합성까지 하나 남은 유닛이 아니에요.' };
    if (s.coins < offer.cost) return { ok: false, reason: `${offer.cost - s.coins}원 모자라요.` };
    s.coins -= offer.cost;
    s.stats.coinsSpent += offer.cost;
    s.stats.orders++;
    // 산 재료는 보드에 놓지 않고 합성에 바로 넣는다. 그래야 칸이 꽉 차 있어도 눌린다.
    const r = mergeUnits(s, defId, 1, 1);
    if (!r.ok) {
      s.coins += offer.cost;
      s.stats.coinsSpent -= offer.cost;
      s.stats.orders--;
      return { ok: false, reason: r.reason };
    }
    s.fx.push({ type: 'banner', text: '한 개만 더', sub: `${UNIT_BY_ID[defId].name} 합성`, style: 'good', dur: 1.6 });
    this.snapshotDirty = true;
    return { ok: true };
  }

  private sellJunk(): { ok: boolean; reason?: string } {
    const junk = this.junkUnits();
    if (junk.length === 0) return { ok: false, reason: '정리할 유닛이 없어요.' };
    let total = 0;
    for (const u of junk) {
      total += sellPrice(u, this.state.perma.sellMult);
      this.sell(u.id);
    }
    // 재고를 비운 만큼 발주 단가를 되돌린다. 환급액(40원)으로는 다시 못 짜기 때문에
    // 「버리고 원하는 계열로 다시 짠다」가 성립하지 않았다 (config.JUNK_DRAW_ROLLBACK).
    // 정리한 뒤 보드가 전문점일 때만 — 잡탕을 계속 굴리는 쪽이 이득이 되면 안 된다.
    const focused = boardFocus(this.state).weight > 1;
    const back = focused ? Math.floor(junk.length * JUNK_DRAW_ROLLBACK) : 0;
    if (back > 0) {
      const before = this.currentDrawCost();
      this.state.drawCount = Math.max(0, this.state.drawCount - back);
      const saved = before - this.currentDrawCost();
      if (saved > 0) {
        addFloater(this.state, { x: 320, y: 268, text: `전문점 · 발주 단가 -${saved}원`, color: '#7dd3fc', size: 13, life: 1.6 });
      }
    }
    addFloater(this.state, { x: 320, y: 300, text: `정리 완료 +${total}원`, color: '#fde047', size: 16, life: 1.4 });
    this.snapshotDirty = true;
    return { ok: true };
  }

  private move(unitId: number, slotIdx: number): { ok: boolean } {
    const s = this.state;
    const u = s.units.find((x) => x.id === unitId);
    const target = s.slots[slotIdx];
    if (!u || !target) return { ok: false };
    if (target.blocked || target.locked) return { ok: false };
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
    s.stats.moves++;
    sfx(s, 'click');
    // 놓는 순간 옆자리가 붙었는지 손으로 알려 준다.
    // 규칙을 글로 읽는 것보다 한 번 뜨는 게 빠르다.
    recomputeAdjacency(s);
    const adj = u.adj;
    if (adj && (adj.sameRole > 0 || adj.nearSupport)) {
      const sl = s.slots[u.slot];
      const parts: string[] = [];
      if (adj.sameRole > 0) parts.push(`공격력 +${Math.round(adj.sameRole * ADJ_SAME_ROLE * s.perma.adjMult * 100)}%`);
      if (adj.nearSupport) parts.push(`공속 +${Math.round(ADJ_NEAR_SUPPORT * s.perma.adjMult * 100)}%`);
      if (parts.length > 0) {
        addFloater(s, { x: sl.x, y: sl.y - 40, text: parts.join(' · '), color: adj.nearSupport ? '#4fe3d0' : '#ffd84d', size: 13, life: 1.3 });
        s.fx.push({ type: 'merge', slot: u.slot, rarity: 'rare', upgraded: false });
      }
    }
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
    recomputeAdjacency(this.state);
    if (!this.snapshotDirty && this.cachedSnapshot) return this.cachedSnapshot;
    const s = this.state;
    this.snapshotVersion++;
    this.snapshotDirty = false;
    const groups = groupUnits(s);
    // 고티어 통합 합성: 종류가 달라도 합칠 수 있는 티어 중 가장 높은 것 하나만 보여준다.
    // 여러 개를 동시에 띄우면 하단 패널이 버튼으로 가득 찬다.
    let tierMerge: UISnapshot['tierMerge'] = null;
    for (let t = MAX_TIER - 1; t >= MIXED_MERGE_TIER; t--) {
      if (canTierMerge(s, t as Tier)) {
        tierMerge = { tier: t as Tier, count: tierMergeCandidates(s, t as Tier).length };
        break;
      }
    }
    const boss = s.enemies.find((e) => e.isBoss && !e.dead && !e.reached);
    const sel = s.selectedUnitId !== null ? s.units.find((u) => u.id === s.selectedUnitId) : undefined;
    const emptySlots = freeSlots(s).length;
    const cost = this.currentDrawCost();
    const junk = this.junkUnits();
    this.cachedSnapshot = {
      version: this.snapshotVersion,
      phase: s.phase,
      clock: formatClock(s.wave, s.waveElapsed, s.waveDuration),
      wave: s.wave,
      waveTimer: s.waveTimer,
      prep: s.prep,
      // 준비 시간에 "이번 보스는 뭘 준비하지?" 에 답한다. 기믹을 숨기면 대기 시간이 된다.
      prepBoss: s.prep > 0 && isBossWave(s.wave + 1)
        ? (() => {
            const def = ENEMY_BY_ID[bossForWave(s.wave + 1)];
            return def ? { name: def.name, hint: def.counterHint ?? '' } : null;
          })()
        : null,
      waveDuration: s.waveDuration,
      waveTheme: s.waveTheme,
      stageName: s.stage.name,
      nextWaveTheme: isBossWave(s.wave + 1) ? 'mixed' : (s.themeSchedule[s.wave + 1] ?? 'mixed'),
      survivedSec: s.realTime,
      hp: s.hp,
      maxHp: s.maxHp,
      coins: s.coins,
      drawCost: cost,
      freeDraws: s.freeDraws,
      canDraw: s.phase === 'playing' && emptySlots > 0 && (s.freeDraws > 0 || s.coins >= cost),
      orderCost: { rare: this.orderCost('rare'), epic: this.orderCost('epic'), legendary: this.orderCost('legendary') },
      emptySlots,
      totalSlots: openSlots(s).length,
      speed: s.speed,
      paused: s.paused,
      enemyCount: s.enemies.length,
      nearCheckout: s.nearCheckout,
      nearDrain: s.nearDrain,
      bossAlive: !!boss,
      bossHp: boss?.hp ?? 0,
      bossMaxHp: boss?.maxHp ?? 0,
      bossName: boss ? ENEMY_BY_ID[boss.defId].name : '',
      groups,
      tierMerge,
      selected: sel
        ? {
            unitId: sel.id,
            defId: sel.defId,
            tier: sel.tier,
            kills: sel.kills,
            damage: Math.round(sel.damage),
            sellPrice: sellPrice(sel, s.perma.sellMult),
            pinned: !!sel.pinned,
            adjSameRole: sel.adj?.sameRole ?? 0,
            adjNearSupport: !!sel.adj?.nearSupport,
            aisle: s.geo.aisleNames[s.slots[sel.slot].row],
            aisleBonus: s.geo.aisleBonus[s.slots[sel.slot].row].label,
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
      eventChoice: s.eventChoice,
      rewardsTaken: s.rewardsTaken.length,
      perma: s.perma,
      shutterCd: s.skills.shutter,
      dumpCd: s.skills.dump,
      skillReady: { shutter: s.skills.shutter <= 0, dump: s.skills.dump <= 0 },
      combo: s.time <= s.combo.until ? s.combo.count : 0,
      bestCombo: s.combo.best,
      riskWave: s.riskWave === s.wave,
      nextIsBoss: isBossWave(s.wave + 1),
      mergeBuy: this.mergeBuyOffers(),
      focus: boardFocus(s),
      junkCount: junk.length,
      junkValue: junk.reduce((a, u) => a + sellPrice(u, s.perma.sellMult), 0),
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

// mult 는 「떨이 장사」 보상이 올린다 (판매 3배 · 시급 절반).
export function sellPrice(u: Unit, mult = 1): number {
  const def = UNIT_BY_ID[u.defId];
  return Math.round(SELL_REFUND[def.rarity] * Math.pow(2.2, u.tier - 1) * mult);
}

function groupUnits(s: GameState): UnitGroup[] {
  const map = new Map<string, UnitGroup>();
  for (const u of s.units) {
    const key = `${u.defId}|${u.tier}`;
    let g = map.get(key);
    if (!g) {
      g = { defId: u.defId, tier: u.tier, count: 0, unitIds: [], mergeable: false, pinned: true };
      map.set(key, g);
    }
    g.count++;
    // 잠기지 않은 개체를 앞에 둔다. 판매/정리가 고르는 첫 개체가 잠긴 것이면 안 된다.
    if (u.pinned) g.unitIds.push(u.id);
    else { g.unitIds.unshift(u.id); g.pinned = false; }
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

function createInitialState(seed: number, meta: MetaEffects, bestWave: number, stage: StageDef): GameState {
  const geo = buildGeometry(stage);
  const rng = createRng(seed);
  return {
    phase: 'playing',
    seed,
    rng,
    coinDrain: 0,
    nearCheckout: 0,
    nearDrain: 0,
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
    prep: 0,
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
    stage,
    geo,
    slots: geo.slots.map((p, i) => ({ index: i, x: p.x, y: p.y, row: p.row, unitId: null })),
    perma: basePerma(),
    rewardOffers: [],
    promoteChoice: null,
    eventChoice: null,
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
    revenueLost: 0,
    moves: 0,
    abilityActed: {},
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
    shelfSurplus: 0,
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

// Detect accidental truncation/corruption, not an anti-cheat signature.
function checkpointHash(raw: string): number {
  let hash = 2166136261;
  for (let i = 0; i < raw.length; i++) hash = Math.imul(hash ^ raw.charCodeAt(i), 16777619);
  return hash >>> 0;
}
