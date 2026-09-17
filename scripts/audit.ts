// 전수 계측기. 재미/밸런스 감사를 위해 한 판에서 뽑아낼 수 있는 지표를 전부 모은다.
// 실행: npx tsx scripts/audit.ts [runs] [strategy...]
import { Engine } from '../src/game/engine/Engine';
import { UNIT_BY_ID, UNIT_DEFS } from '../src/game/data/units';
import { ENEMY_BY_ID } from '../src/game/data/enemies';
import { metaEffects, DEFAULT_META_LEVELS } from '../src/game/save/meta';
import type { MetaUpgradeId, Rarity } from '../src/game/types';
import { recipeStatus } from '../src/game/data/recipes';
import { sellCandidate } from '../src/ui/useGame';
import { drawCost, isBossWave, TOTAL_SLOTS } from '../src/game/config';

type Strategy = 'greedy' | 'saver' | 'noMerge' | 'sellCommons' | 'autoClean' | 'orderer';
const TONE_RANK = { best: 2, good: 1, normal: 0 } as const;

interface RunLog {
  wave: number;
  time: number;
  diedOnBoss: boolean;
  diedWave: number;
  kills: number;
  draws: number;
  merges: number;
  recipes: number;
  rewards: number;
  sells: number;
  orders: number;
  promotes: number;
  firstSellWave: number | null;
  coinsEarned: number;
  firstBy: Partial<Record<Rarity, number>>; // 등급별 첫 등장 웨이브
  hpByWave: number[];
  coinsByWave: number[];
  occByWave: number[]; // 보드 점유율
  affordByWave: number[]; // 웨이브 시작 시 살 수 있는 뽑기 횟수
  drawsByWave: number[]; // 웨이브 시작 시점의 누적 뽑기 수
  unitDamage: Record<string, number>;
  unitSeen: string[];
  mvp: string | null;
  enemySeen: Record<string, number>;
  enemyReached: Record<string, number>;
  themeLoss: Record<string, { loss: number; waves: number }>; // 테마별 체력 손실
  offered: string[];
  chosen: string[];
  finalUnits: string[];
}

function runOnce(seed: number, strategy: Strategy, maxWave = 80): RunLog {
  const levels = { ...DEFAULT_META_LEVELS } as Record<MetaUpgradeId, number>;
  const engine = new Engine({ seed, meta: metaEffects(levels) });
  const s = engine.state;
  const log: RunLog = {
    wave: 0, time: 0, diedOnBoss: false, diedWave: 0, kills: 0, draws: 0, merges: 0, recipes: 0,
    rewards: 0, sells: 0, orders: 0, promotes: 0, firstSellWave: null, coinsEarned: 0, firstBy: {},
    hpByWave: [], coinsByWave: [], occByWave: [], affordByWave: [], drawsByWave: [],
    unitDamage: {}, unitSeen: [], mvp: null, enemySeen: {}, enemyReached: {}, themeLoss: {},
    offered: [], chosen: [], finalUnits: [],
  };
  let t = 0;
  let lastWave = 0;
  let lastTheme = 'mixed';
  let hpAtWaveStart = 100;
  let prevSells = 0;

  const play = () => {
    // 승급 2택: 더 높은 등급 → 더 높은 DPS 순으로 고른다 (사람의 흔한 선택)
    if (s.phase === 'promote' && s.promoteChoice) {
      const best = [...s.promoteChoice.options].sort((a, b) => {
        const da = UNIT_BY_ID[a];
        const db = UNIT_BY_ID[b];
        return db.dmg / Math.max(0.1, db.interval) - da.dmg / Math.max(0.1, da.interval);
      })[0];
      engine.dispatch({ type: 'CHOOSE_PROMOTE', defId: best });
      log.promotes++;
      return;
    }
    if (s.phase === 'reward' && s.rewardOffers.length > 0) {
      for (const o of s.rewardOffers) log.offered.push(o.defId);
      const best = [...s.rewardOffers].sort((a, b) => TONE_RANK[b.tone] - TONE_RANK[a.tone])[0];
      log.chosen.push(best.defId);
      engine.dispatch({ type: 'CHOOSE_REWARD', defId: best.defId });
      return;
    }
    const snap = engine.snapshot();
    if (snap.skillReady.shutter && snap.enemyCount >= 14) engine.dispatch({ type: 'USE_SKILL', skill: 'shutter' });
    if (snap.skillReady.dump && snap.enemyCount >= 20) engine.dispatch({ type: 'USE_SKILL', skill: 'dump' });
    for (const r of recipeStatus(snap.groups)) {
      if (!r.ready) break;
      engine.dispatch({ type: 'COMBINE', recipeId: r.def.id });
    }
    if (strategy !== 'noMerge') {
      for (const g of snap.groups) if (g.mergeable) engine.dispatch({ type: 'MERGE', defId: g.defId, tier: g.tier });
    }
    if ((strategy === 'autoClean' || strategy === 'orderer') && snap.emptySlots === 0) {
      const target = sellCandidate(snap.groups);
      if (target !== null) { engine.dispatch({ type: 'SELL', unitId: target }); log.sells++; if (log.firstSellWave === null) log.firstSellWave = s.wave; }
    }
    if (strategy === 'sellCommons' && snap.emptySlots === 0 && snap.coins >= snap.drawCost) {
      const rank: Record<string, number> = { common: 0, rare: 1, epic: 2, special: 3, legendary: 4 };
      const counts = new Map<string, number>();
      for (const u of s.units) counts.set(`${u.defId}|${u.tier}`, (counts.get(`${u.defId}|${u.tier}`) ?? 0) + 1);
      const cands = s.units
        .filter((u) => u.tier === 1 && (counts.get(`${u.defId}|1`) ?? 0) < 2 && rank[UNIT_BY_ID[u.defId].rarity] <= 1)
        .sort((a, b) => rank[UNIT_BY_ID[a.defId].rarity] - rank[UNIT_BY_ID[b.defId].rarity] || a.damage - b.damage);
      if (cands[0]) { engine.dispatch({ type: 'SELL', unitId: cands[0].id }); log.sells++; if (log.firstSellWave === null) log.firstSellWave = s.wave; }
    }
    // 본사 발주: 전설이 없으면 웨이브 10부터 일반 뽑기를 멈추고 모아서 산다.
    // "돈을 모아 원하는 걸 산다"는 결정이 실제로 값어치가 있는지 보기 위한 전략.
    let saving = false;
    if (strategy === 'orderer') {
      const sn0 = engine.snapshot();
      const hasLegend = s.units.some((u) => UNIT_BY_ID[u.defId].rarity === 'legendary');
      if (sn0.emptySlots > 0 && s.wave >= 10 && !hasLegend) {
        if (sn0.coins >= sn0.orderCost.legendary) engine.dispatch({ type: 'ORDER', rarity: 'legendary' });
        else saving = true;
      } else if (sn0.emptySlots > 0 && s.wave >= 6 && sn0.coins >= sn0.orderCost.epic * 2.2) {
        engine.dispatch({ type: 'ORDER', rarity: 'epic' });
      }
    }
    if (saving) return;
    const reserve = strategy === 'saver' ? 200 : 0;
    let guard = 0;
    while (guard++ < 10) {
      const sn = engine.snapshot();
      if (!sn.canDraw || (sn.freeDraws === 0 && sn.coins - sn.drawCost < reserve)) break;
      const before = new Set(s.units.map((u) => u.defId));
      engine.dispatch({ type: 'DRAW' });
      for (const u of s.units) {
        if (!before.has(u.defId)) {
          const r = UNIT_BY_ID[u.defId].rarity;
          if (log.firstBy[r] === undefined) log.firstBy[r] = s.wave;
        }
      }
    }
  };

  while (s.phase !== 'gameover' && s.wave <= maxWave && t < 60 * 60) {
    if (s.phase === 'promote') play();
    engine.tick(0.1);
    engine.drainFx();
    t += 0.1;
    if (s.phase === 'reward' || Math.round(t * 10) % 5 === 0) play();
    if (s.wave !== lastWave) {
      if (lastWave > 0) {
        const th = lastTheme;
        const rec = (log.themeLoss[th] ??= { loss: 0, waves: 0 });
        rec.loss += Math.max(0, hpAtWaveStart - s.hp);
        rec.waves++;
      }
      lastTheme = s.waveTheme;
      hpAtWaveStart = s.hp;
      lastWave = s.wave;
      log.hpByWave.push(s.hp);
      log.coinsByWave.push(s.coins);
      log.occByWave.push(s.units.length / TOTAL_SLOTS);
      log.affordByWave.push(Math.floor(s.coins / Math.max(1, drawCost(s.stats.draws, s.perma.drawDiscount))));
      log.drawsByWave.push(s.stats.draws);
    }
    if (s.stats.recipesMade > log.recipes) log.recipes = s.stats.recipesMade;
    void prevSells;
  }
  const mvp = engine.mvpUnit();
  log.wave = s.wave;
  log.diedWave = s.wave;
  log.diedOnBoss = isBossWave(s.wave);
  log.time = Math.round(s.realTime);
  log.kills = s.stats.kills;
  log.draws = s.stats.draws;
  log.merges = s.stats.merges;
  log.recipes = s.stats.recipesMade;
  log.orders = s.stats.orders;
  log.rewards = s.rewardsTaken.length;
  log.coinsEarned = s.stats.coinsEarned;
  log.unitDamage = { ...s.stats.unitDamage };
  log.unitSeen = [...s.stats.seenUnits];
  log.mvp = mvp ? mvp.defId : null;
  log.enemySeen = { ...s.stats.enemySeen };
  log.enemyReached = { ...s.stats.reachedBy };
  log.finalUnits = s.units.map((u) => `${u.defId}★${u.tier}`);
  return log;
}

// ───────────── 집계 ─────────────
const runs = Number(process.argv[2] ?? 40);
const strategies = (process.argv.slice(3).length ? process.argv.slice(3) : ['greedy', 'saver', 'noMerge', 'sellCommons', 'autoClean', 'orderer']) as Strategy[];
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const med = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : 0; };
const sd = (xs: number[]) => { const m = mean(xs); return Math.sqrt(mean(xs.map((x) => (x - m) ** 2))); };
const pct = (n: number, d: number) => (d ? ((n / d) * 100).toFixed(0) + '%' : '-');

const all: Record<string, RunLog[]> = {};
for (const st of strategies) {
  all[st] = [];
  for (let i = 0; i < runs; i++) all[st].push(runOnce(1000 + i * 7919, st));
}

console.log('═══════════ 1. 생존 / 런 길이 ═══════════');
for (const st of strategies) {
  const L = all[st];
  const w = L.map((r) => r.wave);
  console.log(`${st.padEnd(12)} wave avg=${mean(w).toFixed(1)} med=${med(w)} sd=${sd(w).toFixed(1)} min=${Math.min(...w)} max=${Math.max(...w)} | 길이 ${(mean(L.map((r) => r.time)) / 60).toFixed(1)}분 (max ${(Math.max(...L.map((r) => r.time)) / 60).toFixed(1)}분) | 보스웨이브 사망 ${pct(L.filter((r) => r.diedOnBoss).length, L.length)}`);
}

const main = all[strategies[0]];
console.log('\n═══════════ 2. 웨이브별 상태 (greedy) ═══════════');
console.log('w   | HP   | 코인  | 점유율 | 누적뽑기 | 생존율');
for (let w = 0; w < 46; w++) {
  const alive = main.filter((r) => r.hpByWave.length > w);
  if (!alive.length) break;
  if ((w + 1) % 3 !== 0 && w > 0) continue;
  console.log(
    `${String(w + 1).padStart(3)} | ${mean(alive.map((r) => r.hpByWave[w])).toFixed(0).padStart(4)} | ` +
    `${mean(alive.map((r) => r.coinsByWave[w])).toFixed(0).padStart(5)} | ` +
    `${(mean(alive.map((r) => r.occByWave[w])) * 100).toFixed(0).padStart(5)}% | ` +
    `${mean(alive.map((r) => r.drawsByWave[w])).toFixed(1).padStart(8)} | ${pct(alive.length, main.length)}`,
  );
}

console.log('\n═══════════ 3. 행동 빈도 (판당 평균) ═══════════');
for (const st of strategies) {
  const L = all[st];
  console.log(`${st.padEnd(12)} 뽑기 ${mean(L.map((r) => r.draws)).toFixed(1)} | 합성 ${mean(L.map((r) => r.merges)).toFixed(1)} | 조합 ${mean(L.map((r) => r.recipes)).toFixed(2)} | 보상 ${mean(L.map((r) => r.rewards)).toFixed(1)} | 발주 ${mean(L.map((r) => r.orders)).toFixed(1)} | 승급 ${mean(L.map((r) => r.promotes)).toFixed(1)} | 판매 ${mean(L.map((r) => r.sells)).toFixed(1)} (첫 판매 w${med(L.filter((r) => r.firstSellWave).map((r) => r.firstSellWave!)) || '-'})`);
}

console.log('\n═══════════ 4. 등급별 첫 등장 웨이브 (greedy) ═══════════');
for (const r of ['common', 'rare', 'epic', 'legendary', 'special'] as Rarity[]) {
  const xs = main.map((x) => x.firstBy[r]).filter((x): x is number => x !== undefined);
  console.log(`${r.padEnd(10)} 중앙값 w${med(xs) || '-'} 평균 w${xs.length ? mean(xs).toFixed(1) : '-'} (등장한 판 ${pct(xs.length, main.length)})`);
}

console.log('\n═══════════ 5. 유닛별 사용률 / 피해 지분 / MVP (greedy) ═══════════');
const totalDmgAll = main.reduce((a, r) => a + Object.values(r.unitDamage).reduce((x, y) => x + y, 0), 0);
const rows = UNIT_DEFS.map((d) => {
  const seen = main.filter((r) => r.unitSeen.includes(d.id)).length;
  const dmg = main.reduce((a, r) => a + (r.unitDamage[d.id] ?? 0), 0);
  const mvps = main.filter((r) => r.mvp === d.id).length;
  return { name: d.name, rarity: d.rarity, seen, dmg, mvps };
}).sort((a, b) => b.dmg - a.dmg);
for (const r of rows) {
  console.log(`${r.name.padEnd(14)} ${r.rarity.padEnd(10)} 등장 ${pct(r.seen, main.length).padStart(4)} | 피해지분 ${pct(r.dmg, totalDmgAll).padStart(4)} | MVP ${pct(r.mvps, main.length).padStart(4)}`);
}

console.log('\n═══════════ 6. 손님별 등장 / 계산대 도달률 (greedy) ═══════════');
const eseen: Record<string, number> = {}; const ereach: Record<string, number> = {};
for (const r of main) {
  for (const [k, v] of Object.entries(r.enemySeen)) eseen[k] = (eseen[k] ?? 0) + v;
  for (const [k, v] of Object.entries(r.enemyReached)) ereach[k] = (ereach[k] ?? 0) + v;
}
for (const [k, v] of Object.entries(eseen).sort((a, b) => b[1] - a[1])) {
  const def = ENEMY_BY_ID[k];
  console.log(`${(def?.name ?? k).padEnd(16)} 등장 ${String(v).padStart(5)} | 도달 ${String(ereach[k] ?? 0).padStart(4)} (${pct(ereach[k] ?? 0, v).padStart(4)}) | minW${def?.minWave ?? '?'}`);
}

console.log('\n═══════════ 6-2. 웨이브 테마별 웨이브당 평균 체력 손실 ═══════════');
{
  const agg: Record<string, { loss: number; waves: number }> = {};
  for (const r of main) {
    for (const [k, v] of Object.entries(r.themeLoss)) {
      const a = (agg[k] ??= { loss: 0, waves: 0 });
      a.loss += v.loss;
      a.waves += v.waves;
    }
  }
  for (const [k, v] of Object.entries(agg).sort((a, b) => b[1].loss / b[1].waves - a[1].loss / a[1].waves)) {
    console.log(`${k.padEnd(8)} 웨이브당 -${(v.loss / Math.max(1, v.waves)).toFixed(2)} HP (${v.waves}웨이브)`);
  }
}

console.log('\n═══════════ 7. 보상 카드 제시/선택률 (greedy) ═══════════');
const offCnt: Record<string, number> = {}; const chCnt: Record<string, number> = {};
for (const r of main) { for (const o of r.offered) offCnt[o] = (offCnt[o] ?? 0) + 1; for (const c of r.chosen) chCnt[c] = (chCnt[c] ?? 0) + 1; }
for (const [k, v] of Object.entries(offCnt).sort((a, b) => (chCnt[b[0]] ?? 0) / b[1] - (chCnt[a[0]] ?? 0) / a[1])) {
  console.log(`${k.padEnd(14)} 제시 ${String(v).padStart(4)} | 선택 ${String(chCnt[k] ?? 0).padStart(4)} (${pct(chCnt[k] ?? 0, v).padStart(4)})`);
}

console.log('\n═══════════ 8. 최종 보드 구성 (greedy, 상위 12판) ═══════════');
for (const r of [...main].sort((a, b) => b.wave - a.wave).slice(0, 12)) {
  console.log(`w${String(r.wave).padStart(2)} ${r.finalUnits.map((u) => { const [id, t] = u.split('★'); return `${UNIT_BY_ID[id]?.name ?? id}${t}`; }).join(' ')}`);
}
