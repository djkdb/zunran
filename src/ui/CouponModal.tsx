import { useState } from 'react';
import { redeemCoupon, rewardText, COUPON_FAIL_TEXT, type Coupon } from '../game/data/coupons';
import { Icon } from './Icon';

interface Props {
  used: string[];
  onRedeem: (coupon: Coupon) => void;
  onClose: () => void;
}

// 쿠폰 입력.
//
// 치트창이 아니라, ZUN 이 SNS 로 흘린 코드를 들고 오는 자리다.
// 그래서 성공하면 보상보다 점장의 한마디가 먼저 나온다.
export function CouponModal({ used, onRedeem, onClose }: Props) {
  const [code, setCode] = useState('');
  const [done, setDone] = useState<Coupon | null>(null);
  const [error, setError] = useState<string | null>(null);

  const submit = () => {
    const r = redeemCoupon(code, used);
    if (!r.ok) {
      setError(COUPON_FAIL_TEXT[r.reason]);
      return;
    }
    setError(null);
    setDone(r.coupon);
    onRedeem(r.coupon);
  };

  return (
    <div className="coupon-overlay" role="dialog" aria-label="쿠폰 입력" onClick={onClose}>
      <div className="coupon-panel" onClick={(e) => e.stopPropagation()}>
        {done ? (
          <>
            <div className="coupon-head">
              <Icon name="gift" size={20} strokeWidth={2.2} />
              쿠폰 사용 완료
            </div>
            <div className="coupon-done-title">{done.title}</div>
            <div className="coupon-done-reward px">{rewardText(done.reward)}</div>
            {done.note && (
              <div className="coupon-note">
                “{done.note}”
                <span>— 점장</span>
              </div>
            )}
            <button className="coupon-btn" onClick={onClose}>
              닫기
            </button>
          </>
        ) : (
          <>
            <div className="coupon-head">
              <Icon name="gift" size={20} strokeWidth={2.2} />
              쿠폰 입력
            </div>
            <p className="coupon-sub">이벤트에서 받은 쿠폰 코드를 입력해주세요.</p>
            <input
              className="coupon-input px"
              value={code}
              onChange={(e) => {
                setCode(e.target.value);
                setError(null);
              }}
              onKeyDown={(e) => e.key === 'Enter' && submit()}
              placeholder="NIGHT"
              autoCapitalize="characters"
              autoCorrect="off"
              spellCheck={false}
              maxLength={24}
              aria-label="쿠폰 코드"
            />
            {error && <div className="coupon-error">{error}</div>}
            <button className="coupon-btn" onClick={submit}>
              사용하기
            </button>
            <button className="coupon-close" onClick={onClose}>
              닫기
            </button>
          </>
        )}
      </div>
    </div>
  );
}
