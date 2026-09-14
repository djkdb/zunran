import type { UISnapshot } from '../game/types';
import { formatTime } from '../game/config';

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
            ⏱ {formatTime(snap.survivedSec)} · 🏆 W{Math.max(bestWave, snap.wave)}
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
          <div className={`hud-hp-label ${hpClass}`}>❤️ {hpPct}%</div>
          <div className={`bar bar-hp ${hpClass}`}>
            <div className="bar-fill" style={{ width: `${hpPct}%` }} />
          </div>
        </div>
        <div className="hud-coins">💰 {snap.coins.toLocaleString()}원</div>
      </div>
      {(snap.activeEvents.length > 0 || snap.bossAlive) && (
        <div className="hud-row hud-sub">
          {snap.bossAlive && (
            <div className="boss-bar">
              <span className="boss-name">👿 {snap.bossName}</span>
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
