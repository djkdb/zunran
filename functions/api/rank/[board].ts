import { json, normalizeBoard, readBoard, rankOf } from './_shared';
import type { Env } from './_shared';

// GET /api/rank/all               전체 최고 기록
// GET /api/rank/daily             오늘의 ZUNRAN DAILY
// GET /api/rank/daily-2026-09-16  특정 날짜
// ?me=<playerId 앞 8자> 를 붙이면 내 순위도 같이 준다.
export const onRequestGet: PagesFunction<Env, 'board'> = async ({ params, request, env }) => {
  const today = new Date().toISOString().slice(0, 10);
  const raw = Array.isArray(params.board) ? params.board[0] : params.board;
  const board = normalizeBoard(raw, today);
  if (!board) return json({ ok: false, reason: 'unknown board' }, 400);
  if (!env.RANK_KV) return json({ ok: false, reason: 'no-kv' }, 503);

  const data = await readBoard(env, board);
  const me = new URL(request.url).searchParams.get('me');
  return json({ ok: true, board: data, myRank: me ? rankOf(data.entries, me) : null });
};
