import type { Tier } from '../types';

// ───────────────────────── 지점(스테이지) ─────────────────────────
//
// 편의점은 자리가 전부다. 국도변 시골점과 역앞 술집가점은 유동인구가 다르고,
// 유동인구가 다르면 매장 크기도 손님 구성도 벌이도 달라진다.
// 그 차이를 그대로 스테이지 난이도로 쓴다 — 숫자만 올리는 난이도가 아니라
// "어떤 동네에서 일하는가"가 바뀌는 난이도다.
//
// 매장 구조(경로·진열대 줄)는 지점마다 다르다. 통로가 많을수록 손님이 오래
// 돌아다니므로 유닛이 때릴 시간이 늘어난다 — 넓은 매장이 곧 유리한 매장이다.

export interface AisleBonusDef {
  label: string;
  dmg: number;
  atkSpeed: number;
  range: number;
}

export interface StageDef {
  id: string;
  name: string;
  short: string; // 좁은 자리(상점의 칸 표시 등)에서 쓰는 두세 글자
  sub: string; // 한 줄 소개
  desc: string; // 어떤 판이 되는지
  unlockWave: number; // 이전 지점에서 이 웨이브를 넘기면 열린다 (0이면 처음부터)
  unlockAfter: string | null; // 어느 지점의 기록을 보는가
  rows: number[]; // 진열대 줄의 y 좌표
  cols: number[]; // 진열대 칸의 x 좌표
  path: { x: number; y: number }[];
  aisleBonus: AisleBonusDef[]; // 줄마다 다른 배치 보너스
  aisleNames: string[];
  lingerRow: number; // 라면 손님이 머무는 줄
  traffic: {
    count: number; // 손님 수 배율
    hp: number; // 손님 체력 배율
    coin: number; // 코인 수입 배율
    weights: Record<string, number>; // 손님별 등장 가중치 배율
  };
  scoreMult: number; // 야간 수당 배율
  tint: string | null; // 지점마다 다른 색조
}

// 통로 y 좌표에서 S자 경로를 만든다. 입구는 항상 좌상단, 끝은 계산대.
function sPath(aisleYs: number[], left = 52, right = 588, checkoutY = 582): { x: number; y: number }[] {
  const pts: { x: number; y: number }[] = [{ x: left, y: -30 }];
  aisleYs.forEach((y, i) => {
    const goRight = i % 2 === 0;
    pts.push({ x: goRight ? left : right, y });
    pts.push({ x: goRight ? right : left, y });
  });
  const lastRight = (aisleYs.length - 1) % 2 === 0;
  pts.push({ x: lastRight ? right : left, y: checkoutY });
  pts.push({ x: 335, y: checkoutY });
  return pts;
}

const COLS7 = [118, 186, 254, 322, 390, 458, 526];
const COLS5 = [150, 242, 334, 426, 518];

export const STAGES: StageDef[] = [
  {
    id: 'country',
    name: '국도변 시골점',
    short: '시골',
    sub: '차 한 대 안 지나간다 · 쉬움',
    desc: '손님이 드물다. 대신 한 번 오면 장을 봐 간다 — 한 명당 벌이가 크다.',
    unlockWave: 0,
    unlockAfter: null,
    rows: [240, 430],
    cols: COLS7,
    path: sPath([160, 350]),
    aisleNames: ['음료 코너', '라면 코너'],
    aisleBonus: [
      { label: '사거리 +18', dmg: 1, atkSpeed: 1, range: 18 },
      { label: '공격력 +22%', dmg: 1.22, atkSpeed: 1, range: 0 },
    ],
    lingerRow: 1,
    traffic: { count: 0.5, hp: 0.78, coin: 1.5, weights: { basic: 1.4, runner: 0.7, party: 0.4, drunkSquad: 0.4, student: 0.4 } },
    scoreMult: 0.8,
    tint: null,
  },
  {
    id: 'alley',
    name: '동네 골목점',
    short: '골목',
    sub: '밤이 되면 하나둘 들어온다 · 보통',
    desc: '가장 균형 잡힌 지점. 모든 손님이 고르게 온다.',
    unlockWave: 15,
    unlockAfter: 'country',
    rows: [197, 355, 510],
    cols: COLS7,
    path: [
      { x: 52, y: -30 },
      { x: 52, y: 118 },
      { x: 588, y: 118 },
      { x: 588, y: 276 },
      { x: 52, y: 276 },
      { x: 52, y: 434 },
      { x: 588, y: 434 },
      { x: 588, y: 582 },
      { x: 335, y: 582 },
    ],
    aisleNames: ['음료 코너', '과자 코너', '라면 코너'],
    aisleBonus: [
      { label: '사거리 +18', dmg: 1, atkSpeed: 1, range: 18 },
      { label: '공격속도 +12%', dmg: 1, atkSpeed: 1.12, range: 0 },
      { label: '공격력 +22%', dmg: 1.22, atkSpeed: 1, range: 0 },
    ],
    lingerRow: 2,
    traffic: { count: 1, hp: 1, coin: 1, weights: {} },
    scoreMult: 1,
    tint: null,
  },
  {
    id: 'downtown',
    name: '역앞 술집가점',
    short: '술집가',
    sub: '술집이 스물세 곳이다 · 어려움',
    desc: '유동인구가 터진다. 취한 손님과 단체 손님이 끝없이 온다. 다들 숙취 해소제 하나 사고 나간다.',
    unlockWave: 20,
    unlockAfter: 'alley',
    rows: [168, 300, 432, 546],
    cols: COLS5,
    path: sPath([110, 234, 366, 498], 52, 588, 600),
    aisleNames: ['음료 코너', '안주 코너', '해장 코너', '계산대 줄'],
    aisleBonus: [
      { label: '사거리 +18', dmg: 1, atkSpeed: 1, range: 18 },
      { label: '공격속도 +12%', dmg: 1, atkSpeed: 1.12, range: 0 },
      { label: '공격력 +22%', dmg: 1.22, atkSpeed: 1, range: 0 },
      { label: '공격력 +10% · 사거리 +10', dmg: 1.1, atkSpeed: 1, range: 10 },
    ],
    lingerRow: 2,
    traffic: {
      count: 1.5,
      // 손님이 많으면 처치 수가 늘어 코인도 같이 늘어난다. 실측에서 이 지점이
      // 뽑기를 67회 해서(시골 31회) 오히려 가장 쉬운 지점이 됐다.
      // 벌이 배율을 낮추고 체력을 올려 "많이 벌지만 더 단단하다"로 잡는다.
      hp: 1.7,
      coin: 0.66,
      weights: { drunk: 2.6, drunkSquad: 2.6, party: 2.2, student: 1.8, karen3am: 1.6, basic: 0.7 },
    },
    scoreMult: 1.6,
    tint: 'rgba(120,20,90,0.06)',
  },
];

export const STAGE_BY_ID: Record<string, StageDef> = Object.fromEntries(STAGES.map((s) => [s.id, s]));
// 엔진의 기본 지점 = 밸런스 기준점. 시뮬레이터와 테스트가 이 지점을 쓴다.
// 새 플레이어가 처음 여는 지점(국도변 시골점)과는 다르다 — 그건 저장/UI 가 정한다.
export const DEFAULT_STAGE = 'alley';
export const FIRST_STAGE = STAGES[0].id;

// ───────────── 기하 구조 ─────────────
// 경로와 진열대는 지점마다 다르므로 판이 시작될 때 한 번 계산해 상태에 넣는다.

export interface StageGeometry {
  stageId: string;
  path: { x: number; y: number }[];
  segments: { x0: number; y0: number; x1: number; y1: number; len: number; start: number }[];
  length: number;
  slots: { x: number; y: number; row: number }[];
  totalSlots: number;
  lingerDist: number;
  checkout: { x: number; y: number };
  rows: number[];
  cols: number[];
  aisleBonus: AisleBonusDef[];
  aisleNames: string[];
}

export function buildGeometry(stage: StageDef): StageGeometry {
  const segments: StageGeometry['segments'] = [];
  let acc = 0;
  for (let i = 0; i < stage.path.length - 1; i++) {
    const a = stage.path[i];
    const b = stage.path[i + 1];
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    segments.push({ x0: a.x, y0: a.y, x1: b.x, y1: b.y, len, start: acc });
    acc += len;
  }
  const slots = stage.rows.flatMap((y, row) => stage.cols.map((x) => ({ x, y, row })));
  // 라면 손님이 머무는 지점: 해당 줄에 해당하는 가로 구간의 중간
  const seg = segments[1 + stage.lingerRow * 2] ?? segments[segments.length - 2];
  const last = stage.path[stage.path.length - 1];
  return {
    stageId: stage.id,
    path: stage.path,
    segments,
    length: acc,
    slots,
    totalSlots: slots.length,
    lingerDist: seg.start + seg.len * 0.5,
    checkout: { x: last.x, y: last.y + 18 },
    rows: stage.rows,
    cols: stage.cols,
    aisleBonus: stage.aisleBonus,
    aisleNames: stage.aisleNames,
  };
}

export function geoPos(geo: StageGeometry, dist: number): { x: number; y: number; facing: 1 | -1 } {
  if (dist <= 0) return { x: geo.path[0].x, y: geo.path[0].y + dist, facing: 1 };
  for (const seg of geo.segments) {
    if (dist <= seg.start + seg.len) {
      const t = (dist - seg.start) / seg.len;
      const facing: 1 | -1 = seg.x1 >= seg.x0 ? 1 : -1;
      return { x: seg.x0 + (seg.x1 - seg.x0) * t, y: seg.y0 + (seg.y1 - seg.y0) * t, facing };
    }
  }
  const last = geo.path[geo.path.length - 1];
  return { x: last.x, y: last.y, facing: -1 };
}

// 지점이 열렸는가
export function stageUnlocked(stage: StageDef, bestByStage: Record<string, number>): boolean {
  if (!stage.unlockAfter) return true;
  return (bestByStage[stage.unlockAfter] ?? 0) >= stage.unlockWave;
}

export function maxSlotsOf(stage: StageDef): number {
  return stage.rows.length * stage.cols.length;
}

export type { Tier };

// 증축 순서: 가운데 열부터 바깥으로. 지점마다 열 수가 달라 런타임에 만든다.
export function unlockOrderFor(geo: StageGeometry): number[] {
  const nCols = geo.cols.length;
  const center = (nCols - 1) / 2;
  const colOrder = [...geo.cols.keys()].sort((a, b) => Math.abs(a - center) - Math.abs(b - center) || a - b);
  const out: number[] = [];
  for (const col of colOrder) for (let row = 0; row < geo.rows.length; row++) out.push(row * nCols + col);
  return out;
}
