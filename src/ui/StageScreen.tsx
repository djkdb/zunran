import { STAGES, stageUnlocked, maxSlotsOf, STAGE_BY_ID, type StageDef } from '../game/data/stages';
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
          return (
            <button
              key={st.id}
              className={`stage-card ${open ? '' : 'locked'} ${current === st.id ? 'current' : ''}`}
              disabled={!open}
              onClick={() => onPick(st.id)}
            >
              <div className="stage-top">
                <span className="stage-name">{st.name}</span>
                <span className="stage-pay px">수당 ×{st.scoreMult}</span>
              </div>
              <div className="stage-sub">{st.sub}</div>
              <StageMap stage={st} />
              <div className="stage-stats px">
                <span>진열대 {maxSlotsOf(st)}칸</span>
                <span>통로 {st.rows.length}줄</span>
                <span className={st.traffic.count > 1 ? 'hot' : st.traffic.count < 1 ? 'calm' : ''}>
                  유동인구 {Math.round(st.traffic.count * 100)}%
                </span>
                <span>벌이 {Math.round(st.traffic.coin * 100)}%</span>
              </div>
              <div className="stage-desc">{st.desc}</div>
              <div className="stage-foot">
                {open ? (
                  best > 0 ? <span className="stage-best px">최고 {best}웨이브</span> : <span className="stage-new px">아직 안 가봤다</span>
                ) : (
                  <span className="stage-lock">
                    <Icon name="store" size={12} strokeWidth={2.4} />
                    {STAGE_BY_ID[st.unlockAfter!]?.name}에서 {st.unlockWave}웨이브 · 지금 {bestByStage[st.unlockAfter!] ?? 0}
                  </span>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// 매장 구조 미리보기. 통로가 몇 줄인지, 진열대가 몇 칸인지 한눈에 보인다.
function StageMap({ stage }: { stage: StageDef }) {
  const w = 200;
  const h = 84;
  const pad = 8;
  const cellW = (w - pad * 2) / stage.cols.length;
  const rowH = (h - pad * 2) / stage.rows.length;
  return (
    <svg className="stage-map" viewBox={`0 0 ${w} ${h}`} role="img" aria-label={`${stage.name} 매장 구조`}>
      <rect x="1" y="1" width={w - 2} height={h - 2} rx="3" className="stage-map-bg" />
      {stage.rows.map((_, row) => (
        <line key={`a${row}`} x1={pad} y1={pad + rowH * (row + 0.15)} x2={w - pad} y2={pad + rowH * (row + 0.15)} className="stage-map-aisle" />
      ))}
      {stage.rows.map((_, row) =>
        stage.cols.map((__, col) => (
          <rect
            key={`${row}-${col}`}
            x={pad + cellW * col + 2}
            y={pad + rowH * row + rowH * 0.45}
            width={cellW - 4}
            height={rowH * 0.42}
            rx="1"
            className="stage-map-slot"
          />
        )),
      )}
    </svg>
  );
}
