// 랭킹 검증 상한/하한이 실제 플레이를 거부하지 않는지 측정한다.
// 실행: npx tsx scripts/rankbounds.ts [runs]
import { Engine } from '../src/game/engine/Engine';
import { metaEffects, DEFAULT_META_LEVELS } from '../src/game/save/meta';
import type { MetaUpgradeId } from '../src/game/types';
import { sellCandidate } from '../src/ui/useGame';
import { minRunSeconds, maxKills } from '../src/game/rank/validate';

function play(engine: Engine): void {
  const s = engine.state;
  if (s.phase === 'reward' && s.rewardOffers.length > 0) {
    engine.dispatch({ type: 'CHOOSE_REWARD', defId: s.rewardOffers[0].defId });
    return;
  }
  const snap = engine.snapshot();
  if (snap.skillReady.shutter && snap.enemyCount >= 14) engine.dispatch({ type: 'USE_SKILL', skill: 'shutter' });
  if (snap.skillReady.dump && snap.enemyCount >= 20) engine.dispatch({ type: 'USE_SKILL', skill: 'dump' });
  for (const g of snap.groups) if (g.mergeable) engine.dispatch({ type: 'MERGE', defId: g.defId, tier: g.tier });
  if (snap.emptySlots === 0) {
    const target = sellCandidate(snap.groups);
    if (target !== null) engine.dispatch({ type: 'SELL', unitId: target });
  }
  let guard = 0;
  while (guard++ < 10) {
    const sn = engine.snapshot();
    if (!sn.canDraw) break;
    engine.dispatch({ type: 'DRAW' });
  }
}

const runs = Number(process.argv[2] ?? 30);
// 웨이브별 "가장 빨리 도달한 게임 시간"과 "가장 많이 잡은 수"
const fastest = new Map<number, number>();
const mostKills = new Map<number, number>();
let maxMergePerDraw = 0;
let maxCoinPerWave = 0;
let maxBoss = 0;

for (let seed = 1; seed <= runs; seed++) {
  const levels = { ...DEFAULT_META_LEVELS } as Record<MetaUpgradeId, number>;
  for (const k of Object.keys(levels) as MetaUpgradeId[]) levels[k] = 5; // 만렙 = 가장 빠른 진행
  const engine = new Engine({ seed, meta: metaEffects(levels), challenge: null });
  let last = 0;
  let t = 0;
  while (engine.state.phase !== 'gameover' && engine.state.wave <= 90 && t < 3600) {
    engine.tick(0.1);
    engine.drainFx();
    t += 0.1;
    if (engine.state.phase === 'reward' || Math.round(t * 10) % 5 === 0) play(engine);
    const s = engine.state;
    if (s.wave !== last) {
      last = s.wave;
      const prev = fastest.get(s.wave);
      if (prev === undefined || s.realTime < prev) fastest.set(s.wave, s.realTime);
      const k = mostKills.get(s.wave);
      if (k === undefined || s.stats.kills > k) mostKills.set(s.wave, s.stats.kills);
      if (s.stats.draws > 0) maxMergePerDraw = Math.max(maxMergePerDraw, s.stats.merges / s.stats.draws);
      maxCoinPerWave = Math.max(maxCoinPerWave, s.stats.coinsEarned / s.wave);
      maxBoss = Math.max(maxBoss, s.stats.bossKills - Math.floor(s.wave / 10));
    }
  }
}

// 2배속으로 돌리면 실측 시간의 절반이 된다. 그보다 더 빨리 갈 수는 없다.
let worstTime = Infinity;
let worstTimeWave = 0;
let worstKills = Infinity;
let worstKillsWave = 0;
for (const [w, sec] of [...fastest].sort((a, b) => a[0] - b[0])) {
  if (w < 3) continue;
  const bound = minRunSeconds(w);
  const actual = sec / 2; // 2배속 플레이어의 실제 시간
  const margin = actual / bound; // 1 미만이면 정상 기록이 거부된다
  if (margin < worstTime) {
    worstTime = margin;
    worstTimeWave = w;
  }
  const km = maxKills(w) / (mostKills.get(w) ?? 1);
  if (km < worstKills) {
    worstKills = km;
    worstKillsWave = w;
  }
}

const curve: string[] = [];
for (const [w, sec] of [...fastest].sort((a, b) => a[0] - b[0])) {
  if (w % 5 !== 0 && w > 5) continue;
  curve.push(`W${w}:${(sec / 2 / minRunSeconds(w)).toFixed(2)}`);
}
console.log('시간 여유 곡선 ', curve.join(' '));
console.log(`시드 ${runs}판 · 메타 만렙 · 최속 진행 기준`);
console.log(`시간 하한 여유  최저 ${worstTime.toFixed(2)}배 (웨이브 ${worstTimeWave})  ← 1.0 미만이면 정상 기록 거부`);
console.log(`처치 상한 여유  최저 ${worstKills.toFixed(2)}배 (웨이브 ${worstKillsWave})  ← 1.0 미만이면 정상 기록 거부`);
console.log(`합성/뽑기 최대  ${maxMergePerDraw.toFixed(3)}  ← 검증 기준 0.5`);
console.log(`웨이브당 코인   최대 ${Math.round(maxCoinPerWave)}  ← 검증 기준 웨이브당 40000`);
console.log(`보스 초과분     최대 ${maxBoss}  ← 검증 기준 +1`);
