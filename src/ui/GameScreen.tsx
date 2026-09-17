import { useEffect, useState } from 'react';
import type { Engine } from '../game/engine/Engine';
import type { ShiftCondition } from '../game/data/shiftConditions';
import type { ChallengeSpec, MetaEffects, UISnapshot } from '../game/types';
import { useGame } from './useGame';
import { Hud } from './Hud';
import { BottomPanel } from './BottomPanel';
import { BannerLayer } from './Banner';
import { RewardOverlay } from './RewardOverlay';
import { PromoteOverlay } from './PromoteOverlay';
import { EventChoiceOverlay } from './EventChoiceOverlay';
import { Icon } from './Icon';

interface Props {
  meta: MetaEffects;
  bestWave: number;
  muted: boolean;
  autoMerge: boolean;
  autoSell: boolean;
  showHints: boolean;
  order: { pins: string[]; bans: string[] };
  condition: ShiftCondition | null;
  challenge: ChallengeSpec | null;
  onToggleMute: () => void;
  onToggleAutoMerge: () => void;
  onToggleAutoSell: () => void;
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

export function GameScreen({ meta, bestWave, muted, autoMerge, autoSell, showHints, order, condition, challenge, onToggleMute, onToggleAutoMerge, onToggleAutoSell, onGameOver }: Props) {
  const { canvasRef, snap, banners, act, toast, denied, onPointerDown, onPointerMove, endDrag } = useGame({ meta, bestWave, muted, autoMerge, autoSell, order, condition, challenge, onGameOver });
  // 퇴근은 되돌릴 수 없으니 두 번 눌러야 한다. 일시정지를 풀면 초기화한다.
  const [confirmExit, setConfirmExit] = useState(false);
  const paused = snap?.paused ?? false;
  useEffect(() => {
    if (!paused) setConfirmExit(false);
  }, [paused]);
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
          {snap && (
            <div className="field-controls">
              <button onClick={() => act({ type: 'TOGGLE_PAUSE' })} aria-label={snap.paused ? '계속하기' : '일시정지'}>
                <Icon name={snap.paused ? 'play' : 'pause'} size={15} />
              </button>
              <button
                className={snap.speed === 2 ? 'active' : ''}
                onClick={() => act({ type: 'SET_SPEED', speed: snap.speed === 1 ? 2 : 1 })}
                aria-label="2배속"
                aria-pressed={snap.speed === 2}
              >
                <span className="px">×{snap.speed}</span>
              </button>
              <button onClick={onToggleMute} aria-label={muted ? '소리 켜기' : '소리 끄기'} aria-pressed={muted}>
                <Icon name={muted ? 'mute' : 'sound'} size={15} strokeWidth={2.2} />
              </button>
            </div>
          )}
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
              <div className="pause-settings" onClick={(e) => e.stopPropagation()}>
                <button className={`quick-btn ${autoMerge ? 'active' : ''}`} onClick={onToggleAutoMerge} aria-pressed={autoMerge}>
                  <Icon name="merge" size={16} strokeWidth={2.4} />
                  자동 합성 {autoMerge ? 'ON' : 'OFF'}
                </button>
                <button className={`quick-btn ${autoSell ? 'active' : ''}`} onClick={onToggleAutoSell} aria-pressed={autoSell}>
                  <Icon name="broom" size={16} strokeWidth={2.4} />
                  자동 정리 {autoSell ? 'ON' : 'OFF'}
                </button>
              </div>
              <div className="pause-exit" onClick={(e) => e.stopPropagation()}>
                <button className={`exit-btn ${confirmExit ? 'armed' : ''}`} onClick={() => (confirmExit ? act({ type: 'GIVE_UP' }) : setConfirmExit(true))}>
                  <Icon name="store" size={16} strokeWidth={2.4} />
                  {confirmExit ? '한 번 더 누르면 퇴근' : '근무 끝내고 나가기'}
                </button>
                <div className="exit-note">
                  {confirmExit ? '지금까지 기록이 저장되고 야간 수당을 받습니다' : '지금까지 기록으로 근무 보고서를 받습니다'}
                </div>
              </div>
              <div className="pause-sub">바깥을 탭하면 계속</div>
            </div>
          )}
        </div>
      </div>
      {snap && <BottomPanel snap={snap} act={act} denied={denied} />}
      {snap && <RewardOverlay snap={snap} act={act} />}
      {snap && <PromoteOverlay snap={snap} act={act} />}
      {snap && <EventChoiceOverlay snap={snap} act={act} />}
    </div>
  );
}
