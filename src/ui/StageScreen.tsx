import { STAGES, stageUnlocked, maxSlotsOf, STAGE_BY_ID, type StageDef } from '../game/data/stages';
import { StoreFrontScene } from './StoreFrontScene';
import { Icon } from './Icon';

interface Props {
  bestByStage: Record<string, number>;
  current: string;
  onPick: (id: string) => void;
  onBack: () => void;
}

// 지점 선택.
//
// 잠긴 지점도 전부 보여준다. 첫 지점을 깨고 "이게 다야?" 하고 떠나면 끝이다 —
// 앞에 무엇이 있는지, 얼마나 가야 열리는지가 처음부터 보여야 한다.
//
// 카드는 밤거리 간판이다. 지나가는 사람 수가 곧 난이도라서, 숫자를 읽기 전에
// 그림에서 먼저 읽힌다 — 시골점은 가끔 한 명, 술집가는 끊이지 않는다.
// (예전에는 평면도 SVG 와 퍼센트 네 개였다. 스펙 시트처럼 보였다.)
export function StageScreen({ bestByStage, current, onPick, onBack }: Props) {
  return (
    <div className="screen stage-screen">
      <div className="screen-head">
        <button className="back-btn" onClick={onBack} aria-label="뒤로">
          <Icon name="restart" size={16} strokeWidth={2.4} />
        </button>
        <div>
          <div className="screen-kicker px">BRANCH</div>
          <h2 className="screen-title">어느 지점에서 일할까</h2>
          <p className="screen-sub">자리가 다르면 손님이 다릅니다. 유동인구가 곧 난이도입니다.</p>
        </div>
      </div>

      <div className="stage-list">
        {STAGES.map((st) => {
          const open = stageUnlocked(st, bestByStage);
          const best = bestByStage[st.id] ?? 0;
          const need = st.unlockAfter ? (bestByStage[st.unlockAfter] ?? 0) : 0;
          return (
            <button
              key={st.id}
              className={`stage-card ${open ? '' : 'locked'} ${current === st.id ? 'current' : ''}`}
              disabled={!open}
              onClick={() => onPick(st.id)}
            >
              <div className="stage-scene">
                <StoreFrontScene variant={st.id} height={150} fade={false} dim={!open} />
                <span className="stage-sign">{st.name}</span>
                {!open && (
                  <span className="stage-shutter">
                    <Icon name="lock" size={13} strokeWidth={2.6} />
                    {STAGE_BY_ID[st.unlockAfter!]?.short} {need}/{st.unlockWave}웨이브
                  </span>
                )}
                {open && best > 0 && <span className="stage-badge px">최고 W{best}</span>}
                {open && best === 0 && <span className="stage-badge px new">NEW</span>}
              </div>

              <div className="stage-body">
                <div className="stage-sub">{st.sub}</div>
                {/* 유동인구는 사람 아이콘 수로, 벌이는 지폐 수로. 퍼센트는 옆에 작게. */}
                <div className="stage-gauges">
                  <span className="stage-gauge">
                    <i className="g-label">유동인구</i>
                    <i className="g-dots">{dots(st.traffic.count, 'hot')}</i>
                    <i className="g-num px">{Math.round(st.traffic.count * 100)}%</i>
                  </span>
                  <span className="stage-gauge">
                    <i className="g-label">객단가</i>
                    <i className="g-dots">{dots(st.traffic.coin, 'gold')}</i>
                    <i className="g-num px">{Math.round(st.traffic.coin * 100)}%</i>
                  </span>
                </div>
                <div className="stage-stats px">
                  <span>진열대 {maxSlotsOf(st)}칸</span>
                  <span>통로 {st.rows.length}줄</span>
                  <span className="pay">수당 ×{st.scoreMult}</span>
                </div>
                <div className="stage-desc">{st.desc}</div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// 배율을 점 다섯 개로. 0.6배 = 2개, 1배 = 3개, 1.6배 = 5개.
function dots(mult: number, tone: 'hot' | 'gold') {
  const n = Math.max(1, Math.min(5, Math.round(mult * 3)));
  return (
    <>
      {Array.from({ length: 5 }, (_, i) => (
        <b key={i} className={i < n ? `on ${tone}` : ''} />
      ))}
    </>
  );
}

export type { StageDef };
