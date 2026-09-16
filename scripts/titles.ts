// 런 제목 분포 + 밸런스 지표 측정: npx tsx scripts/titles.ts [판수]
import { Engine } from '../src/game/engine/Engine';
import { sellCandidate } from '../src/ui/useGame';
import { pickRunTitle } from '../src/game/data/runTitles';
import { createRng } from '../src/game/engine/rng';
import { metaEffects, DEFAULT_META_LEVELS, metaPointsForRun } from '../src/game/save/meta';

const N = Number(process.argv[2] ?? 24);
const titles = new Map<string, number>();
const waves: number[] = [], left: number[] = [], secs: number[] = [], pts: number[] = [], tiers: number[] = [];
for (let i = 0; i < N; i++) {
  const e = new Engine({ seed: 500 + i * 7919, meta: metaEffects(DEFAULT_META_LEVELS) });
  let t = 0;
  while (e.state.phase !== 'gameover' && t < 60 * 40) {
    e.tick(0.1); e.drainFx(); t += 0.1;
    const s = e.state;
    if (s.phase === 'reward' && s.rewardOffers.length) e.dispatch({ type: 'CHOOSE_REWARD', defId: s.rewardOffers[0].defId });
    if (Math.round(t * 10) % 5 === 0) {
      const sn = e.snapshot();
      for (const g of sn.groups) if (g.mergeable) e.dispatch({ type: 'MERGE', defId: g.defId, tier: g.tier });
      if (sn.emptySlots === 0) {
        const tg = sellCandidate(sn.groups);
        if (tg !== null) e.dispatch({ type: 'SELL', unitId: tg });
      }
      let guard = 0;
      while (guard++ < 8 && e.snapshot().canDraw) e.dispatch({ type: 'DRAW' });
    }
  }
  const s = e.state, mvp = e.mvpUnit();
  const topEnemy = Object.entries(s.stats.enemySeen).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  const rng = createRng(s.seed ^ 0x5bf03635);
  const title = pickRunTitle({ wave: s.wave, stats: s.stats, mvpName: null, mvpDefId: mvp?.defId ?? null, eventCount: (id) => s.stats.eventIds.filter((x) => x === id).length, topEnemy }, () => rng.next());
  titles.set(title, (titles.get(title) ?? 0) + 1);
  waves.push(s.wave); left.push(s.coins); secs.push(t); pts.push(metaPointsForRun(s.stats.coinsEarned, s.wave, s.stats.kills));
  tiers.push(s.units.length ? s.units.reduce((a, u) => a + u.tier, 0) / s.units.length : 0);
}
const med = (a: number[]) => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)];
console.log(`런 제목 분포 (${N}판) — 가장 흔한 제목이 전체의 ${Math.round((Math.max(...titles.values()) / N) * 100)}%`);
for (const [k, v] of [...titles.entries()].sort((a, b) => b[1] - a[1])) console.log('  ' + String(v).padStart(2) + '판  ' + k);
console.log(`사망 웨이브 ${med(waves)} | 한 판 ${(med(secs) / 60).toFixed(1)}분 | 남은 코인 ${med(left)} | 수당 ${med(pts)} | 최종 평균티어 ${med(tiers).toFixed(2)}`);
