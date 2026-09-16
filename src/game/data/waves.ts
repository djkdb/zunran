import type { RNG, SpawnEntry } from '../types';
import { ENEMY_DEFS, bossForWave } from './enemies';
import { BOSS_WAVE_DURATION, waveDuration, THREE_AM_WAVE, isBossWave } from '../config';

export interface WavePlan {
  entries: SpawnEntry[];
  duration: number;
  boss?: string;
  script?: 'threeAm';
}

// 웨이브 번호로 스폰 계획을 만든다. 순수 함수 (RNG 만 사용) → 시뮬레이션 재현 가능.
export function buildWave(wave: number, rng: RNG): WavePlan {
  const entries: SpawnEntry[] = [];
  const boss = isBossWave(wave) ? bossForWave(wave) : undefined;
  const duration = boss ? BOSS_WAVE_DURATION : waveDuration(wave);
  let groupSeq = wave * 1000;

  // 초반 3웨이브는 학습용: 아주 쉽게.
  if (wave === 1) {
    for (let i = 0; i < 4; i++) entries.push({ at: 1.5 + i * 2.4, defId: 'basic', count: 1 });
    return { entries, duration };
  }
  if (wave === 2) {
    for (let i = 0; i < 6; i++) entries.push({ at: 1 + i * 2, defId: 'basic', count: 1 });
    // 뛰는 손님 등장: 여기서 한두 대 맞아 보는 게 "계산대에 닿으면 깎인다"를 가르친다
    entries.push({ at: 4, defId: 'runner', count: 1 });
    entries.push({ at: 9.5, defId: 'runner', count: 1 });
    return { entries, duration };
  }
  if (wave === 3) {
    for (let i = 0; i < 6; i++) entries.push({ at: 1 + i * 1.9, defId: 'basic', count: 1 });
    entries.push({ at: 5, defId: 'cig', count: 1 });
    entries.push({ at: 8, defId: 'runner', count: 2 });
    entries.push({ at: 11, defId: 'cig', count: 1 });
    return { entries, duration };
  }

  // 총 개체 수: 4 + 1.4w (40웨이브 이후 완만하게)
  let total = Math.round(4 + 1.8 * Math.min(wave, 40) + Math.max(0, wave - 40) * 0.8);
  if (boss) total = Math.round(total * 0.55);

  const pool = ENEMY_DEFS.filter((e) => e.minWave <= wave && e.weight > 0 && !e.tags.includes('boss'));
  // 후반부 좀비 가중치 상승, 기본 손님 가중치 하락
  const weighted = pool.map((e) => {
    let w = e.weight;
    if (e.id === 'basic') w = Math.max(3, 10 - wave * 0.2);
    if (e.id === 'zombie') w = 3 + Math.max(0, wave - 22) * 0.3;
    if (e.id === 'karen3am') w = wave >= 25 ? 2 : 1;
    return { def: e, w };
  });
  const sumW = weighted.reduce((s, x) => s + x.w, 0);

  const spawnWindow = duration * 0.72;
  let placed = 0;
  let guard = 0;
  while (placed < total && guard++ < 500) {
    let r = rng.next() * sumW;
    let def = weighted[0].def;
    for (const x of weighted) {
      r -= x.w;
      if (r <= 0) {
        def = x.def;
        break;
      }
    }
    // 진상은 웨이브당 최대 1명 (25 이후 2명)
    if (def.id === 'karen3am') {
      const already = entries.filter((e) => e.defId === 'karen3am').length;
      if (already >= (wave >= 25 ? 2 : 1)) continue;
    }
    const at = rng.range(0.5, spawnWindow);
    if (def.groupSize) {
      const n = rng.int(def.groupSize[0], def.groupSize[1]);
      const gid = def.id === 'drunkSquad' ? ++groupSeq : undefined;
      entries.push({ at, defId: def.id, count: n, groupId: gid });
      placed += n;
    } else {
      entries.push({ at, defId: def.id, count: 1 });
      placed += 1;
    }
  }

  // 스크립트 웨이브
  let script: WavePlan['script'];
  if (wave === THREE_AM_WAVE) {
    script = 'threeAm';
    // 새벽 3시 러시: 24명이 7초 안에 몰려온다 + 진상. 이 게임의 시그니처 순간이라 실제로 아파야 한다.
    for (let i = 0; i < 24; i++) entries.push({ at: 2 + i * 0.3, defId: 'basic', count: 1, hpMult: 0.9 });
    entries.push({ at: 5, defId: 'cig', count: 4 });
    if (!entries.some((e) => e.defId === 'karen3am')) entries.push({ at: 10, defId: 'karen3am', count: 1 });
  }
  if (wave === 18 || wave === 25 || wave === 33) {
    if (!entries.some((e) => e.defId === 'karen3am')) entries.push({ at: 8, defId: 'karen3am', count: 1 });
  }

  if (boss) {
    entries.push({ at: 3, defId: boss, count: 1 });
    // 보스 웨이브 후반부에 소규모 후속 무리
    entries.push({ at: duration * 0.6, defId: wave >= 22 ? 'zombie' : 'basic', count: wave >= 22 ? 2 : 4 });
  }

  entries.sort((a, b) => a.at - b.at);
  return { entries, duration, boss, script };
}
