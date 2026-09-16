import type { RunStats } from '../types';

// TODAY'S MISSION — 날짜 seed 로 하나 뽑는다. 목표 + 추가 조건 + 보상.
export interface MissionDef {
  id: string;
  goal: string; // 주 목표 문구
  extra?: string; // 추가 조건 문구
  reward: number; // 야간 수당
  check: (c: MissionContext) => boolean;
}

export interface MissionContext {
  wave: number;
  time: number;
  stats: RunStats;
  mvpDefId: string | null;
}

export const MISSIONS: MissionDef[] = [
  { id: 'wave10', goal: '웨이브 10 도달', reward: 80, check: (c) => c.wave >= 10 },
  { id: 'wave15', goal: '웨이브 15 도달', reward: 120, check: (c) => c.wave >= 15 },
  { id: 'wave20', goal: '웨이브 20 도달', reward: 180, check: (c) => c.wave >= 20 },
  { id: 'combo30', goal: '콤보 30 달성', reward: 90, check: (c) => c.stats.bestCombo >= 30 },
  { id: 'combo80', goal: '콤보 80 달성', reward: 140, check: (c) => c.stats.bestCombo >= 80 },
  { id: 'merge5', goal: '합성 5회', reward: 70, check: (c) => c.stats.merges >= 5 },
  { id: 'merge12', goal: '합성 12회', reward: 120, check: (c) => c.stats.merges >= 12 },
  { id: 'boss2', goal: '보스 2마리 처치', reward: 160, check: (c) => c.stats.bossKills >= 2 },
  { id: 'kills150', goal: '손님 150명 처리', reward: 110, check: (c) => c.stats.kills >= 150 },
  { id: 'coins8000', goal: '코인 8000원 획득', reward: 120, check: (c) => c.stats.coinsEarned >= 8000 },
  { id: 'mvpPos', goal: '포스기를 MVP로 만들기', reward: 130, check: (c) => c.mvpDefId === 'pos' },
  { id: 'mvpMicrowave', goal: '전자레인지를 MVP로 만들기', reward: 130, check: (c) => c.mvpDefId === 'microwave' },
  { id: 'noManager10', goal: '점장 없이 웨이브 10 달성', reward: 140, check: (c) => c.wave >= 10 && !c.stats.seenUnits.includes('manager') },
  { id: 'ramen12', goal: '라면 진열대를 쓰고 웨이브 12 달성', reward: 130, check: (c) => c.wave >= 12 && c.stats.seenUnits.includes('ramenShelf') },
  { id: 'clean10', goal: '계산대를 3번 이하로 내주고 웨이브 10 도달', reward: 160, check: (c) => c.wave >= 10 && c.stats.reached <= 3 },
  { id: 'survive8min', goal: '8분 이상 버티기', reward: 130, check: (c) => c.time >= 480 },
];

// 추가 조건: 주 목표와 겹치지 않게 뽑는다
export const MISSION_EXTRAS: MissionDef[] = [
  { id: 'x_merge5', goal: '', extra: '합성 5회 이상', reward: 40, check: (c) => c.stats.merges >= 5 },
  { id: 'x_combo20', goal: '', extra: '콤보 20 이상', reward: 40, check: (c) => c.stats.bestCombo >= 20 },
  { id: 'x_boss1', goal: '', extra: '보스 1마리 처치', reward: 50, check: (c) => c.stats.bossKills >= 1 },
  { id: 'x_kills80', goal: '', extra: '손님 80명 처리', reward: 40, check: (c) => c.stats.kills >= 80 },
  { id: 'x_skill5', goal: '', extra: '긴급 스킬 5회 사용', reward: 30, check: (c) => c.stats.skillsUsed >= 5 },
  { id: 'x_epic', goal: '', extra: '에픽 이상 유닛 1개 획득', reward: 50, check: (c) => c.stats.drawsByRarity.epic + c.stats.drawsByRarity.legendary > 0 },
];
