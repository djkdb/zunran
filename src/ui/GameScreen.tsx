import type { Engine } from '../game/engine/Engine';
import type { MetaEffects } from '../game/types';
import { useGame } from './useGame';
import { Hud } from './Hud';
import { BottomPanel } from './BottomPanel';
import { BannerLayer } from './Banner';

interface Props {
  meta: MetaEffects;
  bestWave: number;
  muted: boolean;
  autoMerge: boolean;
  showHints: boolean;
  onToggleMute: () => void;
  onToggleAutoMerge: () => void;
  onGameOver: (engine: Engine) => void;
}

// 첫 판 힌트: 뽑기 → 합성 → 이동 순서로 한 번씩만 보여준다.
function hintFor(snap: { unitCount: number; groups: { mergeable: boolean }[]; wave: number; selected: unknown }): string | null {
  if (snap.unitCount === 0) return '아래 [유닛 뽑기]를 눌러 첫 유닛을 뽑으세요';
  if (snap.groups.some((g) => g.mergeable)) return '같은 유닛 3개! 아래 [합성] 버튼을 누르세요';
  if (snap.unitCount >= 3 && snap.wave <= 4 && !snap.selected) return '유닛을 탭하면 사거리가 보이고, 빈 칸을 탭하면 옮길 수 있어요';
  return null;
}

export function GameScreen({ meta, bestWave, muted, autoMerge, showHints, onToggleMute, onToggleAutoMerge, onGameOver }: Props) {
  const { canvasRef, snap, banners, act, toast, onCanvasPointer } = useGame({ meta, bestWave, muted, autoMerge, onGameOver });
  const hint = showHints && snap && snap.wave <= 5 ? hintFor(snap) : null;
  return (
    <div className="game">
      {snap && <Hud snap={snap} bestWave={bestWave} />}
      <div className="field-wrap">
        <div className="field">
          <canvas
            ref={canvasRef}
            className="field-canvas"
            onPointerDown={(e) => {
              e.preventDefault();
              onCanvasPointer(e.clientX, e.clientY);
            }}
          />
          <BannerLayer banners={banners} />
          {toast && <div className="toast">{toast}</div>}
          {hint && !toast && <div className="hint">{hint}</div>}
          {snap?.paused && (
            <div className="pause-overlay" onClick={() => act({ type: 'TOGGLE_PAUSE' })}>
              <div className="pause-text">일시정지</div>
              <div className="pause-sub">탭해서 계속</div>
            </div>
          )}
        </div>
      </div>
      {snap && <BottomPanel snap={snap} act={act} muted={muted} onToggleMute={onToggleMute} autoMerge={autoMerge} onToggleAutoMerge={onToggleAutoMerge} />}
    </div>
  );
}
