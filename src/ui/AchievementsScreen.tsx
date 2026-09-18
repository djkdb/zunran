import { useState } from 'react';
import { ACHIEVEMENTS, achievementReward, totalAchievementReward, type Achievement } from '../game/data/achievements';
import type { SaveData } from '../game/save/storage';
import { Icon } from './Icon';

const GROUPS: Achievement['group'][] = ['진행', '수집', '기록', '사건', '밈'];

interface Props {
  save: SaveData;
  onClaim: (ids: string[]) => void;
}

// 업적은 달성과 수령을 나눈다.
//
// 예전에는 판이 끝날 때 보상이 자동으로 들어갔다. 그러면 결과 화면의 수당 숫자에
// 섞여서 무엇을 땄는지 모르고 지나간다. 직접 「받기」를 눌러야 들어오게 하면
// 딴 것을 한 번은 보게 된다.
export function AchievementsScreen({ save, onClaim }: Props) {
  const owned = new Set(save.achievements);
  const claimed = new Set(save.claimedAchievements);
  const [group, setGroup] = useState<Achievement['group'] | '전체'>('전체');

  const claimable = ACHIEVEMENTS.filter((a) => owned.has(a.id) && !claimed.has(a.id));
  const claimableSum = claimable.reduce((n, a) => n + achievementReward(a), 0);

  // 받을 게 있으면 위로 올린다. 40개를 훑어 내려가며 찾게 두지 않는다.
  const inGroup = group === '전체' ? ACHIEVEMENTS : ACHIEVEMENTS.filter((a) => a.group === group);
  const list = [...inGroup].sort((x, y) => rank(x) - rank(y));
  function rank(a: Achievement): number {
    if (owned.has(a.id) && !claimed.has(a.id)) return 0; // 받을 수 있는 것
    if (!owned.has(a.id)) return 1; // 아직 못 딴 것
    return 2; // 이미 받은 것
  }

  const pct = Math.round((owned.size / ACHIEVEMENTS.length) * 100);
  // 받은 수당 / 남은 수당 — "따면 뭘 주는지"가 보여야 딸 마음이 든다
  const earned = ACHIEVEMENTS.filter((a) => claimed.has(a.id)).reduce((n, a) => n + achievementReward(a), 0);
  const total = totalAchievementReward();

  return (
    <div className="ach">
      <div className="ach-progress">
        <div className="ach-progress-top">
          <span className="ach-count px">
            {owned.size} / {ACHIEVEMENTS.length}
          </span>
          <span className="ach-pct px">{pct}%</span>
        </div>
        <div className="ach-earned">
          <Icon name="cash" size={13} strokeWidth={2.4} />
          받은 야간 수당 <b>{earned}</b> / {total}
        </div>
        <div className="bar bar-ach">
          <div className="bar-fill" style={{ width: `${pct}%` }} />
        </div>
      </div>

      {claimable.length > 0 && (
        <button className="ach-claim-all" onClick={() => onClaim(claimable.map((a) => a.id))}>
          <Icon name="cash" size={17} strokeWidth={2.4} />
          {claimable.length}개 한 번에 받기
          <b className="px">+{claimableSum}</b>
        </button>
      )}

      <div className="ach-tabs">
        {(['전체', ...GROUPS] as const).map((g) => (
          <button key={g} className={group === g ? 'active' : ''} onClick={() => setGroup(g)}>
            {g}
          </button>
        ))}
      </div>

      <div className="ach-list">
        {list.map((a) => {
          const got = owned.has(a.id);
          const paid = claimed.has(a.id);
          const canClaim = got && !paid;
          // 숨겨진 업적은 달성 전까지 설명을 가린다 (제목은 흐리게 보여줘서 "뭔가 있다"는 걸 남긴다)
          const secret = !!a.hidden && !got;
          return (
            <div key={a.id} className={`ach-item ${got ? 'got' : ''} ${canClaim ? 'ready' : ''} ${secret ? 'secret' : ''}`}>
              <span className="ach-icon">
                <Icon name={secret ? 'gem' : a.icon} size={19} strokeWidth={2.2} />
              </span>
              <span className="ach-body">
                <span className="ach-title">{secret ? '???' : a.title}</span>
                <span className="ach-desc">{secret ? '숨겨진 업적' : a.desc}</span>
              </span>
              {canClaim ? (
                <button className="ach-claim" onClick={() => onClaim([a.id])}>
                  받기
                  <b className="px">{achievementReward(a)}</b>
                </button>
              ) : (
                <span className={`ach-reward ${paid ? 'got' : ''}`}>
                  {paid ? <Icon name="check" size={14} strokeWidth={2.6} /> : <Icon name="cash" size={12} strokeWidth={2.4} />}
                  <span className="px">{achievementReward(a)}</span>
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
