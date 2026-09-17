// 조합 레시피가 실제 플레이에서 완성되는지, 결과 유닛이 제대로 만들어지는지 확인한다.
import { Engine } from '../src/game/engine/Engine';
import { UNIT_BY_ID } from '../src/game/data/units';
import { RECIPES, recipeStatus } from '../src/game/data/recipes';
import { normalizeOrder } from '../src/game/data/deck';
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

// ② 지명 2칸으로 레시피를 노릴 수 있는가.
//    재료가 3종인 레시피는 2개만 지명하고 나머지 하나는 자연히 나오길 기다린다.
for (const target of RECIPES) {
  const pins = target.materials.slice(0, 2).map((m) => m.defId);
  let noOrder = 0;
  let withOrder = 0;
  let wSum = 0;
  const SEEDS = 40;
  for (let seed = 1; seed <= SEEDS; seed++) {
    const run = (order?: { pins: string[]; bans: string[] }) => {
      const e = new Engine({ seed: 1000 + seed * 7919, order });
      let t = 0;
      let done = false;
      let wave = 0;
      while (e.state.phase !== 'gameover' && t < 900) {
        e.tick(0.1);
        e.drainFx();
        t += 0.1;
        if (Math.round(t * 10) % 5 === 0) {
          if (e.state.phase === 'reward' && e.state.rewardOffers[0]) e.dispatch({ type: 'CHOOSE_REWARD', defId: e.state.rewardOffers[0].defId });
          const st = recipeStatus(e.snapshot().groups).find((x) => x.def.id === target.id);
          if (st?.ready && !done && e.dispatch({ type: 'COMBINE', recipeId: target.id }).ok) {
            done = true;
            wave = e.state.wave;
          }
          for (const g of e.snapshot().groups) if (g.mergeable) e.dispatch({ type: 'MERGE', defId: g.defId, tier: g.tier });
          let guard = 0;
          while (guard++ < 8 && e.snapshot().canDraw) e.dispatch({ type: 'DRAW' });
        }
      }
      return { done, wave };
    };
    if (run().done) noOrder++;
    const r = run(normalizeOrder({ pins, bans: [] }, all));
    if (r.done) {
      withOrder++;
      wSum += r.wave;
    }
  }
  const a = Math.round((noOrder / SEEDS) * 100);
  const b = Math.round((withOrder / SEEDS) * 100);
  console.log(
    `${target.name.padEnd(10)} 재료 ${target.materials.length}종 · 지명 ${pins.length}   ` +
      `발주 없음 ${String(a + '%').padStart(4)}  →  지명함 ${String(b + '%').padStart(4)}` +
      (withOrder ? `  (평균 W${(wSum / withOrder).toFixed(0)})` : ''),
  );
}
