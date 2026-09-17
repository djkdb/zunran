// 강화 상점이 얼마나 오래 가는지 잰다.
// 실행: npx tsx scripts/metacurve.ts
import { META_UPGRADES, DEFAULT_META_LEVELS, metaEffects, metaPointsForRun } from '../src/game/save/meta';
import { ACHIEVEMENTS, totalAchievementReward } from '../src/game/data/achievements';
import type { MetaUpgradeId } from '../src/game/types';

// 캡이 있는 강화를 전부 만렙까지 사는 총비용
let capped = 0;
for (const u of META_UPGRADES) {
  if (!Number.isFinite(u.maxLevel)) continue;
  for (let l = 0; l < u.maxLevel; l++) capped += u.cost(l);
}
const steps = META_UPGRADES.filter((u) => Number.isFinite(u.maxLevel)).reduce((n, u) => n + u.maxLevel, 0);

// 한 판 수당 (사망 웨이브 중앙값 30 · 처치 700 · 코인 6만 가정)
const perRun = (payMult: number) => metaPointsForRun(60000, 30, 700, payMult);

console.log(`캡 있는 강화  ${steps}단계 / 총 ${capped.toLocaleString()}원`);
console.log(`업적 보상     ${ACHIEVEMENTS.length}개 / 총 ${totalAchievementReward().toLocaleString()}원`);
console.log(`한 판 수당    ${perRun(1)}원 (연차 0)`);
console.log(`→ 업적 없이 캡 강화만 다 사는 데  약 ${Math.ceil(capped / perRun(1))}판`);
console.log(`→ 업적 보상을 합치면             약 ${Math.ceil((capped - totalAchievementReward()) / perRun(1))}판`);

console.log('\n연차(무한) 비용 곡선');
const vet = META_UPGRADES.find((u) => u.id === 'veteran')!;
let acc = 0;
for (const l of [0, 4, 9, 14, 19, 24]) {
  acc = 0;
  for (let i = 0; i < l; i++) acc += vet.cost(i);
  const runs = acc / perRun(1 + l * 0.03);
  console.log(`  ${String(l).padStart(2)}년차  누적 ${Math.round(acc).toLocaleString().padStart(9)}원  다음 ${Math.round(vet.cost(l)).toLocaleString().padStart(8)}원  ≈ ${runs.toFixed(0)}판`);
}

// 만렙 성능이 예전(5레벨 × 큰 값)과 같은지
const maxed = { ...DEFAULT_META_LEVELS } as Record<MetaUpgradeId, number>;
for (const u of META_UPGRADES) maxed[u.id] = Number.isFinite(u.maxLevel) ? u.maxLevel : 0;
const e = metaEffects(maxed);
console.log('\n만렙 효과 (예전 5레벨 만렙과 같아야 한다)');
console.log(`  시작코인 ${e.startCoins} (예전 700)  체력 ${e.startHp} (예전 175)  뽑기할인 ${e.drawCostReduce} (예전 30)`);
console.log(`  희귀 +${(e.rareBonus * 100).toFixed(1)}%p (예전 7.5)  코인 ×${e.coinGainMult.toFixed(2)} (예전 1.30)`);
console.log(`  합성운 +${(e.mergePromoteBonus * 100).toFixed(1)}%p (신규)`);
