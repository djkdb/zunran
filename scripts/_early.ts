// 초반 웨이브에서 실제로 무슨 일이 일어나는가. 웨이브별 체력 손실과 계산대 도달 수.
import { Engine } from '../src/game/engine/Engine';
import { metaEffects, DEFAULT_META_LEVELS } from '../src/game/save/meta';
import type { MetaUpgradeId } from '../src/game/types';

const RUNS = 24;
const UPTO = 16;

function run(stageId: string, shelves: number, seed: number) {
  const levels = { ...DEFAULT_META_LEVELS } as Record<MetaUpgradeId, number>;
  for (const k of Object.keys(levels) as MetaUpgradeId[]) levels[k] = Math.min(6, Math.floor(shelves / 2));
  levels.shelves = shelves;
  const engine = new Engine({ seed, stageId, meta: metaEffects(levels) });
  const s = engine.state;
  const lossByWave: number[] = [];
  const nearByWave: number[] = [];
  let lastWave = 1, hpAtWaveStart = s.hp, nearPeak = 0;
  for (let i = 0; i < 40000 && s.phase !== 'gameover' && s.wave <= UPTO; i++) {
    const snap = engine.snapshot();
    for (const g of snap.groups) if (g.mergeable) engine.dispatch({ type: 'MERGE', defId: g.defId, tier: g.tier });
    if (snap.tierMerge) engine.dispatch({ type: 'MERGE_TIER', tier: snap.tierMerge.tier });
    if (snap.canDraw) engine.dispatch({ type: 'DRAW' });
    else if (snap.junkCount > 0 && snap.emptySlots === 0) engine.dispatch({ type: 'SELL_JUNK' });
    else for (const o of snap.mergeBuy) if (s.coins >= o.cost * 1.2) engine.dispatch({ type: 'MERGE_BUY', defId: o.defId });
    nearPeak = Math.max(nearPeak, snap.nearCheckout);
    engine.tick(1 / 6);
    engine.drainFx();
    if (s.phase === 'reward') engine.dispatch({ type: 'CHOOSE_REWARD', defId: s.rewardOffers[0].defId });
    else if (s.phase === 'promote' && s.promoteChoice) engine.dispatch({ type: 'CHOOSE_PROMOTE', defId: s.promoteChoice.options[0] });
    else if (s.phase === 'eventChoice') engine.dispatch({ type: 'CHOOSE_EVENT', index: 0 });
    if (s.wave !== lastWave) {
      lossByWave[lastWave] = (lossByWave[lastWave] ?? 0) + Math.max(0, hpAtWaveStart - s.hp);
      nearByWave[lastWave] = (nearByWave[lastWave] ?? 0) + nearPeak;
      lastWave = s.wave; hpAtWaveStart = s.hp; nearPeak = 0;
    }
  }
  return { lossByWave, nearByWave };
}

for (const [stageId, name] of [['country', '국도변 시골점'], ['alley', '동네 골목점']] as const) {
  for (const sh of [0, 6]) {
    const loss: number[] = [], near: number[] = [];
    for (let i = 0; i < RUNS; i++) {
      const r = run(stageId, sh, 5000 + i);
      for (let w = 1; w <= UPTO; w++) { loss[w] = (loss[w] ?? 0) + (r.lossByWave[w] ?? 0); near[w] = (near[w] ?? 0) + (r.nearByWave[w] ?? 0); }
    }
    console.log(`\n${name} · 증축 ${sh} (${RUNS}판 평균)`);
    console.log('w   ' + Array.from({ length: UPTO }, (_, i) => String(i + 1).padStart(5)).join(''));
    console.log('손실' + Array.from({ length: UPTO }, (_, i) => (loss[i + 1] / RUNS).toFixed(1).padStart(5)).join(''));
    console.log('앞선' + Array.from({ length: UPTO }, (_, i) => (near[i + 1] / RUNS).toFixed(1).padStart(5)).join(''));
  }
}
