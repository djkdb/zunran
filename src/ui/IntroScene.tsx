import { useCallback, useEffect, useRef, useState } from 'react';
import { INTRO_PANELS, finalPanel, type IntroPanel } from '../game/data/intro';
import { sanitizeName } from '../game/rank/validate';
import { audio } from '../game/audio/sfx';
import { UnitIcon } from './UnitIcon';
import { NicknameField } from './NicknameField';

interface Props {
  // 이름을 받고 나면 부른다. skipped 면 이름을 안 받았다는 뜻.
  onDone: (name: string | null) => void;
}

// 첫 판 오프닝. 만화 컷이 위에서부터 한 칸씩 쌓이고, 마지막에 점장 이름을 받는다.
// 렌더링은 전부 DOM 이다 (필드 Canvas 와 책임을 섞지 않는다).
export function IntroScene({ onDone }: Props) {
  const [shown, setShown] = useState(1); // 지금까지 보여준 칸 수
  const [name, setName] = useState<string | null>(null);
  const [flash, setFlash] = useState<'red' | 'gold' | null>(null);
  const stripRef = useRef<HTMLDivElement>(null);
  const reduced = useRef(false);

  useEffect(() => {
    reduced.current = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  }, []);

  const panels: IntroPanel[] = name === null ? INTRO_PANELS : [...INTRO_PANELS, finalPanel(name)];
  const current = panels[shown - 1];
  const atAsk = current?.kind === 'ask';
  const atEnd = current?.kind === 'ready';

  // 새 칸이 뜰 때 효과음 · 플래시 · 스크롤
  useEffect(() => {
    const p = panels[shown - 1];
    if (!p) return;
    if (p.sfx) audio.play(p.sfx as Parameters<typeof audio.play>[0]);
    if (p.flash && !reduced.current) {
      setFlash(p.flash);
      const t = window.setTimeout(() => setFlash(null), 420);
      return () => clearTimeout(t);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shown, name]);

  useEffect(() => {
    stripRef.current?.scrollTo({ top: stripRef.current.scrollHeight, behavior: reduced.current ? 'auto' : 'smooth' });
  }, [shown]);

  // 자동 진행. hold 가 0 인 칸(이름 입력·마지막)에서는 멈춘다.
  useEffect(() => {
    const p = panels[shown - 1];
    if (!p || p.hold <= 0 || shown >= panels.length) return;
    const t = window.setTimeout(() => setShown((n) => Math.min(panels.length, n + 1)), p.hold);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shown, name]);

  // 탭하면 다음 칸으로 건너뛴다 (기다리기 싫은 사람용)
  const advance = useCallback(() => {
    const p = panels[shown - 1];
    if (!p || p.hold <= 0) return; // 이름 입력 칸에서는 탭이 먹지 않는다
    setShown((n) => Math.min(panels.length, n + 1));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shown, name]);

  const confirmName = useCallback((raw: string) => {
    const clean = sanitizeName(raw);
    audio.play('click');
    setName(clean);
    setShown(INTRO_PANELS.length + 1);
  }, []);

  return (
    <div className="intro" onClick={advance}>
      {flash && <div className={`intro-flash ${flash}`} />}

      <div className="intro-head">
        <span className="intro-tag px">OPENING</span>
        <button
          className="intro-skip"
          onClick={(e) => {
            e.stopPropagation();
            onDone(null);
          }}
        >
          건너뛰기
        </button>
      </div>

      <div className="intro-strip" ref={stripRef}>
        {panels.slice(0, shown).map((p) => (
          <div key={p.id} className={`intro-panel k-${p.kind} ${p.shake && !reduced.current ? 'shake' : ''}`}>
            {p.caption && <div className="intro-caption">{p.caption}</div>}
            <div className="intro-cast">
              {p.cast.map((c, i) => (
                <div className="intro-actor" key={`${p.id}-${c.defId}-${i}`} style={{ animationDelay: `${i * 140}ms` }}>
                  <UnitIcon defId={c.defId} enemy={c.enemy} size={54} />
                  {c.line && <div className="intro-bubble">{c.line}</div>}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="intro-foot" onClick={(e) => e.stopPropagation()}>
        {atAsk && <NicknameField value="" onSave={confirmName} label="점장님 성함" cta="확인" required autoFocus />}
        {atEnd && (
          <button className="start-btn" onClick={() => onDone(name)}>
            근무 시작
          </button>
        )}
        {!atAsk && !atEnd && <div className="intro-hint">탭하면 다음 장면</div>}
      </div>
    </div>
  );
}
