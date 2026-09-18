import type { UISnapshot } from '../game/types';
import { formatTime } from '../game/config';
import { Icon } from './Icon';
import { THEME_INFO } from '../game/data/waves';

interface Props {
  snap: UISnapshot;
  bestWave: number;
  muted: boolean;
  onTogglePause: () => void;
  onToggleSpeed: () => void;
  onToggleMute: () => void;
  onSkipPrep: () => void;
}

// HUD 는 필드 위에 얹는다.
//
// 예전에는 매장 위에 시계·웨이브·체력이 각각 한 줄씩 있는 카드가 따로 있었고,
// 390×700 화면에서 그 카드가 90px, 게임 화면은 350px — 딱 절반이었다.
// 시계도 체력도 결국 '지금 매장이 어떤가'라서, 매장 위에 얹으면 될 일이었다.
//
// 매장 맨 윗줄은 벽이라 아무것도 지나가지 않는다. 거기에 얹는다.
export function Hud({ snap, bestWave, muted, onTogglePause, onToggleSpeed, onToggleMute, onSkipPrep }: Props) {
  const hpPct = Math.round((snap.hp / snap.maxHp) * 100);
  const hpClass = hpPct <= 25 ? 'danger' : hpPct <= 50 ? 'warn' : '';
  const waveProgress = snap.prep > 0 ? 1 : 1 - snap.waveTimer / snap.waveDuration;
  const showThemes = snap.waveTheme !== 'mixed' || snap.nextIsBoss || snap.nextWaveTheme !== 'mixed';
  return (
    <>
    <div className="fhud fhud-head">
      {/* 웨이브 진행은 필드 맨 위 한 줄. 숫자보다 '얼마 안 남았다'가 먼저 읽혀야 한다. */}
      <div className="fhud-wave-line">
        <div className="fhud-wave-fill" style={{ width: `${waveProgress * 100}%` }} />
      </div>

      <div className="fhud-top">
        <span className="fhud-clock px">{snap.clock}</span>
        <span className="fhud-wave px">W{snap.wave}</span>
        <span className="fhud-timer px">{Math.ceil(snap.waveTimer)}s</span>
        <span className="fhud-gap" />
        <span className="fhud-coin px">{formatCoins(snap.coins)}</span>
        {/* 일시정지·배속·음소거. 예전에는 필드 오른쪽에 세로로 쌓여서
            매장 3분의 1을 가리고 있었다. */}
        <span className="fhud-ctrls">
          <button onClick={onTogglePause} aria-label={snap.paused ? '계속하기' : '일시정지'}>
            <Icon name={snap.paused ? 'play' : 'pause'} size={13} />
          </button>
          <button className={snap.speed === 2 ? 'active' : ''} onClick={onToggleSpeed} aria-label="2배속" aria-pressed={snap.speed === 2}>
            <span className="px">×{snap.speed}</span>
          </button>
          <button onClick={onToggleMute} aria-label={muted ? '소리 켜기' : '소리 끄기'} aria-pressed={muted}>
            <Icon name={muted ? 'mute' : 'sound'} size={13} strokeWidth={2.2} />
          </button>
        </span>
      </div>

      {/* 준비 시간 — 보스와 새벽 3시 앞에만 온다.
          예고를 읽어도 손쓸 틈이 없으면 예고가 아니다. */}
      {snap.prep > 0 && (
        <div className="fhud-prep-wrap">
          <div className="fhud-prep">
            <span className="fhud-prep-label">
              {snap.prepBoss ? snap.prepBoss.name : '새벽 3시 준비'}
            </span>
            <span className="fhud-prep-sec px">{Math.ceil(snap.prep)}</span>
            <button className="fhud-prep-go" onClick={onSkipPrep}>
              지금 시작
            </button>
          </div>
          {/* 무엇을 준비해야 하는지 말해 준다. 이게 없으면 8초는 그냥 대기 시간이다. */}
          {snap.prepBoss?.hint && <div className="fhud-prep-hint">{snap.prepBoss.hint}</div>}
        </div>
      )}

    </div>

    {/* 예고와 경고는 아래로 내린다.
        「계산대 앞 5명」은 계산대 옆에 있어야 읽히고, 위를 비워 두면
        HUD 높이가 고정되어 웨이브 배너와 안내문 자리가 흔들리지 않는다. */}
    <div className="fhud fhud-foot">
      {/* 이번 웨이브가 무엇을 시험하는지, 다음엔 무엇이 오는지.
          예고가 있어야 대비할 수 있고, 대비할 수 있어야 판단이 생긴다. */}
      {showThemes && (
        <div className="fhud-chips">
          {snap.waveTheme !== 'mixed' && (
            <span className={`theme-chip now t-${snap.waveTheme}`}>
              {THEME_INFO[snap.waveTheme].label} · {THEME_INFO[snap.waveTheme].hint}
            </span>
          )}
          {snap.nextIsBoss ? (
            <span className="theme-chip next t-boss">다음 · 보스</span>
          ) : (
            snap.nextWaveTheme !== 'mixed' && (
              <span className={`theme-chip next t-${snap.nextWaveTheme}`}>다음 · {THEME_INFO[snap.nextWaveTheme].label}</span>
            )
          )}
        </div>
      )}

      {(snap.activeEvents.length > 0 || snap.bossAlive || snap.combo >= 3 || snap.riskWave || snap.nearCheckout >= 3 || (snap.nextIsBoss && snap.phase === 'playing')) && (
        <div className="fhud-chips fhud-sub">
          {/* 밀리고 있다는 신호. 체력이 깎이기 전에 보여야 대응할 수 있다. */}
          {snap.nearCheckout >= 3 && (
            <span className={`near-chip ${snap.nearCheckout >= 7 ? 'bad' : ''}`}>
              계산대 앞 {snap.nearCheckout}명
              {/* 줄이 막히면 매출이 샌다. 체력이 깎이기 전에 돈으로 먼저 보인다. */}
              {snap.nearDrain > 0 && <b> 매출 −{Math.round(snap.nearDrain * 100)}%</b>}
            </span>
          )}
          {snap.nextIsBoss && !snap.bossAlive && (
            <span className="fhud-next-boss px">
              <Icon name="boss" size={10} strokeWidth={2.4} />! BOSS NEXT
            </span>
          )}
          {snap.combo >= 3 && <span className="combo-chip">{snap.combo} COMBO</span>}
          {snap.riskWave && <span className="event-chip event-bad">새벽 장사 · 코인 2배</span>}
          {snap.activeEvents.map((ev) => (
            <span key={ev.title} className={`event-chip event-${ev.mood}`}>
              {ev.title} <b>{Math.ceil(ev.remain)}s</b>
            </span>
          ))}
        </div>
      )}

      {snap.bossAlive && (
        <div className="fhud-boss">
          <span className="boss-name">
            <Icon name="boss" size={12} strokeWidth={2.4} />
            {snap.bossName}
          </span>
          <div className="bar bar-boss">
            <div className="bar-fill" style={{ width: `${(snap.bossHp / Math.max(1, snap.bossMaxHp)) * 100}%` }} />
          </div>
        </div>
      )}

      {/* 체력은 필드 아래 가장자리. 손님이 계산대에 닿으면 깎이는 값이라
          지켜야 할 선 위에 있는 게 맞다. 생존 시간과 최고 기록은 판을 굴리는
          정보가 아니라서 그 옆에 작게 둔다. */}
      <div className="fhud-hp">
        <div className={`bar bar-hp ${hpClass}`}>
          <div className="bar-fill" style={{ width: `${hpPct}%` }} />
        </div>
        <b className={`fhud-hp-num px ${hpClass}`}>{hpPct}</b>
        <span className="fhud-run px">
          {formatTime(snap.survivedSec)} · 최고 W{Math.max(bestWave, snap.wave)}
        </span>
      </div>
    </div>
    </>
  );
}

// 좁은 HUD 에서 넘치지 않게 1만 이상은 축약
function formatCoins(n: number): string {
  if (n >= 10000) return `${(n / 10000).toFixed(n >= 100000 ? 0 : 1)}만`;
  return n.toLocaleString();
}
