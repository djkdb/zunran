import type { FxEvent, GameAction, GameState, MetaEffects, Rarity, Tier, UISnapshot, UnitGroup, Unit } from '../types';
import { BASE_RARITY_ODDS, SELL_REFUND, SLOT_POSITIONS, MAX_TIER, drawCost, formatClock, EVENT_INTERVAL, isBossWave, AISLE_NAMES, AISLE_BONUS } from '../config';
import { UNIT_BY_ID, unitsOfRarity } from '../data/units';
import { basePerma, chooseReward } from './rewardSystem';
import { useSkill, tickSkills } from './skillSystem';
import { ENEMY_BY_ID } from '../data/enemies';
import { DRAW_LINES } from '../data/dialogue';
import { createRng, randomSeed } from './rng';
import { updateEnemies } from './enemySystem';
import { updateUnits } from './unitSystem';
import { updateWave, startWave } from './waveSystem';
import { updateEvents, baseModifiers, recomputeModifiers } from './eventSystem';
import { mergeUnits, canMerge, announceLegendary } from './mergeSystem';
import { createUnit } from './unitFactory';
import { spendCoins, addCoins } from './economy';
import { sfx, addFloater, unitDef } from './helpers';
import { metaEffects } from '../save/meta';
import { DEFAULT_META_LEVELS } from '../save/meta';

export interface EngineOptions {
  seed?: number;
  meta?: MetaEffects;
  bestWave?: number;
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
    startWave(this.state, 1);
    this.state.fx.length = 0; // 첫 웨이브 배너는 UI 가 별도로 처리
  }

  // dtReal: 실제 경과 초. 고정 스텝으로 잘라서 진행 (프레임 드랍 시에도 결정론 유지).
  tick(dtReal: number): void {
    const s = this.state;
    if (s.phase !== 'playing' || s.paused) return;
    const dt = Math.min(dtReal, 0.25);
    s.realTime += dt;
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
      case 'MERGE': {
        if (s.phase !== 'playing') return { ok: false };
        const r = mergeUnits(s, action.defId, action.tier);
        return { ok: r.ok, reason: r.reason };
      }
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
    const rare = BASE_RARITY_ODDS.rare + m.rareBonus;
    const epic = BASE_RARITY_ODDS.epic + m.epicBonus;
    const legendary = BASE_RARITY_ODDS.legendary + m.legendaryBonus + this.state.perma.legendaryOdds;
    return { common: Math.max(0, 1 - rare - epic - legendary), rare, epic, legendary };
  }

  currentDrawCost(): number {
    return drawCost(this.state.drawCount, this.state.meta.drawCostReduce + this.state.perma.drawDiscount);
  }

  private draw(): { ok: boolean; reason?: string } {
    const s = this.state;
    if (s.phase !== 'playing') return { ok: false };
    const emptySlots = s.slots.filter((sl) => sl.unitId === null);
    if (emptySlots.length === 0) return { ok: false, reason: '빈 칸이 없어요. 합성하거나 판매하세요.' };
    const cost = this.currentDrawCost();
    if (s.freeDraws > 0) {
      s.freeDraws--;
    } else if (!spendCoins(s, cost)) {
      return { ok: false, reason: '코인이 부족해요.' };
    }
    s.drawCount++;
    s.stats.draws++;

    const odds = this.rarityOdds();
    const r = s.rng.next();
    let rarity: Rarity = 'common';
    let acc = odds.legendary;
    if (r < acc) rarity = 'legendary';
    else if (r < (acc += odds.epic)) rarity = 'epic';
    else if (r < (acc += odds.rare)) rarity = 'rare';
    const def = s.rng.pick(unitsOfRarity(rarity));
    const slot = s.rng.pick(emptySlots);
    const unit = createUnit(s, def.id, 1, slot.index);
    s.units.push(unit);
    slot.unitId = unit.id;
    s.stats.drawsByRarity[rarity]++;
    if (!s.stats.seenUnits.includes(def.id)) s.stats.seenUnits.push(def.id);
    s.lastDrawResult = { defId: def.id, rarity, at: s.time };
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
    const emptySlots = s.slots.filter((sl) => sl.unitId === null).length;
    const cost = this.currentDrawCost();
    const junk = this.junkUnits();
    this.cachedSnapshot = {
      version: this.snapshotVersion,
      phase: s.phase,
      clock: formatClock(s.wave, s.waveElapsed, s.waveDuration),
      wave: s.wave,
      waveTimer: s.waveTimer,
      waveDuration: s.waveDuration,
      survivedSec: s.realTime,
      hp: s.hp,
      maxHp: s.maxHp,
      coins: s.coins,
      drawCost: cost,
      freeDraws: s.freeDraws,
      canDraw: s.phase === 'playing' && emptySlots > 0 && (s.freeDraws > 0 || s.coins >= cost),
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

  mvpUnit(): { defId: string; damage: number } | null {
    const entries = Object.entries(this.state.stats.unitDamage);
    if (entries.length === 0) return null;
    entries.sort((a, b) => b[1] - a[1]);
    return { defId: entries[0][0], damage: Math.round(entries[0][1]) };
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
    freeDraws: meta.freeDraws,
    wave: 0,
    waveTimer: 0,
    waveDuration: 1,
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
    },
    fx: [],
    floaters: [],
    shake: 0,
    nextId: 1,
    meta,
    threeAmTriggered: false,
    lowHpWarned: false,
    disabledUnitNotice: 0,
  };
}

export { recomputeModifiers };
