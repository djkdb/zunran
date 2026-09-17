import type { EventDef } from '../types';

// 랜덤 이벤트. duration 이 0이면 즉시형. modifiers 는 지속 시간 동안 전역 배율에 곱해진다.
export const EVENT_DEFS: EventDef[] = [
  {
    id: 'rush',
    title: '갑자기 손님이 몰려왔습니다',
    desc: '손님이 몰려온다',
    minWave: 3,
    weight: 6,
    duration: 0,
    mood: 'bad',
    apply: (c) => c.spawn('basic', 8, { spread: 3 }),
    choices: [
      { label: '받는다', desc: '손님 10명 추가 · 코인 +500', apply: (c) => { c.spawn('basic', 10, { spread: 3 }); c.addCoins(500); c.banner('손님 폭주', '바쁘다 · +500원', 'bad'); } },
      { label: '문을 반쯤 닫는다', desc: '손님 4명만 · 코인 없음', apply: (c) => { c.spawn('basic', 4, { spread: 3 }); c.banner('손님 폭주', '천천히 오세요', 'info'); } },
    ],
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
    desc: '본사 직원이 매장을 둘러본다',
    minWave: 4,
    weight: 4,
    duration: 0,
    mood: 'bad',
    apply: (c) => {
      c.disableRandomUnit(10);
    },
    choices: [
      { label: '협조한다', desc: '유닛 하나가 10초 점검', apply: (c) => { c.disableRandomUnit(10); c.banner('본사 점검', '"협조 감사합니다"', 'bad'); } },
      { label: '뇌물을 준다', desc: '코인 -600 · 점검 없음', apply: (c) => { if (c.state.coins >= 600) { c.addCoins(-600); c.banner('본사 점검', '"오늘은 그냥 가죠"', 'good'); } else { c.disableRandomUnit(10); c.banner('본사 점검', '돈이 없다', 'bad'); } } },
    ],
  },
  {
    id: 'onePlusOne',
    title: '1+1 행사 시작!',
    desc: '무엇을 1+1 로 걸까',
    minWave: 3,
    weight: 5,
    duration: 20,
    mood: 'good',
    modifiers: { unitDmgById: { onigiri: 2, ramenShelf: 2 } },
    choices: [
      { label: '삼각김밥·라면', desc: '그 둘 공격력 2배 (20초)', apply: (c) => { c.state.activeEvents.push({ defId: 'onePlusOne', until: c.state.time + 20, title: '1+1 행사', mood: 'good' }); c.banner('1+1 행사', '삼각김밥·라면 진열대 2배', 'good'); } },
      { label: '전 품목', desc: '모든 유닛 공격력 +25% (20초)', apply: (c) => { c.state.activeEvents.push({ defId: 'sale', until: c.state.time + 20, title: '전 품목 1+1', mood: 'good' }); c.banner('1+1 행사', '전 품목 +25%', 'good'); } },
    ],
  },
  {
    id: 'rain',
    title: '비가 오기 시작했습니다',
    desc: '손님들이 젖은 채로 들어온다',
    minWave: 3,
    weight: 5,
    duration: 20,
    mood: 'good',
    modifiers: { enemySpeed: 0.7, rain: true },
    choices: [
      { label: '우산을 빌려준다', desc: '손님 이동속도 -35% (25초)', apply: (c) => { c.state.activeEvents.push({ defId: 'rain', until: c.state.time + 25, title: '비', mood: 'good' }); c.banner('비', '다들 천천히 간다', 'good'); } },
      { label: '우산을 판다', desc: '코인 +450 · 감속 없음', apply: (c) => { c.addCoins(450); c.banner('비', '우산 다 팔렸다 · +450원', 'good'); } },
    ],
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
    choices: [
      { label: '그냥 버틴다', desc: '20초간 어두워진다', apply: (c) => { c.state.activeEvents.push({ defId: 'blackout', until: c.state.time + 20, title: '정전', mood: 'bad' }); c.banner('정전', '아무것도 안 보인다', 'bad'); } },
      { label: '두꺼비집을 올린다', desc: '유닛 하나가 12초 정지 · 불은 들어온다', apply: (c) => { c.disableRandomUnit(12); c.banner('정전', '불은 들어왔다', 'info'); } },
    ],
  },
  {
    id: 'expiredFood',
    title: '폐기 시간',
    desc: '폐기 도시락이 나왔다',
    minWave: 3,
    weight: 4,
    duration: 0,
    mood: 'good',
    apply: (c) => c.freeDraw(),
    choices: [
      { label: '먹는다', desc: '체력 +15 · 코인은 없다', apply: (c) => { c.state.hp = Math.min(c.state.maxHp, c.state.hp + 15); c.banner('폐기 시간', '든든하다 · 체력 +15', 'good'); } },
      { label: '판다', desc: '코인 +400 · 체력은 그대로', apply: (c) => { c.addCoins(400); c.banner('폐기 시간', '몰래 팔았다 · +400원', 'good'); } },
    ],
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
    choices: [
      { label: '주머니에 넣는다', desc: '코인 +350', apply: (c) => { c.addCoins(350); c.banner('바닥의 동전', '+350원', 'good'); } },
      { label: '시재에 넣는다', desc: '최대 체력 +8 · 체력도 +8', apply: (c) => { c.state.maxHp += 8; c.state.hp += 8; c.banner('바닥의 동전', '정직하게 · 최대 체력 +8', 'good'); } },
    ],
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
    desc: '담배를 진열할까, 창고에 둘까',
    minWave: 5,
    weight: 3,
    duration: 20,
    mood: 'neutral',
    modifiers: { enemySpeedById: { cig: 1.5 } },
    choices: [
      { label: '진열한다', desc: '코인 +300 · 담배 손님이 빨라진다 (20초)', apply: (c) => { c.addCoins(300); c.state.activeEvents.push({ defId: 'cigRestock', until: c.state.time + 20, title: '담배 신상 입고', mood: 'bad' }); c.banner('담배 신상 입고', '+300원 · 담배 손님 주의', 'good'); } },
      { label: '창고에 둔다', desc: '아무 일도 없다', apply: (c) => { c.banner('담배 신상 입고', '오늘은 안 팝니다', 'info'); } },
    ],
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
    desc: '쉴까, 먹으면서 일할까',
    minWave: 3,
    weight: 4,
    duration: 20,
    mood: 'good',
    modifiers: { unitDmgById: { alba: 2, veteran: 1.5 }, unitAtkSpeed: 1.25 },
    choices: [
      { label: '먹고 쉰다', desc: '체력 +10', apply: (c) => { c.state.hp = Math.min(c.state.maxHp, c.state.hp + 10); c.banner('야식 타임', '체력 +10', 'good'); } },
      { label: '먹으면서 일한다', desc: '30초간 알바 공격력 2배 · 전체 공격속도 +25%', apply: (c) => { c.state.activeEvents.push({ defId: 'snackTime', until: c.state.time + 30, title: '야식 타임', mood: 'good' }); c.banner('야식 타임', '공격속도 +25% (30초)', 'good'); } },
    ],
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
    choices: [
      { label: '"잘 되고 있어요"', desc: '코인 +250', apply: (c) => { c.addCoins(250); c.banner('사장님', '"수고했다" · +250원', 'good'); } },
      { label: '"사람 좀 더 뽑아주세요"', desc: '무료 뽑기 2회', apply: (c) => { c.freeDraw(); c.freeDraw(); c.banner('사장님', '"한 번만 더 알아볼게" · 무료 뽑기 2회', 'good'); } },
    ],
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
