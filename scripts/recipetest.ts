// 조합 레시피가 실제 플레이에서 완성되는지, 결과 유닛이 제대로 만들어지는지 확인한다.
import { Engine } from '../src/game/engine/Engine';
import { UNIT_BY_ID } from '../src/game/data/units';
import { RECIPES, recipeStatus } from '../src/game/data/recipes';
import { normalizeDeck } from '../src/game/data/deck';
import { unlockedUnits } from '../src/game/data/unlocks';

const all = unlockedUnits(999);

// ① 재료를 직접 만들어 조합이 성립하는지
for (const r of RECIPES) {
  const e = new Engine({ seed: 7 });
  for (const m of r.materials) {
    const slot = e.state.slots.find((s) => s.unitId === null)!;
    const u = (e as unknown as { state: typeof e.state }).state;
    // 재료를 직접 배치 (뽑기 운에 기대지 않는다)
    const created = { id: u.nextId++, defId: m.defId, tier: m.minTier, slot: slot.index, damage: 0, kills: 0, cd: 0, disabledUntil: 0, buffAtk: 0, buffDmg: 0 } as never;
    u.units.push(created);
    slot.unitId = (created as { id: number }).id;
  }
  const before = e.state.units.length;
  const res = e.dispatch({ type: 'COMBINE', recipeId: r.id });
  const made = e.state.units.find((x) => x.defId === r.result);
  console.log(
    `${r.name.padEnd(10)} → ${(UNIT_BY_ID[r.result]?.name ?? '?').padEnd(14)} ` +
      `조합 ${res.ok ? 'OK' : 'NG(' + res.reason + ')'} | 유닛 ${before} → ${e.state.units.length} | 결과 T${made?.tier ?? '-'}`,
  );
}

// ② 실제 플레이에서 레시피에 닿는가. 레시피를 노린 덱으로 돌린다.
for (const target of RECIPES) {
  const wanted = target.materials.map((m) => m.defId);
  const deck = normalizeDeck(wanted, all);
  let reached = 0;
  let made = 0;
  let firstWave = 0;
  const SEEDS = 20;
  for (let seed = 1; seed <= SEEDS; seed++) {
    const e = new Engine({ seed, deck });
    let t = 0;
    let done = false;
    while (e.state.phase !== 'gameover' && t < 900) {
      e.tick(0.1);
      e.drainFx();
      t += 0.1;
      if (Math.round(t * 10) % 5 === 0) {
        if (e.state.phase === 'reward' && e.state.rewardOffers[0]) e.dispatch({ type: 'CHOOSE_REWARD', defId: e.state.rewardOffers[0].defId });
        const snap = e.snapshot();
        for (const g of snap.groups) if (g.mergeable) e.dispatch({ type: 'MERGE', defId: g.defId, tier: g.tier });
        const st = recipeStatus(e.snapshot().groups).find((x) => x.def.id === target.id);
        if (st?.ready && !done) {
          reached++;
          if (e.dispatch({ type: 'COMBINE', recipeId: target.id }).ok) {
            made++;
            firstWave += e.state.wave;
          }
          done = true;
        }
        let guard = 0;
        while (guard++ < 8 && e.snapshot().canDraw) e.dispatch({ type: 'DRAW' });
      }
    }
  }
  console.log(
    `${target.name.padEnd(10)} 재료 ${target.materials.length}종 → ${SEEDS}판 중 완성 ${made}판 (${Math.round((made / SEEDS) * 100)}%)` +
      (made ? ` · 평균 웨이브 ${(firstWave / made).toFixed(0)}` : ''),
  );
}
