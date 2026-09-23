import type { RNG } from '../types';

// mulberry32: 작고 빠른 시드 RNG. 시드가 같으면 같은 결과 → 시뮬레이션 재현 가능.
export function createRng(seed: number): RNG {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    getState: () => a,
    next,
    range: (min, max) => min + next() * (max - min),
    int: (min, max) => Math.floor(min + next() * (max - min + 1)),
    pick: (arr) => arr[Math.floor(next() * arr.length)],
    chance: (p) => next() < p,
  };
}

export function randomSeed(): number {
  return (Math.random() * 0xffffffff) >>> 0;
}
