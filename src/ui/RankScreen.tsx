import { useCallback, useEffect, useState } from 'react';
import type { SaveData } from '../game/save/storage';
import type { RankEntry } from '../game/rank/types';
import { MAX_NAME_LEN } from '../game/rank/types';
import { fetchBoard, formatTime, shareLine, type RankStatus } from '../game/rank/api';
import { sanitizeName } from '../game/rank/validate';
import { dateKey } from '../game/daily';
import { Icon } from './Icon';

type Board = 'daily' | 'all' | 'mine';

const BOARD_LABEL: Record<Board, string> = {
  daily: '오늘의 근무',
  all: '전체 최고',
  mine: '내 기록',
};

const STATUS_MSG: Record<RankStatus, string> = {
  ok: '',
  offline: '서버에 닿지 못했습니다. 잠시 뒤 다시 시도해 주세요.',
  unconfigured: '랭킹 서버가 아직 연결되지 않았습니다. 내 기록은 기기에 그대로 남아 있습니다.',
  error: '랭킹을 불러오지 못했습니다.',
};

// 내 로컬 기록을 서버 기록과 같은 모양으로 바꾼다 (오프라인에서도 순위표를 볼 수 있게).
function localEntries(save: SaveData): RankEntry[] {
  const name = sanitizeName(save.nickname);
  return save.runHistory
    .map((r) => ({
      id: save.playerId.slice(0, 8),
      name,
      wave: r.wave,
      time: r.time,
      kills: r.kills,
      combo: r.bestCombo,
      mvp: r.mvp,
      title: r.runTitle,
      at: r.at,
    }))
    .sort((a, b) => b.wave - a.wave || a.time - b.time);
}

interface Props {
  save: SaveData;
  onSetNickname: (name: string) => void;
  onToggleOptIn: () => void;
}

export function RankScreen({ save, onSetNickname, onToggleOptIn }: Props) {
  const [board, setBoard] = useState<Board>('daily');
  const [entries, setEntries] = useState<RankEntry[]>([]);
  const [myRank, setMyRank] = useState<number | null>(null);
  const [status, setStatus] = useState<RankStatus | 'loading'>('loading');
  const [nameDraft, setNameDraft] = useState(save.nickname);
  const [copied, setCopied] = useState(false);
  const me = save.playerId.slice(0, 8);

  const mine = localEntries(save);

  useEffect(() => {
    if (board === 'mine') return; // 로컬 기록은 render 에서 바로 만든다
    let alive = true;
    setStatus('loading');
    fetchBoard(board, me).then((r) => {
      if (!alive) return;
      setEntries(r.board?.entries ?? []);
      setMyRank(r.myRank);
      setStatus(r.status);
    });
    return () => {
      alive = false;
    };
  }, [board, me]);

  const rows = board === 'mine' ? mine : entries;
  const view: RankStatus | 'loading' = board === 'mine' ? 'ok' : status;

  const saveName = useCallback(() => {
    const clean = sanitizeName(nameDraft);
    setNameDraft(clean === '익명 알바' && !nameDraft.trim() ? '' : clean);
    onSetNickname(clean);
  }, [nameDraft, onSetNickname]);

  const share = useCallback(async () => {
    const best = board === 'mine' ? mine[0] : entries.find((e) => e.id === me);
    if (!best) return;
    const text = shareLine(best, board === 'mine' ? null : myRank, BOARD_LABEL[board]);
    try {
      if (navigator.share) {
        await navigator.share({ text });
        return;
      }
    } catch {
      // 공유 취소 → 복사로 넘어간다
    }
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      // 클립보드도 막힌 환경
    }
  }, [board, entries, mine, me, myRank]);

  const hasMine = rows.length > 0 && (board === 'mine' || entries.some((e) => e.id === me));

  return (
    <div className="rank">
      <div className="rank-tabs">
        {(['daily', 'all', 'mine'] as Board[]).map((b) => (
          <button key={b} className={board === b ? 'active' : ''} onClick={() => setBoard(b)}>
            {BOARD_LABEL[b]}
          </button>
        ))}
      </div>

      <div className="rank-note">
        {board === 'daily' && `${dateKey()} · 오늘의 규칙으로 뛴 기록만 올라갑니다`}
        {board === 'all' && '일반 근무 기록. 웨이브 → 소요 시간 순으로 정렬합니다'}
        {board === 'mine' && '이 기기에 저장된 최근 근무 기록입니다'}
      </div>

      {view === 'loading' && <div className="rank-empty">불러오는 중…</div>}
      {view !== 'loading' && view !== 'ok' && <div className="rank-empty">{STATUS_MSG[view as RankStatus]}</div>}
      {view === 'ok' && rows.length === 0 && (
        <div className="rank-empty">{board === 'mine' ? '아직 기록이 없습니다.' : '아직 아무도 기록을 올리지 않았습니다. 첫 번째가 되어 보세요.'}</div>
      )}

      {view === 'ok' && rows.length > 0 && (
        <ol className="rank-list">
          {rows.slice(0, 50).map((e, i) => (
            <li key={`${e.id}-${e.at}`} className={e.id === me && board !== 'mine' ? 'me' : ''}>
              <span className={`rank-no r${i + 1 <= 3 ? i + 1 : 0}`}>{i + 1}</span>
              <span className="rank-name">
                {e.name}
                {e.title && <em className="rank-title">{e.title}</em>}
              </span>
              <span className="rank-score">
                <b>W{e.wave}</b>
                <span className="px">{formatTime(e.time)}</span>
              </span>
            </li>
          ))}
        </ol>
      )}

      {board !== 'mine' && myRank && myRank > 50 && <div className="rank-mine">내 순위 {myRank}위</div>}

      <div className="rank-me">
        <label className="rank-field">
          <span>표시 이름</span>
          <input
            value={nameDraft}
            maxLength={MAX_NAME_LEN}
            placeholder="익명 알바"
            onChange={(e) => setNameDraft(e.target.value)}
            onBlur={saveName}
          />
        </label>
        <button className="rank-optin" onClick={onToggleOptIn} aria-pressed={save.rankOptIn}>
          <Icon name={save.rankOptIn ? 'check' : 'tag'} size={13} strokeWidth={2.4} />
          랭킹 등록 {save.rankOptIn ? '켜짐' : '꺼짐'}
        </button>
        <button className="rank-share" onClick={share} disabled={!hasMine}>
          <Icon name="copy" size={13} strokeWidth={2.4} />
          {copied ? '복사됨' : '기록 공유'}
        </button>
      </div>
      <div className="rank-legal">
        기록은 판이 끝날 때 자동으로 올라갑니다. 서버에는 표시 이름과 기록만 저장되고, 기기 식별자는 앞 8자만 올라갑니다. 등록을 끄면 아무것도 보내지 않습니다.
      </div>
    </div>
  );
}
