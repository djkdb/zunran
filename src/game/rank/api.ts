import type { RankBoard, RankEntry, ScorePayload } from './types';

// 서버(Cloudflare Pages Functions + KV)가 붙어 있지 않아도 게임은 그대로 돌아가야 한다.
// 그래서 이 모듈의 모든 함수는 던지지 않고 상태값을 돌려준다.

export type RankStatus = 'ok' | 'offline' | 'unconfigured' | 'error';

export interface FetchBoardResult {
  status: RankStatus;
  board: RankBoard | null;
  myRank: number | null;
}

export interface SubmitResult {
  status: RankStatus | 'rejected' | 'rate-limited';
  myRank: number | null;
  reason?: string;
}

const TIMEOUT_MS = 6000;

// 로컬 dev/preview 처럼 Functions 가 안 붙은 곳에서는 /api/* 가 index.html 을 돌려준다.
// JSON 이 아니면 서버가 없는 것으로 본다 (파싱 에러로 겁주지 않는다).
function isJson(res: Response): boolean {
  return (res.headers.get('content-type') ?? '').includes('json');
}

async function req(path: string, init?: RequestInit): Promise<Response | null> {
  if (typeof fetch !== 'function') return null;
  const ctl = typeof AbortController === 'function' ? new AbortController() : null;
  const timer = ctl ? setTimeout(() => ctl.abort(), TIMEOUT_MS) : null;
  try {
    return await fetch(path, { ...init, signal: ctl?.signal });
  } catch {
    return null; // 네트워크 없음 / 타임아웃
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function fetchBoard(board: 'all' | 'daily' | string, me?: string): Promise<FetchBoardResult> {
  const q = me ? `?me=${encodeURIComponent(me.slice(0, 8))}` : '';
  const res = await req(`/api/rank/${encodeURIComponent(board)}${q}`);
  if (!res) return { status: 'offline', board: null, myRank: null };
  if (res.status === 503 || !isJson(res)) return { status: 'unconfigured', board: null, myRank: null };
  if (!res.ok) return { status: 'error', board: null, myRank: null };
  try {
    const data = (await res.json()) as { ok: boolean; board: RankBoard; myRank: number | null };
    if (!data.ok) return { status: 'error', board: null, myRank: null };
    return { status: 'ok', board: data.board, myRank: data.myRank ?? null };
  } catch {
    return { status: 'error', board: null, myRank: null };
  }
}

export async function submitScore(payload: ScorePayload): Promise<SubmitResult> {
  const res = await req('/api/rank/submit', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res) return { status: 'offline', myRank: null };
  if (res.status === 503 || !isJson(res)) return { status: 'unconfigured', myRank: null };
  if (res.status === 429) return { status: 'rate-limited', myRank: null };
  let body: { ok?: boolean; myRank?: number | null; reason?: string } = {};
  try {
    body = (await res.json()) as typeof body;
  } catch {
    // 아래에서 상태코드로 판단
  }
  if (res.status === 400) return { status: 'rejected', myRank: null, reason: body.reason };
  if (!res.ok || !body.ok) return { status: 'error', myRank: null, reason: body.reason };
  return { status: 'ok', myRank: body.myRank ?? null };
}

// 랭킹판에 쓰는 시간 표기 (12:34)
export function formatTime(sec: number): string {
  const s = Math.max(0, Math.round(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

// 카톡 등에 붙여넣을 한 줄 공유 문구
export function shareLine(e: RankEntry, rank: number | null, boardLabel: string): string {
  const head = rank ? `${boardLabel} ${rank}위` : boardLabel;
  return [
    `🏪 편의점 야간근무 · ${head}`,
    `${e.name} — 웨이브 ${e.wave} / ${formatTime(e.time)} / ${e.kills}명 응대`,
    e.title ? `"${e.title}"` : '',
    'https://zunran.pages.dev',
  ]
    .filter(Boolean)
    .join('\n');
}
