import type { RankBoard, RankEntry } from '../../../src/game/rank/types';

export { boardKey, insertEntry, normalizeBoard, rankOf } from '../../../src/game/rank/board';

export interface Env {
  // Cloudflare 대시보드에서 KV 네임스페이스를 만들고 RANK_KV 로 바인딩한다.
  // 바인딩이 없으면 게임은 그대로 돌아가고 랭킹만 '연결 안 됨'으로 표시된다.
  RANK_KV?: KVNamespace;
}

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });
}

export async function readBoard(env: Env, board: string): Promise<RankBoard> {
  const empty: RankBoard = { board, updatedAt: 0, entries: [] };
  if (!env.RANK_KV) return empty;
  const raw = await env.RANK_KV.get(`board:${board}`, 'json');
  if (!raw || typeof raw !== 'object') return empty;
  const b = raw as Partial<RankBoard>;
  return {
    board,
    updatedAt: typeof b.updatedAt === 'number' ? b.updatedAt : 0,
    entries: Array.isArray(b.entries) ? (b.entries as RankEntry[]) : [],
  };
}
