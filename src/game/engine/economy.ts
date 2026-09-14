import type { Enemy, GameState, Unit } from '../types';
import { ENEMY_BY_ID } from '../data/enemies';
import { enemyBountyScale } from '../config';
import { addFloater, sfx, unitDef, auraRadius, auraValue, dist2 } from './helpers';

export function addCoins(state: GameState, n: number, x?: number, y?: number, label?: string): void {
  const amount = Math.round(n);
  if (amount === 0) return;
  state.coins = Math.max(0, state.coins + amount);
  if (amount > 0) state.stats.coinsEarned += amount;
  if (x !== undefined && y !== undefined) {
    addFloater(state, {
      x,
      y,
      text: `${amount > 0 ? '+' : ''}${amount}원${label ? ' ' + label : ''}`,
      color: amount > 0 ? '#fde047' : '#f87171',
      size: 12,
      life: 0.9,
    });
  }
}

export function spendCoins(state: GameState, n: number): boolean {
  if (state.coins < n) return false;
  state.coins -= n;
  state.stats.coinsSpent += n;
  return true;
}

// 손님 처치 보상. 택배 접수기 코인 오라가 위치 기준으로 적용된다.
export function rewardKill(state: GameState, e: Enemy, killer: Unit | null, bonusCoin: number): void {
  const def = ENEMY_BY_ID[e.defId];
  let coinAura = 0;
  for (const u of state.units) {
    const d = unitDef(u);
    if (d.aura?.kind !== 'coin') continue;
    const s = state.slots[u.slot];
    const r = auraRadius(d, u.tier);
    if (dist2(s.x, s.y, e.x, e.y) <= r * r) coinAura = Math.max(coinAura, auraValue(d, u.tier));
  }
  let bounty = def.bounty * enemyBountyScale(e.spawnedWave) * state.modifiers.coinGain * (1 + coinAura) + bonusCoin;
  if (def.bagCost) {
    bounty -= def.bagCost;
    addFloater(state, { x: e.x, y: e.y - 26, text: `봉투값 ${def.bagCost}원 주세요`, color: '#fca5a5', size: 11, life: 1.3 });
  }
  addCoins(state, bounty, e.x, e.y - 10);
  state.stats.kills++;
  if (e.isBoss) state.stats.bossKills++;
  if (killer) {
    killer.kills++;
    state.stats.unitKills[killer.defId] = (state.stats.unitKills[killer.defId] ?? 0) + 1;
  }
  sfx(state, 'coin');
}
