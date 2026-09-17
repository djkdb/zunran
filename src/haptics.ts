// 진동 피드백. 모바일에서 "지금 뭔가 일어났다"를 눈 말고 손으로도 알려준다.
// navigator.vibrate 는 iOS 사파리에 없다 — 있으면 쓰고, 없으면 조용히 넘어간다.
let enabled = true;

export function setHaptics(on: boolean): void {
  enabled = on;
}

type Pattern = 'tap' | 'hit' | 'damage' | 'big' | 'gameover';

const PATTERNS: Record<Pattern, number | number[]> = {
  tap: 8,
  hit: 14,
  damage: [0, 30, 40, 30],
  big: [0, 20, 30, 60],
  gameover: [0, 80, 60, 120],
};

export function vibe(p: Pattern): void {
  if (!enabled) return;
  try {
    navigator.vibrate?.(PATTERNS[p]);
  } catch {
    // 권한이 없거나 지원하지 않는 브라우저. 진동은 어디까지나 덤이다.
  }
}
