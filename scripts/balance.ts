// 지점 × 진열대 증축 단계별 난이도 격자.
// 실행: npx tsx scripts/balance.ts
//
// 보는 것: 웨이브 중앙값이 증축에 따라 올라가는가(강화가 판을 바꾸는가),
// 합성·「한 개만 더」가 실제로 일어나는가(루프가 도는가),
// 남은 코인이 쌓이지만 않는가(돈의 출구가 있는가),
// 상한(w45)에 걸리는 판이 없는가(안 죽는 판이 생겼는가).
import { Engine } from '../src/game/engine/Engine';
import { metaEffects, DEFAULT_META_LEVELS } from '../src/game/save/meta';
import type { MetaUpgradeId } from '../src/game/types';

function run(stageId: string, shelves: number, seed: number) {
  const levels = { ...DEFAULT_META_LEVELS } as Record<MetaUpgradeId, number>;
  // 실제 플레이어는 증축만 사지 않는다. 다른 강화도 같이 올라간다.
  for (const k of Object.keys(levels) as MetaUpgradeId[]) levels[k] = Math.min(6, Math.floor(shelves / 2));
  levels.shelves = shelves;
  const engine = new Engine({ seed, stageId, meta: metaEffects(levels) });
  const s = engine.state;
  let merges = 0, draws = 0, buys = 0, idleTicks = 0, ticks = 0;
  const CAP = 45; // 웨이브 상한. 여기 걸리면 '안 죽는 판' 이다
  for (let i = 0; i < 60000 && s.phase !== 'gameover' && s.wave <= CAP; i++) {
    const snap = engine.snapshot();
    let did = false;
    for (const g of snap.groups) if (g.mergeable && engine.dispatch({ type: 'MERGE', defId: g.defId, tier: g.tier }).ok) { merges++; did = true; }
    if (snap.tierMerge) { engine.dispatch({ type: 'MERGE_TIER', tier: snap.tierMerge.tier }); merges++; did = true; }
    if (snap.canDraw) { engine.dispatch({ type: 'DRAW' }); draws++; did = true; }
    else if (snap.junkCount > 0 && snap.emptySlots === 0) { engine.dispatch({ type: 'SELL_JUNK' }); did = true; }
    else { for (const o of snap.mergeBuy) if (s.coins >= o.cost * 1.2 && engine.dispatch({ type: 'MERGE_BUY', defId: o.defId }).ok) { buys++; did = true; } }
    ticks++;
    if (!did) idleTicks++;
    engine.tick(1 / 6);
    engine.drainFx();
    if (s.phase === 'reward') engine.dispatch({ type: 'CHOOSE_REWARD', defId: s.rewardOffers[0].defId });
    else if (s.phase === 'promote' && s.promoteChoice) engine.dispatch({ type: 'CHOOSE_PROMOTE', defId: s.promoteChoice.options[0] });
    else if (s.phase === 'eventChoice') engine.dispatch({ type: 'CHOOSE_EVENT', index: 0 });
  }
  return { capped: s.wave > CAP, wave: s.wave, merges, draws, buys, maxTier: s.stats.maxTierReached,
    idle: idleTicks / Math.max(1, ticks), leftover: s.coins, min: s.time / 60 };
}
const mean = (a: number[]) => a.reduce((x, y) => x + y, 0) / a.length;
const med = (a: number[]) => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)];
console.log('지점        진열대  wave중앙  합성  한개더  뽑기  최고티어  남은코인  분  상한');
for (const [stageId, name] of [['country', '시골점'], ['alley', '골목점'], ['downtown', '술집가']] as const) {
  for (const sh of [0, 4, 8, 12]) {
    const o = Array.from({ length: 10 }, (_, i) => run(stageId, sh, 2000 + i));
    console.log(`${name.padEnd(10)} ${String(sh).padStart(2)}  ${String(med(o.map((x) => x.wave))).padStart(6)}  ` +
      `${mean(o.map((x) => x.merges)).toFixed(1).padStart(5)} ${mean(o.map((x) => x.buys)).toFixed(1).padStart(6)} ${mean(o.map((x) => x.draws)).toFixed(0).padStart(5)} ` +
      `${mean(o.map((x) => x.maxTier)).toFixed(2).padStart(8)} ` +
      `${Math.round(mean(o.map((x) => x.leftover))).toString().padStart(8)} ${mean(o.map((x) => x.min)).toFixed(1).padStart(5)} ${((o.filter((x) => x.capped).length / o.length) * 100).toFixed(0).padStart(5)}%`);
  }
}
