import type { UISnapshot } from '../types';

// 뽑기를 못 누를 때, 그 자리에서 무엇을 하면 되는지.
//
// 베타 10명(docs/AUDIT.md 9차)에서 나온 문제다. 첫 판에 누른 것의 47% 가
// 아무 일도 일으키지 않았고(헛탭 중앙 110회), 뽑기만 보던 사람은 6초 이상
// 멈춘 구간이 19~24회였다.
//
// 그런데 그 36번의 정체를 전부 뜯어 보니 36번 모두 정리·긴급스킬·배치가
// 가능했다. 아무도 실제로 갇힌 적이 없다 — 할 수 있는 게 있는데 몰랐을 뿐이다.
// 그래서 고칠 것은 경제 곡선(숫자)이 아니라 안내(정보)다.
//
// 새 배너나 새 버튼을 만들지 않는다. 사람이 누르고 있는 바로 그 버튼이
// 답을 말하게 한다.
export interface NextMove {
  /** 뽑기 버튼 부제에 넣을 한 줄 */
  text: string;
  /** 돈이 모일 때까지의 진행도 0~1 (없으면 null) */
  progress: number | null;
  /** 칸이 없어서 막힌 경우 — 색을 다르게 준다 */
  blocked: boolean;
}

export function nextMove(snap: UISnapshot): NextMove | null {
  if (snap.canDraw) return null;

  // 1) 칸이 없다. 돈 문제가 아니므로 기다려도 안 풀린다 — 이게 제일 급하다.
  if (snap.emptySlots === 0) {
    if (snap.groups.some((g) => g.mergeable) || snap.tierMerge) return { text: '칸이 없어요 · 합성하면 자리가 생겨요', progress: null, blocked: true };
    const buy = snap.mergeBuy.find((o) => o.cost <= snap.coins);
    if (buy) return { text: `칸이 없어요 · 「한 개만 더」로 합치세요`, progress: null, blocked: true };
    if (snap.junkCount > 0) return { text: `칸이 없어요 · 정리하면 ${snap.junkCount}칸 (+${snap.junkValue}원)`, progress: null, blocked: true };
    return { text: '칸이 없어요 · 유닛을 팔아 자리를 만드세요', progress: null, blocked: true };
  }

  // 2) 돈이 모자란다. 얼마나 모자란지 + 지금 할 수 있는 다른 수 하나.
  //
  // 여기서 권하는 것은 **지금 화면에 실제로 있는 것**이어야 한다.
  // 처음엔 「그동안 정리하세요」를 넣었는데, 정리 버튼은 칸이 꽉 찼을 때만
  // 뜬다(BottomPanel: junkCount > 0 && emptySlots === 0). 빈 칸이 있는 이
  // 갈래에서는 눌 수 없는 버튼을 가리키게 된다 — 없느니만 못한 안내다.
  const short = Math.max(0, snap.drawCost - snap.coins);
  const progress = snap.drawCost > 0 ? Math.min(1, snap.coins / snap.drawCost) : null;
  const buy = snap.mergeBuy.find((o) => o.cost <= snap.coins);
  const alt =
    snap.groups.some((g) => g.mergeable) || snap.tierMerge
      ? '그동안 합성하세요'
      : buy
        ? '그동안 「한 개만 더」를 보세요'
        : snap.enemyCount >= 8 && (snap.skillReady.shutter || snap.skillReady.dump)
          ? '그동안 셔터를 내려보세요'
          : snap.junkCount > 0
            ? // 「정리」(일괄)는 칸이 꽉 차야 뜨지만, 유닛 하나를 골라 파는
              // 버튼은 언제나 있다. 돈이 급한 사람에게는 이게 실제 답이다.
              '그동안 안 쓰는 유닛을 팔아보세요'
            : snap.unitCount > 0
              ? '그동안 유닛 자리를 바꿔보세요'
              : '';
  return { text: alt ? `${short}원 더 · ${alt}` : `${short}원 더`, progress, blocked: false };
}
