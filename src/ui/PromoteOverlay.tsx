import type { GameAction, UISnapshot } from '../game/types';
import { UNIT_BY_ID } from '../game/data/units';
import { RARITY_COLOR, RARITY_LABEL } from '../game/config';
import { UnitIcon } from './UnitIcon';

// 합성 승급 2택. 예전에는 승급 결과가 통째로 랜덤이었다 —
// 같은 물건 3개를 모은 성취가 주사위 두 번에 희석됐다.
// 무엇이 후보로 뜨는지는 여전히 모른다(놀라움 유지). 둘 중 하나는 플레이어가 고른다.
export function PromoteOverlay({ snap, act }: { snap: UISnapshot; act: (a: GameAction) => void }) {
  const c = snap.promoteChoice;
  if (snap.phase !== 'promote' || !c || c.options.length === 0) return null;
  const from = UNIT_BY_ID[c.fromDefId];
  return (
    <div className="reward-overlay" role="dialog" aria-label="승급 선택">
      <div className="reward-panel promote-panel">
        <div className="reward-head">
          <div className="reward-title">승급!</div>
          <div className="reward-sub">{from ? `${from.name} 3개 → ` : ''}둘 중 하나를 고르세요</div>
        </div>
        <div className="promote-cards">
          {c.options.map((id) => {
            const d = UNIT_BY_ID[id];
            if (!d) return null;
            return (
              <button
                key={id}
                className="promote-card"
                style={{ ['--fc' as string]: RARITY_COLOR[d.rarity] }}
                onClick={() => act({ type: 'CHOOSE_PROMOTE', defId: id })}
              >
                <UnitIcon defId={id} size={48} />
                <span className="promote-rank">{RARITY_LABEL[d.rarity]}</span>
                <span className="promote-name">{d.name}</span>
                <span className="promote-desc">{d.desc}</span>
              </button>
            );
          })}
        </div>
        <div className="reward-foot">★{c.tier} 로 나옵니다</div>
      </div>
    </div>
  );
}
