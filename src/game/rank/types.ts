// 랭킹 기록. 클라이언트와 Cloudflare Pages Function 이 함께 쓴다.
export interface ScorePayload {
  v: 1;
  playerId: string;
  name: string;
  wave: number;
  time: number; // 초
  kills: number;
  combo: number;
  merges: number;
  draws: number;
  bossKills: number;
  coins: number; // 누적 획득 코인
  mvp: string | null;
  title: string; // 런 제목
  challengeId: string | null; // ZUNRAN DAILY 규칙 (일반 근무면 null)
  date: string; // YYYY-MM-DD, 데일리 보드 판정용
}

export interface RankEntry {
  id: string; // playerId 앞 8자만 저장한다
  name: string;
  wave: number;
  time: number;
  kills: number;
  combo: number;
  mvp: string | null;
  title: string;
  at: number;
}

export interface RankBoard {
  board: string; // 'all' | 'daily:YYYY-MM-DD'
  updatedAt: number;
  entries: RankEntry[];
}

export interface RankResult {
  board: RankBoard;
  myRank: number | null; // 1-based, 없으면 null
}

export const MAX_BOARD_ENTRIES = 100;
export const MAX_NAME_LEN = 12;

// 기록 우열: 웨이브가 높은 쪽, 같으면 빨리 도달한 쪽, 그다음 처치 수.
export function compareEntries(a: RankEntry, b: RankEntry): number {
  if (a.wave !== b.wave) return b.wave - a.wave;
  if (a.time !== b.time) return a.time - b.time;
  return b.kills - a.kills;
}
