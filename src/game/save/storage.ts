import type { MetaUpgradeId } from '../types';
import { DEFAULT_META_LEVELS } from './meta';

import { FIRST_STAGE } from '../data/stages';

export const SAVE_KEY = 'cvs-night-shift:v1'; // 키는 유지 (기존 유저 데이터 보존)

export const SAVE_VERSION = 5;

export interface LastRun {
  wave: number;
  time: number;
  kills: number;
  coins: number;
  mvp: string | null;
  at: number;
}

// 최근 근무 기록 한 줄. 30개까지만 보관한다.
export interface RunRecord {
  wave: number;
  time: number;
  kills: number;
  merges: number;
  bossKills: number;
  mvp: string | null;
  bestCombo: number;
  runTitle: string;
  challengeId: string | null;
  missionCleared: boolean;
  at: number;
}

// 유닛 누적 통계 (도감용)
export interface UnitStat {
  draws: number;
  mvp: number;
  damage: number;
  maxTier: number;
  merges: number;
}

// 손님 누적 통계 (도감용)
export interface EnemyStat {
  seen: number;
  kills: number;
  reached: number;
  damage: number; // 이 손님에게 매장이 입은 누적 피해
  firstAt: number;
  lastAt: number;
  bestKillsInRun: number;
}

// 날짜별 데일리 기록 (서버 리더보드를 붙일 수 있게 날짜 키로 분리)
export interface DailyRecord {
  date: string; // YYYY-MM-DD
  challengeId: string;
  missionId: string;
  bestWave: number;
  bestCombo: number;
  bestKills: number;
  missionCleared: boolean;
  plays: number;
  rewarded: boolean; // 미션 보상은 하루 한 번만
}

export interface SaveData {
  version: number;
  bestWave: number;
  bestTime: number;
  bestKills: number;
  totalPlays: number;
  totalKills: number;
  unlockedUnits: string[];
  seenEnemies: string[];
  metaPoints: number;
  metaLevels: Record<MetaUpgradeId, number>;
  muted: boolean;
  haptics: boolean; // 진동 피드백 (지원하는 기기에서만)
  stageId: string; // 마지막으로 고른 지점
  bestByStage: Record<string, number>; // 지점별 최고 웨이브 (해금 판정용)
  autoMerge: boolean;
  autoSell: boolean; // 칸이 꽉 찼을 때 합성 짝 없는 1티어 일반 유닛 자동 정리
  hintsSeen: boolean;
  lastRun?: LastRun;
  // ── v2 ──
  achievements: string[];
  achievementsAt: Record<string, number>;
  unitStats: Record<string, UnitStat>;
  enemyStats: Record<string, EnemyStat>;
  runHistory: RunRecord[];
  daily: Record<string, DailyRecord>; // 최근 14일만 보관
  catVisits: number;
  secretsSeen: string[];
  eventCounts: Record<string, number>; // 사건별 누적 발생 횟수 (밈 업적용)
  totalMerges: number;
  totalBossKills: number;
  // ── v3: 글로벌 랭킹 ──
  playerId: string; // 익명 고유 ID. 기기에만 저장되고, 서버에는 앞 8자만 올라간다.
  nickname: string; // 랭킹판에 표시할 이름
  rankOptIn: boolean; // 랭킹 등록 동의 (끄면 기록을 전송하지 않는다)
  // ── v4 ──
  introSeen: boolean; // 첫 판 오프닝을 봤는가 (건너뛰어도 본 것으로 친다)
  // ── v5 ──
  order: { pins: string[]; bans: string[] }; // 오늘 발주 (지명·제외). 비어도 된다.
}

// crypto.randomUUID 가 없는 구형 웹뷰(카톡 인앱 등)도 있어서 폴백을 둔다.
export function newPlayerId(): string {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID().replace(/-/g, '');
  } catch {
    // 아래 폴백으로
  }
  let out = '';
  for (let i = 0; i < 32; i++) out += Math.floor(Math.random() * 16).toString(16);
  return out;
}

export function defaultSave(): SaveData {
  return {
    version: SAVE_VERSION,
    bestWave: 0,
    bestTime: 0,
    bestKills: 0,
    totalPlays: 0,
    totalKills: 0,
    unlockedUnits: [],
    seenEnemies: [],
    metaPoints: 0,
    metaLevels: { ...DEFAULT_META_LEVELS },
    muted: false,
    haptics: true,
    stageId: FIRST_STAGE,
    bestByStage: {},
    autoMerge: false,
    autoSell: true,
    hintsSeen: false,
    achievements: [],
    achievementsAt: {},
    unitStats: {},
    enemyStats: {},
    runHistory: [],
    daily: {},
    catVisits: 0,
    secretsSeen: [],
    eventCounts: {},
    totalMerges: 0,
    totalBossKills: 0,
    playerId: newPlayerId(),
    nickname: '',
    rankOptIn: true,
    introSeen: false,
    order: { pins: [], bans: [] },
  };
}

const arr = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);
const rec = <T>(v: unknown): Record<string, T> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, T>) : {});

// v1~v4 → v5. 없는 필드는 기본값으로 채우고, 있던 값은 절대 건드리지 않는다.
export function migrate(parsed: Partial<SaveData>): SaveData {
  const base = defaultSave();
  const out: SaveData = {
    ...base,
    ...parsed,
    version: SAVE_VERSION,
    metaLevels: { ...base.metaLevels, ...rec<number>(parsed.metaLevels) },
    unlockedUnits: arr(parsed.unlockedUnits),
    seenEnemies: arr(parsed.seenEnemies),
    achievements: arr(parsed.achievements),
    achievementsAt: rec<number>(parsed.achievementsAt),
    unitStats: rec<UnitStat>(parsed.unitStats),
    enemyStats: rec<EnemyStat>(parsed.enemyStats),
    runHistory: Array.isArray(parsed.runHistory) ? parsed.runHistory.slice(0, MAX_RUN_HISTORY) : [],
    daily: rec<DailyRecord>(parsed.daily),
    secretsSeen: arr(parsed.secretsSeen),
    eventCounts: rec<number>(parsed.eventCounts),
    autoSell: typeof parsed.autoSell === 'boolean' ? parsed.autoSell : true,
    haptics: typeof parsed.haptics === 'boolean' ? parsed.haptics : true,
    stageId: typeof parsed.stageId === 'string' ? parsed.stageId : FIRST_STAGE,
    bestByStage: { ...base.bestByStage, ...rec<number>(parsed.bestByStage) },
    catVisits: typeof parsed.catVisits === 'number' ? parsed.catVisits : 0,
    totalMerges: typeof parsed.totalMerges === 'number' ? parsed.totalMerges : 0,
    totalBossKills: typeof parsed.totalBossKills === 'number' ? parsed.totalBossKills : 0,
    playerId: typeof parsed.playerId === 'string' && parsed.playerId.length >= 8 ? parsed.playerId : newPlayerId(),
    nickname: typeof parsed.nickname === 'string' ? parsed.nickname : '',
    rankOptIn: typeof parsed.rankOptIn === 'boolean' ? parsed.rankOptIn : true,
    // 이미 플레이한 적 있는 사람에게 오프닝을 새로 띄우지는 않는다
    introSeen: typeof parsed.introSeen === 'boolean' ? parsed.introSeen : (parsed.totalPlays ?? 0) > 0,
    order: { pins: arr(parsed.order?.pins), bans: arr(parsed.order?.bans) },
  };
  // 예전 저장에는 손님/유닛 통계가 없다. 도감에 이미 "봤다"고 기록된 것만 최소치로 살려 둔다.
  for (const id of out.seenEnemies) {
    if (!out.enemyStats[id]) out.enemyStats[id] = { seen: 1, kills: 0, reached: 0, damage: 0, firstAt: 0, lastAt: 0, bestKillsInRun: 0 };
  }
  for (const id of out.unlockedUnits) {
    if (!out.unitStats[id]) out.unitStats[id] = { draws: 1, mvp: 0, damage: 0, maxTier: 1, merges: 0 };
  }
  return out;
}

export const MAX_RUN_HISTORY = 30;
export const MAX_DAILY_KEPT = 14;

// localStorage 는 사파리 프라이빗 모드 등에서 예외를 던질 수 있어 항상 try/catch.
export function loadSave(): SaveData {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return defaultSave();
    const parsed = JSON.parse(raw) as Partial<SaveData>;
    const data = migrate(parsed);
    // 구버전 저장이면 바로 새 형식으로 다시 써 둔다 (반쯤 마이그레이션된 상태를 남기지 않는다)
    if (parsed.version !== SAVE_VERSION) writeSave(data);
    return data;
  } catch {
    return defaultSave();
  }
}

// 저장 직전에 용량이 무한정 커지지 않게 잘라낸다.
function prune(data: SaveData): SaveData {
  const dates = Object.keys(data.daily).sort().slice(-MAX_DAILY_KEPT);
  const daily: Record<string, DailyRecord> = {};
  for (const d of dates) daily[d] = data.daily[d];
  return { ...data, runHistory: data.runHistory.slice(0, MAX_RUN_HISTORY), daily };
}

export function writeSave(data: SaveData): void {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(prune(data)));
  } catch {
    // 저장 불가 환경: 조용히 무시 (게임은 계속 동작)
  }
}

export function resetSave(): SaveData {
  const d = defaultSave();
  writeSave(d);
  return d;
}
