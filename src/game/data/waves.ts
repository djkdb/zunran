import type { RNG, SpawnEntry } from '../types';
import { ENEMY_DEFS, bossForWave } from './enemies';
import { BOSS_WAVE_DURATION, waveDuration, THREE_AM_WAVE, isBossWave } from '../config';

// 웨이브 테마. 예전에는 손님 구성이 가중 랜덤이라 웨이브 25와 28이 체감상 똑같고
// 숫자만 컸다 (docs/AUDIT.md 6절). 각 웨이브가 '무엇을 시험하는가'를 정하고 미리 알려준다.
// 예고가 있어야 대비할 수 있고, 대비할 수 있어야 판단이 생긴다.
export type WaveTheme = 'mixed' | 'fast' | 'swarm' | 'armor';

export const THEME_INFO: Record<WaveTheme, { label: string; hint: string }> = {
  mixed: { label: '평범한 밤', hint: '여러 손님이 섞여 온다' },
  fast: { label: '급한 손님들', hint: '빠르다 · 감속과 사거리가 필요하다' },
  swarm: { label: '단체 손님', hint: '뭉칠수록 빨라진다 · 범위 공격이 필요하다' },
  armor: { label: '두꺼운 손님들', hint: '잔매가 안 통한다 · 한 방이 큰 공격이 필요하다' },
};

// 테마 배정표를 판 시작 때 한 번 만든다.
// 고정 순환으로 돌려봤더니 모든 판이 같은 순서의 같은 문제를 내서
// 생존 웨이브 표준편차가 1.1까지 떨어졌다 — 판마다 다른 밤이 되어야 한다.
// 6웨이브를 한 블록으로 묶어 블록 안에서만 섞는다. 그래서 테마는 고르게 나오되
// 어느 웨이브에 무엇이 오는지는 판마다 다르다.
const THEME_BLOCK: WaveTheme[] = ['fast', 'mixed', 'armor', 'mixed', 'swarm', 'mixed'];

export function buildThemeSchedule(rng: RNG, upto = 80): WaveTheme[] {
  const out: WaveTheme[] = ['mixed', 'mixed', 'mixed', 'mixed']; // index 0 은 안 쓰고 w1~3 은 학습 구간
  for (let w = 4; w <= upto; w += THEME_BLOCK.length) {
    const block = [...THEME_BLOCK];
    for (let i = block.length - 1; i > 0; i--) {
      const j = rng.int(0, i);
      [block[i], block[j]] = [block[j], block[i]];
    }
    for (let k = 0; k < block.length; k++) {
      let t = block[k];
      // 테마는 '답'을 구할 수 있게 된 뒤에 낸다. 직접 해 보니 웨이브 6의 장갑 테마에서
      // 체력이 92 → 62 로 날아갔다. 그 시점엔 유닛이 8개 남짓 전부 1티어라
      // "한 방이 큰 공격"이라는 답을 가질 방법이 없었다. 예고해도 답이 없으면 예고가 아니다.
      if (t === 'swarm' && w + k < 8) t = 'fast'; // 단체 손님 해금 전
      if (t === 'armor' && w + k < 9) t = 'mixed'; // 포스기·핫바 같은 고화력 유닛을 갖기 전
      out[w + k] = t;
    }
  }
  return out;
}

export interface WavePlan {
  entries: SpawnEntry[];
  duration: number;
  boss?: string;
  script?: 'threeAm';
  theme: WaveTheme;
}

// 웨이브 번호로 스폰 계획을 만든다. 순수 함수 (RNG 만 사용) → 시뮬레이션 재현 가능.
export function buildWave(wave: number, rng: RNG, countMult = 1, themeOf: WaveTheme = 'mixed'): WavePlan {
  const entries: SpawnEntry[] = [];
  const boss = isBossWave(wave) ? bossForWave(wave) : undefined;
  const theme = boss ? 'mixed' : themeOf;
  const duration = boss ? BOSS_WAVE_DURATION : waveDuration(wave);
  let groupSeq = wave * 1000;

  // 초반 3웨이브는 학습용: 아주 쉽게.
  if (wave === 1) {
    for (let i = 0; i < 4; i++) entries.push({ at: 1.5 + i * 2.4, defId: 'basic', count: 1 });
    return { entries, duration, theme };
  }
  if (wave === 2) {
    for (let i = 0; i < 6; i++) entries.push({ at: 1 + i * 2, defId: 'basic', count: 1 });
    // 뛰는 손님 등장: 여기서 한두 대 맞아 보는 게 "계산대에 닿으면 깎인다"를 가르친다
    entries.push({ at: 4, defId: 'runner', count: 1 });
    entries.push({ at: 9.5, defId: 'runner', count: 1 });
    return { entries, duration, theme };
  }
  if (wave === 3) {
    for (let i = 0; i < 6; i++) entries.push({ at: 1 + i * 1.9, defId: 'basic', count: 1 });
    entries.push({ at: 5, defId: 'cig', count: 1 });
    entries.push({ at: 8, defId: 'runner', count: 2 });
    entries.push({ at: 11, defId: 'cig', count: 1 });
    return { entries, duration, theme };
  }

  // 총 개체 수. 1.8w 로 두었더니 웨이브 12까지 체력이 97~100에서 움직이지 않았다 —
  // 첫 4분이 "잃을 것도 없는" 시간이 된다 (docs/AUDIT.md 문제 1·6절).
  // 2.3w 로 올려 초반부터 실제로 손님이 밀려오게 한다.
  let total = Math.round((4 + 2.3 * Math.min(wave, 40) + Math.max(0, wave - 40) * 1) * countMult);
  // 보스 웨이브 손님 수를 0.55배로 줄였더니 보스전이 오히려 쉬는 시간이 됐다 (docs/AUDIT.md 8절).
  // 빠른 손님은 개체가 약하다(담배 18, 뛰는 42). 수로 압박해야 테마가 산다.
  if (theme === 'fast') total = Math.round(total * 1.3);
  else if (theme !== 'mixed') total = Math.round(total * 1.15);
  if (boss) total = Math.round(total * 0.8);
  total = Math.max(3, total);

  const pool = ENEMY_DEFS.filter((e) => e.minWave <= wave && e.weight > 0 && !e.tags.includes('boss'));
  // 후반부 좀비 가중치 상승, 기본 손님 가중치 하락
  const weighted = pool.map((e) => {
    let w = e.weight;
    if (e.id === 'basic') w = Math.max(3, 10 - wave * 0.2);
    if (e.id === 'zombie') w = 3 + Math.max(0, wave - 22) * 0.3;
    if (e.id === 'karen3am') w = wave >= 25 ? 2 : 1;
    // 테마에 맞는 손님을 몰아준다. 웨이브가 하나의 문제를 내도록.
    // ×6 으로 두었더니 "무리 웨이브인데 무리만 40명" 같은 극단이 나와
    // 대응 못 한 판이 한 웨이브에 반 토막 났다. ×4 면 테마는 읽히고 극단은 준다.
    // 'fast' 태그는 느슨하게 붙어 있다 — 화장실 손님(70)·야자 고딩(78)은
    // 기본 손님(55)보다 조금 빠를 뿐인데 태그가 있어서 '급한 손님들' 테마가
    // 웨이브당 -1.09 HP 로 무해해졌다. 태그가 아니라 실제 속도로 고른다.
    if (theme === 'fast' && e.speed >= 100) w *= 4;
    if (theme === 'swarm' && e.swarm) w *= 4;
    if (theme === 'armor' && e.armor) w *= 4;
    // 가중치는 '뽑히는 횟수'인데 총량(total)은 머릿수다.
    // 묶음으로 나오는 손님은 한 번 뽑힐 때 5~6명이 들어오므로, 보정하지 않으면
    // 가중치 3짜리 단체 손님이 머릿수의 17.7% 를 먹는다 (기본 손님은 5.9%).
    // 어느 밤이든 사실상 단체 손님 웨이브가 된다. 묶음 크기로 나눠 균형을 맞춘다.
    if (e.groupSize) w /= (e.groupSize[0] + e.groupSize[1]) / 2;
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
  return { entries, duration, boss, script, theme };
}
