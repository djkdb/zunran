import type { RewardCardDef } from '../types';
import { UNIT_BY_ID } from './units';

// 웨이브 보상 카드. 3장 중 1장을 고른다 — 이 판만 유지되는 로그라이크 강화.
// tone: normal(무난) / good(좋음) / best(대박) — UI 색과 등장 확률에 쓰인다.
export const REWARD_CARDS: RewardCardDef[] = [
  {
    id: 'wage',
    name: '시급 인상',
    desc: '지금 바로 코인을 받는다',
    icon: 'coin',
    tone: 'normal',
    weight: 10,
    apply: (c) => {
      const n = 220 + c.state.wave * 45;
      c.addCoins(n);
      c.banner('시급 인상', `+${n}원`);
    },
  },
  {
    id: 'snack',
    name: '야식 지원',
    desc: '모든 유닛 공격력 +10%',
    icon: 'draw',
    tone: 'good',
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
    weight: 9,
    apply: (c) => {
      c.state.perma.atkSpeed *= 1.1;
      c.banner('카페인 충전', '공격속도 +10%');
    },
  },
  {
    id: 'shelf',
    name: '진열대 정리',
    desc: '모든 유닛 사거리 +14',
    icon: 'store',
    tone: 'normal',
    weight: 8,
    apply: (c) => {
      c.state.perma.range += 14;
      c.banner('진열대 정리', '사거리 +14');
    },
  },
  {
    id: 'posUpdate',
    name: '포스기 업데이트',
    desc: '코인 획득 +15%',
    icon: 'chart',
    tone: 'normal',
    weight: 8,
    apply: (c) => {
      c.state.perma.coin *= 1.15;
      c.banner('포스기 업데이트', '코인 획득 +15%');
    },
  },
  {
    id: 'discount',
    name: '사장님 인심',
    desc: '뽑기 비용 영구 -25원',
    icon: 'tag',
    tone: 'good',
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
    desc: '체력 25 회복',
    icon: 'heart',
    tone: 'normal',
    weight: 5,
    available: (s) => s.hp < s.maxHp * 0.85,
    apply: (c) => {
      const before = c.state.hp;
      c.state.hp = Math.min(c.state.maxHp, c.state.hp + 25);
      c.banner('응급 복구', `체력 +${Math.round(c.state.hp - before)}`);
    },
  },
  {
    id: 'firepower',
    name: '화력 집중',
    desc: '범위형 유닛 공격력 +35%',
    icon: 'boss',
    tone: 'good',
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
    weight: 6,
    apply: (c) => {
      c.state.perma.critChance += 0.1;
      c.banner('행운의 손', '치명타 +10%');
    },
  },
  {
    id: 'freeDraws',
    name: '폐기 처분',
    desc: '무료 뽑기 3회',
    icon: 'draw',
    tone: 'normal',
    weight: 8,
    apply: (c) => {
      c.state.freeDraws += 3;
      c.banner('폐기 처분', '무료 뽑기 3회');
    },
  },
  {
    id: 'legendHunch',
    name: '전설의 예감',
    desc: '뽑기 전설 확률 +3%p',
    icon: 'star',
    tone: 'best',
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
    weight: 5,
    minWave: 4,
    apply: (c) => {
      c.state.riskWave = c.state.wave + 1;
      c.banner('새벽 장사', '다음 웨이브는 지옥이다');
    },
  },
  {
    id: 'shutterOil',
    name: '셔터 기름칠',
    desc: '긴급 스킬 쿨다운 즉시 초기화',
    icon: 'restart',
    tone: 'normal',
    weight: 6,
    available: (s) => s.skills.shutter > 1 || s.skills.dump > 1,
    apply: (c) => {
      c.state.skills.shutter = 0;
      c.state.skills.dump = 0;
      c.banner('셔터 기름칠', '긴급 스킬 준비 완료');
    },
  },
];

export const REWARD_BY_ID: Record<string, RewardCardDef> = Object.fromEntries(REWARD_CARDS.map((r) => [r.id, r]));
