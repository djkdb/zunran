import type { GameAction, UISnapshot } from '../game/types';
import { Icon, type IconName } from './Icon';

const TONE_LABEL = { normal: '보상', good: '좋은 보상', best: '대박' } as const;

// 웨이브 보상 3택 1. 게임은 이 화면이 뜬 동안 멈춘다.
export function RewardOverlay({ snap, act }: { snap: UISnapshot; act: (a: GameAction) => void }) {
  if (snap.phase !== 'reward' || snap.rewardOffers.length === 0) return null;
  return (
    <div className="reward-overlay" role="dialog" aria-label="웨이브 보상 선택">
      <div className="reward-panel">
        <div className="reward-head">
          <div className="reward-title">웨이브 {snap.wave} 보상</div>
          <div className="reward-sub">하나만 고르세요 · 이번 근무 동안 유지됩니다</div>
        </div>
        <div className="reward-cards">
          {snap.rewardOffers.map((o) => (
            <button key={o.defId} className={`reward-card tone-${o.tone} kind-${o.kind}`} onClick={() => act({ type: 'CHOOSE_REWARD', defId: o.defId })}>
              <span className="reward-icon">
                <Icon name={o.icon as IconName} size={26} strokeWidth={2.2} />
              </span>
              <span className="reward-body">
                <span className="reward-tone">
                  {o.kind === 'build' ? '판이 바뀐다' : TONE_LABEL[o.tone]}
                </span>
                <span className="reward-name">{o.name}</span>
                <span className="reward-desc">{o.desc}</span>
              </span>
            </button>
          ))}
        </div>
        <div className="reward-foot">지금까지 고른 보상 {snap.rewardsTaken}개</div>
      </div>
    </div>
  );
}
