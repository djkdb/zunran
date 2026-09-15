import type { EventContext, GameState, Modifiers } from '../types';
import { EVENT_DEFS } from '../data/events';
import { EVENT_INTERVAL, EVENT_START_WAVE, isBossWave } from '../config';
import { sfx, addFloater } from './helpers';
import { spawnEnemy, knockbackAll } from './enemySystem';
import { addCoins } from './economy';

export function baseModifiers(coinGainMult: number): Modifiers {
  return {
    enemySpeed: 1,
    unitAtkSpeed: 1,
    unitDmg: 1,
    coinGain: coinGainMult,
    unitDmgById: {},
    enemySpeedById: {},
    darkness: 0,
    rain: false,
    auraMult: 1,
  };
}

// 활성 이벤트들의 배율을 매 틱 합산한다 (누적 버그 방지: 항상 기본값에서 다시 계산).
export function recomputeModifiers(state: GameState): void {
  const m = baseModifiers(state.meta.coinGainMult);
  for (const ae of state.activeEvents) {
    const def = EVENT_DEFS.find((d) => d.id === ae.defId);
    const mod = def?.modifiers;
    if (!mod) continue;
    if (mod.enemySpeed) m.enemySpeed *= mod.enemySpeed;
    if (mod.unitAtkSpeed) m.unitAtkSpeed *= mod.unitAtkSpeed;
    if (mod.unitDmg) m.unitDmg *= mod.unitDmg;
    if (mod.coinGain) m.coinGain *= mod.coinGain;
    if (mod.darkness) m.darkness = Math.max(m.darkness, mod.darkness);
    if (mod.rain) m.rain = true;
    if (mod.auraMult) m.auraMult *= mod.auraMult;
    if (mod.unitDmgById) for (const [k, v] of Object.entries(mod.unitDmgById)) m.unitDmgById[k] = (m.unitDmgById[k] ?? 1) * v;
    if (mod.enemySpeedById) for (const [k, v] of Object.entries(mod.enemySpeedById)) m.enemySpeedById[k] = (m.enemySpeedById[k] ?? 1) * v;
  }
  state.modifiers = m;
}

function makeContext(state: GameState): EventContext {
  return {
    state,
    rng: state.rng,
    spawn: (defId, count, opts) => {
      for (let i = 0; i < count; i++) {
        spawnEnemy(state, defId, { hpMult: opts?.hpMult, dist: -i * (opts?.spread ?? 1) * 22, silent: i > 0 });
      }
    },
    addCoins: (n, reason) => {
      addCoins(state, n);
      addFloater(state, { x: 320, y: 300, text: `+${n}원 ${reason ?? ''}`, color: '#fde047', size: 16, life: 1.4 });
    },
    disableRandomUnit: (dur) => {
      if (state.units.length === 0) return null;
      const u = state.rng.pick(state.units);
      u.disabledUntil = Math.max(u.disabledUntil, state.time + dur);
      const s = state.slots[u.slot];
      addFloater(state, { x: s.x, y: s.y - 32, text: '점검 중…', color: '#60a5fa', size: 12, life: 2 });
      return u.id;
    },
    knockbackAll: (px) => knockbackAll(state, px),
    freeDraw: () => {
      state.freeDraws++;
    },
    banner: (text, sub, style) => state.fx.push({ type: 'banner', text, sub, style, dur: 2 }),
  };
}

export function updateEvents(state: GameState): void {
  // 만료 처리
  const before = state.activeEvents.length;
  state.activeEvents = state.activeEvents.filter((ae) => ae.until > state.time);
  if (state.activeEvents.length !== before) recomputeModifiers(state);

  if (state.wave < EVENT_START_WAVE) return;
  if (state.time < state.nextEventAt) return;
  // 보스가 살아있거나 보스 웨이브 중이면 미룸
  if (state.bossAlive || isBossWave(state.wave)) {
    state.nextEventAt = state.time + 8;
    return;
  }
  const pool = EVENT_DEFS.filter((d) => d.minWave <= state.wave && d.id !== state.lastEventId);
  const sum = pool.reduce((s, d) => s + d.weight, 0);
  let r = state.rng.next() * sum;
  let chosen = pool[0];
  for (const d of pool) {
    r -= d.weight;
    if (r <= 0) {
      chosen = d;
      break;
    }
  }
  state.lastEventId = chosen.id;
  state.nextEventAt = state.time + state.rng.range(EVENT_INTERVAL[0], EVENT_INTERVAL[1]);
  state.stats.eventsSeen++;

  const style = chosen.mood === 'good' ? 'good' : chosen.mood === 'bad' ? 'bad' : 'info';
  state.fx.push({ type: 'banner', text: chosen.title, sub: chosen.desc, style, dur: 2.4 });
  sfx(state, 'event');
  if (chosen.apply) chosen.apply(makeContext(state));
  if (chosen.duration > 0) {
    state.activeEvents.push({ defId: chosen.id, until: state.time + chosen.duration, title: chosen.title, mood: chosen.mood });
    recomputeModifiers(state);
  }
}
