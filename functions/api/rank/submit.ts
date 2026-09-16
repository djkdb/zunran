import { boardKey, json, readBoard, insertEntry, rankOf } from './_shared';
import type { Env } from './_shared';
import { validateScore, sanitizeName } from '../../../src/game/rank/validate';
import type { RankEntry, ScorePayload } from '../../../src/game/rank/types';

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  if (!env.RANK_KV) return json({ ok: false, reason: 'no-kv' }, 503);

  let payload: ScorePayload;
  try {
    payload = (await request.json()) as ScorePayload;
  } catch {
    return json({ ok: false, reason: 'bad json' }, 400);
  }

  const v = validateScore(payload);
  if (!v.ok) return json({ ok: false, reason: v.reason }, 400);

  const id = payload.playerId.slice(0, 8);
  const rlKey = `rl:${id}`;
  // 같은 사람이 1분 안에 두 번 올리는 건 정상 플레이가 아니다 (최단 런도 수 분 걸린다).
  if (await env.RANK_KV.get(rlKey)) return json({ ok: false, reason: 'rate limited' }, 429);
  await env.RANK_KV.put(rlKey, '1', { expirationTtl: 60 });

  const entry: RankEntry = {
    id,
    name: sanitizeName(payload.name),
    wave: payload.wave,
    time: Math.round(payload.time),
    kills: Math.round(payload.kills),
    combo: Math.round(payload.combo),
    mvp: typeof payload.mvp === 'string' ? sanitizeName(payload.mvp) : null,
    title: sanitizeName(payload.title),
    at: Date.now(),
  };

  // 일반 근무는 전체 보드, ZUNRAN DAILY 는 그날 보드.
  // 데일리는 모두 조건이 같으므로 전체 보드와 섞지 않는다.
  const board = payload.challengeId ? `daily:${payload.date}` : 'all';
  const data = await readBoard(env, board);
  const { entries, improved } = insertEntry(data.entries, entry);
  await env.RANK_KV.put(boardKey(board), JSON.stringify({ board, updatedAt: Date.now(), entries }));

  return json({ ok: true, board, improved, myRank: rankOf(entries, id) });
};
