import type { FxEvent } from '../game/types';

export type BannerStyle = Extract<FxEvent, { type: 'banner' }>['style'];
export interface BannerItem {
  id: number;
  text: string;
  sub?: string;
  style: BannerStyle;
  dur: number;
}

// 중앙 연출 텍스트. 간판처럼 납작한 색 블록 + 단색 오프셋 그림자.
export function BannerLayer({ banners }: { banners: BannerItem[] }) {
  const big = banners.filter((b) => b.style === 'legendary' || b.style === 'warning' || b.style === 'boss' || b.style === 'record');
  const small = banners.filter((b) => !big.includes(b));
  return (
    <div className="banner-layer" aria-live="polite">
      {big.slice(-1).map((b) => (
        <div key={b.id} className={`banner banner-${b.style}`} style={{ animationDuration: `${b.dur}s` }}>
          <div className="banner-box">
            <div className="banner-text">{b.text}</div>
            {b.sub && <div className="banner-sub">{b.sub}</div>}
          </div>
        </div>
      ))}
      <div className="banner-stack">
        {small.slice(-3).map((b) => (
          <div key={b.id} className={`pill pill-${b.style}`} style={{ animationDuration: `${b.dur}s` }}>
            <span className="pill-text">{b.text}</span>
            {b.sub && <span className="pill-sub">{b.sub}</span>}
          </div>
        ))}
      </div>
    </div>
  );
}
