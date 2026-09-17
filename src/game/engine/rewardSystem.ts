import type { GameState, PermaBuffs, Rarity, RewardContext, RewardOffer, Tier } from '../types';
import { REWARD_CARDS, REWARD_BY_ID } from '../data/rewards';
import { unitsOfRarity } from '../data/units';
import { MAX_TIER } from '../config';
import { createUnit } from './unitFactory';
import { addCoins } from './economy';
import { sfx, addFloater } from './helpers';
import { recomputeModifiers } from './eventSystem';

export function basePerma(): PermaBuffs {
  return {
    dmg: 1,
    atkSpeed: 1,
    range: 0,
    coin: 1,
    drawDiscount: 0,
    roleDmg: { dps: 1, aoe: 1, support: 1, control: 1 },
    critChance: 0,
    auraMult: 1,
    legendaryOdds: 0,
    orderDiscount: 0,
    incomeMult: 1,
    aisleMult: 1,
    skillCdMult: 1,
    slowMult: 1,
  };
}

// 이미 고른 카드는 가중치를 낮춰서 같은 카드만 반복해 나오지 않게 한다.
export function rollOffers(state: GameState, count = 3): RewardOffer[] {
  const pool = REWARD_CARDS.filter(
    (c) => (c.minWave ?? 0) <= state.wave && (c.available ? c.available(state) : true),
  );
  const picked: RewardOffer[] = [];
  const used = new Set<string>();
  for (let i = 0; i < count && picked.length < pool.length; i++) {
    // 3택에는 '플레이 방식이 바뀌는' 카드가 최소 한 장 들어간다.
    // 예전에는 19장이 사실상 전부 숫자 증가라, 세 장을 봐도 고민할 게 없었다.
    const needBuild = i === count - 1 && !picked.some((p) => p.kind === 'build');
    const candidates = pool.filter((c) => !used.has(c.id) && (!needBuild || c.kind === 'build'));
    if (candidates.length === 0) break;
    const weights = candidates.map((c) => {
      const taken = state.rewardsTaken.filter((t) => t === c.id).length;
      return Math.max(0.6, c.weight * Math.pow(0.45, taken));
    });
    const sum = weights.reduce((a, b) => a + b, 0);
    let r = state.rng.next() * sum;
    let chosen = candidates[candidates.length - 1];
    for (let k = 0; k < candidates.length; k++) {
      r -= weights[k];
      if (r <= 0) {
        chosen = candidates[k];
        break;
      }
    }
    used.add(chosen.id);
    picked.push({ defId: chosen.id, name: chosen.name, desc: chosen.desc, icon: chosen.icon, tone: chosen.tone, kind: chosen.kind });
  }
  return picked;
}

export function openRewardChoice(state: GameState): void {
  const offers = rollOffers(state);
  if (offers.length === 0) return;
  state.rewardOffers = offers;
  state.phase = 'reward';
  sfx(state, 'waveClear');
}

export function chooseReward(state: GameState, defId: string): boolean {
  if (state.phase !== 'reward') return false;
  if (!state.rewardOffers.some((o) => o.defId === defId)) return false;
  const def = REWARD_BY_ID[defId];
  if (!def) return false;

  def.apply(makeContext(state));
  state.rewardsTaken.push(defId);
  state.rewardOffers = [];
  state.phase = 'playing';
  recomputeModifiers(state);
  state.fx.push({ type: 'flash', color: def.tone === 'best' ? '#ffd23f' : '#f4f1ea' });
  sfx(state, def.tone === 'best' ? 'legendary' : 'mergeUp');
  return true;
}

function makeContext(state: GameState): RewardContext {
  return {
    state,
    rng: state.rng,
    addCoins: (n) => addCoins(state, n),
    grantUnit: (rarity: Rarity) => {
      const slot = state.slots.find((s) => s.unitId === null);
      if (!slot) return null;
      const pool = unitsOfRarity(rarity);
      if (pool.length === 0) return null;
      const def = state.rng.pick(pool);
      const unit = createUnit(state, def.id, 1, slot.index);
      state.units.push(unit);
      slot.unitId = unit.id;
      if (!state.stats.seenUnits.includes(def.id)) state.stats.seenUnits.push(def.id);
      state.fx.push({ type: 'unitSpawn', unitId: unit.id, rarity });
      return def.id;
    },
    upgradeRandomUnit: () => {
      const candidates = state.units.filter((u) => u.tier < MAX_TIER);
      if (candidates.length === 0) return null;
      // 가장 활약한 유닛을 올려준다 (아무거나 올리는 것보다 체감이 크다)
      candidates.sort((a, b) => b.damage - a.damage);
      const top = candidates.slice(0, Math.max(1, Math.ceil(candidates.length / 3)));
      const u = state.rng.pick(top);
      u.tier = (u.tier + 1) as Tier;
      state.stats.maxTierReached = Math.max(state.stats.maxTierReached, u.tier);
      const s = state.slots[u.slot];
      state.fx.push({ type: 'merge', slot: u.slot, rarity: 'legendary', upgraded: true });
      addFloater(state, { x: s.x, y: s.y - 34, text: '티어 상승!', color: '#ffd23f', size: 14, life: 1.4 });
      return u.defId;
    },
    banner: (text, sub) => state.fx.push({ type: 'banner', text, sub, style: 'good', dur: 2 }),
  };
}
