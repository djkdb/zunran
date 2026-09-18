import type { UISnapshot } from '../game/types';
import { tutorialSteps } from '../game/data/tutorial';
import { Icon } from './Icon';

// 첫 판 안내 줄. 지금 해야 할 한 단계만 보여주고, 다 하면 스스로 물러난다.
// 단계 판정은 src/game/data/tutorial.ts 에 있다.
interface Props {
  snap: UISnapshot;
  onClose: () => void;
}

export function Coach({ snap, onClose }: Props) {
  const steps = tutorialSteps(snap);
  const done = steps.filter((s) => s.done).length;
  const current = steps.find((s) => !s.done);

  if (!current) {
    return (
      <div className="coach done" role="status" aria-live="polite">
        <Icon name="check" size={14} strokeWidth={2.6} />
        <span className="coach-label">다 배웠습니다. 이제 혼자 해보세요</span>
        <button className="coach-x" onClick={onClose} aria-label="안내 닫기">
          닫기
        </button>
      </div>
    );
  }

  return (
    <div className="coach" role="status" aria-live="polite">
      <span className="coach-count px">
        {done}/{steps.length}
      </span>
      <span className="coach-label">{current.label}</span>
      <span className="coach-dots" aria-hidden="true">
        {steps.map((s) => (
          <b key={s.id} className={s.done ? 'on' : ''} />
        ))}
      </span>
      <button className="coach-x" onClick={onClose} aria-label="안내 닫기">
        ✕
      </button>
    </div>
  );
}
