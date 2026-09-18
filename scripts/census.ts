// 전수조사 — 콘텐츠를 하나도 빼지 않고 훑는다.
//
// 지금까지의 계측은 "얼마나 오래 버티는가" 와 몇몇 지표만 봤다.
// 여기서는 유닛 25종 · 손님 28종 · 보상 30장 · 이벤트 28종 · 레시피 4종을
// 전부 세고, 한 번도 안 쓰이는 것(죽은 콘텐츠)과 혼자 튀는 것(이상치)을 찾는다.
//
// 실행: npx tsx scripts/census.ts [runs]
import { Engine } from '../src/game/engine/Engine';
import { metaEffects, DEFAULT_META_LEVELS } from '../src/game/save/meta';
import { yardstickDps, UNIT_DEFS, UNIT_BY_ID } from '../src/game/data/units';
import { ENEMY_DEFS, ENEMY_BY_ID } from '../src/game/data/enemies';
import { REWARD_CARDS } from '../src/game/data/rewards';
import { EVENT_DEFS } from '../src/game/data/events';
import { RECIPES, recipeStatus } from '../src/game/data/recipes';
import { STAGES } from '../src/game/data/stages';
import { ACHIEVEMENTS } from '../src/game/data/achievements';
import { tierDmgMult, tierIntervalMult, MAX_TIER } from '../src/game/config';
import type { MetaUpgradeId, Tier, UnitDef } from '../src/game/types';

const RUNS = Number(process.argv[2] ?? 24);
const CAP = 45;

// ─────────── 1. 이론 수치 (시뮬 없이 데이터만으로) ───────────
// 잣대는 units.ts 에 있다 (테스트와 같은 것을 써야 한다). 티어만 여기서 입힌다.
function theoryDps(u: UnitDef, tier: Tier = 1): number {
  if (tier === 1) return yardstickDps(u);
  return yardstickDps({ ...u, dmg: u.dmg * tierDmgMult(tier), interval: u.interval * tierIntervalMult(tier) });
}

console.log('═══════ 1. 유닛 이론치 (T1 / T4, 범위는 ×2.2 가정) ═══════');
console.log('유닛            등급      역할     사거리  T1 DPS  T4 DPS  오라  스킬  비고');
const dpsRows = UNIT_DEFS.map((u) => ({ u, d1: theoryDps(u, 1), d4: theoryDps(u, MAX_TIER) }));
for (const { u, d1, d4 } of [...dpsRows].sort((a, b) => b.d1 - a.d1)) {
  const flags = [u.mergeOnly ? '합성전용' : '', u.aura ? u.aura.kind : '', u.skill ? u.skill.kind : ''].filter(Boolean);
  console.log(
    `${u.name.padEnd(14)} ${u.rarity.padEnd(9)} ${u.role.padEnd(8)} ${String(u.range).padStart(5)} ` +
    `${d1.toFixed(1).padStart(7)} ${d4.toFixed(1).padStart(7)}  ${u.aura ? 'O' : '·'}   ${u.skill ? 'O' : '·'}   ${flags.join(' ')}`,
  );
}

console.log('\n═══════ 2. 손님 이론치 ═══════');
console.log('손님            최소W  체력   속도  장갑  무리  면역        피해  행동');
for (const e of [...ENEMY_DEFS].sort((a, b) => a.minWave - b.minWave)) {
  if (e.minWave > 900 && !e.tags.includes('boss')) continue;
  console.log(
    `${e.name.padEnd(14)} ${String(e.minWave > 900 ? '-' : e.minWave).padStart(4)} ${String(e.hp).padStart(6)} ` +
    `${String(e.speed).padStart(5)} ${String(e.armor ?? 0).padStart(5)} ${(e.swarm ? 'O' : '·').padStart(4)} ` +
    `${(e.immune?.join(',') ?? '·').padEnd(11)} ${String(e.storeDamage).padStart(4)}  ${e.behavior.kind}`,
  );
}

// ─────────── 2. 시뮬레이션 ───────────
interface Tally {
  unitDraws: Record<string, number>;
  unitDamage: Record<string, number>;
  unitMvp: Record<string, number>;
  unitMaxTier: Record<string, number>;
  enemySeen: Record<string, number>;
  enemyKilled: Record<string, number>;
  enemyReached: Record<string, number>;
  enemyDamage: Record<string, number>;
  rewardOffered: Record<string, number>;
  rewardTaken: Record<string, number>;
  eventSeen: Record<string, number>;
  recipeMade: Record<string, number>;
  waves: number[];
}

const T: Tally = {
  unitDraws: {}, unitDamage: {}, unitMvp: {}, unitMaxTier: {},
  enemySeen: {}, enemyKilled: {}, enemyReached: {}, enemyDamage: {},
  rewardOffered: {}, rewardTaken: {}, eventSeen: {}, recipeMade: {}, waves: [],
};
const add = (r: Record<string, number>, k: string, n = 1) => { r[k] = (r[k] ?? 0) + n; };

function run(stageId: string, shelves: number, seed: number) {
  const levels = { ...DEFAULT_META_LEVELS } as Record<MetaUpgradeId, number>;
  for (const k of Object.keys(levels) as MetaUpgradeId[]) levels[k] = Math.min(6, Math.floor(shelves / 2));
  levels.shelves = shelves;
  const engine = new Engine({ seed, stageId, meta: metaEffects(levels) });
  const s = engine.state;
  let rng = seed * 7919 + 13;
  const rnd = () => ((rng = (rng * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  for (let i = 0; i < 60000 && s.phase !== 'gameover' && s.wave <= CAP; i++) {
    const snap = engine.snapshot();
    for (const g of snap.groups) if (g.mergeable) engine.dispatch({ type: 'MERGE', defId: g.defId, tier: g.tier });
    if (snap.tierMerge) engine.dispatch({ type: 'MERGE_TIER', tier: snap.tierMerge.tier });
    for (const r of snap.mergeBuy) if (s.coins >= r.cost * 1.3) engine.dispatch({ type: 'MERGE_BUY', defId: r.defId });
    // 조합. 이걸 빼먹고 돌렸다가 "레시피 27판 0회" 라는 거짓 결과를 얻었다.
    for (const r of recipeStatus(snap.groups)) if (r.ready && engine.dispatch({ type: 'COMBINE', recipeId: r.def.id }).ok) add(T.recipeMade, r.def.id);
    if (snap.canDraw) engine.dispatch({ type: 'DRAW' });
    else if (snap.junkCount > 0 && snap.emptySlots === 0) engine.dispatch({ type: 'SELL_JUNK' });
    engine.tick(1 / 6);
    engine.drainFx();
    if (s.phase === 'reward') {
      for (const o of s.rewardOffers) add(T.rewardOffered, o.defId);
      // 무작위로 고른다 — tone 순으로 고르면 선택률이 tone 순위를 재는 꼴이 된다
      const pick = s.rewardOffers[Math.floor(rnd() * s.rewardOffers.length)];
      add(T.rewardTaken, pick.defId);
      engine.dispatch({ type: 'CHOOSE_REWARD', defId: pick.defId });
    } else if (s.phase === 'promote' && s.promoteChoice) engine.dispatch({ type: 'CHOOSE_PROMOTE', defId: s.promoteChoice.options[0] });
    else if (s.phase === 'eventChoice') engine.dispatch({ type: 'CHOOSE_EVENT', index: Math.floor(rnd() * (s.eventChoice?.choices.length ?? 1)) });
  }
  // 집계
  T.waves.push(s.wave);
  for (const [id, n] of Object.entries(s.stats.unitDraws)) add(T.unitDraws, id, n);
  for (const [id, n] of Object.entries(s.stats.unitDamage)) add(T.unitDamage, id, n);
  for (const [id, t] of Object.entries(s.stats.unitMaxTier)) T.unitMaxTier[id] = Math.max(T.unitMaxTier[id] ?? 0, t);
  for (const [id, n] of Object.entries(s.stats.enemySeen)) add(T.enemySeen, id, n);
  for (const [id, n] of Object.entries(s.stats.enemyKills)) add(T.enemyKilled, id, n);
  for (const [id, n] of Object.entries(s.stats.reachedBy)) add(T.enemyReached, id, n);
  for (const [id, n] of Object.entries(s.stats.storeDamageBy)) add(T.enemyDamage, id, n);
  for (const id of s.stats.eventIds) add(T.eventSeen, id);
  const mvp = engine.mvpUnit();
  if (mvp) add(T.unitMvp, mvp.defId);
  recipesTotal += s.stats.recipesMade;
}

let recipesTotal = 0;
let seed = 4000;
for (const st of STAGES) for (const sh of [0, 6, 12]) for (let i = 0; i < Math.ceil(RUNS / 9); i++) run(st.id, sh, seed++);
const N = T.waves.length;

const pct = (a: number, b: number) => (b ? `${((a / b) * 100).toFixed(0)}%` : '—');
const totalDmg = Object.values(T.unitDamage).reduce((a, b) => a + b, 0) || 1;

console.log(`\n═══════ 3. 유닛 실전 (${N}판, 무작위 보상 선택) ═══════`);
console.log('유닛            등급      뽑힘   피해지분  MVP  최고T  판정');
const dead: string[] = [];
for (const u of [...UNIT_DEFS].sort((a, b) => (T.unitDamage[b.id] ?? 0) - (T.unitDamage[a.id] ?? 0))) {
  const draws = T.unitDraws[u.id] ?? 0;
  const dmg = T.unitDamage[u.id] ?? 0;
  const share = dmg / totalDmg;
  const mvp = T.unitMvp[u.id] ?? 0;
  let verdict = '';
  if (draws === 0 && !u.mergeOnly) { verdict = '★한 번도 안 나옴'; dead.push(u.name); }
  else if (dmg === 0 && u.dmg > 0) { verdict = '★피해 0'; dead.push(u.name); }
  else if (share > 0.2) verdict = '★지분 과다';
  console.log(`${u.name.padEnd(14)} ${u.rarity.padEnd(9)} ${String(draws).padStart(5)} ${pct(dmg, totalDmg).padStart(8)} ${String(mvp).padStart(4)} ${String(T.unitMaxTier[u.id] ?? 0).padStart(5)}  ${verdict}`);
}

console.log(`\n═══════ 4. 손님 실전 ═══════`);
console.log('손님            등장    처치률  도달률  준 피해  판정');
for (const e of [...ENEMY_DEFS].sort((a, b) => (T.enemySeen[b.id] ?? 0) - (T.enemySeen[a.id] ?? 0))) {
  const seen = T.enemySeen[e.id] ?? 0;
  if (seen === 0 && e.weight === 0 && !e.tags.includes('boss')) continue;
  const reach = T.enemyReached[e.id] ?? 0;
  const dmg = T.enemyDamage[e.id] ?? 0;
  let verdict = '';
  if (seen === 0) { verdict = '★한 번도 안 나옴'; dead.push(e.name); }
  else if (reach === 0 && !e.tags.includes('boss')) verdict = '한 번도 못 뚫음';
  console.log(`${e.name.padEnd(14)} ${String(seen).padStart(6)} ${pct(T.enemyKilled[e.id] ?? 0, seen).padStart(7)} ${pct(reach, seen).padStart(7)} ${String(Math.round(dmg)).padStart(7)}  ${verdict}`);
}

console.log(`\n═══════ 5. 보상 카드 (무작위 선택 기준 — 제시율을 본다) ═══════`);
console.log('카드            종류   제시   선택   판정');
const totalOffers = Object.values(T.rewardOffered).reduce((a, b) => a + b, 0) || 1;
for (const c of [...REWARD_CARDS].sort((a, b) => (T.rewardOffered[b.id] ?? 0) - (T.rewardOffered[a.id] ?? 0))) {
  const off = T.rewardOffered[c.id] ?? 0;
  let verdict = '';
  if (off === 0) { verdict = '★한 번도 제시 안 됨'; dead.push(c.name); }
  else if (off / totalOffers > 0.09) verdict = '제시 과다';
  console.log(`${c.name.padEnd(14)} ${c.kind.padEnd(6)} ${String(off).padStart(5)} ${String(T.rewardTaken[c.id] ?? 0).padStart(5)}  ${verdict}`);
}

console.log(`\n═══════ 6. 이벤트 ═══════`);
for (const e of [...EVENT_DEFS].sort((a, b) => (T.eventSeen[b.id] ?? 0) - (T.eventSeen[a.id] ?? 0))) {
  const n = T.eventSeen[e.id] ?? 0;
  const mark = n === 0 ? '★한 번도 안 일어남' : '';
  if (n === 0) dead.push(e.title);
  console.log(`${e.title.padEnd(22)} ${String(n).padStart(4)} ${e.choices ? `선택${e.choices.length}` : '즉발 '} minW${String(e.minWave).padStart(3)}  ${mark}`);
}

console.log(`\n═══════ 7. 레시피 ═══════`);
// 엔진은 레시피별 집계를 남기지 않는다 (총 횟수만). 최종 결과물 보유로 가늠한다.
console.log(`조합 완성 총 ${recipesTotal}회 / ${N}판 (판당 ${(recipesTotal / N).toFixed(2)}회)`);
for (const r of RECIPES) {
  const n = T.recipeMade[r.id] ?? 0;
  console.log(`${r.id.padEnd(14)} → ${r.result.padEnd(14)} ${String(n).padStart(3)}회 (${pct(n, N)}판)  ${n === 0 ? '★한 번도 안 만들어짐' : ''}`);
  if (n === 0) dead.push(r.id);
}

console.log(`\n═══════ 8. 죽은 콘텐츠 ═══════`);
console.log(dead.length === 0 ? '없음' : dead.join(' / '));
console.log(`\n업적 ${ACHIEVEMENTS.length}종 · 유닛 ${UNIT_DEFS.length}종 · 손님 ${ENEMY_DEFS.length}종 · 보상 ${REWARD_CARDS.length}장 · 이벤트 ${EVENT_DEFS.length}종 · 레시피 ${RECIPES.length}종`);
void ENEMY_BY_ID; void UNIT_BY_ID;
