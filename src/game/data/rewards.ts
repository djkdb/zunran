import type { RewardCardDef } from '../types';
import { UNIT_BY_ID } from './units';

// 웨이브 보상 카드. 3장 중 1장을 고른다 — 이 판만 유지되는 로그라이크 강화.
// tone: normal(무난) / good(좋음) / best(대박) — UI 색과 등장 확률에 쓰인다.
export const REWARD_CARDS: RewardCardDef[] = [
  {
    id: 'wage',
    name: '시급 인상',
    desc: '이후 모든 웨이브 시급 2배',
    icon: 'coin',
    tone: 'good',
    kind: 'build',
    weight: 8,
    apply: (c) => {
      // 즉시 코인은 선택률 10/105. 한 번 받고 끝나기 때문이다.
      // 판 끝까지 복리로 쌓이게 바꾸면 '일찍 고를수록 좋은 카드'가 된다.
      c.state.perma.incomeMult *= 2;
      c.banner('시급 인상', '이후 모든 웨이브 시급 2배');
    },
  },
  {
    id: 'snack',
    name: '야식 지원',
    desc: '모든 유닛 공격력 +10%',
    icon: 'draw',
    tone: 'good',
    kind: 'stat',
    weight: 9,
    apply: (c) => {
      c.state.perma.dmg *= 1.1;
      c.banner('야식 지원', '모든 유닛 공격력 +10%');
    },
  },
  {
    id: 'caffeine',
    name: '카페인 충전',
    desc: '모든 유닛 공격속도 +10%',
    icon: 'clock',
    tone: 'good',
    kind: 'stat',
    weight: 9,
    apply: (c) => {
      c.state.perma.atkSpeed *= 1.1;
      c.banner('카페인 충전', '공격속도 +10%');
    },
  },
  {
    id: 'shelf',
    name: '진열대 재배치',
    desc: '사거리 +30 · 코너 배치 보너스 2배',
    icon: 'store',
    tone: 'good',
    kind: 'build',
    weight: 7,
    apply: (c) => {
      // 선택률 1/92 였다. 사거리 +14 는 체감이 없다.
      // 코너 보너스를 2배로 만들어 "어디에 둘까"를 보상의 축으로 올린다.
      c.state.perma.range += 30;
      c.state.perma.aisleMult += 1;
      c.banner('진열대 재배치', '사거리 +30 · 코너 보너스 2배');
    },
  },
  {
    id: 'posUpdate',
    name: '발주 시스템 개편',
    desc: '본사 발주 비용 -40%',
    icon: 'chart',
    tone: 'good',
    kind: 'build',
    weight: 7,
    apply: (c) => {
      // 코인 +15% 는 선택률 7/78 이었다. 코인 자체가 목적이 아니기 때문이다.
      // 대신 '원하는 유닛을 산다'는 축을 싸게 만들어 전략을 하나 열어준다.
      c.state.perma.orderDiscount = Math.min(0.7, c.state.perma.orderDiscount + 0.4);
      c.banner('발주 시스템 개편', '본사 발주 비용 -40%');
    },
  },
  {
    id: 'discount',
    name: '사장님 인심',
    desc: '뽑기 비용 영구 -25원',
    icon: 'tag',
    tone: 'good',
    kind: 'stat',
    weight: 7,
    apply: (c) => {
      c.state.perma.drawDiscount += 25;
      c.banner('사장님 인심', '뽑기 -25원');
    },
  },
  {
    id: 'hire',
    name: '신입 채용',
    desc: '희귀 유닛 1개를 바로 받는다',
    icon: 'gem',
    tone: 'good',
    kind: 'stat',
    weight: 8,
    available: (s) => s.slots.some((sl) => sl.unitId === null),
    apply: (c) => {
      const id = c.grantUnit('rare');
      c.banner('신입 채용', id ? `${UNIT_BY_ID[id].name} 합류` : '자리가 없다');
    },
  },
  {
    id: 'hqSupport',
    name: '본사 지원',
    desc: '에픽 유닛 1개를 바로 받는다',
    icon: 'star',
    tone: 'best',
    kind: 'stat',
    weight: 4,
    minWave: 6,
    available: (s) => s.slots.some((sl) => sl.unitId === null),
    apply: (c) => {
      const id = c.grantUnit('epic');
      c.banner('본사 지원', id ? `${UNIT_BY_ID[id].name} 합류` : '자리가 없다');
    },
  },
  {
    id: 'promote',
    name: '승진',
    desc: '보유 유닛 하나의 티어를 올린다',
    icon: 'trophy',
    tone: 'best',
    kind: 'stat',
    weight: 5,
    available: (s) => s.units.some((u) => u.tier < 5),
    apply: (c) => {
      const id = c.upgradeRandomUnit();
      c.banner('승진', id ? `${UNIT_BY_ID[id].name} 티어 상승` : '대상이 없다');
    },
  },
  {
    id: 'insurance',
    name: '보험 가입',
    desc: '최대 체력 +15, 체력 전부 회복',
    icon: 'heart',
    tone: 'good',
    kind: 'stat',
    weight: 4,
    apply: (c) => {
      c.state.maxHp += 15;
      c.state.hp = c.state.maxHp;
      c.banner('보험 가입', '체력 완전 회복');
    },
  },
  {
    id: 'repair',
    name: '응급 복구',
    desc: '체력 전부 회복 · 최대 체력 +10',
    icon: 'heart',
    tone: 'good',
    kind: 'stat',
    weight: 6,
    available: (s) => s.hp < s.maxHp * 0.85,
    apply: (c) => {
      const before = c.state.hp;
      c.state.maxHp += 10;
      c.state.hp = c.state.maxHp;
      c.banner('응급 복구', `체력 +${Math.round(c.state.hp - before)} · 최대 체력 +10`);
    },
  },
  {
    id: 'firepower',
    name: '화력 집중',
    desc: '범위형 유닛 공격력 +35%',
    icon: 'boss',
    tone: 'good',
    kind: 'build',
    weight: 7,
    apply: (c) => {
      c.state.perma.roleDmg.aoe *= 1.35;
      c.banner('화력 집중', '범위형 +35%');
    },
  },
  {
    id: 'fastHands',
    name: '손 빠른 알바',
    desc: '단일 공격형 유닛 공격력 +35%',
    icon: 'merge',
    tone: 'good',
    kind: 'build',
    weight: 7,
    apply: (c) => {
      c.state.perma.roleDmg.dps *= 1.35;
      c.banner('손 빠른 알바', '단일형 +35%');
    },
  },
  {
    id: 'watchTower',
    name: '감시 강화',
    desc: '지원 유닛의 오라 효과 +45%',
    icon: 'book',
    tone: 'good',
    kind: 'build',
    weight: 6,
    available: (s) => s.units.some((u) => UNIT_BY_ID[u.defId].aura !== undefined),
    apply: (c) => {
      c.state.perma.auraMult *= 1.45;
      c.banner('감시 강화', '오라 효과 +45%');
    },
  },
  {
    id: 'luckyHand',
    name: '행운의 손',
    desc: '모든 유닛 치명타 확률 +10%',
    icon: 'gem',
    tone: 'good',
    kind: 'stat',
    weight: 6,
    apply: (c) => {
      c.state.perma.critChance += 0.1;
      c.banner('행운의 손', '치명타 +10%');
    },
  },
  {
    id: 'freeDraws',
    name: '박스 입고',
    desc: '무료 뽑기 3회 · 그 3회는 희귀 이상 확정',
    icon: 'draw',
    tone: 'good',
    kind: 'stat',
    weight: 7,
    apply: (c) => {
      // 무료 뽑기 3회는 선택률 2/94 였다. 후반에 뽑기는 돈이 아니라 칸의 문제라서다.
      // 등급을 보장해 "지금 판을 바꿀 수 있다"로 만든다.
      c.state.freeDraws += 3;
      c.state.guaranteedRareDraws += 3;
      c.banner('박스 입고', '무료 뽑기 3회 · 희귀 이상 확정');
    },
  },
  {
    id: 'legendHunch',
    name: '전설의 예감',
    desc: '뽑기 전설 확률 +3%p',
    icon: 'star',
    tone: 'best',
    kind: 'stat',
    weight: 4,
    minWave: 4,
    apply: (c) => {
      c.state.perma.legendaryOdds += 0.03;
      c.banner('전설의 예감', '전설 확률 +3%p');
    },
  },
  {
    id: 'nightRush',
    name: '새벽 장사',
    desc: '다음 웨이브 손님 +60% · 대신 코인 2배',
    icon: 'boss',
    tone: 'best',
    kind: 'build',
    weight: 5,
    minWave: 4,
    apply: (c) => {
      c.state.riskWave = c.state.wave + 1;
      c.banner('새벽 장사', '다음 웨이브는 지옥이다');
    },
  },
  {
    id: 'shutterOil',
    name: '셔터 개조',
    desc: '긴급 스킬 쿨다운 -40% · 지금 즉시 사용 가능',
    icon: 'restart',
    tone: 'good',
    kind: 'build',
    weight: 6,
    apply: (c) => {
      // 200판에서 0/59. 한 번 쓰고 끝나는 카드는 지속 강화 옆에서 이길 수 없다.
      // 판 전체에 남는 효과로 바꾼다.
      c.state.perma.skillCdMult *= 0.6;
      c.state.skills.shutter = 0;
      c.state.skills.dump = 0;
      c.banner('셔터 개조', '긴급 스킬 쿨다운 -40%');
    },
  },
  // ───── 전환 카드 ─────
  // 여기까지의 보상은 전부 "공짜로 강해진다"였다. 선택률 상위 4장이 모두 그랬다.
  // 아래 넷은 무언가를 포기해야 무언가를 얻는다 — 그래야 빌드가 '선택'이 된다.
  {
    id: 'regulars',
    name: '단골 장사',
    desc: '단일 대상 유닛 +80% · 범위 유닛 -30%',
    icon: 'tag',
    tone: 'best',
    kind: 'build',
    weight: 5,
    minWave: 7,
    apply: (c) => {
      c.state.perma.roleDmg.dps *= 1.8;
      c.state.perma.roleDmg.aoe *= 0.7;
      c.banner('단골 장사', '한 명씩 확실하게');
    },
  },
  {
    id: 'volume',
    name: '박리다매',
    desc: '범위 유닛 +80% · 단일 대상 유닛 -30%',
    icon: 'gem',
    tone: 'best',
    kind: 'build',
    weight: 5,
    minWave: 7,
    apply: (c) => {
      c.state.perma.roleDmg.aoe *= 1.8;
      c.state.perma.roleDmg.dps *= 0.7;
      c.banner('박리다매', '한꺼번에 처리한다');
    },
  },
  {
    id: 'coldStore',
    name: '얼음 매장',
    desc: '모든 감속 효과 +60% · 모든 공격력 -15%',
    icon: 'bulb',
    tone: 'best',
    kind: 'build',
    weight: 5,
    minWave: 7,
    apply: (c) => {
      c.state.perma.slowMult *= 1.6;
      c.state.perma.dmg *= 0.85;
      c.banner('얼음 매장', '아무도 빨리 못 지나간다');
    },
  },
  {
    id: 'unmanned',
    name: '무인 운영',
    desc: '지원 유닛 오라 2배 · 진열대 3칸이 막힌다',
    icon: 'store',
    tone: 'best',
    kind: 'build',
    weight: 4,
    minWave: 10,
    available: (s) => s.slots.filter((sl) => !sl.blocked).length > 12,
    apply: (c) => {
      c.state.perma.auraMult *= 2;
      // 뒤쪽 빈 칸부터 막는다. 유닛이 있는 칸은 건드리지 않는다.
      let left = 3;
      for (let i = c.state.slots.length - 1; i >= 0 && left > 0; i--) {
        const sl = c.state.slots[i];
        if (sl.blocked || sl.unitId !== null) continue;
        sl.blocked = true;
        left--;
      }
      c.banner('무인 운영', '사람이 줄고 기계가 는다');
    },
  },
];

export const REWARD_BY_ID: Record<string, RewardCardDef> = Object.fromEntries(REWARD_CARDS.map((r) => [r.id, r]));
