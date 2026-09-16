import { createRng } from './engine/rng';
import { DAILY_CHALLENGES } from './data/dailyChallenges';
import { MISSIONS, MISSION_EXTRAS, type MissionContext, type MissionDef } from './data/missions';
import type { ChallengeSpec } from './types';

// 같은 날짜면 누구나 같은 미션·규칙을 받는다. 기존 seed RNG 를 그대로 쓴다.
export function dateKey(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function dailySeed(key: string): number {
  // FNV-1a — 문자열을 32비트로 섞는다
  let h = 2166136261 >>> 0;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

export interface DailyMission {
  id: string;
  goal: string;
  extra: string | null;
  reward: number;
  check: (c: MissionContext) => boolean;
}

export interface DailySet {
  date: string;
  seed: number;
  challenge: ChallengeSpec;
  mission: DailyMission;
}

function buildMission(rng: ReturnType<typeof createRng>): DailyMission {
  const main: MissionDef = rng.pick(MISSIONS);
  // 절반 확률로 추가 조건이 붙는다
  const extra = rng.next() < 0.55 ? rng.pick(MISSION_EXTRAS) : null;
  return {
    id: extra ? `${main.id}+${extra.id}` : main.id,
    goal: main.goal,
    extra: extra?.extra ?? null,
    reward: main.reward + (extra?.reward ?? 0),
    check: (c) => main.check(c) && (extra ? extra.check(c) : true),
  };
}

const cache = new Map<string, DailySet>();

export function getDaily(date: Date = new Date()): DailySet {
  const key = dateKey(date);
  const hit = cache.get(key);
  if (hit) return hit;
  const seed = dailySeed(key);
  // 미션과 규칙이 같은 흐름을 쓰지 않도록 seed 를 분리한다
  const challenge = createRng(seed ^ 0x9e3779b9).pick(DAILY_CHALLENGES);
  const mission = buildMission(createRng(seed));
  const set: DailySet = { date: key, seed, challenge, mission };
  cache.set(key, set);
  return set;
}

// 자정까지 남은 시간 (시작 화면 카운트다운용)
export function msUntilMidnight(now: Date = new Date()): number {
  const next = new Date(now);
  next.setHours(24, 0, 0, 0);
  return next.getTime() - now.getTime();
}
