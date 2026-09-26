import { useEffect, useState } from 'react';
import { installKind, isStandalone, onInstallChange, promptInstall, type InstallKind } from '../install';
import { Icon } from './Icon';

// 설정 시트의 「홈 화면에 추가」 줄.
//
// 이미 앱으로 쓰고 있으면(주소창 없는 상태) 아무것도 보여주지 않는다 —
// 할 수 있는 일이 없는 줄이 메뉴에 남아 있으면 그게 더 혼란스럽다.
export function InstallRow() {
  const [kind, setKind] = useState<InstallKind>(() => installKind());
  const [ios, setIos] = useState(false);

  // beforeinstallprompt 는 첫 렌더보다 늦게 올 수 있다.
  useEffect(() => onInstallChange(() => setKind(installKind())), []);

  if (kind === 'installed' || kind === 'none') return null;

  if (kind === 'ios') {
    return (
      <>
        <button className="sheet-row" onClick={() => setIos((v) => !v)}>
          <Icon name="store" size={16} strokeWidth={2.3} />
          홈 화면에 추가
          <span className="sheet-row-sub">{ios ? '접기' : '방법 보기'}</span>
        </button>
        {ios && (
          <div className="install-ios">
            사파리 아래쪽 가운데 <b>공유 버튼</b>(네모에 위 화살표)을 누르고,
            목록을 내려 <b>홈 화면에 추가</b> 를 고르세요.
            <span className="install-ios-why">주소창 없이 전체 화면으로 켜지고, 오프라인에서도 돌아갑니다.</span>
          </div>
        )}
      </>
    );
  }

  return (
    <button
      className="sheet-row"
      onClick={async () => {
        await promptInstall();
        setKind(installKind());
      }}
    >
      <Icon name="store" size={16} strokeWidth={2.3} />
      홈 화면에 추가
      <span className="sheet-row-sub">전체 화면 · 오프라인</span>
    </button>
  );
}

/** 설치돼 있으면 true — 이미 앱으로 쓰는 사람에게 설치를 권하지 않으려고 쓴다. */
export const alreadyApp = isStandalone;
