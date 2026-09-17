import type { UISnapshot } from '../game/types';
import { formatTime } from '../game/config';
import { Icon } from './Icon';
import { THEME_INFO } from '../game/data/waves';

// 아케이드 HUD: 한 장의 픽셀 프레임 안에 세 줄.
// 1줄 시계·생존·코인 / 2줄 웨이브 / 3줄 매장 체력.
// 칸을 나누지 않고 막대를 늘려서 320px 에서도 눌리지 않는다.
export function Hud({ snap, bestWave }: { snap: UISnapshot; bestWave: number }) {
  const hpPct = Math.round((snap.hp / snap.maxHp) * 100);
  const hpClass = hpPct <= 25 ? 'danger' : hpPct <= 50 ? 'warn' : '';
  const waveProgress = 1 - snap.waveTimer / snap.waveDuration;
  return (
    <header className="hud">
      <div className="hud-card">
        <div className="hud-row">
          <span className="hud-time px">{snap.clock}</span>
          <span className="hud-meta px">
            <Icon name="clock" size={10} strokeWidth={2.6} />
            {formatTime(snap.survivedSec)}
          </span>
          <span className="hud-best px">
            <Icon name="trophy" size={10} strokeWidth={2.6} />W{Math.max(bestWave, snap.wave)}
          </span>
          <span className="hud-spacer" />
          <span className="hud-coin-label px">COIN</span>
          <b className="hud-coin">{formatCoins(snap.coins)}</b>
        </div>

        <div className="hud-row">
          <span className="hud-key">웨이브</span>
          <b className="hud-wave-num">{snap.wave}</b>
          <div className="bar bar-wave">
            <div className="bar-fill" style={{ width: `${waveProgress * 100}%` }} />
          </div>
          <span className="hud-wave-timer px">{Math.ceil(snap.waveTimer)}s</span>
        </div>

        {/* 이번 웨이브가 무엇을 시험하는지, 다음엔 무엇이 오는지.
            예고가 있어야 대비할 수 있고, 대비할 수 있어야 판단이 생긴다. */}
        {(snap.waveTheme !== 'mixed' || snap.nextIsBoss || snap.nextWaveTheme !== 'mixed') && (
        <div className="hud-row hud-theme-row">
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

        <div className="hud-row">
          <span className="hud-key">체력</span>
          <div className={`bar bar-hp ${hpClass}`}>
            <div className="bar-fill" style={{ width: `${hpPct}%` }} />
          </div>
          <b className={`hud-hp-num ${hpClass}`}>{hpPct}</b>
        </div>
      </div>

      {(snap.activeEvents.length > 0 || snap.bossAlive || snap.combo >= 3 || snap.riskWave || (snap.nextIsBoss && snap.phase === 'playing')) && (
        <div className="hud-row hud-sub">
          {snap.nextIsBoss && !snap.bossAlive && (
            <span className="hud-next-boss">
              <Icon name="boss" size={11} strokeWidth={2.4} />! BOSS NEXT
            </span>
          )}
          {snap.combo >= 3 && <span className="combo-chip">{snap.combo} COMBO</span>}
          {snap.riskWave && <span className="event-chip event-bad">새벽 장사 · 코인 2배</span>}
          {snap.bossAlive && (
            <div className="boss-bar">
              <span className="boss-name">
                <Icon name="boss" size={13} strokeWidth={2.4} />
                {snap.bossName}
              </span>
              <div className="bar bar-boss">
                <div className="bar-fill" style={{ width: `${(snap.bossHp / Math.max(1, snap.bossMaxHp)) * 100}%` }} />
              </div>
            </div>
          )}
          {snap.activeEvents.map((ev) => (
            <span key={ev.title} className={`event-chip event-${ev.mood}`}>
              {ev.title} <b>{Math.ceil(ev.remain)}s</b>
            </span>
          ))}
        </div>
      )}
    </header>
  );
}

// 좁은 HUD 에서 넘치지 않게 1만 이상은 축약
function formatCoins(n: number): string {
  if (n >= 10000) return `${(n / 10000).toFixed(n >= 100000 ? 0 : 1)}만`;
  return n.toLocaleString();
}
