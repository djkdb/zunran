// 덱이 판의 다양성을 얼마나 깎는지 잰다.
// "재미"는 못 재지만, 판마다 얼마나 달라지는지는 잴 수 있다.
import { Engine } from '../src/game/engine/Engine';
import { UNIT_BY_ID } from '../src/game/data/units';
import { normalizeOrder } from '../src/game/data/deck';
import { unlockedUnits } from '../src/game/data/unlocks';
import { recipeStatus } from '../src/game/data/recipes';

const all = unlockedUnits(999);

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

function play(seed: number, order?: { pins: string[]; bans: string[] }) {
  const e = new Engine({ seed, order });
  let t = 0;
  while (e.state.phase !== 'gameover' && t < 900) {
    e.tick(0.1);
    e.drainFx();
    t += 0.1;
    if (Math.round(t * 10) % 5 === 0) {
      if (e.state.phase === 'reward' && e.state.rewardOffers[0]) e.dispatch({ type: 'CHOOSE_REWARD', defId: e.state.rewardOffers[0].defId });
      const snap = e.snapshot();
      for (const r of recipeStatus(snap.groups)) { if (!r.ready) break; e.dispatch({ type: 'COMBINE', recipeId: r.def.id }); }
      for (const g of snap.groups) if (g.mergeable) e.dispatch({ type: 'MERGE', defId: g.defId, tier: g.tier });
      let guard = 0;
      while (guard++ < 8 && e.snapshot().canDraw) e.dispatch({ type: 'DRAW' });
    }
  }
  const mvp = e.mvpUnit();
  return { seen: new Set(e.state.stats.seenUnits), mvp: mvp ? mvp.defId : '-', wave: e.state.wave };
}

const N = 40;
for (const [label, useDeck] of [['발주 없음', false], ['발주 적용', true]] as const) {
  const runs = Array.from({ length: N }, (_, i) => {
    const sh = shuffle(all, 1000 + i * 7919);
    return play(1000 + i * 7919, useDeck ? normalizeOrder({ pins: sh.slice(0, 2), bans: sh.slice(2, 4) }, all) : undefined);
  });

  // ① 한 판에서 만나는 유닛 종류
  const perRun = runs.map((r) => r.seen.size);
  const avgSeen = perRun.reduce((a, b) => a + b, 0) / N;

  // ② 두 판이 얼마나 겹치는가 (자카드 유사도 — 1이면 완전히 같은 판)
  let sim = 0, pairs = 0;
  for (let i = 0; i < N; i++)
    for (let j = i + 1; j < N; j++) {
      const a = runs[i].seen, b = runs[j].seen;
      const inter = [...a].filter((x) => b.has(x)).length;
      sim += inter / new Set([...a, ...b]).size;
      pairs++;
    }

  // ③ MVP 가 몇 종류나 나오는가 (엔트로피)
  const mvpCount = new Map<string, number>();
  for (const r of runs) mvpCount.set(r.mvp, (mvpCount.get(r.mvp) ?? 0) + 1);
  const H = [...mvpCount.values()].reduce((s, n) => s - (n / N) * Math.log2(n / N), 0);

  console.log(`[${label}]`);
  console.log(`  한 판에 만나는 유닛   평균 ${avgSeen.toFixed(1)}종 (최소 ${Math.min(...perRun)} · 최대 ${Math.max(...perRun)})`);
  console.log(`  두 판의 유사도        ${(sim / pairs).toFixed(2)}  ← 1에 가까울수록 매판 똑같다`);
  console.log(`  MVP 종류             ${mvpCount.size}종, 엔트로피 ${H.toFixed(2)}비트 ← 높을수록 다양`);
  console.log(`  MVP 분포             ${[...mvpCount.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([k, v]) => `${UNIT_BY_ID[k]?.name ?? k}×${v}`).join(' ')}`);
}
