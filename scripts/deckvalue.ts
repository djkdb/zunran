// 덱(발주)이 실제로 하는 일이 있는가?
// 가설: 덱의 유일한 쓸모는 "이번 판에 이 레시피를 노린다"를 가능하게 하는 것.
// 덱 없이도 레시피가 비슷하게 완성된다면 덱은 메뉴 하나를 더 거치게 할 뿐이다.
import { Engine } from '../src/game/engine/Engine';
import { RECIPES, recipeStatus } from '../src/game/data/recipes';
import { normalizeDeck } from '../src/game/data/deck';
import { unlockedUnits } from '../src/game/data/unlocks';

const all = unlockedUnits(999);
const SEEDS = 40;

function play(seed: number, target: string, deck?: string[]) {
  const e = new Engine({ seed, deck });
  let t = 0;
  let madeTarget = false;
  let wave = 0;
  while (e.state.phase !== 'gameover' && t < 900) {
    e.tick(0.1);
    e.drainFx();
    t += 0.1;
    if (Math.round(t * 10) % 5 === 0) {
      if (e.state.phase === 'reward' && e.state.rewardOffers[0]) e.dispatch({ type: 'CHOOSE_REWARD', defId: e.state.rewardOffers[0].defId });
      const snap = e.snapshot();
      const st = recipeStatus(snap.groups).find((x) => x.def.id === target);
      if (st?.ready && !madeTarget && e.dispatch({ type: 'COMBINE', recipeId: target }).ok) {
        madeTarget = true;
        wave = e.state.wave;
      }
      for (const g of e.snapshot().groups) if (g.mergeable) e.dispatch({ type: 'MERGE', defId: g.defId, tier: g.tier });
      let guard = 0;
      while (guard++ < 8 && e.snapshot().canDraw) e.dispatch({ type: 'DRAW' });
    }
  }
  return { madeTarget, wave };
}

console.log('"이 레시피를 노린다"가 실제로 되는가 — 목표 레시피 완성률\n');
console.log('레시피         재료   발주 없음      발주함        차이');
for (const r of RECIPES) {
  const aimed = normalizeDeck(r.materials.map((m) => m.defId), all);
  let noDeck = 0, withDeck = 0, wSum = 0;
  for (let s = 1; s <= SEEDS; s++) {
    if (play(1000 + s * 7919, r.id).madeTarget) noDeck++;
    const res = play(1000 + s * 7919, r.id, aimed);
    if (res.madeTarget) { withDeck++; wSum += res.wave; }
  }
  const a = Math.round((noDeck / SEEDS) * 100);
  const b = Math.round((withDeck / SEEDS) * 100);
  console.log(
    `${r.name.padEnd(10)} ${String(r.materials.length).padStart(2)}종   ${String(a + '%').padStart(5)}        ${String(b + '%').padStart(5)}` +
      `        ${b - a >= 0 ? '+' : ''}${b - a}%p${withDeck ? ` (평균 W${(wSum / withDeck).toFixed(0)})` : ''}`,
  );
}
