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
  onToggleMute: () => void;
  onGameOver: (engine: Engine) => void;
}

export function GameScreen({ meta, bestWave, muted, onToggleMute, onGameOver }: Props) {
  const { canvasRef, snap, banners, act, toast, onCanvasPointer } = useGame({ meta, bestWave, muted, onGameOver });
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
          {snap?.paused && (
            <div className="pause-overlay" onClick={() => act({ type: 'TOGGLE_PAUSE' })}>
              <div className="pause-text">일시정지</div>
              <div className="pause-sub">탭해서 계속</div>
            </div>
          )}
        </div>
      </div>
      {snap && <BottomPanel snap={snap} act={act} muted={muted} onToggleMute={onToggleMute} />}
    </div>
  );
}
