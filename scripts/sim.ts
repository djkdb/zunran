// 헤드리스 밸런스 시뮬레이터. 자동 플레이어가 뽑기/합성을 수행하며 몇 웨이브까지 버티는지 측정.
// 실행: npm run sim -- [runs] [strategy]
import { Engine } from '../src/game/engine/Engine';
import { UNIT_BY_ID } from '../src/game/data/units';
import { metaEffects, DEFAULT_META_LEVELS } from '../src/game/save/meta';
import type { MetaUpgradeId } from '../src/game/types';

type Strategy = 'greedy' | 'saver' | 'noMerge' | 'sellCommons';

function autoPlay(engine: Engine, strategy: Strategy): void {
  const s = engine.state;
  const snap = engine.snapshot();
  // 합성: 가능한 그룹 전부
  if (strategy !== 'noMerge') {
    for (const g of snap.groups) {
      if (g.mergeable) engine.dispatch({ type: 'MERGE', defId: g.defId, tier: g.tier });
    }
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

function runOnce(seed: number, strategy: Strategy, maxWave = 60, metaLevel = 0) {
  const levels = { ...DEFAULT_META_LEVELS } as Record<MetaUpgradeId, number>;
  for (const k of Object.keys(levels) as MetaUpgradeId[]) levels[k] = metaLevel;
  const engine = new Engine({ seed, meta: metaEffects(levels) });
  let t = 0;
  const waveHp: number[] = [];
  let lastWave = 0;
  while (engine.state.phase === 'playing' && engine.state.wave <= maxWave && t < 60 * 60) {
    engine.tick(0.1);
    engine.drainFx();
    t += 0.1;
    if (Math.round(t * 10) % 5 === 0) autoPlay(engine, strategy);
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
    maxTier: s.stats.maxTierReached,
    legendary: s.stats.legendaryDraws,
    coinsEarned: s.stats.coinsEarned,
    mvp: mvp ? `${UNIT_BY_ID[mvp.defId].name}` : '-',
    units: s.units.map((u) => `${UNIT_BY_ID[u.defId].name}★${u.tier}`).join(','),
    waveHp,
    events: s.stats.eventsSeen,
  };
}

const runs = Number(process.argv[2] ?? 10);
const strategy = (process.argv[3] ?? 'greedy') as Strategy;
const metaLevel = Number(process.argv[4] ?? 0);
const results = [];
for (let i = 0; i < runs; i++) results.push(runOnce(1000 + i * 7919, strategy, 80, metaLevel));
const waves = results.map((r) => r.wave);
const avg = waves.reduce((a, b) => a + b, 0) / waves.length;
console.log(`strategy=${strategy} meta=${metaLevel} runs=${runs}`);
console.log(`waves: min=${Math.min(...waves)} avg=${avg.toFixed(1)} max=${Math.max(...waves)}`);
for (const r of results) {
  console.log(`seed=${r.seed} wave=${r.wave} t=${r.time}s hp=${r.hp} kills=${r.kills} draws=${r.draws} merges=${r.merges} tier=${r.maxTier} leg=${r.legendary} coins=${r.coinsEarned} ev=${r.events} mvp=${r.mvp}`);
  console.log(`   units: ${r.units}`);
  console.log(`   hp by wave: ${r.waveHp.join(' ')}`);
}
