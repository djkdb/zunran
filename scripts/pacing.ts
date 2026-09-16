// 초반 긴장감·템포 측정: 첫 피해 웨이브 / 사망 웨이브 / 웨이브10 도달 시간 / 한 판 길이
// 실행: npx tsx scripts/pacing.ts [runs]
import { Engine } from '../src/game/engine/Engine';
import { metaEffects, DEFAULT_META_LEVELS } from '../src/game/save/meta';

const n = Number(process.argv[2] ?? 16);
const first: number[] = [], death: number[] = [], t10: number[] = [], tot: number[] = [];
for (let i = 0; i < n; i++) {
  const e = new Engine({ seed: 1000 + i * 7919, meta: metaEffects(DEFAULT_META_LEVELS) });
  let t = 0, mark = 0, firstHit = 0, prev = e.state.hp;
  while (e.state.phase !== 'gameover' && t < 60 * 30) {
    e.tick(0.1); e.drainFx(); t += 0.1;
    const s = e.state;
    if (!mark && s.wave >= 10) mark = t;
    if (!firstHit && s.hp < prev) firstHit = s.wave;
    prev = s.hp;
    if (s.phase === 'reward' && s.rewardOffers.length) e.dispatch({ type: 'CHOOSE_REWARD', defId: s.rewardOffers[0].defId });
    if (Math.round(t * 10) % 5 === 0) {
      const sn = e.snapshot();
      for (const g of sn.groups) if (g.mergeable) e.dispatch({ type: 'MERGE', defId: g.defId, tier: g.tier });
      let guard = 0;
      while (guard++ < 8 && e.snapshot().canDraw) e.dispatch({ type: 'DRAW' });
    }
  }
  first.push(firstHit || 99); death.push(e.state.wave); t10.push(mark); tot.push(t);
}
const med = (a: number[]) => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)];
console.log(`첫 피해 웨이브 중앙값=${med(first)} (10웨이브 안에 피해 본 판 ${first.filter((w) => w <= 10).length}/${n})`);
console.log(`사망 웨이브 중앙값=${med(death)}  웨이브10 도달=${med(t10).toFixed(0)}s  한 판=${(med(tot) / 60).toFixed(1)}분`);
console.log('첫 피해:', first.join(' '));
