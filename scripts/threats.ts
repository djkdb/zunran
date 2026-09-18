// 위협·경제·보드 계측기.
//
// census.ts 는 "무엇이 죽은 콘텐츠인가" 를 본다. 이 스크립트는 다른 질문에 답한다.
//
//   1. 손님의 특수 능력이 실제로 발동하는가, 아니면 쓰기 전에 죽는가
//   2. 웨이브가 진행되면서 돈과 보드가 어떻게 움직이는가
//   3. 20 · 30 · 40 웨이브에 몇 %가 도달하고 보스를 몇 %가 잡는가
//
// 실행: npx tsx scripts/threats.ts [runs] [stageId] [shelves]
import { Engine } from '../src/game/engine/Engine';
import { metaEffects, DEFAULT_META_LEVELS } from '../src/game/save/meta';
import { ENEMY_DEFS } from '../src/game/data/enemies';
import { recipeStatus } from '../src/game/data/recipes';
import { sellCandidate } from '../src/ui/useGame';
import type { MetaUpgradeId } from '../src/game/types';

const RUNS = Number(process.argv[2] ?? 40);
const STAGE = process.argv[3] ?? 'alley';
const SHELVES = Number(process.argv[4] ?? 4);
const CAP = 45;

interface WaveRow {
  coins: number; // 웨이브 끝 시점 보유 코인
  earned: number; // 그 웨이브에서 번 돈
  draws: number;
  sells: number;
  merges: number;
  occupied: number; // 칸 점유율 0~1
  hp: number;
}

function newLevels(shelves: number) {
  // balance.ts 와 같은 가정: 실제 플레이어는 증축만 사지 않는다.
  const levels = { ...DEFAULT_META_LEVELS } as Record<MetaUpgradeId, number>;
  for (const k of Object.keys(levels) as MetaUpgradeId[]) levels[k] = Math.min(6, Math.floor(shelves / 2));
  levels.shelves = shelves;
  return levels;
}

// 사람이 하는 정도의 조작. builds.ts 와 같은 리듬(초당 1.7회)으로 맞춘다.
function run(seed: number) {
  // 보상 선택은 무작위로 한다. 봇의 취향(tone 순)이 아니라 카드 자체를 보려는 것이다.
  let x = seed >>> 0;
  const rng = () => ((x = (x * 1664525 + 1013904223) >>> 0) / 4294967296);
  const engine = new Engine({
    seed,
    meta: metaEffects(newLevels(SHELVES)),
    stageId: STAGE,
    order: { pins: [], bans: [] },
  });
  const s = engine.state;
  const waves: WaveRow[] = [];
  let lastWave = 1;
  let earnedAt = 0;
  let drawsAt = 0;
  let sellsAt = 0;
  let mergesAt = 0;
  let sells = 0;
  const bossSeen = new Map<number, boolean>();
  const bossKilled = new Map<number, boolean>();

  for (let i = 0; i < 60000 && s.phase !== 'gameover' && s.wave <= CAP; i++) {
    engine.tick(1 / 60);
    if (s.phase === 'reward') {
      const o = s.rewardOffers;
      if (o.length) engine.dispatch({ type: 'CHOOSE_REWARD', defId: o[Math.floor(rng() * o.length)].defId });
      else break; // 고를 게 없으면 무한 대기가 된다 — 조용히 멈추지 않고 드러낸다
      continue;
    }
    if (s.phase === 'promote') {
      const o = s.promoteChoice?.options ?? [];
      if (o.length) engine.dispatch({ type: 'CHOOSE_PROMOTE', defId: o[0] });
      continue;
    }
    if (s.phase === 'eventChoice') {
      engine.dispatch({ type: 'CHOOSE_EVENT', index: 0 });
      continue;
    }
    // 웨이브가 넘어갈 때 그 웨이브의 요약을 찍는다
    if (s.wave !== lastWave) {
      const open = s.slots.filter((sl) => !sl.locked && !sl.blocked);
      waves[lastWave] = {
        coins: s.coins,
        earned: s.stats.coinsEarned - earnedAt,
        draws: s.stats.draws - drawsAt,
        sells: sells - sellsAt,
        merges: s.stats.merges - mergesAt,
        occupied: open.length ? s.units.length / open.length : 0,
        hp: s.hp,
      };
      earnedAt = s.stats.coinsEarned;
      drawsAt = s.stats.draws;
      sellsAt = sells;
      mergesAt = s.stats.merges;
      lastWave = s.wave;
    }
    if (i % 35 !== 0) continue; // 초당 1.7회

    const snap = engine.snapshot();
    // 조합 → 합성 → 「한 개만 더」 → 뽑기 → 정리, 봇이 늘 쓰는 순서
    const rec = recipeStatus(snap.groups).find((r) => r.ready);
    if (rec) {
      engine.dispatch({ type: 'COMBINE', recipeId: rec.def.id });
      continue;
    }
    const g = snap.groups.find((x) => x.mergeable);
    if (g) {
      engine.dispatch({ type: 'MERGE', defId: g.defId, tier: g.tier });
      continue;
    }
    if (snap.emptySlots > 0 && snap.coins >= snap.drawCost) {
      engine.dispatch({ type: 'DRAW' });
      continue;
    }
    const buy = snap.mergeBuy[0];
    if (buy && snap.coins >= buy.cost) {
      engine.dispatch({ type: 'MERGE_BUY', defId: buy.defId });
      continue;
    }
    if (snap.emptySlots === 0) {
      const junk = engine.junkUnits();
      if (junk.length > 0) {
        engine.dispatch({ type: 'SELL_JUNK' });
        sells += junk.length;
        continue;
      }
      const c = sellCandidate(snap.groups);
      if (c) {
        engine.dispatch({ type: 'SELL', unitId: c });
        sells += 1;
      }
    }
  }
  for (const w of [10, 20, 30, 40]) {
    if (s.wave >= w) bossSeen.set(w, true);
  }
  return { state: s, waves, sells, bossSeen, bossKilled };
}

const runs = Array.from({ length: RUNS }, (_, i) => run(9100 + i));
const pad = (t: string, n: number) => t + ' '.repeat(Math.max(1, n - [...t].reduce((a, c) => a + (c.charCodeAt(0) > 0x2000 ? 2 : 1), 0)));
const pct = (a: number, b: number) => (b === 0 ? '  -' : `${Math.round((a / b) * 100)}%`);

console.log(`═══ ${STAGE} · 증축 ${SHELVES} · ${RUNS}판 ═══\n`);

// ─── 1. 손님 특수 능력 ───
console.log('─── 1. 손님별 특수 능력 발동 ───');
console.log(pad('손님', 16) + pad('행동', 11) + pad('등장', 7) + pad('발동률', 8) + pad('처치률', 8) + pad('도달률', 8));
const seen: Record<string, number> = {};
const acted: Record<string, number> = {};
const killed: Record<string, number> = {};
const reached: Record<string, number> = {};
for (const r of runs) {
  for (const [k, v] of Object.entries(r.state.stats.enemySeen)) seen[k] = (seen[k] ?? 0) + v;
  for (const [k, v] of Object.entries(r.state.stats.abilityActed)) acted[k] = (acted[k] ?? 0) + v;
  for (const [k, v] of Object.entries(r.state.stats.enemyKills)) killed[k] = (killed[k] ?? 0) + v;
  for (const [k, v] of Object.entries(r.state.stats.reachedBy)) reached[k] = (reached[k] ?? 0) + v;
}
const special = ENEMY_DEFS.filter((d) => d.behavior.kind !== 'walk' && d.behavior.kind !== 'boss');
for (const d of special.sort((a, b) => (seen[b.id] ?? 0) - (seen[a.id] ?? 0))) {
  const n = seen[d.id] ?? 0;
  console.log(
    pad(d.name, 16) + pad(d.behavior.kind, 11) + pad(String(n), 7) +
    pad(pct(acted[d.id] ?? 0, n), 8) + pad(pct(killed[d.id] ?? 0, n), 8) + pad(pct(reached[d.id] ?? 0, n), 8),
  );
}

// ─── 2. 보스 ───
console.log('\n─── 2. 보스 · 도달 ───');
for (const w of [10, 20, 30, 40]) {
  const got = runs.filter((r) => r.state.wave > w || (r.state.wave === w && r.state.phase !== 'gameover')).length;
  console.log(`  W${w} 도달 ${pad(pct(got, RUNS), 7)} (${got}/${RUNS}판)`);
}
for (const d of ENEMY_DEFS.filter((e) => e.tags.includes('boss'))) {
  const n = seen[d.id] ?? 0;
  if (n === 0) continue;
  console.log(`  ${pad(d.name, 16)} 등장 ${pad(String(n), 5)} 처치 ${pad(pct(killed[d.id] ?? 0, n), 6)} 도달 ${pct(reached[d.id] ?? 0, n)}`);
}

// ─── 3. 경제·보드 ───
console.log('\n─── 3. 웨이브별 경제 · 보드 (중앙값) ───');
console.log(pad('W', 4) + pad('보유코인', 10) + pad('수입', 8) + pad('뽑기', 7) + pad('판매', 7) + pad('합성', 7) + pad('점유율', 8) + pad('체력', 7) + pad('생존', 6));
const med = (xs: number[]) => (xs.length === 0 ? 0 : [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)]);
for (let w = 1; w <= 40; w++) {
  const rows = runs.map((r) => r.waves[w]).filter(Boolean) as WaveRow[];
  if (rows.length === 0) break;
  if (w > 12 && w % 2 === 1 && w < 30) continue; // 중반은 격행으로
  console.log(
    pad(String(w), 4) + pad(String(med(rows.map((x) => x.coins))), 10) + pad(String(med(rows.map((x) => x.earned))), 8) +
    pad(med(rows.map((x) => x.draws)).toFixed(1), 7) + pad(med(rows.map((x) => x.sells)).toFixed(1), 7) +
    pad(med(rows.map((x) => x.merges)).toFixed(1), 7) + pad(`${Math.round(med(rows.map((x) => x.occupied)) * 100)}%`, 8) +
    pad(String(med(rows.map((x) => x.hp))), 7) + pad(pct(rows.length, RUNS), 6),
  );
}

// ─── 4. 판 요약 ───
const waveEnd = runs.map((r) => r.state.wave).sort((a, b) => a - b);
console.log('\n─── 4. 판 요약 ───');
console.log(`  도달 웨이브   중앙값 ${waveEnd[Math.floor(RUNS / 2)]} · 평균 ${(waveEnd.reduce((a, b) => a + b, 0) / RUNS).toFixed(1)} · ${waveEnd[0]}~${waveEnd[RUNS - 1]}`);
console.log(`  판당 뽑기     ${(runs.reduce((a, r) => a + r.state.stats.draws, 0) / RUNS).toFixed(1)}`);
console.log(`  판당 판매     ${(runs.reduce((a, r) => a + r.sells, 0) / RUNS).toFixed(1)}`);
console.log(`  판당 합성     ${(runs.reduce((a, r) => a + r.state.stats.merges, 0) / RUNS).toFixed(1)}`);
console.log(`  남은 코인     ${Math.round(runs.reduce((a, r) => a + r.state.coins, 0) / RUNS)}`);
console.log(`  번 코인       ${Math.round(runs.reduce((a, r) => a + r.state.stats.coinsEarned, 0) / RUNS)}`);
console.log(`  쓴 코인       ${Math.round(runs.reduce((a, r) => a + r.state.stats.coinsSpent, 0) / RUNS)}`);
console.log(`  최고 티어     ${(runs.reduce((a, r) => a + r.state.stats.maxTierReached, 0) / RUNS).toFixed(2)}`);
const full = runs.map((r) => r.waves.findIndex((x) => x && x.occupied >= 0.999)).filter((x) => x > 0);
console.log(`  칸 100% 도달  ${full.length ? `W${med(full)} (${full.length}/${RUNS}판)` : '없음'}`);
