import type { RunStats } from '../types';

// 한 판을 대표하는 제목. 완전 랜덤이 아니라 실제 플레이 기록에서 고른다.
// 조건을 만족하는 후보들 중 priority 가 가장 높은 묶음에서 seed 로 하나를 뽑는다.
export interface RunTitleDef {
  id: string;
  title: string;
  priority: number; // 높을수록 그 판을 더 잘 설명한다
  when: (c: RunTitleContext) => boolean;
}

export interface RunTitleContext {
  wave: number;
  stats: RunStats;
  mvpName: string | null;
  mvpDefId: string | null;
  eventCount: (id: string) => number;
  topEnemy: string | null; // 가장 많이 들어온 손님 id
}

export const RUN_TITLES: RunTitleDef[] = [
  // ── 아주 특징적인 판 (우선순위 높음) ──
  { id: 'cat', title: '고양이가 출근했다', priority: 90, when: (c) => c.stats.catVisits >= 2 },
  { id: 'lotto', title: '오늘 로또가 터졌다', priority: 88, when: (c) => c.eventCount('lottoWin') >= 1 },
  { id: 'realOwner', title: '진짜 사장님이 왔다', priority: 87, when: (c) => c.eventCount('realOwner') >= 1 },
  { id: 'stranger', title: '문이 열렸다', priority: 86, when: (c) => c.eventCount('stranger') >= 1 },
  { id: 'ownerSpam', title: '사장님이 너무 자주 전화한다', priority: 80, when: (c) => c.eventCount('ownerCall') >= 3 },
  { id: 'blackout', title: '불 꺼진 편의점', priority: 70, when: (c) => c.eventCount('blackout') >= 2 },

  // ── 플레이 스타일 ──
  { id: 'combo', title: '콤보에 미친 야간 알바', priority: 68, when: (c) => c.stats.bestCombo >= 60 },
  { id: 'mergeAddict', title: '합성 중독', priority: 66, when: (c) => c.stats.merges >= 20 },
  { id: 'bossHunter', title: '보스 전문 알바', priority: 65, when: (c) => c.stats.bossKills >= 3 },
  { id: 'legendary', title: '전설이 세 번 왔다', priority: 64, when: (c) => c.stats.legendaryDraws >= 3 },
  { id: 'noMerge', title: '합성을 모르는 알바', priority: 62, when: (c) => c.wave >= 10 && c.stats.merges === 0 },
  { id: 'skillSpam', title: '셔터를 너무 자주 내렸다', priority: 60, when: (c) => c.stats.skillsUsed >= 20 },

  // ── 손님 쪽 사정 ──
  { id: 'karen', title: '진상 손님이 너무 많다', priority: 58, when: (c) => c.topEnemy === 'karen3am' },
  { id: 'zombie', title: '좀비가 편의점에 왔다', priority: 57, when: (c) => (c.stats.enemySeen.zombie ?? 0) >= 12 },
  { id: 'ramen', title: '라면 코너의 반란', priority: 56, when: (c) => (c.stats.enemySeen.ramen ?? 0) >= 14 },
  { id: 'bike', title: '오토바이는 못 잡는다', priority: 55, when: (c) => (c.stats.reachedBy.bikeCourier ?? 0) >= 3 },
  { id: 'runner', title: '뛰는 사람은 못 막는다', priority: 54, when: (c) => (c.stats.reachedBy.runner ?? 0) >= 6 },
  { id: 'student', title: '야자가 끝났다', priority: 52, when: (c) => (c.stats.enemySeen.student ?? 0) >= 20 },

  // ── 도달 웨이브 ──
  { id: 'threeAm', title: '새벽 3시의 악몽', priority: 45, when: (c) => c.wave >= 13 && c.wave <= 16 },
  { id: 'earlyOut', title: '오늘은 조용하겠지', priority: 44, when: (c) => c.wave <= 5 },
  { id: 'dawn', title: '해 뜰 때까지 버텼다', priority: 48, when: (c) => c.wave >= 35 },
  { id: 'nightShift', title: '평범한 야간근무', priority: 20, when: () => true },
  { id: 'anotherNight', title: '또 하루가 갔다', priority: 20, when: () => true },
  { id: 'aloneAgain', title: '오늘도 혼자였다', priority: 20, when: () => true },
  { id: 'closed', title: '영업은 끝났다', priority: 20, when: () => true },
];

// MVP 유닛이 압도적이면 그 유닛으로 제목을 만든다 (우선순위 중간)
const MVP_TITLES: Record<string, string> = {
  microwave: '전자레인지에 모든 것을 맡겼다',
  manager: '점장님이 다 했다',
  pos: '포스기 한 대로 버텼다',
  cctv: 'CCTV가 다 보고 있다',
  coffee: '카페인으로 버틴 밤',
  ramenShelf: '라면을 던지는 알바',
  cat: '고양이가 제일 잘 싸웠다',
  alba: '알바생 혼자 다 했다',
};

export function pickRunTitle(ctx: RunTitleContext, rand: () => number): string {
  const matched = RUN_TITLES.filter((t) => t.when(ctx));
  // MVP 가 전체 피해의 절반을 넘으면 MVP 제목을 후보에 넣는다
  const total = Object.values(ctx.stats.unitDamage).reduce((a, b) => a + b, 0);
  const mvpDmg = ctx.mvpDefId ? (ctx.stats.unitDamage[ctx.mvpDefId] ?? 0) : 0;
  if (ctx.mvpDefId && total > 0 && mvpDmg / total >= 0.5 && MVP_TITLES[ctx.mvpDefId]) {
    matched.push({ id: `mvp:${ctx.mvpDefId}`, title: MVP_TITLES[ctx.mvpDefId], priority: 63, when: () => true });
  }
  if (matched.length === 0) return '평범한 야간근무';
  const top = Math.max(...matched.map((t) => t.priority));
  const best = matched.filter((t) => t.priority === top);
  return best[Math.floor(rand() * best.length) % best.length].title;
}
