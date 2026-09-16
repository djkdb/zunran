import type { RunResult } from '../App';
import { UNIT_BY_ID } from '../game/data/units';
import { ENEMY_BY_ID } from '../game/data/enemies';
import { EVENT_BY_ID } from '../game/data/events';
import { ACHIEVEMENT_BY_ID } from '../game/data/achievements';
import { formatTime, RARITY_COLOR } from '../game/config';
import { UnitIcon } from './UnitIcon';
import { Icon } from './Icon';

// 근무 평가 한 줄: 실제 기록에서 고른다
function verdict(r: RunResult): string {
  if (r.wave >= 35) return '해가 뜰 때까지 버텼다. 교대는 여전히 오지 않았다.';
  if (r.defeat.reached === 0) return '한 명도 계산대에 닿지 못했다. 완벽한 근무.';
  if (r.bossKills >= 3) return '보스를 셋이나 돌려보냈다. 오늘은 잘했다.';
  if (r.wave >= 20) return '새벽을 넘겼다. 그래도 끝은 있었다.';
  if (r.wave <= 5) return '오늘은 조용하겠지, 하고 생각했다.';
  if (r.defeat.topDamager) {
    const name = ENEMY_BY_ID[r.defeat.topDamager.id]?.name ?? '손님';
    return `${name} 때문에 무너졌다. 오늘도 편의점은 무사하지 않았다.`;
  }
  return '오늘도 편의점은 무사하지 않았다.';
}

export function RunReport({ result }: { result: RunResult }) {
  const mvp = result.mvp ? UNIT_BY_ID[result.mvp] : null;
  // 이번 판에 일어난 사건 (중복 제거, 최대 6개)
  const events = Array.from(new Set(result.eventIds))
    .map((id) => EVENT_BY_ID[id]?.title)
    .filter((t): t is string => !!t)
    .slice(0, 6);
  const d = result.defeat;
  const reacher = d.topReacher ? ENEMY_BY_ID[d.topReacher.id] : null;
  const damager = d.topDamager ? ENEMY_BY_ID[d.topDamager.id] : null;

  return (
    <div className="report">
      <div className="report-title-row">
        <span className="report-label px">RUN</span>
        <span className="report-title">「{result.runTitle}」</span>
      </div>

      <div className="gameover-stats">
        <div>
          <span>근무시간</span>
          <b>{formatTime(result.time)}</b>
        </div>
        <div>
          <span>최고 웨이브</span>
          <b>{result.wave}</b>
        </div>
        <div>
          <span>처리한 손님</span>
          <b>{result.kills}</b>
        </div>
        <div>
          <span>합성</span>
          <b>{result.merges}</b>
        </div>
        <div>
          <span>보스</span>
          <b>{result.bossKills}</b>
        </div>
        <div>
          <span>최고 콤보</span>
          <b>{result.bestCombo}</b>
        </div>
      </div>

      {mvp && (
        <div className="mvp">
          <div className="mvp-rarity" style={{ background: RARITY_COLOR[mvp.rarity] }} />
          <div className="mvp-inner">
            <UnitIcon defId={mvp.id} size={42} />
            <div>
              <div className="mvp-label">오늘의 MVP</div>
              <div className="mvp-name">
                {mvp.name} <span className="px">T{result.mvpTier}</span>
              </div>
              <div className="mvp-dmg">누적 피해 {result.mvpDamage.toLocaleString()}</div>
            </div>
          </div>
        </div>
      )}

      {/* 패배 원인 — 실제로 추적된 값만 보여준다 */}
      <div className="defeat">
        <div className="defeat-head px">{d.reached === 0 ? '근무 요약' : '패배 원인'}</div>
        <div className="defeat-rows">
          <div>
            <span>계산대에 도달한 손님</span>
            <b className="px">{d.reached}명</b>
          </div>
          {reacher && d.topReacher && (
            <div>
              <span>가장 많이 들어온 손님</span>
              <b>
                {reacher.name} <i className="px">{d.topReacher.count}회</i>
              </b>
            </div>
          )}
          {damager && d.topDamager && (
            <div>
              <span>가장 큰 피해를 준 손님</span>
              <b>
                {damager.name} <i className="px">-{d.topDamager.damage}</i>
              </b>
            </div>
          )}
          {d.lastClock && (
            <div>
              <span>결정적인 순간</span>
              <b className="px">{d.lastClock}</b>
            </div>
          )}
          <div>
            <span>남은 코인</span>
            <b className="px">{d.coinsLeft.toLocaleString()}원</b>
          </div>
        </div>
      </div>

      {events.length > 0 && (
        <div className="events-seen">
          <div className="defeat-head px">오늘 발생한 사건</div>
          <ul>
            {events.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>
        </div>
      )}

      {/* 오늘의 미션 결과 */}
      <div className={`mission-result ${result.missionCleared ? 'clear' : ''}`}>
        <div className="defeat-head px">TODAY'S MISSION</div>
        <div className="mission-goal">{result.missionGoal}</div>
        {result.missionExtra && <div className="mission-extra">추가 조건 · {result.missionExtra}</div>}
        <div className="mission-verdict">
          {result.missionCleared ? (
            <>
              <Icon name="check" size={15} strokeWidth={2.6} />
              MISSION CLEAR
              {result.missionReward > 0 ? <span className="px">+{result.missionReward}</span> : <span className="px">오늘 수령 완료</span>}
            </>
          ) : (
            <span className="mission-fail">다음 근무에 다시</span>
          )}
        </div>
      </div>

      {result.unlocked.length > 0 && (
        <div className="unlocked">
          <div className="defeat-head px">달성한 업적 {result.unlocked.length}</div>
          {result.unlocked.map((id) => {
            const a = ACHIEVEMENT_BY_ID[id];
            if (!a) return null;
            return (
              <div key={id} className="unlocked-row">
                <Icon name={a.icon} size={16} strokeWidth={2.2} />
                <b>{a.title}</b>
                <span>{a.desc}</span>
              </div>
            );
          })}
        </div>
      )}

      <div className="verdict">{verdict(result)}</div>
    </div>
  );
}
