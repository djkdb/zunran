import { UNIT_BY_ID } from '../game/data/units';
import { CHALLENGE_BY_ID } from '../game/data/dailyChallenges';
import { formatTime } from '../game/config';
import type { SaveData } from '../game/save/storage';
import { Icon } from './Icon';

function ago(at: number): string {
  const d = Date.now() - at;
  const min = Math.floor(d / 60000);
  if (min < 1) return '방금';
  if (min < 60) return `${min}분 전`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}시간 전`;
  return `${Math.floor(h / 24)}일 전`;
}

export function HistoryScreen({ save }: { save: SaveData }) {
  if (save.runHistory.length === 0) {
    return <div className="inventory-empty">아직 근무 기록이 없습니다. 한 판 뛰고 오세요.</div>;
  }
  return (
    <div className="history">
      {save.runHistory.map((r) => (
        <div key={r.at} className="hist-item">
          <div className="hist-head">
            <span className="hist-title">「{r.runTitle}」</span>
            <span className="hist-ago px">{ago(r.at)}</span>
          </div>
          <div className="hist-stats">
            <span>
              WAVE <b className="px">{r.wave}</b>
            </span>
            <span>
              생존 <b className="px">{formatTime(r.time)}</b>
            </span>
            <span>
              처리 <b className="px">{r.kills}</b>
            </span>
            <span>
              합성 <b className="px">{r.merges}</b>
            </span>
            <span>
              콤보 <b className="px">{r.bestCombo}</b>
            </span>
          </div>
          <div className="hist-foot">
            {r.mvp && UNIT_BY_ID[r.mvp] && <span className="hist-mvp">MVP {UNIT_BY_ID[r.mvp].name}</span>}
            {r.challengeId && <span className="hist-daily">{CHALLENGE_BY_ID[r.challengeId]?.name ?? 'DAILY'}</span>}
            {r.missionCleared && (
              <span className="hist-clear">
                <Icon name="check" size={12} strokeWidth={2.6} />
                미션 완료
              </span>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
