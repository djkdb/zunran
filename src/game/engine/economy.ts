import type { Enemy, GameState, Unit } from '../types';
import { ENEMY_BY_ID } from '../data/enemies';
import { enemyBountyScale, COMBO_WINDOW, COMBO_STEP } from '../config';
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

// 연쇄 처치: 짧은 간격으로 이어 잡으면 콤보가 쌓이고 5연쇄마다 보너스 코인이 터진다.
function bumpCombo(state: GameState, x: number, y: number): void {
  const c = state.combo;
  c.count = state.time <= c.until ? c.count + 1 : 1;
  c.until = state.time + COMBO_WINDOW;
  if (c.count > c.best) {
    c.best = c.count;
    state.stats.bestCombo = Math.max(state.stats.bestCombo, c.count);
  }
  if (c.count > 0 && c.count % COMBO_STEP === 0) {
    // 연쇄가 길어져도 보너스는 4배에서 멈춘다 (후반에 코인이 폭주하지 않게)
    const step = Math.min(4, c.count / COMBO_STEP);
    const bonus = Math.round((18 + state.wave * 5) * step * state.modifiers.coinGain * state.perma.coin);
    addCoins(state, bonus);
    addFloater(state, { x, y: y - 34, text: `${c.count} 연속! +${bonus}원`, color: '#ffd23f', size: 15, life: 1.3 });
    // 짧은 히트스톱으로 연쇄가 터지는 순간을 찍어준다. 5연쇄마다라 아껴 쓰는 셈이다.
    state.hitstop = Math.max(state.hitstop, 0.07);
    sfx(state, 'waveClear');
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
    if (d.aura?.kind !== 'coin' || u.disabledUntil > state.time) continue;
    const s = state.slots[u.slot];
    const r = auraRadius(d, u.tier);
    if (dist2(s.x, s.y, e.x, e.y) <= r * r) coinAura = Math.max(coinAura, auraValue(state, d, u.tier));
  }
  let bounty = def.bounty * enemyBountyScale(e.spawnedWave) * state.modifiers.coinGain * state.perma.coin * (1 + coinAura) + bonusCoin;
  if (state.riskWave === e.spawnedWave) bounty *= 2; // "새벽 장사" 도박 보상
  if (def.bagCost) {
    bounty -= def.bagCost;
    addFloater(state, { x: e.x, y: e.y - 26, text: `봉투값 ${def.bagCost}원 주세요`, color: '#fca5a5', size: 11, life: 1.3 });
  }
  addCoins(state, bounty, e.x, e.y - 10);
  bumpCombo(state, e.x, e.y);
  state.stats.kills++;
  if (e.isBoss) state.stats.bossKills++;
  if (killer) {
    killer.kills++;
    state.stats.unitKills[killer.defId] = (state.stats.unitKills[killer.defId] ?? 0) + 1;
  }
  sfx(state, 'coin');
}
