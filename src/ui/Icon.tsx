// 간판 스타일 아이콘: 2px 선, 각진 끝(square), 24px 격자. 이모지를 쓰지 않는다.
// currentColor 를 따르므로 부모의 color 로 색을 맞춘다.

export type IconName =
  | 'draw'
  | 'merge'
  | 'broom'
  | 'sound'
  | 'mute'
  | 'pause'
  | 'play'
  | 'coin'
  | 'heart'
  | 'trophy'
  | 'clock'
  | 'boss'
  | 'store'
  | 'copy'
  | 'check'
  | 'restart'
  | 'bulb'
  | 'cash'
  | 'tag'
  | 'gem'
  | 'star'
  | 'chart'
  | 'book';

const PATHS: Record<IconName, JSX.Element> = {
  // 선물 상자 (뽑기)
  draw: (
    <>
      <rect x="3" y="9" width="18" height="11" />
      <path d="M3 13h18" />
      <path d="M12 9v11" />
      <path d="M12 9C8.5 9 7 8 7 6.5S9 4.5 12 9z" />
      <path d="M12 9c3.5 0 5-1 5-2.5S15 4.5 12 9z" />
    </>
  ),
  // 위아래로 모이는 화살 (합성)
  merge: (
    <>
      <path d="M12 3v7" />
      <path d="M12 21v-7" />
      <path d="M6 7l6 3 6-3" />
      <path d="M6 17l6-3 6 3" />
    </>
  ),
  // 빗자루 (정리)
  broom: (
    <>
      <path d="M4 20h7" />
      <path d="M8 20l6-13" />
      <path d="M12 5l5 2-3 6" />
      <path d="M9 14l5 2" />
    </>
  ),
  sound: (
    <>
      <path d="M4 9v6h4l5 4V5L8 9H4z" />
      <path d="M17 8.5a5 5 0 0 1 0 7" />
    </>
  ),
  mute: (
    <>
      <path d="M4 9v6h4l5 4V5L8 9H4z" />
      <path d="M17 9l4 6" />
      <path d="M21 9l-4 6" />
    </>
  ),
  pause: (
    <>
      <rect x="6" y="4" width="4" height="16" />
      <rect x="14" y="4" width="4" height="16" />
    </>
  ),
  play: <path d="M7 4l12 8-12 8V4z" />,
  // 동전 (코인)
  coin: (
    <>
      <circle cx="12" cy="12" r="8" />
      <path d="M12 8v8" />
      <path d="M9.5 10.5h5" />
      <path d="M9.5 13.5h5" />
    </>
  ),
  heart: <path d="M12 20l-7-7a4 4 0 0 1 7-4 4 4 0 0 1 7 4l-7 7z" />,
  trophy: (
    <>
      <path d="M7 4h10v5a5 5 0 0 1-10 0V4z" />
      <path d="M7 6H4v2a3 3 0 0 0 3 3" />
      <path d="M17 6h3v2a3 3 0 0 1-3 3" />
      <path d="M12 14v4" />
      <path d="M8 20h8" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="8" />
      <path d="M12 7v5l3 2" />
    </>
  ),
  // 뿔 달린 머리 (보스)
  boss: (
    <>
      <path d="M4 5l3 4" />
      <path d="M20 5l-3 4" />
      <path d="M5 9h14v6a4 4 0 0 1-4 4H9a4 4 0 0 1-4-4V9z" />
      <path d="M9 13h1.5" />
      <path d="M13.5 13H15" />
    </>
  ),
  // 편의점 차양
  store: (
    <>
      <path d="M3 9h18l-2-5H5L3 9z" />
      <path d="M5 9v11h14V9" />
      <path d="M9 20v-6h6v6" />
    </>
  ),
  copy: (
    <>
      <rect x="9" y="9" width="11" height="11" />
      <path d="M5 15H4V4h11v1" />
    </>
  ),
  check: <path d="M4 12l6 6L20 6" />,
  restart: (
    <>
      <path d="M20 12a8 8 0 1 1-2.4-5.7" />
      <path d="M20 4v5h-5" />
    </>
  ),
  // 전구 (팁)
  bulb: (
    <>
      <path d="M9 17h6" />
      <path d="M10 20h4" />
      <path d="M12 3a6 6 0 0 1 4 10.5V17H8v-3.5A6 6 0 0 1 12 3z" />
    </>
  ),
  // 지폐 (야간 수당)
  cash: (
    <>
      <rect x="3" y="6" width="18" height="12" />
      <circle cx="12" cy="12" r="2.5" />
      <path d="M6 9v0" />
      <path d="M18 15v0" />
    </>
  ),
  tag: (
    <>
      <path d="M4 4h8l8 8-8 8-8-8V4z" />
      <path d="M8 8v0" />
    </>
  ),
  gem: (
    <>
      <path d="M4 9l4-5h8l4 5-8 11L4 9z" />
      <path d="M4 9h16" />
    </>
  ),
  star: <path d="M12 3l2.6 6h6l-4.8 4 1.8 6.4L12 16l-5.6 3.4L8.2 13 3.4 9h6L12 3z" />,
  chart: (
    <>
      <path d="M4 20V4" />
      <path d="M4 20h16" />
      <path d="M8 17V11" />
      <path d="M13 17V7" />
      <path d="M18 17v-4" />
    </>
  ),
  book: (
    <>
      <path d="M4 4h7v16H4z" />
      <path d="M13 4h7v16h-7z" />
      <path d="M11 4v16" />
    </>
  ),
};

const FILLED: IconName[] = ['pause', 'play', 'heart', 'star'];

export function Icon({ name, size = 20, strokeWidth = 2, className }: { name: IconName; size?: number; strokeWidth?: number; className?: string }) {
  const filled = FILLED.includes(name);
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={filled ? 'currentColor' : 'none'}
      stroke={filled ? 'none' : 'currentColor'}
      strokeWidth={strokeWidth}
      strokeLinecap="square"
      strokeLinejoin="miter"
      aria-hidden="true"
      focusable="false"
      style={{ flex: 'none', display: 'block' }}
    >
      {PATHS[name]}
    </svg>
  );
}

// 티어를 별 이모지 대신 눈금 게이지로 표시한다. 채워진 칸 = 현재 티어.
export function TierTicks({ tier, color = 'currentColor' }: { tier: number; color?: string }) {
  const slots = Math.max(3, Math.min(5, tier));
  return (
    <span className="tier-ticks" aria-label={`티어 ${tier}`}>
      {Array.from({ length: slots }, (_, i) => (
        <i key={i} style={{ background: i < tier ? color : 'var(--line)' }} />
      ))}
    </span>
  );
}
