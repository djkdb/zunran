import { describe, it, expect } from 'vitest';
import { COUPONS, redeemCoupon, normalizeCode, rewardText, COUPON_BY_CODE } from '../data/coupons';
import { migrate, defaultSave, SAVE_VERSION } from '../save/storage';

describe('쿠폰', () => {
  it('데이터 무결성: 코드 중복 없음, 보상은 실재하는 재화만', () => {
    const codes = COUPONS.map((c) => normalizeCode(c.code));
    expect(new Set(codes).size, '코드가 중복되면 하나는 영원히 못 쓴다').toBe(codes.length);
    for (const c of COUPONS) {
      expect(c.code.length).toBeGreaterThan(0);
      expect(['metaPoints', 'freeDraws']).toContain(c.reward.type);
      expect(rewardText(c.reward).length).toBeGreaterThan(0);
      // 쿠폰은 런 중 전투 수치를 직접 건드리지 않는다 (랭킹이 있는 게임이다)
      expect(c.reward.type === 'metaPoints' || c.reward.type === 'freeDraws').toBe(true);
    }
  });

  it('정상 입력 — 대소문자·공백·하이픈을 무시한다', () => {
    for (const input of ['NIGHT', 'night', ' Night ', 'n-i-g-h-t']) {
      const r = redeemCoupon(input, []);
      expect(r.ok, `"${input}" 가 안 먹힘`).toBe(true);
      if (r.ok) expect(normalizeCode(r.coupon.code)).toBe('NIGHT');
    }
  });

  it('없는 코드 · 빈 입력', () => {
    expect(redeemCoupon('NOPE', [])).toEqual({ ok: false, reason: 'unknown' });
    expect(redeemCoupon('   ', [])).toEqual({ ok: false, reason: 'empty' });
  });

  it('중복 사용 — 한 번 쓴 코드는 다시 안 먹는다', () => {
    const first = redeemCoupon('NIGHT', []);
    expect(first.ok).toBe(true);
    const used = [normalizeCode('NIGHT')];
    expect(redeemCoupon('NIGHT', used)).toEqual({ ok: false, reason: 'used' });
    // 표기가 달라도 같은 쿠폰으로 본다
    expect(redeemCoupon('night', used)).toEqual({ ok: false, reason: 'used' });
  });

  it('유효기간 — 시작 전 / 만료 후', () => {
    const c = COUPON_BY_CODE.NIGHT;
    const dated = { ...c, code: 'TEMP', startsAt: '2026-01-10', expiresAt: '2026-01-12' };
    // 직접 검증 대신 임시로 등록해서 본다
    COUPON_BY_CODE.TEMP = dated;
    try {
      expect(redeemCoupon('TEMP', [], new Date(2026, 0, 9, 23, 0))).toEqual({ ok: false, reason: 'notYet' });
      expect(redeemCoupon('TEMP', [], new Date(2026, 0, 10, 0, 0)).ok).toBe(true);
      expect(redeemCoupon('TEMP', [], new Date(2026, 0, 12, 23, 59)).ok).toBe(true);
      expect(redeemCoupon('TEMP', [], new Date(2026, 0, 13, 0, 1))).toEqual({ ok: false, reason: 'expired' });
    } finally {
      delete COUPON_BY_CODE.TEMP;
    }
  });

  it('저장: v5 저장을 열어도 쿠폰 필드가 안전하게 생긴다', () => {
    const old = { version: 5, totalPlays: 7, metaPoints: 120 } as Parameters<typeof migrate>[0];
    const out = migrate(old);
    expect(out.version).toBe(SAVE_VERSION);
    expect(out.usedCoupons).toEqual([]);
    expect(out.couponFreeDraws).toBe(0);
    expect(out.metaPoints, '기존 값은 건드리지 않는다').toBe(120);
    expect(out.totalPlays).toBe(7);
  });

  it('저장: 이미 쓴 쿠폰 목록과 무료 뽑기가 보존된다', () => {
    const out = migrate({ version: 6, usedCoupons: ['NIGHT'], couponFreeDraws: 2 } as Parameters<typeof migrate>[0]);
    expect(out.usedCoupons).toEqual(['NIGHT']);
    expect(out.couponFreeDraws).toBe(2);
    // 음수는 0 으로 막는다
    expect(migrate({ couponFreeDraws: -5 } as Parameters<typeof migrate>[0]).couponFreeDraws).toBe(0);
  });

  it('새 저장에는 쓴 쿠폰이 없다', () => {
    const s = defaultSave();
    expect(s.usedCoupons).toEqual([]);
    expect(s.couponFreeDraws).toBe(0);
    expect(redeemCoupon('NIGHT', s.usedCoupons).ok).toBe(true);
  });
});

describe('업적 보상 수령 (v6 → v7)', () => {
  it('이미 자동 지급받은 사람은 전부 수령 완료로 넘어온다 — 두 번 주지 않는다', () => {
    // v6 까지는 판이 끝날 때 업적 보상이 자동으로 들어갔다.
    const old = { version: 6, achievements: ['first_shift', 'wave10'], metaPoints: 800 } as Parameters<typeof migrate>[0];
    const out = migrate(old);
    expect(out.version).toBe(SAVE_VERSION);
    expect(out.claimedAchievements, '딴 업적은 전부 받은 것으로 친다').toEqual(['first_shift', 'wave10']);
    expect(out.metaPoints, '수당은 그대로').toBe(800);
    // 받을 게 남아 있지 않다
    const claimable = out.achievements.filter((id) => !out.claimedAchievements.includes(id));
    expect(claimable).toEqual([]);
  });

  it('v7 저장은 수령 목록을 그대로 보존한다', () => {
    const out = migrate({
      version: 7,
      achievements: ['a', 'b', 'c'],
      claimedAchievements: ['a'],
    } as Parameters<typeof migrate>[0]);
    expect(out.claimedAchievements).toEqual(['a']);
    expect(out.achievements.filter((id) => !out.claimedAchievements.includes(id))).toEqual(['b', 'c']);
  });

  it('새 저장에는 딴 것도 받은 것도 없다', () => {
    const s = defaultSave();
    expect(s.achievements).toEqual([]);
    expect(s.claimedAchievements).toEqual([]);
  });
});
