import type { Engine } from '../game/engine/Engine';
import type { ChallengeSpec, MetaEffects, UISnapshot } from '../game/types';
import { useGame } from './useGame';
import { Hud } from './Hud';
import { BottomPanel } from './BottomPanel';
import { BannerLayer } from './Banner';
import { RewardOverlay } from './RewardOverlay';

interface Props {
  meta: MetaEffects;
  bestWave: number;
  muted: boolean;
  autoMerge: boolean;
  showHints: boolean;
  challenge: ChallengeSpec | null;
  onToggleMute: () => void;
  onToggleAutoMerge: () => void;
  onGameOver: (engine: Engine) => void;
}

// 첫 판 코치. 지금 상황에 가장 필요한 한 줄만 보여준다.
function hintFor(snap: UISnapshot): string | null {
  if (snap.unitCount === 0) return '아래 [유닛 뽑기]를 눌러 첫 유닛을 뽑으세요';
  if (snap.selected && snap.unitCount <= 2) return '빈 칸을 탭하면 그 자리로 옮겨집니다. 코너마다 보너스가 달라요';
  if (snap.groups.some((g) => g.mergeable)) return '같은 유닛 3개! 아래 [합성] 버튼을 누르세요';
  if (snap.enemyCount >= 14 && snap.skillReady.shutter) return '손님이 몰렸어요. [셔터 내려]로 전부 멈출 수 있어요';
  if (snap.nextIsBoss) return '다음 웨이브는 보스입니다. 합성으로 화력을 올리세요';
  if (snap.unitCount >= 3 && snap.wave <= 5) return '유닛을 끌어서 다른 칸으로 옮길 수 있어요';
  return null;
}

export function GameScreen({ meta, bestWave, muted, autoMerge, showHints, challenge, onToggleMute, onToggleAutoMerge, onGameOver }: Props) {
  const { canvasRef, snap, banners, act, toast, onPointerDown, onPointerMove, endDrag } = useGame({ meta, bestWave, muted, autoMerge, challenge, onGameOver });
  const hint = showHints && snap && snap.phase === 'playing' && snap.wave <= 8 ? hintFor(snap) : null;
  return (
    <div className="game">
      {snap && <Hud snap={snap} bestWave={bestWave} />}
      <div className="field-wrap">
        <div className="field">
          <canvas
            ref={canvasRef}
            className="field-canvas"
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
          />
          <BannerLayer banners={banners} />
          {toast && (
            <div className="toast" role="status" aria-live="polite">
              {toast}
            </div>
          )}
          {hint && !toast && (
            <div className="hint" role="status" aria-live="polite">
              {hint}
            </div>
          )}
          {snap?.paused && snap.phase === 'playing' && (
            <div className="pause-overlay" onClick={() => act({ type: 'TOGGLE_PAUSE' })}>
              <div className="pause-text">일시정지</div>
              <div className="pause-sub">탭해서 계속</div>
            </div>
          )}
        </div>
      </div>
      {snap && <BottomPanel snap={snap} act={act} muted={muted} onToggleMute={onToggleMute} autoMerge={autoMerge} onToggleAutoMerge={onToggleAutoMerge} />}
      {snap && <RewardOverlay snap={snap} act={act} />}
    </div>
  );
}
