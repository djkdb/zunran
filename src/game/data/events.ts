import type { EventDef } from '../types';

// 랜덤 이벤트. duration 이 0이면 즉시형. modifiers 는 지속 시간 동안 전역 배율에 곱해진다.
export const EVENT_DEFS: EventDef[] = [
  {
    id: 'rush',
    title: '갑자기 손님이 몰려왔습니다',
    desc: '손님 8명 추가',
    minWave: 3,
    weight: 6,
    duration: 0,
    mood: 'bad',
    apply: (c) => c.spawn('basic', 8, { spread: 3 }),
  },
  {
    id: 'microwaveBroken',
    title: '전자레인지가 고장났습니다',
    desc: '전자레인지 공격력 -50% (20초)',
    minWave: 4,
    weight: 3,
    duration: 20,
    mood: 'bad',
    modifiers: { unitDmgById: { microwave: 0.5 } },
  },
  {
    id: 'inspection',
    title: '본사에서 점검을 나왔습니다',
    desc: '유닛 하나가 10초간 점검 중',
    minWave: 4,
    weight: 4,
    duration: 0,
    mood: 'bad',
    apply: (c) => {
      c.disableRandomUnit(10);
    },
  },
  {
    id: 'onePlusOne',
    title: '1+1 행사 시작!',
    desc: '삼각김밥·라면 진열대 공격력 2배 (20초)',
    minWave: 3,
    weight: 5,
    duration: 20,
    mood: 'good',
    modifiers: { unitDmgById: { onigiri: 2, ramenShelf: 2 } },
  },
  {
    id: 'rain',
    title: '비가 오기 시작했습니다',
    desc: '손님 이동속도 -30% (20초)',
    minWave: 3,
    weight: 5,
    duration: 20,
    mood: 'good',
    modifiers: { enemySpeed: 0.7, rain: true },
  },
  {
    id: 'deliveryRush',
    title: '배달 주문 폭주!',
    desc: '배달기사 6명 등장',
    minWave: 7,
    weight: 4,
    duration: 0,
    mood: 'bad',
    apply: (c) => c.spawn('delivery', 6, { spread: 2 }),
  },
  {
    id: 'blackout',
    title: '정전!',
    desc: '모든 유닛 공격속도 -35% (10초)',
    minWave: 6,
    weight: 3,
    duration: 10,
    mood: 'bad',
    modifiers: { unitAtkSpeed: 0.65, darkness: 0.55 },
  },
  {
    id: 'expiredFood',
    title: '폐기 시간',
    desc: '폐기 도시락으로 저녁 해결. 무료 뽑기 +1',
    minWave: 3,
    weight: 4,
    duration: 0,
    mood: 'good',
    apply: (c) => c.freeDraw(),
  },
  {
    id: 'foundCoins',
    title: '바닥에서 동전을 주웠다',
    desc: '+120원',
    minWave: 3,
    weight: 4,
    duration: 0,
    mood: 'good',
    apply: (c) => c.addCoins(120, '동전 발견'),
  },
  {
    id: 'drunkParty',
    title: '회식 끝난 무리 등장',
    desc: '술 취한 친구들 3무리',
    minWave: 9,
    weight: 3,
    duration: 0,
    mood: 'bad',
    apply: (c) => {
      for (let i = 0; i < 3; i++) c.spawn('drunkSquad', 3, { spread: 1 });
    },
  },
  {
    id: 'cigRestock',
    title: '담배 신상 입고',
    desc: '담배 손님 이동속도 +50% (20초)',
    minWave: 5,
    weight: 3,
    duration: 20,
    mood: 'bad',
    modifiers: { enemySpeedById: { cig: 1.5 } },
  },
  {
    id: 'cctvCheck',
    title: 'CCTV 점검 완료',
    desc: 'CCTV 효과 2배 (20초)',
    minWave: 5,
    weight: 3,
    duration: 20,
    mood: 'good',
    modifiers: { auraMult: 2 },
  },
  {
    id: 'snackTime',
    title: '알바 야식 타임',
    desc: '야간 알바생 공격력 2배 · 10년차 알바 1.5배 (20초)',
    minWave: 3,
    weight: 4,
    duration: 20,
    mood: 'good',
    modifiers: { unitDmgById: { alba: 2, veteran: 1.5 } },
  },
  {
    id: 'coldWave',
    title: '한파 경보',
    desc: '모든 손님 이동속도 -20% (25초)',
    minWave: 8,
    weight: 3,
    duration: 25,
    mood: 'good',
    modifiers: { enemySpeed: 0.8 },
  },
  {
    id: 'bagFee',
    title: '봉투 유료화 시행',
    desc: '코인 획득 +50% (20초)',
    minWave: 5,
    weight: 4,
    duration: 20,
    mood: 'good',
    modifiers: { coinGain: 1.5 },
  },
  {
    id: 'karen',
    title: '진상 등장',
    desc: '새벽 3시 진상 손님이 문을 열었다',
    minWave: 13, // 진상 해금(웨이브 13) 이후에만
    weight: 2,
    duration: 0,
    mood: 'bad',
    apply: (c) => c.spawn('karen3am', 1),
  },
  {
    id: 'zombieRumor',
    title: '좀비 소문',
    desc: '좀비 손님 2명 조기 등장',
    minWave: 15,
    weight: 2,
    duration: 0,
    mood: 'bad',
    apply: (c) => c.spawn('zombie', 2, { spread: 1.5, hpMult: 0.7 }),
  },
  {
    id: 'catVisit',
    title: '길고양이가 들어왔다',
    desc: '놀란 손님들이 뒤로 물러난다',
    minWave: 4,
    weight: 3,
    duration: 0,
    mood: 'good',
    apply: (c) => c.knockbackAll(140),
  },
  {
    id: 'ownerCall',
    title: '사장님 전화',
    desc: '"매출 어때?"',
    minWave: 3,
    weight: 3,
    duration: 0,
    mood: 'neutral',
    apply: (c) => {
      if (c.rng.chance(0.5)) {
        c.addCoins(150, '사장님: "잘했다"');
        c.banner('사장님: "오늘 매출 좋네"', '+150원', 'good');
      } else {
        c.banner('사장님: "…한숨"', '아무 일도 일어나지 않았다', 'info');
      }
    },
  },
  {
    id: 'sale',
    title: '전 품목 세일',
    desc: '모든 유닛 공격력 +30% (15초)',
    minWave: 6,
    weight: 3,
    duration: 15,
    mood: 'good',
    modifiers: { unitDmg: 1.3 },
  },
  {
    id: 'lateNightRush',
    title: '옆 술집이 문을 닫았다',
    desc: '술 취한 손님 5명',
    minWave: 6,
    weight: 3,
    duration: 0,
    mood: 'bad',
    apply: (c) => c.spawn('drunk', 5, { spread: 2 }),
  },
  {
    id: 'speedRun',
    title: '다들 급해졌다',
    desc: '손님 이동속도 +25% (12초)',
    minWave: 10,
    weight: 3,
    duration: 12,
    mood: 'bad',
    modifiers: { enemySpeed: 1.25 },
  },
  {
    id: 'freeDrawDouble',
    title: '점장님이 기분이 좋다',
    desc: '무료 뽑기 +2',
    minWave: 10,
    weight: 2,
    duration: 0,
    mood: 'good',
    apply: (c) => {
      c.freeDraw();
      c.freeDraw();
    },
  },

  // ───────────── 희귀 사건 (가중치 0.3 이하) ─────────────
  // 웬만하면 한 판에 한 번도 안 나온다. 나오면 그날 판의 이야기가 된다.
  {
    id: 'realOwner',
    title: '진짜 사장님이 등장했다',
    desc: '"너 지금 뭐하고 있냐?"',
    minWave: 8,
    weight: 0.3,
    duration: 0,
    mood: 'neutral',
    apply: (c) => {
      const r = c.rng.next();
      if (r < 0.35) {
        c.addCoins(500, '사장님: "수고했다"');
        c.banner('사장님: "…수고했다"', '+500원', 'good');
      } else if (r < 0.6) {
        c.freeDraw();
        c.freeDraw();
        c.freeDraw();
        c.banner('사장님: "이거라도 써라"', '무료 뽑기 +3', 'good');
      } else if (r < 0.85) {
        c.state.perma.dmg *= 1.15;
        c.banner('사장님이 지켜본다', '모든 유닛 공격력 +15% (이번 근무 내내)', 'good');
      } else {
        c.banner('사장님: "…아니다."', '아무 일도 없었다', 'info');
      }
    },
  },
  {
    id: 'stranger',
    title: '문이 열렸다',
    desc: '??? "혹시 여기…"',
    minWave: 12,
    weight: 0.25,
    duration: 0,
    mood: 'neutral',
    apply: (c) => {
      const r = c.rng.next();
      if (r < 0.3) {
        c.state.perma.critChance += 0.12;
        c.banner('??? "…아, 아니에요."', '치명타 확률 +12%', 'good');
      } else if (r < 0.55) {
        c.addCoins(300, '??? 이 두고 간 봉투');
        c.banner('봉투를 두고 갔다', '+300원', 'good');
      } else if (r < 0.8) {
        c.spawn('karen3am', 1, { hpMult: 0.8 });
        c.banner('??? "사장 어디 있어요?"', '진상이 들어왔다', 'bad');
      } else {
        c.state.perma.legendaryOdds += 0.04;
        c.banner('??? "여기 괜찮네요."', '전설 확률 +4%p', 'good');
      }
    },
  },
  {
    id: 'lottoWin',
    title: '로또 기계에서 당첨 소리가 났다',
    desc: '+777원',
    minWave: 6,
    weight: 0.25,
    duration: 0,
    mood: 'good',
    apply: (c) => {
      c.addCoins(777, '1등!');
      c.banner('로또 1등', '+777원', 'legendary');
    },
  },
  {
    id: 'legendAlba',
    title: '전설의 알바생이 지나갔다',
    desc: '"이 시간에 아직도 있네"',
    minWave: 18,
    weight: 0.2,
    duration: 25,
    mood: 'good',
    modifiers: { unitAtkSpeed: 1.5, unitDmg: 1.3 },
  },
  {
    id: 'catStays',
    title: '고양이가 자리를 잡았다',
    desc: '오늘은 안 나갈 모양이다',
    minWave: 10,
    weight: 0.3,
    duration: 30,
    mood: 'good',
    modifiers: { enemySpeed: 0.85, coinGain: 1.25 },
    apply: (c) => c.knockbackAll(90),
  },
];

export const EVENT_BY_ID: Record<string, EventDef> = Object.fromEntries(EVENT_DEFS.map((e) => [e.id, e]));

// 희귀 사건 id — 도감·업적·보고서에서 특별 취급한다
export const RARE_EVENT_IDS = ['realOwner', 'stranger', 'lottoWin', 'legendAlba', 'catStays'];

// 고양이가 얽힌 사건 (누적 방문 카운트에 들어간다)
export const CAT_EVENT_IDS = ['catVisit', 'catStays'];
