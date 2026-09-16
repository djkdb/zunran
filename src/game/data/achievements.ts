import type { IconName } from '../../ui/Icon';
import type { RunStats } from '../types';
import type { SaveData } from '../save/storage';

// 업적 판정에 필요한 것만 담은 좁은 컨텍스트.
// 한 판이 끝난 직후(run)와 그때까지의 누적(save, 이번 판 반영 전)을 함께 본다.
export interface AchievementContext {
  wave: number;
  time: number;
  stats: RunStats;
  mvpDefId: string | null;
  save: SaveData; // 이번 판 반영 *전* 상태
  totalPlays: number; // 이번 판 포함
  eventCount: (id: string) => number; // 이번 판에서 발생한 횟수
  totalEventCount: (id: string) => number; // 누적 (이번 판 포함)
  coinsLeft: number; // 영업 종료 시점에 남아 있던 코인
  challengeId: string | null;
  missionCleared: boolean;
}

export interface Achievement {
  id: string;
  title: string;
  desc: string; // 달성 조건 설명
  icon: IconName;
  hidden?: boolean; // 달성 전에는 설명을 가린다
  group: '진행' | '수집' | '기록' | '사건' | '밈';
  when: (c: AchievementContext) => boolean;
}

const top = (r: Record<string, number>): string | null => {
  let best: string | null = null;
  let n = -1;
  for (const [k, v] of Object.entries(r)) if (v > n) [best, n] = [k, v];
  return best;
};

export const ACHIEVEMENTS: Achievement[] = [
  // ── 진행 ──
  { id: 'firstShift', title: '첫 출근', desc: '야간근무를 한 번 끝낸다', icon: 'store', group: '진행', when: (c) => c.totalPlays >= 1 },
  { id: 'wave5', title: '편의점 알바', desc: '웨이브 5 도달', icon: 'clock', group: '진행', when: (c) => c.wave >= 5 },
  { id: 'wave10', title: '야간근무', desc: '웨이브 10 도달', icon: 'clock', group: '진행', when: (c) => c.wave >= 10 },
  { id: 'wave20', title: '새벽 생존자', desc: '웨이브 20 도달', icon: 'trophy', group: '진행', when: (c) => c.wave >= 20 },
  { id: 'wave30', title: '교대가 오지 않는다', desc: '웨이브 30 도달', icon: 'trophy', group: '진행', when: (c) => c.wave >= 30 },
  { id: 'wave40', title: '해 뜨는 편의점', desc: '웨이브 40 도달', icon: 'star', group: '진행', when: (c) => c.wave >= 40 },
  { id: 'survive10min', title: '10분 근무', desc: '한 판에서 10분 이상 버틴다', icon: 'clock', group: '진행', when: (c) => c.time >= 600 },

  // ── 수집 ──
  { id: 'meetManager', title: '점장님 등장', desc: '점장을 획득한다', icon: 'store', group: '수집', when: (c) => (c.stats.unitDraws.manager ?? 0) + (c.stats.unitMerges.manager ?? 0) > 0 || c.stats.seenUnits.includes('manager') },
  { id: 'meetCat', title: '고양이 집사', desc: '편의점 고양이를 만난다', icon: 'heart', group: '수집', when: (c) => c.stats.seenUnits.includes('cat') || c.stats.catVisits > 0 },
  { id: 'meetVeteran', title: '10년차', desc: '10년차 알바를 만든다', icon: 'star', group: '수집', when: (c) => c.stats.seenUnits.includes('veteran') },
  { id: 'unitCollector', title: '유닛 도감 절반', desc: '유닛 8종 이상 발견', icon: 'gem', group: '수집', when: (c) => new Set([...c.save.unlockedUnits, ...c.stats.seenUnits]).size >= 8 },
  { id: 'unitMaster', title: '전 직원 출근', desc: '유닛 15종 전부 발견', icon: 'gem', group: '수집', when: (c) => new Set([...c.save.unlockedUnits, ...c.stats.seenUnits]).size >= 15 },
  { id: 'enemyCollector', title: '손님 도감 절반', desc: '손님 12종 이상 만남', icon: 'chart', group: '수집', when: (c) => new Set([...c.save.seenEnemies, ...c.stats.seenEnemies]).size >= 12 },
  { id: 'tier5', title: '티어 5', desc: '5티어 유닛을 만든다', icon: 'star', group: '수집', when: (c) => c.stats.maxTierReached >= 5 },

  // ── 기록 ──
  { id: 'mergeAddict', title: '합성 중독', desc: '한 판에서 20회 합성', icon: 'merge', group: '기록', when: (c) => c.stats.merges >= 20 },
  { id: 'combo50', title: '콤보 머신', desc: '콤보 50 달성', icon: 'chart', group: '기록', when: (c) => c.stats.bestCombo >= 50 },
  { id: 'combo150', title: '손이 안 멈춘다', desc: '콤보 150 달성', icon: 'chart', group: '기록', when: (c) => c.stats.bestCombo >= 150 },
  { id: 'bossSquad', title: '보스 처리반', desc: '누적 보스 5마리 처치', icon: 'boss', group: '기록', when: (c) => c.save.totalBossKills + c.stats.bossKills >= 5 },
  { id: 'kill1000', title: '손님 천 명', desc: '누적 손님 1000명 처리', icon: 'chart', group: '기록', when: (c) => c.save.totalKills + c.stats.kills >= 1000 },
  { id: 'rich', title: '오늘 매출 대박', desc: '한 판에서 코인 20000원 획득', icon: 'coin', group: '기록', when: (c) => c.stats.coinsEarned >= 20000 },
  { id: 'legendary3', title: '전설이 세 번', desc: '한 판에서 전설 3회 등장', icon: 'star', group: '기록', when: (c) => c.stats.legendaryDraws >= 3 },
  { id: 'perfect10', title: '한 명도 못 들어왔다', desc: '웨이브 10까지 무피해로 도달', icon: 'check', group: '기록', when: (c) => c.wave >= 10 && c.stats.reached === 0 },

  // ── 사건 ──
  { id: 'blackoutSeen', title: '불 꺼진 편의점', desc: '정전을 겪는다', icon: 'bulb', group: '사건', when: (c) => c.eventCount('blackout') > 0 },
  { id: 'ownerCallSeen', title: '사장님 전화', desc: '사장님 전화를 받는다', icon: 'store', group: '사건', when: (c) => c.eventCount('ownerCall') > 0 },
  { id: 'expiredSeen', title: '폐기 전문', desc: '폐기 관련 사건을 겪는다', icon: 'broom', group: '사건', when: (c) => c.eventCount('expiredFood') > 0 },
  { id: 'threeAmSeen', title: '새벽 3시', desc: '새벽 3시를 맞는다', icon: 'clock', group: '사건', when: (c) => c.wave >= 13 },
  { id: 'eventful', title: '오늘 사건 많네', desc: '한 판에서 사건 10번', icon: 'chart', group: '사건', when: (c) => c.stats.eventsSeen >= 10 },

  // ── 밈 / 숨겨진 업적 ──
  { id: 'ownerCall10', title: '사장님 그만 전화하세요', desc: '사장님 전화를 누적 10번 받았다', icon: 'store', group: '밈', hidden: true, when: (c) => c.totalEventCount('ownerCall') >= 10 },
  { id: 'microwaveEverything', title: '전자레인지에 모든 것을 맡겼다', desc: '전자레인지를 MVP로 만들고 웨이브 15 도달', icon: 'boss', group: '밈', hidden: true, when: (c) => c.mvpDefId === 'microwave' && c.wave >= 15 },
  { id: 'diedAt3am', title: '새벽 3시를 버티지 못했다', desc: '웨이브 13~14에서 영업 종료', icon: 'clock', group: '밈', hidden: true, when: (c) => c.wave === 13 || c.wave === 14 },
  { id: 'lostToKaren', title: '진상에게 졌다', desc: '마지막으로 들어온 손님이 진상', icon: 'boss', group: '밈', hidden: true, when: (c) => top(c.stats.storeDamageBy) === 'karen3am' },
  { id: 'ateExpired', title: '오늘도 폐기를 먹었다', desc: '폐기 처리 스킬을 한 판에 10번 쓴다', icon: 'broom', group: '밈', hidden: true, when: (c) => c.stats.skillsUsed >= 25 },
  { id: 'catFriend', title: '얘는 손님인가 직원인가', desc: '고양이를 누적 5번 만난다', icon: 'heart', group: '밈', hidden: true, when: (c) => c.save.catVisits + c.stats.catVisits >= 5 },
  { id: 'lottoWin', title: '로또 1등', desc: '???', icon: 'coin', group: '밈', hidden: true, when: (c) => c.eventCount('lottoWin') > 0 },
  { id: 'metRealOwner', title: '너 지금 뭐하고 있냐', desc: '???', icon: 'store', group: '밈', hidden: true, when: (c) => c.eventCount('realOwner') > 0 },
  { id: 'metStranger', title: '혹시 여기…', desc: '???', icon: 'gem', group: '밈', hidden: true, when: (c) => c.eventCount('stranger') > 0 },
  { id: 'emptyHanded', title: '빈손으로 퇴근', desc: '코인을 한 푼도 남기지 않고 영업 종료', icon: 'coin', group: '밈', hidden: true, when: (c) => c.coinsLeft === 0 && c.wave >= 5 },
  { id: 'hoarder', title: '쓰지도 않을 거면서', desc: '코인 5000원 이상 남기고 영업 종료', icon: 'coin', group: '밈', hidden: true, when: (c) => c.coinsLeft >= 5000 },
  { id: 'dailyClear', title: '오늘의 미션 완료', desc: '오늘의 미션을 달성한다', icon: 'check', group: '밈', when: (c) => c.missionCleared },
  { id: 'dailyChallenger', title: '특별 근무', desc: 'ZUNRAN DAILY 규칙으로 웨이브 10 도달', icon: 'trophy', group: '밈', when: (c) => !!c.challengeId && c.wave >= 10 },
];

export const ACHIEVEMENT_BY_ID: Record<string, Achievement> = Object.fromEntries(ACHIEVEMENTS.map((a) => [a.id, a]));

// 이번 판으로 새로 달성한 업적 id 목록 (이미 가진 것은 제외)
export function evaluateAchievements(ctx: AchievementContext): string[] {
  const owned = new Set(ctx.save.achievements);
  const out: string[] = [];
  for (const a of ACHIEVEMENTS) {
    if (owned.has(a.id)) continue;
    let ok = false;
    try {
      ok = a.when(ctx);
    } catch {
      ok = false; // 데이터가 비어 있어도 게임이 멈추지 않게
    }
    if (ok) out.push(a.id);
  }
  return out;
}
