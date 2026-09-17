import { useMemo } from 'react';
import { offerConditions, type ShiftCondition } from '../game/data/shiftConditions';
import { createRng } from '../game/engine/rng';
import { Icon } from './Icon';

interface Props {
  seed: number; // 이 판의 시드 — 같은 시드면 같은 3장이 나온다
  onPick: (c: ShiftCondition) => void;
}

// 판 시작 직전 3택. 고정 메뉴가 아니라 매번 다른 3장이라, 이 단계 자체가 복권으로 남는다.
export function ConditionPicker({ seed, onPick }: Props) {
  const offers = useMemo(() => {
    const rng = createRng(seed ^ 0x51ed270b);
    return offerConditions(() => rng.next());
  }, [seed]);

  return (
    <div className="cond">
      <div className="cond-head">
        <span className="cond-tag px">TONIGHT</span>
        <div className="cond-title">오늘 밤은 어떻게 갈까</div>
        <div className="cond-sub">하나만 고릅니다. 위험할수록 수당이 큽니다.</div>
      </div>

      <div className="cond-list">
        {offers.map((c) => (
          <button key={c.id} className={`cond-card ${c.scoreMult > 1.2 ? 'risky' : 'safe'}`} onClick={() => onPick(c)}>
            <div className="cond-card-top">
              <span className="cond-name">{c.name}</span>
              {c.scoreMult > 1 && <span className="cond-mult px">×{c.scoreMult.toFixed(2).replace(/0$/, '')}</span>}
            </div>
            <div className="cond-line">{c.line}</div>
            <div className="cond-effects">
              <span className="cond-good">
                <Icon name="check" size={12} strokeWidth={2.8} />
                {c.good}
              </span>
              {c.bad && (
                <span className="cond-bad">
                  <Icon name="boss" size={12} strokeWidth={2.4} />
                  {c.bad}
                </span>
              )}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
