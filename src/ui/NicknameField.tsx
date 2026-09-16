import { useState } from 'react';
import { MAX_NAME_LEN } from '../game/rank/types';
import { sanitizeName } from '../game/rank/validate';

interface Props {
  value: string;
  onSave: (name: string) => void;
  label: string;
  cta: string;
  autoFocus?: boolean;
  // true 면 비어 있는 채로 확정할 수 없다 (게임오버 화면에서 이름을 받을 때)
  required?: boolean;
}

// 랭킹 표시 이름 입력. 시작 화면 · 게임오버 · 랭킹 탭이 같은 컴포넌트를 쓴다.
export function NicknameField({ value, onSave, label, cta, autoFocus, required }: Props) {
  const [draft, setDraft] = useState(value);
  const clean = sanitizeName(draft);
  const blank = draft.trim().length === 0;

  const commit = () => {
    if (required && blank) return;
    onSave(blank ? '' : clean);
  };

  return (
    <div className="nick">
      <label className="nick-label" htmlFor="nick-input">
        {label}
      </label>
      <div className="nick-row">
        <input
          id="nick-input"
          value={draft}
          maxLength={MAX_NAME_LEN}
          placeholder="예: 새벽사장"
          autoFocus={autoFocus}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && commit()}
        />
        <button className="nick-save" onClick={commit} disabled={required && blank}>
          {cta}
        </button>
      </div>
    </div>
  );
}
