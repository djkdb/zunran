import { useState } from 'react';
import { ACHIEVEMENTS, type Achievement } from '../game/data/achievements';
import type { SaveData } from '../game/save/storage';
import { Icon } from './Icon';

const GROUPS: Achievement['group'][] = ['진행', '수집', '기록', '사건', '밈'];

export function AchievementsScreen({ save }: { save: SaveData }) {
  const owned = new Set(save.achievements);
  const [group, setGroup] = useState<Achievement['group'] | '전체'>('전체');
  const list = group === '전체' ? ACHIEVEMENTS : ACHIEVEMENTS.filter((a) => a.group === group);
  const pct = Math.round((owned.size / ACHIEVEMENTS.length) * 100);
  return (
    <div className="ach">
      <div className="ach-progress">
        <div className="ach-progress-top">
          <span className="ach-count px">
            {owned.size} / {ACHIEVEMENTS.length}
          </span>
          <span className="ach-pct px">{pct}%</span>
        </div>
        <div className="bar bar-ach">
          <div className="bar-fill" style={{ width: `${pct}%` }} />
        </div>
      </div>

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
          // 숨겨진 업적은 달성 전까지 설명을 가린다 (제목은 흐리게 보여줘서 "뭔가 있다"는 걸 남긴다)
          const secret = !!a.hidden && !got;
          return (
            <div key={a.id} className={`ach-item ${got ? 'got' : ''} ${secret ? 'secret' : ''}`}>
              <span className="ach-icon">
                <Icon name={secret ? 'gem' : a.icon} size={20} strokeWidth={2.2} />
              </span>
              <span className="ach-body">
                <span className="ach-title">{secret ? '???' : a.title}</span>
                <span className="ach-desc">{secret ? '숨겨진 업적' : a.desc}</span>
              </span>
              {got && (
                <span className="ach-check">
                  <Icon name="check" size={16} strokeWidth={2.6} />
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
