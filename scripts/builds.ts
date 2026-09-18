// 빌드별 검증기.
//
// 기존 봇은 보상을 tone(best > good) 순으로만 고른다. 그래서 「줄 서서 기다리세요」
// (제어 +90% / 단일 -25%) 같은 카드를 단일딜 보드에서도 집어 든다. 그 상태의
// 평균 생존 웨이브는 "카드가 좋은가" 가 아니라 "봇이 아무거나 고른다" 를 잰 값이다.
//
// 여기서는 빌드를 미리 정하고, 그 빌드에 맞는 카드만 고르고, 맞는 유닛을 우선 배치한다.
// 보는 것: (1) 어느 빌드든 갈 만한가 (2) 하나가 압도적이지 않은가.
import { Engine } from '../src/game/engine/Engine';
import { metaEffects, DEFAULT_META_LEVELS } from '../src/game/save/meta';
import { UNIT_BY_ID } from '../src/game/data/units';
import { REWARD_CARDS } from '../src/game/data/rewards';
import type { MetaUpgradeId, UnitRole } from '../src/game/types';

type BuildId = 'dps' | 'aoe' | 'control' | 'support' | 'economy' | 'corner' | 'adjacent' | 'random';

interface Build {
  id: BuildId;
  name: string;
  /** 이 빌드가 반기는 카드 */
  want: string[];
  /** 이 빌드가 피하는 카드 */
  avoid: string[];
  /** 배치 정책 */
  place: 'sameRole' | 'mixSupport' | 'none';
  role?: UnitRole;
}

const BUILDS: Build[] = [
  { id: 'dps', name: '단일딜', role: 'dps', place: 'sameRole',
    want: ['regulars', 'fastHands', 'wideAisle', 'luckyHand', 'snack'], avoid: ['volume', 'crowdControl', 'firepower'] },
  { id: 'aoe', name: '광역딜', role: 'aoe', place: 'sameRole',
    want: ['volume', 'firepower', 'wideAisle', 'snack'], avoid: ['regulars', 'fastHands'] },
  { id: 'control', name: '감속·제어', role: 'control', place: 'sameRole',
    want: ['crowdControl', 'coldStore', 'shutterOil'], avoid: ['regulars', 'volume'] },
  { id: 'support', name: '지원·오라', role: 'support', place: 'mixSupport',
    want: ['backOffice', 'watchTower', 'unmanned', 'caffeine'], avoid: ['regulars', 'volume', 'crowdControl'] },
  { id: 'economy', name: '경제', place: 'none',
    want: ['clearance', 'wage', 'discount', 'posUpdate', 'nightRush', 'freeDraws'], avoid: ['unmanned'] },
  { id: 'corner', name: '코너 몰빵', place: 'none',
    want: ['cornerShop', 'shelf', 'wideAisle'], avoid: ['teamwork'] },
  { id: 'adjacent', name: '옆자리 시너지', place: 'sameRole',
    want: ['teamwork', 'nightCafe', 'snack'], avoid: ['cornerShop'] },
  { id: 'random', name: '아무거나(대조군)', place: 'none', want: [], avoid: [] },
];

const RUNS = Number(process.argv[2] ?? 14);
const CAP = 45;

function pickReward(b: Build, offers: { defId: string }[], rng: () => number): string {
  const want = offers.find((o) => b.want.includes(o.defId));
  if (want) return want.defId;
  const ok = offers.filter((o) => !b.avoid.includes(o.defId));
  const pool = ok.length > 0 ? ok : offers;
  return pool[Math.floor(rng() * pool.length)].defId;
}

function run(b: Build, stageId: string, shelves: number, seed: number) {
  const levels = { ...DEFAULT_META_LEVELS } as Record<MetaUpgradeId, number>;
  for (const k of Object.keys(levels) as MetaUpgradeId[]) levels[k] = Math.min(6, Math.floor(shelves / 2));
  levels.shelves = shelves;
  const engine = new Engine({ seed, stageId, meta: metaEffects(levels) });
  const s = engine.state;
  let n = seed * 7919 + 13;
  const rng = () => ((n = (n * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);

  for (let i = 0; i < 60000 && s.phase !== 'gameover' && s.wave <= CAP; i++) {
    const snap = engine.snapshot();
    for (const g of snap.groups) if (g.mergeable) engine.dispatch({ type: 'MERGE', defId: g.defId, tier: g.tier });
    if (snap.tierMerge) engine.dispatch({ type: 'MERGE_TIER', tier: snap.tierMerge.tier });
    if (snap.canDraw) engine.dispatch({ type: 'DRAW' });
    else if (snap.junkCount > 0 && snap.emptySlots === 0) engine.dispatch({ type: 'SELL_JUNK' });
    else for (const o of snap.mergeBuy) if (s.coins >= o.cost * 1.2) engine.dispatch({ type: 'MERGE_BUY', defId: o.defId });

    // 빌드를 고르는 것만으로는 보드가 그 빌드가 되지 않는다.
    // 실제 플레이어는 안 맞는 유닛을 판다 — 그걸 안 하면 「단골 장사」(단일 +80% /
    // 광역 -30%) 같은 카드를 잡탕 보드에 얹어 페널티만 먹는다.
    // (이걸 빼고 돌렸더니 대조군 '아무거나' 가 특화 빌드 전부를 이겼다.)
    if (b.role && i % 20 === 0) cull(engine, b.role);

    // 배치: 같은 계열끼리 모으거나, 지원을 사이사이에 끼운다.
    if (b.place !== 'none' && i % 30 === 0) arrange(engine, b);

    engine.tick(1 / 6);
    engine.drainFx();
    if (s.phase === 'reward') engine.dispatch({ type: 'CHOOSE_REWARD', defId: pickReward(b, s.rewardOffers, rng) });
    else if (s.phase === 'promote' && s.promoteChoice) engine.dispatch({ type: 'CHOOSE_PROMOTE', defId: s.promoteChoice.options[0] });
    else if (s.phase === 'eventChoice') engine.dispatch({ type: 'CHOOSE_EVENT', index: 0 });
  }
  const roleDmg: Partial<Record<UnitRole, number>> = {};
  for (const [id, dmg] of Object.entries(s.stats.unitDamage)) {
    const r = UNIT_BY_ID[id]?.role;
    if (r) roleDmg[r] = (roleDmg[r] ?? 0) + dmg;
  }
  const total = Object.values(roleDmg).reduce((a, x) => a + x, 0) || 1;
  return { wave: s.wave, capped: s.wave > CAP, min: s.time / 60, share: (b.role ? (roleDmg[b.role] ?? 0) : 0) / total };
}

// 빌드에 안 맞는 1티어 외톨이를 하나 판다.
// 보드의 절반 이상이 원하는 계열이면 그만둔다 — 계속 팔면 뽑기·판매만 돌게 된다.
// 값나가는 것(에픽 이상)과 합성 짝이 있는 것은 남긴다.
function cull(engine: Engine, want: UnitRole): void {
  const s = engine.state;
  if (s.units.length < 4) return;
  const mine = s.units.filter((u) => UNIT_BY_ID[u.defId].role === want).length;
  if (mine / s.units.length >= 0.5) return;
  const count = new Map<string, number>();
  for (const u of s.units) if (u.tier === 1) count.set(u.defId, (count.get(u.defId) ?? 0) + 1);
  const target = s.units.find((u) => {
    const def = UNIT_BY_ID[u.defId];
    if (u.tier !== 1 || def.role === want) return false;
    if (def.rarity === 'epic' || def.rarity === 'legendary' || def.rarity === 'special') return false;
    return (count.get(u.defId) ?? 0) === 1; // 짝이 있으면 합성 재료로 남긴다
  });
  if (target) engine.dispatch({ type: 'SELL', unitId: target.id });
}

// 같은 계열을 옆으로 모은다 (place='sameRole'), 또는 지원을 한 칸 걸러 끼운다.
function arrange(engine: Engine, b: Build): void {
  const s = engine.state;
  const open = s.slots.filter((sl) => !sl.locked && !sl.blocked);
  const byRole = [...s.units].sort((x, y) => {
    const rx = UNIT_BY_ID[x.defId].role;
    const ry = UNIT_BY_ID[y.defId].role;
    if (b.place === 'mixSupport') {
      // 지원 / 비지원 / 지원 / 비지원 … 으로 섞는다
      const sx = rx === 'support' ? 0 : 1;
      const sy = ry === 'support' ? 0 : 1;
      if (sx !== sy) return sx - sy;
    }
    return rx.localeCompare(ry);
  });
  if (b.place === 'mixSupport') {
    const sup = byRole.filter((u) => UNIT_BY_ID[u.defId].role === 'support');
    const rest = byRole.filter((u) => UNIT_BY_ID[u.defId].role !== 'support');
    const order = [];
    while (sup.length || rest.length) {
      if (rest.length) order.push(rest.shift()!);
      if (sup.length) order.push(sup.shift()!);
      if (rest.length) order.push(rest.shift()!);
    }
    byRole.length = 0;
    byRole.push(...order);
  }
  // 목표 배치로 하나씩 옮긴다 (MOVE 는 교환이므로 순서대로 밀어 넣으면 정리된다)
  byRole.forEach((u, i) => {
    const target = open[i];
    if (target && u.slot !== target.index) engine.dispatch({ type: 'MOVE', unitId: u.id, slot: target.index });
  });
}

const med = (a: number[]) => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)];
const mean = (a: number[]) => a.reduce((x, y) => x + y, 0) / a.length;

for (const stageId of ['alley']) {
  for (const shelves of [4]) {
    console.log(`\n${stageId} · 증축 ${shelves} (${RUNS}판)`);
    console.log('빌드            wave중앙 평균  최소~최대   분   계열지분  상한');
    const rows: [string, number][] = [];
    for (const b of BUILDS) {
      const o = Array.from({ length: RUNS }, (_, i) => run(b, stageId, shelves, 7000 + i));
      const w = o.map((x) => x.wave);
      rows.push([b.name, med(w)]);
      console.log(
        `${b.name.padEnd(14)} ${String(med(w)).padStart(6)} ${mean(w).toFixed(1).padStart(5)}  ` +
        `${String(Math.min(...w)).padStart(3)}~${String(Math.max(...w)).padEnd(4)} ` +
        `${mean(o.map((x) => x.min)).toFixed(1).padStart(5)} ` +
        `${b.role ? `${(mean(o.map((x) => x.share)) * 100).toFixed(0)}%`.padStart(7) : '      -'} ` +
        `${((o.filter((x) => x.capped).length / o.length) * 100).toFixed(0).padStart(4)}%`,
      );
    }
    const vals = rows.map((r) => r[1]);
    const lo = Math.min(...vals);
    const hi = Math.max(...vals);
    console.log(`→ 최저 ${lo} (${rows.find((r) => r[1] === lo)![0]}) · 최고 ${hi} (${rows.find((r) => r[1] === hi)![0]}) · 격차 ${(hi / Math.max(1, lo)).toFixed(2)}배`);
  }
}
void REWARD_CARDS;
