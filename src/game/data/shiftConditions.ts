import type { ChallengeSpec } from '../types';

// 「오늘의 근무 조건」 — 판 시작 직전에 3장 중 1장을 고른다.
//
// 왜 고정 메뉴가 아니라 매번 랜덤 3장인가:
// 고정 메뉴는 최적해가 발견되는 순간 선택이 아니라 절차가 된다(덱에서 겪은 문제 그대로다).
// 매번 다른 3장을 제시하면 프리런 단계 자체가 복권으로 남는다.
// Slay the Spire 의 Neow, Hades 의 징벌의 서약이 같은 구조를 쓴다.
//
// 대부분 이득과 손해를 함께 진다. 손해가 클수록 점수 배율이 높아서,
// 리더보드 경쟁이 "최적 덱 찾기"가 아니라 "어디까지 감당하나"가 된다.

export interface ShiftCondition {
  id: string;
  name: string;
  line: string; // 카드에 보여줄 한 줄
  good: string; // 이득
  bad: string | null; // 손해 (없으면 순수 이득 — 대신 배율이 낮다)
  scoreMult: number; // 야간 수당·점수 배율
  spec: Omit<ChallengeSpec, 'id' | 'name' | 'desc' | 'goalWave'>;
  // 엔진 밖에서 처리하는 것 (시작 자원 등)
  startCoins?: number;
  startHpMult?: number;
  freeDraws?: number;
  drawCostMult?: number;
  blockSlots?: number; // 배치 칸 봉쇄
}

export const SHIFT_CONDITIONS: ShiftCondition[] = [
  {
    id: 'nightPay',
    name: '야간수당',
    line: '오늘은 수당이 잘 나온다',
    good: '코인 획득 +25%',
    bad: null,
    scoreMult: 1,
    spec: { modifiers: { coinGain: 1.25 } },
  },
  {
    id: 'rushHour',
    name: '진상 손님',
    line: '오늘따라 사람이 드세다',
    good: '점수 ×1.7',
    bad: '손님 체력 +35%',
    scoreMult: 1.7,
    spec: { enemyHpMult: 1.35 },
  },
  {
    id: 'brokenPos',
    name: '포스기 고장',
    line: '계산대가 맛이 갔다. 한 번만 뚫려도 끝',
    good: '점수 ×1.9',
    bad: '시작 체력 25%',
    scoreMult: 1.9,
    spec: {},
    startHpMult: 0.25,
  },
  {
    id: 'discardBox',
    name: '폐기 도시락',
    line: '버리기 아까운 게 남았다',
    good: '무료 뽑기 4회 · 점수 ×1.15',
    bad: null,
    scoreMult: 1.15,
    spec: {},
    freeDraws: 4,
  },
  {
    id: 'inventoryDay',
    name: '재고 조사',
    line: '본사에서 재고를 털어 갔다',
    good: '시작 코인 +600원 · 점수 ×1.3',
    bad: '뽑기 비용 +40%',
    scoreMult: 1.3,
    spec: {},
    startCoins: 600,
    drawCostMult: 1.4,
  },
  {
    id: 'crowdNight',
    name: '단체 손님',
    line: '버스가 한 대 섰나 보다',
    good: '코인·처치가 늘어난다',
    bad: '손님 수 +50%',
    // 손님이 늘면 처치와 코인이 자연히 늘어 수당이 이미 오른다.
    // 여기에 코인 배율·점수 배율을 더 얹으면 삼중으로 먹혀 유일한 정답이 된다.
    scoreMult: 1.05,
    spec: { enemyCountMult: 1.5 },
  },
  {
    id: 'blackout',
    name: '정전 예보',
    line: '전기가 자꾸 나간다',
    good: '점수 ×1.6 · 희귀 확률 +5%p',
    bad: '유닛 공격속도 -20%',
    scoreMult: 1.6,
    spec: { modifiers: { unitAtkSpeed: 0.8 }, boostRarity: { rare: 0.05 } },
  },
  {
    id: 'freshDelivery',
    name: '신상 입고',
    line: '좋은 물건이 들어왔다',
    good: '에픽 +4%p · 전설 +1.5%p',
    bad: '시작 코인 -100원',
    scoreMult: 1.15,
    spec: { boostRarity: { epic: 0.04, legendary: 0.015 } },
    startCoins: -100,
  },
  {
    id: 'shortStaff',
    name: '혼자 근무',
    line: '교대가 안 왔다. 진열대가 줄었다',
    good: '점수 ×1.75',
    bad: '배치 칸 6개 봉쇄',
    scoreMult: 1.75,
    spec: {},
    blockSlots: 6,
  },
  {
    id: 'auditNight',
    name: '본사 감사',
    line: '위에서 보고 있다. 실수하면 안 된다',
    good: '점수 ×2.3',
    bad: '손님 체력 +30% · 시작 체력 50%',
    scoreMult: 2.3,
    spec: { enemyHpMult: 1.3 },
    startHpMult: 0.5,
  },
];

export const CONDITION_BY_ID: Record<string, ShiftCondition> = Object.fromEntries(SHIFT_CONDITIONS.map((c) => [c.id, c]));

// 이번 판에 제시할 3장. 시드로 뽑아 재현 가능하게 하고, 위험도가 다양하게 섞이도록
// 하나는 안전한 것(배율 1.0~1.2)에서 고른다 — 세 장 다 도박이면 선택이 아니라 강요다.
export function offerConditions(rand: () => number, count = 3): ShiftCondition[] {
  const safe = SHIFT_CONDITIONS.filter((c) => c.scoreMult <= 1.2);
  const risky = SHIFT_CONDITIONS.filter((c) => c.scoreMult > 1.2);
  const pick = <T,>(pool: T[], n: number): T[] => {
    const rest = [...pool];
    const out: T[] = [];
    while (out.length < n && rest.length) out.push(...rest.splice(Math.floor(rand() * rest.length), 1));
    return out;
  };
  return [...pick(safe, 1), ...pick(risky, count - 1)];
}

// 오늘의 조건과 ZUNRAN DAILY 규칙을 하나로 합친다.
// 엔진은 ChallengeSpec 하나만 알면 되도록 — 규칙 적용 경로를 둘로 늘리지 않는다.
export function mergeIntoChallenge(daily: ChallengeSpec | null, cond: ShiftCondition | null): ChallengeSpec | null {
  if (!cond) return daily;
  const s = cond.spec;
  const base: ChallengeSpec = daily ?? { id: 'shift', name: cond.name, desc: [], goalWave: 0 };
  const mul = (a: number | undefined, b: number | undefined) => (a ?? 1) * (b ?? 1);
  return {
    ...base,
    id: daily ? `${daily.id}+${cond.id}` : cond.id,
    modifiers: {
      ...base.modifiers,
      ...s.modifiers,
      // 둘 다 건드리는 값은 곱한다
      coinGain: mul(base.modifiers?.coinGain, s.modifiers?.coinGain),
      unitAtkSpeed: mul(base.modifiers?.unitAtkSpeed, s.modifiers?.unitAtkSpeed),
      unitDmg: mul(base.modifiers?.unitDmg, s.modifiers?.unitDmg),
      enemySpeed: mul(base.modifiers?.enemySpeed, s.modifiers?.enemySpeed),
    },
    enemyHpMult: mul(base.enemyHpMult, s.enemyHpMult),
    enemyCountMult: mul(base.enemyCountMult, s.enemyCountMult),
    banUnits: [...(base.banUnits ?? []), ...(s.banUnits ?? [])],
    boostRarity: { ...base.boostRarity, ...s.boostRarity },
  };
}
