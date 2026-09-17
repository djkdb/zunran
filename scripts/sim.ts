// 헤드리스 밸런스 시뮬레이터. 자동 플레이어가 뽑기/합성을 수행하며 몇 웨이브까지 버티는지 측정.
// 실행: npm run sim -- [runs] [strategy]
import { Engine } from '../src/game/engine/Engine';
import { UNIT_BY_ID } from '../src/game/data/units';
import { metaEffects, DEFAULT_META_LEVELS } from '../src/game/save/meta';
import type { MetaUpgradeId } from '../src/game/types';
import { CHALLENGE_BY_ID } from '../src/game/data/dailyChallenges';
import { normalizeOrder } from '../src/game/data/deck';
import { recipeStatus } from '../src/game/data/recipes';
import { unlockedUnits } from '../src/game/data/unlocks';
import { sellCandidate } from '../src/ui/useGame';

type Strategy = 'greedy' | 'saver' | 'noMerge' | 'sellCommons' | 'autoClean';

const TONE_RANK = { best: 2, good: 1, normal: 0 } as const;

function autoPlay(engine: Engine, strategy: Strategy): void {
  const s = engine.state;
  // 보상 선택: 등급이 높은 카드를 고른다 (사람이 흔히 하는 선택)
  if (s.phase === 'reward' && s.rewardOffers.length > 0) {
    const best = [...s.rewardOffers].sort((a, b) => TONE_RANK[b.tone] - TONE_RANK[a.tone])[0];
    engine.dispatch({ type: 'CHOOSE_REWARD', defId: best.defId });
    return;
  }
  const snap = engine.snapshot();
  // 긴급 스킬: 손님이 몰렸을 때만
  if (snap.skillReady.shutter && snap.enemyCount >= 14) engine.dispatch({ type: 'USE_SKILL', skill: 'shutter' });
  if (snap.skillReady.dump && snap.enemyCount >= 20) engine.dispatch({ type: 'USE_SKILL', skill: 'dump' });
  // 조합: 완성됐으면 바로 만든다 (사람도 그렇게 한다)
  for (const r of recipeStatus(snap.groups)) {
    if (!r.ready) break;
    engine.dispatch({ type: 'COMBINE', recipeId: r.def.id });
  }
  // 합성: 가능한 그룹 전부
  if (strategy !== 'noMerge') {
    for (const g of snap.groups) {
      if (g.mergeable) engine.dispatch({ type: 'MERGE', defId: g.defId, tier: g.tier });
    }
  }
  // autoClean: 게임 기본값과 같은 동작 — 칸이 다 찼고 합성할 게 없으면 짝 없는 1티어를 하나 정리
  if (strategy === 'autoClean' && snap.emptySlots === 0) {
    const target = sellCandidate(snap.groups);
    if (target !== null) engine.dispatch({ type: 'SELL', unitId: target });
  }
  // 슬롯이 꽉 찼고 합성 불가면 가장 약한 일반 유닛 판매
  if (strategy === 'sellCommons' && snap.emptySlots === 0 && snap.coins >= snap.drawCost) {
    // 사람이 하는 방식: 합성 재료가 안 되는 티어1 유닛 중 가장 희귀도 낮고 활약 적은 것 판매
    const rank: Record<string, number> = { common: 0, rare: 1, epic: 2, special: 3, legendary: 4 };
    const counts = new Map<string, number>();
    for (const u of s.units) counts.set(`${u.defId}|${u.tier}`, (counts.get(`${u.defId}|${u.tier}`) ?? 0) + 1);
    const candidates = s.units
      .filter((u) => u.tier === 1 && (counts.get(`${u.defId}|1`) ?? 0) < 2 && rank[UNIT_BY_ID[u.defId].rarity] <= 1)
      .sort((a, b) => rank[UNIT_BY_ID[a.defId].rarity] - rank[UNIT_BY_ID[b.defId].rarity] || a.damage - b.damage);
    if (candidates[0]) engine.dispatch({ type: 'SELL', unitId: candidates[0].id });
  }
  const reserve = strategy === 'saver' ? 200 : 0;
  let guard = 0;
  while (guard++ < 10) {
    const sn = engine.snapshot();
    if (!sn.canDraw || (sn.freeDraws === 0 && sn.coins - sn.drawCost < reserve)) break;
    engine.dispatch({ type: 'DRAW' });
  }
}

// 시드로 섞는다 (Math.random 을 쓰면 재현이 깨진다)
function shuffle(arr: string[], seed: number): string[] {
  const out = [...arr];
  let x = seed || 1;
  for (let i = out.length - 1; i > 0; i--) {
    x = (x * 1664525 + 1013904223) >>> 0;
    const j = x % (i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function runOnce(seed: number, strategy: Strategy, maxWave = 60, metaLevel = 0, challengeId?: string, useDeck = false) {
  const levels = { ...DEFAULT_META_LEVELS } as Record<MetaUpgradeId, number>;
  for (const k of Object.keys(levels) as MetaUpgradeId[]) levels[k] = metaLevel;
  // 발주는 시드마다 다르게 해서 "특정 발주가 유리한가"가 아니라 "발주 자체"의 효과를 본다
  const pool = unlockedUnits(999);
  const sh = shuffle(pool, seed);
  const order = useDeck ? normalizeOrder({ pins: sh.slice(0, 2), bans: sh.slice(2, 4) }, pool) : undefined;
  const engine = new Engine({ seed, meta: metaEffects(levels), order, challenge: challengeId ? (CHALLENGE_BY_ID[challengeId] ?? null) : null });
  let t = 0;
  const waveHp: number[] = [];
  let lastWave = 0;
  while (engine.state.phase !== 'gameover' && engine.state.wave <= maxWave && t < 60 * 60) {
    engine.tick(0.1);
    engine.drainFx();
    t += 0.1;
    if (engine.state.phase === 'reward' || Math.round(t * 10) % 5 === 0) autoPlay(engine, strategy);
    if (engine.state.wave !== lastWave) {
      lastWave = engine.state.wave;
      waveHp.push(engine.state.hp);
    }
  }
  const s = engine.state;
  const mvp = engine.mvpUnit();
  return {
    seed,
    wave: s.wave,
    time: Math.round(s.realTime),
    hp: s.hp,
    kills: s.stats.kills,
    draws: s.stats.draws,
    merges: s.stats.merges,
    recipes: s.stats.recipesMade,
    maxTier: s.stats.maxTierReached,
    legendary: s.stats.legendaryDraws,
    coinsEarned: s.stats.coinsEarned,
    rewards: s.rewardsTaken.length,
    combo: s.stats.bestCombo,
    skills: s.stats.skillsUsed,
    mvp: mvp ? `${UNIT_BY_ID[mvp.defId].name}` : '-',
    units: s.units.map((u) => `${UNIT_BY_ID[u.defId].name}★${u.tier}`).join(','),
    waveHp,
    events: s.stats.eventsSeen,
  };
}

const runs = Number(process.argv[2] ?? 10);
const strategy = (process.argv[3] ?? 'greedy') as Strategy;
const metaLevel = Number(process.argv[4] ?? 0);
const challengeId = process.argv[6]; // 선택: ZUNRAN DAILY 규칙 id
const useDeck = process.argv[7] === 'deck'; // 선택: 덱을 짜고 플레이
const results: ReturnType<typeof runOnce>[] = [];
for (let i = 0; i < runs; i++) results.push(runOnce(1000 + i * 7919, strategy, 80, metaLevel, challengeId, useDeck));
const waves = results.map((r) => r.wave);
const avg = waves.reduce((a, b) => a + b, 0) / waves.length;
const sorted = [...waves].sort((a, b) => a - b);
const median = sorted[Math.floor(sorted.length / 2)];
const sd = Math.sqrt(waves.reduce((a, b) => a + (b - avg) ** 2, 0) / waves.length);
const times = results.map((r) => r.time);
const avgTime = times.reduce((a, b) => a + b, 0) / times.length;
const hpAt = (w: number) => results.filter((r) => r.waveHp.length > w).map((r) => r.waveHp[w]);
const mean = (xs: number[]) => (xs.length ? (xs.reduce((a, b) => a + b, 0) / xs.length).toFixed(0) : '-');
console.log(`strategy=${strategy} meta=${metaLevel} runs=${runs}${challengeId ? ` daily=${challengeId}` : ''}${useDeck ? ' order=on' : ''}`);
console.log(`한 판 길이: 평균 ${(avgTime / 60).toFixed(1)}분 (최장 ${(Math.max(...times) / 60).toFixed(1)}분)`);
console.log(`waves: min=${Math.min(...waves)} median=${median} avg=${avg.toFixed(1)} max=${Math.max(...waves)} sd=${sd.toFixed(1)} (${((sd / avg) * 100).toFixed(0)}%)`);
console.log(`mean hp entering wave: w5=${mean(hpAt(4))} w10=${mean(hpAt(9))} w11=${mean(hpAt(10))} w13=${mean(hpAt(12))} w14=${mean(hpAt(13))} w20=${mean(hpAt(19))} w21=${mean(hpAt(20))} w30=${mean(hpAt(29))} w31=${mean(hpAt(30))} w40=${mean(hpAt(39))} w41=${mean(hpAt(40))}`);
const mvpCount = new Map<string, number>();
for (const r of results) mvpCount.set(r.mvp, (mvpCount.get(r.mvp) ?? 0) + 1);
const avgOf = (f: (r: typeof results[number]) => number) => (results.reduce((a, b) => a + f(b), 0) / results.length).toFixed(1);
console.log(`avg: recipes=${(results.reduce((a, r) => a + r.recipes, 0) / results.length).toFixed(1)} rewards=${avgOf((r) => r.rewards)} bestCombo=${avgOf((r) => r.combo)} skills=${avgOf((r) => r.skills)} merges=${avgOf((r) => r.merges)} tier=${avgOf((r) => r.maxTier)}`);
console.log('mvp:', [...mvpCount.entries()].sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}×${v}`).join(' '));
const verbose = process.argv[5] === 'v';
if (!verbose) process.exit(0);
for (const r of results) {
  console.log(`seed=${r.seed} wave=${r.wave} t=${r.time}s hp=${r.hp} kills=${r.kills} draws=${r.draws} merges=${r.merges} tier=${r.maxTier} leg=${r.legendary} coins=${r.coinsEarned} rw=${r.rewards} combo=${r.combo} sk=${r.skills} mvp=${r.mvp}`);
  console.log(`   units: ${r.units}`);
  console.log(`   hp by wave: ${r.waveHp.join(' ')}`);
}
