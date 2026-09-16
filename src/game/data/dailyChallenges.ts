import type { ChallengeSpec } from '../types';

// ZUNRAN DAILY — 하루 하나씩 돌아가는 특별 규칙.
// 새 시스템이 아니라 기존 Modifiers / 뽑기 확률 / 웨이브 생성에 곱해지는 값 묶음이다.
export const DAILY_CHALLENGES: ChallengeSpec[] = [
  {
    id: 'drinkNight',
    name: '음료의 밤',
    desc: ['음료 코너 유닛 공격력 +100%', '그 외 코너 공격력 -20%'],
    goalWave: 15,
    aisleDmg: [2, 0.8, 0.8],
  },
  {
    id: 'blackoutNight',
    name: '정전',
    desc: ['모든 유닛 공격속도 -30%', '코인 획득량 +100%'],
    goalWave: 14,
    modifiers: { unitAtkSpeed: 0.7, coinGain: 2, darkness: 0.45 },
  },
  {
    id: 'expiredNight',
    name: '폐기 대란',
    desc: ['폐기·유통기한 사건이 자주 터진다', '코인 획득량 +40%'],
    goalWave: 15,
    modifiers: { coinGain: 1.4 },
    eventWeight: { expiredFood: 8, snackTime: 3, onePlusOne: 3 },
  },
  {
    id: 'crowdNight',
    name: '손님 폭주',
    desc: ['손님 수 +50%', '손님 체력 -35%'],
    goalWave: 16,
    enemyCountMult: 1.5,
    enemyHpMult: 0.65,
  },
  {
    id: 'noManager',
    name: '점장님 없는 날',
    desc: ['점장이 나오지 않는다', '희귀 확률 +8%p'],
    goalWave: 15,
    banUnits: ['manager'],
    boostRarity: { rare: 0.08 },
  },
  {
    id: 'rainyNight',
    name: '비 오는 밤',
    desc: ['손님 이동속도 -20%', '유닛 공격력 -15%', '코인 +30%'],
    goalWave: 16,
    modifiers: { enemySpeed: 0.8, unitDmg: 0.85, coinGain: 1.3, rain: true },
  },
  {
    id: 'ramenRiot',
    name: '라면 코너의 밤',
    desc: ['라면 코너 공격력 +80%', '손님 체력 +20%'],
    goalWave: 15,
    aisleDmg: [1, 1, 1.8],
    enemyHpMult: 1.2,
  },
  {
    id: 'fastNight',
    name: '빨리빨리',
    desc: ['손님 이동속도 +35%', '유닛 공격속도 +25%'],
    goalWave: 15,
    modifiers: { enemySpeed: 1.35, unitAtkSpeed: 1.25 },
  },
  {
    id: 'luckyNight',
    name: '운수 좋은 날',
    desc: ['에픽 +5%p · 전설 +2%p', '손님 체력 +30%'],
    goalWave: 17,
    boostRarity: { epic: 0.05, legendary: 0.02 },
    enemyHpMult: 1.3,
  },
  {
    id: 'quietNight',
    name: '조용한 밤',
    desc: ['손님 수 -25%', '코인 획득량 -30%', '멀리 가야 한다'],
    goalWave: 20,
    enemyCountMult: 0.75,
    modifiers: { coinGain: 0.7 },
  },
];

export const CHALLENGE_BY_ID: Record<string, ChallengeSpec> = Object.fromEntries(DAILY_CHALLENGES.map((c) => [c.id, c]));
