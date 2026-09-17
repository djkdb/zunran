import type { GameAction, UISnapshot } from '../game/types';

// 사건 2택. 28종의 사건이 전부 강제 발생이었다 — 좋은 일도 나쁜 일도 그냥 일어났다.
// 선택지가 붙는 순간 같은 사건이 결정이 된다.
export function EventChoiceOverlay({ snap, act }: { snap: UISnapshot; act: (a: GameAction) => void }) {
  const ec = snap.eventChoice;
  if (snap.phase !== 'eventChoice' || !ec) return null;
  return (
    <div className="reward-overlay" role="dialog" aria-label="사건 선택">
      <div className="reward-panel event-panel">
        <div className="reward-head">
          <div className="reward-title">{ec.title}</div>
          <div className="reward-sub">{ec.desc}</div>
        </div>
        <div className="event-choices">
          {ec.choices.map((c, i) => (
            <button key={c.label} className="event-choice" onClick={() => act({ type: 'CHOOSE_EVENT', index: i })}>
              <span className="event-choice-label">{c.label}</span>
              <span className="event-choice-desc">{c.desc}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
