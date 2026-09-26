// 쿠폰 — ZUN 이 SNS·릴스·이벤트로 가끔 공개하는 공식 코드.
//
// 치트 입력창이 아니다. 「새벽 3시 CCTV 에 이상한 숫자가 찍혔다 — 0317」 같은
// 게시물과 게임 안이 이어지는 장치다. 그래서 코드는 전부 이 게임 세계의 물건이고,
// 쓰고 나면 점장이 한마디 한다.
//
// 보상은 이 게임에 이미 있는 재화에만 붙인다 (야간 수당 / 다음 판 무료 뽑기).
// 쿠폰 때문에 새 재화를 만들지 않는다. 런 중 전투 수치를 직접 건드리지도 않는다 —
// 랭킹이 있는 게임에서 그건 기록을 더럽힌다.

export type CouponReward =
  | { type: 'metaPoints'; amount: number } // 야간 수당 (상점 재화)
  | { type: 'freeDraws'; amount: number }; // 다음 판 시작 시 무료 뽑기

export interface Coupon {
  code: string; // 대소문자·공백 무시하고 대문자로 비교한다
  title: string;
  description: string;
  reward: CouponReward;
  /** 점장이 한마디. 쿠폰이 세계관 안의 물건이라는 느낌을 준다. */
  note?: string;
  /** YYYY-MM-DD (그날 23:59:59 까지 유효). 없으면 무기한. */
  expiresAt?: string;
  /** 이 날짜부터 유효. 없으면 즉시. */
  startsAt?: string;
}

// ─────────────────────────────────────────────────────────────
// 쿠폰을 추가할 때는 여기에 한 줄 더 넣으면 된다. 다른 파일은 건드릴 필요 없다.
// ─────────────────────────────────────────────────────────────
export const COUPONS: Coupon[] = [
  {
    code: 'NIGHT',
    title: '새벽 근무자 지원금',
    description: '새벽을 버틴 사람에게',
    reward: { type: 'metaPoints', amount: 500 },
    note: '이 코드는 어디서 발견한 거지?',
  },
  {
    code: '0317',
    title: 'CCTV 에 찍힌 숫자',
    description: '03:17 의 화면에 잠깐 떠 있었다',
    reward: { type: 'metaPoints', amount: 317 },
    note: '…그 시간에 가게에 아무도 없었는데.',
  },
  {
    code: 'ZUNRAN',
    title: '개업 기념',
    description: '문을 연 날의 기념품',
    reward: { type: 'metaPoints', amount: 300 },
    note: '개업 떡은 다 돌렸다고 했잖아.',
  },
  {
    code: '1PLUS1',
    title: '행사 상품',
    description: '하나 사면 하나 더',
    reward: { type: 'freeDraws', amount: 2 },
    note: '유통기한 지난 건 아니지?',
  },
  {
    code: 'CAT',
    title: '고양이 밥값',
    description: '뒷문에 오는 그 녀석 몫',
    reward: { type: 'metaPoints', amount: 200 },
    note: '걔 우리 직원 아니야.',
  },
];

export type CouponFailure = 'unknown' | 'used' | 'expired' | 'notYet' | 'empty';

export type CouponResult = { ok: true; coupon: Coupon } | { ok: false; reason: CouponFailure };

/** 입력을 정규화한다 — 앞뒤 공백, 하이픈, 대소문자를 무시한다. */
export function normalizeCode(input: string): string {
  return input.trim().toUpperCase().replace(/[\s-]/g, '');
}

export const COUPON_BY_CODE: Record<string, Coupon> = Object.fromEntries(
  COUPONS.map((c) => [normalizeCode(c.code), c]),
);

/**
 * 쿠폰을 검증한다. 상태는 바꾸지 않는다 — 저장은 호출한 쪽이 한다.
 * @param used 이미 쓴 코드 목록 (정규화된 형태)
 * @param now 판정 기준 시각 (테스트에서 고정할 수 있게 인자로 받는다)
 */
export function redeemCoupon(input: string, used: string[], now = new Date()): CouponResult {
  const code = normalizeCode(input);
  if (!code) return { ok: false, reason: 'empty' };
  const coupon = COUPON_BY_CODE[code];
  if (!coupon) return { ok: false, reason: 'unknown' };
  if (used.includes(code)) return { ok: false, reason: 'used' };
  if (coupon.startsAt && now < startOfDay(coupon.startsAt)) return { ok: false, reason: 'notYet' };
  if (coupon.expiresAt && now > endOfDay(coupon.expiresAt)) return { ok: false, reason: 'expired' };
  return { ok: true, coupon };
}

/**
 * 링크에 실려 온 쿠폰 코드를 읽는다 — `?c=NIGHT` 또는 `?coupon=NIGHT`.
 *
 * 쿠폰은 인스타 릴스에 코드를 흘리려고 만든 기능인데, 정작 코드를 들고 온
 * 사람이 입력창을 찾아 「강화」탭까지 가야 했다. 첫 화면에 '쿠폰'이라는
 * 글자가 없으니 그 탭에 있다는 걸 알 방법이 없다 (docs/AUDIT.md 10차).
 * 링크가 코드를 싣고 오면 그 단계가 통째로 사라진다.
 *
 * 코드 모양만 보고 거른다. 진짜 있는 코드인지는 redeemCoupon 이 판단한다.
 */
export function couponFromUrl(search: string): string | null {
  let q: URLSearchParams;
  try {
    q = new URLSearchParams(search);
  } catch {
    return null;
  }
  const raw = q.get('c') ?? q.get('coupon');
  if (!raw) return null;
  const code = normalizeCode(raw);
  // 링크는 남이 만들어 보낼 수 있다. 길이와 글자를 제한해 이상한 값이
  // 입력창에 그대로 박히지 않게 한다.
  if (!code || code.length > 24 || !/^[A-Z0-9]+$/.test(code)) return null;
  return code;
}

export function rewardText(r: CouponReward): string {
  switch (r.type) {
    case 'metaPoints':
      return `야간 수당 +${r.amount.toLocaleString()}`;
    case 'freeDraws':
      return `다음 판 무료 뽑기 ${r.amount}회`;
  }
}

export const COUPON_FAIL_TEXT: Record<CouponFailure, string> = {
  empty: '코드를 입력해주세요.',
  unknown: '존재하지 않거나 만료된 쿠폰입니다.',
  used: '이미 사용한 쿠폰입니다.',
  expired: '만료된 쿠폰입니다.',
  notYet: '아직 사용할 수 없는 쿠폰입니다.',
};

// 날짜 문자열은 그 날 00:00 ~ 23:59:59 를 뜻한다 (기기 로컬 시각 기준).
function startOfDay(ymd: string): Date {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1, 0, 0, 0, 0);
}
function endOfDay(ymd: string): Date {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1, 23, 59, 59, 999);
}
