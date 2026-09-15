import type { UISnapshot } from '../game/types';
import { formatTime } from '../game/config';
import { Icon } from './Icon';

export function Hud({ snap, bestWave }: { snap: UISnapshot; bestWave: number }) {
  const hpPct = Math.round((snap.hp / snap.maxHp) * 100);
  const hpClass = hpPct <= 25 ? 'danger' : hpPct <= 50 ? 'warn' : '';
  const waveProgress = 1 - snap.waveTimer / snap.waveDuration;
  return (
    <header className="hud">
      <div className="hud-row">
        <div className="hud-clock">
          <span className="hud-time">{snap.clock}</span>
          <span className="hud-survive">
            <Icon name="clock" size={10} strokeWidth={2.6} />
            {formatTime(snap.survivedSec)}
            <span className="hud-best">
              <Icon name="trophy" size={10} strokeWidth={2.6} />W{Math.max(bestWave, snap.wave)}
            </span>
          </span>
        </div>

        <div className="hud-wave">
          <div className="hud-wave-label">
            WAVE <b>{snap.wave}</b>
            <span className="hud-wave-timer">{Math.ceil(snap.waveTimer)}s</span>
          </div>
          <div className="bar bar-wave">
            <div className="bar-fill" style={{ width: `${waveProgress * 100}%` }} />
          </div>
        </div>

        <div className="hud-hp">
          <div className={`hud-hp-label ${hpClass}`}>
            <span>체력</span>
            <b>{hpPct}%</b>
          </div>
          <div className={`bar bar-hp ${hpClass}`}>
            <div className="bar-fill" style={{ width: `${hpPct}%` }} />
          </div>
        </div>

        <div className="hud-coins">
          <span>보유 금액</span>
          <b>{formatCoins(snap.coins)}원</b>
        </div>
      </div>

      {(snap.activeEvents.length > 0 || snap.bossAlive || snap.combo >= 3 || snap.riskWave || (snap.nextIsBoss && snap.phase === 'playing')) && (
        <div className="hud-row hud-sub">
          {snap.nextIsBoss && !snap.bossAlive && (
            <span className="hud-next-boss">
              <Icon name="boss" size={12} strokeWidth={2.4} />
              다음 웨이브 보스
            </span>
          )}
          {snap.combo >= 3 && (
            <span className="combo-chip">
              {snap.combo} 연속
            </span>
          )}
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
