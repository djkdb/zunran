import { compareEntries, MAX_BOARD_ENTRIES } from './types';
import type { RankEntry } from './types';

// 보드 정렬·삽입 규칙. 서버(Pages Function)와 테스트가 같은 코드를 쓴다.

// 보드 이름 정규화. 허용: all, daily:YYYY-MM-DD
export function normalizeBoard(raw: string | null | undefined, today: string): string | null {
  const s = (raw ?? '').trim();
  if (!s || s === 'all') return 'all';
  if (s === 'daily') return `daily:${today}`;
  const m = /^daily[:-](\d{4}-\d{2}-\d{2})$/.exec(s);
  if (m) return `daily:${m[1]}`;
  return null;
}

// 한 사람당 보드마다 최고 기록 하나만 남긴다.
// 기록은 더 좋은 쪽을 남기되 표시 이름은 항상 최신 것으로 갱신한다 (이름을 바꿨는데 옛 이름이 박혀 있으면 곤란).
export function insertEntry(entries: RankEntry[], entry: RankEntry): { entries: RankEntry[]; improved: boolean } {
  const others = entries.filter((e) => e.id !== entry.id);
  const mine = entries.find((e) => e.id === entry.id);
  const improved = !mine || compareEntries(entry, mine) < 0;
  const best = improved ? entry : { ...(mine as RankEntry), name: entry.name };
  const next = [...others, best].sort(compareEntries).slice(0, MAX_BOARD_ENTRIES);
  return { entries: next, improved };
}

// 이름만 바꾼다. 기록은 건드리지 않는다.
export function renameEntries(entries: RankEntry[], id: string, name: string): { entries: RankEntry[]; changed: boolean } {
  let changed = false;
  const next = entries.map((e) => {
    if (e.id !== id || e.name === name) return e;
    changed = true;
    return { ...e, name };
  });
  return { entries: next, changed };
}

export function rankOf(entries: RankEntry[], id: string): number | null {
  const i = entries.findIndex((e) => e.id === id);
  return i < 0 ? null : i + 1;
}

export function boardKey(board: string): string {
  return `board:${board}`;
}
