import { json, readBoard } from './_shared';
import type { Env } from './_shared';
import { boardKey, renameEntries } from '../../../src/game/rank/board';
import { sanitizeName } from '../../../src/game/rank/validate';

// 이름만 바꾼다. 기록은 손대지 않으므로 검증할 숫자가 없다.
// 이미 올라간 보드(전체 + 그날 데일리)에만 반영한다.
export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  if (!env.RANK_KV) return json({ ok: false, reason: 'no-kv' }, 503);

  let body: { playerId?: string; name?: string; date?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return json({ ok: false, reason: 'bad json' }, 400);
  }

  const playerId = typeof body.playerId === 'string' ? body.playerId : '';
  if (playerId.length < 8 || playerId.length > 64) return json({ ok: false, reason: 'playerId' }, 400);
  const date = typeof body.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.date) ? body.date : null;
  if (!date) return json({ ok: false, reason: 'date' }, 400);

  const id = playerId.slice(0, 8);
  const name = sanitizeName(body.name);

  // KV 의 expirationTtl 최소값이 60초라 1분에 한 번으로 제한된다.
  // 막혀도 문제없다 — 이름은 기기에 이미 저장됐고, 다음 판 기록을 올릴 때 보드 이름이 갱신된다.
  const rlKey = `rln:${id}`;
  if (await env.RANK_KV.get(rlKey)) return json({ ok: false, reason: 'rate limited' }, 429);
  await env.RANK_KV.put(rlKey, '1', { expirationTtl: 60 });

  let updated = 0;
  for (const board of ['all', `daily:${date}`]) {
    const data = await readBoard(env, board);
    const { entries, changed } = renameEntries(data.entries, id, name);
    if (!changed) continue;
    await env.RANK_KV.put(boardKey(board), JSON.stringify({ board, updatedAt: Date.now(), entries }));
    updated++;
  }
  return json({ ok: true, updated, name });
};
